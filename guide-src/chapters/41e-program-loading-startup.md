@id program-loading-startup
@part p5
@kind chapter
@title Program Loading, Dynamic Linking & Startup Before main()
@short Program loading & startup
@level intermediate
@time 35
@learn Trace execve() from shell fork() into the Linux kernel ELF loader | Understand ld-linux, PT_INTERP, GOT/PLT lazy symbol resolution, and ASLR | Inspect argc, argv, envp, and auxv placed on the initial stack | Follow Rust's crt0 / std::rt::lang_start_internal execution before your fn main() runs

Running `./hello` starts several layers before Rust calls your `main`: the shell creates a process, the Linux kernel loads the executable, and—when dynamically linked—the dynamic loader prepares its shared libraries. Runtime startup code then calls the program's entry point. The exact path depends on the binary, target and build options; [object files, linking and ELF](#linking-elf) introduces the file format involved.

:::analogy Opening night at a theatre
A play does not begin when the lead actor speaks line one. First the stage manager unlocks the theatre (`execve`), turns on the stage lights and props (`mmap` of `.text`, `.rodata`, `.data`), hires external musicians (`ld-linux` loading `libc.so.6`), checks safety alarms (`stack canary` and `guard pages`), and cues the stagehand (`lang_start`)—only *then* does `fn main()` walk onto the stage.
:::

:::compare Static Rust executable vs Dynamically linked executable
| Property | Default `x86_64-unknown-linux-gnu` | Fully static `x86_64-unknown-linux-musl` (`-C target-feature=+crt-static`) |
|---|---|---|
| Dynamic linker (`PT_INTERP`) | Present (`/lib64/ld-linux-x86-64.so.2`) | Absent (kernel jumps straight to `_start` in the binary) |
| Shared libraries (`ldd`) | Depends on `libc.so.6`, `libm.so.6`, etc. | `not a dynamic executable` — zero external `.so` files |
| Memory footprint | Shares one physical copy of `libc.so.6` code pages across all processes | Slightly larger binary; self-contained |
| Portability across Linux distros | Tied to minimum `glibc` version | Runs anywhere on any Linux kernel (`scratch` containers!) |
:::

## Step 1: `fork()` + `execve()` and kernel ELF loading

:::plain Why does starting a program take two system calls (`fork` + `execve`)?
On Unix and Linux, creating a new process and loading a new program file are deliberately separate steps. **`fork()`** clones the shell process (giving the child a chance to redirect `stdin`/`stdout` pipes or change directories first), and **`execve()`** replaces the child's memory with the new [[ELF]] binary while keeping those open file descriptors intact.
:::

When your shell runs `./hello`:

