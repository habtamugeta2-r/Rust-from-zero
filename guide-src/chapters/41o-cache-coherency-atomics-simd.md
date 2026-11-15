@id cache-coherency-atomics-simd
@part p8
@kind chapter
@title Multi-Core Cache Coherency, Memory Ordering & SIMD Parallelism
@short Cache coherency, atomics & SIMD
@level intermediate
@time 35
@learn Explain MESI cache coherency and why hardware store buffers reorder reads/writes across cores | Contrast x86-64 TSO vs ARM64 weak memory ordering and Rust Ordering (Relaxed/Acquire/Release/SeqCst) | Trace how RMW atomics compile to lock xadd/cmpxchg on x86 vs LL/SC or LSE on ARM64 | Understand data-level parallelism with SIMD registers (SSE/AVX2/NEON) and Rust auto-vectorisation

Look at the two forms of hardware parallelism inside every chip you own today:

1. **Multi-core concurrency (thread-level parallelism):** 8 or 64 cores executing separate Rust threads simultaneously, each with private L1/L2 caches backed by shared L3/RAM—forcing hardware to keep caches coherent (**MESI**) while still allowing **store buffers** to reorder memory visibility unless constrained by **memory barriers** (`Ordering::Acquire` / `Release` / `SeqCst`)!
2. **SIMD data parallelism (instruction-level data parallelism):** Inside **one single core**, wide vector registers (`128`-bit SSE/NEON, `256`-bit AVX2, `512`-bit AVX-512) operating on `4`, `8`, or `16` numbers in **one single CPU instruction**!

Mastering both explains *why* Rust's `Ordering` enum exists on `std::sync::atomic` and how a 5-line iterator loop runs 8× faster under `--release` auto-vectorisation.

:::analogy Whiteboards across conference rooms vs a wide painting roller
- **Cache coherency + memory ordering:** Each CPU core sits in its own room with a private whiteboard (**L1/L2 cache**) and an "Outbox tray" (**store buffer**). Before a note reaches the central hallway board, it sits briefly in the Outbox—so Core 1 might peek into the hallway before Core 0 empties its Outbox unless Core 0 sends an explicit **Release** barrier!
- **SIMD:** Painting a fence with a 1-inch brush takes 8 strokes (scalar `add eax, ebx`). Painting with an 8-inch **SIMD roller** (`vpaddd ymm0, ymm1, ymm2`) coats all 8 integers in one single stroke!
:::

:::compare CPU Memory Models: x86-64 TSO vs ARM64 Weak Ordering
| Rule | x86-64 (TSO: Total Store Order) | ARM64 / RISC-V (Weak Ordering) |
|---|---|---|
| Load-Load, Store-Store, Load-Store reordering | **Forbidden in hardware** | **Allowed in hardware!** (Any independent load/store may overtake another!) |
| Store-Load reordering (`x = 1; read y`) | **Allowed!** (Due to per-core FIFO **store buffer**) | **Allowed!** |
| Cost of `Acquire` / `Release` in Rust | **Zero extra fence instructions!** (Just normal `mov` + compiler barrier!) | Emits `ldar` (load-acquire) / `stlr` (store-release) instructions! |
| Cost of `SeqCst` store in Rust | Emits `xchg` or `mfence` (drains store buffer—expensive!) | Emits full `stlr` + barrier rules (`dmb ish`) |
| Typical trap | Buggy `Relaxed` code *accidentally works on x86 laptop* and **corrupts data on Apple Silicon / AWS Graviton ARM64!** | Catches missing `Acquire`/`Release` bugs immediately! |
:::

## Part 1: MESI Cache Coherency & Why Store Buffers Exist

When Core 0 reads variable `X` into its private L1d cache and Core 1 also reads `X`, hardware cache coherency (**MESI** protocol—*Modified, Exclusive, Shared, Invalid*) keeps every core seeing a consistent view of every 64-byte cache line:

- **`M` (Modified):** Only this core holds a dirty edited copy; RAM is stale. Before another core can read this line, Core 0 writes it out or transfers it cleanly.
- **`E` (Exclusive):** Only this core caches this clean line (matches RAM).
- **`S` (Shared):** Multiple cores hold clean read-only copies.
- **`I` (Invalid):** Another core just wrote to this address and broadcast an **Invalidate** message across the interconnect, marking our stale copy dead!

