@id calling-conventions-execution
@part p5
@kind chapter
@title Stack Frames, Calling Conventions & How Rust Actually Executes
@short Stack frames & calling ABI
@level intermediate
@time 30
@learn Trace System V AMD64 and AAPCS64 (ARM64) register passing rules | Distinguish caller-saved (volatile) vs callee-saved (non-volatile) registers across calls | Follow stack alignment (16 bytes), prologues/epilogues, red zones, and leaf-function optimisations | Understand Rust's default ABI vs #[repr(C)] / extern "C" and how ? / Option / Vec lower to machine instructions

When Rust calls `compute(1, 2, 3, 4, 5, 6, 7)`, the compiler follows a calling convention: rules for passing arguments, returning values and preserving registers. Those rules vary by target and ABI; some values travel in registers and others in memory. This chapter compares Rust's native convention with `extern "C"` and traces a call from source to machine instructions.

Every architecture specifies an **ABI (Application Binary Interface)**—the machine-level treaty stating which registers carry arguments, which hold return values, who preserves which registers across a `call`, and how the stack pointer (`RSP` / `SP`) stays aligned.

:::analogy Passing batons in a relay race
If Runner A and Runner B did not agree beforehand which hand holds the baton and which pockets must stay untouched, they would drop the baton or overwrite each other's stopwatch on every handoff. An **ABI** is that rigid contract between caller function and callee function so compiled object files—even compiled years apart in Rust, C, and assembly—cooperate seamlessly.
:::

:::compare System V AMD64 (Linux/macOS x86-64) vs AAPCS64 (ARM64)
| ABI Rule | System V AMD64 (Linux x86-64) | AAPCS64 (Linux/macOS ARM64) |
|---|---|---|
| Integer/pointer args `1..6` | `RDI`, `RSI`, `RDX`, `RCX`, `R8`, `R9` (`1..6`) | `X0..X7` (`1..8` args in registers!) |
| Float/SIMD args | `XMM0..XMM7` (8 args) | `V0..V7` (`D0..D7` / `S0..S7`) |
| Integer/pointer return | `RAX` (and `RDX` for 16-byte pairs like `(u64, u64)`) | `X0` (and `X1` for 16-byte pairs) |
| Return address storage | Pushed onto stack by `call` (`[RSP]`) | Stored in Link Register **`X30` (`LR`)** (fast leaf calls skip stack!) |
| Stack alignment | `16`-byte aligned *before* `call` (`RSP % 16 == 8` upon entry) | Always `16`-byte aligned (`SP % 16 == 0`) enforced in hardware! |
| Callee-saved registers | `RBX`, `RBP`, `R12..R15` | `X19..X28`, `X29` (`FP`), `X30` (`LR`), `D8..D15` |
:::

## Inside a real Linux x86-64 stack frame

Suppose we compile a 7-argument function in release mode (`rustc -C opt-level=3`) using the standard C [[ABI]]:

```rust run
#[unsafe(no_mangle)]
pub extern "C" fn compute(
    a: i32, b: i32, c: i32, d: i32, e: i32, f: i32, g: i32,
) -> i32 {
    a + b + c + d + e + f + g
}

fn main() {
    println!("compute(1..=7) = {}", compute(1, 2, 3, 4, 5, 6, 7));
}
```
```output
compute(1..=7) = 28
```

Disassembling `compute` on Linux x86-64 (`objdump -d -M intel`) reveals just seven instructions:

```asm
<compute>:
    add    edi, esi               ; arg1 (RDI) += arg2 (RSI)
    add    edi, edx               ; += arg3 (RDX)
    add    edi, ecx               ; += arg4 (RCX)
    add    edi, r8d               ; += arg5 (R8)
    lea    eax, [rdi + r9*1]      ; eax = sum(1..5) + arg6 (R9)
    add    eax, DWORD PTR [rsp+8] ; + arg7 pushed on stack above return address!
    ret                           ; return value lives in EAX/RAX
```

Notice three concrete facts in `<compute>`:

