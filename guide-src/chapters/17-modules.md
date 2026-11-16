@id modules
@part p3b
@title Organising code: packages, crates and modules
@short Modules and crates
@level intermediate
@time 35
@learn Explain what packages, crates and modules are | Group code into modules and control what is visible from outside | Refer to items with paths and shorten them with `use` | Split a program into several files | Build a library and a program in the same package

Keeping all code in one file can make a growing program harder to navigate and its dependencies harder to see. Rust lets you divide code into named modules, group related items, and control which items other parts of the crate may use. Modules are part of the language's visibility system, not only a way to split files.

:::analogy A company with departments
A company puts people into departments: sales, accounting, the workshop. Each department has a front desk that the rest of the company may talk to, and internal procedures that are nobody else's business. If accounting changes how it files its papers, nobody outside notices, as long as the front desk still answers the same questions. Modules are departments for code.
:::

## Three words: package, crate, module

| Word | What it is | You know it as |
|---|---|---|
| **Package** | A folder with a `Cargo.toml` file. It is what `cargo new` creates, and what you build, test and share | the `hello_rust` folder |
| **Crate** | One unit that the compiler translates as a whole. It is either a **binary crate** (a program with `fn main`) or a **library crate** (code for other programs to use) | `src/main.rs` and everything it pulls in |
| **Module** | A named group of items (functions, structs, enums, constants, other modules) inside a crate | new in this chapter |

A [[package]] contains one or more crates. Most contain one. A crate contains a tree of modules. The file where the compiler starts (`src/main.rs` for a program, `src/lib.rs` for a library) is called the **crate root**.

## Modules and privacy

A module is declared with `mod`. Start with modules written inside one file:

```rust run
mod kitchen {
    pub fn make_pizza() -> String {
        let dough = prepare_dough();
        format!("pizza made from {dough}")
    }

    fn prepare_dough() -> String {
        String::from("fresh dough")
    }
}

fn main() {
    println!("{}", kitchen::make_pizza());
}
```
```output
pizza made from fresh dough
```

- `mod kitchen { ... }` creates a module. Its contents are reached from outside with a **path**: `kitchen::make_pizza`.
- `pub` (for "public") makes an [[item]] usable from outside its module.
- `prepare_dough` has no `pub`. It is **private**: only code inside `kitchen` (and inside modules nested in it) can use it.

**Everything in Rust is private unless you write `pub`.** Trying to reach a private item from outside is a compile error:

```rust fail E0603
mod kitchen {
    pub fn make_pizza() -> String {
        prepare_dough()
    }

    fn prepare_dough() -> String {
        String::from("fresh dough")
    }
}

fn main() {
    println!("{}", kitchen::prepare_dough());
}
```
```error auto
```

:::key Why private by default?
Whatever is public is a promise: other code may depend on it, so changing it can break that code. Whatever is private can be rewritten freely. By making privacy the default, Rust keeps your promises few and deliberate. The set of public items of a module or crate is called its **[[API]]** (application programming interface): the "front desk" that others talk to.
:::

### Privacy for structs and enums

`pub` on a struct makes the *type* public. Its fields stay private unless each one is marked `pub` too. That is how a type protects its own rules:

```rust run
mod bank {
    pub struct Account {
        pub owner: String,
        balance: u64,          // private: only code in `bank` can touch it
    }

    impl Account {
        pub fn new(owner: &str) -> Self {
            Self { owner: owner.to_string(), balance: 0 }
        }

        pub fn deposit(&mut self, amount: u64) {
            self.balance += amount;
        }

        pub fn balance(&self) -> u64 {
            self.balance
        }
    }
}

fn main() {
    let mut account = bank::Account::new("Sara");
    account.deposit(500);
    println!("{} has {}", account.owner, account.balance());
}
```
```output
Sara has 500
```

Code outside `bank` can read the balance through the method `balance()`, but it cannot set it. It also cannot build an `Account` with `Account { owner: ..., balance: 1_000_000 }`, because that would need access to the private field. The only way in is `Account::new`. The module is now the single place that decides how a balance can change.

