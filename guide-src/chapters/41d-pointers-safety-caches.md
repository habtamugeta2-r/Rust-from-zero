@id pointers-safety-caches
@part p4
@kind chapter
@title Pointers, Memory Safety Bugs & CPU Cache Locality
@short Pointers, bugs & CPU caches
@level intermediate
@time 35
@learn Contrast Rust references, raw pointers, and dangling/aliased pointers at the machine level | Reproduce and recognise the classic memory safety bugs Rust rules out (UAF, double free, overflow, race) | Trace L1/L2/L3 CPU cache lines (64 bytes), spatial/temporal locality, and AoS vs SoA | Avoid false sharing across CPU cores with cache-line padding

In the previous chapters you saw virtual memory pages (`4 KiB`) and heap allocators. Now drop one level closer to the silicon: **why does the exact arrangement of structs in RAM swing a Rust program's speed by 10×—and why do C and C++ suffer security vulnerabilities that Rust refuses to compile?**

Both questions come down to how raw addresses behave in hardware.

:::analogy A warehouse worker vs a desk notepad
Reading from main DRAM takes around **60–100 nanoseconds**—an eternity to a 3 GHz CPU that can execute 3 instructions per nanosecond (`~250` wasted cycles waiting on a single RAM fetch!). Instead of fetching one lonely byte at a time, the CPU fetches an entire **64-byte cache line** (a whole tray of 64 consecutive bytes) onto tiny SRAM banks sitting right next to the execution cores (**L1**, **L2**, **L3** caches). Reading the *next* byte on that same tray costs **1 nanosecond**—almost free.
:::

:::compare Memory safety classes: C/C++ vs Rust
| Classic C / C++ bug | Machine-level symptom | How safe Rust stops it |
|---|---|---|
| **Use-after-free (UAF)** | Pointer still holds freed heap address; allocator reuses chunk for new data or attacker payload | Ownership moves/drops value; borrow checker verifies lifetimes end before `Drop` |
| **Double free** | `free(p)` called twice corrupts allocator free-list into cycle or crash | Single owner guarantees `drop` executes exactly once |
| **Buffer overflow / out-of-bounds** | `arr[i]` reads/writes past slab into adjacent locals or saved return address | Slice bounds checks (`len` stored in fat pointer) panic cleanly before out-of-bounds access |
| **Uninitialised read** | Reading garbage stack leftovers (or old secret keys) from `sub rsp` frame | Definite initialisation analysis forbids reading uninitialised bindings; `MaybeUninit` isolates raw uninit |
| **Data race** | Two cores mutate non-atomic address concurrently -> torn/lost writes | `Send`/`Sync` + `XOR` mutability (`&mut T` exclusive, `&T` shared) rejects unsynchronised sharing |
:::

## Raw pointers, dangling pointers, and strict provenance

At the CPU level, `&T`, `&mut T`, `*const T`, and `*mut T` all hold the exact same 64-bit integer address (plus a length or vtable word for slices/trait objects). What separates them lives in the compiler and optimiser:

- **`&T` / `&mut T`:** Valid, non-null, properly aligned, guaranteed not dangling, and `&mut T` is annotated `noalias` in LLVM IR—meaning no other live pointer reads or writes that memory while `&mut T` is active.
- **`*const T` / `*mut T`:** Plain raw addresses. Creating one is safe; *dereferencing* it requires `unsafe` because the hardware will blindly try to read whatever sits at that address (or fault if unmapped).

Consider how a dangling pointer arises when ownership rules aren't enforced. In C, returning `&local` returns a stack address that gets overwritten on the very next function call. In safe Rust, the borrow checker catches it at compile time; if you deliberately force it with raw pointers inside `unsafe`, you step directly into **Undefined Behaviour** (UB), where LLVM's optimiser assumes dangling/out-of-bounds/aliased writes never happen and aggressively deletes or reorders code around them.

:::warn Undefined behaviour is an optimiser contract, not "whatever the CPU does"
Beginners often think UB means "the CPU reads whatever random byte happens to sit there." Wrong! LLVM treats UB as **impossible**. If a branch exhibits UB (such as reading uninitialised memory or dereferencing a null pointer), LLVM may delete the entire surrounding `if` check, skip null guards written *before* the line, or miscompile loops completely.
:::

## The CPU memory hierarchy and 64-byte cache lines

