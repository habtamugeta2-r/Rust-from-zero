@id isa-opcodes-control-flow
@part p8
@kind chapter
@title Instruction Sets, Encoding, Registers & Branching Hardware
@short ISA, opcodes & control flow
@level intermediate
@time 35
@learn Contrast CISC (x86-64) variable-length encoding with RISC (ARM64/RISC-V) fixed 32-bit encoding | Trace the fetch-decode-execute cycle, status flags (ZF/CF/SF/OF), and addressing modes | Follow how Rust loops, bounds checks, and match arms lower to branches, jump tables, and cmov | Recognise how branchless conditional moves eliminate unpredictable jumps

Every abstraction we built—enums, iterators, bounds checks, `match`, closures, async state machines—shrinks down to a linear stream of binary **machine instructions** sitting in `.text`. Yet not all processors speak the same binary dialect. Your Linux cloud server likely runs **x86-64** (CISC origins, variable 1–15 byte opcodes), while an Apple MacBook or AWS Graviton server runs **ARM64 / AArch64** (RISC load-store, fixed 4-byte opcodes), and open microcontrollers increasingly run **RISC-V**.

How does silicon decode raw bytes into ALU arithmetic and branches, and why does that hardware structure directly change how Rust's optimiser compiles your `if` expressions and `match` arms?

:::analogy Morse code vs fixed 4-letter shipping codes
**x86-64** encodes instructions like Morse code or UTF-8: a frequent instruction (`ret` -> `c3`, `push rbp` -> `55`) takes **1 byte**, while a complex SIMD or memory-immediate opcode stretches up to **15 bytes** (`48 81 ec 10 01 00 00`). Finding where the *next* instruction begins requires decoding the current one first! **ARM64 and RISC-V** align every instruction to a rigid **4-byte (32-bit) grid**: the decoder always slices every 32 bits cleanly in parallel, at the cost of slightly larger binaries and needing explicit load/store instructions instead of memory operands inside `add`.
:::

:::compare x86-64 vs ARM64 (AArch64) vs RISC-V (RV64GC)
| Property | x86-64 (AMD64) | ARM64 (AArch64) | RISC-V (RV64GC) |
|---|---|---|---|
| Design lineage | CISC decoded into internal RISC-like µops | Clean Load-Store RISC | Open-standard modular RISC |
| Instruction length | Variable (**1 to 15 bytes**) | Fixed **4 bytes** (32 bits) | Fixed **4 bytes** (+ 2-byte `C` compressed ext) |
| General-purpose registers | **16** (`RAX..R15`) | **31** (`X0..X30` + `XZR`/`SP`) | **32** (`x0..x31`; `x0` hardwired `0`) |
| Memory operands | Arithmetic can read/write RAM (`add eax, [rsp+8]`) | Strict load-store (`ldr`/`str` separate from `add`) | Strict load-store (`ld`/`sd` separate from `add`) |
| Flags register | `RFLAGS` (`ZF, CF, SF, OF`) | `NZCV` condition flags | **None!** (`beq`/`blt` compare two registers directly) |
:::

## Inside an instruction byte stream & micro-ops (µops)

Recall the real disassembly from our Linux x86-64 machine earlier:

```asm
1280: 01 f7                add    edi, esi
1289: 42 8d 04 0f          lea    eax, [rdi + r9*1]
128d: 03 44 24 08          add    eax, DWORD PTR [rsp + 0x8]
1291: c3                   ret
```

Notice two surprising engineering facts hidden inside those 13 bytes:
1. **Addressing modes (`[base + index*scale + displacement]`):** x86-64's **`lea`** (*Load Effective Address*) computes `base + index*scale + displacement` in **one cycle** inside dedicated address-generation hardware—so compilers abuse `lea` everywhere for fast integer multiplication (`x*3`, `x*5`, `x*9`) and 3-operand addition (`eax = rdi + r9`) without touching the flags register!
2. **Macro-op -> Micro-op (µop) cracking:** Under the hood, modern Intel and AMD CPUs do **not** execute variable-length CISC instructions directly on the core ALU! Their front-end decoders translate `add eax, DWORD PTR [rsp+8]` into two tiny RISC-like **µops** (`load tmp, [rsp+8]` + `add eax, tmp`) cached in a fast **µop cache** (`L0`), so once decoded, hot loops run cleanly on RISC-style execution pipelines!

