@id borrowing
@part p3
@title References and borrowing
@short References and borrowing
@level beginner
@time 45
@learn Let a function use a value without taking ownership of it | Tell shared references (`&`) from mutable references (`&mut`) and use each | State the borrowing rules and explain which bugs they prevent | Read and fix the borrow checker's most common error messages

Imagine asking a mechanic to inspect your car: you want them to look at it without transferring ownership. A function often needs the same arrangement with a value. Rust calls temporary access without taking ownership a **borrow**; a reference represents that access.

## Borrowing with `&`

```rust run
fn main() {
    let name = String::from("Ferris");
    let length = count_letters(&name);
    println!("{name} has {length} letters.");
}

fn count_letters(text: &String) -> usize {
    text.len()
}
```
```output
Ferris has 6 letters.
```

Two small symbols changed everything:

- In the call, **`&name`** creates a **reference** to `name`. A reference lets the function reach the value without owning it.
- In the signature, **`text: &String`** says: this parameter is a reference to a `String`.

`name` is still valid after the call, because ownership never moved. Creating a reference is called **borrowing**. When the function ends, the reference goes away. The text stays, because the reference never owned it.

:::analogy Lending a book
You lend a book to a friend. They can read it, but it is still yours, and they give it back when they are done. They may not sell it or throw it away, because it is not theirs.
:::

:::stepper A reference in memory
```rust
fn main() {
    let name = String::from("Ferris");
    let length = count_letters(&name);
    println!("{name} has {length} letters.");
}

fn count_letters(text: &String) -> usize {
    text.len()
}
```
2 | [main] name = ->#1 !new | #1 = "Ferris" !new | `name` owns the text.
3 | [main] name = ->#1; [count_letters] text = points to name !ref | #1 = "Ferris" | `&name` creates a reference: a pointer to `name`. The parameter `text` holds that reference. Nothing is moved and nothing is copied on the heap.
8 | [main] name = ->#1; [count_letters] text = points to name !ref | #1 = "Ferris" | The function reads the length through the reference.
3 | [main] name = ->#1; length = 6 !new | #1 = "Ferris" | `count_letters` ends and the reference disappears. The text is not freed, because a reference owns nothing.
4 | [main] name = ->#1; length = 6 | #1 = "Ferris" | `name` is still the owner, and still usable.
5 | - | #1 = "Ferris" !freed | `main` ends, `name` goes out of scope, and the text is freed.
:::

:::plain Reference
A **[[reference]]** is a pointer that Rust guarantees to be valid: it always points to a living value of the right type. You create one with `&`. In the last chapter you read that a pointer is an address. A reference is an address plus a promise checked by the compiler. And like any other value, a reference has a size — the size of a pointer. Passing a reference to a function copies that small value; the data it points at is never copied. That is why borrowing is cheap even when the data behind it is large.
:::

## A shared reference cannot change the value

Like variables, references are immutable by default. Through a plain `&` you may look, but not change:

```rust fail E0596
fn main() {
    let mut text = String::from("hello");
    shout(&text);
}

fn shout(t: &String) {
    t.push_str("!");
}
```
```error auto
```

## Mutable references with `&mut`

To let a function change a value it does not own, lend the value *mutably*:

```rust run
fn main() {
    let mut text = String::from("hello");
    shout(&mut text);
    shout(&mut text);
    println!("{text}");
}

fn shout(t: &mut String) {
    t.push_str("!");
}
```
```output
hello!!
```

Three things must all say "mutable":

1. The variable itself: `let mut text`.
2. The reference you create: `&mut text`.
3. The type of the parameter: `t: &mut String`.

This is deliberate. Anyone who reads the call `shout(&mut text)` can see that `text` may be changed by it. In many other languages you have to read the function to find that out.

### Reaching the value behind a reference: `*`

For method calls such as `t.push_str(...)`, Rust follows the reference for you. When you want to read or replace the value itself, write `*` in front of the reference. This is called **[[dereferencing|dereference]]**: "go to what this points at".

```rust run
fn main() {
    let mut score = 10;
    add_bonus(&mut score);
    println!("{score}");
}

fn add_bonus(points: &mut i32) {
    *points += 5;
}
```
```output
15
```

