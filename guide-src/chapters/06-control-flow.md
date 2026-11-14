@id control-flow
@part p1
@title Control flow: decisions and repetition
@short Decisions and loops
@level beginner
@time 35
@learn Make a program choose between paths with `if`, `else` and `match` | Repeat work with `loop`, `while` and `for` | Stop or skip rounds of a loop with `break` and `continue` | Pick the right kind of loop for a task

A program that always runs the same lines in the same order cannot do much. Real programs **decide** (if the password is right, let the user in) and **repeat** (do this for every item in the list). Together these are called **control flow**: they control which line runs next. With sequence, decision and repetition you can express any computation.

:::analogy A crossroads with signs
When you reach a junction, a sign tells you which road to take. A program is the same. It reaches a condition and chooses one path, not several. The road signs are the `if`, `else if`, and `else` branches.
:::

## Decisions with `if`

```rust run
fn main() {
    let temperature = 31;

    if temperature > 30 {
        println!("It is hot.");
    } else if temperature > 15 {
        println!("It is pleasant.");
    } else {
        println!("It is cold.");
    }
}
```
```output
It is hot.
```

- After `if` comes a **condition**: an expression that is `true` or `false`. No brackets are needed around it.
- If the condition is true, the block after it runs, and the rest of the chain is skipped.
- `else if` tests another condition, only when all the ones before were false.
- `else` runs when nothing above was true. Both `else if` and `else` are optional.

The conditions are tested from top to bottom and **only the first true one runs**. With `temperature = 31` both `> 30` and `> 15` are true, but only "It is hot." is printed.

### The condition must be a `bool`

```rust fail E0308
fn main() {
    let items = 3;
    if items {
        println!("The cart is not empty.");
    }
}
```
```error auto
```

:::compare No "truthy" values
In C, Python and JavaScript, a number or a piece of text can be used as a condition: zero and empty count as false, everything else as true. That is short to write, and a well-known source of bugs. Rust wants you to say what you mean: `if items > 0` or `if items != 0`.
:::

### `if` is an expression

In Rust `if` produces a value, so you can use it on the right side of `let`:

```rust run
fn main() {
    let number = 7;
    let kind = if number % 2 == 0 { "even" } else { "odd" };
    println!("{number} is {kind}");
}
```
```output
7 is odd
```

The value of each block is its last expression (no semicolon, as in functions). Both blocks must produce the same type, and the `else` part is required, because `kind` needs a value in every case.

## Many choices with `match`

When one value is compared against many possibilities, a chain of `else if` gets long. `match` is clearer:

```rust run
fn main() {
    let day = 6;
    let name = match day {
        1 => "Monday",
        2 => "Tuesday",
        3..=5 => "midweek",
        6 | 7 => "weekend",
        _ => "not a day",
    };
    println!("{name}");
}
```
```output
weekend
```

Each line inside is called an **arm**: a pattern, then `=>`, then the result for that case. `3..=5` means "3 up to and including 5", `6 | 7` means "6 or 7", and `_` means "anything else". The compiler checks that **every possible value is covered**. Remove the `_` arm and the program does not compile. `match` is one of Rust's most loved features, and [chapter 13](#enums) shows its full power.

## Repeating with `loop`

`loop` repeats its block forever, until the code says `break`.

```rust run
fn main() {
    let mut count = 0;
    loop {
        count += 1;
        println!("Lap {count}");
        if count == 3 {
            break;
        }
    }
    println!("Done.");
}
```
```output
Lap 1
Lap 2
Lap 3
Done.
```

A loop is also an expression. `break` can carry a value out of it:

```rust run
fn main() {
    let mut n = 1;
    let first_big_power = loop {
        n *= 2;
        if n > 1000 {
            break n;
        }
    };
    println!("{first_big_power}");
}
```
```output
1024
```

:::tip If your program never stops
A loop without a reachable `break` runs forever. This is called an *infinite loop*, and everyone writes one by accident sooner or later. Press {{Ctrl}} + {{C}} in the terminal to stop the program.
:::

## Repeating while a condition holds: `while`

