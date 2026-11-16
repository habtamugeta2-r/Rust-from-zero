@id variables
@part p3
@title Variables: giving names to values
@short Variables and mutability
@level beginner
@time 40
@learn Store a value under a name with `let` and use it | Explain why Rust variables cannot change unless you write `mut` | Use shadowing, scopes and constants correctly | Read the compiler errors that variables cause

When a value is used more than once, repeating it by hand makes changes error-prone. A [[variable]] gives a value a name so later code can refer to it. In Rust, `let` creates a [[binding]]; the value's type is checked, and its [[mutability]] is off by default unless you explicitly choose `mut`. This chapter starts with those rules and builds towards scopes and constants.

## Your first variable

```rust run
fn main() {
    let people = 3;
    println!("Pancakes for {people} people");
    println!("- {} g flour", 50 * people);
    println!("- {} eggs", people);
    println!("- {} ml milk", 100 * people);
}
```
```output
Pancakes for 3 people
- 150 g flour
- 3 eggs
- 300 ml milk
```

The line `let people = 3;` reads: "let `people` be 3". From that line on, the name `people` stands for the value 3. To cook for 5, you change one number in one place.

:::analogy A labelled jar
A variable is like a jar with a label on it. `let people = 3;` puts the value 3 in a jar and writes "people" on the label. Later, when the program reads `people`, it looks in the jar with that label and uses what it finds.
:::

There are two ways to put a variable into printed text:

- **`{people}`** puts the name directly inside the curly brackets. This works for a simple name only.
- **`{}`** with the value after the comma works for anything, including a calculation such as `50 * people`.

:::plain Declare, initialise, assign, statement
To **declare** a variable is to create it (with `let`). To **initialise** it is to give it its first value. To **assign** is to give a variable a value with `=`. In Rust, `=` does not mean "is equal to" as in maths. It means "store the value on the right under the name on the left". A complete instruction such as `let people = 3;` is called a **[[statement]]**.
:::

## Variables do not change, unless you say so

Here is the first place where Rust surprises people who know other languages. Try to change a variable:

```rust fail E0384
fn main() {
    let score = 10;
    println!("Score: {score}");
    score = 20;
    println!("Score: {score}");
}
```
```error auto
```

In Rust a variable is **[[immutable]]** by default: once it has a value, the value cannot change. (*Immutable* means "cannot be changed". The opposite is *mutable*.) The compiler even tells you the fix: add the word `mut`.

```rust run
fn main() {
    let mut score = 10;
    println!("Score: {score}");
    score = 20;
    println!("Score: {score}");
    score = score + 5;
    println!("Score: {score}");
    score += 5;
    println!("Score: {score}");
}
```
```output
Score: 10
Score: 20
Score: 25
Score: 30
```

`let mut` creates a variable that may change. The line `score = score + 5;` looks strange if you read `=` as "equals". Read it as an instruction instead: "work out `score + 5`, then store the result in `score`". Because this is so common, there is a short form: `score += 5;`.

| Short form | Means the same as | In words |
|---|---|---|
| `x += 5;` | `x = x + 5;` | add 5 to x |
| `x -= 5;` | `x = x - 5;` | subtract 5 from x |
| `x *= 5;` | `x = x * 5;` | multiply x by 5 |
| `x /= 5;` | `x = x / 5;` | divide x by 5 |

### Why immutable by default?

It can feel like the language is being difficult. It is being careful, for three good reasons:

1. **Fewer surprises.** When you see `let tax_rate = 15;`, you know that `tax_rate` is 15 everywhere below that line. You do not have to read 200 lines to check that nothing changed it.
2. **`mut` is a signal.** The word tells every reader "watch this one, it changes".
3. **It makes Rust's safety rules possible.** In [the borrowing chapter](#borrowing) you will see that data which cannot change can be shared freely, and that this is the key to safe programs that do many things at once.

Most variables in real programs never need to change. In Rust you will write plain `let` far more often than `let mut`.

:::compare Other languages start from the other side
In Python, JavaScript (with `let`), Java and C, a variable can be changed unless you take a special step to forbid it (`const` in JavaScript and C++, `final` in Java). Rust turns this around: nothing changes unless you allow it with `mut`. The careful choice is the default, and the risky choice needs an extra word.
:::

