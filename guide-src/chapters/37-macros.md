@id macros
@part p3c
@title Macros: code that writes code
@short Macros
@level advanced
@time 45
@learn Explain what a macro is and how it differs from a function | Write declarative macros with `macro_rules!`, including repetition | Use the built-in macros and the common attributes | Describe the three kinds of procedural macros and write a simple derive macro | Decide when a macro is the right tool

The `!` in `println!` marks a macro invocation. Unlike an ordinary function call, a macro expands into code during compilation. Rust has declarative macros, procedural macros and compiler-provided derives; this chapter explains how to recognise them and how to define a declarative macro for a repeated pattern.

:::plain Declarative and procedural macros
A **[[macro]]** is code that runs at compile time and produces code. `macro_rules!` matches token patterns and re-emits tokens, which is how `vec![]` and `println!` are written; it is hygienic, so names introduced inside do not leak out. **Procedural** macros are separate crates that take a token stream and return one: `#[derive(Clone)]` is a derive macro, `#[inline]` is an attribute macro, and `sqlx::query!` is a function-like macro that can check SQL against a live database at compile time. Macros are the escape hatch for what borrowing and generics cannot express; reach for a function first, and a macro only when the syntax itself must be new.
:::

:::analogy A rubber stamp
An office that writes the same paragraph into hundreds of letters gets a rubber stamp made. Pressing the stamp produces the full text, and nobody has to write it out again. Some stamps have blanks that are filled in each time, such as a date. A macro is a stamp for code: you write a short form, and the compiler expands it into the full code before the program is built.
:::

A macro runs **at compile time**. Its input is a piece of source code, and its output is other source code, which the compiler then translates as if you had typed it. This is called **metaprogramming**: writing programs that produce programs.

| | Function | Macro |
|---|---|---|
| Works on | values, when the program runs | pieces of code, when the program is compiled |
| Number of arguments | fixed | any number (`println!("{} {}", a, b)`) |
| Can create new items (structs, functions, `impl` blocks) | no | yes |
| Can use syntax that is not ordinary Rust | no | yes (`vec![0; 10]`, SQL or HTML inside a macro) |
| Ease of reading and debugging | easy | harder |

That last row is why the rule is: **use a function when a function can do the job**. Reach for a macro when you hit one of the limits in the table.

## Declarative macros: `macro_rules!`

The simplest way to write a macro works by pattern matching, much like `match`. It matches pieces of code and fills in a template.

```rust run
macro_rules! square {
    ($x:expr) => {
        $x * $x
    };
}

fn main() {
    println!("{}", square!(7));
    println!("{}", square!(2 + 3));
}
```
```output
49
25
```

- `macro_rules! square` defines a macro called `square`.
- `($x:expr) => { ... }` is a **rule**: a pattern on the left, and a template on the right.
- `$x:expr` matches any **expression** and names it `$x`. The part after the colon is the kind of code to match, a **fragment specifier**.
- In the template, `$x` is replaced by the matched code.

Notice `square!(2 + 3)`, which gives 25. The macro does not paste text. It treats `2 + 3` as one expression, as if it were in parentheses. Macros in C work on raw text, and the same macro there would compute `2 + 3 * 2 + 3`, which is 11. This is a classic bug that Rust's macros cannot have.

The most common fragment specifiers:

| Specifier | Matches | Example |
|---|---|---|
| `expr` | an expression | `2 + 3`, `name.len()`, `"text"` |
| `ident` | a name (identifier) | `count`, `Point`, `my_function` |
| `ty` | a type | `i32`, `Vec<String>`, `&str` |
| `literal` | a literal value | `42`, `"hello"`, `true` |
| `pat` | a pattern | `Some(x)`, `1..=5`, `_` |
| `block` | a block in braces | `{ let a = 1; a + 1 }` |
| `stmt` | a statement | `let x = 5` |
| `item` | an item | a `fn`, `struct`, `impl` … |
| `tt` | a single token, or a group in brackets ("token tree") | almost anything |

