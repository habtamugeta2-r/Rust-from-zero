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
- Core path: Parts 1–4 (chapters 1–37). Essential Cargo, formatting, testing and Clippy commands are introduced in chapter 4; chapters 35–37 (`cargo`, `quality-tools`, `testing-strategies`) close Part 4 with the deeper workflow reference, before the advanced language material in Part 5 (chapters 38–43) and the systems parts that follow.
- After the core path, readers can follow goal-based routes in chapter 00 / the Home route selector (and `76-next.md`). Advanced language topics and ecosystem surveys (`74-apps`, `75-games-embedded`) remain optional deep dives.

## Tooling (not persisted between messages — reinstall if /opt/rs is missing)
- Rust toolchain lives in /opt/rs (RUSTUP_HOME=/opt/rs/rustup, CARGO_HOME=/opt/rs/cargo, `. /opt/rs/env.sh`).
  Reinstall: see `tools/setup-env.sh`.
- `python3 tools/check.py [name-part..]` compiles/runs every ```rust block (flags: run, wrap, check, test,
  fail [E0xxx], panic, warns, ext[=project], nocmp, noplay). `--ext` also cargo-checks crate examples in
  /opt/rs/ext/main (Cargo.toml copy: tools/ext-main-Cargo.toml) and runs `cargo test` for `ext test` blocks.
  `--projects` extracts every `proj=<name>` project across chapters via `tools/project.py` (including
  `finder` in chapter 23, `todo_cli` in chapter 70, `chat` in chapter 43, `shortener` in chapter 69,
  the WebAssembly/WASI targets in chapter 74, the Cortex-M3 (`thumbv7m-none-eabi`) firmware in
  chapter 75, and `library` in chapter 73) and runs `cargo check` / `cargo test`.
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

**Links** — three forms, and nothing else:
- `[label](#chapter-id)` — a chapter link. Use the id, never the number in the target; the visible
  label is renumbered for you (`[chapter 99](#errors)` becomes “chapter 23”) — and the
  `link/chapter-number` lint rule reads the raw markdown, so a stale label still fails the build.
- `[label](#home)` — the landing page. `home` is the only non-chapter name allowed after `#`.
- `[label](/progress)`, `[label](/search)`, `[label](/chapters)` — a route link: rendered with
  `next/link`, in the same tab, no external-link arrow. Allowed routes are `/`, `/chapters`,
  `/progress` and `/search` (the lint's `APP_ROUTES`).
- Anything else after `#` or a leading `/` is a `verify:content` error (a dead target, or a route
  the app does not serve), and a plain `https://…` target is an external link opened in a new tab.

## Writing rules
Audience: absolute beginners, plain short sentences, define every term at first use, analogy first, then example,
then exercises (each with hint + explained solution) and a quiz. Compare with other languages in :::compare boxes.
Every Rust example must pass tools/check.py.

British spelling throughout (`behaviour`, `initialise`, `licence`). `npm run verify:content` enforces
that plus the rest of the house style — see `../CONTRIBUTING.md` — and fails the build on any
`TODO`/`FIXME`/`TBD` left in visible text, on a tracked chapter that loses its `@learn` list, recap,
quiz or exercises, on a declared `@time` below 60% of the chapter's own reading time, on duplicate
titles/ids, on a chapter nobody links to, on a link to a chapter id or route that does not exist,
and — since 3.0.0 — on a chapter that links to no other chapter (`graph/no-outgoing-link`, the
reverse direction of the older reachability rule), on a project chapter without a quiz
(`structure/project-quiz`, an error, not a warning), and on a README statistics table that
disagrees with `npm run stats` (`docs/stats`). It warns on an unexpected `captured/*.txt` that no
`auto` block references (`capture/orphan`) and on an `auto` block whose capture is missing
(`capture/missing`). The three historical outputs listed in
`guide-src/captured/archived-orphans.json` are explicit retained exceptions; new orphans are not
exempt.

## Maintenance decisions (3.0.0)

- **Appendix reading time is included in the published total.** The five appendices declare a
  realistic `@time`, derived from their own content rather than assigned by hand: prose at 200
  words per minute, code fence bodies at 40 lines per minute, five minutes per exercise and 1.5 per
  quiz question, rounded to five minutes. Lookup appendices are floored at 1.2x their
  straight-through reading time, because a glossary or reference is skimmed section by section and
  the additive model under-counts it (glossary 30, reference 15, compiler-errors 15,
  from-other-languages 10, under-the-hood 45). The parser's `totalMinutes` sums **all** chapters,
  appendices included, and the README table follows it. Appendices still do not count as tracked
  chapters for progress.
- **Published numbers come from `npm run stats`.** The README statistics table is checked by the
  `docs/stats` lint rule; regenerating the table is pasting the output of `npm run stats`.
- **Tests are permanent.** `npm test` runs `node:test` via `tsx` over `tests/`: a parser fixture
  chapter (every block type, `auto` fill, unknown glossary term), search ranking and snippets
  (whole-word, prefix and synonym matching), progress arithmetic including 2.0.0's bare-index
  quiz answers, and one test per content-lint rule that injects the rule's fault. The 2.2.0
  practice of verifying a rule by hand once is now a test that runs in CI. Two structural tests
  guard invariants rather than rules: quiz answers must stay within 15–35% per option position,
  and `link/chapter-number` is driven through the raw-markdown path the parser cannot rewrite.
  Current total: 68 tests.
- **`npm run lint` is ESLint plus a Prettier check.** New dependencies, justified in the
  changelog: `eslint`, `@eslint/js`, `typescript-eslint`, `prettier`, `eslint-config-prettier`.
  Prettier adoption is incremental: files created or materially edited since 3.0.0 are
  formatted and checked; pre-existing hand-formatted files are listed in `.prettierignore`,
  which may only shrink.
- **CI is one workflow** (`.github/workflows/build.yml`): job `guide` on every push (deploy
  config, content, lint, tests, typecheck, build, audit) and job `examples` on pull requests,
  weekly and on demand (the three `check.py` gates, with `::error::` annotations).
- **Search matching** is whole-word, then prefix, then substring, with a documented synonym
  map in `src/lib/search.ts`. Misspellings are deliberately not corrected.
- **Reader features added in 3.0.0:** progress export/import as validated JSON (replace or
  merge, never silently) and next-chapter cards that name the next chapter's first `@learn`
  objective. Print/PDF work was not started; see the changelog's declined list.

## Content review (3.0.0, measured in this tree)

This replaces `guide-src/CONTENT-REVIEW.md`, which described 2.2.0 and is deleted:
its findings are either fixed below or were false alarms, and a stale review is
worse than none.

| Finding at 2.2.0 | State at 3.0.0 |
|---|---|
| 18 chapters with no outgoing cross-link | 0; the lint fails if one returns |
| 8 project chapters without a quiz | 9 of 9 project chapters have a 4-question quiz on their decisions |
| Glossary 98 of 253 terms linked at the 2.2.0 review | 207 of 258 in the current checkout, wrapped at the term's first substantive explanation |
| Sentences over 55 words: 7 (8 after the new links) | 0 |
| Appendices with no `@time`, excluded from the total | Each declares a measured `@time`; the total includes them |
| `what-is-rust` the only tracked teaching chapter without a challenge exercise | It has one; `start` and `roadmap` stay challenge-free as orientation |
| README statistics disagreed with the parser | The table is generated by `npm run stats` and checked by `docs/stats` |
| 104 captured files, some unreferenced | 3 historical orphan captures are retained and listed in `captured/archived-orphans.json`; unexpected orphans warn |

## Outline (file → id). [x] = written and checked

welcome:
     [x] 00-start → start
     [x] 00b-roadmap → roadmap (@kind orientation)
p1:
     [x] 01-what-is-rust → what-is-rust
     [x] 01b-hardware-architecture → hardware-architecture
     [x] 01c-bits-bytes-representation → bits-bytes-representation
     [x] 02-setup → setup
p2:
     [x] 02b-compilation-pipeline → compilation-pipeline
     [x] 02c-assembly-machine-code → assembly-machine-code
     [x] 02d-linking-elf → linking-elf
p3:
     [x] 03-variables → variables
     [x] 04-types → types
     [x] 05-functions → functions
     [x] 06-control-flow → control-flow
     [x] 07-project-guessing → project-guessing (project)
     [x] 08-memory → memory
     [x] 09-ownership → ownership
     [x] 10-borrowing → borrowing
     [x] 11-slices-strings → slices-strings
     [x] 12-structs → structs
     [x] 13-enums → enums
     [x] 14-patterns → patterns
     [x] 15-collections → collections
     [x] 16-project-todo → project-todo (project)
     [x] 17-modules → modules
     [x] 18-errors → errors
p3b:
     [x] 19-generics → generics
     [x] 20-traits → traits
     [x] 21-lifetimes → lifetimes
     [x] 22-testing → testing
     [x] 23-project-search → project-search (project)
     [x] 24-closures → closures
     [x] 25-iterators → iterators
     [x] 26-project-report → project-report (project)
     [x] 27-smart-pointers → smart-pointers
     [x] 28-advanced-traits → advanced-traits
     [x] 29-type-system → type-system
     [x] 30-cargo → cargo
     [x] 31-quality-tools → quality-tools
     [x] 32-testing-strategies → testing-strategies
p3c:
     [x] 33-macros → macros
     [x] 34-unsafe → unsafe
     [x] 35-ffi → ffi
     [x] 36-memory-layout → memory-layout
     [x] 37-rust-stdlib-internals → rust-stdlib-internals
     [x] 38-idioms → idioms
p4:
     [x] 47-virtual-memory-address-spaces → virtual-memory-address-spaces
     [x] 48-allocators-heap-internals → allocators-heap-internals
     [x] 49-pointers-safety-caches → pointers-safety-caches
p5:
     [x] 50-program-loading-startup → program-loading-startup
     [x] 51-calling-conventions-execution → calling-conventions-execution
     [x] 52-end-to-end-trace → end-to-end-trace
p6:
     [x] 53-kernel-syscalls-processes → kernel-syscalls-processes
     [x] 54-processes-threads-scheduling → processes-threads-scheduling
     [x] 55-sync-interrupts-signals → sync-interrupts-signals
p7:
     [x] 56-streams-fds-buffering → streams-fds-buffering
     [x] 57-blocking-epoll-io-uring → blocking-epoll-io-uring
p8:
     [x] 58-isa-opcodes-control-flow → isa-opcodes-control-flow
     [x] 59-pipelines-branch-prediction-ooo → pipelines-branch-prediction-ooo
     [x] 60-cache-coherency-atomics-simd → cache-coherency-atomics-simd
p9:
     [x] 39-threads → threads
     [x] 40-shared-state → shared-state
     [x] 41-async → async
     [x] 42-concurrency-async-internals → concurrency-async-internals
     [x] 43-project-chat → project-chat (project)
     [x] 46-async-ecosystem → async-ecosystem
p10:
     [x] 61-network-layers-ethernet-ip → network-layers-ethernet-ip
     [x] 62-tcp-udp-sockets-kernel → tcp-udp-sockets-kernel
     [x] 63-dns-http-tls-trace → dns-http-tls-trace
     [x] 64-web → web
     [x] 65-observability → observability
p11:
     [x] 66-storage-hardware-blocks → storage-hardware-blocks
     [x] 67-filesystems-cache-mmap → filesystems-cache-mmap
     [x] 68-databases → databases
     [x] 69-project-api → project-api (project)
p12:
     [x] 70-cli → cli (project)
     [x] 71-performance → performance
     [x] 72-linux-systems-lab → linux-systems-lab (project)
     [x] 73-capstone → capstone (project)
p13:
     [x] 44-crates → crates
     [x] 45-serde → serde
     [x] 74-apps → apps
     [x] 75-games-embedded → games-embedded
     [x] 76-next → next (@kind orientation)
app:
     [x] 90-glossary → glossary (appendix)
     [x] 91-reference → reference (appendix)
     [x] 92-errors-ref → errors-ref (appendix)
     [x] 93-from-other-languages → from-other-languages (appendix)
     [x] 94-under-the-hood → under-the-hood (appendix)
