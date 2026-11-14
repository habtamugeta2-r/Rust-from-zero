# Rust from Zero

An interactive, self-contained HTML guide teaching Rust from first principles to production services — **59 chapters** (including **8 hands-on projects** and **4 reference appendices**), **1,149 code examples**, **184 exercises** with hints and solutions, and **222 quiz questions**.

## Open the guide

Open [`rust-guide.html`](./rust-guide.html) directly in any modern browser — no server or installation is required. Reading progress, completed exercises, quiz answers, and display preferences are stored locally in your browser.

## What the guide covers

- **Part 1 — Foundations:** variables, types, functions, control flow, and a guessing game project
- **Part 2 — Ownership and Data:** memory model, ownership, borrowing, slices, structs, enums, pattern matching, collections, and a CLI to-do manager
- **Part 3 — Structure and Safety:** modules, error handling (`Result`, `thiserror`, `anyhow`), generics, traits (`use<...>` lifetime capture), lifetimes, testing, and a file-search CLI project
- **Part 4 — Functional Rust:** closures, iterators, and a streaming report generator project
- **Part 5 — Deeper Types:** smart pointers (`Box`, `Rc`, `Arc`, `RefCell`), advanced traits & GATs, typestates, and zero-cost abstractions
- **Part 6 — Concurrency & Async:** threads, channels, `Mutex`/`RwLock`/atomics (`parking_lot`, `Acquire`/`Release`), `async`/`await`, `JoinSet`, `pin-project-lite`, and a multi-user async chat server
- **Part 7 — Under the Hood:** declarative & procedural macros, `unsafe` (`ManuallyDrop`, soundness invariants), C/Python FFI (`bindgen`, `cbindgen`, `PyO3`), and memory layout
- **Part 8 — Idioms & Engineering:** idiomatic Rust, Cargo workspaces, Edition 2024, `build.rs`, `cargo-deny`, formatting/Clippy/CI, and testing strategies (`proptest`, `insta`, `criterion`, fuzzing)
- **Part 9 — Standard & Everyday Crates:** everyday crate selection (`chrono`/`jiff`, `regex`, `clap`, `tracing`), Serde serialization, and a multi-command CLI project
- **Part 10 — Real-World Domains:** Rayon & Tokio streams, gRPC (`tonic`), queues & NATS/RabbitMQ/Kafka, Axum web servers (REST/GraphQL/OpenAPI, WebSockets/SSE/multipart, auth/sessions/JWT/rate-limits, `figment`/`SecretString`, Docker & `cargo-chef`), SQLx/PostgreSQL/Redis/`redb`, observability & telemetry (`tracing`, OpenTelemetry/OTLP, Prometheus, `/health/live` vs `/health/ready`), a URL-shortener web API project, WebAssembly & desktop UI (`Leptos`, `Tauri`, `egui`, `iced`, `Slint`), and games, embedded (`no_std`, `Embassy`, `defmt`), and data/ML (`ndarray`, `Polars`)
- **Part 11 — Mastery & Capstone:** performance & profiling (`hyperfine`, `criterion`, flame graphs, `dhat`, SIMD), a full-stack CLI + Axum + SQLite library manager capstone, and curated next steps
- **Appendices:** glossary, Rust quick reference, compiler error catalog, and bridges from Python, JavaScript, Go, Java, and C/C++

## Build, audit, and verify from source

All editable source chapters and tooling live under [`guide-src/`](./guide-src/).

```sh
pip install pygments

# Check chapter formatting, metadata, exercises, and quiz structure
python3 guide-src/tools/audit.py --strict

# Rebuild rust-guide.html cleanly and fail on missing files or broken links
python3 guide-src/tools/build.py --strict

# Optional (requires Rust toolchain + Cargo): compile-check runnable Rust snippets
python3 guide-src/tools/check.py --ext
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) before editing chapters or assets — never edit `rust-guide.html` directly.

## License

Licensed under the [MIT License](./LICENSE).
