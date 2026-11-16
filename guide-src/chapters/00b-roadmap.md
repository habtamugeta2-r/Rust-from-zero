@id roadmap
@part welcome
@kind orientation
@title Complete Learning Roadmap
@short Learning roadmap
@level all
@time 35
@learn Navigate the entire computer systems and Rust internals curriculum | Trace conceptual dependencies from hardware up to distributed services | See how every chapter maps to practical Linux and Rust experiments

Use this roadmap to see how the guide is organised and how its topics connect. It lists the Parts and chapters, their learning goals, useful prerequisites and practical experiments. The order builds from basic ideas towards systems topics, but you can follow a project-specific route when that better fits your goal.

## How the Full Stack Connects

A native Rust program can be followed through a sequence of transformations and runtime layers. This sketch is a useful map, not a claim that every target or executable uses identical steps:

```text
Source Code (.rs)
   │
   ▼  Part 2 · Lexing → Parsing → AST → HIR → MIR → LLVM IR → Assembly → Machine Code → Linking (ELF)
Executable Binary on Disk
   │
   ▼  Part 7 · fork/execve → ELF Loader → ld-linux.so → Virtual Address Space → _start → main()
Running Process in Virtual Memory (Part 6)
   │
   ├──▶ Part 3–5 · Stack Slots, Heap Buffers, Drop Glue, Generics, Vtables, Safety Invariants
   ├──▶ Part 10 · CPU Decode, Pipelines, Branch Prediction, Out-of-Order, Caches, Atomics, SIMD
   ├──▶ Part 8 · User Space ↔ Kernel Space (syscall), Scheduler, Futexes, Interrupts, Signals
   └──▶ Part 9 / 12 / 13 · VFS, Page Cache, Sockets, TCP/IP, Storage Blocks, TTY & NIC Hardware
```

