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
