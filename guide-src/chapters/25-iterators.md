@id iterators
@part p3
@title Iterators: processing data step by step
@short Iterators
@level intermediate
@time 60
@learn Explain what an iterator is and how `for` uses it | Build processing pipelines with `map`, `filter` and other adapters | Finish a pipeline with `collect`, `sum`, `fold`, `find` and friends | Understand laziness and why iterator chains are as fast as loops | Write your own iterator

Many tasks process a collection one element at a time: filter values, transform them, add them up or find a match. A `for` loop is one clear way to do this. Rust's **iterators** offer another way to compose those steps, often without a temporary collection; the compiler can optimise many iterator chains, but performance should be measured for the workload that matters.

Here is the same task in both styles. Add up the squares of all even numbers in a list:

```rust run
fn main() {
    let numbers = [1, 2, 3, 4, 5, 6];

    // With a loop
    let mut total = 0;
    for n in numbers {
        if n % 2 == 0 {
            total += n * n;
        }
    }
    println!("{total}");

    // With an iterator chain
    let total: i32 = numbers.iter().filter(|n| *n % 2 == 0).map(|n| n * n).sum();
    println!("{total}");
}
```
```output
56
56
```

The second version reads like a description of the result: take the numbers, keep the even ones, square each, sum them. There is no variable that changes, no index, and nothing to get off by one.

:::plain Iterators and laziness in one paragraph
An **iterator** produces a sequence of values one at a time through `next()`, and everything else in the chapter is built on that one method. **Adapters** such as `map`, `filter` and `take` are lazy: they build a new iterator and do no work until something consumes it. A **consumer** such as `collect`, `sum` or `for_each` drives the chain to the end. Because the whole pipeline compiles into one loop over the source, an iterator chain is as fast as hand-written indexing — usually faster, since the compiler can drop bounds checks it has already proven unnecessary.
:::

:::analogy An assembly line
Items travel along a conveyor belt past a row of stations. One station throws out the damaged items. The next one paints each item. At the end, a worker packs them into a box. Each station does one small job on one item at a time. An iterator chain is such an assembly line for data.
:::

## What an iterator is

An **[[iterator]]** is a value that hands out a sequence of items, one at a time. The whole idea is one trait with one required method:

```rust
trait Iterator {
    type Item;                              // the type of the items
    fn next(&mut self) -> Option<Self::Item>;
}
```

Each call to `next` returns `Some(item)`, or `None` when nothing is left. You can call it by hand:

```rust run
fn main() {
    let colours = vec!["red", "green", "blue"];
    let mut iter = colours.iter();

    println!("{:?}", iter.next());
    println!("{:?}", iter.next());
    println!("{:?}", iter.next());
    println!("{:?}", iter.next());
}
```
```output
Some("red")
Some("green")
Some("blue")
None
```

A `for` loop does exactly this for you. `for colour in &colours { ... }` creates an iterator, calls `next` until it gets `None`, and runs the body for every item.

### Three ways to iterate over a collection

| Method | Items | The collection afterwards | The `for` shorthand |
|---|---|---|---|
| `.iter()` | `&T`, shared references | untouched | `for x in &v` |
| `.iter_mut()` | `&mut T`, mutable references | still there, maybe changed | `for x in &mut v` |
| `.into_iter()` | `T`, the values themselves | used up | `for x in v` |

```rust run
fn main() {
    let mut names = vec![String::from("sara"), String::from("tomas")];

    for name in names.iter_mut() {
        name.push('!');                                   // change in place
    }
    let lengths: Vec<usize> = names.iter().map(|n| n.len()).collect();   // only look
    let shouting: Vec<String> = names.into_iter().map(|n| n.to_uppercase()).collect(); // use up

    println!("{:?} {:?}", lengths, shouting);
}
```
```output
[5, 6] ["SARA!", "TOMAS!"]
```

## The three parts of a pipeline

Every iterator chain has the same shape:

1. A **source** creates the iterator: `v.iter()`, `1..=10`, `text.chars()`, `text.lines()`, `map.keys()`.
2. Zero or more **adapters** each turn the iterator into another iterator: `filter`, `map`, `take`, …
3. One **consumer** at the end drives the whole thing and produces a result: `collect`, `sum`, `count`, `find`, or a `for` loop.

## Adapters: reshaping the stream

### `map` and `filter`

`map` changes every item. `filter` keeps the items for which its closure returns `true`.

```rust run
fn main() {
    let prices = [120, 45, 300, 80];

    let half_price: Vec<f64> = prices.iter().map(|p| *p as f64 / 2.0).collect();
    let expensive: Vec<&i32> = prices.iter().filter(|p| **p > 100).collect();

    println!("{:?}", half_price);
    println!("{:?}", expensive);
}
```
```output
[60.0, 22.5, 150.0, 40.0]
[120, 300]
```

:::warn The stars in `filter`
`prices.iter()` yields `&i32`. `map` hands each item to its closure as it is, so `p` is a `&i32`. `filter` only *lends* each item to its closure, so there `p` is a `&&i32`, a reference to a reference, and comparing it with a number needs `**p`. Three ways to keep this tidy:

- take the reference apart in the pattern: `.filter(|&&p| p > 100)`,
- or turn the items into plain values first: `prices.iter().copied().filter(|p| *p > 100)`,
- or iterate over values from the start: `prices.into_iter()`.
:::

### More adapters

```rust run
fn main() {
    let letters = ['a', 'b', 'c', 'd', 'e'];

    // enumerate: add a counter
    for (i, letter) in letters.iter().enumerate() {
        print!("{i}{letter} ");
    }
    println!();

    // take, skip, step_by, rev
    let first_two: Vec<_> = letters.iter().take(2).collect();
    let without_first: Vec<_> = letters.iter().skip(1).collect();
    let every_second: Vec<_> = letters.iter().step_by(2).collect();
    let backwards: String = letters.iter().rev().collect();
    println!("{:?} {:?} {:?} {}", first_two, without_first, every_second, backwards);

    // zip: walk two sequences side by side
    let names = ["Sara", "Tomas", "Lena"];
    let ages = [29, 41, 35];
    for (name, age) in names.iter().zip(ages.iter()) {
        print!("{name}={age} ");
    }
    println!();

    // chain: one sequence after another
    let all: Vec<i32> = (1..=3).chain(10..=12).collect();
    println!("{:?}", all);

    // take_while / skip_while: stop or start at the first item that fails the test
    let leading: Vec<i32> = [2, 4, 7, 8].into_iter().take_while(|n| n % 2 == 0).collect();
    println!("{:?}", leading);
}
```
```output
0a 1b 2c 3d 4e
['a', 'b'] ['b', 'c', 'd', 'e'] ['a', 'c', 'e'] edcba
Sara=29 Tomas=41 Lena=35
[1, 2, 3, 10, 11, 12]
[2, 4]
```

### Adapters that change the number of items

```rust run
fn main() {
    let inputs = ["4", "x", "15", "", "23"];

    // filter_map: transform and filter in one step. Keep the `Some` results
    let numbers: Vec<i32> = inputs.iter().filter_map(|s| s.parse().ok()).collect();
    println!("{:?}", numbers);

    // flat_map: each item produces several items
    let sentences = ["the quick fox", "jumps over"];
    let words: Vec<&str> = sentences.iter().flat_map(|s| s.split(' ')).collect();
    println!("{:?}", words);

    // flatten: remove one level of nesting
    let nested = vec![vec![1, 2], vec![], vec![3]];
    let flat: Vec<i32> = nested.into_iter().flatten().collect();
    println!("{:?}", flat);
}
```
```output
[4, 15, 23]
["the", "quick", "fox", "jumps", "over"]
[1, 2, 3]
```

`s.parse().ok()` turns the `Result` into an `Option`: `Some(number)` or `None`. `filter_map` keeps what is inside the `Some`s and drops the rest. "Parse what can be parsed, skip the rest" is one line.

