@id blocking-epoll-io-uring
@part p7
@kind chapter
@title Blocking I/O, Non-Blocking Multiplexing, epoll & io_uring
@short epoll & io_uring internals
@level intermediate
@time 35
@learn Contrast blocking I/O, non-blocking EAGAIN polling, and I/O multiplexing (select/poll/epoll/kqueue) | Trace how epoll (epoll_create, epoll_ctl, epoll_wait) scales to 100,000 sockets (O(ready) vs O(N)) | Explain level-triggered vs edge-triggered epoll readiness notifications and why Tokio registers Wakers with mio | Understand Linux io_uring (SQ/CQ lockless ring buffers in shared memory) as true completion-based async I/O

Imagine building a chat or web server handling **50,000 simultaneous TCP clients**, where 49,950 connections are idle at any millisecond while 50 actually send bytes.

If you spawn one OS thread per connection and call blocking `TcpStream::read()`, 50,000 × 2 MiB virtual stacks burns 100 GiB of stack reservations and forces tens of thousands of kernel scheduler transitions. Conversely, spinning in a `nonblocking` `loop` calling `read()` on all 50,000 sockets burns 100% CPU receiving `EAGAIN` 49,950 times!

This is the **C10K / C10M problem**, and solving it cleanly produced Linux's **`epoll`** (which powers Tokio, `mio`, `nginx`, and `hyper`) and its modern successor, **`io_uring`**. The descriptors being multiplexed are the ones described in [streams, file descriptors and buffering](#streams-fds-buffering).

:::analogy Knocking on 50,000 doors vs a hotel front-desk buzzer
- **Blocking thread-per-connection:** Hire 50,000 security guards, one standing asleep outside each room door (`read()`).
- **Naive `select()` / `poll()`:** One guard walks all 50,000 hallways every time *one* guest wakes up, asking every single room "Ready? Ready? Ready?" (`O(N)` per call!).
- **`epoll` / `kqueue` (readiness):** Guests press a hallway button when data arrives; the front desk hands the single guard a short clipboard listing **only the 50 rooms that actually buzzed** (`O(ready)`!).
- **`io_uring` (completion):** Guests drop completed packages straight onto a shared conveyer belt in your lobby; zero trips to the front-desk window (`0` syscalls in the hot loop!).
:::

:::compare Linux I/O models side by side
| Model | Syscalls per batch | Scaling complexity | Notification style | Notes |
|---|---|---|---|---|
| **Blocking `read()`** | 1 per operation | `O(threads)` memory/scheduling | Thread sleeps until ready | Simplest; great for < 1,000 connections or worker pools |
| **`select` / `poll`** | 1 per check + copy all FDs | **`O(N_registered)`** per wait! | Readiness | `select` hard-capped at `FD_SETSIZE = 1024`; scans entire array each wake-up |
| **`epoll` (Linux) / `kqueue` (macOS/BSD)** | `epoll_wait()` | **`O(N_ready)`** per wait! | Readiness | Kernel red-black tree + ready list; backs `mio` & Tokio! |
| **`io_uring`** | Optional (`0` syscalls under polling!) | **`O(N_ready)`** lockless rings | **True Completion** | Supports disk files *and* sockets asynchronously; minimal syscall overhead |
:::

## Step 1: Non-blocking `O_NONBLOCK` and `WouldBlock` (`EAGAIN`)

