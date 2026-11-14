@id ffi
@part p8
@title Working with other languages (FFI)
@short Other languages (FFI)
@level advanced
@time 50
@learn Explain what an ABI is and why C is the common language between languages | Call C functions from Rust and wrap them safely | Compile C code into a Rust project | Offer Rust functions to C and to Python | Handle strings, structs and ownership across a language boundary

No language lives alone. Decades of proven software are written in C and C++: operating systems, databases, image and audio libraries, cryptography. Other teams work in Python or JavaScript and want one slow part to be fast. Rust was designed to fit into this world. It can call code in other languages and be called by them, with no translation layer in between and no cost at run time. The mechanism is called the **foreign function interface**, or **FFI**.

:::analogy An interpreter between two languages
Two people who speak different languages can still make a deal, as long as they share one common language and the same customs: greet, shake hands, say goodbye. The C ABI is that shared language, and the customs are the calling convention — who puts each argument where, who tidies up afterwards, and what a returned value looks like.
:::

## The common language: the C ABI

For one piece of compiled code to call another, both must agree on details far below the level of source code: in which processor registers the arguments are passed, how a struct is laid out in memory, who cleans up afterwards. Such an agreement is an **ABI** (application binary interface).

Rust's own ABI is not fixed. The compiler is free to change it between versions, which lets it optimise. The ABI of **C**, on the other hand, is stable and defined for every platform, and practically every language can speak it. So C is the meeting point: when Rust talks to Python, Swift or Java, both sides pretend to be C.

Three tools make Rust speak the C ABI:

- `extern "C"` on a function or block: "use the C calling convention".
- `#[repr(C)]` on a struct or enum: "lay this out in memory as a C compiler would".
- The types in `std::ffi`: `c_int`, `c_char`, `c_void` and so on, which have exactly the size that C's `int`, `char` and `void` have on the current platform.

## Calling C from Rust

The C standard library is linked into every Rust program anyway, so its functions make a ready example. To call a foreign function, you declare its signature in an `extern` block:

```rust run
use std::ffi::{c_char, c_int, c_void, CStr, CString};

unsafe extern "C" {
    // `safe` marks functions that cannot be misused, so they need no `unsafe` block
    safe fn abs(number: c_int) -> c_int;

    fn strlen(text: *const c_char) -> usize;

    fn qsort(
        base: *mut c_void,
        count: usize,
        size: usize,
        compare: extern "C" fn(*const c_void, *const c_void) -> c_int,
    );
}

/// A Rust function that C can call: the comparison for `qsort`.
extern "C" fn compare_i32(a: *const c_void, b: *const c_void) -> c_int {
    // SAFETY: qsort passes pointers to two elements of the array, which holds i32 values.
    let (a, b) = unsafe { (*(a as *const i32), *(b as *const i32)) };
    a.cmp(&b) as c_int
}

fn main() {
    println!("{}", abs(-42));

    let text = CString::new("hello from Rust").expect("no zero byte inside");
    // SAFETY: `text` is a valid, zero-terminated C string that lives until the end of main.
    let length = unsafe { strlen(text.as_ptr()) };
    println!("{length}");

    let mut numbers = [30, 10, 50, 20, 40];
    // SAFETY: the pointer, the element count and the element size describe `numbers` exactly.
    unsafe {
        qsort(
            numbers.as_mut_ptr() as *mut c_void,
            numbers.len(),
            size_of::<i32>(),
            compare_i32,
        );
    }
    println!("{:?}", numbers);

    let c_text: &CStr = c"a C string literal";
    println!("{:?} {}", c_text, c_text.to_str().unwrap().len());
}
```
```output
42
15
[10, 20, 30, 40, 50]
"a C string literal" 18
```

There is a lot to see here.

**The `extern` block is `unsafe`.** The compiler cannot look into C code. It believes the signatures you write. If a declaration is wrong, for example a `c_int` where C has a `long`, the result is undefined behaviour. Writing `unsafe extern` acknowledges that you vouch for the declarations.

**Each function is safe or unsafe to call.** `abs` takes a number and returns a number. Nothing can go wrong, so it is declared `safe` and called like any Rust function. `strlen` takes a pointer and trusts it blindly, so calling it needs an `unsafe` block.

**C strings are different from Rust strings.** A Rust `&str` is a pointer and a length, and holds valid UTF-8. A C string is only a pointer, and the text ends at the first zero byte. Two types bridge the gap:

