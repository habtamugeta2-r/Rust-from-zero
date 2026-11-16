# Rust from Zero — Systems & Internals Edition

An interactive, self-study guide that teaches both **how computers work internally** and **the Rust programming language**, starting from zero. It bridges transistors, CPU registers, compilation stages (`AST` -> `HIR` -> `MIR` -> `LLVM IR`), assembly and ELF executables, Rust language & standard-library internals, virtual memory, allocators, OS kernels, I/O (`epoll`/`io_uring`), CPU microarchitecture, concurrency/async internals, TCP/IP networking, storage filesystems, and full-stack Rust applications (`serde`, Tokio, Clap, Axum, SQLx, OpenTelemetry, Tauri, Bevy, and more).

The guide runs as a **Next.js (App Router, TypeScript, Tailwind CSS)** web
application built directly from the Markdown chapters in
[`guide-src/chapters/`](./guide-src/chapters/) and captured compiler outputs in
[`guide-src/captured/`](./guide-src/captured/). Reading progress, completed
exercises, quiz answers, themes, font size, learning-route filters, and
full-text search all work out of the box.

## What is in it

The numbers below are measured by `npm run stats` from the parser and the
chapter sources, and the `docs/stats` lint rule fails the build when this
table disagrees with that measurement.

| Published number | Count |
| --- | ---: |
| Chapters | 88 |
| Tracked chapters | 83 |
| Appendices | 5 |
| Projects | 9 |
| Code blocks | 1,329 |
| Rust code fences | 1,007 |
| Exercises | 274 |
| Quiz questions | 379 |
| Captured outputs | 104 |
| Search entries | 14,421 |
| Glossary terms | 253 |
| Glossary terms linked from prose | 253 |
| Cross-links (inbound edges) | 1,137 |
| Words of prose | 224,546 |
| Declared reading time (minutes) | 3,800 |

Exercises carry a hint and a worked solution; quiz questions carry an
explanation of the answer. Declared reading time sums the `@time` of all 88
chapters, appendices included, derived from prose word count plus exercises
and quiz questions. Stack: Next.js 16 App Router, React 19, TypeScript,
Tailwind CSS v4, Shiki.

Every chapter follows the same rhythm: the idea in plain words, an analogy,
comparison tables, runnable examples and machine-level walkthroughs, exercises,
a quiz, and a recap. Verified Rust examples are compiled and checked against
printed output by `guide-src/tools/check.py` (Rust Edition 2024).

## What the guide covers (15 Parts + 5 Appendices)

Explore the full dependency graph in the **[Complete Learning Roadmap](./guide-src/chapters/00b-roadmap.md)** (`#roadmap`) or filter by route (**Core Rust**, **Systems & internals**, **CLI tools**, **Web & APIs**, **Optional surveys**) directly on the home page:

- **Welcome (`00-start`, `00b-roadmap`):** How to study with the 10-stage systems lens, plus the complete chapter-by-chapter dependency map
- **Part 1 — Understanding computers from the inside:** why Rust exists, hardware architecture (CPU, ALU, registers, caches, DRAM, buses), bits/bytes/two's complement/IEEE-754/UTF-8/endianness, and setting up Rust + Linux inspection tools
- **Part 2 — From source code to machine instructions:** `rustc` pipeline (lexing, AST, HIR, MIR, LLVM IR), code generation, x86-64/ARM64 assembly, machine opcodes, object files, linking, and ELF segments
- **Part 3 — Rust foundations and ownership:** variables, types, functions, control flow, stack/heap memory, ownership, borrowing, slices/strings, structs, enums, patterns, collections, and two CLI projects
- **Part 4 — Modular Rust, abstractions, and tooling:** modules/crates, error handling, generics, traits, lifetimes, unit/integration testing, closures, iterators, Cargo workspaces, quality tooling (`rustfmt`/`clippy`/CI), testing strategies, and two projects
- **Part 5 — Advanced Rust, unsafe, and everyday crates:** smart pointers, advanced traits, typestate design, macros, `unsafe`, FFI, memory layout, standard-library internals (`RawVec`, `Vec`, `String`, `Box`, `RcBox`, `UnsafeCell`, `MaybeUninit`, provenance), idioms, crate selection, and Serde
- **Part 6 — Memory management and organisation:** virtual address spaces, 4-level page tables, MMU/TLB, `/proc/self/maps`, real allocators (`GlobalAlloc`, slabs, `jemalloc`/`mimalloc`, writing a bump allocator), safety bugs, and 64-byte CPU cache locality & false sharing
- **Part 7 — How programs execute:** `fork`/`execve`, `ld-linux`, GOT/PLT, `_start` to `std::rt::lang_start`, System V AMD64 vs AAPCS64 calling conventions, stack frames, and a complete 10-layer end-to-end execution trace
- **Part 8 — Operating system internals:** Ring 3 vs Ring 0, Linux `syscall` ABI, `vDSO`, processes vs threads (`clone`), EEVDF scheduling, context switching, hardware IRQs, POSIX signals, and `futex`
- **Part 9 — Input and output (I/O):** file descriptors, pipes, `BufReader`/`BufWriter`, non-blocking `EAGAIN`, `epoll`, and `io_uring`
- **Part 10 — CPU architecture and instruction execution:** CISC vs RISC ISAs, flags & `cmov`, 5-stage pipelines, branch prediction, superscalar OoO execution & Spectre, MESI coherency, store buffers, `Acquire`/`Release`, and SIMD vectorisation
- **Part 11 — Concurrency and asynchronous programming:** threads, `Arc`/`Mutex`/atomics, `async`/`.await`, async state-machine lowering, `Pin`, Tokio work-stealing scheduler, async chat server project, and Rayon/Tokio/Tower patterns
- **Part 12 — Networking and communication:** Ethernet/MAC/ARP, IPv4/IPv6/CIDR/NAT, TCP/UDP sockets, framing, congestion control, DNS, TLS 1.3, HTTP/1.1–3 packet trace, Axum web servers, and observability/OpenTelemetry
- **Part 13 — Storage and file systems:** HDD vs NAND SSD FTL/wear leveling/NVMe `blk-mq`, VFS inodes/dentries, Linux Page Cache, crash-safe `rename()`/`fsync()`, `mmap`, SQLx/Diesel/SeaORM databases, and URL-shortener API project
- **Part 14 — Practical system programming with Rust:** `clap` CLI project, performance profiling & flame graphs, a pure-Rust **Linux `/proc` & ELF64 systems inspector lab**, and the full-stack library capstone project
- **Part 15 — Applied Rust ecosystem and next steps:** WebAssembly/Tauri/GUI apps, Bevy/`no_std`/data science, and continuing paths
- **Appendices (`A`–`E`):** Searchable glossary, Rust & Linux/ABI quick reference tables, real compiler error catalogue, translation guides from Python, JS/TS, Java/C#, Go, and C/C++, and a from-source-to-silicon end-to-end compiler/OS/CPU walkthrough (`94-under-the-hood`)

## What it deliberately does not cover

"Everything in computing" is unbounded, so this guide maintains a clear coverage boundary declared in [Where to go from here](./guide-src/chapters/53-next.md): blockchain/Web3 (`solana`, `anchor`), writing a complete standalone bootable OS kernel from scratch (`blog_os`, Rust for Linux kernel drivers), robotics (`ROS 2`), high-frequency trading, and provider-specific cloud SDKs beyond S3-compatible patterns are pointed cleanly to dedicated follow-on references.

## Run locally

Requires Node.js 22.12 or newer and npm. From the repository root:

```sh
npm install
npm run dev       # start development server at http://localhost:3000
```

For a production build and server:

```sh
npm run verify:content   # validates the chapters, links & captured outputs
npm run typecheck        # TypeScript check
npm run build            # builds all routes and static chapter pages
npm start                # serves the production Next.js app on port 3000
```

The editable chapters live in [`guide-src/chapters/`](./guide-src/chapters/),
captured outputs live in [`guide-src/captured/`](./guide-src/captured/), and the
Next.js parser, syntax highlighter and UI live in [`src/`](./src/).