1. The shell calls `fork()` (or `clone()`), creating a child process sharing read-only [[copy-on-write]] pages.
2. The child immediately calls the `execve("./hello", argv, envp)` [[system call]]; what happens inside that call is in [kernel, system calls and processes](#kernel-syscalls-processes).
3. The Linux [[kernel]]'s ELF binary loader (`fs/binfmt_elf.c`) opens `./hello`, verifies the `7f 45 4c 46` magic bytes (`\x7fELF`), reads its `PT_LOAD` program headers, tears down the child's old address space, and maps `.text` (`R+X`), `.rodata` (`R`), and `.data`/`.bss` (`R+W`) at [[ASLR]]-randomised virtual addresses — the map you can read back in `/proc/self/maps`, as [virtual memory](#virtual-memory-address-spaces) shows.
4. Before transferring control to user space, the kernel builds a clean initial user [[stack]] holding command-line arguments, environment variables, and kernel metadata:

```text
High virtual addresses (top of [stack] VMA)
  +----------------------------------------------------------+
  | Raw NUL-terminated strings: "./hello\0", "PATH=/usr...\0"|
  +----------------------------------------------------------+
  | auxv[] pairs: (AT_PAGESZ, 4096), (AT_RANDOM, ptr),       |
  |               (AT_ENTRY, _start), (AT_NULL, 0)           |
  +----------------------------------------------------------+
  | envp[]: pointers to environment strings, ended by NULL   |
  +----------------------------------------------------------+
  | argv[]: pointers to argument strings, ended by NULL      |
  +----------------------------------------------------------+
  | argc  : integer argument count (e.g. 1)                  | <-- initial RSP!
  +----------------------------------------------------------+
Low virtual addresses (stack grows downward from RSP)
```

That **`auxv` (Auxiliary Vector)** block lets the kernel hand facts directly to user space without extra startup syscalls: `AT_PAGESZ` (`4096`), `AT_RANDOM` (16 cryptographically random bytes used to seed stack canaries and `HashMap`'s SipHash), `AT_ENTRY` (the binary's true `_start` address), and `AT_SYSINFO_EHDR` (the [[vDSO|vdso]] virtual page).

## Step 2: `PT_INTERP` and `ld-linux-x86-64.so.2`

If the ELF file declares a `PT_INTERP` header pointing to `/lib64/ld-linux-x86-64.so.2`, the kernel maps the dynamic linker too and starts the CPU instruction pointer (`RIP`) inside `ld-linux`'s `_start`, *not* inside `./hello`! (`PT_INTERP` is one of the program headers described in [linking and ELF](#linking-elf).)

`ld-linux` performs four essential tasks before entering your program:
1. **Loads shared libraries:** Reads `.dynamic` (`DT_NEEDED` entries like `libc.so.6`), searches `/etc/ld.so.cache` and `/lib`, and `mmap`s each shared library into the process's virtual address space.
2. **Relocations & GOT/PLT wiring:** Because ASLR randomises where `libc.so.6` lands every run, calls to `malloc`, `write`, or `pthread_mutex_lock` cannot hardcode fixed addresses inside `.text` (remember `.text` is read-only!). Instead, `.text` calls through a tiny trampoline in **`.plt`** (Procedure Linkage Table) that jumps via an entry in **`.got`** (Global Offset Table, in writable memory). `ld-linux` patches `.got` with the true runtime addresses!
3. **RELRO protection:** Under **Full RELRO** (`-Wl,-z,relro,-z,now`), `ld-linux` resolves every GOT symbol upfront before `main` and flips the GOT's virtual page flags to read-only (`r--p`) so exploits cannot overwrite GOT function pointers!
4. **TLS & constructors:** Allocates Thread-Local Storage (`FS` segment base on x86-64) and runs any `.init_array` constructors.

:::note Who calls whom before fn main()
```text
Kernel execve() ──► ld-linux _start
                        │ (loads libc.so.6, resolves relocations, applies RELRO)
                        ▼
                    binary _start (crt1.o)
                        │ (aligns RSP, sets up argc/argv/envp, calls __libc_start_main)
                        ▼
                    glibc __libc_start_main
                        │ (initialises libc stdin/stdout, stack canary, .init_array)
                        ▼
                    C shim main(argc, argv)  [generated by rustc]
                        │
                        ▼
                    std::rt::lang_start_internal
                        │ (saves args, checks SIGPIPE, installs panic/stack-overflow guard)
                        ▼
                    your crate::main()
```
:::

## Step 3: Inside `std::rt::lang_start` (what Rust sets up for you)

Even in Rust, `_start` starts in C runtime startup (`crt1.o`) unless you pass `#![no_main]`. Why does Rust keep a tiny startup wrapper between `__libc_start_main` and your `fn main()`?

Inside Rust's `std::rt::lang_start_internal`, the standard library runs several quiet safeguards before invoking your `main`:

- **Stores `argc`/`argv`:** So `std::env::args()` works anywhere in your program without taking parameters on `fn main()`.
- **Resets `SIGPIPE` handling:** On Unix, writing to a closed pipe (e.g., `mytool | head -n 1`) sends `SIGPIPE`, which normally kills a process silently. Rust ignores `SIGPIPE` by default so broken pipes surface cleanly as `Err(ErrorKind::BrokenPipe)` rather than abrupt process death.
- **Registers main-thread guard/stack-overflow handlers:** Sets up an alternate signal stack (`sigaltstack`) so a stack overflow prints a readable message instead of crashing silently when the normal stack hits its [[guard page]].
- **Handles `Result` return codes (`Termination` trait):** Because `fn main() -> Result<(), E>` implements `Termination`, `lang_start` turns `Ok(())` into exit code `0` and `Err(e)` into printing `Error: ...` to `stderr` plus exit code `1`.

## Inspecting arguments, environment, and stack pointers at runtime

You can inspect parts of that startup state right from ordinary Rust code:

```rust run nocmp
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    let var_count = env::vars_os().count();
    let probe = 0_u64;

    println!("argc = {}", args.len());
    println!("argv[0] = {:?}", args.first());
    println!("env var count = {var_count}");
    println!("stack probe inside main = {:p}", &probe);
}
```

## Bypassing libc/std startup with `#![no_main]`

Knowing what runs before `main()` demystifies why embedded firmware, kernels, and tiny freestanding binaries write `#![no_std]` and `#![no_main]` and export `#[unsafe(no_mangle)] pub extern "C" fn _start() -> !`. Without `std::rt`, you become responsible for stack alignment, zeroing `.bss`, reading `argc`/`argv`, and calling the `exit` syscall explicitly—if `_start` ever returns instead of invoking `exit`, the CPU pops garbage off the empty stack and crashes!

:::exercise guided Tracing startup order
Put these six startup events into exact chronological order from shell command to your code:
`A. std::rt::lang_start_internal sets SIGPIPE & captures args` | `B. Kernel execve maps ELF PT_LOAD segments` | `C. ld-linux loads libc.so.6 & patches GOT` | `D. Your fn main() executes` | `E. __libc_start_main runs .init_array` | `F. Shell calls fork()`
::hint
Start in the parent shell, enter the kernel, enter the dynamic linker, enter libc init, enter Rust std init, and finish in user code.
::solution
`F` (Shell `fork()`) -> `B` (Kernel `execve` maps ELF & builds `auxv` stack) -> `C` (`ld-linux` loads shared libs & resolves GOT) -> `E` (`__libc_start_main` initialises libc & `.init_array`) -> `A` (`std::rt::lang_start_internal`) -> `D` (`fn main()`).
:::

:::exercise practice Inspecting `SIGPIPE` and `Termination` behaviour
Write a Rust program whose `main()` returns `Result<(), &'static str>` and verify how `Termination` handles both `Ok(())` and `Err(...)`, without calling `std::process::exit` manually.
::hint
Remember `fn main() -> Result<(), Box<dyn std::error::Error>>` uses `std::process::Termination` inside `std::rt::lang_start` to map `Ok(())` -> `ExitCode::SUCCESS` (`0`) and `Err` -> `ExitCode::FAILURE` (`1`).
::solution
```rust run
use std::process::{ExitCode, Termination};

fn simulate_main(ok: bool) -> u8 {
    let res: Result<(), &'static str> = if ok { Ok(()) } else { Err("bad config") };
    // Termination::report() prints errors to stderr when Err and returns ExitCode.
    if res.is_ok() {
        let _code: ExitCode = res.report();
        0
    } else {
        1
    }
}

fn main() {
    println!("Ok exit code = {}", simulate_main(true));
    println!("Err exit code = {}", simulate_main(false));
}
```
```output
Ok exit code = 0
Err exit code = 1
```
When real `fn main() -> Result<...>` returns, `lang_start` calls `.report()` internally and passes the resulting status code to `exit(status)`.
:::

:::exercise challenge Why can `.text` call `malloc` under ASLR without rewriting code pages?
Explain step by step how **GOT** (Global Offset Table) and **PLT** (Procedure Linkage Table) let read-only `.text` (`r-xp`) jump to `malloc` inside `libc.so.6` even though `libc.so.6` moves to a random virtual address on every launch.
::hint
`.text` contains a PC-relative (`RIP`-relative) jump into `.plt`, which performs an indirect jump reading an 8-byte pointer stored in writable `.got`!
::solution
1. At compile time, the linker sets up a tiny stub in `.plt` (in `r-xp` memory) and an 8-byte slot in `.got` (in writable memory, later hardened read-only under Full RELRO).
2. Calls in `.text` jump to `malloc@plt` using a fixed **relative offset** (`RIP + const`), so `.text` itself never needs modifying and stays `r-xp` (and shared across processes!).
3. At startup (or lazily on first call), `ld-linux` computes where `libc.so.6`'s `malloc` landed under ASLR and writes that runtime virtual address into the `.got` slot.
4. `malloc@plt` reads `*[GOT_slot]` and jumps straight to the real `malloc`.
:::

:::recap
- Typing a command triggers **`fork()` + `execve()`**, where the Linux kernel verifies the ELF magic, maps `PT_LOAD` segments, and places `argc`, `argv`, `envp`, and **`auxv`** on the initial stack.
- For dynamically linked binaries, **`ld-linux`** starts first (`PT_INTERP`), loads shared libraries like `libc.so.6`, resolves **GOT/PLT** entries, and locks down **RELRO**.
- **`__libc_start_main`** and **`std::rt::lang_start_internal`** prepare `env::args()`, `SIGPIPE`, stack-overflow guards, and `Termination` exit codes before entering `fn main()`.
:::

:::quiz Check your understanding
? Where do `std::env::args()` and `std::env::vars()` obtain the command-line arguments and environment variables on Linux?
- By reading `/proc/self/stat` inside `env::args()`
+ From `argc`, `argv`, and `envp` pushed onto the initial stack by the kernel during `execve()`, saved by `std::rt` before `main()`
- Via a network socket to the shell parent process
- Compiled directly into `.rodata`
= The Linux kernel places `argc`, `argv`, `envp`, and `auxv` onto the initial user stack during `execve()`, and `lang_start_internal` captures them for `std::env`.

? What does the `AT_RANDOM` entry in the kernel's `auxv` vector supply at process startup?
- The ASLR offset of `.text`
+ 16 cryptographically random bytes from the kernel used to initialise stack canaries and `HashMap` seed hashes
- The PID of the shell parent
- The total RAM size in pages
= `AT_RANDOM` avoids an extra startup syscall by handing 16 fresh random bytes right on the initial stack.

? Why does Rust's runtime reset `SIGPIPE` to ignored by default?
- So processes never exit on errors
+ So writing to a closed pipe (like `cmd | head -n 1`) returns a normal `BrokenPipe` `std::io::Error` instead of abruptly terminating the process
- Because Linux kernels forbid `SIGPIPE` in 64-bit mode
- To prevent `println!` from flushing buffers
= Ignoring `SIGPIPE` lets Rust surface pipe closures via `Result` cleanly rather than killing the binary unexpectedly.

? Why must `_start` in a freestanding `#![no_main]` binary end in an `exit` syscall instead of `return`?
- Rust forbids functions returning `()`
+ Nothing called `_start` on a normal stack frame—there is no valid return address above `_start` on the initial stack
- `return` is only valid in C++
- `_start` executes inside the kernel
= The initial user stack holds `argc`, not a caller return address; returning from `_start` jumps into garbage and segfaults.
:::
