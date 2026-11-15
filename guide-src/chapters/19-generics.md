@id generics
@part p3
@title Generics: code that works for many types
@short Generics
@level intermediate
@time 35
@learn Remove duplicated code by writing a function once for many types | Define generic structs, enums and methods | Read and write the `<T>` notation with confidence | Explain why generic code in Rust is as fast as hand-written code

You have been using generic types for a while: `Vec<i32>`, `Option<String>`, `Result<u32, io::Error>`, `HashMap<String, u32>`. The part in angle brackets says what the type holds. One `Vec` implementation works for every element type. In this chapter you learn to write such code yourself.

## The problem: the same code twice

Here is a function that finds the largest number in a list:

```rust check
fn largest_i32(list: &[i32]) -> i32 {
    let mut largest = list[0];
    for &item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}
# fn main() { largest_i32(&[1]); }
```

It works for `i32`. For a list of `f64` you would copy the function and change two words. For `char` you would copy it again. Three copies of the same logic mean three places to fix when you find a bug.

:::plain Generics and monomorphisation in one paragraph
A **generic** function or type is written once with a placeholder type parameter, `fn largest<T: PartialOrd>(list: &[T]) -> &T`, and works for every type that satisfies the stated **bounds**. The compiler generates a separate, specialised copy of the code for each concrete type used, which is **monomorphisation**: you pay nothing at run time, but the binary can grow. Bounds are what make generics safe — `T: PartialOrd` is the promise that `>` exists for `T`, so the body compiles once instead of failing per instantiation.
:::

:::analogy A recipe with a blank
A recipe for jam says "take 1 kg of fruit and 500 g of sugar". It does not say which fruit. The steps are the same for strawberries, apricots and plums. "Fruit" is a blank that you fill in when you cook. A generic function is a recipe with such a blank for a *type*.
:::

## A generic function

```rust run
fn largest<T: PartialOrd + Copy>(list: &[T]) -> T {
    let mut largest = list[0];
    for &item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}

fn main() {
    println!("{}", largest(&[3, 9, 4]));
    println!("{}", largest(&[2.5, 0.1, 1.8]));
    println!("{}", largest(&['r', 'u', 's', 't']));
}
```
```output
9
2.5
u
```

Read the first line piece by piece:

- **`<T>`** after the function name declares a **type parameter**: a blank called `T`. Any name works, but single capital letters are the convention, and `T` (for "type") is the usual first choice.
- **`list: &[T]`** says the parameter is a slice of that type, whatever it is.
- **`-> T`** says the function returns a value of that same type.
- **`T: PartialOrd + Copy`** restricts the blank. It is explained next.

When you call `largest(&[3, 9, 4])`, the compiler sees a slice of `i32` and fills in `T = i32` by itself.

### Why the restriction is needed

Without `: PartialOrd + Copy`, the function does not compile:

```rust fail E0369
fn largest<T>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}

fn main() {
    println!("{}", largest(&[3, 9, 4]));
}
```
```error auto
```

`T` could be **any** type, and not every type can be compared with `>`. What would it mean for one `HashMap` to be greater than another? Inside a generic function, Rust only lets you do what is certain to work for every allowed type.