1. **Six arguments in registers, zero stack writes:** Arguments `1..6` arrive straight in `edi`, `esi`, `edx`, `ecx`, `r8d`, `r9d`.
2. **Where did arg 7 land?** Before `call compute`, the caller pushed `7` onto the [[stack]] (`push 0x7`) while maintaining 16-byte alignment (`sub rsp, 8` beforehand). Then the **`call`** instruction pushed the 8-byte return address on top of `[rsp]`, shifting arg 7 to **`[rsp + 8]`**.
3. **Leaf-function optimisation:** `<compute>` does not even execute `push rbp` or `sub rsp`. Because it calls no further functions and touches only scratch registers (`edi`, `eax`), it allocates zero stack space of its own and returns with a single `ret` (`0xc3`).

:::plain Caller-saved vs callee-saved registers
Registers are split into two teams so functions do not have to save all 16 registers on every tiny call:

- **Caller-saved (scratch) registers** (`rax`, `rdi`, `rsi`, `rdx`, `rcx`, `r8`–`r11`): any called function may overwrite them freely. Great for temporary math!
- **Callee-saved (preserved) registers** (`rbx`, `rbp`, `r12`–`r15`): if a called function touches one, it **must** save the old value on the stack first and restore it before `ret`. Callers keep long-lived variables here across function calls.
:::

Now contrast what happens in a non-leaf caller `<main>` that calls `malloc` and then `compute`:

```asm
<main>:
    push   r14              ; save callee-saved R14
    mov    edi, 0x40        ; arg1 = 64 bytes for malloc
    push   r13              ; save callee-saved R13
    push   r12
    push   rbp
    push   rbx
    sub    rsp, 0x110       ; allocate local stack frame + align RSP to 16 bytes
    ...
    call   malloc@plt       ; RAX returns heap pointer; caller saves it in R13
    mov    r13, rax         ; R13 is callee-saved: later calls cannot clobber R13
```

Look at **`r13` vs `rax`**:

- **`rax` (`edi`, `esi`, `rcx`, ...)** are **caller-saved (volatile)**: any function you `call` is free to overwrite them.
- **`r13` (`rbx`, `rbp`, `r12`..`r15`)** are **callee-saved (non-volatile)**: because `<main>` needs `malloc`'s pointer to survive later calls to `printf` and `compute`, it parks that pointer safely in `r13`.

:::note Stack layout across a function call (x86-64 growing downward)
```text
High addresses
  ┌────────────────────────────────────────────┐
  │ Caller local variables                     │
  │ 7th argument (pushed by caller: [rsp+8])   │
  ├────────────────────────────────────────────┤ ◄── RSP % 16 == 0 right before `call`
  │ Return address (pushed by `call` -> [rsp]) │
  ├────────────────────────────────────────────┤ ◄── RSP % 16 == 8 on callee entry!
  │ Callee saved registers (push rbp, rbx...)  │
  │ Callee local variables (sub rsp, N)        │
  └────────────────────────────────────────────┘ ◄── Callee RSP % 16 == 0 again!
Low addresses  (stack grows DOWNWARD)
```
:::

:::details The x86-64 Red Zone (128 bytes below RSP!)
On Linux/macOS System V AMD64, user-space leaf functions can even use the **128 bytes directly below `RSP`** (`[rsp - 8]`, `[rsp - 16]`, ...) without subtracting `RSP`—the ABI promises OS signal handlers won't clobber that 128-byte **red zone**. (**Exception:** OS kernels and interrupt handlers MUST compile with `-C no-redzone` / `-mno-red-zone`, because CPU hardware interrupts push exception frames directly at `RSP` and would silently trample red-zone locals!)
:::

## How Rust features lower to machine code (`?`, `Option`, `Vec`, closures)

Nothing in Rust is magic once lowered past MIR into LLVM IR and machine code:

- **Returning `Result<T, E>` or `Option<T>` (`?`):** Rust passes small enums in two registers (`RAX` for discriminant `0=Ok/None` or `1=Err/Some`, `RDX` for payload—or even **one** register with niche optimisation, like `Option<NonNull<u8>>` where `RAX == 0` is `None`!). The `?` operator compiles down to a single `test rax, rax` + conditional jump `je` to the early-return cleanup path—no heap exception objects, no stack unwinding!
- **Passing `&[T]` or `&str`:** Occupies **two registers** (`RDI = ptr`, `RSI = len`). Passing `String` by value moves three 8-byte words (`ptr`, `cap`, `len`)—in registers or on the stack—while the character buffer stays put on the heap.
- **Closures (`Fn` / `FnMut` / `FnOnce`):** Compile to an anonymous struct holding captured variables + an ordinary direct function call (monomorphised away—zero virtual dispatch!).
- **Large structs (`> 16 bytes`) passed or returned by value:** Passed via hidden caller-allocated stack buffer pointer (`sret` in `RDI` for returns on System V AMD64), meaning returning a large `Struct` writes **directly into the caller's destination slot** in place without extra `memcpy` copies!

## `extern "Rust"` vs `extern "C"` (and `#[repr(C)]`)

Why can't C call a normal Rust `fn foo(a: i32, b: u8)` directly without `extern "C"`?
1. **Unstable `extern "Rust"` ABI:** `rustc` reserves the right to reorder struct fields (to shrink padding!), flatten enums, or change register assignments between compiler releases.
2. **`#[repr(C)]` + `extern "C"`:** Locks down exact C field order (no reordering) and forces standard System V / AAPCS64 calling rules—allowing C, Python `ctypes`, Go, and Rust libraries compiled years apart to call each other reliably.

:::warn Unwinding across `extern "C"` is Undefined Behaviour!
In Rust, `panic!` normally unwinds stack frames to run `Drop` destructors. C code knows nothing about Rust unwinding! Always compile FFI boundaries safely: either catch panics with `std::panic::catch_unwind` at the `extern "C"` boundary or configure `panic = "abort"` in `Cargo.toml`—in Rust 2024, panicking out of `extern "C"` (without `extern "C-unwind"`) automatically aborts safely rather than triggering UB.
:::

## Inspecting ABI details and passing structs across functions in Rust

```rust run
use std::mem::size_of;

#[allow(dead_code)]
#[repr(C)]
struct PointC {
    a: u8,   // offset 0 (+3 padding)
    b: u32,  // offset 4
    c: u8,   // offset 8 (+3 tail padding -> size 12)
}

#[allow(dead_code)]
struct PointRust {
    a: u8,
    b: u32,
    c: u8,   // rustc packs (b: u32, a: u8, c: u8) -> size 8!
}

#[inline(never)]
fn sum_pair(pair: (u64, u64)) -> u64 {
    // System V AMD64 passes small 16-byte struct/tuple in RDI + RSI and returns in RAX!
    pair.0.wrapping_add(pair.1)
}

fn main() {
    println!("PointC={}, PointRust={}", size_of::<PointC>(), size_of::<PointRust>());
    println!("sum_pair = {}", sum_pair((100, 23)));
}
```
```output
PointC=12, PointRust=8
sum_pair = 123
```

Look at that size difference: `PointC` is forced into `12` bytes by C declaration order, while `PointRust` shrinks by 33% down to `8` bytes (passing effortlessly inside a single 64-bit register `RDI`!).

## Recursion at the machine level and stack overflow

When a function calls itself recursively, the CPU does nothing special: it executes the exact same `call` instruction, pushing a brand-new [[stack frame]] downward onto `[stack]` with its own return address and local variables. You can watch those frames march downward in live memory right from Rust:

```rust run nocmp
#[inline(never)]
fn trace_frames(depth: usize, max_depth: usize, prev_addr: usize) {
    let local_marker: u64 = depth as u64;
    let addr = &local_marker as *const u64 as usize;
    let delta = if prev_addr == 0 { 0 } else { prev_addr.saturating_sub(addr) };
    println!("depth {depth}: &local_marker = 0x{addr:x} (frame step = -{delta} bytes)");

    if depth < max_depth {
        trace_frames(depth + 1, max_depth, addr);
    }
}

fn main() {
    trace_frames(0, 4, 0);
}
```
```output
depth 0: &local_marker = 0x7ffe6490a398 (frame step = -0 bytes)
depth 1: &local_marker = 0x7ffe6490a338 (frame step = -96 bytes)
depth 2: &local_marker = 0x7ffe6490a2d8 (frame step = -96 bytes)
depth 3: &local_marker = 0x7ffe6490a278 (frame step = -96 bytes)
depth 4: &local_marker = 0x7ffe6490a218 (frame step = -96 bytes)
```