| Type | It is | Use it to |
|---|---|---|
| `CString` | an owned, zero-terminated string | pass text from Rust to C |
| `&CStr` | a borrowed, zero-terminated string | look at text that came from C |
| `c"..."` | a C string literal | write constant C strings |

`CString::new` fails if the text contains a zero byte in the middle, because C would see the string end there.

**C can call back into Rust.** `qsort` is C's sorting function. It knows nothing about the elements, so it asks the caller for a comparison function. `compare_i32` is a Rust function with `extern "C"`, which makes it callable from C. The type `*mut c_void` is C's "pointer to anything".

:::warn The lifetime of a `CString`
`text.as_ptr()` gives a pointer into the `CString`. The pointer is valid only while `text` is alive. This line is a classic bug: `let pointer = CString::new("hi").unwrap().as_ptr();`. The `CString` is a temporary value that is destroyed at the end of the statement, and `pointer` dangles. Keep the `CString` in a variable for as long as C uses the pointer.
:::

### Wrap it once, use it safely

Unsafe calls should not be scattered through a program. The usual structure has two layers:

1. The raw declarations, exactly as C defines them. By convention they live in a module or crate with the suffix `-sys` (for example `openssl-sys`).
2. A safe Rust API on top, which checks arguments, converts types, turns error codes into `Result`s, and frees resources in `Drop`.

```rust run
use std::ffi::{c_char, CString};

unsafe extern "C" {
    fn strlen(text: *const c_char) -> usize;
}

/// The length of a text as C sees it, or `None` if the text contains a zero byte.
fn c_length(text: &str) -> Option<usize> {
    let c_text = CString::new(text).ok()?;
    // SAFETY: `c_text` is a valid, zero-terminated string that lives until the end of this function.
    Some(unsafe { strlen(c_text.as_ptr()) })
}

fn main() {
    println!("{:?}", c_length("hello"));
    println!("{:?}", c_length("zero\0inside"));
}
```
```output
Some(5)
None
```

Users of `c_length` cannot cause undefined behaviour, whatever they pass. That is the job of a wrapper. Most well-known C libraries already have such crates. Look on crates.io before you write your own.

## Compiling C code into your project

When the C code is not a system library but a few files of your own, Cargo can compile it together with your Rust code. This needs a **build script**: a Rust program called `build.rs`, in the package's root folder, that Cargo runs before it compiles the package.

```text
withc/
├── Cargo.toml
├── build.rs
├── c/
│   └── stats.c
└── src/
    └── main.rs
```

```c
/* c/stats.c */
#include <stddef.h>

/* Returns the average of `count` numbers, or 0 for an empty list. */
double average(const double *values, size_t count) {
    if (count == 0) {
        return 0.0;
    }
    double sum = 0.0;
    for (size_t i = 0; i < count; i++) {
        sum += values[i];
    }
    return sum / (double)count;
}
```

The crate **`cc`** finds the C compiler of your system and runs it. It is needed only while building, so it is added as a *build dependency*: `cargo add --build cc`.

```toml
[build-dependencies]
cc = "1.11.2"
```

```rust file=build.rs
fn main() {
    cc::Build::new().file("c/stats.c").compile("stats");
    println!("cargo::rerun-if-changed=c/stats.c");
}
```

```rust file=src/main.rs
unsafe extern "C" {
    fn average(values: *const f64, count: usize) -> f64;
}

/// A safe wrapper: a slice always has a valid pointer and the right length.
fn mean(values: &[f64]) -> f64 {
    // SAFETY: the pointer and the length come from the same slice.
    unsafe { average(values.as_ptr(), values.len()) }
}

fn main() {
    println!("{}", mean(&[2.0, 4.0, 9.0]));
    println!("{}", mean(&[]));
}
```
```output
5
0
```

`cargo run` compiles the C file, links it in, and runs the program. You need a C compiler installed (GCC or Clang on Linux and macOS, the Visual Studio build tools on Windows). A Rust slice turns into the pair that C expects, a pointer and a count, with `as_ptr()` and `len()`.

:::tip Let a tool write the declarations
Typing `extern` declarations by hand is tedious for a big library, and a typing error is undefined behaviour. The tool **`bindgen`** reads C header files and generates the Rust declarations. It is usually run from `build.rs`.
:::

## Calling Rust from C

The other direction is just as direct. A Rust library can offer functions that look exactly like C functions to the rest of the world.

```toml
# Cargo.toml
[lib]
crate-type = ["staticlib"]
```

