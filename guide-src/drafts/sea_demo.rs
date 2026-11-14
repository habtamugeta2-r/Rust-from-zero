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
