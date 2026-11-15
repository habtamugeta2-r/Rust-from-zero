@id end-to-end-trace
@part p5
@kind chapter
@title End-to-End Execution Trace: From Rust Source to Hardware
@short End-to-end 10-layer trace
@level intermediate
@time 35
@learn Trace two real lines of Rust across all 10 layers of the computing stack | Follow String::from("Habtamu") through MIR, LLVM IR, ELF .rodata, malloc, and Heap RAM | Follow println!("{}", name) through format_args, StdoutLock buffering, write(1, ...) syscall, kernel VFS/TTY, and terminal pixels | Connect every concept from Parts I through V into one unified mental model

We have reached the summit of the first half of the systems curriculum! In Part I we met transistors, bits, and CPUs; in Part II we traced `rustc`, MIR, LLVM, x86-64 machine code, and ELF; in Part III we mastered Rust ownership and `std` internals; in Part IV we explored virtual memory, allocators, and 64-byte cache lines; and in Part V we opened ELF startup and calling conventions.

Now let's watch **everything fire together** on just two ordinary lines of Rust:

```rust
fn main() {
    let name = String::from("Habtamu");
    println!("{}", name);
}
```

It looks effortless—eleven tokens and a macro. Underneath, all ten layers of your computer execute in perfect lockstep. Let's trace every single nanosecond and byte from source text to glowing pixels on your screen!

:::analogy Following a parcel from app tap to doorstep
When you tap "Order" on a phone, the screen hides ten separate organisations: the mobile app (`Rust source`), warehouse software (`MIR/LLVM`), barcoded container (`ELF sections`), city map (`Virtual Memory`), local courier (`glibc malloc`), driver relay (`CPU registers`), customs border (`syscall`), postal hub (`Linux Kernel VFS/TTY`), delivery van (`stdout pipe/PTY`), and your doorbell (`Terminal glyph rendering`). This chapter tracks our 7-byte parcel `"Habtamu"` across every checkpoint without skipping a single door.
:::

:::compare Mental model before vs after this trace
| Statement | Naive surface view | Complete 10-layer reality |
|---|---|---|
| `"Habtamu"` | A magic text literal appearing from thin air | 7 UTF-8 bytes `[48 61 62 74 61 6d 75]` stored inside ELF `.rodata` (read-only mapped page) |
| `String::from(...)` | "Creates a `String`" | Allocates 7 bytes via `GlobalAlloc` -> `malloc` -> `[heap]`/`mmap`, `memcpy`s 7 bytes from `.rodata`, builds 24-byte `(ptr, cap=7, len=7)` on stack/registers |
| `println!("{}", name)` | "Prints text to screen" | Builds static `Arguments` slice, locks `Stdout` (`ReentrantLock`), copies into 1024-byte `LineWriter` buffer, flushes on `\n` via `syscall` (`rax=1` `write(1, buf, 8)`) |
| `}` (closing brace) | "Variable goes out of scope" | `core::ptr::drop_in_place::<String>` passes `(ptr, Layout(7, 1))` to `dealloc` -> `free()` returns the 7-byte chunk to the thread-local bin! |
:::

## The 10-Stage Trace Map

:::note End-to-end execution of let name = String::from("Habtamu"); println!("{}", name);
```text
Stage 1  Source & AST      `let name = String::from("Habtamu"); println!(...);`
Stage 2  HIR & MIR         Macros expanded (`format_args!`), `Drop(name)` elaborated at `}`
Stage 3  LLVM IR & Opts    Inlines `String::from` -> `@__rust_alloc(7, 1)` + `@llvm.memcpy`
Stage 4  Machine Code      `mov edi, 7; call __rust_alloc; mov rdi, rax; ... syscall`
Stage 5  ELF Binary        `"Habtamu"` bytes `48 61 62 74 61 6d 75` packed into `.rodata`
Stage 6  Kernel & ld-linux `execve` maps `.text` (r-x), `.rodata` (r--); `lang_start` runs
Stage 7  Virtual Memory    `CR3` + TLB translate `RIP`, `[stack]`, `[heap]`, `.rodata` pages
Stage 8  Heap & Caches     `malloc(7)` pops 16/32B size-class slab; CPU loads 64B cache lines
Stage 9  Kernel Syscall    `syscall` (`rax=1`) traps Ring 3 -> Ring 0 `sys_write(fd=1, ...)`
Stage 10 Device & Terminal Kernel writes PTY/pipe -> terminal emulator draws Unicode glyphs!
```
:::

