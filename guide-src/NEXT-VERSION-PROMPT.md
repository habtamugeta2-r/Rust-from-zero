# One-pass review & upgrade brief — v3.0.0

> **Historical note:** This brief drove the completed v3.0.0 release. Current guide statistics, part numbering (15 parts + 5 appendices), and lint rules have evolved since v3.0.0; see [`../CHANGELOG.md`](../CHANGELOG.md) and run `npm run stats` for current ground truth.

> **How to use this file.** Paste everything below the line into a fresh agent
> session (or hand it to a reviewer). It is written as an instruction set, not a
> wish list: every task has a gate you can run, and every number in "Ground
> truth" was measured on this checkout on 2026-11-15, with the command that
> reproduces it.

---

## Role

You are the maintainer of **Rust from Zero**, a 88-file interactive Rust and
systems-internals guide that ships as a Next.js 16 App Router application. The
prose lives in `guide-src/chapters/*.md`, real compiler output in
`guide-src/captured/*.txt`, the parser/highlighter/UI in `src/`, and the checking
tools in `guide-src/tools/`. Current version: **2.2.0**.

Your job in this one pass: **review the whole thing, fix what is actually wrong,
upgrade what is measurably weak, and ship it as 3.0.0** — content, tooling, CI,
interface, accessibility, documentation honesty, and the release mechanics.
Not a wish list of new features. A release you can defend line by line.

## The standard you are held to

Two rules outrank everything else in this repository:

1. **Every Rust example is compiled and run, and the output printed in the guide
   is the output that program really produced.** Never hand-type output. Never
   edit a `captured/*.txt` file to make prose agree with it. If a change breaks
   that promise, revert the change.
2. **No number in the prose or in a document is a guess.** If you write "1,329
   code blocks", you ran the tool that counts them, in this session, on this
   tree. Numbers that came from memory are bugs.

British spelling in prose. Plain-language explanations: every term defined at
first use, an analogy before the definition, a hint and a worked solution on
every exercise, an explanation on every quiz answer.

## Ground truth (measured today, with the command)

| Fact | Value | Reproduce with |
|---|---|---|
| Chapter files | 88 (83 tracked, 5 appendices, 9 projects) | `npm run verify:content` |
| Parsed code blocks | **1,329** | same |
| Rust code fences | 1,003 | `grep -ho '```rust' guide-src/chapters/*.md \| wc -l` |
| Exercises / quiz questions | 273 / 347 | `npm run verify:content` |
| Exercises with `::hint` / `::solution` | 285 hints (some repeated) / 273 solutions — **none missing** | script over fences |
| Quiz questions without an explanation | **0** | same |
| Captured outputs | 104 files, **102** `auto` blocks (2 orphans) | `ls guide-src/captured \| wc -l` |
| Glossary | 253 terms, **98** linked from prose (39%) | `npm run verify:content` |
| Inbound cross-links | 1,051 edges; 0 dead targets, 0 orphan chapters | same + link scan |
| Chapters with **no outgoing** cross-link | **18** | link scan (listed below) |
| Sentences over 55 words | **7** (the old review says 12 — stale) | `npm run verify:content` |
| `audit.py --strict` | 0 structural remarks | `python3 guide-src/tools/audit.py --strict` |
| `npm run typecheck` / `npm run build` | clean / clean, 96 static pages, ~33 s | the scripts |
| Content lint | **0 errors, 8 warnings** (the 8 project chapters have no quiz) | `npm run verify:content` |

Known drift and known gaps, verified in this checkout — these are the work:

- **README statistics are wrong.** It claims 1,308 code blocks, 991 Rust, 274
  exercises, 351 quiz questions. Reality: 1,329 / 1,003 / 273 / 347.
- **`guide-src/CONTENT-REVIEW.md` is two releases stale.** It reports 2,017 code
  blocks (996 Rust), 1,109 min reading, 12 long sentences, "6 American
  spellings open" (they were fixed in 2.2.0) and finding 1 as a real bug (it was
  a false alarm). Anyone reading it is reading fiction.