```rust fail E0616
mod bank {
    pub struct Account {
        balance: u64,
    }

    impl Account {
        pub fn new() -> Self {
            Self { balance: 0 }
        }
    }
}

fn main() {
    let mut account = bank::Account::new();
    account.balance = 1_000_000;
}
```
```error auto
```

A method that only returns a private field, like `balance()`, is called a **getter**. Rust names it after the field, without a `get_` in front.

For an **enum**, `pub` makes all its variants public. An enum is only useful if you can name its variants, so they are not hidden one by one.

### Finer levels of visibility

| Written as | Visible to |
|---|---|
| (nothing) | the current module and the modules inside it |
| `pub` | everyone who can reach the parent module |
| `pub(crate)` | the whole current crate, but not other crates that use it as a library |
| `pub(super)` | the parent module |

`pub(crate)` is very useful in libraries: it shares a helper between your own modules without making it part of the promise to the outside world.

## Paths: saying where something is

A path names an item by its location in the module tree, with `::` between the steps, like `/` in a file path.

```rust run
mod shop {
    pub mod stock {
        pub fn count() -> u32 {
            42
        }
    }

    pub mod report {
        pub fn print() {
            // absolute path: start at the crate root
            println!("in stock: {}", crate::shop::stock::count());
            // relative path: `super` is the parent module, here `shop`
            println!("in stock: {}", super::stock::count());
        }
    }
}

fn main() {
    shop::report::print();
}
```
```output
in stock: 42
in stock: 42
```

- **`crate::`** starts at the root of the current crate. It is like a path that begins with `/`.
- **`super::`** goes one level up, like `..` in a file path.
- **`self::`** means the current module. It is rarely needed.
- A path that starts with a plain name is looked up from the current module, as `shop::report::print()` in `main`.

Note that the inner modules are declared `pub mod`. A module is an item like any other, and private unless marked.

## `use`: shorter names

Writing a full path every time is tiring. `use` brings a name into the current scope, so you can write it without the path:

```rust run
use std::collections::HashMap;

mod shapes {
    pub fn area_of_square(side: f64) -> f64 {
        side * side
    }
    pub struct Circle {
        pub radius: f64,
    }
}

use shapes::Circle;

fn main() {
    let mut sizes = HashMap::new();
    let c = Circle { radius: 2.0 };
    sizes.insert("circle", c.radius);
    sizes.insert("square", shapes::area_of_square(3.0));
    println!("{:?} {:?}", sizes.get("circle"), sizes.get("square"));
}
```
```output
Some(2.0) Some(9.0)
```

A few conventions make code easier to read. They are habits, not rules of the language:

- For **types** (structs, enums), bring in the type itself: `use std::collections::HashMap;` and then write `HashMap`.
- For **functions**, bring in the parent module and keep one step of the path: `shapes::area_of_square(3.0)`. The reader sees at once that the function is not defined in this file.
- `use` lines go at the top of the file.

More forms of `use`:

```rust check
use std::cmp::Ordering;                    // one item
use std::collections::{HashMap, HashSet};  // several items from one place
use std::io::{self, Write};                // `std::io` itself and `std::io::Write`
use std::fmt::Result as FmtResult;         // a different local name, to avoid a clash
use std::collections::*;                   // everything public: the "glob" form
# fn main() {}
```

