# Rust from Zero — maintainer's notes (chapter-format reference)

> **For readers and contributors:** the public instructions are in
> [`../README.md`](../README.md) (build, verify, style) and
> [`../CONTRIBUTING.md`](../CONTRIBUTING.md) (pull-request checklist).
> This file is the internal reference for the chapter format and the checking
> tools. Some paths here (`/opt/rs`, `/opt/pw`) describe a temporary checking
> environment that is created by `tools/setup-env.sh` and is not part of the
> repository.

Deliverable: Next.js App Router web application (`src/`) built directly from
`guide-src/chapters/*.md` and `guide-src/captured/*.txt`. Run `npm run verify:content`,
`npm run typecheck`, and `npm run build` to verify and build.

## Reader routes
- Core path: Parts 1–5 (chapters 01–26) + Part 8 Tooling (chapters 34–36). Essential Cargo, formatting, testing, and Clippy commands are introduced in chapter 02; chapters 34–36 provide the deeper workflow reference before Part 9 advanced topics (chapters 37–41).
- After the core path, readers can follow goal-based routes in chapter 00 / the Home route selector (and `53-next.md`). Advanced language topics and ecosystem surveys (`49-apps`, `50-games-embedded`) remain optional deep dives.

## Tooling (not persisted between messages — reinstall if /opt/rs is missing)
- Rust toolchain lives in /opt/rs (RUSTUP_HOME=/opt/rs/rustup, CARGO_HOME=/opt/rs/cargo, `. /opt/rs/env.sh`).
  Reinstall: see `tools/setup-env.sh`.
- `python3 tools/check.py [name-part..]` compiles/runs every ```rust block (flags: run, wrap, check, test,
  fail [E0xxx], panic, warns, ext[=project], nocmp, noplay). `--ext` also cargo-checks crate examples in
  /opt/rs/ext/main (Cargo.toml copy: tools/ext-main-Cargo.toml) and runs `cargo test` for `ext test` blocks.
  `--projects` extracts every `proj=<name>` project across chapters via `tools/project.py` (including
  chapter 23 `finder`, 33 `chat`, 44 `todo_cli`, 48 `shortener`, 49 WebAssembly/WASI targets,
  50 Cortex-M3 `thumbv7m-none-eabi`, and 52 `library`) and runs `cargo check` / `cargo test`.
  Results cached in /opt/rs/chk.
- An ```output auto / ```error auto block directly after a rust block is filled with the REAL captured
  output/compiler message (stored in captured/<hash>.txt; `lines=N` truncates). Do not use hidden `# ` lines
  in fail/panic/warns blocks (line numbers must match).
- Multi-file and target projects (`proj=<name> file=<path>`, optional `target=<t1>,<t2>`, later chunks marked
  `cont`, shown as "(continued)"): `python3 tools/project.py <chapter-prefix> <name> <outdir>` rebuilds a
  single project from its chapter, and `python3 tools/project.py --list` lists all discovered projects.
  `python3 tools/check.py --projects --strict-targets` verifies all of them in CI (also wrapped by
  `tools/check-projects.py`).
- Flag `release` on a rust block: check.py compiles it with optimisation, and Run opens the playground in release mode
  (chapter 51: timings).
- `text`/`output` blocks with a line over 100 chars soft-wrap automatically (class `soft`), unless they contain
  box-drawing characters. Force with the flag `soft`, forbid with `nosoft` (compiler messages with ^^^ markers).
- `tools/showcap.py 13 14` prints the captured `auto` texts of chapters.
- Method for long chapters with tested programs: build and test the program in /opt/rs/scratch, write the chapter
  text with @@NAME@@ markers, and fill the markers from the tested files with a small Python script.

## Reader experience (web UI)
- **Text size.** The `A−` / `A+` control in the header sets `--guide-fs` (15–24 px, saved in
  `localStorage` under `rust-guide-v1.fs`). `.guide-prose` reads that variable, and chapter
  headings are sized in `em`, so the whole chapter scales together instead of only the prose.
- **Table of contents.** `ChapterRail` lists `h2` *and* `h3` entries. From `xl` up it is a sticky
  rail beside the prose; below `xl` the same tree is a collapsed `<details>` panel above the article,
  so long chapters stay navigable on a laptop or a phone.
