# Rust from Zero

An interactive, self-study guide that teaches Rust from nothing — no previous
programming language, no computer science, no maths beyond arithmetic. It
finishes with the libraries and tools that real Rust projects are built from:
`serde`, Tokio, Clap, Axum, SQLx, Tauri, Bevy and more.

Open **[`rust-guide.html`](./rust-guide.html)** in a browser. It is one
self-contained file: no server, no installation, no network. Reading progress,
themes and search all work offline.

## What is in it

| | |
|---|---|
| Chapters | 54, including 8 complete projects, plus 4 appendices |
| Examples | 1,112 code listings, **875 of them Rust** |
| Exercises | 187, every one with a hint and a worked solution |
| Quiz questions | 229, each with an explanation of the answer |
| Captured output | 104 real compiler messages and program outputs |
| Size | 42,700 lines of source; one 4 MB HTML file |

Every chapter follows the same rhythm: the idea in plain words, an analogy, a
small example, exercises, a quiz, and a recap. Every **Rust example is compiled
and run against its printed output** by `guide-src/tools/check.py`, and the
output you see in the guide is that captured real output — not something typed
by hand. Compiler error messages are real diagnostics from a real compiler, on
the real line numbers.

The ecosystem moves faster than any book: a crate's current version, feature
flags and supported platforms belong in its own documentation, and every crate
this guide names is linked to it. Use the guide for the map and the reasons, and
upstream docs for today's exact numbers.

## What it deliberately does not cover

"The whole Rust ecosystem" is unbounded, so this guide has a written coverage
policy. Every ecosystem domain is handled in one of three ways:

- **Taught** — at least one section with a compiled example, plus an exercise or quiz;
- **Pointer** — an honest "what else exists" row or paragraph naming the
  mainstream crates, how mature they are, and when to choose them;
- **Out of scope** — declared in [chapter 53](./guide-src/chapters/53-next.md)
  with a one-line reason and somewhere else to read.

Out of scope, on purpose: blockchain and Web3 (`solana`, `anchor`), operating
system and kernel development (`blog_os`, Rust for Linux), robotics (ROS 2
bindings), high-frequency trading and financial infrastructure, and
provider-specific cloud SDKs beyond one S3-compatible example. These are real
and interesting ecosystems; they are simply not what a from-zero self-study
guide can honestly claim to teach.

## Build from source

The editable chapters and assets live in [`guide-src/`](./guide-src/). Edit the
Markdown chapters and the assets, never the generated HTML. From the repository
root:

```sh
python3 -m pip install 'pygments==2.21.0'   # the only build dependency
python3 guide-src/tools/build.py       # writes ./rust-guide.html
```

`build.py` is fast (about two seconds) and checks every internal chapter link. CI rebuilds the guide and fails if the committed `rust-guide.html` differs, so pin the version: the generated markup depends on it.

## Verify

```sh
# Structure: header fields, analogies, boxes, exercise/quiz minimums.
# Must report "0 structural remark(s)".
python3 guide-src/tools/audit.py

python3 guide-src/tools/audit.py outline    # the full table of contents
python3 guide-src/tools/audit.py terms      # every glossary term
python3 guide-src/tools/audit.py find redis # which chapters mention a word

# Compile, run and diff every Rust example (needs the Rust toolchain).
tools/setup-env.sh                          # installs it under /opt/rs
python3 guide-src/tools/check.py            # the whole guide
python3 guide-src/tools/check.py serde web  # only chapters matching a substring
python3 guide-src/tools/check.py --ext      # also cargo-check the crate examples

# Rebuild one of the multi-file projects from its chapter and test it.
python3 guide-src/tools/project.py 48 shortener /tmp/shortener
(cd /tmp/shortener && cargo test)
```

CI checks two things (see [`.github/workflows/build.yml`](./.github/workflows/build.yml)):
the build is fresh and the structure is clean on every push, and **every example
is compiled and run** — standard library and crate examples both — on every pull
request and once a week. The latest weekly run is the honest answer to "do the
examples still compile?".

## How examples are marked

Every Rust fence carries a check kind, which tells `check.py` what to prove:

`run` (compiles, runs, output must match) · `wrap` (same, for loose statements) ·
`check` (must compile) · `test` (tests must pass) · `fail` (must not compile,
optionally with a named error code) · `panic` · `warns` · `ext` (needs crates
from crates.io, checked with `cargo`) · `nocmp` (do not compare output) ·
`release` (optimised build).

An ```` ```output auto ```` or ```` ```error auto ```` block directly after a
Rust block is filled from the captured real output stored in
`guide-src/captured/`. If you change an example, re-run `check.py`; the guide
picks the new output up at the next build. [`guide-src/PLAN.md`](./guide-src/PLAN.md)
is the full reference for the chapter format.

## Contributing

Contributions are welcome. The short version:

1. **British spelling** in prose (`serialise`, `colour`, `organise`); US spelling
   only inside crate and API names.
2. **Explain every term at first use**, and prefer an analogy before a definition.
3. **Keep the chapter skeleton**: header fields (`@id`, `@part`, `@title`,
   `@short`, `@level`, `@time`, `@learn`), then idea → analogy → example →
   exercises with hint and solution → quiz → recap.
4. **Every new Rust example must pass `check.py`**, with its real captured output.
   Do not hand-write compiler messages or program output.
5. **Never edit `rust-guide.html` by hand.** Rebuild it with `build.py` and commit
   the result in the same commit as the chapters.
6. Run `python3 guide-src/tools/build.py` and `python3 guide-src/tools/audit.py`
   before opening a pull request; both must be clean.

Ideas are welcome from anywhere; the text is written for this guide. See
[`guide-src/RESEARCH.md`](./guide-src/RESEARCH.md) for the provenance of the
examples and the measured inventory.

## Licence

Prose and figures: CC BY 4.0. Code listings and tools: MIT. See
[`LICENSE`](./LICENSE).
