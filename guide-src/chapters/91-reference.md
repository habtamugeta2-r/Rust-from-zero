@id reference
@part app
@kind appendix
@title Reference tables
@short Reference tables
@level all

Tables to keep open while you write code: the words and signs of the language, the formatting codes, the traits you can derive, and a map of the standard library. Every example on this page was compiled and run.

## Keywords

A **keyword** is a word that belongs to the language. You cannot use it as a name.

| Keyword | Meaning | Chapter |
|---|---|---|
| `as` | convert between simple types (`x as f64`); rename in a `use` | [34](#type-system), [22](#modules) |
| `async`, `await` | write and wait for asynchronous code | [57](#async) |
| `break`, `continue` | leave a loop; go to its next round | [11](#control-flow) |
| `const` | a constant; also `const fn` and `const` generics | [8](#variables), [24](#generics) |
| `crate` | the root of the current crate, in paths | [22](#modules) |
| `dyn` | a trait object: `dyn Trait` | [25](#traits) |
| `else` | the other branch of `if` and of `let … else` | [11](#control-flow), [18](#enums) |
| `enum` | define an enum | [18](#enums) |
| `extern` | functions of another language | [37](#ffi) |
| `false`, `true` | the two values of `bool` | [9](#types) |
| `fn` | define a function | [10](#functions) |
| `for`, `in` | loop over an iterator | [11](#control-flow), [30](#iterators) |
| `if` | a decision; also a guard in `match` | [11](#control-flow), [19](#patterns) |
| `impl` | methods for a type, or a trait for a type; `impl Trait` | [17](#structs), [25](#traits) |
| `let` | a new variable | [8](#variables) |
| `loop`, `while` | repeat for ever; repeat while a condition holds | [11](#control-flow) |
| `match` | compare a value with patterns | [11](#control-flow), [18](#enums), [19](#patterns) |
| `mod` | define a module | [22](#modules) |
| `move` | a closure takes ownership of what it uses | [29](#closures), [55](#threads) |
| `mut` | allow change: `let mut`, `&mut` | [8](#variables), [15](#borrowing) |
| `pub` | make an item visible outside its module | [22](#modules) |
| `ref` | bind by reference in a pattern (older style) | [19](#patterns) |
| `return` | leave a function with a value | [10](#functions) |
| `self`, `Self` | the value a method is called on; its type | [17](#structs) |
| `static` | a value that lives for the whole run | [56](#shared-state) |
| `struct` | define a struct | [17](#structs) |
| `super` | the parent module, in paths | [22](#modules) |
| `trait` | define a trait | [25](#traits) |
| `type` | a type alias; an associated type | [34](#type-system), [33](#advanced-traits) |
| `unsafe` | code whose safety the compiler cannot check | [36](#unsafe) |
| `use` | bring a path into scope | [22](#modules) |
| `where` | bounds on type parameters, after the signature | [24](#generics) |

A few more words have a meaning only in special places, and can be used as names elsewhere: `union`, `macro_rules`, `raw`, `safe`, and `'static` among the lifetimes.

These words do nothing today, but are **reserved** for the future, so you cannot use them as names either: `abstract`, `become`, `box`, `do`, `final`, `gen`, `macro`, `override`, `priv`, `try`, `typeof`, `unsized`, `virtual`, `yield`.

### Using a keyword as a name anyway

Sometimes you need a name that is a keyword: a field called `type` in data from another program, or a function called `try` in an old crate. Put `r#` in front of it. This is called a **raw identifier**:

```rust run
struct Message {
    r#type: String,
    text: String,
}

fn r#match(text: &str, word: &str) -> bool {
    text.contains(word)
}

fn main() {
    let message = Message { r#type: String::from("greeting"), text: String::from("hello there") };
    println!("{}: {}", message.r#type, r#match(&message.text, "hello"));
}
```
```output
greeting: true
```

## Operators and other signs

| Sign | Meaning | Example |
|---|---|---|
| `+` `-` `*` `/` `%` | add, subtract, multiply, divide, remainder | `7 % 3` is `1` |
| `==` `!=` `<` `>` `<=` `>=` | compare; the result is a `bool` | `a != b` |
| `&&` `\|\|` `!` | and, or, not, for `bool` values. `&&` and `\|\|` skip the right side when the left side decides | `ready && !done` |
| `&` `\|` `^` `!` `<<` `>>` | work on the single bits of an integer (see below) | `flags & 0b0100` |
| `=` | assign | `x = 5` |
| `+=` `-=` `*=` `/=` `%=` `&=` `\|=` `^=` `<<=` `>>=` | calculate and assign | `total += 1` |
| `&x` `&mut x` | borrow | `&name` |
| `*x` | the value behind a reference or pointer | `*count += 1` |
| `?` | pass an error (or `None`) on to the caller | `file.read_to_string(&mut s)?` |
| `.` | a field or a method | `user.name`, `text.len()` |
| `::` | a path into a module or type | `String::from`, `std::fs` |
| `::<T>` | the "turbofish": name a type parameter in a call | `"5".parse::<i32>()` |
| `..` `..=` | a range without or with its end | `0..10`, `1..=6` |
| `..` | "the rest": in patterns and in struct update | `Point { x, .. }`, `..Default::default()` |
| `->` | the return type of a function | `fn f() -> i32` |
| `=>` | "then", in a `match` arm | `Some(n) => n` |
| `\|a, b\|` | the parameters of a closure | `\|x\| x + 1` |
| `\|` in a pattern | "or" | `1 \| 2 => …` |
| `@` | name a value while testing it with a pattern | `n @ 1..=9` |
| `_` | "anything", in patterns; "work it out", in types | `_ => …`, `Vec<_>` |
| `'a` | a lifetime; also a loop label | `&'a str`, `'outer: loop` |
| `name!` | call a macro | `println!`, `vec!` |
| `#[…]` `#![…]` | an attribute for the next item; for the surrounding item | `#[derive(Debug)]` |
| `;` | end of a statement | |
| `//` `///` `//!` `/* */` | comment; documentation for the next item; documentation for the surrounding item; block comment | |

### Which operator goes first

From the tightest binding to the loosest. Operators on the same line are worked out from left to right.

| Level | Operators |
|---|---|
| 1 | method calls, fields: `a.b()`, `a.b` |
| 2 | function calls and indexing: `f(x)`, `v[i]` |
| 3 | `?` |
| 4 | the one-sided operators: `-x`, `!x`, `*x`, `&x`, `&mut x` |
| 5 | `as` |
| 6 | `*` `/` `%` |
| 7 | `+` `-` |
| 8 | `<<` `>>` |
| 9 | `&` |
| 10 | `^` |
| 11 | `\|` |
| 12 | `==` `!=` `<` `>` `<=` `>=` (cannot be chained: `a < b < c` is an error) |
| 13 | `&&` |
| 14 | `\|\|` |
| 15 | `..` `..=` |
| 16 | `=` `+=` and the other assignments |
| 17 | `return`, `break`, closures |

Three results that surprise people. When in doubt, add parentheses: they cost nothing.

```rust run
fn main() {
    // A method call binds tighter than the minus sign in front.
    println!("{} {}", -2_i32.pow(2), (-2_i32).pow(2));

    // `as` binds tighter than arithmetic.
    let total = 7;
    let count = 2;
    println!("{} {}", total / count, total as f64 / count as f64);

    // Shifts bind looser than `+`.
    println!("{} {}", 1 << 2 + 1, (1 << 2) + 1);
}
```
```output auto
```

### Working with single bits

An integer is a row of bits ([chapter 9](#types)). Six operators work on the bits directly. They are used for sets of yes-or-no flags packed into one number, for file formats and network protocols, and for hardware.

```rust run
const READ: u8 = 0b001;
const WRITE: u8 = 0b010;
const EXECUTE: u8 = 0b100;

fn main() {
    let mut rights = READ | WRITE; // `|` switches bits on
    println!("{rights:03b}");

    println!("{}", rights & WRITE != 0); // `&` tests a bit
    println!("{}", rights & EXECUTE != 0);

    rights &= !WRITE; // `& !` switches a bit off
    rights ^= EXECUTE; // `^` flips a bit
    println!("{rights:03b}");

    // Shifts move all bits to the left or to the right.
    println!("{} {} {}", 1_u32 << 4, 0b1000_u32 >> 3, 0xAB_u32 >> 4);

    // Useful methods on every integer type
    println!("{} {} {}", 0b1011_u8.count_ones(), 16_u32.trailing_zeros(), 1_u8.leading_zeros());
}
```
```output auto
```

For more than a few flags, the crate `bitflags` gives them a type of their own, so that flags of different kinds cannot be mixed up.

## Ways to write a value

| You write | You get |
|---|---|
| `1_000_000` | an integer; the underscores are only for the reader |
| `0xff`, `0o77`, `0b1010` | an integer in base 16, base 8 and base 2 |
| `42u8`, `7_i64`, `1usize` | an integer of the named type |
| `2.5`, `1e3`, `2.5f32` | a float (`f64` unless you say `f32`) |
| `'a'`, `'\n'`, `'\u{1F980}'` | a `char`: a letter, a line break, a character by its number |
| `b'a'` | the byte of an ASCII character: a `u8` |
| `"text"` | a `&str`. `\n`, `\t`, `\\`, `\"` and `\u{…}` work inside |
| `r"C:\temp"`, `r#"say "hi""#` | a raw string: backslashes (and, with `#`, quotation marks) mean themselves |
| `b"bytes"` | a byte string: `&[u8; 5]` |
| `c"text"` | a C string, with a zero byte at the end: `&CStr` ([chapter 37](#ffi)) |
| `(1, "a")`, `()` | a tuple; the empty tuple, called "unit" |
| `[1, 2, 3]`, `[0; 8]` | an array; an array of eight zeros |

## Formatting codes

The codes work in `println!`, `format!`, `write!`, `panic!`, `assert!` and all other formatting macros. The general shape is `{name:fill align sign # 0 width .precision type}`, and every part can be left out.

```rust run
fn main() {
    let name = "Ferris";
    let n = 255;
    let pi = 3.14159265;

    println!("1  [{}] [{:?}]", name, name);
    println!("2  [{:>10}] [{:<10}] [{:^10}]", name, name, name);
    println!("3  [{:*^12}] [{:->8}]", name, n);
    println!("4  [{:6}] [{:06}] [{:+}]", n, n, n);
    println!("5  [{:.2}] [{:8.3}] [{:e}]", pi, pi, 1234.5);
    println!("6  [{:x}] [{:X}] [{:o}] [{:b}]", n, n, n, n);
    println!("7  [{:#x}] [{:#b}] [{:#010b}]", n, n, 5);
    println!("8  [{0} {1} {0}] [{name} {n}] [{last}]", "a", "b", last = "z");

    let width = 12;
    let digits = 1;
    println!("9  [{pi:width$}] [{pi:.digits$}] [{pi:>width$.digits$}]");

    println!("10 [{{}}] [{:?}] [{:5}|{:<5}|]", (1, "a"), true, 'x');
    println!("11 {:#?}", Some((1, "a")));
}
```
```output auto
```

| Line | Code | Meaning |
|---|---|---|
| 1 | `{}` and `{:?}` | for people (`Display`), and for programmers (`Debug`) |
| 2 | `{:>10}` `{:<10}` `{:^10}` | at least 10 characters wide: aligned right, left, centred. Text goes left unless you say otherwise, numbers go right |
| 3 | `{:*^12}` `{:->8}` | the character in front of the alignment sign fills the empty room |
| 4 | `{:6}` `{:06}` `{:+}` | a width for a number; filled with zeros; always with a sign |
| 5 | `{:.2}` `{:8.3}` `{:e}` | digits after the point; width and digits; scientific notation |
| 6 | `{:x}` `{:X}` `{:o}` `{:b}` | base 16 in small and capital letters, base 8, base 2 |
| 7 | `{:#x}` `{:#b}` `{:#010b}` | with the prefix `0x` or `0b`; the width counts the prefix |
| 8 | `{0}` `{name}` `{last}` | an argument by position; a variable by name; an argument named in the call |
| 9 | `{pi:width$}` `{pi:.digits$}` | width and precision taken from variables |
| 10 | `{{` `}}` | a real brace |
| 11 | `{:#?}` | `Debug` spread over several lines |

`{:p}` prints the address in a pointer or reference. To make your own type work with `{}`, implement `Display` ([chapter 25](#traits)). For `{:?}`, derive `Debug`.

## Traits you can derive

`#[derive(…)]` writes the implementation for you. It works when every field of the type already has the trait.

| Trait | What you can do afterwards | Notes |
|---|---|---|
| `Debug` | print with `{:?}` and `dbg!` | derive it on almost every type |
| `Clone` | `value.clone()` | an explicit copy that may be expensive |
| `Copy` | the value is copied instead of moved | only for small types without heap data; needs `Clone` |
| `PartialEq` | `==` and `!=` | compares field by field |
| `Eq` | promise that equality has no exceptions | needs `PartialEq`; not possible with `f32` or `f64` fields |
| `PartialOrd` | `<`, `>`, `<=`, `>=` | compares the fields in the order they are written; needs `PartialEq` |
| `Ord` | `sort()`, `max()`, use as a key in a `BTreeMap` | needs `Eq` and `PartialOrd` |
| `Hash` | use as a key in a `HashMap` or `HashSet` | needs `Eq`. Equal values must have equal hashes, which the derived versions guarantee |
| `Default` | `Type::default()` and `..Default::default()` | numbers become 0, text empty, `bool` false, `Option` `None`. For an enum, mark one variant with `#[default]` |

A common full set for a small value type is `#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Default)]`. Crates add more: `Serialize` and `Deserialize` from serde ([chapter 78](#serde)), `Error` from thiserror ([chapter 23](#errors)), `Parser` from clap ([chapter 73](#cli)).

## `Option` and `Result`: which method?

| You have | You want | Use |
|---|---|---|
| `Option<T>` | the value, or a fallback | `unwrap_or(x)`, `unwrap_or_else(\|\| …)`, `unwrap_or_default()` |
| `Option<T>` | a `Result`, to use `?` | `ok_or(error)`, `ok_or_else(\|\| …)` |
| `Option<T>` | to change the value inside | `map(\|v\| …)` |
| `Option<T>` | to continue with something that may also be missing | `and_then(\|v\| …)` |
| `Option<T>` | another option if this one is `None` | `or(other)`, `or_else(\|\| …)` |
| `Option<T>` | to keep the value only if a test passes | `filter(\|v\| …)` |
| `Option<T>` | a yes or no | `is_some()`, `is_none()`, `is_some_and(\|v\| …)` |
| `&Option<T>` | to look inside without taking | `as_ref()`, `as_deref()` |
| `&mut Option<T>` | to take the value and leave `None` | `take()` |
| `&mut Option<T>` | the value, filled in first if it is missing | `get_or_insert_with(\|\| …)` |
| `Result<T, E>` | to change the success value, or the error | `map(\|v\| …)`, `map_err(\|e\| …)` |
| `Result<T, E>` | to continue with another step that can fail | `and_then(\|v\| …)` |
| `Result<T, E>` | an `Option`, dropping the error | `ok()` |
| `Result<T, E>` | the value, or a fallback | `unwrap_or(x)`, `unwrap_or_else(\|e\| …)`, `unwrap_or_default()` |
| `Result<T, E>` | to stop with a message if this "cannot happen" | `expect("why it cannot fail")` |
| `Option<Result<T, E>>` | `Result<Option<T>, E>` | `transpose()` |
| many `Result<T, E>` | one `Result<Vec<T>, E>` | `collect()` ([chapter 30](#iterators)) |

[Chapter 40](#idioms) shows these in use.

## A map of the standard library

You reach everything with `use std::…`. The most used items need no `use` at all: they are in the **prelude**, which is in scope in every file. It contains `Option` and `Result` with their variants, `String`, `Vec`, `Box`, the traits `Clone`, `Copy`, `Drop`, `Default`, `Iterator`, `From`, `Into`, `TryFrom`, `TryInto`, `ToString`, `PartialEq`, `Ord` and their relatives, and the function `drop`.

| Module | What is in it | Chapter |
|---|---|---|
| `std::collections` | `HashMap`, `HashSet`, `BTreeMap`, `BTreeSet`, `VecDeque`, `BinaryHeap` | [20](#collections) |
| `std::fmt` | `Display`, `Debug`, `Formatter`, `Write` for text | [25](#traits) |
| `std::fs` | files and folders: `read_to_string`, `write`, `File`, `read_dir`, `create_dir_all` | [23](#errors), [28](#project-search) |
| `std::io` | `stdin`, `stdout`, `Read`, `Write`, `BufRead`, `BufReader`, `BufWriter`, `Error` | [12](#project-guessing), [23](#errors), [74](#performance) |
| `std::path` | `Path` and `PathBuf`: file paths that work on every system | [28](#project-search) |
| `std::env` | command-line arguments (`args`) and environment variables (`var`) | [28](#project-search), [64](#web) |
| `std::process` | `exit`, `ExitCode`, and `Command` to run other programs | [73](#cli) |
| `std::time` | `Duration`, `Instant` (a stopwatch), `SystemTime` (the clock) | [55](#threads), [74](#performance) |
| `std::thread` | `spawn`, `scope`, `sleep`, `available_parallelism` | [55](#threads) |
| `std::sync` | `Arc`, `Mutex`, `RwLock`, `Condvar`, `OnceLock`, `LazyLock`; `mpsc` channels; `atomic` types | [55](#threads), [56](#shared-state) |
| `std::rc`, `std::cell` | `Rc`, `Weak`; `Cell`, `RefCell`, `UnsafeCell` | [32](#smart-pointers), [36](#unsafe) |
| `std::borrow` | `Cow`: borrowed or owned | [32](#smart-pointers) |
| `std::mem` | `swap`, `replace`, `take`, `size_of`, `drop`, `forget` | [38](#memory-layout) |
| `std::ptr` | tools for raw pointers | [36](#unsafe) |
| `std::cmp` | `Ordering`, `min`, `max`, `Reverse` | [25](#traits), [29](#closures) |
| `std::ops` | the traits behind the operators: `Add`, `Index`, `Deref`, `Drop`, `Fn`, ranges | [33](#advanced-traits) |
| `std::iter` | `Iterator` and its helpers: `once`, `repeat`, `from_fn`, `successors` | [30](#iterators) |
| `std::convert` | `From`, `Into`, `TryFrom`, `TryInto`, `AsRef` | [34](#type-system) |
| `std::str`, `std::string`, `std::char` | text: `FromStr`, `from_utf8`, `String`, character tools | [16](#slices-strings) |
| `std::num` | number errors (`ParseIntError`), `NonZero`, `Wrapping` | [23](#errors), [38](#memory-layout) |
| `std::error` | the trait `Error` | [23](#errors) |
| `std::any` | `Any`, `type_name` | [33](#advanced-traits) |
| `std::marker` | `Send`, `Sync`, `Sized`, `Copy`, `PhantomData` | [33](#advanced-traits), [34](#type-system) |
| `std::net` | `TcpListener`, `TcpStream`, `UdpSocket`, addresses | [57](#async) |
| `std::ffi`, `std::os` | `CString`, `CStr`, `OsString`; things special to one operating system | [37](#ffi) |
| `std::future`, `std::pin`, `std::task` | the parts under `async` | [57](#async) |
| `std::hint` | `black_box`, `spin_loop` | [74](#performance) |
| `std::panic` | `catch_unwind`, panic hooks | [37](#ffi) |

Without an operating system, a program uses `core` (everything that needs neither memory allocation nor a system) and `alloc` (`Box`, `Vec`, `String`), which together make up most of `std` ([chapter 80](#games-embedded)).

## Attributes you will see

| Attribute | Meaning | Chapter |
|---|---|---|
| `#[derive(…)]` | generate trait implementations | [17](#structs) |
| `#[allow(lint)]`, `#[warn(…)]`, `#[deny(…)]`, `#[expect(…)]` | silence a warning, switch it on, make it an error, or say "this warning must appear here" | [71](#quality-tools) |
| `#[cfg(…)]`, `#[cfg_attr(…)]` | compile the item only under a condition | [70](#cargo) |
| `#[test]`, `#[should_panic]`, `#[ignore]` | a test; a test that must panic; a test that runs only on request | [27](#testing) |
| `#[must_use]` | warn when the result is thrown away | [35](#macros) |
| `#[deprecated]` | warn users that the item will go away | [35](#macros) |
| `#[non_exhaustive]` | more fields or variants may come: users must be ready for them | [40](#idioms) |
| `#[inline]`, `#[cold]` | hints for the optimiser | [74](#performance) |
| `#[repr(C)]`, `#[repr(u8)]`, `#[repr(transparent)]` | fix the layout of a type in memory | [38](#memory-layout) |
| `#[track_caller]` | when this function panics, report the line of its caller | |
| `#[macro_export]` | make a `macro_rules!` macro public | [35](#macros) |
| `#[global_allocator]` | choose the allocator for the whole program | [74](#performance) |
| `#![no_std]`, `#![no_main]` | a crate without the standard library; without the usual start | [80](#games-embedded) |
| `#![forbid(unsafe_code)]` | refuse `unsafe` in the whole crate | [36](#unsafe) |

## HTTP status codes

HTTP status codes are part of every web service, and the numbers matter to clients. The ones a Rust web service sends, in practice ([chapter 64](#web)):

| Code | Name | Meaning | When a server sends it |
|---|---|---|---|
| 200 | OK | Success with a body | A `GET` that found something |
| 201 | Created | Success, something new exists | After a `POST` that stored a row; add a `Location` header |
| 204 | No Content | Success, deliberately no body | A `DELETE`, or a `PUT` whose result the client does not need |
| 301 | Moved Permanently | The resource has a new address for ever | Redirecting a renamed route in a browser |
| 304 | Not Modified | The client's cached copy is still good | `If-None-Match` matching your `ETag` |
| 400 | Bad Request | Malformed: the body is not even parseable | Broken JSON, a missing required field |
| 401 | Unauthorized | *I do not know who you are* | No session, expired token, bad API key |
| 403 | Forbidden | *I know who you are, and you may not* | A reader calling an admin route |
| 404 | Not Found | No such resource — or none you may know about | A missing id; also used to hide existence |
| 405 | Method Not Allowed | The path exists, the method does not | `DELETE` on a read-only route |
| 409 | Conflict | The request clashes with the current state | A duplicate unique key, an edit of a stale version |
| 413 | Payload Too Large | The body exceeds the limit | An upload beyond the configured maximum |
| 415 | Unsupported Media Type | The body's format is not accepted | XML sent to a JSON endpoint |
| 422 | Unprocessable Content | Well-formed, but fails validation | A negative age, a handle with a forbidden character. Older material calls it Unprocessable Entity; the code is the same |
| 429 | Too Many Requests | Rate limited | Include `Retry-After` |
| 500 | Internal Server Error | The server's fault, no detail to the client | Any unexpected error; log it, do not leak it |
| 502 | Bad Gateway | An upstream answered badly | A proxy could not get a valid answer |
| 503 | Service Unavailable | Temporarily unable to serve | Starting up, shutting down, `/ready` failing |
| 504 | Gateway Timeout | An upstream took too long | A proxy's timeout expired |

The two that are most often confused are **401** and **403**: authentication versus authorisation. The one that is most often wrong is **200 with an error inside the body** — a client, a proxy and a monitoring system all read the status code, and none of them reads your JSON.

The full list, with the official definitions, is in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110).

## Computer Systems & Linux Internals Quick Reference

Quick lookup tables for [Part I](#hardware-architecture), [Part II](#compilation-pipeline), [Part IV–VIII](#virtual-memory-address-spaces), and [the Linux Systems Lab](#linux-systems-lab):

### Calling Conventions & Linux `syscall` Registers

| Slot | x86-64 System V C Call | x86-64 Linux `syscall` | ARM64 (AArch64) C Call | ARM64 Linux `svc #0` |
|---|---|---|---|---|
| Syscall # | — | `RAX` | — | `X8` |
| Arg 1 | `RDI` | `RDI` | `X0` | `X0` |
| Arg 2 | `RSI` | `RSI` | `X1` | `X1` |
| Arg 3 | `RDX` | `RDX` | `X2` | `X2` |
| Arg 4 | `RCX` | `R10` | `X3` | `X3` |
| Arg 5 | `R8` | `R8` | `X4` | `X4` |
| Arg 6 | `R9` | `R9` | `X5` | `X5` |
| Return | `RAX` (+ `RDX`) | `RAX` (`-4095..-1` = `-errno`) | `X0` (+ `X1`) | `X0` |
| Callee-saved | `RBX, RBP, R12–R15` | all preserved except `RCX, R11` | `X19–X28, X29, X30` | preserved |

### Essential Linux Binary & Process Inspection Commands

| Command | Purpose |
|---|---|
| `rustc --emit=mir,llvm-ir,asm` | Inspect Rust MIR, LLVM IR, and target assembly |
| `objdump -d -M intel <bin>` | Disassemble executable machine bytes with Intel mnemonics |
| `readelf -h -S -l -s <bin>` | Inspect ELF header, sections (`.text`, `.rodata`, `.data`, `.bss`), `PT_LOAD` segments, symbols |
| `nm -C <bin>` | List demangled symbols in an object file or executable |
| `ldd <bin>` | Print shared library dependencies (`libc.so.6`, `ld-linux-x86-64.so.2`) |
| `strace -f -e trace=file,network ./prog` | Trace live Linux syscalls (`openat`, `read`, `write`, `mmap`, `futex`, `epoll_wait`) |
| `cat /proc/self/maps` | Inspect live process Virtual Memory Areas (`r-xp`, `rw-p`, `[heap]`, `[stack]`, `[vdso]`) |
| `cat /proc/self/status` | Inspect `Pid`, `Threads`, `VmRSS`, and context switch counts |

## More tables in the chapters

- The basic types, with sizes and ranges: [chapter 9](#types).
- All patterns: [chapter 19](#patterns).
- The most used iterator methods: [chapter 30](#iterators).
- Which smart pointer for which job: [chapter 32](#smart-pointers).
- Naming rules: [chapter 40](#idioms).
- The Cargo commands: [chapter 70](#cargo).
- The common compiler errors and their repairs: [the errors appendix](#errors-ref).

## Authoritative and current sources

This guide aims to explain the ideas and provide a practical route through the ecosystem. It cannot replace the reference for a language guarantee, a crate's full API, or a target-specific deployment rule. Use primary documentation to verify details before making a production decision:

| Resource | Best for |
|---|---|
| [The Rust Programming Language](https://doc.rust-lang.org/book/) | A systematic introduction to the language and standard tools |
| [The Rust Reference](https://doc.rust-lang.org/reference/) | Precise language syntax and semantics |
| [Rust by Example](https://doc.rust-lang.org/rust-by-example/) | Small runnable examples of language and library features |
| [The Rustonomicon](https://doc.rust-lang.org/nomicon/) | Advanced unsafe-code patterns and their obligations; it is explicitly incomplete, so compare it with the Reference |
| [The Cargo Book](https://doc.rust-lang.org/cargo/) | Cargo manifests, workspaces, profiles, configuration and commands |
| [Rustup documentation](https://rust-lang.github.io/rustup/) | Toolchain channels, targets, components and toolchain selection |
| [docs.rs](https://docs.rs/) and [crates.io](https://crates.io/) | A crate's versioned API documentation, release metadata and published package |
| [Are We Web Yet?](https://www.arewewebyet.org/) | A community-maintained map of Rust's web libraries and trade-offs |
| [Awesome Rust](https://github.com/rust-unofficial/awesome-rust) | A broad, community-curated catalogue of projects and resources |
| [Zero To Production in Rust](https://www.zero2prod.com/) | A production-oriented backend development path and its publicly available examples |
| Web frameworks | [Axum](https://docs.rs/axum/latest/axum/), [Actix Web](https://actix.rs/docs/), [Rocket](https://rocket.rs/guide/v0.5/), [Warp](https://docs.rs/warp/latest/warp/) |
| Async runtimes | [Tokio tutorial](https://tokio.rs/tokio/tutorial), [smol](https://docs.rs/smol/latest/smol/), [async-std status](https://docs.rs/async-std/latest/async_std/), [Embassy](https://embassy.dev/) |
| Data and databases | [Serde](https://serde.rs/), [SQLx](https://docs.rs/sqlx/latest/sqlx/), [Diesel](https://docs.rs/diesel/latest/diesel/), [SeaORM](https://docs.rs/sea-orm/latest/sea_orm/) |
| Errors, logging and CLI | [anyhow](https://docs.rs/anyhow/latest/anyhow/), [thiserror](https://docs.rs/thiserror/latest/thiserror/), [eyre](https://docs.rs/eyre/latest/eyre/), [miette](https://docs.rs/miette/latest/miette/), [clap](https://docs.rs/clap/latest/clap/), [tracing](https://docs.rs/tracing/latest/tracing/) |
| HTTP and tests | [reqwest](https://docs.rs/reqwest/latest/reqwest/), [ureq](https://docs.rs/ureq/latest/ureq/), [proptest](https://proptest-rs.github.io/proptest/), [Mockall](https://docs.rs/mockall/latest/mockall/), [Criterion](https://criterion-rs.github.io/book/index.html) |
| FFI, embedded and UI | [wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/), [PyO3](https://pyo3.rs/latest/), [embedded-hal](https://docs.rs/embedded-hal/latest/embedded_hal/), [egui](https://docs.rs/egui/latest/egui/), [iced](https://docs.rs/iced/latest/iced/), [Bevy](https://bevy.org/learn/quick-start/introduction/) |
| Delivery and deployment | [Cross](https://github.com/cross-rs/cross), [GitHub Actions for Rust](https://github.com/actions-rust-lang/setup-rust-toolchain), [Docker's Rust guide](https://docs.docker.com/guides/rust/), [Nix manual](https://nix.dev/manual/nix/stable/) |

For framework and library behaviour, start at that project's official guide or API documentation; examples in this guide are deliberately smaller than those references. Check the version selector, changelog, minimum supported Rust version, feature flags, platform support, licence and maintenance status. A link to `/latest/` documentation describes what is current when you read it, not necessarily what an older `Cargo.lock` selected. The ecosystem moves faster than Rust's stable language guarantees.
