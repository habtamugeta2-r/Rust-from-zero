@id devops-tooling
@part def
@title DevOps, Tooling and Best Practices
@short DevOps and tooling
@level intermediate
@time 100
@learn Structure workspaces, features, profiles and build scripts deliberately | Build derive, attribute and function-like procedural macros | Write CLI and TUI tools, and test them at every level | Run lint, format, docs, coverage, mocking and property tests in CI | Build minimal images, reproducible releases and cross-compiled binaries

The difference between a Rust project that ages well and one that becomes
unmaintainable is usually tooling. Cargo is a build system, package manager,
workspace manager and feature resolver; `clippy`, `rustfmt`, `rustdoc`, `insta`
and `proptest` are part of the everyday loop; Docker, Nix and `cargo-dist`
decide what ships. This chapter is the operational handbook. The library's
[cargo chapter](#cargo), [quality-tools chapter](#quality-tools) and
[testing-strategies chapter](#testing-strategies) supply more depth on each
tool; chapter D4 covers the service runtime side.

:::analogy A workshop with labelled drawers
A good workshop does not make you a better craftsperson, but a missing label
costs ten minutes every time. Cargo workspaces label the crates; features label
the optional parts; profiles label the build intent; CI labels the checks that
must pass. The craft is still the code, but the drawers decide how much of the
day is spent searching.
:::

:::compare Scripts, Make and Cargo
A shell script is quick to write and impossible to type-check; Make tracks file dependencies but knows nothing about Rust semantics. Cargo understands the crate graph, features, targets and profiles, and `xtask` puts repeatable project automation in Rust with the same types and tests as the product. Use Cargo plus `xtask` for anything the team runs more than once; keep shell for one-line glue.
:::


## 9.1 Cargo deep dive: workspaces, features, profiles, `[patch]` and `[replace]`

A **workspace** is a set of packages sharing one lock file, dependency graph and
`target/` directory. It keeps versions aligned and builds shared dependencies
once.

```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "3"
members = ["crates/api", "crates/core", "crates/cli"]

[workspace.package]
version = "0.3.0"
edition = "2024"
license = "MIT OR Apache-2.0"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
core = { path = "crates/core" }
```

```toml
# crates/api/Cargo.toml
[package]
name = "api"
version.workspace = true
edition.workspace = true

[dependencies]
serde.workspace = true
tokio.workspace = true
core.workspace = true
```

**Features** are additive, must not be mutually exclusive, and should be named
for capabilities, not implementations. `default-features = false` keeps the
dependency tree small. The resolver v2/v3 unifies features per target and
platform; a feature that changes behaviour is a semver hazard.

```toml
[features]
default = ["json"]
json = ["dep:serde_json"]
tls = ["dep:rustls", "dep:tokio-rustls"]

[dependencies]
serde_json = { version = "1", optional = true }
```

**Profiles** tune optimisation and debug information. `dev` favours compile
speed; `release` favours runtime; a custom profile can favour size.

```toml
[profile.dev]
opt-level = 0
debug = 1

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
debug = "line-tables-only"
strip = "debuginfo"

[profile.release-fast]
inherits = "release"
lto = "fat"
```

`[patch]` overrides a dependency with another source for the whole workspace,
typically a local checkout while fixing a bug. `[replace]` is the older,
per-package form and is deprecated; prefer `[patch]`.

```toml
[patch.crates-io]
serde = { git = "https://github.com/serde-rs/serde", branch = "master" }
```

Remember to remove a patch before release: a path or git override is not
published with your crate, and CI without the checkout will fail.

## 9.2 Build scripts: code generation, linking and environment

A `build.rs` runs on the host before the crate is compiled. It can generate
Rust source into `OUT_DIR`, compile C/C++, set linker arguments and emit
`cargo:` directives. It must be deterministic and should avoid network access.

```rust
// build.rs
use std::{env, fs, path::PathBuf};

fn main() {
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let version = env::var("CARGO_PKG_VERSION").unwrap_or_default();

    let generated = format!(
        "pub const VERSION: &str = {version:?};\n\
         pub const BUILT_AT: &str = {timestamp:?};\n",
        timestamp = option_env!("SOURCE_DATE_EPOCH").unwrap_or("unknown"),
    );
    fs::write(out.join("build_info.rs"), generated).expect("write build info");

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=proto/");
    println!("cargo:rustc-env=APP_BUILD_VERSION={version}");
}
```

```rust
// src/lib.rs
include!(concat!(env!("OUT_DIR"), "/build_info.rs"));
```

Directives worth knowing: `rerun-if-changed` (otherwise Cargo reruns on any
file change), `rerun-if-env-changed`, `rustc-env`, `rustc-link-lib`,
`rustc-link-search`, `rustc-link-arg`, `rustc-cfg` (only with a build script
that checks the compiler) and `warning`. Build scripts run with the host
toolchain, so cross-compiling C code needs a target-aware `cc` configuration.
Reproducible builds require no timestamps, no absolute paths and no network.

## 9.3 Procedural macro development

A procedural macro is a function from a token stream to a token stream, compiled
into a `proc-macro` crate. There are three kinds: **derive**, **attribute** and
**function-like**. `syn` parses the input; `quote` builds the output;
`proc-macro2` provides a testable token type.

```toml
[lib]
proc-macro = true

[dependencies]
proc-macro2 = "1"
quote = "1"
syn = { version = "2", features = ["full"] }
```

```rust
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput};

#[proc_macro_derive(Describe, attributes(describe))]
pub fn describe(input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as DeriveInput);
    let name = &item.ident;
    let text = item
        .attrs
        .iter()
        .find(|attr| attr.path().is_ident("describe"))
        .and_then(|attr| attr.parse_args::<syn::LitStr>().ok())
        .map(|literal| literal.value())
        .unwrap_or_else(|| name.to_string());

    quote! {
        impl #name {
            pub fn describe(&self) -> &'static str {
                #text
            }
        }
    }
    .into()
}

#[proc_macro_attribute]
pub fn timed(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let function = parse_macro_input!(item as syn::ItemFn);
    let name = &function.sig.ident;
    let block = &function.block;
    let output = quote! {
        fn #name() {
            let start = std::time::Instant::now();
            #block
            eprintln!("{} took {:?}", stringify!(#name), start.elapsed());
        }
    };
    output.into()
}

#[proc_macro]
pub fn sum_literals(input: TokenStream) -> TokenStream {
    let values = parse_macro_input!(input as syn::LitInt);
    let value = values.base10_parse::<u64>().unwrap_or(0);
    quote!(#value).into()
}
```

Rules for usable macros: emit `compile_error!` with `syn::Error::to_compile_error`
and a span pointing at the offending token; keep generated identifiers hygienic
(use `format_ident!` with a unique prefix or `Span::mixed_site`); do not assume a
specific field order; document every attribute; and add `trybuild` tests for
success and failure cases. `syn` 2 changed many APIs (`parse_quote!`, `Punctuated`,
`Attribute::path`). For attribute macros that transform async functions, use
`async-trait` or a carefully tested `syn` visitor; preserving spans is what makes
errors readable.

## 9.4 CLI applications with `clap` and `bpaf`

`clap` v4's derive API is the standard: typed arguments, generated help, shell
completion and validation.

```rust
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "notes", version, about = "A small note manager")]
struct Cli {
    /// Directory that holds the notes.
    #[arg(long, default_value = "notes", env = "NOTES_DIR")]
    dir: PathBuf,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Create a note.
    Add {
        #[arg(required = true)]
        title: String,
        #[arg(short, long, default_value = "")]
        body: String,
    },
    /// List notes, newest first.
    List {
        #[arg(short, long, default_value_t = 20)]
        limit: usize,
    },
}

fn main() {
    let cli = Cli::parse();
    println!("{cli:?}");
}
```

`#[arg(env = ...)]` reads the environment, `value_parser!` adds range and
enum parsing, and `ArgGroup` expresses conflicts. `bpaf` is a combinator
alternative with a smaller API and excellent error messages; `lexopt` is a
minimal parser for tiny tools. Whatever the parser, follow Unix conventions:
`--help` exits 0, `--version` prints a version, errors go to stderr with exit
code 2, normal output goes to stdout, and a tool composes with pipes. Use
`anstream`/`anstyle` for colour that disables itself when not a terminal, and
`indicatif` for progress on long operations.

## 9.5 TUI applications with `ratatui`, `crossterm` and `console`

A terminal UI is a state machine that renders a frame on every event. `ratatui`
provides widgets and layout; `crossterm` provides the terminal backend and
events.

```rust
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    widgets::{Block, Borders, Paragraph},
    Frame, Terminal,
};
use std::io::stdout;

fn draw(frame: &mut Frame, count: u64) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(0)])
        .split(frame.area());
    frame.render_widget(Paragraph::new(format!("count: {count}")).block(Block::default().borders(Borders::ALL)), chunks[0]);
    frame.render_widget(Paragraph::new("press q to quit, space to count").block(Block::default().borders(Borders::ALL)), chunks[1]);
}

fn main() -> std::io::Result<()> {
    enable_raw_mode()?;
    let mut out = stdout();
    execute!(out, EnterAlternateScreen)?;
    let mut terminal = Terminal::new(CrosstermBackend::new(out))?;
    let mut count = 0_u64;

    loop {
        terminal.draw(|frame| draw(frame, count))?;
        if let Event::Key(key) = event::read()? {
            match key.code {
                KeyCode::Char('q') => break,
                KeyCode::Char(' ') => count += 1,
                _ => {}
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}
```

Restore the terminal on every exit path, including panics: install a panic hook
that leaves the alternate screen and disables raw mode. Render on a fixed tick
(60 Hz or 10 Hz) and coalesce input; a TUI that redraws per byte wastes CPU.
`console` provides styling and terminal detection for non-full-screen output.
Test the pure state transitions separately from the rendering.

## 9.6 Testing: unit, integration, doc and snapshot

- **Unit tests** live beside the code in `#[cfg(test)] mod tests` and can access
  private items.
- **Integration tests** live in `tests/` and use only the public API.
- **Doc tests** compile examples in documentation, which keeps the docs honest.
- **Snapshot tests** with `insta` compare rendered output or values against
  stored snapshots and offer a review workflow.

```rust
/// Adds two numbers.
///
/// ```
/// assert_eq!(demo::add(2, 3), 5);
/// ```
pub fn add(a: u64, b: u64) -> u64 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_small_numbers() {
        assert_eq!(add(2, 3), 5);
    }
}
```

```rust
#[test]
fn renders_a_receipt() {
    let receipt = format_receipt(&[("tea", 2), ("cake", 3)]);
    insta::assert_snapshot!(receipt);
}
```

Run `cargo insta review` to accept or reject changed snapshots; commit the
`.snap` files. For CLI tools, `assert_cmd` and `predicates` test the binary's
stdout, stderr and exit code; `trybuild` tests that a macro rejects bad input
with the expected message. Keep tests fast and deterministic: no network, fixed
clocks, seeded random generators, and a temporary directory per test. A test
that passes only on one machine is a future outage.

## 9.7 Property-based testing with `proptest` and `quickcheck`

Example-based tests check one input; property tests check thousands and shrink a
failure to a minimal case. State the invariant, not the implementation.

```rust
use proptest::prelude::*;

fn encode(value: &str) -> String {
    value.replace('%', "%25").replace(' ', "%20")
}

fn decode(value: &str) -> String {
    value.replace("%20", " ").replace("%25", "%")
}

proptest! {
    #[test]
    fn round_trip(input in ".*") {
        prop_assert_eq!(decode(&encode(&input)), input);
    }

    #[test]
    fn never_panics(a in any::<u64>(), b in any::<u64>()) {
        let _ = a.checked_add(b);
    }
}
```

`proptest` generates strategies, shrinks failures and persists regressions in
`proptest-regressions/`. `quickcheck` is the older, simpler alternative.
Properties worth writing: round trips, idempotence, invariants (`len <= capacity`,
`sum >= 0`), equivalence with a reference implementation, and "does not panic".
Property tests are especially valuable for parsers, arithmetic, state machines
and serialisation.

## 9.8 Mocking with `mockall`, `wiremock` and `httpmock`

Rust's traits make mocking explicit. `mockall` generates a mock struct from a
trait; `wiremock` starts an HTTP server with canned responses; `httpmock` does
the same with a different API.

```rust
#[cfg_attr(test, mockall::automock)]
trait Clock {
    fn now_ms(&self) -> u64;
}

fn is_expired(clock: &dyn Clock, expires_at: u64) -> bool {
    clock.now_ms() > expires_at
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_uses_the_clock() {
        let mut clock = MockClock::new();
        clock.expect_now_ms().returning(|| 1_000);
        assert!(is_expired(&clock, 999));
    }
}
```

```rust
#[tokio::test]
async fn client_handles_500() {
    use wiremock::{matchers::method, Mock, MockServer, ResponseTemplate};

    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;

    let client = reqwest::Client::new();
    let response = client.get(server.uri()).send().await.unwrap();
    assert_eq!(response.status(), 500);
}
```

Mock the boundary you own (a trait), not every internal function. A test that
mocks the database verifies the query building, not the SQL; add an integration
test against a real database (or a container) for that. Prefer a fake
implementation for complex collaborators and a mock for verifying calls.

## 9.9 Code coverage with `cargo-tarpaulin` and `grcov`

Coverage tells you which lines were executed, not whether the assertions are
meaningful. Still, an uncovered error path is a bug waiting to happen.

```sh
cargo install cargo-tarpaulin
cargo tarpaulin --workspace --out Lcov --output-dir coverage

# Or LLVM source-based coverage (more accurate, needs llvm-tools):
rustup component add llvm-tools-preview
export RUSTFLAGS="-C instrument-coverage"
cargo test
grcov . --binary-path target/debug/deps -s . -t lcov --branch \
  --ignore-not-existing -o coverage/lcov.info
```

`cargo-tarpaulin` is convenient on Linux; `cargo-llvm-cov` wraps LLVM coverage
and works well across platforms. Upload `lcov.info` to Codecov or Coveralls.
Set a floor for new code rather than a global percentage; a high coverage
number with weak assertions is worse than a lower one with strong properties.
Coverage does not measure async interleavings, concurrency or `unsafe` soundness
(use Miri and Loom for those).

## 9.10 Linting with Clippy and custom lints via `dylint`

Clippy has lint groups: `correctness` (on by default), `suspicious`, `style`,
`complexity`, `perf`, `pedantic`, `nursery`, `cargo`, `restriction`. Enable
groups explicitly in the crate root, and allow individual lints with a reason.

```rust
#![warn(clippy::pedantic)]
#![allow(clippy::module_name_repetitions, reason = "domain names are clearer")]

fn main() {
    let values = vec![1, 2, 3];
    let total: i32 = values.iter().sum();
    println!("{total}");
}
```

```toml
# clippy.toml
msrv = "1.85"
too-many-arguments-threshold = 8
```

```sh
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

In CI, `-D warnings` turns every lint into an error. Keep the toolchain pinned so
a new lint does not break the build unannounced. `cargo-dylint` runs custom lints
packaged as dynamic libraries, useful for organisation-specific rules (no
`unwrap` in production paths, no direct `std::process::Command`). Write a lint
only when a rule is mechanical and repeated; otherwise a review comment is
cheaper.

## 9.11 Formatting with `rustfmt` and `dprint`

`rustfmt` is the canonical formatter; `dprint` formats Markdown, JSON, YAML and
TypeScript with a fast native binary. A formatting check in CI prevents
style-only diffs from consuming review time.

```toml
# rustfmt.toml
edition = "2024"
max_width = 100
use_field_init_shorthand = true
imports_granularity = "Crate"   # nightly-only; omit on stable
```

```sh
cargo fmt --all -- --check
rustfmt +nightly file.rs        # nightly options
dprint check
```

`imports_granularity` and `group_imports` are nightly-only; a stable project
should not depend on them. Format on save, run `cargo fmt` before committing, and
add a `.git-blame-ignore-revs` entry for a mass formatting commit so blame stays
useful.

## 9.12 Documentation with rustdoc, mdBook and intra-doc links

Documentation is part of the API. `rustdoc` compiles doc tests, resolves
intra-doc links and renders examples; `mdBook` builds a book from Markdown and
can embed/runnable examples.

```rust
/// Splits a slice at an index, returning both halves.
///
/// # Panics
/// Panics if `index > values.len()`.
///
/// # Examples
/// ```
/// let (left, right) = demo::split(&[1, 2, 3], 1);
/// assert_eq!(left, &[1]);
/// assert_eq!(right, &[2, 3]);
/// ```
pub fn split<T>(values: &[T], index: usize) -> (&[T], &[T]) {
    values.split_at(index)
}
```

```toml
[package.metadata.docs.rs]
all-features = true
rustdoc-args = ["--cfg", "docsrs"]
```

Use `///` for items, `//!` for modules/crates, and link types with
`[`Vec`]`-style intra-doc links (verify with `cargo doc --document-private-items`
and `RUSTDOCFLAGS="-D warnings"`). Document panics, errors, safety contracts and
examples. `cargo doc --open` previews; docs.rs builds every published crate.
For a user guide, `mdBook` with `mdbook test` for Rust examples and
`mdbook-linkcheck` for links. Keep the README short and point to the book.

## 9.13 CI/CD pipelines with GitHub Actions and GitLab CI

A Rust CI should run: format check, clippy, tests (all features and no default
features), doc build, MSRV check, and a release build. Cache the Cargo registry
and `target/` with a key that includes `Cargo.lock`.

```yaml
name: ci
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all -- --check
      - run: cargo clippy --workspace --all-targets --all-features -- -D warnings
      - run: cargo test --workspace --all-features
      - run: cargo test --workspace --no-default-features
      - run: RUSTDOCFLAGS="-D warnings" cargo doc --workspace --no-deps
```

Add a matrix for the MSRV (`1.85`, `stable`, `beta`), the target triple, and the
feature combinations that matter. Run `cargo hack --feature-powerset` if features
interact. Cache aggressively but invalidate on `Cargo.lock` changes. Keep CI
under ten minutes for the fast path; move slow fuzzing, coverage and cross
builds to scheduled or labelled jobs. GitLab uses `.gitlab-ci.yml` with
`cache:key:files: [Cargo.lock]` and a Rust image. Pin actions by SHA for
security (chapter D6).

## 9.14 Docker: multi-stage builds and minimal images

A Rust binary in a `scratch` or `distroless` image is small and has a tiny
attack surface. Build in a full image, copy only the binary and its runtime
dependencies.

```dockerfile
# syntax=docker/dockerfile:1
FROM rust:1.85-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/app/target \
    cargo build --release --locked && \
    cp target/release/api /tmp/api

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /tmp/api /usr/local/bin/api
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/api"]
```

Use `scratch` only for fully static `musl` binaries; use `distroless/cc` when
glibc or OpenSSL is needed; use `alpine` when you need a shell for debugging and
accept musl. Multi-stage caching with BuildKit mounts avoids recompiling all
dependencies on every source change. Never copy `.cargo/credentials`, source or
test fixtures into the runtime image. Run as a non-root user, set a read-only
root filesystem where possible, and pin base images by digest.

## 9.15 Nix integration and reproducible builds

Nix builds from a pure function of the dependency graph: pinned sources, exact
compiler and native libraries, no network in the sandbox. `naersk` and
`crane` build Rust crates efficiently with Cargo caching.

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    crane.url = "github:ipetkov/crane";
  };

  outputs = { self, nixpkgs, flake-utils, crane }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        craneLib = crane.mkLib pkgs;
        src = craneLib.cleanCargoSource ./.;
      in {
        packages.default = craneLib.buildPackage {
          inherit src;
          nativeBuildInputs = [ pkgs.pkg-config ];
          buildInputs = [ pkgs.openssl ];
        };
      });
}
```

`nix develop` gives every contributor the same toolchain; `nix build` produces a
bit-reproducible artefact when the inputs are pure. The costs are a steep
learning curve and a large store. `cargo vendor` plus a pinned toolchain file
(`rust-toolchain.toml`) is a lighter path to reproducible CI. Set
`SOURCE_DATE_EPOCH`, strip absolute paths and avoid build-time timestamps
(section 9.2).

## 9.16 Release automation: `cargo-release`, `cargo-dist` and `cargo-changelog`

```toml
# release.toml
sign-commit = false
consolidate-commits = true
pre-release-replacements = [
  { file = "README.md", search = "version = \"[0-9.]+\"", replace = "version = \"{{version}}\"" },
]
```

```sh
cargo install cargo-release cargo-dist cargo-changelog --locked
cargo release patch --execute
cargo dist init --ci github
cargo dist build --artifacts all
```

`cargo-release` bumps versions, updates lock files and tags; `cargo-dist` builds
installers and GitHub release artefacts for Linux, macOS and Windows; `cargo-
changelog` (or `git-cliff`) generates a changelog from conventional commits.
Publish with trusted publishing/OIDC rather than a long-lived crates.io token
where supported. Tag immutably and attach checksums plus an SBOM (chapter D6).

## 9.17 Dependency management

```sh
cargo tree -d                 # duplicate versions
cargo tree --edges build,proc-macro
cargo outdated                # newer versions
cargo add serde --features derive
cargo remove reqwest
cargo update -p serde --precise 1.0.200
cargo deny check
```

Keep `Cargo.lock` in version control for binaries and applications; libraries
usually omit it (crates.io ignores it), but CI should test the latest compatible
versions and the MSRV. Review `cargo tree` diffs in pull requests, avoid
wildcard versions, and use `=1.2.3` only for a known-bad release. `cargo-machete`
finds unused dependencies; `cargo-udeps` is more precise on nightly. Prefer one
version of a major dependency across the workspace via `[workspace.dependencies]`.

## 9.18 Binary size optimisation

```toml
[profile.release]
opt-level = "z"        # or "s" for a balance
lto = "fat"
codegen-units = 1
panic = "abort"
strip = "symbols"
```

Further tools: `cargo-bloat` (largest functions), `cargo-llvm-lines` (generic
bloat), `twiggy` (Wasm size), `bloaty`. Remove unused features and default
features, avoid `format!` in cold paths (formatting machinery is large), prefer
`core::fmt` alternatives or `ufmt`, and replace heavy dependencies with smaller
ones. `panic = "abort"` removes landing pads but changes behaviour: no unwinding,
so `catch_unwind` does not catch. Measure every change; a 5% size reduction that
doubles compile time may not be worth it for a server.

## 9.19 Cross-compilation with `cross`, `zig cc` and `cargo-zigbuild`

```sh
cargo install cross --locked
cross build --target aarch64-unknown-linux-musl --release

