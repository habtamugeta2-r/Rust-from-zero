@id idioms
@part p8
@title Idiomatic Rust: patterns and habits
@short Idioms and patterns
@level advanced
@time 55
@learn Follow Rust's naming and API conventions | Replace verbose `match` code with `Option` and `Result` combinators | Design function signatures that are flexible for callers | Apply the builder, newtype, RAII guard and state-machine patterns | Recognise and avoid common anti-patterns

Code can be correct and still feel foreign. Every language has its own way of saying things, and code that follows it is called **idiomatic**. Idiomatic code is easier for others to read, works better with the standard library, and usually has fewer bugs, because the idioms grew out of experience.

This chapter gathers the habits of experienced Rust programmers. Most of the pieces you have seen already. Here they are side by side, as a reference to come back to.

## Names

The compiler warns about the first group. The second group is convention, and it carries real information.

| Item | Style | Example |
|---|---|---|
| variables, functions, methods, modules | `snake_case` | `word_count`, `parse_line` |
| types, traits, enum variants | `UpperCamelCase` | `TodoList`, `Display`, `Some` |
| constants and statics | `SCREAMING_SNAKE_CASE` | `MAX_SIZE` |
| type parameters | one capital letter, or a short word | `T`, `K`, `V`, `Item` |
| lifetimes | short, lower case | `'a`, `'input` |

**Conversion methods** tell you their cost through their prefix:

| Prefix | Cost | Takes | Example |
|---|---|---|---|
| `as_` | free: a view of the same data | `&self` | `text.as_str()`, `path.as_os_str()` |
| `to_` | may be expensive: creates a new value | `&self` | `text.to_string()`, `slice.to_vec()` |
| `into_` | consumes the value, usually cheap | `self` | `text.into_bytes()`, `vec.into_iter()` |

More conventions:

- A getter is named after the field, **without `get_`**: `user.name()`, not `user.get_name()`.
- Methods that return `bool` start with `is_` or `has_`: `is_empty()`, `has_children()`.
- The main constructor is called `new`. Others say what they start from: `with_capacity(n)`, `from_parts(…)`.
- An iterator over a collection comes from `iter()`, `iter_mut()` and `into_iter()`.
- A method that can fail and has a panicking twin uses `try_`: `try_from`, `try_lock`.

## Creating values

### `new` and `Default`

If a type has an obvious empty or starting value, give it both a `new()` and a `Default` implementation, and make them agree:

```rust run
# #![allow(dead_code)]
#[derive(Debug, Default)]
struct Settings {
    volume: u8,
    muted: bool,
    device: Option<String>,
}

impl Settings {
    fn new() -> Self {
        Self::default()
    }
}

fn main() {
    let loud = Settings { volume: 90, ..Settings::default() };
    println!("{:?}\n{:?}", Settings::new(), loud);
}
```
```output
Settings { volume: 0, muted: false, device: None }
Settings { volume: 90, muted: false, device: None }
```

### The builder pattern

A struct with many optional settings would need a constructor with a dozen parameters, or a dozen constructors. Rust has no optional or named arguments. The idiom is a **builder**: a helper type that collects the settings one by one and creates the real value at the end.

```rust run
# #![allow(dead_code)]
#[derive(Debug)]
struct Request {
    url: String,
    method: String,
    timeout_seconds: u32,
    headers: Vec<(String, String)>,
}

struct RequestBuilder {
    url: String,
    method: String,
    timeout_seconds: u32,
    headers: Vec<(String, String)>,
}

impl Request {
    fn builder(url: &str) -> RequestBuilder {
        RequestBuilder {
            url: url.to_string(),
            method: String::from("GET"),
            timeout_seconds: 30,
            headers: Vec::new(),
        }
    }
}

impl RequestBuilder {
    fn method(mut self, method: &str) -> Self {
        self.method = method.to_string();
        self
    }

    fn timeout(mut self, seconds: u32) -> Self {
        self.timeout_seconds = seconds;
        self
    }

    fn header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.to_string(), value.to_string()));
        self
    }

    fn build(self) -> Result<Request, String> {
        if !self.url.starts_with("http") {
            return Err(format!("'{}' is not a web address", self.url));
        }
        Ok(Request {
            url: self.url,
            method: self.method,
            timeout_seconds: self.timeout_seconds,
            headers: self.headers,
        })
    }
}

fn main() {
    let request = Request::builder("https://example.com/api")
        .method("POST")
        .timeout(5)
        .header("Accept", "application/json")
        .build();
    println!("{:#?}", request);
    println!("{:?}", Request::builder("example").build().is_err());
}
```
```output
Ok(
    Request {
        url: "https://example.com/api",
        method: "POST",
        timeout_seconds: 5,
        headers: [
            (
                "Accept",
                "application/json",
            ),
        ],
    },
)
true
```

