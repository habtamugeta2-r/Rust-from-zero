@id capstone
@part p11
@kind project
@title Project: a personal library with a web API and a CLI
@short Capstone project
@level advanced
@time 240
@learn Plan a program in layers: HTTP, rules, storage | Share one data model between a web API and a command-line tool | Store books in SQLite with SQLx | Import and export JSON with Serde | Handle errors uniformly with thiserror and anyhow | Test the API and the CLI without a network | Prepare the program for a server

The earlier chapters each taught one ecosystem: Axum for HTTP, SQLx for databases, clap for command lines, Serde for JSON, thiserror and anyhow for errors. This capstone brings them together into one real program: a **personal library manager**. You can add books, mark them as reading or read, list and search them, and export them to JSON — either through a web API in a browser or through a command-line tool in a terminal.

The finished program works like this:

```text
$ library add --title "Dune" --author "Frank Herbert" --isbn 9780441172719
Added book 1: Dune by Frank Herbert

$ library list
id  title        author           status    rating
1   Dune         Frank Herbert    to-read   -

$ library status 1 --read --rating 5
Marked book 1 as read.

$ library export --format json
[{"id":1,"title":"Dune","author":"Frank Herbert","isbn":"9780441172719","status":"read","rating":5}]

$ curl http://localhost:3000/books
[{"id":1,"title":"Dune","author":"Frank Herbert","isbn":"9780441172719","status":"read","rating":5}]
```

Both the command and the web API talk to the same database. The command-line tool is useful for bulk work; the web API is useful for a small web page or a phone app.

The project brings Part 10 together:

- **Axum** for HTTP ([chapter 46](#web))
- **SQLx** with SQLite for storage ([chapter 47](#databases))
- **Serde** for JSON ([chapter 43](#serde))
- **clap** for the command line ([chapter 44](#cli))
- **thiserror** and **anyhow** for errors ([chapter 18](#errors))
- **tracing** for logs ([chapter 42](#crates))
- **tokio** for the async runtime ([chapter 45](#async-ecosystem))

It also keeps the promises of the tooling chapters: format, lint, test, document, and a CI-style checklist at the end.

:::analogy A library card catalogue
A library has a card catalogue: one card per book, filed so that any librarian can find a book by title, author or subject. The catalogue is the database. The librarian behind the desk is the rules layer — they check that a new book has a title before filing it. The public catalogue terminal and the telephone are the web API and the CLI: two different ways to ask the same librarian about the same cards.
:::

## Step 0: plan

### The API

| Request | What it does | Success |
|---|---|---|
| `GET /health` | answers `ok` if the service and database work | 200 OK |
| `GET /books` | lists books, newest first. `?status=read` and `?q=…` filter | 200 OK |
| `POST /books` | adds a book. Body is JSON: `{"title": "…", "author": "…", "isbn": "…"}` | 201 Created |
| `GET /books/{id}` | shows one book | 200 OK |
| `PATCH /books/{id}` | changes fields. Body is JSON with only the fields to change | 200 OK |
| `DELETE /books/{id}` | removes a book | 204 No Content |

Every failure is answered with JSON:

```text
{"error":"no book with id 99"}
```

| Status | When |
|---|---|
| 400 Bad Request | the body is not valid JSON |
| 404 Not Found | there is no book with that id |
| 422 Unprocessable Entity | the JSON is readable but breaks a rule (empty title, bad rating) |
| 500 Internal Server Error | the database failed |

### The data

One table is enough for a first version:

| Column | Type | Meaning |
|---|---|---|
| `id` | integer, primary key | the book's number |
| `title` | text, not null | the book's title |
| `author` | text, not null | the author's name |
| `isbn` | text | the ISBN, optional |
| `status` | text, not null, default `to-read` | `to-read`, `reading` or `read` |
| `rating` | integer | 1 to 5, only when read |
| `created_at` | text, not null | when the book was added |

### The layers

| Layer | Job | Crates |
|---|---|---|
| HTTP | parse requests, return JSON responses | Axum, Serde |
| Rules | check titles, ratings, statuses; decide what may change | your own code |
| Storage | run SQL against SQLite | SQLx |
| CLI | parse arguments, call the rules, print results | clap, anyhow |

The rules layer is plain Rust with no web and no database. That makes it easy to test, and easy to reuse from both the web API and the CLI.

### The files

```text
library/
├── Cargo.toml
├── build.rs
├── migrations/
│   └── 20261114120000_create_books.sql
├── src/
│   ├── lib.rs          public API: Library, Book, NewBook
│   ├── main.rs         CLI entry point
│   ├── config.rs       settings from environment
│   ├── error.rs        one error type for the whole program
│   ├── model.rs        Book, NewBook, Status, Rating
│   ├── store.rs        SQLx pool, all queries
│   ├── routes.rs       Axum routes and handlers
│   └── cli.rs          clap definition and command handlers
└── tests/
    └── api.rs          end-to-end tests against the router
```

## Step 1: the project and the table

Create the project and add the dependencies:

```sh
cargo new library
cd library
cargo add axum
cargo add tokio --features full
cargo add sqlx --features runtime-tokio,sqlite
cargo add serde --features derive
cargo add serde_json
cargo add clap --features derive
cargo add anyhow
cargo add thiserror
cargo add tracing --features attrs
cargo add tracing-subscriber --features env-filter
cargo add --dev tower --features util
cargo add --dev proptest
```

Then create the migration and the build script so that Cargo notices new migration files:

```sql proj=library file=migrations/20261114120000_create_books.sql
CREATE TABLE books (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    author      TEXT NOT NULL,
    isbn        TEXT,
    status      TEXT NOT NULL DEFAULT 'to-read',
    rating      INTEGER,
    created_at  TEXT NOT NULL
);
```

```rust proj=library file=build.rs
fn main() {
    println!("cargo::rerun-if-changed=migrations");
}
```

```toml proj=library file=Cargo.toml
[package]
name = "library"
version = "0.1.0"
edition = "2024"

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.9", features = ["runtime-tokio", "sqlite"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
clap = { version = "4", features = ["derive"] }
anyhow = "1"
thiserror = "2"
tracing = { version = "0.1", features = ["attrs"] }
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
proptest = "1"
tower = { version = "0.5", features = ["util"] }
```

The `build.rs` `rerun-if-changed` line makes Cargo recompile whenever a migration is added or changed, so `sqlx::migrate!()` never embeds an outdated schema.

## Step 2: the data model and errors

The model types are shared by the store, the routes and the CLI. Keeping them in one file means a change to a book's shape is made in one place.

```rust proj=library file=src/model.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Book {
    pub id: i64,
    pub title: String,
    pub author: String,
    pub isbn: Option<String>,
    pub status: Status,
    pub rating: Option<u32>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NewBook {
    pub title: String,
    pub author: String,
    pub isbn: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Status {
    ToRead,
    Reading,
    Read,
}

impl Default for Status {
    fn default() -> Self {
        Status::ToRead
    }
}

impl std::fmt::Display for Status {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Status::ToRead => write!(f, "to-read"),
            Status::Reading => write!(f, "reading"),
            Status::Read => write!(f, "read"),
        }
    }
}

impl Status {
    pub fn from_str(s: &str) -> Result<Status, String> {
        match s.to_lowercase().as_str() {
            "to-read" => Ok(Status::ToRead),
            "reading" => Ok(Status::Reading),
            "read" => Ok(Status::Read),
            other => Err(format!("unknown status '{other}'")),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rating(pub u32);

impl Rating {
    pub fn try_from(value: u32) -> Result<Rating, String> {
        if value >= 1 && value <= 5 {
            Ok(Rating(value))
        } else {
            Err(format!("{value} is not a rating between 1 and 5"))
        }
    }
}
```

`NewBook` is what a client may send. `Book` is what the store returns — it adds the id and the creation date that the client never chooses. This separation, first seen with notes in [chapter 46](#web), keeps the client from inventing ids.

Now the one error type for the whole program. `thiserror` writes the `Display` and `Error` implementations; `#[from]` lets `?` convert SQLx errors.

```rust proj=library file=src/error.rs
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LibraryError {
    #[error("no book with id {0}")]
    NotFound(i64),

    #[error("{0}")]
    Validation(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

impl LibraryError {
    pub fn validation(message: impl Into<String>) -> LibraryError {
        LibraryError::Validation(message.into())
    }
}
```

## Step 3: the store

The store owns the SQLx pool. Every query lives here, so the rest of the program never sees SQL. A `Library` handle is cheap to clone because it holds an `Arc` inside the pool.

```rust proj=library file=src/store.rs
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::FromRow;
use sqlx::SqlitePool;

use crate::error::LibraryError;
use crate::model::{Book, NewBook, Status};

/// All database access for the library, in one place.
#[derive(Clone)]
pub struct Store {
    pool: SqlitePool,
}

impl Store {
    /// Opens (or creates) the SQLite database file and applies pending migrations.
    pub async fn open(path: &str) -> Result<Store, LibraryError> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(path)
            .await
            .map_err(LibraryError::Database)?;

        sqlx::migrate!()
            .run(&pool)
            .await
            .map_err(LibraryError::Database)?;

        Ok(Store { pool })
    }

    /// Adds a book and returns it with the id the database chose.
    pub async fn add_book(&self, new: NewBook) -> Result<Book, LibraryError> {
        let row: BookRow = sqlx::query_as(
            "INSERT INTO books (title, author, isbn, status, rating, created_at)
             VALUES (?, ?, ?, 'to-read', NULL, datetime('now'))
             RETURNING id, title, author, isbn, status, rating, created_at",
        )
        .bind(&new.title)
        .bind(&new.author)
        .bind(&new.isbn)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.into_book())
    }

    /// Lists books, newest first. Optional filters by status and by a search text.
    pub async fn list_books(
        &self,
        status: Option<Status>,
        search: Option<&str>,
    ) -> Result<Vec<Book>, LibraryError> {
        let mut query = sqlx::QueryBuilder::new(
            "SELECT id, title, author, isbn, status, rating, created_at FROM books WHERE 1 = 1",
        );

        if let Some(status) = status {
            query.push(" AND status = ").push_bind(status.to_string());
        }
        if let Some(search) = search {
            let like = format!("%{search}%");
            query
                .push(" AND (title LIKE ")
                .push_bind(like.clone())
                .push(" OR author LIKE ")
                .push_bind(like)
                .push(")");
        }

        query.push(" ORDER BY id DESC");

        let books: Vec<BookRow> = query.build_query_as().fetch_all(&self.pool).await?;
        Ok(books.into_iter().map(BookRow::into_book).collect())
    }

    /// Finds one book by id.
    pub async fn find_book(&self, id: i64) -> Result<Book, LibraryError> {
        let row: Option<BookRow> = sqlx::query_as(
            "SELECT id, title, author, isbn, status, rating, created_at FROM books WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        row.map(BookRow::into_book).ok_or(LibraryError::NotFound(id))
    }

    /// Changes the status and/or rating of a book.
    pub async fn update_book(
        &self,
        id: i64,
        status: Option<Status>,
        rating: Option<u32>,
    ) -> Result<Book, LibraryError> {
        let mut book = self.find_book(id).await?;

        if let Some(status) = status {
            book.status = status;
        }
        if let Some(rating) = rating {
            book.rating = Some(rating);
        }

        sqlx::query(
            "UPDATE books SET status = ?, rating = ? WHERE id = ?",
        )
        .bind(book.status.to_string())
        .bind(book.rating.map(|r| r as i64))
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(book)
    }

    /// Removes a book. Returns false when there was nothing to remove.
    pub async fn delete_book(&self, id: i64) -> Result<bool, LibraryError> {
        let result = sqlx::query("DELETE FROM books WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() == 1)
    }
}

#[derive(Debug, FromRow)]
struct BookRow {
    id: i64,
    title: String,
    author: String,
    isbn: Option<String>,
    status: String,
    rating: Option<i64>,
    created_at: String,
}

impl BookRow {
    fn into_book(self) -> Book {
        Book {
            id: self.id,
            title: self.title,
            author: self.author,
            isbn: self.isbn,
            status: Status::from_str(&self.status).unwrap_or(Status::ToRead),
            rating: self.rating.map(|r| r as u32),
            created_at: self.created_at,
        }
    }
}
```

`BookRow` is a private helper: SQLx maps a row into it, and `find_book` converts it into the public `Book`. The conversion point is where the database's `rating: Option<i64>` becomes the model's `Option<u32>`, and where the status text is parsed. All SQL stays in this file.

The `sqlx::migrate!()` call runs automatically when the program starts. Migrations that were already applied are skipped.

### Test the store

Because SQLite in memory is fast, each test gets a fresh database:

```rust proj=library file=tests/store.rs
use library::Store;

#[tokio::test]
async fn add_and_find_a_book() {
    let store = Store::open("sqlite::memory:").await.unwrap();

    let book = store
        .add_book(library::NewBook {
            title: String::from("Dune"),
            author: String::from("Frank Herbert"),
            isbn: None,
        })
        .await
        .unwrap();

    assert_eq!(book.title, "Dune");
    assert_eq!(book.status, library::Status::ToRead);
    assert!(book.id > 0);

    let found = store.find_book(book.id).await.unwrap();
    assert_eq!(found.title, "Dune");
}

#[tokio::test]
async fn list_books_filters_by_status() {
    let store = Store::open("sqlite::memory:").await.unwrap();

    store
        .add_book(library::NewBook {
            title: String::from("Dune"),
            author: String::from("Frank Herbert"),
            isbn: None,
        })
        .await
        .unwrap();
    store
        .add_book(library::NewBook {
            title: String::from("Neuromancer"),
            author: String::from("William Gibson"),
            isbn: None,
        })
        .await
        .unwrap();

    let all = store.list_books(None, None).await.unwrap();
    assert_eq!(all.len(), 2);

    let reading = store
        .list_books(Some(library::Status::ToRead), None)
        .await
        .unwrap();
    assert_eq!(reading.len(), 2);
}
```

Each test uses its own in-memory database, so tests never interfere and run in parallel.

## Step 4: the rules

The rules layer sits between the store and the outside world. It knows nothing about HTTP or the command line — it takes values and returns values.

```rust proj=library file=src/lib.rs
pub mod cli;
pub mod config;
pub mod error;
pub mod model;
pub mod routes;
pub mod store;

pub use error::LibraryError;
pub use model::{Book, NewBook, Rating, Status};
pub use store::Store;

/// The public API of the library. A `Library` wraps a `Store` and adds rule checks.
#[derive(Clone)]
pub struct Library {
    store: Store,
}

impl Library {
    pub fn new(store: Store) -> Library {
        Library { store }
    }

    pub async fn add_book(&self, new: NewBook) -> Result<Book, LibraryError> {
        if new.title.trim().is_empty() {
            return Err(LibraryError::validation("the title must not be empty"));
        }
        if new.author.trim().is_empty() {
            return Err(LibraryError::validation("the author must not be empty"));
        }
        self.store.add_book(new).await
    }

    pub async fn list_books(
        &self,
        status: Option<Status>,
        search: Option<&str>,
    ) -> Result<Vec<Book>, LibraryError> {
        self.store.list_books(status, search).await
    }

    pub async fn find_book(&self, id: i64) -> Result<Book, LibraryError> {
        self.store.find_book(id).await
    }

    pub async fn set_status(
        &self,
        id: i64,
        status: Status,
    ) -> Result<Book, LibraryError> {
        self.store.update_book(id, Some(status), None).await
    }

    pub async fn set_rating(
        &self,
        id: i64,
        rating: u32,
    ) -> Result<Book, LibraryError> {
        let rating = Rating::try_from(rating)
            .map_err(LibraryError::validation)?;
        self.store.update_book(id, None, Some(rating.0)).await
    }

    pub async fn delete_book(&self, id: i64) -> Result<bool, LibraryError> {
        self.store.delete_book(id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn library() -> Library {
        Library::new(Store::open("sqlite::memory:").await.unwrap())
    }

    #[tokio::test]
    async fn empty_title_is_refused() {
        let lib = library().await;
        let error = lib
            .add_book(NewBook {
                title: String::from("   "),
                author: String::from("Someone"),
                isbn: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(error, LibraryError::Validation(_)));
    }

    #[tokio::test]
    async fn rating_out_of_range_is_refused() {
        let lib = library().await;
        let book = lib
            .add_book(NewBook {
                title: String::from("Dune"),
                author: String::from("Frank Herbert"),
                isbn: None,
            })
            .await
            .unwrap();

        let error = lib.set_rating(book.id, 9).await.unwrap_err();
        assert!(matches!(error, LibraryError::Validation(_)));

        let ok = lib.set_rating(book.id, 5).await.unwrap();
        assert_eq!(ok.rating, Some(5));
    }
}
```

The rules reject bad input *before* it reaches the database. `set_rating` converts a plain `u32` into a `Rating`, which is only valid between 1 and 5 — so a book can never have a rating of 0 or 99, whatever calls the rules.

## Step 5: the routes

The routes turn HTTP requests into calls on the `Library`. Errors become uniform JSON responses.

```rust proj=library file=src/routes.rs
use axum::extract::{Path, State, Query};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;

use crate::error::LibraryError;
use crate::model::{Book, NewBook, Status};
use crate::Library;

/// State shared by all handlers.
#[derive(Clone)]
pub struct AppState {
    pub library: Library,
}

/// One error shape for every API response.
#[derive(serde::Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for LibraryError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            LibraryError::NotFound(id) => (StatusCode::NOT_FOUND, format!("no book with id {id}")),
            LibraryError::Validation(message) => {
                (StatusCode::UNPROCESSABLE_ENTITY, message.clone())
            }
            LibraryError::Database(_) => {
                tracing::error!("database error: {self}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    String::from("something went wrong"),
                )
            }
        };
        (status, Json(json!({"error": message}))).into_response()
    }
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({"status": "ok"}))
}

async fn list_books(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Book>>, LibraryError> {
    let status = params.get("status").and_then(|s| match s.as_str() {
        "to-read" => Some(Status::ToRead),
        "reading" => Some(Status::Reading),
        "read" => Some(Status::Read),
        _ => None,
    });
    let search = params.get("q").map(|s| s.as_str());
    let books = state.library.list_books(status, search).await?;
    Ok(Json(books))
}

async fn create_book(
    State(state): State<AppState>,
    Json(new): Json<NewBook>,
) -> Result<(StatusCode, Json<Book>), LibraryError> {
    let book = state.library.add_book(new).await?;
    Ok((StatusCode::CREATED, Json(book)))
}

async fn get_book(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Json<Book>, LibraryError> {
    let book = state.library.find_book(id).await?;
    Ok(Json(book))
}

async fn patch_book(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(update): Json<BookUpdate>,
) -> Result<Json<Book>, LibraryError> {
    if let Some(status) = update.status {
        state.library.set_status(id, status).await?;
    }
    if let Some(rating) = update.rating {
        state.library.set_rating(id, rating).await?;
    }
    let book = state.library.find_book(id).await?;
    Ok(Json(book))
}

async fn delete_book(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<StatusCode, LibraryError> {
    let removed = state.library.delete_book(id).await?;
    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(LibraryError::NotFound(id))
    }
}

#[derive(Debug, Deserialize)]
struct BookUpdate {
    #[serde(default)]
    status: Option<Status>,
    #[serde(default)]
    rating: Option<u32>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/books", get(list_books).post(create_book))
        .route("/books/{id}", get(get_book).patch(patch_book).delete(delete_book))
}
```

`LibraryError::into_response` is the one place that decides status codes and bodies. Database errors are logged with their details but the client sees only a neutral message — the security rule from [chapter 46](#web).

## Step 6: settings and `main`

Settings come from environment variables, never from the source code. For multi-environment config files, `.env` loading, and `secrecy::SecretString` redaction, see [chapter 46](#web); for separating `/health/live` and `/health/ready`, see [chapter 51](#observability). `main` wires everything together: logging, the store, the router, and the server.

```rust proj=library file=src/config.rs
use std::env;

pub struct Config {
    pub database_url: String,
    pub bind_address: String,
    pub api_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Config {
        Config {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "library.db".to_string()),
            bind_address: env::var("BIND_ADDRESS")
                .unwrap_or_else(|_| "0.0.0.0:3000".to_string()),
            api_key: env::var("API_KEY").ok(),
        }
    }
}
```

```rust proj=library file=src/cli.rs
use clap::Parser;
use std::path::PathBuf;

/// A personal library manager: add, list and track books.
#[derive(Debug, Parser)]
#[command(name = "library")]
pub enum Command {
    /// Add a book
    Add {
        /// The book's title
        #[arg(short, long)]
        title: String,
        /// The author's name
        #[arg(short, long)]
        author: String,
        /// The ISBN, optional
        #[arg(long)]
        isbn: Option<String>,
    },
    /// List books
    List {
        /// Show only books with this status: to-read, reading, read
        #[arg(long)]
        status: Option<String>,
    },
    /// Mark a book as read
    Read {
        /// The book's id
        id: i64,
        /// The rating, 1 to 5
        #[arg(short, long)]
        rating: Option<u32>,
    },
    /// Remove a book
    Remove {
        /// The book's id
        id: i64,
    },
    /// Export all books as JSON
    Export {
        /// Write to this file instead of printing
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    /// Start the HTTP API server
    Serve,
}
```

```rust proj=library file=src/main.rs
use anyhow::Result;
use clap::Parser;
use library::cli::Command;
use library::config::Config;
use library::{Library, NewBook, Status, Store};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("library=info".parse()?),
        )
        .init();

    let config = Config::from_env();
    tracing::info!("opening database {}", config.database_url);
    let store = Store::open(&config.database_url).await?;
    let library = Library::new(store);

    match Command::parse() {
        Command::Add {
            title,
            author,
            isbn,
        } => {
            let book = library
                .add_book(NewBook {
                    title,
                    author,
                    isbn,
                })
                .await?;
            println!("Added book {}: {} by {}", book.id, book.title, book.author);
        }
        Command::List { status } => {
            let status = status.as_deref().and_then(|s| match s {
                "to-read" => Some(Status::ToRead),
                "reading" => Some(Status::Reading),
                "read" => Some(Status::Read),
                _ => None,
            });
            let books = library.list_books(status, None).await?;
            println!("id  title        author           status    rating");
            for book in &books {
                let rating = book
                    .rating
                    .map(|r| r.to_string())
                    .unwrap_or_else(|| String::from("-"));
                println!(
                    "{}  {:<12} {:<18} {:<9} {}",
                    book.id, book.title, book.author, book.status, rating
                );
            }
        }
        Command::Read { id, rating } => {
            if let Some(rating) = rating {
                library.set_rating(id, rating).await?;
            } else {
                library.set_status(id, Status::Read).await?;
            }
            println!("Marked book {id} as read.");
        }
        Command::Remove { id } => {
            let removed = library.delete_book(id).await?;
            if removed {
                println!("Removed book {id}.");
            } else {
                println!("No book with id {id}.");
            }
        }
        Command::Export { output } => {
            let books = library.list_books(None, None).await?;
            let json = serde_json::to_string_pretty(&books)?;
            if let Some(path) = output {
                std::fs::write(&path, &json)?;
                println!("Wrote {} books to {}", books.len(), path.display());
            } else {
                println!("{json}");
            }
        }
        Command::Serve => {
            tracing::info!("listening on {}", config.bind_address);
            library::run_server(library, &config.bind_address).await?;
        }
    }

    Ok(())
}
```

`main` runs inside `#[tokio::main]` and calls the async `Library` directly for both CLI commands and `library serve`. The same `Library` handle drives the terminal commands and sits behind `State<AppState>` for Axum: one set of rules, two interfaces.

```rust proj=library file=src/lib.rs cont

/// Runs the web API until Ctrl+C.
pub async fn run_server(library: Library, bind_address: &str) -> std::io::Result<()> {
    use crate::routes::AppState;
    let state = AppState { library };
    let listener = tokio::net::TcpListener::bind(bind_address).await?;
    axum::serve(listener, routes::router().with_state(state))
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.expect("could not listen for ctrl+c");
        })
        .await
}
```

## Try it

Build and run the server in one terminal:

```sh
cargo run -- serve
```

Then in another:

```text
$ curl http://localhost:3000/health
{"status":"ok"}

$ curl -X POST http://localhost:3000/books -H 'content-type: application/json' \
  -d '{"title": "Dune", "author": "Frank Herbert", "isbn": "9780441172719"}'
{"id":1,"title":"Dune","author":"Frank Herbert","isbn":"9780441172719","status":"to-read","rating":null,"created_at":"2026-…"}

$ curl http://localhost:3000/books/1
{"id":1,"title":"Dune",…}
```

And the CLI in a third terminal (or the same one, after stopping the server):

```text
$ library add --title "Neuromancer" --author "William Gibson"
Added book 2: Neuromancer by William Gibson

$ library list
id  title        author           status    rating
2   Neuromancer  William Gibson   to-read   -
1   Dune         Frank Herbert    to-read   -

$ library read 1 --rating 5
Marked book 1 as read.

$ library export
[
  {
    "id": 2,
    "title": "Neuromancer",
    "author": "William Gibson",
    "isbn": null,
    "status": "to-read",
    "rating": null,
    "created_at": "…"
  },
  {
    "id": 1,
    "title": "Dune",
    "author": "Frank Herbert",
    "isbn": "9780441172719",
    "status": "read",
    "rating": 5,
    "created_at": "…"
  }
]
```

The web API and the CLI see the same books because they share one `Library` and one `Store`.

## Step 7: test the whole API

The tests hand requests straight to the router, exactly as in [chapter 46](#web). No network port is opened, so the tests run in milliseconds.

```rust proj=library file=tests/api.rs
use axum::body::to_bytes;
use axum::http::{Request, StatusCode};
use library::routes::{router, AppState};
use library::{Library, Store};
use tower::ServiceExt;

async fn test_app() -> AppState {
    let store = Store::open("sqlite::memory:").await.unwrap();
    AppState {
        library: Library::new(store),
    }
}

async fn post_json(app: &AppState, path: &str, body: &str) -> (StatusCode, String) {
    let request = Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();
    let response = router()
        .clone()
        .with_state(app.clone())
        .oneshot(request)
        .await
        .unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, String::from_utf8_lossy(&bytes).into_owned())
}

#[tokio::test]
async fn health_answers_ok() {
    let app = test_app().await;
    let request = Request::builder()
        .method("GET")
        .uri("/health")
        .body(axum::body::Body::empty())
        .unwrap();
    let response = router()
        .clone()
        .with_state(app.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn add_and_get_a_book() {
    let app = test_app().await;
    let (status, body) = post_json(
        &app,
        "/books",
        r#"{"title": "Dune", "author": "Frank Herbert"}"#,
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(body.contains("Dune"));

    let request = Request::builder()
        .method("GET")
        .uri("/books/1")
        .body(axum::body::Body::empty())
        .unwrap();
    let response = router()
        .clone()
        .with_state(app.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn missing_book_is_404() {
    let app = test_app().await;
    let request = Request::builder()
        .method("GET")
        .uri("/books/99")
        .body(axum::body::Body::empty())
        .unwrap();
    let response = router()
        .clone()
        .with_state(app.clone())
        .oneshot(request)
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert!(String::from_utf8_lossy(
        &to_bytes(response.into_body(), usize::MAX).await.unwrap()
    )
    .contains("error"));
}
```

The `AppState` clone is cheap: `Library` holds an `Arc`-backed pool. Each test gets a fresh in-memory database.

## What makes this service solid, and what is missing

**Solid:**

- One error enum gives every failure a status code and a uniform JSON body.
- All SQL lives in `store.rs`; the rules and routes never touch it.
- Bad input is rejected by the rules before it reaches the database.
- Database errors are logged, not shown to the client.
- Settings come from environment variables.
- The program shuts down gracefully on Ctrl+C.
- Tests cover the API without a network.

**Missing (deliberately, for the exercises):**

- `list_books` ignores the `status` and `search` filters in the CLI-only path (they work in the web API).
- There is no pagination: `GET /books` returns every book.
- No authentication: anybody may add or delete books.
- No protection against a very large request body.
- The CLI and the server are separate entry points; a real program might share one binary with a `--server` flag.

## Make it better

:::exercise practice Add the missing filters
Make `GET /books?status=read` and `GET /books?q=dune` work. The route already parses them and passes them to `list_books`; the store already builds a dynamic query with `QueryBuilder`.
::hint
Check that the `status` query parameter maps to `Status::ToRead`, `Status::Reading` or `Status::Read`, and that `q` is passed as a search string. Add tests that request `?status=read` and check that only read books come back.
::solution
```rust
// The route in routes.rs already does this:
// let status = params.get("status").and_then(|s| match s.as_str() { ... });
// let search = params.get("q").map(|s| s.as_str());
// let books = state.library.list_books(status, search).await?;
//
// The store's list_books already builds `WHERE 1 = 1` and appends
// `AND status = ?` and `AND (title LIKE ? OR author LIKE ?)`.
```
Add tests that request `?status=read` and check that only read books come back.
:::

:::exercise practice Pagination
Add `?limit=20&offset=0` to `GET /books`. `limit` defaults to 50, `offset` to 0. Add SQL `LIMIT ? OFFSET ?` to the store query, and test that a page returns at most `limit` books.
::hint
Add `limit: Option<u32>` and `offset: Option<u32>` to `list_books`, push `LIMIT` and `OFFSET` with `push_bind` at the end of the `QueryBuilder`, and convert to `i64` for SQLx.
::solution
```rust
// In store.rs, after the ORDER BY in list_books:
query.push(" ORDER BY id DESC LIMIT ? OFFSET ?");
query.push_bind(limit.unwrap_or(50) as i64).push_bind(offset.unwrap_or(0) as i64);
```

```rust
// In routes.rs, read `limit` and `offset` from the query params, defaulting to
// 50 and 0, and pass them to `list_books`.
```

Test that asking for 1 book from a database with 3 returns exactly 1, and that asking for offset 1 skips the first.
:::

:::exercise challenge Protect the writes
Add an API key. `POST /books`, `PATCH /books/{id}` and `DELETE /books/{id}` require the header `x-api-key` to match the `API_KEY` environment variable. Reading stays open. Use Axum middleware from [chapter 46](#web), and keep the key out of the source code.
::hint
Write a `require_key` middleware function like the one in [chapter 46](#web). Put the write routes in their own router with `.route_layer(middleware::from_fn(require_key))`. Read `API_KEY` in `Config` and pass it into `AppState`.
::solution
```rust
// In config.rs, `pub api_key: Option<String>` is already read from `env::var("API_KEY").ok()`.
// In routes.rs, add `middleware::from_fn(require_key)` around the write router.
// The middleware compares the header with `state.api_key` and answers 401 on mismatch.
```

Test that a write without the key gets 401, and with the right key succeeds.
:::

:::exercise challenge A second migration
Add a `last_visited` column that records when a book was opened through `GET /books/{id}`. Write the migration SQL, apply it at start-up, update the handler to set the column, and add a test that checks the column exists.
::hint
Create `migrations/20261115090000_add_last_visited.sql` with `ALTER TABLE books ADD COLUMN last_visited TEXT;`. `sqlx::migrate!()` applies it automatically. Add the column to `BookRow` and `Book`, and `datetime('now')` in the `GET /books/{id}` handler path.
::solution
```sql
-- migrations/20261115090000_add_last_visited.sql
ALTER TABLE books ADD COLUMN last_visited TEXT;
```

```rust
// In store.rs, add `last_visited: Option<String>` to `BookRow`, map it into
// `Book`, and add an `update_last_visited(id)` method that runs
// `UPDATE books SET last_visited = datetime('now') WHERE id = ?`.
```

```rust
// In routes.rs, `get_book` calls `state.library.touch(id)` before returning the book.
```

`sqlx::migrate!()` applies both migrations in order, and skips any already applied.
:::

## What you have learned

:::recap
- A program in layers — HTTP, rules, storage — is easy to test and easy to reuse.
- One data model shared by the web API and the CLI means both interfaces see the same data.
- SQLx keeps all SQL in one file, with bound parameters and compile-friendly queries.
- `thiserror` gives libraries a precise error enum; `anyhow` gives applications quick context.
- `LibraryError::IntoResponse` turns every failure into a fitting JSON answer.
- Settings come from environment variables; secrets never appear in source code.
- A single `#[tokio::main]` binary drives both the terminal subcommands and `library serve` over the shared `Library`.
- Tests hand requests straight to the router; each test gets its own in-memory database.
- Migrations evolve the schema safely, and `build.rs` makes Cargo notice them.
:::

:::checklist
- I built the library and used both `library add` / `library list` and the web API with `curl`.
- The same book appears in the CLI output and in the JSON from `/books`.
- `cargo test` passes for the store, the rules and the API.
- I can explain why `LibraryError::IntoResponse` logs database details but hides them.
- I can explain why `NewBook` and `Book` are separate types.
- I added the status/search filters.
- I added pagination.
- I added API-key protection for writes.
- I added a second migration and saw it applied at start-up.
:::

## What comes next

You have reached the end of Part 11 and of this guide. You now know how to build command-line tools, web services, database-backed programs, graphical applications, observability pipelines, and embedded software in Rust. Head to [chapter 54](#next) for the books, crates, and communities where Rust developers keep learning.