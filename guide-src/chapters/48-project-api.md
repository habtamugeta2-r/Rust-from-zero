@id project-api
@part p11
@kind project
@title Project: a link shortener with a web API and a database
@short Project: web API
@level advanced
@time 180
@learn Plan a web service as three layers: HTTP, rules and storage | Keep all SQL inside one repository type | Turn every failure into a clear JSON response | Protect routes with an API key | Test the whole API without opening a network port | Prepare a service for a real server

In this project you build a complete web service: a **link shortener**. It turns a long web address into a short one. When somebody opens the short address, the service sends the browser on to the long one and counts the visit. Services such as bit.ly work this way.

This is the finished program at work. `curl` is the command-line HTTP client from [chapter 64](#web). `-X POST` chooses the method, `-H` adds a header, `-d` supplies the body, and `-i` also shows the status line and the headers of the response.

```text
$ curl -X POST http://localhost:3000/links -H 'content-type: application/json' -d '{"url": "https://doc.rust-lang.org/book/", "code": "book"}'
{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":0,"created_at":"2026-11-14 16:08:42"}

$ curl -i http://localhost:3000/book
HTTP/1.1 307 Temporary Redirect
location: https://doc.rust-lang.org/book/
content-length: 0
date: Sat, 14 Nov 2026 16:08:42 GMT

$ curl http://localhost:3000/links/book
{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":1,"created_at":"2026-11-14 16:08:42"}
```

The first request stores a link under the code `book`. The second one follows it: the answer `307 Temporary Redirect` with a `location` header tells a browser where to go next. The third one shows the facts about the link, with one visit counted.

The project brings together everything from the last few chapters: Axum for HTTP ([chapter 64](#web)), SQLx with SQLite for storage ([chapter 68](#databases)), Serde for JSON ([chapter 78](#serde)), and `thiserror`, `anyhow`, `tracing` and `rand` from [chapter 77](#crates). It also keeps a promise made in [chapter 72](#testing-strategies): the tests exercise the whole API without a network.

:::plain HTTP semantics, storage, and layering
A JSON API is three layers stacked. **Routing** maps `method + path` to a handler and decides status codes, which is where REST lives: `GET` is safe, `POST` creates, `PUT` replaces, `DELETE` removes, and `201`, `204`, `307`, `404` and `422` each mean something specific. **Storage** is SQLx against SQLite, with queries checked at compile time and a transaction per request. **State** is a pool, cloned into every handler through `with_state`. Keeping the three apart is what makes the API testable without a network and swappable later — the same handlers run against a test database with no code changes.
:::

:::analogy A cloakroom for web addresses
A link shortener works like the cloakroom of a theatre. You hand over a bulky coat (a long address) and get a small ticket (a short code). Whoever shows the ticket is led to the coat.

The cloakroom also shows how the program is organised. The attendant at the counter talks to the visitors. A sheet of rules says which coats are accepted. And only the clerk in the back walks among the racks. Each of the three has one job, and none does the job of another.
:::

## Step 0: plan

### The API

| Request | Who may call it | What it does | Success |
|---|---|---|---|
| `POST /links` | everybody | stores a link. The body is JSON: `{"url": "…"}`, or `{"url": "…", "code": "…"}` to choose the code | 201 Created |
| `GET /{code}` | everybody | sends the browser to the long address and counts the visit | 307 Temporary Redirect |
| `GET /links/{code}` | everybody | shows the facts about one link | 200 OK |
| `GET /links` | the owner | lists links, the most visited first. `?limit=20&offset=0` selects a page | 200 OK |
| `DELETE /links/{code}` | the owner | removes a link | 204 No Content |
| `GET /health` | everybody | answers `ok` if the service and its database work | 200 OK |

The owner proves who they are with a secret **API key**, sent in the header `x-api-key`.

Every failure is answered with a fitting status code and a small JSON document:

```text
{"error":"the code 'book' is already in use"}
```

| Status | When |
|---|---|
| 400 Bad Request | the body is not valid JSON |
| 401 Unauthorized | the API key is missing or wrong |
| 404 Not Found | there is no such link, or no such path |
| 409 Conflict | the chosen code is taken |
| 415 Unsupported Media Type | the body is not declared as JSON |
| 422 Unprocessable Entity | the JSON is readable, but a value breaks a rule |
| 500 Internal Server Error | the database failed |

:::note A `GET` that counts
By the rules of HTTP, a `GET` request should only read. Following a short link also adds one to a counter. That is accepted practice: the client did not ask for a change, and a visit counter is comparable to a line in a log file.
:::

### The data

One table is enough:

| Column | Type | Meaning |
|---|---|---|
| `code` | text, primary key | the short code, such as `book` |
| `url` | text | the long address |
| `hits` | integer | how often the link was followed |
| `created_at` | text | when the link was stored |

### The layers

The program has three layers, and each knows only the one below it:

```text
        request                              response
           │                                    ▲
           ▼                                    │
┌──────────────────────────────────────────────────────────────┐
│ routes.rs     HTTP: paths, JSON, status codes, the API key   │
├──────────────────────────────────────────────────────────────┤
│ validate.rs   rules: what is a valid address, a valid code?  │
├──────────────────────────────────────────────────────────────┤
│ store.rs      storage: all SQL. Rows become `Link` values    │
└──────────────────────────────────────────────────────────────┘
           │
           ▼
       links.db

error.rs    one error type, used by all three layers
config.rs   the settings, read from environment variables
main.rs     connects the parts and starts the server
```

Why bother with layers in a small program? Because each layer can then be understood, tested and replaced alone:

- The rules are plain functions. They are tested in microseconds, with no database and no HTTP.
- The store is the only place that contains SQL. This is the **repository** idea from the end of [chapter 68](#databases).
- The routes translate between HTTP and the two layers below. They contain no SQL and few decisions.

### The files

```tree
shortener/
├── Cargo.toml
├── build.rs                  makes Cargo notice new migrations
├── migrations/
│   └── 20261114120000_create_links.sql
├── src/
│   ├── lib.rs                the library: lists the modules
│   ├── main.rs               the program: starts the server
│   ├── config.rs
│   ├── error.rs
│   ├── routes.rs
│   ├── store.rs
│   └── validate.rs
└── tests/
    └── api.rs                tests for the whole API
```

The package contains a library (`lib.rs`) and a program (`main.rs`), as in [chapter 28](#project-search). Nearly all code lives in the library. That is what makes the tests in `tests/` possible, because an integration test can only use a library.

Every file is printed in full in this chapter. A file that is printed in several blocks continues where the block before stopped.

## Step 1: the project and the table

Create the project and add the crates:

```sh
cargo new shortener
cd shortener
cargo add axum serde_json anyhow thiserror rand tracing tracing-subscriber
cargo add tokio --features full
cargo add serde --features derive
cargo add sqlx --features runtime-tokio,sqlite
cargo add tower-http --features trace,timeout
cargo add --dev tower --features util
```

The last line adds `tower` as a **dev-dependency**: a crate that only the tests use. `Cargo.toml` now looks like this (your version numbers may be newer):

```toml proj=shortener file=Cargo.toml
[package]
name = "shortener"
version = "0.1.0"
edition = "2024"

[dependencies]
anyhow = "1.0.104"
axum = "0.8.9"
rand = "0.10.3"
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.154"
sqlx = { version = "0.9.0", features = ["runtime-tokio", "sqlite"] }
thiserror = "2.0.21"
tokio = { version = "1.54.1", features = ["full"] }
tower-http = { version = "0.7.1", features = ["trace", "timeout"] }
tracing = "0.1.44"
tracing-subscriber = "0.3.23"

[dev-dependencies]
tower = { version = "0.5.3", features = ["util"] }
```

| Crate | Its job here |
|---|---|
| `axum`, `tokio` | the web framework and the async runtime |
| `sqlx` | talks to the SQLite database. SQLite itself is compiled into the program |
| `serde`, `serde_json` | JSON in and out |
| `thiserror` | the error type of the service |
| `anyhow` | errors while starting up |
| `rand` | random codes |
| `tracing`, `tracing-subscriber`, `tower-http` | the log, with one line per request, and a time limit |
| `tower` (tests only) | hands a request to the router without a network |

### The table

The table is created by a **migration** ([chapter 68](#databases)): a numbered SQL file that is applied once to every database. Create the folder `migrations` and in it this file:

```sql proj=shortener file=migrations/20261114120000_create_links.sql
CREATE TABLE links (
    code       TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    hits       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- `PRIMARY KEY` makes `code` unique. The database refuses a second row with the same code, whatever our Rust code does. It also builds an index, so finding a link by its code stays fast with millions of rows.
- `DEFAULT` values are filled in by the database: a new link starts with 0 hits and the current time.
- SQLite has no type for dates. `CURRENT_TIMESTAMP` stores a text such as `2026-11-14 16:00:38`, in UTC.

The number in front of the file name is a timestamp. It decides the order in which migrations run. If you installed `sqlx-cli`, the command `sqlx migrate add create_links` creates such a file for you.

The program will apply its migrations itself when it starts, with the macro `sqlx::migrate!()`. The macro reads the folder *while the program is compiled* and stores the files inside the executable. That has a catch: when you add a migration later and change no Rust file, Cargo sees no reason to compile again, and the new migration is silently missing. A two-line build script ([chapter 37](#ffi)) closes the gap. Create it next to `Cargo.toml`:

```rust proj=shortener file=build.rs
fn main() {
    // Compile again when a migration is added or changed
    println!("cargo::rerun-if-changed=migrations");
}
```

### The library

Replace nothing in `src/main.rs` yet. Create `src/lib.rs` with one line of documentation. The modules are added to it step by step:

```rust
//! A small service that turns long web addresses into short ones.
```

## Step 2: one error type

Before any feature, decide how failures travel. Every function of the service that can fail returns the same error type. And that type knows how to become an HTTP response, as in [chapter 64](#web).

Create `src/error.rs`:

```rust proj=shortener file=src/error.rs
//! One error type for the whole service.

use axum::Json;
use axum::extract::rejection::JsonRejection;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

/// Everything that can go wrong while handling a request.
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// The data breaks one of our rules.
    #[error("{0}")]
    Invalid(String),

    /// The body is not the JSON that the route expects.
    #[error("{1}")]
    BadBody(StatusCode, String),

    #[error("there is no link with the code '{0}'")]
    NotFound(String),

    #[error("there is nothing at this address")]
    NoRoute,

    #[error("the code '{0}' is already in use")]
    CodeTaken(String),

    #[error("a valid x-api-key header is required")]
    Unauthorized,

    #[error("something went wrong on the server")]
    Database(#[from] sqlx::Error),
}

impl ApiError {
    pub fn invalid(message: &str) -> ApiError {
        ApiError::Invalid(message.to_string())
    }

    fn status(&self) -> StatusCode {
        match self {
            ApiError::Invalid(_) => StatusCode::UNPROCESSABLE_ENTITY,
            ApiError::BadBody(status, _) => *status,
            ApiError::NotFound(_) | ApiError::NoRoute => StatusCode::NOT_FOUND,
            ApiError::CodeTaken(_) => StatusCode::CONFLICT,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

/// Axum could not read the JSON body. Keep its status code and its explanation.
impl From<JsonRejection> for ApiError {
    fn from(rejection: JsonRejection) -> ApiError {
        ApiError::BadBody(rejection.status(), rejection.body_text())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if let ApiError::Database(error) = &self {
            // The details go to the log. The client gets only the neutral text.
            tracing::error!("database error: {error}");
        }
        let body = Json(json!({ "error": self.to_string() }));
        (self.status(), body).into_response()
    }
}
```

And register the module in `src/lib.rs`:

```rust
pub mod error;
```

What to notice:

- **One variant per kind of failure.** The `#[error("…")]` texts are what the client reads. `{0}` and `{1}` insert the first and second field of the variant.
- **`status` is a `match` without a catch-all arm.** When you add a variant later, the compiler stops until you have decided on its status code.
- **`#[from] sqlx::Error`** generates `impl From<sqlx::Error> for ApiError`. So in a function that returns `Result<_, ApiError>`, a database call can simply end in `?`.
- **`From<JsonRejection>`** is written by hand, because it stores two values. A `JsonRejection` is what Axum produces when it cannot read a JSON body. Axum has already chosen a status code (400, 415 or 422) and written an explanation. We keep both and only change the wrapping, so that these errors are JSON as well.
- **The database error is logged, not shown.** Its text may contain table names, SQL or file paths, which are of no use to a client and of some use to an attacker. The client reads "something went wrong on the server", and the details go to the log.

`cargo check` should pass now. Cargo warns that some dependencies are not used yet. The warnings go away as the project grows.

## Step 3: the rules

The second layer answers three questions. Is this an address that we are willing to shorten? Is this a code that we accept? And what does a new random code look like?

Create `src/validate.rs`:

```rust proj=shortener file=src/validate.rs
//! Rules for the data that clients send. Pure functions, with no database and no network.

use rand::RngExt;

use crate::error::ApiError;

pub const MAX_URL_LEN: usize = 2_000;
pub const RANDOM_CODE_LEN: usize = 6;

/// Codes that would hide a route of the API itself.
const RESERVED: [&str; 2] = ["links", "health"];

/// Letters and digits that are easy to tell apart: no 0/o and no 1/l.
const ALPHABET: &[u8] = b"abcdefghijkmnpqrstuvwxyz23456789";

/// Checks an address that a client wants to shorten, and returns it trimmed.
pub fn check_url(url: &str) -> Result<&str, ApiError> {
    let url = url.trim();
    if url.len() > MAX_URL_LEN {
        return Err(ApiError::invalid("the url is too long"));
    }
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .ok_or_else(|| ApiError::invalid("the url must start with http:// or https://"))?;
    if rest.is_empty()
        || rest.starts_with('/')
        || rest.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(ApiError::invalid("the url is not a valid web address"));
    }
    Ok(url)
}

/// Checks a code that a client chose.
pub fn check_code(code: &str) -> Result<&str, ApiError> {
    if !(3..=20).contains(&code.len()) {
        return Err(ApiError::invalid("a code must have 3 to 20 characters"));
    }
    if !code
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ApiError::invalid(
            "a code may contain only letters, digits, '-' and '_'",
        ));
    }
    if RESERVED.contains(&code) {
        return Err(ApiError::invalid("this code is reserved"));
    }
    Ok(code)
}

/// Makes up a new code.
pub fn random_code() -> String {
    let mut rng = rand::rng();
    (0..RANDOM_CODE_LEN)
        .map(|_| ALPHABET[rng.random_range(0..ALPHABET.len())] as char)
        .collect()
}
```

Add `pub mod validate;` to `src/lib.rs`.

**`check_url`** reads from top to bottom like the rules it enforces:

- The address must start with `http://` or `https://`. `strip_prefix` returns the rest of the text after the prefix, or `None`. `or_else` tries the second prefix if the first one did not fit, and `ok_or_else` turns a final `None` into our error ([chapter 23](#errors)).
- Something must follow the prefix, and it must contain no spaces or control characters.
- The function returns the trimmed address as a `&str` that borrows from the parameter. Nothing is copied.

The list of allowed beginnings is a security rule, and it is written as an **allow list**: everything that is not expressly permitted is refused. A short link to an address that starts with `javascript:` would run a script in the browser of whoever follows it. Listing the two good cases is safer than trying to list all the bad ones.

**`check_code`** allows 3 to 20 ASCII letters, digits, `-` and `_`. Two words are reserved. A link with the code `links` could never be followed, because the path `/links` already belongs to the API.

**`random_code`** picks six characters from an alphabet of 32. The look-alikes `0`/`o` and `1`/`l` are left out, because people read codes aloud and type them from paper. Six characters give 32⁶ = 1,073,741,824 different codes.

These functions are **pure**: the result depends only on the parameters. Nothing is easier to test. Append the tests to the same file:

```rust proj=shortener file=src/validate.rs cont
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn good_urls_are_accepted_and_trimmed() {
        assert_eq!(
            check_url("https://example.com/a?b=c").unwrap(),
            "https://example.com/a?b=c"
        );
        assert_eq!(
            check_url("  http://example.com ").unwrap(),
            "http://example.com"
        );
    }

    #[test]
    fn bad_urls_are_refused() {
        for url in [
            "",
            "example.com",
            "ftp://example.com",
            "javascript:alert(1)",
            "https://",
            "https:///path",
            "https://exa mple.com",
        ] {
            assert!(check_url(url).is_err(), "{url:?} should be refused");
        }
        assert!(check_url(&format!("https://example.com/{}", "a".repeat(MAX_URL_LEN))).is_err());
    }

    #[test]
    fn codes_follow_the_rules() {
        assert!(check_code("rust-2026").is_ok());
        assert!(check_code("my_link").is_ok());
        for code in [
            "ab",
            "this-code-is-far-too-long",
            "with space",
            "ünï",
            "a/b",
            "links",
            "health",
        ] {
            assert!(check_code(code).is_err(), "{code:?} should be refused");
        }
    }

    #[test]
    fn random_codes_are_valid_and_differ() {
        let first = random_code();
        let second = random_code();
        assert_eq!(first.len(), RANDOM_CODE_LEN);
        assert!(check_code(&first).is_ok());
        assert_ne!(first, second);
    }
}
```

Run `cargo test`. The four tests pass.

The test lists are worth a second look. A table of bad inputs in a `for` loop makes it cheap to add a case, and the message `"{url:?} should be refused"` names the culprit when one fails.

## Step 4: the store

The third layer owns the database. Create `src/store.rs`:

```rust proj=shortener file=src/store.rs
//! All access to the database. No other file contains SQL.

use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::{FromRow, SqlitePool};

use crate::error::ApiError;

/// One row of the table `links`.
#[derive(Debug, Clone, FromRow)]
pub struct Link {
    pub code: String,
    pub url: String,
    pub hits: i64,
    pub created_at: String,
}

#[derive(Clone)]
pub struct LinkStore {
    pool: SqlitePool,
}

/// Opening and closing.
impl LinkStore {
    /// Opens the database file, creates it if needed, and brings its tables up to date.
    pub async fn open(database_url: &str) -> Result<LinkStore, sqlx::Error> {
        let options = SqliteConnectOptions::from_str(database_url)?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;
        sqlx::migrate!().run(&pool).await?;
        Ok(LinkStore { pool })
    }

    /// A store on a fresh, empty database in memory. Meant for tests.
    pub async fn in_memory() -> Result<LinkStore, sqlx::Error> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await?;
        sqlx::migrate!().run(&pool).await?;
        Ok(LinkStore { pool })
    }

    /// Waits for running queries and closes all connections.
    pub async fn close(&self) {
        self.pool.close().await;
    }
}
```

- `Link` mirrors one row. `FromRow` lets SQLx fill it from a query result.
- `LinkStore` wraps the connection pool. The field is private: no code outside this file can reach the pool, so no code outside this file can run SQL.
- `open` is for the real program. `create_if_missing` creates the database file on the first start. `sqlx::migrate!().run(…)` then applies every migration that this database has not seen.
- `journal_mode(Wal)` switches SQLite to its **write-ahead log**. In this mode, readers and one writer can work at the same time, which is what a server needs. While the program runs, you will see two helper files next to the database: `links.db-wal` and `links.db-shm`.
- `in_memory` is for tests. It gives a complete, empty database in a few milliseconds. The pool is limited to one connection, because every connection to `sqlite::memory:` would get its own separate database.

Now the queries. The file continues:

```rust proj=shortener file=src/store.rs cont
/// The questions that the service asks the database.
impl LinkStore {
    /// Stores a new link. Fails with `CodeTaken` if the code exists already.
    pub async fn insert(&self, code: &str, url: &str) -> Result<Link, ApiError> {
        let result = sqlx::query_as(
            "INSERT INTO links (code, url) VALUES (?, ?)
             RETURNING code, url, hits, created_at",
        )
        .bind(code)
        .bind(url)
        .fetch_one(&self.pool)
        .await;

        match result {
            Ok(link) => Ok(link),
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                Err(ApiError::CodeTaken(code.to_string()))
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn find(&self, code: &str) -> Result<Option<Link>, sqlx::Error> {
        sqlx::query_as("SELECT code, url, hits, created_at FROM links WHERE code = ?")
            .bind(code)
            .fetch_optional(&self.pool)
            .await
    }

    /// Counts one visit and returns the address to go to.
    pub async fn visit(&self, code: &str) -> Result<Option<String>, sqlx::Error> {
        sqlx::query_scalar("UPDATE links SET hits = hits + 1 WHERE code = ? RETURNING url")
            .bind(code)
            .fetch_optional(&self.pool)
            .await
    }

    /// Lists links, the most visited first.
    pub async fn list(&self, limit: i64, offset: i64) -> Result<Vec<Link>, sqlx::Error> {
        sqlx::query_as(
            "SELECT code, url, hits, created_at FROM links
             ORDER BY hits DESC, code LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
    }

    /// Removes a link. Returns false if there was none.
    pub async fn delete(&self, code: &str) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("DELETE FROM links WHERE code = ?")
            .bind(code)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() == 1)
    }

    /// Checks that the database answers.
    pub async fn ping(&self) -> Result<(), sqlx::Error> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }
}
```

Add `pub mod store;` to `src/lib.rs`.

Three of these methods deserve a closer look.

**`insert` lets the database decide.** A tempting way to refuse a duplicate code is to ask first ("is there a row with this code?") and insert afterwards. That has a gap. Two requests for the same code can both ask at the same moment, both hear "no", and both insert. The pattern is called *check-then-act*, and it is a classic source of rare, unrepeatable bugs.

The store does not ask. It inserts, and the `PRIMARY KEY` of the table refuses the second row. `error.is_unique_violation()` recognises this refusal, and the match arm with the guard translates it into `ApiError::CodeTaken`. Every other database error passes through unchanged.

**`visit` does two things in one statement.** `UPDATE … SET hits = hits + 1 … RETURNING url` adds one to the counter and hands back the address. The database computes `hits + 1` itself, inside one statement. So two visits at the same instant cannot both read 5 and both write 6. With `fetch_optional`, an unknown code simply gives `None`.

**`list` never returns everything.** `LIMIT` and `OFFSET` are bound like all other values. The second sort key, `code`, makes the order definite when two links have the same number of hits. Without it, pages could overlap.

Notice the return types. `insert` returns an `ApiError`, because it knows a failure with a meaning: the code is taken. The other methods return a plain `sqlx::Error`. The routes will turn that into an `ApiError` with `?`.

### Test the store

Append to `src/store.rs`:

```rust proj=shortener file=src/store.rs cont
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_code_can_be_stored_only_once() {
        let store = LinkStore::in_memory().await.unwrap();

        let link = store.insert("docs", "https://docs.rs").await.unwrap();
        assert_eq!(link.code, "docs");
        assert_eq!(link.url, "https://docs.rs");
        assert_eq!(link.hits, 0);

        let second = store.insert("docs", "https://example.com").await;
        assert!(matches!(second, Err(ApiError::CodeTaken(code)) if code == "docs"));
    }

    #[tokio::test]
    async fn every_visit_is_counted() {
        let store = LinkStore::in_memory().await.unwrap();
        store.insert("docs", "https://docs.rs").await.unwrap();

        let first = store.visit("docs").await.unwrap();
        assert_eq!(first.as_deref(), Some("https://docs.rs"));
        let second = store.visit("docs").await.unwrap();
        assert_eq!(second.as_deref(), Some("https://docs.rs"));
        assert_eq!(store.visit("other").await.unwrap(), None);

        assert_eq!(store.find("docs").await.unwrap().unwrap().hits, 2);
    }

    #[tokio::test]
    async fn deleting_reports_whether_something_was_there() {
        let store = LinkStore::in_memory().await.unwrap();
        store.insert("docs", "https://docs.rs").await.unwrap();

        assert!(store.delete("docs").await.unwrap());
        assert!(!store.delete("docs").await.unwrap());
        assert!(store.find("docs").await.unwrap().is_none());
    }
}
```

Run `cargo test`: seven tests pass. The new ones are async, so they are marked with `#[tokio::test]` ([chapter 57](#async)). Each creates its own database, so they cannot disturb each other, and they run in parallel.

`matches!(second, Err(ApiError::CodeTaken(code)) if code == "docs")` checks the variant and its content in one expression ([chapter 19](#patterns)). `ApiError` cannot be compared with `==`, because `sqlx::Error` does not implement `PartialEq`.

## Step 5: the routes

Now the layer that speaks HTTP. Create `src/routes.rs`. It begins with the imports and the data types:

```rust proj=shortener file=src/routes.rs
//! The HTTP side: routes, handlers and middleware.

use std::sync::Arc;
use std::time::Duration;

use axum::extract::rejection::JsonRejection;
use axum::extract::{DefaultBodyLimit, Path, Query, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{Redirect, Response};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

use crate::error::ApiError;
use crate::store::{Link, LinkStore};
use crate::validate::{check_code, check_url, random_code};

/// What every handler can reach.
#[derive(Clone)]
pub struct AppState {
    pub store: LinkStore,
    pub api_key: Arc<str>,
    pub base_url: Arc<str>,
}

/// The body of `POST /links`.
#[derive(Debug, Deserialize)]
struct NewLink {
    url: String,
    code: Option<String>,
}

/// A link as the API shows it.
#[derive(Debug, Serialize)]
struct LinkView {
    code: String,
    url: String,
    short_url: String,
    hits: i64,
    created_at: String,
}

impl LinkView {
    fn new(link: Link, base_url: &str) -> LinkView {
        LinkView {
            short_url: format!("{base_url}/{}", link.code),
            code: link.code,
            url: link.url,
            hits: link.hits,
            created_at: link.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
struct Paging {
    limit: Option<i64>,
    offset: Option<i64>,
}
```

- **`AppState`** is what every handler can reach: the store, the secret key, and the address under which the service is reachable from outside (needed to print complete short links). Axum clones the state for every request. The store clones cheaply, because a pool is a handle to shared data. The two texts are `Arc<str>`: shared, read-only strings. Cloning one copies a pointer and adds one to a counter, where cloning a `String` would copy the text ([chapter 56](#shared-state)).
- **`NewLink`** is what a client sends. `code` is an `Option`, so the field may be missing.
- **`LinkView`** is what a client receives. It is not the same as `Link`: it has an extra field, `short_url`, which is computed and not stored.

Keeping the three types apart (input, stored, shown) looks like repetition in a small program. It pays off with the first field that must not be accepted from a client, or must not be shown to one.

### The router

The file continues with the function that builds the application:

```rust proj=shortener file=src/routes.rs cont
/// Builds the whole application.
pub fn app(state: AppState) -> Router {
    let admin = Router::new()
        .route("/links", get(list_links))
        .route("/links/{code}", delete(delete_link))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_key));

    let public = Router::new()
        .route("/health", get(health))
        .route("/links", post(create_link))
        .route("/links/{code}", get(link_stats))
        .route("/{code}", get(follow));

    Router::new()
        .merge(public)
        .merge(admin)
        .fallback(no_such_route)
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(10),
        ))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                .on_response(DefaultOnResponse::new().level(Level::INFO)),
        )
        .with_state(state)
}
```

- **Two groups of routes.** The `admin` router holds what only the owner may do. `route_layer` wraps exactly these routes in the middleware `require_key`. A route that is added to this group later is protected without anybody having to remember it.
- **`from_fn_with_state`** is the sibling of `from_fn` from [chapter 64](#web), for middleware that needs the state. Here it needs the key to compare with.
- **`/links` and `/{code}` do not collide.** For the path `/links`, both patterns fit. Axum prefers the fixed text over the placeholder. That is the reason for the reserved words in step 3.
- **`fallback`** answers every request that no route matches, so that even an unknown path gets our JSON error.
- **The limits.** A body may have at most 16 KB, and a request may take at most 10 seconds. Both are far more than an honest client needs.
- **`TraceLayer`** writes one log line per request. It is added last, which makes it the outermost layer: it sees every request, including those that the other layers refuse.

### The handlers

The file continues:

```rust proj=shortener file=src/routes.rs cont
async fn health(State(state): State<AppState>) -> Result<&'static str, ApiError> {
    state.store.ping().await?;
    Ok("ok")
}

async fn create_link(
    State(state): State<AppState>,
    input: Result<Json<NewLink>, JsonRejection>,
) -> Result<(StatusCode, Json<LinkView>), ApiError> {
    let Json(input) = input?;
    let url = check_url(&input.url)?;
    let link = match &input.code {
        Some(code) => state.store.insert(check_code(code)?, url).await?,
        None => insert_with_random_code(&state.store, url).await?,
    };
    Ok((
        StatusCode::CREATED,
        Json(LinkView::new(link, &state.base_url)),
    ))
}

/// Tries random codes until one is free.
async fn insert_with_random_code(store: &LinkStore, url: &str) -> Result<Link, ApiError> {
    loop {
        match store.insert(&random_code(), url).await {
            Err(ApiError::CodeTaken(_)) => continue,
            other => return other,
        }
    }
}

async fn follow(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Redirect, ApiError> {
    match state.store.visit(&code).await? {
        Some(url) => Ok(Redirect::temporary(&url)),
        None => Err(ApiError::NotFound(code)),
    }
}

async fn link_stats(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Json<LinkView>, ApiError> {
    match state.store.find(&code).await? {
        Some(link) => Ok(Json(LinkView::new(link, &state.base_url))),
        None => Err(ApiError::NotFound(code)),
    }
}

async fn list_links(
    State(state): State<AppState>,
    Query(paging): Query<Paging>,
) -> Result<Json<Vec<LinkView>>, ApiError> {
    let limit = paging.limit.unwrap_or(20).clamp(1, 100);
    let offset = paging.offset.unwrap_or(0).max(0);
    let links = state.store.list(limit, offset).await?;
    Ok(Json(
        links
            .into_iter()
            .map(|link| LinkView::new(link, &state.base_url))
            .collect(),
    ))
}

async fn delete_link(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<StatusCode, ApiError> {
    if state.store.delete(&code).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound(code))
    }
}

async fn no_such_route() -> ApiError {
    ApiError::NoRoute
}
```

Each handler is short, because the layers below do the work:

- **`health`** asks the store for a sign of life. A hosting platform can call this route every few seconds and restart the program if the answer is not 200.
- **`create_link`** takes the body as `Result<Json<NewLink>, JsonRejection>`. With a plain `Json<NewLink>`, Axum would answer a broken body itself, in plain text. With the `Result`, the handler receives the failure, and `input?` turns it into our `ApiError`. Then come the rules, then the store. A chosen code that is taken ends the request with 409.
- **`insert_with_random_code`** covers the rare case that a random code exists already. It tries again with a new one. All other outcomes, good or bad, are returned as they are: `other => return other`.
- **`follow`** is the heart of the service, in four lines. `Redirect::temporary` answers 307. A *permanent* redirect (308) would be wrong here: browsers remember permanent redirects and would skip our server from the second visit on. Visits would no longer be counted, and a deleted link would keep working in those browsers.
- **`list_links`** reads `limit` and `offset` from the query string. `clamp(1, 100)` forces the limit into a sane range, whatever the client asks for.
- **`delete_link`** uses the `bool` from the store to choose between 204 and 404.

The file ends with the middleware:

```rust proj=shortener file=src/routes.rs cont
/// Middleware: lets a request pass only with the right key in the header `x-api-key`.
async fn require_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let given = headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok());
    if given == Some(&*state.api_key) {
        Ok(next.run(request).await)
    } else {
        Err(ApiError::Unauthorized)
    }
}
```

`require_key` runs before the handlers of the `admin` group. With the right key in the header, it passes the request on with `next.run(request)`. Otherwise it returns an error, and the handler never runs.

:::warn Production upgrade: constant-time key comparison
Notice `given == Some(&*state.api_key)` uses ordinary string equality (`==`), which stops at the first mismatching byte. In a production service, hash both keys with SHA-256 and compare the fixed-length digests with `subtle::ConstantTimeEq` as shown in [chapter 64](#web), so response timing never leaks how many leading bytes matched.
:::

Finally, complete `src/lib.rs`. It lists all modules, and re-exports the two names that `main` and the tests need most:

```rust proj=shortener file=src/lib.rs
//! A small service that turns long web addresses into short ones.

pub mod config;
pub mod error;
pub mod routes;
pub mod store;
pub mod validate;

pub use routes::{AppState, app};
```

(`config` is created in the next step. `cargo check` will complain about it until then.)

## Step 6: settings and `main`

A service should not contain its settings. The same executable must run on your laptop, on a test server and in production, and a secret in the source code ends up in the version history for ever. The custom of web services is to read settings from **environment variables**, which are the layer between a configuration file and a command-line flag ([the full precedence chain](#cli) is in the CLI chapter). Here it is in a few dozen lines, with no crate:

| Variable | Meaning | If it is not set |
|---|---|---|
| `API_KEY` | the secret of the owner, at least 16 characters | the program refuses to start |
| `PORT` | the port to listen on | 3000 |
| `DATABASE_URL` | where the database file is | `sqlite://links.db` |
| `BASE_URL` | the public address of the service | `http://localhost:` plus the port |

Create `src/config.rs`:

```rust proj=shortener file=src/config.rs
//! Settings, read from environment variables.

use std::env;

use anyhow::{Context, Result, bail};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub api_key: String,
    pub base_url: String,
}

impl Config {
    pub fn from_env() -> Result<Config> {
        let port = match env::var("PORT") {
            Ok(text) => text
                .parse()
                .with_context(|| format!("PORT must be a number, not '{text}'"))?,
            Err(_) => 3000,
        };

        let api_key =
            env::var("API_KEY").context("the environment variable API_KEY must be set")?;
        if api_key.len() < 16 {
            bail!("API_KEY must have at least 16 characters");
        }

        let database_url =
            env::var("DATABASE_URL").unwrap_or_else(|_| String::from("sqlite://links.db"));
        let base_url = env::var("BASE_URL").unwrap_or_else(|_| format!("http://localhost:{port}"));

        Ok(Config {
            database_url,
            port,
            api_key,
            base_url,
        })
    }
}
```

This file uses `anyhow`, not `ApiError`. The division follows [chapter 23](#errors): an error that some code must *tell apart and react to* gets its own type. An error that is only *reported to a human* is a job for `anyhow`. A wrong setting is reported once, to the person who starts the program, and the program ends.

There is no default for `API_KEY`, on purpose. A service that starts with a well-known default secret is open to everybody who has read its source code. For larger services that combine TOML files, `.env` files, environment overrides, and redacted `SecretString` fields, see the layered `figment` + `secrecy` pattern in [chapter 64](#web).

Now replace the content of `src/main.rs`:

```rust proj=shortener file=src/main.rs
use anyhow::Context;
use shortener::config::Config;
use shortener::store::LinkStore;
use shortener::{AppState, app};

/// Completes when the user presses Ctrl+C.
async fn shutdown_signal() {
    tokio::signal::ctrl_c()
        .await
        .expect("could not listen for Ctrl+C");
    tracing::info!("shutting down");
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_target(false).init();

    let config = Config::from_env()?;
    let store = LinkStore::open(&config.database_url)
        .await
        .with_context(|| format!("could not open the database {}", config.database_url))?;
    let state = AppState {
        store: store.clone(),
        api_key: config.api_key.into(),
        base_url: config.base_url.into(),
    };

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port))
        .await
        .with_context(|| format!("could not listen on port {}", config.port))?;
    tracing::info!("listening on {}", listener.local_addr()?);
    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    store.close().await;
    tracing::info!("stopped");
    Ok(())
}
```

`main` only connects parts: read the settings, open the store, build the state, listen, serve. The two `with_context` calls add what the bare errors lack. Compare the message for an occupied or forbidden port with and without it:

```text
Error: Permission denied (os error 13)
```

```text
Error: could not listen on port 80

Caused by:
    Permission denied (os error 13)
```

When you press {{Ctrl}}+{{C}}, `shutdown_signal` completes. The server then stops accepting connections, finishes the requests that are under way, and `serve` returns. Only then is the store closed.

## Try it

Start the service. The key is given for this one run:

```sh
API_KEY=my-very-secret-key-123 cargo run
```

:::tip On Windows
In PowerShell, set the variable first: `$env:API_KEY = "my-very-secret-key-123"`, then `cargo run`. Use `curl.exe` instead of `curl`. The quoting of JSON differs between shells. If a request with `-d '{…}'` is refused as broken JSON, save the body in a file `body.json` and send it with `-d "@body.json"`, which works in every shell.
:::

In a second terminal, talk to it. This is a real session:

```text
$ curl -X POST http://localhost:3000/links -H 'content-type: application/json' -d '{"url": "https://doc.rust-lang.org/book/", "code": "book"}'
{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":0,"created_at":"2026-11-14 16:08:42"}

$ curl -i http://localhost:3000/book
HTTP/1.1 307 Temporary Redirect
location: https://doc.rust-lang.org/book/
content-length: 0
date: Sat, 14 Nov 2026 16:08:42 GMT

$ curl http://localhost:3000/links/book
{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":1,"created_at":"2026-11-14 16:08:42"}

$ curl -X POST http://localhost:3000/links -H 'content-type: application/json' -d '{"url": "https://www.rust-lang.org"}'
{"code":"jijbqu","url":"https://www.rust-lang.org","short_url":"http://localhost:3000/jijbqu","hits":0,"created_at":"2026-11-14 16:08:42"}

$ curl -X POST http://localhost:3000/links -H 'content-type: application/json' -d '{"url": "https://example.com", "code": "book"}'
{"error":"the code 'book' is already in use"}

$ curl -X POST http://localhost:3000/links -H 'content-type: application/json' -d '{"url": "example.com"}'
{"error":"the url must start with http:// or https://"}

$ curl -X POST http://localhost:3000/links -H 'content-type: application/json' -d '{"url": '
{"error":"Failed to parse the request body as JSON: url: EOF while parsing a value at line 1 column 8"}

$ curl http://localhost:3000/links
{"error":"a valid x-api-key header is required"}

$ curl http://localhost:3000/links -H 'x-api-key: my-very-secret-key-123'
[{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":1,"created_at":"2026-11-14 16:08:42"},{"code":"jijbqu","url":"https://www.rust-lang.org","short_url":"http://localhost:3000/jijbqu","hits":0,"created_at":"2026-11-14 16:08:42"}]

$ curl -i -X DELETE http://localhost:3000/links/book -H 'x-api-key: my-very-secret-key-123'
HTTP/1.1 204 No Content
date: Sat, 14 Nov 2026 16:08:42 GMT

$ curl http://localhost:3000/book
{"error":"there is no link with the code 'book'"}

$ curl http://localhost:3000/a/b/c
{"error":"there is nothing at this address"}

$ curl http://localhost:3000/health
ok
```

Things to observe:

- The fourth request chose no code, so the service made one up. Yours will differ.
- The error messages for a broken body come from Axum. Our `ApiError` only wrapped them in JSON.
- Without the key, the list is refused with 401.
- Open `http://localhost:3000/` plus one of your codes in a browser. You land on the long address.

Meanwhile, the first terminal shows the log, with one line per request:

```text
2026-11-14T16:08:41.420633Z  INFO listening on 0.0.0.0:3000
2026-11-14T16:08:42.914003Z  INFO request{method=POST uri=/links version=HTTP/1.1}: finished processing request latency=1 ms status=201
2026-11-14T16:08:42.921406Z  INFO request{method=GET uri=/book version=HTTP/1.1}: finished processing request latency=0 ms status=307
2026-11-14T16:08:42.927883Z  INFO request{method=GET uri=/links/book version=HTTP/1.1}: finished processing request latency=0 ms status=200
2026-11-14T16:08:42.934639Z  INFO request{method=POST uri=/links version=HTTP/1.1}: finished processing request latency=0 ms status=201
2026-11-14T16:08:42.941089Z  INFO request{method=POST uri=/links version=HTTP/1.1}: finished processing request latency=0 ms status=409
2026-11-14T16:08:42.948373Z  INFO request{method=POST uri=/links version=HTTP/1.1}: finished processing request latency=0 ms status=422
2026-11-14T16:08:42.955328Z  INFO request{method=POST uri=/links version=HTTP/1.1}: finished processing request latency=0 ms status=400
2026-11-14T16:08:42.962132Z  INFO request{method=GET uri=/links version=HTTP/1.1}: finished processing request latency=0 ms status=401
2026-11-14T16:08:42.968673Z  INFO request{method=GET uri=/links version=HTTP/1.1}: finished processing request latency=0 ms status=200
2026-11-14T16:08:42.975737Z  INFO request{method=DELETE uri=/links/book version=HTTP/1.1}: finished processing request latency=1 ms status=204
2026-11-14T16:08:42.981887Z  INFO request{method=GET uri=/book version=HTTP/1.1}: finished processing request latency=0 ms status=404
2026-11-14T16:08:42.987825Z  INFO request{method=GET uri=/a/b/c version=HTTP/1.1}: finished processing request latency=0 ms status=404
2026-11-14T16:08:42.993747Z  INFO request{method=GET uri=/health version=HTTP/1.1}: finished processing request latency=0 ms status=200
2026-11-14T16:08:42.998763Z  INFO shutting down
2026-11-14T16:08:42.999545Z  INFO stopped
```

Stop the server with {{Ctrl}}+{{C}} and start it again. The links are still there, because they live in the file `links.db`. Add the line `links.db*` to the file `.gitignore`, so that the database does not end up in version control.

Try a wrong setting too:

```text
$ cargo run
Error: the environment variable API_KEY must be set

Caused by:
    environment variable not found

$ API_KEY=short cargo run
Error: API_KEY must have at least 16 characters
```

## Step 7: test the whole API

Trying things by hand with `curl` is fine once. It is no way to make sure that everything still works after every change. The service needs automatic tests that cover the same ground.

The obvious method would be to start the server on a port and send real HTTP requests, as the tests of the chat server did in [chapter 59](#project-chat). Axum offers something better. A `Router` is a tower `Service` ([chapter 60](#async-ecosystem)): a value that turns a request into a response. So a test can build a `Request` value, hand it to the router, and inspect the `Response` value. No port is opened and nothing is sent over a network, yet the request passes through all of our code: routing, middleware, extractors, handlers, rules, store and database.

Create the folder `tests` and in it `api.rs`. The file starts with a few helpers:

```rust proj=shortener file=tests/api.rs
//! Tests for the whole API. Requests go straight to the router: no port, no network.

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode};
use serde_json::{Value, json};
use shortener::store::LinkStore;
use shortener::{AppState, app};
use tower::ServiceExt;

const KEY: &str = "test-key-0123456789";

/// A complete application on a fresh, empty database.
async fn test_app() -> Router {
    let store = LinkStore::in_memory().await.unwrap();
    let state = AppState {
        store,
        api_key: KEY.into(),
        base_url: "http://sho.rt".into(),
    };
    app(state)
}

/// What came back: the status, the headers, and the body as JSON (`Null` if it is not JSON).
struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    json: Value,
}

/// Hands one request to the application and collects the answer.
async fn send(app: &Router, request: Request<Body>) -> Reply {
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    Reply {
        status,
        headers,
        json,
    }
}

/// Builds a request and sends it. `key` is an API key, `body` is a JSON body.
async fn call(
    app: &Router,
    method: &str,
    path: &str,
    key: Option<&str>,
    body: Option<Value>,
) -> Reply {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(key) = key {
        request = request.header("x-api-key", key);
    }
    let request = match body {
        Some(json) => request
            .header("content-type", "application/json")
            .body(Body::from(json.to_string())),
        None => request.body(Body::empty()),
    };
    send(app, request.unwrap()).await
}

async fn get(app: &Router, path: &str) -> Reply {
    call(app, "GET", path, None, None).await
}

async fn create(app: &Router, body: Value) -> Reply {
    call(app, "POST", "/links", None, Some(body)).await
}
```

- **`test_app`** builds the complete application the way `main` does, with two differences: the database lives in memory, and the settings are fixed values. Every test calls it and gets a service of its own.
- **`send`** is the central piece. `oneshot` comes from the trait `tower::ServiceExt` and means: call this service with one request. It consumes the service, so the router is cloned first. Cloning a router is cheap. The function then reads the whole body and tries to parse it as JSON.
- **`call`** builds a request from a method, a path, an optional key and an optional JSON body. `get` and `create` are shortcuts for the two most frequent cases.

Helpers like these are worth their lines. They make each test read like a description of behaviour:

```rust proj=shortener file=tests/api.rs cont
#[tokio::test]
async fn the_health_check_answers() {
    let app = test_app().await;
    assert_eq!(get(&app, "/health").await.status, StatusCode::OK);
}

#[tokio::test]
async fn a_link_can_be_created_and_followed() {
    let app = test_app().await;

    let created = create(&app, json!({ "url": "https://www.rust-lang.org/learn" })).await;
    assert_eq!(created.status, StatusCode::CREATED);
    let code = created.json["code"].as_str().unwrap();
    assert_eq!(code.len(), 6);
    assert_eq!(created.json["short_url"], format!("http://sho.rt/{code}"));
    assert_eq!(created.json["hits"], 0);

    let followed = get(&app, &format!("/{code}")).await;
    assert_eq!(followed.status, StatusCode::TEMPORARY_REDIRECT);
    assert_eq!(
        followed.headers["location"],
        "https://www.rust-lang.org/learn"
    );
}

#[tokio::test]
async fn visits_are_counted() {
    let app = test_app().await;
    create(
        &app,
        json!({ "url": "https://example.com", "code": "home" }),
    )
    .await;

    for _ in 0..3 {
        get(&app, "/home").await;
    }

    let facts = get(&app, "/links/home").await;
    assert_eq!(facts.status, StatusCode::OK);
    assert_eq!(facts.json["hits"], 3);
    assert_eq!(facts.json["url"], "https://example.com");
}

#[tokio::test]
async fn a_chosen_code_cannot_be_used_twice() {
    let app = test_app().await;
    let first = create(&app, json!({ "url": "https://a.example", "code": "mine" })).await;
    assert_eq!(first.status, StatusCode::CREATED);

    let second = create(&app, json!({ "url": "https://b.example", "code": "mine" })).await;
    assert_eq!(second.status, StatusCode::CONFLICT);
    assert_eq!(second.json["error"], "the code 'mine' is already in use");

    // The first link is untouched
    assert_eq!(
        get(&app, "/links/mine").await.json["url"],
        "https://a.example"
    );
}

#[tokio::test]
async fn bad_input_is_refused() {
    let app = test_app().await;
    let bad_bodies = [
        json!({ "url": "not a url" }),
        json!({ "url": "ftp://example.com" }),
        json!({ "url": "https://example.com", "code": "x" }),
        json!({ "url": "https://example.com", "code": "has space" }),
        json!({ "url": "https://example.com", "code": "links" }),
        json!({ "code": "no-url" }),
    ];
    for body in bad_bodies {
        let reply = create(&app, body.clone()).await;
        assert_eq!(reply.status, StatusCode::UNPROCESSABLE_ENTITY, "for {body}");
        assert!(reply.json["error"].is_string(), "for {body}");
    }
}

#[tokio::test]
async fn a_broken_body_gets_an_answer_in_json() {
    let app = test_app().await;
    let request = Request::builder()
        .method("POST")
        .uri("/links")
        .header("content-type", "application/json")
        .body(Body::from("{ this is not JSON"))
        .unwrap();

    let reply = send(&app, request).await;

    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert!(reply.json["error"].is_string());
}

#[tokio::test]
async fn unknown_codes_and_paths_give_404() {
    let app = test_app().await;
    for path in ["/nothing", "/links/nothing", "/no/such/path"] {
        let reply = get(&app, path).await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "for {path}");
        assert!(reply.json["error"].is_string(), "for {path}");
    }

    let deleted = call(&app, "DELETE", "/links/nothing", Some(KEY), None).await;
    assert_eq!(deleted.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn listing_and_deleting_need_the_key() {
    let app = test_app().await;
    create(&app, json!({ "url": "https://example.com", "code": "one" })).await;

    let attempts = [
        ("GET", "/links", None),
        ("GET", "/links", Some("wrong-key")),
        ("DELETE", "/links/one", None),
        ("DELETE", "/links/one", Some("wrong-key")),
    ];
    for (method, path, key) in attempts {
        let reply = call(&app, method, path, key, None).await;
        assert_eq!(
            reply.status,
            StatusCode::UNAUTHORIZED,
            "for {method} {path}"
        );
    }

    // Nothing was deleted
    assert_eq!(get(&app, "/links/one").await.status, StatusCode::OK);
}

#[tokio::test]
async fn the_list_is_sorted_by_visits_and_paged() {
    let app = test_app().await;
    for code in ["aaa", "bbb", "ccc"] {
        create(&app, json!({ "url": "https://example.com", "code": code })).await;
    }
    get(&app, "/ccc").await;
    get(&app, "/ccc").await;
    get(&app, "/bbb").await;

    let all = call(&app, "GET", "/links", Some(KEY), None).await;
    assert_eq!(codes(&all), ["ccc", "bbb", "aaa"]);

    let page = call(&app, "GET", "/links?limit=1&offset=1", Some(KEY), None).await;
    assert_eq!(codes(&page), ["bbb"]);
}

/// The codes in a reply that holds a list of links.
fn codes(reply: &Reply) -> Vec<&str> {
    let links = reply.json.as_array().unwrap();
    links
        .iter()
        .map(|link| link["code"].as_str().unwrap())
        .collect()
}

#[tokio::test]
async fn a_deleted_link_is_gone() {
    let app = test_app().await;
    create(
        &app,
        json!({ "url": "https://example.com", "code": "temp" }),
    )
    .await;

    let deleted = call(&app, "DELETE", "/links/temp", Some(KEY), None).await;
    assert_eq!(deleted.status, StatusCode::NO_CONTENT);

    assert_eq!(get(&app, "/temp").await.status, StatusCode::NOT_FOUND);
}
```

Run them:

```text
$ cargo test
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.07s
     Running unittests src/lib.rs (target/debug/…/shortener-7b85cd6160dfd097)

running 7 tests
test store::tests::a_code_can_be_stored_only_once ... ok
test store::tests::deleting_reports_whether_something_was_there ... ok
test validate::tests::bad_urls_are_refused ... ok
test validate::tests::codes_follow_the_rules ... ok
test validate::tests::good_urls_are_accepted_and_trimmed ... ok
test validate::tests::random_codes_are_valid_and_differ ... ok
test store::tests::every_visit_is_counted ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running unittests src/main.rs (target/debug/…/shortener-9578c49212df8d3e)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/api.rs (target/debug/…/api-b6b29370b14e19ad)

running 10 tests
test a_broken_body_gets_an_answer_in_json ... ok
test a_chosen_code_cannot_be_used_twice ... ok
test a_deleted_link_is_gone ... ok
test a_link_can_be_created_and_followed ... ok
test bad_input_is_refused ... ok
test listing_and_deleting_need_the_key ... ok
test the_health_check_answers ... ok
test the_list_is_sorted_by_visits_and_paged ... ok
test unknown_codes_and_paths_give_404 ... ok
test visits_are_counted ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s

   Doc-tests shortener

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Seventeen tests on three levels:

| Level | Tests | They check |
|---|---|---|
| rules (`validate.rs`) | 4 | which addresses and codes are accepted |
| store (`store.rs`) | 3 | that the SQL does what the method names say |
| API (`tests/api.rs`) | 10 | that everything works together, through HTTP |

This is the test pyramid of [chapter 72](#testing-strategies) in small. The ten API tests together take about two hundredths of a second, each with a database of its own. Tests this fast get run after every change.

What the API tests pin down is the *behaviour that clients rely on*: status codes, the shape of the JSON, who may do what. They do not mention SQL or the names of handlers. You could replace SQLite with PostgreSQL, or rewrite every handler, and these tests would tell you whether clients would notice.

## Step 8: make it ready for a server

Build the optimised version:

```sh
cargo build --release
```

The result is one file, `target/release/shortener`. On the machine used for this guide it has about 7 MB, with SQLite and all migrations inside, and the running service occupies about 6 MB of memory. To run it on a server, copy the file there and set the four variables. Nothing else needs to be installed.

Before real users arrive, go through the list of [chapter 64](#web):

1. **HTTPS.** Put a reverse proxy in front that handles the certificates, and set `BASE_URL` to the public address, such as `https://sho.rt`.
2. **The key.** Generate a long random `API_KEY`, and keep it in the settings of your host, not in a file of the project.
3. **The data.** Put the database file on a disk that survives restarts, for example with `DATABASE_URL=sqlite:///data/links.db` (three slashes: an absolute path). Copy it regularly to another place.
4. **The health check.** Tell your host to call `GET /health`.

In a container, the `Dockerfile` of [chapter 64](#web) fits after you change the name of the executable. The `migrations` folder does not need to be copied into the final image, because its content is inside the program.

## What makes this service solid, and what is missing

Worth noticing in the design:

- **Every value from a client is checked before it is used**, in one place, by an allow list.
- **Every value reaches SQL as a bound parameter.** No SQL text is ever built from input, so SQL injection is impossible ([chapter 68](#databases)).
- **Uniqueness and counting are left to the database**, in single statements. There is no moment between a check and an action in which another request could interfere.
- **Errors are data.** Each failure is a variant of one enum, each variant has one status code, and internal details never reach a client.
- **Resources are bounded**: the size of a body, the duration of a request, the length of a list, the number of database connections.
- **The program contains no secrets and no settings.**

A public shortener needs more than this:

- **Rate limiting.** Anybody can create links as fast as they can send requests. A layer that limits requests per client address belongs in front (the crate `tower_governor` provides one).
- **Protection against abuse.** Shorteners hide where a link leads, which makes them attractive for fraud. Real services check addresses against block lists and offer a preview page.
- **Observability.** The service logs, but it counts nothing. A request counter and a duration histogram, exposed on `GET /metrics`, are what turn "it feels slow" into "p99 rose at 14:20" ([chapter 60](#async-ecosystem)). The `GET /health` route is a start; a separate readiness check that also asks the database is the other half.
- **A real login.** One key for one owner works for a machine client, not for people. Sessions for a browser, signed tokens for an app, and the difference between authentication and authorisation are in [chapter 64](#web).
- **Accounts.** One key for one owner is the simplest possible scheme. With several users, each gets a key of their own, stored as a hash like a password. Keys should also be compared in constant time (the crate `subtle` does that), so that the duration of a comparison reveals nothing about the key.
- **A real URL parser.** `check_url` covers the basics. The crate `url` implements the complete standard.
- **More than one machine.** SQLite is a file on one disk. To run several copies of the service, switch to PostgreSQL. Thanks to the store, only `store.rs` and the migration change.
- **Honest numbers.** Chat programs fetch links to show a preview, and each fetch counts as a visit. Real services filter such automatic visitors.

:::compare The same service in other languages
- In **Python** (Flask or FastAPI) or **JavaScript** (Express) this service takes fewer lines. Whether a field can be missing, whether every error case has a status code, and whether a value is text or a number are found out when a request hits the wrong spot, unless tests or additional type checkers catch it earlier. Both need an installed interpreter with the right packages on the server.
- In **Java** (Spring) or **C#** (ASP.NET), types are checked at compile time, and `null` remains possible nearly everywhere. A running service typically needs a hundred megabytes of memory or more.
- **Go** produces a single executable as well. Its errors are values that are easy to ignore, and a missing JSON field silently becomes an empty value.
- In **Rust**, the optional field is an `Option`, the forgotten error case is a compiler error, the forgotten check of a `Result` is a warning, and the result is one file of a few megabytes.
:::

## Make it better

Three extensions, from simple to demanding. Do them in this order, because each builds on the one before. For every one, write the test first, see it fail, and then make it pass.

:::exercise practice Change where a link points
The owner wants to correct the address of an existing link without changing its code. Add the route `PATCH /links/{code}`. It requires the API key and takes a body such as `{"url": "https://new.example"}`. It answers with the changed link, with 404 for an unknown code, and with 422 for an address that breaks the rules.

`PATCH` is the HTTP method for changing part of a resource.

::hint
The store needs a method `update_url(&self, code: &str, url: &str) -> Result<Option<Link>, sqlx::Error>`. A single statement, `UPDATE links SET url = ? WHERE code = ? RETURNING …` with `fetch_optional`, changes the row and tells you whether it existed.

A second method on a path that already has one is added by chaining: `delete(delete_link).patch(change_link)`.

::solution
In `src/store.rs`, inside the second `impl LinkStore` block:

```rust
/// Changes the address of a link. Returns the changed link, or `None` for an unknown code.
pub async fn update_url(&self, code: &str, url: &str) -> Result<Option<Link>, sqlx::Error> {
    sqlx::query_as(
        "UPDATE links SET url = ? WHERE code = ?
         RETURNING code, url, hits, created_at",
    )
    .bind(url)
    .bind(code)
    .fetch_optional(&self.pool)
    .await
}
```

In `src/routes.rs`, a type for the body and a handler:

```rust
/// The body of `PATCH /links/{code}`.
#[derive(Debug, Deserialize)]
struct UrlChange {
    url: String,
}

async fn change_link(
    State(state): State<AppState>,
    Path(code): Path<String>,
    input: Result<Json<UrlChange>, JsonRejection>,
) -> Result<Json<LinkView>, ApiError> {
    let Json(input) = input?;
    let url = check_url(&input.url)?;
    match state.store.update_url(&code, url).await? {
        Some(link) => Ok(Json(LinkView::new(link, &state.base_url))),
        None => Err(ApiError::NotFound(code)),
    }
}
```

And in the function `app`, the route of the `admin` group gets a second method:

```rust
        .route("/links/{code}", delete(delete_link).patch(change_link))
```

The test, appended to `tests/api.rs`:

```rust
#[tokio::test]
async fn the_address_of_a_link_can_be_changed() {
    let app = test_app().await;
    create(
        &app,
        json!({ "url": "https://old.example", "code": "moved" }),
    )
    .await;
    let change = Some(json!({ "url": "https://new.example" }));

    let without_key = call(&app, "PATCH", "/links/moved", None, change.clone()).await;
    assert_eq!(without_key.status, StatusCode::UNAUTHORIZED);

    let changed = call(&app, "PATCH", "/links/moved", Some(KEY), change.clone()).await;
    assert_eq!(changed.status, StatusCode::OK);
    assert_eq!(changed.json["url"], "https://new.example");
    assert_eq!(
        get(&app, "/moved").await.headers["location"],
        "https://new.example"
    );

    let unknown = call(&app, "PATCH", "/links/nothing", Some(KEY), change).await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);

    let nonsense = Some(json!({ "url": "nonsense" }));
    let refused = call(&app, "PATCH", "/links/moved", Some(KEY), nonsense).await;
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
}
```

The new route sits in the `admin` group, so it is protected by the key without one more line. The first assertion of the test makes sure of that. The handler reuses `check_url`, so a changed address must pass the same rules as a new one. And `UPDATE … RETURNING` with `fetch_optional` again does two jobs in one statement: it changes the row, and its `None` says that there was no such row.

Nothing had to change in `error.rs`, `validate.rs`, `config.rs` or `main.rs`. That is the layering at work.
:::

:::exercise practice Remember the last visit
Show in the facts about a link when it was followed most recently: a field `last_visited`, which is `null` until the first visit.

This changes the table, so it needs a new migration. Do not edit the first migration file: databases that exist already would never see the change.

::hint
The migration is one statement: `ALTER TABLE links ADD COLUMN last_visited TEXT;`. Give the file a later timestamp than the first one. A column without `NOT NULL` may be empty, and an empty column maps to `Option<String>` in Rust.

Set the column in the same `UPDATE` that counts the visit. Then add the field to `Link`, to every list of columns in the store, and to `LinkView`.

::solution
The new migration:

```sql file=migrations/20261115090000_add_last_visited.sql
-- The time of the latest visit. NULL means that nobody has followed the link yet.
ALTER TABLE links ADD COLUMN last_visited TEXT;
```

In `src/store.rs`, the struct gets a field, and the method `visit` sets the time:

```rust
/// One row of the table `links`.
#[derive(Debug, Clone, FromRow)]
pub struct Link {
    pub code: String,
    pub url: String,
    pub hits: i64,
    pub created_at: String,
    pub last_visited: Option<String>,
}

/// Counts one visit, notes its time, and returns the address to go to.
pub async fn visit(&self, code: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "UPDATE links SET hits = hits + 1, last_visited = CURRENT_TIMESTAMP
         WHERE code = ? RETURNING url",
    )
    .bind(code)
    .fetch_optional(&self.pool)
    .await
}
```

The four other queries name their columns. Each list becomes `code, url, hits, created_at, last_visited`.

In `src/routes.rs`, `LinkView` gets the field `last_visited: Option<String>`, and `LinkView::new` copies it with `last_visited: link.last_visited`.

The test:

```rust
#[tokio::test]
async fn the_last_visit_is_recorded() {
    let app = test_app().await;
    create(
        &app,
        json!({ "url": "https://example.com", "code": "seen" }),
    )
    .await;
    assert_eq!(
        get(&app, "/links/seen").await.json["last_visited"],
        Value::Null
    );

    get(&app, "/seen").await;

    assert!(get(&app, "/links/seen").await.json["last_visited"].is_string());
}
```

Now start the program on the database file from before. It applies the new migration by itself, and the old links are still there, with an empty `last_visited`:

```text
$ curl http://localhost:3000/links/book
{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":0,"created_at":"2026-11-14 16:08:45","last_visited":null}

$ curl -i http://localhost:3000/book
HTTP/1.1 307 Temporary Redirect
location: https://doc.rust-lang.org/book/
content-length: 0
date: Sat, 14 Nov 2026 16:08:47 GMT

$ curl http://localhost:3000/links/book
{"code":"book","url":"https://doc.rust-lang.org/book/","short_url":"http://localhost:3000/book","hits":1,"created_at":"2026-11-14 16:08:45","last_visited":"2026-11-14 16:08:47"}
```

Three observations:

- The struct and the queries must agree with the table. If you forget the column in one of the lists, `FromRow` fails when that query runs, with an error that names the missing column. The tests catch it, which is one more reason to have a test for every route. The checked macros of [chapter 68](#databases) (`query_as!`) would catch it at compile time.
- An `Option<String>` field is written as `null` in JSON when it is `None`.
- Migrations only go forward. If you start the *old* program on the migrated database, SQLx refuses to continue, because the database has seen a migration that this program does not know. That protects the data from a program that does not understand its shape.
:::

:::exercise challenge Links that expire
Let clients create links with a limited lifetime. The body of `POST /links` gets an optional field `ttl_seconds` ("time to live"). After that many seconds, following the link answers `410 Gone` with the error `the link '…' has expired`, and the visit is not counted. A link without the field never expires. The lifetime must be at least 1 second and at most 10 years.

The interesting part is the test. A test must not wait 60 seconds to see a link expire. So the service must not ask the computer for the time directly. Give it a **clock** that tests can replace.

::hint
Store the moment of expiry in a new column `expires_at INTEGER`, as seconds since 1970 (Unix time). `NULL` means "never".

For the clock, add a field to `AppState`: `pub clock: Clock`, with `pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;`. That is a shared closure which returns the current time in seconds ([chapter 29](#closures), [chapter 56](#shared-state)). The real program passes a closure that reads `SystemTime::now()`. A test passes a closure that reads an `AtomicI64`, which the test can set to any moment.

Let the database decide about the expiry in the same statement that counts: `… WHERE code = ? AND (expires_at IS NULL OR expires_at > ?)`. If no row was changed, a second query finds out whether the link is unknown or expired. An enum with three variants is a good return type for `visit`.

::solution
The migration:

```sql file=migrations/20261116090000_add_expires_at.sql
-- Seconds since 1970-01-01 (Unix time). NULL means that the link never expires.
ALTER TABLE links ADD COLUMN expires_at INTEGER;
```

A new rule in `src/validate.rs`:

```rust
/// Checks a lifetime in seconds: at least one second, and at most ten years.
pub fn check_ttl(seconds: i64) -> Result<i64, ApiError> {
    const TEN_YEARS: i64 = 10 * 365 * 24 * 60 * 60;
    if (1..=TEN_YEARS).contains(&seconds) {
        Ok(seconds)
    } else {
        Err(ApiError::invalid(
            "ttl_seconds must be between 1 and 315360000",
        ))
    }
}
```

A new variant in `src/error.rs`, and its arm in `status`:

```rust
    #[error("the link '{0}' has expired")]
    Expired(String),
```

```rust
            ApiError::Expired(_) => StatusCode::GONE,
```

In `src/store.rs`, `Link` gets the field `pub expires_at: Option<i64>`, and every list of columns gets `expires_at`. `insert` takes the moment of expiry as a third value, and `visit` gets a new return type:

```rust
/// What a visit to a short address leads to.
#[derive(Debug, PartialEq)]
pub enum Visit {
    Go(String),
    Expired,
    Unknown,
}

/// Stores a new link. Fails with `CodeTaken` if the code exists already.
pub async fn insert(
    &self,
    code: &str,
    url: &str,
    expires_at: Option<i64>,
) -> Result<Link, ApiError> {
    let result = sqlx::query_as(
        "INSERT INTO links (code, url, expires_at) VALUES (?, ?, ?)
         RETURNING code, url, hits, created_at, last_visited, expires_at",
    )
    .bind(code)
    .bind(url)
    .bind(expires_at)
    .fetch_one(&self.pool)
    .await;

    match result {
        Ok(link) => Ok(link),
        Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
            Err(ApiError::CodeTaken(code.to_string()))
        }
        Err(error) => Err(error.into()),
    }
}

/// Counts one visit, if the link exists and has not expired at the time `now`.
pub async fn visit(&self, code: &str, now: i64) -> Result<Visit, sqlx::Error> {
    let url: Option<String> = sqlx::query_scalar(
        "UPDATE links SET hits = hits + 1, last_visited = CURRENT_TIMESTAMP
         WHERE code = ? AND (expires_at IS NULL OR expires_at > ?)
         RETURNING url",
    )
    .bind(code)
    .bind(now)
    .fetch_optional(&self.pool)
    .await?;

    if let Some(url) = url {
        return Ok(Visit::Go(url));
    }
    // No row was changed: the code is unknown, or the link has expired
    match self.find(code).await? {
        Some(_) => Ok(Visit::Expired),
        None => Ok(Visit::Unknown),
    }
}
```

In `src/routes.rs`, the clock and the state:

```rust
/// A source of the current time, in seconds since 1970. Tests supply their own.
pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;

/// The real clock of the computer.
pub fn system_clock() -> Clock {
    Arc::new(|| match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(time) => time.as_secs() as i64,
        Err(_) => 0,
    })
}

/// What every handler can reach.
#[derive(Clone)]
pub struct AppState {
    pub store: LinkStore,
    pub api_key: Arc<str>,
    pub base_url: Arc<str>,
    pub clock: Clock,
}
```

`NewLink` gets the field `ttl_seconds: Option<i64>`, and `LinkView` gets `expires_at: Option<i64>`. Two handlers and the helper change:

```rust
async fn create_link(
    State(state): State<AppState>,
    input: Result<Json<NewLink>, JsonRejection>,
) -> Result<(StatusCode, Json<LinkView>), ApiError> {
    let Json(input) = input?;
    let url = check_url(&input.url)?;
    let expires_at = match input.ttl_seconds {
        Some(seconds) => Some((state.clock)() + check_ttl(seconds)?),
        None => None,
    };
    let link = match &input.code {
        Some(code) => {
            state
                .store
                .insert(check_code(code)?, url, expires_at)
                .await?
        }
        None => insert_with_random_code(&state.store, url, expires_at).await?,
    };
    Ok((
        StatusCode::CREATED,
        Json(LinkView::new(link, &state.base_url)),
    ))
}

/// Tries random codes until one is free.
async fn insert_with_random_code(
    store: &LinkStore,
    url: &str,
    expires_at: Option<i64>,
) -> Result<Link, ApiError> {
    loop {
        match store.insert(&random_code(), url, expires_at).await {
            Err(ApiError::CodeTaken(_)) => continue,
            other => return other,
        }
    }
}

async fn follow(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Redirect, ApiError> {
    let now = (state.clock)();
    match state.store.visit(&code, now).await? {
        Visit::Go(url) => Ok(Redirect::temporary(&url)),
        Visit::Expired => Err(ApiError::Expired(code)),
        Visit::Unknown => Err(ApiError::NotFound(code)),
    }
}
```

`src/lib.rs` re-exports the new names with `pub use routes::{AppState, Clock, app, system_clock};`, and `main` adds one line to the state: `clock: system_clock(),`.

In `tests/api.rs`, the application is built around a time that the test owns (this needs `use std::sync::Arc;` and `use std::sync::atomic::{AtomicI64, Ordering};`):

```rust
/// A complete application on a fresh, empty database, with a clock that the test controls.
async fn test_app_at(now: Arc<AtomicI64>) -> Router {
    let store = LinkStore::in_memory().await.unwrap();
    let clock: Clock = Arc::new(move || now.load(Ordering::Relaxed));
    let state = AppState {
        store,
        api_key: KEY.into(),
        base_url: "http://sho.rt".into(),
        clock,
    };
    app(state)
}

/// The same, for tests that do not care about the time.
async fn test_app() -> Router {
    test_app_at(Arc::new(AtomicI64::new(1_000_000))).await
}
```

And the test travels through time without waiting:

```rust
#[tokio::test]
async fn links_can_expire() {
    let now = Arc::new(AtomicI64::new(1_000));
    let app = test_app_at(now.clone()).await;

    let body = json!({ "url": "https://example.com", "code": "brief", "ttl_seconds": 60 });
    let created = create(&app, body).await;
    assert_eq!(created.json["expires_at"], 1_060);

    // 59 seconds later the link still works
    now.store(1_059, Ordering::Relaxed);
    assert_eq!(
        get(&app, "/brief").await.status,
        StatusCode::TEMPORARY_REDIRECT
    );

    // One second later it has expired
    now.store(1_060, Ordering::Relaxed);
    let late = get(&app, "/brief").await;
    assert_eq!(late.status, StatusCode::GONE);
    assert_eq!(late.json["error"], "the link 'brief' has expired");

    // The refused visit was not counted
    assert_eq!(get(&app, "/links/brief").await.json["hits"], 1);
}
```

The existing tests of the store must pass the new arguments, for example `store.insert("docs", "https://docs.rs", None)` and `store.visit("docs", 0)`, and compare with `Visit::Go(…)` and `Visit::Unknown`.

What this exercise shows:

- **Time is an input.** A function that reads the clock of the computer gives a different result on every call, which makes it hard to test. Passing the time in, as the parameter `now` of `visit` and as the closure in the state, makes the code *deterministic*: the same inputs give the same result. The same idea works for random numbers, for the file system and for other services. It is known as **dependency injection**.
- **`(state.clock)()`** calls a closure that is stored in a field. The parentheses around `state.clock` are needed. Without them, Rust would look for a method named `clock`.
- **The expiry check is part of the `UPDATE`.** Checking first and counting afterwards would again leave a gap between check and action.
- **`Visit` has three variants** where an `Option` had two cases, and the `match` in `follow` must handle all three. A `bool` or a second `Option` would have hidden the third case.
- **`410 Gone`** says more than 404: the link existed, and it will not come back.
- **`expires_at > ?`** means that the link is dead at the exact second of expiry. The test pins this down with the two moments 1,059 and 1,060. Boundaries are where mistakes of one hide, so test both sides.
:::

## What you have learned

:::recap
- A web service is easier to build and to change in layers: one speaks HTTP, one holds the rules, one owns the storage.
- A repository type with a private pool keeps all SQL in one file, and gives tests a database of their own in an instant.
- One error enum with `IntoResponse` gives every failure a status code and a uniform body. Internal details go to the log, not to the client.
- Input is checked with allow lists, and reaches SQL only as bound parameters.
- Let the database enforce uniqueness and do the counting, in single statements. A check followed by a separate action leaves a gap.
- Routes that need protection live in a router of their own, wrapped by `route_layer`.
- Settings and secrets come from environment variables, and a missing secret stops the program at the start.
- `oneshot` hands a request straight to the router. Tests then cover everything from routing to SQL, without a network and in milliseconds.
- A build script makes Cargo notice new migration files. The program applies them when it starts.
- What is hard to test, such as the current time, becomes easy when it is passed in.
:::

:::quiz Check your understanding
? All SQL lives inside one repository type with a private pool. What does that buy the project?
+ The SQL is in one file, and each test can get a database of its own in an instant
- The database runs faster
- The queries are checked by the compiler
- The client can send raw SQL
= A repository is the only place that talks to the database, so the rules about uniqueness, counting and transactions live together. Because the pool is private, a test can build a fresh database without touching the real one.

? The service has one error enum with an `IntoResponse` implementation. Why is that the shape of the error handling?
+ Every failure then gets a status code and a uniform JSON body, while internal details go to the log
- The compiler then removes the error checks
- The client receives the SQL error text
- Errors are then impossible
= One place decides how a failure is reported, so no handler can forget to answer with the right status or leak a database message to the client. The details stay in the log, where the operator can read them.

? The rules layer lets the database enforce uniqueness instead of checking in Rust first. Why is that better?
+ A check followed by a separate insert leaves a gap in which two requests can both pass the check, so the constraint has to live in the database
- The database is always faster than Rust code
- Rust cannot compare strings
- The check would need a network call
= The check and the action are two steps, and another request can slip in between them. A unique constraint is decided by the database in one atomic step, so there is no window.

? The tests hand a request straight to the router with `oneshot`. What does that avoid?
+ Opening a network port, so the whole request—from routing to SQL—can be tested in milliseconds
- The need for a database
- Testing the router
- Writing assertions
= `oneshot` turns a request into the same value the socket would have produced, so the router runs for real while the network stays out of the way.
:::


:::checklist
- I built the service and created, followed, listed and deleted links with `curl`.
- I opened a short link in a browser and landed on the long address.
- All 17 tests pass with `cargo test`.
- I can say which file I would change for a new rule, a new query, and a new route.
- I can explain why `insert` does not check first whether a code is free.
- I can explain why the redirect is temporary and not permanent.
- I can explain how a test reaches the handlers without a network port.
- I added the `PATCH` route and its test.
- I added `last_visited` with a second migration, and saw an existing database being upgraded.
- I added expiring links, and tested them with a clock that the test controls.
:::
