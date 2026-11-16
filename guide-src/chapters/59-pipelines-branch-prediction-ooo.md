@id pipelines-branch-prediction-ooo
@part p8
@kind chapter
@title CPU Pipelines, Branch Prediction & Out-of-Order Execution
@short Pipelines, branches & OoO
@level intermediate
@time 30
@learn Trace an instruction pipeline and distinguish structural, data and control hazards | Measure the cost of branch misprediction on a chosen processor | Understand superscalar dispatch, register renaming, and out-of-order speculative execution | Connect speculative execution to Spectre side-channel attacks and bounds-check optimisation

A processor can overlap instruction work to improve throughput, but dependencies and an incorrectly predicted branch can leave parts of the pipeline waiting or force speculative work to be discarded. The size of the effect depends on the processor and the program. This chapter explains pipelining, branch prediction and out-of-order execution, then connects those ideas to measurements of Rust code. It builds on [assembly and machine code](#assembly-machine-code) and relates its findings to [cache behaviour](#pointers-safety-caches).

The answer lives inside the CPU core's instruction assembly line: **pipelining**, **out-of-order (OoO) execution**, and **speculative branch prediction**. The machine code that flows down that line is in [assembly and machine code](#assembly-machine-code), and the caches it stalls on are in [pointers, safety and caches](#pointers-safety-caches).

:::analogy A five-station car-wash assembly line
Washing one car from start to finish takes 5 sequential minutes (Soap -> Scrub -> Rinse -> Wax -> Dry). Instead of waiting until Car 1 dries before starting Car 2, a **pipelined** car wash pushes a new car in every minute: **5 cars wash concurrently**, boosting throughput 5×! Now imagine a driver suddenly says at Station 4: "Wait, wrong car—back everything out and start over!" Every partially washed car in Stations 1–3 gets **flushed** out of the bay. That is a **branch misprediction**.
:::

:::compare Sequential CPU vs Pipelined Superscalar OoO CPU
| Architecture style | Instructions per cycle (IPC) | What happens on a DRAM cache miss | What happens on an `if` branch |
|---|---|---|---|
| **Single-cycle sequential** | `< 0.25–1.0` | Entire CPU freezes waiting 250 cycles | Waits until comparison resolves |
| **Classic 5-stage in-order pipeline** | Up to `1.0` | Next dependent instruction stalls pipeline | Simple static prediction or 1–2 stall cycles |
| **Modern Superscalar OoO** (x86-64 / Apple M-series / Zen) | **3.0–6.0+ IPC** (`4–8` wide dispatch!) | Executes **other independent instructions** ahead in the Reorder Buffer! | **Speculatively executes** predicted path 100+ instructions deep; flushes entire pipeline if wrong! |
:::

## The classic 5-stage pipeline & its three hazards

Every textbook processor breaks each instruction into stages flowing across clock ticks:

```text
IF (Fetch) ──► ID (Decode) ──► EX (Execute/ALU) ──► MEM (Cache/RAM) ──► WB (Writeback)
```

While Instruction 1 sits in `WB`, Instruction 2 sits in `MEM`, Instruction 3 in `EX`, Instruction 4 in `ID`, and Instruction 5 in `IF`—5× throughput without speeding up individual stage delay! Yet three **hazards** threaten to stall that assembly line:

1. **Structural hazard:** Two stages need the same hardware unit simultaneously (solved by separate L1i instruction cache + L1d data cache and multiple ALUs!).
2. **Data hazard (RAW: Read-After-Write):** Instruction 2 (`b = a + 1`) needs `a` before Instruction 1 (`a = x * 2`) reaches `WB`. **Solution:** Hardware **forwarding (bypassing)** routes `a` straight out of `EX` back into `EX` on the very next cycle without waiting for register writeback!
3. **Control hazard (`if` / `loop` / `match`):** At `IF`, the CPU doesn't yet know which address comes *next* after a conditional branch (`cmp` hasn't reached `EX` yet!). On a modern 14–20 stage deep pipeline, waiting to find out would stall for ~15–20 cycles on *every single `if` and loop check*!

