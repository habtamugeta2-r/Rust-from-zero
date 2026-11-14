@id errors-ref
@part app
@kind appendix
@title Compiler errors and how to repair them
@short Compiler errors
@level all

The Rust compiler refuses many programs, and it explains itself better than most compilers. This page lists the errors that you will meet most often. Each entry has a small program that produces the error, the real message, the reason, and the usual repairs. Use the search box with the error code, for example `E0382`.

## How to read a message

Every message has the same parts:

```text nosoft
error[E0382]: borrow of moved value: `names`          (1) the code and a summary
 --> src/main.rs:4:27                                 (2) file, line and column
  |
2 |     let names = vec![String::from("Sara")];
  |         ----- move occurs because `names` has type `Vec<String>`, which does not ...
3 |     let moved = names;
  |                 ----- value moved here            (3) what happened before
4 |     println!("{:?} {:?}", names, moved);
  |                           ^^^^^ value borrowed here after move   (4) where it went wrong
  |
help: consider cloning the value if the performance cost is acceptable   (5) a suggested repair
  |
3 |     let moved = names.clone();
  |                      ++++++++
```

1. The **code** (`E0382`) names the kind of error, and the **summary** says it in one line.
2. The **position**: file, line, column.
3. The lines marked with `---` tell the story that led to the error. Read them from top to bottom.
4. The line marked with `^^^` is where the compiler gave up.
5. **`help`** suggests a change, with `+++` under the characters to add. **`note`** lines, when present, give background.

A method that works:

