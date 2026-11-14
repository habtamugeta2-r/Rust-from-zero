@id databases
@part p10
@title Databases: SQL with SQLx, Diesel and SeaORM
@short Databases
@level intermediate
@time 100
@learn Explain tables, rows, keys and the basic SQL statements | Query a database from Rust with SQLx and map rows to structs | Prevent SQL injection with bound parameters | Keep data consistent with transactions | Manage the schema with migrations and check queries at compile time | Compare SQLx with the ORMs Diesel and SeaORM

So far, your programs kept their data in memory or in a file that they read and wrote as a whole. That stops working when the data grows, when several users change it at the same moment, or when you need questions answered such as "all orders of last month above 100 birr, by customer". A **database** is a program made for exactly this: it stores data safely, finds it fast, and lets many clients work at once.

:::analogy A library with a librarian
In a large library you do not walk along the shelves yourself. You hand the librarian a precise request: "all books by this author, newest first". The librarian knows the catalogue, finds the books quickly, and makes sure that two readers never take the same copy home. A database is the library together with its librarian, and the language of the requests is called SQL.
:::

## Words first

- A **relational database** stores data in **tables**. A table looks like a spreadsheet: every **row** is one thing (a book, a user), and every **column** is one property (title, year).
- Each column has a **type**, such as integer or text, and may forbid empty values.
- A **primary key** is a column whose value identifies a row, usually a number named `id`.
- A **foreign key** is a column that holds the primary key of a row in another table. It links the two: an order *belongs to* a customer.
- The set of tables and columns is the **schema**.
- **SQL** ("structured query language") is the language for defining tables and for reading and changing rows. One request in it is a **query** or **statement**.

Three database systems cover most uses:

| System | What it is | Typical use |
|---|---|---|
| **SQLite** | a library inside your program. The database is one file | apps, tools, embedded devices, small web sites, tests |
| **PostgreSQL** | a server that many programs connect to | the default for web services |
| **MySQL**, **MariaDB** | servers as well | widespread in web hosting |

This chapter uses SQLite, because there is nothing to install: the examples create a database in memory and run on the spot. Nearly everything carries over to PostgreSQL, and a table at the end lists the differences.

## SQL in ten minutes

SQL reads almost like English. These statements are the core of it:

```sql
-- Define a table
CREATE TABLE books (
    id     INTEGER PRIMARY KEY,   -- the database chooses the number
    title  TEXT NOT NULL,         -- NOT NULL: a value is required
    author TEXT NOT NULL,
    year   INTEGER NOT NULL,
    rating REAL                   -- may be empty (NULL)
);

-- Add rows
INSERT INTO books (title, author, year) VALUES ('Dune', 'Frank Herbert', 1965);

-- Read rows: which columns, from where, which rows, in what order, how many
SELECT title, year FROM books WHERE year < 1990 ORDER BY year DESC LIMIT 10;
SELECT * FROM books WHERE author = 'Frank Herbert' AND rating IS NOT NULL;
SELECT COUNT(*) FROM books;

-- Change rows
UPDATE books SET rating = 4.3 WHERE id = 1;

-- Remove rows
DELETE FROM books WHERE year < 1900;
```

- `SELECT … FROM … WHERE …` is the workhorse. `*` means all columns.
- `WHERE` chooses the rows. Without it, `UPDATE` and `DELETE` affect **every** row.
- **`NULL`** means "no value". It is the database's `None`. Test for it with `IS NULL`, not with `=`.
- Text is written in single quotes. Keywords are written in capitals by convention.

You will meet `JOIN`, `GROUP BY` and transactions further down.

## SQLx: SQL with Rust types

**SQLx** is the most popular database library for async Rust. You write plain SQL, and SQLx sends it, fills in the parameters, and converts the rows into Rust values. It supports SQLite, PostgreSQL and MySQL.

```toml
[dependencies]
sqlx = { version = "0.9.0", features = ["runtime-tokio", "sqlite"] }
tokio = { version = "1.54.1", features = ["full"] }
```

```rust ext run
# #![allow(dead_code)]
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{FromRow, Row};

#[derive(Debug, FromRow)]
struct Book {
    id: i64,
    title: String,
    author: String,
    year: i64,
    rating: Option<f64>,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    // A database in memory. It disappears when the program ends.
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;

    sqlx::query(
        "CREATE TABLE books (
            id     INTEGER PRIMARY KEY,
            title  TEXT NOT NULL,
            author TEXT NOT NULL,
            year   INTEGER NOT NULL,
            rating REAL
        )",
    )
    .execute(&pool)
    .await?;

    // Insert rows. The `?` marks are filled by `bind`, in order.
    let books = [
        ("Dune", "Frank Herbert", 1965, Some(4.3)),
        ("Neuromancer", "William Gibson", 1984, Some(3.9)),
        ("Snow Crash", "Neal Stephenson", 1992, None),
    ];
    for (title, author, year, rating) in books {
        let result = sqlx::query("INSERT INTO books (title, author, year, rating) VALUES (?, ?, ?, ?)")
            .bind(title)
            .bind(author)
            .bind(year)
            .bind(rating)
            .execute(&pool)
            .await?;
        println!("inserted '{title}' with id {}", result.last_insert_rowid());
    }

    // Read rows into structs
    let all: Vec<Book> = sqlx::query_as("SELECT id, title, author, year, rating FROM books ORDER BY year").fetch_all(&pool).await?;
    for book in &all {
        println!("{:?}", book);
    }

    // One row, or none
    let found: Option<Book> = sqlx::query_as("SELECT * FROM books WHERE title = ?").bind("Dune").fetch_optional(&pool).await?;
    println!("{:?}", found.map(|book| book.author));
    let missing: Option<Book> = sqlx::query_as("SELECT * FROM books WHERE title = ?").bind("Emma").fetch_optional(&pool).await?;
    println!("{:?}", missing.is_none());

    // A single value
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM books WHERE year < ?").bind(1990).fetch_one(&pool).await?;
    println!("{count} books before 1990");

    // A row without a struct
    let row = sqlx::query("SELECT title, year FROM books ORDER BY year DESC LIMIT 1").fetch_one(&pool).await?;
    let title: String = row.get("title");
    let year: i64 = row.get("year");
    println!("newest: {title} ({year})");

    // Change and delete
    let updated = sqlx::query("UPDATE books SET rating = ? WHERE title = ?").bind(4.1).bind("Snow Crash").execute(&pool).await?;
    println!("updated {} row(s)", updated.rows_affected());
    let deleted = sqlx::query("DELETE FROM books WHERE year < ?").bind(1970).execute(&pool).await?;
    println!("deleted {} row(s)", deleted.rows_affected());
    Ok(())
}
```
```output
inserted 'Dune' with id 1
inserted 'Neuromancer' with id 2
inserted 'Snow Crash' with id 3
Book { id: 1, title: "Dune", author: "Frank Herbert", year: 1965, rating: Some(4.3) }
Book { id: 2, title: "Neuromancer", author: "William Gibson", year: 1984, rating: Some(3.9) }
Book { id: 3, title: "Snow Crash", author: "Neal Stephenson", year: 1992, rating: None }
Some("Frank Herbert")
true
2 books before 1990
newest: Snow Crash (1992)
updated 1 row(s)
deleted 1 row(s)
```

The pieces:

- A **connection pool** keeps a set of open connections to the database and lends one out for each query. Opening a connection is slow, so they are reused. Create one pool when the program starts, and share it. It is cheap to clone.
- `sqlx::query(sql)` prepares a statement. **`.bind(value)`** supplies a value for the next `?` in the SQL text.
- `.execute(&pool)` runs a statement that returns no rows. Its result tells how many rows were changed.
- `sqlx::query_as(sql)` converts each row into a struct that derives **`FromRow`**. The column names must match the field names. A column that may be `NULL` needs an `Option` field.
- `sqlx::query_scalar(sql)` is for a single column.