:::key Using this roadmap
Read the parts in numerical order if you want the complete computer-systems story from transistors to TCP/IP and Linux systems tooling. If you want a focused route instead, check the route filters on the [home page](#home) or [chapter 0](#start). Tick chapters off as you finish them and [your progress](/progress) will keep the count, your quiz accuracy and your next chapter; to jump straight to a topic instead of reading in order, use [search](/search).
:::

---

## Part 1 — Understanding computers from the inside

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

**Practical experiments for Part 1:**
- Probe live CPU core counts, cache line sizes, and memory totals via Linux `/proc/cpuinfo`, `/proc/meminfo`, `lscpu`, and `std::thread::available_parallelism`.
- Write a Rust byte-inspector printing `to_le_bytes()`, `to_be_bytes()`, `f32::to_bits()`, and UTF-8 hex dumps for signed negative integers, floats, and Unicode text.

---

## Part 2 — From source code to machine instructions

**Core question:** *How does `rustc` turn plain UTF-8 source text into machine instructions, object files, and an executable binary?*

- **Chapters in this part:**
  1. [Compiler Stages: Lexing, Parsing, AST, HIR, MIR, and LLVM IR](#compilation-pipeline)
  2. [Code Generation, Assembly Language, and Machine Code](#assembly-machine-code)
  3. [Object Files, Linking, and ELF Executables](#linking-elf)

### Chapter 5 — Compiler Stages: Lexing, Parsing, AST, HIR, MIR, and LLVM IR
- **Subchapters:** Source text as raw bytes; Lexical analysis (tokens); Parsing and Abstract Syntax Trees (AST); Macro expansion and name resolution; HIR and type checking; MIR, control-flow graphs, and borrow checking; LLVM IR and target-independent optimisation passes.
- **Topics covered:** High-level vs low-level languages, ahead-of-time compilation vs JIT vs interpretation, compiler front-end/middle-end/back-end, `rustc --emit=mir,llvm-ir`.
- **Learning objectives:** Trace a Rust function through every IR stage; distinguish AST, HIR, MIR, and LLVM IR; explain why Rust runs borrow checking on MIR before passing IR to LLVM.
- **Dependencies:** Part 1 ([Setting Up Rust and Linux Inspection Tools](#setup)).

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

**Practical experiments for Part 2:**
- Run `rustc --emit=mir,llvm-ir,asm` and `rustc --emit=obj` on a small Rust module and compare `-C opt-level=0` vs `-C opt-level=3` output.
- Inspect the compiled binary with `objdump -d -M intel`, `readelf -h -S -l -s`, `nm -C`, and `ldd` to locate `.text`, `.rodata`, `main`, and libc dynamic imports.

---

## Part 3 — Core Rust fundamentals

**Core question:** *How do you give a value a name, change it, pass it to a function, and hand ownership of it to somebody else without ever leaking or double-freeing it?*

This is where the Rust language itself begins: the syntax, the ownership model, and enough compound data to write a real program. Nothing here assumes you have seen Rust before, and every construct is tied back to the bytes and compiler checks introduced in Parts 1 and 2.

- **[Variables](#variables)** *(Dependencies: [Part 2](#compilation-pipeline))* — `let`, `let mut`, shadowing, scopes, constants, and how a local binding lowers to a stack slot or an SSA register.
- **[Basic data types](#types)** *(Dependencies: [Variables](#variables))* — Integer widths, signed and unsigned overflow, IEEE-754 floats, `bool`, `char`, tuples, arrays, and machine bit patterns.
- **[Functions](#functions)** *(Dependencies: [Basic data types](#types))* — Parameters, expressions versus statements, early `return`, stack-frame preview, and inlining.
- **[Control flow](#control-flow)** *(Dependencies: [Functions](#functions))* — `if`/`else`, `match`, `loop`/`while`/`for`, and how branches lower to compare-and-jump machine instructions.
- **[Project: a number guessing game](#project-guessing)** *(Dependencies: [Control flow](#control-flow))* — An interactive loop combining input, parsing, ordering, and error handling.
- **[How a program uses memory](#memory)** *(Dependencies: [Control flow](#control-flow), [Part 1](#bits-bytes-representation))* — Stack-pointer bumping versus heap allocation requests, and frame lifetimes.
- **[Ownership](#ownership)** *(Dependencies: [How a program uses memory](#memory))* — Move semantics as shallow bitwise copies, `Copy` versus drop, compile-time ownership tracking, and drop flags.
- **[References and borrowing](#borrowing)** *(Dependencies: [Ownership](#ownership))* — `&T` and `&mut T` as non-null aligned addresses plus the LLVM aliasing hints a borrow permits.
- **[Strings and slices](#slices-strings)** *(Dependencies: [References and borrowing](#borrowing))* — UTF-8 validation, `(ptr, len)` fat pointers for `&str`/`&[T]`, and `(ptr, len, cap)` heap ownership for `String`.
- **[Structs and methods](#structs)** *(Dependencies: [Strings and slices](#slices-strings))* — Field aggregation, partial moves, `self` parameter desugaring.
- **[Enums, `Option`, and `match`](#enums)** *(Dependencies: [Structs](#structs))* — Tagged unions, discriminant bytes, exhaustiveness, and the `Option<&T>` niche optimisation.
- **[Pattern matching in depth](#patterns)** *(Dependencies: [Enums](#enums))* — Destructuring, refutability, binding modes, and compiler decision trees.
- **[Collections](#collections)** *(Dependencies: [Enums](#enums))* — `Vec<T>` geometric growth, `HashMap` buckets and control bytes, `HashSet`, and ownership in containers.
- **[Project: a to-do list for the terminal](#project-todo)** *(Dependencies: [Collections](#collections))* — A persistent, file-backed task manager.
- **[Modules, crates, and packages](#modules)** *(Dependencies: [Collections](#collections), [Linking and ELF](#linking-elf))* — Privacy boundaries, compilation units (`.rlib`), and Rust symbol mangling.
- **[Error handling](#errors)** *(Dependencies: [Modules](#modules))* — Recoverable `Result<T, E>` discriminant returns versus panic unwinding (`.eh_frame`) and abort.

### Chapter 8 — Variables: Giving names to values
- **Topics covered:** `let`, `let mut`, shadowing, scopes, constants, statics, and how a local binding becomes a stack slot or an SSA register.
- **Learning objectives:** Choose between immutable and mutable bindings; use shadowing to rebind a value; explain what a constant is fixed at.

### Chapter 9 — Basic data types: numbers, truth values, characters and groups
- **Topics covered:** Integer widths, signed versus unsigned overflow, IEEE-754 floats, `bool`, `char`, tuples, arrays, and machine bit patterns.
- **Learning objectives:** Pick the narrowest integer that fits; predict overflow behaviour in debug and release builds; store bytes inside the type that describes them.

### Chapter 10 — Functions: naming a piece of work
- **Topics covered:** Parameters, return values, expressions versus statements, the implicit final expression, and a stack-frame preview.
- **Learning objectives:** Split a program into small functions; return a value without writing `return`; pass a value by copy and by reference.

### Chapter 11 — Control flow: decisions and repetition
- **Topics covered:** `if`/`else`, `match`, `loop`/`while`/`for`, labelled loops, and how branches lower to compare-and-jump instructions.
- **Learning objectives:** Choose the loop that says what you mean; return a value out of a `loop`; break out of a nested loop.

### Chapter 12 — Project: a number guessing game
- **Topics covered:** Reading from standard input, parsing a number, comparing and looping, and handling bad input without crashing.
- **Learning objectives:** Combine input, parsing, comparison and iteration into one program; react to a parse failure with a useful message.

### Chapter 13 — How a program uses memory: the stack and the heap
- **Topics covered:** Stack frames and the stack pointer, heap allocation requests, frame lifetimes, and why the two have different costs.
- **Learning objectives:** Say where a value lives; explain why the stack is fast; recognise the size limits of each.

### Chapter 14 — Ownership: one owner for every value
- **Topics covered:** Move semantics as a shallow bitwise copy, `Copy` versus drop, ownership tracking at compile time, and drop flags.
- **Learning objectives:** Predict when a value is moved; use `clone` deliberately; explain why exactly one owner is enough.

### Chapter 15 — References and borrowing
- **Topics covered:** `&T` and `&mut T` as non-null aligned addresses, the "many readers or one writer" rule, and the aliasing hints passed to LLVM.
- **Learning objectives:** Borrow instead of move; find and fix a borrow-checker error; explain what a dangling reference would break.

### Chapter 16 — Strings and slices
- **Topics covered:** UTF-8 validation, `(ptr, len)` fat pointers for `&str` and `&[T]`, and `(ptr, len, cap)` heap ownership for `String`.
- **Learning objectives:** Choose between `String` and `&str`; slice without copying; explain why indexing a string by integer is rejected.

### Chapter 17 — Structs: building your own types
- **Topics covered:** Named fields, methods and associated functions, `self` desugaring, partial moves, and derived traits.
- **Learning objectives:** Group related data; give a struct behaviour with `impl`; update a struct through `..base` syntax.

### Chapter 18 — Enums, `Option` and `match`
- **Topics covered:** Variants with and without data, tagged-union layout, exhaustive `match`, and the `Option<&T>` niche optimisation.
- **Learning objectives:** Model a choice with an enum; match every case; replace a null check with `Option`.

### Chapter 19 — Pattern matching in depth
- **Topics covered:** Destructuring, refutability, binding modes, guards, `if let`, `let else`, and compiler decision trees.
- **Learning objectives:** Destructure a nested value; choose between `match`, `if let` and `let else`; spot an unreachable arm.

### Chapter 20 — Collections: lists, maps and sets
- **Topics covered:** `Vec<T>` geometric growth, `HashMap` buckets and hashing, `HashSet`, `BTreeMap`, and ownership inside containers.
- **Learning objectives:** Store a growing list; look a value up by key; choose a collection that fits the access pattern.

### Chapter 21 — Project: a to-do list for the terminal
- **Topics covered:** A file-backed task list, `Vec` of structs, `enum` commands, reading and writing text files, and `Result` at the edges.
- **Learning objectives:** Persist data between runs; separate parsing from behaviour; report an I/O failure without panicking.

### Chapter 22 — Organising code: packages, crates and modules
- **Topics covered:** `mod`, `pub`, privacy boundaries, compilation units (`.rlib`), and Rust symbol mangling.
- **Learning objectives:** Split a project across files; decide what to make public; explain what a crate is.

### Chapter 23 — Error handling
- **Topics covered:** Recoverable `Result<T, E>` versus panic, the `?` operator, custom error types, and unwinding (`.eh_frame`) versus abort.
- **Learning objectives:** Return an error rather than panicking; propagate with `?`; choose when a panic is the honest answer.

**Practical experiments for Part 3:**
- Write the same small program twice, once letting values move and once borrowing them, and compare what the compiler accepts.
- Print `size_of::<Option<&u8>>()` next to `size_of::<Option<u8>>()` to see the niche optimisation at work.

---

## Part 4 — Abstraction and architecture

**Core question:** *Once the syntax is familiar, how do you write code that is reused, tested, and organised so that a change in one place does not break five others?*

Generics, traits, lifetimes, closures and iterators are the tools; the three projects in this part are where they are used for something real. The part closes with smart pointers, advanced traits and the type system — the vocabulary the advanced material depends on — together with [Cargo](#cargo), [the quality tooling](#quality-tools) and [testing strategies](#testing-strategies) that every later project assumes.

- **[Generics](#generics)** *(Dependencies: [Error handling](#errors))* — Parametric polymorphism and compile-time monomorphisation versus binary size and instruction cache.
- **[Traits](#traits)** *(Dependencies: [Generics](#generics))* — Static dispatch (`impl Trait`) versus dynamic dispatch (`dyn Trait` fat pointers and vtables).
- **[Lifetimes](#lifetimes)** *(Dependencies: [Traits](#traits))* — Region parameters `'a`, elision rules, MIR non-lexical lifetimes, and zero runtime footprint.
- **[Testing your code](#testing)** *(Dependencies: [Lifetimes](#lifetimes))* — Unit, integration and doc tests compiled through `rustc --test`.
- **[Project: a file search tool](#project-search)** *(Dependencies: [Testing](#testing))* — Library-plus-binary crate architecture with streaming search.
- **[Closures](#closures)** *(Dependencies: [Lifetimes](#lifetimes))* — Compiler-generated anonymous capture structs and `Fn`/`FnMut`/`FnOnce` desugaring.
- **[Iterators](#iterators)** *(Dependencies: [Closures](#closures))* — Lazy state-machine structs and zero-cost loop lowering.
- **[Project: a sales report from raw data](#project-report)** *(Dependencies: [Iterators](#iterators))* — Streaming aggregation without intermediate heap allocations.
- **[Smart pointers](#smart-pointers)** *(Dependencies: [Ownership](#ownership), [Traits](#traits))* — `Box<T>`, `Deref` coercion, `Drop` destructor order, `Rc<T>`/`Weak<T>`, and `Cell`/`RefCell` interior mutability.
- **[Traits in depth](#advanced-traits)** *(Dependencies: [Smart pointers](#smart-pointers))* — Associated types, GATs, operator traits, dyn compatibility, and the `Sized`/`Send`/`Sync` markers.
- **[The type system as a design tool](#type-system)** *(Dependencies: [Traits in depth](#advanced-traits))* — Newtypes, the typestate pattern, zero-sized markers (`PhantomData`), and invariants enforced at compile time.
- **[Cargo in depth](#cargo)** *(Dependencies: [Part 3](#modules))* — Workspaces, build profiles, features, `build.rs`, and cross-compilation. Read it before the larger projects below, because every one of them is a workspace.
- **[Tools for quality](#quality-tools)** *(Dependencies: [Cargo in depth](#cargo))* — `rustfmt`, `clippy`, `rust-gdb`/`lldb`, `cargo-audit`, and GitHub Actions CI.
- **[Testing strategies](#testing-strategies)** *(Dependencies: [Tools for quality](#quality-tools))* — Property testing, fuzzing, mocking traits, and snapshot tests.

### Chapter 24 — Generics: code that works for many types
- **Topics covered:** Type parameters, monomorphisation, `impl Trait`, const generics, and the binary-size and instruction-cache cost.
- **Learning objectives:** Write one function for many types; explain what the compiler emits per instantiation; judge when generics are the wrong tool.

### Chapter 25 — Traits: shared behaviour
- **Topics covered:** Trait definitions and impls, default methods, static dispatch, and dynamic dispatch through `dyn Trait` fat pointers and vtables.
- **Learning objectives:** Describe shared behaviour with a trait; implement it for your own type; choose static or dynamic dispatch deliberately.

### Chapter 26 — Lifetimes: how long references stay valid
- **Topics covered:** Region parameters `'a`, elision rules, struct lifetimes, `'static`, and MIR non-lexical lifetimes.
- **Learning objectives:** Read a lifetime error and say which borrow is too long; add an annotation only where elision cannot work; explain the zero runtime cost.

### Chapter 27 — Testing your code
- **Topics covered:** `#[test]`, assertions, unit versus integration tests, `cargo test` and `rustc --test`, doc tests, and test organisation.
- **Learning objectives:** Write a test before the fix; separate unit from integration tests; run and read a failing test.

### Chapter 28 — Project: a file search tool
- **Topics covered:** A library plus binary crate, streaming search, `Result` at the boundary, and command-line arguments.
- **Learning objectives:** Design a reusable library API; stream a file instead of loading it; report a missing file clearly.

### Chapter 29 — Closures: functions you can carry around
- **Topics covered:** Capture by reference, by mutable reference and by move; the `Fn`/`FnMut`/`FnOnce` hierarchy; and the compiler-generated capture struct.
- **Learning objectives:** Store a closure in a variable; pass one to a function; explain which capture mode a closure needs.

### Chapter 30 — Iterators: processing data step by step
- **Topics covered:** The `Iterator` trait, lazy adapters, consuming adapters, custom iterators, and zero-cost loop lowering.
- **Learning objectives:** Replace an index loop with an iterator chain; write your own iterator; explain why laziness matters.

### Chapter 31 — Project: a sales report from raw data
- **Topics covered:** Reading and parsing records, aggregating with iterators, grouping in a `HashMap`, and formatting a report without intermediate allocations.
- **Learning objectives:** Turn raw text into a summary; keep the pipeline streaming; separate formatting from calculation.

### Chapter 32 — Smart pointers: `Box`, `Rc`, `RefCell` and friends
- **Topics covered:** `Box<T>`, `Deref` coercion, `Drop` order, `Rc<T>`/`Weak<T>` reference cycles, and `Cell`/`RefCell` interior mutability.
- **Learning objectives:** Put a recursive type behind a `Box`; share ownership with `Rc`; choose between compile-time and run-time borrow checking.

### Chapter 33 — Traits in depth
- **Topics covered:** Associated types, generic associated types, operator traits, object safety (now "dyn compatibility"), and the `Sized`/`Send`/`Sync` marker traits.
- **Learning objectives:** Choose an associated type over a type parameter; implement an operator trait; say why a trait cannot be made into a trait object.

### Chapter 34 — The type system as a design tool
- **Topics covered:** Newtypes, the typestate pattern, zero-sized markers with `PhantomData`, and invariants enforced at compile time.
- **Learning objectives:** Use the type system to make an invalid state unrepresentable; encode a state machine in types; keep a newtype's invariant private.

### Chapter 35 — Cargo in depth
- **Topics covered:** Workspaces, build profiles, features, `build.rs`, dependency resolution, and cross-compilation.
- **Learning objectives:** Split a growing project into a workspace; gate optional behaviour behind a feature; explain what a release profile changes.

### Chapter 36 — Tools for quality: formatting, linting, debugging, CI
- **Topics covered:** `rustfmt`, Clippy lints and levels, `rust-gdb`/`lldb`, `cargo-audit`, and a GitHub Actions CI job.
- **Learning objectives:** Format and lint a project from the command line; fix a Clippy warning properly rather than silencing it; run the same checks in CI.

### Chapter 37 — Testing strategies for real projects
- **Topics covered:** Property testing, fuzzing, mocking behind traits, snapshot tests, and measuring speed with benchmarks.
- **Learning objectives:** Test a property instead of an example; mock a dependency through a trait; recognise a flaky benchmark.

**Practical experiments for Part 4:**
- Compare monomorphised generics against `dyn Trait` vtable dispatch in the generated assembly, and count the symbols each produces.
- Trace `Drop` ordering across nested scopes containing a `Box`, an `Rc` and a `RefCell`.

---

## Part 5 — Advanced Rust

**Core question:** *What do you reach for when safe, ordinary Rust cannot express the program you need — and what exactly are you promising the compiler when you reach for it?*

Macros, `unsafe`, FFI, memory layout and the standard library's internals are the four doors out of safe Rust, and each one comes with a written contract. This part reads the contracts, so that the systems material in Parts 6–10 has something concrete to point at.

- **[Macros](#macros)** *(Dependencies: [Modules](#modules), [Compilation pipeline](#compilation-pipeline))* — Declarative `macro_rules!` with fragment specifiers and repetition, procedural derive/attribute/function macros, and expansion before AST lowering.
- **[Unsafe Rust](#unsafe)** *(Dependencies: [Smart pointers](#smart-pointers), [References and borrowing](#borrowing))* — Raw pointers `*const T`/`*mut T`, the five unsafe superpowers, safety invariants, undefined behaviour, and how a broken invariant miscompiles instead of crashing.
- **[Working with other languages (FFI)](#ffi)** *(Dependencies: [Unsafe Rust](#unsafe), [Linking and ELF](#linking-elf))* — `unsafe extern "C"`, the C ABI boundary, `#[unsafe(no_mangle)]`, linking C libraries, and `bindgen`/PyO3.
- **[How data sits in memory](#memory-layout)** *(Dependencies: [Unsafe Rust](#unsafe))* — `size_of`, `align_of`, `offset_of!`, padding, field reordering, `#[repr(C)]`, `#[repr(packed)]`, `#[repr(align)]`, zero-sized types, and DST fat pointers.
- **[Rust standard library and compiler internals](#rust-stdlib-internals)** *(Dependencies: [How data sits in memory](#memory-layout), [Smart pointers](#smart-pointers), [Unsafe Rust](#unsafe))* — How `RawVec`, `Vec<T>`, `String`, `Box<T>`, `RcBox<T>`, `UnsafeCell<T>`, `MaybeUninit<T>`, `ManuallyDrop<T>`, `NonNull<T>`, niche layouts and drop glue (`needs_drop`) work inside `core` and `alloc`, plus pointer provenance and aliasing UB.
- **[Idiomatic Rust](#idioms)** *(Dependencies: [Rust standard library and compiler internals](#rust-stdlib-internals))* — Builders, `Cow`, `From`/`TryFrom`, entry APIs, iterator-based APIs, and expressive zero-allocation patterns.

**Practical experiments for Part 5:**
- Measure struct size, alignment, and field offsets with `std::mem::{size_of, align_of, offset_of}` and verify the `Option<&T>` niche optimisation (`8` bytes instead of `16`).
- Inspect the expansion of a small `macro_rules!` with `cargo expand`, then compare the monomorphised and `dyn Trait` versions of the same generic function.

---

## Part 6 — Memory management and organisation

**Core question:** *How does a modern computer give each program the illusion of a huge, private, flat memory space—and how do allocators, pointers, and CPU caches manage those bytes?*

- **Chapters in this part:**
  1. [Virtual Memory, Address Spaces, Page Tables, and Protection](#virtual-memory-address-spaces)
  2. [Static, Stack, and Heap Memory and Real Allocator Internals](#allocators-heap-internals)
  3. [Pointer Arithmetic, Memory Bugs, and CPU Cache Hierarchy](#pointers-safety-caches)

### Chapter 44 — Virtual Memory, Address Spaces, Page Tables, and Protection
- **Subchapters:** Physical RAM vs virtual address spaces; Pages, frames, and 4-level page tables; MMU and TLB address translation; Minor, major, and protection page faults; Permission bits (`R/W/X`, guard pages, W^X); Kernel memory mapping (`mmap` and `brk`); Inspecting `/proc/self/maps`.
- **Topics covered:** Address translation, TLB hit/miss cost, copy-on-write mappings, stack guard pages, anonymous vs file-backed `mmap`.
- **Learning objectives:** Explain how two processes use identical virtual addresses safely; trace a page walk and page fault; inspect live virtual memory regions of a Rust process.
- **Dependencies:** [Part 5](#rust-stdlib-internals).

### Chapter 45 — Static, Stack, and Heap Memory and Real Allocator Internals
- **Subchapters:** Process static regions (`.rodata`, `.data`, `.bss`); Stack growth and hardware stack pointer; Heap allocation mechanics (`GlobalAlloc`, `Layout`, `System` allocator); Free lists, size classes, thread-local caches (`ptmalloc2`, `jemalloc`, `mimalloc`); Internal and external fragmentation; Writing a bump allocator in Rust.
- **Topics covered:** `std::alloc::{alloc, dealloc, Layout}`, `#[global_allocator]`, allocator metadata overhead, slab/size-class designs, fragmentation patterns.
- **Learning objectives:** Compare stack, static, and heap allocation costs and lifetimes; implement a minimal safe-wrapped bump allocator in Rust; explain internal vs external fragmentation.
- **Dependencies:** [Virtual Memory, Address Spaces, Page Tables, and Protection](#virtual-memory-address-spaces).

### Chapter 46 — Pointer Arithmetic, Memory Bugs, and CPU Cache Hierarchy
- **Subchapters:** Pointers, addresses, and provenance (`ptr::add`, `byte_add`, `wrapping_add`); Mechanical anatomy of memory leaks, dangling pointers, double frees, and buffer overflows; How Rust's ownership and bounds checks eliminate spatial and temporal memory corruption; CPU cache hierarchy (L1i/L1d, L2, L3); Spatial and temporal locality, 64-byte cache lines, AoS vs SoA.
- **Topics covered:** Pointer provenance rules, stack-smashing mechanics vs bounds-checked slices, leak safety (`mem::forget` vs soundness), cache misses, prefetching, data-oriented layout.
- **Learning objectives:** Compute pointer strides safely and explain provenance; diagnose leaks, use-after-free, and buffer overflows mechanically; benchmark and explain cache-locality speedups in Rust.
- **Dependencies:** [Static, Stack, and Heap Memory and Real Allocator Internals](#allocators-heap-internals), [Memory layout](#memory-layout).

**Practical experiments for Part 6:**
- Read and decode `/proc/self/maps` from inside a running Rust binary to locate `.text`, `.rodata`, heap `[heap]`, `mmap` anonymous regions, `[stack]`, and `[vdso]`.
- Implement a custom tracking `GlobalAlloc` and a bump allocator in Rust, and run a stride benchmark measuring L1/L2/L3 cache line effects (`64 B` vs `4 KB` strides).

---

## Part 7 — How programs execute

**Core question:** *What exact sequence of kernel, loader, runtime, stack, register, and CPU steps happens from pressing Enter on `./my_program` until the process exits?*

- **Chapters in this part:**
  1. [Program Launch, ELF Loading, Address Spaces, and Startup (`_start` to `main`)](#program-loading-startup)
  2. [Function Calls, Calling Conventions, Stack Frames, and Termination](#calling-conventions-execution)
  3. [The Complete Execution Journey: Tracing `String::from("Habtamu")` End to End](#end-to-end-trace)

### Chapter 47 — Program Launch, ELF Loading, Address Spaces, and Startup (`_start` to `main`)
- **Subchapters:** Shell `fork` and `execve`; Kernel ELF loader (`PT_LOAD`, `PT_INTERP`); Dynamic linker (`ld-linux.so`), ASLR, and auxiliary vector; Process virtual memory layout (code, rodata, data, bss, heap, mmap, stack, kernel high half); Entry point `_start` → `__libc_start_main` → `std::rt::lang_start` → `main`.
- **Topics covered:** ELF segment permissions, lazy vs eager relocation, thread-local storage (TLS) init, `argc`/`argv`/`envp` on the initial stack, Rust runtime setup (stack overflow guard, signal handlers).
- **Learning objectives:** Trace how the Linux kernel sets up a fresh address space during `execve`; explain why `main` is not the first code that runs; inspect entry points and dynamic segments with `readelf`.
- **Dependencies:** [Object Files, Linking, and ELF Executables](#linking-elf), Part 6 ([Virtual Memory](#virtual-memory-address-spaces)).

### Chapter 48 — Function Calls, Calling Conventions, Stack Frames, and Termination
- **Subchapters:** Calling conventions (System V AMD64 ABI vs AAPCS64 ARM64); Parameter passing, return values, and caller-saved vs callee-saved registers; Stack frame anatomy, `RSP`/`RBP`, 16-byte stack alignment, and the red zone; Recursion at the machine level and stack overflow; Branching, jumps, instruction cycles, unwinding (`Drop`), and `exit_group`.
- **Topics covered:** Register roles (`rdi`–`r9`, `rax`, `rsp`, `rbp`, `rip`; `x0`–`x7`, `sp`, `x29`, `x30`), call/ret stack mechanics, `.eh_frame` unwinding vs abort, reverse `Drop` destructors, exit status propagation.
- **Learning objectives:** Trace stack pointers, return addresses, and registers across nested calls and recursion; contrast System V AMD64 and ARM64 ABIs; follow cleanup from return/panic through `exit_group`.
- **Dependencies:** [Program Launch, ELF Loading, Address Spaces, and Startup](#program-loading-startup), [Code Generation and Assembly](#assembly-machine-code).

### Chapter 49 — The Complete Execution Journey: Tracing `String::from("Habtamu")` End to End
- **Subchapters:** The target program (`let name = String::from("Habtamu"); println!("{}", name);`); Front-end parsing, HIR, MIR, borrowck, and LLVM IR; Assembly and ELF binary sections (`.rodata` storing `"Habtamu"` bytes); `execve` launch and `_start`; Stack slot `(ptr, len, cap)` and heap `alloc(7)` copy; `println!` formatting, `StdoutLock`, and `write(1, ...)` syscall; TTY/terminal rendering; `Drop` freeing heap memory and `exit_group(0)` returning to the shell.
- **Topics covered:** Full ten-layer vertical integration connecting compiler, ELF, loader, allocator, CPU, syscall, TTY, and destructor cleanup.
- **Learning objectives:** Narrate and verify every compiler, memory, CPU, and kernel step executed by a three-line Rust program without hand-waving.
- **Dependencies:** [Function Calls, Calling Conventions, Stack Frames, and Termination](#calling-conventions-execution).

**Practical experiments for Part 7:**
- Inspect entry-point symbol `_start`, program headers, and auxiliary data (`LD_SHOW_AUXV=1`) of a compiled Rust executable.
- Observe live stack addresses across recursive calls in Rust, verify calling-convention register layout in disassembly, and trace `String::from("Habtamu")` + `println!` under `strace` and `readelf -x .rodata`.

---

## Part 8 — Operating system internals

**Core question:** *How does the operating system kernel isolate programs, multiplex CPU cores, route interrupts and signals, and mediate every hardware resource?*

- **Chapters in this part:**
  1. [The Kernel, Privilege Rings, and System Calls](#kernel-syscalls-processes)
  2. [Processes, Threads, Scheduling, Context Switching, and Permissions](#processes-threads-scheduling)
  3. [Kernel Synchronisation, Interrupts, Signals, and Resource Management](#sync-interrupts-signals)

### Chapter 50 — The Kernel, Privilege Rings, and System Calls
- **Subchapters:** What an operating system manages; CPU privilege modes (Ring 3 / EL0 user space vs Ring 0 / EL1 kernel space); Inside a `syscall` / `svc` trap instruction; System call ABI, numbers, `errno`, and vDSO fast paths; File descriptors and permissions preview; Observing Rust system calls with `strace`.
- **Topics covered:** Why user code cannot touch hardware directly, user-to-kernel mode switch cost, Linux x86-64/ARM64 syscall registers, vDSO (`clock_gettime`, `getpid`), `std::io::Error::last_os_error`.
- **Learning objectives:** Explain the hardware boundary between user space and kernel space; trace what happens during a `syscall` instruction; map Rust standard-library errors to OS `errno` codes.
- **Dependencies:** Part 7 ([Program Launch and Startup](#program-loading-startup)).

### Chapter 51 — Processes, Threads, Scheduling, Context Switching, and Permissions
- **Subchapters:** Linux processes vs threads (`task_struct`, `fork` copy-on-write, `execve`, `clone`); PID, TGID, and TID; Process scheduling (run queues, time slices, fairness); Hardware context switching (saving registers, swapping `CR3` page tables, TLB impact); Unix UID/GID permissions, Linux capabilities, and namespaces overview; Inspecting live Linux processes in `/proc`.
- **Topics covered:** Process vs thread isolation, Copy-on-Write `fork`, CFS/EEVDF scheduling principles, voluntary vs involuntary context switches, spawning child processes via `std::process::Command`.
- **Learning objectives:** Distinguish processes and OS threads in Linux kernel structures; explain what a context switch saves and invalidates; inspect live process state and context switches via `/proc/self/status`.
- **Dependencies:** [The Kernel, Privilege Rings, and System Calls](#kernel-syscalls-processes).

### Chapter 52 — Kernel Synchronisation, Interrupts, Signals, and Resource Management
- **Subchapters:** Kernel-backed synchronization (`futex` fast path vs kernel sleep queue); Hardware interrupts (IRQs, timer ticks, device completion) vs CPU exceptions vs POSIX signals; Handling `SIGINT`, `SIGTERM`, `SIGPIPE`, and `SIGSEGV`; Virtual memory accounting and resource limits (`rlimit`, cgroups); Linux architecture end-to-end.
- **Topics covered:** Why locks need kernel support when contended, interrupt-driven preemption, async-signal-safety pitfalls, Rust signal behaviour (`SIGPIPE` ignored by default in `std::rt`), `/proc/self/limits`.
- **Learning objectives:** Explain how a `futex` avoids syscalls in the uncontended case; separate hardware interrupts, exceptions, and OS signals; read and respect OS resource limits from Rust.
- **Dependencies:** [Processes, Threads, Scheduling, Context Switching, and Permissions](#processes-threads-scheduling).

**Practical experiments for Part 8:**
- Spawn child processes with `std::process::Command`, inspect `/proc/self/status` (`Pid`, `Tgid`, `Threads`, `voluntary_ctxt_switches`, `nonvoluntary_ctxt_switches`), and trace syscalls with `strace -f`.
- Measure user-space computation vs `getpid` / syscall overhead and observe OS `errno` reporting through `std::io::Error`.

---

## Part 9 — Input and output (I/O)

**Core question:** *How do bytes actually cross the boundary between your Rust program, terminals, files, sockets, and physical devices?*

- **Chapters in this part:**
  1. [Standard Streams, Terminals, File Descriptors, and Buffering](#streams-fds-buffering)
  2. [Blocking, Non-Blocking, Multiplexed (`epoll`), and Async (`io_uring`) I/O](#blocking-epoll-io-uring)

### Chapter 53 — Standard Streams, Terminals, File Descriptors, and Buffering
- **Subchapters:** Standard input (FD 0), standard output (FD 1), and standard error (FD 2); Terminals, PTYs, canonical line-buffered vs raw mode; Kernel FD tables, open file descriptions (offset + flags), and inodes; `openat`, `read`, `write`, `lseek`, `close`; Syscall overhead and buffered vs unbuffered I/O; Rust `Read`, `Write`, `BufRead`, `BufReader`, `BufWriter`, and `StdoutLock`.
- **Topics covered:** FD inheritance across `fork`/`exec`, why `stdout` flushes on `\n` for TTYs vs block-buffered for pipes, batching small reads/writes in user-space buffers.
- **Learning objectives:** Diagram per-process FD tables and kernel open file descriptions; explain when buffering saves orders-of-magnitude CPU time; use `Read`/`Write`/`BufReader`/`BufWriter` deliberately.
- **Dependencies:** Part 8 ([Operating System Internals](#kernel-syscalls-processes)).

### Chapter 54 — Blocking, Non-Blocking, Multiplexed (`epoll`), and Async (`io_uring`) I/O
- **Subchapters:** Blocking I/O and kernel wait queues; Non-blocking I/O (`O_NONBLOCK` and `EAGAIN`); Readiness multiplexing (`select`, `poll`, Linux `epoll`, BSD/macOS `kqueue`); Completion-based I/O (`io_uring` shared submission/completion rings); Connecting OS readiness to Rust (`mio` and `tokio`); End-to-end trace of `std::fs::File::open` and `read` down to kernel VFS and storage hardware.
- **Topics covered:** C10K problem, edge-triggered vs level-triggered `epoll`, syscall-less submission via `io_uring`, Virtual File System (VFS) dispatch, tracing a complete file read.
- **Learning objectives:** Explain why one-thread-per-socket fails at high concurrency and how `epoll` / `io_uring` fix it; trace a Rust `File::read` call across user space, VFS, page cache, and DMA.
- **Dependencies:** [Standard Streams, Terminals, File Descriptors, and Buffering](#streams-fds-buffering).

**Practical experiments for Part 9:**
- Benchmark unbuffered single-byte `File::write` vs `BufWriter` in Rust and observe the dramatic syscall-count drop with `strace -c`.
- Inspect `/proc/self/fd` from Rust while opening and closing files and pipes, and trace `File::open` + `read_to_string` syscalls (`openat`, `statx`/`fstat`, `read`, `close`).

---

## Part 10 — CPU architecture and instruction execution

**Core question:** *Once machine code bytes reach the processor, how does modern silicon decode, predict, reorder, cache, synchronise, and vectorise those instructions?*

- **Chapters in this part:**
  1. [Instruction Set Architectures (x86-64 and ARM64), Opcodes, and Control Flow](#isa-opcodes-control-flow)
  2. [Pipelining, Branch Prediction, Superscalar, and Out-of-Order Execution](#pipelines-branch-prediction-ooo)
  3. [Hardware Caches, Coherency, Atomic Instructions, and SIMD](#cache-coherency-atomics-simd)

### Chapter 55 — Instruction Set Architectures (x86-64 and ARM64), Opcodes, and Control Flow
- **Subchapters:** What an ISA guarantees; CISC (x86-64) vs RISC (ARM64 / RISC-V); General-purpose registers and status flags (`RFLAGS` / `NZCV`); Instruction encoding, prefixes, and variable-length vs 32-bit fixed opcodes; Decoding into micro-ops ($\mu$ops); ALU operations and conditional branches (`cmp`, `test`, `jcc` / `b.eq`).
- **Topics covered:** ISA as hardware/software contract, load-store vs memory-operand architectures, decoding bottleneck, flags and conditional moves (`cmov`).
- **Learning objectives:** Contrast x86-64 and ARM64 register files and instruction encodings; explain how Rust `match`, `if`, and loops become flags-setting tests and jumps.
- **Dependencies:** Part 2 ([Assembly and Machine Code](#assembly-machine-code)), Part 7 ([Calling Conventions](#calling-conventions-execution)).

### Chapter 56 — Pipelining, Branch Prediction, Superscalar, and Out-of-Order Execution
- **Subchapters:** Instruction-level parallelism; Classical 5-stage pipeline (IF, ID, EX, MEM, WB) and hazards; Branch prediction (BTB, two-level predictors, misprediction pipeline flush); Superscalar execution ports; Out-of-order execution (register renaming, reservation stations, reorder buffer); How compiler optimisation and branchless Rust cooperate with hardware execution.
- **Topics covered:** Data/control/structural hazards, speculative execution, branch misprediction penalty (~15–20 cycles), ILP bottlenecks, sorted vs unsorted branching benchmarks.
- **Learning objectives:** Trace instructions moving concurrently through pipeline stages; explain why unpredictable branches stall modern CPUs; use branchless code or data ordering when appropriate.
- **Dependencies:** [Instruction Set Architectures, Opcodes, and Control Flow](#isa-opcodes-control-flow).

### Chapter 57 — Hardware Caches, Coherency, Atomic Instructions, and SIMD
- **Subchapters:** Multi-core L1/L2/L3 caches and the MESI coherency protocol. Store buffers and invalidation queues (why cores see reordered writes). Memory barriers (`MFENCE`, `DMB ISH`) and mapping Rust `Ordering` (`Relaxed`, `Acquire`, `Release`, `SeqCst`) onto x86-64 vs ARM64. Hardware atomic instructions (`LOCK XADD`, `LOCK CMPXCHG`, ARM LL/SC vs LSE). SIMD vector lanes (`SSE`/`AVX`/`NEON`) and Rust auto-vectorisation. False sharing on 64-byte cache lines.
- **Topics covered:** Why x86-64 TSO hides bugs that fail on ARM64, MESI invalidation storms, false sharing, SIMD throughput vs scalar loops, `std::is_x86_feature_detected!`.
- **Learning objectives:** Explain why memory ordering exists because of store buffers and invalidation queues; map Rust `Ordering` modes to x86-64 and ARM64 fences; detect and fix false sharing.
- **Dependencies:** [Pipelining, Branch Prediction, and Out-of-Order Execution](#pipelines-branch-prediction-ooo), Part 6 ([CPU Cache Hierarchy](#pointers-safety-caches)).

**Practical experiments for Part 10:**
- Run a sorted vs unsorted array conditional-sum benchmark in Rust to observe hardware branch-prediction penalties directly.
- Run a multi-threaded adjacent-counter vs cache-line-padded (`#[repr(align(64))]`) benchmark in Rust to observe MESI false sharing, and test compiler SIMD auto-vectorisation.

---

## Part 11 — Concurrency and asynchronous programming

**Core question:** *How do threads, atomics, mutexes, channels, futures, wakers, and async executors actually run across CPU cores and event loops?*

- **Chapters in this part:**
  1. [Threads: doing several things at once](#threads)
  2. [Shared state: `Arc`, `Mutex`, and atomics](#shared-state)
  3. [Async Rust: thousands of tasks at once](#async)
  4. [Concurrency and Async Internals: Futexes, State Machines, Pin, and Wakers](#concurrency-async-internals)
  5. [Project: a chat server](#project-chat)
  6. [Concurrency in practice: Rayon, Tokio, streams, HTTP clients, and tower](#async-ecosystem)

### Chapters in Part 11 (Summary, Dependencies & Objectives)
- **[Threads](#threads)** *(Deps: Part 8 & Part 10)* — `std::thread::spawn`, `JoinHandle`, `move` closures, MPSC channels, and `Send`.
- **[Shared state](#shared-state)** *(Deps: [Threads](#threads), [Caches & Atomics](#cache-coherency-atomics-simd))* — `Arc<T>`, `Mutex<T>`, `RwLock<T>`, deadlock prevention, `Condvar`, and `Atomic*` with `Ordering`.
- **[Async Rust](#async)** *(Deps: [Shared state](#shared-state), Part 9 [`epoll`](#blocking-epoll-io-uring))* — Cooperative multitasking, `Future`, `.await`, Tokio tasks, `join!`, `select!`, cancellation safety, and blocking vs async boundaries.
- **[Concurrency and Async Internals](#concurrency-async-internals)** *(Deps: [Async Rust](#async))* — How `Mutex` uses Linux `futex`; `Send`/`Sync` compile-time rules; how `rustc` transforms `async fn` into MIR enum state machines; `Pin<&mut T>` and self-referential frames; writing a real single-threaded executor using `RawWaker` + `RawWakerVTable`; Tokio's work-stealing scheduler, reactor (`epoll`), and timer wheel.
- **[Project: a chat server](#project-chat)** *(Deps: [Concurrency and Async Internals](#concurrency-async-internals))* — Concurrent TCP chat server with shared rooms and clean shutdown.
- **[Concurrency in practice](#async-ecosystem)** *(Deps: [Project: a chat server](#project-chat))* — Work stealing with Rayon, production Tokio patterns, async streams, HTTP clients, and `tower` middleware layers.

**Practical experiments for Part 11:**
- Build a working custom single-threaded `Future` executor from scratch in pure Rust using `RawWaker`, `RawWakerVTable`, and `Context`—with zero external crates!
- Trace thread creation (`clone`), mutex contention (`futex`), and Tokio task interleaving across CPU cores.

---

## Part 12 — Networking and communication

**Core question:** *How does a single HTTP request or byte stream travel from a Rust API through sockets, kernel `sk_buff` queues, TCP/IP, DNS, TLS, and network hardware?*

- **Chapters in this part:**
  1. [Network Fundamentals: OSI, TCP/IP, Ethernet, IP, and Routing](#network-layers-ethernet-ip)
  2. [TCP, UDP, BSD Sockets, and Kernel Networking](#tcp-udp-sockets-kernel)
  3. [DNS, HTTP, TLS, and End-to-End Request Tracing](#dns-http-tls-trace)
  4. [Web servers with Axum](#web)
  5. [Observability: logging, traces, metrics, and health](#observability)

### Chapters in Part 12 (Summary, Dependencies & Objectives)
- **[Network Fundamentals](#network-layers-ethernet-ip)** *(Deps: Part 9, Part 11)* — OSI 7-layer vs TCP/IP 4-layer encapsulation; Ethernet frames, MACs, and ARP; IPv4/IPv6 addressing, CIDR, loopback (`127.0.0.1`), routing tables, and NAT.
- **[TCP, UDP, BSD Sockets, and Kernel Networking](#tcp-udp-sockets-kernel)** *(Deps: [Network Fundamentals](#network-layers-ethernet-ip))* — UDP datagrams vs TCP reliable streams (3-way handshake, sequence/ACKs, sliding window, congestion control, `TIME_WAIT`); BSD sockets (`socket`, `bind`, `listen`, `accept`, `connect`, `send`, `recv`); kernel `sk_buff` queues, NIC ring buffers, and DMA interrupts; Rust `std::net` TCP/UDP experiments.
- **[DNS, HTTP, TLS, and End-to-End Request Tracing](#dns-http-tls-trace)** *(Deps: [TCP, UDP, BSD Sockets](#tcp-udp-sockets-kernel))* — DNS resolution (`/etc/hosts`, `/etc/resolv.conf`, UDP/53, `getaddrinfo`); HTTP/1.1 & HTTP/2 wire framing; TLS handshake, certificates, ECDHE, and AEAD encryption; complete end-to-end trace of a Rust HTTP request from user code through kernel TCP/IP and NIC hardware.
- **[Web servers with Axum](#web)** *(Deps: [DNS, HTTP, TLS](#dns-http-tls-trace), [Concurrency in practice](#async-ecosystem))* — Production HTTP routing, extractors, shared state, auth, rate limiting, and REST/gRPC/GraphQL.
- **[Observability](#observability)** *(Deps: [Web servers with Axum](#web))* — Structured JSON logging, async `.instrument()` spans, OpenTelemetry, Prometheus `/metrics`, and health probes.

**Practical experiments for Part 12:**
- Run a local Rust loopback `TcpListener` + `TcpStream` handshake and `UdpSocket` datagram exchange, observing socket file descriptors and `strace -e trace=network` syscalls.
- Construct and parse raw HTTP/1.1 wire bytes over `std::net::TcpStream` and inspect packet framing boundaries.

---

## Part 13 — Storage and file systems

**Core question:** *How do spinning platters, flash cells, filesystems, inodes, journals, and page caches make bytes survive power loss and feed high-speed databases?*

- **Chapters in this part:**
  1. [Persistent Storage: HDDs, SSDs, NVMe, and Block I/O](#storage-hardware-blocks)
  2. [File Systems, Inodes, Journaling, Page Cache, and `mmap`](#filesystems-cache-mmap)
  3. [Databases: SQL with SQLx, Diesel, and SeaORM](#databases)
  4. [Project: a link shortener with a web API and a database](#project-api)

### Chapters in Part 13 (Summary, Dependencies & Objectives)
- **[Persistent Storage: HDDs, SSDs, NVMe, and Block I/O](#storage-hardware-blocks)** *(Deps: Part 9, Part 1)* — HDD platters, tracks, sectors, and seek latency vs NAND flash pages, erase blocks, Flash Translation Layer (FTL), wear levelling, and NVMe queues; 512 B / 4 KB logical blocks and kernel block-layer DMA.
- **[File Systems, Inodes, Journaling, Page Cache, and `mmap`](#filesystems-cache-mmap)** *(Deps: [Persistent Storage](#storage-hardware-blocks), Part 6 [`Virtual Memory`](#virtual-memory-address-spaces))* — Superblocks, inodes, directory entries (dentries), extents, hard links vs symlinks, metadata (`stat`), crash consistency and journaling (WAL), kernel page cache, dirty writeback, `fsync` (`sync_all` / `sync_data`), `mmap` zero-copy file I/O, and Rust `std::fs` internals.
- **[Databases](#databases)** *(Deps: [File Systems, Inodes, Journaling](#filesystems-cache-mmap))* — Relational tables, B-trees/WAL on disk, SQLx bound queries, transactions, pools, migrations, and key-value stores.
- **[Project: a link shortener API](#project-api)** *(Deps: [Databases](#databases), [Web servers with Axum](#web))* — Full database-backed async Axum API tested end to end.

**Practical experiments for Part 13:**
- Inspect inode numbers (`ino`), link counts (`nlink`), block counts (`blocks`), permissions, and device IDs from Rust via `std::os::unix::fs::MetadataExt`.
- Observe `write` vs `sync_all()` (`fsync`) durability behaviour and trace `std::fs::OpenOptions` atomic rename patterns.

---

## Part 14 — Practical system programming with Rust

**Core question:** *How do we combine Cargo, profiling, debugging, binary inspection, and Linux interfaces to build, measure, and diagnose real systems software?*

- **Chapters in this part:**
  1. [Command-line tools with clap](#cli)
  2. [Performance: measure first, then improve](#performance)
  3. [Hands-On Linux System Programming and Inspection Lab](#linux-systems-lab)
  4. [Project: a personal library with a web API and a CLI](#capstone)

### Chapters in Part 14 (Summary, Dependencies & Objectives)
- **[Command-line tools with clap](#cli)** *(Deps: [Testing strategies](#testing-strategies), Part 9)* — Subcommands, streams, exit codes, piping, and signals in real CLI binaries.
- **[Performance](#performance)** *(Deps: Part 6, Part 10, [Cargo in depth](#cargo))* — Criterion benchmarking, flame graphs, `perf`, cache-friendly structs, custom allocators, and SIMD.
- **[Hands-On Linux System Programming and Inspection Lab](#linux-systems-lab)** *(Deps: Parts 1–13, [Performance](#performance))* — End-to-end practical lab manual and pure-Rust systems tools: `rustc --emit`, `objdump`, `readelf`, `nm`, `strace`, `ltrace`, `rust-gdb`/`lldb` register & stack dumps, `perf`, `valgrind`, and building a Rust `/proc` inspector + ELF64 header parser + TCP/allocator telemetry suite.
- **[Capstone Project](#capstone)** *(Deps: Parts 12–14)* — Workspace combining library crate, SQLite persistence, Axum HTTP service, and CLI.

**Practical experiments for Part 14:**
- Run the full Linux toolchain inspection workflow (`rustc --emit=mir,llvm-ir,asm`, `readelf`, `objdump`, `nm`, `strace`, `ltrace`, `gdb`, `perf`, `/proc`) on your own Rust systems utilities.
- Build a working pure-Rust ELF64 header parser and `/proc/self` memory/FD/status inspector in the terminal.

---

## Part 15 — Applied Rust ecosystem and next steps

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
1. **Parts 1–2** show what hardware is and how `rustc` turns source code into ELF machine binaries.
2. **Parts 3–5** teach the Rust language itself, from variables and ownership up to macros, `unsafe`, FFI and the standard library's internals.
3. **Parts 6–10** trace virtual memory, allocators, program launch, calling conventions, the Linux kernel, I/O syscalls, and modern CPU microarchitecture.
4. **Parts 11–15** apply that foundation to concurrency, async executors, TCP/IP networking, storage filesystems, Linux systems labs, and real-world software.
:::
