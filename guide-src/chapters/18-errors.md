@id errors
@part p4
@title Error handling
@short Error handling
@level intermediate
@time 55
@learn Tell apart errors a program should recover from and bugs that should stop it | Return, handle and pass on errors with `Result` and the `?` operator | Read and write files | Define your own error type | Choose between `panic!`, `Option` and `Result`, and compare `anyhow`, `thiserror`, `eyre` and `miette`

Things go wrong. A file is missing, the user types letters where a number belongs, the network is down. A good program expects this and reacts sensibly. Rust takes an unusual and very deliberate approach: errors are **ordinary values** that functions return, and the compiler makes sure you do not ignore them.

## Two kinds of problems

:::analogy A restaurant
A guest orders a dish that is sold out. That is a normal situation: the waiter says so, and the guest picks something else. Now imagine the kitchen is on fire. Nobody carries on taking orders. Everything stops.
:::

Rust separates these two cases:

| | Recoverable error | Unrecoverable error |
|---|---|---|
| Example | file not found, invalid input, no network | an index outside a list, a broken assumption: a **bug** |
| Whose fault? | the outside world | the programmer |
| Tool | return a `Result` | `panic!` |
| What happens | the caller decides what to do | the program (or the current thread) stops |

## `panic!`: stop, something is badly wrong

```rust panic
fn main() {
    let numbers = vec![1, 2, 3];
    println!("{}", numbers[7]);
}
```
```output auto panic
```

A panic prints a message with the file and line, cleans up (the values on the stack are dropped in order), and ends the program. You can cause one yourself with the `panic!` macro:

```rust panic
fn set_speed(kmh: u32) {
    if kmh > 300 {
        panic!("a speed of {kmh} km/h is impossible for this car");
    }
    println!("Speed set to {kmh}.");
}

fn main() {
    set_speed(120);
    set_speed(900);
}
```
```output auto panic
```

When a panic comes from deep inside a program, set the environment variable `RUST_BACKTRACE=1` when running (`RUST_BACKTRACE=1 cargo run`). Rust then prints the **backtrace**: the chain of function calls that led to the panic.

Other macros that panic, useful while a program is under construction:

- `todo!()` marks code you have not written yet. The program compiles, and panics if it reaches that point.
- `unreachable!()` marks a place that, by your reasoning, can never be reached.
- `assert!(condition)` panics if the condition is false. You will use it a lot in tests.

## `Result`: an error as a value

A function that can fail in a normal way returns `Result<T, E>`: either `Ok(value)` with a value of type `T`, or `Err(error)` with an error of type `E`.

```rust run
use std::fs;

fn main() {
    let result = fs::read_to_string("shopping.txt");

    match result {
        Ok(text) => println!("The file contains:\n{text}"),
        Err(error) => println!("Could not read the file: {error}"),
    }
}
```
```output
Could not read the file: No such file or directory (os error 2)
```

`fs::read_to_string` reads a whole file into a `String`. Its return type is `Result<String, std::io::Error>`. The file does not exist here, so the result is the `Err` variant, and the program goes on in an orderly way. (On Windows the text of the message is a little different.)

The compiler helps in two ways. You cannot use the `String` without dealing with the `Result` first, exactly as with `Option`. And if you call a function that returns a `Result` and throw the result away, you get a warning:

```rust warns
use std::fs;

fn main() {
    fs::write("notes.txt", "remember the milk");
}
```
```error auto
```

### Shortcuts for handling a `Result`

```rust run
fn main() {
    let good: Result<i32, String> = Ok(5);
    let bad: Result<i32, String> = Err(String::from("no number"));

    println!("{}", good.clone().unwrap_or(0));          // the value, or a fallback
    println!("{}", bad.clone().unwrap_or(0));
    println!("{}", bad.clone().unwrap_or_else(|e| e.len() as i32)); // work out a fallback from the error
    println!("{} {}", good.is_ok(), bad.is_err());
    println!("{:?}", good.clone().map(|n| n * 2));      // change the Ok value, keep an Err
    println!("{:?}", bad.clone().ok());                 // Result -> Option: the error is thrown away

    if let Ok(n) = good {
        println!("got {n}");
    }
}
```
```output
5
0
9
true true
Ok(10)
None
got 5
```

