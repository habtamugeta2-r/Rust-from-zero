@id traits
@part p4
@title Traits: shared behaviour
@short Traits
@level intermediate
@time 55
@learn Define a trait and implement it for your own types | Write functions that accept any type with a certain ability | Use the standard traits (`Debug`, `Display`, `Clone`, `PartialEq`, `Ord`, `Default`, `From`) | Store values of different types together with `dyn Trait` | Explain how traits replace inheritance

A struct describes what a value **is**. A **trait** describes what a value **can do**. Traits are how Rust expresses "these different types share an ability", and they are behind much of what you have used so far: printing with `{}`, comparing with `==`, cloning, and the bounds on generic functions.

:::analogy A job description
"Driver: can start, steer and stop a vehicle." The description says nothing about who the driver is: young or old, employee or freelancer. Anyone who has these skills can do the job, and whoever hires a driver can rely on the skills without knowing the person. A trait is a job description for types.
:::

## Defining and implementing a trait

```rust run
trait Describe {
    fn describe(&self) -> String;
}

struct Dog {
    name: String,
}

struct Car {
    brand: String,
    year: u32,
}

impl Describe for Dog {
    fn describe(&self) -> String {
        format!("a dog called {}", self.name)
    }
}

impl Describe for Car {
    fn describe(&self) -> String {
        format!("a {} built in {}", self.brand, self.year)
    }
}

fn main() {
    let dog = Dog { name: String::from("Rex") };
    let car = Car { brand: String::from("Volvo"), year: 2019 };
    println!("{}", dog.describe());
    println!("{}", car.describe());
}
```
```output
a dog called Rex
a Volvo built in 2019
```

- `trait Describe { ... }` defines the trait. Inside is a **method signature**: name, parameters and return type, ending with a semicolon and without a body. It says *what* a type must be able to do, not *how*.
- `impl Describe for Dog { ... }` **implements** the trait for a type: it supplies the body. The compiler checks that every required method is there and that the signatures match.

A dog and a car have nothing else in common. They now share one ability.

### Default methods

A trait can supply a body. Types then get the method for free, and may replace it with their own version:

```rust run
trait Greet {
    fn name(&self) -> String;

    fn greet(&self) -> String {
        format!("Hello, {}!", self.name())
    }
}

struct English;
struct Pirate;

impl Greet for English {
    fn name(&self) -> String {
        String::from("friend")
    }
}

impl Greet for Pirate {
    fn name(&self) -> String {
        String::from("matey")
    }

    fn greet(&self) -> String {
        format!("Ahoy, {}!", self.name())
    }
}

fn main() {
    println!("{}", English.greet());
    println!("{}", Pirate.greet());
}
```
```output
Hello, friend!
Ahoy, matey!
```

The default `greet` calls `name`, which has no default. This is a common design: a trait asks for one or two small methods and builds many useful ones on top. The standard `Iterator` trait asks for a single method, `next`, and gives you more than seventy others in return.

## Traits as parameters

Now the payoff. A function can accept **any type that implements a trait**:

```rust run
# trait Describe { fn describe(&self) -> String; }
# struct Dog { name: String }
# struct Car { brand: String, year: u32 }
# impl Describe for Dog { fn describe(&self) -> String { format!("a dog called {}", self.name) } }
# impl Describe for Car { fn describe(&self) -> String { format!("a {} built in {}", self.brand, self.year) } }
fn announce(item: &impl Describe) {
    println!("Look, {}!", item.describe());
}

fn main() {
    announce(&Dog { name: String::from("Rex") });
    announce(&Car { brand: String::from("Volvo"), year: 2019 });
}
```
```output
Look, a dog called Rex!
Look, a Volvo built in 2019!
```

`&impl Describe` reads "a reference to some type that implements `Describe`". It is a short way of writing a generic function with a trait bound. These three signatures mean the same:

```rust check
# trait Describe { fn describe(&self) -> String; }
fn announce_a(item: &impl Describe) {}

fn announce_b<T: Describe>(item: &T) {}

fn announce_c<T>(item: &T)
where
    T: Describe,
{
}
# fn main() {}
```

