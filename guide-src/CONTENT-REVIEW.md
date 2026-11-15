# Content review — findings

> Produced by parsing `guide-src/chapters/*.md` with the real parser
> (`src/lib/guide-parser.ts`) plus raw-text passes over the markdown, and by
> checking cross-links, spelling, structure and coverage.
>
> **Status:** examined for v2.2.0. Findings 1–3 are resolved or handled; 4–7 are
> still decisions for you. **Correction:** finding 1 was a false alarm — see below.
>
> **Verdict:** the content is in good shape. The one thing that mattered was
> tooling, not prose: nothing was guarding these rules, so they could erode
> silently.

## Resolved in v2.2.0

| Was | Now |
|---|---|
| 1. “Broken `#home` link” | **It was never broken.** `InlineRenderer` maps the `home` pseudo-id to `/` and the parser explicitly allows it, so `[home page](#home)` renders `<a href="/">`. My scan flagged it because I checked link targets against chapter ids only. The alias is now documented in `PLAN.md`/`CONTRIBUTING.md`, and the lint enforces that `home` is the *only* non-chapter `#` target. |
| 2. Six American spellings | Fixed: `behaviour` ×2, `initialisation` ×2, `uninitialised` ×5, `optimisation` ×1. The RAII quotation (“resource acquisition is initialization”) is deliberately kept American and is allow-listed in the linter. |
| — | **New:** `npm run verify:content` now lints the content (`src/lib/content-lint.ts`): British spelling, placeholder markers, per-chapter objectives/recap/quiz/exercises, declared reading time vs. prose, duplicate titles and ids, link-graph reachability, and chapter/route targets. Guard verified by injecting each fault: it fails with `file:line` and the rule name. |
| — | **New:** route links — `[your progress](/progress)` and `[search](/search)` in prose render as in-app `next/link` navigation (no new tab, no external arrow). The roadmap now uses them. |

## What is broken or inconsistent

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | **One broken internal link.** `[home page](#home)` — every `#x` target is treated as a chapter id, so this renders `/chapters/home`, which 404s (chapter routes are prerendered with `dynamicParams = false`). It is the only cross-link in the guide whose target is not a chapter. | `guide-src/chapters/00b-roadmap.md:32` | **Real bug** |
| 2 | **Six American spellings** in prose that is British English everywhere else (82 × “behaviour”, 7 × “optimise”, …): `behavior` ×2, `initialization` ×2, `initialize` ×1, `license` ×1. One of the “initialization” hits is the C++ expansion of RAII and should stay; the rest should be `behaviour`, `initialisation`, `initialise`, `licence`. | `29-type-system.md:72`, `91-reference.md:437`, `27-smart-pointers.md:220`, `41e-program-loading-startup.md:10`, `41e-program-loading-startup.md:189` | Minor |
| 3 | **The glossary is only a third linked.** 253 entries, 98 ever wrapped in term markup (`[[key|text]]`). 155 exist only on the glossary page — including foundational ones such as *borrowing, async, crate, array, argument*. A reader can meet the word in the prose and never see the definition. | `90-glossary.md` vs. all chapters | Content gap |

## Gaps worth deciding on (not defects)

| # | Finding | Numbers |
|---|---|---|
| 4 | **Eight of the nine project chapters have no quiz.** Every teaching chapter ends a recap with a quiz; the projects are assessed only by their three exercises (the ninth, the Linux systems lab, does have four questions). 75 quizzes / 347 questions otherwise. | 12, 21, 28, 31, 59, 69, 73, 76 |
| 5 | **Eighteen chapters are link islands** — no outgoing cross-reference to another chapter, though the guide has 566 links elsewhere and no chapter is unreachable. Mostly early systems chapters (06, 07) and late ecosystem ones. | 18 of 88 |
| 6 | **Twelve very long sentences** (>55 words; worst is 90, in `end-to-end-trace`). Longest paragraph is 150 words, so this is isolated. | 12 sentences |
| 7 | **Appendices declare `@time 0`** while carrying 13,700 words, so the “total reading time” (4,483 min) excludes ~69 min of appendix prose. Deliberate or not, it is the only place where declared time is not a plausible estimate. | 5 appendices |

## What is already consistent (no action)

