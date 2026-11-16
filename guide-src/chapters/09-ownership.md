@id ownership
@part p3
@title Ownership: one owner for every value
@short Ownership and moves
@level beginner
@time 40
@learn State the three rules of ownership | Explain what a move is and why the old variable can no longer be used | Decide when to move, when to clone, and which types are copied automatically | Follow ownership as values go into functions and come back out

A library needs to know who is responsible for each [[copy]] of a book and when it can be returned to the shelves. A program also needs clear responsibility for the values it uses. Rust calls this rule system **ownership**: it lets ordinary values be cleaned up without a tracing garbage collector. The examples below show how moving a value changes which part of the program owns it.

## The three rules

:::plain Ownership, moves, and drops in one paragraph
**[[ownership|Ownership]]** is the rule that every value in Rust has exactly one **owner**, a variable. When the owner goes out of scope the value is **dropped** and its memory is freed, with no garbage collector. Assigning a value to another variable, passing it to a function, or putting it in a `Vec` **[[moves|move]]** it: the old name becomes unusable, and the compiler refuses to let you read it again. A `Copy` type such as `i32` is the exception — it is duplicated instead of moved — and a **borrow** (`&T`) lets you use a value without taking ownership at all.
:::

:::key The rules of ownership
1. Every value has an **owner**: the variable that holds it.
2. A value has **only one** owner at a time.
3. When the owner goes out of scope, the value is **dropped**: its memory is given back.
:::

:::analogy Owning a car
A car has one name on its ownership papers. You can sell or give the car to someone else. Then the papers change, and you can no longer drive it. When the owner sends the car to the scrapyard, it is gone. Nobody argues about who has to scrap it, and nobody can scrap it twice, because there is exactly one owner.
:::

The rest of this chapter shows what these rules mean in code.

## Rule 3 in action: the value is dropped with its owner

