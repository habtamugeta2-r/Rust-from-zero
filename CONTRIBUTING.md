# Contributing to Rust from Zero

Thank you for helping improve the guide. All source content lives under `guide-src/`; never edit the generated `rust-guide.html` directly.

## Prerequisites

- Python 3.11+ with `pygments` (`pip install pygments`)
- A Rust toolchain (`rustup`, `rustc`, `cargo`) when adding or editing runnable Rust code examples

## Repository Layout

- `guide-src/chapters/` — Markdown chapters (`00`–`54`, appendices `90`–`93`), using the chapter `@` metadata headers and `:::` blocks documented in `guide-src/PLAN.md`.
- `guide-src/assets/` — HTML template, home page fragment, CSS, JS router/quizzes/steppers, and SVG icons.
- `guide-src/captured/` — Captured compiler diagnostics and program outputs keyed by the 16-character SHA-1 prefix of the preceding Rust fence (`check.py` populates these for `output auto` / `error auto` blocks).
- `guide-src/tools/` — Build and verification scripts:
  - `build.py` — Compiles the chapters and assets into `rust-guide.html`.
  - `audit.py` — Checks chapter metadata, required boxes (`analogy`, `compare`, `recap`, `quiz`, `exercise`, `checklist`), and missing hints/solutions.
  - `check.py` — Compiles and runs Rust fences (`run`, `wrap`, `check`, `test`, `fail`, `panic`, `warns`, and `--ext`).
  - `project.py` — Extracts multi-file projects tagged with `proj=...` into runnable Cargo directories.

## Workflow for Changes

1. Edit source files in `guide-src/chapters/` or `guide-src/assets/`.
2. If you changed or added checked Rust code blocks (`run`, `wrap`, `check`, `test`, `fail`, `panic`, `warns`, or `ext`), verify them with:

   ```sh
   python3 guide-src/tools/check.py --ext
   ```

   Do not commit `output auto` or `error auto` blocks without running `check.py` to generate their corresponding file in `guide-src/captured/`.
3. Verify structure and rebuild the HTML output:

   ```sh
   python3 guide-src/tools/audit.py --strict
   python3 guide-src/tools/build.py --strict
   ```

4. Update `README.md`, `guide-src/PLAN.md`, `sitemap.xml`, or `guide-src/assets/template.html` if chapter counts, dates, or repository layout changed.
5. Commit your changes in `guide-src/` alongside the rebuilt `rust-guide.html`.
