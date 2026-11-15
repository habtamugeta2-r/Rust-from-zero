@id allocators-heap-internals
@part p4
@kind chapter
@title Heap Allocators, Memory Management & Rust Allocator Internals
@short Allocators & heap internals
@level intermediate
@time 35
@learn Contrast bump, free-list, slab/size-class, and thread-local (jemalloc/mimalloc) allocators | Trace how std's System allocator turns Box/Vec calls into malloc/free and brk/mmap | Implement a working bump allocator and GlobalAlloc wrapper in Rust | Diagnose internal/external fragmentation, allocator lock contention, and heap metadata

When a Rust program runs `let b = Box::new(42_u64);` or pushes an element onto a `Vec`, it rarely calls the Linux kernel directly. Making a system call on every 24-byte allocation would cost hundreds of nanoseconds and serialize threads on kernel locks. Instead, a **user-space allocator** asks the OS kernel for large chunks of virtual pages (`brk`/`sbrk` or `mmap`) occasionally and slices them up rapidly inside user space.

Understanding how allocators work explains *why* heap allocation is slower than the stack, why small allocations cluster into fixed size classes, why multi-threaded servers swap out the default system allocator for `jemalloc` or `mimalloc`, and how Rust's `#[global_allocator]` hook lets you inspect or replace allocation completely.

:::analogy A carpenter buying lumber vs cutting shelves
Going straight to the OS kernel for a 16-byte struct is like driving to the timber mill for one wooden toothpick. A user-space allocator buys whole pallets of plywood (`mmap` chunks of 64 KiB or 2 MiB), saws them into standard shelf widths (16 B, 32 B, 64 B, 128 B size classes) in its own workshop, and hands them out in nanoseconds—only calling the mill when the workshop runs dry or returns an entire empty pallet (`munmap`).
:::

:::compare Allocator architectures
| Allocator style | Allocation speed | Freeing individual items | Multi-thread scaling | Typical use |
|---|---|---|---|---|
| **Bump / Arena** | `O(1)` (~2 instructions) | Bulk reset only (`O(1)` for whole arena) | Thread-local = zero contention | Parsers, compilers (`rustc`), per-frame/request arenas |
| **Free-list** (`dlmalloc` style) | `O(n)` search or segregated bins | Coalesces adjacent free chunks | Poor without per-thread heaps | Simple embedded/custom allocators |
| **Size-class slab / `jemalloc` / `mimalloc`** | `O(1)` thread-local cache pop | Fast return to local bin / remote atomic free-list | Excellent (per-thread caches, zero mutex on fast path) | High-concurrency servers, Rust `rustc`, browsers |
:::

## From `Box::new` down to `mmap` and `brk`

Trace the exact layers crossed by a single `Vec::push` when capacity runs out:

:::note Rust allocation layers from std to kernel
```text
Your Rust code:        vec.push(value)  /  Box::new(x)
                             │
                             ▼
alloc::alloc::Global:  Global::alloc(Layout::new::<T>())
                             │   (checks zero-sized type -> dangling ptr, NO call!)
                             ▼
#[global_allocator]:   std::alloc::System::alloc(layout)
                             │   (dispatches to libc malloc / posix_memalign)
                             ▼
User-space allocator:  glibc ptmalloc2 / jemalloc / mimalloc
    ├─ Fast path: pops block from thread-local size-class bin (~10-20 ns)
    └─ Slow path: asks OS kernel for more pages via syscall (~500+ ns):
                    • brk() / sbrk()  -> extends [heap] upward (classic small arena)
                    • mmap(MAP_ANONYMOUS | MAP_PRIVATE) -> grabs fresh 4 KiB+ pages
```
:::

Notice the crucial shortcut built right into `Box::new(())` and `Vec::<()>::new()`: **zero-sized types (ZSTs) never touch the allocator**. If `layout.size() == 0`, Rust simply uses a well-aligned dangling pointer (`NonNull::dangling()`) without calling `malloc` or allocating a byte on the heap!

## How general-purpose allocators fight fragmentation

An allocator faces two competing enemies:
1. **External fragmentation:** Plenty of free bytes exist in total, scattered in tiny unadjacent holes (`[16B used][16B free][16B used][16B free]`), so a 32-byte request cannot fit even though 32 bytes are free.
2. **Internal fragmentation:** A 33-byte request gets rounded up into a 48-byte or 64-byte size-class slot, wasting the leftover 15–31 bytes inside the slot.

