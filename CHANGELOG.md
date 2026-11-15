# Changelog

All notable changes to the guide are recorded here. The version number tracks
the web application in `package.json`; the chapters themselves are content, and
they change continuously.

## 3.0.0 — the measured release

This is a major version not because the guide looks different, but because the
promises behind it changed shape. Until now the guide's numbers were written
down by hand and its rules were enforced by memory plus a parser. 2.2.0 added
the content lint; 3.0.0 makes the numbers impossible to drift, gives the lint
tests of its own, closes the content gaps a fresh full review measured, and
adds the two reader features that were missing rather than five that were
half-finished. No Rust example changed: this release does not touch a single
Rust code fence, so rule one — every printed output is real captured output —
is untouched. There was no Rust toolchain in the local release environment,
so the three `check.py` gates could not be run there; they run in the CI
`examples` job, and the pull request records their result from CI rather than
claiming a local pass that never happened.

### Fixed — the facts

- **The README's numbers were wrong, and nothing checked them.** It claimed
  1,308 code blocks, 991 Rust, 274 exercises and 351 quiz questions; the
  parser counted 1,329 / 1,005 / 273 / 347. `npm run stats` now prints every
  published number from the parser, the README table is generated from it,
  and the `docs/stats` lint rule fails the build when the two disagree.
- **`guide-src/CONTENT-REVIEW.md` described a release that no longer exists**
  (2,017 code blocks, 12 long sentences, spelling findings fixed in 2.2.0,
  and its finding 1, which its own correction says was a false alarm). It is
  deleted; a fresh measured review lives in `guide-src/PLAN.md`, where it
  cannot be mistaken for current truth once it ages.
- **18 chapters linked nowhere.** The lint failed on a chapter nobody linked
  *to*, but said nothing about the reverse, and 18 chapters — most of the
  systems sequence — ended in a dead end. Each now cross-references where the
  prose calls for it (50 link edits; inbound edges 1,051 → 1,135, outbound
  islands 18 → 0), and `graph/no-outgoing-link` is an error so they cannot
  come back.
- **8 project chapters had no quiz** and the lint called that a warning. Each
  project now ends with a four-question quiz on the decisions it made — why
  the names mutex is never held across an `.await`, why uniqueness lives in
  the database, why money is integer cents — with an explanation per answer
  (347 → 379 questions). `structure/project-quiz` is an error.
- **The five appendices declared no reading time**, so the published total
  silently excluded their 18,744 words counted by the structural audit. They now declare a `@time`
  measured from that prose at 200 words per minute (25/10/10/10/20), and the
  total includes them deliberately: 4,483 → 4,558 declared minutes. The
  decision is written in `PLAN.md`; the code, the README and the plan agree.
- **`what-is-rust` was the last tracked teaching chapter without a challenge
  exercise**; it has one (plan your first program: inputs, outputs, steps,
  named failures). `start` and `roadmap` stay without one — they are
  orientation. Exercises 273 → 274.
- **The glossary was a third linked: 98 of 253 terms.** Foundational words a
  beginner meets early — *borrowing*, *crate*, *array*, *argument*, *trait
  object* — existed only on the glossary page. Terms are now wrapped at their
  first substantive explanation: 211 of 253 (83%). Two automated wraps that
  landed on the wrong sense (`instruction register`, `match guard`) were
  moved by hand.
- **Eight sentences ran past 55 words** (seven at the 2.2.0 measurement, one
  more from the new cross-links). Split; the count is now zero.
- **Ten technical claims spot-checked** against the sources they rest on: the
  x86-64 `syscall` register contract (`RCX`/`R11`, fourth argument in `R10`),
  `String` at 24 bytes, `char` at 4 bytes, 64-byte cache lines, 4 KiB frames,
  the ~1,460-byte TCP MSS (and the 1,460+1,460+1,176 segmentation of 4 KiB),
  the Release/Acquire pairing guarantee, the 8 MiB main-thread stack, file
  descriptors 0/1/2, and the `i8` range. Each was correct; nothing needed
  changing, and the checks are listed here so they can be repeated.

### Added — one definition of green