Before any multiplexer works, each socket is flipped into **non-blocking mode** (`stream.set_nonblocking(true)` in Rust, calling `fcntl(fd, F_SETFL, O_NONBLOCK)`). In non-blocking mode, `read()` **never puts the OS thread to sleep**: (the socket behind that file descriptor is in [TCP, UDP and kernel sockets](#tcp-udp-sockets-kernel))

- If kernel receive buffers hold bytes right now, `read()` copies them immediately and returns `Ok(n)`.
- If the socket receive buffer is empty, `read()` returns immediately with `-EAGAIN` -> `Err(io::ErrorKind::WouldBlock)`.

Now you only need one kernel mechanism that answers: *"Sleep until at least one of these 50,000 registered FDs leaves `WouldBlock` and becomes readable or writable."*

:::plain Readiness (`epoll`) vs completion (`io_uring`)
**Readiness** (**[[epoll]]**) tells you *"Socket 42 now has bytes waiting—go call `read(42, ...)` yourself."* **Completion** (**[[io_uring]]**) lets you hand the kernel a buffer upfront (*"Put up to 4 KiB from FD 42 into `buf`"*), and notifies you only after the bytes are **already sitting in `buf`**.
:::

## Step 2: Inside `epoll` (`epoll_create1`, `epoll_ctl`, `epoll_wait`)

Linux `epoll` splits registration from waiting across three system calls:

1. **`epoll_create1()`:** Creates a kernel `epoll` object (returned as its own FD!). Inside the kernel, it holds two key structures:
   - An **interest list** (red-black tree of every monitored FD -> `O(log N)` insert/remove once when a socket connects/closes).
   - A **ready list** (doubly linked list populated automatically by kernel interrupt/NIC bottom halves whenever a monitored FD receives packets or buffer space frees up!).
2. **`epoll_ctl(epfd, ADD/MOD/DEL, fd, event)`:** Registers interest in `EPOLLIN` (readable) or `EPOLLOUT` (writable) **once** per connection—not on every loop iteration like `poll()`!
3. **`epoll_wait(epfd, events_out, max_events, timeout)`:** If the ready list is empty, the thread sleeps at `0%` CPU. When 50 sockets become ready, `epoll_wait` copies **only those 50 events** into user space and returns `50`—whether you watch 50 sockets or 500,000!

### Level-Triggered (`LT`) vs Edge-Triggered (`ET`)

- **Level-Triggered (default):** As long as bytes sit unread in the kernel socket buffer, `epoll_wait` keeps reporting `EPOLLIN` on every call. Easy to use, slightly higher event churn.
- **Edge-Triggered (`EPOLLET`, used by `mio` and Tokio!):** `epoll_wait` fires **only once** when the socket transitions from empty -> non-empty! Your user-space task **must drain `read()` in a loop until it returns `WouldBlock`**, because if you read 100 bytes out of 500 and go back to `epoll_wait`, `epoll` stays silent forever until *new* network packets arrive!

## Step 3: How Tokio actually connects `Future::poll` to `epoll`

Remember async `Future::poll(&mut self, cx: &mut Context<'_>)` from earlier concurrency chapters? Now you can see the whole bridge from Rust syntax down to Linux NIC interrupts:

:::note Complete bridge from Rust async/.await down to Linux epoll & NIC IRQ
```text
Tokio Task (`socket.read(&mut buf).await`):
    1. Calls non-blocking `read(fd)` -> kernel returns `EAGAIN` (`WouldBlock`)
    2. Registers current task's `Waker` inside Tokio/mio slab mapped to `fd` (token)
    3. Returns `Poll::Pending` -> worker thread picks another ready Future!

Worker thread idle? Runs Reactor loop:
    4. Calls `epoll_wait(epfd, &mut events, ...)` -> OS thread sleeps at `0%` CPU

Later, network packet arrives on NIC:
    5. NIC DMA writes packet to RAM, raises Hardware IRQ -> kernel TCP copies to `fd` buffer
    6. Kernel TCP appends `fd` to `epoll`'s ready list & wakes sleeping thread
    7. `epoll_wait` returns `(token=42, READABLE)` -> Reactor looks up slot 42, calls `waker.wake()`
    8. Tokio pushes Task 42 back onto worker run queue -> `.await` retries `read(fd)` -> `Ok(n)`!
```
:::

Notice something subtle about `epoll` and **regular disk files** (`ext4`): regular files are *always* considered "ready" by `epoll` (`epoll_ctl` rejects them with `EPERM`!). That's why Tokio cannot use `epoll` on normal files—`tokio::fs` dispatches file reads/writes to a blocking OS thread pool (`spawn_blocking`) unless you move to `io_uring`!

## Step 4: `io_uring` — zero-syscall asynchronous completion queues

Why did Linux 5.1 introduce **`io_uring`** (used by `tokio-uring`, `monoio`, `glommio`, TigerBeetle, and modern high-throughput databases)?

Two limitations remained even with `epoll`:
1. `epoll` is **readiness-based**: you call `epoll_wait` (1 syscall), then still call `read`/`write` per ready socket (more syscalls!).
2. `epoll` cannot drive **disk file I/O** asynchronously without blocking worker threads.

**`io_uring`** fixes both by sharing two lockless **ring buffers** directly between user space and kernel space (`mmap`):
- **SQ (Submission Queue):** User space writes I/O requests (**SQEs**: "read 4 KiB from file FD `5` at offset `8192` into buffer `B`" or "accept socket", "send buffer") directly into shared memory and bumps the atomic tail pointer.
- **CQ (Completion Queue):** The kernel executes those operations asynchronously (using kernel DMA/workers for disk AND sockets alike!) and posts finished results (**CQEs**: bytes transferred or `-errno`) into the shared CQ ring!
- With batched submissions (or `SQPOLL` kernel polling mode), a busy server submits hundreds of reads and reaps hundreds of completions in **a single `io_uring_enter` syscall**—or **zero syscalls** on hot paths!

Let's simulate a tiny non-blocking state-machine event loop in safe Rust to see how readiness polling (`WouldBlock` -> resume) mirrors `mio` / Tokio's core design:

```rust run
use std::collections::VecDeque;

#[derive(Debug, PartialEq)]
enum IoError { WouldBlock }

struct NonBlockingPipe {
    buf: VecDeque<u8>,
}

impl NonBlockingPipe {
    fn try_read(&mut self, out: &mut [u8]) -> Result<usize, IoError> {
        if self.buf.is_empty() {
            return Err(IoError::WouldBlock);
        }
        let mut n = 0;
        while n < out.len() {
            if let Some(b) = self.buf.pop_front() {
                out[n] = b;
                n += 1;
            } else {
                break;
            }
        }
        Ok(n)
    }
}

fn main() {
    let mut pipe = NonBlockingPipe { buf: VecDeque::new() };
    let mut tmp = [0u8; 4];

    // Step 1: socket empty -> EAGAIN / WouldBlock (task parks & awaits epoll readiness)
    println!("before packet: {:?}", pipe.try_read(&mut tmp));

    // Step 2: NIC interrupt delivers 6 bytes into kernel receive buffer -> epoll fires ET!
    pipe.buf.extend(b"RUST!!");

    // Step 3: edge-triggered drain loop reads until WouldBlock!
    let mut received = Vec::new();
    loop {
        match pipe.try_read(&mut tmp) {
            Ok(n) => received.extend_from_slice(&tmp[..n]),
            Err(IoError::WouldBlock) => {
                println!("drained {} bytes until WouldBlock: {:?}", received.len(), String::from_utf8_lossy(&received));
                break;
            }
        }
    }
}
```
```output
before packet: Err(WouldBlock)
drained 6 bytes until WouldBlock: "RUST!!"
```

Look closely at Step 3: **draining in a loop until `WouldBlock`** is the exact invariant every edge-triggered `epoll` / `mio` / Tokio driver relies on.

## End-to-end trace: `std::fs::File::open` and `read` down to hardware

Before moving to CPU microarchitecture in Part VIII, connect everything from Parts VI and VII by tracing `let data = std::fs::read("config.toml")?;` from Rust down to an [[NVMe]] SSD and back:

1. **`openat` syscall:** `File::open("config.toml")` calls `openat(AT_FDCWD, "config.toml\0", O_RDONLY | O_CLOEXEC)`.
2. **Kernel [[VFS]] path walk:** Inside Ring 0, VFS walks `"config.toml"` in the in-RAM **[[dentry]] cache**; on a cache hit it finds the target **[[inode]]** immediately without touching disk, checks your process's `UID`/`GID` against the inode's read permission bit, allocates an Open File Description (`offset = 0`), and returns `FD 3` wrapped in Rust's RAII `File`.
3. **`read` syscall & [[page cache]] check:** `file.read_to_end(&mut buf)` calls `read(3, user_ptr, chunk_len)`. The kernel hashes `(inode, page_index = 0)` inside the OS **Page Cache**:
   - **Warm cache hit (~1 µs):** The 4 KiB file page is already in DRAM from an earlier read. The kernel copies the bytes straight into `buf` (`copy_to_user`) and updates `offset`.
   - **Cold cache miss (~40 µs on NVMe):** The kernel allocates a fresh 4 KiB page-cache frame, submits a block read request through `blk-mq` into an NVMe hardware submission queue, puts your thread to sleep (`TASK_UNINTERRUPTIBLE` at `0%` CPU), and lets other threads use the CPU core.
4. **[[DMA]] & hardware [[interrupt]]:** The NVMe controller transfers the 4 KiB flash page directly into that physical RAM frame over PCIe via DMA, posts an NVMe completion entry, and raises an MSI-X hardware interrupt.
5. **Wake-up & RAII `close`:** The interrupt handler marks the page-cache frame up-to-date and moves your thread back onto the scheduler run queue. Your resumed `read` copies the bytes into `buf` and returns `Ok(n)`. Finally, `File`'s `Drop` destructor calls `close(3)`, releasing the file descriptor cleanly.

:::exercise guided Comparing `select()`/`poll()` vs `epoll_wait()` at 100,000 connections
Suppose a server holds `100,000` idle connections and only `2` sockets receive data during a millisecond.
1. Roughly how many FD entries must `poll()` copy and scan on that wake-up?
2. How many events does `epoll_wait()` copy back to user space?
::hint
Compare `O(N_registered)` against `O(N_ready)`!
::solution
1. **`poll()`:** Must copy an array of all `100,000` `pollfd` structs from user space into the kernel and linearly scan all `100,000` entries in both the kernel and user space every single wake-up (`O(100,000)` per tick!).
2. **`epoll_wait()`:** Copies **only `2` `epoll_event` structs** into user space (`O(2)`), because the kernel already linked those 2 sockets onto `epoll`'s ready list when their packets arrived!
:::

:::exercise practice Spotting an edge-triggered (`EPOLLET`) stall bug
A developer writes an edge-triggered `epoll` loop that creates a `1,024`-byte read buffer, gets `EPOLLIN` when a `4,096`-byte HTTP request arrives, calls `read()` **once** (consuming `1,024` bytes), and immediately calls `epoll_wait()` again without draining the rest. What happens to the remaining `3,072` bytes?
::hint
Remember when an *edge-triggered* notification fires: only on transitions (empty -> ready, or new incoming packet arrival), NOT continuously while bytes remain!
::solution
If the HTTP client has finished sending its 4,096-byte request and is now waiting for the server's reply, **no new packets arrive**, so **edge-triggered `epoll_wait` never fires again**! Both client and server deadlock forever while `3,072` bytes sit unread in the kernel socket buffer. Always drain edge-triggered FDs in a loop until `read()` returns `WouldBlock`!
:::

:::exercise challenge Why does Tokio still use `spawn_blocking` for `tokio::fs::File` on Linux today?
Look at the architecture of `epoll` vs `io_uring` and explain why `tokio::fs::read` cannot simply hand a regular disk `File`'s FD to `epoll_wait`, whereas `tokio-uring` can execute asynchronous disk reads on one thread.
::hint
Does `epoll` support regular disk files (`S_ISREG`), and how does `io_uring`'s completion queue differ from readiness?
::solution
Linux `epoll` tracks *readiness* on pipes and sockets (`EAGAIN` when empty)—regular disk files (`ext4`/`xfs`) never return `EAGAIN` from `read()`, and `epoll_ctl` rejects regular file FDs with `EPERM`. Therefore Tokio executes `tokio::fs` operations synchronously inside a `spawn_blocking` worker thread pool. By contrast, **`io_uring`** is **completion-based**: user space submits a disk `READ` SQE into the shared submission ring, the kernel asynchronously performs DMA / page-cache I/O (or worker dispatch) in the background, and posts the completed `CQE` directly into the completion ring without blocking the application thread!
:::

:::recap
- **Non-blocking FDs (`O_NONBLOCK`)** return `WouldBlock` (`EAGAIN`) immediately instead of sleeping when no data is ready.
- **`epoll` / `kqueue`** scale to tens of thousands of connections in `O(ready)` time using an in-kernel red-black tree + ready list—powering `mio` and Tokio's reactor via `Waker`.
- **Edge-triggered `epoll`** (`EPOLLET`) fires only on state transitions and requires draining `read`/`write` in a loop until `WouldBlock`.
- **`io_uring`** uses lockless shared **Submission (SQ)** and **Completion (CQ)** ring buffers for true completion-based async I/O across *both* sockets and disk files with near-zero syscalls.
:::

:::quiz Check your understanding
? What makes `epoll` asymptotically faster than `select` and `poll` when monitoring 50,000 mostly-idle TCP sockets?
- `epoll` runs directly on the network card hardware
+ `epoll_wait` scales with the number of *ready* sockets (`O(ready)`) rather than re-copying and scanning all 50,000 FDs on every call (`O(total)`)
- `epoll` uses 64-byte UDP packets instead of TCP
- `epoll` runs in Ring 3 without entering the kernel
= `epoll` maintains a persistent kernel interest tree (`epoll_ctl`) and returns only active sockets from its ready list (`epoll_wait`).

? Inside a Tokio worker loop, how does a parked async network task wake up once bytes arrive on its socket?
- Tokio polls every parked future in a tight spin loop
+ `epoll_wait` returns the socket's readiness token to the reactor, which invokes `waker.wake()` to re-queue the task
- The Linux kernel calls `Future::poll` directly from Ring 0
- `Drop` wakes the task automatically
= The reactor maps `epoll` readiness tokens back to registered `Waker`s and schedules only ready tasks onto the executor queue.

? What rule MUST edge-triggered (`EPOLLET`) socket code follow after waking up on `EPOLLIN`?
- Call `read()` at most once per wake-up
+ Loop `read()` until it returns `WouldBlock` (`EAGAIN`) or `Ok(0)` (EOF)
- Call `fsync()` after every `read()`
- Switch the socket back to blocking mode
= Because edge-triggered `epoll` notifies only once per arrival transition, leaving unread bytes risks hanging indefinitely.

? What core architectural shift separates `io_uring` from `epoll`?
- `io_uring` uses user-space blocking threads
+ `io_uring` submits requests and reaps completions via shared-memory Submission/Completion rings (supporting async disk *and* network I/O with fewer syscalls)
- `io_uring` replaces virtual memory page tables
- `io_uring` works only on UDP sockets
= `io_uring` delivers true completion-based async I/O over shared lockless rings rather than readiness polling + separate read/write syscalls.
:::
