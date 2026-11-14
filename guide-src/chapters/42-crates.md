@id crates
@part p10
@title The crate ecosystem: finding and using libraries
@short Finding and using crates
@level intermediate
@time 50
@learn Find crates for a task and judge their quality | Read a crate's documentation efficiently | Use the everyday crates: `rand`, `regex`, `chrono`, `itertools`, `tracing` | Name the standard choice for each common task | Keep dependencies safe and under control

Rust's standard library is small on purpose. It has no random numbers, no regular expressions, no dates, no JSON and no HTTP. All of these live in **crates**: libraries published on **crates.io**, the community's registry, which holds well over 150,000 of them. Knowing the language is half of being productive in Rust. The other half is knowing which crate to reach for.

This chapter shows how to find and judge crates, and introduces the ones you will use in almost every project. The chapters after it go deeper into the main areas: data formats, command-line tools, async and web, databases, and applications.

:::analogy A toolbox with a label on every drawer
The standard library is the set of tools that comes with the workbench. Crates are the tools you choose for a particular job. A label helps you reach for the right tool, but before using one you still check that it fits, is maintained, and has no hidden damage. In the same way, learn a crate's job and check its source, docs, dependencies and release history before trusting it in a project.
:::

## Where to look

| Site | What it gives you |
|---|---|
| **crates.io** | the official registry: search, download numbers, versions, links |
| **lib.rs** | a different view of the same crates, with better categories and ranking |
| **docs.rs** | the documentation of every version of every crate, built automatically |
| **blessed.rs** | a short, hand-picked list of recommended crates for each task |
| **The Rust Cookbook** | example code for common tasks, using well-known crates |
| **This Week in Rust** | a weekly newsletter with new releases and articles |

On the command line, `cargo search json` searches the registry, and `cargo info serde_json` shows a crate's description, licence, versions and features.

## Judging a crate

:::analogy Choosing parts for a bridge
Before bolting a third-party girder into a bridge, an engineer checks who manufactured it, whether it has been stress-tested on other bridges, and whether the supplier still answers the phone. Picking a crate from crates.io works the same way: download counts, maintenance activity, documentation, dependency tree weight and licence tell you within two minutes whether you can trust a dependency in production.
:::

Anyone can publish a crate, so you need to look before you depend on one. A checklist that takes two minutes:

1. **Is it widely used?** The download numbers and the list of "dependents" on crates.io tell you. A crate used by thousands of others has had its bugs found.
2. **Is it maintained?** Look at the date of the last release and at the repository: are issues answered, are pull requests merged? A finished, stable crate may be quiet, and that is fine. Unanswered bug reports are not.
3. **Is it documented?** Open docs.rs. Is there an introduction and an example? Do the main types have descriptions?
4. **What does it pull in?** `cargo tree` shows its dependencies. Fewer is better, for build time and for risk.
5. **Which licence?** `MIT` and `Apache-2.0` are the usual ones and allow nearly everything. Check that the licence fits your project, especially for commercial work.
6. **Is it at version 1.0 or above?** Many excellent crates are at 0.x. Below 1.0, expect breaking changes between minor versions.
7. **Does it use `unsafe`, and with care?** For low-level crates that is normal. Look for a test suite, and for the use of Miri and fuzzing.

:::warn Check the name letter by letter
Attackers sometimes publish crates whose names look almost like popular ones, hoping for a typing mistake. This is called **typosquatting**. Copy the name from the crate's documentation, or use `cargo add`, and look at what was added.
:::

## Reading documentation on docs.rs

Every crate's documentation has the same structure, which makes any crate quick to learn:

- The **front page** has an introduction, usually with a complete example. Start here.
- **Modules, structs, enums, traits, functions** are listed with one line each. Click through to the main type.
- On a type's page, look at the **methods** first, then at **trait implementations**: these tell you whether it is `Clone`, `Debug`, `Send`, or can be used with `?`, `for`, or `serde`.
- The **search box** at the top searches names, and also signatures: `&str -> u32` finds functions that turn text into a number.
- **"Source"** links show the implementation. Reading good crates is a fine way to learn.
- The **feature flags** page lists the optional features.

The examples in documentation are compiled as tests, so they work with the version you are looking at.

## Everyday crates