- **A test suite** (`npm test`, Node's built-in runner via `tsx` — no Jest):
  a parser fixture chapter covering every block type, `auto` fill from a real
  capture, and the unknown-glossary-term warning; search ranking, prefix and
  synonym matching and snippet windows; progress arithmetic at 0%, partial
  and complete, including 2.0.0's bare-index quiz answers; and **one test per
  lint rule** that injects the fault and asserts the rule fires, beside a
  clean fixture it must stay silent on. The 2.2.0 practice — verify a rule by
  hand, once — is now permanent. 38 tests.
- **ESLint and Prettier** behind one `npm run lint`, wired into CI. New
  dev-dependencies, each needed for that command and nothing else: `eslint`
  (the runner), `@eslint/js` (its recommended rules, imported directly by the
  flat config), `typescript-eslint` (the TypeScript parser and rules),
  `prettier` (the formatter) and `eslint-config-prettier` (so the two never
  fight over style). Prettier adoption is incremental — files this release
  created or materially edited are formatted and checked; the hand-formatted
  remainder is listed in `.prettierignore`, which may only shrink. The whole
  tree was deliberately not restyled in this release.
- **Capture-orphan detection.** The lint warns on an unexpected `captured/*.txt`
  that no `auto` block references and on an `auto` block whose capture is
  missing. Three old outputs cannot be deleted under the archive rule, so
  `guide-src/captured/archived-orphans.json` records them as intentional
  historical files; they remain visible in lint information, while newly
  unreferenced outputs still warn. No captured output was changed.
- **One CI workflow.** `.github/workflows/build.yml` is now the single
  definition of green: a `guide` job on every push (deploy config, content,
  lint, tests, typecheck, build, structural audit) and an `examples` job on
  pull requests, weekly and on demand (all three `check.py` gates, keeping
  the `::error::` failure annotations and the Monday cron). The duplicate
  `guide-checks.yml` is deleted.

### Added — the missing doors

- **`/chapters`**: the URL people type now lands on the chapter index —
  grouped by part, with kind, level, declared reading time and the reader's
  own completion state on every entry. It joins the sitemap and the
  sidebar's study-tools links.
- **A site icon and a real social card.** `src/app/icon.svg` carries the
  gear-and-tick mark; `public/og.png` is redrawn in the 404 page's
  compiler-message language at 1200×630 and 61 KB (was 1424×752 at 1.2 MB,
  the wrong shape for the card it feeds). Twitter cards now use the large
  image form that matches it.
- **Search that meets the reader half-way.** Matching is whole-word first,
  then prefix — `borrow` finds *borrowing* — then substring, with a small
  documented synonym map (`mut` → *mutability*, *mutable*; `cli` → *command
  line*). Misspellings are deliberately not corrected: `asnyc` is a typo, not
  a synonym, and a wrong confident guess is worse than the suggestion list.
  One implementation still serves the API, the palette and `/search`.
- **Accessibility, from a code-level pass over the shell.** Part toggles in
  the sidebar now name the list they control (`aria-controls`), the sidebar
  search is a combobox whose `aria-activedescendant` follows the arrow keys
  with results as options, and the search buttons announce the dialog they
  open (`aria-haspopup`, `aria-expanded`). This is a list of fixes, not a
  conformance claim: no WCAG audit was run, and none is claimed. The requested
  keyboard-only walk across the five viewport widths and both themes was not
  available in this environment; a code-level review is not a substitute, so
  that manual verification remains open.
- **Progress export and import.** The dashboard downloads your progress —
  finished chapters, quiz answers, solved exercises, bookmarks, theme and
  text size — as one JSON file, and imports it on another machine. The import
  is schema-checked before anything is applied (2.0.0 bare-index answers are
  migrated), and when the browser already holds progress you choose replace
  or merge; merging keeps every local entry and adds what the file has.
  Nothing is uploaded; there is still no account and no sync.
- **"You are here" continuity.** The next-chapter card at the foot of a
  chapter now says *why* as well as *what*: the next chapter's first `@learn`
  objective, beside its title and reading time.

### Measured

- Client JavaScript for a chapter page (`/chapters/ownership`, scripts the
  prerendered page loads): 659,574 → 664,462 bytes raw (196.0 → 197.4 KiB
  gzip), +0.7% for the chapter index and export code in shared chunks, across
  the same 11 scripts. `shiki` was checked rather than assumed: no client
  chunk contains the highlighter — highlighting happens in the server
  component that renders code, and the one `shiki` string in a client chunk
  is a CSS class name.
- Build: 96 → 98 static pages (the chapter index and the icon), no warnings.

### Declined, deliberately

- **Print/PDF-friendliness** (the third reader-feature candidate) was not
  started: two features done properly outrank three done thinly, and the
  print stylesheet already drops the chrome.
- **Typo-tolerant search** beyond prefix matching: rejected above.
- **Restyling the tree with Prettier**: the config is adopted, the reformat
  is a separate, reviewable change for another release.
- New chapters, accounts, sync, scoring: out of scope, unchanged.

### Changed

- Version 3.0.0.

## 2.2.0 — the content integrity release

The guide has 88 chapters, 221,636 words, 273 exercises and 347 quiz questions,
and until now exactly one thing was checking them in CI: the parser. That meant
the *rules* — British spelling, objectives at the top, a recap at the end, a
quiz and exercises in between, links that point at something real — were held up
by memory alone. A full content review found the prose in good shape and the
guard-rail missing; this release adds the guard-rail.

### Added

- **Content lint** (`src/lib/content-lint.ts`), run by `npm run verify:content`
  in CI. It fails the build on:
  American spelling in prose, on `TODO`/`FIXME`/`TBD`/`WIP` left in visible
  text, on a tracked chapter without three learning objectives, a `:::recap`, a
  quiz or exercises, on a declared `@time` below 60% of that chapter's own
  reading time, on duplicate `@title`/`@short`/`@id`, on a chapter that no other
  chapter links to, and on a link to a chapter id or route the app does not
  serve. It prints — without failing — glossary-link coverage, cross-link count
  and the number of sentences over 55 words. Each rule was verified by injecting
  the fault and watching the build fail with `file:line`.
- **Route links.** `[label](/progress)` and `[label](/search)` in a chapter are
  parsed as in-app navigation (`next/link`, same tab, no external-link arrow)
  instead of being rendered as external links. The learning roadmap now points
  at the progress dashboard and the search page from its “using this roadmap”
  box.
- `PLAN.md` and `CONTRIBUTING.md` document the three link forms and everything
  the lint enforces.

### Fixed

- British spelling in five places that had drifted American:
  `behaviour` (×2), `initialisation` (×2 — plus the C++ RAII quotation, which is
  deliberately kept), `uninitialised` (×5), `optimisation` (×1), `licence` (×1).

### Removed

- **The duplicate progress bar.** A chapter page drew two accent bars: the
  labelled “N of 83 complete” bar in the navigation, and an unlabelled thin line
  along the bottom edge of the header that tracked scroll position. The line is
  gone — the rail already shows reading position as a ring and a percentage, so
  the header one was the only thing measuring scroll without saying so. The
  header also stops running a scroll listener; one bar, one meaning, and 60
  fewer renders a second on a long chapter.

### Changed

- Version 2.2.0.

## 2.1.0 — the wayfinding release

2.0.0 fixed where things sit on the page. 2.1.0 is about being able to get to
them: one search surface for the whole guide, a page that answers "how far am
I?", a way to mark chapters to come back to, and a theme that can follow the
operating system instead of overruling it.

### Added

- **Command palette.** Press `/`, `⌘K` or `Ctrl-K` anywhere — or use the search
  button on the home page and in the header — to get one dialog that both
  searches every heading and paragraph of the guide *and* offers the jumps you
  actually use: continue where you left off, your progress page, the learning
  roadmap, and the theme switch. `↑`/`↓` move, `Enter` opens, `Esc` closes and
  focus returns to whatever was focused before.
- **`/search`: shareable results.** The palette is quick, but a full results
  page is linkable: `/search?q=ownership` lists every matching passage grouped
  by chapter, with the matched words highlighted and suggested topics when the
  box is empty. It is `noindex, follow` — useful to a reader, noise to a
  crawler.
- **`/progress`: a real dashboard.** Chapters done, overall completion (chapters
  + quiz answers + exercises), quiz accuracy, exercises solved, bookmarks, the
  next chapter to read, chapters in progress, and everything not started yet.
  Every row can be completed, un-completed or bookmarked without opening the
  chapter.
- **Chapter bookmarks.** A bookmark button in the chapter header and next to the
  completion control, plus a bookmark list on the progress page. Bookmarks
  survive "Reset progress" — they are a reading list, not a score.
- **Light / dark / system theme.** The header button now cycles through
  *light → dark → system*; on *system* the page follows the operating system
  live, without a reload. The choice is applied by a tiny pre-paint script, so
  there is still no flash of the wrong theme.
- Quiz answers now record whether they were correct, which is what makes
  accuracy possible. Answers saved by 2.0.0 are migrated on load.

### Fixed

- **Home page no longer re-renders after hydration.** The "Continue" button used
  to appear *after* the saved chapter was read from storage, shifting the hero.
  The label, the destination and a reserved caption line now render
  identically on the server and on first paint; only the caption's text and the
  link target change once storage is read.
- **Search results cannot disagree.** Ranking, snippets and highlighting live in
  one module (`src/lib/search.ts`) shared by the API route, the palette and the
  results page.
- **Stale hits in the palette.** Results are tagged with the query they belong
  to, so pressing `Enter` while the next search is still in flight can no longer
  open a hit from the word you just typed over.
- **Tab now moves in the palette.** It used to be swallowed to keep focus in the
  field; it now walks the dialog's controls and rows and wraps at the ends, so a
  keyboard user can reach a result without the arrow keys. Arrow keys and
  `Enter` still drive the highlight from the field, and a focused row keeps its
  own native activation.
- The toast sits above the palette instead of behind it.

### Changed

- `/api/search` accepts a validated `limit` (1–60) and always answers
  `{ query, hits }`.
- The theme cycle, its wording and its type live in `src/lib/theme.ts`, shared
  by the header button and the palette, so neither can describe a different
  next step from the one the provider takes.
- Print stylesheet drops the palette, the toasts and the new controls.
- Version 2.1.0.

## 2.0.0 — the layout release

The 1.x shell positioned the chapter outline with `order` and `display`
utilities inside a flex row. Whenever the viewport dropped just below the `xl`
breakpoint — a 1280 px laptop, a browser with a visible scrollbar, a phone in
landscape — the same outline jumped to the top of the article and the sticky
header kept it pinned there while scrolling. That is gone: the outline is now a
real grid column with a single source of truth for its breakpoint.

### Fixed

- **Chapter outline is always on the right.** The chapter page is an explicit
  CSS grid (`.chapter-layout`): article first in source order, outline second.
  From 1240 px the outline occupies its own 15rem column and sticks under the
  header; below that it opens as a focus-trapped sheet from the chapter header.
  It can no longer be stacked above the prose at any width.
- **Double anchor offset.** `scroll-padding-top` and per-heading
  `scroll-margin-top` were both applied, so a `#section` jump landed ~100 px
  too low. The header height now drives one variable.
- **Off-screen drawer kept focus.** The mobile navigation used `aria-hidden`
  while still holding focusable links; it is now `inert` when closed, traps
  focus when open, restores focus on close, and locks the page without shifting
  it (`scrollbar-gutter: stable`).
- **`/` could focus an invisible input.** With the sidebar collapsed on desktop,
  the search shortcut focused a hidden field. It now re-opens the sidebar (or
  the drawer) and then focuses; `⌘K` / `Ctrl-K` work everywhere.
- **Active outline entry could scroll the page.** The rail used
  `scrollIntoView`, which also scrolls the window; it now adjusts its own
  `scrollTop`.
- **Sidebar scrollbar shift** when opening the drawer, and a sticky footer that
  could cover the last outline entry.
- **Table of contents for short chapters.** Chapters with fewer than two `h2`
  sections no longer reserve an empty column.
- **Contrast.** `--g-ink3` (11–13 px labels) was 4.28:1 on the light
  background; it is now 5.3:1, and both themes respect `prefers-contrast`.
- **Unscrollable wide content.** Code listings, tables, flame graphs and the
  memory stepper are keyboard-scrollable panes with accessible names.
- **Quiz feedback was invisible to screen readers.** Questions are now
  fieldsets with legends, results are announced, and correct/incorrect state is
  exposed in text.
- **`engines.node` warning on Vercel.** The pin was gone from `package.json`
  but survived inside `package-lock.json`: `npm install` mirrors the root
  `engines` block there, and Vercel reads it, so the build kept warning that
  `Node.js Version "26.x" will not apply`. The lockfile is resynced (2.0.0, no
  engine pin) and `npm run verify:deploy` now fails CI if either file pins a
  Node major.

### Added

- Section anchor links on every `h2`–`h4`, revealed on hover/focus.
- `ChapterTocTrigger`: a compact “On this page” sheet for tablets, phones and
  narrow windows.
- Reading progress ring in the outline, and a back-to-top control that respects
  reduced motion.
- Search: keyboard navigation (`↑`/`↓`/`Enter`), the section name in results,
  and a “Search N chapters” button on the home page.
- Per-part progress bars on the home page; two-step confirmation before erasing
  saved progress.
- Visible focus ring shared by every control, `aria-current="location"` in the
  outline, and a proper dialog role for the drawer.
- Print stylesheet: chrome is dropped, collapsed `<details>` are opened, and
  figures/tables avoid page breaks.
- `--measure`, `--rail-w`, `--shell-header` and friends as documented layout
  tokens (see “The interface” in the README).

### Changed

- Sidebar state and text size persist; the header carries a search button on
  small screens and text-size controls from `sm` up.
- Chapter header shows the part, reading time and section count in one row;
  previous/next cards gained reading times and two-line titles.
- Callouts, exercises and quizzes use one spacing scale, and disclosure
  chevrons animate on open.
- Version 2.0.0.

## 1.1.0

- Attempted fix for the outline placement (superseded by 2.0.0), version bump.

## 1.0.0

- First public release: 88 sections across 13 parts and 5 appendices, 1,300+
  code listings, 273 exercises, 347 quiz questions, 9 projects.
