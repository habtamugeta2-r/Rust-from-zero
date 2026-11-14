@id enums
@part p3
@title Enums, `Option` and `match`
@short Enums and Option
@level beginner
@time 45
@learn Define a type whose value is one of several named possibilities | Attach different data to each possibility | Handle every case safely with `match`, `if let` and `let … else` | Use `Option` instead of null, and explain why that prevents a whole class of crashes

A struct says "a user has a name **and** an email **and** an age". Many things are better described with **or**: a traffic light is red *or* yellow *or* green. A payment is by cash *or* by card *or* by bank transfer. A search finds something *or* finds nothing. For "one of several possibilities" Rust has the **enum** (short for *enumeration*).

## A simple enum

```rust run
#[derive(Debug)]
enum Direction {
    North,
    East,
    South,
    West,
}

fn turn_right(d: Direction) -> Direction {
    match d {
        Direction::North => Direction::East,
        Direction::East => Direction::South,
        Direction::South => Direction::West,
        Direction::West => Direction::North,
    }
}

fn main() {
    let heading = Direction::North;
    let heading = turn_right(heading);
    println!("{:?}", heading);
}
```
```output
East
```

- `enum Direction { ... }` defines a new type. The possibilities inside are called **variants**.
- A value of type `Direction` is always exactly one of the four variants. You write a variant with the enum's name in front: `Direction::North`.
- `match` looks at the value and runs the arm of the matching variant.

:::analogy A multiple-choice question
An enum is like a question on a form with tick boxes where exactly one box must be ticked. You cannot tick two, you cannot tick none, and you cannot write in your own answer.
:::

Without enums, people use numbers (`0` for north, `1` for east …) or text (`"north"`). Both allow nonsense values such as `7` or `"nroth"`, and the mistake shows up only when the program runs. With an enum, an invalid direction cannot even be written down.

## `match` must cover everything

Remove one arm, and the program no longer compiles:

```rust fail E0004
enum Direction {
    North,
    East,
    South,
    West,
}

fn is_vertical(d: Direction) -> bool {
    match d {
        Direction::North => true,
        Direction::South => true,
        Direction::East => false,
    }
}

fn main() {
    println!("{}", is_vertical(Direction::West));
}
```
```error auto lines=5
```

The compiler names the forgotten case. This is called **exhaustiveness checking**, and it matters most months later: when you add a fifth variant to an enum, the compiler shows you every `match` in the program that needs a new arm. In most languages you would have to find those places by searching, and you would learn about the ones you missed from bug reports.

When several variants should be treated alike, join them with `|`, or catch all the rest with `_`:

```rust run
# enum Direction { North, East, South, West }
fn is_vertical(d: Direction) -> bool {
    match d {
        Direction::North | Direction::South => true,
        _ => false,
    }
}
# fn main() {
#     println!("{} {}", is_vertical(Direction::North), is_vertical(Direction::East));
#     let _ = (Direction::South, Direction::West);
# }
```

Use `_` with care. It also swallows variants that are added later, so the compiler can no longer remind you about them.

## Variants that carry data

Each variant of an enum can hold its own data, and different variants can hold different kinds of data. This is what makes Rust's enums far more powerful than those of most languages.

```rust run
#[derive(Debug)]
enum Shape {
    Circle(f64),                          // one unnamed value: the radius
    Rectangle { width: f64, height: f64 }, // named fields, like a struct
    Dot,                                  // no data
}

fn area(shape: &Shape) -> f64 {
    match shape {
        Shape::Circle(radius) => 3.14159 * radius * radius,
        Shape::Rectangle { width, height } => width * height,
        Shape::Dot => 0.0,
    }
}

fn main() {
    let shapes = [
        Shape::Circle(1.0),
        Shape::Rectangle { width: 3.0, height: 4.0 },
        Shape::Dot,
    ];
    for shape in &shapes {
        println!("{:?} has area {:.2}", shape, area(shape));
    }
}
```
```output
Circle(1.0) has area 3.14
Rectangle { width: 3.0, height: 4.0 } has area 12.00
Dot has area 0.00
```

The patterns in the `match` do two jobs at once: they check which variant the value is, **and** they take the data out and give it names (`radius`, `width`, `height`) that the arm can use. You can only reach the radius inside the arm for `Circle`. There is no way to ask a rectangle for its radius by mistake.

:::plain Why this is a big deal
A circle has a radius. A rectangle has a width and a height. In a language without such enums you would write one struct with all three fields and a "kind" field, and hope that nobody reads `radius` on a rectangle. Rust's enum stores exactly the data that belongs to the current variant, and `match` makes sure you only touch data that is really there. The idea is known as a *sum type* or *tagged union*.
:::

Like structs, enums can have methods:

