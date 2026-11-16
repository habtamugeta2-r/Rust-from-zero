@id collections
@part p3
@title Collections: lists, maps and sets
@short Collections
@level beginner
@time 50
@learn Store any number of values in a `Vec` and work with them safely | Look things up by a key with `HashMap` | Keep unique values in a `HashSet` | Choose the right collection for a task | Handle ownership of the values inside a collection

An array has a fixed length, while many tasks need a set of values that grows or shrinks as the program runs. Rust's standard library offers several **collections** for those jobs. A `Vec` stores an ordered sequence, a `HashMap` looks up values by key, and a `HashSet` tracks unique values. Their operations and trade-offs differ, so the right choice depends on how you use the data.

:::plain The three collections in one paragraph
A **`Vec<T>`** is a growable array of same-typed values stored contiguously, so indexing is fast and the data is cache-friendly. A **`HashMap<K, V>`** looks values up by key in roughly constant time, at the cost of unordered iteration. A **`BTreeMap<K, V>`** keeps its keys sorted, so iteration is ordered and range queries are cheap, at a small constant factor in speed. Choosing between them is a question about iteration order and access pattern, not about which one is "better".
:::

## `Vec`: a list that grows

A `Vec<T>` (say "vector") is a growable list of values that all have the same type `T`. It is by far the most used collection in Rust.

```rust run
fn main() {
    let mut scores: Vec<i32> = Vec::new();   // an empty vector
    scores.push(70);                         // add at the end
    scores.push(95);
    scores.push(82);

    let mut names = vec!["Sara", "Tomas"];   // a vector with starting values
    names.push("Lena");

    println!("{:?} has {} elements", scores, scores.len());
    println!("{:?}", names);

    let last = scores.pop();                 // remove and return the last element
    println!("{:?} was removed, {:?} is left", last, scores);
    println!("Empty? {}", scores.is_empty());
}
```
```output
[70, 95, 82] has 3 elements
["Sara", "Tomas", "Lena"]
Some(82) was removed, [70, 95] is left
Empty? false
```

`Vec::new()` creates an empty vector. The macro `vec![...]` creates one with values in it. `pop` returns an `Option`, because the vector might be empty.

### Reading elements

```rust run
fn main() {
    let colours = vec!["red", "green", "blue"];

    let first = colours[0];              // by index: panics if the index is too big
    println!("{first}");

    match colours.get(7) {               // with get: gives an Option
        Some(colour) => println!("{colour}"),
        None => println!("There is no element 7."),
    }

    println!("{:?} {:?}", colours.first(), colours.last());
    println!("{}", colours.contains(&"green"));
}
```
```output
red
There is no element 7.
Some("red") Some("blue")
true
```

Use `v[i]` when an index that is out of range would be a bug in your program. Use `v.get(i)` when it is a normal situation that you want to handle, for example when the index comes from the user.

### Going through all elements

There are three ways to loop over a vector, and they correspond to the three ways of using a value that you know from ownership:

```rust run
fn main() {
    let mut prices = vec![10, 20, 30];

    for p in &prices {             // borrow: read each element
        print!("{p} ");
    }
    println!();

    for p in &mut prices {         // borrow mutably: change each element
        *p += 1;
    }
    println!("{:?}", prices);

    for p in prices {              // take ownership: the vector is used up
        print!("{p} ");
    }
    println!();
    // `prices` can no longer be used here
}
```
```output
10 20 30
[11, 21, 31]
11 21 31
```

| Loop | Each item is | The vector afterwards |
|---|---|---|
| `for x in &v` | `&T`, a shared reference | still usable |
| `for x in &mut v` | `&mut T`, change it with `*x = ...` | still usable, maybe changed |
| `for x in v` | `T`, the element itself | moved, no longer usable |

Most of the time you want the first one.

### Changing a vector

