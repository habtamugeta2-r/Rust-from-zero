@id next
@part p11
@title Where to go from here
@short Where to go from here
@level all
@time 25
@learn Choose what to study next, by goal and by level | Find the best book or course for each topic | Practise with small tasks and with real projects | Stay up to date and take part in the Rust community

You have worked through the whole language, the tools around it, and several projects. This chapter is a map of what lies beyond: the books and courses that go deeper than this guide, places to practise, and ways to stay in touch with a language that gets a new version every six weeks.

You do not need to cover every topic to move forward. Keep the core path from [chapter 1](#what-is-rust) through [chapter 26](#project-report), then choose the route closest to what you want to build:

| Goal | A focused next route |
|---|---|
| Command-line tools | [Cargo](#cargo), [error handling](#errors), [Serde](#serde), [Clap](#cli) |
| Web services and APIs | [async Rust](#async), [Tokio and the async ecosystem](#async-ecosystem), [Axum](#web), [databases](#databases), then the [API project](#project-api) |
| Browser or desktop apps | [Serde](#serde), then [WebAssembly and app interfaces](#apps) |
| Embedded devices or games | [memory and ownership](#memory), [smart pointers](#smart-pointers), [unsafe Rust](#unsafe), then [games and embedded Rust](#games-embedded) |
| Deeper language understanding | [advanced traits](#advanced-traits), [type design](#type-system), [memory layout](#memory-layout), and [idioms](#idioms) |

Treat these as starting points, not prerequisites. Follow a link when a project needs that skill, and return to the route later.

:::analogy After the driving test
A driving licence does not make an experienced driver. It means that you can now learn safely on your own, on real roads. You are at that point with Rust: you can read the documentation of any crate, understand what the compiler tells you, and build things. The experience comes from kilometres driven.
:::

:::compare Learning Rust vs learning another skill
Some people expect a language to be mastered by reading alone. In practice, every programming language is learned in a loop: you read a bit, you try a small thing, you fix the errors, and you build something real. Rust is unusual in that the compiler gives excellent feedback, which makes that loop efficient once you know the basic rules.
:::

## How to keep learning

Three activities, in a loop. Each one feeds the others.

1. **Build something you want to exist.** A tool for your own work, a small game, a bot, a web service for your club. A project that you care about keeps you going when it gets difficult, and it forces you to solve problems that no tutorial planned for you.
2. **Read code that is better than yours.** The documentation of every crate has a "source" link next to each item. Follow it. Start with small, well-kept crates that you already use.
3. **Explain what you learned.** Write a short note, answer a beginner's question, or show your project to someone. Gaps in your understanding become visible the moment you try to explain.

## Other guides, and what each one is best at

This guide owes ideas to all of the following. None of them is a replacement for the others: each teaches something better than the rest. Everything in the first table can be read free of charge on the web.

| Resource | Best for | Level |
|---|---|---|
| [The Rust Programming Language](https://doc.rust-lang.org/book/) ("the book") | The official introduction. Read it as a second explanation of anything that did not click here | beginner |
| [The book, Brown University edition](https://rust-book.cs.brown.edu/) | Ownership. It shows, line by line, what each variable may do, and has quizzes inside the text | beginner |
| [Rust by Example](https://doc.rust-lang.org/rust-by-example/) | A short runnable example for almost every feature. Good for looking things up | beginner |
| [Rustlings](https://github.com/rust-lang/rustlings) | About 90 tiny broken programs to repair in your terminal. The best practice for reading compiler messages | beginner |
| [100 Exercises To Learn Rust](https://rust-exercises.com/100-exercises/) | One project, a ticket system, that grows with every exercise | beginner to intermediate |
| [Comprehensive Rust](https://google.github.io/comprehensive-rust/) | Google's course, built for classes. Fast, with deep dives on idiomatic Rust, unsafe code, concurrency and bare metal | intermediate |
| [Effective Rust](https://www.lurklurk.org/effective-rust/) | 35 pieces of advice for writing Rust well, each with its reasons | intermediate |
| [Rust Design Patterns](https://rust-unofficial.github.io/patterns/) | Idioms, patterns and anti-patterns, one page each | intermediate |
| [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/) | The checklist to go through before you publish a library | intermediate |
| [The Cargo Book](https://doc.rust-lang.org/cargo/) | Everything about manifests, features, profiles and workspaces | reference |
| [The Rust Reference](https://doc.rust-lang.org/reference/) | The exact rules of the language, when you need the last detail | reference |
| [The standard library documentation](https://doc.rust-lang.org/std/) | Every type and function, with examples. Offline: `rustup doc --std` | reference |

## Going deeper, topic by topic

| Topic | Where to continue | Chapters here |
|---|---|---|
| Ownership, by building data structures | [Learn Rust With Entirely Too Many Linked Lists](https://rust-unofficial.github.io/too-many-lists/) | [9](#ownership) to [11](#slices-strings), [27](#smart-pointers) |
| Threads, atomics and locks | [Rust Atomics and Locks](https://marabos.nl/atomics/) by Mara Bos, free to read online | [30](#threads), [31](#shared-state) |
| Async | [Asynchronous Programming in Rust](https://rust-lang.github.io/async-book/) and the [Tokio tutorial](https://tokio.rs/tokio/tutorial) | [32](#async), [45](#async-ecosystem) |
| Unsafe code | [The Rustonomicon](https://doc.rust-lang.org/nomicon/) | [35](#unsafe) to [37](#memory-layout) |
| Macros | [The Little Book of Rust Macros](https://veykril.github.io/tlborm/) | [34](#macros) |
| Performance | [The Rust Performance Book](https://nnethercote.github.io/perf-book/) | [51](#performance) |
| Command-line tools | [Command Line Applications in Rust](https://rust-cli.github.io/book/) | [44](#cli) |
| Web services | *Zero To Production in Rust* by Luca Palmieri: one service, taken all the way to a server | [46](#web) to [48](#project-api) |
| Small devices | [The Embedded Rust Book](https://docs.rust-embedded.org/book/) and the documentation of Embassy | [50](#games-embedded) |
| Recipes for everyday tasks | [Rust Cookbook](https://rust-lang-nursery.github.io/rust-cookbook/) | [42](#crates) |
| Language design in depth | *Rust for Rustaceans* by Jon Gjengset, and his long video series "Crust of Rust" | [28](#advanced-traits), [29](#type-system) |
| A second complete book, more detailed | *Programming Rust* by Blandy, Orendorff and Tindall | all |

:::tip One at a time
Do not open ten of these at once. Choose the one topic that your current project needs, read that, and return to the project.
:::

## Practice

**Small tasks** train the hands:

- **[Rustlings](https://github.com/rust-lang/rustlings)**, if you have not done it yet. After this guide it takes a few evenings.
- **[Exercism](https://exercism.org/tracks/rust)** has about a hundred Rust tasks with automatic tests. You can ask for comments from a volunteer mentor.
- **[Advent of Code](https://adventofcode.com)** publishes a series of puzzles every December, each in two parts, and all earlier years stay open. Each puzzle is practice in parsing text, in iterators and in collections.

**Projects** train the judgement. Ideas, ordered roughly by size:

| Idea | What it trains |
|---|---|
| Your own version of a Unix tool: `wc`, `head`, `tree`, `grep` with colours | files, arguments, iterators, tests |
| A tool that renames or sorts your photos by date | paths, folders, errors, dry runs |
| A program that watches a web page and tells you when it changes | HTTP, async, timers, storing state |
| A text adventure or a small roguelike game in the terminal | enums, state machines, a game loop |
| A static site generator: Markdown in, HTML out | parsing, templates, a whole pipeline |
| A chat bot for a platform you use | an API from someone else, JSON, long-running tasks |
| An interpreter for a tiny language of your own | recursion, `Box`, enums, error messages |
| A key-value store with a network protocol | TCP, concurrency, files that survive a crash |
| A ray tracer that writes an image file | numbers, traits, Rayon, performance |
| A contribution to a crate you use | reading foreign code, tests, review |

Finish small things. Three finished tools teach more than one huge project that never runs.

## Reading good code

Code to learn from, once your own projects raise questions:

- **The standard library.** `Option`, `Vec` and `String` are written in Rust that you can now read. Click "source" in their documentation.
- **`ripgrep`**, a fast search tool: how a larger command-line program is split into crates.
- **`mini-redis`**, written by the Tokio team as a teaching project: an async server and client, with comments that explain the choices.
- **The `examples` folder** of Axum, Bevy, egui or any other crate you use. Examples are the fastest way into a library.

## Staying up to date

- A new stable version of Rust appears **every six weeks**. Run `rustup update` now and then. The [Rust blog](https://blog.rust-lang.org) explains what each version brings.
- **[This Week in Rust](https://this-week-in-rust.org)** is a weekly newsletter: articles, new crates, events, jobs.
- A new **edition** arrives about every three years. `cargo fix --edition` does most of the moving ([chapter 39](#cargo)).
- Talks from conferences such as RustConf, EuroRust and RustNation are published as videos.

This guide was tested with Rust 1.100. Rust keeps old code working, so the examples will compile with later versions. Crates outside the standard library move faster. When an example with a crate no longer compiles, look at the changelog of that crate first.

:::exercise guided Pick one next step
Write a short plan for the next two weeks: one project you will build, one book or article you will read, and one community place you will visit or follow. Keep the plan visible.
::hint
Do not pick everything at once. Choose one real need and one learning resource that supports it.
::solution
A good plan is concrete and small enough to finish. Example: "I will build a CLI that renames photos by date, read one chapter of Rustlings or the Rust book, and ask a question in the users forum when I get stuck." The important part is that the plan connects learning to a real task.
:::

:::exercise practice Choose a reading habit
Pick one resource from this chapter and explain in one sentence why it matches the project you want to build next. Then write down one action you will take when you finish the chapter: a code sample, a note, or a small experiment.
::hint
Match the resource to your audience: learn ownership from a book, learn compiler messages from Rustlings, or read async docs if you need a server.
::solution
A strong answer names both the task and the reason. Example: "I need to build a small web service, so I will read Zero To Production in Rust because it starts with a single service and keeps growing systematically." The action is the step that turns reading into understanding.
:::

:::exercise challenge Decide what to revisit
Choose one topic from this guide that you still find unclear. Write a one-paragraph note saying what you understand, what you do not yet understand, and what you will do next to close the gap.
::hint
Use a concrete question: "I understand ownership in simple cases but not in a struct that contains a `Vec` and a reference; I will revisit that chapter and write one tiny example." 
::solution
This exercise trains the habit of making your confusion precise. The goal is not to feel bad about the gap; it is to convert uncertainty into a next action. That is how Rust learning becomes durable.
:::

:::quiz Check your understanding
? Why is a loop of build, read code, and explain useful?
- It guarantees that you will never need to ask for help
- It replaces the compiler with a teacher
+ It turns learning into practice and makes gaps in your understanding visible
- It is the only way to finish a project
= Learning in a loop keeps your knowledge connected to real work and helps you notice where you are still guessing.

? Which resource is best for a beginner who wants to improve compiler-message reading?
- The Rust blog
- The Cargo Book
+ Rustlings
- The Rust Reference
= Rustlings is built for small fixes, so it helps you practice reading compiler messages as you make mistakes on purpose.

? Why is it valuable to choose just one topic at a time?
- Because all topics are equally important right away
- Because reading ten books is faster than reading one
+ Because focused study is easier to connect to one real project and easier to finish
- Because the guide lists only one topic per chapter
= One topic at a time keeps your attention on the skill that matters right now.

? What is a good first contribution to open source?
- A giant rewrite of a library
- A feature that changes the API for everyone
+ A small documentation fix, a test, or a clear reproduction of a bug
- A patch with no explanation
= Small, well-described contributions are the easiest way to start helping in a project and to learn from experienced maintainers.
:::

## People

- The **[users forum](https://users.rust-lang.org)** is the place for questions of every level, and answers there are patient.
- The official **Discord** and **Zulip** chats, and the `r/rust` forum on Reddit, are active every day.
- Many cities have a **Rust meetup**. Showing a small project there is a good first talk.
- When you are stuck, write a good question: a small program that shows the problem, the full compiler message, and what you expected to happen. Making the small program often answers the question before you send it.

## Giving back

Open-source projects need more than code. Good first contributions are a fix in the documentation of a crate after it confused you, a missing example, a test for a reported bug, or a clear bug report with a small program that shows the problem. Many projects mark suitable tasks with a label such as "good first issue". And when you have written a tool that others could use, publish it ([chapter 39](#cargo)).

:::recap
- Keep a loop going: build, read good code, explain.
- Pick resources by need: the Brown edition of the book for ownership, Rustlings for compiler messages, Effective Rust and the API Guidelines for style, the specialised books for async, unsafe, concurrency and performance.
- Practise with small tasks, and learn judgement with projects that you finish.
- Update Rust regularly, read the release notes, and ask and answer questions in the community.
:::

:::checklist
- I have chosen one project that I want to build, and written down its first three steps.
- I have opened the source of one standard-library method and read it.
- I have picked one topic from the table and the resource for it.
- I have run `rustup update`.
- I have looked at the users forum or another community place.
- I have finished the capstone project of [chapter 52](#capstone), or planned when to do it.
:::