In [chapter 10](#functions), a function could not change the caller's number, because it got a copy. With `&mut` it can, and the caller can see it in the call.

## The borrowing rules

:::key The two rules of borrowing
1. At any moment you can have **either** any number of shared references (`&T`) **or** exactly one mutable reference (`&mut T`) to a value. Never both.
2. A reference must never outlive the value it points to.
:::

![Diagram of the borrowing rules: many shared readers, or one mutable writer](/images/borrowing-rules.svg "Many readers, or one writer. The diagram below the rules makes the choice visible.")

:::analogy A shared document
Any number of people can read a document at the same time. Nothing can go wrong, because nobody changes anything. But if one person is rewriting it, nobody else should be reading it at that moment. They might read a half-finished sentence. And two people editing the same paragraph at once would destroy each other's work. So: many readers, or one writer.
:::

That is why `&T` is called a **shared reference** and `&mut T` an **exclusive** (mutable) reference. The part of the compiler that checks these rules is called the **borrow checker**.

:::note Why the compiler loves the rule too
The many-readers/one-writer rule is not only about crashes. It also tells the optimiser what it may assume. While a `&T` is alive, the compiler knows the value behind it cannot change, so it can load the value once and keep it in a register instead of re-reading memory every time. A hidden `&mut T` would make that assumption false and could change the answer mid-expression. The rule exists so the compiler can make your code fast without asking you to annotate `const` everywhere. [The silicon appendix](#under-the-hood) shows the analysis (it happens on MIR) that makes this guarantee real.
:::

Rule 1 forbids this:

```rust fail E0502
fn main() {
    let mut text = String::from("hello");
    let reader = &text;
    let writer = &mut text;
    writer.push_str(" world");
    println!("{reader}");
}
```
```error auto
```

The message tells the whole story: where the shared borrow starts, where the mutable borrow is attempted, and where the shared borrow is used later.

And this, two writers at once:

```rust fail E0499
fn main() {
    let mut text = String::from("hello");
    let first = &mut text;
    let second = &mut text;
    first.push_str("!");
    second.push_str("?");
}
```
```error auto
```

### A borrow ends at its last use

The rules are less strict than they first look. A reference counts as "active" only from its creation to the **last place where it is used**. After that, the borrow is over, even if the variable is still in scope.

```rust run
fn main() {
    let mut text = String::from("hello");

    let reader = &text;
    println!("{reader}");        // last use of `reader`: the shared borrow ends here

    let writer = &mut text;      // so a mutable borrow is fine now
    writer.push_str(" world");

    println!("{text}");
}
```
```output
hello
hello world
```

This "the borrow lives until its last *use*, not until the end of the scope" behaviour is what makes the rules practical instead of tedious. Rust measures a reference's life by where it is actually used, not by the shape of the code that surrounds it; that idea is sometimes called *non-lexical lifetimes*.

## Why the rules exist: a real bug they prevent

The rules can feel like bureaucracy until you see what they stop. A `Vec` is a list that can grow. You will study it in [chapter 20](#collections). For now: `vec![1, 2, 3]` creates one, and `.push(4)` adds an element at the end.

```rust fail E0502
fn main() {
    let mut numbers = vec![1, 2, 3];
    let first = &numbers[0];
    numbers.push(4);
    println!("{first}");
}
```
```error auto
```

Why would that be dangerous? A `Vec` stores its elements in one block on the heap. When the block is full and another element is pushed, the `Vec` asks for a bigger block, moves all the elements there, and frees the old block. The reference `first` would still point into the old, freed block. It would be a **dangling pointer**, and reading it would be a use after free.

:::compare The same code in other languages
In C++ the equivalent code compiles without complaint, and the program then reads freed memory. The bug even has a name there: *iterator invalidation*. It may seem to work in testing and crash, or silently produce garbage, in production. Java and Python avoid the crash with a garbage collector, but have a related problem: changing a list while looping over it gives an error at run time or wrong results. Rust rejects the program at compile time.
:::

The "many readers or one writer" rule also prevents **data races**: two parts of a program changing the same data at the same time. You will see in [Part IX](#threads) that this makes programs that run on several processor cores far safer in Rust than in other languages.

:::details Under the hood: references are addresses with LLVM `noalias` superpowers
In machine code, `&T` and `&mut T` are just plain 64-bit memory addresses (one machine word, unless `T` is a slice or `dyn Trait`). What makes them special is what the borrow checker guarantees *before* LLVM optimises the code: every `&T` is guaranteed non-null and aligned, and every `&mut T` is annotated `noalias` in LLVM IR, letting the optimiser cache reads in CPU registers without worrying that another pointer quietly rewrote the same address.
:::


## A second way to see the rules: what each name may do

Here is another way to think like the borrow checker. For every name in your program, ask what it is **allowed to do** with its value on this line. An owner can have up to three abilities:

- **read** the value,
- **change** it (only if it was declared with `mut`),
- **give it away**: move it to another owner, or let it be dropped.

A reference takes some of these abilities away from the owner for as long as the reference is in use. The owner gets them back after the last use of the reference.

| While this is in use … | the owner may | the reference may |
|---|---|---|
| no reference | read, change, give away | |
| a shared reference (`&`) | read | read |
| a mutable reference (`&mut`) | nothing at all | read, change |

Follow the abilities through the program from the last section, with the lines in the order that compiles:

| Line | `numbers` may | `first` may |
|---|---|---|
| `let mut numbers = vec![1, 2, 3];` | read, change, give away | |
| `let first = &numbers[0];` | read | read |
| `println!("{first}");` (the last use of `first`) | read, change, give away | |
| `numbers.push(4);` | read, change, give away | |

`push` needs the ability to change. In the order that failed, `push` came while `first` was still in use, and on that line `numbers` could only be read.

The table also explains two errors that the two rules do not mention directly. First, a value cannot be given away while it is borrowed:

```rust fail E0505
fn main() {
    let text = String::from("hello");
    let reader = &text;
    let new_owner = text;
    println!("{reader} {new_owner}");
}
```
```error auto
```

Second, while a mutable reference is in use, the owner cannot even read:

```rust fail E0502
fn main() {
    let mut count = 10;
    let writer = &mut count;
    println!("{count}");
    *writer += 1;
}
```
```error auto
```

When several names lead to the same value, programmers call it **aliasing**. Every memory bug in this chapter has the same shape: one name changes or frees the data while another name still looks at it.

:::key One sentence to remember
A value may be reachable through several names, or it may be changed. Never both at the same moment.
:::

## References must not outlive the value

The second rule prevents references to data that no longer exists:

```rust fail E0597
fn main() {
    let reference;
    {
        let value = String::from("short-lived");
        reference = &value;
    }
    println!("{reference}");
}
```
```error auto
```

`value` is dropped at the end of the inner block, but `reference` would still be used after that. The compiler compares how long the reference is used with how long the value lives, and refuses the program.

The same mistake often appears in a function that tries to return a reference to one of its own local variables:

```rust fail nowrap E0106
fn make_text() -> &String {
    let s = String::from("hello");
    &s
}
```
```error auto
```

`s` is dropped when the function ends, so the returned reference would point at freed memory. The error message talks about a "lifetime", which is Rust's word for how long a reference stays valid. [Chapter 26](#lifetimes) explains lifetimes in full. The fix here is simple: return the `String` itself and move ownership to the caller.

```rust run
fn make_text() -> String {
    String::from("hello")
}

fn main() {
    println!("{}", make_text());
}
```
```output
hello
```

## Owned, shared or mutable: which should a function ask for?

| Parameter type | The function … | The caller writes | Afterwards the caller … |
|---|---|---|---|
| `text: &String` | only reads the value | `f(&s)` | still owns `s`, unchanged |
| `text: &mut String` | changes the value in place | `f(&mut s)` | still owns `s`, possibly changed |
| `text: String` | takes the value over: keeps it, or uses it up | `f(s)` | can no longer use `s` |

Ask for the least you need. Most functions only read, so most parameters are shared references.

## Fighting the borrow checker, and winning

When the borrow checker rejects your code, it has usually found a real problem, or a way of writing things that it cannot prove to be safe. These moves solve most cases:

1. **Read the whole message.** It shows where the first borrow starts, where the conflict is, and where the first borrow is used later.
2. **Shorten the borrow.** Finish using a reference before you change the value. Often it is enough to move one line.
3. **Copy out what you need.** If you only need a number from inside the data, store the number, not a reference to it: `let first = numbers[0];` copies the integer.
4. **[[Clone]].** It costs some time and memory, but it is always correct.
5. **Ask what would go wrong.** Suppose the compiler accepted your code: which name would be left looking at freed or half-changed data? If you can point at it, the compiler has found a real bug and the design has to change. If you cannot, the code is probably safe, but written in a way the compiler cannot follow, and a small rearrangement is enough. [Chapter 20](#collections) walks through the cases that come up most often with lists.

:::recap
- `&value` borrows: it creates a reference without moving ownership.
- A shared reference `&T` can only read. A mutable reference `&mut T` can change the value, and needs a `mut` variable.
- `*reference` reaches the value behind a reference.
- At any moment: many shared references, or one mutable reference. Never both.
- A borrow lasts from its creation to its last use.
- A reference can never outlive its value, so dangling pointers cannot exist in safe Rust.
:::

:::quiz Check your understanding
? What does `&name` do?
- It copies `name`
- It moves `name`
+ It creates a reference to `name`, so the value can be used without taking ownership
- It makes `name` mutable
= `&` borrows. The owner stays the owner, and the reference only allows access for a while.

? Which combination is allowed at the same moment for one value?
+ Three shared references
- One shared reference and one mutable reference
- Two mutable references
- One mutable reference and two shared references
= Any number of readers may exist together. A writer must be alone.

? Why is this rejected?
```rust
let mut list = vec![1, 2, 3];
let first = &list[0];
list.push(4);
println!("{first}");
```
- `push` needs an owned value
- A `Vec` cannot be changed after it is created
+ `push` needs a mutable borrow of `list` while the shared borrow `first` is still in use. The push could move the elements and leave `first` dangling
- `first` is not declared with `mut`
= The shared reference is used after the push, so both borrows would be active together. Growing the vector can move its data to a new place in memory.

? A function only needs to read a large `String`. What is the best parameter type?
- `String`, so that the function owns it
+ `&String`, a shared reference
- `&mut String`, to be safe
- It does not matter
= Ask for the least power you need. A shared reference lets the caller keep the value and promises not to change it. (In the next chapter you will see that `&str` is even better for text.)
:::

:::exercise guided Borrow instead of move
In the last chapter you fixed this program with `clone` or by reordering lines. Now fix it properly: change `make_greeting` so that it borrows the name.

```rust fail
fn main() {
    let name = String::from("Ferris");
    let greeting = make_greeting(name);
    println!("{greeting}");
    println!("The name has {} letters.", name.len());
}

fn make_greeting(n: String) -> String {
    format!("Hello, {n}!")
}
```
::hint
Two places need a `&`: the type of the parameter, and the argument in the call.
::solution
```rust run
fn main() {
    let name = String::from("Ferris");
    let greeting = make_greeting(&name);
    println!("{greeting}");
    println!("The name has {} letters.", name.len());
}

fn make_greeting(n: &String) -> String {
    format!("Hello, {n}!")
}
```
```output
Hello, Ferris!
The name has 6 letters.
```

The function only reads the name, so a shared reference is all it needs. Nothing is copied, and `name` stays usable. The returned greeting is a new `String` that the function creates and hands to the caller.
:::

:::exercise practice Change it in place
Write a function `double_it` that doubles a number in the caller's variable. This `main` should print `42`:

```rust
fn main() {
    let mut n = 21;
    double_it(&mut n);
    println!("{n}");
}
```
::hint
The parameter type is `&mut i32`. To change the number behind the reference, dereference it with `*`.
::solution
```rust run
fn main() {
    let mut n = 21;
    double_it(&mut n);
    println!("{n}");
}

fn double_it(number: &mut i32) {
    *number *= 2;
}
```
```output
42
```

`number` is a reference, and `*number` is the integer it points at. `*number *= 2` reads as "multiply the value behind `number` by 2". The first `*` dereferences, and `*=` is the multiply-and-assign operator.
:::

:::exercise practice Calm the borrow checker
This program is rejected. Explain why in one sentence. Then fix it **without** using `clone`, so that it prints `Longest so far: 5` and then `hello world`.

```rust fail
fn main() {
    let mut text = String::from("hello");
    let view = &text;
    text.push_str(" world");
    println!("Longest so far: {}", view.len());
    println!("{text}");
}
```
::hint
Is `view` really needed after the change? What is the smallest piece of information the program wants from the old text?
::solution
The shared borrow `view` is still used after `push_str`, which needs a mutable borrow, so a reader and a writer would be active at the same time.

```rust run
fn main() {
    let mut text = String::from("hello");
    let old_length = text.len();
    text.push_str(" world");
    println!("Longest so far: {old_length}");
    println!("{text}");
}
```
```output
Longest so far: 5
hello world
```

The program only needs the old *length*, which is a plain number. Copying that number out ends the borrow immediately. This is the most common fix of all: keep the small piece of data you need, not a reference into the big thing.
:::

:::exercise challenge Which ones compile?
Decide for each program whether the borrow checker accepts it. Give a reason. Then test your answers.

```rust
// A
let mut s = String::from("a");
let r1 = &s;
let r2 = &s;
println!("{r1} {r2}");

// B
let mut s = String::from("a");
let r1 = &mut s;
r1.push('b');
let r2 = &s;
println!("{r2}");

// C
let mut s = String::from("a");
let r1 = &mut s;
let r2 = &s;
r1.push('b');
println!("{r2}");
```
::hint
For each reference, find the last line where it is used. Two borrows conflict only if both are active on the same stretch of lines.
::solution
- **A compiles.** Two shared references at once are fine. (The compiler warns that `s` does not need to be `mut`.)
- **B compiles.** `r1` is last used at `r1.push('b')`. The mutable borrow ends there, so creating the shared reference `r2` afterwards is allowed.
- **C does not compile.** `r1` is used *after* `r2` is created, and `r2` is used after that. A mutable and a shared borrow are active together, so the compiler reports error E0502.

B and C contain the same lines in a different order. What matters to the borrow checker is where each reference is last used.
:::
