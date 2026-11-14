@id testing
@part p4
@title Testing your code
@short Testing
@level intermediate
@time 45
@learn Write tests and run them with `cargo test` | Check results with `assert!`, `assert_eq!` and `assert_ne!`, and read a failure report | Test that code panics or returns errors as intended | Organise unit tests, integration tests and documentation tests | Choose good test cases

The compiler proves a lot about a Rust program: no dangling references, no missing cases, no mixed-up types. It cannot know what your program is *supposed* to do. A function that should add two numbers and subtracts them instead compiles perfectly. **Tests** close that gap: they are small pieces of code that run your code and check that the result is what you expect.

:::analogy A pilot's checklist
Before every flight, pilots go through a checklist: flaps, fuel, instruments. They do it even after ten thousand flights, because the list catches the one mistake that experience overlooks. A test suite is a checklist that the computer runs for you in a second, every time you change something.
:::

Why it is worth the effort:

- **You find mistakes early**, minutes after making them, not weeks later through a user.
- **You can change code without fear.** If the tests still pass after a rewrite, the behaviour is unchanged.
- **Tests are examples** of how the code is meant to be used, and they never go out of date, because they fail if they do.

Testing needs no extra installation. The test runner is built into Cargo.

## A first test

Create a library package with `cargo new --lib textkit`, and put this into `src/lib.rs`:

```rust test file=src/lib.rs
pub fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_words() {
        assert_eq!(word_count("the quick brown fox"), 4);
    }

    #[test]
    fn empty_text_has_no_words() {
        assert_eq!(word_count(""), 0);
    }
}
```

Run `cargo test`:

```output
   Compiling textkit v0.1.0 (/home/sara/textkit)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.31s
     Running unittests src/lib.rs (target/debug/…/textkit-6de7e3f36e676b63)

running 2 tests
test tests::empty_text_has_no_words ... ok
test tests::counts_words ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

What the parts mean:

- **`#[test]`** marks a function as a test. `cargo test` finds all such functions, runs each one, and reports `ok` or `FAILED`. A test passes if it finishes without panicking.
- **`assert_eq!(a, b)`** checks that two values are equal, and panics if they are not.
- **`mod tests`** is an ordinary module that holds the tests. The name is a convention.
- **`#[cfg(test)]`** tells the compiler to include this module only when testing. In a normal `cargo build` the tests are left out, so they add nothing to your finished program.
- **`use super::*;`** brings everything from the parent module into the test module. Because `tests` is a child module, it can also use *private* functions of its parent.

A test's name should say what is being checked. When it fails, the name is the first thing you read.

## The assertion macros

| Macro | Passes when | Typical use |
|---|---|---|
| `assert!(condition)` | the condition is `true` | `assert!(list.is_empty())` |
| `assert_eq!(left, right)` | the values are equal | `assert_eq!(add(2, 3), 5)` |
| `assert_ne!(left, right)` | the values are different | `assert_ne!(new_id, old_id)` |

Prefer `assert_eq!` to `assert!(a == b)`, because on failure it prints both values. All three accept an extra message with format arguments, which is printed when the check fails. The compared values must implement `PartialEq` and `Debug`, so for your own types add `#[derive(Debug, PartialEq)]`.

### Reading a failure

Here is a test that is wrong about what the function does:

```rust
#[test]
fn counts_words_with_extra_spaces() {
    let count = word_count("  two   words ");
    assert_eq!(count, 3, "wrong count for a text with extra spaces");
}
```

```output
running 3 tests
test tests::counts_words ... ok
test tests::counts_words_with_extra_spaces ... FAILED
test tests::empty_text_has_no_words ... ok

failures:

---- tests::counts_words_with_extra_spaces stdout ----

thread 'tests::counts_words_with_extra_spaces' panicked at src/lib.rs:25:9:
assertion `left == right` failed: wrong count for a text with extra spaces
  left: 2
 right: 3

failures:
    tests::counts_words_with_extra_spaces

test result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

The report names the failing test, the file and line of the failed check, your message, and the two values: `left` is the first argument (what the code produced), and `right` is the second (what the test expected). Here the code is right and the test is wrong: the text has two words. That happens too. A failing test tells you that the code and the test disagree, and you decide which one to fix.

## A bug caught by a test

Add a second function to the library, with two tests:

```rust
pub fn is_palindrome(text: &str) -> bool {
    let letters: Vec<char> = text.chars().filter(|c| c.is_alphanumeric()).collect();
    let reversed: Vec<char> = letters.iter().rev().copied().collect();
    letters == reversed
}

// inside `mod tests`:
#[test]
fn simple_palindrome() {
    assert!(is_palindrome("level"));
}

