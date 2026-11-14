@id functions
@part p1
@title Functions: naming a piece of work
@short Functions
@level beginner
@time 25
@learn Write your own functions and call them | Pass values into a function and get a result back | Explain the difference between a statement and an expression | Document a function with comments that tools can read

So far all your code lived inside `main`. That stops working as programs grow. A **function** is a group of instructions with a name. You write the instructions once and then run them from anywhere by using the name. Functions are the main tool for keeping a program readable.

:::analogy A function is a machine with a slot and a tray
Think of a coffee machine. You put something in (water, beans), press the button, and something comes out (coffee). You do not need to know what happens inside. A function is the same: values go in, work happens, a result comes out. Once it exists, you only need its name and what to put in.
:::

## Defining and calling a function

```rust run
fn main() {
    greet();
    greet();
}

fn greet() {
    println!("Hello!");
    println!("Nice to see you.");
}
```
```output
Hello!
Nice to see you.
Hello!
Nice to see you.
```

- `fn greet() { ... }` **defines** a function called `greet`. A definition does not run anything by itself.
- `greet();` **calls** the function: the program jumps into `greet`, runs its lines, and then comes back to continue after the call.
- The order of definitions in the file does not matter. `greet` is written below `main` and still found.

## Parameters: giving a function its inputs

A function becomes much more useful when it can work with different values each time.

```rust run
fn main() {
    greet("Sara");
    greet("Tomas");
    print_area(4, 3);
}

fn greet(name: &str) {
    println!("Hello, {name}!");
}

fn print_area(width: u32, height: u32) {
    println!("The area is {}.", width * height);
}
```
```output
Hello, Sara!
Hello, Tomas!
The area is 12.
```

The names in the brackets of the definition (`name`, `width`, `height`) are **parameters**: variables that receive their value when the function is called. The values you pass in the call (`"Sara"`, `4`, `3`) are **arguments**. They are matched by position: the first argument goes to the first parameter.

**Every parameter must have its type written out.** Inside a function the compiler works types out for you, but at the border of a function it wants a clear promise. That promise also makes error messages short and local: if you call `print_area("four", 3)`, the error points at exactly that call.

## Return values: getting a result back

Printing a result is fine for a person, but often the *program* needs the result to continue working with it. A function can **return** a value to whoever called it.

```rust run
fn main() {
    let a = area(4, 3);
    println!("The area is {a}.");
    println!("Twice the area is {}.", area(4, 3) * 2);
}

fn area(width: u32, height: u32) -> u32 {
    width * height
}
```
```output
The area is 12.
Twice the area is 24.
```

- `-> u32` after the brackets says: this function gives back a `u32`.
- The call `area(4, 3)` is replaced by the returned value, so you can store it or calculate with it.
- Look closely at the body: `width * height` has **no semicolon**. In Rust, the value of the last line of a function is its return value, if that line has no semicolon.

The first line of a function, such as `fn area(width: u32, height: u32) -> u32`, is called its **signature**. It tells you everything you need in order to use the function: its name, what goes in, and what comes out.

## Statements and expressions

To understand that missing semicolon you need two words. They are worth learning well, because Rust is built around them.

- An **expression** is code that *produces a value*. `5`, `width * height`, `area(4, 3)` and `x > 10` are expressions.
- A **statement** is code that *does something* and produces no value. `let x = 5;` is a statement.

Putting a semicolon after an expression turns it into a statement: the value is thrown away. That is why the last line of `area` has none.

Even a block in curly brackets is an expression. Its value is the value of its last line:

```rust run
fn main() {
    let y = {
        let x = 3;
        x + 1
    };
    println!("{y}");
}
```
```output
4
```

Here is what happens if you add the semicolon by habit:

```rust fail E0308
fn area(width: u32, height: u32) -> u32 {
    width * height;
}

fn main() {
    println!("{}", area(4, 3));
}
```
```error auto
```

The function promised a `u32` but, because of the semicolon, produces nothing. "Nothing" has a type in Rust: the empty tuple `()`, called **unit**. A function without `->` returns `()`. The compiler even points at the semicolon to remove. You will see this error often in your first weeks. Now you know what it means.

### Leaving early with `return`

You can also return with the keyword `return`. It is used to leave a function *before* its last line:

```rust run
fn main() {
    println!("{}", safe_divide(10, 2));
    println!("{}", safe_divide(10, 0));
}

fn safe_divide(a: i32, b: i32) -> i32 {
    if b == 0 {
        return 0; // leave the function right here
    }
    a / b
}
```
```output
5
0
```

(`if` runs its block only when the condition is true. It is the subject of the next chapter.) By convention, `return` is used only for early exits. The normal result is the last expression without a semicolon.

:::compare Other languages
In C, Java, JavaScript and Python, you must write `return` to give back a value. Forgetting it is a common bug: in JavaScript and Python the function then quietly returns "nothing". In Rust the compiler checks that every path through a function produces a value of the promised type.
:::

## A function works on its own copies

```rust run
fn main() {
    let number = 5;
    add_ten(number);
    println!("In main: {number}");
}

fn add_ten(mut n: i32) {
    n += 10;
    println!("In add_ten: {n}");
}
```
```output
In add_ten: 15
In main: 5
```