The examples below can be tried in any project after `cargo add` with the crate's name. The versions are those current when this guide was written.

### `rand`: random numbers

```toml
rand = "0.10.3"
```

```rust ext run
use rand::rngs::StdRng;
use rand::seq::{IndexedRandom, SliceRandom};
use rand::{RngExt, SeedableRng};

fn main() {
    // The quick way: free functions that use a generator hidden in each thread
    let dice: u32 = rand::random_range(1..=6);
    let coin: bool = rand::random();
    println!("{} {}", (1..=6).contains(&dice), coin || !coin);

    // A generator of your own
    let mut rng = rand::rng();
    let percent: f64 = rng.random();                 // from 0.0 up to, not including, 1.0
    let letter = rng.random_range('a'..='z');
    println!("{} {}", (0.0..1.0).contains(&percent), letter.is_ascii_lowercase());

    // Choosing and shuffling
    let names = ["Sara", "Tomas", "Lena", "Abel"];
    let winner = names.choose(&mut rng).expect("the list is not empty");
    let mut order = names.to_vec();
    order.shuffle(&mut rng);
    println!("{} {}", names.contains(winner), order.len());

    // A seeded generator gives the same sequence on every run
    let mut first = StdRng::seed_from_u64(42);
    let mut second = StdRng::seed_from_u64(42);
    let a: Vec<u32> = (0..5).map(|_| first.random_range(0..100)).collect();
    let b: Vec<u32> = (0..5).map(|_| second.random_range(0..100)).collect();
    println!("{}", a == b);
}
```
```output
true true
true true
true 4
true
```

The program prints facts about the random values, and not the values themselves, so that its output is the same on every run. Three points to remember:

- `rand::random_range(1..=6)` is all you need for simple cases.
- The methods on a generator (`random`, `random_range`) come from the trait `RngExt`, which must be imported.
- A generator created with a **seed** produces the same numbers every time. Use it for tests and for simulations that must be repeatable. The default generator is safe for security purposes such as tokens. A seeded one is predictable by design.

### `regex`: searching text with patterns

A **regular expression** is a small pattern language for text: `\d` is a digit, `{4}` means "four times", parentheses capture a part.

```toml
regex = "1.13.1"
```

```rust ext run
use regex::Regex;

fn main() {
    let date = Regex::new(r"(\d{4})-(\d{2})-(\d{2})").expect("the pattern is valid");
    let text = "Released on 2026-11-12, updated 2027-01-05.";

    println!("{}", date.is_match(text));

    for found in date.find_iter(text) {
        println!("found {} at byte {}", found.as_str(), found.start());
    }

    for (_, [year, month, day]) in date.captures_iter(text).map(|c| c.extract()) {
        println!("day {day}, month {month}, year {year}");
    }

    println!("{}", date.replace_all(text, "$3.$2.$1"));

    let separators = Regex::new(r"[,;\s]+").expect("the pattern is valid");
    let parts: Vec<&str> = separators.split("tea, milk;bread   salt").collect();
    println!("{:?}", parts);
}
```
```output
true
found 2026-11-12 at byte 12
found 2027-01-05 at byte 32
day 12, month 11, year 2026
day 05, month 01, year 2027
Released on 12.11.2026, updated 05.01.2027.
["tea", "milk", "bread", "salt"]
```

- Patterns are written as **raw strings**, `r"..."`, in which a backslash is an ordinary character.
- Building a `Regex` is costly. Do it once, and not inside a loop. For a pattern used in many places, keep it in a `static` with `LazyLock`.
- This crate guarantees that matching time grows only in proportion to the length of the text. Some regex engines in other languages can be brought to a standstill by a crafted input. This one cannot.

For simple checks, the standard string methods (`contains`, `split`, `strip_prefix`, `find`) are simpler and faster than a regex.

### `chrono`: dates and times

```toml
chrono = "0.4.45"
```

