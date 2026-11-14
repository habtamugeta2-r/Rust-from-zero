@id start
@part welcome
@title How to use this guide
@short Learn the guide and the study rhythm
@level beginner
@time 8
@learn Find your way around the guide and its interactive parts | Follow a study routine that makes new knowledge stick | Know what to do when you get stuck

Welcome. This guide teaches you Rust, a modern programming language, starting from nothing. You do not need to know any other language, any maths beyond arithmetic, or any computer science. You need a computer, a web browser, and the patience to type things out and see what happens.

## What you will be able to do

Finish every chapter, exercise and project and you will be able to build real software in Rust: command-line tools, web services backed by a database, programs that do many things at once. You will also understand ideas that apply to every programming language: how memory works, how to organise a large program, how to handle errors, and how to test that your code is right.

This guide is intentionally scoped to the core Rust language, its tooling, the most important crates and ecosystem patterns, and the practical projects in this book. It does not pretend to cover every niche branch of the ecosystem: blockchain, kernel programming, robotics and other specialised domains are outside the main path of a from-zero guide. The point is to give you a solid foundation before you choose a deeper specialism.

Learning to program is like learning to cook or to play an instrument. Reading alone does not work. **Each chapter gives you something to do, and the doing is where the learning happens.**

## What is in this guide

It is worth knowing the size of what you are starting, so that you can plan.

| | |
|---|---|
| Chapters | 54, of which 8 are complete projects you build file by file |
| Appendices | 4: a glossary, a reference, a catalogue of compiler errors, and Rust for people who know other languages |
| Rust examples | 875, **every one compiled and run** by a real compiler, with its real output shown |
| Exercises | 187, each with a hint and a worked solution |
| Quiz questions | 229, each with an explanation |

Nothing here is a mock-up. When the guide shows a compiler error, that is the message the compiler really printed, on the line number it really pointed at. When it shows program output, the program really produced it. This is checked automatically, for every example, on every change to the guide.

## What this guide covers, and what it does not

"Everything about Rust" is an endless subject, so this guide has a written rule. Each part of the Rust world is handled in one of three ways, and it says which:

- **Taught.** At least one section with a compiled example, plus an exercise or a quiz question.
- **Named with advice.** A table row or short paragraph that names the mainstream crates, says how mature they are, and says when to choose them. You are not left guessing, and you are not misled into thinking a passing name is a lesson.
- **Out of scope, on purpose.** Declared in [chapter 53](#next) with a reason and somewhere else to read.

A few areas are deliberately outside this guide: blockchain and Web3, operating-system and kernel development, robotics, high-frequency trading, and cloud-provider SDKs beyond one example. They are real and interesting ecosystems, and each has its own books. A guide that starts from zero cannot teach them honestly, so it names them and steps aside rather than pretending.

Everything else in the ecosystem chapter follows the first two rules. If you find a crate that is named once and never explained, that is a mistake worth reporting.

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

The grey box below the code shows the **output**: what appears on the screen when the program runs. Do not worry about what the code means yet. That starts in [chapter 2](#setup).

Each code box has buttons in its top-right corner:

- **Copy** puts the code on your clipboard so you can paste it somewhere else.
- **Run** appears on complete programs. It opens the code in the *Rust Playground*, a free website that runs Rust for you, so you can try things without installing anything. It needs an internet connection.

Some examples are *meant* to be wrong, because the error teaches something. They have a red label:

```rust fail
fn main() {
    println!("This line is missing its closing quote);
}
```

:::note Every example was tested
Every Rust example in this guide was compiled with the real Rust compiler (version 1.100, November 2026). The outputs you see were produced by running the code. The examples marked as failing were checked too: they fail in exactly the way the text says.
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
- Copy and paste them, then run them
+ Type them out yourself, guess what they will do, then run them
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
You can read Part 1 quickly, but do not skip it: Rust does some basic things differently. Slow down at Part 2 (ownership). It is the part that is new for everybody.
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
