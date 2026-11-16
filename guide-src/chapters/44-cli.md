@id cli
@part p12
@kind project
@title Command-line tools with clap
@short Command-line tools
@level intermediate
@time 100
@learn Describe what makes a command-line tool pleasant to use | Define arguments, options, flags and subcommands with clap | Get help texts, validation and error messages generated for you | Build a complete to-do tool that stores its data as JSON | Test a command-line program

A command-line interface (CLI) lets a user give a program instructions through a terminal. Rust is one option for building CLI tools: Cargo can produce a native executable, and Rust's type system helps make argument handling explicit. Portability and runtime dependencies depend on the target and how the program is linked. Examples of Rust CLI applications include `ripgrep`, `fd`, `bat` and `eza`.

In [chapter 28](#project-search) you parsed arguments by hand. That works for two switches. Real tools have dozens of options, need help texts and error messages, and should behave the way users expect. The crate **clap** ("command line argument parser") does all of that from a description of your options.

:::plain Arguments, options, flags, and subcommands
A command line is a small language, and clap is its grammar. **Arguments** are positional values (`todo add "buy milk"`), **options** take a value (`--port 8080`), **flags** are switches with no value (`--verbose`), and **subcommands** are a second word that selects a whole different set of arguments. With derive, a `struct` describes the top level and an `enum` describes the subcommands, `Cli::parse()` turns `std::env::args` into a typed value or prints help and exits, and `try_parse_from` does the same for tests. Exit codes matter too: `0` for success, non-zero for failure, so scripts can branch on the result.
:::

## The parts of a command line

```text
todo  --file work.json  add  "call Sara"  --priority high
────  ────────────────  ───  ───────────  ───────────────
 │            │           │        │              │
program    option with  subcommand argument   option with value
           a value                (positional)
```

- An **argument** (or *positional* argument) is identified by its position: `"call Sara"`.
- An **option** has a name and a value: `--priority high`. Most have a long form (`--priority`) and a short one (`-p`).
- A **flag** is an option without a value. It is either there or not: `--all`.
- A **subcommand** selects one of several operations, each with its own arguments: `git commit`, `cargo build`, `todo add`.

Conventions that users rely on, and that clap gives you by default:

- `--help` and `-h` print help. `--version` and `-V` print the version.
- Short flags can be combined: `-av` means `-a -v`.
- `--` ends the options. Everything after it is an argument, even if it starts with a dash.
- Results go to standard output, messages and errors to standard error.
- The exit code is 0 for success, and something else for failure.

## A first program with clap

```toml
[dependencies]
clap = { version = "4.6.7", features = ["derive"] }
```

You describe the command line as a struct. Each field is one argument:

```rust ext run
use clap::Parser;

/// Greets people
#[derive(Debug, Parser)]
#[command(name = "greet", version = "1.0")]
struct Args {
    /// The name of the person to greet
    name: String,

    /// How many times to greet
    #[arg(short, long, default_value_t = 1)]
    count: u8,

    /// Use upper case
    #[arg(short, long)]
    loud: bool,

    /// A title to put before the name
    #[arg(long)]
    title: Option<String>,
}

fn greet(args: &Args) {
    let who = match &args.title {
        Some(title) => format!("{title} {}", args.name),
        None => args.name.clone(),
    };
    for _ in 0..args.count {
        let line = format!("Hello, {who}!");
        println!("{}", if args.loud { line.to_uppercase() } else { line });
    }
}

fn main() {
    // In a real program: let args = Args::parse();
    // Here the arguments are given in the code, so that the example always behaves the same.
    for command_line in [
        vec!["greet", "Sara"],
        vec!["greet", "Tomas", "--count", "2", "--loud"],
        vec!["greet", "-c", "1", "--title", "Dr.", "Lena"],
        vec!["greet"],
        vec!["greet", "Abel", "--count", "many"],
    ] {
        println!("$ {}", command_line.join(" "));
        match Args::try_parse_from(&command_line) {
            Ok(args) => greet(&args),
            Err(error) => println!("{}", error.to_string().lines().next().unwrap_or("")),
        }
    }
}
```
```output
$ greet Sara
Hello, Sara!
$ greet Tomas --count 2 --loud
HELLO, TOMAS!
HELLO, TOMAS!
$ greet -c 1 --title Dr. Lena
Hello, Dr. Lena!
$ greet
error: the following required arguments were not provided:
$ greet Abel --count many
error: invalid value 'many' for '--count <COUNT>': invalid digit found in string
```

How the struct turns into a command line:

| Field | Becomes |
|---|---|
| `name: String` (no attribute) | a required positional argument |
| `#[arg(short, long)] loud: bool` | a flag `-l` / `--loud`. False unless given |
| `#[arg(short, long, default_value_t = 1)] count: u8` | an option `-c` / `--count` with a value. The text is converted to `u8`, and anything else is an error |
| `#[arg(long)] title: Option<String>` | an optional option. `None` if absent |
| `files: Vec<String>` | any number of values |
| the `///` comments | the help texts |

`Args::parse()` reads the real command line. If something is wrong, it prints an error with a usage hint and ends the program with exit code 2. If `--help` is given, it prints the help and exits. Your code only ever sees a valid, typed `Args` value. This is "parse, don't validate" once more, done by a library.

`Args::try_parse_from(list)` does the same for a list of strings and returns a `Result`. It is the key to testing a command-line definition, and this chapter uses it to make the examples repeatable.

### More control

```rust ext run
use clap::{CommandFactory, Parser, ValueEnum};

/// Resizes images
#[derive(Debug, Parser)]
#[command(name = "resize", version = "0.3.0")]
struct Args {
    /// The images to resize
    #[arg(required = true)]
    files: Vec<String>,

    /// The new width in pixels
    #[arg(short, long, value_parser = clap::value_parser!(u32).range(1..=10_000))]
    width: u32,

    /// The output format
    #[arg(short, long, value_enum, default_value_t = Format::Png)]
    format: Format,

    /// Say more about what is happening (can be repeated: -vv)
    #[arg(short, long, action = clap::ArgAction::Count)]
    verbose: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, ValueEnum)]
enum Format {
    Png,
    Jpeg,
    Webp,
}

fn main() {
    let args = Args::try_parse_from(["resize", "a.png", "b.png", "-w", "800", "-f", "webp", "-vv"]).unwrap();
    println!("{:?}", args);

    let error = Args::try_parse_from(["resize", "a.png", "--width", "0"]).unwrap_err();
    println!("{}", error.to_string().lines().next().unwrap_or(""));

    println!("{}", Args::command().render_help());
}
```
```output
Args { files: ["a.png", "b.png"], width: 800, format: Webp, verbose: 2 }
error: invalid value '0' for '--width <WIDTH>': 0 is not in 1..=10000
Resizes images

Usage: resize [OPTIONS] --width <WIDTH> <FILES>...

Arguments:
  <FILES>...  The images to resize

Options:
  -w, --width <WIDTH>    The new width in pixels
  -f, --format <FORMAT>  The output format [default: png] [possible values: png, jpeg, webp]
  -v, --verbose...       Say more about what is happening (can be repeated: -vv)
  -h, --help             Print help
  -V, --version          Print version

```

- An enum with `#[derive(ValueEnum)]` becomes an option with a fixed set of values. The help lists them, and a wrong value is rejected with the list.
- `value_parser!(u32).range(1..=10_000)` restricts a number to a range.
- `ArgAction::Count` counts how often a flag is given: `-v`, `-vv`, `-vvv`.
- A type that implements `FromStr` can be used directly as a field type, such as the `Minutes` of [chapter 37](#type-system).
- The whole help text at the end was generated from the struct and its comments.

## The project: a to-do tool

You will now rebuild the to-do list of [chapter 21](#project-todo) as a proper command-line tool. Each call does one thing and ends, and the tasks are kept in a JSON file between calls:

```text
$ todo add "buy milk"
Added task 1.
$ todo add "call Sara" --priority high
Added task 2.
$ todo add "water the plants" -p low
Added task 3.
$ todo list
[ ]   2  call Sara (!)
[ ]   1  buy milk
[ ]   3  water the plants
$ todo done 1 3
Marked 2 task(s) as done.
$ todo list --all
[ ]   2  call Sara (!)
[x]   1  buy milk
[x]   3  water the plants
```

### Step 0: plan

The design follows the pattern of all the projects so far:

1. **The command line** is described by types. clap turns the arguments into a `Cli` value.
2. **The data** is a `TodoList` that Serde reads from and writes to a JSON file.
3. **The logic** is one function, `run(command, &mut list)`, that changes the list and *returns* the text to print. It reads no files and prints nothing, so it is easy to test.
4. **`main`** connects the three: parse, load, run, save, print, and choose the exit code.

```text
cargo new todo
cd todo
cargo add clap --features derive
cargo add serde --features derive
cargo add serde_json anyhow
```

```toml proj=todo_cli file=Cargo.toml
[package]
name = "todo"
version = "0.1.0"
edition = "2024"

[dependencies]
anyhow = "1"
clap = { version = "4", features = ["derive"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Step 1: describe the command line

```rust
use clap::{Parser, Subcommand, ValueEnum};

/// A to-do list for the command line
#[derive(Debug, Parser)]
#[command(name = "todo", version, about)]
struct Cli {
    /// The file that stores the tasks
    #[arg(short, long, default_value = "todo.json", global = true)]
    file: PathBuf,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Add a new task
    Add {
        /// What needs to be done
        title: String,

        /// How urgent the task is
        #[arg(short, long, value_enum, default_value_t = Priority::Normal)]
        priority: Priority,
    },
    /// Show the tasks
    List {
        /// Also show tasks that are done
        #[arg(short, long)]
        all: bool,
    },
    /// Mark tasks as done
    Done {
        /// The numbers of the tasks
        #[arg(required = true)]
        ids: Vec<u32>,
    },
    /// Delete a task
    Remove {
        /// The number of the task
        id: u32,
    },
}
```

**Subcommands are an enum.** Each variant is one subcommand, and its fields are that subcommand's arguments. It is the same `Command` enum as in [chapter 21](#project-todo). There you wrote the function that turns text into the enum. Here clap generates it.

- `#[command(version, about)]` takes the version number from `Cargo.toml` and the description from the `///` comment.
- `global = true` lets `--file` be written before or after the subcommand.
- `PathBuf` is the owned type for file paths.

With no further work, the tool has help for itself and for every subcommand:

```text
$ todo --help
A to-do list for the command line

Usage: todo [OPTIONS] <COMMAND>

Commands:
  add     Add a new task
  list    Show the tasks
  done    Mark tasks as done
  remove  Delete a task
  help    Print this message or the help of the given subcommand(s)

Options:
  -f, --file <FILE>  The file that stores the tasks [default: todo.json]
  -h, --help         Print help
  -V, --version      Print version

$ todo add --help
Add a new task

Usage: todo add [OPTIONS] <TITLE>

Arguments:
  <TITLE>  What needs to be done

Options:
  -f, --file <FILE>          The file that stores the tasks [default: todo.json]
  -p, --priority <PRIORITY>  How urgent the task is [default: normal] [possible values: low, normal, high]
  -h, --help                 Print help
```

### Step 2: the data and its file

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Priority {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Task {
    id: u32,
    title: String,
    done: bool,
    priority: Priority,
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct TodoList {
    tasks: Vec<Task>,
}

impl TodoList {
    fn load(path: &Path) -> Result<TodoList> {
        if !path.exists() {
            return Ok(TodoList::default());
        }
        let text = fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
        serde_json::from_str(&text).with_context(|| format!("{} is not a valid to-do file", path.display()))
    }

    fn save(&self, path: &Path) -> Result<()> {
        let text = serde_json::to_string_pretty(self)?;
        fs::write(path, text).with_context(|| format!("could not write {}", path.display()))
    }

    fn next_id(&self) -> u32 {
        self.tasks.iter().map(|task| task.id).max().unwrap_or(0) + 1
    }

    fn find(&mut self, id: u32) -> Result<&mut Task> {
        self.tasks.iter_mut().find(|task| task.id == id).with_context(|| format!("there is no task {id}"))
    }
}
```

`Priority` shows how well the ecosystem fits together: one enum derives `ValueEnum` for clap **and** `Serialize`/`Deserialize` for Serde. It is a command-line option and a JSON value at once. It also derives `Ord`. Enum variants are ordered as they are written, so `Low < Normal < High`.

- `load` treats a missing file as an empty list. The first `todo add` then just works.
- `Result` here is `anyhow::Result`. `with_context` on an `Option` (as in `find`) turns `None` into an error with that message.
- The next id is one more than the largest id in use, so an id is never given out twice while its task exists.

### Step 3: the logic

```rust
/// Carries out a command. Returns the text to print, and whether the list changed.
fn run(command: Command, list: &mut TodoList) -> Result<(String, bool)> {
    match command {
        Command::Add { title, priority } => {
            let title = title.trim();
            if title.is_empty() {
                bail!("the title must not be empty");
            }
            let id = list.next_id();
            list.tasks.push(Task { id, title: title.to_string(), done: false, priority });
            Ok((format!("Added task {id}."), true))
        }
        Command::List { all } => {
            let mut shown: Vec<&Task> = list.tasks.iter().filter(|task| all || !task.done).collect();
            shown.sort_by_key(|task| (task.done, std::cmp::Reverse(task.priority), task.id));
            if shown.is_empty() {
                return Ok((String::from("Nothing to do."), false));
            }
            let lines: Vec<String> = shown
                .iter()
                .map(|task| {
                    let mark = if task.done { "x" } else { " " };
                    let urgent = if task.priority == Priority::High { " (!)" } else { "" };
                    format!("[{mark}] {:>3}  {}{urgent}", task.id, task.title)
                })
                .collect();
            Ok((lines.join("\n"), false))
        }
        Command::Done { ids } => {
            for id in &ids {
                list.find(*id)?.done = true;
            }
            Ok((format!("Marked {} task(s) as done.", ids.len()), true))
        }
        Command::Remove { id } => {
            list.find(id)?;
            list.tasks.retain(|task| task.id != id);
            Ok((format!("Removed task {id}."), true))
        }
    }
}
```

`run` returns two things: the text for the user, and whether the list was changed, so that `main` knows whether to save. The sorting key is a tuple, which is compared part by part: open tasks before finished ones, then the highest priority first (`Reverse` turns that part around), then by id.

### Step 4: `main`, errors and exit codes

```rust
fn try_main() -> Result<()> {
    let cli = Cli::parse();
    let mut list = TodoList::load(&cli.file)?;

    let (output, changed) = run(cli.command, &mut list)?;
    if changed {
        list.save(&cli.file)?;
    }
    println!("{output}");
    Ok(())
}

fn main() -> ExitCode {
    match try_main() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}
```

`main` returns an `ExitCode`. That is tidier than `process::exit`, because the program ends in the normal way and all values are dropped properly. The real work is in `try_main`, where `?` can be used freely. Every error ends up in one place, is printed to standard error with its chain of causes (`{error:#}`), and gives exit code 1.

```text
$ todo done 9
error: there is no task 9
$ echo $?
1

$ todo add
error: the following required arguments were not provided:
  <TITLE>

Usage: todo add <TITLE>

For more information, try '--help'.

$ todo add x -p urgent
error: invalid value 'urgent' for '--priority <PRIORITY>'
  [possible values: low, normal, high]

For more information, try '--help'.
```

The first error comes from your code. The other two come from clap, which exits with code 2 for a wrong command line. (`echo $?` shows the exit code of the last command in most shells.)

### Step 5: tests

Since `run` takes a `Command` and a list, and returns text, the tests need no files and no processes. `Cli::try_parse_from` lets them start from the words a user would type:

```rust proj=todo_cli file=src/main.rs
#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Command {
        Cli::try_parse_from(args).expect("the arguments are valid").command
    }

    #[test]
    fn the_command_line_definition_is_consistent() {
        use clap::CommandFactory;
        Cli::command().debug_assert();
    }

    #[test]
    fn adding_and_listing() {
        let mut list = TodoList::default();
        run(parse(&["todo", "add", "buy milk"]), &mut list).unwrap();
        run(parse(&["todo", "add", "call Sara", "--priority", "high"]), &mut list).unwrap();

        let (output, changed) = run(parse(&["todo", "list"]), &mut list).unwrap();
        assert_eq!(output, "[ ]   2  call Sara (!)\n[ ]   1  buy milk");
        assert!(!changed);
    }

    #[test]
    fn done_tasks_are_hidden_unless_asked_for() {
        let mut list = TodoList::default();
        run(parse(&["todo", "add", "one"]), &mut list).unwrap();
        run(parse(&["todo", "add", "two"]), &mut list).unwrap();
        run(parse(&["todo", "done", "1"]), &mut list).unwrap();

        assert_eq!(run(parse(&["todo", "list"]), &mut list).unwrap().0, "[ ]   2  two");
        assert_eq!(run(parse(&["todo", "list", "--all"]), &mut list).unwrap().0, "[ ]   2  two\n[x]   1  one");
    }

    #[test]
    fn unknown_ids_are_errors() {
        let mut list = TodoList::default();
        assert!(run(parse(&["todo", "done", "9"]), &mut list).is_err());
        assert!(run(parse(&["todo", "remove", "9"]), &mut list).is_err());
    }

    #[test]
    fn bad_arguments_are_rejected() {
        assert!(Cli::try_parse_from(["todo", "add"]).is_err());
        assert!(Cli::try_parse_from(["todo", "done"]).is_err());
        assert!(Cli::try_parse_from(["todo", "done", "two"]).is_err());
        assert!(Cli::try_parse_from(["todo", "add", "x", "--priority", "urgent"]).is_err());
        assert!(Cli::try_parse_from(["todo", "dance"]).is_err());
    }
}
```

The first test is a gift from clap: `debug_assert` checks the whole definition for mistakes such as two options with the same short letter. Without it, such a mistake would only show when a user runs the program.

To test the finished program from outside, with a real file and real exit codes, the crate `assert_cmd` runs the compiled binary inside a test:

```rust
use assert_cmd::Command;

#[test]
fn unknown_task_gives_exit_code_1() {
    Command::cargo_bin("todo")
        .unwrap()
        .args(["--file", "does-not-exist.json", "done", "9"])
        .assert()
        .failure()
        .code(1)
        .stderr(predicates::str::contains("there is no task 9"));
}
```

### The complete program

```rust ext check proj=todo_cli file=src/main.rs
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};

/// A to-do list for the command line
#[derive(Debug, Parser)]
#[command(name = "todo", version, about)]
struct Cli {
    /// The file that stores the tasks
    #[arg(short, long, default_value = "todo.json", global = true)]
    file: PathBuf,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Add a new task
    Add {
        /// What needs to be done
        title: String,

        /// How urgent the task is
        #[arg(short, long, value_enum, default_value_t = Priority::Normal)]
        priority: Priority,
    },
    /// Show the tasks
    List {
        /// Also show tasks that are done
        #[arg(short, long)]
        all: bool,
    },
    /// Mark tasks as done
    Done {
        /// The numbers of the tasks
        #[arg(required = true)]
        ids: Vec<u32>,
    },
    /// Delete a task
    Remove {
        /// The number of the task
        id: u32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Priority {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Task {
    id: u32,
    title: String,
    done: bool,
    priority: Priority,
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct TodoList {
    tasks: Vec<Task>,
}

impl TodoList {
    fn load(path: &Path) -> Result<TodoList> {
        if !path.exists() {
            return Ok(TodoList::default());
        }
        let text = fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
        serde_json::from_str(&text).with_context(|| format!("{} is not a valid to-do file", path.display()))
    }

    fn save(&self, path: &Path) -> Result<()> {
        let text = serde_json::to_string_pretty(self)?;
        fs::write(path, text).with_context(|| format!("could not write {}", path.display()))
    }

    fn next_id(&self) -> u32 {
        self.tasks.iter().map(|task| task.id).max().unwrap_or(0) + 1
    }

    fn find(&mut self, id: u32) -> Result<&mut Task> {
        self.tasks.iter_mut().find(|task| task.id == id).with_context(|| format!("there is no task {id}"))
    }
}

/// Carries out a command. Returns the text to print, and whether the list changed.
fn run(command: Command, list: &mut TodoList) -> Result<(String, bool)> {
    match command {
        Command::Add { title, priority } => {
            let title = title.trim();
            if title.is_empty() {
                bail!("the title must not be empty");
            }
            let id = list.next_id();
            list.tasks.push(Task { id, title: title.to_string(), done: false, priority });
            Ok((format!("Added task {id}."), true))
        }
        Command::List { all } => {
            let mut shown: Vec<&Task> = list.tasks.iter().filter(|task| all || !task.done).collect();
            shown.sort_by_key(|task| (task.done, std::cmp::Reverse(task.priority), task.id));
            if shown.is_empty() {
                return Ok((String::from("Nothing to do."), false));
            }
            let lines: Vec<String> = shown
                .iter()
                .map(|task| {
                    let mark = if task.done { "x" } else { " " };
                    let urgent = if task.priority == Priority::High { " (!)" } else { "" };
                    format!("[{mark}] {:>3}  {}{urgent}", task.id, task.title)
                })
                .collect();
            Ok((lines.join("\n"), false))
        }
        Command::Done { ids } => {
            for id in &ids {
                list.find(*id)?.done = true;
            }
            Ok((format!("Marked {} task(s) as done.", ids.len()), true))
        }
        Command::Remove { id } => {
            list.find(id)?;
            list.tasks.retain(|task| task.id != id);
            Ok((format!("Removed task {id}."), true))
        }
    }
}

fn try_main() -> Result<()> {
    let cli = Cli::parse();
    let mut list = TodoList::load(&cli.file)?;

    let (output, changed) = run(cli.command, &mut list)?;
    if changed {
        list.save(&cli.file)?;
    }
    println!("{output}");
    Ok(())
}

fn main() -> ExitCode {
    match try_main() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}
```

Install it with `cargo install --path .`, and `todo` is available in every folder.

## Good manners for command-line tools

- **Be quiet when things go well**, and clear when they do not. Say what failed, with which file, and if possible what to do about it.
- **Work in pipelines.** Read from standard input when no file is given, and write plain results to standard output, so that the tool can be combined with others: `cat notes.txt | mytool | sort`.
- **Do not decorate output that is not going to a person.** `std::io::IsTerminal` tells you whether standard output is a terminal or a pipe. Colours and progress bars belong only on a terminal.
- **Offer machine-readable output**, such as `--json`, when other programs may want to read the result.
- **Never lose data.** Ask before destructive actions, or offer `--dry-run`, which shows what would happen.
- **Follow the conventions** for `--help`, `--version`, `--verbose`, `--quiet` and exit codes.

```rust run
use std::io::{self, IsTerminal, Read};

fn main() -> io::Result<()> {
    if io::stdin().is_terminal() {
        println!("No input was piped in. Try: echo hello | this_program");
        return Ok(());
    }
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    println!("{} lines, {} words", input.lines().count(), input.split_whitespace().count());
    Ok(())
}
```
```output
0 lines, 0 words
```

(The example was run here without a terminal and with empty input.)


### When the reader leaves early

Try any program that prints many lines with `println!`, and cut its output short: `mytool | head -2`. `head` reads two lines and ends. The next `println!` has nobody to write to, and it panics:

```text nosoft
$ mytool | head -2
line 1
line 2

thread 'main' panicked at library/std/src/io/stdio.rs:1209:9:
failed printing to stdout: Broken pipe (os error 32)
```

A user who only asked for the first two lines should not see a crash. A tool that prints a lot writes with `writeln!`, which returns the error as a value, and treats a closed pipe as a normal end:

```rust run nocmp noplay
use std::io::{self, ErrorKind, Write};

fn main() -> io::Result<()> {
    let mut out = io::stdout().lock();
    for n in 1..=100_000 {
        if let Err(error) = writeln!(out, "line {n}") {
            if error.kind() == ErrorKind::BrokenPipe {
                return Ok(()); // the reader has left: stop quietly
            }
            return Err(error);
        }
    }
    Ok(())
}
```

Locking standard output once, as this program does, also makes the writing faster ([chapter 76](#performance)).

The other early exit is the one the user asks for: **Ctrl+C**. By default it kills the program where it stands, which is fine for a tool that only prints, and wrong for one that is holding a lock file, a temporary file or a half-written download. Handle the interrupt and tidy up:

- In an async program, `tokio::signal::ctrl_c().await` is one line in a `select!` next to the real work; the server chapters use it for a graceful shutdown.
- In a synchronous program, the crate `ctrlc` installs a handler that runs your closure.
- Exit with code **130** (128 + SIGINT), so scripts and shells know the program was interrupted rather than failed. A `Drop` guard that removes the temporary file is often all the tidy-up you need.

A program that ignores Ctrl+C entirely, or that swallows it and keeps working, is worse than one that dies: the user's only remaining option is `kill -9`, which leaves the mess behind.

### Running other programs

Command-line tools often start other tools: a compiler, `git`, an editor. `std::process::Command` does that:

```rust run nocmp noplay
use std::io::Write;
use std::process::{Command, Stdio};

fn main() -> std::io::Result<()> {
    // 1. Run a program and collect what it prints
    let output = Command::new("rustc").arg("--version").output()?;
    println!("success: {}", output.status.success());
    println!("printed: {}", String::from_utf8_lossy(&output.stdout).trim());

    // 2. A program that fails: its exit code says so, and nothing panics
    let output = Command::new("rustc").arg("no_such_file.rs").output()?;
    let errors = String::from_utf8_lossy(&output.stderr);
    println!("exit code: {:?}", output.status.code());
    println!("complaint: {}", errors.lines().next().unwrap_or(""));

    // 3. A program that cannot be started is an `Err`
    match Command::new("no-such-program").status() {
        Ok(status) => println!("it ran: {status}"),
        Err(error) => println!("could not start: {error}"),
    }

    // 4. Send text to a program and read its answer
    let mut child = Command::new("sort").stdin(Stdio::piped()).stdout(Stdio::piped()).spawn()?;
    let mut input = child.stdin.take().expect("stdin is piped");
    input.write_all(b"pear\napple\nfig\n")?;
    drop(input); // closes the pipe, so that `sort` knows the input is complete
    let sorted = child.wait_with_output()?;
    println!("sorted: {}", String::from_utf8_lossy(&sorted.stdout).replace('\n', " "));

    Ok(())
}
```
```output
success: true
printed: rustc 1.100.0 (0ef1bc386 2026-11-09)
exit code: Some(1)
complaint: error: couldn't find file `no_such_file.rs`
could not start: No such file or directory (os error 2)
sorted: apple fig pear 
```

- **Three ways to start.** `output()` waits and collects everything the program printed. `status()` waits and lets the program use your terminal directly. `spawn()` returns at once with a `Child` that you can talk to and wait for later.
- **A failing program is not an `Err`.** An `Err` means that the program could not be started at all. If it started and failed, you get `Ok` with an exit code other than 0. Check `status.success()` every time.
- **Arguments are passed one by one**, with `arg` or `args`. No shell is involved, so a file name with spaces or with a `;` in it is passed on exactly as it is. Do not build one long command string and hand it to `sh -c`. With text from a user, that is the same mistake as building SQL from input ([chapter 73](#databases)).
- **Close the input when you are done.** `sort` waits for the end of its input. Dropping the handle closes the pipe.

### Configuration files and precedence

Well-behaved command-line tools combine three sources in a predictable order, where each layer overrides the one below it:

1. **Built-in defaults** (for example, `color = "auto"`).
2. **User configuration file** in the operating system's standard folder—found portably with `directories::ProjectDirs::from("", "", "myapp")` (`~/.config/myapp/config.toml` on Linux, `~/Library/Application Support/…` on macOS, `%APPDATA%` on Windows).
3. **Environment variables** (with `clap`'s `#[arg(env = "MYAPP_FORMAT")]`).
4. **Command-line flags** (`--format json`), which always win for a single invocation.

See [chapter 69](#web) for layered configuration with `figment` and protecting secret settings with `secrecy`.

### More crates for the terminal

| Crate | Purpose |
|---|---|
| `clap_complete` | generate tab-completion scripts for bash, zsh, fish and PowerShell |
| `indicatif` | progress bars and spinners |
| `owo-colors`, `colored`, `anstyle` | coloured text |
| `dialoguer`, `inquire` | questions, menus and password prompts |
| `ratatui` with `crossterm` | full-screen terminal interfaces |
| `comfy-table`, `tabled` | tables |
| `directories` | the right folders for configuration and data on each system |
| `assert_cmd`, `predicates`, `trycmd` | testing command-line programs |
| `cargo-dist` | build and publish installers for all platforms |

### Tab completion and man pages

A tool that people use daily should complete its own arguments. `clap` knows the whole grammar already, so `clap_complete` turns that structure into a completion script for bash, zsh, fish and PowerShell — no second definition to keep in sync. The usual pattern is a hidden subcommand that writes the script to standard output:

`clap_complete::generate` takes the shell, the command definition (`Cli::command()`), the program name and any `Write` — usually `std::io::stdout()` — and writes the script there. Wire it to a hidden `completions <shell>` subcommand, so the script is produced by the binary itself and can never drift out of step with the parser.

The user then installs it once:

```sh
todo completions bash > ~/.local/share/bash-completion/completions/todo   # bash
todo completions zsh  > ~/.zfunc/_todo                                    # zsh, with fpath set
todo completions fish > ~/.config/fish/completions/todo.fish              # fish
```

Keep the subcommand `#[command(hide = true)]`: it is plumbing, not a feature to advertise in `--help`. The same idea for documentation: `clap_mangen` renders the same definition as a man page, so `todo completions` and `man todo` describe exactly what the program accepts. Distributions that package your tool will ask for both.

### Full-screen interfaces

Some programs are not a command that prints and exits but a place you stay in: a log viewer, a file browser, a dashboard, a mail client. They need the whole terminal — a fixed layout, panels that update independently, keys that act on a selection.

`ratatui` is the standard crate for this, with `crossterm` underneath it for the terminal itself. Its model is **immediate mode**, and that phrase is the whole idea: you do not build a widget tree once and mutate it. On every tick — say thirty times a second — you describe the entire screen from your current state, and the library redraws it. There is no hidden state to fall out of sync with your data, and no callbacks:

In outline the loop is four steps: `terminal.draw(|frame| render(frame, &app))?` to describe the whole screen, one blocking read of a key, `app.on_key(key)` to change the state, and a break when the state says the user asked to quit. Everything the program knows lives in `app`; the screen is a function of it.

Three things are different from a program that prints:

- **The terminal becomes state you borrowed.** You enter raw mode and the alternate screen, and you must leave them again — including when the program panics. A terminal left in raw mode with no cursor is a support call. `ratatui`'s examples show the restore-on-panic hook; copy it.
- **Layout is code.** You split the screen into rectangles with constraints (`Length(3)`, `Percentage(40)`, `Min(10)`), and each widget draws into its rectangle.
- **Test the logic, not the pixels.** Keep the application state and the key handling in plain structs with plain methods, tested as in [chapter 27](#testing). The drawing function is then the only part you cannot unit-test, and it should contain no decisions.

Which crate for which job, in one table:

| Job | Crate | Example |
|---|---|---|
| Show progress on a long task | `indicatif` | a download bar, a spinner during a build |
| Ask a question and read an answer | `dialoguer`, `inquire` | a menu, a confirmation, a password prompt |
| Print an aligned table and exit | `comfy-table`, `tabled` | `todo list` |
| Own the screen and stay running | `ratatui` + `crossterm` | a dashboard, a file browser, a TUI client |

Start with the first three. Reach for `ratatui` when you notice that you are clearing the screen and reprinting it yourself.


## Questions and progress: `dialoguer` and `indicatif`

clap parses what the user types. Two crates handle the rest of a pleasant terminal program: asking questions, and showing that work is under way.

**`dialoguer`** shows prompts: confirm (yes or no), input (free text), password (hidden keystrokes), select (a menu), multi-select. It reads the keyboard directly, so it needs a real terminal — run these programs yourself; they do not work in the playground or when standard input is piped.

```toml
dialoguer = "0.11"
indicatif = "0.5"
```

A small interview:

```rust
use dialoguer::{Confirm, Input, Password, Select};
use dialoguer::theme::ColorfulTheme;

fn main() -> Result<(), dialoguer::Error> {
    let theme = ColorfulTheme::default();

    let name: String = Input::with_theme(&theme)
        .with_prompt("Your name")
        .interact()?;

    let pick = Select::with_theme(&theme)
        .with_prompt("Which drink?")
        .items(&["Tea", "Coffee", "Water"])
        .default(0)
        .interact()?;

    let secret = Password::with_theme(&theme)
        .with_prompt("Password")
        .interact()?;

    let sure = Confirm::with_theme(&theme)
        .with_prompt("Continue?")
        .default(true)
        .interact()?;

    let drinks = &["Tea", "Coffee", "Water"];
    println!("{name} likes {}; continue: {sure} (password has {} characters)",
        drinks[pick], secret.len());
    Ok(())
}
```

A typical run looks like this (your terminal may show colours):

```text
Your name: › Sara
Which drink? › [Use arrows to move]
> Tea
  Coffee
  Water
Password: › ********
Continue? › Yes
Sara likes Tea; continue: true (password has 8 characters)
```

The returned values are ordinary Rust values: a `String`, the index of the chosen item, a `bool`. Validate them afterward (`if name.is_empty() { ... }`) just as you would with clap.

**`indicatif`** draws progress bars and spinners for work that takes seconds or minutes. It writes to standard output, so a well-behaved tool checks `std::io::stdout().is_terminal()` and stays quiet when its output is piped ("When the reader leaves early", above):

```rust
use indicatif::{ProgressBar, ProgressStyle};
use std::thread;
use std::time::Duration;

let bar = ProgressBar::new(100);
bar.set_style(ProgressStyle::default_bar()
    .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta})")
    .unwrap()
    .progress_chars("#>-"));
for _ in 0..100 {
    // one piece of work happens here
    bar.inc(1);
    thread::sleep(Duration::from_millis(20));
}
bar.finish_with_message("done");
```

A run prints something like:

```text
[####----------------------] 12% 0:00:01 left (1/8)
```

- `ProgressBar::new(100)` declares the total; `inc(1)` advances it by one.
- The template controls what is shown: a spinner, elapsed time, the bar, position, total and the estimated time left.
- `finish_with_message` replaces the bar with a final line, so the screen never ends on a half-drawn bar.

| Crate | Use it for |
|---|---|
| `dialoguer` | questions, menus, passwords — anything the user must answer while the program runs |
| `indicatif` | progress bars and spinners for long work |
| `clap_complete` | tab completion for bash, zsh, fish and PowerShell |
| `owo-colors`, `anstyle` | coloured text on a terminal |

A progress bar piped into a file fills it with escape sequences. Check `is_terminal`, or offer a `--quiet` flag.

## Configuration: where values come from

A program that hard-codes its path, port or API key has to be rebuilt for every machine it runs on. A program that reads everything from the environment is untestable and unpleasant to use. The good answer is a **layered** one: every setting can come from several places, and the closest-to-the-user source wins.

The precedence chain, which is the same in almost every well-built tool:

```text
command-line flag   >   environment variable   >   configuration file   >   built-in default
```

The order is not arbitrary. A flag is chosen by the person running the command *now*, so it must win. An environment variable is set by whoever deployed this instance. A file is a shared, versioned configuration. A default is the author's guess. Each layer overrides the one after it, and every setting has a default, so a program with no configuration at all still starts.

### A file, with defaults

```toml
# todo.toml — committed, contains nothing secret
[server]
host = "127.0.0.1"
port = 8080

[logging]
# a duration in a human unit, not a number of milliseconds
timeout = "30s"
```

### Environment variables that override it

```sh
TDL_PORT=9000 TDL_LOG=debug todoui add "buy tea"
```

Two conventions make this pleasant. **Prefix everything** (`TDL_`), so the program's variables cannot collide with the hundreds of others in the environment. And **parse once, at start-up, into one typed struct**, using `serde` and its `#[serde(default)]` attribute: the file and the environment are merged into a `Config`, and the rest of the program never looks at an environment variable again. A mistyped port then fails immediately with a clear message instead of at the first request.

The crates for the layering are:

| Crate | What it adds | When to choose it |
|---|---|---|
| [`figment`](https://docs.rs/figment) | Merge several sources (TOML file, environment with a prefix, defaults) into one `serde` struct, with a report of where each value came from | The layering above, without writing it yourself. The usual choice in Axum applications |
| [`config`](https://docs.rs/config) | The same idea with more file formats (JSON, YAML, RON) and a different API | You need YAML or a watching file |
| [`dotenvy`](https://docs.rs/dotenvy) (successor to `dotenv`) | Loads a `.env` file into the environment **for development** | Local work only. Never ship a `.env`; add it to `.gitignore` and commit a `.env.example` with the keys and no values |
| [`secrecy`](https://docs.rs/secrecy) | A `SecretString` wrapper that prints as `[REDACTED]`, is zeroed on drop, and must be unwrapped explicitly | Settings that are secret, so a `Debug` print or a log line cannot leak them |
| [`humantime`](https://docs.rs/humantime) | Parses `"30s"`, `"5m"`, `"2h"` into a `Duration` | Timeouts, intervals, retention periods |

:::tip Print the resolved configuration at start-up, with the secrets redacted
One INFO line at start-up that shows every setting and where it came from turns "it works on my machine" into a five-second diagnosis. With `secrecy`, the parts that must not be seen print themselves as `[REDACTED]`, so the log line is safe to keep.
:::

:::warn An environment variable is not a secret store
Environment variables are visible to anything that can read the process — a crash dump, a debugging endpoint, `/proc`, a child process. They are the conventional way to *pass* configuration, not a way to *protect* it. For real secrets use the host's secret store: Docker secrets, Kubernetes `Secret` objects, or the secret manager of your cloud. In particular, never bake a secret into a Docker image: image layers are readable for ever by anyone who can pull it, even if a later layer deletes the file. Pass secrets at run time, and rotate them.
:::

This is what the **twelve-factor app** means by "config in the environment". The name comes from [12factor.net](https://12factor.net/config), and the rule is about one idea: the same artefact, built once, runs in every environment, and only its configuration differs. [Chapter 74](#project-api) shows the same chain implemented for a web service in a few dozen lines, without a crate.

## Make it better

:::exercise practice Edit a task
Add a subcommand `todo edit <id> <new title>` that changes the title of a task.
::hint
Add a variant `Edit { id: u32, title: String }` to `Command`, with `///` comments for the help. The compiler then demands a new arm in `run`. Reuse `list.find(id)?` and the empty-title check.
::solution
```rust
// In `enum Command`
/// Change the title of a task
Edit {
    /// The number of the task
    id: u32,
    /// The new title
    title: String,
},

// In `run`
Command::Edit { id, title } => {
    let title = title.trim();
    if title.is_empty() {
        bail!("the title must not be empty");
    }
    list.find(id)?.title = title.to_string();
    Ok((format!("Changed task {id}."), true))
}

// A test
#[test]
fn editing_changes_the_title() {
    let mut list = TodoList::default();
    run(parse(&["todo", "add", "buy milk"]), &mut list).unwrap();
    run(parse(&["todo", "edit", "1", "buy oat milk"]), &mut list).unwrap();
    assert_eq!(list.tasks[0].title, "buy oat milk");
    assert!(run(parse(&["todo", "edit", "5", "x"]), &mut list).is_err());
}
```

Adding the variant was enough to get the argument parsing, the help entry and the error messages. The only code to write was the behaviour. The empty-title check now exists twice, which is a hint to move it into a small function, or into a `Title` newtype that cannot be empty.
:::

:::exercise practice Output for machines
Add a flag `--json` to the `list` subcommand. With it, the shown tasks are printed as JSON, so that other programs can read them.
::hint
Add `#[arg(long)] json: bool` to the `List` variant. In `run`, after filtering and sorting, return `serde_json::to_string_pretty(&shown)?` when the flag is set. A `Vec<&Task>` can be serialised, because Serde implements `Serialize` for references and vectors.
::solution
```rust
// In `enum Command`
/// Show the tasks
List {
    /// Also show tasks that are done
    #[arg(short, long)]
    all: bool,

    /// Print the tasks as JSON
    #[arg(long)]
    json: bool,
},

// In `run`: the arm becomes
Command::List { all, json } => {
    let mut shown: Vec<&Task> = list.tasks.iter().filter(|task| all || !task.done).collect();
    shown.sort_by_key(|task| (task.done, std::cmp::Reverse(task.priority), task.id));
    if json {
        return Ok((serde_json::to_string_pretty(&shown)?, false));
    }
    // ... the text output as before
}
```

```text
$ todo list --json
[
  {
    "id": 2,
    "title": "call Sara",
    "done": false,
    "priority": "high"
  }
]
```

With JSON output, the tool can be combined with others: a script can read the list, and a tool such as `jq` can filter it. The empty case now prints `[]`, which is valid JSON, and not the sentence "Nothing to do.", which would break a program reading the output. Human-readable and machine-readable output have different rules, and good tools offer both.
:::

:::exercise challenge Due dates
Add an optional due date to tasks: `todo add "pay rent" --due 2027-01-31`. Show the date in the list, and add a flag `todo list --overdue` that shows only open tasks whose date has passed. Old files without the field must still load.
::hint
Add `chrono` with its `serde` feature: `cargo add chrono --features serde`. `NaiveDate` implements `FromStr` and Serde's traits, so it can be the type of the clap option and of the struct field: `due: Option<NaiveDate>`. Put `#[serde(default)]` on the field. For "today", do not call the clock inside `run`. Pass `today: NaiveDate` in as a parameter, so that the tests can choose the date.
::solution
```rust
use chrono::NaiveDate;

// In `Command::Add`
/// The day the task must be finished, as YEAR-MONTH-DAY
#[arg(short, long)]
due: Option<NaiveDate>,

// In `Command::List`
/// Show only open tasks whose due date has passed
#[arg(long)]
overdue: bool,

// In `struct Task`
#[serde(default, skip_serializing_if = "Option::is_none")]
due: Option<NaiveDate>,

// `run` gets the current date from outside
fn run(command: Command, list: &mut TodoList, today: NaiveDate) -> Result<(String, bool)> {
    match command {
        Command::List { all, overdue } => {
            let mut shown: Vec<&Task> = list
                .tasks
                .iter()
                .filter(|task| all || !task.done)
                .filter(|task| !overdue || (!task.done && task.due.is_some_and(|due| due < today)))
                .collect();
            // ... sort as before. When printing, add the date:
            // let due = task.due.map(|d| format!("  (due {d})")).unwrap_or_default();
            // format!("[{mark}] {:>3}  {}{urgent}{due}", task.id, task.title)
        }
        // ... the other arms as before. `Add` stores `due` in the new task.
    }
}

// In `try_main`
let today = chrono::Local::now().date_naive();
let (output, changed) = run(cli.command, &mut list, today)?;

// A test that controls time
#[test]
fn overdue_tasks_are_found() {
    let today = NaiveDate::from_ymd_opt(2027, 2, 1).unwrap();
    let mut list = TodoList::default();
    run(parse(&["todo", "add", "pay rent", "--due", "2027-01-31"]), &mut list, today).unwrap();
    run(parse(&["todo", "add", "plan trip", "--due", "2027-03-01"]), &mut list, today).unwrap();

    let (output, _) = run(parse(&["todo", "list", "--overdue"]), &mut list, today).unwrap();
    assert!(output.contains("pay rent"));
    assert!(!output.contains("plan trip"));
}
```

A wrong date such as `--due 2027-02-30` is rejected by clap with a message from chrono, before your code runs: the field's type does the validation. The date travels through three layers without any conversion code of your own: clap parses it with `FromStr`, Serde stores it as `"2027-01-31"`, and chrono compares it.

Passing `today` into `run` keeps the logic free of the system clock. The test decides that it is the first of February 2027, and gives the same result on every day it runs. `#[serde(default)]` keeps old files readable, and `skip_serializing_if` keeps the file free of `"due": null` lines.
:::

## What you have learned

:::recap
- A command line consists of arguments, options, flags and subcommands. Users expect `--help`, `--version`, sensible errors and exit codes.
- With clap's derive, a struct describes the command line, and an enum describes the subcommands. Help, validation and error messages are generated.
- `Cli::parse()` gives a typed value, or explains the problem and exits. `try_parse_from` does the same for tests.
- The same enum can serve clap (`ValueEnum`) and Serde.
- Keep the logic in a function that takes the parsed command and returns the output. `main` loads, calls, saves, prints and sets the exit code.
- Send results to standard output and errors to standard error, and work well in pipelines.
:::

:::quiz Check your understanding
? The command line is described with a struct and clap's derive macros instead of by hand with `std::env::args()`. What does clap generate from that?
- A faster argument parser written in Rust
+ The help text, the value parsing, the validation errors and the version output
- The completion scripts for your shell
- The man page for the program
= A struct annotated with `#[derive(Parser)]` is one description that clap turns into all the user-facing behaviour: `--help`, `--version`, type checking of each value and clear messages when something is wrong.

? What happens when the user types `todo --colour` and the program has no such option?
- The program panics with a backtrace
- The unknown option is ignored
+ `Cli::parse()` prints an explanation of the problem and exits with a non-zero code
- The option is stored as a string
= `parse()` is the "parse or exit" entry point: it writes a short message naming the offending argument and stops. `try_parse_from` returns the error instead, which is what the tests use.

? The tool keeps its work in a function that takes the parsed command and returns the output. Why?
- Because a function cannot print and return a value at the same time
+ So the logic can be tested without running the program, and `main` stays a thin layer that loads, calls, saves, prints and sets the exit code
- Because `main` must be shorter than ten lines
- Because clap can only be used inside a function
= Separating the decision from the presentation means the tests call the function directly with a command value, and the terminal, the file and the exit code stay in one place at the edge.

? The tool writes results to standard output and problems to standard error. What does that buy a user?
- The tool can be used without a terminal
- Problems are printed twice
- The tool runs faster
+ Results can be piped into another program while problems stay visible on the screen
= Standard output carries the program's data; standard error carries its commentary. Keeping them apart is what lets `todo list | grep milk` work while a failure still reaches the screen.
:::


:::checklist
- I built the `todo` tool and used it from my terminal.
- I read the generated help with `todo --help` and `todo add --help`.
- All tests pass with `cargo test`.
- I can explain how the `Command` enum becomes subcommands.
- I can explain why `run` returns a string and does not print.
- I added the `edit` subcommand.
- I added `--json` output.
- I installed the tool with `cargo install --path .`.
:::