| Method | Returns | Use when |
|---|---|---|
| `.execute(&pool)` | the number of changed rows | `INSERT`, `UPDATE`, `DELETE`, `CREATE` |
| `.fetch_all(&pool)` | `Vec<T>` | a list of rows |
| `.fetch_one(&pool)` | `T`. An error if there is no row | exactly one row must exist |
| `.fetch_optional(&pool)` | `Option<T>` | zero or one row: "find by id" |
| `.fetch(&pool)` | a stream of rows | very many rows, handled one at a time |

| SQLite type | Rust type |
|---|---|
| `INTEGER` | `i64` (also `i32`, `bool`) |
| `REAL` | `f64` |
| `TEXT` | `String` |
| `BLOB` | `Vec<u8>` |
| `NULL` allowed | `Option<T>` |
| dates and times | `chrono` or `time` types, with the feature of the same name |
| JSON | `sqlx::types::Json<T>`, with the feature `json` |

:::note In memory and on disk
`sqlite::memory:` creates an empty database in memory. Each *connection* gets its own, which is why these examples limit the pool to one connection. For a database in a file, connect to `sqlite://app.db`, and use `SqliteConnectOptions` with `create_if_missing(true)` so that the file is created at the first start.
:::

## Never build SQL from input

The values in the examples went through `bind`, never into the SQL text. This is the most important rule of database programming. Here is what happens otherwise:

```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

async fn setup() -> Result<SqlitePool, sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, secret TEXT NOT NULL)").execute(&pool).await?;
    sqlx::query("INSERT INTO users (name, secret) VALUES ('sara', 'likes tea'), ('tomas', 'likes coffee'), ('admin', 'the master key')")
        .execute(&pool)
        .await?;
    Ok(pool)
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = setup().await?;

    // What an attacker types into the "name" field of a form
    let input = "nobody' OR '1'='1";

    // WRONG: the input becomes part of the SQL text
    let dangerous = format!("SELECT secret FROM users WHERE name = '{input}'");
    println!("{dangerous}");
    let leaked: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(dangerous)).fetch_all(&pool).await?;
    println!("built from a string: {} rows: {:?}", leaked.len(), leaked);

    // RIGHT: the input is sent as a value, apart from the SQL text
    let safe: Vec<String> = sqlx::query_scalar("SELECT secret FROM users WHERE name = ?").bind(input).fetch_all(&pool).await?;
    println!("with a bound parameter: {} rows", safe.len());
    Ok(())
}
```
```output
SELECT secret FROM users WHERE name = 'nobody' OR '1'='1'
built from a string: 3 rows: ["likes tea", "likes coffee", "the master key"]
with a bound parameter: 0 rows
```

The attacker's quote character ended the text value early, and the rest of the input became SQL: `OR '1'='1'` is true for every row, so every secret was returned. This attack is called **SQL injection**. For decades it has been among the most common causes of stolen data.

With `bind`, the SQL text and the values travel to the database separately. The input is only ever a value. It is compared with the names, matches none, and the query returns nothing.

SQLx goes one step further. It accepts only string literals as query text. Did you notice `AssertSqlSafe` in the wrong version? Without it, the example does not compile:

```rust
let leaked: Vec<String> = sqlx::query_scalar(&dangerous).fetch_all(&pool).await?;
```
```error
error[E0277]: dynamic SQL strings should be audited for possible injections
   --> src/main.rs:23:50
    |
 23 |     let leaked: Vec<String> = sqlx::query_scalar(&dangerous).fetch_all(&pool).await?;
    |                               ------------------ ^^^^^^^^^^ dynamic SQL string
    |                               |
    |                               required by a bound introduced by this call
    |
    = help: the trait `SqlSafeStr` is not implemented for `&std::string::String`
    = note: prefer literal SQL strings with bind parameters or `QueryBuilder` to add dynamic data to a query.

            To bypass this error, manually audit for potential injection vulnerabilities and wrap with `AssertSqlSafe()`.
            For details, see the docs for `SqlSafeStr`.

    = note: this trait is only implemented for `&'static str`, not all `&str` like the compiler error may suggest
```

A query must be a `&'static str`, which in practice means a literal in your source code. A `String` built at run time is refused, unless you wrap it in `AssertSqlSafe` and so state that you have checked it. A security rule has become a type rule.

### Queries that depend on the input

Sometimes the *shape* of a query varies: a search form with optional filters, or an insert of many rows. **`QueryBuilder`** assembles such a query from fixed pieces of SQL and bound values:

```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{QueryBuilder, Sqlite};

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, year INTEGER NOT NULL)")
        .execute(&pool)
        .await?;

    // Insert many rows with one statement
    let books = [("Dune", "Frank Herbert", 1965), ("Neuromancer", "William Gibson", 1984), ("Children of Dune", "Frank Herbert", 1976)];
    let mut insert: QueryBuilder<Sqlite> = QueryBuilder::new("INSERT INTO books (title, author, year) ");
    insert.push_values(books, |mut row, (title, author, year)| {
        row.push_bind(title).push_bind(author).push_bind(year);
    });
    println!("{}", insert.sql().as_str());
    insert.build().execute(&pool).await?;

    // A search whose conditions depend on the input
    let author: Option<&str> = Some("Frank Herbert");
    let min_year: Option<i64> = Some(1970);

    let mut search: QueryBuilder<Sqlite> = QueryBuilder::new("SELECT title FROM books WHERE 1 = 1");
    if let Some(author) = author {
        search.push(" AND author = ").push_bind(author);
    }
    if let Some(year) = min_year {
        search.push(" AND year >= ").push_bind(year);
    }
    search.push(" ORDER BY year");
    println!("{}", search.sql().as_str());

    let titles: Vec<String> = search.build_query_scalar().fetch_all(&pool).await?;
    println!("{:?}", titles);
    Ok(())
}
```
```output
INSERT INTO books (title, author, year) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)
SELECT title FROM books WHERE 1 = 1 AND author = ? AND year >= ? ORDER BY year
["Children of Dune"]
```

`push` adds SQL text that you wrote, and `push_bind` adds a `?` together with its value. The printed SQL shows that no value ever enters the text. (`WHERE 1 = 1` is a small trick: every further condition can then start with `AND`.)

## Transactions: all or nothing

Some changes belong together. Moving money takes two updates: less on one account, more on the other. If the program stops between them, money has vanished. A **transaction** groups statements so that either all of them take effect, or none.

```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

async fn balance(pool: &SqlitePool, name: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT cents FROM accounts WHERE name = ?").bind(name).fetch_one(pool).await
}

/// Moves money from one account to another. Either both changes happen, or neither.
async fn transfer(pool: &SqlitePool, from: &str, to: &str, cents: i64) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;

    sqlx::query("UPDATE accounts SET cents = cents - ? WHERE name = ?").bind(cents).bind(from).execute(&mut *transaction).await?;

    let received =
        sqlx::query("UPDATE accounts SET cents = cents + ? WHERE name = ?").bind(cents).bind(to).execute(&mut *transaction).await?;
    if received.rows_affected() == 0 {
        // Returning early drops the transaction, which undoes the first update
        return Err(sqlx::Error::RowNotFound);
    }

    transaction.commit().await
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE accounts (name TEXT PRIMARY KEY, cents INTEGER NOT NULL CHECK (cents >= 0))").execute(&pool).await?;
    sqlx::query("INSERT INTO accounts VALUES ('sara', 10000), ('tomas', 2000)").execute(&pool).await?;

    println!("{:?}", transfer(&pool, "sara", "tomas", 2500).await.is_ok());
    println!("sara {}, tomas {}", balance(&pool, "sara").await?, balance(&pool, "tomas").await?);

    // The receiver does not exist: the money must not leave Sara's account
    println!("{:?}", transfer(&pool, "sara", "nobody", 1000).await.is_ok());
    println!("sara {}, tomas {}", balance(&pool, "sara").await?, balance(&pool, "tomas").await?);

    // More than the account holds: the CHECK rule of the table refuses
    let error = transfer(&pool, "tomas", "sara", 999_999).await.unwrap_err();
    println!("{error}");
    println!("sara {}, tomas {}", balance(&pool, "sara").await?, balance(&pool, "tomas").await?);
    Ok(())
}
```
```output
true
sara 7500, tomas 4500
false
sara 7500, tomas 4500
error returned from database: (code: 275) CHECK constraint failed: cents >= 0
sara 7500, tomas 4500
```

