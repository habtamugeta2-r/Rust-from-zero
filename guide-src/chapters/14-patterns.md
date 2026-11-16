@id patterns
@part p3
@title Pattern matching in depth
@short Pattern matching in depth
@level beginner
@time 30
@learn Recognise every place where Rust uses patterns | Take apart tuples, structs, enums, arrays and references with one pattern | Use ranges, alternatives, guards and bindings in `match` | Combine conditions with `if let` chains | Avoid accidentally moving values out while matching

A `match` arm, an `if let`, and `let (a, b) = pair` all use patterns. A **[[pattern]]** describes a shape to test or destructure: when it matches, Rust can bind names to some or all of the value's parts. Whether that binding copies, moves or borrows depends on the pattern and the value. This chapter gathers the forms and shows how to choose safely.

:::plain Patterns and exhaustiveness in one paragraph
A **pattern** is a shape that a value is tested against, and the same syntax works in `match`, `if let`, `while let`, `let`, and function parameters. Patterns can bind parts of a value (`Some(n)`), ignore parts (`_`), add conditions (**guards**, `Some(n) if n > 0`), and destructure structs, tuples and enums. The compiler requires [[match]] to be **exhaustive**: every possible value must fit some arm, which is how adding a new enum variant turns into a compile error at every place that must handle it.
:::

:::analogy Sorting a desk drawer
Patterns are like sorting a mixed drawer of tools by shape. You look for a handle with a square end, a plug that matches a socket, or a narrow blade. The pattern is the shape you are asking for, and the matching value is the item you pull out.
:::

## Patterns are everywhere

```rust run
fn print_point(&(x, y): &(i32, i32)) {      // 4. a function parameter
    println!("({x}, {y})");
}

fn main() {
    let (a, b) = (1, 2);                      // 1. `let` with a tuple pattern
    println!("{a} {b}");

    let pairs = [(1, "one"), (2, "two")];
    for (number, name) in pairs {             // 2. `for`
        println!("{number} = {name}");
    }

    if let Some(n) = Some(7) {                // 3. `if let`
        println!("{n}");
    }

    print_point(&(3, 4));
}
```
```output
1 2
1 = one
2 = two
7
(3, 4)
```

Even the plain `let x = 5;` uses a pattern: the name `x` is a pattern that fits any value and gives it that name.

:::analogy A pattern is a coin sorter
Think of a mechanical coin sorter at a bank: a tray with shaped cutouts of exact widths. Pour mixed coins in, and each coin drops only through the slot whose shape matches it, landing in a labelled tube. A Rust pattern is that cutout: it tests whether a value has the right shape and simultaneously unpacks its inner pieces into variables.
:::

## Patterns that can fail and patterns that cannot

- A pattern that fits **every** possible value is called **irrefutable**. `x`, `(a, b)` and `Point { x, y }` are examples. `let`, `for` and function parameters need this kind, because there is no "else" to go to.
- A pattern that fits only **some** values is called **refutable**. `Some(n)` does not fit `None`. `match` arms, `if let`, `while let` and `let … else` are made for this kind.

```rust fail E0005
fn main() {
    let maybe: Option<i32> = Some(5);
    let Some(n) = maybe;
    println!("{n}");
}
```
```error auto
```

The compiler suggests the fix: `let … else`, which says what to do when the pattern does not fit.

## A catalogue of patterns

### Literals, ranges and alternatives

```rust run
fn describe(n: u32) -> &'static str {
    match n {
        0 => "zero",
        1 | 2 | 3 => "small",
        4..=9 => "medium",
        10.. => "large",
    }
}

fn main() {
    for n in [0, 2, 7, 500] {
        println!("{n} is {}", describe(n));
    }
    let grade = match 'b' {
        'a'..='c' => "top",
        'd'..='f' => "lower",
        _ => "unknown",
    };
    println!("{grade}");
}
```
```output
0 is zero
2 is small
7 is medium
500 is large
top
```

