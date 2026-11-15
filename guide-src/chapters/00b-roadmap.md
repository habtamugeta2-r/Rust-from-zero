@id roadmap
@part welcome
@kind orientation
@title Complete Learning Roadmap
@short Learning roadmap
@level all
@time 15
@learn Navigate the entire computer systems and Rust internals curriculum | Trace conceptual dependencies from hardware up to distributed services | See how every chapter maps to practical Linux and Rust experiments

This roadmap is the central table of contents for the entire guide. It maps every **Part**, **Chapter**, **Subchapter**, **Topic covered**, **Learning objective**, **Chapter dependency**, and **Practical experiment** in strict conceptual order—so no advanced mechanism is ever used before its foundation is built.

## How the Full Stack Connects

Every program you write travels through the same ten-stage chain of reality:

```text
Source Code (.rs)
   │
   ▼  Part II · Lexing → Parsing → AST → HIR → MIR → LLVM IR → Assembly → Machine Code → Linking (ELF)
Executable Binary on Disk
   │
   ▼  Part V · fork/execve → ELF Loader → ld-linux.so → Virtual Address Space → _start → main()
Running Process in Virtual Memory (Part IV)
   │
   ├──▶ Part III · Stack Slots, Heap Buffers, Drop Glue, Generics, Vtables, Safety Invariants
   ├──▶ Part VIII · CPU Decode, Pipelines, Branch Prediction, Out-of-Order, Caches, Atomics, SIMD
   ├──▶ Part VI · User Space ↔ Kernel Space (syscall), Scheduler, Futexes, Interrupts, Signals
   └──▶ Part VII / X / XI · VFS, Page Cache, Sockets, TCP/IP, Storage Blocks, TTY & NIC Hardware
```

