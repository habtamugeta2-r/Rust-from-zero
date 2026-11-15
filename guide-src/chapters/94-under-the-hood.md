@id under-the-hood
@part app
@kind appendix
@title From source to silicon: under the hood
@short From source to silicon
@level advanced

This appendix is for readers who want the last layer of the story. [Chapter 8](#memory) introduced the stack and the heap. [Chapter 40](#memory-layout) showed how individual values are arranged byte by byte. This page takes the remaining step: what the compiler does between your source text and a running program, what the operating system does to start it, and what the processor does with each instruction once it is running.

Everything here is simplified. Real compilers are vast, and both `rustc` and LLVM change with every release. The names of the stages, the order in which they run, and the ideas they embody are stable, and this page sticks to those. Where the details depend on the version, the machine or the optimisation level, it says so.

:::analogy A factory with conveyor belts
Picture a factory that turns raw steel into a finished car. No single worker builds the car. Instead there is a row of stations, each of which does one small, well-understood job: cut, weld, paint, polish. Each station takes the output of the previous one and passes its own output on. If a station rejects the material, the car is never built, and the station says exactly what was wrong. A compiler is that factory. Your source text goes in at one end, and a runnable program comes out at the other, with checks at every station along the way.
:::

## The journey in one picture

Here is the whole route a Rust program travels, from the characters you type to the electrical signals in the processor:

```text
  your source code (.rs files)
        │
        ▼
  ┌──────────────────┐  characters → tokens
  │  Lexing          │  "let x = 42;" becomes [let] [x] [=] [42] [;]
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  tokens → tree
  │  Parsing         │  a tree that mirrors the structure of the code
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  resolve names, lower to core forms,
  │  HIR             │  type-check and infer types
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  simple control-flow graph
  │  MIR             │  ★ the borrow checker runs here
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  Rust hands over to LLVM here
  │  LLVM IR         │  heavy optimisation: inlining, vectorisation
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  actual instructions for one processor family
  │  Machine code    │  x86-64, ARM64, RISC-V, WebAssembly…
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  join with the standard library and
  │  Linking         │  any libraries, fix up addresses
  └────────┬─────────┘
           ▼
  ┌──────────────────┐  the OS maps it into memory, makes a stack,
  │  Loading & run   │  and the first instruction executes
  └──────────────────┘
```

Each station is explained below, in order.

## 1. Lexing: text becomes tokens

The first station reads the raw characters of your file and groups them into **tokens**: the smallest meaningful pieces. For this line:

```text
let answer = 40 + 2;
```

lexing produces, in effect:

```text
[let]  [answer]  [=]  [40]  [+]  [2]  [;]
```

Comments are dropped. Whitespace is only kept where it separates tokens. A mistake such as an unfinished string is caught here, at the very first station.

## 2. Parsing: tokens become a tree

The parser groups the tokens into a tree called the **abstract syntax tree**, or AST. "Abstract" means it keeps the structure that matters and drops the punctuation that only guided the reader. The expression `40 + 2` becomes a tree with `+` at the top and `2` under each operand, and a whole file becomes a tree of items: functions, structs, `use` declarations and so on.

If you manage to break the grammar — a missing bracket, a stray `;` — this is the station that stops the build, with a message about what it expected and what it found instead.

## 3. HIR: desugaring, name resolution and types

The AST is lowered to the **higher-level intermediate representation** (HIR). This is where Rust's friendly syntax is expanded into a smaller core language:

- a `for` loop becomes a call to `.into_iter()`, a `match` on `.next()` and a loop,
- a `?` after an operation becomes a `match` that returns early on error,
- `println!("{name}")` becomes a call to a formatting function,
- method calls, operator overloads and `..` ranges are expanded into the traits that implement them.

Two jobs then happen here:

1. **Name resolution.** Every identifier is matched with the item it refers to: which `x`, which `len`, which `Vec`, from which module or crate. After this stage no name is ambiguous.
2. **Type checking and inference.** Every expression is given a type. When you write `let x = 3 + 4;` and never say what `x` is, the compiler works out `i32` from the operators. Generics are checked once, against their trait bounds, and the compiler reports problems at the definition site rather than inside some caller far away.

Generic functions are also turned into ordinary ones here or immediately afterwards. As [chapter 19](#generics) explains, a call to `largest(1, 2)` with integers and another with floats become two separate, monomorphised bodies — one per concrete type — copied into the program with every generic occurrence rewritten to a concrete type. That is why generics have no run-time cost, and why a heavily generic library can grow a binary.

## 4. MIR: the level the borrow checker uses

The HIR is lowered again to the **mid-level intermediate representation** (MIR). MIR is a small language of basic blocks: flat lists of simple statements with explicit jumps between them, with no expressions nested inside expressions. Everything has a known place (a temporary or a local) and a known type.

Why does Rust need such a restricted form? Because it is the representation the compiler's most important analysis works on.

- **The borrow checker runs on MIR.** It computes, for every point in the control-flow graph, which borrows of each value are still live, and rejects the program if a mutable borrow overlaps any other borrow of the same value, if a borrow outlives its value, or if a moved value is used. Since Rust 2018, borrows end at their last use, not at the closing brace — this is the *non-lexical lifetimes* rule, and MIR is what makes it possible: the analysis follows the flow of the graph, not the shape of the source.
- **Drop order is decided on MIR.** While `rustc` translates MIR for code generation, it inserts the calls that run destructors — the exact point where `drop` would run for each local — so the clean-up code from [chapter 9](#ownership) is not something you wait to happen at run time; it is spelled out in the program the compiler builds.
- **MIR is also where the optimiser does its early clean-up**: inlining small functions, propagating constants, removing code whose result is never used.

Here is a borrow-tracking trace like the one the compiler computes, for a small function:

```text
fn example() {
    let mut data = vec![1, 2, 3];
    let r1 = &data;
    let r2 = &data;
    println!("{} {}", r1[0], r2[0]);
    let r3 = &mut data;
    r3.push(4);
    println!("{data:?}");
}
```

| Program point | Live borrows | Allowed? |
|---|---|---|
| `let r1 = &data;` | r1 (shared) | yes |
| `let r2 = &data;` | r1 (shared), r2 (shared) | yes — any number of shared borrows may coexist |
| `println!("{} {}", r1[0], r2[0]);` | r1, r2 (last use) | yes — reading while shared borrows are alive |
| after the `println!` | none — r1 and r2 are dead | — |
| `let r3 = &mut data;` | r3 (exclusive) | yes — no other borrow is live |
| `r3.push(4);` | r3 (exclusive) | yes |

If the final `println!` tried to use `r1` again, the borrow checker would see a shared borrow live at the same point as the exclusive borrow `r3`, and reject the program. Nothing here happens at run time: the check is a compile-time analysis of the graph. See [chapter 10](#borrowing) and [chapter 21](#lifetimes) for how this feels from the programmer's side.

## 5. LLVM IR: Rust hands over to a second compiler

Once MIR has been optimised and borrows are proven fine, `rustc` translates the rest to **LLVM IR**. LLVM is a separate, general-purpose compiler infrastructure that many languages use (Swift, Julia, Clang and others). It does not know Rust exists; it knows about typed, SSA-form (each value assigned exactly once) intermediate code and how to turn it into fast machine code for many processors.

LLVM is responsible for the heavy, architecture-aware optimisation passes: inlining decisions made with real cost models, **vectorisation** (turning a scalar loop into one that processes several elements per instruction), loop unrolling, reassociation of arithmetic, instruction scheduling and register allocation. The division of labour is roughly: `rustc` understands Rust, LLVM understands processors.

For this function:

```text
fn square(x: i32) -> i32 {
    x * x
}
```

LLVM IR looks roughly like this (schematic, not literal output):

```text
define i32 @square(i32 %x) {
entry:
  %result = mul i32 %x, %x
  ret i32 %result
}
```

## 6. Machine code: what the processor actually runs

LLVM emits machine code for one concrete target: `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`, `wasm32-unknown-unknown`, and so on. The instruction selection and encoding differ per target, and the exact bytes `rustc` picks vary with the version and the optimisation level, so treat the following as *one plausible result*, not a promise:

```text
square:
    mov     eax, edi        ; first argument (x) is in EDI; copy it to EAX
    imul    eax, edi        ; EAX = EDI × EAX   (x * x)
    ret                     ; return to the caller; result is in EAX

bytes:  89 F8   0F AF C7   C3
```

Six bytes of machine code. The numbers and the names are different things: the processor only ever sees the bytes. `89 F8` *is* "move EDI into EAX"; the disassembler prints the friendly names for you.

A few observations worth internalising:

- **Registers, not memory.** The arguments and the result travel in registers — the processor's tiny, blisteringly fast storage — not in memory. Reading or writing a register costs under a nanosecond; reading main memory can cost around a hundred nanoseconds.
- **Position within the call.** On the System V ABI used on Linux and macOS, the first integer argument goes in `RDI`, the second in `RSI`, then `RDX`, `RCX`, `R8`, `R9`, and the integer return value comes back in `RAX`. (Windows uses a different convention: `RCX`, `RDX`, `R8`, `R9`.) `EDI`, `ESI`, `EAX` are the 32-bit halves of those registers. See [chapter 39](#ffi) for why the ABI matters when Rust calls C.
- **64-bit registers share names.** Each general-purpose register is one 64-bit cell with narrower windows onto it: `RAX` (64 bits) contains `EAX` (32) contains `AX` (16) contains `AH` and `AL` (8 bits each). Writing `EAX` zeroes the top half of `RAX`.

## 7. The linker: many pieces become one program

Compilation happens one **crate** at a time, and each crate compiles separately into an **object file**: machine code plus a table of the symbols it defines and the symbols it needs from elsewhere. The **linker** is the tool that joins them, together with the Rust standard library (`libstd`) and any native libraries, into the single executable file:

- it matches every "needed" symbol with the file that defines it,
- it assigns final addresses,
- it lays out the sections of the file,
- on Unix it can also leave a program unloadable until its dynamic dependencies are found.

On Linux the result is an ELF file: a header, the `.text` section (your machine code), `.rodata` (string literals and other constants built into the binary), `.data` (initialised global variables), `.bss` (uninitialised globals, zeroed at load), a symbol table and optional debug information. String literals such as `"hello"` live in `.rodata` of the binary, which is why a `&str` literal can borrow from the program image itself. See [chapter 34](#cargo) for how build profiles (`dev` vs `release`) change what the optimiser is allowed to do before this stage.

:::compare How other languages get to a runnable program
- **C and C++** use essentially the same pipeline: C source → machine code → link. Rust's contribution is stations 3 and 4 — the type and borrow analysis — and LLVM, which Rust shares (Clang also targets LLVM).
- **Go** has its own integrated compiler and does not go through LLVM. It produces machine code directly and links statically by default, which is why Go binaries are self-contained.
- **Java and C#** compile to bytecode for a **virtual machine** (the JVM or the CLR). The program you ship is not processor machine code; the VM compiles hot paths to machine code while the program runs (JIT compilation).
- **Python, Ruby and JavaScript** engines also compile to bytecode and interpret it, or JIT-compile it, at run time. Nothing is checked before the program is handed to the user.
Rust gives you ahead-of-time machine code with all checks done at compile time: the speed profile of C, with the safety analysis done before anyone runs the program.
:::

## 8. What the operating system does when you run the program

Typing `cargo run` (or `./myprogram`) starts a chain of events before your first instruction:

1. The **kernel** reads the executable's header and checks it is a program for this machine.
2. It creates a **virtual address space** for the process and maps the file's sections into it: instructions read-only, constants read-only, data and stack writable.
3. It creates an empty **heap** bookkeeping structure (the allocator gets memory from the OS on demand, via `mmap`-like system calls) and an **8 MB stack** for the main thread (spawned threads default to 2 MB).
4. It loads any shared libraries the program depends on, fixes up the addresses that depend on where things landed, and sets the instruction pointer to the entry point: usually a small C runtime stub called `_start`.
5. `_start` sets up the stack and calls the Rust runtime, which initialises the global allocator and the panic handler, spawns the main thread, and finally calls `main`.
6. When `main` returns, the destructors of the remaining locals have already run. The exit code goes back to the OS, and the OS gives back *all* of the process's memory — even memory the program leaked on purpose.

### Virtual memory in one paragraph

The addresses your program uses are **virtual**. Each process believes it has the whole 64-bit range to itself, but those numbers are indices into page tables maintained by the operating system and consulted by a hardware unit called the **memory management unit** (MMU) on every memory access. The unit of mapping is a **page**, typically 4 KB. Two processes can both use address `0x7ffe…` and mean different physical RAM, because their page tables differ. Pages can be marked read-only, can be shared between processes (code pages usually are), and can live in a swapped-out file instead of RAM. The stack overflows you met in [chapter 8](#memory) are caught precisely this way: the OS leaves an unmapped **guard page** at the end of the stack, and the first write into it triggers a page fault that kills the program.

## 9. Fetch, decode, execute: the processor's three-beat heartbeat

Once the program is running, the processor repeats the same cycle billions of times per second:

```text
  ┌────────┐     ┌────────┐     ┌─────────┐     ┌─────────┐
  │ FETCH  │ ──▶ │ DECODE │ ──▶ │ EXECUTE │ ──▶ │ WRITEBACK│
  │ read   │     │ turn   │     │ ALU,    │     │ store    │
  │ bytes  │     │ bytes  │     │ load/   │     │ result   │
  │ at RIP │     │ to     │     │ store,  │     │ in a     │
  │        │     │ micro- │     │ branch  │     │ register │
  └────────┘     │ ops    │     └─────────┘     └─────────┘
                 └────────┘
        RIP = the instruction pointer: the address of the next instruction
```

- **Fetch** reads the bytes at the address in `RIP` (the instruction pointer). If those bytes are in the L1 instruction cache, this costs about a nanosecond; a miss can cost a hundred times that.
- **Decode** turns the bytes into internal micro-operations. This is where `89 F8` becomes "copy EDI to EAX".
- **Execute** does the work. An integer addition runs in the ALU — an adder circuit built from gates (a one-bit full adder takes two bits and a carry in, and produces a sum and a carry out; 32 or 64 of those carry chains add any integer, though real chips use faster carry-lookahead wiring). A memory instruction asks the memory hierarchy instead.
- **Writeback** puts the result in the destination register and updates the flags in `RFLAGS` (zero, carry, sign, overflow…), which the next conditional branch will read.

Modern processors pipeline these stages and run several instructions through them at once, finish instructions out of order when dependencies allow, run 4–6 instructions per clock cycle, and **predict** the direction of every branch so the pipeline never stalls waiting for `if`s. This is invisible to your Rust code, but it is why tight loops and predictable branches are fast.

Caches make all of this worthwhile: L1 (≈32–64 KB per core, about 1 ns), L2 (≈256 KB–1 MB, a few ns), L3 (shared, megabytes, ≈10–20 ns), then main memory (≈50–100 ns). Every level is smaller and faster than the next. See [chapter 40](#memory-layout) for how layout decisions (`Vec` vs linked list, struct of arrays) are really decisions about this hierarchy.

## 10. A complete trace: one line, all the way down

Here is the smallest interesting program in this guide's world, traced from source to silicon. It is a trace of *typical* behaviour — your machine will differ in the small print.

```text
fn main() {
    let mut numbers = Vec::with_capacity(3);
    numbers.push(10);
    numbers.push(20);
    numbers.push(30);
    let sum: i32 = numbers.iter().sum();
    println!("Sum = {sum}");
}
```

| # | Layer | What happens |
|---|---|---|
| 1 | Source | `cargo run` finds the crate; `rustc` starts on it |
| 2 | Tokens/AST | the file is lexed and parsed; `main` is a tree of statements |
| 3 | HIR | names resolved; `push`/`iter`/`sum` bound to their impls |
| 4 | MIR | borrows of `numbers` verified; calls to `drop(Vec)` inserted at the end of `main` |
| 5 | LLVM | the three `push` calls, the sum loop and the format are inlined and optimised |
| 6 | Machine code | push allocates: a call to the allocator for 12 bytes (3 × `i32`); the elements are stored with plain `mov`s |
| 7 | Stack (runtime) | `numbers` is a 24-byte record on the stack: pointer, length 3, capacity 3 |
| 8 | Heap (runtime) | twelve bytes hold `0A 00 00 00 14 00 00 00 1E 00 00 00` |
| 9 | CPU | the loop loads three 4-byte values, adds them in a register: 60 |
| 10 | CPU | the number 60 is converted to the characters `6` and `0`; the bytes are handed to the OS with a `write` system call |
| 11 | Runtime | `numbers` goes out of scope; the allocator is asked to free the 12 bytes |
| 12 | OS | `main` returns; the kernel reclaims the whole address space; the exit code goes to the shell |

The interesting part is not any single step but the agreement between them: the layout rules from [chapter 40](#memory-layout), the ownership rules from [chapter 9](#ownership), and the machine the OS hands to your program all match, so the compiler can insert clean-up code with no reference counting, no garbage collector and no run-time checks for ownership.

## 11. Where the time goes

Reading this appendix gives you the map; [chapter 51](#performance) shows how to drive on it. The short version, from slowest to fastest:

| Step | Rough cost |
|---|---|
| Network or disk | milliseconds to seconds |
| System call into the kernel | microseconds |
| Heap allocation (allocator + possible OS work) | ~100 arithmetic operations or so |
| Main memory access | ~50–100 ns |
| L3 / L2 / L1 cache hit | ~10–20 / ~3–5 / ~1 ns |
| Register access and arithmetic | under 1 ns |

Two habits follow from this table: allocate as rarely as you can (reserve capacity in advance, reuse buffers), and touch memory in the order it is laid out.

## Exercises

:::exercise guided Trace one statement through the stations
Take the statement `let double = value * 2;` from a program that compiles. For each station in the picture at the top of this page, write one sentence saying what happens there for this statement.
::hint
Walk the stations in order: lexing, parsing, HIR, MIR, LLVM, machine code. You do not need to know what the final bytes are — describe the *job* of each station for this one line.
::solution
- **Lexing:** the characters become the tokens `let`, `double`, `=`, `value`, `*`, `2`, `;`.
- **Parsing:** the tokens form a statement tree: a `let` whose name is `double` and whose value is a multiply tree with `value` and the literal `2`.
- **HIR:** `value` is resolved to the local it names; the multiply is checked to be an `i32` (or whatever the types work out to); the statement is kept, desugared to its core form.
- **MIR:** the multiply becomes a statement `_1 = Mul(_2, const 2_i32)` on a basic block; the borrows of `value` (none here, unless it is a reference) are checked; the place `_1` is bound to `double`.
- **LLVM:** the multiply is turned into `mul i32` in SSA form and optimised — here there is nothing to optimise away, so the instruction stands alone.
- **Machine code:** the multiply and the store to `double`'s slot are emitted for the target processor, using registers where possible.
:::

:::exercise practice Read the assembly
A release build of a small function produced the listing below. Without looking it up, work out what the function does and what type its argument is.

```text
mystery:
    lea    eax, [rdi + rdi]    ; EAX = address arithmetic used as addition
    ret
```

What is `mystery` computing? What is the type of its parameter, and why is `lea` used for addition here?
::hint
`lea` computes an address, but the address arithmetic is also a convenient way to do an addition without the multiply unit. The return value travels in `EAX`, and the first argument arrives in `EDI`.
::solution
`mystery` doubles its argument: `EAX = RDI + RDI`, which is `2 × EDI`. The parameter is a 32-bit integer (`i32` or `u32`), because a 32-bit value is returned in `EAX` and the first integer argument arrives in `EDI`/`RDI`. `lea` ("load effective address") does the addition in the address-generation unit instead of the multiplier, so the instruction can retire faster and keep the `imul` port free. The exact choice of instruction does not change what your Rust program means — that is the point of having a compiler.
:::

:::exercise challenge Order and explain the boot sequence
The events of a program launch below are shuffled. Put them in order, and for each one say which layer performs it (kernel, loader, C runtime or Rust runtime).

1. The global allocator is initialised and the main thread is spawned.
2. The kernel maps `.text`, `.rodata`, `.data` and `.bss` into a fresh address space.
3. `main` runs.
4. `_start` sets up the stack and calls into the Rust runtime.
5. The exit code is delivered to the shell, and all process memory is reclaimed.
6. The kernel sets the instruction pointer to the entry point and jumps to it.
7. Shared libraries are loaded and address fix-ups are applied.
::hint
Work from the outside in: the kernel does the raw memory work first, then the tiny runtime stubs set up a world the Rust runtime can live in, and only then does your code run.
::solution
The order is 2, 7, 6, 4, 1, 3, 5.

2. **Kernel** — creates the address space and maps the program's own sections.
7. **Kernel/loader** — loads shared libraries and applies relocations so addresses are correct.
6. **Kernel** — transfers control to the entry point (`_start`).
4. **C runtime** — sets up the initial stack frame and calls the Rust runtime.
1. **Rust runtime** — initialises the allocator and panic handling, spawns the main thread.
3. **Your code** — `main` runs.
5. **Kernel** — once `main` returns and exit runs, every page of the process is given back.

A leaked `Box` is reclaimed at step 5 along with everything else: the kernel destroys the whole address space, so leaks cannot outlive the process.
:::

## A few honest caveats

:::note Simplified on purpose
- The exact stage names and the boundaries between them move between `rustc` releases. The pipeline view — lex, parse, type-check, borrow-check on MIR, LLVM, link — is the stable shape.
- The assembly and the byte encodings shown here are one plausible output of one compiler at one optimisation level. `cargo build --release` after a compiler upgrade may legitimately produce different instructions with identical behaviour.
- Cost figures (nanoseconds, sizes) are ballpark values for typical server and desktop hardware of the mid-2020s, not specifications.
- This page omits const evaluation, trait coherence, drop elaboration details, incremental compilation and query caching. The authoritative, always-current account is the [rustc dev guide](https://rustc-dev-guide.rust-lang.org/), which is aimed at compiler contributors but is readable with the background from this appendix.
:::

:::recap
- Rust compiles in stations: lexing → parsing → HIR (names and types) → MIR (the borrow checker's graph) → LLVM IR (heavy optimisation) → machine code → linking.
- The borrow checker is a compile-time analysis of the MIR control-flow graph, not a run-time mechanism. Drops are inserted into the program the compiler builds.
- LLVM is a separate optimiser shared with other languages; it handles inlining, vectorisation, instruction scheduling and register allocation.
- The linker joins your crates with the standard library into one executable (ELF on Linux, Mach-O on macOS, PE on Windows).
- The operating system gives each process a private virtual address space, mapped in 4 KB pages by the MMU; a guard page at the end of the stack turns runaway recursion into a page fault and a clean stop.
- The processor fetches, decodes, executes and writes back, using registers and caches; data laid out in the order it is read is almost free after the first access.
- None of the ownership machinery costs anything at run time — that is what ahead-of-time checking buys you.
:::

:::quiz Check your understanding
? At which level does the borrow checker do its work?
- On the tokens, while lexing
- On the AST, right after parsing
+ On MIR, after the code has been lowered to a control-flow graph
- Inside LLVM, after optimisation
= The borrow checker analyses the basic blocks and the flow of values through them. Source-level scoping is only a hint; MIR is what the compiler actually checks.

? What does the `ret` instruction do?
- Returns a value to a variable
- Jumps to the start of the function
+ Pops the return address off the stack into the instruction pointer
- Frees the stack frame
= `call` pushed the address after the call site on the stack; `ret` takes it back into `RIP`, so execution continues right after the call.

? Why can `rustc` insert calls to destructors with confidence, without reference counting or a GC?
+ Because MIR records the exact point each local's last use and scope ends, and the whole program is checked
- Because the operating system tells the compiler where allocations happened
- Because `Drop` is not allowed to fail
- Because the heap is empty at start-up
= The compiler knows the ownership tree of the program statically, so it can spell out exactly when each value dies. The checks happen before the program runs.

? A `&str` literal such as `"hello"` is borrowed from where?
- The stack of `main`
- A temporary heap allocation
+ The read-only data section (`.rodata`) of the program, mapped read-only by the OS
- The thread-local storage area
= Literal text is baked into the binary, so borrowing it costs nothing and it lives as long as the program does.

? Two processes both use address `0x7ffe_0000`. Why is this not a clash?
- Because only one process can be running at a time
+ Because the MMU translates each process's virtual page numbers through its own page tables to different physical RAM
- Because addresses are copied between processes
- Because that address is reserved for the kernel
= Virtual memory is per-process. The hardware walk of the page table is what makes the separation real, and it is enforced on every memory access.
:::