```rust run
# #![allow(dead_code)]
enum Shape {
    Circle(f64),
    Square(f64),
}

impl Shape {
    fn name(&self) -> &str {
        match self {
            Shape::Circle(_) => "circle",
            Shape::Square(_) => "square",
        }
    }
}

fn main() {
    println!("{}", Shape::Circle(2.0).name());
    println!("{}", Shape::Square(2.0).name());
}
```
```output
circle
square
```

The `_` inside `Circle(_)` means "there is a value here, but I do not need it".

## `Option`: a value that may be missing

Often a value may or may not be there. A search may find nothing. A list may be empty, so it has no first element. A user may not have given a phone number.

:::compare The billion-dollar mistake
Most languages solve this with a special value called `null` (`None` in Python, `nil` in Go, `undefined` in JavaScript). Any variable might secretly hold `null` instead of a real value. If the program uses it without checking, it crashes: `NullPointerException` in Java, "undefined is not a function" in JavaScript, a segmentation fault in C. Tony Hoare, who invented null references in 1965, later called them his "billion-dollar mistake" because of the countless crashes and security holes they have caused.

**Rust has no null.** A value of type `String` is always a real string. If something may be missing, the type has to say so.
:::

The way to say so is an enum from the standard library, `Option`:

```rust
enum Option<T> {
    Some(T),   // there is a value, and here it is
    None,      // there is no value
}
```