So you narrow down the allowed types. `T: PartialOrd` means "`T` can be any type that supports comparison with `<` and `>`". `PartialOrd` is a **trait**, a named ability, and such a restriction is called a **trait bound**. `+ Copy` adds a second requirement: values of the type can be copied, which the line `let mut largest = list[0];` needs. Traits are the subject of [the next chapter](#traits). Generics and traits belong together: generics say "any type", and traits say "…that can do this".

:::tip A more flexible version
Requiring `Copy` excludes `String`. Returning a reference avoids that: `fn largest<T: PartialOrd>(list: &[T]) -> &T`. It needs no copying, so it works for any comparable type. One of the exercises asks you to write it.
:::

## Generic structs

```rust run
# #![allow(dead_code)]
#[derive(Debug)]
struct Point<T> {
    x: T,
    y: T,
}

#[derive(Debug)]
struct Labelled<T, U> {
    label: T,
    value: U,
}

fn main() {
    let whole = Point { x: 5, y: 10 };            // Point<i32>
    let precise = Point { x: 1.5, y: -0.5 };      // Point<f64>
    let item = Labelled { label: "age", value: 29 }; // Labelled<&str, i32>
    println!("{:?} {:?} {:?}", whole, precise, item);
}
```
```output
Point { x: 5, y: 10 } Point { x: 1.5, y: -0.5 } Labelled { label: "age", value: 29 }
```

`Point<T>` uses the same `T` for both fields, so `Point { x: 5, y: 1.5 }` is an error: the two fields would have different types. `Labelled<T, U>` has two independent blanks.

### Methods on generic types

```rust run
struct Point<T> {
    x: T,
    y: T,
}

impl<T> Point<T> {
    fn new(x: T, y: T) -> Self {
        Self { x, y }
    }

    fn x(&self) -> &T {
        &self.x
    }
}

// only for points made of f64
impl Point<f64> {
    fn distance_from_origin(&self) -> f64 {
        (self.x * self.x + self.y * self.y).sqrt()
    }
}

fn main() {
    let a = Point::new(3, 4);
    let b = Point::new(3.0, 4.0);
    println!("{} {}", a.x(), b.x());
    println!("{}", b.distance_from_origin());
    // a.distance_from_origin() would not compile: `a` is a Point<i32>
#   let _ = a.y;
}
```
```output
3 3
5
```

- `impl<T> Point<T>` reads: "for every type `T`, these are methods of `Point<T>`". The `<T>` after `impl` declares the blank, and the `<T>` after `Point` uses it.
- `impl Point<f64>` has no blank. Its methods exist only for that one concrete type.

## Generic enums

You know the two most important ones. This is how the standard library defines them:

```rust
enum Option<T> {
    Some(T),
    None,
}

enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

Nothing about them is built into the language. You could have written them yourself.

## Telling the compiler which type you mean

Usually the compiler works out the type parameters from the arguments. When it cannot, you say it explicitly. There are two ways:

```rust run
fn main() {
    // 1. Annotate the variable
    let a: Vec<u8> = Vec::new();
    let n: i64 = "42".parse().unwrap();

    // 2. The "turbofish": put the type after `::` at the call
    let b = Vec::<u8>::new();
    let m = "42".parse::<i64>().unwrap();
    let squares = (1..=4).map(|x| x * x).collect::<Vec<i32>>();

    println!("{} {} {n} {m} {:?}", a.len(), b.len(), squares);
}
```
```output
0 0 42 42 [1, 4, 9, 16]
```

The form `::<Type>` is nicknamed the **turbofish**, because `::<>` looks a little like a fish. It is handy in the middle of a chain of method calls, where there is no variable to annotate.

## Generics cost nothing at run time

When you call `largest` with `i32`, with `f64` and with `char`, the compiler generates three separate versions of the function, each made for one type, exactly as if you had written `largest_i32`, `largest_f64` and `largest_char` by hand. This process is called **monomorphization** (roughly: "making into single forms").

The result: generic code runs exactly as fast as code written for one specific type. You pay nothing when the program runs. The price is paid at compile time (more code to generate) and in the size of the finished program.

:::compare Generics in other languages
- **Java and C#:** also have generics with `<T>`. Java removes the type information when compiling ("type erasure") and stores everything as general objects, which costs some speed and memory for simple types like numbers.
- **C++:** templates work much like Rust's generics and are also monomorphized. A C++ template is only checked when it is used with a concrete type, which can give very long error messages. Rust checks a generic function once, against its trait bounds, and reports problems at the definition.
- **Go:** added generics in version 1.18 (2022), after ten years without them.
- **Python and JavaScript:** have no need for generics at run time, because any variable can hold any type. The type checkers for these languages (mypy, TypeScript) have generics for the same reason as Rust: to describe "the same type in, the same type out".
:::

## Const generics: a number as a parameter

A type parameter stands for a type. A **const generic** parameter stands for a *value* that is known at compile time. Its main use is the length of arrays:

```rust run
# #![allow(dead_code)]
fn sum<const N: usize>(numbers: [i32; N]) -> i32 {
    let mut total = 0;
    for n in numbers {
        total += n;
    }
    total
}

#[derive(Debug)]
struct Grid<const W: usize, const H: usize> {
    cells: [[u8; W]; H],
}

fn main() {
    println!("{}", sum([1, 2, 3]));          // N = 3
    println!("{}", sum([10, 20, 30, 40]));   // N = 4

    let grid: Grid<3, 2> = Grid { cells: [[0; 3]; 2] };
    println!("{:?}", grid);
}
```
```output
6
100
Grid { cells: [[0, 0, 0], [0, 0, 0]] }
```

`[i32; 3]` and `[i32; 4]` are different types. With `const N: usize`, one function covers arrays of every length. A `Grid<3, 2>` and a `Grid<8, 8>` are different types too, so the compiler can check that you do not mix up grids of different sizes.

:::recap
- A type parameter `<T>` is a blank that stands for a type. It is filled in when the generic item is used.
- Functions, structs, enums and `impl` blocks can be generic.
- A trait bound such as `T: PartialOrd` limits the blank to types with a certain ability, and allows you to use that ability inside.
- The compiler usually infers the types. If not, annotate the variable or use the turbofish `::<T>`.
- Monomorphization creates one specialised copy per type used, so generics have no run-time cost.
- `const N: usize` makes a value, such as an array length, a parameter.
:::

:::quiz Check your understanding
? What does the `<T>` in `fn first<T>(list: &[T]) -> &T` declare?
- A variable called `T`
+ A type parameter: a placeholder for a type that is chosen at each call
- A trait
- A constant
= `T` stands for a type. Each call of `first` fills it in, for example with `i32` or `String`.

? Why does this function not compile?
```rust
fn double<T>(x: T) -> T {
    x + x
}
```
- Generic functions cannot return values
- `T` must be written as `i32`
+ Not every type supports `+`. A trait bound is needed that guarantees `T` can be added
- `x` is used twice
= Without a bound, `T` could be any type, and the compiler only allows operations that every type has. The bound `T: std::ops::Add<Output = T> + Copy` would make it work.

? What is monomorphization?
- Checking types while the program runs
+ Generating a separate, specialised copy of generic code for each concrete type it is used with
- Converting all values to one common type
- Removing unused functions
= The compiler turns one generic definition into several concrete ones, so the running program has no extra work to do.

? Which line uses the turbofish correctly?
- `let n = "5".parse<i32>().unwrap();`
+ `let n = "5".parse::<i32>().unwrap();`
- `let n = "5".parse(i32).unwrap();`
- `let n = "5".<i32>parse().unwrap();`
= The type goes after `::` and inside angle brackets, between the function name and the parentheses.
:::

:::exercise guided A pair that can swap
Define a generic struct `Pair<T>` with the fields `first` and `second`, both of type `T`. Give it a method `swap(self) -> Pair<T>` that returns a new pair with the two values exchanged. Test it with numbers and with strings.
::hint
The method header is `fn swap(self) -> Pair<T>` inside `impl<T> Pair<T>`. It takes `self` by value, so it can move the fields into the new pair without copying.
::solution
```rust run
#[derive(Debug)]
struct Pair<T> {
    first: T,
    second: T,
}

impl<T> Pair<T> {
    fn swap(self) -> Pair<T> {
        Pair { first: self.second, second: self.first }
    }
}

fn main() {
    let numbers = Pair { first: 1, second: 2 };
    println!("{:?}", numbers.swap());

    let words = Pair { first: String::from("hello"), second: String::from("world") };
    println!("{:?}", words.swap());
}
```
```output
Pair { first: 2, second: 1 }
Pair { first: "world", second: "hello" }
```

`swap` needs no trait bound: moving a value is possible for every type. Because the method takes `self`, the old pair is used up and its fields move into the new one. Even for `String`s, no text is copied.
:::

:::exercise practice Largest without copying
Write `largest<T: PartialOrd>(list: &[T]) -> &T` that returns a **reference** to the largest element, so that it also works for `String`. Test it with a vector of `String`s.
::hint
Start with `let mut largest = &list[0];` and loop with `for item in list`. Both `item` and `largest` are `&T`, and references can be compared with `>` when `T` can.
::solution
```rust run
fn largest<T: PartialOrd>(list: &[T]) -> &T {
    let mut largest = &list[0];
    for item in list {
        if item > largest {
            largest = item;
        }
    }
    largest
}

fn main() {
    let names = vec![String::from("Lena"), String::from("Tomas"), String::from("Sara")];
    println!("{}", largest(&names));
    println!("{}", largest(&[4, 42, 8]));
}
```
```output
Tomas
42
```

Comparing two references compares the values they point to. Strings are compared alphabetically, so "Tomas" is the largest. This version asks less of `T` (only `PartialOrd`) and is therefore usable with more types. As a rule, ask for as few abilities as the function really needs.

The function panics on an empty list, because of `list[0]`. Returning `Option<&T>` would be the more careful design.
:::

:::exercise challenge A generic stack
Build a struct `Stack<T>` that wraps a `Vec<T>` and offers only these operations: `new()`, `push(&mut self, item: T)`, `pop(&mut self) -> Option<T>`, `peek(&self) -> Option<&T>` (look at the top element without removing it), `len(&self)` and `is_empty(&self)`. Test it with numbers and with strings.
::hint
The struct is `struct Stack<T> { items: Vec<T> }`. Every method passes its work on to the vector: `self.items.push(item)`, `self.items.pop()`, `self.items.last()`.
::solution
```rust run
struct Stack<T> {
    items: Vec<T>,
}

impl<T> Stack<T> {
    fn new() -> Self {
        Self { items: Vec::new() }
    }

    fn push(&mut self, item: T) {
        self.items.push(item);
    }

    fn pop(&mut self) -> Option<T> {
        self.items.pop()
    }

    fn peek(&self) -> Option<&T> {
        self.items.last()
    }

    fn len(&self) -> usize {
        self.items.len()
    }

    fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

fn main() {
    let mut numbers = Stack::new();
    numbers.push(1);
    numbers.push(2);
    println!("{:?} {}", numbers.peek(), numbers.len());
    println!("{:?} {:?} {:?}", numbers.pop(), numbers.pop(), numbers.pop());
    println!("{}", numbers.is_empty());

    let mut words: Stack<String> = Stack::new();
    words.push(String::from("bottom"));
    words.push(String::from("top"));
    println!("{:?}", words.pop());
}
```
```output
Some(2) 2
Some(2) Some(1) None
true
Some("top")
```

A stack is a pile: you add to the top and take from the top. The wrapper offers *less* than a `Vec`, on purpose. Users of `Stack` cannot insert in the middle or sort it, so the "last in, first out" rule always holds. For `numbers`, the compiler works out `T = i32` from the first `push`. The types in the signatures follow ownership: `pop` hands out the value itself, and `peek` only lends it.
:::
