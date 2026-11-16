@id streams-fds-buffering
@part p7
@kind chapter
@title Streams, File Descriptors, Pipes & Buffering Internals
@short Streams, FDs & buffering
@level intermediate
@time 30
@learn Explain Unix's "everything is a file descriptor" model via FD table, open file description, and inode | Contrast stdin (0), stdout (1), stderr (2), pipes, sockets, and regular files | Understand read/write buffering (BufReader/BufWriter/LineWriter) vs kernel page cache | Observe dup/redirection and RAII Drop closing file descriptors safely in Rust

Rust's `Write` trait lets code send bytes to different destinations through a common interface. On Unix, a **[[file descriptor]] (FD)** is a small integer handle used to refer to an open file, pipe, socket or device. These resources do not all behave identically, but the shared interface makes it possible to write reusable I/O code and reason about buffering separately.

In this chapter we open the Linux kernel's three-table file descriptor diagram, trace what `dup2` / shell redirection (`> out.txt 2>&1`) actually rewires, and see how user-space buffering (`BufReader`, `LineWriter`, `BufWriter`) interacts with the kernel's buffer and disk cache. When one thread cannot afford to wait on a slow descriptor, [blocking, `epoll` and `io_uring`](#blocking-epoll-io-uring) shows the alternatives.

:::analogy Coat-check claim tickets
When you open a file, connect a TCP socket, or create a pipe, the kernel hands your process an integer coat-check ticket: **`3`**, **`4`**, **`5`**. Your code never receives a direct pointer to the kernel's inode or socket struct—every `read(fd, ...)` or `write(fd, ...)` passes back that ticket number, and the kernel looks up which file, pipe, or socket stands behind ticket `3` inside *your process's* private coat-check ledger.
:::

:::compare Standard Unix File Descriptors & Rust Handles
| FD | Standard Name | Rust `std::io` | Default Buffering in Rust | Typical Target |
|---|---|---|---|---|
| `0` | `stdin` | `io::stdin()` | Buffered (`BufReader`-like internal buffer) | Keyboard / PTY / input pipe |
| `1` | `stdout` | `io::stdout()` | **`LineWriter`** (1 KiB; flushes on `\n` in terminal, block-buffered if file in C stdio, always `LineWriter` in Rust!) | Terminal / PTY / output pipe / file |
| `2` | `stderr` | `io::stderr()` | **Unbuffered** (every write flushes straight to `write(2, ...)`) | Terminal / error log |
| `3+` | Opened files, sockets, epoll, pipes | `File`, `TcpStream`, `UnixStream` | **Unbuffered** unless wrapped in `BufReader` / `BufWriter` | NVMe file / kernel socket buffer / pipe ring |
:::

## Inside the Linux kernel: the three-table FD model

Every open file descriptor is NOT just one table—it passes through **three kernel tables**:

:::note Process FD Table -> System Open File Table -> VFS Inode Table
```text
Process A's FD Table       System-wide Open File Table         VFS Inodes / Objects
┌────┬──────────┐          ┌──────────────────────────────┐     ┌───────────────────────┐
│ 0  │ -> stdin │          │ File Description #41         │     │ Inode 8821 (/data.log)│
│ 1  │ -> stdout│   ┌─────►│ offset: 1024, flags: O_RDONLY├────►│ size: 4096, ext4 blocks│
│ 2  │ -> stderr│   │      │ refcount: 2                  │     └───────────────────────┘
│ 3  │ ─────────────┤      └──────────────────────────────┘
│ 4  │ ─────────────┘ (after dup() or fork()!)
└────┴──────────┘
```
:::

That three-tier design explains three classic Unix behaviours immediately:
1. **`dup` / `dup2` / `2>&1` shell redirection:** Redirecting `stderr` (`2`) to `stdout` (`1`) copies the pointer in FD slot `1` into FD slot `2`! Both FDs now share the exact same **Open File Description** (including the current byte **file offset**!), so alternating stdout and stderr writes never overwrite each other's offsets.
2. **Fork inheritance:** Because a forked child inherits a copy of the parent's FD table pointing to the *same* Open File Description (until `CLOEXEC`), pipelines like `cargo build | head` pass FDs seamlessly across `execve`. Notice Rust opens files with **`O_CLOEXEC`** by default so private file descriptors don't leak accidentally into child subprocesses!
3. **`refcount` and safe deletion:** Unlinking a file while an open `File` holds it removes the directory entry, yet the kernel preserves the inode and data blocks until the *last* process drops/closes its FD (`refcount == 0`). The inode-and-dentry machinery behind that rule is in [file systems, the page cache and `mmap`](#filesystems-cache-mmap).

## Unix pipes and back-pressure

A **Unix pipe** (`pipe2()` syscall) allocates two FDs—`read_end` and `write_end`—connected to a **kernel ring buffer** (typically **64 KiB** on Linux). Pipes are also the classic way for a forked parent and child to talk to each other, which is the process half of [processes, threads and scheduling](#processes-threads-scheduling):

- If the writer (`producer`) writes faster than the reader (`consumer`), the 64 KiB pipe buffer fills up, and the kernel puts the writer **to sleep** automatically (**backpressure**)—preventing unbounded memory growth.
- If the reader closes `read_end`, the next `write()` on `write_end` triggers `SIGPIPE` / `EPIPE` (`BrokenPipe`), cleanly halting upstream stages like `yes | head -n 5`.
- When the writer closes `write_end` (`Drop` on `ChildStdin`), the reader sees `read()` return **`0` bytes (`EOF`)**.

## File offsets (`lseek`) and Terminals (`TTY` / `PTY`)

Two more everyday Unix stream behaviours sit right inside that Open File Description table:

### 1. File offsets, `Seek`, and `pread` (`FileExt::read_at`)

Regular files track a current **byte offset** inside the kernel's Open File Description: reading 100 bytes advances the offset from `0` to `100`. Calling `file.seek(SeekFrom::Start(0))` invokes the **`lseek`** [[system call]], updating that kernel cursor without copying any file bytes.

Because two `File` handles cloned via `file.try_clone()` share the **same** Open File Description, seeking on one handle moves the cursor for the other! When multiple threads read different offsets of the same file concurrently (as databases do), use `std::os::unix::fs::FileExt::read_at(&file, buf, offset)` (`pread64` syscall), which reads at an explicit byte offset **without touching the shared file cursor**.

### 2. Terminals (`TTY` / [[PTY]]): canonical line mode vs raw mode

When `stdin` (`FD 0`) and `stdout` (`FD 1`) are attached to an interactive terminal (`std::io::IsTerminal::is_terminal(&io::stdin())`), a kernel driver called the **TTY line discipline** sits between your keyboard and your Rust program:

- **Canonical (cooked) mode (the default):** The kernel holds typed characters inside an internal line buffer, handles `Backspace` editing itself, turns `Ctrl+C` into `SIGINT` and `Ctrl+D` into `EOF`, and wakes your blocked `stdin().read_line(...)` call **only when the user presses Enter (`\n`)**.
- **Raw mode (used by TUI crates like `crossterm` and `ratatui`):** Disables line buffering, echo, and `Ctrl+C` signal translation via `tcsetattr` (`termios`), delivering every single keypress (`Up`, `Esc`, `q`) byte-by-byte to your Rust program immediately.

## User-space buffering vs Kernel buffering (`fsync`)

:::plain Three places your written bytes can sit
When your Rust program writes text to a file, the bytes pass through **three** distinct stages:

1. **User-space `BufWriter` (process RAM):** fast batching array; lost if your process crashes before `.flush()`.
2. **Kernel [[page cache]] (OS RAM):** populated by `write()`; survives a process crash, **lost if the machine loses power**.
3. **Non-volatile SSD/disk media:** guaranteed only after `file.sync_all()?` (**[[fsync]]**) returns `Ok(())`.
:::

Writing a file therefore involves two separate RAM buffers before storage hardware ever sees a byte:

1. **User-space buffer (`BufWriter` / `LineWriter`):** Accumulates small writes in your process's heap array (default `8 KiB`) to eliminate redundant `write()` syscalls. Calling `.flush()` (or dropping `BufWriter`) executes `write()` to push bytes into the kernel—**note `BufWriter::drop` silently ignores flush errors, so always call `writer.flush()?` explicitly before closing!**
2. **Kernel page cache:** `write()` does **not** wait for spinning platters or SSD flash cells. It copies your bytes into kernel RAM (dirty pages in the OS page cache) and returns in ~1 µs. To guarantee durability across a sudden power cut, call `file.sync_all()?` (`fsync`, flushing data + [[inode]] metadata) or `file.sync_data()?` (`fdatasync`).

## RAII `Drop` prevents file descriptor leaks (`EMFILE`)

Every Linux process has an open-FD ceiling (`ulimit -n`, commonly 1,024 or 65,536). In C, forgetting `close(fd)` on one early `return` error path leaks descriptors until `open()` starts failing globally with `EMFILE: Too many open files`.

In Rust, `File` (and `TcpStream`, `OwnedFd`, `BorrowedFd`) wraps `RawFd` in **RAII (`Drop`)**: the compiler guarantees `close(fd)` runs automatically on every normal return, `?` error propagation, or stack unwind. Moreover, Rust 1.63+ **I/O safety** (`AsFd`, `OwnedFd`) uses lifetimes so a `BorrowedFd<'a>` cannot outlive the `File` owning it—eliminating use-after-close FD bugs at compile time!

Let's inspect real `OwnedFd` / `BufWriter` / `pipe` / `std::io::pipe` concepts cleanly in Rust:

```rust run
use std::io::{BufRead, BufReader, BufWriter, Cursor, Write};
use std::os::fd::AsRawFd;

fn main() {
    // 1. Inspect standard file descriptor integers (0, 1, 2):
    let stdin_fd = std::io::stdin().as_raw_fd();
    let stdout_fd = std::io::stdout().as_raw_fd();
    let stderr_fd = std::io::stderr().as_raw_fd();
    println!("standard FDs: stdin={stdin_fd}, stdout={stdout_fd}, stderr={stderr_fd}");

    // 2. Compare unbuffered vs BufWriter batching using an in-memory sink:
    let mut backing = Vec::new();
    {
        let mut out = BufWriter::with_capacity(64, &mut backing);
        for n in 0..4 {
            writeln!(out, "row={n}").unwrap();
        }
        out.flush().unwrap(); // Always flush explicitly to catch I/O errors!
    }

    // 3. BufReader reads line-by-line from buffered slices:
    let reader = BufReader::new(Cursor::new(backing));
    let lines: Vec<String> = reader.lines().map(Result::unwrap).collect();
    println!("read back {} lines: {:?}", lines.len(), lines);
}
```
```output
standard FDs: stdin=0, stdout=1, stderr=2
read back 4 lines: ["row=0", "row=1", "row=2", "row=3"]
```

:::details Inspecting live FDs on Linux with `/proc/self/fd`
On any Linux box, reading the symlinks inside `/proc/self/fd` shows every file, pipe, epoll instance, and socket currently open in your process (`0 -> /dev/pts/0`, `3 -> /etc/passwd`, `4 -> socket:[12345]`). If a server slowly leaks sockets or files, `ls -l /proc/<pid>/fd` exposes the culprit in seconds!
:::

:::exercise guided Tracing `BufWriter::drop` silent-error danger
Suppose your disk fills up (`ENOSPC`) while writing 100 bytes into `let mut bw = BufWriter::new(file); writeln!(bw, "critical")?;`. If you never call `bw.flush()?;` and instead let `bw` go out of scope at `}`, what happens to that `ENOSPC` error?
::hint
Check the signature of `Drop::drop(&mut self)`: can `Drop` return a `Result`?
::solution
`Drop::drop(&mut self)` returns `()`, so **`BufWriter::drop` swallows any write error silently** (`let _ = self.flush_buf();`)! Only calling `bw.flush()?;` explicitly before `bw` drops surfaces `ENOSPC` / `EIO` back to your caller.
:::

:::exercise practice Choosing `sync_data()` vs `sync_all()` vs `flush()`
A database commit writes a 4 KiB transaction record to a write-ahead log file (`wal.log`). Rank the durability guarantee after a sudden power loss if the process calls: (a) nothing (`file.write_all` only), (b) `BufWriter::flush()`, (c) `file.sync_data()`, (d) `file.sync_all()`.
::hint
Distinguish user-space memory, kernel RAM page cache, SSD file blocks, and directory/size metadata!
::solution
- **(a) Nothing (`BufWriter` only):** Record sits in process heap RAM—lost immediately even on a simple crash (`SIGKILL`)!
- **(b) `flush()`:** Pushes bytes via `write()` syscall into the **kernel page cache**—survives process crash, **lost on power cut/kernel panic**!
- **(c) `sync_data()` (`fdatasync`):** Flushes dirty data blocks (and size changes if needed) all the way to persistent NVMe/disk storage; fast when file size is pre-allocated!
- **(d) `sync_all()` (`fsync`):** Flushes data blocks *plus* all inode timestamps/metadata to persistent storage (plus syncing the parent directory on initial file creation).
:::

:::exercise challenge Why does `O_CLOEXEC` prevent accidental deadlocks in pipelines?
Imagine a multi-threaded Rust program opens a pipe `(r, w)` and simultaneously spawns a long-running background child process (`sleep 100`) on another thread. If `pipe()` were created *without* `O_CLOEXEC`, why would the parent reading `r` hang forever even after the parent closed `w`?
::hint
Remember when a Unix pipe sends `EOF` (`read() == 0`)—not when *one* writer closes `w`, but when **every** FD pointing to `w` across *all* processes closes!
::solution
If the background child inherited a duplicate open FD for `w` during `fork()` + `execve()`, the open file description's `refcount` stays `>= 1` even after the parent closes its own `w`! Consequently `r.read()` blocks forever waiting for EOF from `sleep 100`. Setting **`O_CLOEXEC`** (which Rust does automatically on `File::open` and `Command`) tells the kernel to close inherited private FDs automatically inside `execve()`.
:::

:::recap
- Every open file, pipe, terminal, and socket maps through **Process FD Table -> Kernel Open File Description (offset, flags) -> VFS Inode**.
- Standard FDs (`0 = stdin`, `1 = stdout`, `2 = stderr`) default in Rust to buffered `stdin`, `LineWriter` `stdout`, and unbuffered `stderr`.
- **Pipes** provide fixed kernel ring buffers (~64 KiB) with built-in backpressure (`write` blocks when full) and EOF (`read == 0`) when all writers close.
- **User-space `flush()`** moves bytes to the **kernel page cache**, whereas **`fsync` / `sync_all()`** pushes bytes to persistent storage; **`OwnedFd` + `Drop`** guarantees FD cleanup without leaks.
:::

:::quiz Check your understanding
? In Linux's three-table FD architecture, what lives in the Open File Description table rather than inside the process's FD array?
- Only the integer `0, 1, 2`
- The ASCII filename path string
+ Current read/write byte **file offset**, status flags (`O_APPEND`, `O_NONBLOCK`), and reference count
- User-space `BufReader` bytes
= Multiple FDs (from `dup` or `fork`) can point to the same Open File Description and share its current file offset and flags.

? What is the difference between `buf_writer.flush()` and `file.sync_all()`?
- They are identical aliases
- `sync_all()` only flushes `stdout`
- `flush()` closes the file descriptor automatically
+ `flush()` empties user-space buffers into the OS kernel page cache via `write()`, whereas `sync_all()` (`fsync`) forces the kernel to flush dirty pages and metadata to physical disk
= `write()` returns once bytes reach kernel RAM; durable persistence across power failure requires `fsync`/`fdatasync`.

? Why does Rust's `std::fs::File` open files with `O_CLOEXEC` by default?
+ To prevent newly opened FDs from leaking into child processes spawned concurrently via `Command::new`
- To compress files automatically on close
- To bypass the kernel page cache
- To enable non-blocking async I/O automatically
= Without `O_CLOEXEC`, forked child processes inherit every open FD (keeping pipes open and leaking sensitive files across `execve`).

? Why should you always call `writer.flush()?` explicitly on a `BufWriter` before dropping it?
- Otherwise Rust leaks the `8 KiB` heap buffer
+ `Drop::drop` cannot return `Result`, so any `ENOSPC`/`EIO` failure during `BufWriter`'s automatic drop-time flush is silently ignored
- `BufWriter` never flushes on drop
- Calling `flush()` automatically triggers `fsync()`
= Explicit `writer.flush()?` catches I/O errors that `Drop` has no way to propagate.
:::