```rust ext run
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, TimeZone, Utc, Weekday};

fn main() {
    let launch = NaiveDate::from_ymd_opt(2026, 11, 12).expect("a valid date");
    println!("{} is a {:?}, day {} of the year", launch, launch.weekday(), launch.ordinal());

    let later = launch + Duration::days(100);
    println!("{} {}", later, (later - launch).num_weeks());

    let parsed = NaiveDate::parse_from_str("05.01.2027", "%d.%m.%Y").expect("matches the format");
    println!("{}", parsed.format("%A, %e %B %Y"));
    println!("{}", parsed.weekday() == Weekday::Tue);

    let moment = NaiveDateTime::parse_from_str("2026-11-12 14:30:00", "%Y-%m-%d %H:%M:%S").expect("matches");
    let utc = Utc.from_utc_datetime(&moment);
    println!("{} {}", utc.to_rfc3339(), utc.timestamp());

    println!("{}", NaiveDate::from_ymd_opt(2026, 2, 30).is_none());
    println!("{}", Utc::now().year() >= 2026);
}
```
```output
2026-11-12 is a Thu, day 316 of the year
2027-02-20 14
Tuesday,  5 January 2027
true
2026-11-12T14:30:00+00:00 1794493800
true
true
```

- A **"naive"** date or time has no time zone: `NaiveDate`, `NaiveDateTime`. `DateTime<Utc>` and `DateTime<Local>` are moments in a specific zone.
- Constructors such as `from_ymd_opt` return an `Option`, because 30 February does not exist.
- `Utc::now()` reads the clock. Dates can be subtracted, and a `Duration` can be added.
- Format codes like `%Y-%m-%d` follow the convention of C's `strftime`.

:::tip Store UTC, show local time
Keep and compare moments in UTC (or as timestamps), and convert to the user's time zone only for display. Mixing local times causes bugs around daylight saving changes. The standard library's `std::time::Instant` is the right tool for measuring how long something takes. Besides `chrono`, the crates `time` and `jiff` are good modern choices. `jiff` is especially careful about time zones.
:::

### Time zones, durations, and the format on the wire

Almost every date bug comes from mixing up three questions that look like one. Ask them separately and the bugs disappear:

1. **Which instant in time is it?** Store this. A moment is universal; it is the same moment in every city.
2. **Which zone should the reader see it in?** A display decision, made at the edge, from the user's setting — not stored.
3. **How is it written down?** One format on the wire, chosen once for the whole system.

The consequence: **store UTC, display local, and always store an instant rather than a wall-clock time.** `2026-11-14T09:12:03Z` and `2026-11-14T12:12:03+03:00` are the same moment written two ways. That format is **RFC 3339** (a profile of ISO 8601), and it is what JSON APIs and HTTP headers use, because it is sortable as text, unambiguous, and readable by a human. In PostgreSQL the column type is `TIMESTAMPTZ`; in SQLite, store the RFC 3339 string or a Unix timestamp as an integer. Always parse incoming offset strings with `DateTime::parse_from_rfc3339` and normalise immediately to **`DateTime<Utc>`**:

```rust ext run
use chrono::{DateTime, Days, Months, NaiveDate, Utc};

fn main() -> Result<(), chrono::ParseError> {
    // Parse an offset timestamp from an API and normalise to UTC
    let raw = "2026-11-14T18:30:00+03:00";
    let utc: DateTime<Utc> = DateTime::parse_from_rfc3339(raw)?.with_timezone(&Utc);
    println!("UTC: {}", utc.to_rfc3339());

    // Calendar-aware month addition clamps at month-end instead of overflowing
    let jan31 = NaiveDate::from_ymd_opt(2026, 1, 31).unwrap();
    let feb28 = jan31.checked_add_months(Months::new(1)).unwrap();
    let plus_ten = jan31.checked_add_days(Days::new(10)).unwrap();
    println!("+1 month: {feb28}, +10 days: {plus_ten}");
    Ok(())
}
```
```output
UTC: 2026-11-14T15:30:00+00:00
+1 month: 2026-02-28, +10 days: 2026-02-10
```

A **time zone** is more than an offset: it is a set of rules that a government can change. That is why the rules ship as a database (`tzdata`, the IANA list) and why a program that calculates "9 a.m. tomorrow in Berlin" needs one. `chrono-tz` provides the zone list for `chrono`.

Two traps worth naming:

- **Daylight saving.** One hour of the year is skipped and one is lived twice. A local time such as 02:30 on a changeover day may not exist (`LocalResult::None`), or may exist twice (`LocalResult::Ambiguous`). Never call `.unwrap()` when converting a `NaiveDateTime` into a zoned local time. Arithmetic on local *wall-clock* times is therefore ambiguous — do it in UTC or on an `Instant`, and convert only for display. A zone with no daylight saving, such as East Africa Time (UTC+03:00 all year), does not have this problem, which is why code written there can look fine and fail in Berlin.
- **A birthday is not an instant.** A birth date, an invoice date or a business day is a *calendar date*: `NaiveDate` in `chrono`, `Date` in `jiff`. Storing it as a timestamp at midnight UTC makes it the wrong day for half the planet.

The three crates, honestly compared:

| Crate | Strength | Choose it when |
|---|---|---|
| `chrono` | The most widely used, with the widest ecosystem support (`sqlx`, `serde`, `uuid`) and the examples in this book | You want the default, and the docs you will find everywhere |
| `time` | Stricter API, no implicit local-time reading, good formatting | You want compile-time checks on formats and a smaller surface |
| `jiff` | Modern design, built-in IANA TZDB (`Zoned`), RFC 3339 as the native format | Time zones and human-facing dates are central to the program. For new code in 2025 onwards, a good first choice |

For the wire: with the `serde` feature, `chrono`'s `DateTime<Utc>` serialises to an RFC 3339 string and parses back from one, which is exactly what you want in JSON. Durations in configuration are best written for humans — `"30s"`, `"5m"`, `"2h"` — and parsed with `humantime` (or `humantime_serde` as a serde attribute) rather than a raw number of milliseconds that nobody can read six months later.

### `itertools`: more iterator tools

```toml
itertools = "0.15.0"
```

```rust ext run
use itertools::Itertools;

fn main() {
    let words = ["pear", "fig", "apple", "fig", "kiwi", "pear"];

    println!("{}", words.iter().join(" + "));
    println!("{:?}", words.iter().unique().collect_vec());
    println!("{:?}", words.iter().sorted().dedup().collect_vec());
    println!("{:?}", words.iter().counts().into_iter().sorted().collect_vec());

    for (a, b) in [1, 2, 3, 4].iter().tuple_windows() {
        print!("{a}-{b} ");
    }
    println!();

    let by_length = words.iter().unique().sorted().into_group_map_by(|w| w.len());
    println!("{:?}", by_length.into_iter().sorted().collect_vec());

    println!("{:?}", (1..=3).cartesian_product("ab".chars()).collect_vec());
    println!("{:?}", [1, 2, 3].iter().combinations(2).collect_vec());
    println!("{:?}", [3, 1, 2].iter().minmax());
    println!("{:?}", (1..=7).chunks(3).into_iter().map(|c| c.sum::<i32>()).collect_vec());
}
```
```output
pear + fig + apple + fig + kiwi + pear
["pear", "fig", "apple", "kiwi"]
["apple", "fig", "kiwi", "pear"]
[("apple", 1), ("fig", 2), ("kiwi", 1), ("pear", 2)]
1-2 2-3 3-4 
[(3, ["fig"]), (4, ["kiwi", "pear"]), (5, ["apple"])]
[(1, 'a'), (1, 'b'), (2, 'a'), (2, 'b'), (3, 'a'), (3, 'b')]
[[1, 2], [1, 3], [2, 3]]
MinMax(1, 3)
[6, 15, 7]
```

Importing the trait `Itertools` adds dozens of methods to every iterator. `counts()` is the word-count map of chapter 15 in one call, and `into_group_map_by` is the grouping loop of chapter 25.

### `tracing`: logging

A program that runs for hours cannot be debugged with `println!`. **Logging** writes messages with a time, a severity **level**, and structured data, and lets you choose at run time how much you want to see. The modern standard is **`tracing`**, with **`tracing-subscriber`** to print the messages.

```toml
tracing = "0.1.44"
tracing-subscriber = "0.3.23"
```