Use the glob form `*` sparingly. It hides where names come from. It is common in two places: in tests (`use super::*;`, see [chapter 27](#testing)) and for a library's **prelude**, a module that collects the names nearly every user needs.

:::plain Why `String`, `Vec` and `Option` need no `use`
Rust automatically brings a small set of names from the standard library into every file. It is called **the prelude**. It contains `String`, `Vec`, `Option`, `Result`, `Some`, `None`, `Ok`, `Err`, `Box`, and the most common traits. Everything else, such as `HashMap`, needs a `use` line.
:::

### Re-exporting with `pub use`

`pub use` brings a name into a module and at the same time makes it public *from there*. Library authors use it to offer a simple public structure that differs from the internal file structure:

```rust run
mod library {
    mod internal {
        pub mod parsing {
            pub fn parse_number(text: &str) -> i32 {
                text.trim().parse().unwrap_or(0)
            }
        }
    }

    pub use internal::parsing::parse_number;
}

fn main() {
    // callers do not need to know about `internal::parsing`
    println!("{}", library::parse_number(" 42 "));
}
```
```output
42
```

## Modules in separate files

Modules really pay off when each one lives in its own file. The rule is simple:

> `mod list;` (with a semicolon, and no braces) tells the compiler: "the contents of the module `list` are in another file". The compiler looks for `src/list.rs`.

Here is the to-do program from [chapter 21](#project-todo), split into three files:

```text
todo/
├── Cargo.toml
└── src/
    ├── main.rs       the crate root: the conversation with the user
    ├── command.rs    the module `command`: the Command enum and `parse`
    └── list.rs       the module `list`: Task and TodoList
```

```rust file=src/main.rs
mod command;
mod list;

use std::io;

use command::Command;
use list::TodoList;

fn main() {
    let mut list = TodoList::new();
    // ...
    // match command::parse(&input) { ... }
}
```

```rust file=src/list.rs
#[derive(Debug)]
struct Task {
    id: u32,
    title: String,
    done: bool,
}

pub struct TodoList {
    tasks: Vec<Task>,
    next_id: u32,
}

impl TodoList {
    pub fn new() -> Self {
        Self { tasks: Vec::new(), next_id: 1 }
    }

    pub fn add(&mut self, title: String) -> u32 {
        // ... as before
    }
    // mark_done, remove and print also get `pub`
}
```

```rust file=src/command.rs
pub enum Command {
    Add(String),
    List,
    Done(u32),
    Remove(u32),
    Help,
    Quit,
}

pub fn parse(line: &str) -> Result<Command, String> {
    // ... as before
}
```

What changed compared with the single file:

1. `main.rs` **declares** the two modules with `mod command;` and `mod list;`. Without these lines the compiler would not even look at the other files.
2. Everything that `main.rs` uses from the modules got a `pub`.
3. `Task` did **not** get a `pub`. Nothing outside `list.rs` ever names it. It has become an internal detail of the list, and you could change it completely without touching the other files.

:::warn `mod` is not `import`
In Python or JavaScript, every file that needs another file imports it. In Rust, a module is declared with `mod name;` **exactly once**, in its parent module (for a top-level module, that is the crate root). Every other place refers to it with a path or `use`. Writing `mod list;` in two files would create two different modules.

If `command.rs` needed something from `list.rs`, it would write `use crate::list::TodoList;`.
:::

### Modules inside modules

A module can have child modules. Their files go into a folder named after the parent:

```text
src/
├── main.rs            contains: mod shop;
├── shop.rs            contains: pub mod stock;  pub mod report;
└── shop/
    ├── stock.rs       the module shop::stock
    └── report.rs      the module shop::report
```

:::details The older layout: `mod.rs`
You will meet projects that use `src/shop/mod.rs` in place of `src/shop.rs`. Both mean the same, and both still work. The newer style (`shop.rs` next to the folder `shop/`) avoids having many files that are all called `mod.rs` open in your editor.
:::

## A library and a program in one package

A package can contain a library crate (`src/lib.rs`) **and** a binary crate (`src/main.rs`) at once. This is a very common structure for real programs:

```text
todo/
├── Cargo.toml         [package] name = "todo"
└── src/
    ├── lib.rs         the library crate, named `todo`
    ├── main.rs        the binary crate: a thin layer that uses the library
    ├── command.rs
    └── list.rs
```

```rust file=src/lib.rs
pub mod command;
pub mod list;
```

```rust file=src/main.rs
use std::io;

use todo::command::{self, Command};
use todo::list::TodoList;

fn main() {
    // ... exactly as before
}
```

The modules now belong to the **library**. The program in `main.rs` is a separate crate that uses the library through its name, `todo`, exactly as it would use a crate from the internet. It can only see what the library made `pub`.

Why bother?

- **Tests.** Code in a library is much easier to test ([chapter 27](#testing)).
- **Reuse.** Another program, such as a web version of the to-do list, could use the same library.
- **Discipline.** `main.rs` stays small: read the input, call the library, print the result.

Create a library-only package with `cargo new --lib name`.

## Crates from other people

You already used an external crate in the guessing game. The mechanism is the same module system:

```toml
[dependencies]
rand = "0.10"
```

After `cargo add rand` has written that line into `Cargo.toml`, the crate's name is available as the first step of a path: `rand::random_range(1..=100)`. The standard library is also a crate, called `std`, that is always available. [Chapter 32](#cargo) covers Cargo in depth, and [chapter 44](#crates) shows how to find and judge crates.

:::compare Module systems in other languages
- **Python and JavaScript:** every file is automatically a module, and the files import each other. Rust is different: files become part of the crate only through `mod` declarations, which form one tree from the crate root.
- **Java and C#:** `package` or `namespace` lines at the top of each file group classes, and `public`/`private` control visibility per class and per member. Rust's privacy boundary is the **[[module]]**, not the type: all code in the same module can see each other's private items.
- **C and C++:** the public face of a file is written a second time in a *header file*, which is copied into every file that uses it. Rust needs no headers. The `pub` keyword in the one and only source file says what is public.
:::

:::recap
- A package is a folder with `Cargo.toml`. It contains crates. A crate is a tree of modules, starting at the crate root (`main.rs` or `lib.rs`).
- `mod name { ... }` defines a module in place. `mod name;` loads it from `name.rs`.
- Everything is private by default. `pub` opens an item to the outside. Struct fields need their own `pub`.
- Paths use `::`. `crate::` starts at the root, and `super::` goes up one level.
- `use` shortens paths. `pub use` re-exports a name.
- A package can hold a library (`lib.rs`) and a program (`main.rs`) that uses it.
:::

:::quiz Check your understanding
? What is the visibility of a function declared without `pub` inside a module?
- It is visible everywhere in the crate
+ It is private: visible only in its own module and the modules nested inside it
- It is visible in the parent module only
- It cannot be called at all
= Private is the default. Code in the same module, and in child modules, can use the item. Code outside cannot.

? A struct is declared `pub struct User { name: String }` in a module. What can code outside that module do?
- Create it with `User { name: ... }` and read `name`
+ Name the type `User`, but neither read `name` nor create a `User` with struct syntax
- Nothing. The struct is private
- Read `name` but not change it
= `pub` on the struct makes only the type public. The field has no `pub`, so it is private. Outside code needs public functions such as `User::new` and getters.

? What does the line `mod network;` in `src/main.rs` do?
- It imports a crate called `network` from the internet
- It creates an empty module
+ It declares a module `network` whose contents are in `src/network.rs` (or `src/network/mod.rs`)
- It makes the module public
= `mod name;` with a semicolon tells the compiler to load the module from a file with that name.

? In a module `crate::shop::report`, what does `super::stock::count()` refer to?
- `crate::stock::count`
+ `crate::shop::stock::count`
- `crate::shop::report::stock::count`
- A function of the standard library
= `super` is the parent module of the current one. The parent of `shop::report` is `shop`, so the path is `shop::stock::count`.

? Why would you put most of a program's code into `src/lib.rs` and keep `src/main.rs` small?
- Programs run faster that way
- Cargo requires it
+ The library part is easier to test and can be reused by other programs
- Because `main.rs` cannot contain structs
= A library crate has a clear public API, can be tested directly, and can serve several programs. `main.rs` then only connects it to the outside world.
:::

:::exercise guided A geometry module
In one file, write a module `geometry` with two public functions, `rectangle_area(w: f64, h: f64) -> f64` and `circle_area(r: f64) -> f64`, and one **private** constant `PI` with the value `3.14159`. Call both functions from `main`. Then try to print `geometry::PI` from `main` and read the error.
::hint
Inside the module: `const PI: f64 = 3.14159;` without `pub`. The functions inside the module can use `PI` directly. Call them as `geometry::circle_area(1.0)`.
::solution
```rust run
mod geometry {
    const PI: f64 = 3.14159;

    pub fn rectangle_area(w: f64, h: f64) -> f64 {
        w * h
    }

    pub fn circle_area(r: f64) -> f64 {
        PI * r * r
    }
}

fn main() {
    println!("{}", geometry::rectangle_area(3.0, 4.0));
    println!("{:.2}", geometry::circle_area(1.0));
}
```
```output
12
3.14
```

`PI` is an internal detail. Printing `geometry::PI` from `main` gives error E0603, "constant `PI` is private". If the module later switched to the more precise `std::f64::consts::PI`, no code outside would have to change, because no code outside could ever depend on the private constant.
:::

:::exercise practice Repair the visibility
This program has three visibility mistakes. Fix it by adding `pub` in the right places, and nothing else. It should print `Lena (admin: false)`.

```rust
mod users {
    struct User {
        name: String,
        admin: bool,
    }

    impl User {
        fn new(name: &str) -> User {
            User { name: name.to_string(), admin: false }
        }

        pub fn is_admin(&self) -> bool {
            self.admin
        }
    }
}

fn main() {
    let user = users::User::new("Lena");
    println!("{} (admin: {})", user.name, user.is_admin());
}
```
::hint
`main` names the type `users::User`, calls `User::new`, and reads the field `name`. Each of the three needs to be public. The field `admin` does not: it is only read through the method.
::solution
```rust run
mod users {
    pub struct User {
        pub name: String,
        admin: bool,
    }

    impl User {
        pub fn new(name: &str) -> User {
            User { name: name.to_string(), admin: false }
        }

        pub fn is_admin(&self) -> bool {
            self.admin
        }
    }
}

fn main() {
    let user = users::User::new("Lena");
    println!("{} (admin: {})", user.name, user.is_admin());
}
```
```output
Lena (admin: false)
```

The type, the constructor and the `name` field are part of the public face. The `admin` field stays private. That is a real protection: no code outside `users` can turn a user into an administrator by writing `user.admin = true`.
:::

:::exercise challenge A temperature that is always valid
Write a module `thermo` with a struct `Celsius` that can never hold a temperature below absolute zero (−273.15 °C).

- `Celsius::new(value: f64) -> Option<Celsius>` returns `None` for impossible values.
- `value(&self) -> f64` returns the number.
- `to_fahrenheit(&self) -> f64` converts it (multiply by 9/5 and add 32).

Make sure that code outside the module cannot create an invalid `Celsius` in any way.
::hint
Use a tuple struct with a private field: `pub struct Celsius(f64);`. Because the field is private, `thermo::Celsius(-500.0)` does not compile outside the module, and `new` is the only way to get a value.
::solution
```rust run
mod thermo {
    const ABSOLUTE_ZERO: f64 = -273.15;

    #[derive(Debug, Clone, Copy)]
    pub struct Celsius(f64);

    impl Celsius {
        pub fn new(value: f64) -> Option<Celsius> {
            if value >= ABSOLUTE_ZERO {
                Some(Celsius(value))
            } else {
                None
            }
        }

        pub fn value(&self) -> f64 {
            self.0
        }

        pub fn to_fahrenheit(&self) -> f64 {
            self.0 * 9.0 / 5.0 + 32.0
        }
    }
}

use thermo::Celsius;

fn main() {
    match Celsius::new(21.5) {
        Some(t) => println!("{} °C is {:.1} °F", t.value(), t.to_fahrenheit()),
        None => println!("impossible temperature"),
    }
    println!("{:?}", Celsius::new(-500.0));
}
```
```output
21.5 °C is 70.7 °F
None
```

This combines three ideas: the newtype pattern from [chapter 17](#structs), `Option` for a constructor that can refuse, and a private field. Together they give a guarantee: **if a `Celsius` exists, it is valid.** Every function that receives a `Celsius` can rely on that and needs no check of its own. The condition `value >= ABSOLUTE_ZERO` also rejects the special float value NaN, because every comparison with NaN is false.
:::