## Status flags (`ZF`, `CF`, `SF`, `OF`) and Rust integer semantics

Look at what `cmp a, b` or `sub a, b` actually computes inside the ALU: it subtracts `a - b`, discards or stores the result, and flips four crucial 1-bit flags in **`RFLAGS`** (or `NZCV` on ARM64):

- **`ZF` (Zero Flag):** `1` if result == `0` (so `a == b`!).
- **`CF` (Carry Flag):** `1` on **unsigned** overflow/borrow (`u32::checked_add` reads `CF`!).
- **`OF` (Overflow Flag):** `1` on **signed** two's-complement overflow (`i32::checked_add` reads `OF`!).
- **`SF` (Sign Flag):** Copies the most-significant bit (negative in two's complement).

That means Rust's `.overflowing_add()` and debug-mode overflow panics require **zero extra arithmetic**: the CPU computes the overflow flags **for free on every `add` instruction**, and Rust checks `jo` (jump if `OF=1`) or `jc` (`CF=1`) in one instruction!

## How Rust `if`, `match`, and bounds checks compile: Branches vs `cmov` vs Jump Tables

Every control-flow construct lowers to one of three hardware patterns:

1. **Conditional jump (`cmp` + `jcc`):** Used when branches execute substantial separate code or fail rarely (like slice bounds checks `cmp idx, len; jae panic_bounds_check`—almost never taken, predicted 99.99% of the time!).
2. **Jump table (`.rodata` pointer array):** For a dense `match code { 0 => ..., 1 => ..., ..., 15 => ... }`, checking 16 `cmp`/`je` pairs sequentially wastes cycles. Instead, LLVM emits an array of 16 code offsets in `.rodata` and performs one bounds check + indirect jump **`jmp [table + code*8]`**—executing in **O(1)** constant time regardless of arm count!
3. **Branchless conditional move (`cmov` / `csel`):** Suppose you write:
   ```rust
   fn clamp_max(x: i32, limit: i32) -> i32 {
       if x > limit { limit } else { x }
   }
   ```
   Rather than emitting a branch instruction that the CPU could mispredict on random inputs, LLVM emits a **single `cmp` + `cmovg`** (*Conditional Move if Greater*): compute both values cleanly in registers and overwrite the register **only if `RFLAGS` matches**—zero jumps, zero branch misprediction penalty!

## Writing branchless Rust when randomness hurts

Watch how two equivalent expressions compare conceptually when processing noisy, unpredictable sensor data:

```rust run
fn sum_above_branchy(data: &[i32], threshold: i32) -> i64 {
    let mut total = 0_i64;
    for &x in data {
        if x > threshold {
            total += x as i64;
        }
    }
    total
}

fn sum_above_branchless(data: &[i32], threshold: i32) -> i64 {
    let mut total = 0_i64;
    for &x in data {
        // Explicit branchless select via bool -> 0/1 mask (often triggers cmov / SIMD!):
        let keep = (x > threshold) as i64;
        total += (x as i64) * keep;
    }
    total
}

fn main() {
    let sample = [5, 80, 12, 95, 3, 44, 61, 19];
    println!(
        "branchy={}, branchless={}",
        sum_above_branchy(&sample, 40),
        sum_above_branchless(&sample, 40)
    );
}
```
```output
branchy=280, branchless=280
```

In fact, LLVM often converts simple `if` accumulators into `cmov` automatically—and even better, writing `(x > threshold) as i64` or using iterator `.filter()` / `.map()` cleanly signals data-parallel arithmetic that LLVM can **SIMD-vectorise** across 8 elements at once!

:::exercise guided Decoding an addressing mode and `lea` trick
In x86-64 assembly, compilers frequently emit `lea eax, [rdi + rdi*4]` for an integer argument `x` in `edi`. What Rust arithmetic expression does that single `lea` compute, and why did the compiler choose `lea` instead of `imul`?
::hint
Compute `rdi + rdi * 4`, and compare single-cycle address arithmetic vs multi-cycle `imul`!
::solution
`rdi + rdi * 4 = 5 * rdi` (`x * 5`). `lea` computes `[base + index * scale]` in **1 cycle** using an address generation unit (AGU) without touching `RFLAGS` or occupying the slower 3-cycle integer multiplier (`imul`)!
:::

:::exercise practice Choosing jump table vs binary branch tree for `match`
You write two `match` functions in Rust:
- `fn dense(x: u8) -> u32`: arms `0..=15` returning distinct constants.
- `fn sparse(x: u64) -> u32`: arms `1, 1_000, 1_000_000_000, _`.
Which one lowers to a `.rodata` **jump table** and why would the other blow up memory if turned into a jump table?
::hint
How big would a `0..=1_000_000_000` pointer array in `.rodata` be?!
::solution
- `dense(x: u8)`: fits cleanly into a `16 * 8 = 128`-byte jump table in `.rodata`, dispatching in `O(1)` via one table lookup!
- `sparse(x: u64)`: a contiguous jump table covering `0..=1_000_000_000` would need **8 gigabytes** in `.rodata`! So LLVM emits a small binary search tree of `cmp` + `je` / `jb` branches (`<= 2` comparisons!).
:::

:::exercise challenge Testing how `checked_add` maps directly to hardware flags
Explain why `a.checked_add(b)` in Rust does NOT have to compare `a > u32::MAX - b` on x86-64 or ARM64, and which hardware flag distinguishes `u32::checked_add` from `i32::checked_add`.
::hint
Remember the two distinct overflow flags in `RFLAGS` (`NZCV` on ARM64) after a single `add` instruction!
::solution
The single hardware `add` instruction sets **both `CF` (Carry Flag, unsigned overflow) and `OF` (Overflow Flag, signed overflow)** simultaneously at zero extra arithmetic cost!
- `u32::checked_add` lowers to `add` + `setc` / `jc` (reading **`CF`**).
- `i32::checked_add` lowers to `add` + `seto` / `jo` (reading **`OF`**).
:::

:::recap
- **x86-64** uses variable 1–15 byte CISC opcodes decoded into internal RISC-like µops; **ARM64 and RISC-V** use fixed 4-byte load-store encodings with 31–32 registers.
- CPU arithmetic automatically populates status flags (**`ZF`, `CF`, `SF`, `OF`**), powering zero-cost equality checks and `checked_add` overflow detection.
- Control flow compiles to conditional jumps (`cmp` + `jcc`), O(1) `.rodata` **jump tables** for dense `match`es, or branchless **`cmov` / `csel`** instructions.
:::

:::quiz Check your understanding
? What is the primary trade-off between x86-64's variable-length encoding and ARM64's fixed 32-bit encoding?
- ARM64 cannot execute floating-point math
+ Fixed 32-bit opcodes make parallel instruction decoding vastly simpler in hardware, whereas variable-length 1–15 byte opcodes pack common instructions slightly smaller at the cost of complex decoder logic
- Variable-length opcodes disable L1 cache
- x86-64 has 64 general-purpose registers while ARM64 has 8
= Fixed-width RISC decoding lets ARM64 decode many instructions per cycle effortlessly, whereas x86-64 relies on heavy decoders and µop caches.

? Why do compilers emit `lea rax, [rdi + rdi*2]` instead of multiplying by `3` with `imul`?
- `imul` crashes on unsigned integers
+ `lea` executes `x + 2*x` in 1 cycle on the address-generation unit without clobbering `RFLAGS`
- `lea` reads the result from RAM
- `imul` only works in debug builds
= Abusing `lea`'s `base + index*scale` hardware computes `x*2, x*3, x*5, x*9` cleanly in a single cycle.

? Why would compiling a `match` on `1`, `500`, and `10_000_000` into a flat jump table be disastrous?
- Jump tables only work on `bool`
+ A contiguous flat jump table would waste tens of megabytes of `.rodata` on unused slots
- `jump` instructions cannot use `.rodata`
- ARM64 forbids jump tables
= Jump tables require dense, narrow value ranges; sparse cases lower to conditional comparisons or binary search trees.

? When does LLVM prefer emitting `cmov` (conditional move) instead of `jne` / `je`?
- Whenever a `match` has 50 arms
+ For tiny, side-effect-free `if/else` assignments where a branch misprediction would cost far more than evaluating both tiny expressions in registers
- Only inside `unsafe` blocks
- Whenever calling a kernel `syscall`
= `cmov` trades one extra register instruction to eliminate unpredictable conditional branches completely.
:::