- The `impl Trait` form is the shortest. Use it for simple cases.
- The `<T: Trait>` form gives the type a name. You need it when two parameters must have the *same* type: `fn pair<T: Describe>(a: &T, b: &T)`.
- The `where` form moves the bounds below the signature. It keeps signatures readable when there are several parameters with several bounds.

Several bounds are joined with `+`:

```rust run
use std::fmt::{Debug, Display};

fn show_both<T: Debug + Display>(value: T) {
    println!("Display: {value}   Debug: {value:?}");
}

fn main() {
    show_both("hi");
    show_both(3.5);
}
```
```output
Display: hi   Debug: "hi"
Display: 3.5   Debug: 3.5
```

### Returning `impl Trait`

A function can also promise "I return some type that implements this trait" without naming the type:

```rust run
fn even_numbers(limit: u32) -> impl Iterator<Item = u32> {
    (0..=limit).filter(|n| n % 2 == 0)
}

fn main() {
    for n in even_numbers(8) {
        print!("{n} ");
    }
    println!();
}
```
```output
0 2 4 6 8
```

The real type returned here is long and awkward to write. The caller only needs to know that it can be iterated. You will use this form a lot with iterators and closures in Part 5.

#### Choosing which lifetimes `-> impl Trait` captures (`use<...>`)

In Rust 2024, a return type like `-> impl Iterator<Item = &str>` automatically captures **every** generic parameter and lifetime in the function signature—even parameters that the returned iterator never keeps a reference to. When a caller passes a temporary helper argument and drops it before consuming the iterator, the compiler complains that the helper is still borrowed.

Adding **`+ use<'a>`** (called **precise capturing**) tells the compiler explicitly which parameters the returned value may borrow:

```rust run
// Without `+ use<'a>`, Rust 2024 assumes the returned iterator borrows `needle` too.
// Because we copy `needle` into an owned `String`, the iterator borrows only `'a`.
fn matching_items<'a>(items: &'a [String], needle: &str) -> impl Iterator<Item = &'a str> + use<'a> {
    let needle = needle.to_owned();
    items.iter().map(|s| s.as_str()).filter(move |s| s.contains(needle.as_str()))
}

fn main() {
    let items = vec![
        String::from("rust-core"),
        String::from("async-io"),
        String::from("rust-web"),
    ];
    let temp_filter = String::from("rust");
    let iter = matching_items(&items, &temp_filter);
    drop(temp_filter); // Allowed only because `+ use<'a>` did not capture `&temp_filter`!
    let results: Vec<&str> = iter.collect();
    println!("{results:?}");
}
```
```output
["rust-core", "rust-web"]
```

You write `use<...>` most often on methods returning `impl Iterator` or `impl Future` (including methods in traits: `fn list(&self, filter: &str) -> impl Iterator<Item = &str> + use<'_>`). Inside `use<...>`, list every type parameter (`T`) and only the lifetimes (`'a` or `'_`) that the hidden return type actually holds onto.

## The standard traits you meet every day