## Branch Prediction: guessing the future with ~99% accuracy

:::plain Pipelining, branch prediction, and out-of-order execution
A **[[pipeline]]** overlaps instruction stages so 15–20 instructions are half-finished inside one core at the same instant. **Branch prediction** guesses which way an `if` will go *before* evaluating the condition so the pipeline never pauses; if the guess is wrong, all speculative work in flight is thrown out (~15–20 wasted cycles). **[[out-of-order execution|Out-of-order execution]]** lets independent instructions run ahead while an earlier load waits on slow RAM, then commits results in original program order. How several cores keep their caches agreeing while doing this is in [caches, coherency and SIMD](#cache-coherency-atomics-simd).
:::

Because modern CPUs execute **4–6 instructions per cycle across 15–20 pipeline stages**, waiting for an `if` condition would stall every loop. Instead, the CPU **guesses** immediately at Fetch using dedicated hardware predictors (**BTB** Branch Target Buffer + **TAGE** history predictors):

- **Loops:** `for i in 0..10_000` branches backward 9,999 times and exits once -> **99.99% accuracy**.
- **Bounds checks (`arr[i]`):** Never panics during valid execution -> **~100% accuracy** (near-zero runtime cost once predicted).
- **Biased `if` checks (sorted data, `None`/`Err` checks):** Strongly one-sided (`true, true, true...`) -> **>99% accuracy**.
- **Random 50/50 coin-flip branches (`if val >= 128` on unsorted random bytes):** Impossible for *any* predictor to guess. Half of all iterations mispredict, flushing **15–20 cycles × 4-wide dispatch = 60+ instruction slots** on every miss.

## Out-of-order execution (OoO) and register renaming

Look at why a modern CPU doesn't grind to a halt the instant one array element misses L1 cache:

:::note Modern Superscalar Out-of-Order Engine (simplified)
```text
Fetch & Decode ──► Register Renamer ──► Issue Queue / Reservation Stations
   (4-8/cycle)     (eliminates WAR/WAW)   (dispatches ANY ready instruction!)
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         ▼                     ▼                     ▼
                      ALU 0                 ALU 1               Load/Store
                         └─────────────────────┼─────────────────────┘
                                               ▼
                                    Reorder Buffer (ROB)
                             (commits results IN PROGRAM ORDER —
                              or squashes EVERYTHING on mispredict!)
```
:::

Two astonishing tricks happen inside that diagram:
1. **Register Renaming:** Even though x86-64 assembly only names 16 architectural registers (`RAX`, `RCX`, ...), silicon inside the chip packs **200+ physical registers**! If two independent loops reuse `RAX`, the renamer maps iteration 1's `RAX` to `phys_reg_42` and iteration 2's `RAX` to `phys_reg_91`, letting both iterations run **simultaneously in parallel**!
2. **Reorder Buffer (ROB):** Instructions **execute out-of-order** the instant their inputs arrive (so independent math runs right past a slow cache-miss load!), yet **commit (retire) strictly in-order** through the ROB so from the programmer's perspective everything behaves 100% sequentially!

## When speculation leaks secrets: Spectre

Wait—if the Reorder Buffer cleanly throws away wrong-path instructions when a branch mispredicts, how could hardware speculation possibly cause a security bug (**Spectre**, 2018)?

Think about the **side effects on the L1 cache**! Suppose an untrusted attacker supplies an out-of-bounds `index` to:
```rust
if index < array.len() {          // CPU speculatively guesses TRUE while `array.len()` is slow in RAM!
    let secret = array[index];    // Speculatively loads secret byte `K` out-of-bounds!
    let _ = probe[secret * 4096]; // Speculatively pulls `probe[K * 4096]` into CPU L1d cache!
}
```
Even though the CPU catches the misprediction 50 cycles later and squashes `secret` cleanly before committing any register, **`probe[K * 4096]` is STILL sitting inside L1 cache**! An attacker timing reads across `probe[0], probe[4096], probe[8192]...` spots which page reads in `1 ns` instead of `80 ns`—recovering `secret` right out of speculative execution! (Which is why compilers and kernels insert speculation barriers `lfence` / `csdb` and array-index masking around untrusted bounds checks!)

## Observing predictable vs unpredictable branch patterns in Rust

You can measure the difference between unsorted 50/50 branches, sorted predictable branches, and branchless arithmetic directly in Rust:

```rust run nocmp
use std::hint::black_box;
use std::time::Instant;

fn count_branchy(slice: &[u8], pivot: u8) -> usize {
    let mut count = 0_usize;
    for &b in slice {
        if b >= pivot {
            count += 1;
        }
    }
    count
}

fn count_branchless(slice: &[u8], pivot: u8) -> usize {
    let mut count = 0_usize;
    for &b in slice {
        count += usize::from(b >= pivot);
    }
    count
}

fn main() {
    // Deterministic pseudo-random byte stream (50/50 above and below 128):
    let mut unsorted = vec![0_u8; 65_536];
    let mut state = 0x1234_5678_u32;
    for slot in &mut unsorted {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        *slot = (state >> 24) as u8;
    }
    let mut sorted = unsorted.clone();
    sorted.sort_unstable();

    let t0 = Instant::now();
    let a = count_branchy(black_box(&unsorted), 128);
    let dt_unsorted = t0.elapsed();

    let t1 = Instant::now();
    let b = count_branchy(black_box(&sorted), 128);
    let dt_sorted = t1.elapsed();

    let t2 = Instant::now();
    let c = count_branchless(black_box(&unsorted), 128);
    let dt_branchless = t2.elapsed();

    assert_eq!((a, b), (a, c));
    println!(
        "matches={a} | unsorted branchy={dt_unsorted:?}, sorted branchy={dt_sorted:?}, branchless={dt_branchless:?}"
    );
}
```
```output
matches=32768 | unsorted branchy=198.4µs, sorted branchy=46.1µs, branchless=44.8µs
```

Notice `usize::from(b >= pivot)` (or `Iterator::filter` compiled with [[cmov]] / [[SIMD]] masks): on sorted slices both versions run fast, while on uniform 50/50 random inputs, branchless logic avoids 15-cycle pipeline flushes completely.

:::exercise guided Spotting pipeline hazards in a 4-instruction sequence
Classify the hazard between each pair of consecutive instructions:
1. `add r1, r2, r3` followed immediately by `sub r4, r1, r5`
2. `cmp r1, 0` followed immediately by `je target_label`
3. `mul r1, r2, r3` followed by `add r1, r4, r5` (no read of old `r1` in between!)
::hint
Match **RAW** (data dependency), **Control hazard**, and **WAW** (Write-After-Write, solved by register renaming!).
::solution
1. **Data hazard (RAW — Read-After-Write):** `sub` reads `r1` produced by `add`; hardware forwarding passes `r1` straight between ALUs!
2. **Control hazard:** CPU must predict whether `je` jumps to `target_label` or falls through before `cmp` resolves.
3. **False output hazard (WAW — Write-After-Write):** Two unrelated calculations write to architectural name `r1`; the OoO **Register Renamer** assigns two separate physical registers so both execute in parallel!
:::

:::exercise practice Sorting before filtering — why did the classic C/Java/Rust benchmark speed up 3×?
In the famous Stack Overflow benchmark ("Why is processing a sorted array faster than processing an unsorted array?"), calling `data.sort()` *before* summing `if val >= 128 { sum += val }` often ran dramatically faster overall than scanning the unsorted array directly (if reused, or on huge branchy passes). Explain the exact hardware reason.
::hint
Compare branch predictor accuracy on `[2, 5, 19, ..., 130, 200, 244]` vs `[210, 12, 245, 7, 199, 3, ...]`.
::solution
- **Unsorted uniform random `0..255`:** `val >= 128` flips unpredictably 50% of the time, causing continuous ~15-cycle pipeline flushes across every other iteration!
- **Sorted `0..255`:** The first half is `false, false, false...` (100% predicted!), transitions once around index `n/2` (1 misprediction!), and the second half is `true, true, true...` (100% predicted!)—letting the CPU dispatch 4–6 instructions per cycle at full speed!
:::

:::exercise challenge Why does `usize::from(cond)` or `.iter().filter().count()` beat `likely`/`unlikely` hints?
Many developers obsess over `#[cold]` or `likely()` branch hints on tight inner loops. When does a branch hint help, and when is eliminating the branch altogether (`cmov` / SIMD masks) strictly superior?
::hint
Branch hints only guide static instruction layout / cold-path splitting when one side runs **< 1% of the time** (like `Err` panic paths); what happens if the branch flips **30%–50%** of the time?
::solution
- **Skewed (`99% vs 1%`, e.g. `if unlikely_error`):** Hardware dynamic predictors ALREADY nail 99% accuracy! Putting cold error handling behind `#[cold]` mainly keeps hot `.text` lines densely packed in **L1i instruction cache**.
- **Unpredictable (`30%–50%` split):** *No* hint can make a coin flip predictable! Only replacing the jump with **`cmov` (`usize::from(cond)`)** or **SIMD vector masks** eliminates pipeline flushes completely.
:::

:::recap
- **Pipelining** overlaps `Fetch -> Decode -> Execute -> Memory -> Writeback` across instructions; hardware forwarding solves true RAW data dependencies while **register renaming** eliminates false WAW/WAR name collisions.
- **Branch predictors** guess `if` / `loop` outcomes speculatively; unpredictable 50/50 branches flush **15–20 pipeline stages** on every miss.
- **Out-of-Order (OoO) cores** run independent instructions ahead while waiting on memory and retire results strictly in order via the **Reorder Buffer (ROB)**—yet speculative cache side-effects gave rise to **Spectre**.
:::

:::quiz Check your understanding
? What is the hardware purpose of **Register Renaming** inside an out-of-order CPU?
- Encrypting registers against Spectre attacks
- Compressing 64-bit integers into 32 bits
+ Mapping the 16–31 architectural register names onto 200+ hidden physical registers so independent instructions reusing the same register name (`RAX`) can run in parallel
- Converting x86-64 into ARM64 instructions
= Register renaming removes false Write-After-Write and Write-After-Read dependencies between independent loops/instructions.

? Why do Rust's ubiquitous slice bounds checks (`slice[i]`) add nearly zero overhead in hot loops over valid indices?
- Bounds checks are disabled automatically in release mode
- Bounds checks run on a separate GPU core
- Rust compiles bounds checks out using `Box`
+ The CPU branch predictor learns the bounds-check jump is 100% "not panicked" and speculates straight past it without stalling (or LLVM hoists/eliminates the check!)
= Predictable always-taken/always-not-taken checks execute speculatively at near-zero cycle cost (and LLVM eliminates checks cleanly inside `iter()`).

? Even though the Reorder Buffer (ROB) discards mispredicted instructions before committing registers, how does Spectre leak secrets across speculation?
+ Speculative memory loads still pull lines into **L1 data cache**, leaving observable read-latency differences (`1 ns` hit vs `80 ns` miss) after rollback
- By overwriting `.text` on disk
- By triggering a kernel panic
- By changing `CR3` permanently
= Cache-timing side channels measure microarchitectural state (L1d cache hits) left behind by rolled-back speculative loads.

? When is converting a conditional `if` to branchless `usize::from(cond)` arithmetic most beneficial?
- When the condition is `false` 99.99% of the time (like error logging)
+ When the condition changes unpredictably (20%–50% misprediction rate) on tight inner-loop data
- Around large `println!` formatting blocks
- Whenever calling `File::open`
= Unpredictable branches suffer ~15–20 cycle pipeline flushes per miss; branchless arithmetic runs in constant predictable time.
:::