```rust ext run
use tracing::{debug, error, info, instrument, warn, Level};

#[instrument]
fn divide(a: i32, b: i32) -> Option<i32> {
    if b == 0 {
        warn!("division by zero");
        return None;
    }
    debug!(result = a / b, "divided");
    Some(a / b)
}

fn main() {
    tracing_subscriber::fmt()
        .with_max_level(Level::DEBUG)
        .without_time()
        .with_target(false)
        .with_ansi(false)
        .with_writer(std::io::stdout)
        .init();

    info!("starting");
    divide(10, 2);
    divide(1, 0);
    error!(code = 7, "something failed");
}
```
```output
 INFO starting
DEBUG divide{a=10 b=2}: divided result=5
 WARN divide{a=1 b=0}: division by zero
ERROR something failed code=7
```

- The five levels, from most to least detailed: `trace!`, `debug!`, `info!`, `warn!`, `error!`. A program in production usually shows `info` and above.
- Messages can carry **fields** (`result = …`, `code = 7`) in addition to text. Tools can filter and search by them.
- `#[instrument]` wraps a function in a **span**: a named stretch of time. Every message inside shows which call it belongs to, with the arguments (`divide{a=1 b=0}`). In async programs, where many tasks are interleaved, this is what makes logs readable.
- The example switches off the time stamp and colours to keep the output stable. Normally you would just call `tracing_subscriber::fmt::init()`.

`tracing` is powerful, but a small program does not need spans and fields. The crate **`log`** is a *facade*: it provides the macros (`error!`, `warn!`, `info!`, `debug!`, `trace!`) and nothing more. A library should depend on `log` and call its macros — and never decide where messages go. The crate **`env_logger`** is a small logger implementation, and the environment variable `RUST_LOG` chooses how much to see.

```toml
log = "0.4"
env_logger = "0.11"
```

A tiny program with a logger:

```rust ext run nocmp
use std::io::Write;

use env_logger::Builder;
use env_logger::Env;
use log::{debug, error, info, warn};

fn work(items: &[&str]) {
    info!("processing {} items", items.len());
    for item in items {
        if item.is_empty() {
            warn!("skipping an empty item");
        }
    }
    debug!("a detail only useful while developing");
}

fn main() {
    Builder::from_env(Env::default().default_filter_or("trace"))
        .target(env_logger::Target::Stdout)     // stdout keeps this example's captured output visible
        .format(|buf, record| writeln!(buf, "{}: {}", record.level(), record.args()))
        .init();

    work(&["tea", "", "milk"]);
    error!("could not reach the server");
}
```

```output
INFO: processing 3 items
WARN: skipping an empty item
DEBUG: a detail only useful while developing
ERROR: could not reach the server
```

- The `format` closure decides what each line looks like; here it is just the level and the message. `env_logger` writes to standard error by default; this example explicitly uses standard output so the captured lines are visible here.
- `default_filter_or("trace")` shows everything during development. Without any `RUST_LOG` setting, `info` and above would be enough for production.
- `error!` shows even though nothing catches it: logging does not stop the program.

```text
$ RUST_LOG=warn myprogram
WARN: skipping an empty item
ERROR: could not reach the server
```
hides `info` and `debug`. The filter is a pattern: `mycrate=debug` shows debug messages from one crate only, and `info` shows the rest.

| | `log` + `env_logger` | `tracing` |
|---|---|---|
| What you write | one message per call | messages with fields, inside named spans |
| Async tasks | hard to tell which task said what | spans follow the task (`#[instrument]`) |
| Best fit | small tools, command-line programs | services, servers, async code |