### Several rules

A macro can have several rules. The first one that fits is used:

```rust run
macro_rules! describe {
    () => {
        println!("nothing")
    };
    ($single:expr) => {
        println!("one value: {}", $single)
    };
    ($first:expr, $second:expr) => {
        println!("two values: {} and {}", $first, $second)
    };
}

fn main() {
    describe!();
    describe!(42);
    describe!("a", "b");
}
```
```output
nothing
one value: 42
two values: a and b
```

A function cannot do this. Rust functions have one fixed list of parameters.

### Repetition

To accept *any* number of arguments, a pattern can contain a repetition:

```rust run
macro_rules! sum {
    ( $( $number:expr ),* ) => {
        0 $( + $number )*
    };
}

fn main() {
    println!("{}", sum!());
    println!("{}", sum!(5));
    println!("{}", sum!(1, 2, 3, 4));
}
```
```output
0
5
10
```

Read `$( $number:expr ),*` as "zero or more expressions, separated by commas, each called `$number`":

- `$( ... )` encloses the part that repeats.
- `,` after the parenthesis is the separator.
- `*` means zero or more. `+` means one or more, and `?` means zero or one.

In the template, `$( + $number )*` is written out once for every matched expression. So `sum!(1, 2, 3, 4)` becomes `0 + 1 + 2 + 3 + 4`.

Here is a small version of the standard `vec!` macro, and a macro for map literals, which the standard library does not have:

```rust run
use std::collections::HashMap;

macro_rules! my_vec {
    ( $( $item:expr ),* $(,)? ) => {{
        let mut list = Vec::new();
        $( list.push($item); )*
        list
    }};
}

macro_rules! map {
    ( $( $key:expr => $value:expr ),* $(,)? ) => {{
        let mut map = HashMap::new();
        $( map.insert($key, $value); )*
        map
    }};
}

fn main() {
    let numbers = my_vec![1, 2, 3];
    let ages = map! {
        "Sara" => 29,
        "Tomas" => 41,
    };
    println!("{:?} {:?} {}", numbers, ages.get("Sara"), ages.len());
}
```
```output
[1, 2, 3] Some(29) 2
```

- The template has **double braces**. The outer pair belongs to the macro syntax. The inner pair makes the result one block expression, so that it can stand after `let numbers =`.
- `$(,)?` allows an optional comma after the last item.
- The `map!` pattern contains `=>` as plain text that must appear between key and value. A macro can define its own little syntax.
- A macro can be called with `()`, `[]` or `{}`. All three mean the same. By convention, `[]` is used for list-like macros and `{}` for block-like ones.

### Macros that call themselves

A rule can use the macro again. This is how to process a list step by step:

```rust run
macro_rules! maximum {
    ($single:expr) => {
        $single
    };
    ($first:expr, $( $rest:expr ),+ ) => {
        {
            let a = $first;
            let b = maximum!( $( $rest ),+ );
            if a > b { a } else { b }
        }
    };
}

fn main() {
    println!("{}", maximum!(3));
    println!("{}", maximum!(3, 9, 4));
    println!("{}", maximum!(2.5, 1.5));
}
```
```output
3
9
2.5
```

`maximum!(3, 9, 4)` compares 3 with `maximum!(9, 4)`, which compares 9 with `maximum!(4)`, which is 4. The macro works for any type that can be compared, with no generics in sight, because it produces fresh code for each use.

### Hygiene

The template of `maximum!` declares variables called `a` and `b`. What if the calling code has its own `a`?

```rust run
macro_rules! double {
    ($value:expr) => {{
        let a = $value;
        a * 2
    }};
}

fn main() {
    let a = 10;
    println!("{}", double!(a + 1));
    println!("{a}");
}
```
```output
22
10
```

Nothing goes wrong. Variables created inside a macro live in a separate world from the variables at the place where the macro is used, even when they have the same name. This property is called **hygiene**, and it removes a whole family of bugs that plague text-based macros in other languages.