Modern allocators (`glibc ptmalloc2`, `jemalloc`, `mimalloc`, `snmalloc`) tame both using three core ideas:

- **Segregated size classes:** Allocations under a threshold (e.g. `<= 14 KiB` in `jemalloc`) are rounded up to predefined buckets (`8, 16, 32, 48, 64, 80, 96, 128, ..., 16 KiB`). All objects inside one 4 KiB or 64 KiB **slab** share the exact same slot size, so freeing any slot leaves a space guaranteed to fit the next object of that size class—eliminating external fragmentation inside the slab!
- **Large allocations bypass bins:** Any request larger than a threshold (commonly `>= 128 KiB` in `glibc`) skips the bins and gets its own `mmap` region directly; `free()` calls `munmap()` immediately and hands physical frames straight back to the kernel.
- **Thread-local caches (`tcache`):** Each OS thread holds private caches of recently freed slots per size class. Thread A allocating and freeing small `String`s touches **no atomics and no locks**. Only when a thread's local bin empties or overflows—or Thread B frees an object allocated by Thread A—does the allocator touch shared arena locks or atomic remote-free lists.

:::details Where allocation metadata lives (and why buffer overflows corrupt heaps)
Classic `ptmalloc2` stores an 8-byte **chunk header** (`prev_size` + `size` + `A/M/P` flags) right in front of the pointer returned to your program, and stores free-list pointers *inside* the payload bytes of freed chunks. Overwriting past the end of a heap buffer in C/C++ or `unsafe` Rust silently destroys the *next* chunk's header—causing baffling crashes much later inside `free()`. By contrast, `jemalloc` and `mimalloc` keep page metadata in separate side tables/slab headers rather than inline between adjacent allocations. Rust's bounds checks prevent the overflow altogether.
:::

## Rust's `GlobalAlloc`, `Layout`, and building a real bump allocator

Every Rust allocator implements two `unsafe` traits (or `GlobalAlloc` in stable Rust):
- **`Layout`:** Carries `(size, align)`, enforcing at construction that `align` is a power of two and `size` rounded up to `align` does not overflow `isize::MAX`.
- **`GlobalAlloc`:** Exposes `alloc(layout) -> *mut u8` and `dealloc(ptr, layout)` (plus default `alloc_zeroed` and `realloc`). Notice that Rust passes `layout` back to **`dealloc`**, sparing size-class allocators from storing an inline size tag next to every single allocation!

Let's write and test a genuine **bump (arena) allocator** backed by a fixed byte buffer, seeing every detail of alignment rounding and pointer bumping firsthand:

```rust run
use std::alloc::Layout;
use std::cell::Cell;

struct BumpArena {
    buf: Vec<u8>,
    next: Cell<usize>,
}

impl BumpArena {
    fn new(capacity: usize) -> Self {
        Self { buf: vec![0; capacity], next: Cell::new(0) }
    }

    fn alloc(&self, layout: Layout) -> Option<*mut u8> {
        let cur = self.next.get();
        let align_mask = layout.align() - 1;
        // Round `cur` up to the next multiple of `layout.align()`
        let aligned = (cur + align_mask) & !align_mask;
        let end = aligned.checked_add(layout.size())?;
        if end > self.buf.len() {
            return None;
        }
        self.next.set(end);
        // SAFETY: `aligned` is within `self.buf` bounds.
        Some(unsafe { self.buf.as_ptr().add(aligned) as *mut u8 })
    }

    fn used_bytes(&self) -> usize {
        self.next.get()
    }
}

fn main() {
    let arena = BumpArena::new(1024);

    // Allocate a single u8 (align 1) at offset 0 -> cursor = 1
    let p_byte = arena.alloc(Layout::new::<u8>()).unwrap();
    unsafe { *p_byte = 0xAA };

    // Next allocate a u64 (align 8) -> pads offsets 1..8, places u64 at 8..16!
    let p_u64 = arena.alloc(Layout::new::<u64>()).unwrap() as *mut u64;
    unsafe { *p_u64 = 0x1122_3344_5566_7788 };

    println!("u8={}, u64=0x{:x}, used={} bytes", unsafe { *p_byte }, unsafe { *p_u64 }, arena.used_bytes());
}
```
```output
u8=170, u64=0x1122334455667788, used=16 bytes
```