- **`[[term]]` pills** resolve against `90-glossary.md` at parse time. A key with no entry produces
  a `verify:content` warning and falls back to plain text: keep the glossary in sync when adding
  pills. Use `[[shown|key]]`; the key is trimmed and lowercased, and **must not contain backticks**
  (the inline-code pass runs first and breaks them).

## Chapter format (see chapters/03-variables.md for a model)
Header: @id @part @title @short @level @time @learn a | b | c   (@kind project|appendix)
Blocks: ## h2, ### h3, lists, tables, ```lang flags, :::analogy|plain|compare|warn|tip|note|key|recap Title … :::,
:::details Title, :::quiz Title (? question / - wrong / + right / = explanation), :::exercise guided|practice|challenge Title
(::hint, ::solution), :::checklist, :::stepper Title (rust code fence, then `lines | stack | heap | note` rows),
:::glossary (term :: definition) in 90-glossary.md. Inline: `code`, **bold**, *em*, [text](#chapter-id), [[term]], {{Key}}.
`[chapter 99](#id)` link labels are renumbered automatically.

## Writing rules
Audience: absolute beginners, plain short sentences, define every term at first use, analogy first, then example,
then exercises (each with hint + explained solution) and a quiz. Compare with other languages in :::compare boxes.
Every Rust example must pass tools/check.py.

## Outline (file → id). [x] = written and checked
welcome: [x] 00-start → start
p1:  [x] 01-what-is-rust → what-is-rust   [x] 02-setup → setup   [x] 03-variables → variables   [x] 04-types → types
     [x] 05-functions → functions   [x] 06-control-flow → control-flow   [x] 07-project-guessing → project-guessing (project)
p2:  [x] 08-memory → memory   [x] 09-ownership → ownership   [x] 10-borrowing → borrowing   [x] 11-slices-strings → slices-strings
p3:  [x] 12-structs → structs   [x] 13-enums → enums   [x] 14-patterns → patterns   [x] 15-collections → collections
     [x] 16-project-todo → project-todo (project)
p4:  [x] 17-modules → modules   [x] 18-errors → errors   [x] 19-generics → generics   [x] 20-traits → traits
     [x] 21-lifetimes → lifetimes   [x] 22-testing → testing   [x] 23-project-search → project-search (project)
p5:  [x] 24-closures → closures   [x] 25-iterators → iterators   [x] 26-project-report → project-report (project)
p6:  [x] 27-smart-pointers → smart-pointers   [x] 28-advanced-traits → advanced-traits   [x] 29-type-system → type-system
p7:  [x] 30-threads → threads   [x] 31-shared-state → shared-state   [x] 32-async → async   [x] 33-project-chat → project-chat (project)
p8:  [x] 34-cargo → cargo   [x] 35-quality-tools → quality-tools   [x] 36-testing-strategies → testing-strategies
p9:  [x] 37-macros → macros   [x] 38-unsafe → unsafe   [x] 39-ffi → ffi   [x] 40-memory-layout → memory-layout   [x] 41-idioms → idioms
p10: [x] 42-crates → crates (finding crates + everyday crates)   [x] 43-serde → serde   [x] 44-cli → cli (clap; project inside)
     [x] 45-async-ecosystem → async-ecosystem (Tokio, Rayon, reqwest, tower…)   [x] 46-web → web (Axum, Actix, Rocket…)
     [x] 47-databases → databases (SQLx, Diesel, SeaORM…)   [x] 48-project-api → project-api (project)
     [x] 49-apps → apps (survey: WebAssembly, Leptos/Yew/Dioxus, Tauri, egui/iced/Slint)   [x] 50-games-embedded → games-embedded (survey: Bevy, embedded, data/ML)
     [x] 54-observability → observability (tracing JSON, request IDs, OpenTelemetry, metrics, health probes)
p11:  [x] 51-performance → performance   [x] 52-capstone → capstone (project)   [x] 53-next → next (@kind orientation)
app: [x] 90-glossary → glossary (stub exists; fill with every [[term]])   [x] 91-reference → reference   [x] 92-errors-ref → errors-ref
     [x] 93-from-other-languages → from-other-languages   [x] 94-under-the-hood → under-the-hood (appendix: from source to silicon — compiler pipeline, OS loader, CPU)