cargo install cargo-zigbuild
rustup target add aarch64-unknown-linux-gnu
cargo zigbuild --target aarch64-unknown-linux-gnu --release
```

`cross` runs the build in a container with the target's libc and linker;
`cargo-zigbuild` uses Zig's bundled libc and linker without a container.
`musl` targets produce static binaries; `gnu` targets need a matching glibc or
an older baseline (`*-gnu.2.28` with zigbuild). Test the artefact on the target
or under `qemu-user`; compiling is not running. Chapter D3 covers targets,
linker scripts and embedded triples.

## 9.20 Package publishing and private registries

```sh
cargo login
cargo publish --dry-run
cargo publish
```

Before publishing: set `description`, `license`, `repository`, `readme`,
`keywords` and `categories`; make the version semver-correct; run `cargo package
--list` to inspect exactly what ships; verify the docs build with
`RUSTDOCFLAGS="-D warnings"`; and include a `CHANGELOG.md`. Yanking a version
does not delete it; it prevents new resolutions. Private registries include
Cloudsmith, Artifactory, Kellnr and a local `cargo vendor` + registry mirror.
Configure them in `.cargo/config.toml` with a scoped token, never in a committed
file. Use `publish = false` for internal crates.

## 9.21 Workspace management and monorepo strategies

A monorepo works when the boundaries are real: one crate per deployable unit, a
`core` crate for shared domain types, and thin `bin` crates for entry points.
Keep dependency direction acyclic (core ← adapters ← binaries), and enforce it
with `cargo-deny`/`cargo-machete` plus a review rule. Use
`[workspace.dependencies]` to align versions, `resolver = "3"` for edition 2024,
and a shared `rust-toolchain.toml`. Split CI with path filters so a docs-only
change does not rebuild the world. For very large repositories, `sccache` and
`cargo-hakari` (workspace-hack) reduce rebuild time; `bacon` or `cargo-watch`
give a fast local loop.

## 9.22 Pre-commit hooks and Git integration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: fmt
        name: cargo fmt
        entry: cargo fmt --all --
        language: system
        pass_filenames: false
      - id: clippy
        name: cargo clippy
        entry: cargo clippy --workspace --all-targets -- -D warnings
        language: system
        pass_filenames: false
```

