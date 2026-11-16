@id quality-tools
@part p3b
@title Tools for quality: formatting, linting, debugging, CI
@short Quality tools
@level intermediate
@time 40
@learn Format code automatically with rustfmt | Find mistakes and unidiomatic code with Clippy | Configure lints for a whole project | Debug with `dbg!`, backtraces and a debugger | Set up continuous integration that checks every change

The compiler catches many kinds of mistakes, but it does not check formatting, every style issue or all likely bugs. Rust's toolchain includes tools such as rustfmt and Clippy for those jobs. Teams choose which checks to run locally and in continuous integration; using them consistently makes code easier to review and maintain.

:::plain rustfmt, Clippy, and the toolchain
The three tools that keep a Rust codebase uniform are all one command away. **rustfmt** rewrites layout — line breaks, spacing, import order — so nobody argues about style and diffs stay small. **[[Clippy]]** is a few hundred lints beyond the compiler's, catching `&Vec<T>` parameters, redundant clones, `if let` chains that want `match`, and off-by-one iterator mistakes, with `#[allow(clippy::…)]` when you genuinely mean it. **[[cargo]] doc** builds the API documentation from your doc comments, and `cargo audit`/`cargo deny` check dependencies for known vulnerabilities and licence problems. Run them in CI with `-D warnings`, so a clean local run and a green build mean the same thing.
:::

:::analogy A kitchen check before service
A chef does not wait until the restaurant is full to inspect the pans. Quality tools are the same: they scan the code before the pressure is high, telling you if the style is consistent or if something looks suspicious.
:::

## rustfmt: one style for everyone

`cargo fmt` rewrites your source files in the official Rust style: indentation, spaces, line breaks, the order of imports. Take this cramped code:

```rust
use std::collections::HashMap;
fn main(){
let mut stock:HashMap<&str,u32>=HashMap::new();
    stock.insert("tea",12);stock.insert( "milk" , 3 );
  for (name,count) in &stock { if *count<5 {println!("{name} is running low: {count}");} }
}
```

After `cargo fmt`:

```rust run nocmp
use std::collections::HashMap;
fn main() {
    let mut stock: HashMap<&str, u32> = HashMap::new();
    stock.insert("tea", 12);
    stock.insert("milk", 3);
    for (name, count) in &stock {
        if *count < 5 {
            println!("{name} is running low: {count}");
        }
    }
}
```
```output
milk is running low: 3
```

The program is the same. Only the layout changed.

| Command | Effect |
|---|---|
| `cargo fmt` | format all files of the package |
| `cargo fmt --check` | change nothing. Report differences and fail if there are any (for automated checks) |

Nearly every Rust project uses the default style, which means that all Rust code looks familiar, and nobody spends time arguing about brace positions. Set up your editor to format on save, and you never think about layout again. A few options can be set in a file `rustfmt.toml`, for example `max_width = 100`. To keep a hand-aligned table as it is, put `#[rustfmt::skip]` above the item.

## Clippy: a reviewer that never tires

**Clippy** is a **linter**: a tool that reads code and points out constructs that are legal but suspicious, slow, or more complicated than necessary. Such a check is called a **[[lint]]**. Clippy has more than 750 of them.

Here is code that compiles without any complaint from the compiler:

```rust
fn average(numbers: &Vec<f64>) -> f64 {
    let mut total = 0.0;
    for i in 0..numbers.len() {
        total = total + numbers[i];
    }
    return total / numbers.len() as f64;
}

fn describe(value: Option<i32>) -> String {
    if value.is_some() {
        format!("got {}", value.unwrap())
    } else {
        "nothing".to_string()
    }
}

fn main() {
    let numbers = vec![1.0, 2.0, 3.0];
    let empty = numbers.len() == 0;
    println!("{} {} {}", average(&numbers), describe(Some(3)), empty);
}
```

`cargo clippy` finds six things to improve. Three of its messages, shortened:

```text
warning: writing `&Vec` instead of `&[_]` involves a new object where a slice will do
 --> src/main.rs:1:21
  |
1 | fn average(numbers: &Vec<f64>) -> f64 {
  |                     ^^^^^^^^^
  |
  = help: for further information visit https://rust-lang.github.io/rust-clippy/rust-1.100.0/index.html#ptr_arg
help: change this to
  |
1 - fn average(numbers: &Vec<f64>) -> f64 {
1 + fn average(numbers: &[f64]) -> f64 {

warning: the loop variable `i` is only used to index `numbers`
 --> src/main.rs:3:14
  |
3 |     for i in 0..numbers.len() {
  |              ^^^^^^^^^^^^^^^^
help: consider using an iterator
  |
3 -     for i in 0..numbers.len() {
3 +     for <item> in &numbers {

warning: called `unwrap` on `value` after checking its variant with `is_some`
  --> src/main.rs:11:27
   |
10 |     if value.is_some() {
   |     ------------------ help: try: `if let Some(<item>) = value`
11 |         format!("got {}", value.unwrap())
   |                           ^^^^^^^^^^^^^^
```

The other three are the needless `return`, `total = total + …` (use `+=`), and `len() == 0` (use `is_empty()`). Each message names the lint, shows the better form, and links to a page that explains the reasoning. After following the advice:

```rust run
fn average(numbers: &[f64]) -> f64 {
    let total: f64 = numbers.iter().sum();
    total / numbers.len() as f64
}

fn describe(value: Option<i32>) -> String {
    match value {
        Some(n) => format!("got {n}"),
        None => "nothing".to_string(),
    }
}

fn main() {
    let numbers = vec![1.0, 2.0, 3.0];
    let empty = numbers.is_empty();
    println!("{} {} {}", average(&numbers), describe(Some(3)), empty);
}
```
```output
2 got 3 false
```

| Command | Effect |
|---|---|
| `cargo clippy` | lint the package |
| `cargo clippy --all-targets` | also lint tests, examples and benchmarks |
| `cargo clippy --fix` | apply the suggestions that are safe to apply automatically |
| `cargo clippy -- -D warnings` | treat every warning as an error (for automated checks) |

### Lint groups and levels

Clippy's lints are sorted into groups:

| Group | Default | Contents |
|---|---|---|
| `clippy::correctness` | error | code that is almost certainly wrong |
| `clippy::suspicious` | warning | code that is probably wrong |
| `clippy::style` | warning | unidiomatic code |
| `clippy::complexity` | warning | code that can be simpler |
| `clippy::perf` | warning | code that can be faster |
| `clippy::pedantic` | off | strict lints, with some false alarms |
| `clippy::restriction` | off | lints for special policies, such as "no `unwrap`". Pick single ones, never the whole group |

Every lint, from Clippy or from the compiler itself, has a **level**: `allow` (off), `warn`, `deny` (an error), or `forbid` (an error that cannot be switched off further down). Levels can be set for one item with an attribute, or for the whole package in `Cargo.toml`:

```rust run
#[allow(clippy::too_many_arguments)]
fn draw(x: i32, y: i32, width: i32, height: i32, red: u8, green: u8, blue: u8, alpha: u8) -> i32 {
    x + y + width + height + i32::from(red) + i32::from(green) + i32::from(blue) + i32::from(alpha)
}

fn main() {
    println!("{}", draw(1, 2, 3, 4, 5, 6, 7, 8));
}
```
```output
36
```

```toml
# Cargo.toml
[lints.rust]
unsafe_code = "forbid"
missing_docs = "warn"

[lints.clippy]
unwrap_used = "warn"
pedantic = { level = "warn", priority = -1 }
```

When you switch a lint off, add a comment with the reason. `#[expect(lint_name)]` is a stricter relative of `#[allow]`: it silences the lint and warns you if the lint no longer fires, so that stale exceptions do not pile up.

