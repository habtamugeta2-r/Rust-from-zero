# Research notes: other Rust guides, and what this guide takes from them

This file records the audit of the guide and the comparison with other Rust learning resources
(November 2026). Rule for everything adopted: **the idea is taken, the text and the code are not**.
Every explanation is written in this guide's own words, and every example is new and compiled by
`tools/check.py`.

## 1. Resources consulted

Table of contents fetched with `/opt/rs/tmp/research/toc.py` (mdBook `toc.html`), pages read where noted.

| Resource | URL | What it does best | Read |
|---|---|---|---|
| The Rust Programming Language ("the book") | https://doc.rust-lang.org/book/ | The standard path through the language; three projects | contents |
| The book, Brown University edition | https://rust-book.cs.brown.edu/ | Ownership explained with *permissions* (read, write, own); case studies "fixing ownership errors"; quizzes in the text | ch. 4.2, 4.3 |
| Rust by Example | https://doc.rust-lang.org/rust-by-example/ | Short runnable examples for every feature; "std misc" (files, paths, child processes) | contents |
| Rustlings | https://github.com/rust-lang/rustlings | About 95 small broken programs to repair, in 24 topics | exercise list |
| Comprehensive Rust (Google) | https://google.github.io/comprehensive-rust/ | A course in days; deep dives on idiomatic Rust, unsafe, concurrency, bare metal | contents |
| 100 Exercises To Learn Rust | https://rust-exercises.com/100-exercises/ | One ticket system that grows through the course; error `source`, `Deref`, patching | contents |
| Easy Rust | https://dhghomon.github.io/easy_rust/ | Simple English; a tour of the standard library | contents |
| Effective Rust (David Drysdale) | https://www.lurklurk.org/effective-rust/ | 35 items of advice: types, traits, dependencies, tooling | contents |
| Rust Design Patterns | https://rust-unofficial.github.io/patterns/ | Idioms, patterns and anti-patterns | contents |
| Rust API Guidelines | https://rust-lang.github.io/api-guidelines/ | Checklist for public APIs: naming, traits, documentation, future proofing | contents |
| The Rust Performance Book (Nicholas Nethercote) | https://nnethercote.github.io/perf-book/ | Build configuration, profiling, allocations, compile times | build configuration, compile times |
| Tips for Faster Rust Compile Times (corrode) | https://corrode.dev/blog/tips-for-faster-rust-compile-times/ | A long list of ways to shorten builds | headings |
| The Rustonomicon | https://doc.rust-lang.org/nomicon/ | Unsafe Rust in depth: variance, the dot operator, uninitialised memory, implementing `Vec` | contents |
| Asynchronous Programming in Rust | https://rust-lang.github.io/async-book/ | Async concepts: cancellation, pinning, structured concurrency | contents |
| Rust Atomics and Locks (Mara Bos) | https://marabos.nl/atomics/ | Condition variables, parking, compare-and-exchange, building a spin lock, channels, `Arc` | contents |
| Learn Rust With Entirely Too Many Linked Lists | https://rust-unofficial.github.io/too-many-lists/ | Ownership learned by building linked lists: `Option<Box<Node>>`, `take`, iterators | contents |
| The Cargo Book | https://doc.rust-lang.org/cargo/ | Reference for manifests, features, profiles, workspaces | contents |
| The Edition Guide | https://doc.rust-lang.org/edition-guide/ | What changed in editions 2018, 2021 and 2024 | contents |
| The Rust Reference | https://doc.rust-lang.org/reference/ | The exact rules: operators, precedence, keywords | contents |
| Rust Cookbook | https://rust-lang-nursery.github.io/rust-cookbook/ | Recipes by task: files, processes, networking, encoding | contents |
| Command Line Applications in Rust | https://rust-cli.github.io/book/ | Output for humans and machines, exit codes, signals, packaging | contents |
| The Embedded Rust Book | https://docs.rust-embedded.org/book/ | `no_std`, registers, the layers of embedded crates | contents |
| The Little Book of Rust Macros | https://veykril.github.io/tlborm/ | `macro_rules!` patterns in depth | contents |
| Compiler error index | https://doc.rust-lang.org/error_codes/ | One page per error code | contents |

Facts taken from pages that were read (with their source):

- Brown edition, ch. 4.2: a variable has permissions on its data (read, write, own); a reference takes
  some of them away from the owner for as long as the reference is in use. Principle: data must never be
  aliased and mutated at the same time.
