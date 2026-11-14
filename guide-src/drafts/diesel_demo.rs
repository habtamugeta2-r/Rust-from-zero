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