The standard library defines traits for the common abilities. Many can be derived, as you saw in [chapter 12](#structs).

| Trait | Ability | How you get it |
|---|---|---|
| `Debug` | printing with `{:?}` for programmers | `#[derive(Debug)]` |
| `Display` | printing with `{}` for users | write it yourself |
| `Clone` | an explicit copy with `.clone()` | derive |
| `Copy` | implicit copies instead of moves | derive (only if all fields are `Copy`) |
| `PartialEq`, `Eq` | `==` and `!=` | derive |
| `PartialOrd`, `Ord` | `<`, `>`, sorting | derive (compares field by field, in order) |
| `Hash` | usable as a key in `HashMap` and `HashSet` | derive |
| `Default` | a sensible starting value with `Type::default()` | derive or write |
| `From`, `Into` | conversion from another type | write |
| `Drop` | code that runs when the value is destroyed | write (rarely needed) |

:::details Why are there `PartialEq` and `Eq`, `PartialOrd` and `Ord`?
The "partial" versions allow that some values cannot be compared. The floating-point value NaN ("not a number") is not equal to anything, not even to itself, and is neither smaller nor larger than any number. So `f64` has `PartialEq` and `PartialOrd`, but not `Eq` and `Ord`. That is the reason a float cannot be a `HashMap` key, and why sorting floats needs an extra word: `v.sort_by(|a, b| a.total_cmp(b))`.

For your own types: derive all four if every field supports them, and leave out `Eq` and `Ord` if a field is a float.
:::

### `Display`: your type in `{}`

```rust run
use std::fmt;

struct Money {
    cents: i64,
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "${}.{:02}", self.cents / 100, self.cents % 100)
    }
}

fn main() {
    let price = Money { cents: 1999 };
    println!("{price}");
    println!("The total is {}.", Money { cents: 250_005 });
    let text = price.to_string();     // comes for free with Display
    println!("{}", text.len());
}
```
```output
$19.99
The total is $2500.05.
6
```

The method `fmt` receives a "formatter" and writes into it with `write!`, which works like `println!` but sends the text to its first argument. Every type with `Display` gets the method `to_string()` automatically.

### Comparing and sorting

```rust run
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Version {
    major: u32,
    minor: u32,
    patch: u32,
}

fn main() {
    let a = Version { major: 1, minor: 4, patch: 2 };
    let b = Version { major: 1, minor: 10, patch: 0 };

    println!("{} {}", a == b, a < b);

    let mut versions = vec![b.clone(), a.clone(), Version { major: 0, minor: 9, patch: 9 }];
    versions.sort();
    for v in &versions {
        println!("{}.{}.{}", v.major, v.minor, v.patch);
    }
    println!("{:?}", versions.iter().max());
}
```
```output
false true
0.9.9
1.4.2
1.10.0
Some(Version { major: 1, minor: 10, patch: 0 })
```

The derived ordering compares the fields from top to bottom: first `major`, and only if those are equal, `minor`, and so on. So the order in which you write the fields matters.

### `Default`

```rust run
# #![allow(dead_code)]
#[derive(Debug, Default)]
struct Settings {
    volume: u8,
    username: String,
    dark_mode: bool,
}

fn main() {
    let plain = Settings::default();
    let custom = Settings { volume: 70, ..Default::default() };
    println!("{:?}", plain);
    println!("{:?}", custom);
}
```
```output
Settings { volume: 0, username: "", dark_mode: false }
Settings { volume: 70, username: "", dark_mode: false }
```

`..Default::default()` fills in "everything I did not mention" from the default value. It is a common way to build a struct with many optional settings.

### `From` and `Into`: conversions

`From` defines how to create a type from another type. You have used it from the start: `String::from("hello")`.

```rust run
struct Celsius(f64);
struct Fahrenheit(f64);

impl From<Celsius> for Fahrenheit {
    fn from(c: Celsius) -> Self {
        Fahrenheit(c.0 * 9.0 / 5.0 + 32.0)
    }
}

fn main() {
    let boiling = Fahrenheit::from(Celsius(100.0));
    let body: Fahrenheit = Celsius(37.0).into();     // `into` comes for free
    println!("{} {:.1}", boiling.0, body.0);

    let big: i64 = i64::from(7_i32);                 // lossless number conversion
    let text: String = "hello".into();
    println!("{big} {text}");
}
```
```output
212 98.6
7 hello
```

When you implement `From<A> for B`, you get `Into<B> for A` automatically, so `a.into()` works wherever the target type is clear. `From` is also what the `?` operator uses to convert errors, as you saw in [chapter 18](#errors). For conversions that can fail, there are `TryFrom` and `TryInto`, which return a `Result`:

```rust run
fn main() {
    let small: Result<u8, _> = u8::try_from(300_i32);
    let fits: Result<u8, _> = u8::try_from(200_i32);
    println!("{} {:?}", small.is_err(), fits);
}
```
```output
true Ok(200)
```

## Who may implement what

You can implement:

- **your trait** for any type, including types that are not yours, such as `i32` or `Vec<String>`,
- **any trait** for your type.

You cannot implement someone else's trait for someone else's type. `impl Display for Vec<String>` is refused, because both `Display` and `Vec` belong to the standard library. This is called the **orphan rule**. It makes sure that two crates can never supply conflicting implementations for the same combination. The usual way around it is a newtype: wrap the foreign type in your own struct, and implement the trait for that.

Adding a method to an existing type with your own trait looks like this:

```rust run
trait Shout {
    fn shout(&self) -> String;
}

impl Shout for str {
    fn shout(&self) -> String {
        format!("{}!", self.to_uppercase())
    }
}

fn main() {
    println!("{}", "hello".shout());
}
```
```output
HELLO!
```

A trait used this way is called an **extension trait**. The methods are only available where the trait is in scope. That explains a compiler message you will see sooner or later: "method not found … the trait `X` is implemented but not in scope". The cure is the `use` line that the compiler suggests.

## A list of different types: trait objects

Generic code is compiled separately for each concrete type. That fails for one task: a single collection holding **different** types. A `Vec<T>` has one element type.

```rust run
trait Shape {
    fn area(&self) -> f64;
    fn name(&self) -> String;
}

struct Circle {
    radius: f64,
}

struct Rectangle {
    width: f64,
    height: f64,
}

impl Shape for Circle {
    fn area(&self) -> f64 {
        3.14159 * self.radius * self.radius
    }
    fn name(&self) -> String {
        String::from("circle")
    }
}

impl Shape for Rectangle {
    fn area(&self) -> f64 {
        self.width * self.height
    }
    fn name(&self) -> String {
        String::from("rectangle")
    }
}

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![
        Box::new(Circle { radius: 1.0 }),
        Box::new(Rectangle { width: 2.0, height: 3.0 }),
        Box::new(Circle { radius: 0.5 }),
    ];

    for shape in &shapes {
        println!("{} with area {:.2}", shape.name(), shape.area());
    }
    let total: f64 = shapes.iter().map(|s| s.area()).sum();
    println!("total area {total:.2}");
}
```
```output
circle with area 3.14
rectangle with area 6.00
circle with area 0.79
total area 9.93
```

- **`dyn Shape`** means "a value of some type that implements `Shape`, and which type is only known while the program runs". Such a value is called a **trait object**.
- Different shapes have different sizes, so they cannot sit directly in a vector. **`Box::new(value)`** puts each value on the heap and keeps a pointer to it. All the pointers have the same size. [Chapter 27](#smart-pointers) covers `Box` in detail.
- When `shape.area()` is called, the program looks up at run time which `area` belongs to this value. This is called **dynamic dispatch**. Generic code decides at compile time (**static dispatch**).

| | Generics (`impl Trait`, `<T: Trait>`) | Trait objects (`dyn Trait`) |
|---|---|---|
| The concrete type is known | at compile time | at run time |
| Different types in one collection | no | yes |
| Speed | fastest. Calls can be fully optimised | a small cost per call (one lookup) |
| Program size | one copy of the code per type | one copy in total |

Use generics by default, and `dyn Trait` when you need to mix types in one place.

:::tip Enum or trait object?
In [chapter 13](#enums) you put different shapes into one `Vec` with an **enum**. When should you use which?

- An **enum**, when you know all the variants and the list is closed. Adding a new *operation* is easy: write one more function with a `match`.
- A **trait**, when others should be able to add new *types* later, without changing your code.
:::

## Traits in place of inheritance

:::compare Traits, interfaces and inheritance
- **Java, C#, Go, TypeScript interfaces** are the closest relatives of traits. Three differences: a Rust trait can be implemented for a type *after the fact*, even for a type from another library. Traits can have default methods and associated constants and types. And with generics, a trait is resolved at compile time, at no run-time cost.
- **Class inheritance** ("a `Dog` is an `Animal` and gets all its fields and methods") does not exist in Rust. Deep hierarchies of classes tend to become rigid: a change at the top affects everything below, and a class is forced into exactly one family tree. Rust follows the advice that many object-oriented programmers arrived at themselves: **prefer composition over inheritance**. Shared behaviour comes from traits, and shared data comes from putting one struct inside another.
- **Python and JavaScript** use "duck typing": if an object has a method `describe`, you can call it, and if not, the program fails at run time. A trait bound checks the same thing at compile time.
- **Haskell's type classes** are the direct ancestor of Rust's traits.
:::

A trait can require another trait. Every type that implements `Named` below must also implement `Display`:

```rust run
use std::fmt::Display;

trait Named: Display {
    fn badge(&self) -> String {
        format!("[ {self} ]")
    }
}

struct Guest(String);

impl Display for Guest {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl Named for Guest {}

fn main() {
    println!("{}", Guest(String::from("Sara")).badge());
}
```
```output
[ Sara ]
```

`Display` is called a **supertrait** of `Named`. This is the nearest thing Rust has to inheritance, and it applies to abilities only, never to data.

:::recap
- A trait is a named set of methods that types can implement. It describes an ability.
- `impl Trait for Type` supplies the methods. Traits can provide default methods.
- `&impl Trait` or `<T: Trait>` lets a function accept every type with that ability. `-> impl Trait` returns one.
- Common standard traits: `Debug`, `Display`, `Clone`, `Copy`, `PartialEq`, `Eq`, `PartialOrd`, `Ord`, `Hash`, `Default`, `From`/`Into`.
- The orphan rule: the trait or the type must be yours.
- `Box<dyn Trait>` holds a value whose concrete type is decided at run time. It allows mixed collections.
- Rust has no inheritance. Share behaviour with traits and data with composition.
:::

:::quiz Check your understanding
? What does a trait definition contain?
- The fields that a struct must have
+ The methods that a type must provide to have a certain ability, optionally with default bodies
- A list of types
- Variables that are shared between types
= A trait describes behaviour: method signatures, some of which may come with a default implementation. It never contains fields.

? What does the parameter `item: &impl Summary` accept?
- Only values of a type called `Summary`
+ A reference to a value of any type that implements the trait `Summary`
- Any value at all
- Only trait objects
= `impl Trait` in a parameter is shorthand for a generic type parameter with that trait bound.

? You wrote `impl From<Meters> for Feet`. What else do you get?
- `Feet` can now be printed
+ `meters.into()` converts to `Feet` wherever the target type is known
- `Feet` can be converted back to `Meters`
- Nothing
= The standard library implements `Into<B> for A` automatically for every `From<A> for B`. The reverse conversion needs its own `impl`.

? Why is `impl std::fmt::Display for Vec<i32>` not allowed in your crate?
- `Vec` cannot be printed
- `Display` cannot be implemented by hand
+ Neither the trait nor the type is defined in your crate (the orphan rule)
- Generic types cannot implement traits
= At least one of the two must be local. Otherwise two crates could implement the same trait for the same type differently. Wrap the vector in your own struct to get around it.

? When do you need `Box<dyn Shape>` and not a generic `T: Shape`?
- When speed matters most
+ When one collection has to hold values of different types that all implement `Shape`
- When the trait has default methods
- Always. Generics do not work with traits
= A `Vec<T>` holds one type. Trait objects let each element be a different concrete type, at the cost of a run-time lookup per call.
:::

:::exercise guided Things with an area
Define a trait `HasArea` with one method `area(&self) -> f64`. Implement it for `Square { side: f64 }` and `Triangle { base: f64, height: f64 }`. Write a generic function `print_area` that accepts anything with `HasArea`.
::hint
The area of a triangle is `0.5 * base * height`. The function can be written as `fn print_area(shape: &impl HasArea)`.
::solution
```rust run
trait HasArea {
    fn area(&self) -> f64;
}

struct Square {
    side: f64,
}

struct Triangle {
    base: f64,
    height: f64,
}

impl HasArea for Square {
    fn area(&self) -> f64 {
        self.side * self.side
    }
}

impl HasArea for Triangle {
    fn area(&self) -> f64 {
        0.5 * self.base * self.height
    }
}

fn print_area(shape: &impl HasArea) {
    println!("The area is {}.", shape.area());
}

fn main() {
    print_area(&Square { side: 3.0 });
    print_area(&Triangle { base: 4.0, height: 5.0 });
}
```
```output
The area is 9.
The area is 10.
```

`print_area` knows nothing about squares or triangles. It relies on one promise: the value has an `area` method. A new shape written next year works with it unchanged, as soon as it implements the trait.
:::

:::exercise practice Display for a point
Implement `Display` for `struct Point { x: i32, y: i32 }` so that `println!("{p}")` prints `(3, -7)`. Then use `to_string()` to check that the text has 7 characters.
::hint
Copy the shape of the `Money` example: `impl fmt::Display for Point` with `fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result`, and inside it `write!(f, "({}, {})", self.x, self.y)`.
::solution
```rust run
use std::fmt;

struct Point {
    x: i32,
    y: i32,
}

impl fmt::Display for Point {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "({}, {})", self.x, self.y)
    }
}

fn main() {
    let p = Point { x: 3, y: -7 };
    println!("{p}");
    println!("{}", p.to_string().len());
}
```
```output
(3, -7)
7
```

`write!` returns a `fmt::Result`, which is exactly what `fmt` must return, so it is the last expression without a semicolon. `Debug` is for programmers and can be derived. `Display` is for users, so Rust asks you to decide yourself how the value should look.
:::

:::exercise practice A zoo of sounds
Define a trait `Animal` with the methods `name(&self) -> String` and `sound(&self) -> String`, and a default method `speak(&self) -> String` that returns, for example, `Rex says woof`. Implement it for `Dog` and `Cat`, put two dogs and a cat into one `Vec`, and let each one speak.
::hint
The vector's type is `Vec<Box<dyn Animal>>`, and each element is created with `Box::new(...)`.
::solution
```rust run
trait Animal {
    fn name(&self) -> String;
    fn sound(&self) -> String;

    fn speak(&self) -> String {
        format!("{} says {}", self.name(), self.sound())
    }
}

struct Dog {
    name: String,
}

struct Cat;

impl Animal for Dog {
    fn name(&self) -> String {
        self.name.clone()
    }
    fn sound(&self) -> String {
        String::from("woof")
    }
}

impl Animal for Cat {
    fn name(&self) -> String {
        String::from("The cat")
    }
    fn sound(&self) -> String {
        String::from("meow")
    }
}

fn main() {
    let animals: Vec<Box<dyn Animal>> = vec![
        Box::new(Dog { name: String::from("Rex") }),
        Box::new(Cat),
        Box::new(Dog { name: String::from("Bella") }),
    ];
    for animal in &animals {
        println!("{}", animal.speak());
    }
}
```
```output
Rex says woof
The cat says meow
Bella says woof
```

`speak` is written once, in the trait, and works for every animal, because it only uses the two required methods. The vector holds boxes of `dyn Animal`, so a `Dog` and a `Cat` can sit side by side, and the right `name` and `sound` are found at run time.
:::

:::exercise challenge Sort people your way
Define `struct Person { name: String, age: u32 }` and derive what is needed so that a `Vec<Person>` can be sorted with `.sort()`, **by age first** and then by name. Then sort the same list by name only, using `sort_by`.
::hint
Derived ordering compares fields from top to bottom, so declare `age` before `name`. You need `PartialEq, Eq, PartialOrd, Ord`. For the second sort: `people.sort_by(|a, b| a.name.cmp(&b.name));`.
::solution
```rust run
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Person {
    age: u32,
    name: String,
}

fn main() {
    let mut people = vec![
        Person { age: 35, name: String::from("Lena") },
        Person { age: 29, name: String::from("Tomas") },
        Person { age: 29, name: String::from("Sara") },
    ];

    people.sort();
    for p in &people {
        println!("{} {}", p.age, p.name);
    }

    people.sort_by(|a, b| a.name.cmp(&b.name));
    let names: Vec<&str> = people.iter().map(|p| p.name.as_str()).collect();
    println!("{:?}", names);
}
```
```output
29 Sara
29 Tomas
35 Lena
["Lena", "Sara", "Tomas"]
```

The derived `Ord` gives the type one "natural" order, which `sort()` uses. For any other order, `sort_by` takes a small function that compares two elements. `cmp` returns an `Ordering`: `Less`, `Equal` or `Greater`. A shorter form for sorting by one field is `people.sort_by_key(|p| p.age)`.
:::