- `pool.begin()` starts a transaction. Statements run on it with `&mut *transaction` in place of `&pool`.
- `commit()` makes the changes permanent.
- If the transaction value is **dropped without a commit**, everything is undone. This is called a **rollback**. An early `return` or a `?` therefore cleans up by itself. It is RAII from [chapter 12](#structs), applied to a database.
- `CHECK (cents >= 0)` is a **constraint**: a rule that the database enforces for every row, whoever writes. Rules that must always hold belong into the schema, as the last line of defence.

Databases promise four properties for transactions, known as **ACID**: *atomic* (all or nothing), *consistent* (the rules hold afterwards), *isolated* (transactions running at the same time do not see each other's half-done work), and *durable* (what is committed survives a crash).

## Several tables: `JOIN` and `GROUP BY`

Real data lives in several tables that refer to each other. Each fact is stored once: the name of a product stands in the products table, and an order refers to it by id. A **`JOIN`** puts the rows that belong together side by side again, and **`GROUP BY`** summarises.

```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::FromRow;

#[derive(Debug, FromRow)]
struct OrderLine {
    customer: String,
    product: String,
    quantity: i64,
    total_cents: i64,
}

#[derive(Debug, FromRow)]
struct CustomerTotal {
    customer: String,
    orders: i64,
    spent_cents: i64,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;

    sqlx::raw_sql(
        "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
         CREATE TABLE products  (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price_cents INTEGER NOT NULL);
         CREATE TABLE orders (
             id          INTEGER PRIMARY KEY,
             customer_id INTEGER NOT NULL REFERENCES customers(id),
             product_id  INTEGER NOT NULL REFERENCES products(id),
             quantity    INTEGER NOT NULL
         );
         INSERT INTO customers (id, name) VALUES (1, 'Sara'), (2, 'Tomas'), (3, 'Lena');
         INSERT INTO products (id, name, price_cents) VALUES (1, 'tea', 450), (2, 'coffee', 600), (3, 'honey', 900);
         INSERT INTO orders (customer_id, product_id, quantity) VALUES (1, 1, 2), (1, 3, 1), (2, 2, 4), (1, 2, 2);",
    )
    .execute(&pool)
    .await?;

    // JOIN: combine rows of several tables that belong together
    let lines: Vec<OrderLine> = sqlx::query_as(
        "SELECT c.name AS customer, p.name AS product, o.quantity, o.quantity * p.price_cents AS total_cents
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         JOIN products p ON p.id = o.product_id
         ORDER BY o.id",
    )
    .fetch_all(&pool)
    .await?;
    for line in &lines {
        println!("{} bought {} x {} for {} cents", line.customer, line.quantity, line.product, line.total_cents);
    }

    // GROUP BY: one result row per customer, with totals
    let totals: Vec<CustomerTotal> = sqlx::query_as(
        "SELECT c.name AS customer, COUNT(o.id) AS orders, COALESCE(SUM(o.quantity * p.price_cents), 0) AS spent_cents
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
         LEFT JOIN products p ON p.id = o.product_id
         GROUP BY c.id
         ORDER BY spent_cents DESC",
    )
    .fetch_all(&pool)
    .await?;
    for total in &totals {
        println!("{:<6} orders: {}, spent: {} cents", total.customer, total.orders, total.spent_cents);
    }
    Ok(())
}
```
```output
Sara bought 2 x tea for 900 cents
Sara bought 1 x honey for 900 cents
Tomas bought 4 x coffee for 2400 cents
Sara bought 2 x coffee for 1200 cents
Sara   orders: 3, spent: 3000 cents
Tomas  orders: 1, spent: 2400 cents
Lena   orders: 0, spent: 0 cents
```

- `REFERENCES customers(id)` declares a foreign key. The database can then refuse an order for a customer that does not exist.
- `JOIN customers c ON c.id = o.customer_id` attaches to each order the customer row with the matching id. The short names `o`, `c` and `p` are aliases for the tables.
- A plain `JOIN` drops rows without a partner. A **`LEFT JOIN`** keeps every row of the left table: Lena appears with zero orders.
- `GROUP BY c.id` makes one output row per customer. `COUNT` and `SUM` then compute over each group. `COALESCE(x, 0)` replaces `NULL` (the sum of nothing) by 0.
- `AS` names an output column. `query_as` matches those names with the struct fields.
- `sqlx::raw_sql` runs several statements at once, without parameters. It is meant for set-up scripts.

:::warn The N+1 problem
A tempting way to print orders with customer names is: load all orders with one query, and then, in a loop, load the customer of each order with another query. For 1,000 orders that makes 1,001 queries, each with a trip to the database. One query with a `JOIN` gets the same data in one trip, often a hundred times faster. Whenever you run a query inside a loop, ask whether a `JOIN` or a `WHERE id IN (…)` could replace it.
:::

## Indexes

To find the rows with a certain author, a database must by default read the whole table. An **index** is a sorted look-up structure for a column, like the index at the back of a book. With it, the database jumps to the matching rows. `EXPLAIN QUERY PLAN` shows which way a query will be executed:

```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

/// Asks SQLite how it would run a query.
async fn plan(pool: &SqlitePool, sql: &'static str) -> Result<String, sqlx::Error> {
    let rows: Vec<(i64, i64, i64, String)> = sqlx::query_as(sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(|row| row.3).collect::<Vec<_>>().join(" / "))
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, year INTEGER NOT NULL)")
        .execute(&pool)
        .await?;

    println!("{}", plan(&pool, "EXPLAIN QUERY PLAN SELECT title FROM books WHERE author = 'Frank Herbert'").await?);

    sqlx::query("CREATE INDEX books_by_author ON books (author)").execute(&pool).await?;

    println!("{}", plan(&pool, "EXPLAIN QUERY PLAN SELECT title FROM books WHERE author = 'Frank Herbert'").await?);
    println!("{}", plan(&pool, "EXPLAIN QUERY PLAN SELECT title FROM books WHERE id = 7").await?);
    Ok(())
}
```
```output
SCAN books
SEARCH books USING INDEX books_by_author (author=?)
SEARCH books USING INTEGER PRIMARY KEY (rowid=?)
```

`SCAN` means reading every row. `SEARCH … USING INDEX` means a direct look-up. On a table with a million rows, that is the difference between seconds and a fraction of a millisecond. The primary key always has an index.

Indexes are not free: each one takes space and must be updated with every insert. Create them for the columns that your frequent queries filter, join or sort by, and for nothing else. A column that must not contain the same value twice gets a `UNIQUE` index, which enforces that rule as well.

## Migrations: the schema changes too

A program grows, and its tables change with it: a new column here, a new table there. The database on your machine, the test database and the production database must all receive the same changes, in the same order. A **migration** is a small SQL file that makes one such change. The files are numbered, kept in the repository with the code, and applied in order. The database remembers which ones it has run.

SQLx has a command-line tool for this. Install it once with `cargo install sqlx-cli`. It reads the database address from the environment variable `DATABASE_URL`:

```text
$ export DATABASE_URL=sqlite://dev.db
$ sqlx database create
$ sqlx migrate add create_books
Creating migrations/20261114153428_create_books.sql
```

Fill the new file with SQL:

```sql
CREATE TABLE books (
    id     INTEGER PRIMARY KEY,
    title  TEXT NOT NULL,
    author TEXT NOT NULL,
    year   INTEGER NOT NULL
);
```

A later change is a new file, here `sqlx migrate add add_rating` with the content `ALTER TABLE books ADD COLUMN rating REAL;`. Then apply everything that is pending:

```text
$ sqlx migrate run
Applied 20261114153428/migrate create books (670.559µs)
Applied 20261114160502/migrate add rating (915.844µs)

$ sqlx migrate info
20261114153428/installed create books
20261114160502/installed add rating
```

Running `sqlx migrate run` again does nothing, because both are recorded as installed. A program can also apply its migrations itself when it starts. The macro `sqlx::migrate!()` builds the files of the `migrations` folder into the executable:

```rust
sqlx::migrate!().run(&pool).await?;
```

The macro reads the folder while the program is compiled. Cargo compiles again only when a Rust file changes, so a new migration file alone would go unnoticed. A build script ([chapter 36](#ffi)) next to `Cargo.toml` tells Cargo to watch the folder. The command `sqlx migrate build-script` writes it for you:

```rust file=build.rs
fn main() {
    // Compile again when a migration is added or changed
    println!("cargo::rerun-if-changed=migrations");
}
```

:::warn Never edit a migration that has been applied
Once a migration has run anywhere but on your own machine, treat it as history. To change something, add a new migration. Editing an old file leaves the databases that already ran it in a different state from the new ones, and SQLx will refuse to continue when it notices that a recorded file has changed.
:::

## Queries checked at compile time

A query in a string has a weakness: a typing mistake in a column name is found only when that line runs. SQLx can do better. The macros **`query!`** and **`query_as!`** connect to your development database **while compiling**, ask it to check the SQL, and learn the types of the parameters and the result columns.

```rust file=src/main.rs
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;

#[derive(Debug)]
struct Book {
    id: i64,
    title: String,
    author: String,
    year: i64,
    rating: Option<f64>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let options = SqliteConnectOptions::from_str("sqlite://app.db")?.create_if_missing(true);
    let pool = SqlitePoolOptions::new().max_connections(5).connect_with(options).await?;

    // Bring the database up to date. Migrations that already ran are skipped.
    sqlx::migrate!().run(&pool).await?;

    let id = sqlx::query!("INSERT INTO books (title, author, year) VALUES (?, ?, ?)", "Dune", "Frank Herbert", 1965)
        .execute(&pool)
        .await?
        .last_insert_rowid();

    // Checked against the real database while compiling
    let book = sqlx::query_as!(Book, "SELECT id, title, author, year, rating FROM books WHERE id = ?", id).fetch_one(&pool).await?;
    println!("{:?}", book);

    let row = sqlx::query!("SELECT COUNT(*) AS count, MAX(year) AS newest FROM books").fetch_one(&pool).await?;
    println!("{} books, newest from {:?}", row.count, row.newest);
    Ok(())
}
```

Output of the first run:

```text
Book { id: 1, title: "Dune", author: "Frank Herbert", year: 1965, rating: None }
1 books, newest from Some(1965)
```

The parameters follow the SQL text as macro arguments. `query!` returns a value with one field per column, which is why `row.count` and `row.newest` exist, with the right types. Now a column name with a typing mistake, `titel`, stops the build:

```text nosoft
error: error returned from database: (code: 1) no such column: titel
  --> src/main.rs:27:16
   |
27 |     let book = sqlx::query_as!(Book, "SELECT id, titel, author, year, rating FROM books WHERE id = ?", id).fetch_one(&pool).await?;
   |                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

A field of the wrong type is caught as well. With `year: String` in the struct, the compiler reports that `String` cannot be made from the `i64` that the column delivers. A whole class of mistakes moves from "found by a user" to "found by the compiler". When a migration renames a column, the build shows every query that must change.

The price is that compiling needs a database. With `DATABASE_URL` set, the macros use it. For builds without one, such as in CI, run `cargo sqlx prepare` once. It saves the answers of the database into a folder `.sqlx`, which you commit:

```text
$ cargo sqlx prepare
query data written to .sqlx in the current directory; please check this into version control
```

| | `sqlx::query("…")` | `sqlx::query!("…")` |
|---|---|---|
| SQL checked | when the line runs | when the program is compiled |
| Parameters | `.bind(value)` | macro arguments |
| Result | `FromRow` struct, tuple or `Row` | a generated type, or your struct with `query_as!` |
| Needs a database to compile | no | yes, or the saved `.sqlx` data |

Then set `SQLX_OFFLINE=true` wherever no database is available — CI, a Docker build, a colleague's laptop before the first `docker compose up`. The macros read the committed `.sqlx` data instead of connecting, and the build works. Commit the folder and re-run `cargo sqlx prepare` whenever a query changes; a stale `.sqlx` gives a confusing error that mentions neither the folder nor the migration. This one variable removes the most common "works locally, fails in CI" complaint about SQLx.

The examples of this guide use the function form, so that they run anywhere. For a real project with a fixed schema, the macros are worth their set-up.

## A database behind a web server

Putting SQLx under an Axum server takes little: the pool is the state.

```rust ext run
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Serialize, FromRow)]
struct Book {
    id: i64,
    title: String,
    year: i64,
}

#[derive(Debug, Deserialize)]
struct NewBook {
    title: String,
    year: i64,
}

enum ApiError {
    NotFound,
    Database(sqlx::Error),
}

/// Lets `?` turn a database error into an `ApiError`.
impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        ApiError::Database(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not found"),
            ApiError::Database(error) => {
                // The details go to the log, and not to the client
                eprintln!("database error: {error}");
                (StatusCode::INTERNAL_SERVER_ERROR, "something went wrong")
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

async fn list_books(State(pool): State<SqlitePool>) -> Result<Json<Vec<Book>>, ApiError> {
    let books = sqlx::query_as("SELECT id, title, year FROM books ORDER BY id").fetch_all(&pool).await?;
    Ok(Json(books))
}

async fn create_book(State(pool): State<SqlitePool>, Json(new): Json<NewBook>) -> Result<(StatusCode, Json<Book>), ApiError> {
    let book = sqlx::query_as("INSERT INTO books (title, year) VALUES (?, ?) RETURNING id, title, year")
        .bind(&new.title)
        .bind(new.year)
        .fetch_one(&pool)
        .await?;
    Ok((StatusCode::CREATED, Json(book)))
}

async fn get_book(State(pool): State<SqlitePool>, Path(id): Path<i64>) -> Result<Json<Book>, ApiError> {
    let book = sqlx::query_as("SELECT id, title, year FROM books WHERE id = ?").bind(id).fetch_optional(&pool).await?;
    book.map(Json).ok_or(ApiError::NotFound)
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, year INTEGER NOT NULL)").execute(&pool).await?;

    let app = Router::new().route("/books", get(list_books).post(create_book)).route("/books/{id}", get(get_book)).with_state(pool);

    send(&app, "POST", "/books", r#"{"title": "Dune", "year": 1965}"#).await;
    send(&app, "POST", "/books", r#"{"title": "Neuromancer", "year": 1984}"#).await;
    send(&app, "GET", "/books", "").await;
    send(&app, "GET", "/books/2", "").await;
    send(&app, "GET", "/books/9", "").await;
    Ok(())
}
#
# /// Hands one request straight to the router, as a client would send it, and prints the response.
# async fn send(app: &Router, method: &str, path: &str, body: &str) {
#     use tower::ServiceExt;
#
#     let request = axum::http::Request::builder()
#         .method(method)
#         .uri(path)
#         .header("content-type", "application/json")
#         .body(axum::body::Body::from(body.to_string()))
#         .unwrap();
#
#     let response = app.clone().oneshot(request).await.unwrap();
#     let status = response.status();
#     let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
#     println!("{method} {path} -> {status}  {}", String::from_utf8_lossy(&bytes));
# }
```
```output
POST /books -> 201 Created  {"id":1,"title":"Dune","year":1965}
POST /books -> 201 Created  {"id":2,"title":"Neuromancer","year":1984}
GET /books -> 200 OK  [{"id":1,"title":"Dune","year":1965},{"id":2,"title":"Neuromancer","year":1984}]
GET /books/2 -> 200 OK  {"id":2,"title":"Neuromancer","year":1984}
GET /books/9 -> 404 Not Found  {"error":"not found"}
```

(The helper `send` is the one from the [previous chapter](#web).)

- The same `Book` struct derives `FromRow` for the database and `Serialize` for JSON. A row becomes a struct, and the struct becomes the response.
- `INSERT … RETURNING id, title, year` inserts a row and returns it in one statement, with the id that the database chose.
- `impl From<sqlx::Error> for ApiError` lets `?` convert database errors. They become a 500 response with a neutral message, and the details are logged.
- Compared with the notes API of the last chapter, the `Mutex` is gone. The database handles concurrent access, and the data survives a restart.

### Testing with a database

Because an in-memory SQLite database is created in microseconds, every test can have its own, fresh and empty, and the tests can run in parallel without disturbing each other. SQLx has an attribute that does the set-up, including the migrations:

```rust file=tests/db.rs
use sqlx::SqlitePool;

// Each test gets its own fresh database, with all migrations applied
#[sqlx::test]
async fn a_new_database_has_no_books(pool: SqlitePool) -> sqlx::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM books").fetch_one(&pool).await?;
    assert_eq!(count, 0);
    Ok(())
}

#[sqlx::test]
async fn inserting_a_book(pool: SqlitePool) -> sqlx::Result<()> {
    sqlx::query("INSERT INTO books (title, author, year) VALUES (?, ?, ?)").bind("Dune").bind("Frank Herbert").bind(1965).execute(&pool).await?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM books").fetch_one(&pool).await?;
    assert_eq!(count, 1);
    Ok(())
}
```

## Other ways: Diesel and SeaORM

SQLx has you write SQL yourself. An **ORM** ("object-relational mapper") takes another route: you describe the tables in Rust, and build queries by calling methods. The library generates the SQL.

**Diesel** is the oldest and strictest. A `table!` description tells the compiler about the columns and their types. A query that compares a number column with a text, or selects a column that does not exist, does not compile. No database is needed for that check. Diesel is synchronous. (The crate `diesel-async` adds async support.)

```rust file=src/main.rs
use diesel::prelude::*;

// The description of the table. In a real project, Diesel's command-line tool
// writes this into `src/schema.rs` from your migrations.
diesel::table! {
    books (id) {
        id -> Integer,
        title -> Text,
        author -> Text,
        year -> Integer,
    }
}

#[derive(Debug, Queryable, Selectable)]
#[diesel(table_name = books)]
struct Book {
    id: i32,
    title: String,
    author: String,
    year: i32,
}

#[derive(Insertable)]
#[diesel(table_name = books)]
struct NewBook<'a> {
    title: &'a str,
    author: &'a str,
    year: i32,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut connection = SqliteConnection::establish(":memory:")?;
    diesel::sql_query("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, year INTEGER NOT NULL)")
        .execute(&mut connection)?;

    let new_books = [
        NewBook { title: "Dune", author: "Frank Herbert", year: 1965 },
        NewBook { title: "Neuromancer", author: "William Gibson", year: 1984 },
        NewBook { title: "Snow Crash", author: "Neal Stephenson", year: 1992 },
    ];
    diesel::insert_into(books::table).values(&new_books).execute(&mut connection)?;

    // The query is built from Rust methods, and checked against the table description
    let before_1990: Vec<Book> =
        books::table.filter(books::year.lt(1990)).order(books::year.desc()).select(Book::as_select()).load(&mut connection)?;
    for book in &before_1990 {
        println!("{} {} by {} ({})", book.id, book.title, book.author, book.year);
    }

    let changed = diesel::update(books::table.filter(books::title.eq("Dune"))).set(books::year.eq(1966)).execute(&mut connection)?;
    let deleted = diesel::delete(books::table.filter(books::year.gt(1990))).execute(&mut connection)?;
    let left: i64 = books::table.count().get_result(&mut connection)?;
    println!("changed {changed}, deleted {deleted}, left {left}");
    Ok(())
}
```

```text
2 Neuromancer by William Gibson (1984)
1 Dune by Frank Herbert (1965)
changed 1, deleted 1, left 2
```

**SeaORM** is async and built on top of SQLx. It follows the style of ORMs in other languages: a struct called `Model` is a row, and an "active model" holds changes to be saved. Its tools can generate these structs from an existing database.

```rust file=src/main.rs
use sea_orm::entity::prelude::*;
use sea_orm::{ActiveValue::Set, ConnectionTrait, Database, QueryOrder};

mod book {
    use sea_orm::entity::prelude::*;

    // The entity: one struct describes the table
    #[sea_orm::model]
    #[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
    #[sea_orm(table_name = "books")]
    pub struct Model {
        #[sea_orm(primary_key)]
        pub id: i32,
        pub title: String,
        pub author: String,
        pub year: i32,
    }

    impl ActiveModelBehavior for ActiveModel {}
}

#[tokio::main]
async fn main() -> Result<(), DbErr> {
    let db = Database::connect("sqlite::memory:").await?;
    db.execute_unprepared("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, year INTEGER NOT NULL)")
        .await?;

    // Insert: an "active model" holds the values to write
    for (title, author, year) in [("Dune", "Frank Herbert", 1965), ("Neuromancer", "William Gibson", 1984), ("Snow Crash", "Neal Stephenson", 1992)] {
        let new_book = book::ActiveModel { title: Set(title.to_string()), author: Set(author.to_string()), year: Set(year), ..Default::default() };
        new_book.insert(&db).await?;
    }

    // Query with methods, no SQL text
    let before_1990: Vec<book::Model> =
        book::Entity::find().filter(book::Column::Year.lt(1990)).order_by_desc(book::Column::Year).all(&db).await?;
    for found in &before_1990 {
        println!("{} {} by {} ({})", found.id, found.title, found.author, found.year);
    }

    // Load one row, change it, save it
    let dune = book::Entity::find_by_id(1).one(&db).await?.expect("book 1 exists");
    let mut dune: book::ActiveModel = dune.into();
    dune.year = Set(1966);
    let dune = dune.update(&db).await?;
    println!("{} is now from {}", dune.title, dune.year);

    let deleted = book::Entity::delete_many().filter(book::Column::Year.gt(1990)).exec(&db).await?;
    let left = book::Entity::find().count(&db).await?;
    println!("deleted {}, left {left}", deleted.rows_affected);
    Ok(())
}
```

```text
2 Neuromancer by William Gibson (1984)
1 Dune by Frank Herbert (1965)
Dune is now from 1966
deleted 1, left 2
```

For small synchronous programs that only need SQLite, **rusqlite** is the direct and light choice:

```rust file=src/main.rs
use rusqlite::{params, Connection};

fn main() -> rusqlite::Result<()> {
    let connection = Connection::open_in_memory()?;
    connection.execute("CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, year INTEGER NOT NULL)", ())?;
    connection.execute("INSERT INTO books (title, year) VALUES (?1, ?2)", params!["Dune", 1965])?;
    connection.execute("INSERT INTO books (title, year) VALUES (?1, ?2)", params!["Neuromancer", 1984])?;

    let mut statement = connection.prepare("SELECT title, year FROM books WHERE year > ?1 ORDER BY year")?;
    let books = statement.query_map([1900], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))?;
    for book in books {
        let (title, year) = book?;
        println!("{title} ({year})");
    }
    Ok(())
}
```

| | SQLx | Diesel | SeaORM | rusqlite |
|---|---|---|---|---|
| You write | SQL | Rust query methods | Rust query methods | SQL |
| Checked at compile time | with the `query!` macros, against a database | always, against the `table!` description | types of the model | no |
| Async | yes | no (add-on crate) | yes | no |
| Databases | SQLite, PostgreSQL, MySQL | SQLite, PostgreSQL, MySQL | SQLite, PostgreSQL, MySQL | SQLite |
| Good for | services where you want to see and control the SQL | large schemas with many query variations | fast development of typical create-read-update-delete applications | tools and apps with a local database |

Which one? If you know SQL or want to learn it, start with SQLx: there is nothing between you and the database, and the knowledge carries over to every other language. If the application is mostly forms over tables and you prefer methods to SQL text, take SeaORM. If you want the strongest compile-time guarantees and can work synchronously, take Diesel. All three are mature and widely used.

### PostgreSQL in place of SQLite

| | SQLite | PostgreSQL |
|---|---|---|
| Cargo feature | `sqlite` | `postgres` |
| Pool type | `SqlitePool` | `PgPool` |
| Address | `sqlite://app.db` | `postgres://user:password@host/database` |
| Placeholders | `?` | `$1`, `$2`, … |
| Auto-numbered key | `INTEGER PRIMARY KEY` | `BIGSERIAL PRIMARY KEY`, or `GENERATED ALWAYS AS IDENTITY` |
| Types | few and flexible | many and strict: `BOOLEAN`, `TIMESTAMPTZ`, `UUID`, `JSONB`, arrays |
| Concurrent writers | one at a time | many |

The Rust code stays the same apart from these points. Many projects use SQLite for tests and small installations, and PostgreSQL when several servers must share one database.

Three PostgreSQL features are worth knowing by name, because they solve problems that otherwise turn into polling loops or guesswork:

- **`LISTEN` / `NOTIFY`** — a table's changes can wake other processes. `NOTIFY events_changed` inside the same transaction as the write, and every connection that ran `LISTEN events_changed` receives it after the commit. It is the cheapest way to push a change to a second service without adding a broker; the Rust side holds a connection and awaits the notifications. Ordering is not guaranteed and nothing is persisted, so use it for "something changed, go and look", not as a queue.
- **`EXPLAIN ANALYZE`** — the answer to "why is this query slow". `EXPLAIN ANALYZE SELECT …` runs the query and prints the plan with real times per step. A sequential scan on a table with a million rows, where you expected an index, is the single most common finding.
- **`COPY`** — bulk loading. Inserting a million rows one statement at a time takes minutes; `COPY … FROM STDIN` takes seconds, and `sqlx` can copy from a stream.

### Other kinds of storage

A relational database is the right default: it gives you transactions, constraints and a query language that answers questions you did not plan for. These are the tools you reach for when one of those is in the way.

| Need | Crates | Choose it when |
|---|---|---|
| A cache, or data shared between servers | `redis`, `fred` | Reads outnumber writes, the data is rebuildable, and you need it shared between processes |
| Documents | `mongodb` | The shape varies between records, and a record is read as a whole |
| A key-value store inside the program, without SQL | `redb`, `fjall`, `sled` | A desktop or CLI program needs durable keyed data without a server |
| Full-text search | `tantivy` | Real ranked search over many documents; SQLite's FTS5 is the built-in alternative below a few hundred thousand rows |
| Files in cloud storage (S3 and similar) | `object_store`, `aws-sdk-s3` | Blobs belong in an object store, never in the database |
| A low-level PostgreSQL client | `tokio-postgres` | You need protocol features SQLx does not expose |
| Pooling **any** driver | `deadpool`, `bb8` | You use Diesel, `tokio-postgres` or a client with no pool of its own |

#### Redis: the shared memory between your servers

Redis is a server that holds key–value data in memory. It is fast because it never touches the disk on the read path, and it is honest about the trade: **assume the data can disappear**, and never let Redis be the only copy of anything you cannot rebuild.

```sh
docker run --rm -p 6379:6379 redis:latest
```

The five operations that cover most uses, run from `redis-cli`:

```text
SET session:8f3c1d0e "user:42" EX 3600     # a value with a one-hour expiry
GET session:8f3c1d0e
INCR rate:203.0.113.7:2026-11-14T09         # a counter with a time bucket in the key
EXPIRE rate:203.0.113.7:2026-11-14T09 120
ZADD leaderboard 1200 "ada"                 # a sorted set: a ranking for free
ZREVRANGE leaderboard 0 9 WITHSCORES        # the top ten
```

Three habits make Redis pleasant to live with:

- **Namespace every key** — `session:`, `cache:`, `rate:` — because a shared Redis is shared, and a key called `user42` will collide with someone else's.
- **Always set an expiry** on anything that is a cache. A cache without a TTL is a database with none of the guarantees.
- **Use the patterns the types give you.** A sorted set is a leaderboard, `INCR` is a rate-limit counter, and `SET … EX` is a session with a timeout already in it.

In Rust, `redis` is the crate. Use `redis::aio::ConnectionManager` rather than a bare client in a web service: it reconnects by itself after the server restarts, and it is cheap to clone into every handler. `fred` is the alternative with more of Redis 6 and 7 built in. The operations are commands, not SQL: `cmd("SET").arg(key).arg(value).arg("EX").arg(3600).query_async(&mut conn).await?`.

#### MongoDB: documents instead of rows

```json
{
  "_id": { "$oid": "65f1c0de8f3c1d0e" },
  "handle": "ada",
  "display_name": "Ada Lovelace",
  "links": [
    { "label": "blog", "url": "https://example.org" },
    { "label": "code", "url": "https://example.org/code" }
  ],
  "created_at": { "$date": "2026-11-14T09:12:03Z" }
}
```

A document is one self-contained record, nested as deeply as the data is. Reading it is one lookup with no `JOIN`; `bson::doc!` writes queries that look like the documents themselves; `mongodb` plus `serde` maps a document to a struct. Choose documents when each record has its own shape and you always read it whole. Choose rows when several records must agree with each other — an order and its stock level — because that is what transactions and foreign keys are for, and MongoDB's transactions are newer and more constrained than PostgreSQL's.

#### Embedded key-value stores

`redb`, `fjall` and `sled` are storage engines that live **inside your program**: no server, no port, one file. Choose them for a desktop application, a CLI tool that keeps state, or a cache that must survive a restart. `redb` is the simplest and most stable of the three for new work; `sled` is the best known but has been at beta for years; `fjall` is LSM-based and shines on write-heavy local workloads. All three store bytes, so pair them with `serde` and you have a durable typed store in about twenty lines. None of them give you SQL, indexes on arbitrary fields, or concurrent access from other processes.

#### Object storage and full-text search

Files — images, PDFs, exports, backups — belong in object storage, not in a database column: `object_store` gives one API over S3, GCS, Azure and the local filesystem, and `aws-sdk-s3` is the S3-specific official SDK. Both stream, so a 2 GB upload never has to fit in memory.

For search, `tantivy` is a search engine library: you define a schema, index documents, and query with ranked results, highlights and facets, all inside your process. Below a few hundred thousand rows, SQLite's **FTS5** extension gives you keyword search with ranking in the database you already have, through a virtual table and `MATCH` — often the right first answer.

:::compare Databases in other languages
- **Python** has SQLAlchemy and Django's ORM, and **JavaScript** has Prisma and Drizzle. Mistakes in queries and in the mapping of rows show up when the program runs.
- **Java** uses JDBC and the ORM Hibernate. **C#** has Entity Framework, where queries are written in the language itself (LINQ) and checked by the compiler, which is close to Diesel's approach.
- **Go** has `database/sql` in its standard library, with rows scanned into variables by hand. The tool `sqlc` generates checked code from SQL files, an idea related to SQLx's macros.
- In most languages, building SQL from strings is possible and the injection risk is left to discipline. SQLx makes the unsafe way a compile error.
:::

:::recap
- A relational database stores rows in tables with typed columns. SQL defines, reads and changes them.
- SQLx runs SQL from async Rust. A pool hands out connections. `query`, `query_as` and `query_scalar` run statements, and `FromRow` maps rows to structs.
- Values always go through `bind`. Building SQL from input opens the door to SQL injection, and SQLx refuses non-literal query strings.
- A transaction makes several statements all-or-nothing. Dropping it without `commit` rolls back.
- `JOIN` combines tables, `GROUP BY` summarises, and indexes make look-ups fast.
- Migrations are numbered SQL files that change the schema step by step.
- `query!` and `query_as!` check SQL against a real database at compile time.
- Diesel and SeaORM are ORMs that build the SQL from Rust code. rusqlite is a light, synchronous SQLite library.
- Redis is shared memory between servers: cache, sessions, counters, rankings. Namespace the keys, and give every cache entry an expiry.
- MongoDB stores documents instead of rows, and `redb`/`fjall`/`sled` store key–value data inside your own program with no server at all.
- `object_store` and `s3`-style services hold blobs; `tantivy` (or SQLite's FTS5) holds a search index.
- `SQLX_OFFLINE=true` plus a committed `.sqlx` folder is what makes compile-time-checked queries work in CI.
:::

:::quiz Check your understanding
? Why is `format!("SELECT * FROM users WHERE name = '{name}'")` dangerous when `name` comes from a user?
- It is slower than a bound parameter
+ The input becomes part of the SQL text, so a crafted input can change the meaning of the query
- `format!` cannot handle quotes
- The query returns too many columns
= This is SQL injection. With `.bind(name)`, the value is sent apart from the SQL text and can never be read as SQL.

? A function starts a transaction, runs one `UPDATE`, and then returns early with `?` because the next statement failed. What happens to the `UPDATE`?
- It stays in the database
+ It is undone: the transaction is dropped without `commit`, which rolls it back
- The database is left locked
- The program panics
= Dropping a transaction rolls it back. Only an explicit `commit()` makes the changes permanent.

? Which method fits "find the user with this id, who may not exist"?
- `fetch_one`
- `fetch_all`
+ `fetch_optional`
- `execute`
= `fetch_optional` returns `Option<T>`. `fetch_one` would return an error for a missing row, which makes an expected case look like a failure.

? What does an index on a column do?
- It makes the column unique
- It sorts the table on disk
+ It lets the database find rows by that column without reading the whole table, at some cost for every write
- It compresses the column
= An index is a sorted look-up structure. It speeds up reads that filter or sort by the column, and must be kept up to date on writes.

? What is special about `sqlx::query!` compared with `sqlx::query`?
- It runs the query faster
- It needs no database at all
+ It checks the SQL and the types against a real database while the program is compiled
- It writes the SQL for you
= The macro asks the development database (or the saved `.sqlx` data) to describe the query. Wrong column names and types become compile errors.
:::

:::exercise guided A table of tasks
Create an in-memory database with a table `tasks` (`id`, `title`, and a flag `done` that is false by default). Insert three tasks, mark one as done, and print the open ones. Then print how many of all tasks are finished, with one query.
::hint
SQLite accepts `done BOOLEAN NOT NULL DEFAULT FALSE`, and SQLx maps it to a Rust `bool`. Derive `FromRow` for a `Task` struct. For the last part, `SELECT COUNT(*), COALESCE(SUM(done), 0) FROM tasks` returns two numbers, which `query_as` can put into a tuple `(i64, i64)`.
::solution
```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::FromRow;

#[derive(Debug, FromRow)]
struct Task {
    id: i64,
    title: String,
    done: bool,
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;

    sqlx::query("CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, done BOOLEAN NOT NULL DEFAULT FALSE)")
        .execute(&pool)
        .await?;

    for title in ["buy milk", "call Sara", "learn SQL"] {
        sqlx::query("INSERT INTO tasks (title) VALUES (?)").bind(title).execute(&pool).await?;
    }
    sqlx::query("UPDATE tasks SET done = TRUE WHERE title = ?").bind("buy milk").execute(&pool).await?;

    let open: Vec<Task> = sqlx::query_as("SELECT id, title, done FROM tasks WHERE done = FALSE ORDER BY id").fetch_all(&pool).await?;
    for task in &open {
        println!("{} {} (done: {})", task.id, task.title, task.done);
    }

    let (total, finished): (i64, i64) = sqlx::query_as("SELECT COUNT(*), COALESCE(SUM(done), 0) FROM tasks").fetch_one(&pool).await?;
    println!("{finished} of {total} finished");
    Ok(())
}
```
```output
2 call Sara (done: false)
3 learn SQL (done: false)
1 of 3 finished
```

The `INSERT` names only the title. The database fills in the id and the default for `done`. Tuples implement `FromRow` too, which is handy for small results that do not deserve a struct. Summing a boolean column counts the true values, because SQLite stores true as 1.

The counting happens in the database, in one query. Loading all rows and counting them in Rust would give the same number, and would move the whole table over the connection to do it.
:::

:::exercise practice Count words with an upsert
Write `async fn count_word(pool, word) -> Result<i64, sqlx::Error>` that records one more occurrence of a word and returns its new count. The table `words` has the word as its primary key and a count. If the word is new, a row is inserted with count 1. If it exists, the count is increased. Do it in a single statement, ignoring upper and lower case.
::hint
SQL has a form for "insert, or update if the key exists", often called an **upsert**: `INSERT INTO words (word, count) VALUES (?, 1) ON CONFLICT (word) DO UPDATE SET count = count + 1`. Add `RETURNING count` to get the new value back, and read it with `query_scalar` and `fetch_one`.
::solution
```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

/// Adds one to the count of `word`, creating the row if needed.
async fn count_word(pool: &SqlitePool, word: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "INSERT INTO words (word, count) VALUES (?, 1)
         ON CONFLICT (word) DO UPDATE SET count = count + 1
         RETURNING count",
    )
    .bind(word.to_lowercase())
    .fetch_one(pool)
    .await
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE words (word TEXT PRIMARY KEY, count INTEGER NOT NULL)").execute(&pool).await?;

    for word in "the cat and The dog and THE bird".split_whitespace() {
        let count = count_word(&pool, word).await?;
        println!("{word}: {count}");
    }

    let top: Vec<(String, i64)> = sqlx::query_as("SELECT word, count FROM words ORDER BY count DESC, word LIMIT 2").fetch_all(&pool).await?;
    println!("{:?}", top);
    Ok(())
}
```
```output
the: 1
cat: 1
and: 1
The: 2
dog: 1
and: 2
THE: 3
bird: 1
[("the", 3), ("and", 2)]
```

The obvious alternative is two steps: `SELECT` the row, then `INSERT` or `UPDATE` depending on the answer. That has a gap. Two clients can both find no row and both insert, and one of them fails. The upsert is a single statement, and the database carries it out as one indivisible step. Whenever you catch yourself writing "check, then act" against a database, look for a single statement that does both, or use a transaction.

`ORDER BY count DESC, word` sorts by a second column when counts are equal, so the result is the same on every run.
:::

:::exercise practice Orders that cannot oversell
A shop has a table `products` (name, stock) and a table `orders`. Write `place_order(pool, customer, product, quantity)` that records the order and reduces the stock, as one unit. It must fail without changing anything if the product is unknown or the stock is too small. Return the new order's id, or an error that says which of the things went wrong.
::hint
Start a transaction with `pool.begin()`. Read the stock with `fetch_optional` on the transaction (`&mut *transaction`). Return early with your own error for the two refusals: dropping the transaction undoes everything. Define the error enum with `thiserror`, with a variant `Database(#[from] sqlx::Error)` so that `?` works on SQLx results.
::solution
```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

#[derive(Debug, thiserror::Error)]
enum OrderError {
    #[error("there is no such product")]
    UnknownProduct,
    #[error("{wanted} were ordered, but only {available} are in stock")]
    NotEnoughStock { wanted: i64, available: i64 },
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// Records an order and takes the items out of the stock, as one unit.
async fn place_order(pool: &SqlitePool, customer: &str, product: &str, quantity: i64) -> Result<i64, OrderError> {
    let mut transaction = pool.begin().await?;

    let stock: Option<i64> =
        sqlx::query_scalar("SELECT stock FROM products WHERE name = ?").bind(product).fetch_optional(&mut *transaction).await?;
    let available = stock.ok_or(OrderError::UnknownProduct)?;
    if available < quantity {
        return Err(OrderError::NotEnoughStock { wanted: quantity, available });
    }

    sqlx::query("UPDATE products SET stock = stock - ? WHERE name = ?").bind(quantity).bind(product).execute(&mut *transaction).await?;
    let order_id: i64 = sqlx::query_scalar("INSERT INTO orders (customer, product, quantity) VALUES (?, ?, ?) RETURNING id")
        .bind(customer)
        .bind(product)
        .bind(quantity)
        .fetch_one(&mut *transaction)
        .await?;

    transaction.commit().await?;
    Ok(order_id)
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
    sqlx::raw_sql(
        "CREATE TABLE products (name TEXT PRIMARY KEY, stock INTEGER NOT NULL CHECK (stock >= 0));
         CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, product TEXT NOT NULL, quantity INTEGER NOT NULL);
         INSERT INTO products VALUES ('tea', 10), ('honey', 2);",
    )
    .execute(&pool)
    .await?;

    for (customer, product, quantity) in [("sara", "tea", 4), ("tomas", "honey", 5), ("lena", "sugar", 1), ("lena", "tea", 6)] {
        match place_order(&pool, customer, product, quantity).await {
            Ok(id) => println!("order {id}: {quantity} x {product} for {customer}"),
            Err(error) => println!("refused for {customer}: {error}"),
        }
    }

    let stock: Vec<(String, i64)> = sqlx::query_as("SELECT name, stock FROM products ORDER BY name").fetch_all(&pool).await?;
    let orders: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders").fetch_one(&pool).await?;
    println!("{:?}, {orders} orders", stock);
    Ok(())
}
```
```output
order 1: 4 x tea for sara
refused for tomas: 5 were ordered, but only 2 are in stock
refused for lena: there is no such product
order 2: 6 x tea for lena
[("honey", 2), ("tea", 0)], 2 orders
```

The read of the stock, the update and the insert run inside one transaction. The two refusals return before any change. And if the insert failed after the update, the `?` would leave the function, the transaction would be dropped, and the stock would be restored.

The error type separates what the *caller did wrong* (unknown product, too many) from what *went wrong inside* (the database). A web handler would turn the first two into 4xx responses and the last into a 500.

The `CHECK (stock >= 0)` in the table is a second line of defence. Even if a bug in some other function forgot the check, the database would refuse a negative stock.
:::

:::exercise challenge A store type for tasks
Hide the SQL of a to-do application behind a type. Write `struct TaskStore` that owns a pool, with the methods `in_memory()` (creates the table), `add(title, priority)`, `list(&Filter)`, `complete(id) -> bool` and `stats()`. `Filter` has three optional conditions: `done`, `min_priority` and `search` (a text that the title must contain). `stats` returns the number of open and finished tasks, computed by the database. Titles are trimmed, and an empty title must be refused.
::hint
Build the `list` query with `QueryBuilder`, adding ` AND …` with `push` and `push_bind` for each condition that is `Some`. For the text search use `title LIKE ?` with the value `format!("%{search}%")`: in `LIKE`, `%` stands for any text. `stats` can use `SELECT done, COUNT(*) FROM tasks GROUP BY done`, read as `Vec<(bool, i64)>`. A `CHECK (length(title) > 0)` constraint refuses empty titles at the database.
::solution
```rust ext run
use sqlx::sqlite::SqlitePoolOptions;
use sqlx::{FromRow, QueryBuilder, Sqlite, SqlitePool};

#[derive(Debug, Clone, PartialEq, FromRow)]
struct Task {
    id: i64,
    title: String,
    done: bool,
    priority: i64,
}

#[derive(Debug, Default)]
struct Filter {
    done: Option<bool>,
    min_priority: Option<i64>,
    search: Option<String>,
}

#[derive(Debug, PartialEq)]
struct Stats {
    open: i64,
    done: i64,
}

/// All database access for tasks, in one place.
#[derive(Clone)]
struct TaskStore {
    pool: SqlitePool,
}

impl TaskStore {
    /// Opens a store on a new, empty in-memory database.
    async fn in_memory() -> Result<TaskStore, sqlx::Error> {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await?;
        sqlx::query(
            "CREATE TABLE tasks (
                id       INTEGER PRIMARY KEY,
                title    TEXT NOT NULL CHECK (length(title) > 0),
                done     BOOLEAN NOT NULL DEFAULT FALSE,
                priority INTEGER NOT NULL DEFAULT 1
            )",
        )
        .execute(&pool)
        .await?;
        Ok(TaskStore { pool })
    }

    async fn add(&self, title: &str, priority: i64) -> Result<Task, sqlx::Error> {
        sqlx::query_as("INSERT INTO tasks (title, priority) VALUES (?, ?) RETURNING id, title, done, priority")
            .bind(title.trim())
            .bind(priority)
            .fetch_one(&self.pool)
            .await
    }

    async fn list(&self, filter: &Filter) -> Result<Vec<Task>, sqlx::Error> {
        let mut query: QueryBuilder<Sqlite> = QueryBuilder::new("SELECT id, title, done, priority FROM tasks WHERE 1 = 1");
        if let Some(done) = filter.done {
            query.push(" AND done = ").push_bind(done);
        }
        if let Some(priority) = filter.min_priority {
            query.push(" AND priority >= ").push_bind(priority);
        }
        if let Some(search) = &filter.search {
            query.push(" AND title LIKE ").push_bind(format!("%{search}%"));
        }
        query.push(" ORDER BY priority DESC, id");
        query.build_query_as().fetch_all(&self.pool).await
    }

    /// Marks a task as done. Returns false if there is no such task.
    async fn complete(&self, id: i64) -> Result<bool, sqlx::Error> {
        let result = sqlx::query("UPDATE tasks SET done = TRUE WHERE id = ?").bind(id).execute(&self.pool).await?;
        Ok(result.rows_affected() == 1)
    }

    async fn stats(&self) -> Result<Stats, sqlx::Error> {
        let rows: Vec<(bool, i64)> = sqlx::query_as("SELECT done, COUNT(*) FROM tasks GROUP BY done").fetch_all(&self.pool).await?;
        let mut stats = Stats { open: 0, done: 0 };
        for (done, count) in rows {
            if done { stats.done = count } else { stats.open = count }
        }
        Ok(stats)
    }
}

#[tokio::main]
async fn main() -> Result<(), sqlx::Error> {
    let store = TaskStore::in_memory().await?;

    store.add("buy milk", 1).await?;
    let report = store.add("  write the report ", 3).await?;
    store.add("book the flight", 2).await?;
    store.add("read a book", 1).await?;
    println!("{:?}", report);

    println!("{}", store.complete(1).await?);
    println!("{}", store.complete(99).await?);

    let titles = |tasks: Vec<Task>| tasks.into_iter().map(|task| task.title).collect::<Vec<_>>();
    println!("{:?}", titles(store.list(&Filter::default()).await?));
    println!("{:?}", titles(store.list(&Filter { done: Some(false), min_priority: Some(2), ..Filter::default() }).await?));
    println!("{:?}", titles(store.list(&Filter { search: Some(String::from("book")), ..Filter::default() }).await?));

    println!("{:?}", store.stats().await?);
    println!("{}", store.add("   ", 1).await.is_err());
    Ok(())
}
```
```output
Task { id: 2, title: "write the report", done: false, priority: 3 }
true
false
["write the report", "book the flight", "buy milk", "read a book"]
["write the report", "book the flight"]
["book the flight", "read a book"]
Stats { open: 3, done: 1 }
true
```

A type like `TaskStore` is often called a **repository**. The rest of the program calls `store.add(…)` and `store.list(…)` and never sees SQL, a pool or a row. Three gains follow:

- **One place to change.** If a column is renamed or the database is swapped, only this type changes.
- **Easy tests.** `TaskStore::in_memory()` gives each test its own database in an instant.
- **A typed border.** Rows become `Task` values here, and nothing untyped leaves.

`complete` reports through `rows_affected` whether a row was changed, which saves a separate "does it exist?" query. The search text goes through `push_bind` like every other value, so a `'` in it is harmless. And the empty title is refused by the `CHECK` constraint after trimming: the rule lives in the schema, where no code path can bypass it.

In the next chapter, a store like this sits behind a web API.
:::