- 88 chapters, 83 tracked, 221,636 words of prose, 1,109 min of reading, 2,017 code blocks (996 Rust), 273 exercises (75 guided / 114 practice / 84 challenge), 347 quiz questions, 532 callouts, 241 tables.
- **No placeholders**: zero `TODO`/`FIXME`/`XXX`/`TBD`/`WIP` markers in prose (“TODO” matches were the `todo!()` macro and the to-do project).
- **No structural drift**: every tracked chapter has `@learn` objectives and a `:::recap`; every exercise has a solution; numbering, titles and `@short` values are unique; `audit.py --strict` reports 0 remarks.
- **No copy-paste drift**: no 12-word phrase appears in four or more chapters.
- **Link graph is healthy**: 0 orphans, 0 broken anchors, 0 “chapter N” references that disagree with the target chapter's number; the most-linked chapters are Axum (39 inbound), Traits (32), Error handling (30).
- Declared `@time` never falls below 60% of the prose reading time.

Generated from `guide-src/chapters/*.md` (88 files, 221,636 words of prose).

## Totals

- Chapters: **88** (83 tracked, 5 appendices)
- Prose words: **221,636** → ~**1,109 min** of reading at 200 wpm (declared total: 4,483 min)
- Code blocks: **2,017** (996 Rust)
- Exercises: **273** (guided 75, practice 114, challenge 84)
- Quiz questions: **347** across 75 quizzes
- Callouts: **532**; tables 241, steppers 9, flame graphs 1
- Internal cross-links: **566** across chapters

## 1. Chapters that are missing teaching scaffolding

| chapter | file | learn | quiz Q | exercises | callouts |
|---|---|---|---|---|---|
| Map Complete Learning Roadmap | 00b-roadmap.md | 3 | 0 | 0 | 2 |
| 12 Project: a number guessing game | 07-project-guessing.md | 4 | 0 | 3 | 5 |
| 21 Project: a to-do list for the terminal | 16-project-todo.md | 4 | 0 | 3 | 4 |
| 28 Project: a file search tool | 23-project-search.md | 5 | 0 | 3 | 3 |
| 31 Project: a sales report from raw data | 26-project-report.md | 5 | 0 | 3 | 4 |
| 59 Project: a chat server | 33-project-chat.md | 5 | 0 | 3 | 3 |
| 69 Project: a link shortener with a web API a | 48-project-api.md | 6 | 0 | 3 | 7 |
| 73 Command-line tools with clap | 44-cli.md | 5 | 0 | 3 | 4 |
| 76 Project: a personal library with a web API | 52-capstone.md | 7 | 0 | 4 | 3 |
| A Glossary | 90-glossary.md | 0 | 0 | 0 | 0 |
| B Reference tables | 91-reference.md | 0 | 0 | 0 | 0 |
| C Compiler errors and how to repair them | 92-errors-ref.md | 0 | 0 | 0 | 0 |
| D Coming from another language | 93-from-other-languages.md | 0 | 0 | 0 | 0 |
| E From source to silicon: under the hood | 94-under-the-hood.md | 0 | 5 | 3 | 4 |

Chapters with no **challenge**-level exercise: 7 of 88 — 0, Map, 01, A, B, C, D

## 2. Reading time: declared vs measured

No chapter declares less time than 60% of its prose takes to read.

## 3. Longest chapters

- 60 **Concurrency in practice: Rayon, Tokio, streams, HTTP clients and tower** — 6,788 words (~34 min), 64 code blocks, 7 quiz Q
- 64 **Web servers with Axum** — 6,420 words (~32 min), 56 code blocks, 11 quiz Q
- 79 **Apps with a user interface: WebAssembly, Tauri and native windows** — 5,816 words (~29 min), 51 code blocks, 5 quiz Q
- 69 **Project: a link shortener with a web API and a database** — 5,632 words (~28 min), 50 code blocks, 0 quiz Q
- A **Glossary** — 5,510 words (~28 min), 0 code blocks, 0 quiz Q
- 74 **Performance: measure first, then improve** — 5,270 words (~26 min), 36 code blocks, 6 quiz Q
- 68 **Databases: SQL with SQLx, Diesel and SeaORM** — 5,223 words (~26 min), 49 code blocks, 7 quiz Q
- Map **Complete Learning Roadmap** — 5,029 words (~25 min), 1 code blocks, 0 quiz Q

