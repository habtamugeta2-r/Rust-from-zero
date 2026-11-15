@id memory
@part p2
@title How a program uses memory: the stack and the heap
@short Memory: stack and heap
@level beginner
@time 30
@learn Describe what memory is and what a pointer is | Explain the difference between the stack and the heap | Name the classic memory bugs and how they happen | Compare the three ways languages manage memory

Part 2 is about ownership, the idea that makes Rust different. Ownership is a set of rules about memory. They only make sense when you have a picture of what memory is and what can go wrong with it. This chapter gives you that picture. It has very little Rust in it, and what you learn here is true for every programming language.

## What memory is

While a program runs, it keeps its data in the computer's **memory** (also called RAM). Memory is fast, and it is temporary: when the program ends, its memory is given back to the computer.

:::analogy A very long street of letterboxes
Picture a street with billions of small letterboxes in a row. Each box holds one byte, and each has a house number. That number is called its **address**. To store a value, the program puts it in some boxes and remembers the address. To read it back, it goes to that address.
:::

:::note The numbers are logical, not physical
A modern computer does not hand a program the real hardware memory directly. The operating system gives each program its own private view of a very large range of numbers, called **virtual** memory, and quietly translates them to the real boxes behind the scenes. When this guide talks about an "address", it means one of those logical numbers, from the program's own point of view. That is why one program's address 100 and another program's address 100 are different places entirely, and why the picture of a single long street of letterboxes is a helpful simplification of something the operating system manages for you. For the machinery behind that translation — page tables, the MMU and the guard pages that catch stack overflows — see [the silicon appendix](#under-the-hood).
:::

A program uses its memory in two different ways, in two different areas: the **stack** and the **heap**.

:::compare Memory management in other languages
A garbage-collected language such as Java or Python also hides many memory details from you, but it keeps a helper running in the background. C and C++ let the programmer manage memory by hand, which is fast but easy to get wrong. Rust gives a middle path: many rules are checked by the compiler, and the memory is freed when ownership ends, without a garbage collector.
:::

## The stack: fast and automatic

:::analogy A pile of trays
In a canteen, clean trays are piled up. You always put a tray on the top and take a tray from the top. You never pull one out from the middle. This "last in, first out" order is simple, and that makes it very fast.
:::

The stack works like that pile. Every time a function is called, it gets a fresh tray on top of the pile for its parameters and local variables. This tray is called a **stack frame**. When the function ends, its whole frame is taken off the pile in one step, and all its variables are gone.

Step through this program and watch the stack:

:::stepper Function calls and the stack
```rust
fn main() {
    let a = 5;
    let b = double(a);
    println!("{b}");
}

fn double(n: i32) -> i32 {
    let result = n * 2;
    result
}
```
1 | - | - | The program starts with `main`. It gets its own area on the stack, called a stack frame. The frame is still empty.
2 | [main] a = 5 !new | - | The variable `a` is stored in the frame of `main`.
3 | [main] a = 5; [double] n = 5 !new | - | `main` calls `double`. A new frame for `double` is placed on top of the stack. The parameter `n` receives a **copy** of the value of `a`.
8 | [main] a = 5; [double] n = 5; result = 10 !new | - | `result` is a local variable of `double`, so it is stored in the frame of `double`.
9 | [main] a = 5; [double] n = 5; result = 10 | - | `double` returns the value 10 to its caller.
3 | [main] a = 5; b = 10 !new | - | `double` has finished. Its whole frame is removed in one step, so `n` and `result` no longer exist. The returned value is stored in `b`.
4 | [main] a = 5; b = 10 | - | The program prints 10.
5 | - | - | `main` ends. Its frame is removed too, and the program is finished.
:::

The stack has two great strengths. It is **fast**, because storing a value is just "put it on top". Part of that speed comes from *where* the data sits: the values of one function lie next to each other on the stack, and a computer keeps a tiny, extremely fast **cache** of the memory locations it has just used. Neighbouring values are therefore likely to already be sitting in the cache, so reaching them is quick. And the stack is **automatic**: nobody has to remember to clean up, because the frame disappears when the function ends.

It also has two limits:

1. **The size of everything on the stack must be known when the program is compiled.** An `i32` is always 4 bytes, so it can live on the stack. A text typed by the user could have 3 characters or 3 million. The compiler cannot reserve the right amount of stack space for it in advance.
2. **Data on the stack dies with its function.** Sometimes data must live longer than the function that created it.