1. **Repair the first error first**, then compile again. Later errors are often only consequences of the first one.
2. **Read all of it.** The `^^^` marks the place where the compiler gave up. The `---` marks show the earlier lines that caused the problem, and the real mistake is often there.
3. **Try the `help`.** It is right more often than not. Think for a moment whether it does what you *mean*: a suggested `.clone()` compiles, and may still not be what you want.
4. **Ask for the long explanation.** `rustc --explain E0382` prints a page about that error with examples.
5. **Ask what would go wrong** if the compiler accepted the program ([chapter 10](#borrowing)). The answer usually shows the repair.

## Ownership and moves

### E0382: use of a moved value

```rust fail E0382
fn main() {
    let names = vec![String::from("Sara")];
    let moved = names;
    println!("{:?} {:?}", names, moved);
}
```
```error auto lines=12
```

A value has one owner. `let moved = names;` handed the vector to `moved`, and `names` is empty from then on. The same happens when you pass a value to a function that takes ownership, or use it in a `for` loop without `&`.

**Repairs:**

- Borrow: `let view = &names;`, or `for name in &names`.
- Let the function borrow: change its parameter from `Vec<String>` to `&[String]`.
- Clone, if you really need two independent values: `names.clone()`.
- Use the value for the last time *after* the other uses.

### E0505: moved while it is still borrowed

```rust fail E0505
fn consume(_text: String) {}

fn main() {
    let text = String::from("hi");
    let view = &text;
    consume(text);
    println!("{view}");
}
```
```error auto lines=12
```

`view` still points at `text` on the last line, so `text` cannot be given away in between. If it were, `view` would point at a value that `consume` has already dropped.

**Repairs:**

- Finish using the reference before the move.
- Pass a reference to the function, or clone.

### E0507: cannot move out of a borrow

```rust fail E0507
struct Team {
    leader: String,
}

fn main() {
    let team = Team { leader: String::from("Sara") };
    let borrowed = &team;
    let leader = borrowed.leader;
    println!("{leader}");
}
```
```error auto lines=12
```

Through a reference you may look, not take. Moving the `String` out would leave the team without a leader, and the owner of `team` would not know. The same error appears for `let s = list[0];` with a list of `String`s.

**Repairs:**

- Borrow the part: `let leader = &borrowed.leader;`.
- Clone it: `borrowed.leader.clone()`.
- If you own the container and want the value out: `list.remove(i)`, `list.pop()`, `option.take()` or `std::mem::take(&mut team.leader)`.

## Borrowing

### E0502: borrowed as mutable while also borrowed as immutable

```rust fail E0502
fn main() {
    let mut list = vec![1, 2, 3];
    let first = &list[0];
    list.push(4);
    println!("{first}");
}
```
```error auto lines=12
```

Many readers or one writer, never both. `first` reads from the list until the last line, and `push` wants to change the list in between. Here the danger is real: `push` may move all elements to a new place.

**Repairs:**

- Finish reading before you write: move the `println!` above the `push`.
- Copy out what you need: `let first = list[0];`.
- Keep a position, not a reference.
- Inside a loop over the list: collect the changes and apply them after the loop ([chapter 15](#collections)).

### E0499: two mutable borrows at once

```rust fail E0499
fn main() {
    let mut text = String::new();
    let a = &mut text;
    let b = &mut text;
    a.push('x');
    b.push('y');
}
```
```error auto lines=12
```

Only one `&mut` to a value can be in use at a time.

**Repairs:**

- Use the first reference for the last time before you create the second.
- For two elements of one list: `split_at_mut`, `swap` or `get_disjoint_mut` ([chapter 15](#collections)).
- For two fields of a struct: borrow the fields directly, not through a method ([chapter 12](#structs)).

### E0596: cannot borrow as mutable

```rust fail E0596
fn main() {
    let list = Vec::new();
    list.push(1);
}
```
```error auto lines=10
```

Changing a value needs `mut` on the variable, or a `&mut` reference. The same code appears when a function received `&T` and tries to change the value behind it.

**Repairs:**

- `let mut list = Vec::new();`
- For a parameter: take `&mut Vec<i32>`, and pass `&mut list`.

### E0384: assigned twice to an immutable variable

```rust fail E0384
fn main() {
    let count = 0;
    count += 1;
    println!("{count}");
}
```
```error auto lines=10
```

Variables do not change unless you allow it.

**Repairs:**

- `let mut count = 0;`
- Or create a new variable with the same name: `let count = count + 1;` ([chapter 3](#variables)).

### E0381: used before it has a value

```rust fail E0381
fn main() {
    let total: i32;
    println!("{total}");
}
```
```error auto lines=10
```

Rust never reads memory that has not been given a value. The error also appears when only some branches of an `if` assign the variable.

**Repairs:**

- Give a value at the declaration, or in *every* branch before the first use.

## Lifetimes

### E0597: does not live long enough

```rust fail E0597
fn main() {
    let longest;
    {
        let word = String::from("temporary");
        longest = &word;
    }
    println!("{longest}");
}
```
```error auto lines=12
```

`word` is dropped at the end of the inner block, and `longest` would still point at it.

**Repairs:**

- Declare the value in the outer scope, so that it lives as long as the reference.
- Store an owned value in place of the reference: `longest = word;` or `word.clone()`.

### E0515: returns a reference to a local variable

```rust fail E0515
fn greeting(name: &str) -> &str {
    let text = format!("Hello, {name}!");
    &text
}

fn main() {
    println!("{}", greeting("Sara"));
}
```
```error auto lines=10
```

`text` is created inside the function and dropped when the function ends. A reference to it would point at freed memory.

**Repairs:**

- Return the owned value: `-> String`, and return `text`.
- A reference may be returned only if it points into something that the caller passed in.

### E0106: missing lifetime specifier

```rust fail E0106
fn pick(a: &str, b: &str) -> &str {
    if a.len() > b.len() { a } else { b }
}

fn main() {
    println!("{}", pick("a", "bc"));
}
```
```error auto lines=12
```

The function returns a reference, there are two references among the parameters, and the compiler cannot guess which one the result is tied to.

**Repairs:**

- Say it: `fn pick<'a>(a: &'a str, b: &'a str) -> &'a str` ([chapter 21](#lifetimes)).
- In a struct: `struct Parser<'a> { input: &'a str }`, or own the data with a `String`.
- If the function creates the value, return an owned type.

### E0716: a temporary value is dropped while borrowed

```rust fail E0716
fn main() {
    let word: &str = String::from("  padded  ").trim();
    println!("{word}");
}
```
```error auto lines=12
```

`String::from(…)` creates a value that belongs to no variable. It lives only until the end of the statement, and `trim` returns a reference into it.

**Repairs:**

- Give the value a name first: `let text = String::from("  padded  "); let word = text.trim();`.

### E0373: a closure may outlive the function

```rust fail E0373
use std::thread;

fn main() {
    let name = String::from("Sara");
    let handle = thread::spawn(|| println!("{name}"));
    handle.join().unwrap();
}
```
```error auto lines=12
```

The closure borrows `name`, and a new thread may run longer than the function that started it.

**Repairs:**

- `move`: `thread::spawn(move || …)` gives the closure ownership.
- To share with several threads: `Arc::clone` for each one, then `move` ([chapter 31](#shared-state)).
- To really borrow: `thread::scope` ([chapter 30](#threads)).

## Types and traits

### E0308: mismatched types

```rust fail E0308
fn main() {
    let count: u32 = "5";
    println!("{count}");
}
```
```error auto lines=10
```

The most frequent error of all. The compiler shows the type it expected and the type it found. Rust never converts between types silently.

**Repairs:**

- Text to number: `"5".parse::<u32>()` (a `Result`).
- Number to number: `x as f64`, or `u64::from(x)`.
- `&str` to `String`: `.to_string()`. `String` to `&str`: `&text`.
- `Option<T>` where `T` is expected: handle the `None` case first ([chapter 13](#enums)).
- "expected `()`, found …" at the end of a function: the return type is missing, or a `;` after the last expression threw the value away.

### E0277: a trait is not implemented

```rust fail E0277
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let p = Point { x: 1, y: 2 };
    println!("{}", p);
}
```
```error auto lines=12
```

An operation needs a trait that the type does not have. This one code covers many situations, and the summary line tells you which.

**Repairs:**

- "doesn't implement `Display`": print with `{:?}` after `#[derive(Debug)]`, or implement `Display` ([chapter 20](#traits)).
- "the `?` operator can only be used in a function that returns `Result`": give the function (also `main`) the return type `Result<(), Box<dyn std::error::Error>>`.
- "cannot add a float to an integer": convert one side, `count as f64 + 2.5`.
- "the trait bound `T: …` is not satisfied": add the bound to your generic function ([chapter 19](#generics)).
- "cannot be sent between threads safely": an `Rc` or `RefCell` crossed a thread. Use `Arc` and `Mutex` ([chapter 31](#shared-state)).
- "the size … cannot be known at compilation time": a `str` or `[T]` without `&`, or a `dyn Trait` without `Box`.

### E0599: no method with this name

```rust fail E0599
fn main() {
    let numbers = vec![3, 1, 2];
    let total: i32 = numbers.sum();
    println!("{total}");
}
```
```error auto lines=14
```

The type in front of the dot has no such method. Often the method exists on a neighbour: `sum` belongs to iterators, not to `Vec`.

**Repairs:**

- Read the `help`: here it suggests `.into_iter()` first. `numbers.iter().sum()` works too, and leaves the list usable.
- "the trait … is not in scope": add the `use` line that the compiler prints.
- On an `Option` or `Result`: get the value out first (`?`, `match`, `if let`).
- In generic code: the method comes from a trait that is missing in the bounds.

### E0369: this operator does not work on this type

```rust fail E0369
struct Money {
    cents: u64,
}

fn main() {
    let a = Money { cents: 5 };
    let b = Money { cents: 5 };
    println!("{}", a == b);
}
```
```error auto lines=14
```

Operators are traits: `==` is `PartialEq`, `<` is `PartialOrd`, `+` is `Add`. Your own types have none of them until you say so.

**Repairs:**

- `#[derive(PartialEq)]` for `==`, `#[derive(PartialOrd)]` for `<`.
- Implement `std::ops::Add` for `+` ([chapter 28](#advanced-traits)).
- In a generic function: add the bound, `T: PartialOrd`.

### E0282: type annotations needed

```rust fail E0282
fn main() {
    let numbers = "1 2 3".split(' ').collect();
    println!("{}", numbers.len());
}
```
```error auto lines=14
```

`collect` and `parse` can produce many types, and nothing here says which one you want. (The related codes E0283 and E0284 mean the same thing in slightly different situations.)

**Repairs:**

- Annotate the variable: `let numbers: Vec<&str> = …`. The compiler can fill in the rest: `Vec<_>`.
- Or name the type in the call: `.collect::<Vec<_>>()`, `.parse::<i32>()`.

### E0061: wrong number of arguments

```rust fail E0061
fn area(width: u32, height: u32) -> u32 {
    width * height
}

fn main() {
    println!("{}", area(3));
}
```
```error auto lines=12
```

Rust has no optional parameters and no default values for them.

**Repairs:**

- Pass every argument.
- For optional settings: an `Option<T>` parameter, a struct of options with `Default`, or a builder ([chapter 38](#idioms)).

## Names, modules and privacy

### E0425: cannot find this name

```rust fail E0425
fn main() {
    let total = 10;
    println!("{}", totl + 1);
}
```
```error auto lines=10
```

No variable, function or constant with this name is visible here. Usually it is a typing mistake, a name from another scope, or a missing `use`.

**Repairs:**

- Check the spelling: the compiler suggests similar names.
- A variable declared inside `{ }` is gone after the `}`.
- For a function in another module: `use crate::module::function;`.

### E0433: use of an undeclared type or module

```rust fail E0433
fn main() {
    let mut ages = HashMap::new();
    ages.insert("Sara", 31);
}
```
```error auto lines=12
```

The type exists, but this file has not imported it. A wrong path in a `use` line gives the related code E0432.

**Repairs:**

- Add the line from the `help`: `use std::collections::HashMap;`.
- For an external crate: is it in `Cargo.toml`? `cargo add name`.

### E0616: a private field

```rust fail E0616
mod bank {
    pub struct Account {
        balance: i64,
    }

    pub fn open() -> Account {
        Account { balance: 0 }
    }
}

fn main() {
    let account = bank::open();
    println!("{}", account.balance);
}
```
```error auto lines=10
```

Everything in a module is private unless marked `pub`, and the fields of a `pub struct` are private one by one. For a private function or type the code is E0603.

**Repairs:**

- Make the field public: `pub balance: i64`.
- Better, if the field has rules to protect: keep it private and add a method, `pub fn balance(&self) -> i64` ([chapter 17](#modules)).

## Patterns

### E0004: a `match` that does not cover everything

```rust fail E0004
enum Light {
    Red,
    Yellow,
    Green,
}

fn main() {
    let light = Light::Red;
    let action = match light {
        Light::Red => "stop",
        Light::Green => "go",
    };
    println!("{action}");
}
```
```error auto lines=12
```

A `match` must have an arm for every possible value. The compiler names the missing ones.

**Repairs:**

- Add the missing arm.
- Add a catch-all arm `_ => …`, if the rest really should be treated alike. For your own enums, prefer to list the variants: then the compiler reminds you when you add one.

### E0005: a pattern that might not match, in `let`

```rust fail E0005
fn main() {
    let input: Option<i32> = Some(5);
    let Some(n) = input;
    println!("{n}");
}
```
```error auto lines=12
```

A plain `let` needs a pattern that always fits. `Some(n)` does not fit `None`.

**Repairs:**

- `let Some(n) = input else { return; };`
- `if let Some(n) = input { … }`
- `match`, or a fallback: `input.unwrap_or(0)`.

## Types that the compiler cannot build

### E0072: a type of infinite size

```rust fail E0072
struct Folder {
    name: String,
    parent: Option<Folder>,
}

fn main() {}
```
```error auto lines=12
```

A `Folder` would contain a `Folder`, which contains a `Folder`, without end.

**Repairs:**

- Put the inner value behind a pointer: `Option<Box<Folder>>` ([chapter 27](#smart-pointers)).

### E0038: this trait cannot be used as `dyn`

```rust fail E0038
trait Shape {
    fn duplicate(&self) -> Self;
}

fn count(shapes: &[Box<dyn Shape>]) -> usize {
    shapes.len()
}

fn main() {
    println!("{}", count(&[]));
}
```
```error auto lines=12
```

Behind a `dyn Shape` the concrete type is unknown, so a method that returns `Self` or has type parameters cannot be called through it.

**Repairs:**

- Add `where Self: Sized` to that method: it is then left out of the trait object.
- Return `Box<dyn Shape>` in place of `Self`.
- Or use generics (`impl Shape`) where you do not need a mixed list ([chapter 28](#advanced-traits)).

### E0117: a foreign trait for a foreign type

```rust fail E0117
use std::fmt;

impl fmt::Display for Vec<String> {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.join(", "))
    }
}

fn main() {}
```
```error auto lines=10
```

You may implement a trait only if the trait or the type is defined in your crate. Otherwise two crates could both do it, in different ways.

**Repairs:**

- Wrap the type in a struct of your own: `struct Names(Vec<String>);`, and implement the trait for that ([chapter 28](#advanced-traits)).
- Or define your own trait and implement it for the foreign type.

## Unsafe and async

### E0133: an unsafe call outside an `unsafe` block

```rust fail E0133
unsafe fn danger() {}

fn main() {
    danger();
}
```
```error auto lines=10
```

The function has requirements that the compiler cannot check, and the caller must take responsibility in writing.

**Repairs:**

- `unsafe { danger(); }`, with a `// SAFETY:` comment that says why the requirements hold ([chapter 35](#unsafe)).

### E0728: `await` outside async code

```rust fail E0728
async fn fetch() -> u32 {
    7
}

fn main() {
    let n = fetch().await;
    println!("{n}");
}
```
```error auto lines=12
```

`.await` works only inside an `async fn` or an `async` block, and somebody has to run the future.

**Repairs:**

- Make the calling function `async`.
- At the top: `#[tokio::main] async fn main()`, or `runtime.block_on(…)` ([chapter 32](#async)).
- An async function that calls itself gives E0733: put the inner call in `Box::pin(…)`.

## Messages without a code

Mistakes in the *shape* of the code have no number. The most common ones:

| Message | Usual cause |
|---|---|
| `expected one of …, found …` | a missing `;`, `,` or `)` on the line **before** the one that is marked |
| `this file contains an unclosed delimiter` | a `{`, `(` or `[` that is never closed. The message shows the candidates: check the indentation there |
| `mismatched closing delimiter` | a `)` where a `}` belongs, or the other way round |
| `unknown start of token` | a character that Rust does not know, often curly quotation marks (`“ ”`) copied from a web page or a document. Type the quotation marks again |
| `expected expression, found …` | something is missing after an operator or a `=` |
| `cannot find macro … in this scope` | a missing `!` is not the problem here: the macro is not imported, or misspelled (`printn!`) |
| `expected `;`, found …` | a statement without its `;` |

## Warnings worth reading

A warning does not stop the build, and it is nearly always right.

| Warning | What it tells you |
|---|---|
| `unused variable` | a value is computed and never used: a forgotten step, or a typing mistake in a name. Start the name with `_` if it is on purpose |
| `variable does not need to be mutable` | remove the `mut` |
| `unused Result that must be used` | an error is being ignored. Handle it with `?`, or write `let _ = …;` to say that you mean it |
| `function is never used`, `field is never read` | dead code: delete it, or it is not finished yet |
| `unused import` | remove the `use` line |
| `unreachable pattern` | an earlier arm of the `match` already catches these values |
| `value assigned … is never read` | the variable is overwritten before anyone looks at it |
| `unused comparison`, `comparison is useless` | a test that is always true or always false, such as `x >= 0` for an unsigned number |

`cargo clippy` adds several hundred more checks of this kind ([chapter 40](#quality-tools)).
