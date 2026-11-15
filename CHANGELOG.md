# Changelog

All notable changes to the guide are recorded here. The version number tracks
the web application in `package.json`; the chapters themselves are content, and
they change continuously.

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
