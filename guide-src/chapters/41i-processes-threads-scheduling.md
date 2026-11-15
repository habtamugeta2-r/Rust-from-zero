@id processes-threads-scheduling
@part p6
@kind chapter
@title Processes, OS Threads, Scheduling & Context Switching
@short Processes, threads & scheduler
@level intermediate
@time 35
@learn Contrast processes and OS threads via Linux clone() sharing flags | Trace fork() + COW, execve(), wait(), zombies, and orphans | Explain OS preemptive scheduling (CFS / EEVDF, run queues, time slices, I/O vs CPU bursts) | Measure what a full CPU context switch costs and inspect thread/PID isolation in Rust

Your computer has 4, 8, or 64 CPU cores, yet `ps aux` shows 300+ running processes and 2,000+ threads—a compiler, a terminal, a web server, a database, and dozens of kernel workers—all seemingly moving forward together.

Who decides which thread gets a CPU core right now, how long it gets to keep it, what separates a **process** from a **thread** inside the Linux kernel, and why does switching between two threads from different processes cost far more than switching within the same process? The kernel side of the `clone()` call that starts all of this is in [the kernel and system calls](#kernel-syscalls-processes).

:::analogy Separate apartments vs roommates in one apartment
Two **processes** live in separate locked apartments: each has its own private floor plan (`virtual address space / CR3`), its own key ring (`file descriptor table`), and its own mailbox (`signal handlers`). Two **[[threads|thread]]** inside the same process are roommates sharing *one* apartment (`CR3`, heap, globals, open files), while each roommate keeps their own private bedroom desk (`registers`, `stack`, and `thread-local storage`).
:::

:::compare Process vs OS Thread vs Async Task (green future)
| Property | Process (`fork` / `Command`) | OS Thread (`std::thread::spawn`) | Async Task (`tokio::spawn`) |
|---|---|---|---|
| Scheduled by | Linux kernel scheduler | Linux kernel scheduler (`task_struct`) | User-space executor (`Tokio` runtime) |
| Virtual memory (`CR3`) | Separate private address space | Shared across sibling threads | Shared across worker threads |
| Stack size | Own 8 MiB `[stack]` | ~2–8 MiB virtual stack per thread | Tiny heap-allocated state machine (bytes–KiB) |
| Creation cost | ~50–200 µs (`fork` + page-table copy) | ~10–50 µs (`clone` + stack `mmap`) | ~0.1–1 µs (one heap alloc / queue push) |
| Context switch | ~1–10+ µs (registers + `CR3`/TLB impact + cache thrash) | ~1–5 µs (registers + kernel trap; same `CR3`!) | ~10–100 ns (plain function `poll()` call!) |
:::

## Inside Linux: `fork()`, `clone()`, and the secret unity of processes and threads

Inside the Linux [[kernel]], **there is no separate fundamental struct for "a process" versus "a thread"**. Both are represented by the exact same kernel structure, **`task_struct`**, and both are created underneath by the same [[system call]]: **`clone()`**.

:::plain PID vs TGID vs TID on Linux
Linux naming can surprise newcomers: inside the kernel, every thread gets its own unique kernel **TID** (*Thread ID*), while all threads belonging to the same process share one **TGID** (*Thread Group ID*). What user-space tools (`ps`, `kill`, `std::process::id()`) call the **PID** (*Process ID*) is actually that shared **TGID**! For the initial main thread, `TID == TGID`.
:::

What distinguishes a child process from a new thread is simply **which bitmask flags** you pass to `clone()`:

- **`fork()` (new process):** Calls `clone(SIGCHLD)`—creates a new `task_struct` with its **own [[copy-on-write]] virtual address space (`mm_struct`)**, its own copy of the **[[file descriptor]] table**, and its own `TGID` (Process ID = `PID`).
- **`std::thread::spawn` / `pthread_create` (new OS thread):** Calls `clone(CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD | CLONE_SETTLS)`—creates a new `task_struct` with its own kernel `TID` and user stack, while **sharing** the parent's `mm_struct` (virtual memory), `files_struct` (open files), signal dispositions, and `PID` (`TGID`).

Look how cleanly that explains why two threads in one Rust process share the exact same heap (`Arc<Mutex<T>>`), same global `static`s, and same file descriptors—while two forked processes need IPC (pipes, sockets, or shared `mmap`) to communicate! The user-space half of that story is [threads](#threads) and [shared state](#shared-state); the pipe-based IPC lives in [streams, file descriptors and buffering](#streams-fds-buffering).

## Process lifecycle: `fork()`, `execve()`, `wait()`, zombies & orphans

On Unix, spawning an external program (as Rust's `std::process::Command::new("ls").spawn()` does—using fast `posix_spawn` / `vfork` + `execve` underneath) follows a crisp four-act lifecycle:

:::note Unix process lifecycle, wait(), and zombies
```text
Parent calls Command::spawn() ──► fork()/clone() creates Child (PID 105)
                                         │
                                  execve("/bin/ls") replaces Child's memory
                                         │
                                  Child finishes & calls exit(0)
                                         │
      ┌──────────────────────────────────┴──────────────────────────────────┐
      ▼ (Parent calls waitpid())                                            ▼ (Parent forgets wait()!)
Kernel reads exit status (0)                                         Child becomes a ZOMBIE (`Z`)!
& frees Child's `task_struct`                                        Memory freed, PID/exit code kept
                                                                     until Parent waits or exits
                                                                     (if Parent dies first -> ORPHAN
                                                                      adopted & reaped by PID 1 `init`)
```
:::

Wait—why does Unix keep dead children as **zombies (`Z`)** at all? Because the kernel must remember the child's **exit status code** (`0`, `1`, or signal number) until the parent explicitly retrieves it with `wait()` / `waitpid()` (`.wait()` or `.output()` in Rust `Command`)! If you spawn children inside a long-running Rust server and forget to call `.wait()`, zombies accumulate until the OS runs out of PID slots.

## Preemptive OS scheduling: time slices, run queues & fairness

Why doesn't an infinite `loop {}` in one Rust program freeze your whole laptop? Because the kernel configures a hardware **APIC timer interrupt** every few milliseconds (typically **1–4 ms** per tick). Even if user code never makes a syscall, the timer forces a Ring 3 -> Ring 0 transition into the Linux **scheduler** (`CFS` historically, **`EEVDF`** — Earliest Eligible Virtual Deadline First — in Linux 6.6+!):

- Each CPU core maintains a **run queue** of `TASK_RUNNING` threads ready for execution.
- Threads blocked waiting on disk, network sockets, `Mutex::lock()`, or `thread::sleep()` sit in **wait queues** (`TASK_INTERRUPTIBLE` / `TASK_UNINTERRUPTIBLE`) and consume **0% CPU** until an interrupt or `futex` wakes them!
- **Fairness vs responsiveness:** EEVDF tracks each thread's **virtual runtime (`vruntime`)**—how much CPU time it actually consumed, weighted by `nice` priority. An I/O-bound web server thread that sleeps 99% of the time stays far ahead in virtual deadline priority, so the microsecond a packet arrives, the scheduler **preempts** a CPU-bound background loop and puts the interactive thread straight onto a core!

## What happens during a context switch (and its true cost)

When the kernel preempts Thread A to run Thread B:
1. Save Thread A's user registers (`RIP`, `RSP`, `RAX..R15`, `XMM/AVX`) onto Thread A's kernel stack.
2. Pick Thread B from the core's run queue.
3. Switch kernel stack pointer to Thread B's stack.
4. **If B belongs to a different process:** swap **`CR3`** to B's page table! Modern CPUs tag TLB entries with a **PCID** (Process-Context ID) so switching `CR3` doesn't purge every TLB entry immediately, yet Thread B's working set still collides with Thread A's data in **L1/L2 CPU caches**!
5. Restore Thread B's registers and `iretq`/`sysretq` back to Ring 3.

Notice the subtle lesson: the register swap itself takes only ~1 microsecond, whereas **cache pollution**—Thread B evicting Thread A's hot L1/L2 lines and suffering cold cache misses for the next tens of thousands of cycles—can make rapid thread ping-ponging cost **10–50+ microseconds** in total throughput!

## Unix users, permissions, capabilities, and namespaces

Every `task_struct` also carries security credentials checked by the kernel on every `openat`, `kill`, or `bind` syscall:

- **Users and groups (`UID` / `GID`):** Ordinary users get numeric IDs like `1000`; **`UID 0`** is the superuser (`root`). Classic file mode bits (`rwxr-xr-x`, octal `0755`) grant Read (`4`), Write (`2`), and Execute (`1`) separately to the file's **owner**, **group**, and **others**. (A special `setuid` bit on binaries like `/usr/bin/sudo` lets an executable start with its file owner's `effective UID`.)
- **Linux capabilities:** Historically, binding TCP port `80` or raw ping sockets required running the entire server as omnipotent `UID 0` (`root`). Modern Linux splits `root`'s power into ~40 fine-grained **capabilities**: granting just `CAP_NET_BIND_SERVICE` lets a non-root Rust web server bind port `443` while keeping zero permission to touch system files or other processes.
- **Linux [[namespace]] (how containers work):** Passing flags like `CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWNS | CLONE_NEWUSER` to `clone()` or `unshare()` places a process in isolated **namespaces**. Inside a `PID` namespace, your Rust binary sees itself as `PID 1`; inside a `NET` namespace, it gets its own private loopback and virtual Ethernet interface; inside a `MNT` namespace (`pivot_root`), it sees only the container image's files—all running on the **exact same host Linux kernel** with zero virtual-machine overhead!

## Inspecting processes and threads live in Rust

```rust run nocmp
use std::process::Command;
use std::thread;

fn main() {
    let parent_pid = std::process::id();
    let main_tid = thread::current().id();
    println!("parent PID={parent_pid}, main thread={main_tid:?}");

    let handle = thread::spawn(move || {
        // Same PID as parent, distinct OS thread!
        println!(
            "child thread: PID={}, TID={:?}",
            std::process::id(),
            thread::current().id()
        );
    });
    handle.join().unwrap();

    // Now spawn a completely separate child process (`echo`):
    let out = Command::new("echo")
        .arg("hello from child process")
        .output()
        .expect("spawn echo");
    println!("child process exit={}, stdout={}", out.status, String::from_utf8_lossy(&out.stdout).trim());
}
```

Notice `.join().unwrap()` reaps the thread's resources, and `.output()` internally calls `waitpid()` to reap the child process cleanly—zero zombies left behind!

:::exercise guided Predicting PID & memory visibility across `thread::spawn` vs `Command::new`
Suppose a global `static COUNT: AtomicUsize = AtomicUsize::new(0);` starts at `0`.
1. A spawned `std::thread` increments `COUNT` by `1`. What value does `main` read after `.join()`?
2. A spawned child Rust binary via `std::process::Command` increments its own `COUNT` by `1`. What value does `main` read after `.wait()`?
::hint
Remember `CLONE_VM` (shared virtual address space) vs `fork + execve` (fresh private virtual address space)!
::solution
1. **`std::thread::spawn`:** `main` reads **`1`**, because both threads share the exact same `mm_struct` (same virtual-to-physical mapping of `.data`/`.bss`).
2. **`Command::new`:** `main` reads **`0`**, because the child process runs in an isolated virtual address space (`CR3`)—its `COUNT` lives in completely separate physical memory!
:::

:::exercise practice Choosing threads vs processes for a web browser or compiler
Modern browsers (Chrome/Firefox) isolate individual browser tabs in separate **processes**, whereas inside one rendering tab they run **threads** for JS, layout, and compositing. Why use processes between tabs and threads inside one tab?
::hint
Compare crash/security blast radius (`CR3` isolation) against zero-copy shared-memory speed!
::solution
- **Between tabs (processes):** A crash (`SIGSEGV`) or security exploit in one rogue web page cannot corrupt or read passwords/cookies mapped in another tab's private virtual address space (`CR3`), and closing a tab instantly returns every byte of heap to the kernel.
- **Inside one tab (threads):** Layout, styling, and painting must touch the exact same multi-megabyte DOM tree rapidly with zero serialization/IPC overhead (`CLONE_VM`).
:::

:::exercise challenge Estimating thread-pool sizing for CPU-bound vs I/O-bound work
Suppose you have an 8-core server running:

- Workload A: pure CPU hashing (`sha256` in tight loops).
- Workload B: synchronous blocking PostgreSQL queries (`5 ms` network wait + `0.1 ms` CPU each).

Why is **8 threads** optimal for Workload A (and **64 threads worse**), whereas **8 threads** starves throughput on Workload B?
::hint
Think about context switching & cache thrashing vs blocked wait queues (`TASK_INTERRUPTIBLE`)!
::solution
- **Workload A (CPU-bound):** Only 8 cores exist. Spawning 64 threads creates 56 extra threads fighting on run queues, forcing unnecessary preemptive context switches and L1/L2 cache thrashing while adding zero CPU capacity (`available_parallelism()` = 8).
- **Workload B (blocking I/O):** Each synchronous thread spends ~98% of its time asleep in a kernel wait queue (`0%` CPU) waiting on socket packets, leaving cores idle with only 8 threads—so either more threads or (much better!) **async I/O (`epoll` / `io_uring`)** keeps all 8 cores busy without spawning thousands of 2 MiB stacks!
:::

:::recap
- Inside Linux, processes and OS threads are both `task_struct` objects created by `clone()` with different sharing flags (`CLONE_VM`, `CLONE_FILES`, `CLONE_THREAD`).
- Processes isolate virtual memory (`CR3`), files, and crashes; threads share one address space and files while keeping private registers and stacks.
- Every spawned Unix child process must be reaped via `wait()`/`waitpid()` (done by Rust `Command::wait`/`output`) or it remains a **zombie** holding its PID and exit code.
- Preemptive schedulers (Linux **EEVDF**) rotate runnable threads via timer interrupts; **context switches** hurt most not from saving registers (~1 µs), but from evicting warm **L1/L2 CPU caches**.
:::

:::quiz Check your understanding
? Which Linux system call creates BOTH child processes (`fork`) and new OS threads (`pthread_create` / `std::thread::spawn`) under the hood?
- `execve`
+ `clone`
- `mmap`
- `futex`
= Both `fork` and `std::thread::spawn` invoke `clone()` with different flag bitmasks (`CLONE_VM | CLONE_FILES | CLONE_THREAD` for threads).

? What happens if a parent process spawns child processes via `Command::spawn()` in a loop and never calls `.wait()` or `.try_wait()`?
- The child processes keep executing forever even after returning from `main`
+ Finished child processes remain in the kernel process table as **zombies (`Z`)** holding their PID and exit status until reaped or the parent exits
- The OS immediately kills the parent process
- Child processes turn into threads inside the parent
= The kernel preserves a dead child's PID and exit status slot until `waitpid()` collects it.

? Why does adding 200 OS threads to an 8-core server doing pure CPU arithmetic make it *slower* than 8 threads?
- Linux limits user programs to 8 threads
+ Extra threads cannot create extra CPU cores; instead they force frequent preemptive context switches and evict hot L1/L2 cache lines
- `std::thread` disables compiler optimisations
- Atomic reference counts cannot run across more than 8 threads
= More runnable threads than physical cores causes scheduling overhead and cache-line thrashing without increasing compute capacity.

? When a thread calls `std::thread::sleep` or blocks on `TcpStream::read`, how much CPU time does the OS scheduler give it while waiting?
- 100% of one core spinning in a kernel loop
+ 0% — the kernel moves the thread onto a sleep/wait queue until the timer or socket wake-up arrives
- 50% alternating with sibling threads
- One timer tick every microsecond
= Blocked threads leave the run queue completely (`TASK_INTERRUPTIBLE`) so other threads use 100% of the CPU cores.
:::
