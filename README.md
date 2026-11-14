# Rust from Zero

An interactive, self-study guide that teaches Rust programming from the ground up. It is designed for beginners and progresses from basic programming concepts to real-world topics such as web APIs, databases, asynchronous programming, and systems development.

## Open the guide

Open [`rust-guide.html`](./rust-guide.html) in a web browser. It is a self-contained file; no server or installation is required.

The guide includes plain-language explanations, Rust examples checked with the Rust compiler, exercises with hints and solutions, quizzes, and hands-on projects. Your reading progress and display preferences are saved in your browser.

## Build from source

The editable chapters and assets are in [`guide-src/`](./guide-src/). To rebuild the HTML file, run from the repository root:

```sh
python3 guide-src/tools/build.py
```

This writes the generated `rust-guide.html` at the repository root. Edit the source chapters and assets rather than editing the generated HTML directly.