Every recursive step subtracts a fixed multiple of 16 bytes from `RSP`. Because Linux gives the main thread an `8 MiB` stack (`2 MiB` for spawned threads), recursing ~100,000 frames deep without a base case drives `RSP` straight into the unmapped **[[guard page]]** below `[stack]`. The MMU raises a hardware `SIGSEGV` fault; Rust's signal handler (running on the separate `sigaltstack` installed before `main` in [Chapter 47](#program-loading-startup)) catches that fault and prints `thread 'main' has overflowed its stack` cleanly.

## Stack unwinding (`Drop` + `.eh_frame`) and `exit_group`

How does a program leave a chain of active stack frames? Three paths exist:

1. **Normal `ret` chain + `exit_group(status)`:** Each function runs its compiler-inserted `Drop` destructors, restores `RSP`, and executes `ret`. When `main` returns to `lang_start_internal` and `__libc_start_main`, `libc` flushes stdio streams and invokes the `exit_group` [[system call]], terminating all threads in the process and returning the exit status to the parent shell.
2. **Zero-cost stack unwinding (`panic = "unwind"`, Rust's default):** Notice that normal code pays **zero extra instructions** on the happy path for panics. Instead, the compiler stores compact DWARF unwind tables inside the read-only **`.eh_frame`** ELF section. Only when `panic!` actually fires does `libunwind` walk `[stack]` upward frame by frame, consulting `.eh_frame` to find saved registers and calling each frame's MIR cleanup landing pad (`Drop` destructors for `Vec`, `File`, `MutexGuard`, etc.) before printing the panic message.
3. **Immediate abort (`panic = "abort"`):** Skips `.eh_frame` unwinding altogether (shrinking binary size) and terminates the process immediately via `abort()` (`SIGABRT`), letting the OS kernel reclaim all memory and file descriptors in one sweep.

:::exercise guided Mapping registers in a System V AMD64 call
Consider `#[inline(never)] extern "C" fn calc(x: u64, y: *const u8, flag: bool, z: f64, w: u32) -> u64`. Which physical CPU register carries each of the 5 arguments and the return value on Linux x86-64?
::hint
Remember integer/pointer arguments use `RDI, RSI, RDX, RCX, R8, R9` in order, while floating-point `f64` uses the *separate* `XMM0..XMM7` bank!
::solution
- `x: u64` -> `RDI` (1st integer register)
- `y: *const u8` -> `RSI` (2nd integer register)
- `flag: bool` -> `DL` / `EDX` (`RDX`, 3rd integer register)
- `z: f64` -> `XMM0` (1st float register—does NOT consume `RCX`!)
- `w: u32` -> `ECX` (`RCX`, 4th integer register)
- Return `u64` -> `RAX`.
:::

:::exercise practice Measuring `Result` and `Option` niche sizes
Write a `main` printing `size_of` for `Option<u64>`, `Option<std::num::NonZeroU64>`, `Result<(), u8>`, and `Result<String, ()>`. Notice which ones fit in a single register (8 bytes) vs two vs three!
::hint
`NonZeroU64` reserves `0` as impossible, and `String` contains a `NonNull<u8>` inside `RawVec`!
::solution
```rust run
use std::mem::size_of;
use std::num::NonZeroU64;

fn main() {
    println!("Option<u64>        = {}", size_of::<Option<u64>>());
    println!("Option<NonZeroU64> = {}", size_of::<Option<NonZeroU64>>());
    println!("Result<(), u8>     = {}", size_of::<Result<(), u8>>());
    println!("Result<String, ()> = {}", size_of::<Result<String, ()>>());
}
```
```output
Option<u64>        = 16
Option<NonZeroU64> = 8
Result<(), u8>     = 2
Result<String, ()> = 24
```
Because `String` owns a `NonNull<u8>` (never 0), `Result<String, ()>` encodes `Err(())` using the null pointer bit pattern and occupies zero extra discriminant bytes (`24`, identical to `String`)!
:::

:::exercise challenge Simulating caller-saved vs callee-saved discipline
Why does a function that calls *another* function inside a loop prefer placing a loop counter in `R12` or `RBX` rather than `RCX` or `RDX` on x86-64? Trace what happens in assembly instructions if the loop counter lived in `RCX` vs `R12`.
::hint
Think about whether the inner callee is allowed to overwrite `RCX` vs `R12`!
::solution
If the loop counter lived in caller-saved `RCX`, the caller would have to `push rcx` onto the stack (or store it to a stack slot) before **every single inner `call`** and `pop rcx` after **every single iteration**! By placing the loop counter in callee-saved **`R12`** (pushing `r12` just *once* in the function prologue and popping it *once* in the epilogue), the inner callee is forbidden from clobbering `R12` without restoring it, so the loop executes zero extra stack spills per iteration.
:::

:::recap
- Calling conventions define exact parameter registers (`RDI..R9` + `XMM0..7` on x86-64; `X0..X7` + `V0..7` on ARM64), stack alignment (`16` bytes), and **caller-saved vs callee-saved** register ownership.
- Leaf functions avoid touching the stack frame (`push`/`sub rsp`) completely when caller-saved scratch registers suffice.
- Rust features (`?`, `Option`, closures, `&str` slices, `Result`) lower directly into registers, niches, and simple jumps—not exceptions or heap objects.
- Use `#[repr(C)]` and `extern "C"` when talking across language/binary ABIs; `extern "Rust"` freely optimises struct layouts and register usage.
:::

:::quiz Check your understanding
? Under System V AMD64 (Linux x86-64), how is an `&str` slice (`16` bytes: `ptr` + `len`) passed as the first argument to a function?
- Always spilled onto the stack at `[rsp+8]`
- Inside `XMM0`
+ In two registers: `RDI` (pointer) and `RSI` (length)
- Heap-allocated inside a `Box`
= System V AMD64 passes up to 16-byte structs and fat pointers across two consecutive integer registers (`RDI` and `RSI`).

? What is the key difference between caller-saved (`RAX`, `RDI`, `RSI`, `RCX`) and callee-saved (`RBX`, `RBP`, `R12..R15`) registers?
- Callee-saved registers are wider (128 bits)
- Caller-saved registers can only hold floats
- Only the OS kernel may modify callee-saved registers
+ A called function may freely overwrite caller-saved registers, whereas it must save and restore any callee-saved register it modifies
= Callers preserve important live values across calls in callee-saved registers (or stack slots) while using caller-saved registers for arguments and temporary scratch work.

? Why must OS kernels compile with red-zone disabled (`-mno-red-zone`), unlike normal Linux user-space code?
+ Hardware interrupts push exception frames directly at `RSP`, overwriting the 128 bytes below `RSP`
- Kernels have no stack pointer
- Red zones only work on 32-bit CPUs
- `rustc` forbids red zones in `no_std`
= User-space signal delivery respects the 128-byte red zone, whereas asynchronous CPU hardware exceptions push state directly at `RSP`.

? Why is `Option<NonZeroU64>` 8 bytes while `Option<u64>` is 16 bytes?
- `NonZeroU64` uses 32-bit integers internally
+ Every `u64` bit pattern is valid in `u64`, forcing a separate tag byte + padding (`16` bytes), while `0` is forbidden in `NonZeroU64` and serves as the zero-cost `None` niche
- `Option<NonZeroU64>` allocates its tag on the heap
- `Option<u64>` aligns to 16-byte cache lines
= Niche optimisation reuses invalid bit patterns (`0` for non-zero integers, references, and `NonNull`) to eliminate tag storage completely.
:::