#[test]
fn palindrome_ignores_case_and_spaces() {
    assert!(is_palindrome("Never odd or even"));
}
```

A palindrome is a text that reads the same in both directions. The function keeps only letters and digits, and compares them with their reverse.

```output
test tests::simple_palindrome ... ok
test tests::palindrome_ignores_case_and_spaces ... FAILED

failures:

---- tests::palindrome_ignores_case_and_spaces stdout ----

thread 'tests::palindrome_ignores_case_and_spaces' panicked at src/lib.rs:32:9:
assertion failed: is_palindrome("Never odd or even")
```

The second test found a real bug: the capital "N" at the start is not equal to the small "n" at the end. The fix is to convert every character to lower case before comparing:

```rust test
pub fn is_palindrome(text: &str) -> bool {
    let letters: Vec<char> = text
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect();
    let reversed: Vec<char> = letters.iter().rev().copied().collect();
    letters == reversed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_palindrome() {
        assert!(is_palindrome("level"));
    }

    #[test]
    fn palindrome_ignores_case_and_spaces() {
        assert!(is_palindrome("Never odd or even"));
    }

    #[test]
    fn not_a_palindrome() {
        assert!(!is_palindrome("Rust"));
    }
}
```

Now all tests pass, and they will keep guarding this behaviour. If someone removes the lower-casing next year, the test fails at once. A test that is written because of a bug, and stays to make sure the bug never returns, is called a **regression test**.

## Testing panics and errors

Sometimes the correct behaviour *is* a panic. The attribute `#[should_panic]` turns the logic around: the test passes only if the code panics.

```rust test
pub fn average_word_length(text: &str) -> f64 {
    let words = text.split_whitespace().count();
    if words == 0 {
        panic!("the text contains no words");
    }
    let letters: usize = text.split_whitespace().map(|w| w.chars().count()).sum();
    letters as f64 / words as f64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn average_of_two_words() {
        assert_eq!(average_word_length("ab abcd"), 3.0);
    }

    #[test]
    #[should_panic(expected = "no words")]
    fn average_of_empty_text_panics() {
        average_word_length("   ");
    }
}
```

`expected = "no words"` also checks that the panic message contains that text. Without it, the test would pass for *any* panic, including one caused by an unrelated bug.

A test can also return a `Result`. Then you can use `?` inside it, and the test fails if an `Err` comes back:

```rust test
#[cfg(test)]
mod tests {
    #[test]
    fn parses_a_number() -> Result<(), std::num::ParseIntError> {
        let n: i32 = "42".parse()?;
        assert_eq!(n, 42);
        Ok(())
    }
}
```

To check that a function returns an error, assert on the result itself:

```rust test
#[derive(Debug, PartialEq)]
pub enum AgeError {
    NotANumber,
    TooOld,
}

pub fn parse_age(text: &str) -> Result<u8, AgeError> {
    let age: u8 = text.trim().parse().map_err(|_| AgeError::NotANumber)?;
    if age > 130 {
        return Err(AgeError::TooOld);
    }
    Ok(age)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_normal_age() {
        assert_eq!(parse_age(" 42 "), Ok(42));
    }

    #[test]
    fn rejects_text() {
        assert_eq!(parse_age("old"), Err(AgeError::NotANumber));
    }

    #[test]
    fn rejects_impossible_ages() {
        assert!(matches!(parse_age("131"), Err(AgeError::TooOld)));
        assert!(parse_age("130").is_ok());
    }
}
```

`map_err` changes the error inside a `Result` and leaves an `Ok` alone. Here it replaces the standard parsing error with our own.

## Three places for tests

### 1. Unit tests: next to the code

Everything so far was a **unit test**: a test of one small piece (a "unit") in isolation. Unit tests live in the same file as the code, in a `#[cfg(test)] mod tests` block at the bottom. They can test private functions.

### 2. Integration tests: from the outside

An **integration test** uses your library the way another crate would: only through its public API. Integration tests live in a folder called `tests` next to `src`. Each file there is compiled as its own small crate.

```text
textkit/
├── Cargo.toml
├── src/
│   └── lib.rs
└── tests/
    └── public_api.rs
```

```rust file=tests/public_api.rs
use textkit::{is_palindrome, word_count};

#[test]
fn works_together() {
    let text = "A man a plan a canal Panama";
    assert_eq!(word_count(text), 7);
    assert!(is_palindrome(text));
}
```

