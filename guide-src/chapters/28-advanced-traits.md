@id advanced-traits
@part p3b
@title Traits in depth
@short Traits in depth
@level advanced
@time 50
@learn Use associated types and constants, and know when to prefer them to generic parameters | Overload operators such as `+` and `==` for your own types | Implement a trait for many types at once with a blanket implementation | Explain what makes a trait usable as `dyn Trait` | Recognise the marker traits `Sized`, `Send` and `Sync`

The earlier [traits chapter](#traits) introduced implementations and bounds. Here we examine features used to design flexible libraries: associated types, operator traits, supertraits, blanket implementations and other advanced patterns. The examples explain what each feature enables and the constraints it adds, so you can return to a section when a design calls for it.

:::plain Associated types, GATs, and operator traits
Chapter 25's traits described what a type can *do*; the advanced forms describe how traits combine. An **associated type** (`type Item`) makes a trait carry one type per implementation, which is why `Iterator` can only yield one kind of value. A **super-trait** (`trait Sorted: Ord`) requires implementors to satisfy another trait first. **Operator traits** (`Add`, `Index`, `Deref`) are ordinary traits that overload syntax, and `impl Trait` in argument and return position hides a concrete type without a `Box`. **Blanket implementations** give a method to every type that meets a bound, and **trait objects** (`dyn Trait`) trade static dispatch for one vtable lookup.
:::

:::analogy A manager with special rules
A trait is like a job description: it says what a type must be able to do. Associated types are the extra details that each person in that role supplies, like "this team produces numbers, that team produces strings".
:::

## Associated types

:::analogy A country's power socket vs a universal adapter
Every `Iterator` implementation has one natural element type (`Item`), just as each country's wall socket delivers one fixed voltage: you plug in and ask for `Self::Item` without listing extra parameters. By contrast, a generic trait parameter (`From<T>`) is like a travel adapter that can have many implementations (`From<&str>`, `From<char>`, `From<Box<str>>`) for the very same `String` type.
:::

The `Iterator` trait has a line `type Item;`. That is an **associated type**: a type that each implementation of the trait chooses, once.

```rust run
trait Container {
    type Item;

    fn first(&self) -> Option<&Self::Item>;
    fn size(&self) -> usize;
}

struct Names(Vec<String>);
struct Scores(Vec<u32>);

impl Container for Names {
    type Item = String;

    fn first(&self) -> Option<&String> {
        self.0.first()
    }
    fn size(&self) -> usize {
        self.0.len()
    }
}

impl Container for Scores {
    type Item = u32;

    fn first(&self) -> Option<&u32> {
        self.0.first()
    }
    fn size(&self) -> usize {
        self.0.len()
    }
}

fn describe<C: Container>(c: &C) -> String
where
    C::Item: std::fmt::Debug,
{
    format!("{} items, first: {:?}", c.size(), c.first())
}

fn main() {
    println!("{}", describe(&Names(vec![String::from("Sara")])));
    println!("{}", describe(&Scores(vec![93, 71])));
}
```
```output
1 items, first: Some("Sara")
2 items, first: Some(93)
```

Inside the trait, the type is written `Self::Item`. From outside, it is `C::Item`, and it can have bounds of its own, as in the `where` clause above.

### Associated type or generic parameter?

A trait could also take a type parameter: `trait Container<T>`. The difference:

| | `trait Convert<T>` (generic parameter) | `trait Iterator { type Item; }` (associated type) |
|---|---|---|
| Implementations per type | many: one for each `T` | exactly one |
| Who chooses the type | the user of the trait | the implementer |
| Example | `From<T>`: a `String` can be made from `&str`, from `char`, from `Box<str>`, … | `Iterator`: a given iterator yields one kind of item |

The question to ask: *can a type sensibly implement this trait several times, with different types?* If yes, use a generic parameter. If there is one natural answer per type, use an associated type. It keeps signatures shorter, because users write `impl Iterator<Item = u32>` and the compiler never has to guess.

### Generic associated types: a type that depends on a lifetime

Everything above has one hidden limitation: an associated type cannot mention a lifetime. `type Item = &str` is not a type — it is missing the lifetime of the borrow — and `type Item<'a>` was not allowed until 2022. A **generic associated type**, or **[[GAT]]**, lets the associated type take parameters of its own, and the usual parameter is a lifetime.

The difference is easiest to see on a type that lends out a view of its insides:

```rust run
/// A type that can hand out a borrowed view of itself.
trait View {
    type Item<'a> where Self: 'a;

    fn view(&self) -> Self::Item<'_>;
}

struct Report {
    title: String,
    rows: Vec<u32>,
}

impl View for Report {
    type Item<'a> = (&'a str, &'a [u32]) where Self: 'a;

    fn view(&self) -> Self::Item<'_> {
        (&self.title, &self.rows)
    }
}

fn main() {
    let report = Report {
        title: String::from("sales"),
        rows: vec![3, 5, 8],
    };
    let (title, rows) = report.view();
    println!("{title}: {rows:?}");
}
```
```output
sales: [3, 5, 8]
```

Read the impl line by line:

- `type Item<'a> = (&'a str, &'a [u32])` — the associated type now *has* a lifetime, and that lifetime is supplied by the method that uses it. Each call to `view` picks a lifetime; the compiler chooses one no longer than the borrow.
- `where Self: 'a` — the promise that the value itself outlives the borrow it lends. Without it, a `&'a str` taken from `self` could outlive `self`, which is the dangling-reference bug Rust exists to prevent. The compiler will not accept a GAT impl that needs this bound and omits it, and the error message says so.
- `fn view(&self) -> Self::Item<'_>` — the `'_` is the elided lifetime of `&self`, so the returned tuple cannot outlive the borrow. Try to keep it after the `Report` is dropped and the borrow checker refuses, exactly as it would for a plain `&str`.

The pattern GATs were stabilised for is the **lending iterator**: an iterator whose `next` returns items that borrow from the iterator itself. The signature says it all —

```text
trait LendingIterator {
    type Item<'a> where Self: 'a;
    fn next<'a>(&'a mut self) -> Option<Self::Item<'a>>;
}
```

— and the ordinary `Iterator` trait cannot express it, because `type Item` has no lifetime to lend. This is why `Iterator` only ever yields owned values or references borrowed from somewhere else. The three places GATs earn their keep:

1. **Lending iterators**, as above: cursors over a buffer, parsers that yield borrowed tokens, streaming decoders.
2. **Traits over async or fallible work**, where the "output" borrows from the input — the reason the `async-trait` crate existed before async functions in traits.
3. **Borrowing views** of a container, like `View` above: an associated type that is a projection into `self`.

They are stable since Rust 1.65, so no feature flag is needed; you will meet them mostly when reading library code rather than when writing it. When you do write one, two rules save hours: put the `where Self: 'a` bound on both the trait and the impl, and keep the borrow as short as the method allows rather than trying to return it from a longer-lived function.

### Associated constants

A trait can also demand a constant:

```rust run
trait Shape {
    const SIDES: u32;
    const NAME: &'static str;

    fn describe() -> String {
        format!("A {} has {} sides.", Self::NAME, Self::SIDES)
    }
}

struct Triangle;
struct Square;

impl Shape for Triangle {
    const SIDES: u32 = 3;
    const NAME: &'static str = "triangle";
}

impl Shape for Square {
    const SIDES: u32 = 4;
    const NAME: &'static str = "square";
}

fn main() {
    println!("{}", Triangle::describe());
    println!("{}", Square::describe());
    println!("{}", u8::MAX);       // the limits of number types are associated constants too
}
```
```output
A triangle has 3 sides.
A square has 4 sides.
255
```

`describe` has no `self` parameter. It is an associated function of the trait and is called on the type: `Triangle::describe()`.

## Operator overloading

When you write `a + b`, Rust calls `a.add(b)`, a method of the trait `std::ops::Add`. Implement the trait for your type, and the operator works for it. This is called **operator overloading**.

```rust run
use std::ops::{Add, AddAssign, Mul, Neg, Sub};

#[derive(Debug, Clone, Copy, PartialEq)]
struct Vec2 {
    x: f64,
    y: f64,
}

impl Add for Vec2 {
    type Output = Vec2;

    fn add(self, other: Vec2) -> Vec2 {
        Vec2 { x: self.x + other.x, y: self.y + other.y }
    }
}

impl Sub for Vec2 {
    type Output = Vec2;

    fn sub(self, other: Vec2) -> Vec2 {
        Vec2 { x: self.x - other.x, y: self.y - other.y }
    }
}

// a vector times a number: the right-hand side has a different type
impl Mul<f64> for Vec2 {
    type Output = Vec2;

    fn mul(self, factor: f64) -> Vec2 {
        Vec2 { x: self.x * factor, y: self.y * factor }
    }
}

impl Neg for Vec2 {
    type Output = Vec2;

    fn neg(self) -> Vec2 {
        Vec2 { x: -self.x, y: -self.y }
    }
}

impl AddAssign for Vec2 {
    fn add_assign(&mut self, other: Vec2) {
        self.x += other.x;
        self.y += other.y;
    }
}

fn main() {
    let a = Vec2 { x: 1.0, y: 2.0 };
    let b = Vec2 { x: 0.5, y: -1.0 };

    println!("{:?}", a + b);
    println!("{:?}", a - b);
    println!("{:?}", a * 3.0);
    println!("{:?}", -a);

    let mut position = a;
    position += b;
    println!("{:?} {}", position, position == a + b);
}
```
```output
Vec2 { x: 1.5, y: 1.0 }
Vec2 { x: 0.5, y: 3.0 }
Vec2 { x: 3.0, y: 6.0 }
Vec2 { x: -1.0, y: -2.0 }
Vec2 { x: 1.5, y: 1.0 } true
```

- `type Output` is an associated type: the type of the result.
- `Mul<f64>` uses the trait's generic parameter for the right-hand side. That is why `Add` has both: the right-hand type is chosen by a parameter (a type may be added to several other types), and for each such pair there is one output type.
- The type is `Copy`, so `a` and `b` can be used again after `a + b`. Without `Copy`, the operator would move its operands, since `add` takes `self`.

| Operator | Trait | Operator | Trait |
|---|---|---|---|
| `a + b` | `Add` | `a += b` | `AddAssign` |
| `a - b` | `Sub` | `-a` | `Neg` |
| `a * b` | `Mul` | `!a` | `Not` |
| `a / b` | `Div` | `a[i]` | `Index`, `IndexMut` |
| `a % b` | `Rem` | `a == b` | `PartialEq` |
| `a & b`, `a \| b`, `a ^ b` | `BitAnd`, `BitOr`, `BitXor` | `a < b` | `PartialOrd` |
| `a << b`, `a >> b` | `Shl`, `Shr` | `*a` | `Deref`, `DerefMut` |

:::tip Overload with restraint
Give an operator only its usual meaning. `+` for vectors, money or durations is clear. `+` for "add a user to a group" is a puzzle for every reader. Rust has a fixed set of operators. You cannot invent new ones.
:::

### Writing `PartialEq` and `Ord` by hand

Usually you derive comparisons. Write them yourself when equality or order should not look at every field:

```rust run
use std::cmp::Ordering;

#[derive(Debug)]
struct Player {
    name: String,
    score: u32,
    last_login: u64,     // should not matter for equality or order
}

impl PartialEq for Player {
    fn eq(&self, other: &Self) -> bool {
        self.name == other.name && self.score == other.score
    }
}

impl Eq for Player {}

impl Ord for Player {
    fn cmp(&self, other: &Self) -> Ordering {
        // higher score first, then name in alphabetical order
        other.score.cmp(&self.score).then_with(|| self.name.cmp(&other.name))
    }
}

impl PartialOrd for Player {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn main() {
    let mut players = vec![
        Player { name: String::from("Tomas"), score: 70, last_login: 5 },
        Player { name: String::from("Lena"), score: 95, last_login: 9 },
        Player { name: String::from("Abel"), score: 70, last_login: 1 },
    ];
    players.sort();
    for p in &players {
        println!("{} {}", p.score, p.name);
    }
    let again = Player { name: String::from("Lena"), score: 95, last_login: 77 };
    println!("{} (logins {} and {})", players[0] == again, players[0].last_login, again.last_login);
}
```
```output
95 Lena
70 Abel
70 Tomas
true (logins 9 and 77)
```

`then_with` chains comparisons: if the first one says "equal", the second decides. Write `Ord::cmp` once, and let `partial_cmp` call it, so that the two can never disagree. Keep `==` consistent with `cmp`, too: two values that compare as `Equal` must also be `==`.

## Blanket implementations

An `impl` can cover **every type that fulfils a bound**, all at once:

```rust run
use std::fmt::Display;

trait Loud {
    fn loud(&self) -> String;
}

// for every type T that implements Display
impl<T: Display> Loud for T {
    fn loud(&self) -> String {
        format!("{}!!!", self.to_string().to_uppercase())
    }
}

fn main() {
    println!("{}", "hello".loud());
    println!("{}", 42.loud());
    println!("{}", 2.5.loud());
    println!("{}", true.loud());
}
```
```output
HELLO!!!
42!!!
2.5!!!
TRUE!!!
```

One `impl` block gave the method `loud` to strings, numbers, booleans, and to every type anybody will ever write that implements `Display`. This is a **blanket implementation**.

The standard library uses the technique in several well-known places:

- `impl<T: Display> ToString for T` is why everything that can be printed has `.to_string()`.
- `impl<T, U: From<T>> Into<U> for T` is why implementing `From` gives you `.into()` for free.
- `impl<I: Iterator> IntoIterator for I` is why every iterator can be used in a `for` loop.

## Two methods with the same name

Two traits may define methods with the same name, and a type may implement both. A plain method call then picks the type's own method, if it has one. To choose another, name the trait:

```rust run
trait Pilot {
    fn fly(&self) -> String;
}

trait Wizard {
    fn fly(&self) -> String;
    fn title() -> String;
}

struct Human;

impl Pilot for Human {
    fn fly(&self) -> String {
        String::from("This is your captain speaking.")
    }
}

impl Wizard for Human {
    fn fly(&self) -> String {
        String::from("Up!")
    }
    fn title() -> String {
        String::from("wizard")
    }
}

impl Human {
    fn fly(&self) -> String {
        String::from("*waves arms*")
    }
}

fn main() {
    let person = Human;
    println!("{}", person.fly());                  // the type's own method
    println!("{}", Pilot::fly(&person));           // the method from Pilot
    println!("{}", Wizard::fly(&person));          // the method from Wizard
    println!("{}", <Human as Wizard>::title());    // an associated function, fully qualified
}
```
```output
*waves arms*
This is your captain speaking.
Up!
wizard
```

The form `<Type as Trait>::function(...)` is the **fully qualified syntax**. It is the most explicit way to say which function you mean, and it always works. You need it rarely, mostly for associated functions without `self`, where there is no argument that tells the compiler the type.

## The newtype pattern and the orphan rule

The orphan rule from [chapter 25](#traits) forbids implementing a foreign trait for a foreign type. The way around it is a newtype: a tuple struct of your own with one field.

```rust run
use std::fmt;

struct Wrapper(Vec<String>);

impl fmt::Display for Wrapper {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "[{}]", self.0.join(" | "))
    }
}

fn main() {
    let list = Wrapper(vec![String::from("tea"), String::from("milk")]);
    println!("{list}");
    println!("{}", list.0.len());        // the inner value is reached with .0
}
```
```output
[tea | milk]
2
```

`Wrapper` is your type, so you may implement any trait for it. The wrapper costs nothing at run time: it has exactly the same memory layout as the vector inside. The price is that the methods of `Vec` are not available on `Wrapper` directly. You reach them through `.0`, or pass the calls on, or implement `Deref`.


### The opposite wish: a trait nobody else may implement

Sometimes a library wants everybody to *use* a trait, but nobody outside to *implement* it. Then the library can add methods to the trait later without breaking anyone's code, and it knows the complete list of implementing types. The trick is a supertrait that outsiders cannot name. Such a trait is called a **sealed trait**:

```rust fail E0277
mod shapes {
    mod private {
        pub trait Sealed {}
    }

    pub trait Shape: private::Sealed {
        fn area(&self) -> f64;
    }

    pub struct Square(pub f64);

    impl private::Sealed for Square {}

    impl Shape for Square {
        fn area(&self) -> f64 {
            self.0 * self.0
        }
    }
}

struct Triangle;

impl shapes::Shape for Triangle {
    fn area(&self) -> f64 {
        0.0
    }
}

fn main() {}
```
```error auto nosoft
```

The compiler even knows the name of the trick: the last `note` of the message calls `Shape` a "sealed trait". `Shape` requires `Sealed`, and `Sealed` lives in a private module. Code outside `shapes` can call `area` on a `Square`, but it cannot write `impl shapes::private::Sealed for Triangle`, so it cannot implement `Shape` either. Many traits in the standard library and in popular crates are sealed in this way.

## What can be a `dyn Trait`?

Not every trait can be used as a trait object. A `dyn Trait` value has forgotten its concrete type, and some methods cannot work without it. A trait is **[[dyn]] compatible** (older texts say "object safe") if, roughly:

- none of its methods has a generic type parameter,
- none of its methods returns `Self` or takes another `Self` by value,
- it does not require `Self: Sized`.

```rust fail E0038
trait Duplicate {
    fn duplicate(&self) -> Self;
}

fn copy_all(items: &[Box<dyn Duplicate>]) {}

fn main() {}
```
```error auto
```

`duplicate` returns `Self`. For a `dyn Duplicate`, nobody knows what `Self` is or how large it is. This is the reason `Clone` cannot be used as `dyn Clone`.

The message mentions a **vtable** ("virtual method table"). That is the small table of function addresses that every trait object carries with it. Through it, the program finds the right method at run time. [Chapter 41](#memory-layout) shows what it looks like in memory.

You can keep such a method in a trait and still use the trait as an object, by telling the compiler that this one method is not available on trait objects:

```rust run
trait Shape {
    fn area(&self) -> f64;

    fn scaled(&self, factor: f64) -> Self
    where
        Self: Sized;                 // only callable when the concrete type is known
}

struct Square(f64);

impl Shape for Square {
    fn area(&self) -> f64 {
        self.0 * self.0
    }
    fn scaled(&self, factor: f64) -> Self {
        Square(self.0 * factor)
    }
}

fn main() {
    let shapes: Vec<Box<dyn Shape>> = vec![Box::new(Square(2.0)), Box::new(Square(3.0))];
    let total: f64 = shapes.iter().map(|s| s.area()).sum();
    println!("{total} {}", Square(2.0).scaled(2.0).area());
}
```
```output
13 16
```


## Asking for the concrete type: `Any`

A `&dyn Shape` has forgotten which type it points to. Rust has one small tool for asking: the trait **`Any`**, which is implemented for every type that holds no borrowed data. Its method `downcast_ref::<T>()` returns `Some` only if the value really is a `T`:

```rust run
use std::any::Any;

fn describe(value: &dyn Any) -> String {
    if let Some(number) = value.downcast_ref::<i32>() {
        format!("the number {number}")
    } else if let Some(text) = value.downcast_ref::<String>() {
        format!("the text {text:?}")
    } else {
        String::from("something else")
    }
}

fn main() {
    println!("{}", describe(&42));
    println!("{}", describe(&String::from("hi")));
    println!("{}", describe(&3.5));
    println!("{}", std::any::type_name::<Vec<Option<u8>>>());
}
```
```output auto
```

That is all the "reflection" Rust has. A program cannot list the fields or methods of a type while it runs. (`type_name` is meant for log messages only.)

The place where you will meet downcasting most often is error handling. A `Box<dyn Error>` hides the error type, and `downcast_ref` brings it back when you need to react to one particular kind:

```rust run
use std::error::Error;
use std::num::ParseIntError;

fn parse(text: &str) -> Result<i32, Box<dyn Error>> {
    Ok(text.parse::<i32>()?)
}

fn main() {
    let error = parse("x").unwrap_err();
    match error.downcast_ref::<ParseIntError>() {
        Some(e) => println!("a problem with a number: {e}"),
        None => println!("another problem: {error}"),
    }
}
```
```output auto
```

:::warn Downcasting is a last resort
A chain of `downcast_ref` calls is a `match` that the compiler cannot check: add a new type, and nothing tells you that a case is missing. If you know the possible types, use an enum. If the types share behaviour, put a method in the trait. Keep `Any` for the few places that truly store "anything", such as the error boxes above, or a container that holds one value per type.
:::

## Marker traits: `Sized`, `Send`, `Sync`, `Copy`

Some traits have no methods. They only state a fact about a type, which the compiler uses. They are called **marker traits**.

- **`Copy`** you know: values are duplicated instead of moved.
- **`Sized`** means "the size of this type is known at compile time". Nearly all types are `Sized`. The exceptions are `str`, slices `[T]`, and `dyn Trait`, which is why you only meet them behind a pointer: `&str`, `&[T]`, `Box<dyn Trait>`. Every generic parameter has an invisible `T: Sized` bound. Writing `T: ?Sized` removes it and allows these types too:

```rust run
use std::fmt::Debug;

fn show<T: Debug + ?Sized>(value: &T) {
    println!("{:?}", value);
}

fn main() {
    show("a str is not Sized");     // T = str
    show(&[1, 2, 3][..]);           // T = [i32]
    show(&42);                      // T = i32
}
```
```output
"a str is not Sized"
[1, 2, 3]
42
```

- **`Send`** means "a value of this type can be handed to another thread". **`Sync`** means "a value of this type can be used from several threads at the same time, through shared references". The compiler works these out for every type automatically, and uses them to reject programs with data races. They are the foundation of [Part 11](#threads).

## Traits with generic methods and supertraits, together

A realistic example brings several features together: a small plug-in system for text filters.

```rust run
use std::fmt::Debug;

trait Filter: Debug {
    const NAME: &'static str;

    fn apply(&self, text: &str) -> String;

    fn describe(&self) -> String {
        format!("{} ({:?})", Self::NAME, self)
    }
}

#[derive(Debug)]
struct Upper;

#[derive(Debug)]
struct Repeat {
    times: usize,
}

impl Filter for Upper {
    const NAME: &'static str = "upper";

    fn apply(&self, text: &str) -> String {
        text.to_uppercase()
    }
}

impl Filter for Repeat {
    const NAME: &'static str = "repeat";

    fn apply(&self, text: &str) -> String {
        text.repeat(self.times)
    }
}

fn run<A: Filter, B: Filter>(first: &A, second: &B, input: &str) -> String {
    println!("running {} then {}", first.describe(), second.describe());
    second.apply(&first.apply(input))
}

fn main() {
    println!("{}", run(&Upper, &Repeat { times: 2 }, "ab "));
}
```
```output
running upper (Upper) then repeat (Repeat { times: 2 })
AB AB 
```

`Filter: Debug` is a supertrait: every filter must be printable, and the default method `describe` relies on it. `NAME` is an associated constant. `run` is generic over two independent filter types and is compiled separately for each pair that is used.

:::compare How other languages do these things
- **Operator overloading** exists in C++, Python (`__add__`), C# and Kotlin. Java and Go do not have it. Rust's version is limited to a fixed list of operators, each tied to one trait.
- **Blanket implementations** have no real counterpart in Java or C#. The nearest relatives are extension methods (C#, Kotlin), and Haskell's type class instances with constraints, which inspired the feature.
- **Associated types** correspond to Haskell's associated type families and Swift's `associatedtype`. C++ uses nested `typedef`s in templates for a similar purpose.
:::

:::recap
- An associated type is chosen once per implementation (`type Item = u32;`). Use a generic parameter when a type should implement the trait several times.
- Traits can require constants (`const NAME: &str;`).
- Operators are traits from `std::ops`. Implement `Add` to make `+` work.
- A blanket implementation (`impl<T: Display> Loud for T`) covers all types with a given ability.
- `<Type as Trait>::function()` says exactly which implementation to call.
- A newtype lets you implement foreign traits for foreign data.
- A trait is usable as `dyn Trait` only if its methods work without knowing the concrete type.
- `Sized`, `Send`, `Sync` and `Copy` are marker traits: facts about a type, with no methods.
:::

:::quiz Check your understanding
? Why does `Iterator` use an associated type `Item` and not a generic parameter `Iterator<T>`?
- Associated types are faster
+ A given iterator type yields one kind of item, so there should be exactly one implementation per type
- Generic parameters are not allowed in traits
- So that iterators can be endless
= With `Iterator<T>`, one type could implement `Iterator<u32>` and `Iterator<String>` at once, and every call of `next` would be ambiguous. An associated type fixes the item type per implementation.

? Why does a generic associated type often need the bound `where Self: 'a`?
- To make the type copyable
- Because lifetimes cannot appear in associated types otherwise
+ Because the item borrows from `self`, and the compiler must know that `self` outlives that borrow
- Because `'a` must outlive the program
= The GAT promises `type Item<'a>`, and an implementation may hand out `&'a str` taken from `self`. Without `Self: 'a` the borrow could outlive the value it points into, which is exactly the dangling reference the borrow checker exists to reject. The bound states the relationship once, so every caller gets it checked.

? What must you implement so that `a + b` works for your type `Money`?
- A method called `plus`
- `impl Money { fn add(...) }`
- Nothing. It works for all structs
+ The trait `std::ops::Add` for `Money`
= The `+` operator is syntax for the `add` method of the `Add` trait. Only types that implement the trait can be added.

? What does `impl<T: Display> Summary for T { ... }` do?
+ It implements `Summary` for every type that implements `Display`
- It implements `Display` for all types
- It creates a new type `T`
- It is an error, because `T` is not a concrete type
= This is a blanket implementation. Every present and future type with `Display` gets `Summary`.

? Why can the trait `Clone` not be used as `Box<dyn Clone>`?
- `Clone` has no methods
+ Its method returns `Self`, and behind `dyn` the concrete type and its size are unknown
- `Clone` is private
- Trait objects cannot be boxed
= A method that returns `Self` by value needs the concrete type. That makes the trait not dyn compatible.

? Which of these types is **not** `Sized`?
- `i32`
- `String`
+ `str`
- `Box<str>`
= `str` is text of unknown length, so its size is not known at compile time. `String` and `Box<str>` are pointers with a fixed size.
:::

:::exercise guided Money that adds up
Define `struct Money { cents: i64 }` and implement `Add` (money plus money), `Mul<i64>` (money times a whole number), and `Display` (so that 1250 cents print as `12.50`). Compute the price of 3 items at 4.99 plus 2.50 for shipping.
::hint
`impl Add for Money { type Output = Money; fn add(self, other: Money) -> Money { ... } }`. Derive `Clone, Copy` so that values can be reused. For `Display`: `write!(f, "{}.{:02}", self.cents / 100, self.cents % 100)`.
::solution
```rust run
use std::fmt;
use std::ops::{Add, Mul};

#[derive(Debug, Clone, Copy, PartialEq)]
struct Money {
    cents: i64,
}

impl Add for Money {
    type Output = Money;

    fn add(self, other: Money) -> Money {
        Money { cents: self.cents + other.cents }
    }
}

impl Mul<i64> for Money {
    type Output = Money;

    fn mul(self, quantity: i64) -> Money {
        Money { cents: self.cents * quantity }
    }
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}.{:02}", self.cents / 100, self.cents % 100)
    }
}

fn main() {
    let price = Money { cents: 499 };
    let shipping = Money { cents: 250 };
    let total = price * 3 + shipping;
    println!("{total}");
}
```
```output
17.47
```

With the operators in place, the calculation reads like the arithmetic it describes. The types also protect you: `Money * Money` does not compile, because no such `Mul` exists, and multiplying two amounts of money has no meaning. This `Display` is only correct for amounts that are not negative. A complete version would handle the sign separately.
:::

:::exercise practice A container with an associated type
Define a trait `Stack` with an associated type `Item` and the methods `push(&mut self, item: Self::Item)`, `pop(&mut self) -> Option<Self::Item>` and `is_empty(&self) -> bool`. Implement it for `Vec<T>`. Then write a generic function `drain_all<S: Stack>(stack: &mut S) -> usize` that pops until the stack is empty and returns how many items it removed.
::hint
The implementation starts with `impl<T> Stack for Vec<T> { type Item = T; ... }`. Inside it, call the vector's own methods with the fully qualified form, for example `Vec::push(self, item)`, so that it is clear which `push` is meant.
::solution
```rust run
trait Stack {
    type Item;

    fn push(&mut self, item: Self::Item);
    fn pop(&mut self) -> Option<Self::Item>;
    fn is_empty(&self) -> bool;
}

impl<T> Stack for Vec<T> {
    type Item = T;

    fn push(&mut self, item: T) {
        Vec::push(self, item);
    }
    fn pop(&mut self) -> Option<T> {
        Vec::pop(self)
    }
    fn is_empty(&self) -> bool {
        Vec::is_empty(self)
    }
}

fn drain_all<S: Stack>(stack: &mut S) -> usize {
    let mut removed = 0;
    while stack.pop().is_some() {
        removed += 1;
    }
    removed
}

fn main() {
    let mut numbers = vec![1, 2, 3];
    Stack::push(&mut numbers, 4);
    println!("{}", drain_all(&mut numbers));
    println!("{}", Stack::is_empty(&numbers));
}
```
```output
4
true
```

`impl<T> Stack for Vec<T>` is itself a small blanket implementation: it covers vectors of every element type, and each one gets `Item = T`. `drain_all` never mentions the item type. It only needs to know that `pop` returns an `Option` of something.

The trait's methods have the same names as the vector's own. The vector's inherent methods win in a plain call like `numbers.push(4)`, so the example uses `Stack::push(&mut numbers, 4)` to call the trait's version explicitly.
:::

:::exercise challenge A matrix with `Index` and `Mul`
Write `struct Matrix { rows: usize, cols: usize, data: Vec<f64> }`. Implement `Index<(usize, usize)>` and `IndexMut<(usize, usize)>`, so that `m[(row, col)]` reads and writes a cell. Then implement `Mul` for `&Matrix` so that `&a * &b` gives the matrix product. Multiply a 2×3 by a 3×2 matrix.
::hint
The cell `(r, c)` is at position `r * cols + c` in `data`. `Index` has an associated type `Output = f64` and a method `fn index(&self, (r, c): (usize, usize)) -> &f64`. For the product, the result has `a.rows` rows and `b.cols` columns, and each cell is the sum of `a[(i, k)] * b[(k, j)]` over `k`. Implement `impl Mul for &Matrix`, so that the operands are not consumed.
::solution
```rust run
use std::ops::{Index, IndexMut, Mul};

#[derive(Debug, Clone, PartialEq)]
struct Matrix {
    rows: usize,
    cols: usize,
    data: Vec<f64>,
}

impl Matrix {
    fn zeros(rows: usize, cols: usize) -> Self {
        Matrix { rows, cols, data: vec![0.0; rows * cols] }
    }

    fn from_rows(rows: usize, cols: usize, values: &[f64]) -> Self {
        assert_eq!(values.len(), rows * cols, "wrong number of values");
        Matrix { rows, cols, data: values.to_vec() }
    }
}

impl Index<(usize, usize)> for Matrix {
    type Output = f64;

    fn index(&self, (r, c): (usize, usize)) -> &f64 {
        &self.data[r * self.cols + c]
    }
}

impl IndexMut<(usize, usize)> for Matrix {
    fn index_mut(&mut self, (r, c): (usize, usize)) -> &mut f64 {
        &mut self.data[r * self.cols + c]
    }
}

impl Mul for &Matrix {
    type Output = Matrix;

    fn mul(self, other: &Matrix) -> Matrix {
        assert_eq!(self.cols, other.rows, "the sizes do not fit");
        let mut result = Matrix::zeros(self.rows, other.cols);
        for i in 0..self.rows {
            for j in 0..other.cols {
                let mut sum = 0.0;
                for k in 0..self.cols {
                    sum += self[(i, k)] * other[(k, j)];
                }
                result[(i, j)] = sum;
            }
        }
        result
    }
}

fn main() {
    let a = Matrix::from_rows(2, 3, &[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    let b = Matrix::from_rows(3, 2, &[7.0, 8.0, 9.0, 10.0, 11.0, 12.0]);

    let product = &a * &b;
    println!("{}x{}: {:?}", product.rows, product.cols, product.data);
    println!("{}", product[(1, 0)]);
    println!("{}", a.rows);          // `a` is still usable
}
```
```output
2x2: [58.0, 64.0, 139.0, 154.0]
139
2
```

`Index` returns a reference (`&f64`). Rust adds the `*` for you when you write `m[(r, c)]`, and the same expression on the left of `=` uses `IndexMut`. The parameter pattern `(r, c): (usize, usize)` takes the tuple apart right in the signature.

`Mul` is implemented for `&Matrix`, a reference, so `&a * &b` borrows both operands and leaves them usable. An implementation for `Matrix` by value would consume both matrices on every multiplication. Whether sizes fit is checked at run time here, with `assert_eq!`. With const generics ([chapter 24](#generics)), a `Matrix<const R: usize, const C: usize>` could let the compiler check it.
:::
