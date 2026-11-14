@id type-system
@part p6
@title The type system as a design tool
@short Type system
@level advanced
@time 55
@learn Convert between types safely with `From`, `TryFrom`, `FromStr` and `AsRef` | Use newtypes and type aliases to make code clearer and safer | Explain the never type, zero-sized types and dynamically sized types | Encode rules in types so that wrong programs do not compile (the typestate pattern) | Apply "parse, don't validate" and "make invalid states unrepresentable"

So far you have used types to describe data. Experienced Rust programmers use them for something more: to make mistakes **impossible to write**. The compiler checks types on every build, for every line, at no cost when the program runs. Every rule you can express as a type is a rule that never needs a test and can never be forgotten.

This chapter first completes the picture of conversions between types, then presents the less obvious types of the language, and ends with the design techniques that tie them together.

:::analogy A form that must be stamped in order
An airport check-in form has boxes: luggage paid, seat chosen, boarding pass issued. You cannot have the last box stamped first, because the form is not yet the right shape. The typestate pattern later in this chapter does that with types: each stamp is a new type, and the compiler refuses any step taken out of order.
:::

## Converting between types

### `as`: quick and quiet

`as` converts between number types (and a few others). It always succeeds, and that is the problem with it: when the value does not fit, it silently produces a different value.

```rust run
fn main() {
    println!("{}", 300_i32 as u8);        // 44: the upper bits are cut off
    println!("{}", -1_i32 as u32);        // 4294967295: the bits are reinterpreted
    println!("{}", 3.99_f64 as i32);      // 3: the fraction is dropped
    println!("{}", 1e20_f64 as i32);      // 2147483647: stops at the largest value
    println!("{}", f64::NAN as i32);      // 0
    println!("{}", 'A' as u32);           // 65: the code of the character
    println!("{}", 97_u8 as char);        // a
}
```
```output
44
4294967295
3
2147483647
0
65
a
```

Use `as` when losing information is intended or cannot happen: a small integer type to a bigger one, or an integer to a float for a division. For everything else there are conversions that cannot lose data, and conversions that report failure.

### `From` and `Into`: conversions that cannot fail

`From` is implemented only where the conversion always works and loses nothing:

```rust run
fn main() {
    let wide: i64 = i64::from(42_i32);            // every i32 fits into an i64
    let float: f64 = f64::from(7_u32);            // every u32 has an exact f64
    let code: u32 = u32::from('é');
    let text: String = String::from("hello");
    let boxed: Box<str> = Box::from("hello");
    let list: Vec<u8> = Vec::from([1, 2, 3]);

    let also_wide: i64 = 42_i32.into();           // `into` is `from`, seen from the other side

    println!("{wide} {float} {code} {text} {boxed} {:?} {also_wide}", list);
}
```
```output
42 7 233 hello hello [1, 2, 3] 42
```

There is no `i32::from(some_i64)` and no `f32::from(some_f64)`. Those conversions could lose data, so the standard library does not offer them through `From`. The absence is the safety feature.

### `TryFrom` and `TryInto`: conversions that may fail

When a conversion works only for some values, it returns a `Result`:

```rust run
fn main() {
    let fits: Result<u8, _> = u8::try_from(200_i32);
    let too_big: Result<u8, _> = u8::try_from(300_i32);
    let negative: Result<u32, _> = u32::try_from(-1_i64);
    let letter: Result<char, _> = char::try_from(0x1F980_u32);

    println!("{:?} {} {} {:?}", fits, too_big.is_err(), negative.is_err(), letter);

    let index: i64 = 3;
    let position: usize = index.try_into().expect("the index must not be negative");
    println!("{}", ["a", "b", "c", "d"][position]);
}
```
```output
Ok(200) true true Ok('🦀')
d
```

