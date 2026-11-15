@id memory-layout
@part p3
@title How data sits in memory
@short Memory layout
@level advanced
@time 45
@learn Find the size and alignment of any type | Explain padding and why field order matters | Control layout with `repr` attributes | Describe how enums, `Option`, references and trait objects are stored | Reason about the cost of allocations, indirection and cache misses

[Chapter 13](#memory) introduced the stack and the heap. This chapter goes one level deeper and looks at how individual values are stored, byte by byte. You need this knowledge to exchange data with other languages, to read and write binary file formats, and to understand why one data structure is fast and another is slow.

All the numbers in this chapter are for a 64-bit computer, which is what almost everyone uses today. This chapter stops at the byte. For what happens between your source text and those bytes — the compiler pipeline, the linker, the operating system's loader, and the fetch–decode–execute cycle of the processor — see [the silicon appendix](#under-the-hood).

## Size and alignment

Every type has two basic properties:

- its **size**: how many bytes a value occupies,
- its **alignment**: the value's address must be a multiple of this number.

```rust run
use std::mem::{align_of, size_of};

fn main() {
    println!("u8    size {}  align {}", size_of::<u8>(), align_of::<u8>());
    println!("u16   size {}  align {}", size_of::<u16>(), align_of::<u16>());
    println!("u32   size {}  align {}", size_of::<u32>(), align_of::<u32>());
    println!("u64   size {}  align {}", size_of::<u64>(), align_of::<u64>());
    println!("f64   size {}  align {}", size_of::<f64>(), align_of::<f64>());
    println!("bool  size {}  align {}", size_of::<bool>(), align_of::<bool>());
    println!("char  size {}  align {}", size_of::<char>(), align_of::<char>());
    println!("usize size {}  align {}", size_of::<usize>(), align_of::<usize>());
}
```
```output
u8    size 1  align 1
u16   size 2  align 2
u32   size 4  align 4
u64   size 8  align 8
f64   size 8  align 8
bool  size 1  align 1
char  size 4  align 4
usize size 8  align 8
```

Why alignment? Processors read memory most efficiently, and on some machines only, when a 4-byte value starts at an address divisible by 4, and an 8-byte value at an address divisible by 8. So every type demands a suitable starting position.

A `char` takes 4 bytes, because it can hold any Unicode character. A `bool` takes a whole byte, although one bit would be enough, because the smallest unit of memory with an address is the byte.

## Structs: padding and field order

A struct stores its fields one after another. To give every field its alignment, the compiler may have to leave gaps. These unused bytes are called **padding**.

:::plain Size, alignment, and padding
A struct's in-memory layout is not just its fields side by side. Each field must sit at an address that is a multiple of its **alignment**, so the compiler inserts invisible **padding** bytes between fields, and `size_of::<T>()` includes them. Reordering fields from largest to smallest can shrink a struct substantially, and `#[repr(C)]` fixes the order to C's (no reordering) while `#[repr(Rust)]` lets the compiler choose. Enums carry a hidden **discriminant** describing which variant is active, and the **niche optimisation** squeezes `Option<Box<T>>` into one pointer because a null pointer is an unused bit pattern.
:::

:::analogy Packing a suitcase
Imagine a suitcase with fixed compartments, in which large items may only start at certain marks. Put a small item first and a large one after it, and space is left over in between. Put the large items first and the small ones last, and everything fits tightly.
:::

Take a struct with a `u8`, a `u32` and a `u16`, laid out in the order written:

```text
offset   0    1    2    3    4    5    6    7    8    9    10   11
        [ a ][ -- padding -- ][      b       ][   c   ][ padding ]
         u8                    u32 (align 4)   u16      (size must be a multiple of 4)
```

`b` needs an address divisible by 4, so three bytes after `a` are wasted. At the end, two more bytes round the size up to a multiple of the struct's alignment, so that structs can sit side by side in an array. Total: 12 bytes for 7 bytes of data.

```rust run
# #![allow(dead_code)]
use std::mem::size_of;

// Rust's default layout: the compiler chooses the order
struct Mixed {
    a: u8,
    b: u32,
    c: u16,
}

// C layout: fields in the order written
#[repr(C)]
struct MixedC {
    a: u8,
    b: u32,
    c: u16,
}

// C layout, with the fields sorted by hand from large to small
#[repr(C)]
struct MixedCSorted {
    b: u32,
    c: u16,
    a: u8,
}

fn main() {
    println!("{} {} {}", size_of::<Mixed>(), size_of::<MixedC>(), size_of::<MixedCSorted>());
}
```
```output
8 12 8
```

**By default, Rust reorders the fields** to keep the padding small. That is why `Mixed` needs 8 bytes and not 12. The order in which you write the fields does not affect the size, and you should not rely on any particular order in memory.

With **`#[repr(C)]`**, the fields are stored in the order written, as a C compiler does it. Then the order matters, and sorting the fields from the largest alignment to the smallest gives the tightest result.

### The `repr` attributes

| Attribute | Effect | Use it for |
|---|---|---|
| (none) | Rust chooses the layout and may reorder fields | everything, unless there is a reason |
| `#[repr(C)]` | fields in written order, C's rules | FFI, binary formats |
| `#[repr(transparent)]` | same layout as the single field inside | newtypes passed through FFI |
| `#[repr(u8)]`, `#[repr(i32)]`, … | on an enum: store the variant number in this integer type | enums shared with C, or written to files |
| `#[repr(packed)]` | no padding at all | exact binary formats. Fields may be misaligned, so use with great care |
| `#[repr(align(64))]` | raise the alignment to at least 64 | keeping data on separate cache lines |

```rust run
# #![allow(dead_code)]
use std::mem::{align_of, size_of};

#[repr(C, packed)]
struct Packed {
    a: u8,
    b: u32,
    c: u16,
}

#[repr(transparent)]
struct Metres(f64);

#[repr(u8)]
#[derive(Clone, Copy)]
enum Level {
    Low = 1,
    Mid = 5,
    High = 10,
}

fn main() {
    println!("{} {}", size_of::<Packed>(), align_of::<Packed>());
    println!("{}", size_of::<Metres>());
    println!("{} {}", size_of::<Level>(), Level::Mid as u8);
}
```
```output
7 1
8
1 5
```

`Level::Mid as u8` gives the number stored for the variant. Enums without data can be given explicit numbers, which is how you match the constants of a C header or of a file format.

## Enums and the niche optimisation

An enum must remember which variant it currently is. That information is called the **tag** or **discriminant**. An enum with data is as large as its largest variant, plus the tag, plus padding:

```rust run
# #![allow(dead_code)]
use std::mem::size_of;

enum Direction {
    North,
    East,
    South,
    West,
}

enum Shape {
    Circle(f64),
    Rectangle(f64, f64),
    Empty,
}

fn main() {
    println!("{}", size_of::<Direction>());     // only a tag
    println!("{}", size_of::<Shape>());         // two f64 for the largest variant, plus a tag
}
```
```output
1
24
```

`Shape` needs 16 bytes for the two numbers of a rectangle, and one byte for the tag, which alignment rounds up to 24.

Now look at `Option`. You might expect `Option<T>` to always be bigger than `T`, since it needs a tag. Often it is not:

```rust run
use std::mem::size_of;
use std::num::NonZeroU32;

fn main() {
    println!("{} {}", size_of::<u32>(), size_of::<Option<u32>>());
    println!("{} {}", size_of::<&u8>(), size_of::<Option<&u8>>());
    println!("{} {}", size_of::<Box<u32>>(), size_of::<Option<Box<u32>>>());
    println!("{} {}", size_of::<String>(), size_of::<Option<String>>());
    println!("{} {}", size_of::<NonZeroU32>(), size_of::<Option<NonZeroU32>>());
    println!("{} {}", size_of::<bool>(), size_of::<Option<bool>>());
    println!("{} {}", size_of::<char>(), size_of::<Option<char>>());
}
```
```output
4 8
8 8
8 8
24 24
4 4
1 1
4 4
```

An `Option<u32>` needs 8 bytes: every one of the 4 billion bit patterns of a `u32` is a valid number, so the tag needs extra space. But a reference can never be the address zero. Rust uses that one impossible value to mean `None`, and the `Option` costs nothing. An unused bit pattern like this is called a **niche**, and the trick is the **niche optimisation**.

- References, `Box`, `Rc`, `Arc`, `String` and `Vec` all contain a pointer that is never null.
- A `bool` uses only the values 0 and 1 of its byte, so 2 can mean `None`.
- A `char` does not use all 32-bit values.
- `NonZeroU32` and its relatives are integers that promise never to be zero, to make room for exactly this.

So "there may be a value or not" costs no memory for the most common cases. A null pointer in C and an `Option<&T>` in Rust are the same bits in memory. The difference is that Rust's type forces you to check.

## Pointers, thin and fat

A reference or `Box` to a normal type is one address: 8 bytes. A reference to a type whose size is not known at compile time carries a second piece of information, and is called a **fat pointer**:

```rust run
use std::mem::{size_of, size_of_val};

fn main() {
    println!("{}", size_of::<&u8>());                 // thin: an address
    println!("{}", size_of::<&str>());                // address + length in bytes
    println!("{}", size_of::<&[u64]>());              // address + number of elements
    println!("{}", size_of::<Box<dyn Fn()>>());       // address + address of the vtable
    println!("{}", size_of::<String>());              // address + length + capacity
    println!("{}", size_of::<Vec<u64>>());            // address + length + capacity

    let text = String::from("hello");
    let list = vec![1_u64, 2, 3];
    println!("{} {}", size_of_val(&text), size_of_val(text.as_str()));
    println!("{} {}", size_of_val(&list), size_of_val(list.as_slice()));
}
```
```output
8
16
16
16
24
24
24 5
24 24
```

`size_of_val` measures a concrete value. The `String` itself, the part on the stack, is always 24 bytes. The text it owns on the heap is 5 bytes here. For the vector, both happen to be 24: the record on the stack, and three `u64` on the heap.

```text
   a String on the stack                     its data on the heap
  ┌──────────┬────────┬──────────┐          ┌───┬───┬───┬───┬───┬───┬───┬───┐
  │ pointer ─┼────────┼──────────┼─────────▶│ h │ e │ l │ l │ o │   │   │   │
  ├──────────┼────────┼──────────┤          └───┴───┴───┴───┴───┴───┴───┴───┘
  │ length 5 │        │          │            used: 5 bytes     spare: 3 bytes
  ├──────────┤        │          │
  │ capacity 8        │          │
  └──────────┴────────┴──────────┘

   a &str:  ┌──────────┬──────────┐
            │ pointer  │ length 5 │       points into the same bytes, owns nothing
            └──────────┴──────────┘
```

### Trait objects and the vtable

A `Box<dyn Shape>` or `&dyn Shape` is a fat pointer with two addresses:

```text
   &dyn Shape                      the value (for example a Circle)
  ┌──────────────┐                ┌──────────────┐
  │ data pointer ─┼──────────────▶│ radius: 2.0  │
  ├──────────────┤                └──────────────┘
  │ vtable ptr   ─┼──────┐
  └──────────────┘      │         the vtable for "Circle as Shape" (one per type, shared)
                        │        ┌──────────────────────────────┐
                        └───────▶│ how to drop a Circle         │
                                 │ size and alignment of Circle │
                                 │ address of Circle::area      │
                                 │ address of Circle::name      │
                                 └──────────────────────────────┘
```

The **vtable** ("virtual method table") is a small table that the compiler creates once for every combination of type and trait. Calling `shape.area()` means: follow the vtable pointer, read the address of `area`, call it with the data pointer. That is **[[dynamic dispatch]]**. It costs one extra memory read per call, and it keeps the compiler from pasting the method's body into the caller, which is usually the bigger loss. Generic code has neither cost.

## Where data lives

A running program's memory has several regions:

| Region | Holds | Lifetime |
|---|---|---|
| **Code** | the machine instructions of the program | the whole run |
| **Static data** | `static` variables, string literals, and other constants built into the program | the whole run |
| **Stack** | local variables and function parameters. One stack per thread | until the function returns |
| **Heap** | everything owned by `Box`, `Vec`, `String`, `Rc`, `HashMap` … | until its owner is dropped |

```rust run
static GREETING: &str = "hello";      // the pointer and the text are in the static data

fn main() {
    let number = 42;                          // stack
    let array = [0_u8; 16];                   // stack: all 16 bytes
    let boxed = Box::new(7);                  // pointer on the stack, the 7 on the heap
    let list = vec![1, 2, 3];                 // 24 bytes on the stack, the elements on the heap
    let literal: &str = "stored in the program";   // pointer + length on the stack, text in static data

    println!("{number} {} {boxed} {} {literal} {GREETING}", array.len(), list.len());
}
```
```output
42 16 7 3 stored in the program hello
```

The stack of the main thread is usually 8 MB, and that of other threads 2 MB by default. A very large local array, or recursion that goes too deep, exhausts it. The program then stops with a "stack overflow" message. Large data belongs on the heap: use `vec![0; n]` and not `[0; n]` for big buffers.

## What costs time

Knowing the layout lets you estimate the cost of a design. Four things matter far more than everything else.

**1. Heap allocation.** Asking the allocator for memory, and giving it back, costs roughly as much as a hundred simple arithmetic operations. Allocating in a tight loop is a common cause of slow code. Reuse buffers, and reserve capacity in advance with `Vec::with_capacity(n)` when you know the size.

**2. Indirection.** Every pointer that must be followed is a memory read at a possibly distant address. A `Vec<Box<T>>` or a linked list makes the processor jump around. A `Vec<T>` keeps the values side by side.

**3. Cache misses.** Reading main memory is slow: about a hundred times slower than a calculation. Processors therefore keep recently used memory in small, fast **caches**, and fetch memory in blocks of 64 bytes, called **cache lines**. Data that is close together and visited in order is nearly free after the first access. Data scattered over the heap costs a slow fetch every time.

**4. Copying.** Moving a value copies its bytes: 24 for a `String`, whatever its length. Moving a struct of several kilobytes copies all of them. Large values are better kept behind a `Box`, or passed by reference.

### An experiment: array of structs or struct of arrays

A simulation has four million particles, each with eight numbers. A calculation needs only one of them: the mass. Two ways to store the data:

```rust
// Array of structs: all the numbers of one particle together
struct Particle { x: f64, y: f64, z: f64, vx: f64, vy: f64, vz: f64, mass: f64, charge: f64 }
let particles: Vec<Particle>;

// Struct of arrays: all the masses together
struct Particles { x: Vec<f64>, mass: Vec<f64>, /* ... */ }
```

Summing the masses reads the same four million numbers in both cases. On the machine used to test this guide, the first layout took 14 milliseconds and the second 3.5: four times faster. In the array of structs, each particle fills a whole cache line of 64 bytes, of which the loop uses 8. The cache is filled with data nobody wants. In the struct of arrays, eight masses sit in each cache line, and every byte fetched is used.

Neither layout is better in general. If the program usually needs all the fields of one particle together, the first layout wins. The lesson is to put data that is used together close together.

:::tip Rules of thumb for fast data
- Use `Vec<T>` as your default collection. It is the friendliest to the cache.
- Avoid `Vec<Vec<T>>` for grids. Use one flat `Vec<T>` and compute the index as `row * width + column`.
- Avoid linked lists. They need one allocation and one cache miss per element.
- Keep often-used structs small. Put large, rarely used parts behind a `Box`.
- Check the size of your important types with `size_of`. An enum with one huge variant makes every value huge: box the big variant.
:::

## Moving values out of place

Some standard functions make sense once you think in terms of memory. You cannot move a value out of a `&mut` reference, because that would leave a hole. But you can **swap** something else in:

```rust run
use std::mem;

#[derive(Debug, Default)]
struct Inbox {
    messages: Vec<String>,
}

impl Inbox {
    /// Hands out all messages and leaves the inbox empty.
    fn take_all(&mut self) -> Vec<String> {
        mem::take(&mut self.messages)
    }
}

fn main() {
    let mut a = String::from("first");
    let mut b = String::from("second");
    mem::swap(&mut a, &mut b);
    println!("{a} {b}");

    let old = mem::replace(&mut a, String::from("third"));
    println!("{old} {a}");

    let mut inbox = Inbox { messages: vec![String::from("hi"), String::from("bye")] };
    let messages = inbox.take_all();
    println!("{:?} {:?}", messages, inbox);
}
```
```output
second first
second third
["hi", "bye"] Inbox { messages: [] }
```

| Function | What it does |
|---|---|
| `mem::swap(&mut a, &mut b)` | exchanges two values |
| `mem::replace(&mut a, new)` | puts `new` into `a` and returns the old value |
| `mem::take(&mut a)` | puts the default value into `a` and returns the old value |

All three only shuffle a few bytes on the stack. No heap data is copied. `Option` has a method of the same kind: `option.take()` leaves `None` behind and returns what was there.

## Byte order

A number of several bytes can be stored with its lowest byte first (**little-endian**) or its highest byte first (**big-endian**). Nearly all current processors are little-endian. Many network protocols and file formats use big-endian. When you read or write binary data, always say which order you mean:

```rust run
fn main() {
    let number: u32 = 258;                         // 0x00000102

    println!("{:?}", number.to_le_bytes());        // little-endian
    println!("{:?}", number.to_be_bytes());        // big-endian

    println!("{}", u32::from_le_bytes([2, 1, 0, 0]));
    println!("{}", u32::from_be_bytes([0, 0, 1, 2]));
    println!("{}", u16::from_be_bytes([0x1F, 0x90]));   // a network port from two bytes
}
```
```output
[2, 1, 0, 0]
[0, 0, 1, 2]
258
258
8080
```

Do not copy a struct's memory straight into a file or onto the network. The padding bytes, the field order and the byte order all depend on the compiler and the machine. Convert each field explicitly, or use a serialisation crate ([chapter 78](#serde)).

## Leaks are safe

One last point about memory. Rust guarantees that memory is not used after it is freed. It does **not** guarantee that all memory is freed. A program can leak memory in safe code:

```rust run
fn main() {
    // Deliberately keep a value alive for the rest of the program
    let config: &'static mut Vec<u32> = Box::leak(Box::new(vec![1, 2, 3]));
    config.push(4);
    println!("{:?}", config);

    let text = String::from("never dropped");
    std::mem::forget(text);          // the destructor is skipped: 13 bytes leak
}
```
```output
[1, 2, 3, 4]
```

`Box::leak` is sometimes useful: it turns a heap value into a `'static` reference for data that should live until the program ends. `mem::forget` discards a value without running its destructor. A cycle of `Rc` pointers leaks too, as you saw in [chapter 32](#smart-pointers). A leak wastes memory, but it cannot corrupt anything, which is why Rust counts it as safe.

:::compare Layout in other languages
- **C and C++** give you the same control and the same costs. C never reorders fields, so C programmers sort them by hand.
- **Java, C#, Python and JavaScript** store almost every object on the heap behind a pointer, with a header of 8 to 16 bytes in front of the data. A Python list of a million integers is a million separate objects. A Rust `Vec<i32>` of a million integers is 4 MB in one block. This difference in layout, more than raw instruction speed, is why Rust and C are so much faster on large data.
:::

:::recap
- Every type has a size and an alignment. `size_of` and `align_of` report them.
- Structs contain padding to align their fields. Rust reorders fields to reduce it. `#[repr(C)]` keeps the written order.
- An enum stores a tag plus its largest variant. Niches make `Option<&T>`, `Option<Box<T>>` and `Option<String>` free.
- References to `str`, slices and trait objects are fat pointers: an address plus a length or a vtable.
- Stack: local values, fast, limited. Heap: owned data of flexible size. Static data: literals and `static`s.
- Allocation, indirection, cache misses and large copies dominate the cost. Keep related data together in `Vec`s.
- `mem::swap`, `mem::replace` and `mem::take` move values out of `&mut` places.
- Always state the byte order when handling binary data.
:::

:::quiz Check your understanding
? A `#[repr(C)]` struct has the fields `a: u8, b: u64, c: u8`, in that order. What is its size?
- 10
- 16
+ 24
- 17
= `a` takes 1 byte, then 7 bytes of padding so that `b` starts at offset 8. `b` takes 8. `c` takes 1, and 7 more bytes round the size up to a multiple of 8. Ordered as `b, a, c`, it would need 16.

? Why is `size_of::<Option<Box<u32>>>()` the same as `size_of::<Box<u32>>()`?
- `Option` never needs extra space
+ A `Box` is never a null pointer, so the bit pattern zero is free to stand for `None`
- The compiler removes the `Option`
- A `Box` already contains a tag
= This is the niche optimisation. For a type with no spare bit pattern, such as `u32`, the `Option` does need more space.

? What does a `&[u64]` consist of?
- Only an address
+ An address and the number of elements
- An address, a length and a capacity
- The elements themselves
= A slice reference is a fat pointer. Capacity belongs to the owning `Vec`, not to a borrowed view.

? Which of these is usually the most expensive single operation?
- Adding two `u64`
- Copying a `String`'s 24 bytes when it is moved
+ A heap allocation
- Reading a local variable
= Allocating involves the memory allocator's bookkeeping. Moves and arithmetic are a few machine instructions.

? Why can iterating over a `Vec<T>` be much faster than over a linked list with the same elements?
- A `Vec` uses less memory per element
- Linked lists are checked for errors
+ The elements of a `Vec` are next to each other, so the processor's cache is used well. List nodes can be scattered over the heap
- Iterators are not available for lists
= Memory arrives in blocks of 64 bytes. Neighbouring elements share a block and come almost for free. Scattered nodes each cost a slow fetch.
:::

:::exercise guided Shrink a struct
This `#[repr(C)]` struct describes a sensor reading. Print its size. Then reorder the fields to make it as small as possible, and print the size again. Finally remove `#[repr(C)]` from the original and check what Rust does by itself.

```rust
#[repr(C)]
struct Reading {
    valid: bool,
    timestamp: u64,
    channel: u8,
    value: f32,
    flags: u16,
}
```
::hint
Sort the fields from the largest alignment to the smallest: `u64` (8), `f32` (4), `u16` (2), then `u8` and `bool` (1).
::solution
```rust run
# #![allow(dead_code)]
use std::mem::size_of;

#[repr(C)]
struct Reading {
    valid: bool,
    timestamp: u64,
    channel: u8,
    value: f32,
    flags: u16,
}

#[repr(C)]
struct ReadingSorted {
    timestamp: u64,
    value: f32,
    flags: u16,
    channel: u8,
    valid: bool,
}

struct ReadingRust {
    valid: bool,
    timestamp: u64,
    channel: u8,
    value: f32,
    flags: u16,
}

fn main() {
    println!("{} {} {}", size_of::<Reading>(), size_of::<ReadingSorted>(), size_of::<ReadingRust>());
}
```
```output
32 16 16
```

The data is 16 bytes (8 + 4 + 2 + 1 + 1). The original order wastes 16 more on padding: 7 after `valid`, 3 after `channel`, 6 at the end. Sorted from large to small, nothing is wasted. Without `repr(C)`, Rust finds the compact order on its own. With a million readings in a vector, the difference is 16 megabytes, and twice as many readings fit into each cache line.
:::

:::exercise practice Read a binary header
A made-up image format starts with a 12-byte header: 4 bytes with the letters `PIX1`, then the width as a `u32`, then the height as a `u32`, both big-endian. Write `parse_header(bytes: &[u8]) -> Result<(u32, u32), String>` that returns width and height, with clear errors for input that is too short or has the wrong letters.
::hint
Check `bytes.len() < 12` first. Compare `&bytes[0..4]` with `b"PIX1"`, a byte string literal. To get a `[u8; 4]` from a slice for `u32::from_be_bytes`, use `bytes[4..8].try_into().unwrap()`. The length is right, so the conversion cannot fail.
::solution
```rust run
fn parse_header(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() < 12 {
        return Err(format!("the header needs 12 bytes, found {}", bytes.len()));
    }
    if &bytes[0..4] != b"PIX1" {
        return Err(String::from("not a PIX1 file"));
    }
    let width = u32::from_be_bytes(bytes[4..8].try_into().expect("the slice has 4 bytes"));
    let height = u32::from_be_bytes(bytes[8..12].try_into().expect("the slice has 4 bytes"));
    Ok((width, height))
}

fn main() {
    let good = [b'P', b'I', b'X', b'1', 0, 0, 3, 32, 0, 0, 2, 88, 255, 255];
    println!("{:?}", parse_header(&good));
    println!("{:?}", parse_header(&good[..7]));
    println!("{:?}", parse_header(b"JPEG00000000"));
}
```
```output
Ok((800, 600))
Err("the header needs 12 bytes, found 7")
Err("not a PIX1 file")
```

The bytes `0, 0, 3, 32` in big-endian order are 3 × 256 + 32 = 800. The function reads each field explicitly, with a stated byte order, and checks the length before touching the data. It never reinterprets the raw bytes as a struct, so it works the same on every machine. The letters at the start of a file that identify its format are called a **magic number**.
:::

:::exercise challenge A flat grid
Write `struct Grid { width: usize, height: usize, cells: Vec<u8> }` that stores a two-dimensional grid in **one** flat vector. Add `new(width, height)`, `get(x, y) -> Option<u8>`, `set(x, y, value) -> bool`, and `row(y) -> Option<&[u8]>`, which returns a whole row as a slice without copying. Explain why this is better than a `Vec<Vec<u8>>`.
::hint
The cell `(x, y)` is at index `y * width + x`. Check `x < width` and `y < height` before computing it. A row is the slice `&cells[y * width .. (y + 1) * width]`.
::solution
```rust run
struct Grid {
    width: usize,
    height: usize,
    cells: Vec<u8>,
}

impl Grid {
    fn new(width: usize, height: usize) -> Grid {
        Grid { width, height, cells: vec![0; width * height] }
    }

    fn index(&self, x: usize, y: usize) -> Option<usize> {
        if x < self.width && y < self.height {
            Some(y * self.width + x)
        } else {
            None
        }
    }

    fn get(&self, x: usize, y: usize) -> Option<u8> {
        self.index(x, y).map(|i| self.cells[i])
    }

    fn set(&mut self, x: usize, y: usize, value: u8) -> bool {
        match self.index(x, y) {
            Some(i) => {
                self.cells[i] = value;
                true
            }
            None => false,
        }
    }

    fn row(&self, y: usize) -> Option<&[u8]> {
        if y < self.height {
            Some(&self.cells[y * self.width..(y + 1) * self.width])
        } else {
            None
        }
    }
}

fn main() {
    let mut grid = Grid::new(4, 3);
    grid.set(1, 2, 7);
    grid.set(3, 2, 9);
    println!("{:?} {:?} {}", grid.get(1, 2), grid.get(4, 0), grid.set(0, 3, 1));
    println!("{:?} {:?}", grid.row(2), grid.row(3));
    println!("{}", grid.cells.len());
}
```
```output
Some(7) None false
Some([0, 7, 0, 9]) None
12
```

A `Vec<Vec<u8>>` for this grid would be four allocations: one for the outer vector, and one per row. Every access follows two pointers, and the rows may lie anywhere on the heap. Each row also carries 24 bytes of bookkeeping, and nothing guarantees that all rows have the same length.

The flat grid is one allocation and one block of memory. An access is one multiplication, one addition and one read. Walking over the whole grid reads memory in order, which the cache handles best. A row is still available as a slice, because a row is simply a continuous part of the vector.
:::