The `<T>` means "this works for any type": `Option<i32>` is "maybe an integer", `Option<String>` is "maybe a string". ([Chapter 19](#generics) explains this notation.) `Option` is used so often that you can write `Some` and `None` without `Option::` in front.

```rust run
fn find_position(list: &[i32], wanted: i32) -> Option<usize> {
    for (index, value) in list.iter().enumerate() {
        if *value == wanted {
            return Some(index);
        }
    }
    None
}

fn main() {
    let numbers = [4, 8, 15, 16];

    match find_position(&numbers, 15) {
        Some(index) => println!("Found at position {index}."),
        None => println!("Not found."),
    }

    match find_position(&numbers, 99) {
        Some(index) => println!("Found at position {index}."),
        None => println!("Not found."),
    }
}
```
```output
Found at position 2.
Not found.
```

The important part: **an `Option<usize>` is not a `usize`.** You cannot calculate with it until you have dealt with the possibility that it is `None`.

```rust fail E0369
fn main() {
    let maybe: Option<i32> = Some(5);
    let sum = maybe + 1;
}
```
```error auto lines=7
```

The compiler will not let you forget the "nothing" case. A crash from an unexpected null cannot happen, because the type system makes "may be missing" visible and forces a decision.

### Ways to get at the value inside

```rust run
fn main() {
    let some: Option<i32> = Some(5);
    let none: Option<i32> = None;

    // 1. `match`: handle both cases explicitly
    match some {
        Some(n) => println!("got {n}"),
        None => println!("got nothing"),
    }

    // 2. A fallback value when there is nothing
    println!("{}", some.unwrap_or(0));
    println!("{}", none.unwrap_or(0));

    // 3. Ask which case it is
    println!("{} {}", some.is_some(), none.is_none());

    // 4. Change the value inside, if there is one
    println!("{:?} {:?}", some.map(|n| n * 2), none.map(|n| n * 2));
}
```
```output
got 5
5
0
true true
Some(10) None
```

`map` applies a small function to the value inside a `Some` and leaves a `None` alone. The `|n| n * 2` is a *closure*, a function written in place. [Chapter 24](#closures) covers closures. For now read it as "take `n`, give back `n * 2`".

There are also two blunt tools:

```rust panic
fn main() {
    let none: Option<i32> = None;
    let n = none.unwrap();
    println!("{n}");
}
```
```output auto panic
```

`.unwrap()` says "give me the value, and if there is none, panic". `.expect("message")` does the same with your own message. They are fine in experiments, in tests, and where a `None` would mean a bug in your own program. In real code, prefer one of the gentler ways above. Each `unwrap` marks a place where your program can crash.

## Shorter forms of `match`: `if let` and `let … else`

Often you care about one case only. A full `match` is then a lot of writing:

```rust run
fn main() {
    let favourite: Option<&str> = Some("blue");

    // With match:
    match favourite {
        Some(colour) => println!("Favourite colour: {colour}"),
        None => {}
    }

    // The same with `if let`:
    if let Some(colour) = favourite {
        println!("Favourite colour: {colour}");
    } else {
        println!("No favourite colour.");
    }
}
```
```output
Favourite colour: blue
Favourite colour: blue
```

Read `if let Some(colour) = favourite` as: "if `favourite` matches the pattern `Some(colour)`, run the block, with `colour` holding the value inside". The `else` part is optional.

`let … else` turns it around. It takes the value out, or leaves the function when the pattern does not match. This keeps the main path of a function free of nesting:

```rust run
fn describe(age_text: &str) -> String {
    let Ok(age) = age_text.parse::<u32>() else {
        return String::from("That is not a number.");
    };
    // from here on, `age` is a plain u32
    format!("Next year you will be {}.", age + 1)
}

fn main() {
    println!("{}", describe("41"));
    println!("{}", describe("forty-one"));
}
```
```output
Next year you will be 42.
That is not a number.
```

The `else` block must leave the current function or loop, with `return`, `break`, `continue` or a panic. (`parse::<u32>()` is another way of telling `parse` which type you want.)

`while let` repeats as long as a pattern matches. Here `pop` removes the last element of a list and returns it as `Some(value)`, or returns `None` when the list is empty:

```rust run
fn main() {
    let mut stack = vec![1, 2, 3];
    while let Some(top) = stack.pop() {
        print!("{top} ");
    }
    println!();
}
```
```output
3 2 1
```

## `Result`: success or failure

`Option` says "a value or nothing". Its sibling `Result` says "a value or an **error**". You met it in the guessing game:

```rust
enum Result<T, E> {
    Ok(T),    // it worked, and here is the result
    Err(E),   // it failed, and here is the reason
}
```

Everything you learned in this chapter (`match`, `if let`, `let … else`, `unwrap_or`) works for `Result` too. Error handling with `Result` gets its own chapter: [chapter 18](#errors).

## How an enum is stored

An enum value stores a small number, called the **tag** or *discriminant*, that says which variant it currently is, plus enough room for the data of the largest variant. A value of an enum with no data in any variant is just the tag, usually one byte.

:::details `Option` often costs nothing
You might expect `Option<T>` to need extra memory for its tag. Often it does not. A reference can never be zero, so the compiler uses the "impossible" value zero to mean `None`. `Option<&T>` is therefore exactly as big as `&T`. You get the safety of an explicit "maybe missing" type at the price of a plain pointer.
:::

:::compare Enums in other languages
In C, C++ and Java (in its basic form), an enum is a list of named constants. It cannot carry different data per variant, and in C you can even put a number in it that matches no variant. Languages such as Swift, Kotlin (sealed classes), TypeScript (union types), Haskell and OCaml have features similar to Rust's enums. The idea came from that last family of languages, where it has been used for decades.
:::

:::recap
- An enum is a type whose value is exactly one of several variants.
- Variants can carry data, and each variant can carry different data.
- `match` checks the variant and takes out the data. It must cover every variant.
- `Option<T>` is `Some(value)` or `None`. Rust has no null, so "may be missing" is always visible in the type.
- Get the value with `match`, `if let`, `let … else`, `unwrap_or`, or `map`. `unwrap` and `expect` panic on `None`.
- `Result<T, E>` is `Ok(value)` or `Err(error)`.
:::

:::quiz Check your understanding
? What is special about Rust's enums compared with enums in C or Java?
- They can only hold numbers
+ Each variant can carry its own data
- They cannot be used with `match`
- They are stored on the heap
= A Rust enum variant can hold values, and different variants can hold different types and numbers of values.

? What happens if a `match` on an enum does not cover one of the variants?
- That case is skipped when the program runs
- The program panics when it reaches that case
+ The program does not compile
- The last arm is used for it
= `match` must be exhaustive. The compiler reports error E0004 and names the missing variant.

? A function returns `Option<String>`. What does that tell you?
- It always returns a string
- It may crash
+ It returns either `Some(text)` or `None`, and the caller must handle both before using the text
- It returns an empty string when there is nothing
= An `Option<String>` is not a `String`. The compiler makes the caller deal with the `None` case.

? What does `value.unwrap_or(10)` do for `value: Option<i32>`?
- It panics if the value is `None`
+ It gives the number inside `Some`, or 10 if the value is `None`
- It always gives 10
- It turns the number into an `Option`
= `unwrap_or` supplies a fallback. Unlike `unwrap`, it never panics.

? When is `if let` a better choice than `match`?
- When all variants must be handled
+ When only one pattern is interesting and the rest needs little or no code
- When the value is a number
- Never. They are unrelated
= `if let` is a shorter way to write a `match` that cares about one pattern. For several cases, `match` is clearer and keeps the exhaustiveness check.
:::

:::exercise guided Coins
Define an enum `Coin` with the variants `Penny`, `Nickel`, `Dime` and `Quarter` (US coins worth 1, 5, 10 and 25 cents). Write a function `value_in_cents(coin: &Coin) -> u32` and use it to add up an array of coins.
::hint
`match coin { Coin::Penny => 1, ... }` can be the whole body of the function. For the sum, loop over a reference to the array and add to a `mut` total.
::solution
```rust run
enum Coin {
    Penny,
    Nickel,
    Dime,
    Quarter,
}

fn value_in_cents(coin: &Coin) -> u32 {
    match coin {
        Coin::Penny => 1,
        Coin::Nickel => 5,
        Coin::Dime => 10,
        Coin::Quarter => 25,
    }
}

fn main() {
    let purse = [Coin::Quarter, Coin::Dime, Coin::Penny, Coin::Nickel, Coin::Quarter];
    let mut total = 0;
    for coin in &purse {
        total += value_in_cents(coin);
    }
    println!("{total} cents");
}
```
```output
66 cents
```

`match` is an expression, so its value (the number of the matching arm) is the return value of the function. If a new coin is added to the enum later, this function stops compiling until an arm for it is written.
:::

:::exercise practice Safe division
Dividing an integer by zero makes a program panic. Write `safe_divide(a: i32, b: i32) -> Option<i32>` that returns `None` when `b` is zero. In `main`, print the results of 10 ÷ 2 and 10 ÷ 0 as `Result: 5` and `Cannot divide by zero.`
::hint
Return `None` early when `b == 0`, and otherwise `Some(a / b)`. Use `match` or `if let … else` to print.
::solution
```rust run
fn safe_divide(a: i32, b: i32) -> Option<i32> {
    if b == 0 {
        None
    } else {
        Some(a / b)
    }
}

fn print_division(a: i32, b: i32) {
    match safe_divide(a, b) {
        Some(result) => println!("Result: {result}"),
        None => println!("Cannot divide by zero."),
    }
}

fn main() {
    print_division(10, 2);
    print_division(10, 0);
}
```
```output
Result: 5
Cannot divide by zero.
```

The signature tells every caller that this operation may have no answer. Compare that with [chapter 5](#functions), where `safe_divide` returned 0 for a division by zero. That hid the problem, because 0 is also a perfectly normal result.
:::

:::exercise practice Describe a message
A chat program has this enum. Write `describe(msg: &Message) -> String` that returns a readable text for each variant, for example `Text: hello`, `Image 800x600`, and `User left`.

```rust
enum Message {
    Text(String),
    Image { width: u32, height: u32 },
    Left,
}
```
::hint
The patterns are `Message::Text(content)`, `Message::Image { width, height }` and `Message::Left`. Build each text with `format!`.
::solution
```rust run
enum Message {
    Text(String),
    Image { width: u32, height: u32 },
    Left,
}

fn describe(msg: &Message) -> String {
    match msg {
        Message::Text(content) => format!("Text: {content}"),
        Message::Image { width, height } => format!("Image {width}x{height}"),
        Message::Left => String::from("User left"),
    }
}

fn main() {
    let messages = [
        Message::Text(String::from("hello")),
        Message::Image { width: 800, height: 600 },
        Message::Left,
    ];
    for m in &messages {
        println!("{}", describe(m));
    }
}
```
```output
Text: hello
Image 800x600
User left
```

Each arm sees only the data of its own variant. Because `describe` takes `&Message`, the names `content`, `width` and `height` are references into the message, so nothing is moved out of it.
:::

:::exercise challenge A traffic light
Model a traffic light as an enum with the variants `Red`, `Green` and `Yellow`. Add two methods: `next(&self) -> TrafficLight` (red → green → yellow → red) and `seconds(&self) -> u32` (red 30, green 25, yellow 5). Starting at red, print the light and its duration for 4 steps.
::hint
Derive `Debug` so that you can print the variant. In the loop, replace the current light with `light = light.next();`, which needs a `mut` variable.
::solution
```rust run
#[derive(Debug)]
enum TrafficLight {
    Red,
    Green,
    Yellow,
}

impl TrafficLight {
    fn next(&self) -> TrafficLight {
        match self {
            TrafficLight::Red => TrafficLight::Green,
            TrafficLight::Green => TrafficLight::Yellow,
            TrafficLight::Yellow => TrafficLight::Red,
        }
    }

    fn seconds(&self) -> u32 {
        match self {
            TrafficLight::Red => 30,
            TrafficLight::Green => 25,
            TrafficLight::Yellow => 5,
        }
    }
}

fn main() {
    let mut light = TrafficLight::Red;
    for _ in 0..4 {
        println!("{:?} for {} seconds", light, light.seconds());
        light = light.next();
    }
}
```
```output
Red for 30 seconds
Green for 25 seconds
Yellow for 5 seconds
Red for 30 seconds
```

This is a small **state machine**: a thing that is always in exactly one of a fixed set of states and moves between them by fixed rules. Enums and `match` are a natural fit for state machines, and the compiler guarantees that every state has a next state and a duration.
:::
