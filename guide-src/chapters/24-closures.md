@id closures
@part p3
@title Closures: functions you can carry around
@short Closures
@level intermediate
@time 45
@learn Write closures and pass them to functions | Explain how a closure captures values from its surroundings | Tell `Fn`, `FnMut` and `FnOnce` apart and know when `move` is needed | Return closures from functions and store them in structs

You have already written closures without much explanation: `v.retain(|x| *x > 2)`, `some.map(|n| n * 2)`, `people.sort_by_key(|p| p.age)`. The part between the bars and after them is a **closure**: a small function without a name, written right where it is needed.

Closures matter because they let you pass **behaviour** to a function, in the same way that you pass data. `sort_by_key` knows how to sort. What to sort *by* is your decision, and you hand it over as a closure.

:::analogy A note for the babysitter
You leave a note: "If Lena wakes up, read her the book on the kitchen table." The note is a set of instructions to be carried out later, by someone else. And it refers to something from your surroundings, the book on your kitchen table. A closure is such a note: instructions, plus the things from its surroundings that the instructions need.
:::

## The syntax

```rust run
fn main() {
    let add_one = |x| x + 1;                          // shortest form
    let add = |a: i32, b: i32| -> i32 { a + b };      // with types and a block
    let greet = || println!("hello!");                // no parameters
    let describe = |n: i32| {
        let kind = if n % 2 == 0 { "even" } else { "odd" };
        format!("{n} is {kind}")
    };

    println!("{}", add_one(5));
    println!("{}", add(2, 3));
    greet();
    println!("{}", describe(7));
}
```
```output
6
5
hello!
7 is odd
```

- Parameters go between vertical bars: `|x|`, `|a, b|`, `||`.
- The body is one expression, or a block in braces.
- Types are usually left out. The compiler works them out from how the closure is used.

Compare a function and a closure that do the same:

```rust check
fn add_one_fn(x: i32) -> i32 { x + 1 }
# fn main() {
let add_one_closure = |x: i32| -> i32 { x + 1 };
let add_one_short = |x| x + 1;
# let _ = (add_one_fn(1), add_one_closure(1), add_one_short(1));
# }
```

One limit: the compiler fixes the types of a closure at its first use. A closure that was called with an `i32` cannot be called with a `String` afterwards.

## Capturing: what makes a closure special

A function can only use its parameters. A closure can also use variables from the place where it is written. It **captures** them:

```rust run
fn main() {
    let limit = 10;
    let is_small = |n: i32| n < limit;       // uses `limit` from outside

    println!("{} {}", is_small(3), is_small(30));

    let numbers = vec![4, 15, 8, 23, 42];
    let small: Vec<i32> = numbers.into_iter().filter(|n| *n < limit).collect();
    println!("{:?}", small);
}
```
```output
true false
[4, 8]
```

A normal function could not do this. Try it, and the compiler says "can't capture dynamic environment in a fn item". Capturing is why the name is *closure*: it "closes over" its surroundings.

### Three ways to capture

A closure captures each variable in the least demanding way that its body allows. These are the three ways of using a value that you know from ownership:

```rust run
fn main() {
    // 1. Borrow: the closure only reads the value
    let name = String::from("Sara");
    let greet = || println!("Hello, {name}!");
    greet();
    println!("{name} is still usable");

    // 2. Borrow mutably: the closure changes the value
    let mut count = 0;
    let mut increment = || count += 1;
    increment();
    increment();
    println!("count is {count}");

    // 3. Take ownership: the closure uses the value up
    let text = String::from("goodbye");
    let consume = || drop(text);       // `drop` takes ownership of its argument
    consume();
    // `text` is gone, and `consume` cannot be called a second time
}
```
```output
Hello, Sara!
Sara is still usable
count is 2
```

Notice `let mut increment`: a closure that changes a captured variable must itself be declared `mut`.

The borrow rules apply as always. While `increment` is alive, it holds a mutable borrow of `count`, so nothing else may touch `count`:

```rust fail E0502
fn main() {
    let mut count = 0;
    let mut increment = || count += 1;
    println!("{count}");
    increment();
}
```
```error auto
```

### `move`: take everything along

Sometimes a closure must **own** what it captures, because it will live longer than the place where it was created. The keyword `move` before the bars makes the closure take ownership of every variable it uses:

```rust fail nowrap E0373
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    |x| x + n
}
```
```error auto
```

The closure borrows `n`, but `n` is a parameter of `make_adder` and disappears when that function returns. The closure would be left with a dangling reference. The compiler's suggestion is the fix:

```rust run
fn make_adder(n: i32) -> impl Fn(i32) -> i32 {
    move |x| x + n
}

fn main() {
    let add_five = make_adder(5);
    let add_ten = make_adder(10);
    println!("{} {}", add_five(1), add_ten(1));
}
```
```output
6 11
```

