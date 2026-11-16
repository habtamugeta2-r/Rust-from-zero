@id core-language
@part def
@title Core Language Fundamentals
@short Core language
@level all
@time 110
@learn Use every scalar and compound type, and explain the difference between mutation and shadowing | Apply ownership, borrowing and lifetimes to decide who may read or write a value | Model data with structs, enums, traits, generics and pattern matching | Choose between static dispatch, trait objects and closures, and read their cost | Handle failure with `Result`, custom error types and the `?` operator | Organise code into crates, modules and collections with correct visibility

This chapter is the anchor of the definitive curriculum. It teaches the whole
core language in one sequence, from the first `let` to associated types,
procedural macros and const evaluation. Every section links to a deeper,
systems-level treatment in the library when one exists, so you can read this
chapter once for the map and return to the linked chapters for the machine
view.

If you already write Rust, use the section headings as a checklist. If you are
starting from zero, read in order and type every example into a scratch
project; the exercises at the end assume you have done both.

:::note How to read this chapter
Each numbered section is one topic from the brief. Code is deliberately short:
the aim is to show the shape of the idea, not to build an application. The
[deep-dive library](#home) covers the internals, and the [roadmap](#roadmap)
shows where each linked chapter sits.
:::

## 1.1 Variables, mutability and shadowing

A binding is introduced with `let`. Bindings are **immutable by default**:
the compiler rejects an assignment unless the binding was declared `mut`.
Immutability is the default because most values are written once and read
many times, and a reader who sees `let` can stop looking for writes.

```rust
fn main() {
    let answer = 42;
    // answer = 43; // error[E0384]: cannot assign twice to immutable variable

    let mut attempts = 0;
    attempts += 1;
    attempts += 1;
    println!("{answer} after {attempts} attempts");

    // Shadowing: a new binding, possibly of a different type.
    let answer = "forty-two";
    let answer = answer.len();
    println!("{answer}");

    {
        let answer = 0; // inner scope only
        println!("inner {answer}");
    }
    println!("outer {answer}");
}
```

**Shadowing** (`let answer = ...` again) creates a *new* binding that hides the
previous one until the end of the scope. The old value is dropped at the point
of shadowing, not at the end of the block. Shadowing may change the type;
`mut` may not. Use `mut` when the same logical value changes over time, and
shadowing when a value is transformed into a new concept (raw input into parsed
input, for example).

A leading underscore silences the unused-variable warning: `let _guard = ...`
binds and keeps the value alive; `let _ = ...` drops it immediately. The
difference matters for locks and guards, which release on drop.

## 1.2 Scalar data types

Rust has four scalar families: integers, floating-point numbers, booleans and
characters. Every scalar has a fixed size, known at compile time.

| Family | Types | Size | Notes |
| --- | --- | --- | --- |
| Signed integers | `i8`, `i16`, `i32`, `i64`, `i128`, `isize` | 1–16 bytes | `isize` matches the pointer width |
| Unsigned integers | `u8`, `u16`, `u32`, `u64`, `u128`, `usize` | 1–16 bytes | `usize` is used for indexing and lengths |
| Floats | `f32`, `f64` | 4 and 8 bytes | IEEE-754; `f64` is the default |
| Boolean | `bool` | 1 byte | `true` or `false`, no implicit integer conversion |
| Character | `char` | 4 bytes | One Unicode scalar value, written in single quotes |

```rust
fn main() {
    let decimal = 98_222;          // i32 by default
    let hex = 0xff;
    let octal = 0o77;
    let binary = 0b1111_0000;
    let byte = b'A';               // u8
    let big: u64 = 18_446_744_073_709_551_615;
    let ratio = 2.5_f32;
    let letter = 'ß';              // one char, four bytes in memory
    let truth = true;

    // Checked, wrapping and saturating arithmetic make overflow explicit.
    let near_limit = u8::MAX;
    println!("{:?}", near_limit.checked_add(1)); // None
    println!("{}", near_limit.wrapping_add(1));  // 0
    println!("{}", near_limit.saturating_add(1)); // 255

    println!("{decimal} {hex} {octal} {binary} {byte} {big} {ratio} {letter} {truth}");
}
```

In a debug build, integer overflow panics. In a release build it wraps by
default. Neither behaviour is a substitute for deciding what you want:
`checked_*`, `wrapping_*`, `saturating_*` and `overflowing_*` state the intent.
Type inference chooses `i32` for an unconstrained integer literal and `f64` for
a float literal. `as` performs a numeric cast and truncates or reinterprets
bits; it does not validate ranges. Prefer `try_into()` when a value must fit
(see section 1.23).

## 1.3 Compound data types: tuples, arrays and slices

A **tuple** groups values of different types; its length and element types are
part of its type. An **array** groups a fixed number of values of one type,
written `[T; N]`, and lives inline in its owner. A **slice** `&[T]` is a
borrowed view of a contiguous run of elements, with a pointer and a length; it
does not own the data. `&str` is the slice of UTF-8 bytes, and is the reason
string APIs accept `&str` rather than `&String`.

```rust
fn sum(xs: &[i32]) -> i32 {
    xs.iter().sum()
}

fn main() {
    let pair: (u8, &str) = (7, "seven");
    let (number, name) = pair;
    let unit = (); // the empty tuple, returned by functions with no value
    println!("{number} {name} {unit:?}");

    let mut buffer = [0_u8; 4];     // four zero bytes on the stack
    buffer[0] = 1;
    let words: [&str; 3] = ["a", "b", "c"];
    println!("{:?} {:?}", buffer, words);

    let tail = &words[1..];         // a slice, length 2
    println!("{:?} {}", tail, sum(&[1, 2, 3]));

    // A tuple of one needs a trailing comma.
    let single = (1,);
    println!("{:?}", single);
}
```

Indexing panics out of bounds; `get` returns `Option`. A tuple is destructured
with a pattern, and its fields are reached with `.0`, `.1`. Arrays coerce to
slices, which is why one function can accept a `Vec`, an array or a sub-slice:
pass `&v`, `&arr` or `&arr[1..]`. A tuple with more than twelve elements is
usually a sign that a struct would name the fields better.

## 1.4 Functions, return values, expressions and statements

Rust is expression-oriented: nearly everything produces a value. A **statement**
is an instruction that ends in `;` and produces `()`; an **expression** produces
a value. The last expression in a function body is its return value, written
without `return` and without a semicolon.

```rust
fn double(n: i32) -> i32 {
    n * 2 // expression: no semicolon
}

fn classify(n: i32) -> &'static str {
    if n < 0 {
        "negative"
    } else if n == 0 {
        "zero"
    } else {
        "positive"
    }
}

fn fail() -> ! {
    panic!("this function never returns")
}

fn main() {
    let value = double(21);
    println!("{value} is {}", classify(value));

    let block_value = {
        let inner = 3;
        inner * inner // the block is an expression too
    };
    println!("{block_value}");
}
```

`return` exists for early exits, and is idiomatic in guard clauses. A function
whose body ends with a statement (`n * 2;`) returns `()` and fails to type-check
if another return type is declared. `!` is the **never type**, the type of
expressions that do not produce a value because control leaves: `panic!`,
`return`, `break`, `continue`. It coerces to every other type, which is why a
`match` arm that panics satisfies any expected type. Functions are values:
`double` has a zero-sized function-item type that coerces to `fn(i32) -> i32`.

## 1.5 Control flow

`if` is an expression and its branches must have the same type. `loop` repeats
until `break`, and `break value` yields a value. `while` repeats while a
condition holds. `for` iterates over anything implementing `IntoIterator`, which
is the preferred loop for collections because it cannot run past the end.

```rust
fn main() {
    let n = 7;

    if n % 2 == 0 {
        println!("even");
    } else {
        println!("odd");
    }

    let parity = if n % 2 == 0 { "even" } else { "odd" };
    println!("{parity}");

    let mut countdown = 3;
    while countdown > 0 {
        countdown -= 1;
    }

    'search: for row in 0..5 {
        for column in 0..5 {
            if row * column == 6 {
                println!("found at {row},{column}");
                break 'search; // leave both loops
            }
        }
    }

    let mut attempts = 0;
    let first_square_over_50 = loop {
        attempts += 1;
        if attempts * attempts > 50 {
            break attempts; // loop is an expression
        }
    };
    println!("{first_square_over_50} after {attempts} attempts");

    for (index, ch) in "rust".chars().enumerate() {
        println!("{index}: {ch}");
    }
}
```

`if let`, `while let` and `let ... else` are pattern-based forms of the same
control flow and are covered in section 1.11. `loop` is the only loop that can
return a non-`()` value from `break`; it is also the construct the compiler can
prove never exits without a `break`, which the never type uses.

## 1.6 The ownership model: move, copy and clone

Every value has exactly one **owner**. When the owner goes out of scope, the
value is dropped. Assigning a non-`Copy` value or passing it to a function
**moves** ownership: the old binding becomes unusable. This is how Rust
prevents use-after-free and double-free without a garbage collector.

```rust
fn consume(text: String) {
    println!("consumed {text}");
}

fn main() {
    let greeting = String::from("hello");
    consume(greeting);
    // println!("{greeting}"); // error[E0382]: borrow of moved value

    let number = 42;
    let copy = number; // i32 is Copy: no move occurs
    println!("{number} {copy}");

    let original = String::from("draft");
    let duplicate = original.clone(); // explicit deep copy
    println!("{original} {duplicate}");

    let pair = (String::from("a"), 1);
    let (text, n) = pair; // partially moved; pair is no longer usable as a whole
    println!("{text} {n}");
}
```

`Copy` types are duplicated bit-for-bit on assignment: integers, floats,
booleans, `char`, shared references, and tuples or arrays of `Copy` types. A
type can be `Copy` only if it has no destructor and all its fields are `Copy`;
`String`, `Vec<T>` and `Box<T>` own heap memory and therefore move. `clone()`
is an explicit, potentially expensive deep copy and should be visible in the
code rather than hidden in a trait bound. Moving is a memcpy of the value's
fields plus a prohibition on using the source; for a `String` that is three
machine words, so it is cheap. The deep-dive on [ownership](#ownership) follows
the stack and heap through each of these operations.

:::analogy A book, not a photocopy
Moving a value is handing a book to a friend: there is still one book, but you
no longer hold it. Cloning is photocopying the book: both of you can read, at
the cost of paper. Copying an integer is writing the same short word on a new
sticky note, which is why the compiler allows it silently.
:::

## 1.7 Borrowing and references

Instead of moving a value, you can **borrow** it with a reference. `&T` is a
shared, read-only borrow; `&mut T` is an exclusive, writable borrow. The rules
the compiler enforces at every point in the program are:

1. Any number of shared borrows **or** exactly one mutable borrow, never both
   at the same time.
2. A reference may never outlive the value it points to.

```rust
fn length(text: &str) -> usize {
    text.len()
}

fn push_bang(text: &mut String) {
    text.push('!');
}

fn main() {
    let mut greeting = String::from("hello");

    let first = &greeting;
    let second = &greeting;
    println!("{first} {second} {}", length(&greeting));

    // The shared borrows end here (non-lexical lifetimes), so this is allowed.
    push_bang(&mut greeting);
    println!("{greeting}");

    let mut items = vec![1, 2, 3];
    let head = &items[0];
    println!("{head}");
    items.push(4); // allowed: head is no longer used afterwards

    // let bad = &items[0];
    // items.push(5); // error: cannot borrow `items` as mutable because it is
    //                // also borrowed as immutable
}
```

The borrow checker uses **non-lexical lifetimes**: a borrow ends at its last
use, not at the end of the block. That is why the `head` example compiles.
Borrowing is not only a safety rule; it is a design tool. A function that takes
`&T` documents that it will not take ownership, and a function that takes
`&mut T` documents that it may change the value. Prefer the weakest form that
works: `&str` over `&String`, `&[T]` over `&Vec<T>`, `&T` over `&mut T`. The
[borrowing chapter](#borrowing) derives each rule from the generated machine
code.

:::warn Returning a reference to a local
A reference must never outlive its referent. `fn bad() -> &String { let s =
String::new(); &s }` cannot compile: `s` is dropped at the end of the
function, so the returned pointer would dangle. Return the `String` itself, or
borrow from a value that the caller owns.
:::

## 1.8 Lifetimes

A lifetime is a **constraint on how long a reference is valid**, not a duration
you can measure at run time. Most lifetimes are inferred; annotations are
needed when a function or type has several references and the compiler cannot
tell which output borrows from which input.

```rust
// Explicit: the returned reference lives only as long as the shorter input.
fn longest<'a>(left: &'a str, right: &'a str) -> &'a str {
    if left.len() >= right.len() { left } else { right }
}

// A struct may borrow; the annotation ties the struct to its source.
#[derive(Debug)]
struct Excerpt<'a> {
    text: &'a str,
}

impl<'a> Excerpt<'a> {
    fn announce(&self) -> &'a str {
        self.text
    }
}

// 'static means "valid for the whole program", not "stored in static memory".
fn static_str() -> &'static str {
    "a string literal lives in the binary"
}

fn main() {
    let a = String::from("long string");
    let b = String::from("short");
    let longer = longest(&a, &b);
    println!("{longer}");

    let excerpt = Excerpt { text: &a };
    println!("{}", excerpt.announce());
}
```

The three **elision rules** let you omit most annotations:

1. Each elided input lifetime becomes its own distinct parameter.
2. If there is exactly one input lifetime, it is assigned to all elided output
   lifetimes.
3. If one input is `&self` or `&mut self`, its lifetime is assigned to all
   elided output lifetimes.

If the rules leave an output lifetime ambiguous, the compiler requires an
annotation. Lifetime bounds (`'a: 'b`, "`'a` outlives `'b`") appear when a
struct or generic holds references; `T: 'a` means every reference inside `T`
outlives `'a`. `'static` is a bound like any other: it is the right choice for
data that genuinely lives for the whole program (string literals, leaked
values), and the wrong choice as a workaround for a borrow error. The
[lifetimes chapter](#lifetimes) covers variance, higher-ranked trait bounds and
the borrow checker's region inference; section 13.1 of this curriculum revisits
the advanced patterns.

## 1.9 Structs and methods

A **struct** names a product type. There are three forms: named fields, a tuple
struct with positional fields, and a unit struct with no fields. Methods live
in an `impl` block and take `self`, `&self` or `&mut self` as their first
parameter; associated functions have no `self` and are called as
`Type::function()`.

```rust
#[derive(Debug, Clone, PartialEq)]
struct Point {
    x: f64,
    y: f64,
}

struct Meters(f64);       // tuple struct: a distinct type, not an alias
struct Marker;            // unit struct: useful as a type-level tag

impl Point {
    const ORIGIN: Point = Point { x: 0.0, y: 0.0 };

    fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }

    fn translate(&mut self, dx: f64, dy: f64) {
        self.x += dx;
        self.y += dy;
    }

    fn into_tuple(self) -> (f64, f64) {
        (self.x, self.y)
    }
}

impl Default for Point {
    fn default() -> Self {
        Self::ORIGIN
    }
}

fn main() {
    let mut p = Point::new(3.0, 4.0);
    p.translate(1.0, -1.0);
    println!("{:?} {}", p, p.distance(&Point::ORIGIN));
    let (x, y) = p.into_tuple();
    println!("{x} {y} {:?}", Point::default());
}
```

Field init shorthand (`Self { x, y }`) is idiomatic when the variable names
match the fields. **Struct update syntax** (`..other`) fills the remaining
fields and moves or copies them, which means a non-`Copy` field cannot be used
again afterwards. Methods taking `self` consume the value; that is the right
signature for conversions such as `into_tuple`. Prefer `&self` unless mutation
or consumption is part of the contract.

Tuple structs are the basis of the **newtype pattern** (section 1.25): they
give a distinct type to an existing one, so a `Meters` cannot be passed where a
`Seconds` is expected even though both wrap `f64`.

## 1.10 Enums, `Option<T>` and `Result<T, E>`

An **enum** is a sum type: a value is exactly one of its variants, and each
variant may carry data. `Option<T>` and `Result<T, E>` are ordinary enums from
the standard library, not compiler magic; their methods and exhaustive
matching are what make them ergonomic.

```rust
#[derive(Debug)]
enum Shape {
    Circle { radius: f64 },
    Rectangle(f64, f64),
    Triangle { base: f64, height: f64 },
    Empty,
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { radius } => std::f64::consts::PI * radius * radius,
            Shape::Rectangle(width, height) => width * height,
            Shape::Triangle { base, height } => 0.5 * base * height,
            Shape::Empty => 0.0,
        }
    }
}

fn parse_age(input: &str) -> Result<u8, String> {
    let age: u8 = input.parse().map_err(|_| format!("not an age: {input}"))?;
    if age > 130 {
        return Err(format!("unrealistic age: {age}"));
    }
    Ok(age)
}

fn main() {
    let shapes = [Shape::Circle { radius: 1.0 }, Shape::Rectangle(2.0, 3.0), Shape::Empty];
    for shape in &shapes {
        println!("{:?} -> {}", shape, shape.area());
    }

    let optional: Option<&str> = None;
    println!("{}", optional.unwrap_or("missing"));
    println!("{:?}", optional.map(str::len));

    println!("{:?} {:?}", parse_age("42"), parse_age("nope"));
}
```

`Option<T>` replaces null: the absence of a value is explicit in the type, and
the compiler forces a match or one of the combinators (`unwrap_or`, `map`,
`and_then`, `ok_or`, `?`). `Result<T, E>` replaces exceptions: the error is a
value, and the caller chooses whether to recover, convert or propagate it.
`unwrap` and `expect` are for prototypes and cases where failure is a bug; in
library code they are a promise the caller cannot inspect. `?` is covered in
section 1.18. The [enums chapter](#enums) shows the memory layout of each
variant, including the niche optimisation that keeps `Option<&T>` pointer-sized.

## 1.11 Pattern matching

Patterns destructure values and test their shape. `match` is exhaustive: every
possible value must be handled, which is how adding an enum variant becomes a
compile error at every site that needs updating. `if let` and `while let` handle
one pattern; `let ... else` handles the failure case with an early exit.

```rust
enum Command {
    Quit,
    Move { x: i32, y: i32 },
    Write(String),
    ChangeColour(u8, u8, u8),
}

fn main() {
    let commands = [
        Command::Move { x: 2, y: -1 },
        Command::Write(String::from("hi")),
        Command::ChangeColour(0, 128, 255),
        Command::Quit,
    ];

    for command in &commands {
        match command {
            Command::Quit => println!("quit"),
            Command::Move { x, y } if *x == 0 && *y == 0 => println!("origin"),
            Command::Move { x, y } => println!("move {x},{y}"),
            Command::Write(text) => println!("write {text}"),
            Command::ChangeColour(r, g, b) => println!("colour {r},{g},{b}"),
        }
    }

    let maybe = Some(("rust", 2015));
    if let Some((name, year)) = maybe {
        println!("{name} since {year}");
    }

    let Some(value) = maybe.map(|(_, year)| year) else {
        println!("no year");
        return;
    };
    println!("year {value}");

    let mut stack = vec![1, 2, 3];
    while let Some(top) = stack.pop() {
        println!("{top}");
    }

    let n = 7;
    match n {
        0 => println!("zero"),
        x @ 1..=9 => println!("single digit {x}"),
        x if x % 2 == 0 => println!("even {x}"),
        _ => println!("many"),
    }
}
```

Other pattern features worth recognising: `|` for alternatives, `..` to ignore
the rest of a tuple or struct (`Point { x, .. }`), `_` for a value to ignore,
`ref` to borrow in a binding (rarely needed now that match ergonomics infer
it), and slice patterns such as `[first, rest @ ..]`. Guards (`if condition`)
add arbitrary logic but do not count towards exhaustiveness. Prefer a `match`
over a chain of `if` tests when the value is an enum: the compiler can prove
the match complete. The [patterns chapter](#patterns) covers binding modes and
exhaustiveness in detail.

## 1.12 Traits

A trait is a set of capabilities: methods, associated functions, associated
types and associated constants that a type promises to provide. Traits are
Rust's unit of generic abstraction and its unit of dynamic dispatch.

```rust
use std::fmt;

trait Summary {
    // Required method.
    fn summary(&self) -> String;

    // Provided method: can be overridden, and can call required methods.
    fn preview(&self) -> String {
        let text = self.summary();
        text.chars().take(20).collect()
    }
}

trait Published: Summary { // supertrait: every implementor must also be Summary
    fn edition(&self) -> u32;
}

struct Article {
    title: String,
    body: String,
}

impl Summary for Article {
    fn summary(&self) -> String {
        format!("{}: {}", self.title, self.body)
    }
}

impl Published for Article {
    fn edition(&self) -> u32 {
        2024
    }
}

// Blanket implementation for a local trait: every Display type qualifies.
trait Shout {
    fn shout(&self) -> String;
}

impl<T: fmt::Display> Shout for T {
    fn shout(&self) -> String {
        format!("{}!", self)
    }
}

fn main() {
    let article = Article { title: "Ownership".into(), body: "One owner.".into() };
    println!("{}", article.preview());
    println!("{}", article.edition());
    println!("{}", 42.shout());
}
```

A blanket implementation such as `impl<T: Display> Shout for T` is allowed only
when the trait is local (or the type is), because coherence must be able to see
all possible implementations. It cannot coexist with a specific
`impl Shout for Article` unless `Article` is known never to implement `Display`,
so blanket implementations are usually reserved for extension traits.

A trait may also be a **marker** (no items) such as `Send` or `Copy`, or carry
associated constants for configuration. The **orphan rule** governs where an
implementation may live: you may implement a trait for a type only if the trait
or the type is local to your crate. That prevents two crates from adding
incompatible implementations of the same foreign trait to the same foreign
type. The exception is a local type parameter in a generic trait, which is why
`impl<T> MyTrait for Vec<T>` is allowed while `impl<T> Display for Vec<T>` is
not. Coherence also forbids overlapping blanket implementations. The
[traits chapter](#traits) and [advanced traits](#advanced-traits) cover
coherence, negative reasoning and the object-safety rules.

:::compare Interfaces in other languages
Java's `interface` and C#'s `interface` are close cousins of a Rust trait, but
Rust separates *defining* a trait from *implementing* it for a type, allows
implementations for types you did not define (subject to the orphan rule), and
resolves generic uses at compile time. Go's implicit interfaces are closer to
Rust's structural expectations: a type satisfies a trait by implementing it,
not by naming it in its declaration.
:::

## 1.13 Trait objects: `dyn Trait`

A generic bound is **static dispatch**: the compiler generates a specialised
copy of the function for each concrete type. A trait object is **dynamic
dispatch**: one function accepts `&dyn Trait` or `Box<dyn Trait>` and looks up
the method in a vtable at run time.

```rust
trait Animal {
    fn name(&self) -> &str;
    fn sound(&self) -> &str;
    fn describe(&self) -> String {
        format!("{} says {}", self.name(), self.sound())
    }
}

struct Dog;
struct Cat;

impl Animal for Dog {
    fn name(&self) -> &str { "dog" }
    fn sound(&self) -> &str { "woof" }
}

impl Animal for Cat {
    fn name(&self) -> &str { "cat" }
    fn sound(&self) -> &str { "meow" }
}

fn chorus(animals: &[Box<dyn Animal>]) {
    for animal in animals {
        println!("{}", animal.describe());
    }
}

fn generic_chorus<A: Animal>(animal: &A) {
    println!("{}", animal.describe());
}

fn main() {
    let animals: Vec<Box<dyn Animal>> = vec![Box::new(Dog), Box::new(Cat)];
    chorus(&animals);
    generic_chorus(&Dog);

    let dog: &dyn Animal = &Dog;
    println!("{}", dog.sound());
}
```

`dyn Trait` is a **dynamically sized type**, so it is always used behind a
pointer: `&dyn Trait`, `Box<dyn Trait>`, `Rc<dyn Trait>`. The pointer is wide
(data pointer plus vtable pointer), which is why `Box<dyn Trait>` is two words
while `Box<Dog>` is one. A trait is **object-safe** if it has no generic methods,
no methods returning `Self` by value, and no associated functions without a
`where Self: Sized` escape; `Clone` is the classic example of a non-object-safe
trait, which is why `Box<dyn Clone>` does not work.

| | Generics (`impl Trait`, `<T: Trait>`) | Trait objects (`dyn Trait`) |
| --- | --- | --- |
| Decision time | compile time | run time |
| Cost | inlined, zero-cost dispatch | one indirect call per method |
| Code size | one copy per concrete type | one copy total |
| Heterogeneous collection | impossible without an enum | natural |
| Extensible by users | constrained by the concrete type set | new types plug in |

Use generics by default, an enum when the set of variants is closed, and
`dyn Trait` when the set is open or when the collection must mix types. Section
1.29 measures the trade-off.

## 1.14 Generics

Generic parameters let one definition work for many types while keeping type
checking. Bounds state what the body needs; `where` clauses keep long bounds
readable. **Const generics** allow a value, not a type, to be the parameter.

```rust
use std::fmt::Display;

fn largest<T: PartialOrd + Copy>(items: &[T]) -> Option<T> {
    let mut best = *items.first()?;
    for &item in &items[1..] {
        if item > best {
            best = item;
        }
    }
    Some(best)
}

fn print_all<T, U>(left: T, right: U)
where
    T: Display,
    U: Display,
{
    println!("{left} {right}");
}

// Const generic: the length is part of the type, so one implementation serves
// every length without heap allocation.
fn average<const N: usize>(values: [f64; N]) -> f64 {
    values.iter().sum::<f64>() / N as f64
}

// A generic struct with a default type parameter.
#[derive(Debug)]
struct Wrapper<T = String> {
    value: T,
}

fn main() {
    println!("{:?}", largest(&[3, 9, 2]));
    println!("{:?}", largest(&['a', 'z', 'm']));
    print_all(1, "one");
    println!("{}", average([1.0, 2.0, 3.0, 4.0]));
    println!("{:?}", Wrapper { value: "text".to_string() });
    println!("{:?}", Wrapper { value: 7 });
}
```

Bounds can be written inline (`T: Copy`) or in a `where` clause; both are
equivalent, and `where` wins when there are several parameters. Const generic
arguments can often be inferred (`average([...])`), otherwise they use
turbofish: `average::<4>([...])`. Monomorphisation means the compiler emits a
separate `largest` for `i32` and for `char`; this is why generics are fast and
why they can increase binary size. Generic parameters are not values: you
cannot branch on `T` at run time or store a `T` in a `Vec<dyn Any>` without
erasing it. The [generics chapter](#generics) covers trait bounds and
monomorphisation in assembly.

## 1.15 Associated types and generic associated types (GATs)

An **associated type** is a type placeholder inside a trait. The implementor
chooses the concrete type once, and callers name it as `T::Item`. This differs
from a generic parameter on the trait: with `trait Container<T>`, one type could
implement the trait many times for different `T`; with an associated type, each
implementation fixes one `Item`.

```rust
trait Container {
    type Item;
    fn first(&self) -> Option<&Self::Item>;
}

impl<T> Container for Vec<T> {
    type Item = T;

    fn first(&self) -> Option<&Self::Item> {
        self.as_slice().first()
    }
}

fn show<C: Container>(container: &C)
where
    C::Item: std::fmt::Debug,
{
    println!("{:?}", container.first());
}

// A generic associated type (GAT) is an associated type with its own
// parameters. It can express a borrow whose lifetime is chosen by the caller.
trait Lender {
    type Item<'a>
    where
        Self: 'a;

    fn next(&mut self) -> Option<Self::Item<'_>>;
}

struct Windows<'s> {
    data: &'s [u8],
    position: usize,
}

impl<'s> Lender for Windows<'s> {
    type Item<'a> = &'a [u8]
    where
        Self: 'a;

    fn next(&mut self) -> Option<Self::Item<'_>> {
        if self.position + 2 > self.data.len() {
            return None;
        }
        let window = &self.data[self.position..self.position + 2];
        self.position += 1;
        Some(window)
    }
}

fn main() {
    show(&vec![1, 2, 3]);
    let data = [1, 2, 3, 4];
    let mut windows = Windows { data: &data, position: 0 };
    while let Some(window) = windows.next() {
        println!("{window:?}");
    }
}
```

The associated type is usually the better design when there is exactly one
natural choice per implementor (`Iterator::Item`, `Deref::Target`). The generic
parameter is better when a type genuinely supports several implementations
(`From<T>` for many `T`). Before GATs, expressing "a borrow that lives as long
as the caller's borrow" required a workaround such as an `Item = &'a T` trait
with a lifetime parameter on the trait. GATs (stable since Rust 1.65) made
lending iterators expressible; the standard `Iterator` trait still cannot lend
because its `next` signature has no lifetime parameter for the return.

## 1.16 Closures

A closure is an anonymous function that **captures** values from its
environment. The compiler generates a unique struct for each closure; the
captured variables are its fields. How the closure captures them determines
which of three traits it implements:

| Trait | What the closure does with captures | Can be called |
| --- | --- | --- |
| `FnOnce` | consumes captured values | once |
| `FnMut` | mutates captured values | many times, requires `&mut self` |
| `Fn` | only reads captured values | many times, requires `&self` |

The traits form a hierarchy: every `Fn` is `FnMut`, and every `FnMut` is
`FnOnce`. A function that accepts the weakest trait it needs is the most
flexible.

```rust
fn apply_twice<F: Fn(i32) -> i32>(f: F, value: i32) -> i32 {
    f(f(value))
}

fn make_adder(amount: i32) -> impl Fn(i32) -> i32 {
    move |value| value + amount
}

fn main() {
    let mut total = 0;
    let mut add = |n: i32| total += n; // FnMut: mutates `total`
    add(3);
    add(4);
    println!("{total}");

    let consume = || {
        let owned = String::from("used once");
        drop(owned); // this closure is FnOnce
        "done"
    };
    println!("{}", consume());

    println!("{}", apply_twice(|n| n * 2, 5));
    let add_ten = make_adder(10);
    println!("{}", add_ten(7));

    // Storing closures: box them when the concrete type cannot be named.
    let mut handlers: Vec<Box<dyn Fn(i32) -> i32>> = vec![
        Box::new(|n| n + 1),
        Box::new(|n| n * 2),
    ];
    handlers.push(Box::new(add_ten));
    for handler in &handlers {
        println!("{}", handler(10));
    }
}
```

A `move` closure takes ownership of every captured variable it uses. That is
required when the closure outlives the current stack frame, for example when it
is sent to a thread or stored in a struct. Without `move`, the closure borrows,
and the borrow checker rejects the escape. Closures that capture nothing
coerce to plain function pointers (`fn(i32) -> i32`), which is useful for FFI
and for arrays of callbacks. The [closures chapter](#closures) shows the
generated structs and the `Fn` trait hierarchy at the type level.

## 1.17 Iterators

An **iterator** produces a sequence of values. The core trait has one required
method, `next`, which returns `Option<Self::Item>`; every adapter and consumer
in the standard library is built on it. **Adapters** are lazy: they return a
new iterator and do no work until a **consumer** asks for items.

| Kind | Examples | Effect |
| --- | --- | --- |
| Adapters | `map`, `filter`, `filter_map`, `flat_map`, `take`, `skip`, `take_while`, `zip`, `chain`, `enumerate`, `peekable`, `rev` | build a new iterator, no work yet |
| Consumers | `collect`, `fold`, `sum`, `product`, `count`, `find`, `position`, `any`, `all`, `for_each`, `max_by_key` | drive the iterator, produce a value |

```rust
use std::collections::HashMap;

fn main() {
    let numbers = vec![1, 2, 3, 4, 5, 6];

    let even_squares: Vec<i32> = numbers.iter()
        .filter(|n| *n % 2 == 0)
        .map(|n| n * n)
        .collect();
    println!("{even_squares:?}");

    let total: i32 = numbers.iter().sum();
    let product = numbers.iter().product::<i32>();
    println!("{total} {product}");

    let words = ["the", "quick", "brown", "fox"];
    let lengths: Vec<usize> = words.iter().map(|w| w.len()).collect();
    println!("{lengths:?}");

    // IntoIterator: for loops desugar to this.
    for (index, value) in numbers.iter().enumerate() {
        if index == 3 {
            break;
        }
        print!("{value} ");
    }
    println!();

    // collect can build any FromIterator type, including a HashMap.
    let counts: HashMap<char, usize> = "banana".chars().fold(HashMap::new(), |mut map, ch| {
        *map.entry(ch).or_insert(0) += 1;
        map
    });
    println!("{counts:?}");

    let mut source = vec![1, 2, 3].into_iter();
    println!("{:?} {:?} {:?}", source.next(), source.next(), source.next());
    println!("{:?}", source.next());
}
```

Iterator chains are not slower than loops when the closure is inlined; the
compiler typically produces the same assembly. `iter()` yields references,
`iter_mut()` yields mutable references, and `into_iter()` consumes the
collection and yields owned values; `for x in &collection` uses the first,
`for x in collection` the last. Infinite iterators (`0..`, `std::iter::repeat`)
are safe when a `take` bounds them. `collect::<Result<Vec<_>, _>>()` short-
circuits on the first error, which is a common way to parse a list of records.
Custom iterators implement `next` and, for ergonomics, `size_hint`; the
[iterators chapter](#iterators) builds one from scratch and shows the fused
and exact-size marker traits.

## 1.18 Error handling

Rust distinguishes **recoverable** errors (`Result`) from **bugs**
(`panic!`). A panic unwinds the stack by default, runs destructors and either
aborts or is caught at a task boundary; it is not a substitute for an error
type. A library returns `Result` and lets the caller decide. An application
often uses a single boxed or `anyhow` error at its boundary.

The `?` operator propagates an error, converting it with `From`. In a function
returning `Result<T, E>`, `value?` is roughly `match value { Ok(v) => v, Err(e)
=> return Err(E::from(e)) }`.

```rust
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
enum ConfigError {
    Missing(&'static str),
    BadPort(ParseIntError),
    TooLarge(u16),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::Missing(key) => write!(f, "missing key: {key}"),
            ConfigError::BadPort(source) => write!(f, "invalid port: {source}"),
            ConfigError::TooLarge(port) => write!(f, "port out of range: {port}"),
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ConfigError::BadPort(source) => Some(source),
            _ => None,
        }
    }
}

impl From<ParseIntError> for ConfigError {
    fn from(source: ParseIntError) -> Self {
        ConfigError::BadPort(source)
    }
}

struct Config {
    port: u16,
}

fn parse_port(input: &str) -> Result<u16, ConfigError> {
    if input.is_empty() {
        return Err(ConfigError::Missing("port"));
    }
    let port: u16 = input.trim().parse()?; // ParseIntError -> ConfigError
    if port < 1024 {
        return Err(ConfigError::TooLarge(port));
    }
    Ok(port)
}

fn load(input: &str) -> Result<Config, ConfigError> {
    Ok(Config { port: parse_port(input)? })
}

fn main() {
    println!("{:?}", load("8080").map(|c| c.port));
    println!("{}", load("nope").unwrap_err());
}
```

Two crates reduce the boilerplate. **`thiserror`** generates `Display`,
`Error::source` and `From` implementations from attributes, and is the usual
choice for libraries because callers can match on concrete variants.
**`anyhow`** provides a type-erased `anyhow::Error` with context chains, and is
the usual choice for applications where the caller only logs the error.

```rust
use thiserror::Error;

#[derive(Debug, Error)]
enum StoreError {
    #[error("record {id} not found")]
    NotFound { id: u64 },
    #[error("database failure")]
    Database(#[from] sqlx::Error),
}

fn load(id: u64) -> anyhow::Result<String> {
    anyhow::bail!("record {id} not found")
}

fn with_context() -> anyhow::Result<()> {
    use anyhow::Context;
    let text = std::fs::read_to_string("config.toml").context("reading config.toml")?;
    println!("{text}");
    Ok(())
}
```

Rules of thumb: never return `String` as a library error type; implement
`Display`, `Debug` and `std::error::Error`; preserve the source chain; do not
`unwrap` on input you do not control; do not use `Result` for conditions that
are part of normal control flow (`Option` is the right type). Panics are
acceptable for violated invariants, poisoned locks, and tests. The
[errors chapter](#errors) covers backtraces and `#[track_caller]`; section 4.31
applies these types to HTTP APIs.

## 1.19 Modules, crates, packages and visibility

- A **package** is a `Cargo.toml` plus one or more crates. It has at most one
  library crate (`src/lib.rs`) and any number of binary crates (`src/main.rs`,
  `src/bin/*.rs`).
- A **crate** is a compilation unit and the root of a module tree.
- A **module** organises items inside a crate. `mod api;` looks for
  `api.rs` or `api/mod.rs`.

```text
my-app/
├── Cargo.toml
├── src/
│   ├── main.rs          # binary crate root: mod app; mod config;
│   ├── lib.rs           # library crate root (optional but common)
│   ├── config.rs
│   └── app/
│       ├── mod.rs       # or app.rs with app/handlers.rs
│       └── handlers.rs
└── tests/
    └── integration.rs   # a separate crate that links the library
```

```rust
mod inner {
    pub fn public() {}
    pub(crate) fn crate_only() {}
    pub(super) fn parent_only() {}
    pub(in crate::inner) fn subtree_only() {}
    fn private() {}
}

pub use inner::public; // re-export: shortens the path for callers

fn main() {
    public();
    inner::crate_only();
}
```

The four visibility forms answer "who may name this item": `pub` everyone,
`pub(crate)` the current crate, `pub(super)` the parent module, `pub(in path)`
a specific ancestor module. Items are private by default, and private items are
still visible to descendants, which is how a parent module can expose a
carefully chosen subset through `pub use`. Prefer re-exporting a curated API
from `lib.rs` rather than making every module public: the public surface is a
compatibility promise. A **workspace** is several packages sharing one lock
file and target directory; section 9.1 covers it. The [modules chapter](#modules)
builds the tree by hand and shows the privacy errors.

## 1.20 Collections

| Collection | Shape | Use it for | Lookup |
| --- | --- | --- | --- |
| `Vec<T>` | growable array | ordered sequence, stack, buffer | index `O(1)` |
| `String` | growable UTF-8 buffer | owned text | byte index, not char |
| `HashMap<K, V>` | hash table | keyed lookup without order | average `O(1)` |
| `BTreeMap<K, V>` | balanced tree | keyed lookup in sorted order | `O(log n)` |
| `HashSet<T>` / `BTreeSet<T>` | sets | membership, deduplication | average `O(1)` / `O(log n)` |
| `VecDeque<T>` | ring buffer | queue, double-ended work list | `O(1)` at both ends |
| `BinaryHeap<T>` | max-heap | priority queue, top-k | `O(log n)` push/pop |

```rust
use std::collections::{BTreeMap, BinaryHeap, HashMap, HashSet, VecDeque};

fn main() {
    let mut words = HashMap::new();
    for word in ["red", "blue", "red"] {
        *words.entry(word).or_insert(0) += 1;
    }
    println!("{words:?}");

    let mut sorted = BTreeMap::new();
    for (word, count) in &words {
        sorted.insert(*word, *count);
    }
    println!("{sorted:?}");

    let mut seen = HashSet::new();
    seen.insert("red");
    println!("{}", seen.contains("red"));

    let mut queue = VecDeque::from([1, 2, 3]);
    queue.push_back(4);
    queue.push_front(0);
    println!("{:?}", queue.pop_front());

    let mut heap = BinaryHeap::from([3, 1, 4, 1, 5]);
    println!("{:?}", heap.pop());

    let mut numbers = vec![1, 2, 3];
    numbers.reserve(10); // allocate once, not on every push
    numbers.push(4);
    println!("{} {}", numbers.len(), numbers.capacity());

    // You cannot mutate a map while holding an iterator over it.
    // for (key, value) in &words { words.insert(*key, *value + 1); }
}
```

`HashMap` uses a randomly seeded hasher to make collision attacks harder;
`BTreeMap` is deterministic and supports range queries
(`range("a".."m")`). The **entry API** avoids a double lookup and expresses
"insert if missing" precisely: `entry(key).or_insert(default)`,
`and_modify(...)`, `or_insert_with(closure)`. Indexing a `Vec` panics on an
out-of-bounds index; `get` returns `Option`, and `get_mut` returns
`Option<&mut T>`. `String` is not indexable by integer because UTF-8 characters
have variable width; iterate `chars()` or use `char_indices()`. The
[collections chapter](#collections) measures their layouts and growth
strategies.

## 1.21 Smart pointers

A smart pointer is a struct that owns or borrows a value and implements `Deref`
(often `Drop`). The choice is driven by three questions: who owns the value,
may it be shared, and may it be mutated through a shared handle.

| Type | Ownership | Sharing | Mutation | Thread-safe |
| --- | --- | --- | --- | --- |
| `Box<T>` | single owner, heap | no | through `&mut` | if `T: Send` |
| `Rc<T>` | reference-counted, single thread | yes | no (unless interior mutability) | no |
| `Arc<T>` | atomic reference count | yes | no (unless interior mutability) | yes, if `T: Send + Sync` |
| `Cell<T>` | inline value | no | yes, by copy/replace | no |
| `RefCell<T>` | inline value | no | yes, checked at run time | no |
| `Mutex<T>` | inline value | via `Arc` | yes, blocked | yes |
| `RwLock<T>` | inline value | via `Arc` | many readers or one writer | yes |

```rust
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug)]
struct Node {
    value: i32,
    children: RefCell<Vec<Rc<Node>>>,
}

fn main() {
    let leaf = Rc::new(Node { value: 3, children: RefCell::new(vec![]) });
    let parent = Rc::new(Node {
        value: 1,
        children: RefCell::new(vec![Rc::clone(&leaf)]),
    });

    parent.children.borrow_mut().push(Rc::new(Node { value: 2, children: RefCell::new(vec![]) }));

    println!("strong count of leaf: {}", Rc::strong_count(&leaf));
    for child in parent.children.borrow().iter() {
        println!("{}", child.value);
    }
}
```

`Box<T>` is the cheapest indirection and the right type for recursive enums
(`enum List { Next(Box<List>) }`), large values that should not be copied on
the stack, and trait objects. `Rc<T>` and `Arc<T>` share ownership; `Rc` uses a
non-atomic counter and is faster but cannot cross threads. `RefCell<T>` moves
the borrow check to run time: `borrow()` and `borrow_mut()` panic if the rules
would be violated. `Cell<T>` is for `Copy` values and offers `get`, `set` and
`replace` without borrowing. `Mutex<T>` and `RwLock<T>` are the thread-safe
equivalents; they poison on panic while locked, which `lock().unwrap()`
surfaces. Section 1.27 covers the interior-mutability pattern and section 2.10
covers contention.

## 1.22 `Deref`, `DerefMut` and `Drop`

`Deref` lets a type behave like a reference to another type. It powers **deref
coercion**: a `&String` becomes `&str`, a `&Vec<T>` becomes `&[T]`, and a
`&Box<T>` becomes `&T` at a call site. `DerefMut` does the same for mutable
references. `Drop` runs when a value's owner goes out of scope.

```rust
use std::ops::{Deref, DerefMut};

struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    fn new() -> Self {
        Self { items: Vec::new() }
    }
}

impl<T> Deref for Stack<T> {
    type Target = [T];

    fn deref(&self) -> &Self::Target {
        &self.items
    }
}

impl<T> DerefMut for Stack<T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.items
    }
}

struct Loud(&'static str);

impl Drop for Loud {
    fn drop(&mut self) {
        println!("dropping {}", self.0);
    }
}

fn main() {
    let mut stack = Stack::new();
    stack.push(1);
    stack.push(2);
    println!("{} {}", stack.len(), stack.first().copied().unwrap_or(0));
    stack[0] = 9; // through DerefMut to [T]
    println!("{:?}", &*stack);

    let _outer = Loud("outer");
    let _inner = Loud("inner");
    println!("end of main");
}
```

Local variables drop in reverse declaration order, fields drop in declaration
order, and `Drop::drop` runs before the fields are dropped. A type cannot
implement both `Copy` and `Drop`. `std::mem::forget` skips a destructor and is
safe but leaks; `ManuallyDrop` gives explicit control inside unsafe code.
`Deref` is not a general conversion mechanism: use `AsRef` for "can be viewed
as" without the method-forwarding behaviour, and `From`/`Into` for owned
conversions. Implementing `Deref` for a newtype to inherit a whole API is
discouraged because it becomes part of the public interface.

## 1.23 Casting, coercion and conversion traits

| Form | Direction | Failure | Use |
| --- | --- | --- | --- |
| `as` | numeric or pointer cast, enum to integer | silent truncation or wrap | deliberate bit-level or lossy casts |
| deref coercion | `&String` → `&str`, `&Vec<T>` → `&[T]` | none | at call sites automatically |
| `From` / `Into` | infallible conversion | none | constructors that cannot fail |
| `TryFrom` / `TryInto` | fallible conversion | `Result` | validating ranges and formats |
| `AsRef` / `AsMut` | cheap borrowed view | none | generic APIs over strings/paths/slices |
| `Borrow` | borrowed view with hash/equality consistency | none | map keys looked up by another form |

```rust
use std::convert::{TryFrom, TryInto};
use std::path::Path;

fn read_path<P: AsRef<Path>>(path: P) -> std::io::Result<usize> {
    std::fs::metadata(path).map(|m| m.len() as usize)
}

struct Port(u16);

impl TryFrom<u32> for Port {
    type Error = &'static str;

    fn try_from(value: u32) -> Result<Self, Self::Error> {
        if value <= u16::MAX as u32 {
            Ok(Port(value as u16))
        } else {
            Err("port out of range")
        }
    }
}

fn main() {
    let big = 300_u32;
    let small = 80_u32;
    println!("{:?} {:?}", Port::try_from(big), Port::try_from(small));
    let port: Result<Port, _> = small.try_into();
    println!("{}", port.unwrap().0);

    let value: i8 = 300_i32 as i8; // truncates: -? (implementation-defined bit pattern)
    println!("{value}");
    let taken: u8 = 42_u16.try_into().unwrap();
    println!("{taken}");

    let owned = String::from("Cargo.toml");
    println!("{}", read_path(&owned).is_ok());
    println!("{}", read_path("Cargo.toml").is_ok());
}
```

`From` gives `Into` for free: implement `From<Source> for Target`, never both.
`TryFrom` gives `TryInto` for free. `as` between floats and integers truncates
towards zero and saturates in recent Rust versions for float-to-int casts;
`as` between integer widths truncates. For any conversion where losing data
would be a bug, `try_into()` states that in the type. `AsRef<str>` accepts
`&str`, `String`, `&String` and `Cow<str>`; use it instead of separate
overloads. The [type system chapter](#type-system) discusses coercions and
variance.

## 1.24 Macros

Rust has two macro systems. **Declarative** macros (`macro_rules!`) match
syntax with patterns and expand to code. **Procedural** macros run at compile
time as functions over token streams and come in three kinds: derive,
attribute and function-like.

```rust
macro_rules! pairs {
    ($($key:expr => $value:expr),* $(,)?) => {
        vec![$(($key, $value)),*]
    };
}

macro_rules! make_getters {
    ($($field:ident),+ $(,)?) => {
        $(
            fn $field(&self) -> &str {
                &self.$field
            }
        )+
    };
}

struct User {
    name: String,
    email: String,
}

impl User {
    make_getters!(name, email);
}

fn main() {
    let data = pairs! { "one" => 1, "two" => 2, };
    println!("{data:?}");

    let user = User { name: "Ada".into(), email: "ada@example.com".into() };
    println!("{} {}", user.name(), user.email());
}
```

`$x:expr` matches an expression, `$i:ident` an identifier, `$t:ty` a type,
`$($inner),*` repeats and `$(,)?` allows an optional trailing comma. Macros are
**hygienic** for local variables: an identifier introduced inside the macro
cannot accidentally capture a caller's variable. They are not hygienic for
types, modules or methods. Use a macro when the syntax itself repeats and a
function cannot express it; prefer functions, traits and generics otherwise,
because macro errors are harder to read.

A procedural macro lives in its own crate with `proc-macro = true`:

```rust
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(Hello)]
pub fn hello(input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as DeriveInput);
    let name = item.ident;
    quote! {
        impl #name {
            fn hello(&self) -> String {
                format!("hello from {}", stringify!(#name))
            }
        }
    }
    .into()
}
```

The derive macro above is used as `#[derive(Hello)]`; an attribute macro is
declared `#[proc_macro_attribute]` and receives the item it decorates; a
function-like macro is `#[proc_macro]` and is called as `my_macro!(...)`.
Section 9.3 and section 13.3 build each kind in full, including error spans.
The [macros chapter](#macros) explains token streams and hygiene from the
compiler's side.

## 1.25 The type system: newtype, `PhantomData`, never type and DSTs

The **newtype** pattern wraps an existing type in a single-field tuple struct
to create a distinct type with its own invariants and trait implementations.
It is zero-cost: the wrapper has the same layout as the field.

```rust
use std::marker::PhantomData;

struct UserId(u64);
struct Admin;

struct Session<Role> {
    user: UserId,
    role: PhantomData<Role>, // zero-sized: marks the type parameter as used
}

impl Session<Admin> {
    fn delete_all(&self) -> &'static str {
        "deleted"
    }
}

fn as_user(id: UserId) -> Session<()> {
    Session { user: id, role: PhantomData }
}

fn as_admin(id: UserId) -> Session<Admin> {
    Session { user: id, role: PhantomData }
}

fn never_returns() -> ! {
    loop {
        std::hint::spin_loop();
    }
}

fn print_bytes(bytes: &[u8]) {
    println!("{}", bytes.len());
}

fn main() {
    let session = as_admin(UserId(7));
    println!("{}", session.delete_all());
    let _plain = as_user(UserId(8));

    print_bytes(b"hello");       // &[u8; 5] coerces to &[u8]
    print_bytes(&[1, 2, 3][..]); // explicit slice

    let boxed: Box<dyn std::fmt::Debug> = Box::new(1);
    println!("{boxed:?}");

    let _never: u8 = if false { never_returns() } else { 0 };
}
```

`PhantomData<T>` occupies no space but tells the compiler that the struct
logically owns a `T`, which affects drop-check, auto traits (`Send`, `Sync`)
and variance. `PhantomData<fn() -> T>` makes the type covariant in `T` without
implying ownership; `PhantomData<*const T>` makes it invariant. Choose the
form deliberately.

The **never type** `!` has no values. It appears as the return type of
diverging functions and as the type of `panic!`, `return`, `break` and
`continue`; it coerces to any type, which is why `let x: u8 = if cond { panic!()
} else { 1 };` type-checks.

A **dynamically sized type** (DST) has a size known only at run time: `str`,
`[T]`, `dyn Trait`. DSTs are always used behind a pointer (`&str`, `Box<[T]>`,
`Box<dyn Trait>`), and the pointer becomes a fat pointer carrying the length or
vtable. `Sized` is an implicit bound on every generic parameter; write `T:
?Sized` to accept DSTs behind references. Struct fields must be `Sized` except
for the last field, which may be unsized in an unsafe pattern. The [type-system
chapter](#type-system) and [memory layout](#memory-layout) show the pointer
representations.

## 1.26 Advanced traits: `Send`, `Sync`, `Sized`, `Unpin`, `Copy`, `Clone`, `Default`, `Display`, `Debug`

| Trait | Meaning | Derived? | Notes |
| --- | --- | --- | --- |
| `Send` | value may move to another thread | auto | `Rc<T>` is not `Send`; `Arc<T>` is if `T` is |
| `Sync` | `&T` may be shared between threads | auto | `Cell<T>` is not `Sync`; `Mutex<T>` is |
| `Sized` | size known at compile time | implicit | opt out with `?Sized` |
| `Unpin` | safe to move after pinning | auto | most types are `Unpin`; `!Unpin` is for self-references |
| `Copy` | implicit bitwise duplicate | `#[derive(Copy, Clone)]` | no destructor, all fields `Copy` |
| `Clone` | explicit duplicate | `#[derive(Clone)]` | may allocate or fail |
| `Default` | a sensible zero-ish value | `#[derive(Default)]` | `Option`, `Vec`, numbers implement it |
| `Display` | user-facing formatting | manual | `{}`; no `Debug` requirement |
| `Debug` | developer formatting | `#[derive(Debug)]` | `{:?}` and `{:#?}` |

```rust
use std::fmt;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, PartialOrd, Ord)]
struct Version {
    major: u16,
    minor: u16,
}

impl fmt::Display for Version {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}", self.major, self.minor)
    }
}

fn main() {
    let version = Version { major: 1, minor: 82 };
    println!("{version} {version:?} {}", Version::default());
    println!("{}", version == version.clone());
}
```

`Send` and `Sync` are **auto traits**: the compiler implements them
structurally, and an `unsafe impl` is a promise that a manual implementation
respects the invariant. They are covered in context in section 2.14. `Unpin`
matters only to `Pin`; `!Unpin` types are typically generated by `async`
blocks. `Display` and `Debug` are separate because a user-facing message and a
developer diagnosis have different audiences; a type can implement both.
`Default` is not a substitute for validation: a default `Port(0)` may be
invalid, in which case a private constructor is better.

## 1.27 The interior mutability pattern

**Interior mutability** lets a value be mutated through a shared reference.
The type enforces the borrowing rules at run time, or uses atomics, instead of
at compile time. It is how a `Rc<RefCell<T>>` graph, a cache behind `&self`, or
a `Mutex<T>` shared across threads works.

```rust
use std::cell::RefCell;
use std::rc::Rc;

trait Messenger {
    fn send(&self, message: &str);
}

struct Log {
    lines: RefCell<Vec<String>>,
}

impl Messenger for Log {
    fn send(&self, message: &str) {
        self.lines.borrow_mut().push(message.to_string());
    }
}

fn main() {
    let log = Rc::new(Log { lines: RefCell::new(Vec::new()) });
    let first = Rc::clone(&log);
    let second = Rc::clone(&log);

    first.send("hello");
    second.send("world");

    let lines = log.lines.borrow();
    println!("{}", lines.join(" "));
    drop(lines);

    // Runtime borrow checking:
    let a = log.lines.borrow();
    // let b = log.lines.borrow_mut(); // panics: already borrowed
    println!("{}", a.len());
}
```

The cost is that violations become panics rather than compile errors, and the
compiler cannot prove the absence of aliasing for optimisation. Keep the
`RefCell` borrow scoped as narrowly as possible, and never hold a `Ref` across
a call that might borrow again. For threads, replace `Rc<RefCell<T>>` with
`Arc<Mutex<T>>`; the API shape is the same, but the failure mode is blocking
(and poisoning) rather than panicking on a double borrow. Atomics are the third
option for primitive counters and flags; section 2.11 covers memory ordering.

## 1.28 The builder and typestate patterns

The **builder** replaces a constructor with many optional parameters. Each
method takes `self` by value, sets one field and returns `Self`, so calls chain;
`build()` validates and constructs the final value. Because the intermediate
builder owns its fields, it can move them without cloning.

```rust
#[derive(Debug)]
struct Request {
    url: String,
    method: String,
    timeout_ms: u64,
    retries: u32,
}

#[derive(Default)]
struct RequestBuilder {
    url: Option<String>,
    method: Option<String>,
    timeout_ms: Option<u64>,
    retries: Option<u32>,
}

impl RequestBuilder {
    fn new() -> Self {
        Self::default()
    }

    fn url(mut self, url: impl Into<String>) -> Self {
        self.url = Some(url.into());
        self
    }

    fn method(mut self, method: impl Into<String>) -> Self {
        self.method = Some(method.into());
        self
    }

    fn timeout(mut self, milliseconds: u64) -> Self {
        self.timeout_ms = Some(milliseconds);
        self
    }

    fn retries(mut self, retries: u32) -> Self {
        self.retries = Some(retries);
        self
    }

    fn build(self) -> Result<Request, &'static str> {
        Ok(Request {
            url: self.url.ok_or("url is required")?,
            method: self.method.unwrap_or_else(|| "GET".to_string()),
            timeout_ms: self.timeout_ms.unwrap_or(30_000),
            retries: self.retries.unwrap_or(1),
        })
    }
}
```

The **typestate** pattern goes further: the type parameter records the state,
so invalid transitions do not type-check. This turns a run-time protocol into a
compile-time proof.

```rust
use std::marker::PhantomData;

struct Draft;
struct Published;

struct Document<State> {
    title: String,
    state: PhantomData<State>,
}

impl Draft {
    fn new(title: impl Into<String>) -> Document<Draft> {
        Document { title: title.into(), state: PhantomData }
    }
}

impl Document<Draft> {
    fn publish(self) -> Document<Published> {
        Document { title: self.title, state: PhantomData }
    }

    fn title(&self) -> &str {
        &self.title
    }
}

impl Document<Published> {
    fn url(&self) -> String {
        format!("/posts/{}", self.title.to_lowercase().replace(' ', "-"))
    }
}

fn main() {
    let draft = Draft::new("Rust Patterns");
    println!("{}", draft.title());
    let published = draft.publish();
    println!("{}", published.url());
    // published.url() is the only operation available; there is no unpublish.
}
```

Use a builder when the set of options is open and validation is data-dependent.
Use typestate when the *order* of operations is part of the contract (protocol
handshakes, database transactions, state machines). Typestate methods that
consume and return `Self` make the old state unusable, which is exactly the
guarantee you want. The cost is more types and less familiar error messages;
provide a runtime-checked constructor for dynamic input.

## 1.29 Zero-cost abstractions and monomorphisation

Rust's claim is that abstractions cost nothing *you did not ask for*. Iterators,
closures, generics and `Option` compile to code comparable to the hand-written
loop. The mechanism is **monomorphisation**: for each concrete type used with a
generic function, the compiler emits a specialised copy and inlines through it.

```rust
#[inline]
fn sum_even(values: &[i32]) -> i32 {
    values.iter().copied().filter(|n| n % 2 == 0).sum()
}

fn main() {
    let values = [1, 2, 3, 4, 5, 6];
    println!("{}", sum_even(&values));

    let mut total = 0;
    for value in &values {
        if value % 2 == 0 {
            total += value;
        }
    }
    println!("{total}");
}
```

Both `main` bodies typically compile to the same machine code; the iterator
version is not a loop of virtual calls. The costs that do remain are explicit:
`Box<dyn Trait>` adds a vtable lookup and prevents inlining across the
boundary; a very large generic function instantiated for many types increases
binary size and compile time; `#[inline]` is a hint, and cross-crate inlining
depends on generic code being available or on link-time optimisation. Measure
before changing a clear abstraction: section 9.18 and the [performance
chapter](#performance) show `cargo asm`, `perf` and criterion. A useful rule is
to keep hot paths generic or static and use `dyn` at architectural boundaries
where the set of implementations is open.

## 1.30 Const evaluation, `const fn` and const blocks

`const` declares a compile-time value; `static` declares a single global with a
fixed address. `const fn` can run at compile time in a const context, and const
generics let values participate in types. `const { ... }` evaluates a block in
a const context inline.

```rust
const LIMIT: usize = 4;
static GREETING: &str = "hello"; // requires Sync

const fn square(n: u32) -> u32 {
    n * n
}

const LIMITS: [u32; LIMIT] = [square(1), square(2), square(3), square(4)];

struct Buffer<const N: usize> {
    bytes: [u8; N],
}

impl<const N: usize> Buffer<N> {
    const fn new() -> Self {
        Self { bytes: [0; N] }
    }

    fn len(&self) -> usize {
        N
    }
}

// Compile-time assertion: fails the build, not a test run.
const _: () = assert!(LIMIT == 4);

fn main() {
    println!("{LIMIT} {GREETING} {LIMITS:?}");
    let buffer = Buffer::<8>::new();
    println!("{}", buffer.len());

    const INLINE: usize = const { square(5) as usize };
    println!("{INLINE} {}", const { 2 + 2 });
}
```

A `const` is inlined at each use and has no address guarantee; a `static` has
one address for the whole program and must be `Sync` unless accessed through
unsafe. `const fn` supports conditionals, loops and mutation of local variables
in stable Rust, but not heap allocation, floating-point operations that are not
const-stable, or trait methods (unless const traits are in use). A `const`
block can appear in an expression position and is useful for initialising a
`static` that needs computation. Compile-time assertions via `const _: () =
assert!(...)` and the `static_assertions` crate catch size and trait
assumptions without a test harness. The [cargo chapter](#cargo) covers
`build.rs` for code generation that const evaluation cannot express, and
section 3.3 applies const generics to fixed-size buffers.

## Exercises

:::exercise guided Repair the borrowing
This program does not compile. It tries to keep a reference to the longest
string while also mutating the collection that owns it. Rewrite it so that it
compiles without cloning the strings and without changing the output.

```rust
fn longest(items: &[String]) -> &String {
    let mut best = &items[0];
    for item in items {
        if item.len() > best.len() {
            best = item;
        }
    }
    best
}

fn main() {
    let mut names = vec![String::from("Ada"), String::from("Grace")];
    let best = longest(&names);
    names.push(String::from("Alan"));
    println!("{best}");
}
```
::hint
The borrow of `names` used by `best` lasts until `best` is last used, which is
after the `push`. Either print before mutating, or end the borrow by converting
the result into something owned. The exercise asks for no clone and no output
change, so move the `println!` before the `push`. Also note that `longest`
should return `&str` rather than `&String`; both changes are acceptable if the
output is identical.
::solution
```rust
fn longest(items: &[String]) -> &str {
    let mut best: &str = &items[0];
    for item in items {
        if item.len() > best.len() {
            best = item;
        }
    }
    best
}

fn main() {
    let mut names = vec![String::from("Ada"), String::from("Grace")];
    let best = longest(&names);
    println!("{best}");
    names.push(String::from("Alan"));
}
```

The borrow checker sees the conflict only while `best` is live. Printing before
the `push` ends the borrow, so the mutation is legal. Returning `&str` is the
better signature because it does not promise that the caller receives the
`String` itself, and it accepts slices from other string types.
:::

:::exercise practice Word frequencies
Read a string, count how many times each word occurs, and print the words in
alphabetical order as `word count`. Use a `HashMap` for counting and a
`BTreeMap` for the ordered output. Ignore punctuation by keeping only
alphanumeric characters, and compare case-insensitively.
::hint
`text.split_whitespace()` gives words, but punctuation stays attached.
`chars().filter(|c| c.is_alphanumeric()).collect::<String>()` cleans a word.
Lowercase it, then use `map.entry(word).or_insert(0)`. Moving the entries into
a `BTreeMap` sorts them by key.
::solution
```rust
use std::collections::{BTreeMap, HashMap};

fn main() {
    let text = "Rust is fast. Rust is safe; Rust is fun!";
    let mut counts: HashMap<String, usize> = HashMap::new();

    for raw in text.split_whitespace() {
        let word: String = raw
            .chars()
            .filter(|ch| ch.is_alphanumeric())
            .collect::<String>()
            .to_lowercase();
        if !word.is_empty() {
            *counts.entry(word).or_insert(0) += 1;
        }
    }

    let sorted: BTreeMap<_, _> = counts.into_iter().collect();
    for (word, count) in sorted {
        println!("{word} {count}");
    }
}
```
:::

:::exercise challenge A small expression evaluator
Implement an expression evaluator with this AST:

```rust
enum Expr {
    Number(f64),
    Add(Box<Expr>, Box<Expr>),
    Multiply(Box<Expr>, Box<Expr>),
    Negate(Box<Expr>),
}
```

Add a `fn eval(&self) -> f64` using pattern matching, a `fn variables(&self) ->
Vec<&'static str>` placeholder that returns an empty vector, and a `Display`
implementation that prints fully parenthesised expressions. Then add a second
implementation using a trait object for a `BinaryOp` trait and compare the two
designs in a comment.
::hint
Recursion on `Box<Expr>` is natural: `eval` calls itself on each boxed child.
For `Display`, use `write!(f, "({left} + {right})", ...)` after matching. The
trait-object version stores `Box<dyn BinaryOp>` with an `apply(f64, f64) -> f64`
method. The enum is closed and easier to exhaustively match; the trait object is
open to new operations but mixes poorly with the recursive data type unless the
operands are also trait objects.
::solution
```rust
use std::fmt;

#[derive(Debug)]
enum Expr {
    Number(f64),
    Add(Box<Expr>, Box<Expr>),
    Multiply(Box<Expr>, Box<Expr>),
    Negate(Box<Expr>),
}

impl Expr {
    fn eval(&self) -> f64 {
        match self {
            Expr::Number(n) => *n,
            Expr::Add(left, right) => left.eval() + right.eval(),
            Expr::Multiply(left, right) => left.eval() * right.eval(),
            Expr::Negate(inner) => -inner.eval(),
        }
    }
}

impl fmt::Display for Expr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Expr::Number(n) => write!(f, "{n}"),
            Expr::Add(left, right) => write!(f, "({left} + {right})"),
            Expr::Multiply(left, right) => write!(f, "({left} * {right})"),
            Expr::Negate(inner) => write!(f, "(-{inner})"),
        }
    }
}

fn main() {
    let expression = Expr::Add(
        Box::new(Expr::Number(2.0)),
        Box::new(Expr::Multiply(
            Box::new(Expr::Number(3.0)),
            Box::new(Expr::Negate(Box::new(Expr::Number(4.0)))),
        )),
    );
    println!("{expression} = {}", expression.eval());
}
```
:::

## Quiz

:::quiz Core language check
? What is the difference between `let mut x` and shadowing `let x`?
- They are identical; `mut` is only style
+ `mut` allows assigning a new value to the same binding; shadowing creates a new binding that may have a different type
- Shadowing mutates the old binding in place
- `mut` creates a new scope, shadowing does not
= A shadowed binding is a new variable; the old value is dropped at the shadowing point. `mut` keeps one binding and one type and permits assignment.

? Which statement about references is correct?
- Many `&mut T` and one `&T` may coexist
+ Many `&T` may coexist, or exactly one `&mut T`, but never both at the same time
- References are checked only in `unsafe` code
- A `&T` always owns the value it points to
= The core aliasing rule is "shared XOR mutable". Non-lexical lifetimes decide when a borrow ends, not the end of the block.

? Given `fn first<'a>(items: &'a [String]) -> &'a str`, what does the lifetime annotation promise?
- The returned reference lives forever
+ The returned reference is valid for at most the lifetime of `items`
- The function allocates a new string
- The slice is moved into the function
= A lifetime annotation links the validity of the output to the input. `'static` would be the promise of living for the whole program.

? When is `dyn Trait` a better choice than a generic bound?
- When every call must be inlined
- When the concrete type set is closed and small
+ When a collection must hold different concrete types or the set of implementations is open
- When the trait has generic methods
= Dynamic dispatch trades an indirect call for one code path and heterogeneous values. A trait with generic methods is not object-safe and cannot be used as `dyn Trait` without adjustment.

? What does `?` do in a function returning `Result<T, E>`?
- Panics with the error
+ Returns early with the error, converting it through `From` if necessary
- Ignores the error and continues
- Converts the error to a string
= `?` is sugar for matching `Ok` and returning `Err(E::from(e))`. It requires the function's error type to implement `From` for the error being propagated.
:::

:::recap
- Immutable bindings are the default; `mut` permits assignment, shadowing creates a new binding and may change the type.
- Scalars are fixed-width; overflow is a panic in debug and a wrap in release unless you choose `checked_*` or `saturating_*`.
- Tuples group different types, arrays have a compile-time length, and slices are borrowed views with a length.
- Functions return their last expression; `!` marks diverging expressions and coerces to every type.
- Ownership gives each value one owner; `Copy` duplicates bits, `clone` copies explicitly, and moves invalidate the source.
- Borrowing permits many readers or one writer, never both; lifetimes express how long a borrow may be used.
- Structs and enums model products and sums; `Option` and `Result` are ordinary enums with methods that replace null and exceptions.
- `match` is exhaustive; `if let`, `while let` and `let ... else` handle one pattern at a time.
- Traits define capabilities, generics choose them at compile time, and `dyn Trait` chooses at run time.
- Associated types fix one type per implementation; GATs add parameters to that choice, enabling lending abstractions.
- Closures implement `Fn`, `FnMut` or `FnOnce`; adapters are lazy until a consumer drives them.
- `?` propagates and converts errors; `thiserror` fits libraries and `anyhow` fits applications.
- Modules, visibility and packages control the public surface; collections trade order, lookup cost and allocation.
- Smart pointers encode ownership and sharing; `Deref`, `Drop` and the conversion traits connect them to ordinary syntax.
- Macros, the newtype and typestate patterns, monomorphisation and const evaluation are the tools for zero-cost, expressive APIs.
:::