:::tip Clippy as a teacher
Run Clippy on everything you write while learning. Its suggestions preview many of the idioms gathered later in [chapter 43](#idioms), applied to your own code at the moment you need them. Read the linked explanations. Do not treat the list as orders, though: if a suggestion makes the code less clear, keep your version and allow the lint with a reason.
:::

## The compiler's own help

- **`rustc --explain E0382`** prints a long explanation of an error code, with examples. The same texts are online in the error index.
- **`cargo fix`** applies the fixes that the compiler suggests in its messages.
- **`cargo check`** after every few lines keeps problems small.

A method for reading a long error message: read the first line (what), look at the code location and the labels in the excerpt (where), then read the `help:` and `note:` lines at the end, which very often contain the fix. Fix the **first** error and compile again. Later errors are frequently consequences of the first.

## rust-analyzer: the tools inside your editor

**rust-analyzer** is the program that makes an editor understand Rust. It works with VS Code, Zed, Neovim, Emacs, Helix and others, and RustRover has the same features built in. What to learn to use:

- **Inlay hints**: the editor shows the inferred type next to each variable. This is a great help while learning.
- **Errors while typing**, with **quick fixes** on a key press: add a missing `use`, fill in the arms of a `match`, implement the missing methods of a trait.
- **Go to definition** and **find all references**, which also work for the standard library and your dependencies.
- **Hover** for the documentation of anything.
- **Rename** a function or type across the whole project.
- **Run and debug** buttons above `main` and above each test.
- **Expand macro**, to see what a macro produces.

## Debugging

When a program compiles and does the wrong thing, you need to see inside it.

### Printing

The simplest tool is often enough. `dbg!` prints an expression, its value and its location to standard error, and passes the value on:

```rust run
fn mean(values: &[f64]) -> f64 {
    let total: f64 = values.iter().sum();
    dbg!(total, values.len());
    total / values.len() as f64
}

fn main() {
    println!("{}", mean(&[2.0, 4.0, 9.0]));
}
```
```output
5
```

```text
[src/main.rs:3:5] total = 15.0
[src/main.rs:3:5] values.len() = 3
```

For structs, derive `Debug` and print with `{:#?}`. For a program that runs for a long time, replace ad hoc printing with proper **logging**, which can be switched on and off by level. The crates for that, `log` and `tracing`, are covered in [chapter 77](#crates).

### Backtraces

After a panic, run the program again with `RUST_BACKTRACE=1` to see the chain of calls that led there:

```text
$ RUST_BACKTRACE=1 cargo run
thread 'main' panicked at src/main.rs:8:5:
index out of bounds: the len is 3 but the index is 7
stack backtrace:
   0: __rustc::rust_begin_unwind
             at /rustc/0ef1bc38…/library/std/src/panicking.rs:676:5
   1: core::panicking::panic_fmt
             at /rustc/0ef1bc38…/library/core/src/panicking.rs:80:14
   2: core::panicking::panic_bounds_check
             at /rustc/0ef1bc38…/library/core/src/panicking.rs:271:5
   3: demo::lookup
             at ./src/main.rs:8:5
   4: demo::process
             at ./src/main.rs:3:5
   5: demo::main
             at ./src/main.rs:13:20
note: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.
```

Read it from the top down until you reach the first entry that belongs to your own code. The entries above it are the standard library's panic machinery. Here, the panic happened in `lookup`, which was called by `process`, which was called by `main`, each with its file and line.

### A real debugger

A **debugger** stops the program at a line you choose (a **breakpoint**) and lets you look at every variable, then continue one line at a time. In VS Code, install the extension **CodeLLDB** alongside rust-analyzer. A "Debug" link then appears above `main` and above every test. Click in the margin to set a breakpoint, and start.

| Action | What it does |
|---|---|
| Continue | run to the next breakpoint |
| Step over | execute the current line, without going into the functions it calls |
| Step into | go into the function that the current line calls |
| Step out | run until the current function returns |
| Watch | keep an expression in view while stepping |

On the command line, `rust-gdb` and `rust-lldb` start the classic debuggers with support for Rust's types. Debug a **debug build**: in a release build, the optimiser has rearranged the code and removed variables.

### A method for finding bugs

1. **Reproduce it.** Find the smallest input that shows the problem.
2. **Write a failing test** for it. Now you can tell when it is fixed.
3. **Form one hypothesis** and check it with a print or a breakpoint. Halve the search space each time: is the value still right at this point?
4. **Fix the cause**, and not only the symptom.
5. **Keep the test.**

## Checking your dependencies

A program is also everything it depends on.

| Tool | What it checks |
|---|---|
| `cargo audit` | known security vulnerabilities in your dependencies, from the RustSec advisory database |
| `cargo deny` | vulnerabilities, licences, unwanted or duplicated crates, according to rules you set |
| `cargo outdated` | dependencies that are behind |
| `cargo machete` | dependencies that are declared and never used |
| `cargo tree -d` | crates that are compiled in two different versions |

## Continuous integration

**Continuous integration**, or **[[CI]]**, means that a server runs all your checks automatically for every change pushed to the repository. Nobody can forget to run the tests, and a mistake is caught minutes after it is made. On GitHub, a file in the folder `.github/workflows/` is enough:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

env:
  CARGO_TERM_COLOR: always

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - name: Format
        run: cargo fmt --all --check
      - name: Lint
        run: cargo clippy --all-targets --all-features -- -D warnings
      - name: Test
        run: cargo test --all-features
      - name: Documentation
        run: cargo doc --no-deps
        env:
          RUSTDOCFLAGS: -D warnings
```

The four steps are the standard quartet: **format, lint, test, document**. The `RUSTDOCFLAGS: -D warnings` line turns every documentation warning — a broken intra-doc link, a code example in a doc comment that no longer compiles — into a failed build, which is how documentation stays true.

One more line earns its place in any project that reads a database:

```yaml
      - name: Test
        run: cargo test --all-features
        env:
          SQLX_OFFLINE: "true"
```

`SQLX_OFFLINE=true` tells SQLx to check its queries against the saved description in the `.sqlx/` folder instead of connecting to a live database ([chapter 71](#databases)). The cache step keeps compiled dependencies between runs, which saves minutes. Larger projects add a matrix that runs the tests on Linux, Windows and macOS, a job on the oldest supported Rust version, and `cargo audit` on a schedule.

Run the same commands yourself before you push. Many people put them in a script, or use a tool such as `just`, a simple command runner:

```text
# justfile
check:
    cargo fmt --all --check
    cargo clippy --all-targets --all-features -- -D warnings
    cargo test --all-features
```

:::compare Tooling in other languages
Formatters and linters exist everywhere: Prettier and ESLint for JavaScript, Black and Ruff for Python, clang-format and clang-tidy for C++, `gofmt` and `go vet` for Go. In most ecosystems they are separate projects that must be chosen, installed and configured, and teams differ. Rust follows Go's example: one official formatter, one official linter, both installed with the compiler. A Rust project you have never seen before is built, tested, formatted and linted with the same four commands as your own.
:::

:::recap
- `cargo fmt` formats code in the one standard style. `cargo fmt --check` verifies it.
- `cargo clippy` finds likely bugs and unidiomatic, complicated or slow code, and explains each finding.
- Lint levels (`allow`, `warn`, `deny`, `forbid`) are set per item with attributes, or per package in `[lints]`.
- rust-analyzer brings types, errors, quick fixes and navigation into the editor.
- Debug with `dbg!`, `RUST_BACKTRACE=1`, and a debugger with breakpoints. Turn every bug into a test.
- `cargo audit` and `cargo deny` check dependencies.
- CI runs format, lint, test and documentation checks on every change.
:::

:::quiz Check your understanding
? What does `cargo fmt --check` do?
- It formats all files
- It checks the code for bugs
- It checks the dependencies
+ It reports whether any file differs from the standard format, without changing anything
= The `--check` form is for automation: it fails if formatting is needed, so that unformatted code cannot be merged.

? Which of these would Clippy typically point out?
+ A loop `for i in 0..v.len()` that only uses `i` to index `v`
- A missing semicolon
- A type mismatch
- A variable that was moved
= The first, second and fourth are compiler errors. Clippy works on code that already compiles, and suggests the clearer or faster form.

? What does `cargo clippy -- -D warnings` achieve in CI?
- It hides all warnings
+ It turns every warning into an error, so that the check fails if any lint fires
- It deletes the code that causes warnings
- It runs Clippy twice
= `-D warnings` means "deny warnings". The pipeline then fails for any new warning, which keeps the code base clean.

? A program panics deep inside a call chain. How do you see which functions called which?
- Run `cargo fmt`
- Use `cargo tree`
+ Run it with the environment variable `RUST_BACKTRACE=1`
- Add `#[derive(Debug)]`
= The backtrace lists the active function calls at the moment of the panic, with file and line for your own code.

? Why turn a bug into a test before fixing it?
- Tests run faster than programs
- The compiler requires it
- It makes the fix unnecessary
+ The test proves the bug exists, shows when it is fixed, and guards against its return
= A failing test is a precise description of the bug. Once it passes, it stays as a regression test.
:::

:::exercise guided Clean up with the tools
Create a new project, paste this code into `src/main.rs`, and run `cargo fmt` and then `cargo clippy`. Apply every suggestion until Clippy is silent. The program should still print `total: 60`.

```rust
fn main(){
    let prices=vec![10,20,30];
    let mut total=0;
    for i in 0..prices.len(){ total=total+prices[i]; }
    if prices.len()>0 { println!("total: {}",total); }
}
```
::hint
Clippy will mention the index loop, the `total = total + …`, the length comparison, and a `vec!` where an array is enough. Work through the messages one at a time and run Clippy again after each change.
::solution
```rust run
fn main() {
    let prices = [10, 20, 30];
    let total: i32 = prices.iter().sum();
    if !prices.is_empty() {
        println!("total: {total}");
    }
}
```
```output
total: 60
```

`cargo fmt` fixed the spacing. Clippy then led to the rest, one lint after another: an array instead of a `Vec` that never grows (`useless_vec`), `+=` instead of `total = total + …` (`assign_op_pattern`), an iterator instead of the index loop (`needless_range_loop`), and `is_empty()` instead of `len() > 0` (`len_zero`). Once the loop was an iterator, the whole sum became one call. Five lines of careless code turned into four clear ones, guided by the tools.
:::

:::exercise practice Find the bug
This function should return the second-largest number in a list. It gives a wrong answer for some inputs. Find one such input, write a failing test, locate the mistake with `dbg!` or a debugger, and fix it.

```rust
fn second_largest(numbers: &[i32]) -> Option<i32> {
    let mut largest = i32::MIN;
    let mut second = i32::MIN;
    for &n in numbers {
        if n > largest {
            largest = n;
        } else if n > second {
            second = n;
        }
    }
    if numbers.len() < 2 { None } else { Some(second) }
}
```
::hint
Try a list in rising order, such as `[1, 2, 3]`. When a new largest value is found, what should happen to the old largest value?
::solution
```rust test
pub fn second_largest(numbers: &[i32]) -> Option<i32> {
    let mut largest = i32::MIN;
    let mut second = i32::MIN;
    for &n in numbers {
        if n > largest {
            second = largest;      // the fix: the old largest becomes the second
            largest = n;
        } else if n > second {
            second = n;
        }
    }
    if numbers.len() < 2 { None } else { Some(second) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rising_order() {
        assert_eq!(second_largest(&[1, 2, 3]), Some(2));
    }

    #[test]
    fn falling_order() {
        assert_eq!(second_largest(&[3, 2, 1]), Some(2));
    }

    #[test]
    fn too_short() {
        assert_eq!(second_largest(&[5]), None);
        assert_eq!(second_largest(&[]), None);
    }
}
```

For `[1, 2, 3]` the original returned `i32::MIN`: each number was a new largest, and the previous largest was thrown away. Putting `dbg!(n, largest, second);` at the end of the loop body shows it at once: `second` never changes. The falling list `[3, 2, 1]` happened to work, which is how such a bug survives a quick manual check.

The process matters more than the fix: a concrete failing input, a test that pins it down, a look inside, a one-line correction, and three tests that stay.
:::

:::exercise challenge A CI plan
Write down, as a list of commands, the checks you would run in CI for a library crate that (a) has an optional feature `serde`, (b) promises to work on Rust 1.85 and later, and (c) must run on Linux and Windows. Explain why each check is there.
::hint
Think about: formatting, lints, tests with and without the feature, the documentation, the minimum Rust version, the two operating systems, and known vulnerabilities.
::solution
```text
# 1. Style and lints (once, on Linux, with the stable toolchain)
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings

# 2. Tests in every feature configuration (on Linux AND Windows)
cargo test --no-default-features
cargo test
cargo test --all-features

# 3. Documentation builds without warnings, and its examples run
RUSTDOCFLAGS="-D warnings" cargo doc --no-deps --all-features

# 4. The minimum supported Rust version still works
cargo +1.85 check --all-features

# 5. Dependencies (on a schedule, for example every night)
cargo audit
```

Why each one:

1. Formatting and lints are the cheapest checks. They fail fast, before slower jobs start.
2. Code behind a feature that is switched off is not compiled at all. Only testing with and without `serde` shows that both configurations build and pass. The operating systems differ in paths, line endings and system calls, so the tests run on both.
3. Broken links and outdated examples in the documentation are bugs for your users.
4. Without this job, someone will use a newer language feature by accident, and users on Rust 1.85 will be broken. `cargo check` is enough to prove that the code compiles there.
5. A vulnerability can be published for a dependency on a day when your code did not change. A scheduled job notices.

In a GitHub workflow, point 2 is a **matrix**: one job definition that is run for every combination of operating system and feature set.
:::