`|` means "or". `4..=9` is a range that includes both ends, and `10..` means "10 and above". Ranges work for numbers and characters. The four arms together cover every `u32`, so no `_` arm is needed, and the compiler has checked that. (`&'static str` is the type of a string literal that lives for the whole program. The `'static` part is explained in [chapter 26](#lifetimes).)

### Names, `_` and `..`

- A **name** fits anything and binds the value to that name.
- **`_`** fits anything and binds nothing. Use it for parts you do not need.
- **`..`** stands for "all the remaining parts".

```rust run
fn main() {
    let colour = (255, 140, 0, 128);
    let (red, _, _, alpha) = colour;       // ignore two parts
    let (first, ..) = colour;              // ignore everything after the first
    let (.., last) = colour;               // ignore everything before the last
    println!("{red} {alpha} {first} {last}");
}
```
```output
255 128 255 128
```

### Structs

```rust run
struct Point {
    x: i32,
    y: i32,
    z: i32,
}

fn main() {
    let p = Point { x: 3, y: 0, z: -2 };

    let Point { x, y, z } = p;                    // one variable per field
    println!("{x} {y} {z}");

    let Point { x: horizontal, .. } = p;          // rename a field, ignore the rest
    println!("{horizontal}");

    match p {
        Point { x: 0, y: 0, z: 0 } => println!("the origin"),
        Point { y: 0, .. } => println!("on the ground"),
        Point { x, .. } if x < 0 => println!("to the left"),
        _ => println!("somewhere else"),
    }
}
```
```output
3 0 -2
3
on the ground
```

`Point { x, y, z }` is short for `Point { x: x, y: y, z: z }`: the field name, then the pattern for that field. Writing a literal there, as in `y: 0`, means "this field must be 0".

### Enums and nesting

Patterns can be nested as deeply as the data:

```rust run
enum Shape {
    Circle { radius: f64 },
    Rect { width: f64, height: f64 },
}

fn describe(shape: Option<Shape>) -> String {
    match shape {
        Some(Shape::Circle { radius }) => format!("a circle of radius {radius}"),
        Some(Shape::Rect { width, height }) if width == height => {
            format!("a square with side {width}")
        }
        Some(Shape::Rect { width, height }) => format!("a {width} by {height} rectangle"),
        None => String::from("no shape"),
    }
}

fn main() {
    println!("{}", describe(Some(Shape::Circle { radius: 1.5 })));
    println!("{}", describe(Some(Shape::Rect { width: 2.0, height: 2.0 })));
    println!("{}", describe(Some(Shape::Rect { width: 2.0, height: 3.0 })));
    println!("{}", describe(None));
}
```
```output
a circle of radius 1.5
a square with side 2
a 2 by 3 rectangle
no shape
```

### Guards: an extra condition on an arm

The `if width == height` after a pattern is a **match guard**. The arm is taken only if the pattern fits *and* the condition is true. Arms are tried from top to bottom, so put the more specific arm first.

:::warn Guards and exhaustiveness
The compiler does not analyse guard conditions. If every arm of a `match` has a guard, the compiler assumes that all of them could be false, and asks for an arm without a guard.
:::

### Binding a name to a tested value: `@`

Sometimes you want to test a value against a pattern **and** keep it under a name. `name @ pattern` does both:

```rust run
fn main() {
    let age = 15;
    let message = match age {
        0 => String::from("newborn"),
        n @ 1..=12 => format!("child of {n}"),
        n @ 13..=19 => format!("teenager of {n}"),
        n => format!("adult of {n}"),
    };
    println!("{message}");
}
```
```output
teenager of 15
```

### Arrays and slices

```rust run
fn describe(list: &[i32]) -> String {
    match list {
        [] => String::from("empty"),
        [one] => format!("one element: {one}"),
        [first, second] => format!("two elements: {first} and {second}"),
        [first, .., last] => format!("starts with {first}, ends with {last}"),
    }
}

fn sum(list: &[i32]) -> i32 {
    match list {
        [] => 0,
        [first, rest @ ..] => first + sum(rest),
    }
}

fn main() {
    println!("{}", describe(&[]));
    println!("{}", describe(&[7]));
    println!("{}", describe(&[7, 8]));
    println!("{}", describe(&[7, 8, 9, 10]));
    println!("{}", sum(&[1, 2, 3, 4]));
}
```
```output
empty
one element: 7
two elements: 7 and 8
starts with 7, ends with 10
10
```

`[first, .., last]` fits any slice with at least two elements. `rest @ ..` gives a name to "all the other elements" as a slice. The `sum` function uses it to add up a list by recursion: the sum of a list is its first element plus the sum of the rest.

## Matching without moving

Patterns follow the ownership rules. If you match on an **owned** value and bind a part that is not `Copy`, that part is **moved** out of the value:

```rust fail E0382
fn main() {
    let name: Option<String> = Some(String::from("Sara"));

    match name {
        Some(n) => println!("Hello, {n}"),
        None => println!("Hello, stranger"),
    }

    println!("{:?}", name);
}
```
```error auto lines=14
```

The `String` moved into `n`, so `name` is no longer complete. The compiler suggests the keyword `ref`, which is explained in the box below. The more common fix today is to match on a **reference**. Then the names in the pattern become references too, and nothing moves:

```rust run
fn main() {
    let name: Option<String> = Some(String::from("Sara"));

    match &name {
        Some(n) => println!("Hello, {n}"),   // `n` is a &String
        None => println!("Hello, stranger"),
    }

    println!("{:?}", name);
}
```
```output
Hello, Sara
Some("Sara")
```

The same works for changing a value in place, by matching on `&mut`:

```rust run
fn main() {
    let mut score: Option<u32> = Some(10);

    if let Some(points) = &mut score {
        *points += 5;                       // `points` is a &mut u32
    }
    println!("{:?}", score);
}
```
```output
Some(15)
```

:::details The older spelling: `ref` and `ref mut`
In older code and in some special situations you will see the keyword `ref` inside a pattern: `Some(ref n)` binds `n` as a reference instead of moving the value, and `Some(ref mut n)` binds a mutable reference. Matching on `&value` or `&mut value`, as above, does the same job and is what most code uses today.

`Option` also has two methods that do the conversion for you: `.as_ref()` turns an `&Option<T>` into an `Option<&T>`, and `.as_mut()` gives an `Option<&mut T>`.
:::

A `&` in a pattern does the opposite of `&` in an expression: it takes a reference *apart*. This is common when looping over references to `Copy` values:

```rust run
fn main() {
    let numbers = [3, 6, 9];
    for &n in &numbers {        // each item is a &i32, and `&n` binds the i32 itself
        print!("{} ", n * 2);
    }
    println!();
}
```
```output
6 12 18
```

## Combining conditions: `if let` chains

In the 2024 edition, an `if` or `while` can join several conditions and several `let` patterns with `&&`. Each part can use the names bound by the parts before it:

```rust run
fn first_big_even(list: &[i32]) -> Option<i32> {
    if let Some(&first) = list.first()
        && first % 2 == 0
        && first > 100
    {
        Some(first)
    } else {
        None
    }
}

fn main() {
    println!("{:?}", first_big_even(&[250, 3]));
    println!("{:?}", first_big_even(&[7, 250]));
    println!("{:?}", first_big_even(&[]));
}
```
```output
Some(250)
None
None
```

Without a chain you would write an `if let` with a second `if` nested inside it. The same idea works inside `match`: a guard may contain a `let`.

```rust run
fn parse_small(text: Option<&str>) -> String {
    match text {
        Some(t) if let Ok(n) = t.parse::<u8>() => format!("a small number: {n}"),
        Some(t) => format!("some other text: {t}"),
        None => String::from("nothing"),
    }
}

fn main() {
    println!("{}", parse_small(Some("42")));
    println!("{}", parse_small(Some("hello")));
    println!("{}", parse_small(None));
}
```
```output
a small number: 42
some other text: hello
nothing
```

## `matches!`: a pattern as a yes-or-no question

The macro `matches!(value, pattern)` gives `true` if the value fits the pattern. It saves a `match` with two arms:

```rust run
fn main() {
    let c = 'k';
    let is_letter = matches!(c, 'a'..='z' | 'A'..='Z');
    let small_some = matches!(Some(3), Some(n) if n < 5);
    println!("{is_letter} {small_some}");
}
```
```output
true true
```

## The pattern cheat sheet

| Pattern | Fits | Example |
|---|---|---|
| `5`, `'a'`, `"hi"`, `true` | exactly that value | `0 => ...` |
| `name` | anything, and binds it | `n => ...` |
| `_` | anything, binds nothing | `_ => ...` |
| `a \| b` | either pattern | `1 \| 2 => ...` |
| `1..=5`, `10..` | a range of numbers or characters | `'a'..='z' => ...` |
| `(a, b)`, `(first, ..)` | a tuple | `let (x, y) = pair;` |
| `[a, b]`, `[first, .., last]`, `[head, rest @ ..]` | an array or slice | `[] => ...` |
| `Point { x, y }`, `Point { x, .. }` | a struct | `let Point { x, .. } = p;` |
| `Some(x)`, `Shape::Circle { radius }` | an enum variant | `Some(n) => ...` |
| `&x` | a reference, binding what it points to | `for &n in &list` |
| `name @ pattern` | the pattern, and binds the whole value | `n @ 1..=9 => ...` |
| `pattern if condition` | the pattern, when the condition holds | `Some(n) if n > 0 => ...` |

:::compare Pattern matching elsewhere
Older mainstream languages have only a `switch` statement, which compares a value with constants. It cannot take data apart, and in C and Java it runs on into the next case if you forget `break`. Pattern matching in Rust's style comes from functional languages such as ML and Haskell. It has proved so useful that Python (`match`, since 3.10), Java, C# and Swift have added their own versions. Rust's stands out because the compiler checks that all cases are covered.
:::

:::recap
- A pattern describes the shape of a value and can bind its parts to names.
- Patterns appear in `let`, function parameters, `for`, `match`, `if let`, `while let` and `let … else`.
- Irrefutable patterns always fit. Refutable patterns may not, and need a construct that has an "otherwise".
- Useful forms: literals, `_`, `..`, `|`, ranges, tuples, structs, enums, slices, `name @ pattern`, and guards with `if`.
- Matching on an owned value can move parts out of it. Match on `&value` or `&mut value` to borrow instead.
- `if let … && …` chains several patterns and conditions. `matches!` turns a pattern into a `bool`.
:::

:::quiz Check your understanding
? Which pattern can be used in a plain `let` statement without `else`?
- `Some(x)`
- `Ok(value)`
+ `(a, b)`
- `[first]` on a slice
= A plain `let` needs a pattern that always fits. A tuple pattern fits every tuple of that size. The others can fail to fit, so they need `if let`, `match` or `let … else`.

? What does this print?
```rust
let n = 7;
match n {
    x @ 1..=5 => println!("low {x}"),
    x if x % 2 == 1 => println!("odd {x}"),
    _ => println!("other"),
}
```
- `low 7`
+ `odd 7`
- `other`
- It does not compile
= 7 is not in the range 1 to 5, so the first arm does not fit. The second arm fits any value and its guard is true for 7.

? Why does `match &name { Some(n) => ... }` leave `name` usable afterwards, when `name` is an `Option<String>`?
+ Because matching on a reference binds `n` as a reference, so nothing is moved out
- Because `String` is `Copy`
- Because `match` always clones
- It does not. `name` is moved
= Matching through `&name` only borrows. The bound names become references to the parts.

? What does the pattern `[first, .., last]` fit?
- Only slices with exactly two elements
+ Slices with at least two elements
- Slices of any length, including empty ones
- Only arrays, not slices
= `first` and `last` each need an element, and `..` stands for zero or more elements in between.
:::

:::exercise guided Classify a point
Write a function `quadrant(point: (i32, i32)) -> &'static str` that returns `"origin"` for `(0, 0)`, `"on an axis"` if exactly one coordinate is 0, and otherwise `"top right"`, `"top left"`, `"bottom left"` or `"bottom right"` depending on the signs of x and y.
::hint
Match on the tuple. Use literal patterns for the zero cases first: `(0, 0)`, then `(0, _) | (_, 0)`. For the rest, bind `(x, y)` and add guards such as `if x > 0 && y > 0`.
::solution
```rust run
fn quadrant(point: (i32, i32)) -> &'static str {
    match point {
        (0, 0) => "origin",
        (0, _) | (_, 0) => "on an axis",
        (x, y) if x > 0 && y > 0 => "top right",
        (x, y) if x < 0 && y > 0 => "top left",
        (x, y) if x < 0 && y < 0 => "bottom left",
        _ => "bottom right",
    }
}

fn main() {
    for p in [(0, 0), (5, 0), (2, 3), (-2, 3), (-2, -3), (2, -3)] {
        println!("{:?}: {}", p, quadrant(p));
    }
}
```
```output
(0, 0): origin
(5, 0): on an axis
(2, 3): top right
(-2, 3): top left
(-2, -3): bottom left
(2, -3): bottom right
```

The order of the arms matters. `(0, 0)` must come before the axis arm, because `(0, _)` would fit it too. The last arm is a plain `_`, because the compiler cannot work out from the guards that every case is covered.
:::

:::exercise practice Commands for a robot
A robot understands these commands:

```rust
enum Command {
    Move { dx: i32, dy: i32 },
    Say(String),
    Stop,
}
```

Write `run(cmd: &Command, position: &mut (i32, i32))`. For `Move` it changes the position, with one extra rule: a move where both `dx` and `dy` are 0 prints `Not moving.` For `Say` it prints the text, and for `Stop` it prints `Stopping at (x, y).`
::hint
Put the special case `Command::Move { dx: 0, dy: 0 }` before the general `Command::Move { dx, dy }`. Change the position with `position.0 += dx;`.
::solution
```rust run
enum Command {
    Move { dx: i32, dy: i32 },
    Say(String),
    Stop,
}

fn run(cmd: &Command, position: &mut (i32, i32)) {
    match cmd {
        Command::Move { dx: 0, dy: 0 } => println!("Not moving."),
        Command::Move { dx, dy } => {
            position.0 += dx;
            position.1 += dy;
        }
        Command::Say(text) => println!("{text}"),
        Command::Stop => println!("Stopping at ({}, {}).", position.0, position.1),
    }
}

fn main() {
    let mut position = (0, 0);
    let commands = [
        Command::Say(String::from("Starting")),
        Command::Move { dx: 2, dy: 3 },
        Command::Move { dx: 0, dy: 0 },
        Command::Move { dx: -1, dy: 1 },
        Command::Stop,
    ];
    for cmd in &commands {
        run(cmd, &mut position);
    }
}
```
```output
Starting
Not moving.
Stopping at (1, 4).
```

Because `cmd` is a reference, `dx` and `dy` are `&i32` values. `position.0 += dx` still works, because adding a `&i32` to an `i32` is allowed. The literal pattern `dx: 0, dy: 0` handles the special case without an `if`.
:::

:::exercise challenge The middle of a list
Write `middle(list: &[i32]) -> Option<&[i32]>` that returns the list without its first and last element, or `None` if the list has fewer than two elements. So `[1, 2, 3, 4]` gives `Some([2, 3])`, `[1, 2]` gives `Some([])`, and `[1]` gives `None`.
::hint
One slice pattern does all the work: `[_, inner @ .., _]`.
::solution
```rust run
fn middle(list: &[i32]) -> Option<&[i32]> {
    match list {
        [_, inner @ .., _] => Some(inner),
        _ => None,
    }
}

fn main() {
    println!("{:?}", middle(&[1, 2, 3, 4]));
    println!("{:?}", middle(&[1, 2]));
    println!("{:?}", middle(&[1]));
}
```
```output
Some([2, 3])
Some([])
None
```

The pattern needs one element at each end and names everything in between. For a list of exactly two elements, "everything in between" is an empty slice, which is a valid result and is different from `None`. No index is calculated by hand, so an off-by-one mistake is impossible.
:::