```rust run
fn main() {
    let mut fuel = 3;
    while fuel > 0 {
        println!("Fuel left: {fuel}");
        fuel -= 1;
    }
    println!("Empty!");
}
```
```output
Fuel left: 3
Fuel left: 2
Fuel left: 1
Empty!
```

The condition is checked **before** each round. When it is false, the loop ends. If it is false at the start, the block never runs.

## Repeating for each item: `for`

The `for` loop is the one you will use most. It runs its block once for every item in a collection or a range of numbers.

```rust run
fn main() {
    for i in 1..4 {
        println!("i = {i}");
    }
    for i in 1..=3 {
        print!("{i} ");
    }
    println!();
    for i in (1..=3).rev() {
        print!("{i} ");
    }
    println!("lift-off!");
    for i in (0..10).step_by(5) {
        print!("{i} ");
    }
    println!();
}
```
```output
i = 1
i = 2
i = 3
1 2 3
3 2 1 lift-off!
0 5
```

| Range | Means | Numbers produced |
|---|---|---|
| `1..4` | from 1 up to, but **not including**, 4 | 1, 2, 3 |
| `1..=4` | from 1 up to **and including** 4 | 1, 2, 3, 4 |
| `(1..=4).rev()` | the same, reversed | 4, 3, 2, 1 |
| `(0..10).step_by(5)` | every fifth number | 0, 5 |

Going through an array works the same way:

```rust run
fn main() {
    let fruits = ["apple", "banana", "cherry"];
    for fruit in fruits {
        println!("I like {fruit}.");
    }
    for (index, fruit) in fruits.iter().enumerate() {
        println!("{index}: {fruit}");
    }
}
```
```output
I like apple.
I like banana.
I like cherry.
0: apple
1: banana
2: cherry
```