Shortest tracked chapters:
- 52 **Instruction Sets, Encoding, Registers & Branching Hardware** — 1,253 words, 4 code blocks, 4 quiz Q, 3 exercises
- 07 **Object files, linking, and ELF executables** — 1,285 words, 10 code blocks, 4 quiz Q, 3 exercises
- 06 **Code generation, assembly language, and machine code** — 1,300 words, 13 code blocks, 4 quiz Q, 3 exercises
- 03 **Bits, bytes, binary, hex, and data and instruction representation** — 1,317 words, 12 code blocks, 4 quiz Q, 3 exercises
- 44 **Program Loading, Dynamic Linking & Startup Before main()** — 1,351 words, 5 code blocks, 4 quiz Q, 3 exercises
- 47 **The Operating System Kernel, Privilege Rings & System Calls** — 1,351 words, 3 code blocks, 4 quiz Q, 3 exercises

## 4. Spelling: American vs British

British forms found: behaviour ×82, optimise ×7, colour ×4, analyse ×4, organise ×3, summarise ×3, metre ×3, defence ×3, grey ×2, initialise ×2, modelling ×2, recognise ×2, normalise ×2, serialise ×2, judgement ×2, minimise ×1, fulfil ×1, centre ×1, artefact ×1.

American spellings in prose: **6** occurrences across 4 word forms.

| word | count | examples |
|---|---|---|
| initialization | 2 | 27-smart-pointers.md:220, 41e-program-loading-startup.md:10 |
| behavior | 2 | 29-type-system.md:72, 91-reference.md:437 |
| initialize | 1 | 41e-program-loading-startup.md:189 |
| license | 1 | 91-reference.md:437 |

## 5. Placeholder and maintenance markers

No TODO/FIXME/XXX/TBD/placeholder text anywhere in the prose.

## 6. Cross-link graph

Chapters never linked from another chapter (0):

Most linked-to chapters:
- 64 **Web servers with Axum** ← 39 inbound
- 25 **Traits: shared behaviour** ← 32 inbound
- 23 **Error handling** ← 30 inbound
- 32 **Smart pointers: `Box`, `Rc`, `RefCell` and fri** ← 29 inbound
- 70 **Cargo in depth** ← 29 inbound
- 56 **Shared state: `Arc`, `Mutex` and atomics** ← 26 inbound
- 60 **Concurrency in practice: Rayon, Tokio, streams** ← 25 inbound
- 18 **Enums, `Option` and `match`** ← 24 inbound
- 57 **Async Rust: thousands of tasks at once** ← 22 inbound
- 15 **References and borrowing** ← 20 inbound

Cross-links pointing at a chapter id that does not exist: **1** — home

Chapters with at least one outgoing cross-link: 70 of 88.
Chapters with **no** outgoing cross-link: 06, 07, 39, 41, 42, 43, 44, 46, 47, 48, 50, 51, 53, 54, 61, 62, 66, 67

“chapter N” references whose target disagrees with its number: **0**

## 7. Repetition between chapters

No 12-word phrase is shared by four or more chapters.

## 8. Readability flags

