@id unsafe
@part p8
@title Unsafe Rust: taking over responsibility
@short Unsafe Rust
@level advanced
@time 55
@learn Explain what `unsafe` allows, what it does not change, and what undefined behaviour is | Work with raw pointers | Wrap unsafe code in a safe interface and document why it is sound | Name the tools that check unsafe code | Judge when unsafe code is justified

Everything you have written so far was **safe Rust**: the compiler guaranteed that no reference dangles, no index reads outside its array, and no two threads race for the same data. It gives these guarantees by being careful. When it cannot prove that some code is correct, it rejects the code, even if the code happens to be fine.

Some things cannot be proved by any compiler: that an address handed over by the operating system really points to usable memory, or that a function written in C keeps its promises. For these cases Rust has a second mode, entered with the keyword `unsafe`.

:::analogy The maintenance hatch
A machine on a factory floor has guards so that nobody can reach into the moving parts. A trained technician sometimes has to open a guard to repair the machine. The guard is not removed from the factory. It is opened at one marked spot, by someone who knows the procedure, for as short a time as possible. `unsafe` is that hatch.
:::

`unsafe` does not mean "this code is dangerous" or "this code is wrong". It means: **"the compiler cannot check this part. I, the programmer, have checked it, and I take the responsibility."**

## What `unsafe` allows

Inside an `unsafe` block you may do five things that are forbidden elsewhere:

1. read or write through a **raw pointer**,
2. call an **unsafe function** (including functions from other languages),
3. read or change a **mutable static variable**,
4. implement an **unsafe trait**,
5. read a field of a **union**.

That is the whole list. Everything else stays as it was. The borrow checker still checks references. Types are still checked. Indexing a vector is still checked at run time. `unsafe` adds five abilities and takes no checks away.

## Undefined behaviour

In exchange for the five abilities, you must keep the rules that the compiler normally enforces. Breaking them causes **undefined behaviour**, often shortened to **UB**.

:::key What undefined behaviour means
The compiler builds your program on the assumption that certain things never happen. If one of them does happen, there is no rule for what the program does next. It may crash. It may produce wrong results. It may appear to work for years and fail after a compiler update. It may let an attacker take control. "It worked when I tried it" proves nothing.

The most important things that must never happen:

- reading or writing through a pointer that is null, dangling, or outside its allocation,
- reading memory that was never given a value,
- breaking the borrowing rules: a `&mut` that is not exclusive, or changing data while a `&` to it exists,
- a data race,
- creating a value that is invalid for its type: a `bool` that is neither 0 nor 1, a `char` outside the valid range, a reference that is null, an enum with a number that names no variant,
- calling a function from another language with the wrong signature.
:::

In safe Rust, none of these can happen. That is the meaning of "memory safe". In C and C++, all of them can happen anywhere. In Rust, they can only originate in an `unsafe` block, so when something goes wrong, you know where to look.

## Raw pointers

A **raw pointer** is an address in memory with a type attached, and no guarantees. There are two kinds: `*const T` (for reading) and `*mut T` (for reading and writing).

| | Reference `&T`, `&mut T` | Raw pointer `*const T`, `*mut T` |
|---|---|---|
| Always points to a valid value | yes | not necessarily |
| Can be null | no | yes |
| Borrowing rules enforced | yes | no |
| Has a lifetime | yes | no |
| Freed automatically | (does not own) | no |
| Using it | safe | reading or writing needs `unsafe` |

```rust run
fn main() {
    let mut number = 5;

    // Creating raw pointers is safe
    let reader = &raw const number;
    let writer = &raw mut number;

    // Using them is not
    unsafe {
        *writer += 1;
        println!("{}", *reader);
    }
}
```
```output
6
```

`&raw const number` creates a `*const i32`, and `&raw mut number` a `*mut i32`. A reader and a writer to the same value exist side by side here, which references would not allow. The compiler permits *creating* them, because a pointer that is never used can do no harm. *Dereferencing* a raw pointer, with `*`, is the dangerous step, and needs `unsafe`.

A raw pointer can be made from any number, and then it points wherever that number says:

```rust
let address = 0x1234_usize;
let pointer = address as *const i32;
// unsafe { println!("{}", *pointer); }    // almost certainly a crash: nothing valid lives there
```