### Generating items

Macros earn their keep when they remove repetition that functions and generics cannot remove. A typical case is implementing a trait for many types:

```rust run
trait Describe {
    fn describe(&self) -> String;
}

macro_rules! impl_describe {
    ( $( $type:ty => $name:literal ),* $(,)? ) => {
        $(
            impl Describe for $type {
                fn describe(&self) -> String {
                    format!("{} {}", $name, self)
                }
            }
        )*
    };
}

impl_describe! {
    i32 => "the whole number",
    f64 => "the decimal number",
    bool => "the truth value",
    char => "the character",
}

fn main() {
    println!("{}", 42.describe());
    println!("{}", 2.5.describe());
    println!("{}", true.describe());
    println!("{}", 'x'.describe());
}
```
```output
the whole number 42
the decimal number 2.5
the truth value true
the character x
```

Four `impl` blocks were written by the macro. The standard library does this on a large scale: the arithmetic traits for all the number types are produced by macros.

A macro can also create names. With `ident`, it can define functions, structs and enums:

```rust run
macro_rules! make_enum {
    ($name:ident { $( $variant:ident ),* $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq)]
        enum $name {
            $( $variant ),*
        }

        impl $name {
            const ALL: &'static [$name] = &[ $( $name::$variant ),* ];

            fn name(&self) -> &'static str {
                match self {
                    $( $name::$variant => stringify!($variant) ),*
                }
            }
        }
    };
}

make_enum!(Weekday { Mon, Tue, Wed, Thu, Fri });

fn main() {
    println!("{}", Weekday::ALL.len());
    println!("{:?} is called {}", Weekday::Wed, Weekday::Wed.name());
    let names: Vec<&str> = Weekday::ALL.iter().map(|d| d.name()).collect();
    println!("{:?}", names);
}
```
```output
5
Wed is called Wed
["Mon", "Tue", "Wed", "Thu", "Fri"]
```

One line produced an enum, a list of all its variants, and a method that returns each variant's name. `stringify!` turns code into a string literal. If a variant is added later, the list and the method can never be forgotten.

### Where a macro is visible

Macros follow slightly different rules from other items:

- Inside a file, a macro can only be used **after** its definition. Define macros at the top.
- To offer a macro to other crates, put `#[macro_export]` above it. It is then available at the root of your crate: `use my_crate::my_macro;`.
- Inside an exported macro, refer to your crate's own items with `$crate::`, as in `$crate::helpers::run()`. That path works wherever the macro is used.

### Seeing what a macro produces

When a macro misbehaves, look at its output. Install the tool once with `cargo install cargo-expand`, and then `cargo expand` prints your program with all macros expanded. This is what `println!("{}", sum!(1, 2));` turns into, slightly simplified:

```text
{
    ::std::io::_print(format_args!("{0}\n", 0 + 1 + 2));
};
```

## The macros that come with Rust

You know most of these. A few are worth pointing out.

| Macro | What it does |
|---|---|
| `println!`, `print!`, `eprintln!`, `eprint!` | print to standard output or standard error |
| `format!`, `write!`, `writeln!` | format into a `String`, or into a writer |
| `vec!` | create a `Vec` |
| `assert!`, `assert_eq!`, `assert_ne!` | check a condition, panic if it fails |
| `debug_assert!` and friends | the same, but only in debug builds |
| `panic!`, `todo!`, `unimplemented!`, `unreachable!` | stop the program with a message |
| `matches!` | does a value fit a pattern? gives a `bool` |
| `dbg!` | print an expression with its file and line, and return its value |
| `include_str!("file.txt")` | put the content of a file into the program as a `&'static str`, at compile time |
| `include_bytes!("logo.png")` | the same, as bytes |
| `env!("CARGO_PKG_VERSION")` | the value of an environment variable at compile time |
| `concat!`, `stringify!` | join literals, or turn code into text |
| `file!`, `line!`, `column!`, `module_path!` | the current place in the source code |
| `cfg!(...)` | test a compile-time condition, as a `bool` |
| `compile_error!("message")` | stop the compilation with your own error message |

