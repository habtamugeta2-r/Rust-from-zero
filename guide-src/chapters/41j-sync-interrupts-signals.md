@id sync-interrupts-signals
@part p6
@kind chapter
@title Kernel Synchronization, Hardware Interrupts & POSIX Signals
@short Interrupts, signals & futex
@level intermediate
@time 35
@learn Distinguish hardware interrupts (IRQ), CPU exceptions (trap/fault/abort), and POSIX signals | Explain how Linux Mutex and Condvar work via futex (fast uncontended atomic vs kernel sleep) | Understand async-signal safety and why Rust forbids heap allocations in raw signal handlers | Handle Ctrl+C / SIGTERM cleanly in production Rust programs via atomic flags or signal-hook/tokio

How does a keyboard press, an incoming network packet, or `Ctrl+C` break into a busy CPU core? Why does `std::sync::Mutex::lock()` take ~15 nanoseconds when nobody else holds the lock, yet put your thread completely to sleep at `0%` CPU when contended—without spinning or hammering syscalls? And why can calling `println!` inside a raw Unix signal handler deadlock your program?

In this chapter we look inside the reactive machinery of a live operating system: **hardware interrupts**, **CPU exceptions**, **POSIX signals**, and the Linux **`futex`** behind Rust's locks.

:::analogy Doorbells vs checking the mailbox vs fire alarms
- **Polling** (`loop { check_flag() }`) burns CPU pacing back and forth to the front door every second.
- **Hardware Interrupts (IRQs)** are electric doorbells wired directly from the network card, NVMe SSD, or timer chip into the CPU's interrupt pins: you do real work at full speed until the doorbell rings, handle the arrival in microseconds, and resume seamlessly.
- **POSIX Signals (`SIGINT`, `SIGTERM`)** are software telegrams forwarded by the kernel to a specific process—either synchronously from an exception (`SIGSEGV`) or asynchronously from another process (`kill -TERM <pid>`).
:::

:::compare Interrupts vs Exceptions vs POSIX Signals
| Event | Source | Sync / Async | Examples |
|---|---|---|---|
| **Hardware Interrupt (IRQ)** | External device (APIC timer, NIC, NVMe, USB) | **Asynchronous** (fires between instructions) | Timer tick, DMA disk completion, Ethernet packet RX |
| **CPU Exception** | CPU executing the current instruction | **Synchronous** (exact offending instruction) | Page fault (`#PF`), divide by zero (`#DE`), invalid opcode (`#UD`) |
| **Software Trap (`syscall`)** | Intentional instruction executed by user code | **Synchronous** | `syscall` (`write`, `futex`, `epoll_wait`) |
| **POSIX Signal** | Kernel software notification delivered to a process/thread | Sync (`SIGSEGV`, `SIGBUS`) or Async (`SIGINT`, `SIGTERM`, `SIGCHLD`) | Ctrl+C (`SIGINT`), graceful shutdown (`SIGTERM`), pipe closed (`SIGPIPE`) |
:::

## Inside hardware interrupts and top-half / bottom-half handlers

Every CPU core executes an instruction cycle, checking its hardware interrupt lines right between instructions. When an NVMe controller finishes transferring a 4 KiB block into RAM via **DMA (Direct Memory Access)**—without copying bytes through the CPU—it fires an electrical **IRQ** via the APIC controller:

1. The CPU freezes the currently running user thread, pushes `SS`, `RSP`, `RFLAGS`, `CS`, `RIP` onto the **kernel stack**, disables nested interrupts briefly, and looks up the handler in the kernel's **IDT** (Interrupt Descriptor Table, or vector table on ARM64).
2. **Top half (hard IRQ):** Minimal, ultra-fast (~1–5 µs) work—acknowledge the hardware chip and schedule deferred processing so interrupts stay responsive.
3. **Bottom half (`softirq` / `ksoftirqd` / threaded IRQ):** Runs TCP/IP packet assembly, wakes waiting processes (moving your sleeping `TcpStream::read` thread back onto the CPU run queue!), and lets the scheduler decide whether to resume the interrupted thread or switch immediately.

## How Rust's `std::sync::Mutex` works: User-space atomics + Linux `futex`