## Consumers: getting a result

### Numbers out of a sequence

```rust run
fn main() {
    let scores = [72, 95, 58, 88];

    let total: i32 = scores.iter().sum();
    let product: i64 = [1_i64, 2, 3, 4].iter().product();
    let count = scores.iter().filter(|s| **s >= 70).count();
    let best = scores.iter().max();
    let worst = scores.iter().min();
    let average = total as f64 / scores.len() as f64;

    println!("{total} {product} {count} {:?} {:?} {average}", best, worst);
}
```
```output
313 24 3 Some(95) Some(58) 78.25
```

`max` and `min` return an `Option`, because an empty sequence has no largest element. For `sum` and `product` you must state the result type, as in `let total: i32`.

To find the largest item *by some property*, use `max_by_key` and `min_by_key`:

```rust run
fn main() {
    let words = ["pear", "watermelon", "fig"];
    println!("{:?}", words.iter().max_by_key(|w| w.len()));
    println!("{:?}", words.iter().min_by_key(|w| w.len()));
}
```
```output
Some("watermelon")
Some("fig")
```

### Questions about a sequence

```rust run
fn main() {
    let ages = [34, 17, 52, 8];

    println!("{}", ages.iter().any(|a| *a < 18));          // is at least one a minor?
    println!("{}", ages.iter().all(|a| *a < 100));         // are all below 100?
    println!("{:?}", ages.iter().find(|a| **a > 40));      // the first one over 40
    println!("{:?}", ages.iter().position(|a| *a == 17));  // where is 17?
    println!("{:?} {:?}", ages.iter().last(), ages.iter().nth(1));
}
```
```output
true
true
Some(52)
Some(1)
Some(8) Some(17)
```

`any`, `all`, `find` and `position` stop as soon as the answer is known. They do not look at the remaining items.

### `collect`: build a collection

`collect` gathers the items into a collection. It can build many kinds, so you tell it which one you want, by a type annotation or with the turbofish:

```rust run
use std::collections::{BTreeMap, HashSet};

fn main() {
    let words = ["apple", "bob", "apple", "cat"];

    let list: Vec<&str> = words.iter().copied().collect();
    let unique: HashSet<&str> = words.iter().copied().collect();
    let lengths: BTreeMap<&str, usize> = words.iter().map(|w| (*w, w.len())).collect();
    let initials: String = words.iter().filter_map(|w| w.chars().next()).collect();
    let joined = words.join(", ");

    println!("{} {} {:?} {initials} | {joined}", list.len(), unique.len(), lengths);
}
```
```output
4 3 {"apple": 5, "bob": 3, "cat": 3} abac | apple, bob, apple, cat
```

An iterator of pairs collects into a map. An iterator of characters or string slices collects into a `String`.

A particularly useful case: an iterator of `Result`s can be collected into **one** `Result` that holds a collection. It is `Ok` with all the values if every item was `Ok`, and otherwise it is the first error.

```rust run
fn parse_all(inputs: &[&str]) -> Result<Vec<i32>, std::num::ParseIntError> {
    inputs.iter().map(|s| s.parse::<i32>()).collect()
}

fn main() {
    println!("{:?}", parse_all(&["1", "2", "3"]));
    println!("{:?}", parse_all(&["1", "two", "3"]).is_err());
}
```
```output
Ok([1, 2, 3])
true
```

Compare this with `filter_map` above. `filter_map(|s| s.parse().ok())` silently skips bad input. Collecting into a `Result` refuses the whole batch. Which one is right depends on the task. The same works with `Option`.


There is a third answer to bad input: keep both piles. **`partition`** builds two collections in one pass, by a yes-or-no question. Its relatives are **`unzip`**, which turns a sequence of pairs into two collections, and **`find_map`**, which returns the first item for which the closure gives `Some`:

```rust run
fn main() {
    let inputs = ["12", "x", "7", "", "30"];

    let (numbers, rejected): (Vec<&str>, Vec<&str>) =
        inputs.iter().copied().partition(|s| s.parse::<i32>().is_ok());
    println!("{:?} {:?}", numbers, rejected);

    let (words, lengths): (Vec<&str>, Vec<usize>) =
        ["apple", "fig"].iter().map(|w| (*w, w.len())).unzip();
    println!("{:?} {:?}", words, lengths);

    let first_number = inputs.iter().find_map(|s| s.parse::<i32>().ok());
    println!("{:?}", first_number);
}
```
```output auto
```

### `fold`: the general tool

`fold` reduces a sequence to one value. It takes a starting value and a closure that combines the result so far with the next item. `sum`, `count`, `max` and many others can be written with it:

```rust run
fn main() {
    let numbers = [1, 2, 3, 4];

    let sum = numbers.iter().fold(0, |total, n| total + n);
    let text = numbers.iter().fold(String::new(), |mut acc, n| {
        if !acc.is_empty() {
            acc.push('-');
        }
        acc.push_str(&n.to_string());
        acc
    });

    println!("{sum} {text}");
}
```
```output
10 1-2-3-4
```

Read `fold(0, |total, n| total + n)` as: start with 0, and for every item replace the total with `total + n`. Use `fold` when no ready-made consumer fits.

`for_each` runs a closure for every item. It is a `for` loop written at the end of a chain: `names.iter().for_each(|n| println!("{n}"));`. For anything longer than one short call, a normal `for` loop is clearer.

## Iterators are lazy

Adapters do nothing by themselves. They only build a description of the work. The work happens when a consumer asks for items:

```rust warns
fn main() {
    let numbers = [1, 2, 3];
    numbers.iter().map(|n| {
        println!("{n}");
        n * 2
    });
}
```
```error auto
```

This program prints nothing, and the compiler says why. `map` was never asked for an item, so its closure never ran.

Laziness also means that items travel through the whole chain **one at a time**. No intermediate lists are created. `inspect` lets you watch it happen:

```rust run
fn main() {
    let result: Vec<i32> = [1, 2, 3, 4, 5, 6]
        .into_iter()
        .inspect(|n| println!("start  {n}"))
        .filter(|n| n % 2 == 0)
        .inspect(|n| println!("  kept {n}"))
        .map(|n| n * 10)
        .take(2)
        .collect();
    println!("{:?}", result);
}
```
```output
start  1
start  2
  kept 2
start  3
start  4
  kept 4
[20, 40]
```

Follow the order. Item 1 goes in and is thrown out by `filter`. Item 2 goes all the way through. After the second kept item, `take(2)` is satisfied, and the items 5 and 6 are never looked at.

Because of laziness, an iterator may even be endless, as long as something downstream stops:

```rust run
fn main() {
    let squares: Vec<u64> = (1..).map(|n| n * n).take(5).collect();
    println!("{:?}", squares);

    let first_big = (1_u64..).map(|n| n * n).find(|sq| *sq > 1000);
    println!("{:?}", first_big);

    let powers: Vec<u32> = std::iter::successors(Some(1), |n| Some(n * 2)).take(8).collect();
    println!("{:?}", powers);
}
```
```output
[1, 4, 9, 16, 25]
Some(1024)
[1, 2, 4, 8, 16, 32, 64, 128]
```

`(1..)` counts upwards without end. `successors` builds a sequence in which each item is calculated from the one before.

## As fast as a loop

You might expect that all these closures and adapters cost time. They do not. The compiler knows the exact types of the whole chain, merges the closures into one piece of code, and produces the same machine code as a hand-written loop. Iterators are one of Rust's **zero-cost abstractions**. Sometimes a chain is even faster than an indexed loop, because `v[i]` checks on every access that `i` is in range, and an iterator does not need that check.

So choose between a loop and a chain by which one is easier to read. A good rule: a chain for "turn this collection into that result", and a `for` loop when the body has side effects (printing, writing files) or complicated control flow.

## Writing your own iterator

To make a type an iterator, implement `Iterator` for it: say what the items are, and write `next`.

