@id project-guessing
@part p3
@kind project
@title Project: a number guessing game
@short Project: guessing game
@level beginner
@time 60
@learn Plan a program in plain words before writing code | Read what the user types and turn it into a number | Use code written by other people (a crate) through Cargo | Combine variables, loops, decisions and functions in one working program

This project combines input, parsing, decisions and repetition in a small number-guessing game. The program chooses a secret number in the stated range, reads guesses from the player, and reports whether each guess is too high or too low. The goal is to make the interaction work while keeping invalid input from crashing the program.

This project needs Rust installed on your computer, because it reads from the keyboard and uses a library from the internet. If you skipped the installation, go back to [chapter 4](#setup) first.

A session will look like this:

```text
I am thinking of a number between 1 and 100.
Your guess:
50
Too big.
Your guess:
twenty
Please type a whole number.
Your guess:
25
Too small.
Your guess:
37
Correct! You needed 3 guesses.
```

## Step 0: plan in plain words

Experienced programmers do not start by typing. They first describe the program in everyday language. A plan written this way is called **pseudocode** ("almost code").

1. Pick a secret number between 1 and 100.
2. Repeat:
   1. Ask the player for a guess.
   2. Read what the player typed.
   3. Turn the text into a number. If it is not a number, say so and ask again.
   4. Compare the guess with the secret number.
   5. If it is too small or too big, say so. If it is right, congratulate the player and stop.

Each line will become a few lines of Rust. You will build the program in small steps, and **run it after every step**. Working in small steps is the most important habit in programming: when something breaks, you know it was the last thing you added.

Create the project:

```sh
$ cargo new guessing_game
$ cd guessing_game
```

## Step 1: read what the player types

Replace the contents of `src/main.rs` with this:

```rust check
use std::io;

fn main() {
    println!("Your guess:");

    let mut input = String::new();
    io::stdin()
        .read_line(&mut input)
        .expect("could not read the input");

    println!("You typed: {input}");
}
```

Run it with `cargo run`, type something, and press {{Enter}}. Several things here are new. You will study each of them properly later. For now, this is what they do:

- **`use std::io;`** Rust comes with a large collection of ready-made code called the **[[standard library]]**, or `std`. Its part called `io` (for *input/output*) handles reading and writing. This line makes the name `io` available in your file.
- **`String::new()`** creates a new, empty piece of text that can grow. The variable is `mut` because reading will put characters into it.
- **`io::stdin()`** gives access to the keyboard input of the terminal ("standard input").
- **`.read_line(&mut input)`** waits until the player presses {{Enter}} and adds everything they typed to `input`. The `&mut` in front means "you may change my variable". Why that is needed is the subject of [chapter 15](#borrowing).
- **`.expect("...")`** Reading can fail, for example if the terminal is closed. `read_line` therefore does not just "work": it reports whether it worked. `.expect` says "if it failed, stop the program and show this message". [Chapter 23](#errors) covers this in depth.

The call is written over three lines only to keep it readable. `io::stdin().read_line(&mut input).expect("...")` is one instruction, ending in one semicolon.

:::plain Modules and the path separator
The double colon `::` is a path separator, like the `/` in a file name. Rust organises code into **modules**, and the standard library is a tree of them. `std::io` means "the `io` module inside `std`", and `std::cmp::Ordering` (you will meet it in Step 4) means "the type `Ordering` inside the `cmp` module inside `std`". A `use` line at the top of a file brings one of those names into your file so you can write it short: `use std::io;` lets you write `io::stdin()` instead of `std::io::stdin()`. Your own project is a module too — everything in `src/main.rs` lives in a module called `main` — and later you will split a program across several files, one module per file, in [chapter 22](#modules).
:::

## Step 2: pick a secret number

Rust's standard library is kept small on purpose. It has no random number generator. For that you use a **crate**: a package of Rust code that someone has published for others to use. Crates are shared on the website [crates.io](https://crates.io), and Cargo downloads them for you. A crate that your project uses is called a **dependency**.

The crate for random numbers is called `rand`. Add it to your project:

```sh
$ cargo add rand
```

Open `Cargo.toml`. Cargo has added a line under `[dependencies]`:

```toml
[dependencies]
rand = "0.10.3"
```

The next time you run `cargo run`, Cargo downloads `rand` and compiles it together with your code. It also creates a file called `Cargo.lock`, which records the exact version of everything that was downloaded. Thanks to that file, the project builds the same way on every computer. You never edit `Cargo.lock` by hand.

:::compare Sharing code in other languages
Every modern language has a place for shared code: Python has PyPI and the `pip` tool, JavaScript has npm. C and C++ have no single standard way, which is one reason why using libraries there is harder. In Rust, Cargo and crates.io were part of the language from the start, so adding a library is always one command.
:::

Now use the crate:

```rust ext check
fn main() {
    let secret: u32 = rand::random_range(1..=100);
    println!("The secret number is {secret}.");
}
```

`rand::random_range(1..=100)` means: from the crate `rand`, call the function `random_range` with the range 1 to 100 (both included). Run it a few times. You get a different number each time.

:::tip Reading the manual of a crate
How would you know that `rand` has a function called `random_range`? Every crate has documentation at `docs.rs`. For this one it is [docs.rs/rand](https://docs.rs/rand). You can also run `cargo doc --open` in your project to see the documentation of all your dependencies in the browser, without internet.
:::

## Step 3: turn the text into a number

The player's input is text, such as `"50"`. The secret is a number. Rust does not compare text with numbers, so the text must be converted.

```rust run
fn main() {
    let input = "50\n";
    let guess: u32 = input.trim().parse().expect("that is not a number");
    println!("{}", guess + 1);
}
```
```output
51
```

- When the player presses {{Enter}}, a "new line" character (`\n`) ends up at the end of the input. **`.trim()`** removes spaces and new-line characters from both ends of a text.
- **`.parse()`** tries to turn text into another type. Which type? The one you asked for with `let guess: u32`.
- Turning text into a number can fail: `"twenty"` is not a number. So `parse` also reports success or failure.

Using `.expect` here would stop the whole program on a typing mistake. That is unfriendly. It is better to *handle* the problem: tell the player and ask again. For that you use `match`, which you met in the last chapter:

```rust wrap
# let input = "50\n";
let guess: u32 = match input.trim().parse() {
    Ok(number) => number,
    Err(_) => {
        println!("Please type a whole number.");
        return;
    }
};
# println!("{guess}");
```

The result of `parse` is one of two things: `Ok` with the number inside, or `Err` with a description of the problem inside. The first arm takes the number out of `Ok` and makes it the value of the whole `match`. The second arm runs when the conversion failed. (Inside the game loop you will write `continue` there instead of `return`, to jump to the next round.)

:::key Errors are ordinary values
In many languages a failed conversion "throws an exception" that flies through the program until something catches it, or crashes the program if nothing does. In Rust, a function that can fail returns a value that says "it worked, here is the result" or "it failed, here is why". The compiler makes sure you look at it. You cannot forget to handle the failure.
:::

You have now met one of Rust's two "maybe" types: **`Result`**, which means "it worked, here is the value" or "it failed, here is why". Its sibling is **`Option`**, which means "there is a value" or "there is none at all". Both are ordinary values that you handle with `match`, and [chapter 18](#enums) shows them in full.

## Step 4: compare the guess with the secret

```rust run
use std::cmp::Ordering;

fn main() {
    let secret = 37;
    let guess = 50;

    match guess.cmp(&secret) {
        Ordering::Less => println!("Too small."),
        Ordering::Greater => println!("Too big."),
        Ordering::Equal => println!("Correct!"),
    }
}
```
```output
Too big.
```

`guess.cmp(&secret)` compares two values and answers with one of exactly three possibilities: `Ordering::Less`, `Ordering::Greater` or `Ordering::Equal`. The `match` has one arm for each. If you forget one, the program does not compile, so no case can be missed. (The `&` means "look at this value without taking it". It is explained in [chapter 15](#borrowing).)

You could write the same with `if guess < secret { ... } else if guess > secret { ... } else { ... }`. Both are correct. The `match` version lets the compiler check that all cases are covered.

## Step 5: put it together in a loop

Now join the steps with a `loop`, and count the guesses:

```rust ext check file=src/main.rs
use std::cmp::Ordering;
use std::io;

fn main() {
    println!("I am thinking of a number between 1 and 100.");

    let secret = rand::random_range(1..=100);
    let mut attempts = 0;

    loop {
        println!("Your guess:");

        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .expect("could not read the input");

        let guess: u32 = match input.trim().parse() {
            Ok(number) => number,
            Err(_) => {
                println!("Please type a whole number.");
                continue;
            }
        };
        attempts += 1;

        match guess.cmp(&secret) {
            Ordering::Less => println!("Too small."),
            Ordering::Greater => println!("Too big."),
            Ordering::Equal => {
                println!("Correct! You needed {attempts} guesses.");
                break;
            }
        }
    }
}
```

Run it and play. Read the program once more from top to bottom and match every part with a line of the plan from Step 0.

Three details are worth a second look:

- `input` is created **inside** the loop, so every round starts with fresh, empty text. `read_line` *adds* to the text. If `input` were created once before the loop, the second guess would be glued to the first.
- `continue` in the `Err` arm jumps back to the top of the loop, so a typing mistake does not count as an attempt.
- `break` in the `Equal` arm ends the loop, and with it the program.

:::tip A strategy for the player
Always guess the middle of what is still possible: 50, then 25 or 75, and so on. Each guess removes half of the remaining numbers, so you never need more than 7 guesses for 1 to 100. This method is called **binary search**, and it is one of the most important ideas in computer science.
:::

## Make it better

A project is never really finished. These tasks let you practise changing a program that already works, which is what programmers do most of the time.

:::exercise practice A limit on guesses
Give the player only 7 guesses. If they have not found the number by then, print `Out of guesses. The number was 37.` (with the real number) and end the game.
::hint
Store the limit in a constant such as `const MAX_ATTEMPTS: u32 = 7;`. After a wrong guess, check whether `attempts` has reached the limit.
::solution
```rust ext check
use std::cmp::Ordering;
use std::io;

const MAX_ATTEMPTS: u32 = 7;

fn main() {
    println!("I am thinking of a number between 1 and 100.");
    println!("You have {MAX_ATTEMPTS} guesses.");

    let secret = rand::random_range(1..=100);
    let mut attempts = 0;

    loop {
        println!("Your guess:");
        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .expect("could not read the input");

        let guess: u32 = match input.trim().parse() {
            Ok(number) => number,
            Err(_) => {
                println!("Please type a whole number.");
                continue;
            }
        };
        attempts += 1;

        match guess.cmp(&secret) {
            Ordering::Less => println!("Too small."),
            Ordering::Greater => println!("Too big."),
            Ordering::Equal => {
                println!("Correct! You needed {attempts} guesses.");
                break;
            }
        }

        if attempts == MAX_ATTEMPTS {
            println!("Out of guesses. The number was {secret}.");
            break;
        }
    }
}
```

The new check sits *after* the comparison. If the seventh guess is right, the `Equal` arm has already left the loop with `break`, so the "out of guesses" message is never reached. The limit is a constant with a name, so it appears only once and explains itself.
:::

:::exercise practice Move the reading into a function
The loop is getting long. Move the code that asks for and reads a line into a function `read_guess` that returns the typed text as a `String`. The loop should then start with `let input = read_guess();`.
::hint
The return type is `String`. Create the `String` inside the function, fill it with `read_line`, and make it the last expression of the function.
::solution
```rust check
use std::io;

/// Asks the player for a guess and returns the line they typed.
fn read_guess() -> String {
    println!("Your guess:");
    let mut input = String::new();
    io::stdin()
        .read_line(&mut input)
        .expect("could not read the input");
    input
}

fn main() {
    let input = read_guess();
    println!("You typed: {}", input.trim());
}
```

In the game, replace the four lines that create and fill `input` with `let input = read_guess();`. The loop now reads almost like the plan: read a guess, convert it, compare it. Giving a name to a group of lines is the main purpose of functions.
:::

:::exercise challenge Warm and cold
Make the hints more helpful. If the guess is wrong but within 5 of the secret number, add `You are very close!`.
::hint
You need the distance between two numbers, whichever one is bigger. For unsigned numbers, `guess - secret` panics when `secret` is larger, because the result would be negative. Use `guess.abs_diff(secret)`, which gives the difference as a positive number.
::solution
Add these lines after the conversion and before the `match`:

```rust wrap
# let guess: u32 = 40;
# let secret: u32 = 37;
let distance = guess.abs_diff(secret);
if distance != 0 && distance <= 5 {
    println!("You are very close!");
}
```

`abs_diff` avoids the overflow problem you met in [chapter 9](#types): with `u32` values, `3 - 5` cannot be stored, because a `u32` cannot be negative. In a debug build that subtraction would panic. Whenever you subtract unsigned numbers, ask yourself which one is bigger.
:::

## What you have learned

:::recap
- Plan in plain words first, then build in small steps and run after each step.
- `use std::io;` brings part of the standard library into your file. `read_line` reads keyboard input into a `String`.
- A crate is a package of code. `cargo add name` adds one to your project as a dependency.
- `.trim()` removes surrounding spaces and line ends. `.parse()` turns text into a number.
- Operations that can fail return `Ok(value)` or `Err(problem)`. Handle both with `match`, or stop the program with `.expect("message")`.
- `match` forces you to cover every case.
:::

:::quiz Check your understanding
? The game needs a random secret number, so the project added the `rand` crate. Why not write the random number generator itself?
+ Because Rust's standard library deliberately ships without one, so a published crate is the supported route
- Because `rand` is faster than any generator you could write
- Because the compiler refuses to compile randomness without a crate
- Because `cargo add` also writes the algorithm for you
= Rust's standard library stays small on purpose and has no random number generator. Adding `rand` as a dependency, through `cargo add`, is the normal way to get one. Cargo also records the exact version in `Cargo.lock`, so every machine builds the same program.

? The player types `50` and presses {{Enter}}. Why does the program call `.trim()` before `.parse()`?
- Because `trim()` removes spaces from the middle of the text
+ Because the text still contains the line ending the player typed, and `parse` refuses it
- Because `parse()` only works on `&str` and not on `String`
- Because `trim()` turns the text into a number
= {{Enter}} leaves a line ending at the end of the text, and `parse` will not read `"50\n"` as a number. `trim()` removes the whitespace around the text first, so the parse succeeds.

? What does `.parse::<u32>()` give back when the player types `abc`, and what did the project do with it?
- It panics, because the text is not a number
+ A `Result` holding either the number or an error, and the program asks the player to try again
- `0`, because the text could not be read
- A `String`, because the parse failed
= `parse` returns a `Result`. The program matches on it: the `Ok` arm compares the guess, and the `Err` arm prints a friendly message and loops back for another try. Using `.expect()` here would end the game on one typo.

? The comparison uses `std::cmp::Ordering` and a `match`. Why compare with an enum instead of writing `if guess > secret`?
- Because `Ordering` is faster than a comparison operator
+ Because `match` over `Ordering` forces all three cases to be handled, so one cannot be forgotten
- Because `>` does not work on numbers in Rust
- Because `Ordering` sorts the numbers for you
= `Ordering` has exactly three values, `Less`, `Greater` and `Equal`. A `match` over it must cover all of them, so the compiler reports a missing arm. An `if`/`else` chain can quietly leave a case out.
:::


:::checklist
- I ran the game and won at least once.
- I can explain what each line of the final program does.
- I added the limit on guesses.
- I moved the input code into its own function.
- I changed something of my own (a different range, different messages, a "play again" question).
:::

You have finished the opening syntax track. You can now write small programs with variables, types, functions, decisions and loops. Next comes the idea that sets Rust apart from every other language: ownership and memory.