Before Linux 2.6 (`futex` — *Fast Userspace Mutex*), locking *every* mutex required a syscall even when no other thread was anywhere near the lock! On modern Linux, Rust's `std::sync::Mutex` (and `RwLock`, `Condvar`, `OnceLock`) uses **`futex`**—a brilliant two-tier hybrid combining a fast user-space atomic integer with kernel wait queues:

:::note Uncontended vs contended Mutex::lock() via Linux futex
```text
Thread calls mutex.lock():
    1. FAST PATH (user space only, ~10-15 ns, 0 syscalls!):
       Atomic CAS (`lock cmpxchg` on x86-64): 0 (unlocked) -> 1 (locked)
       ├── Succeeded? Return MutexGuard immediately!
       └── Failed (state != 0: another thread holds the lock)?
               ▼
    2. SLOW PATH (kernel sleep via `futex`):
       Set state = 2 ("locked with waiters")
       Call syscall `futex(&state, FUTEX_WAIT, 2, ...)`
       Kernel puts thread on wait queue hashed by `&state` (`0%` CPU!)

Owner calls drop(guard):
    1. Atomic swap: old = state.swap(0)
       ├── Was 1 (no waiters)? Done in 1 atomic instruction! (0 syscalls!)
       └── Was 2 (waiters asleep!)?
               ▼
       Call syscall `futex(&state, FUTEX_WAKE, 1)` to wake one sleeper!
```
:::

Notice why **[[futex]]** scales so well:

- **Uncontended locks and unlocks never enter the Linux kernel at all**—just one [[atomic]] CPU instruction (`lock cmpxchg` / `xchg`) in Ring 3.
- **Only when threads genuinely collide** does the waiting thread call `SYS_futex(FUTEX_WAIT)` so the OS puts it peacefully to sleep at `0%` CPU instead of burning battery spinning in a `while` loop.

Let's simulate that exact two-state `futex`-style lock protocol in safe Rust using `AtomicU32` (in production, `std::sync::Mutex` or the `parking_lot` crate handles the real `SYS_futex` / OS wait parking):

```rust run
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;

const UNLOCKED: u32 = 0;
const LOCKED_NO_WAITERS: u32 = 1;

fn main() {
    let lock_word = AtomicU32::new(UNLOCKED);

    // Fast-path acquire in user space (compare_exchange -> single CPU instruction!):
    let acquired = lock_word
        .compare_exchange(UNLOCKED, LOCKED_NO_WAITERS, Ordering::Acquire, Ordering::Relaxed)
        .is_ok();
    println!("fast-path acquire succeeded = {acquired}, state = {}", lock_word.load(Ordering::Relaxed));

    // Contended attempt sees state != 0 -> would call futex(FUTEX_WAIT) instead of spinning!
    let contended = lock_word
        .compare_exchange(UNLOCKED, LOCKED_NO_WAITERS, Ordering::Acquire, Ordering::Relaxed)
        .is_ok();
    println!("contended acquire without release = {contended}");

    // Fast-path release checks old state:
    let prev = lock_word.swap(UNLOCKED, Ordering::Release);
    println!("released from state {prev} (if >1, call futex(FUTEX_WAKE, 1)!)");
    let _ = thread::current();
}
```
```output
fast-path acquire succeeded = true, state = 1
contended acquire without release = false
released from state 1 (if >1, call futex(FUTEX_WAKE, 1)!)
```

## POSIX Signals and Async-Signal-Safety

When someone presses `Ctrl+C` (`SIGINT`), runs `kill <pid>` (`SIGTERM`), or touches a null pointer (`SIGSEGV`), the Linux kernel interrupts one of your process's threads right between arbitrary CPU instructions to invoke a **signal handler**.