- **5 appendices declare no `@time`** while carrying ~18,700 words between them,
  so "total reading time" excludes them.
- **18 chapters are link islands:** `assembly-machine-code`, `linking-elf`,
  `rust-stdlib-internals`, `virtual-memory-address-spaces`,
  `allocators-heap-internals`, `pointers-safety-caches`,
  `program-loading-startup`, `end-to-end-trace`,
  `kernel-syscalls-processes`, `processes-threads-scheduling`,
  `streams-fds-buffering`, `blocking-epoll-io-uring`,
  `pipelines-branch-prediction-ooo`, `cache-coherency-atomics-simd`,
  `network-layers-ethernet-ip`, `tcp-udp-sockets-kernel`,
  `storage-hardware-blocks`, `filesystems-cache-mmap`. The lint only fails on
  *inbound* orphans, so nothing catches the reverse.
- **3 chapters have no `challenge` exercise** (`start`, `roadmap`,
  `what-is-rust`), and the 8 project chapters have no quiz — the lint downgrades
  this to a warning.
- **There is no test suite for `src/` at all.** No unit tests for the parser,
  the search ranking, the progress arithmetic, or the lint rules. No ESLint, no
  Prettier. 8,342 lines of TypeScript guarded by `tsc` alone.
- **CI is duplicated.** `.github/workflows/build.yml` and `guide-checks.yml`
  both run `audit.py --strict`, `check.py --ext`, `check.py --projects`,
  `verify:content`, `typecheck` and `build`. Two files, two definitions of
  green, guaranteed to disagree eventually.
- **No site icon, and `public/og.png` is 1,424×752 at 1.2 MB** — the wrong
  aspect ratio for the card, and heavy for a first-paint-unrelated asset.
- **`/chapters` (no id) 404s** — only `src/app/chapters/[id]/page.tsx` exists,
  so the obvious URL a reader types has no landing page.
- **Search is substring matching only.** No prefix/stem/typo tolerance; "borrow"
  and "borrowing" are unrelated queries. Every component (18 of 18) is
  `"use client"`.
- **2 captured files are unreferenced**; harmless, but the tools cannot tell you
  that today.

## Non-negotiables (a violation fails the release, not the task)

- Never delete anything from `guide-src/captured/`.
- Never hand-edit a captured output, a compiler message, or a line number.
- Never soften, skip or `|| true` a gate to make it green.
- Never add a dependency that the build does not need. Justify every one in the
  changelog.
- Never switch branches, never push anywhere but the current session branch.
- Do not use "simply", "just", or any unverifiable claim of "complete" /
  "every" / "all".

## Workstreams

Do all seven in this one pass. Sequence matters: fix the facts (1–2) before you
write about them (6), and get the gates green (3) before you bump the version (7).

### 1. Content: close the measured gaps

1. **Link islands (18).** Add genuine cross-references where the prose naturally
   calls for them — a forward link from the memory chapters into
   `virtual-memory-address-spaces`, from ownership into
   `allocators-heap-internals`, from networking into `tcp-udp-sockets-kernel`,
   and so on. Do not bolt on a "See also" list at the end of a chapter; a link
   belongs in a sentence that needs it. Then **add an outbound-island rule to the
   lint** (`graph/no-outgoing-link`, error) so the 18 cannot come back.
2. **Project quizzes (8 chapters).** Each project chapter gets a 4-question quiz
   on the *decisions* it made (why `Vec<String>` here, why `?` there, what
   breaks if you drop the `Mutex`), with an explanation per answer. Then promote
   `structure/project-quiz` from `warn` to `error`.
3. **Appendices: give them a realistic `@time`** and exclude or include them
   deliberately in the total. Pick one, state it in `PLAN.md`, make the code and
   the README agree.
4. **Challenges in `01-what-is-rust`** (the last tracked teaching chapter without
   a challenge). Leave `start` and `roadmap` alone — they are orientation.