Sentences longer than 55 words: **12**
- `end-to-end-trace` (90 words): One line of Rust — code — touches every layer you have met: code turns it into MIR then LLVM IR then machine code; the linker builds an ELF file; the kernel's l…
- `kernel-syscalls-processes` (75 words): Look closely at Row 4 (code instead of code): when the CPU executes code, the hardware saves the user return address (code) into code and the user flags (code) …
- `async` (66 words): It is also the honest answer to "how is this different from the other three?": code needs an iterator of items up front and applies a map function, code turns e…
- `idioms` (61 words): Idiomatic Rust is the set of habits that make a program look like the standard library: take code and code rather than code and code, return code instead of a c…
- `roadmap` (58 words): - Subchapters: Multi-core L1/L2/L3 caches and the MESI coherency protocol; Store buffers and invalidation queues (why cores see reordered writes); Memory barrie…
- `capstone` (58 words): The capstone is the guide's only chapter that uses everything at once: a code with real dependencies, modules with privacy boundaries, enums for the domain, cod…
- `smart-pointers` (57 words): A smart pointer is a struct that owns the value it points at and adds behaviour on top: code puts a value on the heap and owns it, code/code count how many owne…
- `allocators-heap-internals` (57 words): A user-space allocator buys whole pallets of plywood (code chunks of 64 KiB or 2 MiB), saws them into standard shelf widths (16 B, 32 B, 64 B, 128 B size classe…
- `linux-systems-lab` (57 words): Watch what happens when you run that on your Linux machine: the program opens its very own executable image through the kernel's code magic symlink, reads bytes…
- `project-report` (56 words): The report project is the classic shape of a data pipeline: read rows from a file, parse them into a typed record (code per line, so bad rows become a count rat…

Paragraphs longer than 150 words: **0**

## 9. Glossary coverage

Glossary entries: **253**; referenced from prose: **98**.
Never referenced (155): aliasing, api, argument, array, ast, associated function, associated type, async, attribute, backtrace, benchmark, binary, binding, block, boolean, borrowing, bound, box, buffer, bug, build script, cancellation safety, cargo, channel, ci, cidr, clippy, clone, character, collection, compile time, concurrency, context switch, const, constant, copy, crate, crates.io, dangling pointer, data race…
Referenced terms with no glossary entry: none

## 10. Code listings

Rust blocks: 996 of 2,017 code blocks.
Languages: rust 996, output 601, text 176, error 87, toml 83, sh 37, sql 8, asm 6, html 5, js 4, tree 3, c 3, json 2, yaml 2, mir 1, llvm 1, protobuf 1, ts 1

## 11. Per-chapter table

| # | file | words | min | h2 | code | Q | ex | inbound | level |
|---|---|---|---|---|---|---|---|---|---|
| 0 | 00-start.md | 1477 | 7 | 10 | 3 | 1 | 1 | 2 | beginner |
| Map | 00b-roadmap.md | 5029 | 25 | 15 | 1 | 0 | 0 | 2 | all |
| 01 | 01-what-is-rust.md | 3001 | 15 | 10 | 2 | 4 | 3 | 6 | beginner |
| 02 | 01b-hardware-architecture.md | 1991 | 10 | 6 | 10 | 4 | 3 | 8 | beginner |
| 03 | 01c-bits-bytes-representation.md | 1317 | 7 | 6 | 12 | 4 | 3 | 6 | beginner |
| 04 | 02-setup.md | 2808 | 14 | 11 | 29 | 4 | 4 | 9 | beginner |
| 05 | 02b-compilation-pipeline.md | 1672 | 8 | 9 | 13 | 4 | 3 | 10 | beginner |
| 06 | 02c-assembly-machine-code.md | 1300 | 7 | 7 | 13 | 4 | 3 | 8 | beginner |
| 07 | 02d-linking-elf.md | 1285 | 6 | 6 | 10 | 4 | 3 | 8 | intermediate |
| 08 | 03-variables.md | 2305 | 12 | 8 | 40 | 4 | 4 | 16 | beginner |
| 09 | 04-types.md | 2931 | 15 | 11 | 42 | 5 | 4 | 15 | beginner |
| 10 | 05-functions.md | 1771 | 9 | 7 | 24 | 4 | 3 | 10 | beginner |
| 11 | 06-control-flow.md | 1766 | 9 | 7 | 36 | 4 | 3 | 11 | beginner |
| 12 | 07-project-guessing.md | 1933 | 10 | 8 | 15 | 0 | 3 | 2 | beginner |
| 13 | 08-memory.md | 2901 | 15 | 6 | 7 | 4 | 3 | 12 | beginner |
| 14 | 09-ownership.md | 2693 | 13 | 8 | 29 | 4 | 4 | 16 | beginner |
| 15 | 10-borrowing.md | 2563 | 13 | 9 | 37 | 4 | 4 | 20 | beginner |
| 16 | 11-slices-strings.md | 2181 | 11 | 8 | 34 | 5 | 4 | 14 | beginner |
| 17 | 12-structs.md | 2160 | 11 | 8 | 34 | 4 | 3 | 19 | beginner |
| 18 | 13-enums.md | 1967 | 10 | 7 | 34 | 5 | 4 | 24 | beginner |
| 19 | 14-patterns.md | 1602 | 8 | 7 | 38 | 4 | 3 | 11 | beginner |
| 20 | 15-collections.md | 2422 | 12 | 4 | 44 | 5 | 4 | 19 | beginner |
| 21 | 16-project-todo.md | 1666 | 8 | 9 | 14 | 0 | 3 | 5 | beginner |
| 22 | 17-modules.md | 2128 | 11 | 7 | 31 | 5 | 3 | 19 | intermediate |
| 23 | 18-errors.md | 2924 | 15 | 8 | 49 | 5 | 3 | 30 | intermediate |
| 24 | 19-generics.md | 1584 | 8 | 7 | 21 | 4 | 3 | 13 | intermediate |
| 25 | 20-traits.md | 2469 | 12 | 6 | 37 | 5 | 4 | 32 | intermediate |
| 26 | 21-lifetimes.md | 2962 | 15 | 9 | 33 | 5 | 4 | 12 | intermediate |
| 27 | 22-testing.md | 2315 | 12 | 8 | 21 | 5 | 3 | 14 | intermediate |
| 28 | 23-project-search.md | 1983 | 10 | 10 | 20 | 0 | 3 | 6 | intermediate |
| 29 | 24-closures.md | 1961 | 10 | 4 | 30 | 5 | 4 | 11 | intermediate |
| 30 | 25-iterators.md | 2185 | 11 | 9 | 48 | 5 | 4 | 20 | intermediate |
| 31 | 26-project-report.md | 1941 | 10 | 10 | 20 | 0 | 3 | 6 | intermediate |
| 32 | 27-smart-pointers.md | 3055 | 15 | 8 | 35 | 5 | 4 | 29 | advanced |
| 33 | 28-advanced-traits.md | 2923 | 15 | 9 | 37 | 6 | 3 | 17 | advanced |
| 34 | 29-type-system.md | 2818 | 14 | 7 | 42 | 5 | 4 | 17 | advanced |
| 35 | 37-macros.md | 2537 | 13 | 5 | 35 | 5 | 4 | 8 | advanced |
| 36 | 38-unsafe.md | 3814 | 19 | 9 | 35 | 5 | 3 | 19 | advanced |
| 37 | 39-ffi.md | 2733 | 14 | 7 | 24 | 5 | 3 | 18 | advanced |
| 38 | 40-memory-layout.md | 2702 | 14 | 9 | 31 | 5 | 3 | 17 | advanced |
| 39 | 40b-rust-stdlib-internals.md | 1742 | 9 | 8 | 15 | 4 | 3 | 6 | advanced |
| 40 | 41-idioms.md | 2799 | 14 | 10 | 37 | 5 | 4 | 12 | advanced |
| 41 | 41b-virtual-memory-address-spaces.md | 1587 | 8 | 4 | 7 | 4 | 3 | 18 | intermediate |
| 42 | 41c-allocators-heap-internals.md | 1491 | 7 | 5 | 7 | 4 | 3 | 4 | intermediate |
| 43 | 41d-pointers-safety-caches.md | 1438 | 7 | 4 | 11 | 4 | 3 | 5 | intermediate |
| 44 | 41e-program-loading-startup.md | 1351 | 7 | 5 | 5 | 4 | 3 | 5 | intermediate |
| 45 | 41f-calling-conventions-execution.md | 1749 | 9 | 6 | 11 | 4 | 3 | 8 | intermediate |
| 46 | 41g-end-to-end-trace.md | 1599 | 8 | 5 | 6 | 4 | 3 | 2 | intermediate |
| 47 | 41h-kernel-syscalls-processes.md | 1351 | 7 | 4 | 3 | 4 | 3 | 7 | intermediate |
| 48 | 41i-processes-threads-scheduling.md | 1724 | 9 | 6 | 2 | 4 | 3 | 6 | intermediate |
| 49 | 41j-sync-interrupts-signals.md | 1685 | 8 | 6 | 8 | 4 | 3 | 5 | intermediate |
| 50 | 41k-streams-fds-buffering.md | 1615 | 8 | 5 | 3 | 4 | 3 | 5 | intermediate |
| 51 | 41l-blocking-epoll-io-uring.md | 1836 | 9 | 5 | 3 | 4 | 3 | 5 | intermediate |
| 52 | 41m-isa-opcodes-control-flow.md | 1253 | 6 | 4 | 4 | 4 | 3 | 6 | intermediate |
| 53 | 41n-pipelines-branch-prediction-ooo.md | 1471 | 7 | 5 | 5 | 4 | 3 | 4 | intermediate |
| 54 | 41o-cache-coherency-atomics-simd.md | 1612 | 8 | 3 | 6 | 4 | 3 | 3 | intermediate |
| 55 | 30-threads.md | 2890 | 14 | 7 | 28 | 5 | 4 | 20 | advanced |
| 56 | 31-shared-state.md | 3287 | 16 | 9 | 31 | 5 | 4 | 26 | advanced |
| 57 | 32-async.md | 3878 | 19 | 10 | 44 | 5 | 4 | 22 | advanced |
| 58 | 32b-concurrency-async-internals.md | 1617 | 8 | 6 | 10 | 4 | 3 | 5 | intermediate |
| 59 | 33-project-chat.md | 3080 | 15 | 13 | 21 | 0 | 3 | 11 | advanced |
| 60 | 45-async-ecosystem.md | 6788 | 34 | 9 | 64 | 7 | 4 | 25 | advanced |
| 61 | 45b-network-layers-ethernet-ip.md | 1559 | 8 | 5 | 8 | 4 | 3 | 7 | intermediate |
| 62 | 45c-tcp-udp-sockets-kernel.md | 2054 | 10 | 6 | 8 | 4 | 3 | 10 | intermediate |
| 63 | 45d-dns-http-tls-trace.md | 1759 | 9 | 4 | 9 | 4 | 3 | 9 | intermediate |
| 64 | 46-web.md | 6420 | 32 | 14 | 56 | 11 | 4 | 39 | intermediate |
| 65 | 54-observability.md | 2195 | 11 | 6 | 19 | 5 | 3 | 9 | intermediate |
| 66 | 46b-storage-hardware-blocks.md | 1571 | 8 | 3 | 3 | 4 | 3 | 9 | intermediate |
| 67 | 46c-filesystems-cache-mmap.md | 1798 | 9 | 4 | 6 | 4 | 3 | 9 | intermediate |
| 68 | 47-databases.md | 5223 | 26 | 11 | 49 | 7 | 4 | 16 | intermediate |
| 69 | 48-project-api.md | 5632 | 28 | 13 | 50 | 0 | 3 | 12 | advanced |
| 70 | 34-cargo.md | 3983 | 20 | 12 | 30 | 7 | 3 | 29 | intermediate |
| 71 | 35-quality-tools.md | 2241 | 11 | 7 | 23 | 5 | 3 | 13 | intermediate |
| 72 | 36-testing-strategies.md | 2496 | 12 | 12 | 16 | 5 | 3 | 14 | advanced |
| 73 | 44-cli.md | 3496 | 17 | 8 | 37 | 0 | 3 | 15 | intermediate |
| 74 | 51-performance.md | 5270 | 26 | 8 | 36 | 6 | 3 | 20 | intermediate |
| 75 | 51b-linux-systems-lab.md | 1522 | 8 | 7 | 15 | 4 | 3 | 3 | intermediate |
| 76 | 52-capstone.md | 1723 | 9 | 13 | 28 | 0 | 4 | 4 | advanced |
| 77 | 42-crates.md | 3079 | 15 | 6 | 28 | 5 | 3 | 12 | intermediate |
| 78 | 43-serde.md | 2528 | 13 | 8 | 29 | 5 | 4 | 18 | intermediate |
| 79 | 49-apps.md | 5816 | 29 | 6 | 51 | 5 | 3 | 8 | intermediate |
| 80 | 50-games-embedded.md | 4439 | 22 | 3 | 35 | 5 | 3 | 8 | intermediate |
| 81 | 53-next.md | 2285 | 11 | 9 | 1 | 5 | 5 | 3 | all |
| A | 90-glossary.md | 5510 | 28 | 0 | 0 | 0 | 0 | 3 | all |
| B | 91-reference.md | 782 | 4 | 12 | 8 | 0 | 0 | 5 | all |
| C | 92-errors-ref.md | 2081 | 10 | 11 | 59 | 0 | 0 | 3 | all |
| D | 93-from-other-languages.md | 794 | 4 | 8 | 2 | 0 | 0 | 2 | all |
| E | 94-under-the-hood.md | 3762 | 19 | 14 | 10 | 5 | 3 | 20 | advanced |
