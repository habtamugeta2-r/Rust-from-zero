@id next
@part p13
@kind orientation
@title Where to go from here
@short Where to go from here
@level all
@time 50
@learn Choose what to study next, by goal and by level | Find the best book or course for each topic | Practise with small tasks and with real projects | Stay up to date and take part in the Rust community

This chapter is for the moment after the guide, so it does not repeat the orientation in [how to use this guide](#start) or the chapter map in [the roadmap](#roadmap). Its one job is to answer: **you can write Rust now — what should you build, read and practise next?** Use it to choose a direction, find the best external resource for a topic, and keep up with changes in the Rust ecosystem.

You do not need to cover every topic to move forward. Keep the core path from [chapter 1](#what-is-rust) through [chapter 31](#project-report), then choose the route closest to what you want to build:

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
| Ownership, by building data structures | [Learn Rust With Entirely Too Many Linked Lists](https://rust-unofficial.github.io/too-many-lists/) | [14](#ownership) to [16](#slices-strings), [32](#smart-pointers) |
| Threads, atomics and locks | [Rust Atomics and Locks](https://marabos.nl/atomics/) by Mara Bos, free to read online | [55](#threads), [56](#shared-state) |
| Async | [Asynchronous Programming in Rust](https://rust-lang.github.io/async-book/) and the [Tokio tutorial](https://tokio.rs/tokio/tutorial) | [57](#async), [60](#async-ecosystem) |
| Unsafe code | [The Rustonomicon](https://doc.rust-lang.org/nomicon/) | [36](#unsafe) to [38](#memory-layout) |
| Macros | [The Little Book of Rust Macros](https://veykril.github.io/tlborm/) | [35](#macros) |
| Performance | [The Rust Performance Book](https://nnethercote.github.io/perf-book/) | [74](#performance) |
| Command-line tools | [Command Line Applications in Rust](https://rust-cli.github.io/book/) | [73](#cli) |
| Web services | *Zero To Production in Rust* by Luca Palmieri: one service, taken all the way to a server | [64](#web) to [69](#project-api), [65](#observability) |
| Small devices | [The Embedded Rust Book](https://docs.rust-embedded.org/book/) and the documentation of Embassy | [80](#games-embedded) |
| Recipes for everyday tasks | [Rust Cookbook](https://rust-lang-nursery.github.io/rust-cookbook/) | [77](#crates) |
| Language design in depth | *Rust for Rustaceans* by Jon Gjengset, and his long video series "Crust of Rust" | [33](#advanced-traits), [34](#type-system) |
| A second complete book, more detailed | *Programming Rust* by Blandy, Orendorff and Tindall | all |
| Logs, metrics and traces in production | [OpenTelemetry for Rust](https://opentelemetry.io/docs/languages/rust/), plus the docs of [`tracing`](https://docs.rs/tracing) and [`metrics`](https://docs.rs/metrics) | [77](#crates), [60](#async-ecosystem) |
| Passwords, sessions, tokens and permissions | the [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and OWASP's [Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) sheet | [64](#web), [69](#project-api) |
| Typed calls between services (gRPC) | [`tonic`](https://docs.rs/tonic) and the [Protocol Buffers language guide](https://protobuf.dev/programming-guides/proto3/) | [60](#async-ecosystem) |
| GraphQL | [The `async-graphql` book](https://async-graphql.github.io/async-graphql/en/index.html) | [64](#web) |
| Services that talk by message | [NATS](https://docs.nats.io) or [Kafka](https://kafka.apache.org/documentation/) for the broker, and *Designing Data-Intensive Applications* by Martin Kleppmann for the ideas | [60](#async-ecosystem) |
| Many services instead of one | *Designing Data-Intensive Applications*, and the [Raft paper](https://raft.github.io) for how replicas agree | [59](#project-chat), [60](#async-ecosystem) |
| Dates, times and time zones | the [`jiff` docs](https://docs.rs/jiff), and RFC 3339 for the format on the wire | [77](#crates) |
| Server-side WebAssembly and plug-ins | [`wasmtime`](https://docs.rs/wasmtime) and [`extism`](https://docs.rs/extism) | [79](#apps) |
| Books and long-form docs for your own crate | [mdBook](https://rust-lang.github.io/mdBook/) for books, docs.rs for API reference | [70](#cargo) |
| Releasing, versioning and changelogs | [release-plz](https://release-plz.dev) for automation, [Keep a Changelog](https://keepachangelog.com) for the habit | [70](#cargo), [71](#quality-tools) |

:::tip One at a time
Do not open ten of these at once. Choose the one topic that your current project needs, read that, and return to the project.
:::

## What this guide leaves out

Every ecosystem has corners that a guide starting from zero cannot teach honestly. Rather than mention them once and move on, here they are with a reason and a direction. This is the written coverage policy of the guide: a topic is either **taught** with a compiled example, **named with advice** so that you know what to look up, or **declared out of scope** here.

| Area | Why it is out of scope | Where to go |
|---|---|---|
| Writing a full custom OS kernel from scratch (`blog_os`, Rust for Linux) | This guide teaches hardware, virtual memory, syscalls, and OS internals from user space; writing an entire bootable kernel requires a dedicated book | [Writing an OS in Rust](https://os.phil-opp.com) and *Operating Systems: Three Easy Pieces* |
| Robotics (ROS 2 bindings) | The hard part is robotics, not Rust | [`r2r`](https://docs.rs/r2r) and the ROS 2 tutorials |
| High-frequency trading and market data | Latency engineering at that level is its own discipline, and much of it is closed-source | measure first: [chapter 76](#performance) |
| Cloud-provider SDKs (`aws-sdk-*`, `azure_*`, `google-cloud-*`) | Each vendor ships its own generated SDK and its own documentation; the pattern is the same for all of them | the vendor's Rust SDK docs, and [`object_store`](https://docs.rs/object_store) for a vendor-neutral API |
| GraphQL (`async-graphql`) | Real subject with its own book. This guide names it, says when it is the right choice, and stops there rather than half-teaching it | the `async-graphql` book and [chapter 75](#cli) |

Two areas that used to be listed here are now taught in full. Blockchain and Web3 is covered by [chapter D5](#blockchain-development): Solana and Anchor, Substrate, CosmWasm, NEAR, `alloy`, consensus, wallets, bridges and DeFi. Full-screen terminal UIs are covered by [chapter D9](#devops-tooling), which builds a `ratatui` and `crossterm` interface. The [Definitive Curriculum](#roadmap) collects those thirteen domain-complete chapters.

Everything else you meet in [chapter 44](#crates) is either taught in a chapter or described with advice about when to choose it. If you find a crate that is only a name in a table, that is a gap worth reporting.

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
- A new **edition** arrives about every three years. `cargo fix --edition` does most of the moving ([chapter 32](#cargo)).
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

## People

- The **[users forum](https://users.rust-lang.org)** is the place for questions of every level, and answers there are patient.
- The official **Discord** and **Zulip** chats, and the `r/rust` forum on Reddit, are active every day.
- Many cities have a **Rust meetup**. Showing a small project there is a good first talk.
- When you are stuck, write a good question: a small program that shows the problem, the full compiler message, and what you expected to happen. Making the small program often answers the question before you send it.

## Giving back

Open-source projects need more than code. Good first contributions are a fix in the documentation of a crate after it confused you, a missing example, a test for a reported bug, or a clear bug report with a small program that shows the problem. Many projects mark suitable tasks with a label such as "good first issue". And when you have written a tool that others could use, publish it ([chapter 32](#cargo)).

:::exercise practice Write a question worth answering
Think of the last problem you could not solve. Write the forum post you would send: what you wanted, the smallest program that shows the problem, the full compiler message, and what you expected instead. Do not send it anywhere.
::hint
Four ingredients: what you tried, what happened, what you expected, and the smallest complete program that shows it. The smallest program is the part people skip, and it is the part that gets answers.
::solution
A post that gets answered looks like this:

> **Title:** `Iterator::sum` gives 0 on a `Vec<f64>` I filled in a loop
>
> I am reading numbers from a file and summing them. The count is right but the total is 0.
>
> ```rust
> fn main() {
>     let total: f64 = (0..10).map(|n| n as f64).sum();
>     println!("{total}");
> }
> ```
>
> I expected 45. I get 0. The real code adds inside a loop first and sums afterwards, which is where it differs from this sketch.

There is a good chance that writing it down solves it before you post: the act of shrinking the program is the debugging technique. Judging by the sketch, the loop that fills the vector probably produces integers and the sum is taken over an empty or shadowed binding — and you would have found that while trimming. If not, the post is now easy to answer.
:::

:::exercise challenge Return something to a crate that confused you
Find a sentence, an example or a missing type signature in the documentation of a crate you use that cost you time. Open an issue or a pull request on that crate's repository with a better wording.
::hint
Small documentation pull requests are merged quickly, and maintainers are grateful for them. Mention which version you used and paste the confusing sentence verbatim, so the maintainer does not have to search for it.
::solution
The recipe:

1. Find the documentation source. Most crates keep it in the repository as doc comments above the code, or as a `docs/` folder, not on docs.rs.
2. Edit the comment, keeping the meaning, and add the example you wish you had found.
3. Run the crate's tests locally if you can: `cargo test` also runs the examples in doc comments, so a wrong example fails there.
4. Open a pull request that says what confused you and what you changed. One sentence is enough.
5. If the repository has a `CONTRIBUTING.md`, read it first; it usually says how to sign commits and what to run.

Do this once and you are a contributor to the Rust ecosystem, which is a different relationship with the language from being a reader of it.
:::

:::quiz Check your understanding
? How often does Rust publish a new stable release?
+ Every six weeks
- Once a year
- Every three years
- Whenever the version number reaches a round number
= Rust ships a stable release every six weeks. **Editions** — batches of opt-in language changes — arrive roughly every three years, so "a new version" and "a new edition" are different events.

? Your program compiles today. A new stable release arrives. What happens to it?
- It stops compiling until you move to the new edition
- It compiles only after `cargo update`
+ It keeps compiling: stable releases are backwards compatible, and editions are opt-in
- Nothing at all, unless you also upgrade your crates
= Backwards compatibility is the promise: code that compiles on one stable release keeps compiling on later ones. Moving to a new edition is a separate, opt-in step in `Cargo.toml`, helped by `cargo fix --edition`.

? Two crates do the same job. Which signal tells you the most?
+ When it was last released, whether issues get answered, and whether the docs contain worked examples
- Which one a search engine ranks first
- The longer README
- The shorter name
= Popularity is a proxy, not evidence. A recent release, a maintainer who answers issues, and documentation with real examples tell you what the next year of your project will feel like.

? Which is the best first contribution to the ecosystem?
- Rewriting a crate's core algorithm
- Asking a maintainer to add the feature you want
- Opening an issue that says "does not work"
+ Fixing a confusing sentence in documentation that confused you an hour ago
= Start where your own confusion was. A documentation fix is small, immediately useful, and almost always welcome; the larger contributions come later, once you know the code.

? This guide says a topic is "out of scope". What does that mean in practice?
+ The topic is named with a reason and a direction, and this guide deliberately does not pretend to teach it
- The topic is only for experts
- The topic does not matter
- The topic is covered in a later edition of the guide
= The coverage policy is written down in [chapter 0](#start) and applied here: taught, named with advice, or declared out of scope. A declared gap is honest; a silent one is a trap for the reader.
:::

:::recap
- Keep a loop going: build, read good code, explain.
- Pick resources by need: the Brown edition of the book for ownership, Rustlings for compiler messages, Effective Rust and the API Guidelines for style, the specialised books for async, unsafe, concurrency and performance.
- Practise with small tasks, and learn judgement with projects that you finish.
- Update Rust regularly, read the release notes, and ask and answer questions in the community.
- A declared gap is honest, a silent one is not: this chapter lists what the guide deliberately leaves out, and where to read instead.
:::

:::checklist
- I have chosen one project that I want to build, and written down its first three steps.
- I have opened the source of one standard-library method and read it.
- I have picked one topic from the table and the resource for it.
- I have run `rustup update`.
- I have looked at the users forum or another community place.
- I have finished [the capstone project](#capstone), or planned when to do it.
:::