No `#[cfg(test)]` and no `mod tests` are needed here, because Cargo only compiles this folder when testing. Integration tests need a library crate. That is one more reason to keep the logic of a program in `src/lib.rs` and only a thin `main.rs` on top, as described in [chapter 17](#modules).

### 3. Documentation tests: examples that cannot rot

A comment that starts with `///` is a **documentation comment**. It describes the item that follows, and `cargo doc` turns these comments into a website. Code blocks inside them are compiled and run by `cargo test`:

```rust file=src/lib.rs
/// Counts the words in a text. Words are separated by whitespace.
///
/// # Examples
///
/// ```
/// let n = textkit::word_count("to be or not to be");
/// assert_eq!(n, 6);
/// ```
pub fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}
```

If the function changes and the example no longer works, the test fails. The documentation can never promise something the code does not do. This is why examples in the documentation of Rust crates are so dependable.

With all three kinds in place, `cargo test` reports three sections:

```output
     Running unittests src/lib.rs (target/debug/…/textkit-6de7e3f36e676b63)

running 8 tests
test tests::counts_words ... ok
test tests::average_of_empty_text_panics - should panic ... ok
test tests::empty_text_has_no_words ... ok
test tests::not_a_palindrome ... ok
test tests::palindrome_ignores_case_and_spaces ... ok
test tests::parses_a_number ... ok
test tests::slow_test_with_a_huge_text ... ignored
test tests::simple_palindrome ... ok

test result: ok. 7 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/public_api.rs (target/debug/…/public_api-239e2eddd7e1a86d)

running 1 test
test works_together ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests textkit

running 1 test
test src/lib.rs - word_count (line 7) ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

## Controlling what runs

| Command | Effect |
|---|---|
| `cargo test` | run all tests |
| `cargo test palindrome` | run only tests whose name contains "palindrome" |
| `cargo test --lib` | only unit tests |
| `cargo test --test public_api` | only the integration test file `tests/public_api.rs` |
| `cargo test --doc` | only documentation tests |
| `cargo test -- --nocapture` | also show what passing tests print with `println!` |
| `cargo test -- --test-threads=1` | run the tests one after another |
| `cargo test -- --ignored` | run only the tests marked `#[ignore]` |

Two things to know:

- **Output is hidden.** What a test prints is shown only if the test fails. `--nocapture` shows everything.
- **Tests run in parallel**, several at a time, and in no fixed order. Each test must therefore stand alone: it must not depend on another test having run, and two tests should not write to the same file.

A slow test can be marked so that it is skipped in normal runs:

```rust
#[test]
#[ignore]
fn slow_test_with_a_huge_text() {
    let text = "word ".repeat(10_000_000);
    assert_eq!(word_count(&text), 10_000_000);
}
```

## What makes a good test

**One behaviour per test.** A test called `it_works` that checks ten things tells you little when it fails. Ten tests with clear names tell you exactly what broke.

**Arrange, act, assert.** Most tests have three steps: set up the input, call the code, check the result.

**Think about the edges.** Bugs gather at boundaries. For each function, ask:

- What about **nothing**? An empty text, an empty list, zero.
- What about **exactly one**?
- What about the **limits**? The largest allowed value, and one more than that.
- What about **strange input**? Extra spaces, capital letters, non-English characters, negative numbers.
- What about the **error cases**? Each way of failing deserves a test.

**Test behaviour, not details.** Check what a function returns for given inputs, not how it works inside. Then you can rewrite the inside freely.

**Keep the logic separate from input and output.** A function that takes a `&str` and returns a value is trivial to test. A function that reads the keyboard and prints to the screen is not. This is the reason `parse` in the to-do project returned a value and printed nothing. Its tests are short:

```rust test
# #[derive(Debug, PartialEq)]
# pub enum Command { Add(String), List, Done(u32), Remove(u32), Help, Quit }
# pub fn parse(line: &str) -> Result<Command, String> {
#     let line = line.trim();
#     let (word, rest) = match line.split_once(' ') { Some((w, r)) => (w, r.trim()), None => (line, "") };
#     match (word, rest) {
#         ("add", "") => Err(String::from("Usage: add <what to do>")),
#         ("add", title) => Ok(Command::Add(title.to_string())),
#         ("list", _) => Ok(Command::List),
#         ("done", text) => match text.parse() { Ok(id) => Ok(Command::Done(id)), Err(_) => Err(String::from("Usage: done <number>")) },
#         ("remove", text) => match text.parse() { Ok(id) => Ok(Command::Remove(id)), Err(_) => Err(String::from("Usage: remove <number>")) },
#         ("help", _) => Ok(Command::Help),
#         ("quit", _) => Ok(Command::Quit),
#         (other, _) => Err(format!("Unknown command '{other}'. Type help.")),
#     }
# }
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_keeps_the_whole_title() {
        assert_eq!(parse("add buy  fresh milk"), Ok(Command::Add(String::from("buy  fresh milk"))));
    }

    #[test]
    fn add_without_a_title_is_an_error() {
        assert!(parse("add").is_err());
        assert!(parse("add   ").is_err());
    }

    #[test]
    fn done_needs_a_number() {
        assert_eq!(parse("done 3"), Ok(Command::Done(3)));
        assert!(parse("done three").is_err());
        assert!(parse("done -1").is_err());
    }

    #[test]
    fn surrounding_spaces_are_ignored() {
        assert_eq!(parse("  list  "), Ok(Command::List));
    }
}
```