For both cases there is the heap.

:::details Recursion and stack overflow
A function may call itself. This is called **recursion**. Every call gets its own stack frame, with its own copies of the variables.

```rust run
fn main() {
    println!("{}", factorial(5));
}

/// 5 factorial is 5 × 4 × 3 × 2 × 1.
fn factorial(n: u64) -> u64 {
    if n <= 1 {
        1
    } else {
        n * factorial(n - 1)
    }
}
```
```output
120
```

`factorial(5)` calls `factorial(4)`, which calls `factorial(3)`, and so on down to `factorial(1)`, which returns 1 without another call. Then the calls finish one by one, from the top of the stack down. The case that stops the chain (`n <= 1`) is called the **base case**. Every recursive function needs one.

The stack is small, usually a few megabytes. A recursion that never stops, or goes millions of calls deep, fills it up. This is called a **stack overflow**. Rust detects it and stops the program with a clear message instead of letting it write over other memory.
:::

## The heap: flexible, but someone must tidy up

:::analogy A self-storage warehouse
You go to the front desk of a storage warehouse and say: "I need room for 20 boxes." The staff find a free unit that is big enough and give you a slip with the unit's number. Later you use that number to find your things. When you no longer need the unit, you must hand it back. If you do not, it stays reserved for ever, even though nobody uses it.
:::

The heap is that warehouse:

- The program asks for a certain number of bytes. This is called **allocating** memory.
- It gets back the address of a free area. A value that holds an address is called a **pointer**, because it points to where the data is.
- When the data is no longer needed, the memory must be given back. This is called **freeing** or *deallocating* it.

The heap can hold data of any size, the size may be decided while the program runs, and the data stays alive until it is freed, no matter which functions start or end in the meantime. The price is threefold. **Allocating is slower than using the stack**: before the data can be used, the system has to find a free stretch of memory big enough and mark it as taken, and the operating system may have to hand over brand-new pages of real memory that were not in use yet. Reaching the data also takes an extra step: follow the pointer to where the data really is. And **someone has to free the memory at the right time**.

## How the stack and the heap work together

Most interesting data uses both. Rust's growable text type, `String`, is a good example. The characters live on the heap, because nobody knows in advance how many there will be. On the stack there is a small record of fixed size that says where the characters are and how many there are.

:::stepper A String uses the stack and the heap
```rust
fn main() {
    let n = 42;
    let mut s = String::from("hi");
    s.push_str(" there");
    println!("{n} {s}");
}
```
2 | [main] n = 42 !new | - | A number has a fixed size. It is stored directly on the stack.
3 | [main] n = 42; s = ->#1 length 2 !new | #1 = "hi" !new | A text can have any length, so its characters are stored on the heap. The stack holds a small record of fixed size: a pointer to the characters, and their number.
4 | [main] n = 42; s = ->#1 length 8 | #1 = "hi there" | `push_str` adds more text. The heap area grows. The record on the stack keeps its size, and only the numbers inside it change.
5 | [main] n = 42; s = ->#1 length 8 | #1 = "hi there" | The program prints `42 hi there`.
6 | - | #1 = "hi there" !freed | `main` ends and its frame is removed. In Rust, the heap memory that belonged to `s` is given back at this moment, automatically. The next chapter explains how Rust knows that this is safe.
:::

You can check this picture with a small program. `size_of_val` reports how many bytes a value takes up directly (for a `String`, that is the record on the stack, not the characters on the heap):

```rust run
fn main() {
    let number = 42;
    let short = String::from("hi");
    let long = String::from("a much, much longer piece of text");

    println!("number: {} bytes", size_of_val(&number));
    println!("short:  {} bytes", size_of_val(&short));
    println!("long:   {} bytes", size_of_val(&long));
}
```
```output
number: 4 bytes
short:  24 bytes
long:   24 bytes
```

Both strings take 24 bytes on the stack on a normal 64-bit computer, however long their text is. The record has three parts of 8 bytes each: the pointer, the length, and the *capacity* (how much room is reserved on the heap).