`add_ten` received a *copy* of the number 5 in its own variable `n`. Changing `n` does not touch `number` in `main`. Parameters and all variables declared inside a function are **local**: they exist only while that function runs. This keeps functions independent of each other. For simple values such as numbers, passing means copying. For bigger data the story is more interesting, and it is the subject of [Part 2](#ownership).

## Documenting a function

A comment that starts with three slashes, `///`, is a **documentation comment**. It describes the thing that follows it. Rust's tools collect these comments and build a website from them: run `cargo doc --open` in a project to see it. Your editor also shows them when you point at a function name.

```rust run
/// Returns the area of a rectangle.
///
/// Both sides must be given in the same unit.
fn area(width: u32, height: u32) -> u32 {
    width * height
}

fn main() {
    println!("{}", area(2, 5));
}
```
```output
10
```

## What makes a good function

- **It does one thing**, and its name says what: `calculate_tax`, `print_report`, `is_valid`. Function names use snake_case, like variables.
- **It is short.** If you cannot see all of it on the screen, think about splitting it.
- **It prefers returning a value over printing.** A function that returns its result can be reused anywhere. One that prints can only print.

:::recap
- `fn name(parameter: Type) -> ReturnType { body }` defines a function. `name(argument)` calls it.
- Parameter types and the return type must always be written.
- The last expression of the body, without a semicolon, is the return value. `return` leaves early.
- Expressions produce values. Statements do not. A semicolon turns an expression into a statement.
- A function with no return value returns the unit type `()`.
- `///` comments document the item below them.
:::

:::quiz Check your understanding
? What does this function return?
```rust
fn mystery(a: i32) -> i32 {
    let b = a * 2;
    b + 1
}
```
- Nothing, because there is no `return`
- `a * 2`
+ `b + 1`, the last expression without a semicolon
- It does not compile
= The value of the final expression is returned automatically. With `a` = 5 the result is 11.

? Which one is a statement, not an expression?
- `3 + 4`
- `area(2, 5)`
+ `let total = 3 + 4;`
- `{ 3 + 4 }`
= A `let` line does something (it creates a variable) but produces no value. The other three all produce a value.

? Why must parameter types be written in a function signature?
- Because the compiler cannot work out types at all
+ Because the signature is a clear promise between the function and its callers, which keeps errors local and code readable
- Because parameters are always numbers
- Because functions run faster with types
= The compiler infers types inside function bodies, but signatures are fixed contracts. You can understand how to use a function from its signature alone.

? Why does returning a value usually make a function easier to reuse?
- Because a function can print only once
- Because return values are stored on the stack automatically
+ Because the caller can decide what to do with the result and combine it with other work
- Because printing values is faster than computing them
= A function that returns a value can be used in expressions, assigned to variables, or tested. That makes it composable.
:::

:::exercise guided Your first function with a result
Write a function `square` that takes one `i32` and returns that number multiplied by itself. Call it from `main` to print the squares of 4 and of −9.
::hint
The signature is `fn square(n: i32) -> i32`. The body is a single expression without a semicolon.
::solution
```rust run
fn main() {
    println!("{}", square(4));
    println!("{}", square(-9));
}

fn square(n: i32) -> i32 {
    n * n
}
```
```output
16
81
```

The call `square(4)` is itself an expression with the value 16, so it can be placed directly inside `println!`.
:::

:::exercise practice Two small tools
Write two functions and test them from `main`:

1. `celsius_to_fahrenheit` takes an `f64` and returns an `f64` (multiply by 9.0, divide by 5.0, add 32.0).
2. `is_even` takes an `i32` and returns a `bool`.

Expected output for 36.6 degrees and for the numbers 10 and 7:

```text
97.88
true
false
```
::hint
`n % 2 == 0` is an expression of type `bool`. It can be the whole body of `is_even`. Print the temperature with `{:.2}`.
::solution
```rust run
fn main() {
    println!("{:.2}", celsius_to_fahrenheit(36.6));
    println!("{}", is_even(10));
    println!("{}", is_even(7));
}

fn celsius_to_fahrenheit(celsius: f64) -> f64 {
    celsius * 9.0 / 5.0 + 32.0
}

fn is_even(n: i32) -> bool {
    n % 2 == 0
}
```
```output
97.88
true
false
```

A comparison is an expression like any other, so `is_even` needs no `if`. Beginners often write "if it is even return true, else return false". Returning the comparison directly says the same thing in one line.
:::

:::exercise challenge Return three values at once
In the last chapter you converted seconds to hours, minutes and seconds. Turn that into a function `to_clock` that takes the total seconds (`u32`) and returns all three numbers as a tuple. In `main`, unpack the tuple and print `2 h 3 min 4 s` for 7384.
::hint
The return type is `(u32, u32, u32)`. The last line of the body builds the tuple: `(hours, minutes, seconds)`. In `main`, write `let (h, m, s) = to_clock(7384);`.
::solution
```rust run
fn main() {
    let (h, m, s) = to_clock(7384);
    println!("{h} h {m} min {s} s");
}

/// Splits a number of seconds into hours, minutes and seconds.
fn to_clock(total: u32) -> (u32, u32, u32) {
    let hours = total / 3600;
    let rest = total % 3600;
    (hours, rest / 60, rest % 60)
}
```
```output
2 h 3 min 4 s
```

A function returns exactly one value, but that value can be a tuple, which is how Rust functions give back several results. The caller destructures the tuple into separate variables.
:::