Look at the dangerous trap here: what if your thread was **midway inside `malloc()`** (holding glibc's internal heap lock!) when `SIGINT` fired and jumped straight into your signal handler—and your signal handler called `println!` or `String::from()` (which ALSO calls `malloc()`)?!

**Instant single-thread deadlock!** The signal handler waits forever for the heap lock already held by the paused frame *right underneath it on the very same thread's call stack*!

:::plain What does async-signal-safe mean?
A function is **async-signal-safe** if it can safely run even when a signal interrupted your thread right in the middle of another library call on the *same* stack. Lock-free atomics (`AtomicBool::store`) and raw `write(fd, ...)` syscalls are async-signal-safe; anything that acquires a user-space lock or allocates heap memory (`malloc`, `println!`, `String::from`, `Mutex::lock`) is **not**.
:::

:::warn Only async-signal-safe operations belong inside raw Unix signal handlers
Inside a raw POSIX signal handler (`sigaction`), POSIX forbids `malloc`, `free`, `println!`, `Mutex::lock()`, and almost all of Rust `std`. Only **async-signal-safe** primitives are allowed:

- Writing to a lock-free `AtomicBool` (e.g. `SHUTDOWN.store(true, Ordering::Release)`),
- Calling raw `libc::write(fd, ...)` on a pipe/eventfd (**the self-pipe trick**), or
- Letting crates like **`signal-hook`** or **`tokio::signal`** catch the raw signal safely via a self-pipe / `signalfd` and turn it into an ordinary Rust iterator, channel message, or async future.
:::

Common POSIX signals every systems programmer knows by heart:

| Signal | Number | Default action | Meaning |
|---|---|---|---|
| `SIGINT` | 2 | Terminate | `Ctrl+C` interrupt from terminal (catchable for graceful shutdown) |
| `SIGKILL` | 9 | Terminate immediately | Cannot be caught, blocked, or ignored (`kill -9`) |
| `SIGSEGV` | 11 | Terminate + core dump | Invalid virtual address / permission fault |
| `SIGPIPE` | 13 | Terminate (Rust ignores!) | Write to pipe/socket with no reader |
| `SIGTERM` | 15 | Terminate | Polite shutdown request (Docker stop, `systemd` stop; catchable!) |
| `SIGCHLD` | 17 | Ignore | Child process exited or stopped (`waitpid()` ready) |
| `SIGSTOP` | 19 | Pause process | Cannot be caught (`Ctrl+Z` uses catchable `SIGTSTP`) |

## Graceful shutdown pattern in Rust (atomic flag vs async `tokio::signal`)

In production Rust CLI tools and servers, never put business logic or `Drop` cleanup inside a raw signal handler. Set an `AtomicBool` (via `ctrlc` / `signal-hook`) or await `tokio::signal::ctrl_c()`, exit your main loop normally, and let Rust's normal `Drop` destructors flush buffers, close database transactions, and drain open HTTP requests cleanly.

## Resource limits (`rlimit`) and Linux `cgroups` v2

How does Linux stop one runaway process or container from opening ten million files, exhausting every byte of physical RAM, or starving sibling services of CPU? Two complementary kernel mechanisms enforce resource budgets:

1. **Per-process resource limits (`rlimit` / `ulimit`):** Every process inherits soft and hard ceilings (`getrlimit` / `prlimit64`), visible live in `/proc/self/limits`:
   - `RLIMIT_NOFILE` (`ulimit -n`): maximum open file descriptors (e.g. `1024` or `65536`; exceeding it returns `EMFILE`).
   - `RLIMIT_STACK` (`ulimit -s`): maximum main-thread `[stack]` size (typically `8 MiB`).
   - `RLIMIT_AS` / `RLIMIT_CORE`: virtual address space cap and core-dump file cap.
2. **Control groups ([[cgroup]], `/sys/fs/cgroup`):** While namespaces ([Chapter 48](#processes-threads-scheduling)) isolate *what a container sees*, **`cgroups` v2** cap *how much hardware a group of processes may consume*:
   - **`memory.max`:** Hard physical RAM ceiling for the container. Exceeding it wakes the kernel **OOM killer**, which terminates the offending process with an uncatchable `SIGKILL` (`exit status 137`).
   - **`cpu.max`:** Bandwidth quota (for example `200000 100000` = at most 2.0 CPU cores per 100 ms period). Note that `std::thread::available_parallelism()` in modern Rust checks cgroup CPU quotas on Linux so thread pools do not spawn 64 threads inside a 2-CPU container!

You can inspect your own process's active kernel `rlimit` ceilings right from Rust:

```rust run nocmp
fn main() {
    if let Ok(limits) = std::fs::read_to_string("/proc/self/limits") {
        for line in limits.lines() {
            if line.starts_with("Limit")
                || line.starts_with("Max stack size")
                || line.starts_with("Max open files")
            {
                println!("{line}");
            }
        }
    }
}
```
```output
Limit                     Soft Limit           Hard Limit           Units
Max stack size            8388608              unlimited            bytes
Max open files            1048576              1048576              files
```

## Putting Part VI together: Linux architecture end-to-end

Every piece of Part VI fits into one unified operating-system picture:

```text
  Ring 3 User Space:   [ Your Rust Code ] ──► [ std / libc / vDSO ]
                                │                         │
  ═══════════════ syscall / sysretq (RAX, RDI..R9, R10) ══╪═════════ Signals (SIGINT/SIGTERM)
                                ▼                         ▼
  Ring 0 Linux Kernel: ┌──────────────────────────────────────────────────────────┐
                       │ System Call Entry  │  EEVDF Scheduler  │  futex Wait Qs  │
                       │ VFS & Page Cache   │  TCP/IP Sockets   │  Namespaces &   │
                       │ Virtual Mem (MMU)  │  epoll / io_uring │  cgroups v2     │
                       ├──────────────────────────────────────────────────────────┤
                       │ Device Drivers, Block Layer (blk-mq), Top/Bottom IRQs    │
                       └────────────────────────────┬─────────────────────────────┘
  ═══════════════ PCIe / Memory Bus / DMA / Hardware IRQs ════════════════════════
                                                    ▼
  Hardware:            [ CPU Cores + TLB ]   [ DRAM ]   [ NVMe SSD ]   [ NIC ]
```

:::exercise guided Diagnosing why a signal handler froze a server
A C/Rust server installs a raw `sigaction` handler for `SIGTERM` that formats a timestamp using `chrono` (`String::from` + `println!`) before calling `_exit(0)`. Under heavy traffic, 1 in 10,000 shutdowns hangs permanently at `100%` deadlock until `kill -9` kills it. Explain the exact mechanism of this bug.
::hint
What internal `std`/`libc` locks might the interrupted thread have been holding at the exact microsecond `SIGTERM` arrived?
::solution
Under heavy load, the main thread is often inside `malloc`/`free` (holding `ptmalloc2` arena locks) or `StdoutLock` (holding Rust's `stdout` `ReentrantLock` / mutex) when `SIGTERM` asynchronously preempts it. Jumping directly into `println!` / `String::from` on the same thread tries to acquire those exact same non-reentrant locks—causing a permanent self-deadlock. The fix is writing one byte to a self-pipe/eventfd or setting `AtomicBool::store(true, Release)` in the signal handler, then logging from the normal event loop.
:::

:::exercise practice Choosing `futex` (`Mutex`) vs spinlock (`AtomicBool` loop)
Suppose Thread A holds a lock for **5 milliseconds** while hashing a 4 MiB file, vs **20 nanoseconds** while updating two integer counters on an 8-core CPU. Why does a busy `spin_loop` beat `futex` at 20 ns (sometimes), yet burn huge CPU waste at 5 ms?
::hint
Compare a `~500–2,000 ns` kernel `futex` sleep/wake round-trip against `5,000,000 ns` (`5 ms`) of busy waiting!
::solution
- At **20 ns**: a kernel `futex_wait` + `futex_wake` context switch costs ~1,000–3,000 ns—50× slower than spinning for 20 ns (`hint::spin_loop()`). (Some hybrid mutexes like `parking_lot` spin briefly for a few iterations before calling `futex`!)
- At **5 ms**: spinning burns 100% of a CPU core for 5,000,000 ns doing zero useful work and starving other runnable threads; `futex` puts the waiter cleanly to sleep at 0% CPU so the scheduler runs productive tasks instead.
:::

:::exercise challenge Implementing a cooperative shutdown loop with `AtomicBool`
Write a runnable Rust example with a worker thread checking an `Arc<AtomicBool>` (`Relaxed`/`Acquire` load) and cleanly flushing/breaking when the main controller stores `true` (`Release`), illustrating how `signal-hook`/`ctrlc` drives deterministic RAII cleanup without async-signal hazards.
::hint
Pair `Ordering::Release` on `store(true)` with `Ordering::Acquire` on `load()` (or `Relaxed` when only the single boolean flag itself coordinates loop exit).
::solution
```rust run
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;

fn main() {
    let shutdown = Arc::new(AtomicBool::new(false));
    let ready = Arc::new(AtomicU32::new(0));
    let flag = Arc::clone(&shutdown);
    let ready_worker = Arc::clone(&ready);

    let worker = thread::spawn(move || {
        // Signal main once after one deterministic tick, then wait for shutdown flag:
        ready_worker.store(1, Ordering::Release);
        while !flag.load(Ordering::Acquire) {
            std::hint::spin_loop();
        }
        println!("worker observed shutdown cleanly");
    });

    while ready.load(Ordering::Acquire) == 0 {
        std::hint::spin_loop();
    }
    shutdown.store(true, Ordering::Release);
    worker.join().unwrap();
    println!("main joined worker cleanly");
}
```
```output
worker observed shutdown cleanly
main joined worker cleanly
```

Pairing `Ordering::Release` on `store` with `Ordering::Acquire` on `load` guarantees that every memory write made before the shutdown flag was set is visible to the waking worker thread.
:::

:::recap
- **Hardware interrupts (IRQs)** let slow devices (NICs, NVMe, timers) notify the CPU asynchronously between instructions; **DMA** moves bulk bytes without CPU copy loops.
- **CPU exceptions** (`#PF` page fault, `#DE` divide-by-zero) fire synchronously on an offending instruction; **POSIX signals** (`SIGINT`, `SIGTERM`, `SIGSEGV`) notify processes asynchronously or synchronously via the kernel.
- Linux **`futex`** powers Rust's `Mutex` and `Condvar`: zero-syscall atomic fast paths when uncontended, kernel wait-queue sleep at `0%` CPU when contended.
- Raw Unix signal handlers must stay strictly **async-signal-safe** (e.g. `AtomicBool` or self-pipe/`signalfd`), delegating allocation, logging, and RAII cleanup back to normal threads or async tasks.
:::

:::quiz Check your understanding
? When nobody else holds a `std::sync::Mutex` on Linux, what does `mutex.lock()` execute in user space?
- A full `SYS_futex` syscall entering Ring 0
+ A single atomic compare-and-swap instruction in user space with zero syscalls
- A `fork()` check
- A 1 millisecond busy-wait spin
= `futex`-backed mutexes only enter the kernel on contention; the fast uncontended path finishes entirely in Ring 3 atomics.

? Why can `SIGKILL` (`kill -9`) terminate a deadlocked process immediately even when `SIGTERM` cannot?
- `SIGKILL` runs inside the process's main thread
+ The kernel forbids catching, blocking, or ignoring `SIGKILL` (and `SIGSTOP`)—the kernel tears down the process directly without entering any user handler
- `SIGKILL` clears the `futex` wait queue first
- `SIGKILL` overwrites `.text` with zeros
= `SIGKILL` and `SIGSTOP` are handled directly inside the kernel without giving user space a handler chance.

? Why does calling `println!` or `Vec::push` inside a raw Unix `sigaction` signal handler risk instant deadlock?
- `println!` does not compile in `no_std`
+ The signal may have interrupted the very same thread while it was already holding the allocator or stdout lock
- Signal handlers have a 16-byte stack limit
- Rust drops `Stdout` during signals
= Interrupting a thread mid-`malloc` or mid-`StdoutLock` and re-entering the same non-reentrant lock deadlocks the thread against itself.

? How does DMA (Direct Memory Access) prevent the CPU from wasting cycles during large disk or network reads?
- DMA disables virtual memory completely
+ The device controller writes data straight into physical RAM frames and raises one hardware interrupt (IRQ) only after the entire transfer finishes
- DMA executes Rust closures on the NVMe chip
- DMA runs inside Ring 3 user space
= DMA offloads byte-by-byte transfers from the CPU so cores keep running code while I/O buffers fill in RAM.
:::