| | Stack | Heap |
|---|---|---|
| Speed | Very fast | Slower |
| Size of data | Fixed, known at compile time | Any size, decided while running |
| How long data lives | Until its function ends | Until it is freed |
| Cleaning up | Automatic | Somebody must do it |
| Typical contents | Numbers, booleans, characters, small fixed groups, pointers | Text, lists that grow, large data |

## What goes wrong when memory is managed by hand

In C, the programmer asks for heap memory with a function called `malloc` and must give it back with `free`. In a large program this is done in thousands of places, and people make mistakes. There are four classic ones.

:::analogy Hotel rooms and key cards
Think of heap memory as hotel rooms and of pointers as key cards.

- **Memory leak:** you leave the hotel but never check out. The room stays blocked, and if this keeps happening the hotel runs out of rooms. In a program: memory is never freed, the program uses more and more, and at some point it slows down or crashes.
- **Use after free:** you check out but keep a copy of the key card. Later you walk back into the room. By now another guest lives there. You read their papers or move their things. In a program: data is used after its memory was freed and given to something else.
- **Double free:** you check out of the same room twice. The second time, the hotel's records get mixed up and they cancel the booking of the new guest. In a program: freeing memory twice damages the bookkeeping of the heap.
- **Out-of-bounds access (buffer overflow):** you booked room 12 but also walk into rooms 13 and 14. In a program: reading or writing past the end of an array.
:::

A pointer that still holds the address of memory that has been freed is called a **dangling pointer**. It is the "key card you kept".