5. **Glossary coverage: 98/253 → above 150.** Prioritise the foundational terms
   a beginner meets early (`borrowing`, `crate`, `array`, `argument`, `trait
   object`, `allocator`) and wrap them at their first real explanation, not at
   every mention.
6. **Long sentences (7).** Split them. They are the ones the lint already names.
7. **Spot-check correctness** on ten randomly chosen technical claims (a syscall
   number, a struct size, a cache-line count, an ordering guarantee). Fix what is
   wrong, and say in the changelog what you checked and how.

### 2. Content: make the numbers impossible to drift

The README repeats counts that nothing verifies. End that:

- Add a `stats` command (`npm run stats` or extend `verify:deploy`) that prints
  every published number from the parser: chapters, tracked, code blocks, Rust
  fences, exercises, quiz questions, captured outputs, words, minutes.
- Add a lint rule that the statistics table in `README.md` matches those numbers
  (`docs/stats`, error). Auto-generating the table is acceptable; a comment that
  says "update by hand" is not.
- Rewrite `guide-src/CONTENT-REVIEW.md` from a fresh scan, or fold its findings
  into `PLAN.md` and delete the stale file. A review dated to a version that no
  longer exists is worse than no review.

### 3. Tooling: one definition of green

- **Merge the two workflows into one** with jobs `guide` (lint, typecheck,
  build, audit — every push) and `examples` (compile/run/cargo-check/projects —
  PRs, weekly, `[examples]`). Keep the existing failure-annotation behaviour
  (`::error::` lines) and the weekly cron.
- **Add tests.** A real test runner (Node's built-in `node:test` via `tsx` is
  enough; do not add Jest) with coverage of: `guide-parser` on a fixture chapter
  (every block type, `auto` fill, unknown glossary term), `search.ts` ranking and
  snippet windows, `progress.ts` arithmetic (0%, partial, complete, migrated
  2.0.0 answers), and **one test per lint rule** asserting the rule fires on an
  injected fault and stays silent on clean input. That last one is the point:
  the 2.2.0 changelog says each rule was verified by injecting the fault, once,
  by hand. Make it permanent.
- **Add `eslint` + `prettier` with a single `npm run lint`**, wired into CI.
  Config only — do not restyle the whole tree in this release.
- **Orphan detection:** warn on a `captured/*.txt` that no `auto` block
  references, and on an `auto` block whose capture is missing (today: a warning
  at parse time only, and 2 orphans nobody sees).
- Keep `verify:deploy`, `audit.py --strict`, `check.py --ext`, `check.py
  --projects --strict-targets` exactly as strict as they are.

### 4. Interface: the missing doors

- **`/chapters` index page.** Grouped by part, with kind, level, reading time,
  and the reader's completion state. It is the URL people type; give it content.
- **Site icon and social card.** Generate `src/app/icon.svg` (or a set) and
  redraw `og.png` at 1200×630, under 300 KB. Keep the design language already in
  `not-found.tsx`.
- **Search quality.** Add prefix matching at minimum, so `borrow` finds
  *borrowing*; add a small synonym map for the terms the guide is actually
  searched for (`mut` → `mutability`, `asnyc` → `async` is a typo, not a
  synonym — decide and document). Keep `src/lib/search.ts` the single
  implementation, keep `/api/search`, the palette and `/search` agreeing, and
  extend the test file from workstream 3 to cover the new behaviour.
- **Bundle discipline.** Measure before and after. Report the first-load JS for
  `/chapters/[id]` in the changelog. If `shiki` is being loaded on pages that do
  not highlight, fix that; do not guess.
- **A11y pass with evidence.** Keyboard-only walk of home → chapter → quiz →
  exercise → palette → progress → 404, at 375/768/1024/1240/1440 px, both
  themes. Fix what fails, and list every fix. Add `aria-expanded` /
  `aria-controls` to the "4 of 50 aria attributes in an 815-line shell" gaps you
  find. Do not claim WCAG conformance you have not tested.