`make_adder` is a function that builds functions. Each closure it returns carries its own `n`. `move` is needed in two typical places: when a closure is **returned** from a function, and when it is handed to a **new thread** ([chapter 55](#threads)).

:::plain What a closure really is
There is no magic. For each closure, the compiler creates a hidden struct with one field per captured variable, and one method that contains the body. `make_adder(5)` returns a struct holding the number 5. Calling the closure calls the method. That is why closures are exactly as fast as ordinary functions, and why each closure has its own unique type that has no name you can write.
:::

## `Fn`, `FnMut` and `FnOnce`

To accept a closure as a parameter, a function needs a type for it. Each closure has its own unnameable type, so you describe it by a **trait**. There are three, and they differ in what the closure does with its captured values:

| Trait | The closure … | It can be called | Example body |
|---|---|---|---|
| `Fn` | only reads what it captured | any number of times, even from several places at once | `\|x\| x + n` |
| `FnMut` | changes what it captured | any number of times, one call at a time | `\|\| count += 1` |
| `FnOnce` | uses up what it captured | once | `\|\| drop(text)` |

They form a ladder. Every `Fn` closure can also be used where an `FnMut` or `FnOnce` is asked for, and every `FnMut` where an `FnOnce` is asked for. So when you **write a function that takes a closure**, ask for the least you need, to accept the most:

- If you call it once: `FnOnce`.
- If you call it several times: `FnMut`.
- If you must call it from several places at the same time, or through a shared reference: `Fn`.

The trait is written with the parameter types in parentheses and the return type after an arrow:

```rust run
fn apply_twice<F>(f: F, value: i32) -> i32
where
    F: Fn(i32) -> i32,
{
    f(f(value))
}

fn repeat(times: u32, mut action: impl FnMut()) {
    for _ in 0..times {
        action();
    }
}

fn run_once(job: impl FnOnce() -> String) -> String {
    job()
}

fn main() {
    println!("{}", apply_twice(|x| x * 3, 2));

    let mut total = 0;
    repeat(4, || total += 5);
    println!("{total}");

    let name = String::from("Lena");
    println!("{}", run_once(move || name + "!"));
}
```
```output
18
20
Lena!
```

The standard library follows the same reasoning. `Option::map` calls its closure at most once, so it asks for `FnOnce`. `Iterator::map` calls it for every item, so it asks for `FnMut`. `thread::spawn` runs it once, in another thread, and asks for `FnOnce`.

### Ordinary functions work too

Wherever a closure is expected, you can pass the name of a normal function, as long as the parameters and return type fit:

```rust run
fn double(x: i32) -> i32 {
    x * 2
}

fn main() {
    let numbers = [1, 2, 3];
    let doubled: Vec<i32> = numbers.iter().map(|x| double(*x)).collect();
    let texts: Vec<String> = numbers.iter().map(ToString::to_string).collect();
    let parsed: Vec<i32> = ["7", "8"].iter().map(|s| s.parse().unwrap()).collect();
    let wrapped: Vec<Option<i32>> = numbers.into_iter().map(Some).collect();

    println!("{:?} {:?} {:?} {:?}", doubled, texts, parsed, wrapped);
}
```
```output
[2, 4, 6] ["1", "2", "3"] [7, 8] [Some(1), Some(2), Some(3)]
```

`map(ToString::to_string)` passes a method by its path, and `map(Some)` passes an enum variant, which is a function too: it takes a value and returns an `Option`.

There is also a plain type for functions that capture nothing, the **function pointer** `fn(i32) -> i32`, written with a small `f`. You need it rarely, mostly when talking to C code or when storing functions in a table:

```rust run
fn add(a: i32, b: i32) -> i32 { a + b }
fn multiply(a: i32, b: i32) -> i32 { a * b }

fn main() {
    let operations: [(&str, fn(i32, i32) -> i32); 2] = [("add", add), ("multiply", multiply)];
    for (name, operation) in operations {
        println!("{name}: {}", operation(6, 7));
    }
}
```
```output
add: 13
multiply: 42
```

## Storing closures

A struct field can hold a closure. Either make the struct generic over the closure's type, or box it as a trait object:

```rust run
struct Button {
    label: String,
    on_click: Box<dyn Fn() -> String>,
}

impl Button {
    fn click(&self) {
        println!("[{}] {}", self.label, (self.on_click)());
    }
}

fn main() {
    let user = String::from("Sara");
    let buttons = vec![
        Button { label: String::from("Hello"), on_click: Box::new(move || format!("Hi, {user}!")) },
        Button { label: String::from("Quit"), on_click: Box::new(|| String::from("Goodbye!")) },
    ];
    for button in &buttons {
        button.click();
    }
}
```
```output
[Hello] Hi, Sara!
[Quit] Goodbye!
```

- `Box<dyn Fn() -> String>` is "some closure that takes nothing and returns a `String`, stored on the heap". Because both buttons have this same type, they fit into one vector, although the two closures are of different hidden types.
- A closure stored in a field is called with extra parentheses: `(self.on_click)()`. Without them, Rust would look for a *method* named `on_click`.
- A closure that is handed over to be called later, when something happens, is known as a **callback**. Buttons, timers and network events all work this way.

:::compare Closures in other languages
- **JavaScript** (`x => x + 1`) and **Python** (`lambda x: x + 1`) have closures that capture variables by reference, and a garbage collector keeps the captured variables alive. Captured variables that change later are a classic source of surprises there.
- **Java** lambdas may only capture variables that never change.
- **C++** lambdas make you list the captures by hand, as in `[&total, limit](int x) { ... }`, and capturing a reference to a variable that dies too early is undefined behaviour.
- **Rust** decides the capture mode automatically, and the borrow checker verifies that every captured reference stays valid. When it cannot be valid, you get an error and the hint to use `move`.
:::

:::recap
- A closure is an anonymous function: `|parameters| body`. The types are usually inferred.
- A closure can capture variables from its surroundings: by shared borrow, by mutable borrow, or by taking ownership.
- `move` forces the closure to own what it captures. It is needed when the closure outlives its birthplace: returned closures and threads.
- `Fn` reads its captures, `FnMut` changes them, `FnOnce` uses them up. A function parameter should ask for the weakest one that is enough.
- Named functions can be passed where closures are expected.
- `impl Fn(…)` returns a closure. `Box<dyn Fn(…)>` stores closures of different types in one place.
:::

:::quiz Check your understanding
? What can a closure do that an ordinary function cannot?
- Take parameters
- Return a value
+ Use variables from the scope in which it is defined
- Be called more than once
= Capturing its environment is the defining feature of a closure. An `fn` item can only use its parameters and global items.

? What does `move` do in `move |x| x + n`?
- It moves the closure to the heap
- It makes the closure run faster
+ It makes the closure take ownership of the variables it uses, here `n`
- It makes `x` mutable
= Without `move`, the closure would borrow `n`. With it, the closure owns its own copy and can live longer than the scope where `n` was defined.

? A function calls the closure it receives several times, and the closure adds to a counter outside. Which bound must the parameter have?
- `Fn()`
+ `FnMut()`
- `FnOnce()`
- `fn()`
= The closure changes a captured variable, so it is not `Fn`. It is called more than once, so `FnOnce` is not enough. `FnMut` fits.

? Why can the closures `|| 1` and `|| 2` not be stored in a `Vec` directly, without `Box<dyn Fn() -> i32>`?
- Closures cannot be stored at all
+ Every closure has its own unique type, and a `Vec` needs one element type
- They return different numbers
- A `Vec` can only hold numbers and text
= Even closures that look alike have distinct, unnameable types. A trait object gives them a common type.

? Why does this not compile?
```rust
let mut total = 0;
let mut add = |n| total += n;
println!("{total}");
add(5);
```
- Closures cannot change variables
- `add` should not be `mut`
+ `add` holds a mutable borrow of `total` until its last use, so `total` cannot be read in between
- `n` has no type
= The closure borrows `total` mutably from its creation to its last call. Reading `total` in that stretch breaks the borrowing rules. Move the `println!` after the last call.
:::

:::exercise guided Apply a function three ways
Write a function `transform(numbers: &[i32], f: impl Fn(i32) -> i32) -> Vec<i32>` that returns a new vector in which `f` has been applied to every number. Call it with a closure that doubles, with a closure that adds a captured variable `offset`, and with a named function `square`.
::hint
Inside `transform`, create an empty vector, loop with `for &n in numbers`, and push `f(n)`. For the third call, pass just the name: `transform(&data, square)`.
::solution
```rust run
fn transform(numbers: &[i32], f: impl Fn(i32) -> i32) -> Vec<i32> {
    let mut result = Vec::new();
    for &n in numbers {
        result.push(f(n));
    }
    result
}

fn square(x: i32) -> i32 {
    x * x
}

fn main() {
    let data = [1, 2, 3];
    let offset = 100;

    println!("{:?}", transform(&data, |x| x * 2));
    println!("{:?}", transform(&data, |x| x + offset));
    println!("{:?}", transform(&data, square));
}
```
```output
[2, 4, 6]
[101, 102, 103]
[1, 4, 9]
```

`transform` knows how to walk over a list and build a new one. What happens to each number is decided by the caller. The second closure captures `offset` by reference, which is fine because it is only used during the call. This function is a hand-made version of the iterator method `map`, which you will meet in the next chapter.
:::

:::exercise practice A counter factory
Write `make_counter() -> impl FnMut() -> u32` that returns a closure. Each call of the closure returns the next number: 1, 2, 3, … Two counters made by two calls of `make_counter` must count independently.
::hint
Inside `make_counter`, declare `let mut count = 0;`, and return `move || { count += 1; count }`. The variable that holds the returned closure must be `mut`.
::solution
```rust run
fn make_counter() -> impl FnMut() -> u32 {
    let mut count = 0;
    move || {
        count += 1;
        count
    }
}

fn main() {
    let mut first = make_counter();
    let mut second = make_counter();
    println!("{} {} {}", first(), first(), first());
    println!("{}", second());
}
```
```output
1 2 3
1
```

`move` gives each closure its own `count`, which lives inside the closure for as long as the closure exists. The closure changes its captured value, so its type is `FnMut`, and calling it needs a `mut` binding. This is a tiny example of **state** hidden inside a function: from outside, nobody can reach `count` except by calling the closure.
:::

:::exercise practice Sort in three orders
Given a vector of `(String, u32)` pairs, name and score, print the list sorted (a) by score from high to low, (b) by name, and (c) by the length of the name, shortest first. Use `sort_by` or `sort_by_key` with closures.
::hint
`sort_by_key(|p| p.1)` sorts by score from low to high. For the reverse order, use `sort_by(|a, b| b.1.cmp(&a.1))`, with `a` and `b` swapped, or wrap the key in `std::cmp::Reverse`. For names, `sort_by(|a, b| a.0.cmp(&b.0))` avoids cloning the strings.
::solution
```rust run
use std::cmp::Reverse;

fn names(list: &[(String, u32)]) -> Vec<&str> {
    list.iter().map(|p| p.0.as_str()).collect()
}

fn main() {
    let mut players = vec![
        (String::from("Tomas"), 71),
        (String::from("Li"), 93),
        (String::from("Selamawit"), 88),
    ];

    players.sort_by_key(|p| Reverse(p.1));
    println!("{:?}", names(&players));

    players.sort_by(|a, b| a.0.cmp(&b.0));
    println!("{:?}", names(&players));

    players.sort_by_key(|p| p.0.len());
    println!("{:?}", names(&players));
}
```
```output
["Li", "Selamawit", "Tomas"]
["Li", "Selamawit", "Tomas"]
["Li", "Tomas", "Selamawit"]
```

One sorting routine, three orders, each chosen by a small closure. `Reverse` is a wrapper that turns the order of its content around. `sort_by_key` is the shortest form when the key is cheap to produce. For the names, `sort_by` compares the strings in place without creating copies. (The first two lines are the same by coincidence: in this data, the order by score happens to equal the alphabetical order.)
:::

:::exercise challenge Remember results
Some calculations are slow. Write a struct `Cache<F>` that wraps a function `F: Fn(u64) -> u64` and remembers every result in a `HashMap`, so that the function is run only once per input. Give it a method `get(&mut self, input: u64) -> u64`. Prove that it works by counting how often the wrapped function really runs.
::hint
The struct has two fields: `function: F` and `results: HashMap<u64, u64>`. In `get`, look in the map first. If the input is not there, call `(self.function)(input)`, store the result and return it. To count the calls from outside, the wrapped closure cannot change a plain counter, because the bound is `Fn`. Use a `std::cell::Cell<u32>`, which allows changing a value through a shared reference (more about it in [chapter 32](#smart-pointers)).
::solution
```rust run
use std::cell::Cell;
use std::collections::HashMap;

struct Cache<F>
where
    F: Fn(u64) -> u64,
{
    function: F,
    results: HashMap<u64, u64>,
}

impl<F> Cache<F>
where
    F: Fn(u64) -> u64,
{
    fn new(function: F) -> Self {
        Cache { function, results: HashMap::new() }
    }

    fn get(&mut self, input: u64) -> u64 {
        if let Some(&known) = self.results.get(&input) {
            return known;
        }
        let result = (self.function)(input);
        self.results.insert(input, result);
        result
    }
}

fn main() {
    let calls = Cell::new(0);
    let mut squares = Cache::new(|n| {
        calls.set(calls.get() + 1);
        n * n
    });

    println!("{} {} {}", squares.get(12), squares.get(12), squares.get(7));
    println!("{}", squares.get(12));
    println!("the function ran {} times", calls.get());
}
```
```output
144 144 49
144
the function ran 2 times
```

Four requests, but the function ran only twice: once for 12 and once for 7. Remembering results like this is called **memoization**. The struct is generic over `F`, so the closure is stored directly in the struct, with no boxing and no run-time lookup. `(self.function)(input)` needs the parentheses because `function` is a field, not a method.

`Cell` lets the closure count its calls although it only holds a shared reference to `calls`, which keeps the closure an `Fn`.
:::