Look at what happened: allocating a `u8` bumped `next` to `1`. When we requested a `u64` (8-byte alignment), `(1 + 7) & !7` rounded cleanly up to offset `8`, left 7 padding bytes untouched, placed the 8-byte integer at `[8..16]`, and finished with `used = 16 bytes`—all in a handful of CPU instructions with zero `free()` bookkeeping!

## Custom `#[global_allocator]` & swapping allocators in production

In a real crate, plugging in `mimalloc` or `jemalloc`—or wrapping `std::alloc::System` to count allocations in tests—takes three lines:

```rust
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

struct CountingAlloc {
    calls: AtomicUsize,
}

unsafe impl GlobalAlloc for CountingAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        self.calls.fetch_add(1, Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static ALLOC: CountingAlloc = CountingAlloc { calls: AtomicUsize::new(0) };
```

:::warn Re-entrancy inside `GlobalAlloc`!
Never call `println!`, `Vec::new`, or anything that itself allocates inside `GlobalAlloc::alloc`—that recurses infinitely and blows the stack! Inside a global allocator hook, stick strictly to atomics, fixed buffers, or direct OS calls.
:::

## Stack vs Heap vs Arena: choosing with eyes open

1. **Stack:** Default choice (`i32`, `[u8; 64]`, small structs). Allocation/deallocation is one `sub rsp` / `add rsp` instruction—essentially free, bounded by ~8 MiB stack size, and LIFO-scoped.
2. **General heap (`Box`, `Vec`, `String`, `Arc`):** Needed when size varies at runtime, exceeds stack budget, or outlives the creating stack frame. Remember that moving a `Box<T>` or `String` never calls the allocator—only `new`, growth (`realloc`), `.clone()`, and `drop` do.
3. **Arena (`bumpalo`, `typed-arena`):** Ideal for compilers, parsers, AST trees, and per-request HTTP scratch buffers: allocate thousands of small nodes at bump speed and free the entire arena in one shot.

:::exercise guided Alignment math by hand
Suppose a bump arena starts at cursor `13` (in bytes) and receives three consecutive allocation requests: `(size=2, align=2)`, `(size=12, align=4)`, and `(size=8, align=8)`. Compute the starting offset and ending cursor after each allocation.
::hint
Apply `aligned = (cur + align - 1) & !(align - 1)` and `next = aligned + size`.
::solution
1. `(2, 2)` from `13`: `(13 + 1) & !1 = 14`, `next = 14 + 2 = 16`.
2. `(12, 4)` from `16`: `16` is already divisible by `4`, so `aligned = 16`, `next = 16 + 12 = 28`.
3. `(8, 8)` from `28`: `(28 + 7) & !7 = 32`, `next = 32 + 8 = 40`.
Total used: `40` bytes (`6` bytes of alignment padding total).
:::

:::exercise practice Measuring ZST vs non-ZST `Box` allocations
Write a tiny program checking `Box::new(())` vs `Box::new(1_u64)` pointers. Notice why `Box::new(())` always yields the same non-null aligned address (`align_of::<()>() == 1`) without hitting the heap!
::hint
Cast each `&*b as *const _ as usize` and print it in hex alongside `std::mem::size_of_val(&*b)`.
::solution
```rust run nocmp
fn main() {
    let z1 = Box::new(());
    let z2 = Box::new(());
    let h1 = Box::new(1_u64);
    let h2 = Box::new(2_u64);

    println!("z1={:p} z2={:p} (same non-null dangling ptr!)", &*z1, &*z2);
    println!("h1={:p} h2={:p} (distinct heap chunks!)", &*h1, &*h2);
}
```
Both `z1` and `z2` print `0x1` (`NonNull::<()>::dangling()`), proving zero allocator calls happened, whereas `h1` and `h2` receive distinct heap addresses.
:::