`staticlib` produces a library file (`libshapes.a`) that can be linked into a C program. `cdylib` produces a dynamic library (`.so`, `.dll` or `.dylib`) that is loaded at run time.

```rust file=src/lib.rs
use std::ffi::{c_char, CStr, CString};

/// A struct with the same memory layout as its C counterpart.
#[repr(C)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// The distance between two points.
#[unsafe(no_mangle)]
pub extern "C" fn point_distance(a: Point, b: Point) -> f64 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}

/// Returns a greeting as a new C string. The caller must free it with `greeting_free`.
///
/// # Safety
///
/// `name` must be null or point to a valid, zero-terminated string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn greeting_new(name: *const c_char) -> *mut c_char {
    if name.is_null() {
        return std::ptr::null_mut();
    }
    // SAFETY: the caller guarantees a valid C string.
    let name = unsafe { CStr::from_ptr(name) }.to_string_lossy();
    match CString::new(format!("Hello, {name}!")) {
        Ok(text) => text.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Frees a string that was returned by `greeting_new`.
///
/// # Safety
///
/// `text` must be null or a pointer from `greeting_new` that was not freed before.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn greeting_free(text: *mut c_char) {
    if !text.is_null() {
        // SAFETY: the pointer came from `CString::into_raw` in `greeting_new`.
        drop(unsafe { CString::from_raw(text) });
    }
}
```

- **`#[unsafe(no_mangle)]`** keeps the function's name as written. Normally the Rust compiler changes ("mangles") names so that functions in different modules cannot clash. C looks for the plain name. The attribute is marked `unsafe` because two functions with the same exported name would collide.
- **`pub extern "C" fn`** uses the C calling convention.
- **`#[repr(C)]`** gives `Point` the layout a C compiler would choose, so that both sides agree on where `x` and `y` are.

The C side needs a **header file** that declares the functions. You can write it by hand, or let the tool **`cbindgen`** generate it from the Rust code.

```c
/* shapes.h */
typedef struct Point {
    double x;
    double y;
} Point;

double point_distance(Point a, Point b);
char *greeting_new(const char *name);
void greeting_free(char *text);
```

```c
/* main.c */
#include <stdio.h>
#include "shapes.h"

int main(void) {
    Point a = {0.0, 0.0};
    Point b = {3.0, 4.0};
    printf("%.1f\n", point_distance(a, b));

    char *text = greeting_new("C");
    printf("%s\n", text);
    greeting_free(text);
    return 0;
}
```

```text
$ cargo build --release
$ gcc main.c target/release/libshapes.a -o demo
$ ./demo
5.0
Hello, C!
```

If the linker reports missing symbols on your system, the Rust library needs some system libraries to be named as well. `cargo rustc --release -- --print native-static-libs` prints the list to add to the `gcc` command.

### Who frees the memory?

The greeting shows the most important rule of FFI.

:::key Memory must be freed by the side that allocated it
Rust and C may use different memory allocators. Memory handed out by one must never be freed by the other. So a library that returns allocated data always provides a matching function to free it.

- `greeting_new` creates a `CString` and gives it away with `into_raw()`. From then on, Rust no longer manages that memory. The C code owns it.
- `greeting_free` takes the pointer back with `CString::from_raw` and drops the string, which frees the memory with Rust's allocator.

If the C program called its own `free(text)`, the behaviour would be undefined.
:::

The same technique passes whole Rust objects to C as **opaque pointers**: `Box::into_raw(Box::new(value))` gives C a pointer that it cannot look into but can hand back, and `Box::from_raw` takes ownership again. C code sees a "handle", and all work on it goes through your functions.

### Panics must not escape

A Rust panic must not travel up into C code, which has no idea what a panic is. In a function with `extern "C"`, a panic that reaches the boundary aborts the whole process. Code that might panic should catch it at the border with `std::panic::catch_unwind` and return an error code in its place.

## Rust and Python

Python is easy to write and slow at heavy computation. The classic remedy was to write the slow part in C. Rust is now a popular choice for that job, and the crate **PyO3** hides nearly all the FFI details.

```toml
# Cargo.toml
[lib]
crate-type = ["cdylib"]

[dependencies]
pyo3 = "0.30.1"
```