`.iter().enumerate()` hands you each item together with its position, as a tuple that the loop unpacks into `index` and `fruit`. You will learn how this works in [chapter 26](#iterators).

:::compare Why Rust has no C-style `for`
C, Java and JavaScript write `for (int i = 0; i < 5; i++)`: three parts that you must get exactly right. A wrong `<` or `<=` there is the famous "off-by-one" error, and with an array it reads past the end. Rust's `for item in collection` cannot go out of range, because you never handle the index yourself.
:::

### A common pattern: collecting a result in a loop

```rust run
fn main() {
    let mut sum = 0;
    for n in 1..=100 {
        sum += n;
    }
    println!("{sum}");
}
```
```output
5050
```

A variable created *before* the loop (here `sum`) is updated in every round and holds the answer afterwards. This variable is often called an *accumulator*.

## `break`, `continue` and labels

`break` leaves the loop completely. `continue` skips the rest of the current round and starts the next one.

```rust run
fn main() {
    for n in 1..=6 {
        if n % 2 == 0 {
            continue; // skip even numbers
        }
        println!("{n} is odd");
    }
}
```
```output
1 is odd
3 is odd
5 is odd
```

Loops can be placed inside loops. `break` and `continue` then act on the innermost one. To control an outer loop, give it a **label** (a name that starts with a single quote):

```rust run
fn main() {
    'rows: for row in 1..=3 {
        for column in 1..=3 {
            if column == 3 {
                continue 'rows; // go to the next row
            }
            if row == 3 {
                break 'rows; // stop everything
            }
            println!("row {row}, column {column}");
        }
    }
}
```
```output
row 1, column 1
row 1, column 2
row 2, column 1
row 2, column 2
```

## Which loop should I use?

| Situation | Use |
|---|---|
| "Do this for every item" or "do this N times" | `for` |
| "Keep going as long as this is true" | `while` |
| "Keep going until something inside decides to stop" | `loop` with `break` |

When in doubt, try `for` first. It is the safest and usually the clearest.

:::recap
- `if condition { } else if other { } else { }` chooses a path. Conditions must be `bool`.
- `if` and `match` are expressions: they produce a value.
- `match` compares one value against several patterns and must cover every case.
- `loop` repeats until `break`, `while` repeats while a condition is true, and `for` goes through a range or a collection.
- `1..4` excludes the end, `1..=4` includes it.
- `break` leaves a loop, `continue` jumps to the next round, and labels choose which loop.
:::

:::quiz Check your understanding
? How many lines does this print?
```rust
for i in 0..5 {
    println!("{i}");
}
```
- 4
+ 5
- 6
- It never stops
= `0..5` produces 0, 1, 2, 3, 4: five numbers. The end of a `..` range is not included.

? What is printed?
```rust
let x = 20;
if x > 10 {
    println!("big");
} else if x > 5 {
    println!("medium");
} else {
    println!("small");
}
```
+ `big`
- `big` and `medium`
- `medium`
- `small`
= Only the first true condition runs. `x > 5` is also true, but it is never tested, because the branch above it already matched.

? What does `continue` do inside a loop?
- It ends the loop
- It ends the program
+ It skips the rest of the current round and starts the next one
- It restarts the loop from the first round
= `continue` jumps to the next round. `break` is the one that ends the loop.

? Why does `let size = if n > 100 { "large" };` not compile?
- `if` cannot be used with `let`
+ There is no `else`, so `size` would have no value when the condition is false
- Text cannot be stored in a variable
- The condition needs brackets
= When `if` is used as a value, every case must produce a value of the same type. Without `else`, the "false" case produces nothing.
:::

:::exercise guided FizzBuzz
This is the most famous beginner exercise in programming. Print the numbers from 1 to 15, one per line, but:

- for numbers divisible by 3, print `Fizz` instead,
- for numbers divisible by 5, print `Buzz` instead,
- for numbers divisible by both, print `FizzBuzz`.
::hint
A number is divisible by 3 when `n % 3 == 0`. The order of the tests matters: check the "both" case **first**. Otherwise 15 is caught by the test for 3 and you never reach it.
::solution
```rust run
fn main() {
    for n in 1..=15 {
        if n % 15 == 0 {
            println!("FizzBuzz");
        } else if n % 3 == 0 {
            println!("Fizz");
        } else if n % 5 == 0 {
            println!("Buzz");
        } else {
            println!("{n}");
        }
    }
}
```
```output
1
2
Fizz
4
Buzz
Fizz
7
8
Fizz
Buzz
11
Fizz
13
14
FizzBuzz
```

A number divisible by both 3 and 5 is divisible by 15, so `n % 15 == 0` tests the "both" case. It must come first because an `if` chain stops at the first true condition.
:::

:::exercise practice A triangle of stars
Write a program that prints this triangle. The number of rows (here 4) should be stored in one variable, so that changing it changes the triangle.

```text
*
**
***
****
```
::hint
Use a loop inside a loop. The outer loop goes through the rows 1 to 4. The inner loop prints as many stars as the row number, with `print!`. After the inner loop, `println!()` ends the line.
::solution
```rust run
fn main() {
    let rows = 4;
    for row in 1..=rows {
        for _ in 0..row {
            print!("*");
        }
        println!();
    }
}
```
```output
*
**
***
****
```

For each row, the inner loop runs `row` times. The name `_` is used for the inner loop variable because its value is never needed: we only want "do this `row` times". The underscore tells the compiler, and the reader, that this is on purpose.
:::

:::exercise challenge Prime numbers
A prime number is a whole number greater than 1 that can be divided only by 1 and by itself. Write a function `is_prime(n: u32) -> bool`, and use it to print all primes up to 30 on one line:

```text
2 3 5 7 11 13 17 19 23 29
```
::hint
To test `n`, try every possible divisor from 2 up to `n - 1`. If `n % divisor == 0` for any of them, return `false` at once. If the loop finishes without finding one, `n` is prime.
::solution
```rust run
fn main() {
    for n in 1..=30 {
        if is_prime(n) {
            print!("{n} ");
        }
    }
    println!();
}

fn is_prime(n: u32) -> bool {
    if n < 2 {
        return false;
    }
    for divisor in 2..n {
        if n % divisor == 0 {
            return false;
        }
    }
    true
}
```
```output
2 3 5 7 11 13 17 19 23 29
```

`return false` inside the loop leaves the whole function as soon as one divisor is found. If the loop ends normally, no divisor exists, and the last expression `true` is returned. For `n = 2` the range `2..2` is empty, so the loop body never runs and 2 is correctly reported as prime.

This solution combines everything from Part 1: a function, a loop, a decision, an early return, and the remainder operator.
:::