## Deploy to Vercel

The repository is a standard Next.js App Router project and deploys to Vercel
with no extra configuration:

```sh
npx vercel        # preview deployment
npx vercel --prod # production deployment
```

Or import the repository in the Vercel dashboard (framework preset: **Next.js**).
The `/api/search`, `/api/run`, and `/api/format` routes run as serverless
functions; the chapter pages are fully prerendered static output.

**Node.js version.** The build's Node version comes from the Vercel project
setting, so `package.json` deliberately declares **no** `engines.node` pin. An
`engines` pin overrides the project setting and makes Vercel print
`Warning: Due to "engines": { "node": "22.x" } ... Node.js Version "26.x" will
not apply`. Note that `npm install` copies the root `engines` block into
`package-lock.json`, so a lockfile written while a pin existed keeps the warning
alive after `package.json` is fixed — run `npm install --package-lock-only`
after removing a pin. `npm run verify:deploy` (also part of CI) fails if either
file pins a Node major or if the two versions drift apart. Locally, `npm install`
works on any Node from 22.12 up.

## The interface

The reading experience is built from a small, explicit layout system rather than
per-page utility soup, so every screen lines up and nothing can drift when a
component changes.

| Piece | Where | Behaviour |
|---|---|---|
| App shell | `.app-shell` (grid at `≥1024px`) | 18rem navigation column + content column; the column collapses when the sidebar is hidden |
| Chapter page | `.chapter-page` / `.chapter-layout` | One column by default; from `1240px` (or from `1024px` once the navigation is collapsed) a second `15rem` column holds the table of contents, sticky under the header |
| Reading measure | `.chapter-article` (`--measure`) | Prose is capped at 46rem (~72 characters) no matter how wide the window is |
| Section sheet | `.toc-trigger` | Below `1240px` the outline opens as a dialog from the chapter header instead of being stacked on top of the article |
| Type scale | `--guide-fs` | The A− / A+ control in the header (and in the drawer on phones) scales the prose only |
| Command palette | `CommandPalette` | `/`, `⌘K` or `Ctrl-K` opens one dialog that searches every heading and paragraph *and* offers continue / progress / roadmap / theme |
| Results page | `/search?q=` | Server-rendered, grouped by chapter, matched words highlighted, `noindex` |
| Chapter index | `/chapters` | Every chapter grouped by part, with kind, level, reading time and your completion state |
| Progress page | `/progress` | Chapters, quizzes, exercises and bookmarks in one dashboard, plus progress export/import as JSON |
| Theme | `data-theme` on `<html>` | Light, dark, or *system*; the choice is applied before first paint |
| Figures | `figure` block (`public/images/*.svg`) | A standalone `![alt](/images/name.svg "Caption")` line in a chapter; the parser fails the build if the file is missing or the alt text is empty, and the caption joins the search index |
| Callout colours | `--callout` per `data-kind` in `globals.css` | One token per kind, tint mixed from it — the eight kinds cannot drift between themes |

Geometry lives in CSS custom properties in
[`src/app/globals.css`](./src/app/globals.css): `--shell-header`,
`--shell-sidebar`, `--rail-w`, `--rail-gap`, `--page-max`, `--measure`. Sticky
offsets, anchor jumps (`scroll-padding-top`) and the rail all read from those
variables, which is why a jump never hides a heading behind the header.

### Finding things and keeping your place

Search is one implementation, not three. `src/lib/search.ts` ranks hits and cuts
snippets from the same index for the API route, the palette and the results
page, so they cannot disagree. Matching is whole-word first, then prefix (so
`borrow` finds *borrowing*), then substring, and a small synonym map expands
the abbreviations readers type (`mut` searches *mutability* and *mutable*).
Misspellings are not silently corrected; the empty-results page offers
suggested topics instead. Around it sit the things a reader needs to stay
oriented:

- **Command palette** (`src/components/CommandPalette.tsx`) — the single search
  surface, reachable from the header, the home page, or `/` and `⌘K`. Arrow keys
  move, `Enter` opens, `Esc` closes and returns focus to the trigger.
- **`/search`** — the same hits, but as a linkable page: grouped by chapter, with
  suggested topics when the query is empty.
- **`/chapters`** — the chapter index: grouped by part, with kind, level,
  reading time and your completion state on each entry.
- **`/progress`** — chapters done, overall completion, quiz accuracy, exercises
  solved, bookmarks, what to read next, and what is still untouched. Progress
  can be exported as a JSON file and imported on another machine; an import is
  validated first, and you choose whether it replaces or merges with what the
  browser already holds.
- **Next-chapter cards** — the card at the foot of a chapter names the first
  thing the next chapter teaches (its first `@learn` objective), not only its
  title and reading time.
- **Bookmarks** — a chapter can be pinned from its header or its completion card;
  bookmarks are a reading list and survive "Reset progress".

Progress, quiz answers, solved exercises, bookmarks, text size and the theme
choice live in `localStorage` under one key and are read after mount; the chapter
paint itself never waits for them.

Accessibility is part of the layout contract: one visible focus ring, a skip
link, `aria-current` on the active chapter and section, a focus-trapped drawer,
outline sheet and palette, keyboard scrolling for wide code and tables, `inert`
instead of `aria-hidden` for the off-screen drawer, reduced-motion support, and a
print stylesheet that drops every piece of chrome.

## Verify

```sh
# Content & Next.js checks:
npm run verify:content # parser + content lint (style, structure, links, reading times)
npm run verify:deploy   # no Node pin, lockfile version in sync
npm run stats           # every published number, measured from the parser
npm run lint            # ESLint + Prettier check
npm test                # parser, search, progress and lint-rule tests (node:test via tsx)
npm run typecheck
npm run build

# Structure: header fields, analogies, boxes, exercise/quiz minimums.
# Must report "0 structural remark(s)".
python3 guide-src/tools/audit.py --strict

python3 guide-src/tools/audit.py outline    # the full table of contents
python3 guide-src/tools/audit.py terms      # every glossary term
python3 guide-src/tools/audit.py find epoll # which chapters mention a word

# Compile, run and diff every Rust example (needs the Rust toolchain).
guide-src/tools/setup-env.sh                # installs it under /opt/rs
python3 guide-src/tools/check.py            # the whole guide
python3 guide-src/tools/check.py serde web  # only chapters matching a substring
python3 guide-src/tools/check.py --ext      # also cargo-check & cargo-test the crate examples
python3 guide-src/tools/check.py --projects # rebuild & test all multi-file and Wasm/no_std projects
```

`verify:content` is two gates: the parser refuses malformed chapters (unknown
glossary term, exercise without a solution, link to a chapter that does not
exist), and `src/lib/content-lint.ts` enforces the house style and teaching
structure — British spelling, no dismissive filler (`simply`/`just`/…), no `TODO`/`FIXME` in visible text, objectives +
recap + quiz + exercises on every tracked chapter (project chapters included),
declared reading times that agree with the prose, unique titles, no duplicate glossary definitions, accurate raw-markdown `[Chapter N](#id)` labels, matching `00b-roadmap.md` part headings, an entry for
every chapter in the link graph in both directions (a chapter nobody links to
and a chapter that links nowhere both fail), only the routes the app actually
serves, and a README statistics table that matches `npm run stats`. It warns
on a captured output no `auto` block references, and reports glossary-link
coverage, cross-link count and long sentences without failing on them. Every
lint rule has a permanent test in `tests/lint.test.ts` that injects its fault.

CI is one file, [`.github/workflows/build.yml`](./.github/workflows/build.yml):
the `guide` job (deploy config, content, lint, tests, typecheck, build, audit)
runs on every push, and the `examples` job **compiles and tests every verified
Rust example and extracted project** on pull requests, weekly, and on demand.

## Licence

Prose and figures: CC BY 4.0. Code listings and tools: MIT. See
[`LICENSE`](./LICENSE).