## Rules for names

- A name may contain letters, digits and the underscore `_`. It cannot start with a digit and cannot contain spaces.
- Upper and lower case are different: `total` and `Total` are two different names.
- Rust programmers write variable names in **snake_case**: all lower case, with words joined by underscores, like `player_score` or `items_in_cart`. The compiler warns you if you use another style.
- Some words belong to the language and cannot be used as names, for example `let`, `fn`, `mut` and `if`. They are called **keywords**. The full list is in the [reference appendix](#reference).
- Choose names that say what the value *means*. `price_per_kg` is better than `p` or `x2`.

If you create a variable and never use it, the program still compiles, but the compiler gives a **warning**. A warning does not stop the program. It points at something that is probably a mistake.

```rust warns
fn main() {
    let colour = "red";
    println!("Hello!");
}
```
```error auto
```

Take warnings seriously. A good habit is to keep your program free of them.

:::details The special name `_`
`_` is a name that means "I am not interested in this value". Write `let _ = something;` and Rust works out `something` and then throws the result away, without warning you. You will also see it in loops: `for _ in 1..4` runs its body four times and keeps no number at all. This is the deliberate opposite of a forgotten variable. A variable you named but never used earns a warning, because you probably meant to look at it; `_` says "no — leaving this out was on purpose".
:::

## A first look at types

Every value in Rust has a **type**: what kind of value it is. `3` is a whole number, `"red"` is text. The compiler works out the type by itself from the value you write. This is called **[[type inference]]**. You can also write the type yourself after a colon:

```rust run
fn main() {
    let people: u32 = 3;
    let colour: &str = "red";
    println!("{people} {colour} apples");
}
```
```output
3 red apples
```

`u32` is one of Rust's whole-number types and `&str` is a type for text. The [next chapter](#types) explains types properly. For now, know that the type of a variable is fixed: a variable that holds a number cannot later hold text.

## Shadowing: reusing a name

You may declare a *new* variable with the same name as an old one. The new one **shadows** the old one: from that line on, the name means the new variable.

```rust run
fn main() {
    let price = 100;
    let price = price * 2;
    let price = price + 5;
    println!("The price is {price}");
}
```
```output
The price is 205
```

Each `let` creates a fresh variable. This is different from `mut` in two ways:

- **Without `let`, the compiler still protects you.** The value cannot be changed by accident later, because the variable is still immutable.
- **The new variable can have a different type.** This is handy when you turn a value from one form into another and do not want to invent two names:

```rust run
fn main() {
    let answer = "forty-two";      // text
    let answer = answer.len();     // a number: how many characters the text has
    println!("{answer}");
}
```
```output
9
```

(`.len()` asks the text for its length. You will see many such *methods* later.) With `mut` the same idea is rejected, because a variable can never change its type:

```rust fail E0308
fn main() {
    let mut answer = "forty-two";
    answer = answer.len();
}
```
```error auto
```

## Scope: where a variable lives

Curly brackets `{ }` create a **[[block]]**. A variable exists from the line where it is declared to the end of the block that contains it. That stretch of code is the variable's **[[scope]]**. When the block ends, the variable is gone.

```rust run
fn main() {
    let outside = 1;
    {
        let inside = 2;
        println!("In the inner block: {outside} and {inside}");
    }
    println!("After the inner block: {outside}");
}
```
```output
In the inner block: 1 and 2
After the inner block: 1
```

Code inside a block can see the variables of the blocks around it. The reverse is not true:

```rust fail E0425
fn main() {
    {
        let inside = 2;
    }
    println!("{inside}");
}
```
```error auto
```

:::analogy Scope is like a room
A block is a room. Things you bring into the room stay in the room, and when you leave, they are cleared away. From inside you can look out through the window and see what is in the bigger room around you. From outside you cannot see in.
:::

[[Shadowing|shadowing]] inside a block lasts only until the block ends. Predict the output before you read it:

```rust run
fn main() {
    let x = 5;
    {
        let x = x * 2;
        println!("Inside the block, x is {x}");
    }
    println!("Outside the block, x is {x}");
}
```
```output
Inside the block, x is 10
Outside the block, x is 5
```

Scope will become very important in [the ownership chapter](#ownership), because Rust frees memory at the moment a variable goes out of scope.

## A variable always has a value before you read it

You may declare a variable first and give it a value later. What Rust never allows is *reading* a variable that has no value yet:

```rust fail E0381
fn main() {
    let total: i32;
    println!("{total}");
}
```
```error auto
```

Rust checks this on **every possible path** through the code, not just the line you are looking at. If a value is given in both an `if` branch and its `else`, then after the branch the variable is certainly ready. If one path forgets to give it a value, the compiler reports it. This "always in a known state" rule is one of the ideas that makes Rust's ownership rules possible: because Rust tracks, line by line, exactly when a name holds a value, it can later promise that moved and borrowed data is never read in a state it should not be.

:::compare Why this matters
In C, reading a variable before giving it a value is allowed and gives you whatever happened to be in that spot of memory: a random-looking number, different on every run. Bugs like that can hide for years. In Java or JavaScript you would get a special "nothing" value (`null` or `undefined`) that often causes a crash later. Rust refuses to compile the program, so this whole kind of bug cannot happen.
:::

## Constants: values that are fixed forever

Some values never change at all: the number of seconds in a minute, the maximum number of players in a game. For these, use a **[[constant]]**:

```rust run
const SECONDS_PER_MINUTE: u32 = 60;
const MINUTES_PER_HOUR: u32 = 60;
const SECONDS_PER_HOUR: u32 = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;

fn main() {
    println!("An hour has {SECONDS_PER_HOUR} seconds.");
}
```
```output
An hour has 3600 seconds.
```

| | `let` variable | `const` constant |
|---|---|---|
| Can it change? | Only with `mut` | Never |
| Type | Usually worked out by the compiler | Must always be written |
| Value | Can be calculated while the program runs | Must be known when the program is compiled |
| Where | Inside functions | Anywhere, including outside all functions |
| Name style | `snake_case` | `SCREAMING_SNAKE_CASE` |

Constants give a meaning to "magic numbers". `price * VAT_RATE` explains itself. `price * 15` does not.

:::details `const` and `static`
You will sometimes meet a second keyword for a [[static]] value, `static`. Both `const` and `static` hold a value that lasts for the whole program, but they do it in different ways. A `const` is a fixed value that the compiler copies into every place it is used. A `static` lives in one fixed spot in memory for the program's lifetime, so it has an address of its own — a difference that only matters in the rare cases where you need a place in memory, not just a value. There is also a `static mut`, a shared value that may change. That is a deliberate exception to Rust's usual caution, and you should treat one the same way you would treat a variable that every part of the program can reach and rewrite. For almost everything in this guide, `const` is the right tool.
:::

:::details Under the hood: registers, stack slots, and `mut`
In compiled machine code, variable names such as `score` or `price` disappear completely (aside from optional debug symbols). Each live binding becomes either a **CPU register** (like `eax` or `r12`) or a fixed byte offset inside the function's **stack frame** (like `[rsp + 16]`). Likewise, `mut` takes **zero extra bytes** and emits **zero extra machine instructions** at runtime: it is purely a compile-time permission rule inside the type and borrow checker.
:::

:::recap
- `let name = value;` creates a variable. It is immutable: it cannot change.
- `let mut` creates a variable that can change. `x += 1` is short for `x = x + 1`.
- Every variable has one fixed type. The compiler usually works it out.
- A second `let` with the same name shadows the first, and may even change the type.
- A variable lives until the end of the block `{ }` it was declared in. That is its scope.
- Rust never lets you read a variable that has no value.
- `const NAME: Type = value;` defines a value that is fixed for the whole program.
:::

:::quiz Check your understanding
? What is wrong with this code?
```rust
let lives = 3;
lives = lives - 1;
```
- Nothing. It sets `lives` to 2
- `lives - 1` is not allowed
+ `lives` is immutable, so it cannot be given a new value. It needs `let mut`
- The variable name is too short
= Variables are immutable unless declared with `let mut`. The compiler reports error E0384 and suggests adding `mut`.

? What does this program print?
```rust
fn main() {
    let n = 2;
    let n = n * n;
    {
        let n = n + 100;
    }
    println!("{n}");
}
```
- `2`
- `104`
+ `4`
- It does not compile
= The second `let` shadows `n` with 2 × 2 = 4. The `let` inside the block creates another `n` (104), but that one disappears when the block ends. Outside, `n` is still 4. (The compiler will warn that the inner `n` is never used.)

? Which name follows Rust's style for a normal variable?
- `PlayerScore`
- `playerScore`
- `PLAYER_SCORE`
+ `player_score`
= Variables use snake_case. `SCREAMING_SNAKE_CASE` is for constants, and the capitalised styles are used for other things you will meet later.

? When should you use `const` instead of `let`?
- Whenever a variable is not `mut`
- When the value is a number
+ When the value is fixed for the whole program and known before the program runs
- Never. `const` is only kept for old programs
= A constant is for a value that is the same in every run, such as a conversion factor or a limit. An immutable `let` variable can still get a different value each time the program runs, for example from user input.
:::

:::exercise guided A greeting with variables
Write a program with two variables: `name` holding your name as text, and `age` holding your age as a number. Print two lines, like this:

```text
Sara is 29 years old.
Next year Sara will be 30.
```

The program must work out the second number from `age`.
::hint
Text goes in double quotes: `let name = "Sara";`. For the second line you need `{}` and a calculation after the comma, because `{age + 1}` is not allowed inside the brackets.
::solution
```rust run
fn main() {
    let name = "Sara";
    let age = 29;
    println!("{name} is {age} years old.");
    println!("Next year {name} will be {}.", age + 1);
}
```
```output
Sara is 29 years old.
Next year Sara will be 30.
```

Neither variable needs `mut`: we never change `age`, we only *calculate* a new value from it. Change the two values at the top and every line of output follows.
:::

:::exercise practice Repair the program
This program should print `count is 1`, then `count is 2`, then `total is 20`. It has two mistakes. Find them and fix them.

```rust fail
fn main() {
    let count = 1;
    println!("count is {count}");
    count = count + 1;
    println!("count is {count}");
    let Total = count * 10;
    println!("total is {total}");
}
```
::hint
One mistake is about changing a variable. The other is about upper and lower case letters.
::solution
```rust run
fn main() {
    let mut count = 1;
    println!("count is {count}");
    count = count + 1;
    println!("count is {count}");
    let total = count * 10;
    println!("total is {total}");
}
```
```output
count is 1
count is 2
total is 20
```

1. `count` is changed on line 4, so it must be declared with `let mut`.
2. The variable was declared as `Total` but used as `total`. Names are case-sensitive, so the compiler could not find `total`. The lower-case spelling is the right one, because variables use snake_case.
:::

:::exercise practice Temperature converter
To convert a temperature from Celsius to Fahrenheit, multiply by 9, divide by 5, and add 32. Store 25 in a variable called `celsius`, calculate `fahrenheit` from it, and print:

```text
25°C is 77°F
```

Then change `celsius` to 100 and check that you get 212.
::hint
`*` multiplies and `/` divides. `let fahrenheit = celsius * 9 / 5 + 32;`
::solution
```rust run
fn main() {
    let celsius = 25;
    let fahrenheit = celsius * 9 / 5 + 32;
    println!("{celsius}°C is {fahrenheit}°F");
}
```
```output
25°C is 77°F
```

The calculation follows the usual rules of arithmetic: multiplication and division happen before addition. With whole numbers, division drops anything after the decimal point, so this version is exact only for some temperatures. The next chapter introduces numbers with decimals.
:::

:::exercise challenge Swap two values
Start with this program. Add code where the comment is so that the program prints `a = 2, b = 1`. You may not type the digits 1 or 2 again.

```rust run
fn main() {
    let mut a = 1;
    let mut b = 2;
    // your code here
    println!("a = {a}, b = {b}");
}
```
::hint
If you write `a = b;` first, the old value of `a` is lost. Where could you keep it safe for a moment?
::solution
```rust run
fn main() {
    let mut a = 1;
    let mut b = 2;
    let old_a = a;
    a = b;
    b = old_a;
    println!("a = {a}, b = {b}");
}
```
```output
a = 2, b = 1
```

A third variable holds the old value of `a` while `a` is overwritten. This is like swapping the contents of two glasses: you need a third glass. Swapping is so common that Rust has a ready-made tool for it, `std::mem::swap`, which you will be able to read after the chapter on references.
:::
