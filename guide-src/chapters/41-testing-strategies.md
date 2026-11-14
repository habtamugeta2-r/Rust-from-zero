@id testing-strategies
@part p9
@title Testing strategies for real projects
@short Testing strategies
@level advanced
@time 50
@learn Decide what to test at which level | Make code testable by passing in its dependencies | Write table-driven, property-based and snapshot tests | Measure speed with benchmarks and completeness with coverage | Know the tools for fuzzing, mocking and faster test runs

[Chapter 22](#testing) taught the mechanics: `#[test]`, the assertion macros, unit and integration tests. This chapter is about using them well in a growing project, and about the more powerful techniques and tools.

## What to test where

:::analogy Checking a car
A car factory tests every bolt and every valve on its own, thousands of times a day, because that is quick and cheap. It tests assembled engines on a test bench, which takes longer. And it drives a finished car around a track now and then. All three are needed, in very different numbers.
:::

| Level | Tests … | Speed | How many |
|---|---|---|---|
| **Unit tests** | one function or type in isolation | microseconds | many |
| **Integration tests** | several parts working together, through the public API | milliseconds | some |
| **End-to-end tests** | the whole program from outside, as a user would: start it, send input, check output | seconds | few |

This shape is known as the **test pyramid**: a broad base of fast tests, and a narrow top of slow ones. Fast tests are run constantly, so they find mistakes at once. Slow tests find problems in the connections that unit tests cannot see.

A good test has four properties. It is **fast**. It is **deterministic**: the same result on every run. It is **independent** of other tests. And when it fails, it **tells you what is wrong**.

## Code that can be tested

Some code is hard to test because it reaches out to the world by itself: it reads the clock, a file, the network, a random number. Such a function gives different results at different times, or needs a server to be running.

The cure is to **pass in what the code depends on**. This is called **dependency injection**. In Rust, the dependency is described by a trait. The real program passes the real implementation, and a test passes a simple stand-in, called a **fake** or a **test double**.

```rust test
/// Something that can tell the current hour of the day (0 to 23).
pub trait Clock {
    fn hour(&self) -> u32;
}

pub fn greeting(clock: &impl Clock, name: &str) -> String {
    let part = match clock.hour() {
        5..=11 => "Good morning",
        12..=17 => "Good afternoon",
        18..=22 => "Good evening",
        _ => "Good night",
    };
    format!("{part}, {name}!")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A clock that always shows the same hour.
    struct FixedClock(u32);

    impl Clock for FixedClock {
        fn hour(&self) -> u32 {
            self.0
        }
    }

    #[test]
    fn greets_by_time_of_day() {
        assert_eq!(greeting(&FixedClock(8), "Sara"), "Good morning, Sara!");
        assert_eq!(greeting(&FixedClock(15), "Sara"), "Good afternoon, Sara!");
        assert_eq!(greeting(&FixedClock(20), "Sara"), "Good evening, Sara!");
        assert_eq!(greeting(&FixedClock(2), "Sara"), "Good night, Sara!");
    }

    #[test]
    fn boundaries() {
        assert_eq!(greeting(&FixedClock(11), "A"), "Good morning, A!");
        assert_eq!(greeting(&FixedClock(12), "A"), "Good afternoon, A!");
    }
}
```

In the real program, a `SystemClock` implements the trait by asking the operating system. The test controls time completely, and can check 3 o'clock at night without staying up.

The same idea handles storage, the network, and randomness. Write the trait for what *your code needs* (`save_order`, `send_email`), not for everything the outside system can do. A fake that records what was asked of it lets a test check effects:

```rust test
pub trait Mailer {
    fn send(&mut self, to: &str, text: &str);
}

pub fn remind_all(mailer: &mut impl Mailer, users: &[(&str, u32)]) -> usize {
    let mut sent = 0;
    for (address, open_tasks) in users {
        if *open_tasks > 0 {
            mailer.send(address, &format!("You have {open_tasks} open tasks."));
            sent += 1;
        }
    }
    sent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct RecordingMailer {
        sent: Vec<(String, String)>,
    }

    impl Mailer for RecordingMailer {
        fn send(&mut self, to: &str, text: &str) {
            self.sent.push((to.to_string(), text.to_string()));
        }
    }

    #[test]
    fn only_users_with_open_tasks_get_mail() {
        let mut mailer = RecordingMailer::default();
        let count = remind_all(&mut mailer, &[("a@example.com", 3), ("b@example.com", 0)]);

        assert_eq!(count, 1);
        assert_eq!(mailer.sent, vec![(String::from("a@example.com"), String::from("You have 3 open tasks."))]);
    }
}
```

No e-mail leaves the building during the test. For large traits, the crate **`mockall`** generates such stand-ins automatically. A hand-written fake of ten lines is often clearer.

The cheapest way of all to make code testable is the one used throughout this guide: keep the logic in **pure functions** that take values and return values. They need no stand-ins at all.

## Table-driven tests

When many cases differ only in input and expected output, put them in a table:

```rust test
pub fn is_leap_year(year: u32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leap_years() {
        let cases = [
            (2024, true, "divisible by 4"),
            (2023, false, "not divisible by 4"),
            (1900, false, "divisible by 100, not by 400"),
            (2000, true, "divisible by 400"),
            (2100, false, "divisible by 100, not by 400"),
        ];

        for (year, expected, reason) in cases {
            assert_eq!(is_leap_year(year), expected, "year {year}: {reason}");
        }
    }
}
```

The message at the end of `assert_eq!` matters here. Without it, a failure would only say `left: false, right: true`, and you would not know which row failed. A new case costs one line, which lowers the barrier to adding the next edge case.

## Test helpers and test data

Tests are code and deserve the same care. When several tests need similar data, write a helper that builds it with sensible defaults, so that each test states only what is special about it:

```rust test
#[derive(Debug, Clone, PartialEq)]
pub struct Order {
    pub customer: String,
    pub items: u32,
    pub total_cents: u64,
    pub express: bool,
}

pub fn shipping_cents(order: &Order) -> u64 {
    let base = if order.total_cents >= 5000 { 0 } else { 490 };
    if order.express { base + 900 } else { base }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A typical order. Tests change only the fields they care about.
    fn order() -> Order {
        Order { customer: String::from("test customer"), items: 1, total_cents: 2000, express: false }
    }

    #[test]
    fn small_orders_pay_shipping() {
        assert_eq!(shipping_cents(&order()), 490);
    }

    #[test]
    fn large_orders_ship_free() {
        let large = Order { total_cents: 5000, ..order() };
        assert_eq!(shipping_cents(&large), 0);
    }

    #[test]
    fn express_costs_extra_even_when_shipping_is_free() {
        let express = Order { total_cents: 9000, express: true, ..order() };
        assert_eq!(shipping_cents(&express), 900);
    }
}
```

For tests that need files, the crate **`tempfile`** creates a fresh folder that is deleted when the test ends, so that tests running in parallel cannot disturb each other. Code shared between several integration test files goes into `tests/common/mod.rs`.

## Property-based testing

Example-based tests check the cases you thought of. Bugs live in the cases you did not think of. **Property-based testing** turns the approach around: you state a rule that must hold for **all** inputs, and the tool generates hundreds of random inputs to look for one that breaks it.

The standard crate is **`proptest`** (`cargo add --dev proptest`). Here are two functions that pack runs of equal characters, so that `"aaabcc"` becomes `"3a1b2c"`, and unpack them again:

```rust
/// Encodes runs of equal characters: "aaabcc" becomes "3a1b2c".
pub fn encode(text: &str) -> String {
    let mut result = String::new();
    let mut chars = text.chars().peekable();
    while let Some(current) = chars.next() {
        let mut count = 1;
        while chars.peek() == Some(&current) {
            chars.next();
            count += 1;
        }
        result.push_str(&format!("{count}{current}"));
    }
    result
}

/// Reverses `encode`.
pub fn decode(text: &str) -> String {
    let mut result = String::new();
    let mut count = String::new();
    for c in text.chars() {
        if c.is_ascii_digit() {
            count.push(c);
        } else {
            let n: usize = count.parse().unwrap_or(1);
            result.extend(std::iter::repeat_n(c, n));
            count.clear();
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn encodes_runs() {
        assert_eq!(encode("aaabcc"), "3a1b2c");
        assert_eq!(decode("3a1b2c"), "aaabcc");
    }

    proptest! {
        #[test]
        fn decoding_reverses_encoding(text in "[a-z0-9 ]{0,40}") {
            prop_assert_eq!(decode(&encode(&text)), text);
        }
    }
}
```

The property is one line: *decoding an encoded text gives back the original*. `text in "[a-z0-9 ]{0,40}"` asks for random strings of up to 40 lower-case letters, digits and spaces. The example test passes. The property test does not:

```text
---- tests::decoding_reverses_encoding stdout ----
thread 'tests::decoding_reverses_encoding' panicked at src/lib.rs:43:5:
Test failed: assertion failed: `(left == right)`
  left: `""`,
 right: `"0"` at src/lib.rs:46.
minimal failing input: text = "0"
```

The tool found a real flaw in the format, one that the hand-picked example missed: if the text itself contains a digit, the encoded form is ambiguous. `"0"` is encoded as `"10"`, which decodes as "ten of nothing".

Notice the words **minimal failing input**. The random input that first failed was probably a long string. proptest then **shrinks** it: it tries simpler and simpler inputs that still fail, and reports the simplest one. It also saves the failing case in a file, so that the next run tries it first.

Kinds of properties that fit many functions:

| Property | Example |
|---|---|
| **Round trip**: doing and undoing gives the original | `decode(encode(x)) == x`, `parse(format(x)) == x` |
| **Invariant**: something is always true of the result | a sorted list is in order, and has the same length as the input |
| **Idempotence**: doing it twice equals doing it once | `sort(sort(x)) == sort(x)`, `trim(trim(s)) == trim(s)` |
| **Comparison with a simple version** | a fast algorithm agrees with a slow, obviously correct one |
| **No crash**: for any input, the function returns without panicking | a parser fed with arbitrary bytes |

Inputs are described by **strategies**: `any::<i32>()` for any number, `0..100_u32` for a range, a regular expression for strings, `prop::collection::vec(any::<u8>(), 0..50)` for vectors.

## Snapshot testing

Some results are large: a formatted report, an error message, a generated file. Typing the expected text into a test is tedious, and updating it after every intended change is worse. A **snapshot test** stores the output in a file the first time, and compares against that file from then on. The crate is **`insta`**.

```rust
use covdemo::encode;

#[test]
fn encoded_report() {
    let lines: Vec<String> = ["aaabcc", "zzzz", "abc"]
        .iter()
        .map(|t| format!("{t} -> {}", encode(t)))
        .collect();
    insta::assert_snapshot!(lines.join("\n"));
}
```

The first run writes `tests/snapshots/snapshot__encoded_report.snap`:

```text
---
source: tests/snapshot.rs
expression: "lines.join(\"\\n\")"
---
aaabcc -> 3a1b2c
zzzz -> 4z
abc -> 1a1b1c
```

Later runs fail if the output differs, and show the difference. The companion tool `cargo insta review` shows each change and asks you to accept or reject it. The snapshot files are committed with the code, so a reviewer sees exactly how the output changed.

Snapshots are comfortable, and that is their danger: it is easy to accept a change without reading it. Use them for output where the exact text matters, and keep ordinary assertions for logic.

## Testing the outside of a program

- **Command-line programs**: the crate **`assert_cmd`** starts your compiled program with arguments and checks its output and exit code. This is an end-to-end test that Cargo runs like any other.
- **Async code**: `#[tokio::test]` runs an async test function, as in the chat project of [chapter 33](#project-chat). Put a timeout around everything that waits.
- **Web services**: a server can be tested without opening a network port, by handing requests directly to its router. [Chapter 48](#project-api) shows it.
- **Documentation**: every example in a `///` comment is a test.

## Fuzzing

**Fuzzing** is property testing taken further. A fuzzer feeds a function millions of inputs, watches which parts of the code each input reaches, and mutates the inputs to reach more. It runs for minutes or days, and it is extremely good at finding inputs that crash parsers and decoders. The tool is **`cargo fuzz`** (it needs the nightly toolchain):

```rust
#![no_main]
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(text) = std::str::from_utf8(data) {
        let _ = my_crate::parse(text);      // must never panic, whatever the input
    }
});
```

Any code that reads data from outside (file formats, network protocols, user input) is a candidate. Fuzzing has found thousands of bugs in widely used software.

## Benchmarks

A **benchmark** measures how long code takes. Measuring time well is harder than it looks: the first runs are slow, other programs disturb the measurement, and the optimiser may remove a calculation whose result is never used. The crate **`criterion`** handles all of that. It runs the code many times, analyses the measurements statistically, and compares with the previous run.

```toml
[dev-dependencies]
criterion = "0.8.2"

[[bench]]
name = "encode"
harness = false
```

```rust file=benches/encode.rs
use std::hint::black_box;

use criterion::{criterion_group, criterion_main, Criterion};
use covdemo::encode;

fn bench_encode(c: &mut Criterion) {
    let text = "aaaabbbcccd".repeat(1000);
    c.bench_function("encode 11 kB", |b| b.iter(|| encode(black_box(&text))));
}

criterion_group!(benches, bench_encode);
criterion_main!(benches);
```

```text
$ cargo bench
encode 11 kB            time:   [129.70 µs 134.32 µs 139.62 µs]
```

The three numbers are the lower bound, the best estimate and the upper bound of the time for one call. On the next run, criterion also reports whether the code got faster or slower, and whether the change is larger than the noise of the measurement.

`black_box` hides a value from the optimiser, so that the compiler cannot compute the answer in advance or throw the work away. Benchmarks always run in release mode. [Chapter 51](#performance) is about what to do with the numbers.

## How much is tested?

**Code coverage** reports which lines were executed by the tests. The tool `cargo llvm-cov` produces the numbers and an HTML page in which untested lines are marked:

```text
cargo install cargo-llvm-cov
cargo llvm-cov --html
```

Use coverage to find code that no test touches at all. Do not chase a percentage. A line that was executed is not thereby checked: a test without assertions gives full coverage and proves nothing. A sharper tool is **mutation testing** (`cargo mutants`): it changes your code in small ways, for example turning `<` into `<=`, and reports the changes that no test noticed.

## More tools

| Tool | Purpose |
|---|---|
| `cargo nextest` | a faster test runner: each test in its own process, clearer output, retries for flaky tests |
| `cargo miri test` | run the tests in an interpreter that detects undefined behaviour ([chapter 35](#unsafe)) |
| `rstest`, `test-case` | parameterised tests and fixtures through attributes |
| `mockall` | generated mock objects for traits |
| `wiremock`, `httpmock` | a fake HTTP server for testing code that calls web services |
| `testcontainers` | start a real database in a container for the duration of a test |
| `loom` | test concurrent code by trying the possible interleavings of threads |
| `trybuild` | compile-fail tests: assert that a bad program fails to compile *with the message you expect* |
| `pretty_assertions` | coloured, line-by-line diffs when an `assert_eq!` fails |
| `quickcheck`, `proptest` | generate random inputs and check properties instead of examples ([above](#testing-strategies)) |
| `insta` | snapshot tests: compare against a reviewed, committed output ([above](#testing-strategies)) |

## Habits that keep a test suite healthy

- **Test behaviour, not implementation.** A test that checks private details breaks with every refactoring and protects nothing.
- **Every bug gets a test** before it is fixed.
- **Fix or delete flaky tests.** A test that fails now and then teaches everyone to ignore failures. The usual causes are shared state, real time, real network, and dependence on the order of a `HashMap`.
- **Keep tests fast.** A suite that takes ten minutes is not run.
- **Name tests as statements** about behaviour: `large_orders_ship_free`.
- **Run everything in CI**, on every change ([chapter 40](#quality-tools)).

:::compare Testing tools in other languages
Property-based testing comes from Haskell's QuickCheck and exists in most languages now: Hypothesis for Python, fast-check for JavaScript, jqwik for Java. Snapshot testing became popular through Jest in JavaScript. Fuzzing grew up around C and C++ with AFL and libFuzzer, which `cargo fuzz` uses underneath. Rust adds two things of its own: the type system removes whole categories of tests that dynamic languages need ("what if this is null?", "what if this is the wrong type?"), and a fuzzer that finds a panic in safe Rust has found a bug, and not a security hole.
:::

:::recap
- Many fast unit tests, some integration tests, a few end-to-end tests.
- Pass dependencies in through traits. Tests use simple fakes for the clock, storage and network.
- Table-driven tests make adding a case cheap. Helper functions build test data with defaults.
- Property tests check a rule for hundreds of generated inputs and shrink failures to a minimal case.
- Snapshot tests store large outputs in files and show differences for review.
- `criterion` measures speed reliably. `cargo llvm-cov` shows untested code. `cargo fuzz` hunts for crashes.
- A healthy suite is fast, deterministic, and run on every change.
:::

:::quiz Check your understanding
? Why does the test pyramid have many unit tests and few end-to-end tests?
- End-to-end tests are less useful
+ Unit tests are fast and point exactly at a fault, so they can be many and run constantly. End-to-end tests are slow and are kept for what only they can check
- Unit tests are required by Cargo
- End-to-end tests cannot be automated
= Speed and precision decide the proportions. Each level catches problems the others cannot.

? A function calls `SystemTime::now()` inside and behaves differently in the evening. How do you make it testable?
- Run the tests in the evening
- Use `#[ignore]`
+ Pass the time, or a `Clock` trait object, in as a parameter, and give the test a fixed clock
- Use `unsafe` to change the system time
= Injecting the dependency puts the test in control. The production code passes the real clock.

? What does "shrinking" mean in property-based testing?
- Making the test run faster
+ After finding a failing input, the tool searches for the simplest input that still fails
- Reducing the number of tests
- Compressing the test data
= A random failing input is usually long and confusing. The shrunk one, such as `"0"`, shows the heart of the bug.

? Which is a property suitable for a function `sort`?
- `sort([3, 1, 2])` returns `[1, 2, 3]`
+ For every list, the result is in order and has the same elements as the input
- The function is fast
- The function compiles
= The first is an example. A property is a statement about all inputs, which the tool can check with generated data.

? A project has 100 % line coverage. What does that prove?
- The program has no bugs
- Every possible input was tested
+ Only that every line was executed by some test. Whether the results were checked is another matter
- The tests are fast
= Coverage finds untested code. It cannot tell whether the tests assert anything meaningful.
:::

:::exercise guided A table of cases
Write `fn grade(points: u32) -> Result<char, String>`: 90 to 100 points give `'A'`, 75 to 89 `'B'`, 60 to 74 `'C'`, below 60 `'F'`, and more than 100 is an error. Test it with one table-driven test that covers every boundary on both sides.
::hint
The table is an array of pairs `(points, expected)`, where `expected` is a `Result<char, ()>` or simply an `Option<char>` with `None` for "error". Boundaries: 100 and 101, 90 and 89, 75 and 74, 60 and 59, and 0.
::solution
```rust test
pub fn grade(points: u32) -> Result<char, String> {
    match points {
        90..=100 => Ok('A'),
        75..=89 => Ok('B'),
        60..=74 => Ok('C'),
        0..=59 => Ok('F'),
        _ => Err(format!("{points} is more than the maximum of 100")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grades_at_every_boundary() {
        let cases = [
            (0, Some('F')),
            (59, Some('F')),
            (60, Some('C')),
            (74, Some('C')),
            (75, Some('B')),
            (89, Some('B')),
            (90, Some('A')),
            (100, Some('A')),
            (101, None),
            (u32::MAX, None),
        ];

        for (points, expected) in cases {
            assert_eq!(grade(points).ok(), expected, "for {points} points");
        }
    }
}
```

Each boundary appears twice: the last value on one side and the first on the other. That is where "off by one" mistakes hide, such as `>` where `>=` was meant. `.ok()` turns the `Result` into an `Option`, so that the table stays simple and the error text is not part of the comparison. The message `"for {points} points"` identifies the failing row.
:::

:::exercise practice A fake for storage
A function `register(store: &mut impl UserStore, name: &str) -> Result<u32, String>` should refuse empty names and names that already exist, and otherwise save the user and return the new id. Define the trait `UserStore` with the methods `exists(&self, name: &str) -> bool` and `save(&mut self, name: &str) -> u32`. Write an in-memory fake, and three tests.
::hint
The fake is a struct with a `Vec<String>`. `save` pushes the name and returns the new length as the id. The tests: a successful registration, a duplicate, and an empty name. In the last two, also check that nothing was saved.
::solution
```rust test
pub trait UserStore {
    fn exists(&self, name: &str) -> bool;
    fn save(&mut self, name: &str) -> u32;
}

pub fn register(store: &mut impl UserStore, name: &str) -> Result<u32, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(String::from("the name must not be empty"));
    }
    if store.exists(name) {
        return Err(format!("the name '{name}' is taken"));
    }
    Ok(store.save(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryStore {
        names: Vec<String>,
    }

    impl UserStore for MemoryStore {
        fn exists(&self, name: &str) -> bool {
            self.names.iter().any(|n| n == name)
        }

        fn save(&mut self, name: &str) -> u32 {
            self.names.push(name.to_string());
            self.names.len() as u32
        }
    }

    #[test]
    fn a_new_user_gets_an_id() {
        let mut store = MemoryStore::default();
        assert_eq!(register(&mut store, "sara"), Ok(1));
        assert_eq!(register(&mut store, " tomas "), Ok(2));
        assert_eq!(store.names, ["sara", "tomas"]);
    }

    #[test]
    fn duplicates_are_refused() {
        let mut store = MemoryStore::default();
        register(&mut store, "sara").unwrap();
        assert!(register(&mut store, "sara").is_err());
        assert_eq!(store.names.len(), 1);
    }

    #[test]
    fn empty_names_are_refused() {
        let mut store = MemoryStore::default();
        assert!(register(&mut store, "   ").is_err());
        assert!(store.names.is_empty());
    }
}
```

The rules of registration are tested without any database. In the real program, a type that talks to a database implements `UserStore`, and `register` does not change. The tests check the returned value and also the state of the store afterwards: a refused registration must leave no trace. The second assertion in the first test shows that names are trimmed before saving, a detail that would be easy to lose in a later rewrite.
:::

:::exercise challenge Properties of a function
Write `distinct_sorted(values: Vec<i32>) -> Vec<i32>`, which returns the distinct values of a list in rising order. Then write three property tests with proptest: (1) the output is strictly rising, (2) every input value appears in the output and nothing else does, and (3) applying the function twice gives the same as applying it once.
::hint
The function is `sort` followed by `dedup`. A strategy for a vector is `prop::collection::vec(any::<i32>(), 0..100)`. "Strictly rising" is `result.windows(2).all(|pair| pair[0] < pair[1])`. For property 2, use a small range such as `-50..50_i32`, so that duplicates really occur.
::solution
```rust
/// Returns the distinct values of a list, in rising order.
pub fn distinct_sorted(mut values: Vec<i32>) -> Vec<i32> {
    values.sort();
    values.dedup();
    values
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn output_is_strictly_rising(values in prop::collection::vec(any::<i32>(), 0..100)) {
            let result = distinct_sorted(values);
            prop_assert!(result.windows(2).all(|pair| pair[0] < pair[1]));
        }

        #[test]
        fn nothing_is_lost_and_nothing_is_invented(values in prop::collection::vec(-50..50_i32, 0..100)) {
            let result = distinct_sorted(values.clone());
            prop_assert!(values.iter().all(|v| result.contains(v)));
            prop_assert!(result.iter().all(|v| values.contains(v)));
        }

        #[test]
        fn doing_it_twice_changes_nothing(values in prop::collection::vec(any::<i32>(), 0..100)) {
            let once = distinct_sorted(values);
            let twice = distinct_sorted(once.clone());
            prop_assert_eq!(once, twice);
        }
    }
}
```

Together, the first two properties describe the function completely: the result contains exactly the input's values, each once, in order. No concrete example was needed, and each test run checks 256 random lists per property, including the empty list and lists of one element.

The choice of strategy matters. With `any::<i32>()`, two equal numbers almost never occur by chance, so the removal of duplicates would hardly be exercised. The narrow range in the second property makes duplicates frequent. When you write a property, ask whether the generated inputs really reach the interesting cases.

Try breaking the function, for example by removing `values.dedup()`, and watch which property fails and what minimal input proptest reports.
:::