Raw pointers have methods for the basic operations: `is_null()`, `add(n)` to move forward by `n` elements, `read()` and `write(value)`.

## Unsafe functions

A function can be marked `unsafe`. That tells callers: "this function has requirements that the compiler cannot check. Read the documentation and make sure you meet them." It can only be called inside an `unsafe` block.

```rust run
/// Returns the element at `index` without checking the bounds.
///
/// # Safety
///
/// `index` must be smaller than `list.len()`.
unsafe fn element_unchecked(list: &[i32], index: usize) -> i32 {
    // SAFETY: the caller guarantees that `index` is in bounds.
    unsafe { *list.get_unchecked(index) }
}

fn main() {
    let numbers = [10, 20, 30];

    // SAFETY: 2 is smaller than the length, 3.
    let value = unsafe { element_unchecked(&numbers, 2) };
    println!("{value}");
}
```
```output
30
```

Two conventions are visible here, and both are worth adopting from the first day:

- An unsafe function has a **`# Safety` section** in its documentation that lists what the caller must guarantee.
- Every `unsafe` block has a **`// SAFETY:` comment** that explains why the requirements are met at this spot.

The body of an unsafe function still needs its own `unsafe` block around each unsafe operation. So the two meanings of the keyword stay apart: `unsafe fn` *states* a requirement, and `unsafe { }` *claims* that a requirement is fulfilled.

`get_unchecked` skips the bounds check that `list[index]` performs. Calling `element_unchecked(&numbers, 7)` would read memory beyond the array: undefined behaviour.

## A safe interface over unsafe code

The main use of `unsafe` is to build something that is safe to use. The standard library is full of such code: `Vec`, `String`, `Rc`, `Mutex` and the channels all contain unsafe code inside and offer an interface that cannot be misused.

A classic example is `split_at_mut`, which divides one mutable slice into two. You cannot write it in safe Rust:

```rust fail nowrap E0499
fn split_at_mut(values: &mut [i32], middle: usize) -> (&mut [i32], &mut [i32]) {
    assert!(middle <= values.len());
    (&mut values[..middle], &mut values[middle..])
}
```
```error auto
```

The borrow checker sees two mutable borrows of `values`. It does not understand that the two ranges do not overlap. They never do, so the function is sound. This is a case where the programmer knows more than the compiler:

```rust run
use std::slice;

fn split_at_mut(values: &mut [i32], middle: usize) -> (&mut [i32], &mut [i32]) {
    let length = values.len();
    let pointer = values.as_mut_ptr();
    assert!(middle <= length);

    // SAFETY: `pointer` is valid for `length` elements. Because of the
    // assertion, both parts lie inside the slice, and they do not overlap:
    // the first covers [0, middle), the second [middle, length).
    unsafe {
        (
            slice::from_raw_parts_mut(pointer, middle),
            slice::from_raw_parts_mut(pointer.add(middle), length - middle),
        )
    }
}

fn main() {
    let mut numbers = [1, 2, 3, 4, 5];
    let (left, right) = split_at_mut(&mut numbers, 2);
    left[0] = 10;
    right[0] = 30;
    println!("{:?}", numbers);
}
```
```output
[10, 2, 30, 4, 5]
```

`as_mut_ptr()` gives a raw pointer to the first element. `slice::from_raw_parts_mut(pointer, n)` builds a slice from a pointer and a length. It is an unsafe function, because it trusts both values blindly.

The function `split_at_mut` itself is **not** marked `unsafe`. Whatever arguments a caller passes, nothing bad can happen: a `middle` that is too large is caught by the `assert!`. The assertion is part of the safety argument. Remove it, and safe code could create slices beyond the end of the array.

:::key Soundness
A safe function is **sound** if no possible use of it from safe code can cause undefined behaviour. Making your safe wrappers sound is the whole responsibility you take on when you write `unsafe`. It is not enough that correct use works. *Incorrect* use must be either impossible to write or caught with a check.
:::

### Managing memory by hand

To see what `Vec` and `Box` do inside, here is a small buffer that asks the memory allocator for space directly:

```rust run
use std::alloc::{alloc, dealloc, handle_alloc_error, Layout};

/// A fixed-size block of `i32` values on the heap, managed by hand.
struct Buffer {
    pointer: *mut i32,
    length: usize,
}

impl Buffer {
    fn new(length: usize) -> Buffer {
        assert!(length > 0, "a buffer needs at least one element");
        let layout = Layout::array::<i32>(length).expect("the buffer is too large");

        // SAFETY: the layout has a size greater than zero.
        let pointer = unsafe { alloc(layout) as *mut i32 };
        if pointer.is_null() {
            handle_alloc_error(layout);
        }

        // SAFETY: `pointer` is valid for `length` elements, and each one
        // is written before anybody can read it.
        for i in 0..length {
            unsafe { pointer.add(i).write(0) };
        }
        Buffer { pointer, length }
    }

    fn get(&self, index: usize) -> Option<i32> {
        if index >= self.length {
            return None;
        }
        // SAFETY: the index was checked, and every element is initialised.
        Some(unsafe { *self.pointer.add(index) })
    }

    fn set(&mut self, index: usize, value: i32) -> bool {
        if index >= self.length {
            return false;
        }
        // SAFETY: the index was checked, and `&mut self` gives exclusive access.
        unsafe { *self.pointer.add(index) = value };
        true
    }
}

impl Drop for Buffer {
    fn drop(&mut self) {
        let layout = Layout::array::<i32>(self.length).expect("checked in new");
        // SAFETY: the pointer came from `alloc` with this same layout,
        // and it is freed exactly once, here.
        unsafe { dealloc(self.pointer as *mut u8, layout) };
    }
}

fn main() {
    let mut buffer = Buffer::new(4);
    buffer.set(0, 10);
    buffer.set(3, 40);
    println!("{:?} {:?} {:?}", buffer.get(0), buffer.get(3), buffer.get(1));
    println!("{:?} {}", buffer.get(4), buffer.set(9, 1));
}
```
```output
Some(10) Some(40) Some(0)
None false
```

Every hazard of manual memory management appears in these lines, each one answered:

| Hazard | How `Buffer` prevents it |
|---|---|
| The allocation fails | the null check after `alloc` |
| Reading memory that was never written | `new` fills every element with 0 |
| Reading or writing out of bounds | `get` and `set` check the index |
| Forgetting to free (a leak) | `Drop` frees the memory |
| Freeing twice | the pointer is owned by one `Buffer`, which is not `Clone` and is dropped once |
| Use after free | the pointer is private and never handed out |
| A data race | `set` takes `&mut self`, and a raw pointer field makes the type neither `Send` nor `Sync` |

The fields are private. That matters: if outside code could change `length`, all the safety arguments would collapse. **The privacy boundary of the module is the safety boundary.** All code that can touch the private parts must be reviewed together.

