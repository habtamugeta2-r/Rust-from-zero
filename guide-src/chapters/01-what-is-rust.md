@id what-is-rust
@part p1
@title Programs, languages, and why Rust exists
@short What programming and Rust are
@level beginner
@time 45
@learn Explain what a program, a programming language and a compiler are | Describe the problem Rust was created to solve | Compare Rust with Python, JavaScript, C, C++, Go and Java in plain terms | Decide what you would like to build with Rust

Before you write any code, it helps to know what code is, what happens to it after you write it, and why the world needed one more programming language. This chapter has no code to type. It gives you the map for everything that follows.

## What is a program?

A computer is a machine that follows instructions. It is very fast and it never gets bored, but it understands nothing. It does exactly what it is told, in exactly the order it is told, including the mistakes.

A **program** is a list of instructions for a computer. The app you use to send messages, the website you are reading, and the software inside a washing machine are all programs.

:::analogy A program is a recipe
A recipe lists exact steps: *take 200 g of flour, add two eggs, stir for one minute*. A cook follows the steps and gets a cake. A program lists exact steps too, and the computer is the cook.

There is one difference. A human cook fills gaps with common sense. If the recipe forgets to say "take the cake out of the oven", a person will take it out anyway. A computer will let it burn. Programming is the skill of writing instructions so complete and so exact that even a machine with no common sense gets the right result.
:::

**Programming** (also called *coding*) is writing those instructions. The text you write is called **source code**, or just *code*.

## What is a programming language?

Deep down, a computer understands only numbers. Its real instructions, called **machine code**, look like this to a human: `10110000 01100001`. Writing programs that way is slow and painful, so people invented **programming languages**: ways of writing instructions with words and symbols that humans can read. For example, this line of Rust tells the computer to show a message on the screen:

```rust
println!("Hello!");
```

A programming language has strict rules about how instructions must be written. These rules are called its **syntax**, the same way English has grammar. Forget one bracket and the computer cannot understand you. That feels harsh at first. It becomes normal quickly.

There are thousands of programming languages. You may have heard of Python, JavaScript, Java, C or C++. They all describe instructions for a computer, but they make different choices, the way a sports car, a bus and a tractor are all vehicles built for different jobs.

## From your text to a running program

Your computer cannot run source code directly. Something must translate it into machine code. There are two main ways to do that.

:::analogy Translating a book or interpreting a speech
Imagine you wrote a speech in English and the audience speaks only Japanese.

- You can hire a **translator** to turn the whole speech into Japanese *before* the event. This takes time up front, but then the speech can be read aloud at full speed, as often as you like. The translator also has time to spot sentences that make no sense and send them back to you.
- Or you can hire an **interpreter** who stands next to you and translates each sentence as you say it. You can start at once, but the speech is slower every time, and a nonsense sentence is only noticed when you reach it, in front of everyone.
:::

- A **compiler** is the translator. It reads all your source code, checks it for mistakes, and produces a finished program (a file your computer can run directly). Rust, C, C++ and Go work this way.
- An **interpreter** is the live interpreter. It reads your code and carries it out line by line, every time the program runs. Python and JavaScript mostly work this way.

:::plain Compiler, compile, compile time, run time
The **compiler** is the tool that turns your source code into a program the computer can run. For Rust this tool is called `rustc`. To **compile** is to do that translation. **[[Compile time]]** is the moment when the compiler is working. **[[Run time]]** (also written *runtime*) is the moment when the finished program is running. A mistake caught at compile time never reaches the people who use your program. That idea is central to Rust.
:::