Let's walk through Stages 1–10 one by one with zero hand-waving.

## Stages 1–3: Source -> Macro Expansion -> MIR -> LLVM IR

1. **Macro expansion (`println!`):** Long before type checking, `rustc` expands `println!("{}", name)` into `std::io::_print(format_args_nl!("{}", name))`. `format_args_nl!` packs the static string pieces (`["", "\n"]`) into `.rodata` and creates a stack-allocated `core::fmt::Arguments` pointing to `name` via `&Display::fmt`—notice **zero heap allocation** happens inside `println!` itself!
2. **MIR & Borrow Checking:** In MIR, `String::from("Habtamu")` moves ownership into local slot `_1` (`name`). `println!` borrows `&_1` temporarily. Right after `_print` returns, NLL ends the borrow and MIR inserts `drop(_1)` before returning `()` from `main`.
3. **LLVM IR (`--release`):** LLVM sees `String::from(&'static str)` and inlines `str::to_owned`:
   - Calls `@__rust_alloc(i64 7, i64 1)` to reserve 7 bytes with 1-byte alignment.
   - Copies the 7 bytes from `@.str.0` (`"Habtamu"`) using `call void @llvm.memcpy(..., i64 7, ...)`. (Notice: LLVM sees a tiny constant length `7` and doesn't even call libc `memcpy`—it emits a 4-byte `mov`, 2-byte `mov`, and 1-byte `mov` directly!)

## Stages 4–6: ELF Sections, `execve()`, and Before `main()`

4. **Machine bytes & ELF sections:** Inside the compiled ELF executable on disk:
   - **`.rodata`** stores the literal UTF-8 bytes `48 61 62 74 61 6d 75` (`"Habtamu"`) plus `\n` (`0a`).
   - **`.text`** holds the compiled instructions of `main`, `std::io::_print`, `std::alloc::System`, and `drop_in_place::<String>`.
5. **`execve` & dynamic startup:** When launched, Linux maps `.text` (`r-xp`) and `.rodata` (`r--p`), runs `ld-linux` to resolve `malloc`/`free`/`write` in `libc.so.6`, builds the user stack (`argc`, `argv`, `envp`, `auxv`), and calls `std::rt::lang_start_internal`, which captures args, sets `SIGPIPE`, and invokes your `main`.

## Stages 7–8: Virtual Addresses, Heap Allocator & CPU Caches

Now your `main` runs at Ring 3 (user mode)! Watch how memory moves:

```rust run nocmp
fn main() {
    let literal: &'static str = "Habtamu";
    let name = String::from(literal);

    println!("literal in .rodata: {:p} (bytes={:02x?})", literal.as_ptr(), literal.as_bytes());
    println!("String  on [stack]: {:p} (24B header: ptr/cap/len)", &name);
    println!("buffer  on [heap] : {:p} (len={}, cap={})", name.as_ptr(), name.len(), name.capacity());
    println!("hello, {name}");
}
```

Trace every step of `let name = String::from("Habtamu");`:

- **CPU & [[TLB]]:** `main` starts executing from an L1i [[cache]] hit; its `RIP` virtual address translates via the TLB to `.text`'s physical frame.
- **Heap allocator:** `System::alloc(Layout::from_size_align(7, 1))` calls `malloc(7)`. `glibc`'s `ptmalloc2` (or `jemalloc`) checks the current thread's local cache (`tcache`) for the smallest size class (`16` or `32` bytes) and pops an already-mapped chunk from `[heap]` (returning an address like `0x55608aa662a0`) in ~15 nanoseconds—no kernel syscall needed when a bin already has free space.
- **[[Cache line|cache line]] transfer:** Copying the 7 bytes from `.rodata` into that heap address pulls the 64-byte `.rodata` cache line into L1d, writes `48 61 62 74 61 6d 75` into the heap buffer's 64-byte L1d cache line, and places `(ptr=0x556..., cap=7, len=7)` on the stack (or directly in CPU registers).

## Stages 9–10: `println!`, `write()` Syscall, Kernel & Terminal Screen

Now `println!("{}", name)` executes across six crisp steps:

1. **Formatting into `StdoutLock`:** `std::io::_print` locks the global `Stdout` (`ReentrantLock`) and formats `"Habtamu"` followed by `"\n"` into an internal `LineWriter` buffer (1,024 bytes by default).
2. **Line flush triggers a write:** Because `println!` ends with `\n` (`0x0a`), `LineWriter` flushes immediately by calling libc `write(1, buf_ptr, 8)`.
3. **Ring 3 -> Ring 0 transition:** On Linux x86-64, libc places `rax = 1` (`SYS_write`), `rdi = 1` (`stdout` [[file descriptor]]), `rsi = buf_ptr`, `rdx = 8`, and executes the **`syscall`** instruction (a [[system call]]). The CPU saves user `RIP` into `RCX`, switches privilege level from **Ring 3** (user) to **Ring 0** ([[kernel]]), and jumps to Linux's syscall entry handler.
4. **Inside the Linux kernel (`sys_write`):** The kernel verifies `fd == 1` in the process's file descriptor table, copies the 8 bytes safely (`copy_from_user`) into kernel memory, and writes them to whatever backs `fd 1`:
   - If writing to a **pseudo-terminal ([[PTY]])** (a normal terminal window), the kernel's TTY line discipline wakes the sleeping terminal emulator process (such as `xterm`, `Alacritty`, or VS Code's terminal).
   - If redirected (`./prog > out.txt`), the kernel copies the 8 bytes into the **[[page cache]]** (`ext4`/`tmpfs`) to be flushed asynchronously to SSD blocks.