This is the "safer conversion" promised in [chapter 4](#types). Wherever a number crosses from one integer type to another and might not fit, prefer `try_from` to `as`.

Implement `TryFrom` for your own types when construction can fail. It is the conventional home for validation:

```rust run
#[derive(Debug, Clone, Copy, PartialEq)]
struct Percent(u8);

impl TryFrom<i32> for Percent {
    type Error = String;

    fn try_from(value: i32) -> Result<Self, Self::Error> {
        if (0..=100).contains(&value) {
            Ok(Percent(value as u8))
        } else {
            Err(format!("{value} is not between 0 and 100"))
        }
    }
}

fn main() {
    println!("{:?}", Percent::try_from(85));
    println!("{:?}", Percent::try_from(140));
    let p: Result<Percent, _> = 50.try_into();
    println!("{:?}", p);
}
```
```output
Ok(Percent(85))
Err("140 is not between 0 and 100")
Ok(Percent(50))
```

### `FromStr`: from text

`"42".parse::<i32>()` works through the trait `FromStr`. Implement it, and your type can be parsed in the same way:

```rust run
use std::str::FromStr;

#[derive(Debug, PartialEq)]
struct Rgb {
    r: u8,
    g: u8,
    b: u8,
}

impl FromStr for Rgb {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let hex = text.strip_prefix('#').ok_or("a colour must start with #")?;
        if hex.len() != 6 || !hex.is_ascii() {
            return Err(String::from("a colour needs exactly 6 hex digits"));
        }
        let part = |range: std::ops::Range<usize>| {
            u8::from_str_radix(&hex[range], 16).map_err(|e| e.to_string())
        };
        Ok(Rgb { r: part(0..2)?, g: part(2..4)?, b: part(4..6)? })
    }
}

fn main() {
    let orange: Rgb = "#ff8800".parse().unwrap();
    println!("{:?}", orange);
    println!("{:?}", "ff8800".parse::<Rgb>());
    println!("{:?}", "#ff88zz".parse::<Rgb>());
}
```
```output
Rgb { r: 255, g: 136, b: 0 }
Err("a colour must start with #")
Err("invalid digit found in string")
```

`strip_prefix` returns the rest of the text if it starts with the given character, as an `Option`. `u8::from_str_radix(text, 16)` reads a number in base 16. The small closure `part` avoids writing the same conversion three times.

### `AsRef`: accept many types cheaply

A function that only needs to *look at* some text can accept "anything that can be seen as a `&str`":

```rust run
use std::path::Path;

fn shout<S: AsRef<str>>(text: S) -> String {
    text.as_ref().to_uppercase()
}

fn extension<P: AsRef<Path>>(path: P) -> Option<String> {
    path.as_ref().extension().map(|e| e.to_string_lossy().into_owned())
}

fn main() {
    println!("{} {}", shout("literal"), shout(String::from("owned")));
    println!("{:?} {:?}", extension("notes.txt"), extension(String::from("archive.tar.gz")));
}
```
```output
LITERAL OWNED
Some("txt") Some("gz")
```

`AsRef<Path>` is the reason the functions in `std::fs` take `&str`, `String`, `Path` and `PathBuf` alike.

| I have … and want … | Use |
|---|---|
| a number, in a bigger number type | `i64::from(x)` or `x.into()` |
| a number, in a type where it might not fit | `u8::try_from(x)` |
| a number, and I accept cutting it off | `x as u8` |
| text, and want a value | `text.parse::<T>()` (`FromStr`) |
| a value, and want text | `value.to_string()` (`Display`) |
| my type from another type, always possible | `impl From<Other> for Mine` |
| my type from another type, with a check | `impl TryFrom<Other> for Mine` |
| a parameter that accepts several text or path types | `impl AsRef<str>`, `impl AsRef<Path>` |

## Newtypes: different meanings, different types

A function with the signature `fn transfer(from: u64, to: u64, amount: u64)` takes three numbers of the same type. Nothing stops a caller from passing them in the wrong order. The mistake compiles, and moves the wrong amount from the wrong account.

Wrap each meaning in its own type:

```rust fail E0308
#[derive(Debug, Clone, Copy, PartialEq)]
struct AccountId(u64);

#[derive(Debug, Clone, Copy, PartialEq)]
struct Cents(u64);

fn transfer(from: AccountId, to: AccountId, amount: Cents) {
    println!("moving {amount:?} from {from:?} to {to:?}");
}

fn main() {
    let alice = AccountId(1001);
    let bob = AccountId(1002);
    let amount = Cents(5000);

    transfer(amount, alice, bob);
}
```
```error auto
```

The mix-up is now a compile error. A newtype costs nothing at run time. In memory, an `AccountId` *is* a `u64`.

Look closely at the fix the compiler proposes: `transfer(bob, alice, amount)`. The types fit now, but the money would flow from Bob to Alice, which is not what was meant. `from` and `to` have the same type, so the compiler cannot tell them apart. Types catch exactly the mistakes that you have taught them to catch. (Two different types, `Sender` and `Receiver`, would catch this one too.)

Newtypes do three jobs:

1. **Keep apart values with different meanings** (ids, units of measurement, kinds of text).
2. **Guarantee a property**: with a private field and a checking constructor, as in the `Celsius` exercise of [chapter 17](#modules).
3. **Allow trait implementations** for foreign types ([chapter 28](#advanced-traits)).

:::note A famous unit mix-up
In 1999, NASA lost the Mars Climate Orbiter, a spacecraft worth more than 300 million dollars. One piece of software produced a force in pound-seconds, and another expected newton-seconds. Both were plain numbers. With one type per unit, such a program does not compile.
:::

## Type aliases: a second name

`type` gives an existing type an additional name. It does **not** create a new type:

```rust run
use std::collections::HashMap;

type Kilometres = f64;
type Inventory = HashMap<String, Vec<(u32, f64)>>;
type Result<T> = std::result::Result<T, String>;

fn distance() -> Kilometres {
    12.5
}

fn check(amount: i32) -> Result<i32> {
    if amount >= 0 { Ok(amount) } else { Err(String::from("negative")) }
}

fn main() {
    let plain: f64 = distance();              // works: Kilometres *is* f64
    let stock: Inventory = HashMap::new();
    println!("{plain} {} {:?} {:?}", stock.len(), check(5), check(-5));
}
```
```output
12.5 0 Ok(5) Err("negative")
```

Aliases shorten long types, and that is all. Since `Kilometres` and `f64` are the same type, the compiler will not notice if you pass miles. For protection, use a newtype. The alias `Result<T>` with a fixed error type is a common convention: `std::io::Result<T>` and `anyhow::Result<T>` are aliases of this kind.

## The types at the edges

### The unit type `()`

`()` is a type with exactly one value, also written `()`. It carries no information. It is what a function returns when it has nothing to return, and it is the `Ok` type in `Result<(), Error>`: "it worked, and there is nothing more to say".

### The never type `!`

Some expressions never produce a value at all, because control never comes back from them: `panic!()`, `return`, `break`, `continue`, an endless `loop`, and `std::process::exit()`. Their type is `!`, the **never type**. It can stand in for any type, which is why this compiles:

```rust run
fn parse_or_quit(text: &str) -> u32 {
    match text.parse() {
        Ok(n) => n,                                   // type u32
        Err(_) => panic!("'{text}' is not a number"), // type ! fits anywhere
    }
}

fn forever() -> ! {
    loop {
        std::thread::sleep(std::time::Duration::from_secs(3600));
    }
}

fn main() {
    println!("{}", parse_or_quit("7"));
    let _never_called: fn() -> ! = forever;
}
```
```output
7
```

Both arms of a `match` must have the same type. One arm is a `u32`, and the other never finishes, so there is no conflict. You have relied on this in every `let … else { return; }` and every `Err(_) => continue`.

### Zero-sized types

A struct without fields takes up no memory at all. So does `()`, and so does an array of length zero.

```rust run
# #![allow(dead_code)]
use std::mem::size_of;

struct Marker;
struct Metres(f64);

fn main() {
    println!("{} {} {}", size_of::<()>(), size_of::<Marker>(), size_of::<[u64; 0]>());
    println!("{} {}", size_of::<f64>(), size_of::<Metres>());
    println!("{} {}", size_of::<&u8>(), size_of::<Option<&u8>>());
}
```
```output
0 0 0
8 8
8 8
```

The second line confirms that a newtype is free. The third shows a neat optimisation: an `Option<&T>` is no bigger than a `&T`. A reference can never be zero, so Rust uses the address zero to mean `None`.

Zero-sized types are useful as **markers**: types that exist only to tell things apart at compile time. They are the basis of the typestate pattern below.

### Dynamically sized types

`str`, `[T]` and `dyn Trait` have no size known at compile time. They always live behind a pointer, and that pointer is twice the usual size. It is called a **fat pointer**: it carries the address, plus the length (for `str` and slices) or the address of the method table (for `dyn Trait`).

```rust run
use std::mem::size_of;

fn main() {
    println!("{}", size_of::<&u8>());                     // address
    println!("{}", size_of::<&str>());                    // address + length
    println!("{}", size_of::<&[u8]>());                   // address + length
    println!("{}", size_of::<&dyn std::fmt::Debug>());    // address + method table
    println!("{}", size_of::<String>());                  // address + length + capacity
}
```
```output
8
16
16
16
24
```

(These are the sizes on a 64-bit computer.)

## `PhantomData`: a type parameter with no data

Sometimes a struct should have a type parameter that appears in none of its fields. The compiler rejects unused parameters. The zero-sized type `PhantomData<T>` says "treat this struct as if it held a `T`":

```rust run
use std::marker::PhantomData;
use std::ops::Add;

#[derive(Debug, Clone, Copy)]
struct Metres;
#[derive(Debug, Clone, Copy)]
struct Feet;

#[derive(Debug, Clone, Copy)]
struct Length<Unit> {
    value: f64,
    unit: PhantomData<Unit>,
}

impl<Unit> Length<Unit> {
    fn new(value: f64) -> Self {
        Length { value, unit: PhantomData }
    }
}

// lengths can be added only if they have the same unit
impl<Unit> Add for Length<Unit> {
    type Output = Length<Unit>;

    fn add(self, other: Self) -> Self {
        Length::new(self.value + other.value)
    }
}

impl Length<Feet> {
    fn to_metres(self) -> Length<Metres> {
        Length::new(self.value * 0.3048)
    }
}

fn main() {
    let a: Length<Metres> = Length::new(100.0);
    let b: Length<Feet> = Length::new(328.0);

    // let wrong = a + b;        // does not compile: mismatched types
    let total = a + b.to_metres();
    println!("{:.1} m, {} bytes", total.value, std::mem::size_of::<Length<Metres>>());
}
```
```output
200.0 m, 8 bytes
```

`Length<Metres>` and `Length<Feet>` are different types that share all their code. Adding them is a compile error. The unit exists only for the compiler: the struct is 8 bytes, the size of its one `f64`.

## The typestate pattern

Many objects have a life story with rules: a file must be opened before it is read, a letter must be written before it is sent, an order must be paid before it is shipped. Usually such rules are checked at run time, with a state field and error returns. The **typestate pattern** puts the state into the *type*, so that calling an operation in the wrong state does not compile.

```rust run
struct Draft {
    text: String,
}

struct Reviewed {
    text: String,
    reviewer: String,
}

struct Published {
    text: String,
    reviewer: String,
}

impl Draft {
    fn new() -> Self {
        Draft { text: String::new() }
    }

    fn write(mut self, more: &str) -> Draft {
        self.text.push_str(more);
        self
    }

    fn review(self, reviewer: &str) -> Reviewed {
        Reviewed { text: self.text, reviewer: reviewer.to_string() }
    }
}

impl Reviewed {
    fn publish(self) -> Published {
        Published { text: self.text, reviewer: self.reviewer }
    }

    fn reject(self) -> Draft {
        Draft { text: self.text }
    }
}

impl Published {
    fn show(&self) -> String {
        format!("{} (reviewed by {})", self.text, self.reviewer)
    }
}

fn main() {
    let article = Draft::new()
        .write("Rust is fun.")
        .review("Lena")
        .reject()
        .write(" Really.")
        .review("Lena")
        .publish();

    println!("{}", article.show());
}
```
```output
Rust is fun. Really. (reviewed by Lena)
```

Each state is its own type, with only the methods that make sense in that state. A `Draft` has no `publish` method, so an article cannot be published without a review. A `Published` has no `write` method. Every transition takes `self` **by value**: the old state is consumed, and ownership makes sure nobody keeps using it.

```rust fail E0599
struct Draft { text: String }
struct Published { text: String }

impl Draft {
    fn review(self) -> Published {
        Published { text: self.text }
    }
}

fn main() {
    let draft = Draft { text: String::from("unchecked") };
    let article = draft.publish();
}
```
```error auto
```

There is no state field, no run-time check, and no error to handle for "wrong state". Such mistakes cannot be expressed. Typestates are used in real libraries: builders that refuse to build until all required parts are set, network connections that must complete a handshake before data can be sent, and hardware pins in embedded programming that are configured as either input or output.

:::tip When it is worth it
Typestates shine when the states and transitions are few and fixed, and a mistake would be costly. If the state is only known at run time (loaded from a file, chosen by a user), an enum with a `match` is the simpler tool.
:::

## Two design principles

### Make invalid states unrepresentable

Look at this struct for a network connection:

```rust
struct Connection {
    is_connected: bool,
    is_connecting: bool,
    address: Option<String>,
    session_id: Option<u64>,
    error: Option<String>,
}
```

Five fields allow many combinations that mean nothing. Connected *and* connecting? Connected without a session id? An error together with a session? Every function that receives a `Connection` must cope with them or hope they do not occur. Now the same information as an enum:

```rust run
#[derive(Debug)]
enum Connection {
    Disconnected,
    Connecting { address: String },
    Connected { address: String, session_id: u64 },
    Failed { address: String, error: String },
}

fn describe(connection: &Connection) -> String {
    match connection {
        Connection::Disconnected => String::from("offline"),
        Connection::Connecting { address } => format!("connecting to {address}"),
        Connection::Connected { address, session_id } => format!("online at {address} (session {session_id})"),
        Connection::Failed { address, error } => format!("{address} failed: {error}"),
    }
}

fn main() {
    let states = [
        Connection::Disconnected,
        Connection::Connecting { address: String::from("10.0.0.5") },
        Connection::Connected { address: String::from("10.0.0.5"), session_id: 77 },
        Connection::Failed { address: String::from("10.0.0.5"), error: String::from("timed out") },
    ];
    for state in &states {
        println!("{}", describe(state));
    }
}
```
```output
offline
connecting to 10.0.0.5
online at 10.0.0.5 (session 77)
10.0.0.5 failed: timed out
```

Exactly four situations exist, and each carries precisely the data that belongs to it. A session id can only exist in the `Connected` state. The meaningless combinations are gone, because there is no way to write them down.

Signs that a type allows invalid states: several `bool` fields, `Option` fields that are "only set when …", and comments such as "must not be empty" or "only valid if `kind` is 2".

### Parse, don't validate

A **validating** function checks its input and returns `bool` or `Result<(), Error>`. The knowledge "this was checked" is then lost, and the same string travels on, looking like any other string. Every function further down must trust that someone checked, or check again.

A **parsing** function checks its input and returns a *new type* that can only exist if the check passed:

```rust run
#[derive(Debug, Clone, PartialEq)]
struct Email(String);

impl Email {
    fn parse(text: &str) -> Result<Email, String> {
        let text = text.trim();
        match text.split_once('@') {
            Some((name, domain)) if !name.is_empty() && domain.contains('.') => {
                Ok(Email(text.to_lowercase()))
            }
            _ => Err(format!("'{text}' is not an e-mail address")),
        }
    }

    fn as_str(&self) -> &str {
        &self.0
    }
}

// This function cannot receive an unchecked address
fn send_welcome(to: &Email) {
    println!("Sending a welcome message to {}", to.as_str());
}

fn main() {
    for input in ["  Sara@Example.com ", "not-an-address"] {
        match Email::parse(input) {
            Ok(email) => send_welcome(&email),
            Err(problem) => println!("error: {problem}"),
        }
    }
}
```
```output
Sending a welcome message to sara@example.com
error: 'not-an-address' is not an e-mail address
```

The check happens once, at the edge of the program. From then on, the type `Email` is the proof. `send_welcome` needs no check and no error case of its own. You have followed this principle in every project so far: the `Command` enum of the to-do list, the `Config` of the search tool, the `Sale` of the report.

(The check here is deliberately simple. Real address validation has more rules.)

:::compare Type systems compared
- **Python, JavaScript, Ruby** are dynamically typed: values have types, variables do not, and a type mistake shows up when the faulty line runs, perhaps in production. Type checkers such as mypy and TypeScript add static checks on top.
- **C** has static types but lets you convert almost anything to anything, and has no way to say "this pointer is never null".
- **Java, C#, Go** have static types with null references that the type system does not track (C# and Kotlin have since added nullable types). Their enums cannot carry different data per variant, so "one of several shapes" needs class hierarchies.
- **Rust** belongs to the same family as **Haskell**, **OCaml**, **F#** and **Swift**: enums with data, exhaustive matching, no null, and generics checked through traits. Rust adds ownership and lifetimes to that tradition.
:::

:::recap
- `as` always succeeds and may change the value. `From`/`Into` cannot fail and lose nothing. `TryFrom`/`TryInto` return a `Result`. `FromStr` powers `.parse()`. `AsRef` makes parameters flexible.
- A newtype gives a meaning its own type, at no run-time cost. A type alias is only a shorter name.
- `()` has one value. `!` has none and fits anywhere. Structs without fields take no memory. `str`, `[T]` and `dyn Trait` live behind fat pointers.
- `PhantomData<T>` adds a type parameter that exists only at compile time.
- The typestate pattern makes each state a type, so that operations in the wrong state do not compile.
- Make invalid states unrepresentable: prefer one enum to several flags and options.
- Parse, don't validate: turn checked input into a type that proves the check.
:::

:::quiz Check your understanding
? What does `300_i32 as u8` produce?
- A compile error
- A panic
+ 44, because the value is cut down to the lowest 8 bits
- 255
= `as` never fails. It keeps the lowest 8 bits: 300 − 256 = 44. Use `u8::try_from(300)` to get an error value in such a case.

? Why is there `i64::from(x)` for an `i32`, but no `i32::from(x)` for an `i64`?
- An oversight in the standard library
+ `From` is only implemented for conversions that always succeed without loss. An `i64` may not fit into an `i32`
- `i32` is older than `i64`
- `From` only works with strings
= For the direction that can fail, the standard library offers `TryFrom`, which returns a `Result`.

? What is the difference between `type Metres = f64;` and `struct Metres(f64);`?
- There is none
- The alias is faster
+ The alias is only another name for `f64`. The struct is a new, distinct type that cannot be mixed up with other `f64` values
- The struct uses more memory
= An alias gives no protection: `Metres` and `f64` are interchangeable. A newtype is checked by the compiler and has the same size as its content.

? Why may one arm of a `match` be `panic!("…")` while the other arms are `u32`?
- `panic!` returns 0
- The compiler ignores that arm
+ `panic!` has the never type `!`, which fits where any type is expected
- `match` arms may have different types
= An expression of type `!` never produces a value, so it can stand wherever any type is required.

? In the typestate pattern, why do the transition methods take `self` by value?
- It is faster
+ The old state is consumed, so no one can go on using the object in its previous state
- Methods cannot take `&self` in generic types
- To allow cloning
= Moving `self` into the method ends the life of the old state. The only thing the caller has afterwards is the value of the new type.
:::

:::exercise guided A username that is always valid
Write `struct Username(String)` with `impl TryFrom<&str> for Username`. The rules: 3 to 16 characters, only ASCII letters, digits and `_`. The error type is `String` and says which rule was broken. Add `as_str(&self) -> &str`. Test with `"sara_92"`, `"ab"` and `"no spaces"`.
::hint
`impl TryFrom<&str> for Username { type Error = String; fn try_from(value: &str) -> Result<Self, Self::Error> { ... } }`. Check the length with `value.chars().count()`, and the characters with `value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')`.
::solution
```rust run
#[derive(Debug, Clone, PartialEq)]
struct Username(String);

impl TryFrom<&str> for Username {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        let length = value.chars().count();
        if !(3..=16).contains(&length) {
            return Err(format!("'{value}' must have 3 to 16 characters"));
        }
        if !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(format!("'{value}' may only contain letters, digits and _"));
        }
        Ok(Username(value.to_string()))
    }
}

impl Username {
    fn as_str(&self) -> &str {
        &self.0
    }
}

fn main() {
    for input in ["sara_92", "ab", "no spaces"] {
        match Username::try_from(input) {
            Ok(name) => println!("ok: {}", name.as_str()),
            Err(problem) => println!("error: {problem}"),
        }
    }
}
```
```output
ok: sara_92
error: 'ab' must have 3 to 16 characters
error: 'no spaces' may only contain letters, digits and _
```

`TryFrom` is the standard trait for "construct with a check", so other Rust programmers know at once how to create a `Username`, and `"sara".try_into()` works as well. Put the type in its own module, and the private field makes `try_from` the only door: every `Username` in the program is then known to be valid.
:::

:::exercise practice Parse a duration
Implement `FromStr` for `struct Minutes(u32)` so that `"90"`, `"45m"` and `"2h"` can be parsed (as 90, 45 and 120 minutes). Anything else is an error.
::hint
Use `strip_suffix('h')` and `strip_suffix('m')`, which return an `Option<&str>` with the rest of the text. Check for `h` first. Parse the remaining digits with `.parse::<u32>()` and convert the error with `map_err`.
::solution
```rust run
use std::str::FromStr;

#[derive(Debug, PartialEq)]
struct Minutes(u32);

impl FromStr for Minutes {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        let text = text.trim();
        let (digits, factor) = if let Some(hours) = text.strip_suffix('h') {
            (hours, 60)
        } else if let Some(minutes) = text.strip_suffix('m') {
            (minutes, 1)
        } else {
            (text, 1)
        };
        let number: u32 = digits.parse().map_err(|_| format!("'{text}' is not a duration"))?;
        Ok(Minutes(number * factor))
    }
}

fn main() {
    println!("{:?}", "90".parse::<Minutes>());
    println!("{:?}", "45m".parse::<Minutes>());
    println!("{:?}", " 2h ".parse::<Minutes>());
    println!("{:?}", "soon".parse::<Minutes>());
}
```
```output
Ok(Minutes(90))
Ok(Minutes(45))
Ok(Minutes(120))
Err("'soon' is not a duration")
```

Implementing `FromStr` plugs the type into the standard `.parse()` method, and into every library that builds on it. The command-line parser `clap` ([chapter 44](#cli)), for example, can accept a `Minutes` argument directly. The `if let … else if let … else` chain produces a pair, which is taken apart in the same `let`.
:::

:::exercise practice Remove the impossible states
This struct describes a payment. List at least three combinations of field values that make no sense. Then redesign it as an enum in which only meaningful states can be written, and write a function `summary(&Payment) -> String`.

```rust
struct Payment {
    is_paid: bool,
    is_refunded: bool,
    paid_at: Option<String>,
    refund_reason: Option<String>,
    amount: u32,
}
```
::hint
Meaningless: paid without a `paid_at` date. Refunded but not paid. A refund reason without a refund. Not paid, but with a date. The states are really three: pending, paid (with a date), refunded (with a date and a reason). The amount belongs to all of them.
::solution
```rust run
#[derive(Debug)]
enum Payment {
    Pending { amount: u32 },
    Paid { amount: u32, paid_at: String },
    Refunded { amount: u32, paid_at: String, reason: String },
}

fn summary(payment: &Payment) -> String {
    match payment {
        Payment::Pending { amount } => format!("{amount} waiting for payment"),
        Payment::Paid { amount, paid_at } => format!("{amount} paid on {paid_at}"),
        Payment::Refunded { amount, paid_at, reason } => {
            format!("{amount} paid on {paid_at}, then refunded: {reason}")
        }
    }
}

fn main() {
    let payments = [
        Payment::Pending { amount: 500 },
        Payment::Paid { amount: 1200, paid_at: String::from("2026-03-01") },
        Payment::Refunded { amount: 800, paid_at: String::from("2026-03-02"), reason: String::from("damaged") },
    ];
    for payment in &payments {
        println!("{}", summary(payment));
    }
}
```
```output
500 waiting for payment
1200 paid on 2026-03-01
800 paid on 2026-03-02, then refunded: damaged
```

The original struct allowed 2 × 2 × 2 × 2 = 16 combinations of flags and options, of which three are meaningful. The enum allows exactly those three. A refund without a payment date cannot be written, and `summary` has no "should never happen" branch.

If the amount is needed without matching on the state, a common alternative is a struct `Payment { amount: u32, status: Status }` with the enum inside.
:::

:::exercise challenge A door that cannot be misused
Model a door with the typestate pattern. The states are `Open`, `Closed` and `Locked`. Allowed transitions: an open door can be closed, a closed door can be opened or locked (with a code), and a locked door can be unlocked with the right code. Unlocking with a wrong code must give the locked door back. Use one generic struct `Door<State>`.
::hint
Use `struct Door<State> { state: State }`, where the state types are `struct Open;`, `struct Closed;` and `struct Locked { code: u32 }`. Write one `impl` block per state: `impl Door<Open> { fn close(self) -> Door<Closed> }` and so on. `unlock` returns `Result<Door<Closed>, Door<Locked>>`. The error case hands the still locked door back to the caller.
::solution
```rust run
struct Open;
struct Closed;
struct Locked {
    code: u32,
}

struct Door<State> {
    state: State,
}

impl Door<Closed> {
    fn new() -> Self {
        Door { state: Closed }
    }

    fn open(self) -> Door<Open> {
        println!("The door opens.");
        Door { state: Open }
    }

    fn lock(self, code: u32) -> Door<Locked> {
        println!("The door is locked.");
        Door { state: Locked { code } }
    }
}

impl Door<Open> {
    fn close(self) -> Door<Closed> {
        println!("The door closes.");
        Door { state: Closed }
    }
}

impl Door<Locked> {
    fn unlock(self, code: u32) -> Result<Door<Closed>, Door<Locked>> {
        if code == self.state.code {
            println!("The door is unlocked.");
            Ok(Door { state: Closed })
        } else {
            println!("Wrong code.");
            Err(self)
        }
    }
}

fn main() {
    let door = Door::new().open().close().lock(1234);

    let door = match door.unlock(1111) {
        Ok(closed) => closed,
        Err(still_locked) => match still_locked.unlock(1234) {
            Ok(closed) => closed,
            Err(_) => panic!("locked out"),
        },
    };

    let _open = door.open();
    // _open.lock(1);   // does not compile: an open door has no `lock` method
}
```
```output
The door opens.
The door closes.
The door is locked.
Wrong code.
The door is unlocked.
The door opens.
```

`Door<Open>`, `Door<Closed>` and `Door<Locked>` are three types that share one struct definition. Each `impl` block gives one state its methods. Locking an open door, or opening a locked one, is not an error to be handled. It cannot be written.

`unlock` is the interesting case: whether it works depends on a value known only at run time, so it returns a `Result`. Because `unlock` takes `self` by value, the error variant must give the door back, or it would be lost. Returning the original value in the `Err` case is a common idiom for operations that consume their input and may fail.
:::
