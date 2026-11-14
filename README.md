# Rust from Zero

An interactive, self-study guide to Rust, from a first program through production-oriented projects. It starts with ownership and the language, then builds toward asynchronous services, databases, command-line tools, embedded development, WebAssembly, games, and desktop applications.

## What this guide covers

This guide teaches the Rust language, the standard library, Cargo, ownership, concurrency, async, testing, crates, web services, databases, command-line tools, and the habits that make a Rust project reliable. It is not a claim that every niche ecosystem is covered in depth: blockchain, kernel work, robotics, and other specialised domains are clearly marked as outside the scope of a from-zero guide. The purpose is to give you a sound foundation and then take you through complete, buildable projects.

## Open the guide

Open [`rust-guide.html`](./rust-guide.html) in a web browser. It is a self-contained file; no server or installation is required.

The guide includes plain-language explanations, runnable examples, exercises with hints and solutions, quizzes, and hands-on projects. Your reading progress and display preferences are saved in your browser. The ecosystem changes quickly; use the upstream documentation linked in the guide to confirm current versions, support, and platform requirements.

## Build from source

The editable chapters and assets are in [`guide-src/`](./guide-src/). To rebuild the HTML file, run from the repository root:

```sh
python3 guide-src/tools/build.py
```

This writes the generated `rust-guide.html` at the repository root. Edit the source chapters and assets rather than editing the generated HTML directly.

To check the generated guide structure, run `python3 guide-src/tools/audit.py`. Rust examples can be checked with `python3 guide-src/tools/check.py`; see the source plan for checker options and the extra setup needed for crate-backed examples.