Now ask: if Core 0 writes `flag = true` and Core 1 currently caches `flag`'s line as `S`, waiting synchronously for Core 1's invalidation acknowledgement across all 64 cores takes dozens of nanoseconds! So CPU designers inserted a tiny FIFO queue between each core and its L1 cache called the **Store Buffer**:
- Core 0 drops `store flag = true` into its private **Store Buffer** and moves immediately to the *next* instruction without waiting!
- Until Core 0 drains its Store Buffer, **Core 0 sees its own write via store-forwarding, while Core 1 does NOT yet see it!**
- Even wilder on ARM64: Core 1 might predictively execute `read(payload)` *before* `read(flag)` completes (`Load-Load` reordering)—reading stale `payload` even though `flag == true`!

## Rust `std::sync::atomic::Ordering` mapped straight to CPU instructions

That exact store-buffer + weak-reordering hardware is why Rust demands an explicit `Ordering` on every atomic load, store, and RMW:

```rust run
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;

static DATA: AtomicU64 = AtomicU64::new(0);
static READY: AtomicBool = AtomicBool::new(false);

fn main() {
    let producer = thread::spawn(|| {
        DATA.store(12345, Ordering::Relaxed);
        // `Release` guarantees `DATA = 12345` becomes visible BEFORE `READY = true`
        // across EVERY architecture (x86-64 AND ARM64!).
        READY.store(true, Ordering::Release);
    });

    let consumer = thread::spawn(|| {
        // `Acquire` guarantees no read AFTER this line can hoist BEFORE observing `READY == true`!
        while !READY.load(Ordering::Acquire) {
            std::hint::spin_loop();
        }
        assert_eq!(DATA.load(Ordering::Relaxed), 12345);
        println!("verified cross-thread DATA = {}", DATA.load(Ordering::Relaxed));
    });

    producer.join().unwrap();
    consumer.join().unwrap();
}
```
```output
verified cross-thread DATA = 12345
```