These bugs are dangerous because the program often *keeps running* with wrong data. They may show up only sometimes, on some machines. Attackers look for them on purpose: a use-after-free or a buffer overflow can often be turned into a way to take control of a program. As you read in [chapter 1](#what-is-rust), around 70% of the serious security bugs in large C and C++ products are memory bugs of this kind.

## Three ways to manage memory

:::compare Where your language sits
If you come from Python, Java, JavaScript, Go or C#, you have been relying on a garbage collector and have never had to free anything by hand. If you come from C or C++, you have written `free` and `delete` yourself, and you have probably met a crash caused by calling them at the wrong moment. Rust takes a third path: the compiler proves where the clean-up belongs, so the code runs at C speed while the bugs of hand-written memory management fail to compile.
:::

| Approach | Who frees the memory? | Languages | Advantages | Disadvantages |
|---|---|---|---|---|
| Manual | The programmer, by hand | C, older C++ | Full control, top speed | Every mistake is a possible crash or security hole |
| Garbage collection | A helper that runs inside your program, finds data that is no longer reachable, and frees it | Java, C#, Go, Python, JavaScript | Safe and easy for the programmer | Uses extra time and memory, can pause the program, less control |
| Ownership | The compiler works out where each value is no longer needed and inserts the clean-up code there | Rust | Safe **and** fast, no pauses, no helper needed | You must learn the rules, and the compiler is strict |

:::plain Garbage collector
A **garbage collector** (GC) is a part of a language's runtime that looks for data the program can no longer reach and frees it automatically. It is convenient, and it removes use-after-free and double-free bugs. It costs processor time and memory, and the program has little control over *when* the cleaning happens. That is a problem for software that must react without delay, such as games, audio, or the brakes of a car.
:::

:::compare Ownership vs manual freeing vs garbage collection
- **C and older C++** give you raw speed, at the cost of checking every `malloc` and `free` in your own head.
- **Python, JavaScript, Go and Java** give you memory safety automatically, at the cost of a garbage collector running alongside your code.
- **Rust** moves the bookkeeping to compile time: the compiler inserts the clean-up at the exact line an owner goes out of scope, so you get C-like speed with no garbage-collector pauses.
:::

Rust's approach is built on one simple thought: **if every piece of heap data has exactly one clear owner, the right moment to free it is obvious**. It is the moment when the owner goes away. No one has to remember to free, so there are no leaks by forgetfulness. Nothing is freed twice, because there is only one owner. And the compiler makes sure nobody still uses the data afterwards.

How that works is the subject of the next chapter.

:::recap
- Memory is a long row of numbered bytes. The number of a byte is its address. A pointer is a value that holds an address.
- The stack holds the local variables of running functions. It is fast and cleans itself up, but everything on it needs a fixed, known size.
- The heap holds data of any size for as long as needed. It must be freed by someone.
- A `String` is a small fixed-size record on the stack that points to its characters on the heap.
- Manual memory management leads to leaks, use after free, double free and out-of-bounds access.
- Garbage collectors avoid most of these bugs at a cost in speed and control. Rust avoids them at compile time through ownership.
:::

:::quiz Check your understanding
? Why can the characters of a text typed by the user not simply be stored on the stack?
- Because text is not a number
- Because the stack is slower than the heap
+ Because their number is unknown when the program is compiled, and the stack needs sizes that are known in advance
- Because the stack is only for functions
= Everything on the stack has a size that the compiler knows. Data whose size is decided while the program runs goes to the heap, and the stack keeps a fixed-size pointer to it.

? What happens to a function's local variables when the function returns?
- They stay on the stack until the program ends
+ Its stack frame is removed, and all its local variables are gone
- They are moved to the heap
- They are handed to the function that is called next
= The whole frame is removed in a single step. That is what makes the stack fast and automatic.

? A program frees a block of memory and later reads from it through an old pointer. What is this bug called?
- A memory leak
- A stack overflow
+ Use after free
- A double free
= The pointer is "dangling": it holds the address of memory that no longer belongs to that data. A leak is memory that is never freed, and a double free is freeing the same block twice.

? What is the main cost of a garbage collector?
- Programs can no longer use the heap
- The programmer must free memory by hand
+ It uses extra time and memory while the program runs, and can cause pauses
- It makes memory bugs more likely
= A garbage collector trades some speed and control for safety and convenience. Rust gets the safety without that cost by doing the checking at compile time.
:::

:::exercise guided Trace the stack on paper
Draw the stack for this program, the way the first stepper did. Make one drawing for the moment when the program is on the line marked `// here`. Which frames exist, and what do they contain?

```rust run
fn main() {
    let width = 3;
    let height = 4;
    let size = area(width, height);
    println!("{size}");
}

fn area(w: i32, h: i32) -> i32 {
    let result = w * h; // here
    result
}
```
::hint
At that moment two functions are active: `main` has called `area`, and `area` has not finished yet. The variable `size` does not have a value yet, because the call has not returned.
::solution
At the marked line the stack looks like this, from top to bottom:

| Frame | Variables |
|---|---|
| `area` (top) | `w = 3`, `h = 4`, `result = 12` |
| `main` | `width = 3`, `height = 4` |

`w` and `h` are separate copies of the values from `main`. `size` has no value yet. When `area` returns, its frame is removed and the 12 is stored in `size`. The heap is not used at all: every value in this program is a number with a fixed size.
:::

:::exercise practice Stack or heap?
For each piece of data, decide whether its contents can live on the stack or need the heap. Give the reason.

1. A player's score, as an `i32`.
2. The text of an email that the user is writing.
3. The three numbers of a colour, as `(u8, u8, u8)`.
4. A list of all files in a folder.
5. The days of the week, as an array of 7 values.
::hint
Ask one question each time: is the size known when the program is compiled, and does it stay the same?
::solution
1. **Stack.** An `i32` is always 4 bytes.
2. **Heap.** The length is unknown and changes while the user types. A small record on the stack points to it.
3. **Stack.** A tuple of three `u8` values is always 3 bytes.
4. **Heap.** The number of files is known only while the program runs.
5. **Stack.** An array has a fixed length that is part of its type.

The rule of thumb: a fixed, known size can go on the stack. A size that is unknown or changing needs the heap.
:::

:::exercise challenge Measure it
Use `size_of_val` to print the size in bytes of each of these values: `true`, `'x'`, `3.5`, `[0u8; 100]` and `String::from("x")`. Predict each number before you run the program.
::hint
A `bool` needs one byte. A `char` can hold any Unicode character, so it needs more than one byte. A float written without a type is an `f64`.
::solution
```rust run
fn main() {
    println!("bool:      {}", size_of_val(&true));
    println!("char:      {}", size_of_val(&'x'));
    println!("f64:       {}", size_of_val(&3.5));
    println!("[u8; 100]: {}", size_of_val(&[0u8; 100]));
    println!("String:    {}", size_of_val(&String::from("x")));
}
```
```output
bool:      1
char:      4
f64:       8
[u8; 100]: 100
String:    24
```

A `char` is always 4 bytes, because that is enough for every character in Unicode. An array of 100 bytes takes exactly 100 bytes, directly on the stack. The `String` takes 24 bytes on the stack plus one byte on the heap for the letter `x`.
:::