```rust run
fn main() {
    let mut v = vec![5, 3, 8];

    v.insert(1, 99);             // put 99 at index 1, shifting the rest
    println!("{:?}", v);

    let removed = v.remove(0);   // take out the element at index 0
    println!("{removed} {:?}", v);

    v.extend([3, 3, 1]);         // add several elements
    v.sort();                    // sort from small to large
    println!("{:?}", v);

    v.dedup();                   // remove repeats that are next to each other
    v.reverse();
    println!("{:?}", v);

    v.retain(|x| *x > 2);        // keep only the elements for which this is true
    println!("{:?}", v);

    let total: i32 = v.iter().sum();
    println!("sum {total}, largest {:?}", v.iter().max());

    v.clear();
    println!("{:?}", v);
}
```
```output
[5, 99, 3, 8]
5 [99, 3, 8]
[1, 3, 3, 3, 8, 99]
[99, 8, 3, 1]
[99, 8, 3]
sum 110, largest Some(99)
[]
```

`insert` and `remove` in the middle must shift all later elements by one place, so they get slow on very long vectors. `push` and `pop` at the end are always fast.

Everything you learned about slices in [chapter 16](#slices-strings) applies: `&v` turns into a slice `&[T]` automatically, so a function that takes `&[i32]` accepts a vector, and `&v[1..3]` borrows a part of it.

### How a vector grows

A vector keeps its elements in one block of heap memory. It usually reserves a little more room than it needs. The number of elements is its **length**, and the room it has reserved is its **capacity**.

```rust run
fn main() {
    let mut v = Vec::new();
    for i in 1..=9 {
        v.push(i);
        println!("length {}, capacity {}", v.len(), v.capacity());
    }
}
```
```output auto
```

When the block is full, the vector asks for a bigger block (usually twice the size), moves all elements there, and frees the old one. That is the moment that made the borrow checker reject `numbers.push(4)` while a reference to an element existed, in [chapter 15](#borrowing). Because the size doubles each time, moving happens rarely, and `push` is fast on average. If you know roughly how many elements are coming, `Vec::with_capacity(n)` reserves the room at once.

### Ownership of the elements

A vector owns its elements. When the vector is dropped, all its elements are dropped. With `Copy` types such as numbers you will hardly notice. With `String`s and other owned values you will:

```rust fail E0507
fn main() {
    let names = vec![String::from("Sara"), String::from("Tomas")];
    let first = names[0];
    println!("{first}");
}
```
```error auto
```

Taking the `String` out by index would leave a hole in the vector, so Rust refuses. You have several choices, and the right one depends on what you want:

```rust run
fn main() {
    let mut names = vec![
        String::from("Sara"),
        String::from("Tomas"),
        String::from("Lena"),
    ];

    let borrowed = &names[0];             // 1. look at it
    println!("{borrowed}");

    let copy = names[0].clone();          // 2. make a copy
    println!("{copy}");

    let taken = names.remove(1);          // 3. take it out, and close the gap
    println!("{taken} {:?}", names);

    let last = names.pop();               // 4. take the last one
    println!("{:?} {:?}", last, names);
}
```
```output
Sara
Sara
Tomas ["Sara", "Lena"]
Some("Lena") ["Sara"]
```


### When the borrow checker objects to a list

Three situations cause most of the borrow errors with lists. For each one, ask the question from [chapter 15](#borrowing): what would go wrong if this compiled?

**1. A reference kept across a change.** This is the bug from [chapter 15](#borrowing): `let first = &numbers[0];`, then `numbers.push(4);`, then `first` is used. The push may move all the elements, and `first` would point at freed memory. Keep the *position* (`let first = 0;`) and write `numbers[first]` when you need the element, or clone the element.

**2. Changing the list inside a loop over it.**

```rust fail E0502
fn main() {
    let mut numbers = vec![3, -1, 4, -5];
    for n in &numbers {
        if *n < 0 {
            numbers.push(-n);
        }
    }
}
```
```error auto
```

The loop holds a reference into the list from its first round to its last. A `push` in the middle may move the elements away under the loop. Other languages accept this code and then fail or misbehave while the program runs. In Rust you choose one of these:

```rust run
fn main() {
    let mut numbers = vec![3, -1, 4, -5];

    // Read first, write afterwards.
    let mut to_add = Vec::new();
    for n in &numbers {
        if *n < 0 {
            to_add.push(-n);
        }
    }
    numbers.extend(to_add);
    println!("{:?}", numbers);

    // To remove elements, let the list run the loop.
    numbers.retain(|n| *n > 0);
    println!("{:?}", numbers);

    // To change elements in place, borrow them mutably one by one.
    for n in &mut numbers {
        *n *= 10;
    }
    println!("{:?}", numbers);
}
```
```output auto
```

**3. Two elements at the same time.**

```rust fail E0499
fn main() {
    let mut scores = vec![10, 20, 30];
    let first = &mut scores[0];
    let last = &mut scores[2];
    *first += *last;
    *last = 0;
    println!("{:?}", scores);
}
```
```error auto
```

This case is different: nothing would go wrong, because the two elements are different. But the compiler does not follow which position you ask for. To it, `&mut scores[0]` borrows the whole list. The code is safe, and the compiler cannot prove it. So you write it in a way that it can follow:

```rust run
fn main() {
    let mut scores = vec![10, 20, 30];

    // Copy the value out. Each borrow ends before the next one starts.
    let last = scores[2];
    scores[0] += last;
    scores[2] = 0;
    println!("{:?}", scores);

    // Exchange two elements.
    scores.swap(0, 2);
    println!("{:?}", scores);

    // Cut the list into two parts that are borrowed separately.
    let (left, right) = scores.split_at_mut(1);
    left[0] += right[0];
    println!("{:?}", scores);

    // Ask for several elements in one call.
    if let Ok([a, b]) = scores.get_disjoint_mut([0, 2]) {
        std::mem::swap(a, b);
    }
    println!("{:?}", scores);
}
```
```output auto
```

`split_at_mut(1)` returns the elements before position 1 and the elements from position 1 on, as two mutable slices. `get_disjoint_mut` checks while the program runs that the positions are different and inside the list.

### A list of different kinds of things

All elements of a vector have the same type. To store different kinds of things, wrap them in an enum:

```rust run
#[derive(Debug)]
enum Cell {
    Number(f64),
    Text(String),
    Empty,
}

fn main() {
    let row = vec![Cell::Number(3.5), Cell::Text(String::from("total")), Cell::Empty];
    for cell in &row {
        match cell {
            Cell::Number(n) => println!("number {n}"),
            Cell::Text(t) => println!("text {t}"),
            Cell::Empty => println!("empty"),
        }
    }
}
```
```output
number 3.5
text total
empty
```

## `HashMap`: looking things up by a key

A `HashMap<K, V>` stores **pairs**: a **key** of type `K` and a **value** of type `V`. You put a value in under a key, and later get it back by giving the key.

:::analogy A phone book
A phone book stores pairs: a name and a number. You do not read it from the first page to the last. You jump to the name and find the number at once. The name is the key and the number is the value. Each name appears once.
:::

```rust run
use std::collections::HashMap;

fn main() {
    let mut stock: HashMap<String, u32> = HashMap::new();
    stock.insert(String::from("apples"), 12);
    stock.insert(String::from("pears"), 5);

    println!("{:?}", stock.get("apples"));     // Some(&12)
    println!("{:?}", stock.get("kiwis"));      // None
    println!("{}", stock.contains_key("pears"));

    let pears = stock.get("pears").copied().unwrap_or(0);
    let kiwis = stock.get("kiwis").copied().unwrap_or(0);
    println!("{pears} pears, {kiwis} kiwis");

    stock.insert(String::from("pears"), 6);    // same key: the old value is replaced
    stock.remove("apples");
    println!("{:?}", stock);
}
```
```output
Some(12)
None
true
5 pears, 0 kiwis
{"pears": 6}
```

- `HashMap` is not available automatically. The line `use std::collections::HashMap;` brings it in.
- `get` returns an `Option<&V>`, because the key may be missing. `.copied()` turns the `Option<&u32>` into an `Option<u32>`, and `.unwrap_or(0)` supplies a value for the "missing" case.
- Each key exists once. Inserting with an existing key replaces the value.
- Like a vector, a map owns its keys and values. A `String` that you insert is moved into the map.

### Update a value, or insert it if it is missing

A very common task: "add one to the counter for this key, and if there is no counter yet, start at zero". The `entry` method does this in one step:

```rust run
use std::collections::HashMap;

fn main() {
    let text = "the cat and the dog and the bird";
    let mut counts: HashMap<&str, u32> = HashMap::new();

    for word in text.split_whitespace() {
        *counts.entry(word).or_insert(0) += 1;
    }

    println!("the: {}", counts["the"]);
    println!("and: {}", counts["and"]);
    println!("cat: {}", counts["cat"]);
}
```
```output
the: 3
and: 2
cat: 1
```

Read the line from the inside out. `counts.entry(word)` looks at the place for this key. `.or_insert(0)` puts a 0 there if the place is empty, and in both cases returns a mutable reference to the value. `*... += 1` adds one through that reference. (`counts["the"]` reads a value by key and panics if the key is missing, like indexing a vector.)

### Going through a map

```rust run
use std::collections::HashMap;

fn main() {
    let mut ages = HashMap::new();
    ages.insert("Sara", 29);
    ages.insert("Tomas", 41);
    ages.insert("Lena", 35);

    let mut names: Vec<&str> = ages.keys().copied().collect();
    names.sort();
    for name in names {
        println!("{name} is {}", ages[name]);
    }

    let total: i32 = ages.values().sum();
    println!("Together: {total}");
}
```
```output
Lena is 35
Sara is 29
Tomas is 41
Together: 105
```

You can also write `for (name, age) in &ages`. The example collects and sorts the keys first for an important reason:

:::warn A `HashMap` has no order
The pairs of a `HashMap` come out in an order that looks random, and it can be different each time the program runs. Never rely on it. If you need a stable order, sort the keys as above, or use a `BTreeMap`, described below.
:::

:::details Under the hood: `Vec` doubling and SwissTable `HashMap`
Inside `alloc`, `Vec<T>` grows its capacity roughly exponentially (typically doubling once capacity passes 4 elements), copying existing elements into the new heap buffer with `realloc` so appending stays fast on average (**amortised O(1)**). Meanwhile, Rust's `HashMap` uses Google's **SwissTable** (`hashbrown`) design: keys hash to a flat probe array accompanied by 1-byte **control metadata tags** checked 16 slots at a time using CPU **SIMD** instructions!
:::

:::details How a hash map finds things so fast
A `HashMap` runs the key through a **[[hash]] function**, a calculation that turns any key into a number. That number decides in which "bucket" the pair is stored. To look up a key, the map calculates the same number and goes straight to that bucket, without looking at the other pairs. It works like a cloakroom: your ticket number tells the attendant exactly which hook to go to.

Two consequences:

- A key type must be *hashable* and comparable for equality. Integers, `bool`, `char`, `String`, `&str`, and tuples of these all work. Floats do not, because of their odd equality rules.
- Rust's default hash function is designed to resist attacks in which someone sends specially chosen keys to make a server slow. It is a little slower than the fastest possible hash. Programs that need more speed and do not handle untrusted input can use a faster one from a crate such as `rustc-hash` or `ahash`.
:::

## `HashSet`: a collection of unique values

A `HashSet<T>` stores values with no repeats and no order. It answers one question very quickly: "is this value in the set?"

```rust run
use std::collections::HashSet;

fn main() {
    let mut seen = HashSet::new();
    println!("{}", seen.insert("apple"));   // true: it was new
    println!("{}", seen.insert("pear"));
    println!("{}", seen.insert("apple"));   // false: already there
    println!("{} values, contains pear: {}", seen.len(), seen.contains("pear"));

    let a: HashSet<i32> = [1, 2, 3, 4].into_iter().collect();
    let b: HashSet<i32> = [3, 4, 5].into_iter().collect();

    let mut both: Vec<_> = a.intersection(&b).collect();
    both.sort();
    let mut only_a: Vec<_> = a.difference(&b).collect();
    only_a.sort();
    let mut either: Vec<_> = a.union(&b).collect();
    either.sort();
    println!("{:?} {:?} {:?}", both, only_a, either);
}
```
```output
true
true
false
2 values, contains pear: true
[3, 4] [1, 2] [1, 2, 3, 4, 5]
```

`insert` returns `false` when the value was already present, which makes "have I seen this before?" a one-liner. The set operations give the values that are in both sets (`intersection`), only in the first (`difference`), or in at least one (`union`). (`Vec<_>` asks the compiler to work out the element type itself.)

## The rest of the family

| Collection | What it is | Use it when |
|---|---|---|
| `Vec<T>` | a growable list | almost always. It is the default choice |
| `VecDeque<T>` | a list that is fast at both ends | you need a queue: add at the back, take from the front |
| `HashMap<K, V>` | key–value pairs, no order | you look things up by key |
| `BTreeMap<K, V>` | key–value pairs, always sorted by key | you need the keys in order, or all keys in a range |
| `HashSet<T>` | unique values, no order | you test membership or remove duplicates |
| `BTreeSet<T>` | unique values, sorted | you need unique values in order |
| `BinaryHeap<T>` | a pile from which you always get the largest element | a priority queue: "what is the most urgent task?" |
| `LinkedList<T>` | a chain of separately stored elements | almost never. A `Vec` or `VecDeque` is nearly always faster |

All of them live in `std::collections`, except `Vec`, which is always available.

```rust run
use std::collections::{BTreeMap, VecDeque};

fn main() {
    let mut queue = VecDeque::new();
    queue.push_back("first customer");
    queue.push_back("second customer");
    println!("{:?}", queue.pop_front());

    let mut marks = BTreeMap::new();
    marks.insert("Tomas", 71);
    marks.insert("Lena", 88);
    marks.insert("Sara", 93);
    for (name, mark) in &marks {
        println!("{name}: {mark}");
    }
}
```
```output
Some("first customer")
Lena: 88
Sara: 93
Tomas: 71
```

:::details How to talk about speed: "Big O" in plain words
Programmers describe how the work of an operation grows as the collection gets bigger. They write it with a capital O:

- **O(1), "constant":** the work is the same whether there are ten elements or ten million. Examples: `push` on a `Vec`, reading `v[i]`, `get` on a `HashMap`.
- **O(log n), "logarithmic":** the work grows very slowly. Doubling the data adds one step. Examples: lookups in a `BTreeMap`, and binary search (your strategy from the guessing game).
- **O(n), "linear":** the work grows in step with the size. Twice the data takes twice as long. Examples: `contains` on a `Vec`, `insert` at the front of a `Vec`.
- **O(n log n):** a little more than linear. Example: sorting.
- **O(n²), "quadratic":** twice the data takes four times as long. A loop inside a loop over the same data does this. It is fine for 100 elements and painful for a million.

This is why `HashSet::contains` (constant) beats `Vec::contains` (linear) for big collections, and why choosing the right collection can matter more than any other speed trick.
:::

:::compare Collections in other languages
| Rust | Python | JavaScript | Java | C++ |
|---|---|---|---|---|
| `Vec<T>` | `list` | `Array` | `ArrayList<T>` | `std::vector<T>` |
| `HashMap<K, V>` | `dict` | `Map` | `HashMap<K, V>` | `std::unordered_map` |
| `HashSet<T>` | `set` | `Set` | `HashSet<T>` | `std::unordered_set` |
| `BTreeMap<K, V>` | (none built in) | (none built in) | `TreeMap<K, V>` | `std::map` |

The ideas are the same everywhere. Rust's versions differ in three ways: every element has the same, known type; a missing element gives an `Option`, never a `null` or an exception; and the borrow checker stops you from changing a collection while you are still holding references into it or looping over it.
:::

:::recap
- `Vec<T>` is a growable list: `push`, `pop`, `v[i]`, `v.get(i)`, `for x in &v`.
- Indexing panics when out of range. `get` returns an `Option`.
- A collection owns its elements. You cannot move a non-`Copy` element out by index: borrow it, clone it, or remove it.
- `HashMap<K, V>` stores values under keys. `get` returns an `Option`, `entry(key).or_insert(v)` updates or inserts, and the order is arbitrary.
- `HashSet<T>` stores unique values and tests membership quickly.
- `BTreeMap` and `BTreeSet` keep their contents sorted. `VecDeque` is a queue.
:::

:::quiz Check your understanding
? What is the difference between `v[10]` and `v.get(10)` on a vector with 3 elements?
+ `v[10]` panics, and `v.get(10)` returns `None`
- There is none
- `v[10]` returns `None` and `v.get(10)` panics
- Both return 0
= Indexing is for cases where an invalid index is a bug. `get` returns an `Option`, so the program can handle a missing element.

? Which loop lets you change the elements of `v` in place?
- `for x in &v`
+ `for x in &mut v`
- `for x in v`
- `for x in v.len()`
= `&mut v` gives a mutable reference to each element, which you change with `*x = ...`. `&v` only reads, and `v` consumes the vector.

? What does `*map.entry(key).or_insert(0) += 1;` do?
- It inserts 0 and ignores existing values
- It panics if the key is missing
+ It inserts 0 if the key is missing, and then adds 1 to the value for that key
- It removes the key
= `entry` finds the place for the key, `or_insert(0)` fills it if it is empty and returns a mutable reference to the value, and `+= 1` increments it.

? You need to print names in alphabetical order with a number for each. Which collection gives you that order without sorting?
- `HashMap<String, u32>`
- `HashSet<String>`
- `VecDeque<String>`
+ `BTreeMap<String, u32>`
= A `BTreeMap` always keeps its keys sorted. A `HashMap` returns its pairs in an arbitrary order.

? Why does `let s = names[0];` not compile for a `Vec<String>`?
+ It would move the `String` out of the vector and leave a hole. The vector owns its elements
- Indexing is not allowed on vectors of strings
- `names` must be mutable
- Strings cannot be stored in variables
= Moving out by index is forbidden for non-`Copy` types. Borrow with `&names[0]`, copy with `.clone()`, or take the element out with `remove` or `pop`.
:::

:::exercise guided Statistics
Write a function `stats(numbers: &[i32]) -> Option<(i32, i32, f64)>` that returns the smallest value, the largest value and the average. For an empty list it returns `None`. Test it with `vec![4, 8, 15, 16, 23, 42]` and with an empty vector.
::hint
Return `None` first if `numbers.is_empty()`. Then start `min` and `max` with `numbers[0]`, loop over `&numbers`, and keep a running sum. Each `n` in the loop is a `&i32`, so write `*n` to get the number.
::solution
```rust run
fn stats(numbers: &[i32]) -> Option<(i32, i32, f64)> {
    if numbers.is_empty() {
        return None;
    }
    let mut min = numbers[0];
    let mut max = numbers[0];
    let mut sum = 0;
    for n in numbers {
        if *n < min {
            min = *n;
        }
        if *n > max {
            max = *n;
        }
        sum += *n;
    }
    Some((min, max, sum as f64 / numbers.len() as f64))
}

fn main() {
    let data = vec![4, 8, 15, 16, 23, 42];
    println!("{:?}", stats(&data));
    println!("{:?}", stats(&[]));
}
```
```output
Some((4, 42, 18.0))
None
```

An empty list has no smallest element and no average (it would be a division by zero), so the honest answer is `None`. The function takes a slice, so it works for vectors and arrays. Later you will write the same in three short lines with iterator methods: `iter().min()`, `iter().max()` and `iter().sum()`.
:::

:::exercise practice Word frequency
Count how often each word appears in a text, ignoring upper and lower case, and print the words in alphabetical order with their counts. For `"The cat saw the other cat"` the output is:

```text
cat: 2
other: 1
saw: 1
the: 2
```
::hint
Use a `BTreeMap<String, u32>`, so that the output is sorted without extra work. Convert each word with `.to_lowercase()`, which gives a `String`, and count with `entry(...).or_insert(0)`.
::solution
```rust run
use std::collections::BTreeMap;

fn main() {
    let text = "The cat saw the other cat";
    let mut counts: BTreeMap<String, u32> = BTreeMap::new();

    for word in text.split_whitespace() {
        *counts.entry(word.to_lowercase()).or_insert(0) += 1;
    }

    for (word, count) in &counts {
        println!("{word}: {count}");
    }
}
```
```output
cat: 2
other: 1
saw: 1
the: 2
```

`to_lowercase` creates a new `String`, which the map takes ownership of as the key. That is why the key type is `String` here and not `&str`: the lower-case text does not exist anywhere else that a reference could point to. A `BTreeMap` has the same `entry` method as a `HashMap`.
:::

:::exercise practice Remove duplicates, keep the order
Write `unique(items: &[i32]) -> Vec<i32>` that returns the values without repeats, in the order of their first appearance. `[3, 1, 3, 2, 1]` gives `[3, 1, 2]`.
::hint
Keep a `HashSet` of the values you have already seen. `seen.insert(x)` returns `true` only the first time. Push the value onto the result in that case.
::solution
```rust run
use std::collections::HashSet;

fn unique(items: &[i32]) -> Vec<i32> {
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for &item in items {
        if seen.insert(item) {
            result.push(item);
        }
    }
    result
}

fn main() {
    println!("{:?}", unique(&[3, 1, 3, 2, 1]));
}
```
```output
[3, 1, 2]
```

The set answers "have I seen this?" quickly, and the vector remembers the order. Two collections work together, each doing what it is good at. The pattern `for &item in items` takes each `&i32` apart, so `item` is a plain `i32`.
:::

:::exercise challenge Group by first letter
Write `group_by_initial(names: &[&str]) -> BTreeMap<char, Vec<String>>` that groups names by their first letter. For `["Sara", "Tomas", "Selam", "Lena", "Teddy"]`, printing the result with `{:?}` gives:

```text
{'L': ["Lena"], 'S': ["Sara", "Selam"], 'T': ["Tomas", "Teddy"]}
```

Skip empty names.
::hint
`name.chars().next()` gives the first character as an `Option<char>`. Use `let Some(initial) = ... else { continue; };`. Then `groups.entry(initial).or_insert_with(Vec::new).push(...)` adds the name to the right list, creating the list if needed.
::solution
```rust run
use std::collections::BTreeMap;

fn group_by_initial(names: &[&str]) -> BTreeMap<char, Vec<String>> {
    let mut groups: BTreeMap<char, Vec<String>> = BTreeMap::new();
    for name in names {
        let Some(initial) = name.chars().next() else {
            continue;
        };
        groups.entry(initial).or_default().push(name.to_string());
    }
    groups
}

fn main() {
    let names = ["Sara", "Tomas", "Selam", "Lena", "Teddy"];
    println!("{:?}", group_by_initial(&names));
}
```
```output
{'L': ["Lena"], 'S': ["Sara", "Selam"], 'T': ["Tomas", "Teddy"]}
```

The value type of the map is itself a collection. `entry(initial).or_default()` returns a mutable reference to the list for that letter, creating an empty one first if the letter is new (`or_default` is short for `or_insert_with(Vec::new)`: it inserts the type's default value, which for a `Vec` is an empty vector). `let … else` deals with empty names in one line. A map of lists is one of the most common ways to organise data.
:::