You already know scopes from [chapter 8](#variables): a variable lives until the closing `}` of its block. Ownership adds one thing. When a variable goes out of scope, Rust also cleans up everything the variable owns. Rust calls this **dropping** the value.

```rust run
fn main() {
    {
        let greeting = String::from("hello");
        println!("{greeting}");
    } // `greeting` goes out of scope here. Its heap memory is freed.

    println!("The text no longer exists.");
}
```
```output
hello
The text no longer exists.
```

`String::from("hello")` creates a `String`: a growable text whose characters are stored on the heap, as you saw in the [last chapter](#memory). At the closing bracket of the inner block the compiler inserts the code that frees those characters. You did not write that code, and you could not forget it.

:::compare The same idea in C++
C++ programmers know this pattern under the awkward name RAII ("resource acquisition is initialisation"): an object cleans up after itself when it goes out of scope. Rust uses the same mechanism, and builds its ownership rules on top so that the compiler can check them.
:::

## Rule 2 in action: a move

What happens when you assign a `String` to a second variable?

```rust fail E0382
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;
    println!("{s1}");
}
```
```error auto
```

The compiler says the value was **moved**. Step through what happens in memory:

:::stepper What `let s2 = s1;` does
```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1;
    println!("{s2}");
}
```
2 | [main] s1 = ->#1 !new | #1 = "hello" !new | `s1` is created. The record on the stack points to the characters on the heap. `s1` is the owner of this text.
3 | [main] s1 = ->#1 !moved; s2 = ->#1 !new | #1 = "hello" | Only the small record on the stack is copied into `s2`. The characters on the heap are **not** copied. Two variables now point at the same heap data, and a value may have only one owner. So Rust marks `s1` as moved out: it can no longer be used. Ownership has moved from `s1` to `s2`.
4 | [main] s1 = ->#1 !moved; s2 = ->#1 | #1 = "hello" | The text is printed through `s2`, its owner.
5 | - | #1 = "hello" !freed | `main` ends. `s2` owns the text, so the heap memory is freed, exactly once. `s1` owns nothing, so nothing happens for it.
:::

![Diagram of a move: a is invalidated, b becomes the one owner of the same heap text](/images/ownership-move.svg "After `let b = a;` the data has not moved. Ownership has.")

Why does Rust do this, instead of letting both variables use the text? Think about the end of `main`. If `s1` and `s2` were both owners, both would try to free the same heap memory. That is the **double free** bug from the last chapter. Rust could also copy the heap data on every assignment, but for a large text that would be slow, and you would not see it in the code.

So Rust picks the cheap and safe option: an assignment **moves** ownership. The old variable becomes unusable, and the compiler enforces that.

:::note What the machine actually does for a move
A move is a copy of the stack record's bytes and nothing more. For a `String` that is 24 bytes (pointer, length, capacity); no heap access happens, and no counter is incremented. The compiler also marks the old variable as off-limits, which is a compile-time bookkeeping decision, not a change to the bytes. [The silicon appendix](#under-the-hood) follows one of these assignments all the way down to machine instructions.
:::

:::analogy Giving away your only copy
You have one printed copy of a report and you hand it to a colleague. Now they have it and you do not. You cannot read from it or write on it any more, and it would be absurd for both of you to shred it. If you both need one, somebody has to make a photocopy first.
:::

:::compare What other languages do on assignment
- **Python, Java, JavaScript:** `b = a` makes `b` a second name for the *same* object. Both stay usable, and a change made through one is visible through the other, which is a common source of surprises. A garbage collector is needed to work out when nobody uses the object any more.
- **C++:** `b = a` makes a full copy of the object, including its heap data. That is safe, but it can be expensive, and you cannot see the cost in the code. C++ also has moves (`std::move`), but the compiler does not stop you from using the old object afterwards.
- **Rust:** `b = a` moves. It is always cheap, and using `a` afterwards is a compile error.
:::

## Making a real copy: `clone`

When you do want two independent copies of heap data, ask for it with `.clone()`:

:::stepper What `.clone()` does
```rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1.clone();
    println!("{s1} {s2}");
}
```
2 | [main] s1 = ->#1 !new | #1 = "hello" !new | `s1` owns the text "hello".
3 | [main] s1 = ->#1; s2 = ->#2 !new | #1 = "hello"; #2 = "hello" !new | `clone` asks for new heap memory and copies all the characters into it. `s2` owns the copy. Each text has exactly one owner.
4 | [main] s1 = ->#1; s2 = ->#2 | #1 = "hello"; #2 = "hello" | Both variables are valid, so both can be printed.
5 | - | #1 = "hello" !freed; #2 = "hello" !freed | At the end of `main` each owner frees its own text. Two owners, two texts, two clean-ups.
:::

`.clone()` is visible in the code on purpose. When you read Rust code, the word `clone` tells you: "here something may be copied that costs time and memory".

:::tip Do not be afraid of `clone` while learning
Beginners often worry that `clone` is "bad style". It is not wrong. It is a trade: simpler code for some extra work at run time. While you are learning, use `clone` whenever ownership blocks you. As you learn about borrowing in the next chapter, you will need it less and less.
:::

## Simple values are copied automatically

Now a surprise. This compiles:

```rust run
fn main() {
    let x = 5;
    let y = x;
    println!("{x} {y}");
}
```
```output
5 5
```

Why is `x` still usable? An integer lives entirely on the stack. Copying it means copying 4 bytes, which is as cheap as a move, and there is no heap data that could be freed twice. For such types a move would have no benefit, so Rust simply copies them. These types are called **`Copy` types**.

| `Copy` types: assignment copies | Not `Copy`: assignment moves |
|---|---|
| All integers (`i32`, `u8`, `usize` …) | `String` |
| Floats (`f64`, `f32`) | `Vec` and other collections |
| `bool` and `char` | Anything that owns heap data or another resource, such as an open file |
| Tuples and arrays that contain only `Copy` types, such as `(i32, f64)` or `[u8; 4]` | Tuples and arrays that contain a non-`Copy` type, such as `(i32, String)` |

A rule of thumb: if a value is small, lives only on the stack, and needs no clean-up, it is `Copy`. In [chapter 17](#structs) you will see how to make your own types `Copy`.

## Ownership and functions

Passing a value to a function works exactly like assigning it to a variable: `Copy` types are copied, everything else is **moved into the function**.

:::stepper Passing a String to a function
```rust
fn main() {
    let s = String::from("hello");
    print_text(s);
    println!("done");
}

fn print_text(text: String) {
    println!("{text}");
}
```
2 | [main] s = ->#1 !new | #1 = "hello" !new | `s` owns the text.
3 | [main] s = ->#1 !moved; [print_text] text = ->#1 !new | #1 = "hello" | The call moves the `String` into the parameter `text`. The function `print_text` is now the owner. `s` in `main` is moved out.
8 | [main] s = ->#1 !moved; [print_text] text = ->#1 | #1 = "hello" | The function prints the text.
9 | [main] s = ->#1 !moved | #1 = "hello" !freed | `print_text` ends. Its parameter `text` goes out of scope. It is the owner, so the heap memory is freed here.
4 | [main] s = ->#1 !moved | - | Back in `main`. The text no longer exists, and the compiler would reject any use of `s` from here on.
:::

So after `print_text(s)`, the variable `s` is gone for `main`:

```rust fail E0382
fn main() {
    let s = String::from("hello");
    print_text(s);
    println!("{s}");
}

fn print_text(text: String) {
    println!("{text}");
}
```
```error auto
```

Read the compiler's notes: it tells you where the value was moved, why (the type is not `Copy`), and it suggests two fixes. One is `clone`. The other, changing the function so that it *borrows* the value, is the subject of the next chapter.

### Getting a value back

Return values move too: a function can **give ownership** to its caller.

```rust run
fn main() {
    let s1 = make_greeting();          // the function gives us a String
    let s2 = add_exclamation(s1);      // s1 moves in, and a String moves back out
    println!("{s2}");
}

fn make_greeting() -> String {
    String::from("hello")
}

fn add_exclamation(mut text: String) -> String {
    text.push('!');
    text
}
```
```output
hello!
```

`make_greeting` creates a `String` and moves it out to the caller, so the text lives on after the function has ended. This is the answer to a problem from the last chapter: data on the heap can outlive the function that created it, because ownership can be handed on.

`add_exclamation` takes ownership of a `String`, changes it, and hands it back. That works, but it is clumsy: if a function only wants to *look at* a value, taking it away and returning it again is a lot of ceremony. The next chapter introduces **[[borrowing]]**, which solves this neatly.

## More details that are good to know

:::details Assigning a new value drops the old one
When you assign a new value to a `mut` variable, the value it held before is dropped at once:

```rust run
fn main() {
    let mut s = String::from("first");
    println!("{s}");
    s = String::from("second"); // the text "first" is freed right here
    println!("{s}");
}
```
```output
first
second
```
:::

:::details A moved-out variable can be filled again
After a move, a variable is empty, but it still exists. If it is `mut`, you can give it a new value and use it again:

```rust run
fn main() {
    let mut s = String::from("one");
    let t = s;                 // s is moved out
    s = String::from("two");   // s gets a new value and is valid again
    println!("{t} {s}");
}
```
```output
one two
```
:::

:::details Dropping a value early
A value is normally [[dropped|drop]] at the end of its scope. To drop it sooner, pass it to the function `drop`. It takes ownership of its argument and does nothing else, so the value's life ends right there.

```rust run
fn main() {
    let big = String::from("imagine a huge text");
    println!("{}", big.len());
    drop(big); // freed now, not at the end of main
    println!("The memory is already free.");
}
```
```output
19
The memory is already free.
```
:::

:::details Values are dropped in reverse order
At the end of a block, the compiler drops the values that block created, starting with the most recently created and working back to the first. The order can matter when one value depends on another: the thing built last — which may rely on the others — is cleaned up first. You rarely have to think about it, but if a program's clean-up ever seems to happen "backwards", this is why.
:::

## Why this is worth the trouble

- **No garbage collector.** The compiler knows exactly where each value's life ends, and puts the clean-up there. The program does not pause, and it uses no extra memory for bookkeeping.
- **No double free and no use after free.** There is one owner, so memory is freed once. A moved-out variable cannot be used, so freed data cannot be touched.
- **No hidden costs.** Moves are always cheap. An expensive copy is always written as `.clone()`.
- **Not only memory.** The same rules close files, release network connections and unlock locks at the right moment. Anything that needs cleaning up can be tied to an owner.

:::details How a value cleans itself up: the `Drop` trait and shallow moves
Under the hood, moving a `String` (`let b = a;`) performs only a tiny bitwise copy (`memcpy`) of its 24-byte `(ptr, cap, len)` stack header into `b`—the characters on the heap never move! The compiler simply marks `a` as uninitialised in MIR so no `drop` runs on `a`.

When a variable *does* stay owned until the end of its block, the compiler calls its **`Drop` trait** destructor (`drop`). The standard library implements `Drop` for `String` and `Vec` to return their heap buffer to the allocator, and for file handles and locks to close or unlock them automatically.
:::

:::recap
- Every value has one owner. When the owner goes out of scope, the value is dropped and its memory freed.
- Assigning or passing a non-`Copy` value **moves** it. The old variable can no longer be used.
- `.clone()` makes an explicit, complete copy.
- Small stack-only types (numbers, `bool`, `char`, and tuples or arrays of them) are `Copy`: they are copied instead of moved.
- A function parameter takes ownership of what is passed in. A return value hands ownership to the caller.
:::

:::quiz Check your understanding
? What happens at `let b = a;` when `a` is a `String`?
- The characters on the heap are copied, and both variables are usable
- `b` becomes a second name for the same text, and both are usable
+ Ownership of the text moves to `b`, and `a` can no longer be used
- The program stops with an error when it runs
= Assigning a `String` moves it. Only the small record on the stack is copied, and the compiler forbids any later use of `a`. Nothing is checked at run time.

? Why does this compile, although the same code with `String` values would not?
```rust
let a = 10;
let b = a;
println!("{a} {b}");
```
- Because numbers are stored on the heap
+ Because `i32` is a `Copy` type: it lives only on the stack and is cheap to copy, so it is copied instead of moved
- Because `println!` is special
- Because the compiler does not check numbers
= `Copy` types are duplicated on assignment. There is no heap data, so nothing could be freed twice.

? When is the heap memory of the `String` in this program freed?
```rust
fn main() {
    let s = String::from("hi");
    consume(s);
    println!("end");
}
fn consume(text: String) {}
```
+ At the end of `consume`, when its parameter `text` goes out of scope
- At the end of `main`
- When `println!` runs
- Never
= The call moves the `String` into `text`. `consume` is now the owner, and the value is dropped when `text` goes out of scope at the end of that function.

? What does `.clone()` do for a `String`?
- It creates a second owner for the same heap data
- It moves the text
- It converts the `String` into a `Copy` type
+ It allocates new heap memory and copies the characters, giving an independent second text
= After a clone there are two separate texts, each with its own owner. Changing or dropping one does not affect the other.
:::

:::exercise guided Follow the owner
Without running it, decide which of the three `println!` lines the compiler accepts. Then check by compiling. Remove the lines that fail.

```rust fail
fn main() {
    let a = String::from("apple");
    let b = a;
    let c = b.clone();
    println!("{a}");
    println!("{b}");
    println!("{c}");
}
```
::hint
Follow the text step by step. After line 3, who owns "apple"? Does line 4 move anything?
::solution
```rust run
fn main() {
    let a = String::from("apple");
    let b = a;
    let c = b.clone();
    println!("{b}");
    println!("{c}");
}
```
```output
apple
apple
```

- Line 3 moves the text from `a` to `b`. From then on `a` cannot be used, so `println!("{a}")` is rejected.
- Line 4 clones: `c` gets its own copy, and `b` stays the owner of the original. Both `b` and `c` can be printed.
:::

:::exercise practice Repair it in two ways
This program does not compile. Fix it in two different ways: first with `clone`, then by changing only the *order* of two lines.

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

(`format!` works like `println!`, but instead of printing, it returns the text as a new `String`.)
::hint
The problem is that `name` is moved into `make_greeting` and used afterwards. For the second fix: is `name` still valid *before* the call?
::solution
**Way 1: clone.** The function gets its own copy, and `name` stays valid.

```rust run
fn main() {
    let name = String::from("Ferris");
    let greeting = make_greeting(name.clone());
    println!("{greeting}");
    println!("The name has {} letters.", name.len());
}

fn make_greeting(n: String) -> String {
    format!("Hello, {n}!")
}
```
```output
Hello, Ferris!
The name has 6 letters.
```

**Way 2: use the value before you give it away.**

```rust run
fn main() {
    let name = String::from("Ferris");
    println!("The name has {} letters.", name.len());
    let greeting = make_greeting(name);
    println!("{greeting}");
}

fn make_greeting(n: String) -> String {
    format!("Hello, {n}!")
}
```
```output
The name has 6 letters.
Hello, Ferris!
```

The second way needs no extra memory, but it changes the order of the output. The best fix is a third one: let the function borrow the name instead of taking it. You will be able to write that after the next chapter.
:::

:::exercise practice Move or copy?
For each snippet, say whether the last line compiles, and why.

```rust
// 1
let a = 3.5;
let b = a;
println!("{a}");

// 2
let a = (1, 2);
let b = a;
println!("{:?}", a);

// 3
let a = (1, String::from("x"));
let b = a;
println!("{:?}", a);

// 4
let a = 'z';
let b = a;
println!("{a}");
```
::hint
A tuple is `Copy` only if every part of it is `Copy`.
::solution
1. **Compiles.** `f64` is `Copy`.
2. **Compiles.** A tuple of two integers contains only `Copy` types, so the tuple is `Copy`.
3. **Does not compile.** The tuple contains a `String`, which is not `Copy`. So the whole tuple is moved into `b`, and `a` can no longer be used.
4. **Compiles.** `char` is `Copy`.

The general rule: one part that owns heap data makes the whole value movable instead of copyable.
:::

:::exercise challenge A function that builds and returns
Write a function `repeat_word(word: String, times: u32) -> String` that returns the word repeated that many times, separated by spaces. For `("hey", 3)` it returns `hey hey hey`. Use a loop and `push_str`, which adds text to the end of a `String`. To pass a `String` to `push_str` you write `&word`, which means "look at this without taking it".
::hint
Start with `let mut result = String::new();`. In each round, add a space first unless it is the first round, then add the word.
::solution
```rust run
fn main() {
    let shout = repeat_word(String::from("hey"), 3);
    println!("{shout}");
}

fn repeat_word(word: String, times: u32) -> String {
    let mut result = String::new();
    for i in 0..times {
        if i > 0 {
            result.push(' ');
        }
        result.push_str(&word);
    }
    result
}
```
```output
hey hey hey
```

`result` is created inside the function and moved out to the caller by the last line, so it lives on in `shout`. The parameter `word` is owned by the function and dropped when the function ends. Inside the loop, `&word` only lends the word to `push_str`. If the loop *moved* `word` in the first round, there would be nothing left for the second round. That `&` is called a reference, and the next chapter is about it.
:::