5. **Terminal pixels:** Your terminal emulator reads the 8 UTF-8 bytes from the PTY master fd, decodes `H a b t a m u \n`, looks up font glyph outlines, rasterises them into your GPU framebuffer, and lights up pixels on your display.
6. **Cleanup (`drop(name)`):** Back in user space right before `main` exits, `Drop::drop(&mut name)` passes `ptr` and `Layout(7, 1)` to `System::dealloc`, which calls `free(ptr)` and returns the chunk back to the thread-local allocator bin. Finally, `lang_start_internal` returns `0` to `exit_group(0)`, and the Linux kernel tears down every page table and file descriptor of the process cleanly.

:::details Watch the bytes literally travel
Notice that at no point did `"Habtamu"` stop being 7 concrete bytes `[0x48, 0x61, 0x62, 0x74, 0x61, 0x6d, 0x75]`:

- Stored statically inside the ELF file on disk (`.rodata`)
- Mapped read-only in virtual memory by `execve`
- Copied into a heap slab inside L1d cache by `String::from`
- Copied across the Ring 3 / Ring 0 boundary by `sys_write(1, ..., 8)`
- Decoded as UTF-8 glyphs by the terminal program
:::

:::exercise guided Pinpointing where allocations and syscalls occur
In this loop, count how many **heap allocations** and how many **`write` syscalls** occur when running in a terminal:
```rust
for i in 0..5 {
    let s = String::from("ok");
    println!("{i}: {s}");
}
```
::hint
Remember `String::from("ok")` allocates each iteration and drops at the end of the loop body, while `println!` ends with `\n`!
::solution
- **Heap allocations:** `5` (`String::from("ok")` calls `alloc(2, 1)` and `dealloc(2, 1)` once per iteration, though all 5 typically reuse the exact same freed chunk in `tcache`!).
- **`write` syscalls:** `5` (when connected to an interactive terminal, `LineWriter` flushes on every `\n`—so `BufWriter<StdoutLock>` is much faster when printing thousands of lines!).
:::

:::exercise practice Measuring `LineWriter` vs `BufWriter` buffering
Explain how wrapping `std::io::stdout().lock()` inside `std::io::BufWriter::new(...)` slashes the number of kernel `syscall` transitions in tight printing loops, and verify it conceptually with a small runnable example using an in-memory `Vec<u8>` writer.
::hint
`LineWriter` flushes on every `\n`, triggering a syscall per line; `BufWriter` accumulates up to `8 KiB` before calling `write()` once!
::solution
```rust run
use std::io::{BufWriter, Write};

fn main() {
    let mut raw_bytes = Vec::new();
    {
        let mut bw = BufWriter::with_capacity(64, &mut raw_bytes);
        for i in 0..5 {
            writeln!(bw, "line {i}").unwrap();
        }
        // `bw.flush()` runs automatically on Drop (best practice: call bw.flush()? explicitly!)
        bw.flush().unwrap();
    }
    println!("buffered total bytes = {}", raw_bytes.len());
}
```
```output
buffered total bytes = 35
```
With `BufWriter`, all 5 `writeln!` lines accumulate in user-space memory and emit a **single** `write()` syscall instead of 5 separate Ring 3 -> Ring 0 kernel traps!
:::

