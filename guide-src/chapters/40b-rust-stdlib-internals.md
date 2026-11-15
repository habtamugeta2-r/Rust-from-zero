@id rust-stdlib-internals
@part p3
@title Rust standard library and compiler internals
@short Stdlib and compiler internals
@level advanced
@time 65
@learn Trace the exact memory layouts of Vec, String, Box, Rc, and Option in std | Explain how niche optimisation eliminates enum tag bytes | Describe how UnsafeCell, NonNull, ManuallyDrop, and MaybeUninit work inside core and alloc | Explain drop flags, MIR drop elaboration, pointer provenance, and compiler miscompilation from UB

Earlier chapters used `Vec<T>`, `String`, `Option<T>`, `Box<T>`, `Rc<T>` and `RefCell<T>`. Their behaviour comes from standard-library implementations, compiler-supported language features and allocation routines—not special CPU instructions for each type. This chapter opens those implementations and shows where the compiler's guarantees rely on library code and documented invariants.

## Starting point: `std` is just Rust code over `core` and `alloc`

:::analogy Looking inside a mechanical watch
You can tell the time just by reading the dial (`Vec::push`, `Option::unwrap`). Opening the back cover reveals tiny precision gears (`RawVec`, `NonNull`, `UnsafeCell`, `ManuallyDrop`) working together so the watch hands never collide or slip.
:::

Rust's standard library is layered in three concentric crates:

1. **`core`** — OS-independent, allocator-independent foundations: primitive intrinsics, `Option`, `Result`, `Cell`, `UnsafeCell`, `MaybeUninit`, `ManuallyDrop`, `NonNull`, slices, and `Iterator`.
2. **`alloc`** — Heap-backed containers built over a global allocator (`GlobalAlloc`): `Box<T>`, `RawVec<T>`, `Vec<T>`, `String`, `Rc<T>`, `Arc<T>`, `BTreeMap`. What actually answers those allocation calls is covered in [heap allocators](#allocators-heap-internals). What actually answers those allocation calls is covered in [heap allocators](#allocators-heap-internals). What actually answers those allocation calls is covered in [heap allocators](#allocators-heap-internals).
3. **`std`** — OS integration (`std::fs`, `std::net`, `std::io`, `std::thread`, `std::sync::Mutex`), built on `core`, `alloc`, and OS syscalls or `libc`.

## Internal layouts of `Box`, `Vec`, `String`, and `Rc`

Look at how the core heap types actually sit in RAM:

```text
Box<T>:                        Vec<T> (24 bytes on 64-bit):
  Stack: [ ptr: NonNull<T> ]     Stack: [ ptr: NonNull<T> | cap: usize | len: usize ]
             │                               │
             ▼                               ▼
  Heap:  [ T ]                   Heap:  [ T0 | T1 | ... | T(len-1) | uninit ... ]
                                          |<-------- cap slots ----------------->|

String (24 bytes):             Rc<T> (8 bytes on stack):
  Wrapper around Vec<u8>         Stack: [ ptr: NonNull<RcBox<T>> ]
  guaranteed valid UTF-8!                    │
                                             ▼
                                 Heap:  [ strong: Cell<usize> | weak: Cell<usize> | value: T ]
```

Five implementation details inside `alloc` explain why these types are both safe and compact:

- **`NonNull<T>` over `*mut T`:** `Box`, `Vec`, and `Rc` store `core::ptr::NonNull<T>` rather than a nullable `*mut T`. That tells the compiler *"this pointer is never `0` (null)"*—unlocking **[[niche]] optimisation**.
- **Co-variance and `PhantomData<T>`:** `NonNull<T>` is covariant in `T` (unlike `*mut T`, which is invariant) and carries zero bytes. Containers add `PhantomData<T>` so the **drop checker (`dropck`)** knows the wrapper logically owns a `T` and drops it when destroyed.
- **`RawVec` growth and ZSTs:** When a non-zero-sized `Vec<T>` fills up, `RawVec` asks the [global allocator](#allocators-heap-internals) for a bigger block and grows capacity roughly exponentially (doubling from small capacities like 4 → 8 → 16) so repeated `push` calls take **amortised O(1)** time. For **zero-sized types** (ZSTs like `Vec<()>`), `RawVec` allocates **zero heap bytes**, sets `ptr` to `NonNull::dangling()` (a well-aligned non-zero address), and reports capacity as `usize::MAX`.
- **`String` is literally `struct String { vec: Vec<u8> }`:** Every `String` invariant reduces to one guarantee: the `len` initialised bytes inside `vec` are always valid UTF-8. The order of those three words also decides which cache lines two strings share — see [pointers, safety and caches](#pointers-safety-caches). The order of those three words also decides which cache lines two strings share — see [pointers, safety and caches](#pointers-safety-caches). The order of those three words also decides which cache lines two strings share — see [pointers, safety and caches](#pointers-safety-caches).
- **`RcBox<T>` uses `Cell<usize>`:** Even though `Rc<T>` only hands out shared `&Rc<T>` references, cloning or dropping changes `strong`/`weak` counts via `Cell` (which wraps `UnsafeCell` for [[interior mutability]]).

## Niche optimisation: why `Option<&T>` costs zero extra bytes

An ordinary enum like `enum Status { Ok(u64), Err(u64) }` needs a **[[discriminant]]** tag byte plus alignment padding (`16` bytes total). Yet `Option<&T>`, `Option<Box<T>>`, and `Option<NonZeroU64>` are **only 8 bytes**—identical to the bare pointer or integer.

:::plain What is a niche?
A **[[niche]]** is a bit pattern inside a type's bytes that no valid value of that type may ever use. For example, a Rust reference `&T` may never be `0` (null), and a `bool` uses only `0` (`false`) and `1` (`true`), leaving `2` through `255` unused. When you wrap that type in `Option`, `rustc` stores `None` inside one of those unused bit patterns instead of adding an extra tag byte.
:::

```text
&u64 (8 bytes):         [ non-zero 64-bit address ]
Option<&u64> (8 bytes): [ 0x0000_0000_0000_0000 ] => None
                        [ non-zero address       ] => Some(&u64)
```

Verify this directly in Rust:

```rust run
use std::mem::size_of;
use std::num::NonZeroU64;
use std::ptr::NonNull;

# #[allow(dead_code)]
enum ExplicitTwoU64 {
    First(u64),
    Second(u64),
}

fn main() {
    println!("&u64              : {} B", size_of::<&u64>());
    println!("Option<&u64>      : {} B", size_of::<Option<&u64>>());
    println!("Option<Box<u64>>  : {} B", size_of::<Option<Box<u64>>>());
    println!("Option<NonNull>   : {} B", size_of::<Option<NonNull<u64>>>());
    println!("Option<NonZeroU64>: {} B", size_of::<Option<NonZeroU64>>());
    println!("Option<bool>      : {} B", size_of::<Option<bool>>());
    println!("ExplicitTwoU64    : {} B", size_of::<ExplicitTwoU64>());
}
```
```output
&u64              : 8 B
Option<&u64>      : 8 B
Option<Box<u64>>  : 8 B
Option<NonNull>   : 8 B
Option<NonZeroU64>: 8 B
Option<bool>      : 1 B
ExplicitTwoU64    : 16 B
```

Notice line 6: `Option<bool>` takes just **1 byte** (`0 = Some(false)`, `1 = Some(true)`, `2 = None`), whereas `ExplicitTwoU64` has no unused bit pattern in `u64` and therefore needs a separate tag plus 7 padding bytes (`16 B`).

## `UnsafeCell<T>`: the one true door to interior mutability

Remember from Part II that `rustc` emits **`noalias`** and **`readonly`** hints to LLVM for shared `&T` references: if you pass `&T` to a function, LLVM assumes the bytes behind `&T` will **never mutate** during that borrow, and may cache them in a register across calls!

That creates a puzzle: how do `Cell<T>`, `RefCell<T>`, `Mutex<T>`, and `AtomicU64` mutate memory while holding only `&self`?

If you simply cast `&T` to `*mut T` in `unsafe` code and write through it, **that is instant Undefined Behaviour**—LLVM may miscompile the code completely because it kept an old cached copy in a register!

**`core::cell::UnsafeCell<T>`** is a special compiler `lang` item that switches off LLVM's read-only assumption for the wrapped `T`. Every single interior mutability type in Rust (`Cell`, `RefCell`, `OnceCell`, `Mutex`, `RwLock`, `AtomicUsize`, `RcBox` counters) wraps an `UnsafeCell<T>` underneath. There is no back door around `UnsafeCell`.

## `MaybeUninit<T>` and `ManuallyDrop<T>`: controlling initialisation and destruction

Inside allocators, buffers, and collections like `Vec<T>`, two common problems arise:
1. **Uninitialised spare capacity (`MaybeUninit<T>`):** Calling `std::mem::zeroed()` for a type like `&T` or `bool` or `NonNull<T>` is **instant Undefined Behaviour**, because `0` is not a valid inhabitant of `&T` or `NonNull<T>`! Wrapping storage in `[MaybeUninit<T>; N]` tells `rustc` *"these bytes may be uninitialised garbage; do not assume validity invariants and do not run `Drop` on them automatically."*
2. **Suppressing automatic drops (`ManuallyDrop<T>`):** When `Vec::pop` moves the last `T` out, or when `ManuallyDrop` hands ownership into FFI or changes drop order inside a custom struct, `ManuallyDrop<T>` stops the compiler from emitting an automatic `Drop::drop` call at scope exit while preserving zero size overhead (`size_of::<ManuallyDrop<T>>() == size_of::<T>()`).

```rust run
use std::mem::{ManuallyDrop, MaybeUninit, size_of};

struct LoudDrop(&'static str);
impl Drop for LoudDrop {
    fn drop(&mut self) {
        println!("dropping {}", self.0);
    }
}

fn main() {
    let mut slot: MaybeUninit<i32> = MaybeUninit::uninit();
    slot.write(42);
    // SAFETY: we just wrote an initialised i32 into `slot`.
    let ready = unsafe { slot.assume_init() };

    let manual = ManuallyDrop::new(LoudDrop("kept alive"));
    println!("ready = {ready}, size = {}", size_of::<ManuallyDrop<LoudDrop>>());
    // Manually drop explicitly when ready:
    let mut manual = manual;
    // SAFETY: `manual` is valid and never used again after drop().
    unsafe { ManuallyDrop::drop(&mut manual); }
    println!("after explicit drop");
}
```
```output
ready = 42, size = 16
dropping kept alive
after explicit drop
```

(On 64-bit targets, `&'static str` is a 16-byte `(ptr, len)` fat pointer, so `size_of::<ManuallyDrop<LoudDrop>>()` is `16`.)

## Drop elaboration and drop flags

Suppose a local variable `s = String::from("Habtamu")` might be moved inside an `if` branch:

```rust
let s = String::from("Habtamu");
if some_condition {
    consume(s); // moved here!
}
// End of scope: should `s` be dropped here?
```

If `some_condition` was `false`, `s` still owns its heap buffer and **must** be dropped. If `true`, `consume` already dropped it, so dropping again would **double-free**!

During **[[MIR]] drop elaboration**:

- When moves happen statically on all paths (or none), `rustc` emits unconditional drop calls or omits them completely—**zero runtime overhead**.
- Only when ownership state at scope exit depends on a runtime branch does `rustc` place a tiny 1-byte boolean **drop flag** on the stack (`_drop_flag = true` initially, set to `false` when moved) and inspect it before calling `drop`.
- At compile time, `std::mem::needs_drop::<T>()` lets generic code like `Vec<T>::clear()` skip looping over elements completely when `T` is `i32` or `[u8; 64]` (`needs_drop::<i32>() == false`), turning `Vec<i32>::clear()` into a single `self.len = 0` instruction.

## Pointer provenance and why Undefined Behaviour breaks LLVM

:::plain Pointer provenance
**[[Provenance|provenance]]** means a pointer is more than a raw 64-bit house number: it also carries a "hall pass" recording *which* variable or heap block it came from and whether it has read-only or read-write permission. Forging a pointer from a plain integer (`usize as *const T`) throws away that hall pass, which can confuse optimiser passes that track aliasing.
:::

Two pointers can share the exact same numeric address (`0x7ffd...100`) while having different provenance; [raw pointers, dangling pointers and strict provenance](#pointers-safety-caches) work through those rules in detail. Converting an integer back into a pointer (`usize as *const T`) loses provenance unless you use Rust's Strict Provenance APIs (`ptr.addr()`, `ptr.with_addr(...)`) that derive valid provenance from a live pointer into the same allocation.

When `unsafe` code violates aliasing or out-of-bounds provenance ([[undefined behaviour]]), LLVM does not crash cleanly at the line of the bug—it treats undefined behaviour as **mathematically impossible**, allowing constant-propagation and dead-code passes to delete null checks, fuse conflicting branches, or return stale register values.

## Practical experiment: verify `needs_drop`, `RawVec`-style layout, and provenance

Inspect `needs_drop`, zero-cost wrappers, and `NonNull` in pure Rust:

```rust run nocmp
use std::mem::{ManuallyDrop, MaybeUninit, needs_drop, size_of};
use std::ptr::NonNull;

fn main() {
    println!("needs_drop::<i32>()    = {}", needs_drop::<i32>());
    println!("needs_drop::<String>() = {}", needs_drop::<String>());
    println!("size String / Vec<u8>  = {} / {}", size_of::<String>(), size_of::<Vec<u8>>());
    println!("size MaybeUninit<u64>  = {}", size_of::<MaybeUninit<u64>>());
    println!("size ManuallyDrop<u64> = {}", size_of::<ManuallyDrop<u64>>());

    let mut value: u64 = 99;
    let ptr = NonNull::from(&mut value);
    // Strict provenance: inspect numeric address without casting the pointer away
    println!("ptr addr = 0x{:x}, val = {}", ptr.addr().get(), unsafe { *ptr.as_ptr() });
}
```
```output
needs_drop::<i32>()    = false
needs_drop::<String>() = true
size String / Vec<u8>  = 24 / 24
size MaybeUninit<u64>  = 8
size ManuallyDrop<u64> = 8
ptr addr = 0x7ffd8a4c1028, val = 99
```

:::compare C++ `std::vector` vs Rust `Vec<T>`
In C++, moving a `std::vector` leaves behind a valid "empty" shell whose destructor still runs at scope end unless optimised out. In Rust, moving a `Vec<T>` is a trivial 24-byte `memcpy`, statically tracked in MIR so the moved-from variable has **no destructor run** (or uses a 1-byte stack drop flag only across conditional moves), and `Vec<()>` never calls `malloc` at all.
:::

:::recap
- `core` provides compiler-backed primitives (`Option`, `UnsafeCell`, `MaybeUninit`, `ManuallyDrop`, `NonNull`); `alloc` builds heap structures (`Box`, `Vec`, `String`, `Rc`); `std` integrates OS interfaces.
- `String` wraps `Vec<u8>` (3 machine words: `ptr`, `cap`, `len`), and `Rc<T>` points to a heap `RcBox` storing `Cell` reference counts beside `T`.
- **Niche optimisation** packs `Option` discriminants into forbidden bit patterns (like `0` for references/boxes/`NonNull`) at zero size cost.
- `UnsafeCell<T>` is the sole primitive permitting mutation through `&T` without triggering LLVM `readonly`/`noalias` miscompilations.
- **MIR drop elaboration** skips drops (`needs_drop::<T>() == false`) and uses stack drop flags only when moves happen conditionally.
:::

:::quiz Check your understanding
? Why is `size_of::<Option<&String>>()` 8 bytes on a 64-bit machine rather than 16 bytes?
- Because `&String` is compressed at runtime before storing
+ Because `&String` can never be null (`0`), so the compiler uses the `0` bit pattern to represent `None` (niche optimisation)
- Because `Option` strips the pointer and keeps only a boolean
- Because `String` is always 8 bytes
= Non-null pointers (`&T`, `Box<T>`, `NonNull<T>`) forbid the zero address, giving the compiler a free bit pattern for `None`.

? What happens if `unsafe` code casts `&T` directly to `*mut T` and writes to `T` without an `UnsafeCell<T>`?
- It safely updates `T` just like `RefCell<T>`
- It fails to compile with `E0596`
+ It causes Undefined Behaviour, because LLVM assumes memory behind `&T` never mutates unless wrapped in `UnsafeCell<T>`
- It automatically acquires a kernel mutex
= `UnsafeCell<T>` is the compiler marker that suppresses read-only/immutability assumptions for shared references.

? Why does `alloc::vec::Vec<()>` allocate zero bytes from the OS heap even when you push a million `()` items?
- Because `Vec<()>` stores elements inside `.rodata`
+ Because `()` is a zero-sized type (ZST); `RawVec` sets capacity to `usize::MAX` and stores only the `len` counter on the stack
- Because Rust forbids vectors of unit values
- Because `()` fits inside the 8-byte alignment padding of `len`
= Pushing zero-sized elements requires no heap memory per element—only incrementing `len`!

? What is `MaybeUninit<T>` designed to prevent in low-level `unsafe` Rust?
- Heap fragmentation across threads
+ Reading or dropping uninitialised bytes as a typed value (which causes UB for types with invalid bit patterns like `bool` or `&T`)
- Stack overflow during deep recursion
- Dynamic linking failures in `ld-linux.so`
= `MaybeUninit<T>` informs the compiler that its backing bytes might not yet hold a valid `T` and skips implicit drops until explicitly assumed initialised.
:::

:::exercise guided Measure niche optimisation across types
Print `size_of` for `bool`, `Option<bool>`, `Option<Option<bool>>`, `char`, `Option<char>`, and `Result<(), NonZeroU8>`. Predict each size before running!
::hint
Remember `bool` uses values `0` and `1` (leaving 254 niche values!), `char` only uses `0..=0x10FFFF` (leaving millions of invalid 32-bit bit patterns!), and `NonZeroU8` forbids `0`.
::solution
```rust run
use std::mem::size_of;
use std::num::NonZeroU8;

fn main() {
    println!("bool               = {}", size_of::<bool>());
    println!("Option<bool>       = {}", size_of::<Option<bool>>());
    println!("Option<Option<bool>> = {}", size_of::<Option<Option<bool>>>());
    println!("char               = {}", size_of::<char>());
    println!("Option<char>       = {}", size_of::<Option<char>>());
    println!("Result<(), NonZeroU8> = {}", size_of::<Result<(), NonZeroU8>>());
}
```
```output
bool               = 1
Option<bool>       = 1
Option<Option<bool>> = 1
char               = 4
Option<char>       = 4
Result<(), NonZeroU8> = 1
```

Every single one fits in the exact size of its inner type! Even `Option<Option<bool>>` packs `Some(false)`, `Some(true)`, `Some(None)`, and `None` into bit patterns `0, 1, 2, 3` inside 1 byte.
:::

:::exercise practice Safely initialise an array slot by slot with `MaybeUninit`
Create an array `[MaybeUninit<u32>; 4]`, fill each slot with `i * 10`, and convert it safely into `[u32; 4]` (printing the finished array) without calling `std::mem::zeroed()`.
::hint
Use `[const { MaybeUninit::uninit() }; 4]` to initialise the array of uninitialised wrappers, write each element via `arr[i].write(...)`, and then read each element cleanly using `arr.map(|slot| unsafe { slot.assume_init() })`!
::solution
```rust run
use std::mem::MaybeUninit;

fn main() {
    let mut slots: [MaybeUninit<u32>; 4] = [const { MaybeUninit::uninit() }; 4];
    for (i, slot) in slots.iter_mut().enumerate() {
        slot.write((i as u32) * 10);
    }

    // SAFETY: every element 0..4 was just initialised in the loop above.
    let values: [u32; 4] = slots.map(|slot| unsafe { slot.assume_init() });
    println!("{values:?}");
}
```
```output
[0, 10, 20, 30]
```

This avoids wasteful pre-zeroing and avoids UB if the element type later changes to something non-zeroable such as `String` or `NonNull<T>`.
:::

:::exercise challenge Build a mini `SimpleCell<T>` on top of `UnsafeCell`
Implement a tiny `SimpleCell<T: Copy>` wrapper around `std::cell::UnsafeCell<T>` with `new(val: T)`, `get(&self) -> T`, and `set(&self, val: T)` (requiring only `&self`, not `&mut self`), and demonstrate mutating it through two shared references. Explain why `T: Copy` (never returning `&T`) is essential for soundness!
::hint
Use `unsafe { *self.value.get() }` inside `get` and `unsafe { *self.value.get() = val; }` inside `set`. Because `SimpleCell` is single-threaded (`!Sync` automatically via `UnsafeCell`), no other thread can race on it!
::solution
```rust run
use std::cell::UnsafeCell;

struct SimpleCell<T> {
    value: UnsafeCell<T>,
}

impl<T: Copy> SimpleCell<T> {
    fn new(val: T) -> Self {
        Self { value: UnsafeCell::new(val) }
    }

    fn get(&self) -> T {
        // SAFETY: `!Sync` guarantees single-thread access, and `Copy` returns
        // a duplicate without creating any long-lived `&T` aliasing future writes.
        unsafe { *self.value.get() }
    }

    fn set(&self, val: T) {
        // SAFETY: no shared `&T` to the inner value can exist outside `get`/`set`.
        unsafe { *self.value.get() = val; }
    }
}

fn main() {
    let cell = SimpleCell::new(10);
    let r1 = &cell;
    let r2 = &cell;
    r1.set(r2.get() + 32);
    println!("cell = {}", cell.get());
}
```
```output
cell = 42
```

If `SimpleCell` returned `&T` instead of copying `T` out, someone could hold `let r: &Vec<i32> = cell.get_ref();` and then call `cell.set(vec![])`, leaving `r` dangling! Returning a copy keeps the invariant completely sound.
:::