(To compare commands with `assert_eq!`, the enum needs `#[derive(Debug, PartialEq)]`.)

## Writing the test first

Some programmers write the test **before** the code. The method is called **test-driven development (TDD)** and goes in a short cycle:

1. **Red:** write a small test for behaviour that does not exist yet. Run it and watch it fail. Now you know the test can fail.
2. **Green:** write the simplest code that makes the test pass.
3. **Refactor:** tidy up the code. The tests tell you if you broke something.

You do not have to work this way all the time. It is especially useful when you fix a bug: first write a test that shows the bug, then fix it. The test proves the fix and stays as a guard.

:::compare Testing in other languages
In most languages you choose and install a test framework first: JUnit for Java, pytest for Python, Jest or Vitest for JavaScript, GoogleTest or Catch2 for C++. In Rust (as in Go) testing is part of the standard tools. Every Rust project is tested the same way, with `cargo test`, and documentation examples that are run as tests are a feature that few other languages have.
:::

:::tip More tools for later
[Chapter 36](#testing-strategies) goes further: tests that generate hundreds of random inputs (property testing), snapshot tests, measuring speed (benchmarks), replacing parts of a system with stand-ins (mocking), and running tests automatically on every change (continuous integration).
:::

:::recap
- A test is a function marked `#[test]`. It passes if it does not panic. `cargo test` runs all tests.
- `assert!`, `assert_eq!` and `assert_ne!` check results. `assert_eq!` shows both values on failure.
- `#[should_panic(expected = "…")]` tests for a panic. A test may return a `Result` and use `?`.
- Unit tests sit in `#[cfg(test)] mod tests` next to the code and can test private items. Integration tests sit in `tests/` and use only the public API. Code in `///` comments is tested too.
- Tests run in parallel and must be independent. Output is shown only for failing tests.
- Test the edges: empty, one, limits, strange input, every error case.
:::

:::quiz Check your understanding
? When does a test function pass?
- When it returns `true`
+ When it finishes without panicking (or returns `Ok`)
- When it prints "ok"
- When it has at least one assertion
= The test runner treats a panic as a failure. The assertion macros panic when their check fails.

? What does `#[cfg(test)]` on the `tests` module do?
- It runs the tests automatically at every build
- It makes the tests run faster
+ It compiles the module only when testing, so the tests are not part of the normal program
- It makes private functions public
= `cfg` is short for "configuration". The module is included only under `cargo test`, so tests cost nothing in the finished binary.

? Why prefer `assert_eq!(result, 5)` to `assert!(result == 5)`?
- It is faster
- `assert!` cannot compare numbers
+ On failure it prints both values, so you see what the code actually produced
- It works without `Debug`
= Both check the same thing. `assert_eq!` gives the more useful failure message, with `left` and `right`.

? Where do integration tests live, and what can they use?
- In `src/lib.rs`, and they can use everything
+ In the `tests/` folder, and they can only use the public API of the library
- In `Cargo.toml`
- In `src/tests.rs`, and they can use private functions
= Each file in `tests/` is its own crate that depends on your library like any outside user would.

? A test passes when run alone, and sometimes fails when all tests run together. What is the most likely reason?
- The compiler has a bug
+ The test shares something (a file, a global value) with another test, and tests run in parallel
- `assert_eq!` is unreliable
- The test is too short
= Tests run at the same time and in no fixed order. Tests that share state can disturb each other. Make each test independent, for example by giving each its own file name.
:::

:::exercise guided Test a temperature converter
Here is a function. Write a test module with three tests: freezing point (0 °C is 32 °F), boiling point (100 °C is 212 °F), and −40, where both scales show the same number.

```rust
pub fn celsius_to_fahrenheit(c: f64) -> f64 {
    c * 9.0 / 5.0 + 32.0
}
```
::hint
Start with `#[cfg(test)] mod tests { use super::*; ... }`. Each test is a function marked `#[test]` with one `assert_eq!`.
::solution
```rust test
pub fn celsius_to_fahrenheit(c: f64) -> f64 {
    c * 9.0 / 5.0 + 32.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freezing_point() {
        assert_eq!(celsius_to_fahrenheit(0.0), 32.0);
    }

    #[test]
    fn boiling_point() {
        assert_eq!(celsius_to_fahrenheit(100.0), 212.0);
    }

    #[test]
    fn minus_forty_is_the_same_on_both_scales() {
        assert_eq!(celsius_to_fahrenheit(-40.0), -40.0);
    }
}
```

Three well-known reference points make good test cases, and each test's name says what it checks. One caution for floats: results of calculations are often off by a tiny amount (0.1 + 0.2 is not exactly 0.3), so comparing with `assert_eq!` can fail unexpectedly. These three values happen to be exact. In general, compare floats with a tolerance: `assert!((result - expected).abs() < 1e-9);`.
:::

:::exercise practice Find the bug with a test
This function should return the middle value of a sorted list (the median). For a list with an even number of elements, it should return the average of the two middle values. Write tests for a list of three elements, a list of four elements, and a list of one element. One of them will fail. Fix the function.

```rust
pub fn median(sorted: &[f64]) -> f64 {
    let middle = sorted.len() / 2;
    sorted[middle]
}
```
::hint
For `[1.0, 2.0, 3.0, 4.0]` the median is 2.5. The function returns `sorted[2]`, which is 3.0. For an even length, take the average of `sorted[middle - 1]` and `sorted[middle]`.
::solution
```rust test
pub fn median(sorted: &[f64]) -> f64 {
    let middle = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        (sorted[middle - 1] + sorted[middle]) / 2.0
    } else {
        sorted[middle]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn odd_number_of_elements() {
        assert_eq!(median(&[1.0, 2.0, 3.0]), 2.0);
    }

    #[test]
    fn even_number_of_elements() {
        assert_eq!(median(&[1.0, 2.0, 3.0, 4.0]), 2.5);
    }

    #[test]
    fn single_element() {
        assert_eq!(median(&[7.0]), 7.0);
    }

    #[test]
    #[should_panic]
    fn empty_list_panics() {
        median(&[]);
    }
}
```

The test with four elements exposed the bug: the original code ignored the even case. The fourth test documents what happens for an empty list. Here it panics, because `middle - 1` on a `usize` of 0 overflows. Returning `Option<f64>` would be the friendlier design, and writing the test first makes you think about that case.
:::

:::exercise challenge Test-drive a password check
Use test-driven development to write `check_password(password: &str) -> Result<(), PasswordError>`. The rules: at least 8 characters, at least one digit, and at least one upper-case letter. Define the enum `PasswordError` with one variant per rule. Write one test per rule first, plus one for a valid password, and then write the function.
::hint
The enum needs `#[derive(Debug, PartialEq)]` for `assert_eq!`. Useful methods: `password.chars().count()`, and `password.chars().any(|c| c.is_ascii_digit())`, which is true if at least one character passes the check. Decide in which order the rules are checked, and let a test fix that order.
::solution
```rust test
#[derive(Debug, PartialEq)]
pub enum PasswordError {
    TooShort,
    NoDigit,
    NoUppercase,
}

pub fn check_password(password: &str) -> Result<(), PasswordError> {
    if password.chars().count() < 8 {
        return Err(PasswordError::TooShort);
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(PasswordError::NoDigit);
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err(PasswordError::NoUppercase);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_good_password() {
        assert_eq!(check_password("Sunshine42"), Ok(()));
    }

    #[test]
    fn rejects_short_passwords() {
        assert_eq!(check_password("Ab1"), Err(PasswordError::TooShort));
    }

    #[test]
    fn exactly_eight_characters_is_enough() {
        assert_eq!(check_password("Abcdefg1"), Ok(()));
    }

    #[test]
    fn rejects_passwords_without_a_digit() {
        assert_eq!(check_password("Sunshine"), Err(PasswordError::NoDigit));
    }

    #[test]
    fn rejects_passwords_without_an_uppercase_letter() {
        assert_eq!(check_password("sunshine42"), Err(PasswordError::NoUppercase));
    }

    #[test]
    fn length_is_checked_first() {
        assert_eq!(check_password("abc"), Err(PasswordError::TooShort));
    }
}
```

Each rule has a test, the boundary (exactly 8 characters) has its own test, and one test pins down which error wins when several rules are broken. The function uses `chars().count()` and not `len()`, so that a password with non-English letters is measured in characters, not bytes. Because the function returns an enum, the tests can check exactly *which* rule was broken, which a `bool` could not express.
:::
