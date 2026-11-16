@id start
@part welcome
@title How to use this guide
@short Learn the guide and the study rhythm
@level beginner
@time 15
@learn Find your way around the guide and its interactive parts | Follow a study routine that makes new knowledge stick | Know what to do when you get stuck

Welcome. This guide starts with two questions: how does a computer carry out a program, and how can Rust help you write one safely? No previous programming or computer-science study is required. You will need a computer, a terminal for some exercises, and time to try the examples rather than only read them. Linux is used for several hands-on systems labs; where a task needs it, the chapter says so.

## What you will be able to do

As you work through the guide, you will build a connected model of how a program moves through a computer:

`Source Code → Compilation → Machine Code → Program Loading → Memory Allocation → Execution → CPU Instructions → Operating System → Hardware Interaction → Input/Output`

Rust is the working tool throughout. You will practise reading compiler output and ELF binaries, tracing memory and I/O, and relating CPU, operating-system, networking and storage concepts to running programs. The projects then use those ideas to build command-line tools, concurrent services and database-backed web APIs.

Learning systems programming is like learning to cook or to play an instrument. Reading alone does not work. **Each chapter gives you concepts, traces, and experiments to run, and the doing is where the learning happens.**

## What is in this guide

Explore the full chapter-by-chapter dependency map in the **[Complete Learning Roadmap](#roadmap)**.

| | |
|---|---|
| Structure | 15 Parts + 13 definitive chapters (D1–D13) + 5 Appendices (96 tracked chapters & orientation guides + 5 appendices = 101 sections) |
| Projects | 9 complete projects and labs built step by step, including a Linux `/proc` & ELF systems inspector |
| Appendices | Glossary, systems & Rust reference tables, compiler error catalogue, language translation guides, and a from-source-to-silicon deep dive |
| Rust examples | 1,298 Rust listings across 1,688 code blocks, paired with real compiler diagnostics and machine-level traces |
| Exercises & Quizzes | 313 worked exercises (each with hint + solution) and 444 instant-feedback quiz questions |

Where the guide shows compiler diagnostics or captured output, those blocks come straight from `rustc` (Rust 2024 edition). Hardware, ELF, and Linux kernel experiments are written for `x86_64` and `ARM64` Linux environments with `rustc`, `cargo`, `objdump`, `readelf`, `nm`, `strace`, `rust-gdb`, `perf`, and `/proc`.

## Choose your path: full systems journey or goal-based routes

Start with the **Complete Learning Roadmap** ([roadmap](#roadmap)) to see how every part depends on earlier foundations, or pick a route filter on the home page:

| Route | Chapters to read | Best for |
|---|---|---|
| **Core Rust path** | [1](#what-is-rust), [4](#setup), Part 3 core chapters, and Part 4 abstractions & tooling ([Cargo](#cargo)–[Testing strategies](#testing-strategies)) | Beginners focusing first on everyday Rust syntax, ownership, traits, and testing |
| **Systems & internals** | Parts 1 through 14 in full order | Understanding the entire computer stack from hardware & compilation to OS, I/O, CPU, networking & storage |
| **CLI tools** | Core path → [Crates](#crates) → [Serde](#serde) → [Command-line tools](#cli) | Terminal utilities and automation scripts |
| **Web backends & APIs** | Core path → Part 11 Concurrency → Part 12 Networking & [Axum](#web) → Part 13 [Databases](#databases) → [Observability](#observability) → [Capstone](#capstone) | Production HTTP services, telemetry, and SQL persistence |
| **Definitive 13** | [D1–D13](#roadmap), one domain-complete chapter per area, from core language to advanced meta-programming | A structured domain path through backend, blockchain, security, AI/ML, embedded, DevOps, networking, games or WebAssembly |
| **Optional ecosystem surveys** | [Apps (Wasm, Tauri, GUI)](#apps) and [Games, embedded & data](#games-embedded) | Exploring specialised application domains |

:::tip Follow the ten-stage lens
Every major systems and Rust internals topic in this guide connects ten layers of reality:
**Starting Point** → **Source Code** → **Compiler Perspective** → **Compiled Representation** → **Memory Perspective** → **Execution Perspective** → **Operating System Perspective** → **Hardware Perspective** → **Practical Experiment** → **Conclusion**.
You do not merely memorise syntax—you learn *why* the machine behaves the way it does.
:::

## What this guide covers, and what it does not

"Everything in computing" is vast, so this guide keeps a clean boundary. **User-space systems programming, computer architecture, compilation, memory, Linux OS mechanisms, I/O, networking, storage, and core Rust application engineering** are taught directly with working experiments. Specialised domains outside a single-book scope—such as blockchain/Web3, writing a complete standalone OS kernel from scratch, robotics control theory, and cloud-provider SDKs—are clearly separated and pointed to dedicated follow-on books in [the final chapter](#next).

## How a chapter is built

Every chapter follows the same rhythm:

1. **The idea in plain words**, usually with a comparison to everyday life.
2. **A small example** you can run, with an explanation of each part.
3. **Exercises**, so you use the idea yourself right away.
4. **A quick quiz**, so you find out what did not stick before you move on.

Along the way you will meet the coloured boxes below. Each colour always means the same thing.

:::analogy This is what an analogy box looks like
A new idea is compared to something you already know. A program is like a recipe: a list of exact steps that someone (the computer) follows in order.
:::

:::plain This box explains a technical word
**Jargon** means special words used by a group of experts. Programmers use a lot of it. Whenever a new word appears, it is explained on the spot. Words with a dotted underline, like [[compiler]], show their meaning when you point at them or tap them. Every such word is also in the [glossary](#glossary).
:::

:::compare This box compares Rust with other languages
If you have used Python, JavaScript, C or another language, these boxes show what is the same and what is different. If Rust is your first language, read them anyway: they explain *why* Rust is designed the way it is.
:::

:::warn This box warns about a common mistake
Everyone makes these mistakes. Knowing them in advance saves you an hour of confusion.
:::

:::tip This box shares a practical tip
A shortcut, a good habit, or a tool that makes life easier.
:::

:::key This box holds an idea you should not forget
If you remember only one thing from a section, remember what is in this box.
:::

:::details Boxes like this one open when you click them
They hold optional, deeper detail. Skip them on a first read and come back later.
:::

## How code is shown

Code appears in boxes like this one:

```rust run
fn main() {
    println!("Rust is fun!");
}
```
```output
Rust is fun!
```

The grey box below the code shows the **output**: what appears on the screen when the program runs. Do not worry about what the code means yet. That starts in [chapter 4](#setup).

Each code box has buttons in its top-right corner:

- **Copy** puts the code on your clipboard so you can paste it somewhere else.
- **Run** appears on complete programs (and **Test** on unit-test listings). It compiles and runs the code right here in the guide and prints the result directly below the box, so you can try things without installing anything or leaving the page. Press **Edit** beside it to tweak the code and run your version in place. Running needs an internet connection.

Some examples are *meant* to be wrong, because the error teaches something. They have a red label — you can press **Run** to see the compiler error below, or **Edit** to fix the mistake right in place:

```rust fail
fn main() {
    println!("This line is missing its closing quote);
}
```

:::note Tested examples and reference code
Standard-library examples and core crate examples marked for verification are compiled against the Rust compiler (edition 2024, targeting Rust 1.100) by `tools/check.py`, and multi-file projects and WebAssembly / bare-metal target listings are extracted and tested by `tools/check.py --projects`. Failing examples fail in the way the text describes. Examples that require external databases, brokers, hardware boards, or desktop GUI windows are shown as complete reference code verified separately.
:::

## Exercises, hints and solutions

Exercises come in three kinds:

| Kind | What it is | How to use it |
|---|---|---|
| Guided exercise | You are led through it step by step | Do every one of them. They are part of the lesson |
| Practice | You apply the idea on your own | Try for at least ten minutes before opening the hint |
| Challenge | Harder, combines several ideas | Optional on a first read. Come back when you feel ready |

Each exercise has a **hint** and a **full solution with an explanation**. Here is a small one to try the buttons:

:::exercise guided Find the buttons
Open the hint below, then open the solution. When you are done, tick the "Done" box in the corner of this exercise.
::hint
A hint nudges you in the right direction without giving the answer away.
::solution
A solution shows working code and explains *why* it works. Your own solution does not have to look the same. If it does the job and you understand it, it is a good solution.

One rule: **try before you look**. A solution you worked for stays in your head. A solution you only read is gone by tomorrow.
:::

Quizzes give you an answer straight away. Try this one:

:::quiz Try a quiz question
? What is the best way to use the examples in this guide?
- Read them carefully and move on
+ Type them out yourself, guess what they will do, then run them
- Copy and paste them, then run them
- Skip them and go straight to the exercises
= Typing code yourself trains your fingers and your eyes. Guessing the result first turns each example into a small experiment, and you learn the most when your guess turns out to be wrong.
:::

## A study routine that works

- **Little and often.** Forty minutes a day beats five hours on Sunday. At that pace the whole guide takes about three to five months.
- **Type the code.** Do not copy and paste while you are learning. Typing makes you notice every bracket and semicolon.
- **Predict, then run.** Before you run a program, say out loud what you think it will print.
- **Break things on purpose.** Remove a line or change a number and see what the compiler says. You cannot damage anything.
- **Read error messages slowly.** Rust's error messages are among the most helpful of any language. They usually tell you exactly what is wrong, and often how to fix it. Learning to read them is a skill this guide teaches on purpose.
- **Do the projects.** They join the small ideas into something real.

:::tip Already know another programming language?
You can skim the early syntax chapters in Part 3 quickly, but read **Part 1**, **Part 2**, and the ownership and internals chapters in Parts 3–5 carefully: Rust's memory model, compiler guarantees, and zero-cost mapping to hardware are where everything clicks together. Also check [Coming from another language](#from-other-languages) for quick translation tables.
:::

## When you get stuck

Being stuck is a normal part of programming. Professionals are stuck several times a day. This order of steps usually works:

1. **Read the error message again**, slowly, from the top. Read the line it points to.
2. **Make the problem smaller.** Delete code until the error goes away. The last thing you deleted is the cause.
3. **Explain the problem out loud**, to a friend or to a rubber duck on your desk. Saying it in words often shows you the answer.
4. **Look it up.** Use the search box in this guide, the [glossary](#glossary), and the list of [common compiler errors](#errors-ref).
5. **Ask people.** The Rust community is known for being kind to beginners. The official forum at [users.rust-lang.org](https://users.rust-lang.org) is a good place to ask.
6. **Take a break.** Many problems are solved on a walk.

## Your progress

At the end of each chapter there is a **Mark as complete** button. Completed chapters get a tick in the table of contents, and the bar at the top of the list fills up. Your progress, quiz answers and ticked exercises are saved in your browser on this device. Nothing is sent anywhere.

:::recap
- Each chapter goes: idea, example, exercise, quiz.
- Type the code, predict the result, then run it.
- Try each exercise before opening the hint or the solution.
- Error messages are there to help you. Read them slowly.
- Being stuck is normal. Make the problem smaller, look it up, ask, rest.
:::
