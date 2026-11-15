@id lifetimes
@part p3
@title Lifetimes: how long references stay valid
@short Lifetimes
@level intermediate
@time 45
@learn Explain what a lifetime is and why the compiler tracks it | Read and write lifetime annotations such as `'a` | Know when annotations are needed and when the compiler fills them in | Put references into structs | Recognise `'static` and avoid misusing it

In [chapter 15](#borrowing) you learned the rule that a reference must never outlive the value it points to. The compiler checks this rule by working out, for every reference, the stretch of code in which it is valid. That stretch is the reference's **lifetime**. Since Rust 2018 that stretch ends at the reference's last use (not at the closing brace), a rule called **non-lexical lifetimes**; under the hood it is a flow analysis over the compiler's MIR, as explained in [chapter 5](#compilation-pipeline) and [the silicon appendix](#under-the-hood).

Most of the time you never see lifetimes: the compiler works them out silently. Occasionally a function or struct is ambiguous, and the compiler asks you to describe how the references relate to each other. That description is a **lifetime annotation**. It is the part of Rust with the most unfamiliar syntax, but the idea behind it is simple.

:::analogy A library book
You borrow a book from a library. You may lend it to a friend for a while, but your friend must give it back before your own loan ends. A loan that hangs on another loan cannot last longer than the original one. Lifetimes are the due dates, and the compiler is a librarian who checks all of them before anybody leaves the building.
:::

## What the borrow checker checks

```rust fail E0597
fn main() {
    let r;                    // ---------+-- lifetime of `r`
    {                         //          |
        let x = 5;            // -+-- lifetime of `x`
        r = &x;               //  |       |
    }                         // -+       |
    println!("{r}");          //          |
}                             // ---------+
```
```error auto
```

The comments draw the two lifetimes. `r` is used on the `println!` line, so the reference must be valid until there. But it points to `x`, and `x` is gone at the closing brace of the inner block. The value lives for a shorter time than the reference to it, so the compiler refuses.

Without this check, `r` would point to memory that no longer belongs to `x`: a **dangling reference**.

## The function the compiler cannot work out alone

Here is a function that returns the longer of two string slices:

```rust fail nowrap E0106
fn longest(a: &str, b: &str) -> &str {
    if a.len() >= b.len() { a } else { b }
}
```
```error auto
```

The body is fine. The problem is the **signature**. The function returns a reference, and the compiler needs to know how long that reference will be valid, in order to check the code that *calls* the function. It could point to the data of `a` or to the data of `b`. Which one depends on the lengths, which are only known when the program runs.

The compiler checks each function by its signature alone, without looking into the bodies of the functions it calls. So the signature has to say how the returned reference relates to the parameters.

## Lifetime annotations

```rust run
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    let first = String::from("a long sentence");
    let second = String::from("short");
    let result = longest(&first, &second);
    println!("{result}");
}
```
```output
a long sentence
```

- `'a` is a **lifetime parameter**. The name starts with an apostrophe and is, by convention, a short lower-case word. It is declared in angle brackets after the function name, like a type parameter.
- `&'a str` is "a string slice that is valid for at least the lifetime `'a`".

The signature now says: *there is some stretch of code `'a` during which both `a` and `b` are valid, and the returned reference is valid for that same stretch.* In practice: **the result must not be used after either of the two inputs has gone away.**

:::key Annotations describe. They do not change anything
A lifetime annotation never makes a value live longer or shorter. It is a statement about a relationship between references, which the compiler then checks on both sides: inside the function ("does the body really return something that lives that long?") and at each call ("is the result used only while the inputs are still alive?").
:::

Watch the compiler use that statement:

```rust fail E0597
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    let first = String::from("a long sentence");
    let result;
    {
        let second = String::from("short");
        result = longest(&first, &second);
    }
    println!("{result}");
}
```
```error auto
```

You can see that the result will be `first`, which is still alive. The compiler does not run the program. It goes by the signature, which says the result may point into either argument, and `second` is gone before the `println!`. This is the safe side to err on: change the texts so that `second` is the longer one, and the same code really would read freed memory.

### Only tie together what belongs together

If the result always comes from one particular parameter, give only that one the lifetime:

```rust run
fn first_part<'a>(text: &'a str, separator: &str) -> &'a str {
    match text.split_once(separator) {
        Some((before, _)) => before,
        None => text,
    }
}

fn main() {
    let text = String::from("key=value");
    let part;
    {
        let separator = String::from("=");
        part = first_part(&text, &separator);
    }                               // `separator` is gone, and that is fine
    println!("{part}");
}
```
```output
key
```

The result is tied to `text` only. The compiler now knows that it does not matter how long `separator` lives.

### You cannot return a reference to something the function made

```rust fail nowrap E0515
fn make_greeting(name: &str) -> &str {
    let greeting = format!("Hello, {name}!");
    &greeting
}
```
```error auto
```

No annotation can fix this. `greeting` is destroyed when the function ends, so every reference to it would dangle. The answer is to return the value itself, and with it the ownership: `fn make_greeting(name: &str) -> String`.

:::tip A rule of thumb for return types
A function can return a reference only if it points to something that **came in through a parameter** (or to something that lives for the whole program). Data that is created inside the function must be returned as an owned value.
:::

## Why you rarely write annotations: elision

`fn first_word(text: &str) -> &str` from [chapter 16](#slices-strings) returns a reference and needed no annotation. The compiler applies three simple rules to fill in lifetimes by itself. This is called **lifetime elision** ("elision" means leaving something out).

1. Every reference parameter gets its own lifetime.
2. If there is **exactly one** reference parameter, its lifetime is given to all references in the return type.
3. If one of the parameters is `&self` or `&mut self`, the lifetime of `self` is given to all references in the return type.

If references in the return type are still without a lifetime after these rules, the compiler asks you to write them. That is error E0106.

| Signature | What the compiler makes of it |
|---|---|
| `fn first_word(text: &str) -> &str` | rule 2: the result borrows from `text` |
| `fn name(&self) -> &str` | rule 3: the result borrows from `self` |
| `fn find(&self, key: &str) -> &str` | rule 3: the result borrows from `self`, not from `key` |
| `fn longest(a: &str, b: &str) -> &str` | two candidates and no `self`: you must annotate |
| `fn print(a: &str, b: &str)` | no reference is returned: nothing to decide |

So annotations are needed in one main situation: **a function takes several references and returns one.**

## References inside structs

So far your structs owned all their data. A struct can hold a reference, and then it needs a lifetime parameter, because the struct must not outlive the data it points to:

```rust run
#[derive(Debug)]
struct Excerpt<'a> {
    text: &'a str,
}

impl<'a> Excerpt<'a> {
    fn first_sentence(book: &'a str) -> Excerpt<'a> {
        let text = book.split('.').next().unwrap_or("");
        Excerpt { text }
    }

    fn word_count(&self) -> usize {
        self.text.split_whitespace().count()
    }
}

fn main() {
    let book = String::from("Call me Ishmael. Some years ago I went to sea.");
    let excerpt = Excerpt::first_sentence(&book);
    println!("{:?} has {} words", excerpt, excerpt.word_count());
}
```
```output
Excerpt { text: "Call me Ishmael" } has 3 words
```

Read `struct Excerpt<'a> { text: &'a str }` as: "an `Excerpt` holds a reference that is valid for `'a`, so the `Excerpt` itself cannot be used for longer than `'a`". The excerpt borrows from `book`, and the compiler makes sure that `book` is not dropped or changed while the excerpt is in use. No text was copied.

The `impl<'a> Excerpt<'a>` line declares the lifetime and then uses it, the same pattern as `impl<T> Point<T>` for generic types. In recent Rust you may also write `impl Excerpt<'_>` when the methods do not need to name the lifetime. `'_` means "a lifetime that the compiler should fill in".

:::warn Start with owned data
A struct that holds references is harder to use: it cannot be returned from the function that owns the data, cannot easily be stored for a long time, and its lifetime parameter spreads to everything that contains it. For most structs, owning the data (`String`, not `&str`) is the right first choice. Use references in structs for short-lived views, where avoiding a copy matters, such as an iterator or a parser that walks over a text.
:::

## The lifetime `'static`

`'static` is the one lifetime with a fixed name. It means "valid for the entire run of the program". Every string literal has it, because its text is stored inside the program file itself:

```rust run
fn pick(flag: bool) -> &'static str {
    if flag { "yes" } else { "no" }
}

const GREETING: &str = "hello";      // constants hold `'static` references

fn main() {
    let answer: &'static str = pick(true);
    println!("{answer} {GREETING}");
}
```
```output
yes hello
```

You will also see `'static` as a bound on a type: `T: 'static`. It means "`T` contains no borrowed data that could expire", which is true for all owned types such as `String`, `Vec<u8>` and `i32`. A new thread, for instance, requires that of the data you give to it, because the thread might run longer than the function that started it ([chapter 55](#threads)).

:::warn `'static` is rarely the fix
When a lifetime error appears, the compiler sometimes mentions `'static`, and it is tempting to write it everywhere until the errors stop. This almost never solves the real problem. It demands that the data lives for ever, which you usually cannot provide. Ask instead: who should own this data, and how long does it need to live?
:::

## Everything together

Type parameters, trait bounds and lifetimes can appear in the same signature. Lifetimes come first in the angle brackets:

```rust run
use std::fmt::Display;

fn longest_with_note<'a, T>(a: &'a str, b: &'a str, note: T) -> &'a str
where
    T: Display,
{
    println!("Note: {note}");
    if a.len() >= b.len() { a } else { b }
}

fn main() {
    println!("{}", longest_with_note("apple", "fig", 42));
}
```
```output
Note: 42
apple
```


## Three things you will meet later

You can write Rust for a long time without this section. Read it now to know the words, and come back when one of them appears in an error message or in the documentation of a library.

**1. One lifetime outlives another: `'long: 'short`.** A bound between lifetimes reads "`'long` lasts at least as long as `'short`". It lets a function hand out a long-lived reference where a short-lived one was promised:

```rust run
fn choose<'long: 'short, 'short>(first: &'long str, second: &'short str) -> &'short str {
    if first.len() >= second.len() { first } else { second }
}

fn main() {
    let first = String::from("a long-lived text");
    let result;
    {
        let second = String::from("short");
        result = choose(&first, &second).len();
    }
    println!("{result}");
}
```
```output
17
```

The same sign works for types: `T: 'a` means "nothing borrowed inside `T` expires before `'a`". `T: 'static` from the last section is the best-known case.

**2. For every lifetime: `for<'a>`.** A function that accepts a closure sometimes has to say: this closure must work for *any* lifetime, not for one that the caller picks. That is written `for<'a>`:

```rust run
fn apply<F>(f: F) -> usize
where
    F: for<'a> Fn(&'a str) -> &'a str,
{
    let text = String::from("  hello  "); // lives only inside `apply`
    f(&text).len()
}

fn main() {
    println!("{}", apply(|s| s.trim()));
}
```
```output
5
```

The caller of `apply` cannot name the lifetime of `text`, because `text` does not exist yet when `apply` is called. So the bound asks for a closure that accepts a reference of every lifetime. You almost never type `for<'a>` yourself: `F: Fn(&str) -> &str` means exactly the same, because elision adds it. You will see it in error messages.

**3. Shorter is fine, except behind `&mut`.** A reference that lives long can be used where a shorter life is asked for. That is why a `&'static str` can be passed to any function that takes a `&str`. The compiler simply treats it as shorter-lived. Behind a `&mut`, it refuses to do that:

```rust fail E0597
fn overwrite<'a>(slot: &mut &'a str, new: &'a str) {
    *slot = new;
}

fn main() {
    let mut kept: &'static str = "for ever";
    {
        let short = String::from("short");
        overwrite(&mut kept, &short);
    }
    println!("{kept}");
}
```
```error auto
```

If the compiler shortened the `'static` inside `&mut kept` to fit the call, `overwrite` would store a short-lived reference in a variable that promises `'static`, and the last line would read freed memory. So the type behind a `&mut` must match exactly. The rules that decide where a lifetime may be shortened are called **variance**. You do not need to learn them. It is enough to know why this error exists when you meet it.

## When the borrow checker says no

A short guide for lifetime errors, from the simplest remedy to the more involved:

1. **Read the whole message.** It shows where the borrow starts, where the value is dropped, and where the reference is used afterwards. Often the fix is to move a declaration to an outer scope, so that the value lives longer.
2. **Return an owned value** when the data is created inside the function.
3. **Own the data in structs**: `String` in place of `&str`.
4. **Clone** when the data is small or the code runs rarely. A clone that removes a difficult lifetime problem is a good trade. You can optimise later, when measurements show that it matters.
5. **Store an index or a key, not a reference**, when one part of a data structure must refer to another part. For example, keep the position of an element in a `Vec`, and look it up when needed.
6. **Shared ownership** with `Rc` or `Arc` when several parts of the program truly need to own the same value ([chapter 32](#smart-pointers)).

:::compare Lifetimes in other languages
- **C and C++** have the same problem and leave the checking to the programmer. Returning a pointer to a local variable compiles (perhaps with a warning), and using it is undefined behaviour. A large share of the security holes in C and C++ programs are exactly these "use after free" bugs.
- **Garbage-collected languages** (Java, Python, Go, JavaScript, C#) keep every value alive for as long as anything refers to it. The problem cannot occur, at the price of a garbage collector that runs alongside the program.
- **Rust** is the first mainstream language to check lifetimes at compile time. The annotations are the small amount of extra information the compiler needs in the cases it cannot decide alone.
:::

:::details Under the hood: MIR Non-Lexical Lifetimes and zero runtime footprint
Lifetimes such as `'a` exist **solely inside the compiler** and take **zero bytes** at runtime. Since Rust 2018, the MIR borrow checker tracks **Non-Lexical Lifetimes (NLL)**: a borrow's region ends at the **last line where the reference is actually used** in the control-flow graph rather than stretching rigidly to the closing `}` brace of the block.
:::

:::recap
- A lifetime is the stretch of code in which a reference is valid. The borrow checker makes sure no reference outlives its value.
- Annotations such as `'a` describe how the lifetimes of references relate. They never change how long a value lives.
- `fn longest<'a>(a: &'a str, b: &'a str) -> &'a str`: the result is valid only while both inputs are.
- Elision rules fill in lifetimes in the common cases: one reference parameter, or a `&self` method.
- A struct holding a reference needs a lifetime parameter and cannot outlive the data it borrows.
- `'static` means "for the whole program". String literals have it.
- When lifetimes get complicated, prefer owned data.
:::

:::quiz Check your understanding
? What does a lifetime annotation like `'a` do?
- It makes a value live longer
- It tells the compiler when to free memory
+ It describes how the validity of references relates, so that the compiler can check it
- It slows the program down slightly
= Annotations are descriptions for the borrow checker. They do not exist in the finished program and never change how long anything lives.

? Why does `fn longest(a: &str, b: &str) -> &str` need annotations, while `fn first_word(text: &str) -> &str` does not?
- `longest` has a longer body
+ With one reference parameter, the result can only borrow from that one. With two, the compiler cannot know which one the result borrows from
- Functions with two parameters always need annotations
- `first_word` returns a copy
= The elision rules cover the case of exactly one reference parameter. With two candidates and no `self`, you must say how the result relates to them.

? Can this function be fixed by adding lifetime annotations?
```rust
fn make() -> &String {
    let s = String::from("hi");
    &s
}
```
- Yes, with `'a`
- Yes, with `'static`
+ No. `s` is destroyed when the function ends. The function must return the `String` itself
- Yes, by adding `mut`
= A reference to a local value always dangles after the function returns. Return the owned value and let ownership move to the caller.

? What does `struct Parser<'a> { input: &'a str }` tell you?
- The parser owns its input
+ A `Parser` borrows its input and cannot be used after the input has gone away
- The parser lives for the whole program
- The input can be changed through the parser
= The lifetime parameter ties the struct to the data it references. The compiler will not let the struct outlive that data.

? Which values have the lifetime `'static`?
- All `String`s
- Everything stored on the heap
+ String literals such as `"hello"`, and other data stored in the program itself
- Local variables in `main`
= A string literal is part of the program file and is therefore valid for the whole run. A local variable in `main` is dropped when `main` ends, which is not quite the same.
:::

:::exercise guided The shorter one
Write a function `shorter` that takes two string slices and returns the shorter one (the first one if they have the same length). Add the lifetime annotations it needs, and test it.
::hint
The shape is the same as `longest`: declare `<'a>` after the name and use `&'a str` for both parameters and for the return type.
::solution
```rust run
fn shorter<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() <= b.len() { a } else { b }
}

fn main() {
    let one = String::from("giraffe");
    let two = String::from("ant");
    println!("{}", shorter(&one, &two));
}
```
```output
ant
```

The result may come from either parameter, so both carry the same lifetime as the result. The compiler will then make sure that callers use the result only while both arguments are alive.
:::

:::exercise practice Text after a marker
Write `after<'a>(text: &'a str, marker: &str) -> Option<&'a str>` that returns the part of `text` that follows the first appearance of `marker`, or `None` if the marker does not appear. Show in `main` that the result can be used after the marker string has been dropped.
::hint
`text.split_once(marker)` returns `Option<(&str, &str)>`. Take the second part. Only `text` needs the lifetime `'a`, because the result never points into `marker`.
::solution
```rust run
fn after<'a>(text: &'a str, marker: &str) -> Option<&'a str> {
    match text.split_once(marker) {
        Some((_, rest)) => Some(rest),
        None => None,
    }
}

fn main() {
    let line = String::from("ERROR: disk is full");
    let message;
    {
        let marker = String::from(": ");
        message = after(&line, &marker);
    }
    println!("{:?}", message);
    println!("{:?}", after(&line, "#"));
}
```
```output
Some("disk is full")
None
```

Because `marker` has its own, unrelated lifetime, the borrow checker accepts that it is dropped before the result is printed. If you gave `marker` the lifetime `'a` too, this `main` would be rejected, although the function body would be exactly the same. A precise signature gives the callers more freedom.
:::

:::exercise practice A struct that borrows
Define `struct Highlight<'a> { line: &'a str, word: &'a str }` and a function `find_highlight<'a>(text: &'a str, word: &'a str) -> Option<Highlight<'a>>` that returns the first line of `text` containing `word`. Print the result for a text of three lines.
::hint
Loop over `text.lines()`. When `line.contains(word)` is true, return `Some(Highlight { line, word })`. After the loop, return `None`. Derive `Debug` to print the struct.
::solution
```rust run
#[derive(Debug)]
struct Highlight<'a> {
    line: &'a str,
    word: &'a str,
}

fn find_highlight<'a>(text: &'a str, word: &'a str) -> Option<Highlight<'a>> {
    for line in text.lines() {
        if line.contains(word) {
            return Some(Highlight { line, word });
        }
    }
    None
}

fn main() {
    let text = "roses are red\nviolets are blue\nRust is orange";
    if let Some(h) = find_highlight(text, "blue") {
        println!("found '{}' in: {}", h.word, h.line);
    }
    println!("{:?}", find_highlight(text, "green"));
}
```
```output
found 'blue' in: violets are blue
None
```

The struct holds two references and copies no text. Its lifetime parameter says that a `Highlight` is only usable while both the text and the word are alive. Here both are string literals, so they live for the whole program.
:::

:::exercise challenge A word reader
Write a struct `Words<'a>` that holds the remaining text (`rest: &'a str`) and a method `next_word(&mut self) -> Option<&'a str>`. Each call returns the next word and removes it from `rest`. When no word is left, it returns `None`. The returned words must stay usable after the `Words` value itself has been dropped.
::hint
Trim the start of `rest` first with `trim_start()`. If it is empty, return `None`. Otherwise find the end of the word with `rest.find(' ')`, which returns an `Option<usize>`, and use `split_at`. The return type must be `Option<&'a str>`, not `Option<&str>`. Without the `'a`, rule 3 of elision would tie the word to the borrow of `self`.
::solution
```rust run
struct Words<'a> {
    rest: &'a str,
}

impl<'a> Words<'a> {
    fn new(text: &'a str) -> Self {
        Words { rest: text }
    }

    fn next_word(&mut self) -> Option<&'a str> {
        let trimmed = self.rest.trim_start();
        if trimmed.is_empty() {
            return None;
        }
        let end = trimmed.find(' ').unwrap_or(trimmed.len());
        let (word, rest) = trimmed.split_at(end);
        self.rest = rest;
        Some(word)
    }
}

fn main() {
    let text = String::from("  the quick   brown fox ");
    let first;
    {
        let mut words = Words::new(&text);
        first = words.next_word();
        while let Some(word) = words.next_word() {
            print!("[{word}] ");
        }
        println!();
    }                                  // `words` is gone here
    println!("{:?}", first);           // but the word it returned is still valid
}
```
```output
[quick] [brown] [fox]
Some("the")
```

The key is the return type `Option<&'a str>`. It says that each word borrows from the **original text**, which lives for `'a`, and not from the `Words` value. That is why `first` can be used after `words` has been dropped, and why `next_word` can be called again while earlier words are still held. With the elided form `Option<&str>`, each word would be tied to the `&mut self` borrow. The compiler would then reject a second call of `next_word` while `first` is still in use, and it would reject the use of `first` after `words` is gone.

You have just written a small *iterator* by hand. [Chapter 30](#iterators) shows the standard way to do this with the `Iterator` trait.
:::