```rust file=src/lib.rs
use pyo3::prelude::*;

/// Counts the prime numbers below `limit`.
#[pyfunction]
fn count_primes(limit: u64) -> u64 {
    (2..limit).filter(|n| (2..).take_while(|d| d * d <= *n).all(|d| n % d != 0)).count() as u64
}

/// Returns the words of a text, in lower case and without duplicates.
#[pyfunction]
fn unique_words(text: &str) -> Vec<String> {
    let mut words: Vec<String> = text.split_whitespace().map(|w| w.to_lowercase()).collect();
    words.sort();
    words.dedup();
    words
}

/// The Python module. Its name must match the name of the library.
#[pymodule]
fn fastmath(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_function(wrap_pyfunction!(count_primes, module)?)?;
    module.add_function(wrap_pyfunction!(unique_words, module)?)?;
    Ok(())
}
```

The functions are ordinary, safe Rust. The attribute macros `#[pyfunction]` and `#[pymodule]` generate the code that converts between Python objects and Rust types: a Python `int` becomes a `u64`, a `str` becomes a `&str`, and a `Vec<String>` becomes a Python list. From Python, the result looks like any other module:

```text
>>> import fastmath
>>> fastmath.count_primes(100)
25
>>> fastmath.unique_words("The quick the lazy THE dog")
['dog', 'lazy', 'quick', 'the']
>>> fastmath.count_primes("ten")
TypeError: 'str' object cannot be interpreted as an integer
```

A wrong argument type becomes a normal Python exception. On the machine used to test this guide, counting the primes below 300,000 took 0.57 seconds with the same algorithm written in plain Python, and 0.021 seconds through this Rust function: about 27 times faster.

In practice you build and publish such modules with the tool **`maturin`**: `maturin develop` compiles the crate and installs it into your Python environment. Well-known Python packages built this way include the data-frame library Polars, the validation library Pydantic (its core), and the linter Ruff.

## Other languages