Hooks make the fast checks impossible to forget; CI still runs them because a
hook can be skipped. Keep hooks under a few seconds; move tests to CI. Configure
`git blame` to ignore formatting commits, sign release tags, and use
conventional commit messages if you generate changelogs. `cargo-husky` installs
hooks from the repository; `pre-commit` works across languages.

## Exercises

:::exercise guided Build a workspace with a shared core
Create a workspace with `core` (a `Greeter` trait and a `Name` newtype), `cli`
(a clap binary that prints a greeting) and `api` (a small Axum service that
returns the same greeting). Put shared dependencies in
`[workspace.dependencies]`, add a feature to `core` that switches the greeting
language, and verify `cargo test --workspace --all-features`.
::hint
Use `members = ["crates/core", "crates/cli", "crates/api"]`, `version.workspace
= true`, and `core = { path = "crates/core" }`. Define
`pub trait Greeter { fn greet(&self, name: &Name) -> String; }`. The feature
`english`/`amharic` chooses a default implementation; avoid mutually exclusive
features by making the default explicit.
::solution
```toml
# Cargo.toml
[workspace]
resolver = "3"
members = ["crates/core", "crates/cli", "crates/api"]

[workspace.package]
version = "0.1.0"
edition = "2024"

[workspace.dependencies]
core = { path = "crates/core" }
clap = { version = "4", features = ["derive"] }
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

```rust
// crates/core/src/lib.rs
#[derive(Debug, Clone)]
pub struct Name(pub String);

