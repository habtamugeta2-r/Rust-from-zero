@id project-search
@part p3
@kind project
@title Project: a file search tool
@short Project: search tool
@level intermediate
@time 120
@learn Read command-line arguments | Structure a program as a library with a thin `main` | Return borrowed results with a lifetime | Report errors on the error stream and through exit codes | Develop a function test-first

In this project you build `finder`, a small version of the classic command-line tool `grep`. It searches files for a text and prints every line that contains it:

```text
$ finder rust poem.txt
Trust the compiler.
It is not a rusty tool.

$ finder -i -n rust poem.txt todo.txt
poem.txt:1:Rust is fast.
poem.txt:2:Trust the compiler.
poem.txt:3:It is not a rusty tool.
todo.txt:2:learn Rust
```

The project brings together modules and a library crate, error handling with `Result` and `?`, a struct with a lifetime, traits through `derive`, and tests.

:::plain Parsing, walking, matching, printing
A `grep` clone is four small, separable jobs: **parse** the arguments, **walk** the tree of files, **match** a pattern against each line, and **print** the hits in a consistent format. Each one is a function you can test alone, and each one has a crate if it gets complicated. The lesson of the project is decomposition: the search itself is three lines, and everything else is deciding what to skip, how to report a line number, and what to do when a file cannot be read.
:::

## Step 0: plan

**What does the user give us?** A text to search for, one or more file names, and two optional switches: `-i` to ignore upper and lower case, and `-n` to show line numbers.

**What are the parts?**

1. Understand the command line and turn it into a precise value (a `Config`), or explain what is wrong.
2. Search one text for the pattern and return the matching lines. This is the core, and it needs no files and no printing, so it is easy to test.
3. Tie it together: read each file, search it, print the matches.

**Where does the code go?** Parts 1 to 3 go into a library, `src/lib.rs`. The file `src/main.rs` only connects the library to the outside world: it gets the arguments, calls the library, and turns errors into messages and exit codes.

Create the package with `cargo new finder`. Then create the file `src/lib.rs` next to `src/main.rs`. Also create two text files in the project folder to try the program on:

```text file=poem.txt
Rust is fast.
Trust the compiler.
It is not a rusty tool.
```

```text file=todo.txt
buy milk
learn Rust
rest
```

## Step 1: read the command line

When you start a program as `finder rust poem.txt`, the words after the program's name are its **command-line arguments**. `std::env::args()` gives them to the program, one `String` per word. The first item is the program's own name, so we skip it. Put this into `src/main.rs` for a first experiment:

```rust run noplay
use std::env;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    println!("{:?}", args);
}
```
```output
[]
```

With Cargo, the program's own arguments go after a double dash, which separates them from Cargo's arguments:

```text
$ cargo run -- rust poem.txt
["rust", "poem.txt"]
```

## Step 2: from arguments to a `Config`

A `Vec<String>` could contain anything. As in the to-do project, we turn the untidy input into a precise type at the edge of the program. Put this into `src/lib.rs`:

```rust check
/// What the user asked for on the command line.
#[derive(Debug, PartialEq)]
pub struct Config {
    pub pattern: String,
    pub paths: Vec<String>,
    pub ignore_case: bool,
    pub line_numbers: bool,
}

impl Config {
    /// Builds a `Config` from the command-line arguments (without the program name).
    pub fn from_args(args: &[String]) -> Result<Config, String> {
        let mut ignore_case = false;
        let mut line_numbers = false;
        let mut words = Vec::new();

        for arg in args {
            match arg.as_str() {
                "-i" | "--ignore-case" => ignore_case = true,
                "-n" | "--line-numbers" => line_numbers = true,
                flag if flag.starts_with('-') => return Err(format!("unknown option '{flag}'")),
                word => words.push(word.to_string()),
            }
        }

        let mut words = words.into_iter();
        let Some(pattern) = words.next() else {
            return Err(String::from("no search text given"));
        };
        let paths: Vec<String> = words.collect();
        if paths.is_empty() {
            return Err(String::from("no file given"));
        }

        Ok(Config { pattern, paths, ignore_case, line_numbers })
    }
}
# fn main() {}
```

How it works:

