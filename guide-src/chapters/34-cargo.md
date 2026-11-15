@id cargo
@part p12
@title Cargo in depth
@short Cargo in depth
@level intermediate
@time 50
@learn Read and write every important section of `Cargo.toml` | Manage dependencies, versions and features | Tune builds with profiles | Organise several packages in a workspace | Document, install and publish a crate, and manage toolchains with rustup

You have used Cargo since [chapter 4](#setup): `cargo new`, `cargo run`, `cargo test`, `cargo add`. Cargo is Rust's build tool and package manager in one, and one of the main reasons the language is pleasant to use. This chapter covers the rest of what a working Rust programmer needs from it.

:::analogy A project control tower
Cargo is the system that keeps the whole airport moving: which package is in the build, which versions are allowed, which features are active, and which test command the team is running. It turns a pile of files into a repeatable build.
:::

## The layout of a package

Cargo works by convention. If you put files in the expected places, no configuration is needed:

```text
my_package/
├── Cargo.toml          the manifest: name, version, dependencies, settings
├── Cargo.lock          the exact versions in use (written by Cargo)
├── build.rs            optional build script, run before compiling
├── src/
│   ├── lib.rs          the library crate
│   ├── main.rs         the main program
│   └── bin/
│       └── tool.rs     further programs: cargo run --bin tool
├── tests/              integration tests
├── examples/           example programs: cargo run --example demo
├── benches/            benchmarks
└── target/             everything Cargo builds (never commit this folder)
```

## The manifest

:::analogy The blueprint vs the parts list
`Cargo.toml` is your project's blueprint ("I need a `serde` crate of version 1.0 or newer"), while `Cargo.lock` is the exact shipping manifest from the warehouse ("this build used `serde` 1.0.229 with this exact checksum"). Sharing `Cargo.toml` lets libraries stay compatible; keeping `Cargo.lock` for applications guarantees every machine compiles the exact same bytes.
:::

```toml
[package]
name = "weather"
version = "0.3.1"
edition = "2024"
rust-version = "1.85"
description = "Fetches and prints the weather forecast"
license = "MIT OR Apache-2.0"
repository = "https://github.com/example/weather"
readme = "README.md"
keywords = ["weather", "cli"]
categories = ["command-line-utilities"]

[dependencies]
serde = { version = "1.0.229", features = ["derive"] }
anyhow = "1.0.104"

[dev-dependencies]
proptest = "1.12.0"

[build-dependencies]
cc = "1.11.2"
```

| Key | Meaning |
|---|---|
| `name` | the package's name, and by default the name of its library and program |
| `version` | the version, following semantic versioning (below) |
| `edition` | the language edition: `2015`, `2018`, `2021` or `2024` |
| `rust-version` | the oldest compiler the package supports. Older compilers refuse to build it, with a clear message |
| `description`, `license`, `repository`, … | information for people and for crates.io. `description` and `license` are required for publishing |

The three dependency tables differ in when the crates are used:

- `[dependencies]`: needed by your code.
- `[dev-dependencies]`: needed only for tests, examples and benchmarks. Users of your library never download them.
- `[build-dependencies]`: needed only by `build.rs`.

:::plain Editions
An **edition** is a version of the language's surface: its keywords and a few rules. A new one appears every three years, and may contain changes that would break old code, such as a new keyword. Each crate states its edition, and crates of different editions work together in one program without any trouble. So the language can evolve, and code from 2015 still compiles today. `cargo fix --edition` updates a package to the next edition automatically.
:::


:::details Reading older code: what the editions changed
Tutorials, answers on the web and old crates are often written for an earlier edition. These are the differences you are most likely to notice:

| Edition | What you see in code written for it |
|---|---|
| 2015 | `extern crate serde;` at the top of files. `try!(…)` where you would write `?`. Trait objects without `dyn`: `Box<Error>`. Paths in `use` without `crate::`. |
| 2018 | `async`, `await` and `dyn` become keywords. `use crate::…` paths as in this guide. `extern crate` is no longer needed. |
| 2021 | A closure captures only the fields it uses, not the whole struct. `array.into_iter()` gives the values. `TryFrom`, `TryInto` and `FromIterator` can be used without a `use` line. |
| 2024 | `unsafe extern` blocks and `#[unsafe(no_mangle)]`. Every unsafe operation inside an `unsafe fn` needs its own `unsafe` block. References to a `static mut` are refused. `if let` chains with `&&`. `std::env::set_var` is `unsafe`. `gen` is reserved as a keyword. Temporary values in the final expression of a function and failing `if let` conditions are dropped **before** local variables, not after. `impl Trait` in return position captures every lifetime in scope, unless you narrow it with `use<…>`. Cargo defaults to `resolver = "3"` (MSRV-aware). |

Code from every edition compiles with today's compiler, as long as its `Cargo.toml` names the edition it was written for. If you paste old code into a new project and get puzzling errors, the edition is the first thing to check.

Why did Rust 2024 change temporary drop order? In older editions, `if let Some(x) = lock.borrow() { … } else { … }` kept the temporary lock guard alive throughout the `else` branch, causing unexpected borrows or deadlocks if `else` tried to lock again. In Edition 2024, temporaries created in the `if let` condition drop before entering `else`, and temporaries in a block's final expression drop before local variables in that block.
:::

Three of the 2024 changes are worth recognising, because they arrive as diagnostics rather than as a new keyword, and the message does not always say the word "edition":

- **Tail-expression drop order.** In an older edition, the temporary values created in the final expression of a function body were dropped *after* the local variables of that body. In 2024 they are dropped *before* them, at the end of the expression. Consider a function whose last line is `cell.borrow().len()`. Under the old order the borrow was still alive when the local `cell` was dropped, so the borrow checker refused the function. Under the new order the borrow ends first and the function compiles. Code that relied on the old order — a guard that read the local variable it outlived — now fails to compile instead of misbehaving, which is the point of the change.
- **`unsafe_op_in_unsafe_fn`.** Every unsafe operation inside an `unsafe fn` must now sit in its own `unsafe` block. The lint that reports this is named in the error message, and it is a good habit to enable it in older editions too: the body of an `unsafe fn` was never meant to be an unsafe block.
- **`static_mut_refs`.** Taking a reference to a `static mut` is an error in 2024, because two threads can do it at once. The fix is one of the tools from [chapter 56](#shared-state): an `AtomicU32`, a `Mutex` behind a `OnceLock`, or `&raw mut` when you really only need the address.

:::tip The Edition Guide is the authority
The [Rust Edition Guide](https://doc.rust-lang.org/edition-guide/) lists every change in every edition, with a migration example for each one, and it is short. When an old snippet will not compile and the edition is the suspect, read the page for that edition before changing the code.
:::

## Dependencies and versions

### Semantic versioning

A version has three numbers: **MAJOR.MINOR.PATCH**, as in `1.4.2`. The rules, known as **SemVer**:

- **PATCH** goes up for bug fixes that change no public API.
- **MINOR** goes up when features are added in a compatible way.
- **MAJOR** goes up when something changes that can break code using the crate.

For versions below 1.0, the minor number plays the role of the major: `0.3.0` to `0.4.0` may break things.

A version requirement in `Cargo.toml` describes a *range*:

| You write | Cargo accepts | Meaning |
|---|---|---|
| `"1.4.2"` | at least 1.4.2, below 2.0.0 | the default: "compatible with 1.4.2" |
| `"0.3.1"` | at least 0.3.1, below 0.4.0 | the same rule for 0.x |
| `"~1.4.2"` | at least 1.4.2, below 1.5.0 | only patch updates |
| `"=1.4.2"` | exactly 1.4.2 | pinned. Use rarely |
| `">=1.2, <1.8"` | the given range | |
| `"*"` | anything | not allowed on crates.io |

So `serde = "1.0.229"` does not mean "exactly this version". It means "this version or any later one that promises to be compatible".

### `Cargo.lock`

When Cargo first builds a project, it picks the newest allowed version of every dependency, and of the dependencies of those, and writes the exact result into `Cargo.lock`. From then on, every build uses exactly those versions, on your machine and on everybody else's, until you ask for an update.

**Commit `Cargo.lock` to version control.** It makes builds reproducible: the program you tested is the program your colleague and your server build.

### Everyday commands

| Command | Effect |
|---|---|
| `cargo add serde --features derive` | add a dependency |
| `cargo add --dev proptest` | add a dev-dependency |
| `cargo remove serde` | remove one |
| `cargo update` | move all dependencies to the newest allowed versions, and rewrite `Cargo.lock` |
| `cargo update serde` | update one crate |
| `cargo tree` | show the tree of dependencies |
| `cargo tree -d` | show crates that are present in more than one version |
| `cargo tree -i syn` | show who depends on `syn` |
| `cargo search http client` | search crates.io |
| `cargo info tokio` | show a crate's description, versions and features |

```text
$ cargo tree
shop v0.1.0 (/home/sara/shop/cli)
└── shop_core v0.1.0 (/home/sara/shop/core)
    └── serde v1.0.229
        ├── serde_core v1.0.229
        └── serde_derive v1.0.229 (proc-macro)
            ├── proc-macro2 v1.0.107
            │   └── unicode-ident v1.0.27
            ├── quote v1.0.47
            │   └── proc-macro2 v1.0.107 (*)
            └── syn v3.0.10
                ├── proc-macro2 v1.0.107 (*)
                ├── quote v1.0.47 (*)
                └── unicode-ident v1.0.27
```

One line in `Cargo.toml` can bring in many crates. The tree shows what you really depend on.

### Other sources

```toml
[dependencies]
# a folder on your disk
shop_core = { path = "../core" }

# a Git repository, at a branch, a tag or an exact commit
fancy = { git = "https://github.com/example/fancy", tag = "v0.2.0" }

# only on certain platforms
[target.'cfg(windows)'.dependencies]
windows-sys = "0.61"
```

## Features

A **feature** is a named switch that turns optional parts of a crate on. Features keep compile times and binaries small: you pay only for what you use. `tokio = { version = "1", features = ["full"] }` and `serde = { features = ["derive"] }` are switches of this kind.

You can define features in your own crate:

```toml
[package]
name = "shop_core"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1.0.229", features = ["derive"], optional = true }

[features]
default = []
serde = ["dep:serde"]
```

- `optional = true` means that the dependency is only compiled when asked for.
- `serde = ["dep:serde"]` defines a feature called `serde` that switches the optional dependency on.
- `default` lists the features that are on unless the user says `default-features = false`.

In the code, `cfg` conditions test the feature:

```rust
/// A product that can be sold.
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Product {
    pub name: String,
    pub price_cents: u64,
}

/// Reports whether this build can convert products to and from other formats.
pub fn supports_serde() -> bool {
    cfg!(feature = "serde")
}
```

`#[cfg_attr(condition, attribute)]` applies the attribute only if the condition holds. With the feature off, the crate does not depend on serde at all.

```text
$ cargo run
serde support: false

$ cargo run --features shop_core/serde
serde support: true
```

:::key Features must only add
If two crates in a program need the same dependency with different features, Cargo builds it once, with *all* requested features switched on. This is called **feature unification**. For it to work, a feature must only ever *add* things. A feature that removes a function, or changes what one does, will break someone who did not ask for it.
:::

## Profiles: how the code is built

A **profile** is a set of compiler settings. Two are used all the time. For what the optimiser does between your source text and the final bytes, see [the silicon appendix](#under-the-hood).

| | `dev` (`cargo build`) | `release` (`cargo build --release`) |
|---|---|---|
| Optimisation | none (`opt-level = 0`) | full (`opt-level = 3`) |
| Compile time | short | longer |
| Run time | slow, often 10 to 100 times slower for calculations | fast |
| Debug information | yes | no |
| Integer overflow | panics | wraps around |
| Output folder | `target/debug/` | `target/release/` |

:::warn Never measure speed in a debug build
A debug build tells you nothing about how fast your program is. Always benchmark with `--release`. Forgetting this is the most common reason for the question "why is my Rust program slow?".
:::

Profiles can be changed in `Cargo.toml`:

```toml
[profile.release]
lto = true             # optimise across all crates together: slower build, smaller and sometimes faster program
codegen-units = 1      # more optimisation, slower build
strip = true           # remove symbol names from the binary
panic = "abort"        # end the program on panic without unwinding: smaller binary
opt-level = "z"        # optimise for size instead of speed ("s" is a milder version)

[profile.dev]
opt-level = 1          # a little optimisation in debug builds

[profile.dev.package."*"]
opt-level = 3          # fully optimise dependencies, even in debug builds
```

The last entry is a useful trick for programs that are too slow to test in debug mode, such as games: your own code compiles quickly, and the libraries run at full speed.

How much the settings matter depends on the program. For the small example program of this chapter, the sizes were:

| Build | Size of the program |
|---|---|
| `cargo build` (debug) | 4,542 KB |
| `cargo build --release` | 446 KB |
| release with `strip`, `lto`, `codegen-units = 1`, `panic = "abort"` | 290 KB |
| the same with `opt-level = "z"` | 283 KB |


## Faster builds

Rust compiles more slowly than most languages. The compiler does much of the work that other languages leave to run time: it makes a separate copy of generic code for every type it is used with, expands macros, and optimises hard. You cannot change that, but you can avoid waiting more than necessary. The measures below are ordered from "free" to "some effort".

**1. Use `cargo check` while you write.** It stops before machine code is generated. These are times for a program of 25 lines that uses `regex`, `serde` and `serde_json` (about 20 crates in all), on a small machine with two cores:

| Command | Nothing built yet | After changing one line |
|---|---|---|
| `cargo check` | 4.3 s | 0.05 s |
| `cargo build` | 6.6 s | 0.19 s |
| `cargo build` with `debug = false` | 5.7 s | |
| `cargo build --release` | 13.0 s | 0.27 s |

The first build is the slow one, because every dependency is compiled. After that, Cargo recompiles only your own crate, and that is quick as long as the crate is small.

**2. Find out where the time goes.** `cargo build --timings` writes a report to `target/cargo-timings/cargo-timing.html`. It shows every crate as a bar on a time line: when its build started, how long it took, and what it was waiting for. For the program above, the slowest five were `regex-automata` (2.3 s), `regex-syntax` (1.6 s), `serde_derive` (1.4 s), `serde_core` (1.3 s) and `syn` (1.2 s). One line of `Cargo.toml` can cost more build time than all of your own code.

**3. Carry fewer and lighter dependencies.** `cargo tree` shows what each dependency brings along. Many crates switch on more than you need by default:

```toml
[dependencies]
# Everything that Tokio has:
# tokio = { version = "1", features = ["full"] }
# Only the parts this program uses:
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net"] }

# A crate without its default features:
regex = { version = "1", default-features = false, features = ["std"] }
```

**4. Ask for less debug information.** A debug build writes a description of every variable and line for the debugger. If you rarely use a debugger, reduce it:

```toml
[profile.dev]
debug = "line-tables-only"   # enough for file names and line numbers in a backtrace
# debug = false              # nothing at all
```

In the table above this saved about a seventh of the build. The Rust Performance Book reports 20 to 40 % for larger projects.

**5. Check the linker.** The last step of a build, joining everything into one file, is repeated in full after every change. On Linux, Rust has used the fast linker `lld` by default since version 1.90. The linker `mold` is often faster still. On macOS the system linker is fast already.

**6. Split a large crate.** Cargo compiles crates in parallel, and it rebuilds only the crates that changed and the ones that depend on them. A workspace of several medium crates (next section) builds faster than one huge crate, and a change in one place no longer recompiles everything.

**7. Do not compile the same thing twice.** The tool `sccache` keeps compiled dependencies in a cache that all your projects share. On a CI server, keep `~/.cargo` and `target` between runs. For Docker images, `cargo-chef` builds the dependencies in a layer of their own, so that they are rebuilt only when `Cargo.toml` changes.

**8. Keep generic code thin.** A generic function is compiled again for every type it is used with. When only a small part needs to be generic, put the rest in an inner function. The standard library does this in many places:

```rust check
use std::path::Path;

// This outer part is compiled once for every type it is called with ...
pub fn count_lines<P: AsRef<Path>>(path: P) -> std::io::Result<usize> {
    // ... and the real work is compiled only once.
    fn inner(path: &Path) -> std::io::Result<usize> {
        Ok(std::fs::read_to_string(path)?.lines().count())
    }
    inner(path.as_ref())
}
```

Measure before and after each step, as with every other kind of performance work ([chapter 74](#performance)).

## Workspaces

A larger project is usually split into several packages: a library with the core logic, a command-line program, a web server, some tools. A **workspace** keeps them in one repository with one `Cargo.lock` and one `target` folder, so that they share dependencies and build results.

```text
shop/
├── Cargo.toml          the workspace manifest
├── Cargo.lock
├── core/               the package shop_core (a library)
│   ├── Cargo.toml
│   └── src/lib.rs
└── cli/                the package shop (a program)
    ├── Cargo.toml
    └── src/main.rs
```

```toml
# shop/Cargo.toml
[workspace]
resolver = "3"
members = ["core", "cli"]

[workspace.package]
version = "0.1.0"
edition = "2024"
license = "MIT OR Apache-2.0"

[workspace.dependencies]
serde = { version = "1.0.229", features = ["derive"] }
```

```toml
# shop/cli/Cargo.toml
[package]
name = "shop"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
shop_core = { path = "../core" }
serde = { workspace = true }
```

- `[workspace.package]` and `[workspace.dependencies]` define values once. The members take them over with `.workspace = true`. All packages then use the same version of every dependency.
- Commands at the top level apply to all members: `cargo build`, `cargo test`. Choose one with `-p`: `cargo run -p shop`, `cargo test -p shop_core`.

Splitting a project into crates also speeds up builds: Cargo compiles crates in parallel and rebuilds only those that changed.

## The commands, in one table

| Command | What it does |
|---|---|
| `cargo new name`, `cargo new --lib name`, `cargo init` | create a package (in a new folder, or in the current one) |
| `cargo check` | check for errors without producing a program. Much faster than `build` |
| `cargo build`, `cargo build --release` | compile |
| `cargo run`, `cargo run --release -- args` | compile and run |
| `cargo test`, `cargo bench` | run tests, run benchmarks |
| `cargo doc --open` | build the documentation and open it in the browser |
| `cargo fmt`, `cargo clippy` | format, lint ([next chapter](#quality-tools)) |
| `cargo fix` | apply the compiler's suggested fixes automatically |
| `cargo clean` | delete the `target` folder |
| `cargo install name`, `cargo install --path .` | build a program and put it on your search path |
| `cargo publish` | upload the package to crates.io |

While writing code, use `cargo check` most of the time. It stops before the slow step of generating machine code, and reports the same errors.

Frequently used commands can get short names in the file `.cargo/config.toml` in your project or home folder:

```toml
[alias]
c = "check"
t = "test"
lint = "clippy --all-targets -- -D warnings"
```

## Documentation

Rust has a documentation tool built in. `cargo doc` turns the comments in your code into a website with the same look as the standard library's documentation, with search, links between types, and source views.

```rust
//! The data types of the shop.
//!
//! This text describes the crate as a whole. It appears on the front page.

/// A product that can be sold.
#[derive(Debug, Clone, PartialEq)]
pub struct Product {
    pub name: String,
    pub price_cents: u64,
}

impl Product {
    /// Creates a product.
    ///
    /// # Examples
    ///
    /// ```
    /// let tea = shop_core::Product::new("tea", 780);
    /// assert_eq!(tea.price_cents, 780);
    /// ```
    ///
    /// See also [`Product::name`] and the [`Clone`] trait.
    pub fn new(name: &str, price_cents: u64) -> Product {
        Product { name: name.to_string(), price_cents }
    }
}
```

- `///` documents the item that follows. `//!` documents the item that *contains* the comment: the crate or module.
- The text is Markdown. The first sentence becomes the summary in lists.
- Conventional sections are `# Examples`, `# Errors` (when a `Result` is returned), `# Panics` and `# Safety` (for unsafe functions).
- A name in square brackets and backticks becomes a link to that item.
- Code blocks are compiled and run by `cargo test`, as you saw in [chapter 27](#testing).

Every crate published on crates.io gets its documentation built and hosted automatically at **docs.rs**. For any crate you use, `https://docs.rs/<crate name>` is the place to look.

:::tip Documentation that stays correct as the crate grows
Three habits separate documentation that ages well from documentation that rots:

- **Link by name, not by URL.** A name in square brackets inside backticks, like [`Product::new`] or [`Clone`], becomes a link that the compiler resolves. If you rename the item, the link breaks and `rustdoc` tells you. With `RUSTDOCFLAGS: -D warnings` in CI — the documentation step in the [next chapter](#quality-tools) — a broken link fails the build instead of quietly shipping a dead end.
- **Ask the compiler to notice missing docs.** Put `#![warn(missing_docs)]` at the top of the crate root. Every public item without a doc comment then produces a warning, which is how a public API gets documented by habit rather than by good intentions. Keep it off for programs, where the public surface is your own business.
- **Hide the plumbing.** `#[doc(hidden)]` keeps an item out of the rendered documentation, for generated or internal items that must be public but are not part of the promise. Use it sparingly: a hidden item can still be called, but it is not explained.

`cargo doc --open` builds and opens the documentation for your crate *and* its dependencies. `cargo doc --no-deps` builds only your own, which is what CI should run.
:::

:::tip When rustdoc is not enough
`rustdoc` answers "what does this function do?". It is poor at "how do I build something with this crate": chapters, a tutorial, a table of contents, a search box over prose. For that, the Rust world uses [mdBook](https://rust-lang.github.io/mdBook/), the tool that renders the official Rust Book and the Rustonomicon: a folder of Markdown files plus a small `book.toml` becomes a website with navigation and search. `mdbook build` writes it, `mdbook serve` previews it locally, and GitHub Pages can host it for free. API reference and book answer different questions, and a serious library ships both.
:::

## Publishing a crate

Sharing a library with the world takes a few minutes:

1. Create an account at crates.io (it uses a GitHub login) and get an API token. Run `cargo login` and paste it.
2. Fill in `description` and `license` in `Cargo.toml`, and write a `README.md`.
3. Run `cargo publish --dry-run` to see what would be uploaded, and check the list of files with `cargo package --list`.
4. Run `cargo publish`.

The metadata is what a stranger sees on crates.io and on docs.rs, so it is worth ten minutes:

```toml
[package]
name = "shop-core"
version = "0.3.1"
edition = "2024"
description = "Data types and pricing rules for the tea shop example"
license = "MIT OR Apache-2.0"
repository = "https://github.com/you/shop-core"
documentation = "https://docs.rs/shop-core"
readme = "README.md"
rust-version = "1.85"                      # the oldest compiler that works
keywords = ["shop", "pricing"]             # up to five, used by search
categories = ["data-structures"]           # from the crates.io list

[package.metadata.docs.rs]
all-features = true                        # document every feature, not the default set
rustdoc-args = ["--cfg", "docsrs"]
```

`rust-version` is a promise, not decoration: `cargo` refuses to build the crate on an older compiler and says so clearly, instead of failing with a confusing error deep inside a macro. `cargo msrv` measures it for you by trying your crate on a range of toolchains.

Things to know before you do:

- **Publishing is permanent.** A version can never be changed or deleted, so that programs depending on it keep building. You can **yank** a broken version with `cargo yank --version 1.0.1`, which stops *new* projects from choosing it.
- **Names are first come, first served.**
- **Follow SemVer strictly.** People's builds update to your new minor and patch versions automatically. The tool `cargo semver-checks` compares your code with the last published version and warns if you are about to break compatibility by accident.
- The usual licence in the Rust world is the dual licence `MIT OR Apache-2.0`, the same as Rust itself.

### Releasing without the ritual

Publishing by hand becomes a ritual of small mistakes: forget the version bump, forget the changelog, publish in the wrong order. The tools that remove the ritual are all worth knowing by name:

| Tool | What it takes over |
|---|---|
| [`release-plz`](https://release-plz.dev) | Reads the commit history, works out the next version, writes the `CHANGELOG.md` entry, opens a pull request, and publishes to crates.io when you merge it |
| [`cargo-release`](https://github.com/crate-ci/cargo-release) | The manual but scriptable version: one command bumps the version, tags, pushes and publishes a workspace in the right order |
| [`cargo-dist`](https://opensource.axo.dev/cargo-dist/) | For programs rather than libraries: builds binaries for every platform, writes installers, and uploads them to a GitHub release |
| [`cargo msrv`](https://github.com/foresterre/cargo-msrv) | Finds the oldest Rust version your crate compiles with, so `rust-version` is measured rather than guessed |

Whatever you use, keep a `CHANGELOG.md` in the format of [Keep a Changelog](https://keepachangelog.com) and version strictly by SemVer: *Added*, *Changed*, *Deprecated*, *Removed*, *Fixed*, *Security*, newest first. Your users read the changelog far more often than they read the code, and a release that says nothing is a release nobody upgrades to.
## rustup: managing the toolchain

`rustup` installs and updates the compiler and its companions.

| Command | Effect |
|---|---|
| `rustup update` | update to the newest stable release |
| `rustup show` | show the installed toolchains and which one is active |
| `rustup toolchain install nightly` | install another channel |
| `cargo +nightly build` | run one command with a specific toolchain |
| `rustup component add clippy rustfmt rust-analyzer` | add tools |
| `rustup target add wasm32-unknown-unknown` | add support for building for another platform |
| `rustup doc` | open the offline documentation, including the standard library and "the book" |

Rust has three **release channels**:

- **stable**: a new release every six weeks. Use this.
- **beta**: the next stable release, in testing.
- **nightly**: built every night, with experimental features that may change or vanish. Some tools (Miri, certain sanitizers) need it.

A file named `rust-toolchain.toml` in a project fixes the toolchain for everybody who works on it. rustup installs it on demand:

```toml
[toolchain]
channel = "1.100.0"
components = ["clippy", "rustfmt"]
```

### Building for other platforms

Rust can compile for a different system than the one it runs on. This is called **cross-compiling**. Each platform has a name, a **target triple**, such as `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin` (Macs with Apple chips), `x86_64-pc-windows-msvc` or `wasm32-unknown-unknown` (WebAssembly).

```text
rustup target add aarch64-unknown-linux-gnu
cargo build --release --target aarch64-unknown-linux-gnu
```

Pure Rust code usually cross-compiles without more ado. When C libraries or a linker for the other system are needed, the tools `cross` and `cargo-zigbuild` take care of the setup. For shipping prebuilt binaries, checksums, and installers on GitHub Releases automatically, `cargo-dist` generates the release workflow directly from `Cargo.toml`.

### Build scripts (`build.rs`)

When a crate needs generated code at compile time (Protobufs via `tonic-build`, C libraries via `cc`, SQLx migration tracking, or embedding the Git commit hash), Cargo runs **`build.rs`** before compiling the package. Generated files belong inside **`OUT_DIR`**, and instructions back to Cargo use `cargo::` directives printed to standard output:

```rust file=build.rs
use std::path::PathBuf;

fn main() {
    // Only re-run this script when `migrations/` changes, not on every Rust edit
    println!("cargo::rerun-if-changed=migrations");

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    std::fs::write(out_dir.join("generated.rs"), "pub const BUILD_KIND: &str = \"release-ready\";\n").unwrap();

    // Pass compile-time environment values into `env!("...")` in your crate
    println!("cargo::rustc-env=APP_SCHEMA_VERSION=2");
}
```

Include generated files inside `src/lib.rs` with `include!(concat!(env!("OUT_DIR"), "/generated.rs"));`, and always emit `cargo::rerun-if-changed=...` so Cargo does not re-run the build script on unrelated edits.

## Useful extensions

Cargo can be extended with extra commands, installed with `cargo install`:

| Tool | Purpose |
|---|---|
| `cargo-expand` | show code after macro expansion |
| `cargo-audit`, `cargo-deny` | check dependencies for known security problems and unwanted licences |
| `cargo-outdated` | list dependencies that have newer versions |
| `cargo-machete`, `cargo-udeps` | find dependencies that are never used |
| `cargo-nextest` | a faster test runner with clearer output |
| `cargo-watch`, `bacon` | re-run a command whenever a file changes |
| `cargo-semver-checks` | detect accidental breaking changes before publishing |
| `cargo-bloat` | show what takes up space in a binary |
| `cargo-binstall` | install tools from ready-made binaries, without compiling |
| `cargo-dist` | automate multi-platform binary releases and installers |

For supply-chain hygiene in CI, pair `cargo audit` (vulnerability checks against RustSec) with **`cargo deny check`** configured by a `deny.toml` file in the repository root—allowing your team to permit only approved open-source licences (`MIT`, `Apache-2.0`), block unmaintained or duplicate crates, and fail pull requests automatically when a security advisory lands.

:::compare Build tools elsewhere
- **C and C++** have no standard build tool or package manager. Projects use Make, CMake, Meson, Bazel, vcpkg, Conan and others, and combining libraries that use different ones is a well-known source of pain.
- **JavaScript** has npm, **Python** has pip together with a shifting set of companions (venv, poetry, uv), and **Java** has Maven and Gradle.
- **Go** and **Rust** were designed with one official tool from the start. Cargo's single-tool experience (build, test, document, format, lint, publish) is often cited as a reason people enjoy Rust.
:::

:::recap
- `Cargo.toml` describes the package and its dependencies. `Cargo.lock` records the exact versions, and belongs in version control.
- Versions follow SemVer. `"1.4.2"` means "1.4.2 or newer, below 2.0".
- Features are named switches for optional code and optional dependencies. They must only add.
- The `dev` profile compiles fast, and the `release` profile produces fast programs. Profiles can be tuned.
- A workspace holds several packages with shared dependencies, one lock file and one `target` folder.
- `cargo check` is the fast everyday command. `cargo doc` builds documentation from `///` comments.
- Publishing to crates.io is permanent. rustup manages toolchains, components and targets.
:::

:::quiz Check your understanding
? Your `Cargo.toml` says `regex = "1.10.2"`. Which version may Cargo choose?
- Only 1.10.2
- Any version at all
+ 1.10.2 or any newer version below 2.0.0
- 1.10.2 up to 1.10.9 only
= A plain version number is a "caret" requirement: compatible updates are allowed. The exact version in use is recorded in `Cargo.lock`.

? What is `Cargo.lock` for?
- It stops two people from building at the same time
+ It records the exact version of every dependency, so that every build uses the same ones
- It contains passwords for crates.io
- It lists the features of the package
= The manifest gives ranges. The lock file pins the concrete choice until you run `cargo update`.

? Why should a Cargo feature only add functionality, and never remove or change it?
- Cargo forbids anything else
- Features are compiled last
+ A dependency is built once with the union of all features requested anywhere in the program
- Removing code is slower
= Because of feature unification, a crate cannot know that a feature is off just because it did not ask for it. Another crate may have switched it on.

? Your program takes 20 seconds for a calculation when started with `cargo run`. What is the first thing to try?
- Rewrite it with `unsafe`
- Add more threads
+ Run it with `cargo run --release`
- Use a different computer
= The default build is unoptimised. Release builds are often ten to a hundred times faster for calculations.

? What is the advantage of `cargo check` over `cargo build` during development?
- It also runs the tests
+ It reports the same errors and skips the slow step of generating the program
- It produces smaller programs
- It formats the code
= `check` runs all the analysis, including the borrow checker, without generating machine code. It is the fastest way to find out whether the code compiles.

? What does `cargo fix --edition` do?
- Rewrites the whole program to use the newest version of every crate
- Changes the compiler version the package is built with
+ Applies the mechanical changes needed to move a package to the next edition, and leaves the rest of the code alone
- Reformats the code in the new edition's style
= An edition is a set of rules inside one crate, so moving to it is a code-level migration. `cargo fix --edition` performs the changes that can be done mechanically, and reports the few that need a human decision.

? You paste a snippet from a 2018-era blog post into a 2024 project and get errors that make no sense. What should you check first?
- Whether the crate has the `serde` feature enabled
- Whether your version of Rust is new enough
+ Whether the snippet relies on a rule that changed between editions
- Whether the author of the post made a mistake
= Old snippets are usually correct *for their edition*. The differences are listed in the box above and in the Edition Guide, and `cargo fix --edition` automates most of them.
:::

:::exercise guided Read a manifest
Explain what each numbered line does.

```toml
[package]
name = "notes"
version = "0.4.0"
edition = "2024"                                          # 1

[dependencies]
clap = { version = "4.6", features = ["derive"] }         # 2
notes_core = { path = "../core" }                         # 3
chrono = { version = "0.4", optional = true }             # 4

[dev-dependencies]
tempfile = "3"                                            # 5

[features]
default = ["dates"]                                       # 6
dates = ["dep:chrono"]                                    # 7

[profile.release]
lto = true                                                # 8
```
::hint
Go back to the sections on the manifest, version requirements, features and profiles.
::solution
1. The package uses the 2024 edition of the language.
2. It depends on `clap`, version 4.6 or newer below 5.0, with the optional `derive` feature of clap switched on.
3. It depends on a package in the neighbouring folder `core`. This is typical inside a workspace.
4. `chrono` is an optional dependency: it is compiled only if a feature asks for it. Version 0.4.x is accepted, and 0.5 is not, because for 0.x versions the middle number signals breaking changes.
5. `tempfile` is used only by tests, examples and benchmarks. Users of the package never build it.
6. The feature `dates` is on by default. A user can switch it off with `default-features = false`.
7. The feature `dates` enables the optional dependency `chrono`. In the code, parts that need it are marked `#[cfg(feature = "dates")]`.
8. Release builds use link-time optimisation: the whole program is optimised together, which takes longer and gives a faster and smaller binary.
:::

:::exercise practice Build a workspace
Create a workspace `calc` with two members. `calc_core` is a library with `pub fn add(a: i64, b: i64) -> i64` and a unit test. `calc_cli` is a program that depends on it and prints `2 + 3 = 5`. Share the `edition` through `[workspace.package]`. Then run the tests of the whole workspace, and run only the program.
::hint
Make the folder, write the top-level `Cargo.toml` with `[workspace]`, `resolver = "3"` and `members`. Inside it, run `cargo new --lib calc_core` and `cargo new calc_cli`. In `calc_cli/Cargo.toml` add `calc_core = { path = "../calc_core" }`. The commands are `cargo test` and `cargo run -p calc_cli`.
::solution
```toml
# calc/Cargo.toml
[workspace]
resolver = "3"
members = ["calc_core", "calc_cli"]

[workspace.package]
edition = "2024"
```

```toml
# calc/calc_core/Cargo.toml
[package]
name = "calc_core"
version = "0.1.0"
edition.workspace = true
```

```rust test
// calc/calc_core/src/lib.rs
pub fn add(a: i64, b: i64) -> i64 {
    a + b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_two_numbers() {
        assert_eq!(add(2, 3), 5);
        assert_eq!(add(-2, 2), 0);
    }
}
```

```toml
# calc/calc_cli/Cargo.toml
[package]
name = "calc_cli"
version = "0.1.0"
edition.workspace = true

[dependencies]
calc_core = { path = "../calc_core" }
```

```rust
// calc/calc_cli/src/main.rs
fn main() {
    println!("2 + 3 = {}", calc_core::add(2, 3));
}
```

```text
$ cargo test              # all members
$ cargo run -p calc_cli
2 + 3 = 5
```

There is one `Cargo.lock` and one `target` folder at the top. When you change only the program, the library is not rebuilt. The library has no idea that a command-line program uses it, so the same library could later serve a web server or a graphical program as well.
:::

:::exercise challenge An optional feature
Add a feature `colour` to a small library. The function `warning(text: &str) -> String` returns the text unchanged by default. With the feature on, it wraps the text in the terminal codes for yellow: `"\x1b[33m"` before and `"\x1b[0m"` after. Write a test for each configuration, and run both.
::hint
Declare the feature under `[features]` as `colour = []`. Write the function twice, one version under `#[cfg(feature = "colour")]` and one under `#[cfg(not(feature = "colour"))]`. Put the same attributes on the two tests. Run `cargo test` and `cargo test --features colour`.
::solution
```toml
[features]
colour = []
```

```rust test
#[cfg(feature = "colour")]
pub fn warning(text: &str) -> String {
    format!("\x1b[33m{text}\x1b[0m")
}

#[cfg(not(feature = "colour"))]
pub fn warning(text: &str) -> String {
    text.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(not(feature = "colour"))]
    fn plain_by_default() {
        assert_eq!(warning("careful"), "careful");
    }

    #[test]
    #[cfg(feature = "colour")]
    fn yellow_with_the_feature() {
        assert_eq!(warning("careful"), "\x1b[33mcareful\x1b[0m");
    }
}
```

```text
$ cargo test                      # runs plain_by_default
$ cargo test --features colour    # runs yellow_with_the_feature
```

Exactly one of the two functions exists in any build, so they can share a name. A feature with an empty list, `colour = []`, enables no dependency. It is a pure switch for `cfg`.

Does this feature keep the rule "features only add"? Not strictly: it changes the result of an existing function. For output decoration that is harmless. For anything other code might rely on, a better design adds a *second* function, such as `warning_coloured`, behind the feature. Test both configurations in your automated checks, because code behind a feature that is off is not even compiled.
:::
