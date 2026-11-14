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
