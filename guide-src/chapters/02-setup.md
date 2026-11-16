@id setup
@part p1
@title Setting up and running your first program
@short Setup and your first program
@level beginner
@time 45
@learn Run Rust code in the browser without installing anything | Use a terminal for basic tasks | Install Rust and a code editor on your own computer | Create, run and change a Rust project with Cargo | Read a compiler error message without fear

Start by running a small Rust program in the browser, where no local installation is needed. Then set up the compiler and Cargo on your computer, create a project, and examine the first program line by line. You can pause after the browser exercise and return to installation when you are ready.

## Two ways to run Rust

:::analogy A kitchen you can borrow, and a kitchen you own
A borrowed kitchen lets you try a recipe quickly, but a real kitchen is what you need when you are cooking for a week. The Rust Playground is the borrowed kitchen: perfect for a first try. A real Rust install is the kitchen you keep: the place where you build larger projects and keep your files.
:::

**1. In the browser: right inside this guide.** Press the **Run** button on any complete example in this guide and the result appears directly below the code box — no new tab, no setup. Press **Edit** to change the code and press **Run** again to test your change. For a blank scratchpad you can also visit the Rust Playground at [play.rust-lang.org](https://play.rust-lang.org). Running in the browser is ideal for the first chapters and for quick experiments.

**2. On your own computer.** You will need this for multi-file projects, programs that read local files, and the later projects. The steps below explain how to install Rust and check that the tools work.

If you cannot install software right now, use the Playground and come back to the installation later.

:::analogy Setting up a workshop before building anything
A carpenter spends the first day hanging tools on the wall. Nothing is built that day, yet every later hour is faster. Setting up Rust, a terminal and an editor is that day: dull while it lasts, paid back every day after.
:::

## A five-minute tour of the terminal

Programmers often control the computer by typing commands instead of clicking. The window where you type them is called the **terminal** (also *command line*, *console* or *shell*). It looks old-fashioned, but it is quick and exact, and Rust's tools are used through it.

How to open it:

- **Windows:** press the Windows key, type `terminal`, press {{Enter}}. (On older systems, search for `PowerShell`.)
- **macOS:** press {{Cmd}} + {{Space}}, type `terminal`, press {{Enter}}.
- **Linux:** press {{Ctrl}} + {{Alt}} + {{T}} on most systems.

The terminal is always "inside" one folder, called the **current folder** or *working directory*. These few commands are enough for this guide:

| Command | What it does |
|---|---|
| `pwd` | Shows which folder you are in ("print working directory") |
| `ls` | Lists the files in the current folder (on old Windows consoles: `dir`) |
| `cd projects` | Moves into the folder called `projects` ("change directory") |
| `cd ..` | Moves up to the folder that contains the current one |
| `mkdir projects` | Creates a new folder called `projects` ("make directory") |

Three keys save a lot of typing. The **up arrow** brings back your previous command. The {{Tab}} key completes a name you have started to type. {{Ctrl}} + {{C}} stops a program that is running.

:::note How commands are written in this guide
Commands are shown with a `$` in front, like this:

```sh
$ cargo --version
cargo 1.100.0 (3acc79c0c 2026-11-05)
```

The `$` only marks "type this line". Do not type the `$` itself. Lines without a `$` are what the computer answers. The **Copy** button copies only the commands.
:::

## Installing Rust

Rust is installed with a small tool called **[[rustup]]**. It downloads the compiler, keeps it up to date, and can remove it again cleanly.

### On Windows

1. Go to [rustup.rs](https://rustup.rs) and download **rustup-init.exe**. Run it.
2. If the installer says that the *Visual Studio C++ Build Tools* are missing, choose the option to install them (the first option). Rust needs them to produce finished programs.
3. When it asks how to proceed, press {{Enter}} to accept the standard installation.
4. Close the terminal and open a new one, so that it notices the new tools.

### On macOS and Linux

Paste this command into the terminal and press {{Enter}}:

```sh
$ curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

When it asks, press {{Enter}} to accept the standard installation. Then close the terminal and open a new one.

Rust also needs a few standard build tools from your system. On macOS, run `xcode-select --install` if you have never installed Apple's developer tools. On Ubuntu or Debian Linux, run `sudo apt install build-essential`.

### Check that it worked

```sh
$ rustc --version
rustc 1.100.0 (0ef1bc386 2026-11-09)
$ cargo --version
cargo 1.100.0 (3acc79c0c 2026-11-05)
```

Your version numbers may be higher. That is fine. If the terminal says the command was not found, close it, open a new one, and try again.

You now have these tools:

| Tool | What it is |
|---|---|
| `rustc` | The Rust [[compiler]]. It turns source code into a program |
| `cargo` | Rust's project manager. It creates projects, runs the compiler for you, downloads code written by other people, and runs your tests. You will use `cargo` every day and almost never call `rustc` yourself |
| `rustup` | The installer. `rustup update` gets the newest Rust. A new version appears every six weeks |

:::compare One tool instead of many
In many languages you must choose and combine separate tools: one to build, one to download libraries, one to run tests, one to format code. Rust ships a single official tool, Cargo, that does all of it, and almost every Rust project uses it in the same way. Once you know how one Rust project works, you know how they all work.
:::

### Three channels of Rust

`rustup` can keep more than one version of Rust, called a **[[toolchain]]**. New Rust comes out on three channels:

- **stable** — the version this guide targets. It is tested, and code that compiles on it keeps compiling on every future stable version. Start here.
- **beta** — the next stable version, frozen and being tested. Useful for checking that your code will work on it before it becomes official.
- **nightly** — a fresh build made every single day. New language features land here first, but it can change and break without warning.

You can inspect and switch channels with `rustup`:

- `rustup toolchain list` — the versions you have installed.
- `rustup default stable` — make a channel the default for your work.
- `rustup run nightly cargo build` — run one command under a different channel.

You will rarely touch these. They matter mainly when you read a crate that says "requires nightly" — a promise to avoid for anything you want to share, since most people work on stable.

## A code editor

You write code in a **code editor**: a text editor that understands programming. A word processor such as Microsoft Word will not work, because it stores hidden formatting in the file.

A good free choice is **Visual Studio Code** ([code.visualstudio.com](https://code.visualstudio.com)). After installing it, open the *Extensions* panel, search for **rust-analyzer**, and install it. rust-analyzer is the official helper that makes an editor understand Rust. It underlines mistakes while you type, completes names for you, and shows explanations when you point at something. Other good editors with Rust support are RustRover, Zed, Helix and Neovim.

## Your first project

In the terminal, go to a folder where you want to keep your projects, then type:

```sh
$ cargo new hello_rust
    Creating binary (application) `hello_rust` package
$ cd hello_rust
```

`cargo new` created a folder called `hello_rust` with a complete, working project inside:

```tree
hello_rust/
├── Cargo.toml      the project's settings
└── src/
    └── main.rs     your source code
```

`Cargo.toml` describes the project:

```toml file=Cargo.toml
[package]
name = "hello_rust"
version = "0.1.0"
edition = "2024"

[dependencies]
```

The `name` and `version` are your project's name and version number. The [[edition]] (`edition` in `Cargo.toml`) says which set of language rules to use: `2024` is the newest. The idea of an edition is to let the language grow without breaking old code: a project pinned to edition `2021` still compiles under a newer compiler, while a project that opts into `2024` gets the newest rules. This is one of the ways Rust keeps its promise of stability, from [chapter 1](#what-is-rust). Under `[dependencies]` you will later list code from other people that your project uses. It is empty for now.

:::analogy `Cargo.toml` is a project recipe card
Imagine handing a friend a kit to assemble a shelf. You do not hand them a sack of random screws and hope for the best: you include a card saying *which* board, *which* screws, and *which* instructions to follow. `Cargo.toml` is that card for your program. Anyone with Cargo and that file can reproduce the exact same build on Windows, macOS or Linux.
:::

:::details A binary and a library
A Rust project has two flavours. A **[[binary]]** is a program that runs: it has a `main` function, its code lives in `src/main.rs`, and building it gives you a file you can execute. A **[[library]]** is a set of functions and types that other projects call: it has no `main`, its code lives in `src/lib.rs`, and other programs use it by name from their own `Cargo.toml`. When a library is published, people call it a **[[crate]]**. `cargo new` gives you a binary by default; `cargo new mylib --lib` asks for a library instead, and a project can hold both at once — a binary that uses the library beside it. Almost everything useful in Rust is written as a library that some binary calls.
:::

Rust source files end in `.rs`. Cargo already wrote a small program into `src/main.rs`:

```rust run file=src/main.rs
fn main() {
    println!("Hello, world!");
}
```

Run it:

```sh
$ cargo run
   Compiling hello_rust v0.1.0 (/home/you/hello_rust)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.18s
     Running `target/debug/hello_rust`
Hello, world!
```

Cargo did three things, and reported each one: it **compiled** your code into a program, it **finished** without errors, and it **ran** the program, which printed `Hello, world!`. You are now a programmer.

:::note Why the first run is slow and the next ones are fast
If you look in the project folder now, there is a new `target/` directory full of compiled pieces. Cargo keeps everything it builds in there — your code and every library it downloaded. The first `cargo run` does all of that work, so it is the slow one. The next time, only the parts that changed are rebuilt and the rest comes back from the cache, which is why later runs finish in a fraction of a second. You never have to delete `target/` by hand; it is safe to remove and Cargo will rebuild it. It is exactly the kind of folder to keep out of your Git repository, and `cargo new` already adds it to the project's ignore list for that reason.
:::

## What every part of the program means

```rust run
fn main() {
    println!("Hello, world!");
}
```

- **`fn`** is short for *function*. A function is a named group of instructions. You will write your own in [chapter 10](#functions).
- **`main`** is the function's name. This name is special: every Rust program starts by running the function called `main`.
- **`()`** would hold the inputs of the function. `main` has none, so the brackets are empty.
- **`{` and `}`** mark where the function's instructions begin and end. Everything between them is called the function's *body*.
- **`println!`** means "print a line": show some text on the screen, then move to the next line. The `!` tells you that `println!` is a **macro**, a special kind of instruction that writes some code for you. For now, just remember that printing needs the `!`.
- **`"Hello, world!"`** is the text to print. Text inside double quotes is called a **string**.
- **`;`** ends the instruction, like a full stop ends a sentence.

The line inside the function is pushed four spaces to the right. This *indentation* is not required by the compiler, but it shows humans what is inside what, and all Rust programmers use it. You do not have to do it by hand: the command `cargo fmt` tidies the layout of your whole project.

## Printing more

Change `src/main.rs` to this and run it again with `cargo run`:

```rust run
fn main() {
    println!("Hello, world!");
    println!("My favourite number is {}.", 7);
    println!("{} plus {} is {}.", 2, 3, 2 + 3);
    print!("This stays ");
    print!("on one line.");
    println!();
    println!("She said \"hi\".\nThis is a new line.");
}
```
```output
Hello, world!
My favourite number is 7.
2 plus 3 is 5.
This stays on one line.
She said "hi".
This is a new line.
```

What is new here:

- **`{}` is a placeholder.** Each `{}` in the text is replaced by the next value after the comma. Values can be calculated: `2 + 3` becomes `5`.
- **`print!`** prints without moving to a new line. An empty `println!()` just ends the line.
- **A backslash gives the next character a special meaning.** `\"` is a quote mark inside a string, `\n` starts a new line, and `\\` is a real backslash. To print a real curly bracket, write it twice: `{{` or `}}`.

The computer runs the lines from top to bottom, one after the other. This order is the most basic rule of programming.

## Comments: notes for humans

Text after `//` is a **comment**. The compiler ignores it. Comments explain to people (including yourself, next month) *why* the code does something.

```rust run
// This program greets the user.
fn main() {
    println!("Welcome!"); // A comment can also follow code on the same line.
    // println!("This line does not run, because it is a comment.");
}
```
```output
Welcome!
```

Putting `//` in front of a line of code switches it off without deleting it. Programmers call this *commenting out* a line.

## The Cargo commands you need every day

| Command | What it does | When to use it |
|---|---|---|
| `cargo new name` | Creates a new project in a folder called `name` | Once per project |
| `cargo run` | Compiles the project and runs it | All the time |
| `cargo check` | Only checks the code for errors. Much faster than a full compile | While writing, to find mistakes quickly |
| `cargo build` | Compiles without running | When you only want the finished program |
| `cargo build --release` | Compiles a slower-to-build but much faster-running version | When you give the program to others |
| `cargo test` | Runs your unit and integration tests | After every change once you write tests |
| `cargo fmt` | Tidies the layout of your code | Before you save your work |
| `cargo clippy` | Checks for common mistakes and suggests cleaner Rust | Regularly before sharing your code |

Formatting (`cargo fmt --check`), testing (`cargo test`), and linting (`cargo clippy`) are built in from day one. You will use these commands long before any advanced Rust features, and Part 4 ([Chapter 32](#cargo) through [Chapter 34](#testing-strategies)) covers this everyday engineering workflow in depth.

## Your Linux systems inspection toolkit

Because this guide explores what [[rustc]] and the operating system actually produce, Linux provides a set of inspection utilities that turn black boxes into open glass. Check which ones are installed on your machine (most come pre-installed with `binutils`, `gdb`, `strace`, and `linux-tools` / `perf`):

```sh
$ which rustc cargo objdump readelf nm ldd strace ltrace gdb lldb perf
```

| Tool | What it lets you inspect |
|---|---|
| `rustc`, `cargo` | Compiler front-end, intermediate representations (`--emit=mir,llvm-ir,asm`), and build orchestration |
| `objdump`, `readelf`, `nm`, `ldd` | Machine instructions, ELF headers/sections/segments, symbol tables, and shared libraries |
| `rust-gdb` / `gdb` / `lldb` | Live CPU registers, stack frames, memory addresses, and breakpoints |
| `strace`, `ltrace` | System calls made to the Linux kernel and calls into shared C libraries |
| `perf`, `/proc`, `valgrind` | CPU cache/branch counters, kernel per-process tables, and heap profiling |

If a tool such as `strace` or `gdb` is missing on Ubuntu/Debian, you can add the standard suite later with `sudo apt install build-essential binutils gdb strace ltrace`. Even before installing extra tools, `rustc`, `cargo`, `objdump`, `readelf`, `nm`, and `/proc` give you plenty to examine right away.

:::plain Debug and release
A **[[debug build]]** (the default) compiles quickly but runs slowly, and it contains extra information that helps you find bugs. A **[[release build]]** (`--release`) takes longer to compile because the compiler works hard to make the program fast. Use debug while you develop and release for the final program. The speed difference can be ten times or more.
:::

## When something goes wrong

Sooner or later you will make a typing mistake. Let us make one on purpose. Remove the `!` after `println`:

```rust fail E0423
fn main() {
    println("Hello, world!");
}
```

Run `cargo run`. The program is not started. The compiler stops and explains:

```error
error[E0423]: cannot find function `println` in this scope
 --> src/main.rs:2:5
  |
2 |     println("Hello, world!");
  |     ^^^^^^^ not found in this scope
  |
  = note: a macro named `println` exists in another namespace
help: use `!` to invoke the macro
  |
2 |     println!("Hello, world!");
  |            +

For more information about this error, try `rustc --explain E0423`.
```

This looks like a lot, but every part helps you. Read it from the top:

1. **`error[E0423]: cannot find function ...`** says what is wrong, in one sentence. `E0423` is the number of this kind of error.
2. **`--> src/main.rs:2:5`** says where: the file, then line 2, then character 5 on that line.
3. **The code with `^^^^^^^` under it** shows the exact place.
4. **`help:`** suggests a fix, and even shows the corrected line with a `+` under the character to add.
5. **`rustc --explain E0423`** is a command you can type to get a longer explanation of this kind of error.

Another classic is the forgotten semicolon:

```rust fail
fn main() {
    println!("Hello, world!")
    println!("I am learning Rust.");
}
```
```error
error: expected `;`, found `println`
 --> src/main.rs:2:30
  |
2 |     println!("Hello, world!")
  |                              ^ help: add `;` here
3 |     println!("I am learning Rust.");
  |     ------- unexpected token
```

:::key The compiler is on your side
A compiler error is not a failure. It is the compiler doing its job: catching a mistake now, on your computer, before the program runs. When you see several errors, fix **the first one** and compile again. Later errors are often just consequences of the first.
:::

:::recap
- The Rust Playground runs code in your browser. For real projects, install Rust with `rustup`.
- `cargo new` creates a project, `cargo run` compiles and runs it, `cargo check` quickly looks for errors.
- Every program starts in `fn main() { ... }`. Instructions end with `;` and run from top to bottom.
- `println!("...")` prints a line. `{}` is a placeholder for a value.
- `//` starts a comment.
- Error messages tell you what is wrong, where, and often how to fix it.
:::

:::quiz Check your understanding
? Where does a Rust program start running?
- At the first line of the file
- In `Cargo.toml`
+ In the function called `main`
- At the first `println!`
= Every Rust program begins with the `main` function, wherever it appears in the file.

? What does `cargo run` do?
+ It compiles the project if needed, then starts the program
- It creates a new project
- It only checks the code for mistakes
- It installs Rust
= `cargo run` builds and runs in one step. `cargo check` only checks, and `cargo new` creates a project.

? What does this line print? `println!("{} apples and {} pears", 3, 5);`
- `{} apples and {} pears`
- `3 5 apples and pears`
+ `3 apples and 5 pears`
- `5 apples and 3 pears`
= Each `{}` is replaced by the next value, in order: the first by 3, the second by 5.

? The compiler reports an error at `src/main.rs:7:12`. Where should you look?
- Line 12, character 7
- The 7th file, line 12
+ Line 7, character 12
- Chapter 7, section 12 of the manual
= The format is file, then line, then column (the character position on that line).
:::

:::exercise guided Make it yours
1. In `src/main.rs`, change the message so that the program greets you by name.
2. Add a second `println!` that prints your city.
3. Add a third line that uses a placeholder to print the result of `365 * 24`, with the words "hours in a year" after it.
4. Run the program with `cargo run`.
::hint
For step 3 the pattern is `println!("{} some words", calculation);`. The star `*` means "multiplied by".
::solution
```rust run
fn main() {
    println!("Hello, my name is Sara.");
    println!("I live in Addis Ababa.");
    println!("{} hours in a year", 365 * 24);
}
```
```output
Hello, my name is Sara.
I live in Addis Ababa.
8760 hours in a year
```

The computer worked out `365 * 24` and put the result where the `{}` was. Notice that the calculation is *not* inside the quotes. Anything inside the quotes is plain text and is printed exactly as written.
:::

:::exercise practice A name badge
Write a program that prints this badge, with your own name in it:

```text
*****************
*  HELLO        *
*  my name is   *
*  Ferris       *
*****************
```
::hint
Use one `println!` for each line. Spaces inside the quotes are printed too.
::solution
```rust run
fn main() {
    println!("*****************");
    println!("*  HELLO        *");
    println!("*  my name is   *");
    println!("*  Ferris       *");
    println!("*****************");
}
```
```output
*****************
*  HELLO        *
*  my name is   *
*  Ferris       *
*****************
```

Five instructions, run from top to bottom. Later you will learn to draw a box of any size with a loop, without typing every line yourself.
:::

:::exercise practice Bug hunt
This program has three mistakes. Find and fix them. Try to find them by reading first. Then check with the compiler: fix the first error it reports, run again, and repeat.

```rust fail
fn main() {
    println!("Step one")
    println("Step two");
    println!("Step three);
}
```
::hint
Compare each line with a working `println!` line, one character at a time: the `!`, the two quote marks, the semicolon.
::solution
```rust run
fn main() {
    println!("Step one");
    println!("Step two");
    println!("Step three");
}
```
```output
Step one
Step two
Step three
```

1. Line 2 was missing the `;` at the end.
2. Line 3 was missing the `!` after `println`.
3. Line 4 was missing the closing `"` of the string. Without it, the compiler thinks the rest of the file is still text.

Finding small mistakes like these is a normal part of programming. It gets much faster with practice.
:::

:::exercise challenge A recipe card
Print a recipe card for pancakes for 3 people. One person needs 50 g of flour, 1 egg and 100 ml of milk. Do **not** work out the amounts in your head: let the program calculate them from the number 3, using `*`. The output should look like this:

```text
Pancakes for 3 people
- 150 g flour
- 3 eggs
- 300 ml milk
```
::hint
You can put a calculation after the comma: `println!("- {} g flour", 50 * 3);`
::solution
```rust run
fn main() {
    println!("Pancakes for {} people", 3);
    println!("- {} g flour", 50 * 3);
    println!("- {} eggs", 1 * 3);
    println!("- {} ml milk", 100 * 3);
}
```
```output
Pancakes for 3 people
- 150 g flour
- 3 eggs
- 300 ml milk
```

It works, but the number `3` is written four times. To cook for 5 people you would have to change it in four places, and it is easy to miss one. In Part 2 you first see how source code like this turns into assembly and ELF machine executables, and then Part 3 fixes the repetition with **variables**: you give the value a name once and use the name everywhere.
:::