pub trait Greeter {
    fn greet(&self, name: &Name) -> String;
}

pub struct English;

impl Greeter for English {
    fn greet(&self, name: &Name) -> String {
        format!("Hello, {}!", name.0)
    }
}

pub struct Amharic;

impl Greeter for Amharic {
    fn greet(&self, name: &Name) -> String {
        format!("ሰላም, {}!", name.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greets() {
        assert_eq!(English.greet(&Name("Ada".into())), "Hello, Ada!");
    }
}
```

```rust
// crates/cli/src/main.rs
use clap::Parser;
use core::{English, Greeter, Name};

#[derive(Parser)]
struct Cli {
    name: String,
}

fn main() {
    let cli = Cli::parse();
    println!("{}", English.greet(&Name(cli.name)));
}
```

The workspace builds one dependency graph, so the CLI and API share the same
`core` version. A new language is a new type implementing `Greeter`, not a
branch inside a function.
:::

:::exercise practice Snapshot-test a renderer and property-test a parser
Implement `fn render(items: &[Item]) -> String` with a stable format, snapshot
it with `insta`, and write a `proptest` for `parse(render(items)) == items` with
arbitrary names and quantities. Then add a `quickcheck` property that parsing
never panics on arbitrary `String` input.
::hint
Derive `Debug, Clone, PartialEq` on `Item`. Use `insta::assert_snapshot!` and run
`cargo insta review`. For the round trip, generate names from `[a-zA-Z0-9 ]+`
so the format is unambiguous; for the panic test, feed `any::<String>()`.
::solution
```rust
use proptest::prelude::*;

#[derive(Debug, Clone, PartialEq)]
struct Item {
    name: String,
    quantity: u32,
}

fn render(items: &[Item]) -> String {
    let mut output = String::new();
    for item in items {
        output.push_str(&format!("{} x{}\n", item.name, item.quantity));
    }
    output
}

fn parse(input: &str) -> Vec<Item> {
    input
        .lines()
        .filter_map(|line| {
            let (name, quantity) = line.rsplit_once(" x")?;
            Some(Item { name: name.to_string(), quantity: quantity.parse().ok()? })
        })
        .collect()
}

proptest! {
    #[test]
    fn round_trip(items in prop::collection::vec(("[a-zA-Z0-9 ]{1,20}", 0_u32..1000), 0..20)) {
        let items: Vec<Item> = items
            .into_iter()
            .map(|(name, quantity)| Item { name, quantity })
            .collect();
        prop_assert_eq!(parse(&render(&items)), items);
    }

    #[test]
    fn parse_never_panics(input in ".*") {
        let _ = parse(&input);
    }
}

fn main() {
    let items = vec![Item { name: "tea".into(), quantity: 2 }];
    insta::assert_snapshot!(render(&items));
}
```
:::

:::exercise challenge A release pipeline with a minimal image
Build a small Axum service, add a GitHub Actions workflow (fmt, clippy, test,
doc), a multi-stage Dockerfile producing a distroless image under 40 MB, and a
`cargo-dist` configuration for Linux and macOS binaries. Measure the image size
with and without `opt-level = "z"`, LTO and stripping, and record the numbers.
::hint
Use `rust:1.85-bookworm` for the build and `gcr.io/distroless/cc-debian12` for
runtime. `cargo build --release --locked` with cache mounts; copy only the
binary. For size, set `[profile.release] opt-level = "z", lto = "fat",
codegen-units = 1, panic = "abort", strip = "symbols"`. `docker images` and
`cargo bloat --release` show the result.
::solution
```yaml
name: release
on:
  push:
    tags: ["v*"]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - uses: Swatinem/rust-cache@v2
      - run: cargo fmt --all -- --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: cargo test --workspace

  image:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.ref_name }}