- The loop sorts every argument into one of three groups: a known switch, an unknown switch (an error), or an ordinary word. The `match` uses alternatives (`|`), a guard (`if flag.starts_with('-')`) and a catch-all name, all from [chapter 19](#patterns). `arg.as_str()` turns the `&String` into a `&str`, so that it can be compared with string literals.
- Switches may appear anywhere, before or after the other words, as users expect from command-line tools.
- After the loop, the first word is the pattern and all the others are file names. `words.into_iter()` gives the words one at a time, with ownership. `.next()` takes the first, and `let … else` handles the case that there is none. `.collect()` gathers the rest into a new vector.
- The error type is a plain `String`. Whoever calls the function only wants to show the message.

Both the struct and its fields are `pub`, because `main.rs` is a different crate and must be able to use them.

## Step 3: the search, test first

The core function takes a pattern and a text, and returns the lines that match. Before writing it, decide what a result looks like, and write a test that describes the behaviour. This is the "red" step of test-driven development from [chapter 27](#testing).

```rust check
/// One line that contains the search text.
#[derive(Debug, PartialEq)]
pub struct Match<'a> {
    pub line_number: usize,
    pub line: &'a str,
}
# fn main() {}
```

A `Match` does not copy the line. It holds a `&str` that points into the text being searched. That is why the struct has a lifetime parameter: a `Match` must not outlive that text. For a tool that may search very large files, avoiding one allocation per matching line is a real saving.

The tests, at the bottom of `src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    const POEM: &str = "Rust is fast.\nTrust the compiler.\nIt is not a rusty tool.";

    #[test]
    fn finds_matching_lines_with_their_numbers() {
        let found = search("rust", POEM, false);
        assert_eq!(
            found,
            vec![
                Match { line_number: 2, line: "Trust the compiler." },
                Match { line_number: 3, line: "It is not a rusty tool." },
            ]
        );
    }

    #[test]
    fn can_ignore_case() {
        let found = search("RUST", POEM, true);
        assert_eq!(found.len(), 3);
    }

    #[test]
    fn no_match_gives_an_empty_list() {
        assert!(search("python", POEM, true).is_empty());
    }
}
```

`cargo test` fails to compile at this point, because `search` does not exist. Now write it:

```rust check
# #[derive(Debug, PartialEq)]
# pub struct Match<'a> { pub line_number: usize, pub line: &'a str }
/// Finds all lines of `text` that contain `pattern`.
pub fn search<'a>(pattern: &str, text: &'a str, ignore_case: bool) -> Vec<Match<'a>> {
    let pattern_lower = pattern.to_lowercase();
    let mut matches = Vec::new();

    for (index, line) in text.lines().enumerate() {
        let found = if ignore_case {
            line.to_lowercase().contains(&pattern_lower)
        } else {
            line.contains(pattern)
        };
        if found {
            matches.push(Match { line_number: index + 1, line });
        }
    }
    matches
}
# fn main() {}
```

The signature is worth reading closely:

```rust
pub fn search<'a>(pattern: &str, text: &'a str, ignore_case: bool) -> Vec<Match<'a>>
```

The function takes two references and returns data that contains references, so the compiler cannot guess the relationship, and you must annotate it ([chapter 26](#lifetimes)). The annotation says that the matches borrow from `text`, and **not** from `pattern`. A caller may throw the pattern away and keep the matches.

Other details:

- `text.lines()` gives each line as a `&str` slice of the original text, without the line ending. `enumerate()` adds a counter that starts at 0, and people count lines from 1, so the line number is `index + 1`.
- For the case-insensitive search, both sides are converted to lower case. The pattern is converted once, before the loop, and not once per line.

Run `cargo test`. All three tests pass: "green".

## Step 4: put the pieces together

```rust check
# use std::error::Error;
# use std::fs;
# pub struct Config { pub pattern: String, pub paths: Vec<String>, pub ignore_case: bool, pub line_numbers: bool }
# pub struct Match<'a> { pub line_number: usize, pub line: &'a str }
# pub fn search<'a>(_p: &str, _t: &'a str, _i: bool) -> Vec<Match<'a>> { Vec::new() }
/// Searches all files and prints the matching lines. Returns the number of matches.
pub fn run(config: &Config) -> Result<usize, Box<dyn Error>> {
    let mut total = 0;
    let several_files = config.paths.len() > 1;

    for path in &config.paths {
        let text = fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;

        for m in search(&config.pattern, &text, config.ignore_case) {
            if several_files {
                print!("{path}:");
            }
            if config.line_numbers {
                print!("{}:", m.line_number);
            }
            println!("{}", m.line);
            total += 1;
        }
    }
    Ok(total)
}
# fn main() {}
```

Add `use std::error::Error;` and `use std::fs;` at the top of `src/lib.rs`.

- The function returns `Result<usize, Box<dyn Error>>`: the number of matches, or any kind of error.
- `fs::read_to_string(path)` can fail. Its error message says "No such file or directory", but not *which* file. `map_err` replaces the error with a text that includes the path, and the `?` passes it on. A `String` is turned into a `Box<dyn Error>` automatically.
- When several files are searched, each line is prefixed with the file name, as `grep` does.
- Look at how the lifetimes work out. `text` owns the content of one file. The matches borrow from it and are used up inside the inner loop. When the outer loop moves on to the next file, the old `text` is dropped, and by then nothing refers to it any more. The compiler has checked that.

## Step 5: a thin `main`

Replace the contents of `src/main.rs`:

```rust proj=finder file=src/main.rs
use std::env;
use std::process;

use finder::Config;

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();

    let config = match Config::from_args(&args) {
        Ok(config) => config,
        Err(message) => {
            eprintln!("error: {message}");
            eprintln!("usage: finder [-i] [-n] <text> <file>...");
            process::exit(2);
        }
    };

    match finder::run(&config) {
        Ok(0) => process::exit(1),
        Ok(_) => {}
        Err(error) => {
            eprintln!("error: {error}");
            process::exit(2);
        }
    }
}
```

`main` contains no logic of its own. It does three things that only the outermost layer of a program should do: it reads the arguments, prints error messages, and chooses the exit code.

Two new tools appear here.

**`eprintln!`** works like `println!`, but writes to a different channel. Every program has two output channels:

| Channel | Name | Written with | Meant for |
|---|---|---|---|
| standard output | *stdout* | `println!` | the results of the program |
| standard error | *stderr* | `eprintln!` | error messages and diagnostics |

In the terminal both appear on the screen. The difference shows when the output is sent somewhere else. `finder rust poem.txt > result.txt` writes the results into a file. An error message should still reach the user's screen and must not end up inside that file. With `eprintln!`, it does not.

**`process::exit(code)`** ends the program at once with the given exit code. By convention, 0 means success. This program follows the convention of `grep`: 0 if something was found, 1 if nothing was found, and 2 if an error occurred. Scripts use these codes to decide what to do next.

## Try it

```text
$ cargo run -- rust poem.txt
Trust the compiler.
It is not a rusty tool.

$ cargo run -- -i -n rust poem.txt todo.txt
poem.txt:1:Rust is fast.
poem.txt:2:Trust the compiler.
poem.txt:3:It is not a rusty tool.
todo.txt:2:learn Rust

$ cargo run -- rust nothing.txt
error: nothing.txt: No such file or directory (os error 2)

$ cargo run -- rust
error: no file given
usage: finder [-i] [-n] <text> <file>...

$ cargo run -- -x rust poem.txt
error: unknown option '-x'
usage: finder [-i] [-n] <text> <file>...
```

Check that errors really go to the error stream. Send the standard output into a file, and the error still appears on the screen while the file stays empty:

```text
$ cargo run -- rust nothing.txt > result.txt
error: nothing.txt: No such file or directory (os error 2)
```

:::tip Install your tool
`cargo install --path .` builds the program in release mode and copies it into Cargo's `bin` folder, which is on your search path. After that you can type `finder rust poem.txt` in any folder, like any other command. `cargo uninstall finder` removes it again.
:::

## The complete library

```rust test proj=finder file=src/lib.rs
use std::error::Error;
use std::fs;

/// What the user asked for on the command line.
#[derive(Debug, PartialEq)]
pub struct Config {
    pub pattern: String,
    pub paths: Vec<String>,
    pub ignore_case: bool,
    pub line_numbers: bool,
}

impl Config {
    /// Builds a `Config` from the command-line arguments (without the program name).
    pub fn from_args(args: &[String]) -> Result<Config, String> {
        let mut ignore_case = false;
        let mut line_numbers = false;
        let mut words = Vec::new();

        for arg in args {
            match arg.as_str() {
                "-i" | "--ignore-case" => ignore_case = true,
                "-n" | "--line-numbers" => line_numbers = true,
                flag if flag.starts_with('-') => return Err(format!("unknown option '{flag}'")),
                word => words.push(word.to_string()),
            }
        }

        let mut words = words.into_iter();
        let Some(pattern) = words.next() else {
            return Err(String::from("no search text given"));
        };
        let paths: Vec<String> = words.collect();
        if paths.is_empty() {
            return Err(String::from("no file given"));
        }

        Ok(Config { pattern, paths, ignore_case, line_numbers })
    }
}

/// One line that contains the search text.
#[derive(Debug, PartialEq)]
pub struct Match<'a> {
    pub line_number: usize,
    pub line: &'a str,
}

/// Finds all lines of `text` that contain `pattern`.
pub fn search<'a>(pattern: &str, text: &'a str, ignore_case: bool) -> Vec<Match<'a>> {
    let pattern_lower = pattern.to_lowercase();
    let mut matches = Vec::new();

    for (index, line) in text.lines().enumerate() {
        let found = if ignore_case {
            line.to_lowercase().contains(&pattern_lower)
        } else {
            line.contains(pattern)
        };
        if found {
            matches.push(Match { line_number: index + 1, line });
        }
    }
    matches
}

/// Searches all files and prints the matching lines. Returns the number of matches.
pub fn run(config: &Config) -> Result<usize, Box<dyn Error>> {
    let mut total = 0;
    let several_files = config.paths.len() > 1;

    for path in &config.paths {
        let text = fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;

        for m in search(&config.pattern, &text, config.ignore_case) {
            if several_files {
                print!("{path}:");
            }
            if config.line_numbers {
                print!("{}:", m.line_number);
            }
            println!("{}", m.line);
            total += 1;
        }
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    const POEM: &str = "Rust is fast.\nTrust the compiler.\nIt is not a rusty tool.";

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_matching_lines_with_their_numbers() {
        let found = search("rust", POEM, false);
        assert_eq!(
            found,
            vec![
                Match { line_number: 2, line: "Trust the compiler." },
                Match { line_number: 3, line: "It is not a rusty tool." },
            ]
        );
    }

    #[test]
    fn can_ignore_case() {
        let found = search("RUST", POEM, true);
        assert_eq!(found.len(), 3);
    }

    #[test]
    fn no_match_gives_an_empty_list() {
        assert!(search("python", POEM, true).is_empty());
    }

    #[test]
    fn reads_pattern_files_and_options() {
        let config = Config::from_args(&args(&["-n", "fast", "a.txt", "b.txt", "--ignore-case"]));
        assert_eq!(
            config,
            Ok(Config {
                pattern: String::from("fast"),
                paths: vec![String::from("a.txt"), String::from("b.txt")],
                ignore_case: true,
                line_numbers: true,
            })
        );
    }

    #[test]
    fn missing_arguments_are_errors() {
        assert!(Config::from_args(&args(&[])).is_err());
        assert!(Config::from_args(&args(&["fast"])).is_err());
        assert!(Config::from_args(&args(&["-x", "fast", "a.txt"])).is_err());
    }
}
```

The tests for `Config::from_args` use a small helper, `args`, that turns a list of string literals into the `Vec<String>` the function expects. Helper functions inside the test module keep the tests short and readable.

## Make it better

:::exercise practice Count only
Add a switch `-c` (or `--count`). With it, the program prints only the number of matching lines per file, for example `poem.txt:2`, and not the lines themselves.
::hint
Add a field `count_only: bool` to `Config` and an arm to the `match` in `from_args`. In `run`, get the matches for a file into a variable first. If `count_only` is set, print `path` and `matches.len()`, otherwise print the lines as before. Update the test that builds a `Config` by hand: the compiler will tell you that a field is missing.
::solution
The changed part of `run`:

```rust check
# use std::error::Error;
# use std::fs;
# pub struct Config { pub pattern: String, pub paths: Vec<String>, pub ignore_case: bool, pub line_numbers: bool, pub count_only: bool }
# pub struct Match<'a> { pub line_number: usize, pub line: &'a str }
# pub fn search<'a>(_p: &str, _t: &'a str, _i: bool) -> Vec<Match<'a>> { Vec::new() }
pub fn run(config: &Config) -> Result<usize, Box<dyn Error>> {
    let mut total = 0;
    let several_files = config.paths.len() > 1;

    for path in &config.paths {
        let text = fs::read_to_string(path).map_err(|e| format!("{path}: {e}"))?;
        let matches = search(&config.pattern, &text, config.ignore_case);
        total += matches.len();

        if config.count_only {
            println!("{path}:{}", matches.len());
            continue;
        }
        for m in matches {
            if several_files {
                print!("{path}:");
            }
            if config.line_numbers {
                print!("{}:", m.line_number);
            }
            println!("{}", m.line);
        }
    }
    Ok(total)
}
# fn main() {}
```

In `from_args`, the new arm is `"-c" | "--count" => count_only = true,` with a `let mut count_only = false;` before the loop, and the field is added to the `Config` at the end.

`search` did not change at all. Because it returns data and prints nothing, a new way of presenting the results needs no change in the core. Adding a field to `Config` made the compiler point to every place that builds one, including the test.
:::

:::exercise practice Whole words only
Add a switch `-w` that matches whole words only: with `-w`, the pattern `rust` matches the line `learn rust today` but not `Trust the compiler`.
::hint
Write a helper `fn contains_word(line: &str, word: &str) -> bool`. Split the line into words with `line.split(|c: char| !c.is_alphanumeric())` and check whether any piece equals the word. Write tests for the helper first: a match in the middle, at the start and at the end of a line, next to punctuation, and no match inside a longer word.
::solution
```rust test
fn contains_word(line: &str, word: &str) -> bool {
    line.split(|c: char| !c.is_alphanumeric()).any(|piece| piece == word)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_whole_word() {
        assert!(contains_word("learn rust today", "rust"));
        assert!(contains_word("rust is fun", "rust"));
        assert!(contains_word("I like rust", "rust"));
    }

    #[test]
    fn punctuation_ends_a_word() {
        assert!(contains_word("fast, safe (rust).", "rust"));
    }

    #[test]
    fn does_not_match_inside_a_longer_word() {
        assert!(!contains_word("Trust the compiler", "rust"));
        assert!(!contains_word("a rusty tool", "rust"));
    }
}
```

`split` accepts a closure that decides where to cut: here, at every character that is not a letter or a digit. `any` is true as soon as one piece equals the word. In `search`, the line `line.contains(pattern)` becomes a choice between `contains_word(line, pattern)` and `line.contains(pattern)`.

`search` now has two `bool` parameters, and a call like `search("rust", text, true, false)` is hard to read. A better design passes one small struct of options, or the whole `&Config`. Noticing this kind of thing and improving it is a normal part of growing a program.
:::

:::exercise challenge Search folders
Let `finder` accept folders as well as files. For a folder, it searches every file inside it, and inside all its subfolders. Files that cannot be read as text are skipped with a note on the error stream.
::hint
`std::fs::read_dir(path)?` gives the entries of a folder. Each entry is a `Result`, so write `let entry = entry?;`, and `entry.path()` is the full path as a `PathBuf`. `path.is_dir()` tells folders from files. Write a function `collect_files(path: &Path, files: &mut Vec<PathBuf>) -> io::Result<()>` that calls itself for subfolders.
::solution
```rust run noplay
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

fn collect_files(path: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            collect_files(&entry.path(), files)?;
        }
    } else {
        files.push(path.to_path_buf());
    }
    Ok(())
}

fn main() -> io::Result<()> {
    // build a small folder tree to try it on
    fs::create_dir_all("demo/inner")?;
    fs::write("demo/a.txt", "one")?;
    fs::write("demo/inner/b.txt", "two")?;

    let mut files = Vec::new();
    collect_files(Path::new("demo"), &mut files)?;
    files.sort();
    for file in &files {
        println!("{}", file.display());
    }

    fs::remove_dir_all("demo")?;
    Ok(())
}
```
```output
demo/a.txt
demo/inner/b.txt
```

`Path` and `PathBuf` are to file paths what `str` and `String` are to text: a borrowed view and an owned value. They exist because paths are not always valid UTF-8, and because the separator differs between systems (`/` or `\`). `file.display()` turns a path into something printable.

The function is **recursive**: for a folder it calls itself on every entry. The results are collected in a vector that is passed along as `&mut`, which avoids creating and joining many small vectors. The list is sorted, because `read_dir` promises no particular order.

In `run`, call `collect_files` for each path from the command line, then loop over the collected files. For a file that is not valid text, `fs::read_to_string` returns an error. Print it with `eprintln!` and `continue` with the next file, so that one unreadable file does not stop the whole search.
:::

## What you have learned

:::recap
- `std::env::args()` gives the command-line arguments. Turn them into a `Config` struct once, with clear error messages.
- Logic in `src/lib.rs`, a thin `src/main.rs`: the library can be tested, and `main` only handles arguments, messages and exit codes.
- A function can return views into its input with a lifetime (`Vec<Match<'a>>`), and avoid copying.
- Results go to standard output with `println!`, errors to standard error with `eprintln!`. The exit code tells other programs whether it worked.
- `map_err` adds missing information to an error before `?` passes it on.
- Writing the test first makes you decide what a function should return before you write it.
:::

:::checklist
- I built `finder` step by step, and all tests pass with `cargo test`.
- I ran it on my own files, with and without `-i` and `-n`.
- I can explain why `Match` has a lifetime parameter and what `'a` connects.
- I can explain the difference between `println!` and `eprintln!`.
- I added the `-c` switch.
- I added whole-word matching, with tests.
- I installed the tool with `cargo install --path .` and used it outside the project folder.
:::

You can now organise a program into modules, handle errors, write generic code, define shared behaviour with traits, reason about lifetimes, and test your work. These are the tools of everyday Rust programming. Next come closures and iterators.
