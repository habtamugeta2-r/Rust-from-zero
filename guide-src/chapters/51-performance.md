@id performance
@part p12
@title Performance: measure first, then improve
@short Performance
@level intermediate
@time 55
@learn Follow the three rules: measure a release build, find where the time goes, change one thing at a time | Compare whole programs with hyperfine and single functions with criterion | Read a flame graph | Count allocations and remove the needless ones | Recognise the common causes of slow programs: the algorithm, allocations, unbuffered files, hashing | Tell a real difference between two measurements from noise | Decide when a program is fast enough

Rust gives you native compilation and control over many performance-relevant choices, but it does not make every program fast by default. Algorithms, allocation patterns, I/O and workload all matter. A sound first step is to define what "fast enough" means, measure a release build, and optimise only after you know where time is spent.

When that day comes, this chapter gives you a method. It has three rules, and they matter more than any single trick:

1. **Measure a release build.**
2. **Find out where the time goes** before you change anything.
3. **Change one thing, and measure again.**

[Chapter 43](#idioms) asked you to write the clear version first and to optimise only what a measurement points at. Here is how to get that measurement.

:::plain Measure, then change one thing
Performance work is a loop, not a list of tricks: **measure** with a release build (debug builds are `10–100×` slower and meaningless for timing), find the actual bottleneck with `perf` or `cargo flamegraph`, change **one** thing, and measure again. The usual suspects are allocations (a `String` per line), unnecessary copies (`&Vec<T>` arguments), the wrong data structure (a `Vec` scan where a `HashSet` belongs), unbuffered I/O, and the default hasher. The usual non-answer is guessing: the line that *looks* slow is regularly not the one that is, which is why `Instant::now()` around two implementations settles arguments faster than any opinion.
:::

:::analogy The slow restaurant
A restaurant gets complaints: the food takes too long. The owner is sure that the cooks are slow, and buys a faster stove. Nothing improves. Then somebody stands in the kitchen for an evening with a watch. Cooking a dish takes six minutes. But every plate waits ten minutes on the counter, because one waiter serves the whole room. The stove was never the problem. Programs are like this. The slow part is very often not where you would bet, and only a watch can tell you.
:::

:::note The numbers in this chapter
All times were measured on the machine that tests this guide: Linux, two processor cores, Rust 1.100. Your numbers will differ, but their proportions should be similar. The Run buttons of this chapter compile and run the examples in release mode.
:::

## A program to make faster

The patient for this chapter makes a long text of two million words and then counts how often each word occurs. It carries two measuring tools with it, which are explained below:

```rust run release nocmp
use std::alloc::{GlobalAlloc, Layout, System};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

/// An allocator that counts the requests for memory and passes them on.
struct Counting;

static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

/// Two million words from a vocabulary of 5,000, in a jumbled order.
fn make_text() -> String {
    let mut text = String::new();
    let mut state: u32 = 12345;
    for index in 0..2_000_000 {
        state = state.wrapping_mul(1_103_515_245).wrapping_add(12345);
        let word = (state >> 8) % 5000;
        if index > 0 {
            text.push(' ');
        }
        text.push_str(&format!("w{word}"));
    }
    text
}

/// Counts how often each word occurs.
fn count_words(text: &str) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    for word in text.split(' ') {
        *counts.entry(word.to_string()).or_insert(0) += 1;
    }
    counts
}

/// Runs `work` once, and prints its time and its number of allocations.
fn measure<T>(name: &str, work: impl FnOnce() -> T) -> T {
    let allocations_before = ALLOCATIONS.load(Ordering::Relaxed);
    let start = Instant::now();
    let result = work();
    let time = start.elapsed();
    let allocations = ALLOCATIONS.load(Ordering::Relaxed) - allocations_before;
    println!(
        "{name:<16} {:>6.1} ms {allocations:>10} allocations",
        time.as_secs_f64() * 1000.0
    );
    result
}

fn main() {
    let text = measure("make the text", make_text);
    let counts = measure("count the words", || count_words(&text));
    println!(
        "{} bytes of text, {} different words",
        text.len(),
        counts.len()
    );
}
```
```output
make the text     106.8 ms    3996096 allocations
count the words    83.9 ms    2000012 allocations
11554805 bytes of text, 5000 different words
```

The function `measure` is the watch. It runs a piece of work, and prints how long that took and how often it asked for memory on the heap.

The count of allocations comes from the first lines of the program. `#[global_allocator]` replaces the part of the program that hands out heap memory. Our `Counting` passes every request on to `System`, the normal allocator, and adds one to a counter on the way. The counter is an atomic number from [chapter 61](#shared-state), because any thread may ask for memory. Implementing `GlobalAlloc` needs the word `unsafe` ([chapter 39](#unsafe)): the compiler cannot check that an allocator returns valid memory. Here that duty is passed straight on to `System`. When a `String` or a `Vec` grows into a larger buffer, that counts as an allocation too.

## Rule 1: measure a release build

`cargo run` builds for debugging: quick to compile, with all checks, without optimisation. The speed of such a build says nothing about the program that your users will run. `cargo build --release` makes the optimised program in `target/release`.

The tool **hyperfine** measures the running time of whole commands. It runs each of them many times and does the statistics:

```sh
cargo install hyperfine
cargo build
cargo build --release
hyperfine target/debug/words target/release/words
```
```text nosoft
Benchmark 1: target/debug/words (10 runs)
                mean     ±       σ          min     …     max
  Wall Time    811.2 ms  ±    30.7 ms     780.7 ms  …   879.8 ms
  Memory        18.1 MiB ±     0.1 MiB     18.0 MiB …    18.2 MiB

Benchmark 2: target/release/words (15 runs)
                mean     ±       σ          min     …     max
  Wall Time    188.2 ms  ±     7.6 ms     181.6 ms  …   209.4 ms           -76.8%  (4.3x faster)
  Memory        18.1 MiB ±     0.0 MiB     18.0 MiB …    18.1 MiB           -0.1%
```

The release build is 4.3 times faster, and not one line of the code has changed. In the line of the release build, 188.2 ms is the mean of 15 runs, and `± 7.6 ms` says how much the single runs differed from each other. Keep an eye on that second number. It returns later in this chapter.

:::warn The most common mistake
"Rust is slow" in a forum post nearly always means "I measured a debug build". Before you compare Rust with anything, and before you optimise anything, add `--release`.
:::

## Rule 2: find out where the time goes

Look again at the output of the program:

```output
make the text     106.8 ms    3996096 allocations
count the words    83.9 ms    2000012 allocations
```

The program is called a word counter, so the natural suspect is the counting loop with its hash map. The watch says something else. *Making the text* takes longer than counting it, and asks for memory four million times: twice for every word. Whoever starts by tuning the hash map works on the smaller half of the problem.

Timing the large steps by hand, as `measure` does, is the simplest way to find the slow part. Often it is enough.

### A profiler

For larger programs there are **[[profilers|profiler]]**. A profiler interrupts the running program several thousand times a second, and notes which function is running at that moment and which functions called it. Each note is a *sample*. A function that appears in many samples is one where the time goes.

The result is drawn as a **[[flame graph]]**. The tool `cargo flamegraph` does all of it in one step:

```sh
cargo install flamegraph
cargo flamegraph -F 5000
```

The second command builds the release version, runs it under the profiler, and writes the picture `flamegraph.svg`, which any browser can show. `-F 5000` asks for 5,000 samples per second, because this program runs for only a fifth of a second. A profiler needs the names of the functions, which a release build normally leaves out. Keep them with two lines in `Cargo.toml`:

```toml
[profile.release]
debug = true
```

Here is the result for the word counter, reduced to its widest bars:

```flame The flame graph of the word counter, simplified. The numbers are per cent of the running time. Click a bar to zoom in.
main | 100 | words::main
  make_text | 51 | words::make_text
    format! | 42 | alloc::fmt::format
      fmt::write | 24 | core::fmt::write
        push_str | 14 | String::push_str
          realloc | 10 | realloc: the String moves to a larger buffer
      alloc | 9 | String::with_capacity: memory for the new String
    drop | 5 | drop of the String: the memory is given back
  count_words | 48 | words::count_words
    HashMap::entry | 33 | HashMap::entry
      find | 20 | RawTable::find: looking for the key
      hash | 12 | make_hash: computing the hash of the key
    to_string | 9 | str::to_string
    split | 5 | Split::next: finding the next space
```

How to read a flame graph:

- Every bar is a function. Its **width** is the share of the samples in which that function was running, or was waiting for a function that it had called.
- A bar sits **on top of its caller**. `main` called `make_text`, which called `format!`, which called `fmt::write`.
- The order from left to right is alphabetical, and the colours mean nothing. Only the widths count.
- Look for wide bars near the top. That is where the processor really spends its time.
- A narrow bar has no room for its name. Point at it to read the name, or click it to zoom in. A click on the bar at the bottom zooms out again. The real picture works the same way, and so does the drawing above.

The graph agrees with the watch: each of the two steps takes about half of the time. And it shows what happens inside them:

- In `make_text`, nearly everything is `format!`. Inside it, three bars deal with memory: `alloc` creates the small `String`, `realloc` moves it to a larger buffer when the number arrives, and `drop` gives the memory back. Together they take 24 per cent of the whole running time. That is nearly half of `make_text`, spent on asking for memory and returning it.
- In `count_words`, the hash map takes most of the time: 20 per cent for finding the key and 12 for computing its hash. `to_string` adds 9 per cent, and nearly all of that is its allocation.

### A surprise

The real picture has many more bars than this drawing, and a Search button in its corner. Search for `atomic_add`, and several narrow bars light up, with the note `Matched: 11.0%`. That function is the `fetch_add` of our own allocation counter. The watch itself uses a tenth of the time.

A test confirms it. Without the two lines of `#[global_allocator]`, hyperfine measures 167.8 ms for the program instead of 188.0 ms: 10.8 per cent less. Nobody would have guessed that an addition costs so much. (An atomic addition has to be safe against all other threads, and it happens six million times.) Finding what nobody guessed is what a profiler is for.

There are two lessons in this. Every measuring tool disturbs what it measures, so take your instruments out before the final measurement. And a counter that is only a tool should not be mistaken for a part of the problem: the allocation counts stay in the examples below, because they explain *why* a version is slow.

| Tool | What it does |
|---|---|
| `cargo flamegraph` | builds, profiles and draws the flame graph. On Linux it uses `perf` |
| `perf` | the profiler of Linux. `perf record` and `perf report` work with any program |
| `samply` | records a profile and shows it in the Firefox Profiler, a viewer that runs in the browser |
| `dhat` (`dhat-rs`) | profiles heap allocations and reports peak live memory by call site |
| `heaptrack`, `valgrind --tool=massif` | tracks total heap usage and memory leaks over time on Linux without modifying code |
| `cargo-bloat` | lists the largest functions and crates inside a compiled binary to shrink executable size |

Everything in this chapter was run on Linux. `cargo flamegraph` and `samply` describe macOS and Windows in their documentation too. For explicit vector processing when the compiler cannot auto-vectorise a hot inner loop, the crate `wide` provides portable **SIMD** types (`f32x4`, `u32x8`) on stable Rust (and `std::simd` on nightly).

## Rule 3: change one thing, and measure again

Both steps of the program allocate once or twice *per word*. That is the trail to follow.

**The counting.** `word.to_string()` creates a new `String` for every one of the two million words, only to look it up. For all but 5,000 of them the key exists already, and the fresh `String` is thrown away at once. But the words are all in `text`. A map with keys of the type `&str` can simply point at them.

**The text.** `format!("w{word}")` builds a small `String`, `push_str` copies it into the text, and then it is dropped. The macro `write!` puts the characters straight into the `String` that exists already. And since the final size is roughly known, the buffer can be reserved once.

Here are the two new functions, and a `main` that measures the old and the new versions side by side. The rest of the program is the same as before and is not shown again. The Run button has all of it.

```rust run release nocmp
# use std::alloc::{GlobalAlloc, Layout, System};
# use std::collections::HashMap;
# use std::sync::atomic::{AtomicUsize, Ordering};
# use std::time::Instant;
#
# /// An allocator that counts the requests for memory and passes them on.
# struct Counting;
#
# static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);
#
# unsafe impl GlobalAlloc for Counting {
#     unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
#         ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
#         unsafe { System.alloc(layout) }
#     }
#
#     unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
#         unsafe { System.dealloc(pointer, layout) }
#     }
# }
#
# #[global_allocator]
# static GLOBAL: Counting = Counting;
#
# /// Two million words from a vocabulary of 5,000, in a jumbled order.
# fn make_text() -> String {
#     let mut text = String::new();
#     let mut state: u32 = 12345;
#     for index in 0..2_000_000 {
#         state = state.wrapping_mul(1_103_515_245).wrapping_add(12345);
#         let word = (state >> 8) % 5000;
#         if index > 0 {
#             text.push(' ');
#         }
#         text.push_str(&format!("w{word}"));
#     }
#     text
# }
#
# /// Counts how often each word occurs.
# fn count_words(text: &str) -> HashMap<String, u32> {
#     let mut counts = HashMap::new();
#     for word in text.split(' ') {
#         *counts.entry(word.to_string()).or_insert(0) += 1;
#     }
#     counts
# }
#
# /// Runs `work` once, and prints its time and its number of allocations.
# fn measure<T>(name: &str, work: impl FnOnce() -> T) -> T {
#     let allocations_before = ALLOCATIONS.load(Ordering::Relaxed);
#     let start = Instant::now();
#     let result = work();
#     let time = start.elapsed();
#     let allocations = ALLOCATIONS.load(Ordering::Relaxed) - allocations_before;
#     println!(
#         "{name:<16} {:>6.1} ms {allocations:>10} allocations",
#         time.as_secs_f64() * 1000.0
#     );
#     result
# }
#
use std::fmt::Write;

/// The same text, written straight into one String of the right size.
fn make_text_fast() -> String {
    let mut text = String::with_capacity(12_000_000);
    let mut state: u32 = 12345;
    for index in 0..2_000_000 {
        state = state.wrapping_mul(1_103_515_245).wrapping_add(12345);
        let word = (state >> 8) % 5000;
        if index > 0 {
            text.push(' ');
        }
        write!(text, "w{word}").unwrap();
    }
    text
}

/// Counts how often each word occurs. The keys borrow from the text.
fn count_words_borrowed(text: &str) -> HashMap<&str, u32> {
    let mut counts = HashMap::new();
    for word in text.split(' ') {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}

fn main() {
    let text = measure("text, format!", make_text);
    let fast_text = measure("text, write!", make_text_fast);
    assert_eq!(text, fast_text);

    let owned = measure("count, String", || count_words(&text));
    let borrowed = measure("count, &str", || count_words_borrowed(&text));
    assert_eq!(owned.len(), borrowed.len());
    for (word, count) in &owned {
        assert_eq!(borrowed[word.as_str()], *count);
    }
    println!("{} different words, and all versions agree", borrowed.len());
}
```
```output
text, format!     104.3 ms    3996096 allocations
text, write!       38.8 ms          1 allocations
count, String      80.2 ms    2000012 allocations
count, &str        40.8 ms         12 allocations
5000 different words, and all versions agree
```

Both steps are at least twice as fast, and together they went from 185 to 80 milliseconds. The allocations fell from six million to thirteen. Four details of the method:

- **Each change was measured by itself**, next to the old version. A change that does not help is taken out again, because it only makes the code harder to read.
- **The results are compared**, with `assert_eq!`. A fast function with a wrong answer is worthless, and it is easy to break something while tuning.
- **The instrument was checked.** Without the allocation counter, the four lines read 83, 37, 75 and 39 milliseconds. The conclusion is the same.
- **The price is visible in the types.** `HashMap<&str, u32>` borrows from the text, so the text must live as long as the map. If the caller needs keys that it owns, convert the 5,000 keys at the end. That is still 400 times fewer allocations than before.

One more measurement: with `String::new()` instead of `String::with_capacity(12_000_000)`, the new `make_text_fast` takes 46 ms and allocates 22 times. So nearly all of the gain comes from `write!`, and the reserved capacity adds a little. Without a measurement, you would not know which of the two ideas did the work.

## Where the time usually goes

A handful of causes explains most slow programs. They are listed here from the most important to the least.

### The algorithm

No tuning can save a program whose work grows with the square of its input, the O(n²) of [chapter 20](#collections). Here are two functions that answer the same question: is any number in this list twice?

```rust run release nocmp
use std::collections::HashSet;
use std::time::Instant;

/// Is any number in the list twice? Looks at all earlier numbers each time.
fn has_duplicate_slow(numbers: &[u64]) -> bool {
    for (index, number) in numbers.iter().enumerate() {
        if numbers[..index].contains(number) {
            return true;
        }
    }
    false
}

/// The same question, with a set that remembers what was seen.
fn has_duplicate_fast(numbers: &[u64]) -> bool {
    let mut seen = HashSet::new();
    // `insert` returns false when the value was already in the set
    numbers.iter().any(|number| !seen.insert(number))
}

fn main() {
    for size in [10_000, 20_000, 40_000, 80_000] {
        // All numbers are different: the worst case for both functions
        let numbers: Vec<u64> = (0..size).map(|n| n * 7919 % 1_000_003).collect();

        let start = Instant::now();
        let slow = has_duplicate_slow(&numbers);
        let slow_time = start.elapsed().as_secs_f64() * 1000.0;

        let start = Instant::now();
        let fast = has_duplicate_fast(&numbers);
        let fast_time = start.elapsed().as_secs_f64() * 1000.0;

        assert_eq!(slow, fast);
        println!("{size:>6} numbers: loop in loop {slow_time:>6.1} ms, set {fast_time:>4.1} ms");
    }
}
```
```output
 10000 numbers: loop in loop    8.3 ms, set  0.3 ms
 20000 numbers: loop in loop   34.8 ms, set  0.7 ms
 40000 numbers: loop in loop  142.2 ms, set  1.4 ms
 80000 numbers: loop in loop  569.3 ms, set  3.3 ms
```

Read down the columns. Each time the input doubles, the first function takes *four* times as long, and the second one about twice as long. At 80,000 numbers the difference is a factor of 170, and it keeps growing. `contains` on a slice looks harmless, but it is a loop, and here it sits inside another loop. A `HashSet` answers "have I seen this?" in a time that does not depend on its size.

Always test with input of a realistic size. With 100 numbers, both functions are too fast to tell apart.

### Allocations

Asking for heap memory is not expensive once. It is expensive two million times. You have seen the effect above. The usual places:

- `to_string()`, `to_owned()` and `clone()` on values that are only read. Borrow them.
- `format!` when the result is only appended to another string. Use `write!`.
- A `String` or `Vec` that is created anew in every round of a loop. Create it once before the loop and empty it with `clear()`, which keeps its memory. Reading two million lines from a file took 70 ms with `lines()`, which makes a new `String` per line, and 52 ms with `read_line` into one `String` that was emptied each time.
- `collect()` into a `Vec` that is then walked through only once. Keep working with the iterator.

`with_capacity` is on every list of performance tips, so here is its measurement as well. Filling a `Vec` with ten million numbers took about 34 ms from `Vec::new()` and about 31 ms with the right capacity. The gain is small, because a growing `Vec` doubles its buffer each time and so has to move only rarely. Reserve the capacity when you know the size, and do not expect wonders.

:::tip A finished tool for counting
The crate `dhat` replaces the hand-made counter of this chapter. It needs three lines:

```rust
#[global_allocator]
static ALLOCATOR: dhat::Alloc = dhat::Alloc;

fn main() {
    let _profiler = dhat::Profiler::new_heap();
    // … the program …
}
```

For the first program of this chapter it reported:

```text nosoft
dhat: Total:     63,619,578 bytes in 5,996,109 blocks
dhat: At t-gmax: 17,200,874 bytes in 3,589 blocks
dhat: At t-end:  1,024 bytes in 1 blocks
dhat: The data has been saved to dhat-heap.json, and is viewable with dhat/dh_view.html
```

That is the six million allocations that our counter found, 64 megabytes in total, and at most 17 megabytes at the same moment. The saved file also says which lines of the code asked for the memory. While `dhat` watches, the program runs about twenty times slower, so use it for counting and not for timing.
:::

### Files without a buffer

Every write to a `File` is a request to the operating system, and such a request costs far more than the few bytes that it carries:

```rust run release nocmp
use std::fs::File;
use std::io::{BufWriter, Write};
use std::time::Instant;

fn main() -> std::io::Result<()> {
    let path = std::env::temp_dir().join("lines.txt");

    // Every `writeln!` goes to the operating system separately
    let start = Instant::now();
    let mut file = File::create(&path)?;
    for number in 0..500_000 {
        writeln!(file, "line {number}")?;
    }
    println!(
        "straight to the file: {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );

    // The lines are collected in memory and written in large pieces
    let start = Instant::now();
    let mut file = BufWriter::new(File::create(&path)?);
    for number in 0..500_000 {
        writeln!(file, "line {number}")?;
    }
    file.flush()?;
    println!(
        "through a BufWriter:  {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );

    std::fs::remove_file(&path)
}
```
```output
straight to the file: 1026.6 ms
through a BufWriter:    12.4 ms
```

A factor of 80, for one more word in the code. `BufWriter` collects the output in memory and passes it on in pieces of several kilobytes. `BufReader` does the same for reading, as you know from [chapter 23](#errors).

The terminal is a file as well. `println!` passes every line on at once. Printing 500,000 lines into a file took 384 ms with `println!`, and 14 ms with `writeln!` into a `BufWriter::new(std::io::stdout().lock())`. For a program that prints a few lines this does not matter. For one that prints a whole report it does.

### Hashing, and idle cores

The standard `HashMap` uses a hash function that is built to withstand attackers: people who choose keys on purpose so that a server gets slow. That safety costs time. When strangers have no control over the keys, a simpler hash function is a fair exchange. The crate `rustc-hash` offers `FxHashMap`, which the Rust compiler itself uses. And with Rayon ([chapter 65](#async-ecosystem)), the counting can use all cores:

```toml
[dependencies]
rayon = "1.12.0"
rustc-hash = "2.1.3"
```

```rust ext run nocmp
use std::collections::HashMap;
use std::fmt::Write;
use std::time::Instant;

use rayon::prelude::*;
use rustc_hash::FxHashMap;

fn make_text() -> String {
    let mut text = String::with_capacity(12_000_000);
    let mut state: u32 = 12345;
    for index in 0..2_000_000 {
        state = state.wrapping_mul(1_103_515_245).wrapping_add(12345);
        let word = (state >> 8) % 5000;
        if index > 0 {
            text.push(' ');
        }
        write!(text, "w{word}").unwrap();
    }
    text
}

fn count_std(text: &str) -> HashMap<&str, u32> {
    let mut counts = HashMap::new();
    for word in text.split(' ') {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}

/// The same loop with a simpler, faster hash function.
fn count_fx(text: &str) -> FxHashMap<&str, u32> {
    let mut counts = FxHashMap::default();
    for word in text.split(' ') {
        *counts.entry(word).or_insert(0) += 1;
    }
    counts
}

/// All cores: each thread counts one part, then the partial maps are merged.
fn count_parallel(text: &str) -> FxHashMap<&str, u32> {
    text.par_split(' ')
        .fold(FxHashMap::default, |mut counts, word| {
            *counts.entry(word).or_insert(0) += 1;
            counts
        })
        .reduce(FxHashMap::default, |mut total, part| {
            for (word, count) in part {
                *total.entry(word).or_insert(0) += count;
            }
            total
        })
}

fn measure<T>(name: &str, work: impl FnOnce() -> T) -> T {
    let start = Instant::now();
    let result = work();
    println!(
        "{name:<22} {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
    result
}

fn main() {
    let text = make_text();

    let standard = measure("standard hasher", || count_std(&text));
    let fx = measure("Fx hasher", || count_fx(&text));
    let parallel = measure("Fx hasher, all cores", || count_parallel(&text));

    assert!(
        standard
            .iter()
            .all(|(word, count)| fx[word] == *count && parallel[word] == *count)
    );
    println!("all versions agree");
}
```
```output
standard hasher          39.1 ms
Fx hasher                23.6 ms
Fx hasher, all cores     19.2 ms
all versions agree
```

The simpler hash function saves 40 per cent. The second core saves only another fifth, far from the half that one might hope for. The text has to be cut into pieces, and the partial maps have to be merged at the end, and that work is extra. Parallel code pays best when each piece of work is large and its result is small.

### Not the iterators

Beginners often fear that the comfortable style of [chapter 30](#iterators), with its chains and closures, must be slower than a plain loop with an index. Measure it:

```rust run release nocmp
use std::hint::black_box;
use std::time::Instant;

/// With indices. `a[i]` and `b[i]` panic when `i` is too large.
fn dot_indexed(a: &[u32], b: &[u32]) -> u32 {
    let mut total = 0;
    for i in 0..a.len() {
        total += a[i] * b[i];
    }
    total
}

/// With iterators. `zip` stops at the end of the shorter slice.
fn dot_iterators(a: &[u32], b: &[u32]) -> u32 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}

/// Calls `work` 100,000 times and prints the time of one call.
fn time(name: &str, work: impl Fn() -> u32) {
    let start = Instant::now();
    let mut result = 0;
    for _ in 0..100_000 {
        result = black_box(work());
    }
    let nanoseconds = start.elapsed().as_secs_f64() * 1e9 / 100_000.0;
    println!("{name:<10} {nanoseconds:>5.0} ns per call, result {result}");
}

fn main() {
    let a: Vec<u32> = (0..4096).map(|n| n % 100).collect();
    let b: Vec<u32> = (0..4096).map(|n| n % 7).collect();

    time("indexed", || dot_indexed(black_box(&a), black_box(&b)));
    time("iterators", || dot_iterators(black_box(&a), black_box(&b)));
}
```
```output
indexed      731 ns per call, result 607475
iterators    733 ns per call, result 607475
```

Both take the same time: 0.18 nanoseconds for each pair of numbers. No processor multiplies and adds that fast one pair at a time, so the compiler must have turned both loops into machine code that handles several pairs in one step. The chain of `zip`, `map` and `sum` costs nothing. This is what people mean by a "zero-cost abstraction". The indexed version contains checks (`a[i]` panics when `i` is too large), and here they did not slow it down. Where such checks do cost time, an iterator is the cure, because it has no index to check.

The debug build tells a different story. There, the indexed loop needs 22,000 nanoseconds per call and the iterator version 45,000: thirty and sixty times slower than the release build. All the small functions of an iterator chain are really called, one after the other, until the optimiser melts them together. This is rule 1 again. Never judge a style of code by its debug build.

### The layout of the data

Processors are much faster with data that lies close together in memory. [Chapter 41](#memory-layout) measured it: summing one field took 14 ms in an array of large structs, and 3.5 ms when that field had an array of its own. The same effect decides between collections. Here are the times for adding up two million numbers:

| The numbers are stored in | Time |
|---|---|
| `Vec<u64>` | 0.6 ms |
| `Vec<Box<u64>>`, the boxes created one after the other | 3.0 ms |
| `LinkedList<u64>` | 3.1 ms |
| `Vec<Box<u64>>`, the boxes scattered over the heap | 11.1 ms |

In the first row the numbers lie side by side. In the others, the processor has to follow a pointer for every single number, and in the last row each pointer leads to a different corner of the memory. When in doubt, use a `Vec` of plain values.


### Smaller tools from the same box

A few more techniques come up in every discussion of fast Rust. Each of them matters in some programs and does nothing in most, so measure before and after.

- **Bounds checks.** `v[i]` checks on every access that `i` is inside the list. People often blame these checks, and they are rarely the cause. A test for this chapter added two slices into a third in three ways: with indices (three checks in every round), with indices after cutting all three slices to the same length first (`let a = &a[..n];`), and with `zip`. All three took about 260 nanoseconds for 4,096 numbers: the compiler had moved the checks out of the loop on its own. If a profile does show time in a check, an iterator or a slice taken before the loop removes it safely. `get_unchecked` needs `unsafe`, and it is the last thing to try.
- **Inlining.** Calling a very small function can cost more than the work inside it. The compiler copies small functions into their callers by itself (the debug numbers for iterators above show what happens when it does not). `#[inline]` on a function is a suggestion to do so, and `#[inline(never)]` and `#[cold]` mark code that should stay out of the fast path, such as error handling. Add them only when a profile points at one function, and measure: the result is sometimes slower.
- **Short lists without the heap.** A `Vec` always puts its elements on the heap. The crates `smallvec` and `arrayvec` keep a few elements inside the value itself and use the heap only when there are more. That helps where millions of very short lists are created, and costs elsewhere, because the type gets bigger.
- **Reading the machine code.** For a small, hot function, you can look at what the compiler made of it: paste it into the Compiler Explorer (godbolt.org), or run `cargo asm` from the crate `cargo-show-asm` in your project. You do not need to understand every instruction. A loop that became a handful of instructions with registers named `xmm`, `ymm` or `zmm` works on several numbers per step, and a `call` inside a hot loop means that something was not inlined.
- **Letting the compiler learn from a run.** With profile-guided optimisation, you build the program, run it on typical input while it records what happens, and build again with that record. The tool `cargo-pgo` does the steps. Large programs such as the Rust compiler itself are built this way.

## Settings of the compiler

[Chapter 32](#cargo) presented the settings of the release profile. Two of them, and one flag for the compiler, are meant to make code faster:

```toml file=Cargo.toml
[profile.release]
lto = true           # optimise across all crates together
codegen-units = 1    # optimise each crate as a whole. Slower to compile
```

```toml file=.cargo/config.toml
[build]
# use every instruction that this very processor has
rustflags = ["-C", "target-cpu=native"]
```

They cost a line each, so they are worth a try. Here is the word counter with them, measured by hyperfine with 30 runs each:

| Build | Time | Compared with the first |
|---|---|---|
| `cargo build --release` | 188.8 ms ± 10.7 ms | |
| with `lto` and `codegen-units = 1` | 192.6 ms ± 13.6 ms | +2.1 % |
| with `target-cpu=native` | 182.4 ms ± 8.8 ms | −3.4 % |
| with all three | 181.8 ms ± 8.8 ms | −3.7 % |

The differences are a few milliseconds, and single runs of one and the same program differ by ten. For this program, the settings change nothing that can be measured. (`lto` did make the program file smaller: 411 KB instead of 495 KB.) Other programs gain more, above all those that call many small functions across the borders of crates. The only way to know is to measure. One warning: a program built with `target-cpu=native` may not start at all on an older processor, so never build that way for other people.

A different allocator is a similar one-line experiment. With the crate `mimalloc` instead of `System`, the times of the word counter stayed the same.

Compare all of this with the changes to the code: twice as fast by removing allocations, and 170 times as fast with a better algorithm.

## Numbers you can trust

### Noise

Run the same program twice and you get two different times. Other programs, the temperature of the processor and the state of its caches all play a part. This variation is called **noise**. A difference between two versions means something only when it is clearly larger than the difference between two runs of the *same* version. That is what the `±` of hyperfine tells you, and why "3.4 % faster" in the table above is no result at all.

You have seen noise in this chapter already. The function `make_text` took 106.8 ms in the first listing and 104.3 ms in the second one, and nothing had changed.

The benchmark library **criterion** ([chapter 34](#testing-strategies)) does this reasoning for you. It remembers the last measurement of every benchmark. Here is its report for the counting function, after the change from `String` keys to `&str` keys:

```text nosoft
count 100k words        time:   [2.3309 ms 2.3681 ms 2.4165 ms]
                        change: [−42.793% −41.604% −40.297%] (p = 0.00 < 0.05)
                        Performance has improved.
```

The three numbers after `change` are the lower bound, the best estimate and the upper bound of the difference. The whole range lies far below zero, so the improvement is real. Then the benchmark was run once more, without touching the code:

```text nosoft
count 100k words        time:   [2.3789 ms 2.4383 ms 2.5037 ms]
                        change: [−0.2796% +2.9640% +5.8525%] (p = 0.07 > 0.05)
                        No change in performance detected.
```

The best estimate says "3 % slower", for identical code. But the range reaches from below zero to above zero, and criterion draws the right conclusion: this is the noise of the machine. A tool that knows about noise keeps you from celebrating a gain, or hunting a loss, that does not exist.

So this is what to do with the numbers of a benchmark: run `cargo bench`, change the code, run `cargo bench` again, and read the line `change`.

:::details The benchmark file
```rust file=benches/count.rs
use std::fmt::Write;
use std::hint::black_box;

use criterion::{Criterion, criterion_group, criterion_main};
use wordcount::count_words;

fn make_text(words: usize) -> String {
    let mut text = String::new();
    let mut state: u32 = 12345;
    for index in 0..words {
        state = state.wrapping_mul(1_103_515_245).wrapping_add(12345);
        if index > 0 {
            text.push(' ');
        }
        write!(text, "w{}", (state >> 8) % 5000).unwrap();
    }
    text
}

fn bench_count(c: &mut Criterion) {
    let text = make_text(100_000);
    c.bench_function("count 100k words", |b| {
        b.iter(|| count_words(black_box(&text)))
    });
}

criterion_group!(benches, bench_count);
criterion_main!(benches);
```

The setup in `Cargo.toml` is the one from [chapter 34](#testing-strategies). The benchmark uses 100,000 words instead of two million, because criterion calls the function many hundred times.
:::

### Work that disappears

The optimiser removes calculations whose result is known in advance or never used. Usually that is what you want. In a measurement it can fool you:

```rust run release nocmp
use std::hint::black_box;
use std::time::Instant;

fn sum_of_squares(limit: u64) -> u64 {
    (1..=limit).map(|n| n * n).sum()
}

fn main() {
    let start = Instant::now();
    let result = sum_of_squares(1_000_000);
    println!("plain:     {result} in {:?}", start.elapsed());

    let start = Instant::now();
    let result = sum_of_squares(black_box(1_000_000));
    println!("black_box: {result} in {:?}", start.elapsed());
}
```
```output
plain:     333333833333500000 in 86ns
black_box: 333333833333500000 in 71ns
```

A million multiplications and additions in 86 nanoseconds would be more than ten thousand operations per nanosecond. No processor can do that. The compiler has recognised the pattern and replaced the whole loop with a formula for the sum of squares, so no loop runs at all. `black_box` ([chapter 34](#testing-strategies)) hides the limit from the optimiser, and it does not help here, because the formula works for any limit. (The debug build of the same program needs 6 milliseconds.)

There is a second trap in these numbers. Reading the clock takes time too: a measurement with nothing at all between its start and its end shows 50 to 90 nanoseconds on the same machine. So the program above measured mostly its own clock. Never time anything that short with `Instant`. Let criterion repeat it a million times.

The program is honestly this fast, and nothing is wrong with it. But if the question was "how long does a loop of this kind take?", the measurement answered a different question. Be suspicious of a result that looks too good, and let the measured work depend on data that the compiler cannot know, such as the two million words above.

## When to stop

Optimised code is usually longer and harder to change than the first, simple version. Every step in this chapter added a constraint: a map that borrows from the text, a capacity that must be estimated, a second hash function to know about. So decide what "fast enough" means *before* you start: "the report appears within one second", "the server answers a thousand requests per second". Stop when the goal is reached. Time that you spend beyond it buys nothing that anybody will notice.

And if a measurement shows that only `unsafe` code can reach the goal, [chapter 39](#unsafe) applies: a small block, behind a safe function, with a comment that says why it is correct, and with the benchmark that justifies it.

:::compare Performance work in other languages
In Python or JavaScript, making code faster often means leaving the language: the hot loop moves into NumPy, into C, or into Rust. In Java, Go and C#, much of the effort goes into producing less garbage for the collector. That is the same hunt for allocations as in this chapter, with less control over the result. C and C++ offer the same toolbox as Rust: release builds, profilers, flame graphs. The difference is the risk. Restructuring C++ code for speed can introduce memory errors that show up months later. In Rust, the borrow checker reviews every such change. The map with `&str` keys in this chapter is an example: in C, such a map full of pointers into another buffer would be a classic source of bugs, and here the compiler guarantees that the text outlives the map.
:::

:::recap
- Do nothing until something is too slow. Then measure a release build, find where the time goes, and change one thing at a time.
- `hyperfine` compares whole programs. criterion compares functions and reports whether a change is real. A profiler draws a flame graph, in which the wide bars are the functions that take the time.
- The biggest gains come from a better algorithm. Then come needless allocations, files without a buffer, and the hash function.
- Borrow instead of cloning, write with `write!` into a `String` that exists, and wrap files in `BufReader` and `BufWriter`.
- Iterators are as fast as hand-written loops with an index, in a release build.
- Settings of the compiler are cheap to try and often bring little.
- Measuring tools cost time themselves. A difference smaller than the noise is not a result. A result that looks too good probably measured something else.
- Decide beforehand what is fast enough, and stop there.
:::

:::quiz Check your understanding
? A friend says: "My Rust program is slower than the same program in Python." What do you ask first?
- Which version of Python it was
- How many cores the machine has
- Whether the program uses `unsafe`
+ Whether the Rust program was built with `--release`
= A debug build is not optimised. In this chapter, the release build of the word counter was 4.3 times faster than the debug build, and the small loop over two slices was thirty times faster.

? A program reads a file, parses it, and writes a report. It is too slow. What is the best first step?
- Rewrite the parser, since parsing is usually the slow part
- Turn on `lto` and `codegen-units = 1`
+ Measure how long each of the three steps takes
- Replace every `String` with `&str`
= Without a measurement you may spend a day on a step that takes five per cent of the time. In the example of this chapter, the slowest step was not the one that the name of the program suggested.

? Why was counting with `HashMap<&str, u32>` twice as fast as with `HashMap<String, u32>`?
- `&str` keys are compared faster
+ The `String` version allocated a new `String` for each of the two million words
- The map with `&str` keys has fewer entries
- Borrowed keys get a faster hash function
= Both maps hold the same 5,000 keys, and they hash and compare the same bytes. The difference is two million allocations against twelve.

? In a flame graph, the bar of the function `parse` is very wide, and on top of it sits a bar `to_string` that is nearly as wide. What does that tell you?
- `parse` is called very often
- `to_string` calls `parse`
+ Most of the time of `parse` is spent in the calls to `to_string`
- `to_string` runs before `parse`
= The width of a bar includes the time of everything that the function calls, and a bar sits on top of its caller. So `parse` itself does little. To make it faster, look at why it calls `to_string`.

? Two builds of a program are measured with hyperfine: 188.8 ms ± 10.7 ms and 182.4 ms ± 8.8 ms. What can you conclude?
- The second build is 3.4 % faster
- The second build is better, because its `±` is smaller
- The measurement is broken
+ Nothing yet: the difference is smaller than the variation between runs
= Six milliseconds of difference mean little when single runs vary by ten. More runs on a quieter machine could settle it. Until then there is no result.

? A benchmark reports that a loop over one million elements takes 90 nanoseconds. What is the most likely explanation?
- The processor is very fast
- The loop ran on several cores
- The clock of the machine is wrong
+ The optimiser removed or replaced the loop, so the measurement did not measure it
= Ninety nanoseconds are a few hundred steps of the processor, far too few for a million rounds. A result that looks too good usually means that the work was optimised away.
:::

:::exercise guided Two numbers with a given sum
The function below answers this question: are there two numbers in the list, at different places, whose sum is `target`? It tries every pair. Write a second function that needs only one pass over the list. Check that both agree, and measure both with 30,000 numbers.

```rust
fn has_pair_slow(numbers: &[i64], target: i64) -> bool {
    for (index, first) in numbers.iter().enumerate() {
        for second in &numbers[index + 1..] {
            if first + second == target {
                return true;
            }
        }
    }
    false
}
```
::hint
For a number `n`, the partner that completes the sum is `target - n`. Walk through the list once, and keep the numbers that you have seen in a `HashSet`. For each number, ask the set whether its partner came earlier. For the measurement, use a list in which no pair exists, so that neither function can stop early.
::solution
```rust run release nocmp
use std::collections::HashSet;
use std::time::Instant;

/// Do two numbers at different places add up to `target`? Tries every pair.
fn has_pair_slow(numbers: &[i64], target: i64) -> bool {
    for (index, first) in numbers.iter().enumerate() {
        for second in &numbers[index + 1..] {
            if first + second == target {
                return true;
            }
        }
    }
    false
}

/// One pass: for each number, ask whether its partner was seen before.
fn has_pair_fast(numbers: &[i64], target: i64) -> bool {
    let mut seen = HashSet::new();
    for &number in numbers {
        if seen.contains(&(target - number)) {
            return true;
        }
        seen.insert(number);
    }
    false
}

fn main() {
    // Small cases first: both functions must agree
    let small = [3, 9, 14, 20, 27];
    for target in [12, 23, 41, 40, 6, 100] {
        assert_eq!(has_pair_slow(&small, target), has_pair_fast(&small, target));
    }
    assert!(has_pair_fast(&[5, 5], 10));
    assert!(!has_pair_fast(&[5], 10));

    // Even numbers only, and an odd target: no pair exists, the worst case
    let numbers: Vec<i64> = (0..30_000).map(|n| n * 2).collect();

    let start = Instant::now();
    let slow = has_pair_slow(&numbers, 30_001);
    println!(
        "every pair: {slow} in {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );

    let start = Instant::now();
    let fast = has_pair_fast(&numbers, 30_001);
    println!(
        "with a set: {fast} in {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
}
```
```output
every pair: false in  123.2 ms
with a set: false in    1.6 ms
```

With 30,000 numbers there are about 450 million pairs, and the first function looks at every one of them. The second function does 30,000 look-ups. The order inside its loop matters: the look-up comes *before* the insert. So a number is never paired with itself, but two equal numbers at different places are found, as the test with `[5, 5]` shows. The small cases at the start protect you from a fast function that is wrong.
:::

:::exercise practice A line without waste
This function joins numbers into one line such as `37,74,111`. For 1,000 numbers it allocates more than a thousand times. Write a version that allocates once, and prove it with the counting allocator from this chapter.

```rust
fn join_slow(numbers: &[u32]) -> String {
    let mut line = String::new();
    for (index, number) in numbers.iter().enumerate() {
        if index > 0 {
            line = line + ",";
        }
        line = line + &number.to_string();
    }
    line
}
```
::hint
Two things allocate here. `to_string()` makes a temporary `String` for every number, and `line` has to move to a larger buffer again and again. `write!(line, "{number}")` writes the digits straight into `line`. It needs `use std::fmt::Write;`. A `u32` has at most ten digits, so `String::with_capacity(numbers.len() * 11)` is always enough.
::solution
```rust run release
use std::alloc::{GlobalAlloc, Layout, System};
use std::fmt::Write;
use std::sync::atomic::{AtomicUsize, Ordering};

struct Counting;

static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

/// "1,2,3": the version from the exercise.
fn join_slow(numbers: &[u32]) -> String {
    let mut line = String::new();
    for (index, number) in numbers.iter().enumerate() {
        if index > 0 {
            line = line + ",";
        }
        line = line + &number.to_string();
    }
    line
}

/// One buffer, reserved once, and every number is written straight into it.
fn join_fast(numbers: &[u32]) -> String {
    // A u32 has at most 10 digits, plus one comma
    let mut line = String::with_capacity(numbers.len() * 11);
    for (index, number) in numbers.iter().enumerate() {
        if index > 0 {
            line.push(',');
        }
        write!(line, "{number}").unwrap();
    }
    line
}

fn allocations_of(work: impl FnOnce() -> String) -> (String, usize) {
    let before = ALLOCATIONS.load(Ordering::Relaxed);
    let result = work();
    (result, ALLOCATIONS.load(Ordering::Relaxed) - before)
}

fn main() {
    let numbers: Vec<u32> = (1..=1000).map(|n| n * 37).collect();

    let (slow, slow_allocations) = allocations_of(|| join_slow(&numbers));
    let (fast, fast_allocations) = allocations_of(|| join_fast(&numbers));

    assert_eq!(slow, fast);
    println!("the line starts with {}", &fast[..20]);
    println!("slow: {slow_allocations} allocations, fast: {fast_allocations}");
}
```
```output
the line starts with 37,74,111,148,185,22
slow: 1011 allocations, fast: 1
```

The slow version allocates once per number for `to_string()`, and eleven more times because the line outgrows its buffer: 8 bytes, then 16, then 32, up to 8,192. (`line + ","` itself does not allocate. The `+` of a `String` appends to its left side.) The fast version reserves more than it needs: 11,000 bytes for a line of 5,700. That is a good trade. And if the estimate were too small, the program would still be correct, because the `String` would simply grow.
:::

:::exercise challenge The third column
A text has 500,000 lines of the form `id,customer,amount,status`. The function below adds up the amounts. Find out what it does that is not needed, write a faster version, and measure both.

```rust
fn total_slow(table: &str) -> u64 {
    let mut total = 0;
    for line in table.lines() {
        let fields: Vec<String> = line.split(',').map(|field| field.to_string()).collect();
        total += fields[2].parse::<u64>().unwrap();
    }
    total
}
```
::hint
For every line, the function creates four `String`s and a `Vec`, uses one of them, and throws all five away. `split` is an iterator, and `nth(2)` takes its third item without storing the others. That item is a `&str` that points into the line, and `parse` is content with it.
::solution
```rust run release nocmp
use std::fmt::Write;
use std::time::Instant;

/// Adds up the third column. The version from the exercise.
fn total_slow(table: &str) -> u64 {
    let mut total = 0;
    for line in table.lines() {
        let fields: Vec<String> = line.split(',').map(|field| field.to_string()).collect();
        total += fields[2].parse::<u64>().unwrap();
    }
    total
}

/// Takes only the field that is needed, as a slice of the line.
fn total_fast(table: &str) -> u64 {
    table
        .lines()
        .map(|line| line.split(',').nth(2).unwrap().parse::<u64>().unwrap())
        .sum()
}

fn main() {
    let mut table = String::new();
    for id in 0..500_000u64 {
        writeln!(table, "{id},customer {},{},paid", id % 1000, id % 250).unwrap();
    }

    let start = Instant::now();
    let slow = total_slow(&table);
    println!(
        "with a Vec per line: {slow} in {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );

    let start = Instant::now();
    let fast = total_fast(&table);
    println!(
        "with nth(2):         {fast} in {:>6.1} ms",
        start.elapsed().as_secs_f64() * 1000.0
    );
}
```
```output
with a Vec per line: 62250000 in   38.1 ms
with nth(2):         62250000 in   13.4 ms
```

Nearly three times as fast, with shorter code. The slow version allocated five times per line, 2.5 million times in total, and the fast one never. `nth(2)` also stops splitting after the third field, so the rest of each line is not even looked at. What remains is the real work: finding the commas and parsing the numbers. In a real program, both `unwrap`s would become proper errors ([chapter 23](#errors)), and that would not make it slower.
:::