| Language | Tool | Notes |
|---|---|---|
| C | `bindgen` (C → Rust), `cbindgen` (Rust → C), `cc` | the foundation for everything else |
| C++ | `cxx` | safe bindings in both directions, with support for C++ strings, vectors and smart pointers |
| Python | `pyo3` with `maturin` | write Python modules in Rust, or run Python inside Rust |
| JavaScript (Node.js) | `napi-rs`, `neon` | native Node.js modules |
| JavaScript (browser) | `wasm-bindgen` | through WebAssembly ([chapter 49](#apps)) |
| Java, Kotlin | `jni`, `uniffi` | `uniffi` generates bindings for Kotlin, Swift and Python from one description |
| Swift | `uniffi`, `swift-bridge` | used for shared code in mobile apps |
| Ruby | `magnus` | native Ruby extensions |

## Rules for the border

FFI is where Rust's guarantees end and yours begin. A short checklist:

1. **Use only FFI-safe types** in signatures: the `c_*` types, fixed-size integers and floats, raw pointers, and `#[repr(C)]` structs. Not `String`, `Vec`, `&str`, slices, or tuples. Their layout is Rust's private business.
2. **Check every pointer that comes in** for null before using it.
3. **Decide and document who owns each piece of memory**, and provide a free function for everything you allocate.
4. **Never let a panic cross the border.**
5. **Mind threads.** A foreign library may not be thread-safe. Do not implement `Send` or `Sync` for a handle unless its documentation says it is safe.
6. **Keep the unsafe layer thin**, and put a safe, idiomatic API on top.
7. **Prefer generated bindings** to hand-written ones.

:::compare How other languages do FFI
- **Python** (`ctypes`, `cffi`), **Java** (JNI, and the newer Foreign Function API), **C#** (P/Invoke) and **Go** (cgo) can all call C. In languages with a garbage collector and a runtime, each call across the border has a cost, and data often has to be converted or pinned so that the collector does not move it.
- **Rust** has no runtime and no collector, so a call to C costs the same as a C function calling another C function. That makes Rust practical for a job few languages can do: replacing parts of an existing C or C++ program one piece at a time. This is how Rust entered Firefox, Android, the Linux kernel and Windows.
:::

:::recap
- FFI lets Rust call, and be called by, other languages. The shared ground is the C ABI.
- `unsafe extern "C" { ... }` declares foreign functions. The declarations are your responsibility.
- `CString` and `CStr` convert between Rust strings and zero-terminated C strings.
- A build script with the `cc` crate compiles C files into a Rust project. `bindgen` and `cbindgen` generate declarations.
- `#[unsafe(no_mangle)] pub extern "C" fn` and `#[repr(C)]` offer Rust code to C.
- Memory is freed by the side that allocated it. Panics stay on the Rust side.
- High-level tools such as PyO3, `cxx`, `napi-rs` and `uniffi` hide the details for specific languages.
:::

:::quiz Check your understanding
? Why do languages usually talk to each other through the C ABI?
- C is the fastest language
+ The C ABI is stable, defined on every platform, and understood by nearly every language
- Rust is compiled to C first
- C has no types
= Rust's own ABI may change between compiler versions. C's is the common denominator that all sides can rely on.

? Why is an `extern "C"` block marked `unsafe`?
- Because C code is always wrong
- Because it makes the program slower
+ The compiler cannot check that the declared signatures match the real C functions
- Because it allocates memory
= The declarations are taken on trust. A mismatch between declaration and reality is undefined behaviour.

? You want to pass the Rust string `"hello"` to a C function that expects `const char *`. What do you use?
- `"hello".as_ptr()` directly
+ A `CString`, and its `.as_ptr()`, kept alive during the call
- A `Vec<char>`
- A `Box<str>`
= C expects a zero byte at the end of the text. A Rust `&str` has none. `CString` adds it and owns the memory.

? A Rust function returns a string to C with `CString::into_raw`. How must the C code release it?
- With C's `free()`
- It does not need to be released
+ By calling a Rust function that takes the pointer back with `CString::from_raw` and drops it
- With `delete`
= The memory came from Rust's allocator and must go back to it. Freeing it with a different allocator is undefined behaviour.

? What does `#[repr(C)]` on a struct do?
- It makes the struct faster
- It allows the struct to be used in `unsafe` code
+ It fixes the memory layout of the fields to what a C compiler would produce
- It converts the fields to C types
= Without it, Rust may reorder the fields. With it, both languages agree on the position and size of every field.
:::

:::exercise guided Call a C function
The C standard library has `int atoi(const char *text)`, which turns the digits at the start of a text into a number. Declare it, and write a safe wrapper `parse_leading(text: &str) -> Option<i32>` that returns `None` if the text contains a zero byte. Try it with `"42"`, `"17 apples"` and `"none"`.
::hint
Declare `fn atoi(text: *const c_char) -> c_int;` inside `unsafe extern "C" { }`. In the wrapper, build a `CString` with `CString::new(text).ok()?` and call `atoi` in an `unsafe` block.
::solution
```rust run
use std::ffi::{c_char, c_int, CString};

unsafe extern "C" {
    fn atoi(text: *const c_char) -> c_int;
}

fn parse_leading(text: &str) -> Option<i32> {
    let c_text = CString::new(text).ok()?;
    // SAFETY: `c_text` is a valid, zero-terminated string that outlives the call.
    Some(unsafe { atoi(c_text.as_ptr()) })
}

fn main() {
    println!("{:?}", parse_leading("42"));
    println!("{:?}", parse_leading("17 apples"));
    println!("{:?}", parse_leading("none"));
}
```
```output
Some(42)
Some(17)
Some(0)
```

The call works, and the result shows why Rust's own `parse` is better: `atoi` returns 0 for "none", which cannot be told apart from a real zero. C had no way to report "this was not a number" except through such conventions. `"none".parse::<i32>()` returns an `Err`.
:::

:::exercise practice A counter for C
Design the Rust side of a small library that C programs can use: a counter object. Write four functions with the C ABI: `counter_new() -> *mut Counter`, `counter_add(counter: *mut Counter, amount: u32)`, `counter_value(counter: *const Counter) -> u64`, and `counter_free(counter: *mut Counter)`. Then call them from a Rust `main`, the way C would.
::hint
`Box::into_raw(Box::new(Counter { total: 0 }))` creates the object and gives up ownership. `counter_free` takes it back with `Box::from_raw` and drops it. In `counter_add` and `counter_value`, check for null, then turn the pointer into a reference with `&mut *counter` or `&*counter`.
::solution
```rust run
pub struct Counter {
    total: u64,
}

#[unsafe(no_mangle)]
pub extern "C" fn counter_new() -> *mut Counter {
    Box::into_raw(Box::new(Counter { total: 0 }))
}

/// # Safety
/// `counter` must be null or a pointer from `counter_new` that has not been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn counter_add(counter: *mut Counter, amount: u32) {
    // SAFETY: the caller guarantees a valid pointer, or null.
    if let Some(counter) = unsafe { counter.as_mut() } {
        counter.total += u64::from(amount);
    }
}

/// # Safety
/// `counter` must be null or a pointer from `counter_new` that has not been freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn counter_value(counter: *const Counter) -> u64 {
    // SAFETY: the caller guarantees a valid pointer, or null.
    match unsafe { counter.as_ref() } {
        Some(counter) => counter.total,
        None => 0,
    }
}

/// # Safety
/// `counter` must be null or a pointer from `counter_new`, and must not be used afterwards.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn counter_free(counter: *mut Counter) {
    if !counter.is_null() {
        // SAFETY: the pointer came from `Box::into_raw` in `counter_new`.
        drop(unsafe { Box::from_raw(counter) });
    }
}

fn main() {
    let counter = counter_new();
    // SAFETY: `counter` comes from `counter_new` and is freed exactly once, at the end.
    unsafe {
        counter_add(counter, 5);
        counter_add(counter, 37);
        println!("{}", counter_value(counter));
        println!("{}", counter_value(std::ptr::null()));
        counter_free(counter);
    }
}
```
```output
42
0
```

This is the **opaque pointer** pattern. C code receives a `Counter *` that it cannot look inside. In the C header, the type would be declared as `typedef struct Counter Counter;` with no fields. Every operation goes through a function, so the Rust side stays in full control of the data.

`pointer.as_mut()` and `pointer.as_ref()` turn a raw pointer into an `Option` of a reference: `None` for null. They make the null check hard to forget. The life of the object is `counter_new` → use → `counter_free`, and each step hands ownership across the border explicitly.
:::

:::exercise challenge A safe handle
The four functions of the last exercise are what a C library typically looks like *from the outside*. Now be the user: write a safe Rust wrapper `SafeCounter` around the raw functions. It should create the counter in `new()`, offer `add(&mut self, amount: u32)` and `value(&self) -> u64`, and free the counter automatically. Users of `SafeCounter` should need no `unsafe`.
::hint
The struct holds one field, the raw pointer. Implement `Drop` to call `counter_free`. `std::ptr::NonNull<Counter>` is a raw pointer that is guaranteed not to be null, which documents the invariant. Do not derive `Clone`: two wrappers with the same pointer would free it twice.
::solution
```rust run
# pub struct Counter { total: u64 }
# pub extern "C" fn counter_new() -> *mut Counter { Box::into_raw(Box::new(Counter { total: 0 })) }
# pub unsafe extern "C" fn counter_add(counter: *mut Counter, amount: u32) { if let Some(c) = unsafe { counter.as_mut() } { c.total += u64::from(amount); } }
# pub unsafe extern "C" fn counter_value(counter: *const Counter) -> u64 { match unsafe { counter.as_ref() } { Some(c) => c.total, None => 0 } }
# pub unsafe extern "C" fn counter_free(counter: *mut Counter) { if !counter.is_null() { drop(unsafe { Box::from_raw(counter) }); } }
use std::ptr::NonNull;

/// A safe owner of a `Counter` from the C-style library.
///
/// Invariant: `pointer` came from `counter_new` and has not been freed.
struct SafeCounter {
    pointer: NonNull<Counter>,
}

impl SafeCounter {
    fn new() -> SafeCounter {
        let pointer = NonNull::new(counter_new()).expect("the library returned null");
        SafeCounter { pointer }
    }

    fn add(&mut self, amount: u32) {
        // SAFETY: the invariant guarantees a valid pointer, and `&mut self` gives exclusive access.
        unsafe { counter_add(self.pointer.as_ptr(), amount) }
    }

    fn value(&self) -> u64 {
        // SAFETY: the invariant guarantees a valid pointer.
        unsafe { counter_value(self.pointer.as_ptr()) }
    }
}

impl Drop for SafeCounter {
    fn drop(&mut self) {
        // SAFETY: the pointer is valid, and after `drop` nobody can use it again.
        unsafe { counter_free(self.pointer.as_ptr()) }
    }
}

fn main() {
    let mut counter = SafeCounter::new();
    counter.add(5);
    counter.add(37);
    println!("{}", counter.value());
}   // the counter is freed here, automatically
```
```output
42
```

All the rules that the C-style interface left to the caller are now enforced by the compiler:

- **Free exactly once:** `Drop` frees, and the type is not `Clone`.
- **No use after free:** after the wrapper is dropped, there is no value left to call methods on.
- **No null:** `NonNull` and the check in `new`.
- **No data race:** `add` takes `&mut self`. And because `NonNull` is neither `Send` nor `Sync`, the wrapper cannot be shared with other threads by accident.

This is what binding crates do: a `-sys` crate with raw declarations, and a safe crate on top that turns the library's documentation into types.
:::