:::note For the curious: the compiler's conveyor belt
What exactly happens inside the compiler, and what exactly the processor does with the result? [The silicon appendix](#under-the-hood) traces one line of Rust through every station — tokens, syntax tree, the borrow checker, LLVM, machine code, the operating system's loader, and finally the fetch–decode–execute cycle of the CPU. It is an optional deep dive for when the basics feel comfortable.
:::

## Bugs, and the kind Rust was built to stop

A mistake in a program is called a **[[bug]]**. Some bugs are small, like a button in the wrong colour. Some are serious: a program that **crashes** (stops suddenly), loses your data, or lets a criminal break in.

One family of bugs has caused serious harm for decades: **memory bugs**. A program keeps the data it is working with in the computer's memory. In languages such as C and C++, programmers can manage that memory directly: reserve it, use it, release it, and avoid using it afterwards. That flexibility makes mistakes possible; a program might read memory after it has been released or write past the end of a buffer. Such bugs can cause crashes and security vulnerabilities. Their prevalence varies by product and by how a report defines and counts a memory-safety issue.

Languages such as Java, Python, JavaScript and Go avoid most of these bugs with a **[[garbage collector]]**: a helper that runs inside your program, watches the memory, and cleans up what is no longer used. That is safe, but it has a cost. The helper uses time and memory, and now and then it makes the program pause for a moment.

So for a long time programmers had to choose:

| | Fast and in full control | [[Memory safety|memory safety]] |
|---|---|---|
| C, C++ | Yes | No. Safety depends on the programmer never making a mistake |
| Java, Python, JavaScript, Go | Less. The garbage collector costs time and memory | Yes |
| **Rust** | **Yes** | **Yes** |

Rust gets both by using a new idea called **ownership**. The Rust compiler checks a set of rules about who is responsible for each value and which references may use it. In safe Rust, these [[memory safety]] checks prevent important classes of memory misuse before the program runs. Rust does not need a tracing garbage collector to enforce those rules, though it still performs allocations and other work at run time. You will learn ownership in [Part 3](#ownership); it is central to understanding the language.

:::key Rust's promise
In safe Rust, many memory mistakes are rejected by the compiler before a program runs. This does not rule out logic errors, failures in unsafe code or libraries, or every possible memory-related defect; it narrows the kinds of mistakes ordinary safe code can express.
:::

## What a compiling Rust program guarantees

The promise above needs a boundary. For code written in safe Rust, the compiler checks rules that prevent several classes of invalid memory access and data races, provided unsafe code and external libraries uphold their contracts. A successful build does not certify the whole program or every dependency. The guarantees relevant to this chapter are:

- **Safe references remain valid and in bounds.** Safe Rust will not let you dereference a reference after its value has been dropped or index a slice outside its bounds. Raw pointers and unsafe code can bypass these checks, so their callers and authors must uphold the required invariants.
- **Safe ownership prevents double-free and use-after-free through ordinary safe operations.** An owned value is dropped according to its ownership; unsafe code must not invalidate that guarantee.
- **Data races are impossible in safe code.** Two parts of the program cannot change the same data at the same time and read a half-written value. [Chapter 15](#borrowing) shows exactly why.
- **A variable always holds a value before it is read.** There is no "maybe nothing here" that quietly turns into a crash three lines later.

Now notice what is *not* on the list. Compiling does not prove that your program does what you meant. If a function is supposed to sort a list but the logic is wrong, the compiler will build it happily. Rust removes *whole classes* of bugs from your program; it does not check your reasoning. This is what people mean when they say Rust is "safe": safe from a clearly defined set of low-level machine mistakes, not safe from every possible mistake. Knowing the difference keeps you from being surprised later.

:::compare "Safe" and "unsafe" Rust
Nearly everything you will write is in **safe** Rust, and every guarantee above is true of it. There is also **[[unsafe]] Rust**: a small set of extra tools for working at the very bottom of the machine — reading raw memory, talking to hardware, or using a library written in C. Unsafe does not mean "broken" or "dangerous to use"; it means *you, the programmer, make the safety argument that the compiler would otherwise make*. The compiler cannot verify the safety argument for you; the author of unsafe code must uphold its documented invariants. Most application code can remain safe, but this guide also examines unsafe Rust directly in its dedicated chapter.
:::

:::plain Zero-cost abstraction
Rust is built around a design principle called **[[zero-cost abstraction]]**. You can write a program with clean, high-level tools — a loop over a list, a small function, an object with methods — without paying any extra cost in speed or memory once the program is compiled. The compiler removes the "extra" scaffolding during compilation. The goal is that a readable Rust program can run as fast as the rawest, most manual code for the same job. You will see this principle quietly at work throughout the guide: the safe way to do a thing is also the fast way.
:::

## A short history of Rust

- **2006:** Graydon Hoare, a programmer at Mozilla (the makers of the Firefox browser), starts Rust as a personal project. He wanted a language that made software more reliable.
- **2009:** Mozilla begins to pay for its development.
- **2015:** Rust 1.0 is released. From here on the language promises *stability*: code that compiles today keeps compiling with newer versions.
- **2021:** The Rust Foundation is created, backed by companies such as Amazon, Google, Microsoft, Huawei and Mozilla, to look after the language.
- **Today:** Rust is used inside Windows, Android and the Linux kernel, and by companies such as Amazon, Cloudflare, Discord and Dropbox. A new version comes out every six weeks. This guide was written for version 1.100.

Rust is developed in the open by volunteers and paid engineers from many organisations. People who write Rust call themselves **Rustaceans**, and the unofficial mascot is a friendly orange crab called Ferris.

## What people build with Rust

- **Command-line tools:** small, fast programs you run by typing a command. You will build several.
- **Web servers and services:** the programs behind websites and apps. See [Part 12](#web).
- **System software:** kernels, drivers, embedded firmware, databases, and low-level Linux tools.
- **Programs that run inside a web page**, through a technology called WebAssembly.
- **Desktop and mobile apps**, and **games**.
- **Embedded software:** the code inside small devices such as sensors, watches and robots.
- **Operating systems, browsers and databases:** the foundations other software stands on.

You do not need to aim for any of these yet. Everything starts with the same small building blocks.

## The ten-layer journey from text to hardware

Every time you write a line of Rust and run it, your program crosses ten layers of engineering:

```text
Source Code (.rs) → Compilation → Machine Code → Program Loading → Memory Allocation
      → Execution → CPU Instructions → Operating System → Hardware Interaction → Input/Output
```

This guide does not treat Rust as abstract magic. Across the chapters ahead you will trace **both** how Rust works as a language and how each step behaves inside the [[compiler]], [[virtual memory]], processor, [[kernel]], and storage or network hardware.

## Rust compared with other languages

You do not need to know these languages. The table shows where Rust sits among them.

| Language | How it runs | Memory safety | Typical speed | Known for |
|---|---|---|---|---|
| Rust | Compiled | Checked by the compiler, no garbage collector | Very fast | Safety and speed together |
| C | Compiled | Up to the programmer | Very fast | Operating systems, small devices |
| C++ | Compiled | Mostly up to the programmer | Very fast | Games, browsers, large systems |
| Go | Compiled | Garbage collector | Fast | Simple network services |
| Java, C# | Compiled to an in-between form, then run by a helper program | Garbage collector | Fast | Business software, Android apps |
| Python | Interpreted | Garbage collector | Slow | Data science, scripts, beginners |
| JavaScript | Interpreted | Garbage collector | Medium | Web pages |

:::compare What you gain and what you pay
Rust is honest about its price. The compiler is strict: it refuses programs that other languages would accept, and beginners sometimes feel they are "fighting the compiler". Compiling also takes longer than in some languages. In return you get programs that are fast, use little memory, and rarely crash in surprising ways. Many people find that once their Rust program compiles, it simply works.

There is another benefit that is easy to miss. Rust makes you think clearly about things every program has to deal with, in any language: who owns this data, who may change it, what can go wrong. People who learn Rust often say it made them better at other languages too.
:::

## Is Rust a good first language?

Yes, with the right guide. Rust asks you to learn a few ideas early that other languages hide. That is more work in the first weeks. But the compiler acts like a patient tutor: it catches your mistakes, explains them in full sentences, and often shows the fix. You also learn how computers really work, which pays off for the rest of your programming life.

:::recap
- A program is a list of exact instructions. Source code is the text you write.
- A compiler translates all your code into a runnable program before it runs, and checks it for mistakes.
- Memory bugs are a major cause of crashes and security holes in C and C++ programs.
- Garbage-collected languages avoid them at a cost in speed. Rust avoids them at compile time, with no such cost, through ownership.
- The price is a strict compiler and a steeper start. The reward is fast, reliable software.
:::

:::quiz Check your understanding
? What does a compiler do?
- It runs your program one line at a time
- It finds and deletes unused memory while the program runs
+ It translates your source code into a program the computer can run, and checks it for mistakes first
- It lets you type code with colours
= A compiler translates the whole program ahead of time. Running code line by line is what an interpreter does, and cleaning up memory during the run is the job of a garbage collector.

? Why can a mistake caught at compile time be called a "cheap" mistake?
+ Because it is found on the programmer's computer, before any user ever runs the program
- Because the compiler is free software
- Because compile-time mistakes are never serious
- Because the compiler repairs the mistake by itself
= The earlier a bug is found, the less harm it does. A compile-time error never reaches your users. Rust is designed to move as many mistakes as possible to compile time.

? How does Rust avoid memory bugs without a garbage collector?
+ The compiler enforces ownership rules that prove memory is used correctly before the program runs
- It asks the programmer to be very careful
- It checks memory while the program runs and pauses when needed
- It never uses memory
= Ownership rules are checked at compile time, so the finished program needs no helper to watch its memory. You will learn these rules in Part 3.

? Which statement about Rust is true?
- Rust programs are usually slower than Python programs
- Rust can only be used for operating systems
- Rust is owned and controlled by a single company
+ Rust's compiler is strict, which makes the start harder but the finished programs more reliable
= Rust trades a steeper learning curve for speed and reliability. It is used for many kinds of software and is developed by an open community, supported by the Rust Foundation.
:::

:::exercise guided Write instructions for a machine
Programming starts with exact thinking, not with typing. On paper, write step-by-step instructions for making a cup of tea, for a robot that has **no common sense**. The robot knows only these actions: *pick up*, *put down*, *fill*, *pour*, *switch on*, *wait until*, and it can *check whether* something is true.

Then read your steps again and look for gaps. What happens if the kettle is already full? What if there is no tea bag left?
::hint
Go slower than feels natural. "Boil water" is not one step for this robot. It has to pick up the kettle, fill it, put it down, switch it on, and wait until the water boils.
::solution
One possible answer:

1. Check whether the kettle contains water. If it does not, pick up the kettle, fill it with water, and put it down on its base.
2. Switch on the kettle.
3. Wait until the water boils.
4. Check whether there is a tea bag in the box. If there is none, stop and report "no tea".
5. Pick up a tea bag and put it down in the cup.
6. Pick up the kettle, pour water into the cup until the cup is nearly full, and put the kettle down.
7. Wait until three minutes have passed.
8. Pick up the tea bag and put it down in the bin.

You have just used the three building blocks of every program, in any language:

- **Sequence:** steps that run in order.
- **Decision:** "check whether … if …" picks between paths. You will write these with `if` in [chapter 11](#control-flow).
- **Repetition:** "wait until" and "pour until" repeat something until a condition is met. These are loops.

You also thought about what could go wrong (no tea bag). That is error handling, and Rust takes it very seriously.
:::

:::exercise practice Pick your goal
Write down one thing you would like to build once you know Rust. It can be small: a tool that renames your photo files, a simple game, a website that tracks your reading. Keep the note. A concrete goal makes it much easier to keep going.
::hint
Choose a project you already care about. A personal problem is easier to motivate than a generic toy project.
::solution
There is no wrong answer. If you cannot think of anything yet, borrow one of these: a quiz game in the terminal, a tool that counts the words in a file, a personal expense tracker, or a small website for a club. You will build something similar to each of them in this guide.
:::

:::exercise practice Choose the first kind of Rust program you want to build
Pick a category for your first project: command-line tool, web service, terminal game, desktop app, or small library. Write one sentence explaining why that category fits your goal.
::hint
Think about what you want to do with the program, not about the syntax. A CLI is easier to start with if you want a tool for files and folders.
::solution
A good answer is specific and connected to a real task. For example: "I want a command-line tool that renames my photos by date, because I have many files and I want a quicker way to organise them." The purpose of the exercise is to turn a vague wish into a project you can finish and learn from.
:::

:::exercise challenge Plan a program before you can write one
Choose the goal you wrote down in the earlier exercise, and plan the program for it on paper. This is the planning step a programmer does before any code exists, and it is the same thinking you used for the tea-making robot, applied to your own idea.

Write down: the inputs (what the program is given), the outputs (what it must produce), and the steps in between, in order. Mark every place where a step could fail — a missing file, a number where you expected a word — and write what the program should do in that case. Finish by naming the first small version you could build and test, leaving the rest for later versions.
::hint
Keep the first version small enough to describe in three steps. If a step needs the words "and then handle everything else", split it: hidden steps are where vague plans turn into confusing programs. For each input, ask where it comes from — typed by a person, read from a file, or worked out by the program itself.
::solution
One worked answer, for a tool that renames photo files by date:

- **Inputs:** a folder of photo files, each carrying the date it was taken.
- **Outputs:** the same files with names such as `2026-03-14-beach.jpg`, plus a printed list of the old and new names.
- **Steps:** list the files in the folder; read the date from each file; build the new name; check that no two new names collide; rename; print the list.
- **Failures:** a file with no date keeps its name and is reported, rather than stopping the run; a name collision adds a number instead of overwriting an existing file.
- **First version:** rename the files in one named folder, with no options. Folders inside folders, undo, and a preview mode belong to later versions.

The shape matters more than the example: inputs, outputs, ordered steps, named failures, and a first version small enough to finish. You will meet this shape again in the project chapters, where each project starts from a plan of this kind.
:::