A `Layout` describes how many bytes are needed and how they must be aligned ([chapter 37](#memory-layout)). In real code you would simply use `vec![0; 4]`. The point is to see that there is no magic underneath.


### A lock built by hand: `UnsafeCell`

[Chapter 27](#smart-pointers) and [chapter 31](#shared-state) showed types that change their content through a shared reference: `Cell`, `RefCell`, `Mutex`, the atomics. All of them are built on one type, **`UnsafeCell<T>`**. It is the only legal way in Rust to change data behind a `&`. Its method `get` returns a raw pointer to the content, and from there on the responsibility is yours.

To see how the pieces of the last chapters fit together, here is a complete lock. It waits by trying again and again, which is called a **spin lock**:

```rust run
use std::cell::UnsafeCell;
use std::ops::{Deref, DerefMut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

pub struct SpinLock<T> {
    locked: AtomicBool,
    value: UnsafeCell<T>,
}

// SAFETY: the lock lets only one thread at a time reach the value. The value
// is handed from thread to thread, so `T` must be `Send`.
unsafe impl<T: Send> Sync for SpinLock<T> {}

pub struct Guard<'a, T> {
    lock: &'a SpinLock<T>,
}

// SAFETY: a shared guard gives out `&T`, so guards may be shared between
// threads only if `T` itself may be shared.
unsafe impl<T: Sync> Sync for Guard<'_, T> {}

impl<T> SpinLock<T> {
    pub const fn new(value: T) -> Self {
        SpinLock { locked: AtomicBool::new(false), value: UnsafeCell::new(value) }
    }

    pub fn lock(&self) -> Guard<'_, T> {
        // `swap` writes `true` and returns what was there before.
        // If that was `false`, the lock was free and is now ours.
        while self.locked.swap(true, Ordering::Acquire) {
            std::hint::spin_loop(); // tells the processor that we are waiting
        }
        Guard { lock: self }
    }
}

impl<T> Deref for Guard<'_, T> {
    type Target = T;

    fn deref(&self) -> &T {
        // SAFETY: a guard exists only while the lock is held, so no other
        // thread can reach the value.
        unsafe { &*self.lock.value.get() }
    }
}

impl<T> DerefMut for Guard<'_, T> {
    fn deref_mut(&mut self) -> &mut T {
        // SAFETY: as above, and `&mut self` proves that this guard is not shared.
        unsafe { &mut *self.lock.value.get() }
    }
}

impl<T> Drop for Guard<'_, T> {
    fn drop(&mut self) {
        self.lock.locked.store(false, Ordering::Release);
    }
}

fn main() {
    let counter = SpinLock::new(0u64);

    thread::scope(|scope| {
        for _ in 0..4 {
            scope.spawn(|| {
                for _ in 0..100_000 {
                    *counter.lock() += 1;
                }
            });
        }
    });

    println!("{}", *counter.lock());
}
```
```output
400000
```

Read it from the outside in:

- **The safe interface.** A user can only call `new` and `lock`, and reaches the value only through a `Guard`. No call order exists that leads to two threads holding the value at once. That is the claim every `unsafe` block here depends on, and each `// SAFETY:` comment says so.
- **`locked.swap(true, …)`** is the whole locking logic, in one atomic step. `Acquire` and `Release` are the orderings made for this: everything written before the `Release` store is visible after the `Acquire` swap that takes the lock next.
- **The guard** is the RAII idea again: `Deref` and `DerefMut` give access, and `Drop` unlocks. Forgetting to unlock is impossible.
- **The two `unsafe impl` lines** are promises to the compiler. The first says that a `SpinLock<T>` may be shared between threads. The second *restricts* something: without it, the compiler's automatic rule would let every guard be shared between threads, even a guard for a type like `Cell<i32>`, which must never be used from two threads at once. Nothing warns about a mistake like that. Only careful reading finds it.

That last point is the lesson. The lock is about 60 lines long, it follows a well-known design, and it still needed a line that is easy to forget. For real programs, use `std::sync::Mutex`: it puts a waiting thread to sleep where this one keeps a processor core busy, and many people have checked it.

:::details Memory that has no value yet: `MaybeUninit`
Safe Rust never lets you read a variable before it has a value. Unsafe code sometimes needs room that is filled in later: an array built element by element, or a buffer that a C function will write to. Reading memory that was never written is undefined behaviour, even for a plain number. The type `MaybeUninit<T>` is "room for a `T` that may or may not be there yet":

```rust run
use std::mem::MaybeUninit;

fn main() {
    // Room for four numbers. Nothing has been written to it.
    let mut slots = [MaybeUninit::<u32>::uninit(); 4];

    for (i, slot) in slots.iter_mut().enumerate() {
        slot.write(i as u32 * 10); // writing is safe
    }

    // SAFETY: the loop above has written every element.
    let numbers = slots.map(|slot| unsafe { slot.assume_init() });
    println!("{:?}", numbers);
}
```
```output
[0, 10, 20, 30]
```

`assume_init` is the unsafe step: you promise that a value has been written. In old code you may see `std::mem::uninitialized()`. It is deprecated, because almost every use of it was undefined behaviour.
:::

### Controlling drop order: `ManuallyDrop<T>`

Normally Rust runs `Drop` automatically on every field when a struct leaves scope, in declaration order. Sometimes you need to suppress automatic dropping—for instance, to put a non-`Copy` field inside a `union`, hand ownership across FFI without double-freeing, or drop fields in an explicit custom order before releasing an allocator or lock.

`std::mem::ManuallyDrop<T>` wraps `T` with zero memory overhead and **never drops `T` automatically**. Unlike `std::mem::forget` (which consumes ownership permanently and leaks), `ManuallyDrop<T>` lets you keep reading and mutating `T` via `Deref`/`DerefMut` and explicitly run `ManuallyDrop::drop` inside `unsafe` (or extract the value back out safely with `ManuallyDrop::into_inner`):

```rust run
use std::mem::ManuallyDrop;

struct Logger(&'static str);

impl Drop for Logger {
    fn drop(&mut self) {
        println!("dropping {}", self.0);
    }
}

struct OrderedPair {
    second: ManuallyDrop<Logger>,
    first: ManuallyDrop<Logger>,
}

impl Drop for OrderedPair {
    fn drop(&mut self) {
        // SAFETY: both fields are initialised and dropped exactly once here.
        unsafe {
            ManuallyDrop::drop(&mut self.first);
            ManuallyDrop::drop(&mut self.second);
        }
    }
}

fn main() {
    let pair = OrderedPair {
        second: ManuallyDrop::new(Logger("second field")),
        first: ManuallyDrop::new(Logger("first field")),
    };
    println!("created {}", pair.first.0);
}
```
```output
created first field
dropping first field
dropping second field
```

`ManuallyDrop::drop(&mut x)` runs the destructor in place without moving `x`, so you must guarantee nothing touches `x` afterwards and it is never dropped a second time.

## The other three abilities

### Mutable statics

A `static mut` is a global variable that can be changed, with no protection at all. Any thread can reach it at any time, so every access is a potential data race.

```rust run
static mut COUNTER: u32 = 0;

fn main() {
    // SAFETY: this program has only one thread.
    unsafe {
        COUNTER += 1;
        COUNTER += 1;
        let value = COUNTER;
        println!("{value}");
    }
}
```
```output
2
```

Even inside `unsafe`, Rust refuses to create a *reference* to a `static mut` (`println!("{}", COUNTER)` would, and is an error), because such a reference could be made invalid from anywhere. In new code there is almost never a reason to use `static mut`. An atomic, a `Mutex` or a `OnceLock` in a plain `static` does the same job safely, as shown in [chapter 31](#shared-state).

### Unsafe traits

A trait is `unsafe` when implementing it wrongly could cause undefined behaviour in *other*, safe code. The two you will meet are `Send` and `Sync`. The compiler implements them automatically where it can. A type that holds a raw pointer gets neither. If you know that your type is safe to move between threads all the same, you say so, and take the responsibility:

```rust run
use std::thread;

struct Handle {
    pointer: *mut u32,
}

// SAFETY: a `Handle` is the only owner of the value it points to, and that
// value is only accessed through the `Handle`. Moving it to another thread
// moves the exclusive access with it.
unsafe impl Send for Handle {}

fn main() {
    let handle = Handle { pointer: Box::into_raw(Box::new(41)) };

    let result = thread::spawn(move || {
        let handle = handle;      // move the whole struct into the thread
        // SAFETY: the pointer came from `Box::into_raw` and is used exactly once.
        let mut value = unsafe { Box::from_raw(handle.pointer) };
        *value += 1;
        *value
    })
    .join()
    .unwrap();

    println!("{result}");
}
```
```output
42
```

`Box::into_raw` turns a box into a raw pointer and stops managing the memory. `Box::from_raw` turns it back, after which the box frees the memory as usual. This pair is the standard way to hand ownership through a raw pointer, and it is how Rust values are passed to and from C code in the next chapter.

### Unions

A `union` is like a struct in which all fields share the same memory. Only one of them holds a meaningful value at a time, and the program itself must remember which. Reading a field is unsafe, because the compiler cannot know that you picked the right one.

```rust run
union IntOrFloat {
    integer: u32,
    float: f32,
}

fn main() {
    let value = IntOrFloat { float: 1.0 };
    // SAFETY: every bit pattern is a valid u32.
    let bits = unsafe { value.integer };
    println!("{bits:#010x}");
    println!("{:#010x}", 1.0_f32.to_bits());     // the safe way to get the same answer
}
```
```output
0x3f800000
0x3f800000
```

Unions exist mainly to exchange data with C code. In pure Rust, an enum does the same job and remembers which variant is active.

## Reinterpreting bytes: `transmute`

`std::mem::transmute` takes the bytes of a value and declares them to be a value of another type of the same size. It is the most dangerous function in the standard library, because it switches the type system off completely.

```rust warns
fn main() {
    let number: u32 = 0x3f80_0000;
    // SAFETY: u32 and f32 have the same size, and every bit pattern is a valid f32.
    let float: f32 = unsafe { std::mem::transmute(number) };
    println!("{float}");
}
```
```error auto
```

The program prints `1`, and the compiler itself points out that the `transmute` is unnecessary. The safe functions say what they mean:

```rust run
fn main() {
    println!("{}", f32::from_bits(0x3f80_0000));
    println!("{:?}", 258_u32.to_le_bytes());
    println!("{}", u32::from_le_bytes([2, 1, 0, 0]));
    println!("{}", 65_u8 as char);
}
```
```output
1
[2, 1, 0, 0]
258
A
```

There is nearly always a safe function for the conversion you need: `from_bits`, `to_bits`, `to_le_bytes`, `from_le_bytes`, `as`, `From`. Use `transmute` only when nothing else exists, and never to change a lifetime or to turn a `&T` into a `&mut T`. The latter is undefined behaviour in every case.

## Tools that check unsafe code

Unsafe code cannot be verified by the compiler, but you are not without help.

- **Miri** is an interpreter that runs your program or tests and watches every memory access. It detects most kinds of undefined behaviour: out-of-bounds access, use after free, uninitialised reads, and violations of the borrowing rules through raw pointers. It needs the nightly toolchain:

  ```text
  rustup +nightly component add miri
  cargo +nightly miri test
  ```

  Run it on every piece of unsafe code you write. It is slow, and it can only find problems on the paths your tests exercise, so write tests that cover the unusual cases.
- **Sanitizers** (AddressSanitizer, ThreadSanitizer) are checks compiled into the program. They are faster than Miri and also cover code from other languages that is linked into your program.
- **Clippy** ([chapter 40](#quality-tools)) has lints for unsafe code. `clippy::undocumented_unsafe_blocks` demands a `SAFETY` comment on every block.
- **`#![forbid(unsafe_code)]`** at the top of a crate makes any `unsafe` a compile error. Use it to state, and enforce, that a crate is entirely safe.
- **`cargo geiger`** counts the unsafe code in your dependencies.

## When is `unsafe` justified?

Good reasons:

- **Talking to other languages and to the operating system.** There is no other way ([chapter 36](#ffi)).
- **Talking to hardware**, in embedded systems and drivers, where memory addresses are device registers.
- **Building basic data structures and synchronisation tools** that the borrow checker cannot express: a doubly linked list, a lock-free queue, a memory arena.
- **Performance**, in a place that measurements have shown to matter, where a check cannot be removed in any safe way.

Poor reasons:

- **"The borrow checker is in my way."** It is nearly always pointing at a real problem in the design. Restructure, clone, use indices, or use `Rc<RefCell<T>>`.
- **"It is faster"**, without a measurement. The optimiser removes most bounds checks on its own, and iterators have none.

Rules for writing it:

1. **Keep it small.** A few lines inside a safe function.
2. **Wrap it** in a sound, safe interface with private fields.
3. **Write down the invariants**: the facts that must always be true (for `Buffer`: "`pointer` points to `length` initialised values").
4. **Comment every block** with `// SAFETY:`.
5. **Test with Miri.**
6. **Look for a crate first.** Well-tested crates exist for most needs: `bytemuck` and `zerocopy` for reinterpreting bytes, `crossbeam` for lock-free structures, `parking_lot` for locks.

Most Rust programmers write unsafe code rarely or never. Application code, web services and command-line tools do not need it. It is still worth understanding, because it explains how the safe parts are built, and how far the guarantees reach.

:::compare Safety in other languages
- In **C and C++**, the whole program is "unsafe" in Rust's sense. Any line can cause undefined behaviour, and reviews must cover everything.
- **Java, C#, Go and Python** are memory safe through a garbage collector and run-time checks. They also have escape hatches: `sun.misc.Unsafe`, C#'s `unsafe` keyword, Go's `unsafe` package, Python's `ctypes`.
- **Rust's** contribution is the combination: no garbage collector, safe by default, and unsafe code that is explicitly marked, small, and wrapped. Studies of large Rust code bases find that a few percent of the code is unsafe, and that is where reviewers concentrate.
:::

:::recap
- `unsafe` permits five things: dereferencing raw pointers, calling unsafe functions, accessing mutable statics, implementing unsafe traits, and reading unions. All other checks remain.
- With them comes the duty to avoid undefined behaviour, which the compiler can no longer rule out.
- Raw pointers (`*const T`, `*mut T`) can be null or dangling. Creating them is safe, and using them is not.
- `unsafe fn` states requirements for the caller (`# Safety`). An `unsafe { }` block claims they are met (`// SAFETY:`).
- The goal is a sound safe interface: safe code must not be able to cause undefined behaviour through it. Private fields protect the invariants.
- Check unsafe code with Miri. Prefer safe alternatives and established crates.
:::

:::quiz Check your understanding
? What does an `unsafe` block switch off?
- The borrow checker
- All type checks
+ Nothing. It allows five additional operations, and all the usual checks stay active
- Bounds checks on vectors
= `unsafe` adds abilities. References are still borrow-checked, types are still checked, and `v[i]` still checks its index.

? Which of these needs `unsafe`?
- Creating a raw pointer with `&raw const x`
+ Reading the value behind a raw pointer with `*pointer`
- Comparing two raw pointers
- Printing the address in a raw pointer
= Making and handling raw pointers is safe. Dereferencing is not, because the pointer may be invalid.

? What does "undefined behaviour" mean?
- The program always crashes
- The result is random but harmless
+ The language gives no guarantee at all about what the program does. It may seem to work and still be broken
- The compiler reports an error
= The compiler optimises on the assumption that undefined behaviour never happens. When it does, anything can follow, including wrong results far from the cause.

? A safe function contains an `unsafe` block. For which inputs must it be free of undefined behaviour?
- For the inputs the author had in mind
- For all inputs mentioned in the documentation
+ For every input that safe code can possibly pass
- Only for inputs that pass the tests
= A safe function promises soundness. If some input could trigger undefined behaviour, the function must either check for it, or be marked `unsafe` and document the requirement.

? Why are the fields of a type that wraps unsafe code usually private?
- To make the type smaller
+ The safety of the unsafe code relies on facts about those fields, and outside code could break those facts by changing them
- Private fields are faster
- The compiler requires it
= If anyone could set `length` to a larger number, the bounds check in front of the unsafe access would be worthless. Privacy keeps the invariant in the hands of the module.
:::

:::exercise guided Swap through raw pointers
Write a safe function `swap(a: &mut i32, b: &mut i32)` that exchanges the two values using raw pointers. Create the pointers from the references, read both values, and write them back the other way round. Add a `SAFETY` comment.
::hint
`let pa: *mut i32 = a;` converts a mutable reference into a raw pointer. Inside `unsafe`, `*pa` reads and `*pa = value` writes.
::solution
```rust run
fn swap(a: &mut i32, b: &mut i32) {
    let pa: *mut i32 = a;
    let pb: *mut i32 = b;

    // SAFETY: both pointers come from valid, exclusive references, so they
    // are non-null, aligned, and point to initialised values. Two `&mut`
    // references can never point to the same value, so they do not overlap.
    unsafe {
        let temporary = *pa;
        *pa = *pb;
        *pb = temporary;
    }
}

fn main() {
    let mut x = 1;
    let mut y = 2;
    swap(&mut x, &mut y);
    println!("{x} {y}");
}
```
```output
2 1
```

The function is safe to call, because its parameters are references, and references always fulfil what the raw pointers need. This exercise is for practice only: the same job is done without `unsafe` by `std::mem::swap(a, b)`, and that is what you should use.
:::

:::exercise practice Two elements at once
Write a safe function `two_mut(list: &mut [i32], i: usize, j: usize) -> Option<(&mut i32, &mut i32)>` that returns mutable references to two **different** elements. It returns `None` if the indices are equal or out of bounds. Safe Rust rejects `(&mut list[i], &mut list[j])`. Use raw pointers.
::hint
Do all the checks first: `i == j`, `i >= list.len()`, `j >= list.len()`. Then get `let pointer = list.as_mut_ptr();` and build the references with `&mut *pointer.add(i)` inside `unsafe`.
::solution
```rust run
fn two_mut(list: &mut [i32], i: usize, j: usize) -> Option<(&mut i32, &mut i32)> {
    if i == j || i >= list.len() || j >= list.len() {
        return None;
    }
    let pointer = list.as_mut_ptr();

    // SAFETY: both indices are in bounds, so both pointers are valid.
    // They are different, so the two references do not alias. Both borrow
    // from `list`, which stays mutably borrowed for as long as they live.
    unsafe { Some((&mut *pointer.add(i), &mut *pointer.add(j))) }
}

fn main() {
    let mut scores = [10, 20, 30, 40];

    if let Some((first, last)) = two_mut(&mut scores, 0, 3) {
        std::mem::swap(first, last);
        *first += 1;
    }
    println!("{:?}", scores);
    println!("{} {}", two_mut(&mut scores, 2, 2).is_none(), two_mut(&mut scores, 0, 9).is_none());
}
```
```output
[41, 20, 30, 10]
true true
```

The check `i == j` is the heart of the safety argument. Two `&mut` to the same element would be undefined behaviour, even if neither is ever written through. The return type ties both references to the borrow of `list`, so the compiler stops callers from using the slice while they are alive.

The standard library offers this operation: `list.get_disjoint_mut([i, j])`. As so often, the unsafe code you need has been written and reviewed already.
:::

:::exercise challenge Find the undefined behaviour
Each of these four functions compiles. Three contain undefined behaviour, or allow safe callers to cause it. Find them, explain why, and say how to fix each.

```rust
// A
fn first_word(text: &str) -> &str {
    let end = text.find(' ').unwrap_or(text.len());
    unsafe { text.get_unchecked(..end) }
}

// B
fn make_pointer() -> *const i32 {
    let local = 42;
    &raw const local
}
fn use_it() -> i32 {
    unsafe { *make_pointer() }
}

// C
fn as_bool(byte: u8) -> bool {
    unsafe { std::mem::transmute(byte) }
}

// D
fn get(list: &[i32], index: usize) -> i32 {
    unsafe { *list.as_ptr().add(index) }
}
```
::hint
For each function ask: is there any argument that safe code could pass that breaks a rule from the list at the start of the chapter? Think about dangling pointers, invalid values and bounds.
::solution
**A is sound.** `find(' ')` returns the byte position of a space, which is always inside the text and on a character boundary, and `text.len()` is the end. The range `..end` is therefore always valid for `get_unchecked`. A `SAFETY` comment should say so. The `unsafe` gains almost nothing here, though: `&text[..end]` is safe and nearly as fast.

**B is undefined behaviour.** `make_pointer` returns the address of a local variable. When the function returns, `local` no longer exists, and the pointer dangles. Creating and returning the pointer is allowed, which is why it compiles. Dereferencing it in `use_it` reads memory that has been released. With a reference, the compiler would have refused (`E0515`). Fix: return the value itself, or a `Box<i32>`.

**C is unsound.** A `bool` must be the byte 0 or 1. `as_bool(2)` creates a `bool` with an invalid value, which is immediate undefined behaviour, even if it is never looked at. The function is safe to call and accepts every `u8`, so safe code can trigger it. Fix: `byte != 0`, which needs no `unsafe`.

**D is unsound.** Nothing checks `index`. `get(&[1, 2, 3], 10)` reads beyond the slice. Because `get` is a safe function, any caller can do that. Fix: check the index first (`if index < list.len()`), or simply write `list[index]`, or mark the function `unsafe fn` and document the requirement in a `# Safety` section.

```rust run
fn as_bool(byte: u8) -> bool {
    byte != 0
}

fn get(list: &[i32], index: usize) -> Option<i32> {
    list.get(index).copied()
}

fn main() {
    println!("{} {}", as_bool(2), as_bool(0));
    println!("{:?} {:?}", get(&[1, 2, 3], 1), get(&[1, 2, 3], 10));
}
```
```output
true false
Some(2) None
```

The pattern in B, C and D is the same: the code works for the inputs its author imagined, and nothing stops other inputs. Reviewing unsafe code means looking for the input nobody imagined. In all three cases the best fix was to remove the `unsafe` altogether.
:::
