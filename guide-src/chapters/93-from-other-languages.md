@id from-other-languages
@part app
@kind appendix
@title Coming from another language
@short From other languages
@level all

If you already program in another language, most of what you know still holds: variables, functions, loops, collections and tests work as you expect. This page is a translation table for the rest. Find your language, read which Rust feature takes the place of each thing you are used to, and follow the link to the chapter.

## The six differences that matter

Whatever language you come from, these are the places where your habits will not work.

| In most languages | In Rust | Chapter |
|---|---|---|
| A garbage collector, or `free` by hand, cleans up memory | Every value has one owner, and is freed when the owner goes out of scope | [9](#ownership) |
| Any number of references can point at an object and change it | Many readers or one writer, checked by the compiler | [10](#borrowing) |
| `null`, `nil` or `None` can turn up anywhere | A value that may be missing has the type `Option<T>`, and you must handle both cases | [13](#enums) |
| Errors are exceptions that fly up the call stack | Errors are values of type `Result<T, E>`, passed on with `?` | [18](#errors) |
| Classes inherit from classes | Structs hold data, traits describe behaviour, and there is no inheritance | [20](#traits) |
| Variables can be changed, and conversions happen silently | Nothing changes without `mut`, and nothing is converted unless you write it | [3](#variables), [4](#types) |

The first weeks feel slow, because the compiler rejects programs that every other language would let you run. Each rejection stands for a bug that you would otherwise have found later, by testing or in production.

## From Python

| Python | Rust | Chapter |
|---|---|---|
| `list`, `dict`, `set`, `tuple` | `Vec<T>`, `HashMap<K, V>`, `HashSet<T>`, tuples. All elements of a collection have one type | [15](#collections) |
| `None` | `Option<T>`: `Some(x)` or `None` | [13](#enums) |
| `try` / `except` / `raise` | `Result`, `match`, `?` | [18](#errors) |
| `class` with `__init__` | `struct` with an `impl` block and a `new` function | [12](#structs) |
| `__str__`, `__repr__`, `__eq__`, `__lt__`, `__hash__` | `Display`, `Debug`, `PartialEq`, `PartialOrd`, `Hash`, mostly through `#[derive]` | [20](#traits) |
| `[f(x) for x in xs if p(x)]` | `xs.iter().filter(p).map(f).collect()` | [25](#iterators) |
| `for i, x in enumerate(xs)`, `zip(a, b)` | `.iter().enumerate()`, `.zip()` | [25](#iterators) |
| `f"{name}: {value:.2f}"` | `format!("{name}: {value:.2}")` | [11](#slices-strings) |
| `with open(...) as f:` | no special syntax: the file is closed when its variable goes out of scope | [9](#ownership), [18](#errors) |
| duck typing | traits and generics: "any type that can do this" is written down and checked | [19](#generics), [20](#traits) |
| `lambda x: x + 1` | `\|x\| x + 1` | [24](#closures) |
| `pip`, `venv`, `pyproject.toml`, `pytest` | all in one tool, Cargo: `cargo add`, `Cargo.toml`, `cargo test` | [34](#cargo), [22](#testing) |
| `import json` | the crate `serde_json` | [43](#serde) |
| threads held back by the global lock; `asyncio` | threads that really run in parallel; `async` with Tokio | [30](#threads), [32](#async) |

What will surprise you:

- **Types everywhere, but rarely written.** The compiler works most of them out. You write them in function signatures.
- **Integers have a size** and can overflow. `7 / 2` is `3`, and `7.0 / 2.0` is `3.5`. An integer and a float cannot be mixed without `as`.
- **`text[0]` does not exist.** A string is UTF-8, and a character can take several bytes ([chapter 11](#slices-strings)).
- **No default values for parameters and no keyword arguments.** Use `Option`, a struct of options, or a builder ([chapter 41](#idioms)).
- **Speed.** A loop in Rust runs at the speed of C. You no longer need a library written in another language for the heavy parts, and you can write such a library for Python yourself with PyO3 ([chapter 39](#ffi)).

## From JavaScript and TypeScript

| JavaScript / TypeScript | Rust | Chapter |
|---|---|---|
| `const x`, `let x` | `let x`, `let mut x`. A `let` without `mut` also protects the content, not only the name | [3](#variables) |
| `number` | `i32`, `u64`, `f64` and others: you choose | [4](#types) |
| `null`, `undefined`, `x?.y`, `x ?? d` | `Option<T>`, `x.map(\|v\| v.y)`, `x.unwrap_or(d)` | [13](#enums), [41](#idioms) |
| object literal `{ a: 1 }`, `interface` for its shape | `struct` | [12](#structs) |
| union type `"a" \| "b"`, discriminated unions | `enum`, with data in the variants | [13](#enums) |
| `interface` with methods | `trait` | [20](#traits) |
| `try` / `catch` / `throw` | `Result`, `?` | [18](#errors) |
| `arr.map().filter().reduce()` | the same names on iterators. They are lazy, so end with `collect()`, `sum()` or `fold()` | [25](#iterators) |
| `Promise`, `async` / `await` | `Future`, `async` / `.await`. A future does nothing until it is awaited or spawned | [32](#async) |
| `JSON.parse`, `JSON.stringify` | `serde_json`, into typed structs | [43](#serde) |
| `npm`, `package.json`, `node_modules` | `cargo`, `Cargo.toml`, one shared cache | [34](#cargo) |
| `===` | `==`. There is only one kind of equality, and it never converts | [4](#types) |
| Express, Fastify | Axum | [46](#web) |
| code in the browser | WebAssembly, with Leptos, Yew or Dioxus | [49](#apps) |

What will surprise you:

- **`await` comes after the expression**: `fetch(url).await`. That makes chains readable: `client.get(url).send().await?.json().await?`.
- **One thread is not the rule.** A Tokio program runs tasks on several threads at once, so shared data needs `Arc` and a lock, and the compiler insists on it.
- **A closure does not keep its surroundings alive.** There is no garbage collector, so a closure that outlives its function must own what it uses: `move` ([chapter 24](#closures)).
- **A struct has exactly the fields it declares.** For data of unknown shape there is `serde_json::Value`.

## From Java, C# and Kotlin

| Java / C# / Kotlin | Rust | Chapter |
|---|---|---|
| `class` | `struct` and `impl` | [12](#structs) |
| `interface` | `trait`. Default methods work the same way | [20](#traits) |
| `abstract class`, `extends` | no inheritance: a trait for shared behaviour, a field for shared data | [20](#traits) |
| `record`, `data class` | `struct` with `#[derive(Debug, Clone, PartialEq)]` | [12](#structs) |
| `enum`; sealed classes and interfaces | `enum`, with data in the variants | [13](#enums) |
| `null`, `Optional<T>`, `T?` | `Option<T>`. No reference is ever null | [13](#enums) |
| exceptions, `try` / `catch` / `finally` | `Result` and `?`. Clean-up happens in `Drop` | [18](#errors), [27](#smart-pointers) |
| `try`-with-resources, `using` | automatic: every value is cleaned up at the end of its scope | [9](#ownership) |
| generics | generics with trait bounds. A separate copy is compiled for each type, so they cost nothing at run time | [19](#generics) |
| `equals`, `hashCode`, `toString`, `compareTo` | `PartialEq`, `Hash`, `Display` or `Debug`, `Ord` | [20](#traits) |
| `synchronized`, `lock` | `Mutex<T>`: the data lives inside the lock and cannot be reached without it | [31](#shared-state) |
| `Stream`, LINQ | iterators | [25](#iterators) |
| packages, namespaces | modules and crates | [17](#modules) |
| Maven, Gradle, NuGet, JUnit | Cargo and `cargo test` | [34](#cargo), [22](#testing) |
| reflection, annotations processed at run time | macros that generate code at compile time | [37](#macros) |

What will surprise you:

- **There is no base class to put shared code in.** See the worked example below.
- **Values are not references by default.** A struct sits directly where it is declared, on the stack or inside another struct. A heap allocation is something you ask for, with `Box`, `Vec` or `String`.
- **No run time to start, and nothing to install on the target machine.** The result of a build is one program file.
- **Dependency injection frameworks are rare.** Pass what a function needs as a parameter, as a trait if tests need a fake ([chapter 36](#testing-strategies)).

## From C and C++

| C / C++ | Rust | Chapter |
|---|---|---|
| `T*` that may be null and may dangle | `&T` and `&mut T` (never null, never dangling), `Option<&T>`, and raw pointers in `unsafe` code | [10](#borrowing), [38](#unsafe) |
| `malloc` / `free`, `new` / `delete` | `Box::new`, and freeing is automatic | [27](#smart-pointers) |
| `std::unique_ptr`, `std::shared_ptr`, `std::weak_ptr` | `Box`, `Rc` or `Arc`, `Weak` | [27](#smart-pointers) |
| `std::vector`, `std::string`, `std::string_view`, `std::span` | `Vec`, `String`, `&str`, `&[T]` | [11](#slices-strings), [15](#collections) |
| `std::optional`, `std::variant`, `std::expected` | `Option`, `enum`, `Result` | [13](#enums) |
| RAII, destructors | the same idea, with `Drop` | [27](#smart-pointers) |
| `std::move` leaves an object in a "valid but unspecified" state | a move is the default, and the old variable cannot be used any more | [9](#ownership) |
| `const` on request | immutable unless `mut` | [3](#variables) |
| templates, concepts | generics with trait bounds, checked where the generic code is written, not where it is used | [19](#generics) |
| virtual functions | `dyn Trait` | [20](#traits) |
| header files, `#include` | modules. No declarations ahead of use, no include order | [17](#modules) |
| `#define`, template tricks | `macro_rules!` and procedural macros, `const fn`, const generics | [37](#macros) |
| `std::mutex` beside the data it protects | `Mutex<T>` around the data | [31](#shared-state) |
| undefined behaviour anywhere | only inside `unsafe` blocks | [38](#unsafe) |
| CMake, Make, vcpkg, Conan | Cargo | [34](#cargo) |
| exceptions, error codes | `Result`. A panic is for bugs, not for expected failures | [18](#errors) |

What will surprise you:

- **The borrow checker rejects patterns that you know to be correct**, such as two pointers into the same structure. Some need a different design (indices in place of pointers), some need `Rc<RefCell<T>>`, and a few really need `unsafe` behind a safe interface.
- **Integer overflow is defined**: a panic in debug builds, wrapping in release builds. The conversion rules are explicit, with no silent promotion.
- **No copy constructors.** A copy that costs something is always visible as `.clone()`.
- **You can keep your C and C++ code.** Rust calls it and can be called from it ([chapter 39](#ffi)).

## From Go

| Go | Rust | Chapter |
|---|---|---|
| goroutines | threads for computation, async tasks for waiting on the network | [30](#threads), [32](#async) |
| `chan`, `select` | `std::sync::mpsc` or Tokio channels, `tokio::select!` | [30](#threads), [32](#async) |
| `interface`, satisfied without saying so | `trait`, implemented with an explicit `impl Trait for Type` | [20](#traits) |
| `if err != nil { return err }` | `?` | [18](#errors) |
| `fmt.Errorf("…: %w", err)` | an error with a `source`, or `anyhow`'s `.context(…)` | [18](#errors) |
| `nil` | `Option<T>` | [13](#enums) |
| `defer` | `Drop`: clean-up runs when the value goes out of scope | [27](#smart-pointers) |
| zero values | `Default`, on request | [20](#traits) |
| slices and `map` | `Vec<T>` and `&[T]`, `HashMap<K, V>` | [15](#collections) |
| `struct` embedding | a field, with the calls passed on by hand | [20](#traits) |
| `go mod`, `go test`, `gofmt`, `go vet` | `cargo`, `cargo test`, `cargo fmt`, `cargo clippy` | [34](#cargo), [35](#quality-tools) |
| the race detector, at run time | data races are compile errors | [31](#shared-state) |

What will surprise you:

- **More language to learn**, and a slower compiler. In return there is no garbage collector, no `nil` pointer panic, and enums with data.
- **Async is not built in.** You choose a runtime (nearly always Tokio), and a function is either `async` or not.
- **Unused variables and imports are warnings**, not errors.

## A class hierarchy, translated

The most common question from object-oriented languages is: where do I put what used to be a base class? A base class does three jobs at once, and Rust has a separate tool for each.

| A base class gives you | In Rust |
|---|---|
| a list of kinds that is known and fixed | an `enum`, and `match` |
| a common interface for kinds that others may add | a `trait`, used through generics or `dyn` |
| methods written once for all kinds | default methods in the trait |
| fields that all kinds share | a struct with those fields, placed inside each kind |

```rust run
use std::f64::consts::PI;

// 1. A fixed list of kinds: an enum.
enum Shape {
    Circle { radius: f64 },
    Rectangle { width: f64, height: f64 },
}

impl Shape {
    fn area(&self) -> f64 {
        match self {
            Shape::Circle { radius } => PI * radius * radius,
            Shape::Rectangle { width, height } => width * height,
        }
    }
}

// 2. An open list of kinds: a trait. Anyone can add a kind.
trait Customer {
    fn name(&self) -> String;

    // 3. Written once, like a method of a base class. It calls the method
    //    that every kind supplies, and a kind may replace it.
    fn greeting(&self) -> String {
        format!("Hello {}!", self.name())
    }
}

// 4. Shared fields: a struct of their own, inside each kind.
struct Contact {
    email: String,
}

struct Person {
    contact: Contact,
    first_name: String,
}

struct Company {
    contact: Contact,
    title: String,
}

impl Customer for Person {
    fn name(&self) -> String {
        self.first_name.clone()
    }
}

impl Customer for Company {
    fn name(&self) -> String {
        format!("{} Ltd.", self.title)
    }

    fn greeting(&self) -> String {
        format!("Dear team of {},", self.name())
    }
}

fn main() {
    let shapes = [Shape::Circle { radius: 1.0 }, Shape::Rectangle { width: 2.0, height: 3.0 }];
    for shape in &shapes {
        println!("{:.2}", shape.area());
    }

    let sara = Person {
        contact: Contact { email: String::from("sara@example.com") },
        first_name: String::from("Sara"),
    };
    let acme = Company {
        contact: Contact { email: String::from("office@acme.example") },
        title: String::from("Acme"),
    };
    println!("{} {}", sara.contact.email, acme.contact.email);

    let customers: Vec<Box<dyn Customer>> = vec![Box::new(sara), Box::new(acme)];
    for customer in &customers {
        println!("{}", customer.greeting());
    }
}
```
```output auto
```

Which of the first two to choose? If *you* know all the kinds, and new *operations* are added more often than new kinds, take the enum: every `match` is checked for completeness. If users of your code must be able to add kinds, take the trait.

The other three words of object-oriented programming translate like this:

- **Encapsulation** is done by modules, not by classes. Fields are private to the module unless marked `pub` ([chapter 17](#modules)).
- **Polymorphism** has three forms: generics (decided at compile time, fastest), `dyn Trait` (decided at run time, allows mixed lists), and enums ([chapter 20](#traits), [chapter 28](#advanced-traits)).
- **Inheritance of implementation** does not exist. Where you would have overridden one method of a large base class, pass the varying part in: as a closure, or as a value of a trait ([chapter 24](#closures)).

## Habits to leave behind, and habits to keep

| Leave behind | Do this |
|---|---|
| objects that point at each other in all directions | one owner per value; refer to other values by an index or a key |
| a `null` check here and there | `Option`, handled once, at the place where the value enters |
| catching every exception at the top | return `Result`, add context on the way up, report once in `main` |
| a base class "for later" | start with plain structs and functions; add a trait when a second kind appears |
| getters and setters for every field | public fields for plain data; private fields and methods where a rule must hold |
| cloning or locking everything until it compiles | ask who should own the data ([chapter 41](#idioms)) |

Keep: small functions, clear names, tests, code review, and measuring before optimising. Those are the same in every language.