```rust run
struct Countdown {
    remaining: u32,
}

impl Iterator for Countdown {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        if self.remaining == 0 {
            None
        } else {
            self.remaining -= 1;
            Some(self.remaining + 1)
        }
    }
}

fn main() {
    for n in (Countdown { remaining: 3 }) {
        print!("{n} ");
    }
    println!("lift-off!");

    // every adapter and consumer now works on it
    let even_sum: u32 = Countdown { remaining: 10 }.filter(|n| n % 2 == 0).sum();
    let labels: Vec<String> = Countdown { remaining: 3 }.map(|n| format!("T-{n}")).collect();
    println!("{even_sum} {:?}", labels);
}
```
```output
3 2 1 lift-off!
30 ["T-3", "T-2", "T-1"]
```

`type Item = u32;` is an **[[associated type]]**: a type that belongs to the trait implementation. It says what this iterator yields. You wrote one method, and received `filter`, `map`, `sum`, `collect` and some seventy more for free, because they are default methods of the trait that build on `next`.

For a quick one-off iterator, `std::iter::from_fn` turns a closure into an iterator without a new struct:

```rust run
fn main() {
    let (mut a, mut b) = (0_u64, 1_u64);
    let fibonacci = std::iter::from_fn(move || {
        let current = a;
        (a, b) = (b, a + b);
        Some(current)
    });
    let first: Vec<u64> = fibonacci.take(10).collect();
    println!("{:?}", first);
}
```
```output
[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
```

To make your own collection usable in a `for` loop, implement the trait `IntoIterator` for it. That is what `Vec` does, and why `for x in &v` works.

## More tools for slices and text

Slices and strings offer iterators for common ways of cutting data into pieces:

```rust run
fn main() {
    let data = [1, 2, 3, 4, 5, 6, 7];

    for pair in data.windows(2) {            // overlapping neighbours
        print!("{:?} ", pair);
    }
    println!();
    for group in data.chunks(3) {            // pieces of three, the last may be shorter
        print!("{:?} ", group);
    }
    println!();

    let rising = data.windows(2).all(|w| w[0] < w[1]);
    println!("always rising: {rising}");

    let text = "name=Sara;age=29";
    let pairs: Vec<(&str, &str)> = text.split(';').filter_map(|p| p.split_once('=')).collect();
    println!("{:?}", pairs);
}
```
```output
[1, 2] [2, 3] [3, 4] [4, 5] [5, 6] [6, 7]
[1, 2, 3] [4, 5, 6] [7]
always rising: true
[("name", "Sara"), ("age", "29")]
```

## A map of the most used methods

| I want to … | Use |
|---|---|
| change every item | `map` |
| keep some items | `filter` |
| change and keep in one step | `filter_map` |
| number the items | `enumerate` |
| take the first *n*, or skip them | `take(n)`, `skip(n)` |
| walk two sequences together | `zip` |
| join two sequences | `chain` |
| go backwards | `rev` |
| turn each item into several | `flat_map`, `flatten` |
| build a collection | `collect` |
| build two collections at once | `partition`, `unzip` |
| add up or multiply | `sum`, `product` |
| count | `count` |
| find the largest or smallest | `max`, `min`, `max_by_key`, `min_by_key` |
| find the first that fits | `find`, `position`, `find_map` |
| ask yes or no | `any`, `all` |
| combine into one value | `fold`, `reduce` |
| look at the next item without taking it | `peekable()` and then `peek()` |