`.unwrap()` and `.expect("message")` exist for `Result` too. They return the `Ok` value or panic with the error. In other words, they turn a recoverable error into a crash:

```rust panic
fn main() {
    let age: u32 = "twelve".parse().expect("the age must be a number");
    println!("{age}");
}
```
```output auto panic
```

## Passing errors on: the `?` operator

Very often a function cannot deal with an error itself. The right thing to do is to stop and hand the error to its caller, which may know better what to do. Written out with `match`, that looks like this:

```rust check
use std::fs;
use std::io;

fn count_lines(path: &str) -> Result<usize, io::Error> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) => return Err(error),
    };
    Ok(text.lines().count())
}
# fn main() { let _ = count_lines("x"); }
```

This pattern is so common that Rust has an operator for it, a single question mark:

```rust run
use std::fs;
use std::io;

fn count_lines(path: &str) -> Result<usize, io::Error> {
    let text = fs::read_to_string(path)?;
    Ok(text.lines().count())
}

fn main() {
    match count_lines("shopping.txt") {
        Ok(n) => println!("{n} lines"),
        Err(error) => println!("Error: {error}"),
    }
}
```
```output
Error: No such file or directory (os error 2)
```

:::key What `?` does
Put `?` after an expression of type `Result`:

- If it is `Ok(value)`, the `?` unwraps it. The expression becomes `value`, and the function carries on.
- If it is `Err(error)`, the function **returns** that error to its caller at once.

Read `?` as "…or else give up and report the error".
:::

`?` makes the normal path of a function read from top to bottom without interruptions, and the error path is still visible: every place that can fail carries a `?`. You can chain it:

```rust check
use std::fs;
use std::io;

fn first_line_length(path: &str) -> Result<usize, io::Error> {
    Ok(fs::read_to_string(path)?.lines().next().unwrap_or("").len())
}
# fn main() { let _ = first_line_length("x"); }
```

`?` only works in a function whose return type can carry the error. Using it in a function that returns nothing is an error:

```rust fail E0277
use std::fs;

fn main() {
    let text = fs::read_to_string("shopping.txt")?;
    println!("{text}");
}
```
```error auto
```

The compiler suggests the usual fix: let `main` itself return a `Result`.

```rust run
use std::fs;
use std::io;

fn main() -> Result<(), io::Error> {
    fs::write("greeting.txt", "Hello from a file!\n")?;
    let text = fs::read_to_string("greeting.txt")?;
    print!("{text}");
    fs::remove_file("greeting.txt")?;
    Ok(())
}
```
```output
Hello from a file!
```

If `main` returns an `Err`, Rust prints the error and the program ends with an **exit code** that is not zero. The exit code is a number that a program hands back to whatever started it. Zero means "all went well", and anything else means "something failed". Other programs and scripts rely on it.

`?` also works on `Option` in a function that returns an `Option`: a `None` is returned at once.

```rust run
fn first_char_upper(text: &str) -> Option<char> {
    let first = text.chars().next()?;        // None if the text is empty
    first.to_uppercase().next()
}

fn main() {
    println!("{:?} {:?}", first_char_upper("rust"), first_char_upper(""));
}
```
```output
Some('R') None
```

## Working with files

You now have the tools to use files properly. The module `std::fs` has functions for the common cases, and all of them return a `Result`:

```rust run noplay
use std::fs;
use std::io;

fn main() -> Result<(), io::Error> {
    // write a whole file (creates it, or replaces what was there)
    fs::write("tasks.txt", "buy milk\ncall Sara\n")?;

    // read a whole file into a String
    let text = fs::read_to_string("tasks.txt")?;
    for (number, line) in text.lines().enumerate() {
        println!("{}: {line}", number + 1);
    }

    // does it exist? delete it
    println!("exists: {}", fs::exists("tasks.txt")?);
    fs::remove_file("tasks.txt")?;
    println!("exists: {}", fs::exists("tasks.txt")?);
    Ok(())
}
```
```output
1: buy milk
2: call Sara
exists: true
exists: false
```