- Brown edition, ch. 4.3: six case studies: returning a reference to a local, changing data through
  `&`, pushing while a reference into the vector is alive, moving out of a collection, two fields of a
  tuple, two elements of an array.
- Performance Book, build configuration: `lld` is the default linker on Linux since Rust 1.90;
  `debug = "line-tables-only"`; `debug = false` can shorten dev builds by 20 to 40 %; profile settings
  of dependencies are ignored (only the workspace root counts); `lto = false` still means thin local LTO,
  `lto = "off"` disables it.
- Performance Book, compile times: `cargo build --timings`; `cargo llvm-lines`; an inner non-generic
  function keeps generic code small (the pattern of `std::fs::read`).
- corrode list: `cargo check` over `cargo build`, remove unused dependencies, disable unused features,
  split big crates, `sccache`, faster linker, `cargo nextest`, `cargo-chef` for Docker.

## 2. Audit of this guide (before the update)

Automated, over every chapter:

- `tools/check.py --nocache --ext --warn`: 508 standard-library examples and 93 crate examples compile,
  run, and match their printed output. Four examples compiled with warnings (03, 09, 12, 13); three were
  fixed, the fourth is an exercise starter that is incomplete on purpose.
- `tools/audit.py`: every chapter has the header fields, a recap, a quiz of at least 4 questions
  (chapter 05 had 3) and at least 3 exercises with hint and solution; projects have a checklist.
- `tools/build.py`: 3 broken links, all to appendices that were not written yet (`#reference`, `#errors-ref`).

Coverage against the other guides (`tools/audit.py find …`): concepts that several of them teach and
this guide did not have, or only named:

| Gap | Taught in | Goes to |
|---|---|---|
| Permissions view of borrowing; "aliased or mutated, never both" | Brown edition | 10 |
| Case studies of ownership errors with collections and fields | Brown edition | 15 |
| Partial moves | Rust by Example | 12 |
| How the dot finds a method (automatic `&`, `&mut`, `*`) | Rustonomicon, Brown edition | 12 |
| Error chains: `source()` | 100 Exercises, Zero To Production | 18 |
| `partition`, `unzip`, `find_map`, results in iterators | Rust by Example | 25 |
| A linked stack with `Option<Box<Node>>` and `take()` | Too Many Linked Lists | 27 |
| Extension traits, sealed traits, `Any` and downcasting | Comprehensive Rust, API Guidelines, Effective Rust | 28 |
| Outlives bounds, `for<'a>`, variance | Rustonomicon | 21 |
| `Condvar`, thread parking, `compare_exchange` | Rust Atomics and Locks | 31 |
| `UnsafeCell`, a spin lock built by hand, `MaybeUninit` | Rust Atomics and Locks, Rustonomicon | 35 |
| `Pin` and `Unpin` in plain words; async functions in traits | the book ch. 17, Comprehensive Rust | 32 |
| Small idioms: `transpose`, an `Option` as an iterator, `&dyn` chosen at run time, giving the argument back in the error | Rust Design Patterns | 38 |
| Conversion names `as_`, `to_`, `into_`; no `get_` | API Guidelines | 38 |
| Features must be additive; re-export types of dependencies | Effective Rust | 39 |
| Faster builds: `--timings`, linker, debug info, features, caches | Performance Book, corrode | 39 |
| Reading older Rust code: what the editions changed | Edition Guide | 39 |
| `#[inline]`, bounds checks, small vectors, looking at machine code | Performance Book | 51 |
| Running other programs (`std::process::Command`), folders and paths, broken pipes | Rust by Example, Cookbook, CLI book | 44 |
| Keywords, raw identifiers, operators and precedence, derivable traits, map of the standard library | the book (appendix), Reference, Easy Rust | 91 |
| The common compiler errors, each with cause and repair | Rustlings, error index | 92 |
| From object-oriented languages to Rust | Comprehensive Rust, the book ch. 18 | 93 |
| Where to go next (all resources above, with what each is best for) | — | 53 |

## 3. What was adopted (log)

Updated as the work goes on. `[x]` = written, compiled with `check.py`, built.

