@id kernel-syscalls-processes
@part p6
@kind chapter
@title The Operating System Kernel, Privilege Rings & System Calls
@short Kernel, rings & system calls
@level intermediate
@time 35
@learn Contrast Ring 3 / EL0 user mode with Ring 0 / EL1 kernel mode | Trace the x86-64 syscall instruction (and ARM64 svc #0) step by step including R10 vs RCX | Explain why vDSO turns clock_gettime() into a fast user-space read | Call standard-library and libc OS wrappers cleanly and observe syscall costs

Everything your Rust program touches outside its own registers and already-mapped RAM—files, terminals, sockets, clocks, new threads, new processes, extra heap pages—belongs to the **operating system kernel**. Your binary cannot talk directly to the NVMe controller, overwrite another process's page tables, or disable CPU interrupts. If it tried, the hardware would trap immediately.

The kernel is the single privileged gatekeeper managing shared hardware fairly and safely across all programs running on the machine.

:::analogy Airport terminal vs air-traffic control tower
User-space programs (`Ring 3` on x86-64, `EL0` on ARM64) are passengers inside the terminal: they can walk freely within their assigned gates (their virtual address space) and run instructions at full CPU speed. Only air-traffic control (`Ring 0` / `EL1`, the **[[kernel]]**) can direct planes on the runway (disk controllers, network cards, MMU page tables, and CPU timers). Every time your program needs a runway operation, it steps up to the security window—a **[[system call]]** (`syscall`)—and waits for the kernel to verify permissions and perform the work.
:::

:::compare Privilege levels & hardware capabilities
| Capability | User Space (`Ring 3` / `EL0`) | Kernel Space (`Ring 0` / `EL1`) |
|---|---|---|
| Memory access | Own virtual address space (`CR3`) only | Physical RAM + all process mappings + MMIO device registers |
| Privileged CPU instructions | Forbidden (`#GP` general protection fault on `cli`, `hlt`, `mov cr3`, `in/out`) | Full access (`CR3`, interrupt tables, hardware I/O ports) |
| Scheduling & timers | Cannot preempt other threads | Receives timer interrupts, pauses threads, switches `CR3` |
| Crash blast radius | Process terminates cleanly (`SIGSEGV`); OS and other apps stay alive | **Kernel panic** — entire machine halts |
:::

## Inside the `syscall` instruction (x86-64 vs ARM64)

:::plain Ordinary function call vs system call
An ordinary **`call`** stays inside your own process (Ring 3), jumps to any function address in `.text`, and costs ~1 nanosecond. A **`syscall`** crosses a hardware security wall from Ring 3 user space into Ring 0 [[kernel]] space, jumps only to one fixed kernel gate (`MSR_LSTAR`), swaps stacks, validates every pointer you passed, and costs ~50–300 nanoseconds.
:::

How does a normal user-space function safely enter `Ring 0` without letting user code jump to an arbitrary address inside the kernel?

On x86-64, the hardware provides a dedicated **`syscall`** instruction (and **`svc #0`** on ARM64). Unlike `call`, `syscall` does **not** let user code pick a jump target: the CPU jumps straight to a single fixed kernel entry point stored inside the privileged **`MSR_LSTAR`** register by the kernel at boot!

Watch the exact register protocol on Linux x86-64:

:::note Linux x86-64 syscall ABI vs ordinary C function ABI
```text
Argument slot     C function call (`call`)    Linux `syscall` instruction
-------------------------------------------------------------------------
Number            (none)                      RAX  (e.g. 1 = write, 0 = read, 39 = getpid)
Arg 1             RDI                         RDI
Arg 2             RSI                         RSI
Arg 3             RDX                         RDX
Arg 4             RCX                         R10  <-- NOT RCX! (CPU saves RIP into RCX!)
Arg 5             R8                          R8
Arg 6             R9                          R9
Return value      RAX                         RAX  (negative -4095..-1 = -errno!)
Clobbered by CPU  caller-saved                RCX = user return RIP, R11 = user RFLAGS
```
:::

Look closely at **Row 4 (`R10` instead of `RCX`)**: when the CPU executes `syscall`, the hardware saves the user return address (`RIP`) into **`RCX`** and the user flags (`RFLAGS`) into **`R11`**, flips Current Privilege Level (`CPL`) from `3` to `0`, switches to the kernel's entry trampoline (`entry_SYSCALL_64`), saves all user registers onto the kernel stack, runs `sys_write()` (or whichever syscall index `RAX` names), restores user registers, and executes **`sysretq`** to drop back to Ring 3!

## Why syscalls cost ~50–300+ nanoseconds (and how `vDSO` cheats)

Even an ultra-trivial syscall like `getpid()` takes hundreds of CPU cycles (~50–150 ns, and more under hardware Spectre/Meltdown KPTI page-table isolation) because of saving/restoring registers, validating parameters, crossing Ring 3 <-> Ring 0, and checking kernel permissions.

For ultra-frequent read-only syscalls like `Instant::now()` (`clock_gettime`), Linux avoids the kernel transition using **[[vDSO|vdso]]** (Virtual Dynamic Shared Object). Remember `[vdso]` in `/proc/self/maps` and `AT_SYSINFO_EHDR` in `auxv`? The kernel maps one **read-only shared memory page** containing the current monotonic clock tick counter and a small lookup function directly into every user process. Calling `Instant::now()` reads that shared page right in Ring 3—turning a ~100 ns kernel transition into a **~10–15 ns user-space memory read**.

```rust run nocmp
use std::process;
use std::time::Instant;

fn main() {
    let pid = process::id(); // wraps getpid()
    let t0 = Instant::now(); // uses Linux vDSO clock_gettime(CLOCK_MONOTONIC)
    let mut acc = 0_u64;
    for i in 0..10_000 {
        acc = acc.wrapping_add(i);
    }
    let dt = t0.elapsed();
    println!("pid={pid}, sum={acc}, elapsed={} ns", dt.as_nanos());
}
```

## Error codes at the kernel boundary: `-errno` -> `std::io::Error`

At the Linux syscall boundary, there is no `Result<T, E>` enum. `sys_open` or `sys_read` simply returns a single signed 64-bit integer in `RAX`:

- `>= 0`: success (e.g., byte count read, or new file descriptor number `3`).
- `-4095 ..= -1`: failure. The negated number is **`errno`** (`-ENOENT = -2` missing file, `-EACCES = -13` permission denied, `-EAGAIN = -11` try again on non-blocking socket).

`libc` translates `-errno` into `-1` and stores the positive error code in thread-local `errno`; Rust's `std::io::Error::last_os_error()` reads that `errno` and turns it into ergonomic `Result<T, std::io::Error>` (`ErrorKind::NotFound`, `PermissionDenied`, `WouldBlock`).

## User-space kernel interfaces on Linux: `/proc`, `/sys`, and `syscall` wrappers

Besides direct syscalls (`read`, `write`, `openat`, `mmap`, `futex`, `epoll_wait`, `io_uring_enter`), Linux exposes rich live kernel state as virtual files inside `/proc` and `/sys`—reading `/proc/self/status` or `/proc/cpuinfo` uses ordinary `openat` + `read` syscalls to read live kernel data structures formatted on the fly!

```rust run nocmp
use std::fs;

fn main() {
    if let Ok(status) = fs::read_to_string("/proc/self/status") {
        for line in status.lines().filter(|l| {
            l.starts_with("Name:")
                || l.starts_with("Pid:")
                || l.starts_with("PPid:")
                || l.starts_with("Threads:")
                || l.starts_with("VmRSS:")
                || l.starts_with("voluntary_ctxt_switches:")
        }) {
            println!("{line}");
        }
    }
}
```

Look at those fields straight from the kernel's `task_struct` for your running Rust binary: process name, `Pid`, parent `PPid`, thread count, physical memory `VmRSS`, and exact voluntary context switches!

:::details Monolithic kernels (Linux) vs Microkernels (seL4, Fuchsia, Redox)
- **Monolithic kernel (Linux, BSD, Windows NT kernel):** Virtual memory, process scheduler, network TCP/IP stack, ext4 file systems, and device drivers all live inside Ring 0 kernel space. Calling between VFS, TCP, and NVMe driver is a fast function call, at the price of a larger trusted Ring 0 codebase.
- **Microkernel (seL4, Minix 3, Redox OS in Rust):** Only IPC messaging, minimal thread scheduling, and address-space mapping live in Ring 0; file systems, network stacks, and drivers run as isolated Ring 3 user-space servers—crashing a driver restarts one server instead of panicking the whole machine, at the price of extra IPC context switches.
:::

:::exercise guided Reading kernel return values (`RAX` -> `io::Error`)
Suppose a raw Linux x86-64 `openat` syscall returns `-2` (`0xfffffffffffffffe`) in `RAX` on one call and `3` in `RAX` on the next call. What does each value mean to `libc` and Rust's `std::fs::File::open`?
::hint
Negative values in `-4095..=-1` negate to POSIX `errno` (`2` is `ENOENT`), while non-negative integers on `openat` are file descriptors!
::solution
- `-2` -> `errno = 2` (`ENOENT`, No such file or directory) -> `File::open` returns `Err(ErrorKind::NotFound)`.
- `3` -> success! File descriptor `3` (right after `0=stdin`, `1=stdout`, `2=stderr`) wrapped inside `Ok(File)`.
:::

:::exercise practice Counting syscalls in a tight `read` loop vs buffered reading
Suppose you read a 1 MiB file 1 byte at a time using unbuffered `File::read(&mut [0u8; 1])` vs wrapping it in `BufReader::new(file)` (8 KiB internal buffer). Roughly how many `read` syscalls does each perform, and why?
::hint
Divide `1,048,576` bytes by `1` vs `8,192`!
::solution
- Unbuffered 1-byte `File::read`: **1,048,576** Ring 3 -> Ring 0 `read()` syscalls! Even at 100 ns each, syscall overhead alone exceeds `100 ms`.
- `BufReader::new(file)`: **128** `read()` syscalls (`1,048,576 / 8,192`), filling an 8 KiB user-space buffer per kernel crossing—often **50×–100× faster**!
:::

:::exercise challenge Why does Linux x86-64 pass argument 4 of `syscall` in `R10` instead of `RCX`?
Explain the exact hardware conflict that makes `RCX` unusable for user argument 4 across the `syscall` boundary, and trace what happens during `syscall` -> `sysretq`.
::hint
Remember which two architectural registers the `syscall` opcode itself overwrites unconditionally before jumping to `MSR_LSTAR`!
::solution
The x86-64 `syscall` instruction uses **`RCX`** to save the next user-space instruction pointer (`RIP`) so **`sysretq`** knows where in Ring 3 to return (and **`R11`** to save `RFLAGS`). Because `syscall` immediately overwrites `RCX`, any argument placed in `RCX` would be destroyed at entry! Therefore the Linux kernel ABI moves the 4th argument from `RCX` into **`R10`**.
:::

:::recap
- CPUs enforce hardware isolation between **Ring 3 (`EL0`) user space** and **Ring 0 (`EL1`) kernel space**; user code enters the kernel exclusively through **`syscall`** (`svc #0` on ARM64) at fixed kernel entry points (`MSR_LSTAR`).
- On Linux x86-64, `RAX` carries the syscall number and returns `>= 0` or `-errno`; `R10` replaces `RCX` for arg 4 because `syscall` saves return `RIP` in `RCX`.
- **`[vdso]`** shares read-only kernel clock/state pages into user space so `Instant::now()` avoids expensive privilege switches.
- Minimising syscall frequency (via `BufReader` / `BufWriter` / batching) is one of the biggest real-world performance levers in systems code.
:::

:::quiz Check your understanding
? Why can user-space Rust code not jump straight to an internal kernel helper function using a normal `call` instruction?
- Rust forbids calling C functions without `extern "C"`
+ Page-table supervisor bits and privilege-level hardware (`Ring 3` vs `Ring 0`) trigger a hardware fault unless entered through a controlled gate like `syscall`
- ASLR hides the kernel from user space completely
- Kernel functions use 128-bit registers
= Hardware protection keeps Ring 0 kernel pages unreadable/unexecutable from Ring 3; only controlled traps (`syscall` / interrupts) elevate privilege to fixed entry handlers.

? In the Linux x86-64 `syscall` ABI, which register holds the syscall number at entry and the return code (or `-errno`) on exit?
- `RDI`
+ `RAX`
- `R10`
- `RSP`
= `RAX` carries the syscall index into the kernel dispatch table and returns either the non-negative result or negated `-errno`.

? How does `std::time::Instant::now()` on modern Linux usually run in ~15 ns without trapping into Ring 0?
- It estimates elapsed time by counting `loop` iterations
+ It calls a kernel-provided function mapped into user space via the read-only `[vdso]` page
- It caches the startup time from `auxv`
- The compiler evaluates `Instant::now()` at compile time
= Linux's `[vdso]` maps live read-only timing pages directly into every process so `clock_gettime` completes safely in Ring 3.

? If a `sys_read` call returns `-11` (`-EAGAIN`) in `RAX`, how does Rust's `std::fs` or `std::net` surface it?
- By panicking immediately
+ As `Err(io::Error)` with `ErrorKind::WouldBlock`
- As `Ok(0)` meaning EOF
- By blocking the entire OS thread inside `libc`
= Negative return values `-1..-4095` translate to POSIX `errno` (`EAGAIN` = 11 -> `ErrorKind::WouldBlock`).
:::