:::exercise challenge Auditing every memory segment touched by `Hello`
Suppose `fn main()` runs `let name = String::from("Habtamu"); println!("{name}");`. Name which ELF/process virtual memory region (`.text`, `.rodata`, `[heap]`, `[stack]`, `libc.so.6`) holds each of these 5 items:
1. The CPU instructions of `main`
2. The UTF-8 literal `"Habtamu"` before `String::from` runs
3. The 24-byte `String` header `(ptr, cap, len)` (when spilled from registers)
4. The mutable copy of `"Habtamu"` owned by `name`
5. The implementation of `malloc()` and `write()` on standard `linux-gnu`
::hint
Match read-only code, read-only constants, dynamic mutable allocations, local frames, and shared libraries!
::solution
1. Instructions of `main` -> **`.text`** (`r-xp`)
2. Static literal `"Habtamu"` -> **`.rodata`** (`r--p`)
3. Local 24-byte `String` struct -> **`[stack]`** (`rw-p`, or CPU registers if kept in registers by LLVM)
4. Owned heap copy of `"Habtamu"` -> **`[heap]`** (`rw-p`)
5. `malloc()` and `write()` wrapper -> **`libc.so.6`** (`r-xp` mapped shared library)
:::

:::recap
- Even two simple lines (`String::from` + `println!`) traverse **all 10 layers** of software and hardware: source -> MIR -> LLVM -> machine code -> ELF -> `execve`/`ld-linux` -> page tables/TLB -> allocator/L1 cache -> `syscall` -> kernel VFS/TTY -> terminal glyphs.
- `"Habtamu"` starts as 7 read-only bytes in ELF **`.rodata`**, gets copied into a **`[heap]`** size-class bin via **`tcache`** inside L1d cache, travels across **Ring 3 -> Ring 0** in a **`write(1, ...)`** syscall, and is freed by **MIR-inserted `Drop`** before `exit_group(0)`.
- Knowing every layer removes all mystery: you now know **why** buffering (`BufWriter`), cache locality, stack vs heap, and allocator size classes matter.
:::

:::quiz Check your understanding
? In `let name = String::from("Habtamu");`, where do the original 7 UTF-8 bytes `"Habtamu"` reside before `String::from` executes?
- Generated dynamically by `malloc`
+ In the ELF executable's `.rodata` segment, mapped read-only into virtual memory
- Inside CPU register `RDI`
- Inside `/proc/self/maps`
= String literals are baked into `.rodata` at compile time and mapped read-only (`r--p`) when the program starts.

? Does `println!("{}", name)` allocate on the heap for formatting in normal cases?
- Yes, it always allocates a temporary `String`
+ No: `format_args!` builds a stack-allocated `Arguments` struct pointing directly to static pieces in `.rodata` and `&name`, writing into `Stdout`'s reusable `LineWriter` buffer
- Yes, one `malloc` per `{}` placeholder
- Only on Windows
= Unlike `format!`, `println!` avoids intermediate heap allocations by streaming straight through `core::fmt::Arguments`.

? What privilege boundary does `println!` cross when `LineWriter` encounters `\n` and calls `write(1, ...)`?
- L1 cache to L2 cache
+ Ring 3 (user space) to Ring 0 (kernel space) via the `syscall` instruction
- `.rodata` to `.text`
- `core` crate to `alloc` crate
= Writing to file descriptor `1` requires kernel privileges, triggered via the `syscall` instruction (`rax = 1` on Linux x86-64).

? What cleans up `name`'s 7-byte heap buffer at the end of `main()`?
- The Linux kernel garbage collector
- A background reference-counting thread
+ Compiler-inserted `drop_in_place::<String>` (elaborated in MIR), which calls `System::dealloc` -> `free()`
- Nothing, because `main()` is exiting anyway
= Rust statically elaborates `Drop` calls before returning from `main()`, invoking `dealloc` with `Layout(7, 1)`.
:::