Every modern x86-64 and Apple/ARM64 server chip arranges memory in a steep pyramid of capacity vs latency:

:::note Typical modern x86-64 core memory hierarchy
```text
   Registers (~1 KiB)          ~0.3 ns   (1 cycle)    CPU core internal
        │
   L1d / L1i Cache (32-64 KiB) ~1 ns     (~3-4 cycles) private per core
        │
   L2 Cache (256 KiB - 2 MiB)  ~4 ns     (~12 cycles)  private per core
        │
   L3 Shared Cache (8 - 64+ MiB) ~15-25 ns (~40-60 cycles) shared across cores
        │
   Main DRAM (GiBs)            ~60-100 ns (~200-300 cycles) off-chip DIMMs
```
:::

When your code reads byte `0x1004`, the CPU never fetches only byte `0x1004`. It fetches the aligned **64-byte [[cache line]]** `0x1000..0x103f`:

:::plain Spatial locality vs temporal locality
**Spatial locality** means reading bytes that sit right next to each other in memory (such as walking a `Vec<u64>` from index `0` to `n`), so one 64-byte cache-line fetch pays for eight 8-byte numbers at once. **Temporal locality** means reading the *same* memory address again soon while it is still sitting hot in L1 [[cache]].
:::

- **Spatial locality in action:** Scanning `Vec<u64>` sequentially loads 8 integers per cache-line fetch, plus the CPU's **hardware prefetcher** detects the regular stride and starts fetching the *next* cache line before you even ask for it. By contrast, traversing a linked list (`Node { val, next: Option<Box<Node>> }`) scatters nodes across separate heap chunks, turning every step into a dependent **pointer chase** (`60–100 ns` cache miss each).
- **Temporal locality in action:** Reusing a small hot lookup array or buffer that fits inside L1 (`32 KiB`) hits cache again and again at ~1 ns per access.

### Practical experiment: stride-1 vs stride-16 across 64-byte cache lines

Notice what happens when two loops perform the **exact same number of additions**, one stepping by `1` (`u64` = 8 bytes, so 8 hits per 64-byte cache line) and the other stepping by `8` (`8 * 8 = 64` bytes, jumping to a brand-new cache line on every single read!):

```rust run nocmp
use std::hint::black_box;
use std::time::Instant;

fn main() {
    // 4 MiB buffer = 524,288 u64 elements (larger than L1 + L2 cache)
    let data = vec![1_u64; 524_288];
    let steps = 65_536;

    // Loop A: stride 1 (touches 65,536 elements across 8,192 cache lines)
    let t0 = Instant::now();
    let mut sum_stride1 = 0_u64;
    for i in 0..steps {
        sum_stride1 += data[i];
    }
    let d1 = t0.elapsed();

    // Loop B: stride 8 u64s = 64 bytes (touches 65,536 elements across 65,536 cache lines!)
    let t1 = Instant::now();
    let mut sum_stride8 = 0_u64;
    for i in 0..steps {
        sum_stride8 += data[i * 8];
    }
    let d8 = t1.elapsed();

    println!("sums: {} == {}", black_box(sum_stride1), black_box(sum_stride8));
    println!("stride-1 (8 hits/line): {:?} | stride-8 (1 hit/line): {:?}", d1, d8);
}
```
```output
sums: 65536 == 65536
stride-1 (8 hits/line): 38.4µs | stride-8 (1 hit/line): 194.2µs
```

Both loops execute `65,536` additions. Yet `stride-8` touches **8× as many 64-byte cache lines** (`4 MiB` total instead of `512 KiB`), spending most of its time waiting on L3/DRAM fetches!

## Data-Oriented Design: AoS vs SoA and struct field ordering

Suppose you simulate 100,000 game entities or telemetry records, and a hot loop only updates each entity's `x` position and `vx` velocity while ignoring a 48-byte `name` / metadata array:

```rust run
// Array of Structures (AoS): each Particle wastes cache space on unused fields during physics
#[allow(dead_code)]
#[derive(Clone)]
struct ParticleAoS {
    x: f64,
    vx: f64,
    tag: [u8; 48], // dead weight during position updates!
}

// Structure of Arrays (SoA): hot fields sit packed side by side!
#[allow(dead_code)]
struct ParticlesSoA {
    xs: Vec<f64>,
    vxs: Vec<f64>,
    tags: Vec<[u8; 48]>,
}

fn step_aos(ps: &mut [ParticleAoS]) {
    for p in ps {
        p.x += p.vx;
    }
}

fn step_soa(ps: &mut ParticlesSoA) {
    for (x, vx) in ps.xs.iter_mut().zip(&ps.vxs) {
        *x += *vx;
    }
}

fn main() {
    let mut aos = vec![ParticleAoS { x: 0.0, vx: 1.5, tag: [0; 48] }; 4];
    let mut soa = ParticlesSoA {
        xs: vec![0.0; 4],
        vxs: vec![1.5; 4],
        tags: vec![[0; 48]; 4],
    };
    step_aos(&mut aos);
    step_soa(&mut soa);
    println!("aos[0].x={}, soa.xs[0]={}", aos[0].x, soa.xs[0]);
}
```
```output
aos[0].x=1.5, soa.xs[0]=1.5
```

Count the cache lines loaded by `step_aos` vs `step_soa`:

- **`ParticleAoS`** is `64` bytes per struct (`8 + 8 + 48`): every 64-byte cache line brings **1 particle's** `x` and `vx` along with 48 bytes of untouched `tag`.
- **`ParticlesSoA`** packs `8` `f64` positions per 64-byte cache line and `8` `f64` velocities per line—**4× fewer cache misses** and easy **[[SIMD]]** vectorisation.

## False sharing across CPU cores

Cache lines also explain a notorious multi-threaded performance cliff called **false sharing**. Suppose Core 0 increments `counters[0]` (`AtomicU64`) while Core 1 increments `counters[1]` (`AtomicU64`) in a tight loop. Because both integers are 8 bytes wide and sit side-by-side inside the **exact same 64-byte cache line**, hardware cache coherency (**MESI** protocol) has to bounce exclusive ownership of that entire 64-byte line back and forth between Core 0 and Core 1 on every write!

The fix in Rust is one attribute: `#[repr(align(64))]` (or `crossbeam_utils::CachePadded`), giving each core's counter its own 64-byte cache line:

```rust run
use std::mem::{align_of, size_of};
use std::sync::atomic::AtomicU64;

#[allow(dead_code)]
#[repr(align(64))]
struct CachePaddedAtomic(AtomicU64);

fn main() {
    let unpadded = [AtomicU64::new(0), AtomicU64::new(0)];
    let padded = [CachePaddedAtomic(AtomicU64::new(0)), CachePaddedAtomic(AtomicU64::new(0))];

    println!(
        "unpadded array: size={} align={}",
        size_of::<[AtomicU64; 2]>(),
        align_of::<AtomicU64>(),
    );
    println!(
        "padded array:   size={} align={}",
        size_of::<[CachePaddedAtomic; 2]>(),
        align_of::<CachePaddedAtomic>(),
    );
    let _ = (&unpadded, &padded);
}
```
```output
unpadded array: size=16 align=8
padded array:   size=128 align=64
```

Putting `[CachePaddedAtomic; 2]` at `128` bytes (`64`-byte aligned) guarantees Core 0's `L1d` line and Core 1's `L1d` line never collide on writes.

:::exercise guided Computing cache-line capacity
How many `u32` values fit cleanly inside a single 64-byte cache line? How many `String` headers (`24` bytes each on 64-bit) fit cleanly inside one 64-byte cache line without spanning two lines?
::hint
Divide `64` by `size_of::<T>()` (integer division for whole elements aligned inside one cache line).
::solution
- `64 / 4 = 16` `u32` values fit per 64-byte cache line.
- `64 / 24 = 2` complete `String` headers (`48` bytes) sit completely inside one line; the 3rd header spans bytes `48..72`, straddling the boundary between cache line 0 and cache line 1!
:::

:::exercise practice Measuring row-major vs column-major matrix traversal
Consider a 2D matrix flattened into a `Vec<u64>` of size `N * N` (`matrix[row * N + col]`). Explain which loop order—outer `row`, inner `col` vs outer `col`, inner `row`—gives high L1 cache hit rates and why.
::hint
Row-major strides by `+8` bytes per iteration; column-major strides by `+N * 8` bytes!
::solution
```rust run
fn sum_row_major(m: &[u64], n: usize) -> u64 {
    let mut total = 0;
    for r in 0..n {
        for c in 0..n {
            total += m[r * n + c]; // stride +8 bytes: 8 hits per cache line!
        }
    }
    total
}

fn sum_col_major(m: &[u64], n: usize) -> u64 {
    let mut total = 0;
    for c in 0..n {
        for r in 0..n {
            total += m[r * n + c]; // stride +(n * 8) bytes: misses nearly every read when n is large!
        }
    }
    total
}

fn main() {
    let n = 64;
    let m = vec![1_u64; n * n];
    println!("row={}, col={}", sum_row_major(&m, n), sum_col_major(&m, n));
}
```
```output
row=4096, col=4096
```
In `sum_row_major`, adjacent loop iterations read consecutive 8-byte elements inside the same 64-byte cache line and engage the hardware linear prefetcher; `sum_col_major` jumps forward by `N * 8` bytes every step.
:::