This chapter introduces the basics for scripts and small programs. For structured JSON logging in production, request IDs across async tasks, OpenTelemetry distributed traces, Prometheus metrics, and health probes, see [chapter 51](#observability).

:::compare Logging, not printing
A library logs; an application decides where the logs go. `log` and `tracing` both leave the decision to `main`. A library that calls `println!` forces its output on everybody.
:::

## A map of the ecosystem

The standard choice for each common task. Where two are listed, both are good, and the first is the more widely used.

| Task | Crates |
|---|---|
| Error handling | `anyhow` (applications), `thiserror` (libraries) |
| Serialisation | `serde` with `serde_json`, `toml`, `csv`, `rmp-serde`, `postcard` |
| Command-line arguments | `clap` |
| Terminal output | `indicatif` (progress bars), `colored` or `owo-colors`, `ratatui` (full-screen interfaces) |
| Async runtime | `tokio` |
| HTTP client | `reqwest` |
| Web server | `axum`, `actix-web`, `rocket` |
| Databases | `sqlx`, `diesel`, `sea-orm`, `rusqlite` |
| Caches and key-value servers | `redis`, `fred` |
| Documents | `mongodb` |
| Parallel computing | `rayon` |
| Concurrency tools | `crossbeam`, `parking_lot`, `dashmap` |
| Random numbers | `rand` |
| Dates and times | `chrono`, `time`, `jiff` |
| Regular expressions | `regex` |
| Logging and tracing | `tracing`, `log` |
| Metrics | `metrics` with `metrics-exporter-prometheus`, or `prometheus` |
| Traces and export | `opentelemetry`, `tracing-opentelemetry`, `opentelemetry-otlp` |
| Configuration | `figment`, `config`, `dotenvy`, `secrecy`, `humantime` |
| gRPC and Protocol Buffers | `tonic`, `prost` |
| GraphQL | `async-graphql`, `juniper` |
| WebSockets | `axum`'s built-in `ws`, `tokio-tungstenite` |
| Message queues | `async-nats`, `rdkafka` (Kafka), `lapin` (RabbitMQ) |
| Sessions and authentication | `tower-sessions`, `axum-login`, `jsonwebtoken`, `oauth2`, `openidconnect` |
| Rate limiting | `tower-governor`, `governor` |
| Validation | `validator`, `garde` |
| Embedded key-value stores | `redb`, `fjall`, `sled` |
| Search | `tantivy` (SQLite's FTS5 is the built-in alternative) |
| Object storage | `object_store`, `aws-sdk-s3` |
| Shell completions and man pages | `clap_complete`, `clap_mangen` |
| Release automation | `release-plz`, `cargo-release`, `cargo-dist`, `cargo-msrv` |
| Distributed systems | `openraft`, `etcd-client` |
| Unique ids | `uuid` |
| Testing | `proptest`, `insta`, `criterion`, `mockall`, `rstest` |
| Text | `unicode-segmentation` (graphemes), `unicode-width` |
| Cryptography | `ring`, `rustls`, the RustCrypto crates (`sha2`, `aes-gcm`, `argon2`) |
| Compression | `flate2`, `zstd`, `zip`, `tar` |
| Images | `image` |
| File system | `walkdir`, `tempfile`, `notify` (watch for changes), `directories` |
| Enum helpers | `strum`, `bitflags` |
| Numbers | `num`, `rust_decimal` (exact decimals for money), `ndarray` |
| Parsing | `nom`, `winnow`, `pest`, `logos` |
| Macros | `syn`, `quote`, `proc-macro2` |
| Graphical interfaces | `egui`, `iced`, `slint`, `tauri` |
| Games | `bevy`, `macroquad` |
| WebAssembly | `wasm-bindgen`, `leptos`, `yew`, `dioxus` |
| Embedded | `embedded-hal`, `embassy` |
| Other languages | `pyo3`, `napi`, `cxx`, `uniffi`, `bindgen` |

:::warn Never write your own cryptography
Use the established crates for passwords, encryption and secure connections. A home-made cipher or hash is broken in ways its author cannot see. Passwords are stored with a slow, salted hash made for the purpose, such as `argon2`, and never in readable form.
:::

## Keeping dependencies healthy

Each dependency is code you did not write, running with all the rights of your program.

- **Add what you need, and no more.** For a ten-line helper, writing it yourself may be better than a new dependency.
- **Disable features you do not use**: `default-features = false`, and then enable what is needed.
- **Update regularly**: `cargo update` for compatible versions, `cargo outdated` to see newer major versions. Read the changelog for major updates.
- **Audit**: `cargo audit` checks against the database of known vulnerabilities. Run it in CI.
- **Watch for duplicates**: `cargo tree -d` lists crates that are compiled twice in different versions.
- **Remove what is no longer used.** Cargo warns about a dependency that no code uses (`warning: unused dependency`). `cargo remove <name>` deletes it from `Cargo.toml`.
- **Commit `Cargo.lock`.**

:::compare Package ecosystems
- **JavaScript's npm** is the largest registry of all, with a culture of very small packages. **Python's PyPI** is similarly broad, and the standard library there is large ("batteries included").
- **C and C++** have no central registry, and adding a library is real work, so programmers often rewrite things.
- **Rust** sits in between: a small standard library, a central registry, and a culture of focused, well-documented crates. Because adding a crate is one command and the compiler checks how you use it, Rust programs tend to use many of them. The other side of that ease is the need to choose with care.
:::

:::recap
- The standard library is small. Most functionality comes from crates on crates.io, documented on docs.rs.
- Judge a crate by use, maintenance, documentation, dependencies, licence and version.
- `rand` for randomness, `regex` for text patterns, `chrono` for dates, `itertools` for extra iterator methods, `tracing` for logging.
- `log` is a logging facade for libraries; an application can install `env_logger` and let `RUST_LOG` control its output.
- For every common task there is a well-known standard crate. The table in this chapter is your map.
- Keep dependencies few, current and audited.
:::

:::quiz Check your understanding
? Where do you find the documentation of any published crate?
- On crates.io, as a PDF
+ On docs.rs, built automatically for every version
- Only in the crate's source code
- In the Rust standard library documentation
= docs.rs builds and hosts the documentation for every release of every crate, in the same format as the standard library's.

? Which sign suggests that a crate may be a risky choice?
- It is at version 0.9
- It has not had a release in three months
+ Its bug reports and pull requests have had no reply for years
- It depends on `serde`
= A quiet crate can simply be finished. Unanswered reports mean that nobody is looking after it. Many solid crates are below 1.0.

? Why build a `Regex` once and reuse it, and not inside a loop?
- A `Regex` can be used only once
+ Compiling the pattern is expensive, while matching with a compiled regex is fast
- It would not compile inside a loop
- Loops cannot contain `expect`
= `Regex::new` parses and compiles the pattern. Doing that for every item wastes most of the running time.

? When is a random number generator with a fixed seed the right choice?
- For generating passwords
+ For tests and simulations that must give the same result on every run
- Never
- For shuffling a deck in an online casino
= A seeded generator is repeatable, which is valuable for testing and useless for security. Secrets need the default, unpredictable generator.

? What does `#[instrument]` from `tracing` add to a function?
- It makes the function faster
- It retries the function on failure
+ It creates a span, so that log messages inside show the function's name and arguments
- It prints the return value
= Spans give log messages context. In concurrent programs they show which request or task a message belongs to.
:::

:::exercise guided Dice statistics
Roll a six-sided die 60,000 times with a generator seeded with the number 2026, count how often each face appears, and print whether every face came up between 9,500 and 10,500 times.
::hint
`let mut rng = StdRng::seed_from_u64(2026);`, then `rng.random_range(1..=6)` in a loop. Count in an array `[0_u32; 6]`, using `face - 1` as the index.
::solution
```rust ext run
use rand::rngs::StdRng;
use rand::{RngExt, SeedableRng};

fn main() {
    let mut rng = StdRng::seed_from_u64(2026);
    let rolls = 60_000;

    let mut counts = [0_u32; 6];
    for _ in 0..rolls {
        let face: usize = rng.random_range(1..=6);
        counts[face - 1] += 1;
    }

    let fair = counts.iter().all(|&c| (9_500..=10_500).contains(&c));
    println!("{} rolls, every face between 9500 and 10500 times: {fair}", counts.iter().sum::<u32>());
}
```
```output
60000 rolls, every face between 9500 and 10500 times: true
```

Each face is expected 10,000 times. With a fair generator, a count is almost never more than a few hundred away from that. Because the generator is seeded, the program gives the same counts on every run, which makes the result checkable. Replace the seeded generator by `rand::rng()`, and the exact counts change from run to run while the conclusion stays.
:::

:::exercise practice Age and days
Write `age_on(birthday: NaiveDate, today: NaiveDate) -> u32` that returns a person's age in whole years. Test it for someone born on 14 March 1995, on the day before and on the day of their birthday in 2027. Then print how many days lie between 13 March 2027 and New Year's Day 2028.
::hint
Start with `today.year() - birthday.year()`, and subtract one if the birthday has not yet come this year. Comparing the tuples `(month, day)` does that in one step. Two dates can be subtracted, which gives a duration with a method `num_days()`.
::solution
```rust ext run
use chrono::{Datelike, NaiveDate};

fn age_on(birthday: NaiveDate, today: NaiveDate) -> u32 {
    let mut age = today.year() - birthday.year();
    if (today.month(), today.day()) < (birthday.month(), birthday.day()) {
        age -= 1;
    }
    age.max(0) as u32
}

fn main() {
    let birthday = NaiveDate::from_ymd_opt(1995, 3, 14).expect("a valid date");

    let before = NaiveDate::from_ymd_opt(2027, 3, 13).expect("a valid date");
    let on_the_day = NaiveDate::from_ymd_opt(2027, 3, 14).expect("a valid date");
    println!("{} {}", age_on(birthday, before), age_on(birthday, on_the_day));

    let new_year = NaiveDate::from_ymd_opt(2028, 1, 1).expect("a valid date");
    println!("{} days until {}", (new_year - before).num_days(), new_year.format("%e %B %Y"));
    println!("{:?}", before.weekday());
}
```
```output
31 32
294 days until  1 January 2028
Sat
```

Tuples are compared element by element, so `(month, day) < (month, day)` asks exactly "is today earlier in the year than the birthday?". The function takes `today` as a parameter and does not call `Utc::now()` itself. That is the dependency injection of [chapter 41](#testing-strategies): the function can be tested for any date. Date arithmetic by hand, with month lengths and leap years, is a classic source of bugs. The crate has them right.
:::

:::exercise challenge Analyse a log
Combine three crates. Given the log text below, use `regex` to take each line apart, `chrono` to parse the time, and `itertools` to summarise. Print the number of valid entries, the count per level in alphabetical order, the number of minutes between the first and the last entry, and every error message that occurs more than once.

```text
2026-11-12 14:30:05 INFO  server started
2026-11-12 14:30:09 WARN  disk almost full
2026-11-12 14:31:40 ERROR could not save file
this line is broken
2026-11-12 14:35:02 INFO  backup finished
2026-11-12 14:41:17 ERROR could not save file
```
::hint
A pattern with three groups: `^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (\w+)\s+(.*)$`. Use `filter_map` twice: once to drop lines that do not match, once to drop times that do not parse. `counts()` gives the per-level map, `minmax()` the first and last time, and `duplicates()` the repeated messages.
::solution
```rust ext run
use chrono::NaiveDateTime;
use itertools::Itertools;
use regex::Regex;

const LOG: &str = "\
2026-11-12 14:30:05 INFO  server started
2026-11-12 14:30:09 WARN  disk almost full
2026-11-12 14:31:40 ERROR could not save file
this line is broken
2026-11-12 14:35:02 INFO  backup finished
2026-11-12 14:41:17 ERROR could not save file
";

fn main() {
    let pattern = Regex::new(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (\w+)\s+(.*)$").expect("a valid pattern");

    let entries: Vec<(NaiveDateTime, &str, &str)> = LOG
        .lines()
        .filter_map(|line| pattern.captures(line))
        .filter_map(|caps| {
            let (_, [time, level, message]) = caps.extract();
            let time = NaiveDateTime::parse_from_str(time, "%Y-%m-%d %H:%M:%S").ok()?;
            Some((time, level, message))
        })
        .collect();

    println!("{} entries", entries.len());

    for (level, count) in entries.iter().map(|(_, level, _)| *level).counts().into_iter().sorted() {
        println!("{level:<5} {count}");
    }

    if let Some((first, last)) = entries.iter().map(|(time, _, _)| *time).minmax().into_option() {
        println!("covers {} minutes", (last - first).num_minutes());
    }

    let repeated = entries
        .iter()
        .filter(|(_, level, _)| *level == "ERROR")
        .map(|(_, _, message)| *message)
        .duplicates()
        .join(", ");
    println!("repeated errors: {repeated}");
}
```
```output
5 entries
ERROR 2
INFO  2
WARN  1
covers 11 minutes
repeated errors: could not save file
```

Each crate does the part it is good at. The regex separates the fields and rejects the broken line. `chrono` turns the text into a real time that can be subtracted. `itertools` supplies the summaries as single method calls. The glue between them is ordinary iterator code, and the borrowed `&str` pieces point into the original log text with no copies.

This is what working in Rust looks like much of the time: a few well-chosen crates, joined by a small amount of your own code.
:::