For big files, or to add to the end of a file, you open the file and work with it piece by piece:

```rust run noplay
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};

fn main() -> Result<(), io::Error> {
    let mut file = File::create("log.txt")?;         // create (or empty) the file
    writeln!(file, "program started")?;              // like println!, but into the file

    let mut file = OpenOptions::new().append(true).open("log.txt")?;
    writeln!(file, "second entry")?;                 // added at the end

    let reader = BufReader::new(File::open("log.txt")?);
    for line in reader.lines() {                     // one line at a time
        let line = line?;                            // each line can fail to read
        println!("> {line}");
    }

    fs::remove_file("log.txt")?;
    Ok(())
}
```
```output
> program started
> second entry
```

- `File::create` and `File::open` give a `File`. It is closed automatically when the variable goes out of scope. This is ownership at work again: you cannot forget to close a file.
- `BufReader` wraps a file and reads it in large chunks, which is much faster than asking the operating system for every small piece. "Buf" is short for *buffer*, a temporary storage area.
- `use std::io::Write` and `use std::io::BufRead` bring in the methods `writeln!` relies on and the `.lines()` method. They are *traits*, the topic of [chapter 20](#traits).

## Your own error type

`count_lines` could only fail in one way, so `io::Error` was a fine error type. Real functions can fail in several ways. Take a function that reads a volume setting, a number from 0 to 100, from a file. The file may be missing, the content may not be a number, or the number may be too big.

A function has exactly one error type, so you define one that covers all cases. An enum is the natural fit:

```rust run noplay
use std::fmt;
use std::fs;
use std::io;
use std::num::ParseIntError;

#[derive(Debug)]
enum ConfigError {
    Io(io::Error),
    NotANumber(ParseIntError),
    TooLarge(u32),
}

// How the error is shown to a person
impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ConfigError::Io(e) => write!(f, "could not read the file: {e}"),
            ConfigError::NotANumber(e) => write!(f, "not a valid number: {e}"),
            ConfigError::TooLarge(n) => write!(f, "{n} is too large (the maximum is 100)"),
        }
    }
}

// Mark the type as an error, so that it works with the rest of Rust's error tools
impl std::error::Error for ConfigError {}

// How the errors of other functions are turned into ours
impl From<io::Error> for ConfigError {
    fn from(error: io::Error) -> Self {
        ConfigError::Io(error)
    }
}

impl From<ParseIntError> for ConfigError {
    fn from(error: ParseIntError) -> Self {
        ConfigError::NotANumber(error)
    }
}

fn read_volume(path: &str) -> Result<u32, ConfigError> {
    let text = fs::read_to_string(path)?;        // io::Error becomes ConfigError::Io
    let volume: u32 = text.trim().parse()?;      // ParseIntError becomes ConfigError::NotANumber
    if volume > 100 {
        return Err(ConfigError::TooLarge(volume));
    }
    Ok(volume)
}

fn main() {
    for content in ["70", "loud", "250"] {
        fs::write("volume.txt", content).expect("could not write the test file");
        match read_volume("volume.txt") {
            Ok(volume) => println!("volume is {volume}"),
            Err(error) => println!("error: {error}"),
        }
    }
    fs::remove_file("volume.txt").expect("could not delete the test file");

    if let Err(error) = read_volume("missing.txt") {
        println!("error: {error}");
    }
}
```
```output
volume is 70
error: not a valid number: invalid digit found in string
error: 250 is too large (the maximum is 100)
error: could not read the file: No such file or directory (os error 2)
```

There is a fair amount of new syntax here. Take it as a recipe for now. The blocks that begin with `impl … for ConfigError` are *trait implementations*, which the next chapters explain. What each part is for:

1. **The enum** lists everything that can go wrong. Callers can `match` on it and react differently to each case.
2. **`Display`** gives the text for people. It is what `{}` prints.
3. **`Error`** marks the type as an error.
4. **`From`** teaches `?` a conversion. When a function returns `Result<_, ConfigError>` and a `?` meets an `io::Error`, Rust calls `ConfigError::from(error)` automatically. That is why the two `?` lines in `read_volume` work although the functions they call return different error types.

### Less typing with `thiserror`

Steps 2 to 4 are routine, and the popular crate **`thiserror`** writes them for you. This is the same error type:

```rust ext check
use thiserror::Error;

#[derive(Debug, Error)]
enum ConfigError {
    #[error("could not read the file: {0}")]
    Io(#[from] std::io::Error),

    #[error("not a valid number: {0}")]
    NotANumber(#[from] std::num::ParseIntError),

    #[error("{0} is too large (the maximum is 100)")]
    TooLarge(u32),
}

fn read_volume(path: &str) -> Result<u32, ConfigError> {
    let text = std::fs::read_to_string(path)?;
    let volume: u32 = text.trim().parse()?;
    if volume > 100 {
        return Err(ConfigError::TooLarge(volume));
    }
    Ok(volume)
}

fn main() {
    if let Err(error) = read_volume("missing.txt") {
        println!("error: {error}");
    }
}
```

The `#[error("…")]` attribute gives the text for `Display`, and `#[from]` creates the `From` conversion. Add the crate with `cargo add thiserror`.

## When you do not care which error it was

A program (as opposed to a library) often does not need to tell errors apart. It only wants to report them and stop. For that there is a type that can hold **any** error: `Box<dyn Error>`.

```rust run noplay
use std::error::Error;
use std::fs;

fn read_volume(path: &str) -> Result<u32, Box<dyn Error>> {
    let text = fs::read_to_string(path)?;
    let volume: u32 = text.trim().parse()?;
    if volume > 100 {
        return Err("the volume is too large".into());
    }
    Ok(volume)
}

fn main() -> Result<(), Box<dyn Error>> {
    fs::write("volume.txt", "55")?;
    println!("volume is {}", read_volume("volume.txt")?);
    fs::remove_file("volume.txt")?;
    Ok(())
}
```
```output
volume is 55
```

Read `Box<dyn Error>` as "some error, I do not say which". `?` converts every error type into it, and even a plain text becomes an error with `.into()`. ([Chapter 27](#smart-pointers) explains `Box` and `dyn`.) The price is that the caller can no longer easily `match` on the kind of error.

The crate **`anyhow`** is a more comfortable version of the same idea, and is what most applications use. It adds `context`, which attaches a description of *what the program was trying to do*:

```rust ext check
use anyhow::{bail, Context, Result};

fn read_volume(path: &str) -> Result<u32> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("could not read the settings file {path}"))?;
    let volume: u32 = text.trim().parse().context("the volume must be a whole number")?;
    if volume > 100 {
        bail!("the volume {volume} is too large (the maximum is 100)");
    }
    Ok(volume)
}

fn main() -> Result<()> {
    let volume = read_volume("settings/volume.txt")?;
    println!("volume is {volume}");
    Ok(())
}
```
```output
Error: could not read the settings file settings/volume.txt

Caused by:
    No such file or directory (os error 2)
```

`anyhow::Result<T>` is short for `Result<T, anyhow::Error>`. `bail!` returns an error built from a message. The output shows the chain: what the program tried to do, and the underlying cause.


### Rich reports for applications: `eyre` and `miette`

`anyhow` is enough for most applications. Two related crates solve slightly different problems.

**`eyre`** is anyhow's close sibling. It adds `WrapErr`, which attaches context while keeping the cause, and it works with **`color-eyre`**: a hook that prints coloured error reports with source locations, much like a compiler error message. An application or CLI tool that uses `eyre` shows the user what went wrong, without you writing formatting code.

**`miette`** is different. An error can carry a **diagnostic**: a severity, a help text, a link, and even a snippet of the offending source with the offending part underlined. `miette` is the choice for developer tools — linters, code generators, compilers — whose users appreciate compiler-style reports.

```toml
eyre = "0.6"
color-eyre = "2.1"   # optional: coloured reports and source locations
miette = { version = "7", features = ["fancy"] }   # `fancy` adds the rich renderer
```

`eyre` in an application. `wrap_err` adds context; `wrap_err_with` builds the context lazily, only when there is an error. The program below is written deliberately without a `settings.toml`, so that you can see what the user would see:

```rust ext check
use eyre::{Context, Result};

fn read_port() -> Result<u16> {
    let text = std::fs::read_to_string("settings.toml")
        .wrap_err("could not read the settings file")?;
    text.trim().parse()
        .wrap_err_with(|| format!("the port '{text}' is not a number"))
}

fn main() {
    match read_port() {
        Ok(port) => println!("port is {port}"),
        Err(error) => println!("{error:#}"),
    }
}
```

```output
could not read the settings file: No such file or directory (os error 2)
```

Nothing in `main` formats an error: returning `Err` from `main` makes the runtime print the report, context first, and exit with a non-zero code. That is why an application's `main` returns `Result` and almost never calls `unwrap`.

`color-eyre` installs itself once, at the start of `main`:

```rust
fn main() -> eyre::Result<()> {
    color_eyre::install()?;
    // the rest of the program
}
```

After that, every error and every panic prints in colour, with the file and line where it happened. Pick one application-report ecosystem for a program and stay in it; converting between `anyhow`, `eyre` and `Box<dyn Error>` at every layer adds code and loses causes.

```toml
[dependencies]
miette = { version = "7", features = ["fancy"] }
thiserror = "2.0"
```

`miette` in a library. The `#[derive(Diagnostic)]` attribute turns an error into a diagnostic:

```rust ext run
use miette::Diagnostic;
use thiserror::Error;

#[derive(Debug, Error, Diagnostic)]
#[error("the colour '{colour}' is not known")]
#[diagnostic(code(color::unknown), help("try one of: red, green, blue"))]
struct UnknownColour {
    colour: String,
}

fn main() -> Result<(), miette::Report> {
    let error = UnknownColour { colour: String::from("snake") };
    let report = miette::Report::new(error);
    println!("{report}");
    Ok(())
}
```

```output
the colour 'snake' is not known
```

With miette's own report handler the same error also prints its help line and its error code; the handler is what gives you compiler-style reports, including source snippets when you add `#[label]` spans.

| | Best for | What it adds |
|---|---|---|
| `thiserror` | libraries | precise error enums callers can `match` on |
| `anyhow` | applications | one error type, `context` and `bail!` |
| `eyre` | applications, especially CLIs | coloured reports and source locations via `color-eyre` |
| `miette` | developer tools | compiler-style diagnostics: codes, help text, source snippets |

:::compare Which error crate today?
- Writing a library: `thiserror`, so callers can react to each case.
- Writing an application: `anyhow`, quick context for every error.
- Writing a CLI tool that people run: `eyre`; add `color-eyre` for coloured reports.
- Writing a tool that parses or generates code or config: `miette`.
:::

### The chain of causes: `source`

Where does `anyhow` get the "Caused by" lines from? Every error type can name the error that led to it, through the method **`source`** of the `Error` trait. The standard answer is "none". An error that wraps another one overrides the method:

```rust run
use std::error::Error;
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
struct SettingError {
    name: String,
    cause: ParseIntError,
}

impl fmt::Display for SettingError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "the setting `{}` is not valid", self.name)
    }
}

impl Error for SettingError {
    // The error that led to this one
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        Some(&self.cause)
    }
}

fn read_setting(name: &str, text: &str) -> Result<u32, SettingError> {
    match text.trim().parse() {
        Ok(number) => Ok(number),
        Err(cause) => Err(SettingError { name: name.to_string(), cause }),
    }
}

/// Prints an error and everything that led to it.
fn report(error: &dyn Error) {
    println!("error: {error}");
    let mut cause = error.source();
    while let Some(inner) = cause {
        println!("  caused by: {inner}");
        cause = inner.source();
    }
}

fn main() {
    if let Err(error) = read_setting("volume", "loud") {
        report(&error);
    }
}
```
```output
error: the setting `volume` is not valid
  caused by: invalid digit found in string
```

Read `Option<&(dyn Error + 'static)>` as "perhaps a reference to some other error". The loop in `report` follows the chain from the error the user sees down to the first cause. Each level says one thing: what *it* was trying to do.

You rarely write `source` by hand:

- With `thiserror`, a field marked `#[from]` or `#[source]` becomes the source. (`#[source]` does the same as `#[from]` without creating the `From` conversion.)
- With `anyhow`, every `.context(…)` adds a level on top of the chain. Printing an `anyhow::Error` with `{}` shows the top level only, `{:#}` shows all levels on one line, and `{:?}` shows the "Caused by" list from above.

:::warn Say each thing once
There are two styles. Either the message of an error includes the message of its cause, as `ConfigError` does above with `{e}`: good when errors are printed with `{}` and nothing else. Or the message describes its own level only, and the cause is found through `source`, as in `SettingError`: good when the report walks the chain. Choose one style for a program. If you mix them, a chain report prints every cause twice.
:::

:::tip The usual division of labour
- **In a library:** define precise error enums (with `thiserror`), so that users of the library can react to each case.
- **In an application:** use `anyhow` (or `Box<dyn Error>`) and add context, so that the person in front of the program gets a helpful message.
:::

## Which tool when?

| Situation | Use |
|---|---|
| A value may be absent, and that is normal (search found nothing) | `Option<T>` |
| An operation can fail, and the caller should be able to react (file, network, user input) | `Result<T, E>` |
| The situation "cannot happen" unless the code has a bug | `panic!`, `unreachable!`, `expect("why this cannot fail")` |
| Quick experiments, examples and tests | `unwrap()` and `expect()` are fine |

A useful habit: when you write `expect`, let the message say **why you believe it cannot fail**, for example `.expect("the pattern is a valid regular expression")`. Whoever sees the panic later learns which assumption was wrong.

:::warn Do not hide errors
Avoid patterns that throw an error away without a decision: `let _ = risky();`, `.ok();` or `.unwrap_or_default()` used only to make the compiler quiet. If ignoring an error is truly right, write a comment that says why.
:::

:::compare Errors in other languages
- **Exceptions (Java, Python, C#, JavaScript, C++):** a function "throws" an error, and it travels up through the callers until some `try`/`catch` block catches it. Any call may throw, and usually nothing in the code or the types shows it. Errors that nobody thought of are common. In Rust, the possibility of failure is part of the function's type, and every place where an error can leave a function is marked with a visible `?`.
- **Error codes (C):** a function returns a special number such as `-1`, and the caller is supposed to check it. Nothing forces the check, and forgetting it is a classic source of bugs.
- **Go:** functions return a value and an error side by side, and nearly every call is followed by `if err != nil { return err }`. Rust's `?` does the same in one character, and the compiler will not let you use the value without looking at the error.
:::

:::recap
- Bugs and impossible situations: `panic!`. Expected failures: return a `Result`.
- `Result<T, E>` is `Ok(value)` or `Err(error)`. Handle it with `match`, `if let`, `unwrap_or`, or pass it on.
- `?` unwraps an `Ok` or returns the `Err` to the caller. The function must return a `Result` (or `Option`) itself. `main` may return a `Result`.
- `std::fs` reads and writes files. Every operation returns a `Result`.
- A custom error enum lists the ways a function can fail. `Display` gives the message, and `From` lets `?` convert other errors into it. `thiserror` generates this code.
- `Box<dyn Error>` and `anyhow` hold any error, which is convenient in applications.
- `eyre` is another flexible application report with customizable handlers; `miette` is useful when a command-line user benefits from structured diagnostics and source snippets.
:::

:::quiz Check your understanding
? What does the `?` operator do when the value before it is an `Err`?
- It panics
- It replaces the error with a default value
+ It returns the error from the current function to the caller
- It ignores the error and continues
= `?` unwraps an `Ok`, and on an `Err` it returns early with that error, converting it with `From` if needed.

? Which of these situations calls for a `Result` and not a panic?
+ The user asks to open a file that does not exist
- A function that must only receive even numbers, and has checked that itself two lines earlier, sees an odd one
- An index that your own code calculated is outside the vector
- A `match` arm that can never be reached is reached
= A missing file is a normal event that the program should handle. The other three are bugs: the code is wrong, and stopping is the honest reaction.

? Why does this not compile?
```rust
fn main() {
    let n: i32 = "5".parse()?;
}
```
- `parse` does not return a `Result`
+ `?` needs a function that returns a `Result` or `Option`, and this `main` returns nothing
- `?` cannot be used with numbers
- The type annotation is wrong
= `?` may return an error from the function, so the function's return type must be able to hold one. Declare `fn main() -> Result<(), Box<dyn std::error::Error>>` and end with `Ok(())`.

? What is the job of `impl From<io::Error> for MyError`?
- It prints the error
+ It tells Rust how to turn an `io::Error` into a `MyError`, which lets `?` do the conversion automatically
- It makes `MyError` a panic
- It is needed for `match`
= `?` calls `From::from` on the error before returning it. With this implementation, a function returning `Result<_, MyError>` can use `?` on I/O operations.

? You are writing a library that other programmers will use. Which error style suits it best?
- `unwrap()` everywhere
- Return `String` messages
+ A dedicated error enum, so that callers can `match` on the kind of failure
- Print the error and call `std::process::exit`
= A library should not decide for its users how to react. A precise error type gives them all the information and leaves the decision to them.
:::

:::exercise guided Add the numbers in a text
Write `sum_of(text: &str) -> Result<i32, std::num::ParseIntError>` that takes numbers separated by commas, such as `"4, 8, 15"`, and returns their sum. If any part is not a number, it returns the error. Use `?`.
::hint
Loop over `text.split(',')`. For each part, `part.trim().parse::<i32>()?` gives the number or leaves the function with the error.
::solution
```rust run
use std::num::ParseIntError;

fn sum_of(text: &str) -> Result<i32, ParseIntError> {
    let mut total = 0;
    for part in text.split(',') {
        let number: i32 = part.trim().parse()?;
        total += number;
    }
    Ok(total)
}

fn main() {
    println!("{:?}", sum_of("4, 8, 15"));
    match sum_of("4, eight, 15") {
        Ok(total) => println!("{total}"),
        Err(error) => println!("error: {error}"),
    }
}
```
```output
Ok(27)
error: invalid digit found in string
```

The `?` ends the loop and the function at the first part that is not a number. The success value must be wrapped: the last line is `Ok(total)`, not `total`, because the function returns a `Result`.
:::

:::exercise practice A withdrawal that explains itself
In [chapter 12](#structs), `withdraw` returned a `bool`. Improve it. Define an enum `WithdrawError` with two variants: `ZeroAmount` and `InsufficientFunds { missing: u64 }`. Change `withdraw` to return `Result<u64, WithdrawError>`, where the `Ok` value is the new balance. In `main`, print a suitable sentence for each case.
::hint
Check `amount == 0` first, then `amount > self.balance`. The missing sum is `amount - self.balance`. In `main`, use a `match` with three arms: `Ok(balance)`, `Err(WithdrawError::ZeroAmount)` and `Err(WithdrawError::InsufficientFunds { missing })`.
::solution
```rust run
#[derive(Debug)]
enum WithdrawError {
    ZeroAmount,
    InsufficientFunds { missing: u64 },
}

struct Account {
    balance: u64,
}

impl Account {
    fn withdraw(&mut self, amount: u64) -> Result<u64, WithdrawError> {
        if amount == 0 {
            return Err(WithdrawError::ZeroAmount);
        }
        if amount > self.balance {
            return Err(WithdrawError::InsufficientFunds { missing: amount - self.balance });
        }
        self.balance -= amount;
        Ok(self.balance)
    }
}

fn main() {
    let mut account = Account { balance: 5000 };
    for amount in [2000, 0, 9999] {
        match account.withdraw(amount) {
            Ok(balance) => println!("Withdrew {amount}. New balance: {balance}."),
            Err(WithdrawError::ZeroAmount) => println!("Nothing to withdraw."),
            Err(WithdrawError::InsufficientFunds { missing }) => {
                println!("Not enough money: {missing} missing.")
            }
        }
    }
}
```
```output
Withdrew 2000. New balance: 3000.
Nothing to withdraw.
Not enough money: 6999 missing.
```

A `bool` could only say "no". The error enum says why, and carries data (how much is missing) that the caller can show to the user. Because the caller matches on an enum, adding a third kind of failure later makes the compiler point at every place that has to handle it.
:::

:::exercise challenge Save and load the to-do list
Write two functions for the to-do list of [chapter 16](#project-todo):

- `save(path: &str, tasks: &[Task]) -> Result<(), io::Error>` writes one task per line in the form `1|buy milk` (1 for done, 0 for open, then the title).
- `load(path: &str) -> Result<Vec<Task>, Box<dyn Error>>` reads such a file. A line without `|`, or with something other than 0 or 1 in front, is an error.

Use a simplified `Task` with just `title` and `done`.
::hint
For saving, build a `String` with `format!` and `push_str`, then `fs::write` it. For loading, go through `text.lines()`, split each with `line.split_once('|')`, and turn a `None` into an error with `.ok_or("message")?`. `ok_or` converts an `Option` into a `Result`.
::solution
```rust run noplay
use std::error::Error;
use std::fs;
use std::io;

#[derive(Debug, PartialEq)]
struct Task {
    title: String,
    done: bool,
}

fn save(path: &str, tasks: &[Task]) -> Result<(), io::Error> {
    let mut text = String::new();
    for task in tasks {
        let flag = if task.done { 1 } else { 0 };
        text.push_str(&format!("{flag}|{}\n", task.title));
    }
    fs::write(path, text)
}

fn load(path: &str) -> Result<Vec<Task>, Box<dyn Error>> {
    let text = fs::read_to_string(path)?;
    let mut tasks = Vec::new();
    for line in text.lines() {
        let (flag, title) = line.split_once('|').ok_or("a line has no | separator")?;
        let done = match flag {
            "0" => false,
            "1" => true,
            other => return Err(format!("unknown state '{other}'").into()),
        };
        tasks.push(Task { title: title.to_string(), done });
    }
    Ok(tasks)
}

fn main() -> Result<(), Box<dyn Error>> {
    let tasks = vec![
        Task { title: String::from("buy milk"), done: true },
        Task { title: String::from("call Sara"), done: false },
    ];
    save("tasks.txt", &tasks)?;
    let loaded = load("tasks.txt")?;
    println!("{}", loaded == tasks);
    println!("{:?}", loaded[1]);

    fs::write("tasks.txt", "2|broken line\n")?;
    if let Err(error) = load("tasks.txt") {
        println!("error: {error}");
    }
    fs::remove_file("tasks.txt")?;
    Ok(())
}
```
```output
true
Task { title: "call Sara", done: false }
error: unknown state '2'
```

`save` ends with `fs::write(path, text)` without `?` or `Ok`: the call already returns exactly the `Result<(), io::Error>` that the function must return. In `load`, three different kinds of problem (an I/O error, a missing separator, a bad flag) all travel through the same `Box<dyn Error>`. `ok_or` is the bridge from `Option` to `Result` that lets `?` work on the result of `split_once`.

The format breaks if a title contains a line break. Real programs use a standard format such as JSON for this, with the `serde` crate ([chapter 43](#serde)).
:::