```

```dockerfile
FROM rust:1.85-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --locked

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/api /usr/local/bin/api
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/api"]
```

Record image size before and after the profile change; a distroless image is
usually 20–40 MB larger than a static `scratch` image but far smaller than a
full Debian base. The pipeline should fail if the image exceeds the budget you
set, otherwise size regressions accumulate silently.
:::

## Quiz

:::quiz DevOps and tooling check
? Why should Cargo features be additive?
+ So that any combination compiles and features do not conflict
- So that they can be enabled in any order
- Because Cargo sorts them alphabetically
- Because they are only used for tests
= Features are unified across the dependency graph. If enabling one disables another, downstream crates cannot compose them, and `--all-features` may not build.

? What is the difference between `[patch]` and `[replace]`?
- They are synonyms
+ `[patch]` overrides a dependency source for the workspace; `[replace]` is the older per-package form
- `[patch]` edits files; `[replace]` edits versions
- `[replace]` is for build scripts
= `[patch.crates-io]` is the supported way to substitute a git or path source. It does not travel with a published crate.

? Which test kind proves that a macro rejects invalid input with a useful error?
- A doc test
+ A `trybuild` UI test
- A property test
- A benchmark
= `trybuild` compiles fixtures and compares the compiler output, including spans and messages. Doc tests prove that valid examples compile and run.

? Why is `panic = "abort"` a trade-off in release builds?
- It makes panics faster
+ It removes unwinding support, so `catch_unwind` cannot recover and destructors do not run during a panic
- It disables debug information
- It makes the binary larger
= Abort reduces size and removes landing pads, but changes semantics: a panic terminates the process. Libraries should not impose it on their users.

? What does `cross` provide that a bare `cargo build --target` does not?
- Faster compilation
+ A container with the target's linker, libc and sysroot
- Automatic code signing
- A package registry
= Cross-compiling needs a linker and target libraries. `cross` supplies them in a container; `cargo-zigbuild` uses Zig's toolchain instead.
:::

:::recap
- Workspaces share a lock file and dependency graph; features are additive, profiles encode build intent, `[patch]` overrides a source.
- Build scripts generate code, link libraries and set environment; keep them deterministic.
- Derive, attribute and function-like proc macros use `syn`, `quote` and `proc-macro2`; test errors with `trybuild`.
- `clap` and `bpaf` build composable CLIs; `ratatui` and `crossterm` build TUIs that restore the terminal.
- Unit, integration, doc, snapshot, property and mock-based tests cover different failures.
- Coverage guides attention; Clippy and rustfmt remove entire review categories.
- Rustdoc, intra-doc links and mdBook keep documentation executable and current.
- CI runs fmt, clippy, tests, docs and MSRV with a cached dependency graph.
- Multi-stage Docker with distroless/scratch produces small, low-risk runtime images.
- Nix and pinned toolchains make builds reproducible; `cargo-dist`/`cargo-release` automate releases.
- Audit dependencies and manage versions deliberately; keep one major version per dependency.
- Binary size comes from LTO, codegen units, stripping, panic strategy and dependency choices.
- `cross` and `cargo-zigbuild` solve cross-compilation; test the artefact on the target.
- Publish with metadata, dry runs and a changelog; keep private registries out of committed files.
- Hooks catch the fast checks locally; CI remains the source of truth.
:::