:::key Using this roadmap
Read the parts in numerical order if you want the complete computer-systems story from transistors to TCP/IP and Linux systems tooling. If you want a focused route instead, check the route filters on the [home page](#home) or [chapter 0](#start).
:::

---

## Part I — Understanding Computers from the Inside

**Core question:** *What physically exists inside a computer, and how do electricity and memory hold both data and instructions?*

- **Chapters in this part:**
  1. [Computers, Programs, and Why Rust Exists](#what-is-rust)
  2. [Inside the Machine: CPU, Registers, ALU, Memory, and Buses](#hardware-architecture)
  3. [Bits, Bytes, Binary, Hex, and Data and Instruction Representation](#bits-bytes-representation)
  4. [Setting Up Rust and Linux Inspection Tools](#setup)

### Chapter 1 — Computers, Programs, and Why Rust Exists
- **Subchapters:** What a program actually is; Hardware vs software; High-level languages, compilers, and interpreters; Why Rust guarantees memory safety without a garbage collector; How the ten-layer execution journey unfolds.
- **Topics covered:** Programs as instruction sequences, compilation vs interpretation, manual memory management vs garbage collection vs ownership, safety + speed without runtime GC pauses.
- **Learning objectives:** Explain what a computer program is at the machine level; compare compiled and interpreted execution; articulate why Rust prevents memory errors at compile time.
- **Dependencies:** None (entry point).

### Chapter 2 — Inside the Machine: CPU, Registers, ALU, Memory, and Buses
- **Subchapters:** Stored-program architecture; Inside the CPU (Control Unit, ALU, Program Counter, Instruction Register, general-purpose registers); Main memory vs storage (SRAM, DRAM, ROM/firmware, SSD, HDD); System buses (address, data, control); Hardware clock and fetch-decode-execute cycle.
- **Topics covered:** Von Neumann vs split L1 Harvard caches, clock cycles, register latency vs RAM vs NVMe SSD vs HDD, memory controller, PCIe/system bus transfers.
- **Learning objectives:** Diagram how CPU, caches, RAM, buses, and storage interact; trace one fetch-decode-execute cycle; explain orders-of-magnitude latency differences across storage tiers.
- **Dependencies:** [Computers, Programs, and Why Rust Exists](#what-is-rust).

### Chapter 3 — Bits, Bytes, Binary, Hex, and Data and Instruction Representation
- **Subchapters:** Transistors and voltage thresholds; Positional binary and hexadecimal; Signed integers and two's complement; Floating-point IEEE-754 layout; UTF-8 text encoding; Endianness (little vs big endian); Machine instructions as numbers in memory.
- **Topics covered:** Base-2/base-16 conversions, two's complement negation and overflow, IEEE-754 sign/exponent/mantissa fields, UTF-8 byte prefixes, little-endian x86-64 byte ordering, opcode bit fields.
- **Learning objectives:** Convert freely between decimal, binary, and hex; inspect raw memory bytes of integers, floats, and UTF-8 strings; explain why instructions and data share memory as raw bytes.
- **Dependencies:** [Inside the Machine: CPU, Registers, ALU, Memory, and Buses](#hardware-architecture).

### Chapter 4 — Setting Up Rust and Linux Inspection Tools
- **Subchapters:** Installing `rustup`, `rustc`, and `cargo`; Creating and running your first project; Installing Linux inspection utilities (`objdump`, `readelf`, `nm`, `strace`, `gdb`/`rust-gdb`, `lldb`); Project layout and Cargo build artefacts.
- **Topics covered:** Toolchain setup across OSes, `cargo new` / `cargo build` / `cargo run`, verifying ELF inspection tools on Linux, compiler error anatomy.
- **Learning objectives:** Install and verify a working Rust 2024 toolchain; compile and run a program from the terminal; verify availability of binary inspection tools.
- **Dependencies:** [Bits, Bytes, Binary, Hex, and Data and Instruction Representation](#bits-bytes-representation).

**Practical experiments for Part I:**
- Probe live CPU core counts, cache line sizes, and memory totals via Linux `/proc/cpuinfo`, `/proc/meminfo`, `lscpu`, and `std::thread::available_parallelism`.
- Write a Rust byte-inspector printing `to_le_bytes()`, `to_be_bytes()`, `f32::to_bits()`, and UTF-8 hex dumps for signed negative integers, floats, and Unicode text.

---

## Part II — From Source Code to Machine Instructions

**Core question:** *How does `rustc` turn plain UTF-8 source text into machine instructions, object files, and an executable binary?*

- **Chapters in this part:**
  1. [Compiler Stages: Lexing, Parsing, AST, HIR, MIR, and LLVM IR](#compilation-pipeline)
  2. [Code Generation, Assembly Language, and Machine Code](#assembly-machine-code)
  3. [Object Files, Linking, and ELF Executables](#linking-elf)

### Chapter 5 — Compiler Stages: Lexing, Parsing, AST, HIR, MIR, and LLVM IR
- **Subchapters:** Source text as raw bytes; Lexical analysis (tokens); Parsing and Abstract Syntax Trees (AST); Macro expansion and name resolution; HIR and type checking; MIR, control-flow graphs, and borrow checking; LLVM IR and target-independent optimisation passes.
- **Topics covered:** High-level vs low-level languages, ahead-of-time compilation vs JIT vs interpretation, compiler front-end/middle-end/back-end, `rustc --emit=mir,llvm-ir`.
- **Learning objectives:** Trace a Rust function through every IR stage; distinguish AST, HIR, MIR, and LLVM IR; explain why Rust runs borrow checking on MIR before passing IR to LLVM.
- **Dependencies:** Part I ([Setting Up Rust and Linux Inspection Tools](#setup)).

### Chapter 6 — Code Generation, Assembly Language, and Machine Code
- **Subchapters:** From LLVM IR to target instructions; Instruction selection, register allocation, and scheduling; Reading x86-64 (Intel syntax) and ARM64 assembly; Mnemonics, operands, addressing modes, and flags; Assembling mnemonics into variable-length and fixed-width machine bytes.
- **Topics covered:** Virtual vs physical registers, immediate/register/memory operands, `mov`/`add`/`lea`/`call`/`ret`, encoding opcodes into bytes.
- **Learning objectives:** Read basic x86-64 and ARM64 assembly generated by `rustc --emit=asm`; match source arithmetic to machine instructions and hex opcodes via `objdump -d -M intel`.
- **Dependencies:** [Compiler Stages](#compilation-pipeline), [Bits and Bytes](#bits-bytes-representation).

### Chapter 7 — Object Files, Linking, and ELF Executables
- **Subchapters:** Inside an object file (`.o` and `.rlib`); ELF sections (`.text`, `.rodata`, `.data`, `.bss`, `.symtab`, `.rela.*`); Symbol resolution and relocations; Static linking (`ar`) vs dynamic linking (`.so`, PLT, GOT, `ld-linux`); ELF program headers vs section headers; Inspecting compiled Rust binaries end-to-end.
- **Topics covered:** Linker responsibilities, dead-code section stripping (`--gc-sections`), static PIE vs shared libraries, `readelf`, `nm`, `ldd`, `size`.
- **Learning objectives:** Explain why object files cannot run before linking; contrast static and dynamic linking tradeoffs; inspect ELF headers, segments, and mangled symbols in real Rust outputs.
- **Dependencies:** [Code Generation, Assembly Language, and Machine Code](#assembly-machine-code).

**Practical experiments for Part II:**
- Run `rustc --emit=mir,llvm-ir,asm` and `rustc --emit=obj` on a small Rust module and compare `-C opt-level=0` vs `-C opt-level=3` output.
- Inspect the compiled binary with `objdump -d -M intel`, `readelf -h -S -l -s`, `nm -C`, and `ldd` to locate `.text`, `.rodata`, `main`, and libc dynamic imports.

---

## Part III — Rust Language and Compiler Internals

**Core question:** *How does every Rust language construct—variables, ownership, traits, smart pointers, and `unsafe`—map to bytes, stack frames, compiler checks, and machine code?*

This part is structured across four progressive sub-tracks:

### Sub-track 3A · Core Syntax, Control Flow, and Ownership Memory Model
- **[Variables: giving names to values](#variables)** *(Dependencies: Part II)* — `let`, `let mut`, shadowing, scopes, constants, and how local bindings lower to stack slots and SSA registers.
- **[Basic data types](#types)** *(Dependencies: [Variables](#variables))* — Integer widths, signed/unsigned overflow, IEEE-754 floats, `bool`, `char`, tuples, arrays, and machine bit patterns.
- **[Functions](#functions)** *(Dependencies: [Types](#types))* — Parameters, expressions vs statements, early `return`, stack-frame preview, and inlining.
- **[Control flow](#control-flow)** *(Dependencies: [Functions](#functions))* — `if`/`else`, `match`, `loop`/`while`/`for`, and how branches lower to compare-and-jump machine instructions.
- **[Project: a number guessing game](#project-guessing)** *(Dependencies: [Control flow](#control-flow))* — Interactive CLI loop combining I/O, parsing, ordering, and error handling.
- **[Stack and heap memory](#memory)** *(Dependencies: [Control flow](#control-flow), Part I)* — Stack pointer bumping vs heap allocation requests and frame lifetimes.
- **[Ownership](#ownership)** *(Dependencies: [Stack and heap memory](#memory))* — Move semantics as shallow bitwise copies, `Copy` vs drop, compile-time ownership tracking, and drop flags.
- **[References and borrowing](#borrowing)** *(Dependencies: [Ownership](#ownership))* — `&T` and `&mut T` as non-null aligned addresses plus LLVM `noalias` aliasing invariants.
- **[Strings and slices](#slices-strings)** *(Dependencies: [References and borrowing](#borrowing))* — UTF-8 validation, `(ptr, len)` fat pointers for `&str`/`&[T]`, and `(ptr, len, cap)` heap ownership for `String`.

### Sub-track 3B · Compound Data, Modules, Errors, and Polymorphism
- **[Structs and methods](#structs)** *(Dependencies: [Strings and slices](#slices-strings))* — Field aggregation, partial moves, `self` parameter desugaring.
- **[Enums, `Option`, and `match`](#enums)** *(Dependencies: [Structs](#structs))* — Tagged unions, discriminant bytes, exhaustiveness, and `Option<&T>` niche optimisation.
- **[Pattern matching in depth](#patterns)** *(Dependencies: [Enums](#enums))* — Destructuring, refutability, binding modes, and compiler decision trees.
- **[Collections](#collections)** *(Dependencies: [Enums](#enums))* — `Vec<T>` geometric growth, `HashMap` SwissTable buckets and control bytes, `HashSet`, ownership in containers.
- **[Project: a to-do list for the terminal](#project-todo)** *(Dependencies: [Collections](#collections))* — Persistent file-backed task manager.
- **[Modules, crates, and packages](#modules)** *(Dependencies: [Collections](#collections), [Linking and ELF](#linking-elf))* — Privacy boundaries, compilation units (`.rlib`), and Rust symbol mangling.
- **[Error handling](#errors)** *(Dependencies: [Modules](#modules))* — Recoverable `Result<T, E>` discriminant returns vs panic unwinding (`.eh_frame`) and abort.
- **[Generics](#generics)** *(Dependencies: [Error handling](#errors))* — Parametric polymorphism and compile-time monomorphisation vs binary size and instruction cache.
- **[Traits](#traits)** *(Dependencies: [Generics](#generics))* — Static dispatch (`impl Trait`) vs dynamic dispatch (`dyn Trait` fat pointers and vtables).
- **[Lifetimes](#lifetimes)** *(Dependencies: [Traits](#traits))* — Region parameters `'a`, elision rules, MIR Non-Lexical Lifetimes (NLL), and zero runtime footprint.
- **[Testing your code](#testing)** *(Dependencies: [Lifetimes](#lifetimes))* — Unit/integration/doc tests compiled via `rustc --test`.
- **[Project: a file search tool](#project-search)** *(Dependencies: [Testing](#testing))* — Library + binary crate architecture with streaming search.

### Sub-track 3C · Functional Abstractions, Smart Pointers, and Type Mastery
- **[Closures](#closures)** *(Dependencies: [Lifetimes](#lifetimes))* — Compiler-generated anonymous capture structs and `Fn`/`FnMut`/`FnOnce` desugaring.
- **[Iterators](#iterators)** *(Dependencies: [Closures](#closures))* — Lazy state-machine structs and LLVM zero-cost loop vectorisation.
- **[Project: a sales report from raw data](#project-report)** *(Dependencies: [Iterators](#iterators))* — Streaming CSV-like aggregation without intermediate heap allocations.
- **[Smart pointers](#smart-pointers)** *(Dependencies: [Ownership](#ownership), [Traits](#traits))* — `Box<T>`, `Deref` coercion, `Drop` destructor order, `Rc<T>`/`Weak<T>`, and `Cell`/`RefCell` interior mutability.
- **[Traits in depth](#advanced-traits)** *(Dependencies: [Smart pointers](#smart-pointers))* — Associated types, GATs, operator traits, object safety, and `Sized`/`Send`/`Sync` markers.
- **[The type system as a design tool](#type-system)** *(Dependencies: [Traits in depth](#advanced-traits))* — Newtypes, typestate pattern, zero-sized markers (`PhantomData`), and invariants enforced at compile time.

### Sub-track 3D · Macros, Unsafe Rust, Memory Layout, FFI, and Standard Library Internals
- **[Macros](#macros)** *(Dependencies: [Modules](#modules), [Compilation pipeline](#compilation-pipeline))* — Declarative `macro_rules!` and procedural token-stream expansion before AST lowering.
- **[Unsafe Rust](#unsafe)** *(Dependencies: [Smart pointers](#smart-pointers), [Raw pointers](#borrowing))* — Raw pointers `*const T`/`*mut T`, the five unsafe superpowers, safety invariants, Undefined Behaviour, and compiler miscompilation.
- **[Working with other languages (FFI)](#ffi)** *(Dependencies: [Unsafe Rust](#unsafe), [Linking and ELF](#linking-elf))* — `unsafe extern "C"`, C ABI boundaries, `#[unsafe(no_mangle)]`, linking C libraries, and `bindgen`/PyO3.
- **[How data sits in memory](#memory-layout)** *(Dependencies: [Unsafe Rust](#unsafe))* — `size_of`, `align_of`, `offset_of!`, padding, field reordering, `#[repr(C)]`, `#[repr(packed)]`, `#[repr(align)]`, ZSTs, and DST fat pointers.
- **[Rust standard library and compiler internals](#rust-stdlib-internals)** *(Dependencies: [Memory layout](#memory-layout), [Smart pointers](#smart-pointers), [Unsafe Rust](#unsafe))* — How `RawVec`, `Vec<T>`, `String`, `Box<T>`, `RcBox<T>`, `UnsafeCell<T>`, `MaybeUninit<T>`, `ManuallyDrop<T>`, `NonNull<T>`, niche layouts, and drop glue (`needs_drop`) work inside `core` and `alloc`, plus pointer provenance and aliasing UB.
- **[Idiomatic Rust](#idioms)** *(Dependencies: [Rust standard library and compiler internals](#rust-stdlib-internals))* — Builders, `Cow`, `From`/`TryFrom`, entry APIs, and expressive zero-allocation patterns.

**Practical experiments for Part III:**
- Measure struct size, alignment, and field offsets with `std::mem::{size_of, align_of, offset_of}` and verify `Option<&T>` niche optimisation (`8` bytes instead of `16`).
- Compare monomorphised generics vs `dyn Trait` vtable dispatch in generated code, inspect `String`/`Vec` capacity growth across reallocations, and trace `Drop` ordering across nested scopes.

---

## Part IV — Memory Management and Organisation

**Core question:** *How does a modern computer give each program the illusion of a huge, private, flat memory space—and how do allocators, pointers, and CPU caches manage those bytes?*

- **Chapters in this part:**
  1. [Virtual Memory, Address Spaces, Page Tables, and Protection](#virtual-memory-address-spaces)
  2. [Static, Stack, and Heap Memory and Real Allocator Internals](#allocators-heap-internals)
  3. [Pointer Arithmetic, Memory Bugs, and CPU Cache Hierarchy](#pointers-safety-caches)

### Chapter 41 — Virtual Memory, Address Spaces, Page Tables, and Protection
- **Subchapters:** Physical RAM vs virtual address spaces; Pages, frames, and 4-level page tables; MMU and TLB address translation; Minor, major, and protection page faults; Permission bits (`R/W/X`, guard pages, W^X); Kernel memory mapping (`mmap` and `brk`); Inspecting `/proc/self/maps`.
- **Topics covered:** Address translation, TLB hit/miss cost, copy-on-write mappings, stack guard pages, anonymous vs file-backed `mmap`.
- **Learning objectives:** Explain how two processes use identical virtual addresses safely; trace a page walk and page fault; inspect live virtual memory regions of a Rust process.
- **Dependencies:** Part III ([Rust Standard Library and Compiler Internals](#rust-stdlib-internals)).

### Chapter 42 — Static, Stack, and Heap Memory and Real Allocator Internals
- **Subchapters:** Process static regions (`.rodata`, `.data`, `.bss`); Stack growth and hardware stack pointer; Heap allocation mechanics (`GlobalAlloc`, `Layout`, `System` allocator); Free lists, size classes, thread-local caches (`ptmalloc2`, `jemalloc`, `mimalloc`); Internal and external fragmentation; Writing a bump allocator in Rust.
- **Topics covered:** `std::alloc::{alloc, dealloc, Layout}`, `#[global_allocator]`, allocator metadata overhead, slab/size-class designs, fragmentation patterns.
- **Learning objectives:** Compare stack, static, and heap allocation costs and lifetimes; implement a minimal safe-wrapped bump allocator in Rust; explain internal vs external fragmentation.
- **Dependencies:** [Virtual Memory, Address Spaces, Page Tables, and Protection](#virtual-memory-address-spaces).

### Chapter 43 — Pointer Arithmetic, Memory Bugs, and CPU Cache Hierarchy
- **Subchapters:** Pointers, addresses, and provenance (`ptr::add`, `byte_add`, `wrapping_add`); Mechanical anatomy of memory leaks, dangling pointers, double frees, and buffer overflows; How Rust's ownership and bounds checks eliminate spatial and temporal memory corruption; CPU cache hierarchy (L1i/L1d, L2, L3); Spatial and temporal locality, 64-byte cache lines, AoS vs SoA.
- **Topics covered:** Pointer provenance rules, stack-smashing mechanics vs bounds-checked slices, leak safety (`mem::forget` vs soundness), cache misses, prefetching, data-oriented layout.
- **Learning objectives:** Compute pointer strides safely and explain provenance; diagnose leaks, use-after-free, and buffer overflows mechanically; benchmark and explain cache-locality speedups in Rust.
- **Dependencies:** [Static, Stack, and Heap Memory and Real Allocator Internals](#allocators-heap-internals), [Memory layout](#memory-layout).

**Practical experiments for Part IV:**
- Read and decode `/proc/self/maps` from inside a running Rust binary to locate `.text`, `.rodata`, heap `[heap]`, `mmap` anonymous regions, `[stack]`, and `[vdso]`.
- Implement a custom tracking `GlobalAlloc` and a bump allocator in Rust, and run a stride benchmark measuring L1/L2/L3 cache line effects (`64 B` vs `4 KB` strides).

---

## Part V — How Programs Execute

**Core question:** *What exact sequence of kernel, loader, runtime, stack, register, and CPU steps happens from pressing Enter on `./my_program` until the process exits?*

- **Chapters in this part:**
  1. [Program Launch, ELF Loading, Address Spaces, and Startup (`_start` to `main`)](#program-loading-startup)
  2. [Function Calls, Calling Conventions, Stack Frames, and Termination](#calling-conventions-execution)
  3. [The Complete Execution Journey: Tracing `String::from("Habtamu")` End to End](#end-to-end-trace)

### Chapter 44 — Program Launch, ELF Loading, Address Spaces, and Startup (`_start` to `main`)
- **Subchapters:** Shell `fork` and `execve`; Kernel ELF loader (`PT_LOAD`, `PT_INTERP`); Dynamic linker (`ld-linux.so`), ASLR, and auxiliary vector; Process virtual memory layout (code, rodata, data, bss, heap, mmap, stack, kernel high half); Entry point `_start` → `__libc_start_main` → `std::rt::lang_start` → `main`.
- **Topics covered:** ELF segment permissions, lazy vs eager relocation, thread-local storage (TLS) init, `argc`/`argv`/`envp` on the initial stack, Rust runtime setup (stack overflow guard, signal handlers).
- **Learning objectives:** Trace how the Linux kernel sets up a fresh address space during `execve`; explain why `main` is not the first code that runs; inspect entry points and dynamic segments with `readelf`.
- **Dependencies:** [Object Files, Linking, and ELF Executables](#linking-elf), Part IV ([Virtual Memory](#virtual-memory-address-spaces)).

### Chapter 45 — Function Calls, Calling Conventions, Stack Frames, and Termination
- **Subchapters:** Calling conventions (System V AMD64 ABI vs AAPCS64 ARM64); Parameter passing, return values, and caller-saved vs callee-saved registers; Stack frame anatomy, `RSP`/`RBP`, 16-byte stack alignment, and the red zone; Recursion at the machine level and stack overflow; Branching, jumps, instruction cycles, unwinding (`Drop`), and `exit_group`.
- **Topics covered:** Register roles (`rdi`–`r9`, `rax`, `rsp`, `rbp`, `rip`; `x0`–`x7`, `sp`, `x29`, `x30`), call/ret stack mechanics, `.eh_frame` unwinding vs abort, reverse `Drop` destructors, exit status propagation.
- **Learning objectives:** Trace stack pointers, return addresses, and registers across nested calls and recursion; contrast System V AMD64 and ARM64 ABIs; follow cleanup from return/panic through `exit_group`.
- **Dependencies:** [Program Launch, ELF Loading, Address Spaces, and Startup](#program-loading-startup), [Code Generation and Assembly](#assembly-machine-code).

### Chapter 46 — The Complete Execution Journey: Tracing `String::from("Habtamu")` End to End
- **Subchapters:** The target program (`let name = String::from("Habtamu"); println!("{}", name);`); Front-end parsing, HIR, MIR, borrowck, and LLVM IR; Assembly and ELF binary sections (`.rodata` storing `"Habtamu"` bytes); `execve` launch and `_start`; Stack slot `(ptr, len, cap)` and heap `alloc(7)` copy; `println!` formatting, `StdoutLock`, and `write(1, ...)` syscall; TTY/terminal rendering; `Drop` freeing heap memory and `exit_group(0)` returning to the shell.
- **Topics covered:** Full ten-layer vertical integration connecting compiler, ELF, loader, allocator, CPU, syscall, TTY, and destructor cleanup.
- **Learning objectives:** Narrate and verify every compiler, memory, CPU, and kernel step executed by a three-line Rust program without hand-waving.
- **Dependencies:** [Function Calls, Calling Conventions, Stack Frames, and Termination](#calling-conventions-execution).

**Practical experiments for Part V:**
- Inspect entry-point symbol `_start`, program headers, and auxiliary data (`LD_SHOW_AUXV=1`) of a compiled Rust executable.
- Observe live stack addresses across recursive calls in Rust, verify calling-convention register layout in disassembly, and trace `String::from("Habtamu")` + `println!` under `strace` and `readelf -x .rodata`.

---

## Part VI — Operating System Internals

**Core question:** *How does the operating system kernel isolate programs, multiplex CPU cores, route interrupts and signals, and mediate every hardware resource?*

- **Chapters in this part:**
  1. [The Kernel, Privilege Rings, and System Calls](#kernel-syscalls-processes)
  2. [Processes, Threads, Scheduling, Context Switching, and Permissions](#processes-threads-scheduling)
  3. [Kernel Synchronisation, Interrupts, Signals, and Resource Management](#sync-interrupts-signals)

### Chapter 47 — The Kernel, Privilege Rings, and System Calls
- **Subchapters:** What an operating system manages; CPU privilege modes (Ring 3 / EL0 user space vs Ring 0 / EL1 kernel space); Inside a `syscall` / `svc` trap instruction; System call ABI, numbers, `errno`, and vDSO fast paths; File descriptors and permissions preview; Observing Rust system calls with `strace`.
- **Topics covered:** Why user code cannot touch hardware directly, user-to-kernel mode switch cost, Linux x86-64/ARM64 syscall registers, vDSO (`clock_gettime`, `getpid`), `std::io::Error::last_os_error`.
- **Learning objectives:** Explain the hardware boundary between user space and kernel space; trace what happens during a `syscall` instruction; map Rust standard-library errors to OS `errno` codes.
- **Dependencies:** Part V ([Program Launch and Startup](#program-loading-startup)).

### Chapter 48 — Processes, Threads, Scheduling, Context Switching, and Permissions
- **Subchapters:** Linux processes vs threads (`task_struct`, `fork` copy-on-write, `execve`, `clone`); PID, TGID, and TID; Process scheduling (run queues, time slices, fairness); Hardware context switching (saving registers, swapping `CR3` page tables, TLB impact); Unix UID/GID permissions, Linux capabilities, and namespaces overview; Inspecting live Linux processes in `/proc`.
- **Topics covered:** Process vs thread isolation, Copy-on-Write `fork`, CFS/EEVDF scheduling principles, voluntary vs involuntary context switches, spawning child processes via `std::process::Command`.
- **Learning objectives:** Distinguish processes and OS threads in Linux kernel structures; explain what a context switch saves and invalidates; inspect live process state and context switches via `/proc/self/status`.
- **Dependencies:** [The Kernel, Privilege Rings, and System Calls](#kernel-syscalls-processes).

### Chapter 49 — Kernel Synchronisation, Interrupts, Signals, and Resource Management
- **Subchapters:** Kernel-backed synchronization (`futex` fast path vs kernel sleep queue); Hardware interrupts (IRQs, timer ticks, device completion) vs CPU exceptions vs POSIX signals; Handling `SIGINT`, `SIGTERM`, `SIGPIPE`, and `SIGSEGV`; Virtual memory accounting and resource limits (`rlimit`, cgroups); Linux architecture end-to-end.
- **Topics covered:** Why locks need kernel support when contended, interrupt-driven preemption, async-signal-safety pitfalls, Rust signal behaviour (`SIGPIPE` ignored by default in `std::rt`), `/proc/self/limits`.
- **Learning objectives:** Explain how a `futex` avoids syscalls in the uncontended case; separate hardware interrupts, exceptions, and OS signals; read and respect OS resource limits from Rust.
- **Dependencies:** [Processes, Threads, Scheduling, Context Switching, and Permissions](#processes-threads-scheduling).

**Practical experiments for Part VI:**
- Spawn child processes with `std::process::Command`, inspect `/proc/self/status` (`Pid`, `Tgid`, `Threads`, `voluntary_ctxt_switches`, `nonvoluntary_ctxt_switches`), and trace syscalls with `strace -f`.
- Measure user-space computation vs `getpid` / syscall overhead and observe OS `errno` reporting through `std::io::Error`.

---

## Part VII — Input and Output (I/O)

**Core question:** *How do bytes actually cross the boundary between your Rust program, terminals, files, sockets, and physical devices?*

- **Chapters in this part:**
  1. [Standard Streams, Terminals, File Descriptors, and Buffering](#streams-fds-buffering)
  2. [Blocking, Non-Blocking, Multiplexed (`epoll`), and Async (`io_uring`) I/O](#blocking-epoll-io-uring)

### Chapter 50 — Standard Streams, Terminals, File Descriptors, and Buffering
- **Subchapters:** Standard input (FD 0), standard output (FD 1), and standard error (FD 2); Terminals, PTYs, canonical line-buffered vs raw mode; Kernel FD tables, open file descriptions (offset + flags), and inodes; `openat`, `read`, `write`, `lseek`, `close`; Syscall overhead and buffered vs unbuffered I/O; Rust `Read`, `Write`, `BufRead`, `BufReader`, `BufWriter`, and `StdoutLock`.
- **Topics covered:** FD inheritance across `fork`/`exec`, why `stdout` flushes on `\n` for TTYs vs block-buffered for pipes, batching small reads/writes in user-space buffers.
- **Learning objectives:** Diagram per-process FD tables and kernel open file descriptions; explain when buffering saves orders-of-magnitude CPU time; use `Read`/`Write`/`BufReader`/`BufWriter` deliberately.
- **Dependencies:** Part VI ([Operating System Internals](#kernel-syscalls-processes)).

### Chapter 51 — Blocking, Non-Blocking, Multiplexed (`epoll`), and Async (`io_uring`) I/O
- **Subchapters:** Blocking I/O and kernel wait queues; Non-blocking I/O (`O_NONBLOCK` and `EAGAIN`); Readiness multiplexing (`select`, `poll`, Linux `epoll`, BSD/macOS `kqueue`); Completion-based I/O (`io_uring` shared submission/completion rings); Connecting OS readiness to Rust (`mio` and `tokio`); End-to-end trace of `std::fs::File::open` and `read` down to kernel VFS and storage hardware.
- **Topics covered:** C10K problem, edge-triggered vs level-triggered `epoll`, syscall-less submission via `io_uring`, Virtual File System (VFS) dispatch, tracing a complete file read.
- **Learning objectives:** Explain why one-thread-per-socket fails at high concurrency and how `epoll` / `io_uring` fix it; trace a Rust `File::read` call across user space, VFS, page cache, and DMA.
- **Dependencies:** [Standard Streams, Terminals, File Descriptors, and Buffering](#streams-fds-buffering).

**Practical experiments for Part VII:**
- Benchmark unbuffered single-byte `File::write` vs `BufWriter` in Rust and observe the dramatic syscall-count drop with `strace -c`.
- Inspect `/proc/self/fd` from Rust while opening and closing files and pipes, and trace `File::open` + `read_to_string` syscalls (`openat`, `statx`/`fstat`, `read`, `close`).

---

## Part VIII — CPU Architecture and Instruction Execution

**Core question:** *Once machine code bytes reach the processor, how does modern silicon decode, predict, reorder, cache, synchronise, and vectorise those instructions?*

- **Chapters in this part:**
  1. [Instruction Set Architectures (x86-64 and ARM64), Opcodes, and Control Flow](#isa-opcodes-control-flow)
  2. [Pipelining, Branch Prediction, Superscalar, and Out-of-Order Execution](#pipelines-branch-prediction-ooo)
  3. [Hardware Caches, Coherency, Atomic Instructions, and SIMD](#cache-coherency-atomics-simd)

### Chapter 52 — Instruction Set Architectures (x86-64 and ARM64), Opcodes, and Control Flow
- **Subchapters:** What an ISA guarantees; CISC (x86-64) vs RISC (ARM64 / RISC-V); General-purpose registers and status flags (`RFLAGS` / `NZCV`); Instruction encoding, prefixes, and variable-length vs 32-bit fixed opcodes; Decoding into micro-ops ($\mu$ops); ALU operations and conditional branches (`cmp`, `test`, `jcc` / `b.eq`).
- **Topics covered:** ISA as hardware/software contract, load-store vs memory-operand architectures, decoding bottleneck, flags and conditional moves (`cmov`).
- **Learning objectives:** Contrast x86-64 and ARM64 register files and instruction encodings; explain how Rust `match`, `if`, and loops become flags-setting tests and jumps.
- **Dependencies:** Part II ([Assembly and Machine Code](#assembly-machine-code)), Part V ([Calling Conventions](#calling-conventions-execution)).

### Chapter 53 — Pipelining, Branch Prediction, Superscalar, and Out-of-Order Execution
- **Subchapters:** Instruction-level parallelism; Classical 5-stage pipeline (IF, ID, EX, MEM, WB) and hazards; Branch prediction (BTB, two-level predictors, misprediction pipeline flush); Superscalar execution ports; Out-of-order execution (register renaming, reservation stations, reorder buffer); How compiler optimisation and branchless Rust cooperate with hardware execution.
- **Topics covered:** Data/control/structural hazards, speculative execution, branch misprediction penalty (~15–20 cycles), ILP bottlenecks, sorted vs unsorted branching benchmarks.
- **Learning objectives:** Trace instructions moving concurrently through pipeline stages; explain why unpredictable branches stall modern CPUs; use branchless code or data ordering when appropriate.
- **Dependencies:** [Instruction Set Architectures, Opcodes, and Control Flow](#isa-opcodes-control-flow).

### Chapter 54 — Hardware Caches, Coherency, Atomic Instructions, and SIMD
- **Subchapters:** Multi-core L1/L2/L3 caches and the MESI coherency protocol; Store buffers and invalidation queues (why cores see reordered writes); Memory barriers (`MFENCE`, `DMB ISH`) and mapping Rust `Ordering` (`Relaxed`, `Acquire`, `Release`, `SeqCst`) onto x86-64 vs ARM64; Hardware atomic instructions (`LOCK XADD`, `LOCK CMPXCHG`, ARM LL/SC vs LSE); SIMD vector lanes (`SSE`/`AVX`/`NEON`) and Rust auto-vectorisation; False sharing on 64-byte cache lines.
- **Topics covered:** Why x86-64 TSO hides bugs that fail on ARM64, MESI invalidation storms, false sharing, SIMD throughput vs scalar loops, `std::is_x86_feature_detected!`.
- **Learning objectives:** Explain why memory ordering exists because of store buffers and invalidation queues; map Rust `Ordering` modes to x86-64 and ARM64 fences; detect and fix false sharing.
- **Dependencies:** [Pipelining, Branch Prediction, and Out-of-Order Execution](#pipelines-branch-prediction-ooo), Part IV ([CPU Cache Hierarchy](#pointers-safety-caches)).

**Practical experiments for Part VIII:**
- Run a sorted vs unsorted array conditional-sum benchmark in Rust to observe hardware branch-prediction penalties directly.
- Run a multi-threaded adjacent-counter vs cache-line-padded (`#[repr(align(64))]`) benchmark in Rust to observe MESI false sharing, and test compiler SIMD auto-vectorisation.

---

## Part IX — Concurrency and Asynchronous Programming

**Core question:** *How do threads, atomics, mutexes, channels, futures, wakers, and async executors actually run across CPU cores and event loops?*

- **Chapters in this part:**
  1. [Threads: doing several things at once](#threads)
  2. [Shared state: `Arc`, `Mutex`, and atomics](#shared-state)
  3. [Async Rust: thousands of tasks at once](#async)
  4. [Concurrency and Async Internals: Futexes, State Machines, Pin, and Wakers](#concurrency-async-internals)
  5. [Project: a chat server](#project-chat)
  6. [Concurrency in practice: Rayon, Tokio, streams, HTTP clients, and tower](#async-ecosystem)

### Chapters in Part IX (Summary, Dependencies & Objectives)
- **[Threads](#threads)** *(Deps: Part VI & Part VIII)* — `std::thread::spawn`, `JoinHandle`, `move` closures, MPSC channels, and `Send`.
- **[Shared state](#shared-state)** *(Deps: [Threads](#threads), [Caches & Atomics](#cache-coherency-atomics-simd))* — `Arc<T>`, `Mutex<T>`, `RwLock<T>`, deadlock prevention, `Condvar`, and `Atomic*` with `Ordering`.
- **[Async Rust](#async)** *(Deps: [Shared state](#shared-state), Part VII [`epoll`](#blocking-epoll-io-uring))* — Cooperative multitasking, `Future`, `.await`, Tokio tasks, `join!`, `select!`, cancellation safety, and blocking vs async boundaries.
- **[Concurrency and Async Internals](#concurrency-async-internals)** *(Deps: [Async Rust](#async))* — How `Mutex` uses Linux `futex`; `Send`/`Sync` compile-time rules; how `rustc` transforms `async fn` into MIR enum state machines; `Pin<&mut T>` and self-referential frames; writing a real single-threaded executor using `RawWaker` + `RawWakerVTable`; Tokio's work-stealing scheduler, reactor (`epoll`), and timer wheel.
- **[Project: a chat server](#project-chat)** *(Deps: [Concurrency and Async Internals](#concurrency-async-internals))* — Concurrent TCP chat server with shared rooms and clean shutdown.
- **[Concurrency in practice](#async-ecosystem)** *(Deps: [Project: a chat server](#project-chat))* — Work stealing with Rayon, production Tokio patterns, async streams, HTTP clients, and `tower` middleware layers.

**Practical experiments for Part IX:**
- Build a working custom single-threaded `Future` executor from scratch in pure Rust using `RawWaker`, `RawWakerVTable`, and `Context`—with zero external crates!
- Trace thread creation (`clone`), mutex contention (`futex`), and Tokio task interleaving across CPU cores.

---

## Part X — Networking and Communication

**Core question:** *How does a single HTTP request or byte stream travel from a Rust API through sockets, kernel `sk_buff` queues, TCP/IP, DNS, TLS, and network hardware?*

- **Chapters in this part:**
  1. [Network Fundamentals: OSI, TCP/IP, Ethernet, IP, and Routing](#network-layers-ethernet-ip)
  2. [TCP, UDP, BSD Sockets, and Kernel Networking](#tcp-udp-sockets-kernel)
  3. [DNS, HTTP, TLS, and End-to-End Request Tracing](#dns-http-tls-trace)
  4. [Web servers with Axum](#web)
  5. [Observability: logging, traces, metrics, and health](#observability)

### Chapters in Part X (Summary, Dependencies & Objectives)
- **[Network Fundamentals](#network-layers-ethernet-ip)** *(Deps: Part VII, Part IX)* — OSI 7-layer vs TCP/IP 4-layer encapsulation; Ethernet frames, MACs, and ARP; IPv4/IPv6 addressing, CIDR, loopback (`127.0.0.1`), routing tables, and NAT.
- **[TCP, UDP, BSD Sockets, and Kernel Networking](#tcp-udp-sockets-kernel)** *(Deps: [Network Fundamentals](#network-layers-ethernet-ip))* — UDP datagrams vs TCP reliable streams (3-way handshake, sequence/ACKs, sliding window, congestion control, `TIME_WAIT`); BSD sockets (`socket`, `bind`, `listen`, `accept`, `connect`, `send`, `recv`); kernel `sk_buff` queues, NIC ring buffers, and DMA interrupts; Rust `std::net` TCP/UDP experiments.
- **[DNS, HTTP, TLS, and End-to-End Request Tracing](#dns-http-tls-trace)** *(Deps: [TCP, UDP, BSD Sockets](#tcp-udp-sockets-kernel))* — DNS resolution (`/etc/hosts`, `/etc/resolv.conf`, UDP/53, `getaddrinfo`); HTTP/1.1 & HTTP/2 wire framing; TLS handshake, certificates, ECDHE, and AEAD encryption; complete end-to-end trace of a Rust HTTP request from user code through kernel TCP/IP and NIC hardware.
- **[Web servers with Axum](#web)** *(Deps: [DNS, HTTP, TLS](#dns-http-tls-trace), [Concurrency in practice](#async-ecosystem))* — Production HTTP routing, extractors, shared state, auth, rate limiting, and REST/gRPC/GraphQL.
- **[Observability](#observability)** *(Deps: [Web servers with Axum](#web))* — Structured JSON logging, async `.instrument()` spans, OpenTelemetry, Prometheus `/metrics`, and health probes.

**Practical experiments for Part X:**
- Run a local Rust loopback `TcpListener` + `TcpStream` handshake and `UdpSocket` datagram exchange, observing socket file descriptors and `strace -e trace=network` syscalls.
- Construct and parse raw HTTP/1.1 wire bytes over `std::net::TcpStream` and inspect packet framing boundaries.

---

## Part XI — Storage and File Systems

**Core question:** *How do spinning platters, flash cells, filesystems, inodes, journals, and page caches make bytes survive power loss and feed high-speed databases?*

- **Chapters in this part:**
  1. [Persistent Storage: HDDs, SSDs, NVMe, and Block I/O](#storage-hardware-blocks)
  2. [File Systems, Inodes, Journaling, Page Cache, and `mmap`](#filesystems-cache-mmap)
  3. [Databases: SQL with SQLx, Diesel, and SeaORM](#databases)
  4. [Project: a link shortener with a web API and a database](#project-api)

### Chapters in Part XI (Summary, Dependencies & Objectives)
- **[Persistent Storage: HDDs, SSDs, NVMe, and Block I/O](#storage-hardware-blocks)** *(Deps: Part VII, Part I)* — HDD platters, tracks, sectors, and seek latency vs NAND flash pages, erase blocks, Flash Translation Layer (FTL), wear levelling, and NVMe queues; 512 B / 4 KB logical blocks and kernel block-layer DMA.
- **[File Systems, Inodes, Journaling, Page Cache, and `mmap`](#filesystems-cache-mmap)** *(Deps: [Persistent Storage](#storage-hardware-blocks), Part IV [`Virtual Memory`](#virtual-memory-address-spaces))* — Superblocks, inodes, directory entries (dentries), extents, hard links vs symlinks, metadata (`stat`), crash consistency and journaling (WAL), kernel page cache, dirty writeback, `fsync` (`sync_all` / `sync_data`), `mmap` zero-copy file I/O, and Rust `std::fs` internals.
- **[Databases](#databases)** *(Deps: [File Systems, Inodes, Journaling](#filesystems-cache-mmap))* — Relational tables, B-trees/WAL on disk, SQLx bound queries, transactions, pools, migrations, and key-value stores.
- **[Project: a link shortener API](#project-api)** *(Deps: [Databases](#databases), [Web servers with Axum](#web))* — Full database-backed async Axum API tested end to end.

**Practical experiments for Part XI:**
- Inspect inode numbers (`ino`), link counts (`nlink`), block counts (`blocks`), permissions, and device IDs from Rust via `std::os::unix::fs::MetadataExt`.
- Observe `write` vs `sync_all()` (`fsync`) durability behaviour and trace `std::fs::OpenOptions` atomic rename patterns.

---

## Part XII — Practical System Programming with Rust

**Core question:** *How do we combine Cargo, profiling, debugging, binary inspection, and Linux interfaces to build, measure, and diagnose real systems software?*

- **Chapters in this part:**
  1. [Cargo in depth](#cargo)
  2. [Tools for quality: formatting, linting, debugging, and CI](#quality-tools)
  3. [Testing strategies for real projects](#testing-strategies)
  4. [Command-line tools with clap](#cli)
  5. [Performance: measure first, then improve](#performance)
  6. [Hands-On Linux System Programming and Inspection Lab](#linux-systems-lab)
  7. [Project: a personal library with a web API and a CLI](#capstone)

### Chapters in Part XII (Summary, Dependencies & Objectives)
- **[Cargo in depth](#cargo)** *(Deps: Part III)* — Workspaces, build profiles, LTO, features, `build.rs`, and cross-compilation.
- **[Tools for quality](#quality-tools)** *(Deps: [Cargo in depth](#cargo))* — `rustfmt`, `clippy`, `rust-gdb`/`lldb`, `cargo-audit`, and GitHub Actions CI.
- **[Testing strategies](#testing-strategies)** *(Deps: [Tools for quality](#quality-tools))* — Property testing, fuzzing, mocking traits, and snapshot tests.
- **[Command-line tools with clap](#cli)** *(Deps: [Testing strategies](#testing-strategies), Part VII)* — Subcommands, streams, exit codes, piping, and signals in real CLI binaries.
- **[Performance](#performance)** *(Deps: Part IV, Part VIII, [Cargo in depth](#cargo))* — Criterion benchmarking, flame graphs, `perf`, cache-friendly structs, custom allocators, and SIMD.
- **[Hands-On Linux System Programming and Inspection Lab](#linux-systems-lab)** *(Deps: Parts I–XI, [Performance](#performance))* — End-to-end practical lab manual and pure-Rust systems tools: `rustc --emit`, `objdump`, `readelf`, `nm`, `strace`, `ltrace`, `rust-gdb`/`lldb` register & stack dumps, `perf`, `valgrind`, and building a Rust `/proc` inspector + ELF64 header parser + TCP/allocator telemetry suite.
- **[Capstone Project](#capstone)** *(Deps: Parts X–XII)* — Workspace combining library crate, SQLite persistence, Axum HTTP service, and CLI.

**Practical experiments for Part XII:**
- Run the full Linux toolchain inspection workflow (`rustc --emit=mir,llvm-ir,asm`, `readelf`, `objdump`, `nm`, `strace`, `ltrace`, `gdb`, `perf`, `/proc`) on your own Rust systems utilities.
- Build a working pure-Rust ELF64 header parser and `/proc/self` memory/FD/status inspector in the terminal.

---

## Part XIII — Applied Rust Ecosystem and Next Steps

**Core question:** *Where do you take your Rust and systems foundation across production data formats, desktop/WebAssembly UIs, games, bare-metal embedded devices, and beyond?*

- **Chapters in this part:**
  1. [The crate ecosystem: finding and using libraries](#crates)
  2. [Data formats with Serde: JSON, TOML, and more](#serde)
  3. [Apps with a user interface: WebAssembly, Tauri, and native windows](#apps)
  4. [Games, small devices (`no_std`), and data](#games-embedded)
  5. [Where to go from here](#next)

---

## Appendices

- **[Appendix A · Glossary](#glossary)** — Searchable dictionary of every computer systems, hardware, compiler, OS, and Rust term used in this guide.
- **[Appendix B · Reference tables](#reference)** — Rust syntax, format specifiers, System V AMD64 & ARM64 registers, Linux syscall reference, ELF sections, `/proc` files, and binary inspection command cheatsheet.
- **[Appendix C · Compiler errors and how to repair them](#errors-ref)** — Real `rustc` diagnostics paired with causes and repairs.
- **[Appendix D · Coming from another language](#from-other-languages)** — Fast translation tables from Python, JavaScript/TypeScript, Java/C#/Kotlin, Go, and C/C++.
- **[Appendix E · From source to silicon](#under-the-hood)** — Optional single-page end-to-end deep dive tracing Rust through lexing, AST, HIR, MIR borrow checking, LLVM IR, machine bytes, ELF loading, virtual memory, and CPU fetch–decode–execute.

:::recap Your path through the whole machine
1. **Parts I–II** show what hardware is and how `rustc` turns source code into ELF machine binaries.
2. **Part III** unpacks every Rust construct down to its bytes, compiler checks, and standard-library internals.
3. **Parts IV–VIII** trace virtual memory, allocators, program launch, calling conventions, the Linux kernel, I/O syscalls, and modern CPU microarchitecture.
4. **Parts IX–XIII** apply that foundation to concurrency, async executors, TCP/IP networking, storage filesystems, Linux systems labs, and real-world software.
:::