- [x] **10 borrowing** — new section "A second way to see the rules: what each name may do" (abilities read / change / give away, two tables, errors E0505 and E0502, the word *aliasing*); a fifth move in "Fighting the borrow checker": ask what would go wrong. *Idea from: Brown edition ch. 4.2.*
- [x] **12 structs** — "Fields are borrowed and moved one at a time" (field borrows, partial move E0382); box "What the dot does for you" (`Rectangle::area(&big)`); box "A method borrows the whole struct". *Ideas from: Rust by Example (partial moves), Rustonomicon (the dot operator), Brown edition ch. 4.3.*
- [x] **15 collections** — "When the borrow checker objects to a list": reference kept across a change, changing a list inside a loop over it (E0502), two elements at once (E0499) with `swap`, `split_at_mut`, `get_disjoint_mut`. *Idea from: Brown edition ch. 4.3.*
- [x] **18 errors** — "The chain of causes: `source`", a `report` function that walks the chain, `#[source]`, `{:#}` and `{:?}` of `anyhow`, box "Say each thing once". *Ideas from: 100 Exercises (5.14), Zero To Production (error chapter), Effective Rust item 4.*
- [x] **21 lifetimes** — "Three things you will meet later": `'long: 'short`, `for<'a>`, why `&mut` refuses a shorter lifetime (variance). *Idea from: Rustonomicon ch. 3.*
- [x] **25 iterators** — `partition`, `unzip`, `find_map`; two rows in the method map. *Idea from: Rust by Example "Iterating over Results".*
- [x] **27 smart pointers** — challenge exercise "A stack made of boxes" (`Option<Box<Node<T>>>`, `take`, `as_deref`, an iterator, a `Drop` that does not recurse; verified that the version without it overflows the stack). *Idea from: Too Many Linked Lists.*
- [x] **28 traits in depth** — sealed traits (E0277 with the compiler's own note), "Asking for the concrete type: `Any`", downcasting an error, box "Downcasting is a last resort". *Ideas from: API Guidelines (C-SEALED), Comprehensive Rust, Effective Rust item 19.*
- [x] **31 shared state** — "Read, decide, write: `compare_exchange`" (seat counter), "Waiting for something: `Condvar`" (a blocking queue), `thread::park`. *Idea from: Rust Atomics and Locks ch. 1 and 2.*
- [x] **32 async** — `Unpin` in the `Pin` box; async recursion with `Box::pin` (E0733). *Ideas from: the book ch. 17.5, Async Book.*
- [x] **35 unsafe** — "A lock built by hand: `UnsafeCell`" (spin lock with guard; the `Sync` restriction on the guard was verified with a compile probe), box on `MaybeUninit`. *Ideas from: Rust Atomics and Locks ch. 4, Rustonomicon ch. 5.*
- [x] **38 idioms** — "Small idioms worth knowing": build mutable then fix, `Option` as a sequence, `transpose`, `&dyn` chosen at run time, an error that gives the argument back. *Idea from: Rust Design Patterns (idioms).* (Naming rules and the checklist from the API Guidelines were already there.)
- [x] **39 cargo** — "Faster builds" (8 measures, own timings: check 4.3 s, build 6.6 s, without debug info 5.7 s, release 13.0 s; after a change 0.05 / 0.19 / 0.27 s; `--timings` report); box "Reading older code: what the editions changed". *Ideas from: Performance Book, corrode list, Edition Guide.* ("Features must only add" was already there.)
- [x] **44 cli** — "When the reader leaves early" (broken pipe, verified: `println!` panics with exit code 101, `writeln!` version exits 0); "Running other programs" (`std::process::Command`). *Ideas from: Command Line Applications in Rust, Rust by Example, Rust Cookbook.*
- [x] **51 performance** — "Smaller tools from the same box": bounds checks (own test: no difference, about 260 ns in all three versions), inlining, `smallvec`, reading machine code, profile-guided optimisation. *Idea from: Performance Book.*
- [x] Warnings removed from examples in 09, 12, 13; chapter 39 comment on `lto`; chapter 50 sentence on `delta_secs`.

## 4. Audit against the requested ecosystem scope (2026-11-14)

The workspace contains 57 existing source chapters before this update, plus the generated HTML, tools, captured compiler output, drafts and planning/research notes. The editable guide is in `chapters/` and `assets/`; the generated `rust-guide.html` is a bundle and should not be hand-edited. This table records actual depth rather than treating a mention in a comparison table as a complete tutorial.

| Area | Existing coverage | Gap after this update |
|---|---|---|
| Language and tools | Ownership, borrowing, lifetimes, traits, generics, async, macros and unsafe have dedicated chapters. Cargo, rustup, Clippy, rustfmt, rust-analyzer and Miri appear in tooling chapters. | Broadly covered, with specialist topics such as Miri's model and advanced compiler/toolchain internals better served by their primary docs. |
| Web | Axum has the deepest server walkthrough and is used by the API project. Actix Web and Rocket already had runnable route handlers; this update adds setup/run examples. Warp now has a standalone filter-based server. | Axum remains substantially deeper. The other three do not yet each have a production-scale, database-backed project, exhaustive error/middleware walkthrough and deployment track. |
| Async runtimes | Tokio has a dedicated chapter and production service examples. smol is introduced as an alternative; Embassy is covered in embedded material. | async-std is discontinued, not a recommended new-runtime track. There is no separate end-to-end smol application; runtime interoperability needs project-specific validation. |
| Databases and ORM | SQLx has extensive SQL, migrations, tests and a working SQLite service. Diesel and SeaORM have examples and comparisons. | Diesel and SeaORM do not have complete parallel projects; the SQLx project remains the reference path. |
| Serialization | Serde covers JSON, TOML and CSV, with JSON persistence in a CLI project. This update adds a MessagePack round trip and a maintenance warning for bincode. | Postcard is mapped and its use case explained, but there is no complete embedded wire-protocol project or compatibility matrix. |
| CLI | clap has a full to-do application. This update adds a Dialoguer confirmation and Indicatif progress example. | The prompt/progress sample demonstrates integration and a dry run, not a full interactive application or terminal-width/accessibility treatment. |
| Errors and logging | `Result`, `thiserror`, `anyhow` and `tracing` already have applied examples. This update adds eyre, miette and `log`/`env_logger` usage. | Advanced custom miette diagnostics and production telemetry/metrics/export pipelines remain topics for upstream references. |
| Testing and HTTP clients | Built-in tests, property testing, Mockall and Criterion have examples. reqwest has practical async requests; this update adds a synchronous ureq example. | Existing mocks and benchmarks are not expanded here into a single larger, multi-service testing project. |
| FFI and interop | C ABI, wasm-bindgen and PyO3 are covered in the FFI and applications chapters. | The examples introduce the boundaries but do not constitute a complete maintained Python package release and cross-language integration suite. |
| Embedded and no_std | no_std layers, embedded-hal, Embassy and an emulator are covered. | Hardware-specific steps vary by board. Physical-board validation and production firmware updates are outside the emulator walkthrough. |
| GUI and games | egui, iced, Bevy and a small playable game are represented with runnable or tested examples. This update adds current maturity cautions. | Packaging, long-term toolkit migrations, accessibility and platform signing are not end-to-end for each toolkit. |
| Delivery and operations | The existing guide has CI and container introductions. This update adds a release capstone with workflow, container, Nix development shell and cross-compilation steps. | Cloud-specific deployment, secret-manager setup, orchestration, real release publication, observability and disaster recovery remain operator-specific. |

### Outdated material corrected

- `async-std` documentation now explicitly says the project is discontinued and recommends migration to smol; the guide marks it as legacy rather than a new-project default.
- The current bincode crate documentation says it is unmaintained; current serialization guidance no longer recommends it for new work.
- The old `rustwasm.github.io` wasm-bindgen docs domain is no longer maintained. The chapter points to `wasm-bindgen.github.io`.
- Unsupported popularity superlatives were softened. Project use and fitness should be chosen from requirements, not benchmark or adoption claims alone.
- The plan's output paths and screenshot helper were made repository-relative instead of relying on `/home/user/rust-guide.html`.

### Sources checked for this update

The Rust Book, Reference, Rustonomicon, Rust by Example, Cargo Book and rustup documentation; the official Tokio, Axum, Actix Web, Rocket, Warp, SQLx, Diesel, SeaORM, Serde, clap, error-reporting, logging, testing, HTTP, wasm-bindgen, PyO3, embedded-hal, Embassy, egui, iced and Bevy documentation; the crates.io package metadata for version and maintenance checks; Zero To Production in Rust; Are We Web Yet?; Awesome Rust; Cross, GitHub Actions, Docker and Nix documentation. Direct links are collected in [chapter 91](./chapters/91-reference.md).

The prose and examples added for this update are original explanations and demonstrations; upstream materials are linked for verification rather than copied. Crate versions and support change independently of the Rust language. Recheck a crate's changelog, MSRV, target support, features, license and maintenance before adopting it.
