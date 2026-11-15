# Changelog

All notable changes to the guide are recorded here. The version number tracks
the web application in `package.json`; the chapters themselves are content, and
they change continuously.

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