:::exercise challenge Eliminating unused hot-loop fields via index-splitting
Refactor a struct `UserRecord { id: u64, active: bool, bio: String, score: u32 }` into a hot array and a cold array so scanning active `id` + `score` touches minimal cache lines. Print `size_of` of the original struct vs the hot struct.
::hint
Keep only `id: u64`, `score: u32`, and `active: bool` in `HotUser` (16 bytes total), moving `bio: String` (24 bytes) into a parallel `Vec<String>` indexed by the same slot!
::solution
```rust run
use std::mem::size_of;

#[allow(dead_code)]
struct UserRecord {
    id: u64,
    bio: String,
    score: u32,
    active: bool,
}

#[allow(dead_code)]
struct HotUser {
    id: u64,
    score: u32,
    active: bool,
}

fn main() {
    println!("UserRecord = {} bytes, HotUser = {} bytes", size_of::<UserRecord>(), size_of::<HotUser>());
}
```
```output
UserRecord = 40 bytes, HotUser = 16 bytes
```
Four `HotUser` structs fit cleanly inside a single 64-byte cache line (`4 * 16 = 64`), whereas `UserRecord` (`40` bytes) only fits ~1.6 records per cache line while dragging untouched `String` headers into L1!
:::

:::recap
- Raw addresses behave identically in hardware, while Rust's references encode static non-null, alignment, lifetime, and `noalias` aliasing guarantees that outlaw UAF, double-free, buffer overflows, uninitialised reads, and data races.
- CPUs pull memory in **64-byte cache lines** through L1 (~1 ns), L2 (~4 ns), L3 (~20 ns), and DRAM (~80 ns).
- Sequential arrays (`Vec<T>`, **SoA** layouts, row-major scans) thrive on spatial locality and prefetching; pointer-chasing linked structures stall on DRAM latency.
- **`#[repr(align(64))]`** prevents **false sharing** when distinct threads mutate adjacent atomics on separate CPU cores.
:::

:::quiz Check your understanding
? Why does scanning a `Vec<u64>` beat walking a heap-allocated linked list (`Box<Node>`) even when both have the exact same asymptotic `O(n)` big-O complexity?
- `Vec<u64>` skips virtual memory translation
+ Contiguous `Vec<u64>` reads 8 elements per 64-byte cache line and activates the CPU's linear prefetcher, whereas linked nodes trigger cache misses on every pointer hop
- Linked lists cannot be cached in L3 cache
- `Box::new` forces a system call on every node
= Big-O ignores constant latency multipliers: an L1 cache hit takes ~1 ns while a DRAM pointer-chase miss takes ~80 ns.

? Which classic memory bug does Rust's single-owner + `Drop` rule eliminate without a garbage collector?
- Integer overflow in release mode
+ Double free and use-after-free
- Stack exhaustion from infinite recursion
- False sharing across threads
= Only one owner holds responsibility for calling `drop`, and moved bindings become inaccessible statically.

? Two worker threads increment separate counters `a` and `b` millions of times per second inside a tight loop, yet adding the second thread makes total throughput slower. What is the most likely hardware culprit?
- TLB exhaustion from huge pages
+ False sharing: `a` and `b` occupy the same 64-byte cache line, bouncing exclusive cache ownership between cores
- Stack overflow into a guard page
- Dynamic dispatch via vtable fat pointers
= Placing each thread's counter on its own `#[repr(align(64))]` cache line stops MESI coherency ping-ponging.

? How wide is a single cache line on virtually all modern x86-64 desktop and server processors?
- 8 bytes
- 16 bytes
+ 64 bytes
- 4,096 bytes
= Standard CPU cache lines are 64 bytes wide (while virtual memory pages are 4,096 bytes / 4 KiB).
:::