### 5. Reader features (small, real, one release's worth)

Pick **at most two** and do them properly:

- **Progress export/import** — a JSON download and upload so a reader can move
  machines. Must round-trip `done`, `quiz`, `saved`, `bookmarks`, `theme`, `fs`,
  survive a schema check, and never clobber newer local state without asking.
- **Per-chapter print/PDF-friendliness check** on the three longest chapters.
- **"You are here" continuity** — the next-chapter card currently shows a title
  and time; add *why* (one `@learn` objective of the next chapter).

Do not start a third. Do not add accounts, sync, or a backend.

### 6. Documentation: tell the truth in one voice

Update, and make them agree with each other and with the code:

- `README.md` — corrected statistics, the new `/chapters` route, tests and lint
  in the Verify section, one CI file not two.
- `CHANGELOG.md` — a **3.0.0** entry in the existing voice: what was wrong, what
  changed, what was measured. Say plainly why this is a major version.
- `guide-src/CONTENT-REVIEW.md` — regenerate or remove (see workstream 2).
- `guide-src/PLAN.md`, `CONTRIBUTING.md` — the new lint rules, the new lint
  command, the test runner, the appendix-time decision, the outbound-island rule.
- Anything you changed in the format gets added to the chapter-format reference
  **and** demonstrated in a chapter.

### 7. Release mechanics

- `package.json` → `3.0.0`; run `npm install` so `package-lock.json`'s root
  version follows, then `npm run verify:deploy` (it fails on drift — that is the
  point).
- One commit series with honest messages, on the current branch only.
- A PR body that lists: every user-visible change, every gate result with its
  output line, the measured before/after numbers, and what you deliberately did
  not do.

## Gates — all of these, all green, pasted into your report

```sh
npm ci
npm run verify:content                 # parser + content lint, 0 errors 0 warnings
npm run verify:deploy                  # no Node pin, lockfile version in sync
npm run lint                           # new: eslint + prettier check
npm test                               # new: parser, search, progress, one test per lint rule
npm run typecheck
npm run build                          # 96+ static pages, no warnings
python3 guide-src/tools/audit.py --strict          # "0 structural remark(s)"
python3 guide-src/tools/check.py                   # every Rust example (needs the toolchain)
python3 guide-src/tools/check.py --ext             # crate examples via cargo
python3 guide-src/tools/check.py --projects --strict-targets
```

The Rust toolchain is **not installed in a fresh sandbox** (`/opt/rs` is
created by `guide-src/tools/setup-env.sh`). If you cannot install it, say so
explicitly, mark those three gates as **not run**, and do not touch a single Rust
code fence — a change to an example without compiling it breaks rule 1.

## Definition of done

- Seven workstreams complete, or explicitly declined with a reason in the PR.
- Zero lint errors **and** zero lint warnings; every new rule has a test that
  proves it fires.
- No document in the repository states a number that the tools disagree with.
- No chapter is an inbound or outbound island; every tracked chapter has
  objectives, a recap, a quiz and exercises; every exercise has a hint and a
  solution; every quiz answer has an explanation.
- `README.md`, `CONTRIBUTING.md`, `PLAN.md`, `CHANGELOG.md` and the code describe
  the same product.
- The changelog entry is written for a reader who wants to know *why*, not *what*.

## Report format

1. **What was broken** — findings with `file:line` and the number that proves it.
2. **What changed** — by workstream, with the acceptance check that proves it.
3. **Gate results** — the literal last line of each command, or `not run` and why.
4. **Before / after** — the measurements (blocks, links, warnings, bundle, build
   time) as a table.
5. **Declined** — what you chose not to do and what it would cost.

## Out of scope for this release

New chapters or parts; a scoring/leaderboard system; accounts, sync or any
server-side storage; a native app; rewriting the layout system; adding a
component library; anything that requires deleting captured output.