Each setter takes `self` and returns `Self`, so the calls can be chained. The required value (the address) is a parameter of `builder`, the optional ones have defaults, and `build` is the single place where the combination is checked. You will meet builders all over the ecosystem: `Command::new("ls").arg("-l")`, `OpenOptions::new().append(true)`, `thread::Builder`.

## Working with `Option` and `Result`

Beginners write a `match` for every `Option`. That is fine, and often clearest. For the simple cases, the **combinator** methods say the same thing in one line.

```rust run
fn main() {
    let name: Option<&str> = Some("sara");
    let nobody: Option<&str> = None;

    // change the value inside, if there is one
    println!("{:?}", name.map(|n| n.len()));

    // provide a fallback
    println!("{} {}", name.unwrap_or("guest"), nobody.unwrap_or("guest"));
    println!("{}", nobody.map(|n| n.to_uppercase()).unwrap_or_default());

    // a step that itself returns an Option
    let first_char = name.and_then(|n| n.chars().next());
    println!("{:?}", first_char);

    // keep the value only if it passes a test
    println!("{:?} {:?}", name.filter(|n| n.len() > 3), name.filter(|n| n.len() > 10));

    // use another Option if this one is empty
    println!("{:?}", nobody.or(Some("fallback")));

    // Option -> Result, and back
    let as_result: Result<&str, String> = nobody.ok_or(String::from("no name given"));
    println!("{:?} {:?}", as_result, "42".parse::<i32>().ok());

    // tests
    println!("{} {}", name.is_some_and(|n| n.starts_with('s')), nobody.is_none());
}
```
```output
Some(4)
sara guest

Some('s')
Some("sara") None
Some("fallback")
Err("no name given") Some(42)
true true
```

| I want to … | `Option` | `Result` |
|---|---|---|
| transform the success value | `map` | `map` |
| transform the error | | `map_err` |
| chain a step that can fail | `and_then` | `and_then` |
| use a fallback value | `unwrap_or`, `unwrap_or_default`, `unwrap_or_else` | the same |
| try an alternative | `or`, `or_else` | `or`, `or_else` |
| keep only if a test passes | `filter` | |
| convert to the other type | `ok_or`, `ok_or_else` | `ok`, `err` |
| return early from the function | `?` | `?` |
| borrow the inside | `as_ref`, `as_mut`, `as_deref` | the same |
| move the value out, leaving `None` | `take` | |

`as_deref` is worth knowing: it turns an `Option<String>` into an `Option<&str>` without copying, so that you can compare or match it against string literals:

```rust run
struct User {
    nickname: Option<String>,
}

fn main() {
    let user = User { nickname: Some(String::from("ace")) };

    match user.nickname.as_deref() {
        Some("ace") => println!("the ace is here"),
        Some(other) => println!("hello, {other}"),
        None => println!("hello, stranger"),
    }
}
```
```output
the ace is here
```

A guideline for choosing: use `?` to pass problems on, a combinator for a one-step transformation, and `match` or `if let` as soon as there are two or more things to do. A chain of five combinators is harder to read than a `match`.

## Function signatures

### Accept the most general borrowed type

A function that only reads its argument should ask for the borrowed form that the most callers can provide:

| Do not ask for | Ask for | Why |
|---|---|---|
| `&String` | `&str` | also accepts literals and parts of strings |
| `&Vec<T>` | `&[T]` | also accepts arrays and parts of vectors |
| `&Box<T>` | `&T` | the box is an irrelevant detail |
| `&PathBuf` | `&Path` | |
| `&Option<T>` | `Option<&T>` | easier to build and to use |

```rust run
fn total(numbers: &[i32]) -> i32 {
    numbers.iter().sum()
}

fn shout(text: &str) -> String {
    text.to_uppercase()
}

fn main() {
    let list = vec![1, 2, 3, 4];
    println!("{} {} {}", total(&list), total(&[10, 20]), total(&list[1..3]));
    println!("{} {}", shout("literal"), shout(&String::from("owned")));
}
```
```output
10 30 5
LITERAL OWNED
```

### Take ownership when you keep the value

If the function is going to store the value, ask for the owned type. The caller then decides whether to move a value in or to clone one, and no hidden copy happens inside your function:

```rust run
struct Team {
    members: Vec<String>,
}

impl Team {
    // stores the name: takes a String
    fn add(&mut self, name: String) {
        self.members.push(name);
    }

    // a little more convenient: accepts &str and String alike
    fn add_any(&mut self, name: impl Into<String>) {
        self.members.push(name.into());
    }

    // only looks: takes &str
    fn has(&self, name: &str) -> bool {
        self.members.iter().any(|m| m == name)
    }
}

fn main() {
    let mut team = Team { members: Vec::new() };
    let owned = String::from("Lena");

    team.add(owned);                     // moved in, no copy
    team.add_any("Tomas");               // converted from &str
    team.add_any(String::from("Sara"));  // moved in, no copy
    println!("{} {}", team.has("Lena"), team.members.len());
}
```
```output
true 3
```

### Return owned values, or borrow from the input

A function returns either a new owned value, or a reference into one of its arguments. It cannot return a reference to something it created. When both cases occur, `Cow` covers them ([chapter 27](#smart-pointers)). For sequences, returning `impl Iterator<Item = T>` lets the caller decide whether to collect:

```rust run
fn even_squares(limit: u32) -> impl Iterator<Item = u32> {
    (1..=limit).filter(|n| n % 2 == 0).map(|n| n * n)
}

fn main() {
    let first_two: Vec<u32> = even_squares(100).take(2).collect();
    let sum: u32 = even_squares(10).sum();
    println!("{:?} {sum}", first_two);
}
```
```output
[4, 16] 220
```

## Iterators over indices

A loop with an index is rarely the best form in Rust. It needs a bounds check on every access, and an off-by-one mistake is easy to make.

```rust run
fn main() {
    let prices = [120, 80, 95];
    let names = ["tea", "milk", "bread"];

    // Instead of: for i in 0..names.len() { ... names[i] ... prices[i] ... }
    for (name, price) in names.iter().zip(prices.iter()) {
        print!("{name}={price} ");
    }
    println!();

    // Instead of a counter variable
    for (position, name) in names.iter().enumerate() {
        print!("{}:{name} ", position + 1);
    }
    println!();

    // Instead of comparing v[i] with v[i + 1]
    let rising = prices.windows(2).filter(|pair| pair[0] < pair[1]).count();

    // Instead of a loop with `if` and `push`
    let cheap: Vec<&str> = names
        .iter()
        .zip(prices.iter())
        .filter(|(_, price)| **price < 100)
        .map(|(name, _)| *name)
        .collect();

    println!("{rising} {:?}", cheap);
}
```
```output
tea=120 milk=80 bread=95 
1:tea 2:milk 3:bread 
1 ["milk", "bread"]
```

## Errors

A short summary of the habits from [chapter 18](#errors):

- Return `Result` for anything that can fail for outside reasons. Reserve `panic!` for bugs.
- In a **library**, define an error enum (with `thiserror`). In an **application**, use `anyhow` and add context to errors as they travel up.
- Use `?` to propagate. Handle an error where you can do something useful about it, and that is often near `main`.
- Write `expect("why this cannot fail")` in place of a bare `unwrap()`.
- Give an error type `Debug`, `Display` and `std::error::Error`, so that it works with `?`, `Box<dyn Error>` and `anyhow`.

One idiom for validation is the early return, also called a **guard clause**. Deal with the special cases first and leave, so that the main path is not buried inside nested `if`s:

```rust run
fn discount(age: Option<u32>, member: bool) -> Result<u32, String> {
    let Some(age) = age else {
        return Err(String::from("age unknown"));
    };
    if age > 130 {
        return Err(format!("{age} is not a plausible age"));
    }
    if !member {
        return Ok(0);
    }

    // the main path, at the left margin
    Ok(if age < 18 || age >= 65 { 20 } else { 10 })
}

fn main() {
    println!("{:?} {:?}", discount(Some(70), true), discount(Some(30), false));
    println!("{:?} {:?}", discount(None, true), discount(Some(200), true));
}
```
```output
Ok(20) Ok(0)
Err("age unknown") Err("200 is not a plausible age")
```

## Let types do the work

These patterns were introduced in earlier chapters. They are the centre of idiomatic Rust design.

| Pattern | In one sentence | Chapter |
|---|---|---|
| Newtype | wrap a value in a struct to give it a meaning and rules of its own | [12](#structs), [29](#type-system) |
| Parse, don't validate | turn unchecked input into a type that proves it was checked | [29](#type-system) |
| Enum for alternatives | one variant per case, each with exactly its data. No flags and no "unused" fields | [13](#enums), [29](#type-system) |
| Typestate | one type per state, so that wrong sequences of calls do not compile | [29](#type-system) |
| RAII guard | a value whose `Drop` undoes something: unlock, close, deregister | [27](#smart-pointers), [33](#project-chat) |
| Extension trait | add methods to a foreign type through your own trait | [20](#traits) |
| Composition | build big types out of small ones, and share behaviour through traits | [20](#traits) |

### An RAII guard of your own

A guard is useful whenever something must be undone "no matter what". This one measures how long a block of code takes:

```rust run
use std::time::Instant;

struct Timer {
    label: &'static str,
    start: Instant,
}

impl Timer {
    fn start(label: &'static str) -> Timer {
        Timer { label, start: Instant::now() }
    }
}

impl Drop for Timer {
    fn drop(&mut self) {
        let fast = self.start.elapsed().as_secs() < 5;
        println!("[{}] finished (under five seconds: {fast})", self.label);
    }
}

fn work(fail: bool) -> Result<u32, String> {
    let _timer = Timer::start("work");
    if fail {
        return Err(String::from("something went wrong"));
    }
    Ok((1..=100).sum())
}

fn main() {
    println!("{:?}", work(false));
    println!("{:?}", work(true));
}
```
```output
[work] finished (under five seconds: true)
Ok(5050)
[work] finished (under five seconds: true)
Err("something went wrong")
```

The message appears on both paths, the normal return and the early error. The variable is called `_timer` and not `_`: a plain `_` would drop the value at once.

### A state machine as an enum

When the states are only known at run time, an enum with a transition function is the idiom. All the rules are in one `match`, and the compiler checks that every combination is covered:

```rust run
#[derive(Debug, Clone, Copy, PartialEq)]
enum Light {
    Red,
    Green,
    Yellow,
    Flashing,
}

#[derive(Debug, Clone, Copy)]
enum Event {
    Timer,
    Fault,
    Repaired,
}

fn next(state: Light, event: Event) -> Light {
    match (state, event) {
        (_, Event::Fault) => Light::Flashing,
        (Light::Flashing, Event::Repaired) => Light::Red,
        (Light::Flashing, Event::Timer) => Light::Flashing,
        (Light::Red, Event::Timer) => Light::Green,
        (Light::Green, Event::Timer) => Light::Yellow,
        (Light::Yellow, Event::Timer) => Light::Red,
        (state, Event::Repaired) => state,
    }
}

fn main() {
    let events = [Event::Timer, Event::Timer, Event::Fault, Event::Timer, Event::Repaired, Event::Timer];
    let mut state = Light::Red;
    for event in events {
        state = next(state, event);
        print!("{:?} ", state);
    }
    println!();
}
```
```output
Green Yellow Flashing Flashing Red Green 
```

Matching on the pair `(state, event)` turns the transition table into code that looks like the table. `next` is a pure function, so every transition is trivially testable.

### Functional core, imperative shell

A design habit that ran through every project in this guide: put the decisions into pure functions that take values and return values, and keep input and output in a thin layer around them. The to-do list's `parse`, the search tool's `search`, the report's `revenue_by` and the chat server's `parse` were all written that way. The core is easy to test, and the shell is too simple to need much testing.


## Small idioms worth knowing

Five short moves that experienced Rust programmers use without thinking. Each one removes a `mut`, a `match`, a `Box` or a `clone`.

```rust run
use std::fmt::Display;
use std::num::ParseIntError;

/// A setting that may be absent, but must be a number when it is present.
fn port(text: Option<&str>) -> Result<Option<u16>, ParseIntError> {
    text.map(|t| t.parse::<u16>()).transpose()
}

fn main() {
    // 1. Mutable while it is built, fixed afterwards
    let sorted = {
        let mut numbers = vec![5, 3, 8];
        numbers.sort();
        numbers
    };
    println!("{:?}", sorted);

    // 2. An Option is a sequence of no item or one item
    let extra: Option<&str> = Some("pepper");
    let mut shopping = vec!["salt"];
    shopping.extend(extra);
    let all: Vec<&str> = ["oil"].into_iter().chain(extra).collect();
    let present: Vec<i32> = [Some(1), None, Some(3)].into_iter().flatten().collect();
    println!("{:?} {:?} {:?}", shopping, all, present);

    // 3. `transpose` turns Option<Result<…>> inside out
    println!("{:?} {:?} {}", port(None), port(Some("80")), port(Some("x")).is_err());

    // 4. A `&dyn` chosen while the program runs needs no Box
    let number = 42;
    let word = String::from("forty-two");
    for as_word in [false, true] {
        let shown: &dyn Display = if as_word { &word } else { &number };
        println!("{shown}");
    }

    // 5. An error can give the argument back
    let bytes = vec![0xff, 0xfe, 0xfd];
    match String::from_utf8(bytes) {
        Ok(text) => println!("{text}"),
        Err(error) => {
            let bytes = error.into_bytes(); // the same vector, not a copy
            println!("not valid UTF-8, got my {} bytes back", bytes.len());
        }
    }
}
```
```output auto
```

1. **Mutable while it is built, fixed afterwards.** The block needs `mut`, the rest of the function does not. After the block, nobody can change `sorted` by accident. For a single line, `let numbers = numbers;` does the same.
2. **An `Option` is a sequence of no item or one item.** It works wherever an iterator is expected: `extend`, `chain`, `flatten`, even a `for` loop. That replaces many `if let Some(x) = … { list.push(x) }`.
3. **`transpose`** swaps the two layers. Here `map` produces an `Option<Result<u16, _>>`, and the caller wants "an error, or perhaps a number": `Result<Option<u16>, _>`. After `transpose`, a `?` can be applied.
4. **A `&dyn Trait` chosen at run time.** When both values already exist, a plain reference is enough. `Box<dyn Trait>` is only needed when the value must be *owned* behind the pointer.
5. **An error that gives the argument back.** `String::from_utf8` takes ownership of the bytes. If it fails, the bytes are inside the error, and `into_bytes` returns them. Channels do the same: a failed `send` returns the message. When you write a function that takes ownership and can fail, consider this, so that callers do not have to clone "just in case".

## Common anti-patterns

Things that work, and that experienced reviewers will ask you to change.

**`unwrap()` on anything that can really fail.** It turns a recoverable error into a crash with an unhelpful message. Use `?`, a fallback, or `expect` with a reason.

**`clone()` to silence the borrow checker, as a reflex.** One clone to get unstuck is fine. Clones everywhere usually mean that a function should borrow (`&T`), or that ownership in the program is unclear.

**`Rc<RefCell<T>>` everywhere.** This rebuilds the object graphs of garbage-collected languages, with run-time panics in place of compile-time checks. Most programs need it rarely. Ask first whether one owner and some references, or indices into a `Vec`, would do.

**Stringly typed code.** Passing states, kinds and commands around as strings (`if status == "actve"`) means that a typing error compiles. Use an enum.

**Several `bool` parameters.** `resize(true, false, true)` cannot be read. Use enums with telling names, or a struct of options.

```rust run
#[derive(Debug, Clone, Copy)]
enum Case {
    Sensitive,
    Insensitive,
}

fn contains(text: &str, word: &str, case: Case) -> bool {
    match case {
        Case::Sensitive => text.contains(word),
        Case::Insensitive => text.to_lowercase().contains(&word.to_lowercase()),
    }
}

fn main() {
    // contains("Rust is fun", "rust", false) says nothing. This does:
    println!("{}", contains("Rust is fun", "rust", Case::Insensitive));
    println!("{}", contains("Rust is fun", "rust", Case::Sensitive));
}
```
```output
true
false
```

**A catch-all `_ =>` that hides new cases.** If a `match` on your own enum ends with `_ => {}`, adding a variant later compiles silently, and the new case is ignored. List the variants, so that the compiler reminds you.

**`Deref` to imitate inheritance.** Implementing `Deref` so that a wrapper "inherits" the methods of its field is tempting and confusing. `Deref` is for smart pointers. Pass the calls on explicitly, or expose the inner value.

**Indexing where an iterator would do**, and **collecting where it is not needed**. `v.iter().map(f).collect::<Vec<_>>().iter().sum()` builds a list only to throw it away. Chain the adapters and consume once.

**`unsafe` or clever tricks for speed, without a measurement.** Write the clear version first. Measure. Optimise the part that the measurement points at ([chapter 51](#performance)).

**Fighting the language.** If a design needs many lifetimes, many `RefCell`s, or parent pointers everywhere, it is probably a translation of a design from another language. Step back and ask who should own the data.

## A checklist for public types

When you publish a type for others to use, go through this list. It is condensed from the official Rust API Guidelines.

- It derives the common traits where they make sense: `Debug` always, and `Clone`, `PartialEq`, `Eq`, `Hash`, `Default`, `PartialOrd`, `Ord` as appropriate.
- It implements `Display` if users will want to print it, and `Error` if it is an error.
- Conversions use the standard traits: `From`, `TryFrom`, `FromStr`, `AsRef`.
- Fields are private, unless the type is plain data with no rules.
- Constructors that can fail return `Result`.
- Functions take the most general borrowed types (`&str`, `&[T]`, `impl AsRef<Path>`).
- Every public item has a documentation comment with an example.
- Fallible functions document their errors, and panicking ones their panics.
- It is `Send` and `Sync` where possible.
- Enums and structs that may grow are marked `#[non_exhaustive]`.

Two tools enforce most idioms automatically. **`rustfmt`** formats code in the standard style, and **Clippy** knows several hundred idioms and suggests the better form with an explanation. Both are the subject of [chapter 40](#quality-tools). Running Clippy on your own code is one of the fastest ways to learn idiomatic Rust.

:::compare Design patterns from other languages
Many classic object-oriented design patterns exist to work around a missing language feature, and shrink in Rust:

- **Strategy** is a closure or a trait parameter.
- **Command** is an enum with one variant per command.
- **Visitor** is a `match` on an enum.
- **Null object** is `Option`.
- **Iterator** and **Observer** are the `Iterator` trait and channels.
- **Singleton** is a `static` with `LazyLock`, and is discouraged for the same reasons as everywhere else.
- **Builder**, **RAII** and **newtype** matter *more* in Rust than elsewhere.
:::

:::recap
- Names follow fixed styles. `as_`, `to_` and `into_` announce the cost of a conversion. Getters have no `get_`.
- Offer `new` and `Default`. Use a builder when there are many optional settings.
- Combinators (`map`, `and_then`, `unwrap_or`, `ok_or`, `filter`) replace simple matches. `?` propagates.
- Take `&str` and `&[T]` to read, owned values to keep. Return owned values or `impl Iterator`.
- Prefer iterators with `zip`, `enumerate` and `windows` to index loops.
- Let types carry rules: newtypes, enums, typestates, RAII guards.
- Keep a functional core and an imperative shell.
- Avoid reflexive `unwrap`, `clone` and `Rc<RefCell<T>>`, strings and `bool`s as stand-ins for types, and catch-all match arms.
:::

:::quiz Check your understanding
? By convention, what does a method named `as_bytes` promise?
- It creates a new, owned copy
+ It gives a cheap borrowed view of the same data
- It consumes the value
- It may fail
= `as_` conversions are free views that borrow. `to_` creates something new, and `into_` consumes `self`.

? Why is `fn count(words: &[String])` a better signature than `fn count(words: &Vec<String>)`?
- It is faster
- `&Vec` is not allowed as a parameter
+ A slice also accepts arrays and parts of vectors, and a `&Vec<String>` converts to it automatically
- A slice copies the data
= The function only reads a sequence. Asking for the slice makes it usable in more situations at no cost.

? Which expression gives the length of the name, or 0 if there is none, for `name: Option<&str>`?
- `name.len()`
- `name.unwrap().len()`
+ `name.map(|n| n.len()).unwrap_or(0)`
- `name.and_then(|n| n.len())`
= `map` transforms the value inside the `Option`, and `unwrap_or` supplies the fallback. `unwrap` would panic for `None`, and `and_then` needs a closure that returns an `Option`.

? Why should a `match` on your own enum usually list all variants, and not end with `_ => {}`?
- A catch-all arm is slower
+ When a variant is added later, the compiler then points at every `match` that must handle it
- `_` is not allowed for enums
- It uses less memory
= Exhaustiveness checking is one of Rust's best maintenance tools. A wildcard arm switches it off for that `match`.

? What problem does the builder pattern solve?
- It makes structs faster to create
+ It creates values with many optional settings in a readable way, since Rust has no named or default arguments
- It allows private fields to be changed
- It replaces the need for `Default`
= A builder collects options through chained method calls and checks them once in `build()`.
:::

:::exercise guided Tidy up with combinators
Rewrite each of these functions as a single expression, using methods of `Option` and `Result`. The behaviour must stay the same.

```rust
fn port(text: Option<&str>) -> u16 {
    match text {
        Some(t) => match t.parse::<u16>() {
            Ok(n) => n,
            Err(_) => 8080,
        },
        None => 8080,
    }
}

fn initial(name: Option<&str>) -> Option<char> {
    match name {
        Some(n) => match n.chars().next() {
            Some(c) => Some(c.to_ascii_uppercase()),
            None => None,
        },
        None => None,
    }
}
```
::hint
For `port`: `and_then` chains a step that may yield nothing, `.ok()` turns the `Result` of `parse` into an `Option`, and `unwrap_or` gives the fallback. For `initial`: `and_then` for the first character, then `map` to change it.
::solution
```rust run
fn port(text: Option<&str>) -> u16 {
    text.and_then(|t| t.parse().ok()).unwrap_or(8080)
}

fn initial(name: Option<&str>) -> Option<char> {
    name.and_then(|n| n.chars().next()).map(|c| c.to_ascii_uppercase())
}

fn main() {
    println!("{} {} {}", port(Some("3000")), port(Some("abc")), port(None));
    println!("{:?} {:?} {:?}", initial(Some("sara")), initial(Some("")), initial(None));
}
```
```output
3000 8080 8080
Some('S') None None
```

Each nested `match` had the shape "if there is a value, do the next step, otherwise stay empty". That shape is `and_then`. A final "otherwise use this" is `unwrap_or`, and "change the value if there is one" is `map`. Both versions compile to the same machine code. The short one shows the flow of the data in one line.
:::

:::exercise practice Improve the signatures
This code works, and its signatures force callers to do needless work. Improve the three functions without changing what they do, and simplify the calls in `main`.

```rust
fn longest(words: &Vec<String>) -> String {
    let mut best = String::new();
    for i in 0..words.len() {
        if words[i].len() > best.len() {
            best = words[i].clone();
        }
    }
    best
}

fn greet(name: &String) -> String {
    format!("Hello, {}!", name)
}

fn is_admin(role: &Option<String>) -> bool {
    match role {
        Some(r) => r == "admin",
        None => false,
    }
}

fn main() {
    let words = vec![String::from("pear"), String::from("banana")];
    println!("{}", longest(&words));
    println!("{}", greet(&String::from("Sara")));
    println!("{}", is_admin(&Some(String::from("admin"))));
}
```
::hint
`longest` can take `&[String]` and return `Option<&str>`: a borrowed view of the winner, and `None` for an empty list. `max_by_key` finds it. `greet` should take `&str`. `is_admin` should take `Option<&str>`.
::solution
```rust run
fn longest(words: &[String]) -> Option<&str> {
    words.iter().max_by_key(|w| w.len()).map(|w| w.as_str())
}

fn greet(name: &str) -> String {
    format!("Hello, {name}!")
}

fn is_admin(role: Option<&str>) -> bool {
    role == Some("admin")
}

fn main() {
    let words = vec![String::from("pear"), String::from("banana")];
    println!("{:?}", longest(&words));
    println!("{}", greet("Sara"));
    println!("{}", is_admin(Some("admin")));

    let stored_role: Option<String> = Some(String::from("guest"));
    println!("{}", is_admin(stored_role.as_deref()));
}
```
```output
Some("banana")
Hello, Sara!
true
false
```

What changed:

- `longest` no longer clones, no longer indexes, and tells the truth about an empty list by returning `None`. The old version returned an empty string, which looks like a real result.
- `greet("Sara")` works with a literal. No `String` has to be created only to be borrowed.
- `is_admin(Some("admin"))` is a plain comparison. An `Option<String>` that a caller already has is passed with `.as_deref()`.

In each case the function asks for less, so callers can give it more kinds of things.
:::

:::exercise practice A builder for a pizza
Write a `Pizza` struct with a size (`Small`, `Medium`, `Large`), a list of toppings, and a flag for extra cheese. Create it through a builder: `Pizza::builder(Size::Large).topping("olives").topping("onion").extra_cheese().build()`. `build` returns an error if there are more than 5 toppings.
::hint
The builder holds the same fields as `Pizza`. Each setter takes `mut self` and returns `Self`. `build(self) -> Result<Pizza, String>` checks `self.toppings.len()`.
::solution
```rust run
# #![allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq)]
enum Size {
    Small,
    Medium,
    Large,
}

#[derive(Debug)]
struct Pizza {
    size: Size,
    toppings: Vec<String>,
    extra_cheese: bool,
}

struct PizzaBuilder {
    size: Size,
    toppings: Vec<String>,
    extra_cheese: bool,
}

impl Pizza {
    fn builder(size: Size) -> PizzaBuilder {
        PizzaBuilder { size, toppings: Vec::new(), extra_cheese: false }
    }
}

impl PizzaBuilder {
    fn topping(mut self, name: &str) -> Self {
        self.toppings.push(name.to_string());
        self
    }

    fn extra_cheese(mut self) -> Self {
        self.extra_cheese = true;
        self
    }

    fn build(self) -> Result<Pizza, String> {
        if self.toppings.len() > 5 {
            return Err(format!("{} toppings are too many (the maximum is 5)", self.toppings.len()));
        }
        Ok(Pizza { size: self.size, toppings: self.toppings, extra_cheese: self.extra_cheese })
    }
}

fn main() {
    let pizza = Pizza::builder(Size::Large).topping("olives").topping("onion").extra_cheese().build();
    println!("{:?}", pizza);

    let mut builder = Pizza::builder(Size::Small);
    for topping in ["a", "b", "c", "d", "e", "f"] {
        builder = builder.topping(topping);
    }
    println!("{:?}", builder.build().map(|p| p.size));
#   let _ = Size::Medium;
}
```
```output
Ok(Pizza { size: Large, toppings: ["olives", "onion"], extra_cheese: true })
Err("6 toppings are too many (the maximum is 5)")
```

The required choice (the size) is a parameter of `builder`, so it cannot be forgotten. Optional choices have defaults. Because the setters take and return the builder by value, they can be chained, and they can also be used in a loop by assigning the result back. The single check in `build` guarantees that every `Pizza` that exists is valid.
:::

:::exercise challenge Refactor a "stringly typed" function
This function computes a shipping price. It works, and it invites mistakes: a typing error in a string compiles, and nothing lists the valid values. Redesign it with enums and a struct, parse the text input at the edge with `FromStr`, and make the price calculation a `match` that the compiler checks for completeness.

```rust
fn shipping(kind: &str, zone: &str, express: bool, insured: bool) -> i32 {
    let mut price = if kind == "letter" { 100 } else if kind == "parcel" { 500 } else { -1 };
    if price == -1 { return -1; }
    if zone == "abroad" { price *= 3; }
    if express { price += 400; }
    if insured && kind == "parcel" { price += 250; }
    price
}
```
::hint
Define `enum Kind { Letter, Parcel }`, `enum Zone { Domestic, Abroad }`, `enum Speed { Normal, Express }`, and a `struct Shipment { kind, zone, speed, insured }`. Implement `FromStr` for `Kind` and `Zone` with an error for unknown text. The price function takes a `&Shipment` and returns `u32`: it cannot fail any more, because invalid input can no longer reach it.
::solution
```rust run
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Letter,
    Parcel,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Zone {
    Domestic,
    Abroad,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Speed {
    Normal,
    Express,
}

#[derive(Debug, Clone, Copy)]
struct Shipment {
    kind: Kind,
    zone: Zone,
    speed: Speed,
    insured: bool,
}

impl FromStr for Kind {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text.trim().to_lowercase().as_str() {
            "letter" => Ok(Kind::Letter),
            "parcel" => Ok(Kind::Parcel),
            other => Err(format!("unknown kind '{other}' (use letter or parcel)")),
        }
    }
}

impl FromStr for Zone {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        match text.trim().to_lowercase().as_str() {
            "domestic" => Ok(Zone::Domestic),
            "abroad" => Ok(Zone::Abroad),
            other => Err(format!("unknown zone '{other}' (use domestic or abroad)")),
        }
    }
}

fn price(shipment: &Shipment) -> u32 {
    let base = match shipment.kind {
        Kind::Letter => 100,
        Kind::Parcel => 500,
    };
    let by_zone = match shipment.zone {
        Zone::Domestic => base,
        Zone::Abroad => base * 3,
    };
    let express = match shipment.speed {
        Speed::Normal => 0,
        Speed::Express => 400,
    };
    let insurance = match (shipment.kind, shipment.insured) {
        (Kind::Parcel, true) => 250,
        (Kind::Parcel, false) | (Kind::Letter, _) => 0,
    };
    by_zone + express + insurance
}

fn main() -> Result<(), String> {
    let shipment = Shipment {
        kind: "parcel".parse()?,
        zone: " Abroad ".parse()?,
        speed: Speed::Express,
        insured: true,
    };
    println!("{}", price(&shipment));
    println!("{}", price(&Shipment { kind: Kind::Letter, zone: Zone::Domestic, speed: Speed::Normal, insured: true }));
    println!("{:?}", "parsel".parse::<Kind>());
    Ok(())
}
```
```output
2150
100
Err("unknown kind 'parsel' (use letter or parcel)")
```

What the redesign bought:

- **Typing errors are caught.** `"parsel"` is reported where the text enters the program, with a message that lists the valid words. In the old version it silently produced the price −1.
- **The price function cannot fail.** It returns `u32`. The magic value −1, which every caller had to remember to check, is gone.
- **No more mystery arguments.** `shipping("parcel", "abroad", true, true)` has become a struct with named fields and `Speed::Express`.
- **The rules are complete by construction.** Add `Kind::Pallet`, and the compiler stops at each `match` until a price and an insurance rule exist for it.

The code is longer. Nearly all the extra lines are definitions that are written once, and they move mistakes from run time to compile time.
:::