Look closely at what each `Ordering` guarantees:
- **`Relaxed`:** Only guarantees *this single atomic variable* won't tear or race (great for metrics/counters like `requests_total.fetch_add(1, Relaxed)`). Zero ordering guarantees relative to *other* memory addresses!
- **`Release` + `Acquire` pair:** The golden workhorse of lock-free rings, `Arc::drop`, and `Mutex`! `Release` on store + `Acquire` on load forms a **happens-before** bridge: everything written before `Release` is guaranteed visible after `Acquire` observes that stored value—**at zero extra hardware fence cost on x86-64** and clean `stlr`/`ldar` instructions on ARM64!
- **`SeqCst` (Sequentially Consistent):** Adds a single global total order across *all* `SeqCst` variables everywhere—forcing expensive `mfence`/`xchg` store-buffer flushes on x86-64. Only needed when two threads independently race on *two different* atomic flags simultaneously (e.g. Dekker's algorithm).

:::details How Read-Modify-Write atomics work in silicon (`fetch_add`, `compare_exchange`)
- **x86-64:** Emits **`lock xadd`** (for `fetch_add`) or **`lock cmpxchg`** (for `compare_exchange`), acquiring exclusive ownership (`M` state) of that single 64-byte cache line across cores.
- **ARM64:** Older ARMv8 used **LL/SC** (`ldaxr`/`stlxr` load-linked / store-conditional retry loops—explaining why Rust exposes both `compare_exchange` and `compare_exchange_weak`!), while modern ARMv8.1+ adds **LSE** (`ldaddal`, `casal`) single-instruction atomics!
:::

## Part 2: SIMD — Data-Level Parallelism Inside Every Core

Now zoom back inside a *single* CPU core. Every modern x86-64 chip guarantees **SSE2** (`128`-bit = four `f32` or `i32` lanes at once) and modern servers include **AVX2** (`256`-bit = eight `i32`/`f32` lanes) or **AVX-512** (`512`-bit = sixteen `i32` lanes); ARM64 guarantees **NEON** (`128`-bit) universally.

Watch how a clean Rust iterator or fixed-chunk slice loop lets LLVM **auto-vectorise** scalar math into packed SIMD instructions automatically under `--release`:

```rust run
// LLVM sees fixed independent chunks and vectorises with SSE2/AVX2/NEON `paddd`:
pub fn dot_product_chunks(a: &[i32], b: &[i32]) -> i64 {
    a.iter()
        .zip(b)
        .map(|(&x, &y)| (x as i64) * (y as i64))
        .sum()
}

// Even simpler example: adding two arrays in 8-element SIMD chunks!
pub fn add_slices(dst: &mut [u32], src: &[u32]) {
    for (d, &s) in dst.iter_mut().zip(src) {
        *d = d.wrapping_add(s);
    }
}

fn main() {
    let mut a = [1_u32, 2, 3, 4, 5, 6, 7, 8];
    let b = [10_u32, 20, 30, 40, 50, 60, 70, 80];
    add_slices(&mut a, &b);
    println!("simd-friendly sum = {a:?}");
    println!("dot = {}", dot_product_chunks(&[1, 2, 3], &[4, 5, 6]));
}
```
```output
simd-friendly sum = [11, 22, 33, 44, 55, 66, 77, 88]
dot = 32
```

Wait—why did `add_slices` use `.iter_mut().zip(src)` instead of `for i in 0..dst.len() { dst[i] += src[i]; }`? Two systems reasons!
1. **No panicking bounds checks inside the vector loop:** Zipping iterators proves the length upfront (`min(dst.len(), src.len())`), letting LLVM emit a straight `vpaddd` SIMD loop without a panic exit inside every vector lane!
2. **No aliasing ambiguity (`noalias`):** Because `&mut [u32]` (`dst`) and `&[u32]` (`src`) cannot overlap in Rust, LLVM knows writing `dst[i]` **never** alters `src[i+1]`, freeing it to load 8 lanes at once safely (`C` compilers often fail to auto-vectorise unless you mark pointers `restrict`!).

:::tip When you need guaranteed SIMD (`std::arch` / `wide` / `portable_simd`)
Auto-vectorisation is sensitive to floating-point order (`f64` addition isn't associative due to rounding! That's why `.sum()` on `f64` cannot legally reorder lanes into 4 partial SIMD lanes unless you accumulate explicit `[f64; 4]` chunks!). For rock-solid portable SIMD across x86-64 AVX2 and ARM64 NEON, use the **`wide`** crate or explicit `#[target_feature(enable = "avx2")]` intrinsics in `std::arch`.
:::

:::exercise guided Catching an x86-only concurrency bug (`Relaxed` vs `Release`/`Acquire`)
Suppose a developer writes the producer/consumer snippet above using `Ordering::Relaxed` on *both* `DATA` and `READY`. They test it 10,000 times on their x86-64 laptop and it passes every run—then deploy to an AWS Graviton ARM64 server and occasionally fail `assert_eq!(DATA, 12345)`! Explain both why it "worked" on x86-64 AND why it broke on ARM64.
::hint
Remember x86-64 TSO forbids Store-Store and Load-Load reordering, whereas ARM64 permits both!
::solution
- **Why it seemed to work on x86-64:** Under x86-64 TSO, hardware never reorders two stores (`DATA` before `READY`) or two loads (`READY` before `DATA`). As long as the *compiler* happened not to reorder them, x86 hardware accidentally preserved order!
- **Why it broke on ARM64:** ARM64 uses weak memory ordering: the CPU may reorder `READY.store(true)` ahead of `DATA.store(12345)` OR reorder the consumer's `DATA.load()` ahead of observing `READY == true` (plus LLVM itself may reorder `Relaxed` operations!). Pairing `Release` and `Acquire` prevents reordering in both compiler and CPU across *all* architectures.
:::

:::exercise practice Choosing `compare_exchange` vs `compare_exchange_weak`
When writing a lock-free retry loop (`loop { let cur = head.load(...); if head.compare_exchange_weak(cur, next, ...).is_ok() { break; } }`), why does Rust provide `compare_exchange_weak` alongside `compare_exchange`?
::hint
Think about ARM64 LL/SC (`ldaxr`/`stlxr`) spurious failures inside a loop that *already* retries!
::solution
On LL/SC architectures like ARM64 (without LSE), `stlxr` can spuriously fail even if the value didn't change (e.g., an interrupt hit between `ldaxr` and `stlxr`). Plain `compare_exchange` wraps an extra hidden retry loop to mask spurious LL/SC failures—creating a redundant nested loop if you're already looping! **`compare_exchange_weak`** skips the inner retry loop and compiles faster inside explicit retry loops.
:::

:::exercise challenge Unblocking SIMD vectorisation on `f64` summation
Why can LLVM auto-vectorise `xs.iter().sum::<i32>()` straight into AVX2 `vpaddd`, yet refuses to auto-vectorise `xs.iter().sum::<f64>()` by default—and how can you accumulate `f64` cleanly in 4 parallel lanes in pure safe Rust?
::hint
Is `(a + b) + (c + d)` guaranteed bit-for-bit identical to `(((a + b) + c) + d)` for IEEE-754 `f64`?
::solution
Floating-point addition is **not associative** in IEEE-754 due to rounding! Reordering `f64` summation changes the least-significant bits, so LLVM refuses unless you allow chunking explicitly. Writing a tiny 4-lane accumulator with `chunks_exact(4)`:
```rust run
fn sum_f64_4lane(xs: &[f64]) -> f64 {
    let mut acc = [0.0_f64; 4];
    let chunks = xs.chunks_exact(4);
    let rem = chunks.remainder();
    for c in chunks {
        acc[0] += c[0];
        acc[1] += c[1];
        acc[2] += c[2];
        acc[3] += c[3];
    }
    acc.iter().sum::<f64>() + rem.iter().sum::<f64>()
}

fn main() {
    let vals = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
    println!("sum = {}", sum_f64_4lane(&vals));
}
```
```output
sum = 45
```
By declaring 4 independent partial sums `[0.0; 4]`, you both give LLVM permission to use 4-wide `vaddpd` (`256`-bit AVX2) AND break the loop-carried dependency chain so OoO latency drops 4×!
:::

:::recap
- **MESI coherency** keeps shared 64-byte cache lines consistent across cores, while hardware **store buffers** and **weak ARM64 reordering** explain why `std::sync::atomic::Ordering` exists.
- **`Release` / `Acquire`** is the essential happens-before synchronization pair across all architectures (zero extra fences on x86-64 TSO!); **`Relaxed`** suffices for standalone counters.
- **Rust's `&mut` exclusivity (`noalias`) + iterator slices** unlock aggressive **SIMD auto-vectorisation** (`SSE2`/`AVX2`/`NEON`), processing 4–16 elements per instruction.
:::

:::quiz Check your understanding
? Why do CPU cores place a FIFO **Store Buffer** between the execution units and L1d cache?
- To encrypt RAM contents
+ So a core can continue executing subsequent instructions without stalling while waiting for MESI invalidation messages to reach all other cores
- To run SIMD vector math
- To handle page faults in Ring 3
= Store buffers hide inter-core cache-coherency invalidation latency, creating the Store-Load reordering behaviour even on x86-64 TSO.

? Why can a bug using `Ordering::Relaxed` silently pass tests on x86-64 yet fail intermittently on ARM64?
- ARM64 uses 32-bit integers
+ x86-64's strong TSO memory model never reorders Load-Load or Store-Store operations in hardware, whereas ARM64's weak memory model freely reorders independent loads and stores unless constrained by `Acquire`/`Release`
- ARM64 lacks an L1 cache
- Rust ignores `Ordering` on x86-64
= Always test lock-free logic with proper `Release`/`Acquire` barriers rather than relying on x86 TSO accidents.

? Which Rust guarantee specifically helps LLVM auto-vectorise `add_slices(dst: &mut [u32], src: &[u32])` better than C pointers?
- Reference counting via `Arc`
+ Borrowing forbids `&mut [u32]` (`dst`) from aliasing `&[u32]` (`src`), giving LLVM automatic `noalias` guarantees to load and store vector lanes safely
- `Drop` frees arrays before vectorising
- `unsafe` disables bounds checks globally
= C compilers often refuse to SIMD-vectorise pointer loops out of fear that `dst` and `src` overlap in RAM; Rust's borrow rules guarantee non-aliasing statically.

? Why does LLVM refuse to auto-vectorise `slice.iter().sum::<f64>()` into 4 parallel lanes automatically?
- CPUs have no `f64` SIMD instructions
+ IEEE-754 floating-point addition is not strictly associative, so regrouping terms into vector lanes changes rounding results slightly
- `f64` lacks `Copy`
- `Iterator::sum` runs on the heap
= Explicit `chunks_exact(4)` lane accumulators let you opt into SIMD parallelism cleanly when minor float rounding differences are acceptable.
:::
