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