The crate **`itertools`** adds many more, such as `sorted`, `group_by`, `join`, `unique` and `tuple_windows`. You will meet it in [chapter 77](#crates).

:::compare Iterators in other languages
- **Python** has the same idea in generators and comprehensions: `sum(n*n for n in numbers if n % 2 == 0)`. They are lazy too, but each step costs interpreter time.
- **JavaScript** array methods (`numbers.filter(...).map(...)`) are **eager**: each step builds a complete new array before the next step begins.
- **Java** streams and **C#** LINQ are lazy pipelines like Rust's, with some run-time overhead for the objects involved.
- **C++** has had iterators for decades, and "ranges" with the pipeline style since C++20.

Rust's version combines the pleasant pipeline style with the speed of a hand-written loop, and the borrow checker makes sure that the collection is not changed while you iterate over it. In Java, that mistake is the `ConcurrentModificationException`. In C++, it is undefined behaviour.
:::

:::recap
- An iterator yields items one at a time through `next`, which returns `Some(item)` or `None`.
- `iter()` borrows, `iter_mut()` borrows mutably, `into_iter()` takes ownership.
- A pipeline is a source, some adapters (`map`, `filter`, `enumerate`, `zip`, `take`, …) and one consumer (`collect`, `sum`, `count`, `find`, `fold`, …).
- Adapters are lazy: nothing happens until a consumer pulls items through, one at a time.
- `collect` builds any collection, and can turn many `Result`s into one.
- Iterator chains compile to the same code as loops.
- Implement `Iterator` (just `next`) to get all the adapters for your own type.
:::

:::quiz Check your understanding
? What does this line print?
```rust
[1, 2, 3].iter().map(|n| println!("{n}"));
```
- `1 2 3` on separate lines
- `3 2 1`
+ Nothing. `map` is lazy, and no consumer asks for items
- An error message at run time
= Adapters only describe work. Without a consumer such as `collect`, `count` or a `for` loop, no item is ever produced. The compiler warns about the unused iterator.

? Which call gives ownership of the elements of a `Vec<String>`?
- `v.iter()`
- `v.iter_mut()`
+ `v.into_iter()`
- `v.len()`
= `into_iter` consumes the vector and yields each `String` by value. `iter` yields `&String` and `iter_mut` yields `&mut String`.

? What is the result of `(1..=4).filter(|n| n % 2 == 0).map(|n| n * 10).collect::<Vec<i32>>()`?
- `[10, 20, 30, 40]`
+ `[20, 40]`
- `[2, 4]`
- `[10, 30]`
= `filter` keeps 2 and 4. `map` multiplies each by 10.

? What does collecting an iterator of `Result<i32, E>` into `Result<Vec<i32>, E>` do when one item is an `Err`?
- It skips that item
- It panics
+ The whole result is that `Err`
- It puts 0 in its place
= Collecting into a `Result` succeeds only if every item is `Ok`. Otherwise it stops and returns the first error.

? You implement `Iterator` for your own struct. Which method must you write?
- `map`
- `collect`
- `iter`
+ `next`
= `next` is the only required method. All adapters and consumers are default methods built on it.
:::

:::exercise guided Clean up a list of names
Given `["  sara ", "TOMAS", "", " lena", "  "]`, produce a `Vec<String>` of the non-empty names, trimmed and with the first letter in upper case and the rest in lower case: `["Sara", "Tomas", "Lena"]`. Use one iterator chain.
::hint
The chain is: `.iter()`, then `.map(|s| s.trim())`, then `.filter(|s| !s.is_empty())`, then a `.map` that builds the capitalised `String`, then `.collect()`. Write a small helper function `capitalise(word: &str) -> String` for the last step.
::solution
```rust run
fn capitalise(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
        None => String::new(),
    }
}

fn main() {
    let raw = ["  sara ", "TOMAS", "", " lena", "  "];
    let names: Vec<String> = raw
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(capitalise)
        .collect();
    println!("{:?}", names);
}
```
```output
["Sara", "Tomas", "Lena"]
```

Each step of the chain does one thing, and the order matters: trimming must come before the emptiness test, or `"  "` would slip through. `capitalise` takes the first character with `chars.next()`, and `chars.as_str()` gives the rest of the text. The helper is passed to `map` by name.
:::

:::exercise practice Statistics in three lines
Rewrite the `stats` function from [chapter 20](#collections) with iterators. It takes `&[i32]` and returns `Option<(i32, i32, f64)>`: the smallest value, the largest value and the average, or `None` for an empty slice.
::hint
`numbers.iter().min()` returns `Option<&i32>`. Use `?` to leave the function with `None` when the slice is empty, and `*` to get the number. The sum needs a type: `numbers.iter().sum::<i32>()`.
::solution
```rust run
fn stats(numbers: &[i32]) -> Option<(i32, i32, f64)> {
    let min = *numbers.iter().min()?;
    let max = *numbers.iter().max()?;
    let average = numbers.iter().sum::<i32>() as f64 / numbers.len() as f64;
    Some((min, max, average))
}

fn main() {
    println!("{:?}", stats(&[4, 8, 15, 16, 23, 42]));
    println!("{:?}", stats(&[]));
}
```
```output
Some((4, 42, 18.0))
None
```

The fifteen lines with three `mut` variables have become three lines with none. `min()` returns `None` for an empty slice, and `?` passes that on as the function's result, so the division by zero can never be reached.
:::

:::exercise practice Word lengths
For the text `"the quick brown fox jumps over the lazy dog"`, build a `BTreeMap<usize, Vec<&str>>` that groups the words by their length, and print it. Then find the longest word with one iterator call.
::hint
Loop over `text.split_whitespace()` and use `map.entry(word.len()).or_default().push(word)`. For the longest word, `max_by_key(|w| w.len())`.
::solution
```rust run
use std::collections::BTreeMap;

fn main() {
    let text = "the quick brown fox jumps over the lazy dog";

    let mut by_length: BTreeMap<usize, Vec<&str>> = BTreeMap::new();
    for word in text.split_whitespace() {
        by_length.entry(word.len()).or_default().push(word);
    }
    for (length, words) in &by_length {
        println!("{length}: {}", words.join(" "));
    }

    let longest = text.split_whitespace().max_by_key(|w| w.len());
    println!("{:?}", longest);
}
```
```output
3: the fox the dog
4: over lazy
5: quick brown jumps
Some("jumps")
```

The grouping uses a `for` loop, because filling a map of lists is a side effect and reads more clearly that way. Finding the longest word is a pure question about the data, so a single consumer fits. When several items share the largest key, `max_by_key` returns the last of them, which is why the answer is "jumps" and not "quick".
:::

:::exercise challenge A Fibonacci iterator
Write a struct `Fibonacci` that implements `Iterator<Item = u64>` and yields 0, 1, 1, 2, 3, 5, 8, … Use it to compute (a) the first 10 numbers, (b) the sum of all even Fibonacci numbers below 4 million, and (c) the first Fibonacci number with more than 10 digits.
::hint
The struct holds the current and the next number. In `next`, remember the current value, then update both fields: the new current is the old next, and the new next is the sum. Always return `Some`, because the sequence never ends. For (b), `take_while(|n| *n < 4_000_000)` cuts the endless stream.
::solution
```rust run
struct Fibonacci {
    current: u64,
    next: u64,
}

impl Fibonacci {
    fn new() -> Self {
        Fibonacci { current: 0, next: 1 }
    }
}

impl Iterator for Fibonacci {
    type Item = u64;

    fn next(&mut self) -> Option<u64> {
        let value = self.current;
        self.current = self.next;
        self.next += value;
        Some(value)
    }
}

fn main() {
    let first: Vec<u64> = Fibonacci::new().take(10).collect();
    println!("{:?}", first);

    let even_sum: u64 = Fibonacci::new()
        .take_while(|n| *n < 4_000_000)
        .filter(|n| n % 2 == 0)
        .sum();
    println!("{even_sum}");

    let big = Fibonacci::new().find(|n| *n >= 10_000_000_000);
    println!("{:?}", big);
}
```
```output
[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
4613732
Some(12586269025)
```

The iterator is endless, and that is fine, because every use contains something that stops it: `take`, `take_while` or `find`. The struct holds only two numbers, however far you go. Each of the three questions is answered by combining the same small building blocks in a different way, which is the main strength of iterators.

One limit: a `u64` overflows at the 94th Fibonacci number, and the program would panic there in a debug build. A careful version uses `checked_add` and returns `None` when the numbers no longer fit.
:::