`dbg!` deserves more use than it gets. It is the quickest way to look at a value while hunting a bug:

```rust run
fn main() {
    let width = 4;
    let area = dbg!(width * 3) + 1;
    dbg!(area);
}
```

It prints to standard error, with the file, line and column of each call:

```text
[src/main.rs:3:16] width * 3 = 12
[src/main.rs:4:5] area = 13
```

`dbg!` gives back the value it was handed, so it can be wrapped around any part of an expression without changing the program. Remove it when you are done.

## Attributes

An **[[attribute]]** is a note for the compiler, written as `#[...]` above an item. You have used several. Here are the ones that matter most:

| Attribute | Effect |
|---|---|
| `#[derive(Debug, Clone)]` | generate trait implementations |
| `#[cfg(test)]`, `#[cfg(target_os = "windows")]` | include the item only under a condition |
| `#[test]`, `#[should_panic]`, `#[ignore]` | mark and configure tests |
| `#[allow(dead_code)]`, `#[warn(...)]`, `#[deny(...)]` | switch compiler warnings off, on, or into errors |
| `#[must_use]` | warn when the return value of this function is ignored |
| `#[deprecated(note = "use new_name")]` | warn everyone who still uses this item |
| `#[inline]` | suggest that the compiler pastes the function's body into its callers |
| `#[non_exhaustive]` | users of this enum or struct must allow for additions in future versions |
| `#[repr(C)]` | lay out the data as a C compiler would ([chapter 41](#memory-layout)) |
| `#[macro_export]` | make a `macro_rules!` macro usable from other crates |

An attribute with an exclamation mark, `#![...]`, applies to the whole enclosing file or crate. It goes at the very top.

**Conditional compilation** with `cfg` lets one code base serve several platforms:

```rust run
#[cfg(target_os = "windows")]
fn line_ending() -> &'static str {
    "\r\n"
}

#[cfg(not(target_os = "windows"))]
fn line_ending() -> &'static str {
    "\n"
}

fn main() {
    println!("{:?}", line_ending());

    if cfg!(debug_assertions) {
        println!("this is a debug build");
    }
}
```
```output
"\n"
this is a debug build
```

Only one of the two functions exists in the compiled program. (On Windows, the first line of the output is `"\r\n"`.)

## Procedural macros

`macro_rules!` matches patterns. A **[[procedural macro]]** is more powerful: it is an ordinary Rust function that runs inside the compiler. It receives code as a stream of tokens, can analyse it in any way, and returns new code. There are three kinds:

This section teaches the idea and builds one small derive macro end to end. Two Definitive chapters return to procedural macros as a craft: [DevOps and tooling](#devops-tooling) covers developing, testing and publishing a macro crate, and [advanced patterns](#advanced-patterns) walks through a full derive with error spans and attribute macros that define a small language. Learn what a procedural macro *is* here; open those chapters when you are ready to ship one.

| Kind | Looks like | Examples |
|---|---|---|
| Derive macro | `#[derive(Name)]` | `Serialize`, `Deserialize` (serde), `Parser` (clap), `Error` (thiserror) |
| Attribute macro | `#[name]` above an item | `#[tokio::main]`, `#[tokio::test]` |
| Function-like macro | `name!(...)` | `sqlx::query!("SELECT …")`, which checks SQL at compile time |

Much of the comfort of Rust's ecosystem comes from derive macros. You write `#[derive(Serialize)]` above a struct, and a macro writes the hundred lines that turn it into JSON.

### Writing a derive macro

A procedural macro must live in a crate of its own, of a special type. The example has two packages side by side: the macro, and a program that uses it.

```text
describe_derive/        the macro
├── Cargo.toml
└── src/lib.rs
app/                    a program that uses it
├── Cargo.toml
└── src/main.rs
```

```toml
# describe_derive/Cargo.toml
[package]
name = "describe_derive"
version = "0.1.0"
edition = "2024"

[lib]
proc-macro = true

[dependencies]
quote = "1.0.47"
syn = "3.0.10"
```

Two helper crates do the hard work. **`syn`** parses the token stream into a syntax tree that you can inspect. **`quote`** turns Rust code that you write, with placeholders, back into tokens.

The macro `Describe` adds a function `describe()` that reports the name of a struct and its fields:

```rust file=describe_derive/src/lib.rs
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Data, DeriveInput, Fields};

#[proc_macro_derive(Describe)]
pub fn derive_describe(input: TokenStream) -> TokenStream {
    // 1. Turn the tokens of the struct into a syntax tree
    let input = parse_macro_input!(input as DeriveInput);
    let name = &input.ident;

    // 2. Collect the names of the fields
    let field_names: Vec<String> = match &input.data {
        Data::Struct(data) => match &data.fields {
            Fields::Named(fields) => fields
                .named
                .iter()
                .filter_map(|field| field.ident.as_ref().map(|ident| ident.to_string()))
                .collect(),
            _ => Vec::new(),
        },
        _ => {
            return syn::Error::new_spanned(name, "Describe can only be derived for structs")
                .to_compile_error()
                .into();
        }
    };

    // 3. Write the new code
    let output = quote! {
        impl #name {
            pub fn describe() -> String {
                let fields: &[&str] = &[#(#field_names),*];
                format!("{} has {} fields: {}", stringify!(#name), fields.len(), fields.join(", "))
            }
        }
    };
    output.into()
}
```

The three steps are typical for every derive macro:

1. **Parse.** `parse_macro_input!` produces a `DeriveInput`, a description of the struct or enum under the `#[derive]`. `input.ident` is its name.
2. **Analyse.** The `match` looks into the struct and collects the field names. For an enum, the macro returns a proper compiler error that points at the offending name.
3. **Generate.** Inside `quote! { ... }` you write the code to produce. `#name` inserts a value from the macro, and `#(#field_names),*` repeats for every element of a list, like `$( ... ),*` in `macro_rules!`.

The program depends on the macro crate through a path:

```toml
# app/Cargo.toml
[dependencies]
describe_derive = { path = "../describe_derive" }
```

```rust file=app/src/main.rs
use describe_derive::Describe;

#[derive(Describe)]
struct Customer {
    name: String,
    email: String,
    orders: u32,
}

fn main() {
    println!("{}", Customer::describe());
}
```
```output
Customer has 3 fields: name, email, orders
```

And deriving it for an enum gives the error the macro defined:

```text
error: Describe can only be derived for structs
 --> src/main.rs:4:6
  |
4 | enum Colour {
  |      ^^^^^^
```

Normal Rust code cannot find out the names of a struct's fields while it runs. A procedural macro can, because it looks at the source code itself.

:::note The cost of procedural macros
Procedural macros must be compiled before the code that uses them, and `syn` is a large crate. Projects that use many of them compile more slowly. That is a fair price for `serde` or `clap`. For your own small conveniences, `macro_rules!` or a plain function is usually the better choice.
:::

## When to write a macro

Ask these questions in order, and stop at the first "yes":

1. Can a **function** do it? Use a function.
2. Can a **generic function or a trait** do it? Use that.
3. Do you need a variable number of arguments, new items, or a special syntax? Then use **`macro_rules!`**.
4. Do you need to analyse the structure of types, as `derive` does? Then write a **procedural macro**, or look for a crate that has done it already.

Macros have real costs. Error messages point into expanded code and can be hard to read. Editor features such as "go to definition" work less well inside them. And a reader must learn each macro's private rules. A good macro is small, well documented, and looks as much like ordinary Rust as possible.

:::compare Macros in other languages
- **C and C++** have a *preprocessor* that replaces text before the compiler sees it. It knows nothing about the language, is not hygienic, and is behind many subtle bugs. Rust's macros work on parsed code.
- **Lisp** languages are the origin of macros that transform code as data. Rust's design owes much to Scheme's hygienic macros.
- **Python decorators** and **Java annotations** look like Rust's attributes, and serve similar purposes, but work mostly at run time through reflection.
- **C++ templates** and **Zig's `comptime`** are other ways to compute at compile time. Rust has `const fn` for that purpose as well: ordinary functions that the compiler can run while compiling.
:::

:::recap
- A macro transforms code at compile time. The `!` marks a macro call.
- `macro_rules!` matches patterns such as `$x:expr` and fills in templates. `$( ... ),*` repeats.
- Declarative macros are hygienic: their variables cannot clash with yours.
- Macros can generate items: functions, `impl` blocks, enums.
- Attributes (`#[derive]`, `#[cfg]`, `#[must_use]`, …) give instructions to the compiler.
- Procedural macros are Rust functions from tokens to tokens: derive, attribute and function-like. `syn` parses, `quote` generates.
- Prefer functions, generics and traits. Use a macro when they cannot express what you need.
:::

:::quiz Check your understanding
? When does a macro do its work?
- While the program runs
- Only in debug builds
- When the program is installed
+ At compile time, before the program is built
= A macro is expanded into ordinary code by the compiler. The running program contains only the result.

? What does `$( $x:expr ),*` match?
- Exactly one expression
- One or more expressions separated by spaces
+ Zero or more expressions separated by commas
- A block of code
= `$( ... )` is a repetition, `,` is the separator, and `*` means zero or more.

? Given `macro_rules! twice { ($x:expr) => { $x * 2 }; }`, what is `twice!(1 + 4)`?
- 9, because it becomes `1 + 4 * 2`
- 8
- A compile error
+ 10, because `$x` is treated as one whole expression
= A matched `expr` stays one unit. Rust's macros do not substitute raw text, unlike the C preprocessor.

? Which of these can a function **not** do, so that a macro is needed?
- Return two values
- Take a closure as an argument
- Work with several types
+ Accept any number of arguments of different types, as `println!` does
= Functions have a fixed parameter list. Generics cover "several types", and tuples cover "two values".

? What kind of macro is `#[derive(Serialize)]`?
+ A procedural derive macro
- A declarative macro written with `macro_rules!`
- A function-like macro
- It is not a macro
= Derive macros are procedural macros that receive the definition of a struct or enum and generate additional code for it.
:::

:::exercise guided A macro with two forms
Write a macro `greet!` with two rules. `greet!()` prints `Hello, world!`. `greet!("Sara")` prints `Hello, Sara!`. Then add a third rule that accepts any number of names, separated by commas, and greets each one.
::hint
The first two rules are `() => { ... };` and `($name:expr) => { ... };`. The third is `( $( $name:expr ),+ ) => { $( greet!($name); )+ };`. It calls the macro itself once per name. Put the single-name rule before the list rule.
::solution
```rust run
macro_rules! greet {
    () => {
        println!("Hello, world!")
    };
    ($name:expr) => {
        println!("Hello, {}!", $name)
    };
    ( $( $name:expr ),+ ) => {
        $( greet!($name); )+
    };
}

fn main() {
    greet!();
    greet!("Sara");
    greet!("Tomas", "Lena", "Abel");
}
```
```output
Hello, world!
Hello, Sara!
Hello, Tomas!
Hello, Lena!
Hello, Abel!
```

The rules are tried from top to bottom. A single name fits the second rule. Several names fit only the third, which expands to one `greet!` call per name, and each of those uses the second rule. Building a list-handling rule out of a single-item rule keeps macros short.
:::

:::exercise practice A set literal
Write a macro `set!` that builds a `HashSet`: `set![1, 2, 3]`. It should accept a trailing comma, and `set![]` should give an empty set.
::hint
Model it on `my_vec!`. Create the set with `HashSet::new()`, and insert each item in a repetition. Remember the double braces, so that the result is one expression.
::solution
```rust run
use std::collections::HashSet;

macro_rules! set {
    () => {
        HashSet::new()
    };
    ( $( $item:expr ),+ $(,)? ) => {{
        let mut set = HashSet::new();
        $( set.insert($item); )+
        set
    }};
}

fn main() {
    let primes = set![2, 3, 5, 7, 5, 2];
    let empty: HashSet<i32> = set![];
    println!("{} {} {}", primes.len(), primes.contains(&5), empty.is_empty());
}
```
```output
4 true true
```

Duplicates disappear, because the items go into a set. The empty case has a rule of its own. With a single rule and `*`, the call `set![]` would expand to a `let mut set` that is never changed, and the compiler would warn about the needless `mut`. For the empty set, the element type cannot be worked out from any item, so the variable needs a type annotation. The variable called `set` inside the macro cannot collide with a variable of that name at the call site, thanks to hygiene.
:::

:::exercise practice Generate the boring code
You have three newtypes for ids: `UserId(u32)`, `OrderId(u32)` and `ProductId(u32)`. Each should get `#[derive(Debug, Clone, Copy, PartialEq)]`, a constructor `new`, a method `value()`, and a `Display` implementation that prints, for example, `UserId#7`. Write one macro `id_type!` that creates all of this from the name.
::hint
The pattern is `($name:ident) => { ... }`. In the template, write the struct and the two `impl` blocks, using `$name` wherever the type's name appears. `stringify!($name)` gives the name as text for the `Display` output.
::solution
```rust run
use std::fmt;

macro_rules! id_type {
    ($name:ident) => {
        #[derive(Debug, Clone, Copy, PartialEq)]
        struct $name(u32);

        impl $name {
            fn new(value: u32) -> Self {
                $name(value)
            }

            fn value(&self) -> u32 {
                self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
                write!(f, "{}#{}", stringify!($name), self.0)
            }
        }
    };
}

id_type!(UserId);
id_type!(OrderId);
id_type!(ProductId);

fn main() {
    let user = UserId::new(7);
    let order = OrderId::new(7);
    let product = ProductId::new(120);
    println!("{user} {order} {product} {}", user.value() + order.value() + product.value());
    // user == order   // does not compile: different types
}
```
```output
UserId#7 OrderId#7 ProductId#120 134
```

Three types with identical behaviour, defined in three lines. They are still distinct types: comparing a `UserId` with an `OrderId` is a compile error, which is the purpose of the newtypes. Generics could not have produced this, because the task was to create new *types with new names*.
:::

:::exercise challenge Tests from a table
Testing a function with many inputs leads to many near-identical test functions. Write a macro `test_cases!` that takes a function name and a list of `test_name: input => expected` entries, and generates one `#[test]` function per entry. Use it to test `fn double(n: i32) -> i32`.
::hint
The pattern is `($function:ident, $( $test_name:ident : $input:expr => $expected:expr ),* $(,)? )`. The template repeats `#[test] fn $test_name() { assert_eq!($function($input), $expected); }`.
::solution
```rust test
pub fn double(n: i32) -> i32 {
    n * 2
}

macro_rules! test_cases {
    ($function:ident, $( $test_name:ident : $input:expr => $expected:expr ),* $(,)? ) => {
        $(
            #[test]
            fn $test_name() {
                assert_eq!($function($input), $expected);
            }
        )*
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    test_cases! {
        double,
        doubles_a_positive_number: 4 => 8,
        doubles_zero: 0 => 0,
        doubles_a_negative_number: -3 => -6,
        doubles_a_large_number: 1_000_000 => 2_000_000,
    }
}
```

Each entry becomes a separate test function with its own name. If one case fails, `cargo test` names exactly that case, and the others still run. A single test with four assertions would stop at the first failure.

The macro generates functions, which only a macro can do. This "table-driven" style is common enough that crates exist for it, such as `rstest` and `test-case`. Having written a small version yourself, you know what they do.
:::