:::exercise challenge Adding `reset()` and `alloc_slice` to `BumpArena`
Extend `BumpArena` (or write a small wrapper method) so you can allocate a `&mut [u32]` of length `n` directly inside the arena and check how calling `reset()` (`self.next.set(0)`) reuses the buffer cleanly when lifetimes allow.
::hint
Use `Layout::array::<u32>(n).ok()?` to compute the slice's aligned byte size safely without overflow, zero the bytes or write each element, and return a slice with lifetime tied to `&mut self` (so `reset(&mut self)` cannot be called while the slice is still borrowed!).
::solution
```rust run
use std::alloc::Layout;

struct Arena {
    buf: Vec<u8>,
    next: usize,
}

impl Arena {
    fn new(cap: usize) -> Self { Self { buf: vec![0; cap], next: 0 } }

    fn alloc_u32_slice(&mut self, n: usize) -> Option<&mut [u32]> {
        let layout = Layout::array::<u32>(n).ok()?;
        let mask = layout.align() - 1;
        let aligned = (self.next + mask) & !mask;
        let end = aligned.checked_add(layout.size())?;
        if end > self.buf.len() { return None; }
        self.next = end;
        let ptr = unsafe { self.buf.as_mut_ptr().add(aligned) as *mut u32 };
        // Initialize every slot before forming &mut [u32]
        for i in 0..n {
            unsafe { ptr.add(i).write(0) };
        }
        Some(unsafe { std::slice::from_raw_parts_mut(ptr, n) })
    }

    fn reset(&mut self) { self.next = 0; }
}

fn main() {
    let mut arena = Arena::new(128);
    {
        let nums = arena.alloc_u32_slice(4).unwrap();
        nums.copy_from_slice(&[10, 20, 30, 40]);
        println!("slice = {nums:?}");
    }
    arena.reset();
    let again = arena.alloc_u32_slice(2).unwrap();
    println!("after reset = {again:?}");
    println!("cursor = {}", arena.next);
}
```
```output
slice = [10, 20, 30, 40]
after reset = [0, 0]
cursor = 8
```
Notice how taking `&mut self` binds the lifetime of `nums` to `arena`, making the Rust borrow checker prevent `arena.reset()` while `nums` is still in use!
:::

:::recap
- User-space allocators amortise expensive `brk()` / `mmap()` syscalls by caching large virtual regions and carving them up in user space.
- Segregated **size classes** prevent external fragmentation inside slabs, while **thread-local caches (`tcache`)** eliminate mutex contention on small allocations.
- Rust's `GlobalAlloc` trait passes `Layout` to both `alloc` and `dealloc`, enabling size-class allocators without per-object inline size headers, and skips allocation altogether for ZSTs.
- **Bump/arena allocators** offer `O(1)` allocation and bulk reset for compilers, parsers, and request scopes.
:::

:::quiz Check your understanding
? Why do general-purpose allocators use size classes (`16, 32, 48, 64, ...`) instead of splitting arbitrary byte counts for small allocations?
- Because CPUs can only read powers of two
+ To eliminate external fragmentation inside slabs and enable fast O(1) free-list reuse
- Because Linux `mmap` only maps 16-byte chunks
- So `Box::new(())` can allocate 16 bytes
= When every slot in a slab has the exact same size, freeing any slot leaves a hole guaranteed to fit the next request in that class.

? What happens when you execute `Box::new(())` in Rust?
- `malloc(1)` is called on the system allocator
- `mmap` allocates one 4 KiB zeroed page
+ No allocator call happens; Rust returns a well-aligned non-null dangling pointer
- The compiler fails with a ZST error
= Zero-sized types require zero heap bytes; `Box::new(())` creates an aligned dangling pointer at zero runtime cost.

? Why must a custom `#[global_allocator]` avoid calling `Vec::push` or `println!` inside `alloc()`?
- Neither function is `unsafe`
+ Both can allocate on the heap, causing infinite recursion inside `alloc()`
- `println!` runs on a separate thread
- `GlobalAlloc` prohibits standard-library traits
= Re-entering `alloc()` while inside `alloc()` recurses without bound until the thread overflows its stack.

? Why does `GlobalAlloc::dealloc` take `(ptr, layout)` instead of only `ptr`?
- So the allocator knows how much virtual RAM the CPU has
+ Because Rust knows the type's size and alignment statically, sparing size-class allocators from storing an inline size header next to every object
- To zero out the freed memory automatically
- To convert raw pointers back into `NonNull`
= Passing `Layout` on `dealloc` is a zero-overhead Rust design choice that removes extra per-allocation size bookkeeping.
:::
