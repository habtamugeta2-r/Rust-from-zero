@id project-report
@part p3
@kind project
@title Project: a sales report from raw data
@short Project: sales report
@level intermediate
@time 120
@learn Turn raw text into typed data, and report bad rows without stopping | Summarise data with iterator pipelines | Write one generic function that groups by any key, using a closure | Handle money correctly | Print aligned tables

Programs that read data, clean it, summarise it and print a report are among the most common programs in the world. In this project you write one. It reads sales records in **CSV** form ("comma-separated values": one record per line, with commas between the fields) and prints this:

```text
SALES REPORT
12 sales, 82 items, total revenue 710.68

Revenue by category
--------------------------------------------
Electronics             350.20        49.3 %
Food                    198.50        27.9 %
Office                  161.98        22.8 %

Top 3 products
--------------------------------------------
Headphones              267.00        37.6 %
Notebook                112.00        15.8 %
Coffee beans             87.50        12.3 %

2 rows were skipped:
  line 11: 'one' is not a whole number
  line 14: expected 5 fields, found 4
```

The project is a workout for closures and iterators, and it brings back structs, error handling, collections, lifetimes and tests.

:::plain Data in, report out
The report project is the classic shape of a data pipeline: **read** rows from a file, **parse** them into a typed record (`Result` per line, so bad rows become a count rather than a panic), **aggregate** with iterators into the numbers you need, and **format** the output with the width and alignment a human can scan. The `struct` and `enum` types do the validation, so the rest of the program never re-checks anything, and the formatting step is pure so it can be tested against a fixed string.
:::

## Step 0: plan the pipeline

Data flows through the program in one direction:

```text
raw text  →  lines  →  Sale values  →  summaries  →  printed report
                    ↘  problems (bad lines, with line numbers)
```

Each arrow is one small function. Three decisions before writing code:

1. **Bad rows must not stop the program.** Real data is never clean. One broken line among ten thousand should be reported, and the rest should still be processed.
2. **Money is stored as whole cents**, not as a floating-point number. You saw in [chapter 9](#types) that `0.1 + 0.2` is not exactly `0.3` in floating point. Small errors like that add up over thousands of sales, and in money they are unacceptable. An integer number of cents is always exact.
3. **Functions that calculate do not print.** Then they can be tested.

Create the project with `cargo new report`. Everything goes into `src/main.rs` this time, so that the finished program can also run in the online playground.

## Step 1: the data

The sample data lives in the program as a constant. Two of its rows are broken on purpose.

```rust check
const SAMPLE: &str = "\
date,product,category,quantity,unit_price
2026-01-05,Coffee beans,Food,4,12.50
2026-01-05,Notebook,Office,10,3.20
2026-03-01,Desk lamp,Office,one,24.99
2026-03-15,Coffee beans,Food,5
";

#[derive(Debug, Clone, PartialEq)]
struct Sale {
    date: String,
    product: String,
    category: String,
    quantity: u32,
    unit_price: u64, // in cents
}

impl Sale {
    fn revenue(&self) -> u64 {
        self.quantity as u64 * self.unit_price
    }

    fn month(&self) -> &str {
        &self.date[..7]
    }
}
# fn main() {}
```

(The complete data, with 14 rows, is in the full program at the end of the chapter.)

- The backslash right after the opening quote makes the string start on the next line without a blank first line.
- The first line of the data is a **header**: it names the columns and is not a record.
- `revenue` is the amount of money a sale brought in: quantity times price.
- `month` returns the first seven characters of the date, such as `2026-01`. It returns a slice of the sale's own `date`, with no copy. The elision rules from [chapter 26](#lifetimes) tie the result to `&self`.

## Step 2: read a price

`"12.50"` must become `1250` cents. Write the tests first. They fix what should happen for the awkward inputs:

```rust
#[test]
fn prices_become_cents() {
    assert_eq!(parse_price("12.50"), Some(1250));
    assert_eq!(parse_price("7.8"), Some(780));
    assert_eq!(parse_price("89"), Some(8900));
    assert_eq!(parse_price("0.05"), Some(5));
}

#[test]
fn bad_prices_are_rejected() {
    assert_eq!(parse_price("abc"), None);
    assert_eq!(parse_price("1.999"), None);
    assert_eq!(parse_price("-3.00"), None);
    assert_eq!(parse_price(""), None);
}
```

```rust check
/// Turns a price such as "12.50" into cents (1250).
fn parse_price(text: &str) -> Option<u64> {
    let (whole, fraction) = text.split_once('.').unwrap_or((text, "0"));
    let whole: u64 = whole.parse().ok()?;
    let cents: u64 = match fraction.len() {
        1 => fraction.parse::<u64>().ok()? * 10,
        2 => fraction.parse().ok()?,
        _ => return None,
    };
    Some(whole * 100 + cents)
}
# fn main() {}
```

- `split_once('.')` separates the part before and after the point. If there is no point, `unwrap_or` supplies the whole text and `"0"`.
- `.parse().ok()?` appears three times. `parse` gives a `Result`, `.ok()` turns it into an `Option`, and `?` leaves the function with `None` if the text was not a number.
- One digit after the point means tenths (`7.8` is 780 cents), so it is multiplied by 10. More than two digits are refused.
- Parsing into `u64` rejects negative prices for free, because `"-3"` is not a valid `u64`.

## Step 3: read one line

```rust check
# #[derive(Debug, Clone, PartialEq)]
# struct Sale { date: String, product: String, category: String, quantity: u32, unit_price: u64 }
# fn parse_price(_t: &str) -> Option<u64> { None }
fn parse_sale(line: &str) -> Result<Sale, String> {
    let fields: Vec<&str> = line.split(',').map(|field| field.trim()).collect();
    let [date, product, category, quantity, price] = fields[..] else {
        return Err(format!("expected 5 fields, found {}", fields.len()));
    };
    if date.len() != 10 {
        return Err(format!("'{date}' is not a date like 2026-01-31"));
    }
    let quantity = quantity
        .parse()
        .map_err(|_| format!("'{quantity}' is not a whole number"))?;
    let unit_price = parse_price(price).ok_or(format!("'{price}' is not a price"))?;

    Ok(Sale {
        date: date.to_string(),
        product: product.to_string(),
        category: category.to_string(),
        quantity,
        unit_price,
    })
}
# fn main() {}
```

The first two statements do a lot:

- `line.split(',').map(|field| field.trim()).collect()` is a small pipeline: cut at the commas, trim each piece, gather the pieces in a vector.
- `let [date, product, category, quantity, price] = fields[..] else { ... }` is a **slice pattern** in a `let … else`. It fits only if the vector has exactly five elements, and gives each of them a name in the same step. With four or six fields, the `else` block reports the problem.

Each conversion that can fail gets its own message. `map_err` replaces the standard error of `parse` with a sentence that includes the offending text. `ok_or` turns the `Option` from `parse_price` into a `Result`. In both cases `?` ends the function early if something is wrong.

:::warn Real CSV is harder
Splitting at commas is enough for this data. Real CSV files may contain commas inside quoted fields (`"Smith, John"`), quotes inside quotes, and line breaks inside fields. For real work, use the `csv` crate together with `serde` ([chapter 78](#serde)). It handles all of that and fills your structs directly.
:::

## Step 4: read everything, and keep track of problems

```rust check
# struct Sale;
# fn parse_sale(_l: &str) -> Result<Sale, String> { Ok(Sale) }
/// Parses every line after the header. Returns the good rows and the problems.
fn parse_all(text: &str) -> (Vec<Sale>, Vec<String>) {
    let mut sales = Vec::new();
    let mut problems = Vec::new();

    let rows = text
        .lines()
        .enumerate()
        .skip(1)
        .filter(|(_, line)| !line.trim().is_empty());

    for (index, line) in rows {
        match parse_sale(line) {
            Ok(sale) => sales.push(sale),
            Err(reason) => problems.push(format!("line {}: {reason}", index + 1)),
        }
    }
    (sales, problems)
}
# fn main() {}
```

The order of the adapters matters:

1. `lines()` yields each line.
2. `enumerate()` numbers them from 0. It comes **before** any skipping or filtering, so that the numbers are the true line numbers of the file.
3. `skip(1)` drops the header.
4. `filter(...)` drops empty lines. The closure receives a reference to a pair, and the pattern `(_, line)` takes the pair apart.

The loop then sorts each result into one of two vectors. The function returns both as a tuple. The caller gets all the good data **and** a complete list of what was wrong and where.

:::tip Two ways to deal with bad rows
In the last chapter you saw that an iterator of `Result`s can be collected into one `Result<Vec<_>, _>`, which gives up at the first error. That is right when one bad row makes the whole input worthless, for example a configuration file. For a report over many rows, collecting the problems and carrying on is more useful. Decide this consciously for each program.
:::

## Step 5: summaries with iterators

Totals are one line each:

```rust wrap
# struct Sale { quantity: u32, unit_price: u64 }
# impl Sale { fn revenue(&self) -> u64 { self.quantity as u64 * self.unit_price } }
# let sales = vec![Sale { quantity: 2, unit_price: 150 }, Sale { quantity: 1, unit_price: 700 }];
let total: u64 = sales.iter().map(Sale::revenue).sum();
let items: u32 = sales.iter().map(|s| s.quantity).sum();
let largest = sales.iter().max_by_key(|s| s.revenue());
# let _ = (total, items, largest.is_some());
```

`map(Sale::revenue)` passes the method by name. It means the same as `map(|s| s.revenue())`.

Now the interesting part. The report needs the revenue per category, per month and per product. These are three versions of the same calculation: "put the sales into groups and add up each group". Only the meaning of "group" differs. So write the calculation **once**, and let a closure say what the group of a sale is:

```rust check
# use std::collections::BTreeMap;
# struct Sale { quantity: u32, unit_price: u64 }
# impl Sale { fn revenue(&self) -> u64 { self.quantity as u64 * self.unit_price } }
/// Adds up the revenue per group. The closure decides what a group is.
/// The result is sorted by revenue, largest first.
fn revenue_by<'a, F>(sales: &'a [Sale], key: F) -> Vec<(&'a str, u64)>
where
    F: Fn(&'a Sale) -> &'a str,
{
    let mut totals: BTreeMap<&str, u64> = BTreeMap::new();
    for sale in sales {
        *totals.entry(key(sale)).or_insert(0) += sale.revenue();
    }
    let mut list: Vec<(&str, u64)> = totals.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1));
    list
}
# fn main() {}
```

It is used like this:

```rust
let by_category = revenue_by(&sales, |s| &s.category);
let by_month = revenue_by(&sales, |s| s.month());
let by_product = revenue_by(&sales, |s| &s.product);
```

Three reports from one function, and a fourth (by date, by first letter, anything) costs one more line.

The signature combines traits, lifetimes, closures, and iterators:

- `F: Fn(&'a Sale) -> &'a str` says that `key` is a closure that takes a reference to a sale and returns a string slice **borrowed from that sale**.
- The result, `Vec<(&'a str, u64)>`, contains those same borrowed names. The lifetime `'a` ties them to the `sales` slice. No name is copied, however many sales there are.
- Inside, the map counts with the `entry` pattern from [chapter 20](#collections). Then the pairs are moved into a vector, which is sorted with a closure that compares the amounts in reverse (`b` before `a`), so the largest comes first.

A `BTreeMap` is used so that groups with equal revenue come out in alphabetical order, always the same. With a `HashMap`, their order could change from run to run.

## Step 6: make it readable

Two small functions turn numbers into a tidy table:

```rust check
/// 123456 -> "1,234.56"
fn money(cents: u64) -> String {
    let whole = (cents / 100).to_string();
    let mut grouped = String::new();
    for (i, digit) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    format!("{grouped}.{:02}", cents % 100)
}

fn print_table(title: &str, rows: &[(&str, u64)], total: u64) {
    println!("\n{title}");
    println!("{}", "-".repeat(44));
    for (name, amount) in rows {
        let share = *amount as f64 / total as f64 * 100.0;
        println!("{name:<16}{:>14}{share:>12.1} %", money(*amount));
    }
}
# fn main() {}
```

- `money` splits the cents into whole units and the remainder. It walks over the digits of the whole part and puts a comma wherever the number of digits still to come is a multiple of three. `{:02}` prints the cents with two digits, so 5 cents show as `05`.
- In `print_table`, the format specifiers from [chapter 16](#slices-strings) create the columns: `{name:<16}` is left-aligned in 16 characters, `{:>14}` is right-aligned in 14, and `{share:>12.1}` is right-aligned with one decimal place.
- The share in percent is only for display, so a float is fine there.

## The complete program

```rust run
use std::collections::BTreeMap;

const SAMPLE: &str = "\
date,product,category,quantity,unit_price
2026-01-05,Coffee beans,Food,4,12.50
2026-01-05,Notebook,Office,10,3.20
2026-01-17,Desk lamp,Office,2,24.99
2026-01-28,Green tea,Food,6,7.80
2026-02-02,Coffee beans,Food,3,12.50
2026-02-09,Headphones,Electronics,1,89.00
2026-02-14,Notebook,Office,25,3.20
2026-02-14,Chocolate,Food,12,2.75
2026-02-20,USB cable,Electronics,5,6.40
2026-03-01,Desk lamp,Office,one,24.99
2026-03-03,Headphones,Electronics,2,89.00
2026-03-09,Green tea,Food,4,7.80
2026-03-15,Coffee beans,Food,5
2026-03-22,USB cable,Electronics,8,6.40
";

#[derive(Debug, Clone, PartialEq)]
struct Sale {
    date: String,
    product: String,
    category: String,
    quantity: u32,
    unit_price: u64, // in cents
}

impl Sale {
    fn revenue(&self) -> u64 {
        self.quantity as u64 * self.unit_price
    }

    fn month(&self) -> &str {
        &self.date[..7]
    }
}

/// Turns a price such as "12.50" into cents (1250).
fn parse_price(text: &str) -> Option<u64> {
    let (whole, fraction) = text.split_once('.').unwrap_or((text, "0"));
    let whole: u64 = whole.parse().ok()?;
    let cents: u64 = match fraction.len() {
        1 => fraction.parse::<u64>().ok()? * 10,
        2 => fraction.parse().ok()?,
        _ => return None,
    };
    Some(whole * 100 + cents)
}

fn parse_sale(line: &str) -> Result<Sale, String> {
    let fields: Vec<&str> = line.split(',').map(|field| field.trim()).collect();
    let [date, product, category, quantity, price] = fields[..] else {
        return Err(format!("expected 5 fields, found {}", fields.len()));
    };
    if date.len() != 10 {
        return Err(format!("'{date}' is not a date like 2026-01-31"));
    }
    let quantity = quantity
        .parse()
        .map_err(|_| format!("'{quantity}' is not a whole number"))?;
    let unit_price = parse_price(price).ok_or(format!("'{price}' is not a price"))?;

    Ok(Sale {
        date: date.to_string(),
        product: product.to_string(),
        category: category.to_string(),
        quantity,
        unit_price,
    })
}

/// Parses every line after the header. Returns the good rows and the problems.
fn parse_all(text: &str) -> (Vec<Sale>, Vec<String>) {
    let mut sales = Vec::new();
    let mut problems = Vec::new();

    let rows = text
        .lines()
        .enumerate()
        .skip(1)
        .filter(|(_, line)| !line.trim().is_empty());

    for (index, line) in rows {
        match parse_sale(line) {
            Ok(sale) => sales.push(sale),
            Err(reason) => problems.push(format!("line {}: {reason}", index + 1)),
        }
    }
    (sales, problems)
}

/// Adds up the revenue per group. The closure decides what a group is.
/// The result is sorted by revenue, largest first.
fn revenue_by<'a, F>(sales: &'a [Sale], key: F) -> Vec<(&'a str, u64)>
where
    F: Fn(&'a Sale) -> &'a str,
{
    let mut totals: BTreeMap<&str, u64> = BTreeMap::new();
    for sale in sales {
        *totals.entry(key(sale)).or_insert(0) += sale.revenue();
    }
    let mut list: Vec<(&str, u64)> = totals.into_iter().collect();
    list.sort_by(|a, b| b.1.cmp(&a.1));
    list
}

/// 123456 -> "1,234.56"
fn money(cents: u64) -> String {
    let whole = (cents / 100).to_string();
    let mut grouped = String::new();
    for (i, digit) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    format!("{grouped}.{:02}", cents % 100)
}

fn print_table(title: &str, rows: &[(&str, u64)], total: u64) {
    println!("\n{title}");
    println!("{}", "-".repeat(44));
    for (name, amount) in rows {
        let share = *amount as f64 / total as f64 * 100.0;
        println!("{name:<16}{:>14}{share:>12.1} %", money(*amount));
    }
}

fn main() {
    let (sales, problems) = parse_all(SAMPLE);

    let total: u64 = sales.iter().map(Sale::revenue).sum();
    let items: u32 = sales.iter().map(|s| s.quantity).sum();

    println!("SALES REPORT");
    println!("{} sales, {} items, total revenue {}", sales.len(), items, money(total));

    print_table("Revenue by category", &revenue_by(&sales, |s| &s.category), total);
    print_table("Revenue by month", &revenue_by(&sales, |s| s.month()), total);

    let products = revenue_by(&sales, |s| &s.product);
    let top: Vec<(&str, u64)> = products.iter().copied().take(3).collect();
    print_table("Top 3 products", &top, total);

    if let Some(best) = sales.iter().max_by_key(|s| s.revenue()) {
        println!(
            "\nLargest single sale: {} x {} on {} ({})",
            best.quantity,
            best.product,
            best.date,
            money(best.revenue())
        );
    }

    let average = total / sales.len().max(1) as u64;
    let big = sales.iter().filter(|s| s.revenue() > average).count();
    println!("Average sale: {}. {} sales were above the average.", money(average), big);

    if !problems.is_empty() {
        println!("\n{} rows were skipped:", problems.len());
        for problem in &problems {
            println!("  {problem}");
        }
    }
}
```
```output
SALES REPORT
12 sales, 82 items, total revenue 710.68

Revenue by category
--------------------------------------------
Electronics             350.20        49.3 %
Food                    198.50        27.9 %
Office                  161.98        22.8 %

Revenue by month
--------------------------------------------
2026-02                 271.50        38.2 %
2026-03                 260.40        36.6 %
2026-01                 178.78        25.2 %

Top 3 products
--------------------------------------------
Headphones              267.00        37.6 %
Notebook                112.00        15.8 %
Coffee beans             87.50        12.3 %

Largest single sale: 2 x Headphones on 2026-03-03 (178.00)
Average sale: 59.22. 3 sales were above the average.

2 rows were skipped:
  line 11: 'one' is not a whole number
  line 14: expected 5 fields, found 4
```

And the tests, to add at the end of the file:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prices_become_cents() {
        assert_eq!(parse_price("12.50"), Some(1250));
        assert_eq!(parse_price("7.8"), Some(780));
        assert_eq!(parse_price("89"), Some(8900));
        assert_eq!(parse_price("0.05"), Some(5));
    }

    #[test]
    fn bad_prices_are_rejected() {
        assert_eq!(parse_price("abc"), None);
        assert_eq!(parse_price("1.999"), None);
        assert_eq!(parse_price("-3.00"), None);
        assert_eq!(parse_price(""), None);
    }

    #[test]
    fn a_good_line_becomes_a_sale() {
        let sale = parse_sale("2026-01-05, Coffee beans ,Food,4,12.50").unwrap();
        assert_eq!(sale.product, "Coffee beans");
        assert_eq!(sale.revenue(), 5000);
        assert_eq!(sale.month(), "2026-01");
    }

    #[test]
    fn bad_lines_are_reported_with_their_number() {
        let text = "header\n2026-01-05,Tea,Food,x,1.00\n\n2026-01-06,Tea,Food,1,1.00\nshort,line";
        let (sales, problems) = parse_all(text);
        assert_eq!(sales.len(), 1);
        assert_eq!(problems.len(), 2);
        assert!(problems[0].starts_with("line 2:"));
        assert!(problems[1].starts_with("line 5:"));
    }

    #[test]
    fn groups_are_sorted_by_revenue() {
        let (sales, _) = parse_all("h\n2026-01-01,A,X,1,1.00\n2026-01-01,B,Y,1,5.00\n2026-01-01,C,X,1,2.00");
        assert_eq!(revenue_by(&sales, |s| &s.category), vec![("Y", 500), ("X", 300)]);
    }

    #[test]
    fn money_is_formatted_with_separators() {
        assert_eq!(money(5), "0.05");
        assert_eq!(money(123456), "1,234.56");
        assert_eq!(money(100000000), "1,000,000.00");
    }
}
```

The last lines of `main` use three more consumers: `max_by_key` finds the largest sale, `filter(...).count()` counts the sales above the average, and `.max(1)` on the length guards against a division by zero when there are no sales at all.

Look at `main` once more. It contains no loops except for printing the problems. Every calculation is a short pipeline that says what is wanted.

## Make it better

:::exercise practice Read a real file
Let the program take a file name as its first command-line argument. If one is given, read that file. Without an argument, use the built-in sample. A file that cannot be read should produce a message on the error stream and exit code 1.
::hint
`std::env::args().nth(1)` gives `Some(file_name)` or `None`. Read with `std::fs::read_to_string`. Store the text in a `String` variable that lives until the end of `main`, because the sales are built from it. Use `match` on the argument: `Some(path)` reads the file, `None` gives `SAMPLE.to_string()`.
::solution
```rust check
# const SAMPLE: &str = "";
use std::env;
use std::fs;
use std::process;

fn load_input() -> String {
    match env::args().nth(1) {
        Some(path) => match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) => {
                eprintln!("error: cannot read {path}: {error}");
                process::exit(1);
            }
        },
        None => SAMPLE.to_string(),
    }
}

fn main() {
    let text = load_input();
    // let (sales, problems) = parse_all(&text);
    // ... the rest of main as before
#   let _ = text;
}
```

Only the source of the text changed. Everything after `parse_all(&text)` is untouched, because all the functions take a `&str` or a slice of sales and do not care where the data came from. That is the payoff of keeping input, calculation and output apart.

`process::exit` never returns, so the compiler accepts that this `match` arm does not produce a `String`. Its type is the never type `!`, which fits anywhere.
:::

:::exercise practice A bar chart
Add a function `print_chart(title: &str, rows: &[(&str, u64)])` that prints one line per row with a bar made of `#` characters. The largest value gets a bar of 30 characters, and the others are scaled in proportion:

```text
Electronics     ############################## 350.20
Food            ################# 198.50
Office          ############# 161.98
```
::hint
Find the largest amount with `rows.iter().map(|(_, amount)| *amount).max()`. The length of a bar is `amount * 30 / largest`, in integer arithmetic. `"#".repeat(length as usize)` builds the bar. Guard against an empty list and against a largest value of 0.
::solution
```rust run
fn money(cents: u64) -> String {
    format!("{}.{:02}", cents / 100, cents % 100)
}

fn print_chart(title: &str, rows: &[(&str, u64)]) {
    println!("{title}");
    let Some(largest) = rows.iter().map(|(_, amount)| *amount).max() else {
        println!("(no data)");
        return;
    };
    for (name, amount) in rows {
        let length = if largest == 0 { 0 } else { amount * 30 / largest };
        println!("{name:<16}{} {}", "#".repeat(length as usize), money(*amount));
    }
}

fn main() {
    let rows = [("Electronics", 35020), ("Food", 19850), ("Office", 16198)];
    print_chart("Revenue by category", &rows);
    print_chart("Nothing", &[]);
}
```
```output
Revenue by category
Electronics     ############################## 350.20
Food            ################# 198.50
Office          ############# 161.98
Nothing
(no data)
```

`max()` returns `None` for an empty list, and `let … else` turns that into an early return. The scaling multiplies before it divides (`amount * 30 / largest`), which keeps the precision in integer arithmetic. Dividing first would give 0 for every row but the largest.

Because `revenue_by` returns plain data, the same rows can be shown as a table or as a chart. Neither display function knows how the numbers were produced.
:::

:::exercise challenge Filters from the command line
Let the user restrict the report with options such as `--category Food` and `--month 2026-02`, in any combination. Build a list of filter closures from the arguments, and keep only the sales that pass **all** of them.
::hint
The list has the type `Vec<Box<dyn Fn(&Sale) -> bool>>`. For `--category X`, push `Box::new(move |s: &Sale| s.category == x)`. The `move` matters, because each closure must own the text it compares with. Then: `sales.into_iter().filter(|sale| filters.iter().all(|f| f(sale))).collect()`.
::solution
```rust run
#[derive(Debug)]
struct Sale {
    date: String,
    category: String,
    amount: u64,
}

type Filter = Box<dyn Fn(&Sale) -> bool>;

fn build_filters(args: &[String]) -> Result<Vec<Filter>, String> {
    let mut filters: Vec<Filter> = Vec::new();
    let mut args = args.iter();

    while let Some(option) = args.next() {
        let Some(value) = args.next().cloned() else {
            return Err(format!("{option} needs a value"));
        };
        match option.as_str() {
            "--category" => filters.push(Box::new(move |s: &Sale| s.category == value)),
            "--month" => filters.push(Box::new(move |s: &Sale| s.date.starts_with(&value))),
            "--min" => {
                let limit: u64 = value.parse().map_err(|_| format!("'{value}' is not a number"))?;
                filters.push(Box::new(move |s: &Sale| s.amount >= limit));
            }
            other => return Err(format!("unknown option {other}")),
        }
    }
    Ok(filters)
}

fn main() {
    let sales = vec![
        Sale { date: String::from("2026-01-05"), category: String::from("Food"), amount: 5000 },
        Sale { date: String::from("2026-02-02"), category: String::from("Food"), amount: 3750 },
        Sale { date: String::from("2026-02-09"), category: String::from("Electronics"), amount: 8900 },
        Sale { date: String::from("2026-02-14"), category: String::from("Food"), amount: 900 },
    ];

    // in the real program: std::env::args().skip(1).collect()
    let args: Vec<String> = ["--category", "Food", "--month", "2026-02", "--min", "1000"]
        .iter()
        .map(|s| s.to_string())
        .collect();

    match build_filters(&args) {
        Ok(filters) => {
            let selected: Vec<&Sale> = sales
                .iter()
                .filter(|sale| filters.iter().all(|f| f(sale)))
                .collect();
            println!("{} filters, {} of {} sales selected", filters.len(), selected.len(), sales.len());
            for sale in selected {
                println!("{} {} {}", sale.date, sale.category, sale.amount);
            }
        }
        Err(message) => println!("error: {message}"),
    }
}
```
```output
3 filters, 1 of 4 sales selected
2026-02-02 Food 3750
```

Each option becomes a closure that owns its own value (`move`). The closures are of three different hidden types, so they are boxed as `dyn Fn(&Sale) -> bool` to live in one vector. `type Filter = …` gives that long type a short name: a **type alias**.

The selection itself is one line: a sale is kept if `all` filters say yes. With an empty list of filters, `all` is true, and every sale is kept, which is exactly the right behaviour for "no options given". Adding a new kind of filter needs one new `match` arm and nothing else.
:::

## What you have learned

:::recap
- A data program is a pipeline: raw text, typed values, summaries, output. Each stage is a small function.
- Parse at the edge into a precise struct. Collect the problems with their line numbers, and carry on.
- Store money as integer cents. Use floats only for display values such as percentages.
- `map`, `filter`, `sum`, `max_by_key`, `count` and `enumerate` replace most hand-written loops.
- A closure parameter turns three similar functions into one general function (`revenue_by`).
- Lifetimes let the summaries borrow names from the data, with no copies.
- Functions that return data, and do not print, can be tested and reused for different displays.
:::

:::checklist
- I built the report step by step and my output matches the one shown.
- I ran the tests and they pass.
- I can explain why `enumerate` comes before `skip` and `filter` in `parse_all`.
- I can explain what the closure passed to `revenue_by` does and why the function needs a lifetime.
- I made the program read a file given on the command line.
- I added the bar chart.
- I added a summary of my own (for example: revenue per weekday, or the best month per category).
:::

Closures and iterators are now part of your everyday toolbox. Next we look deeper under the surface: smart pointers, advanced traits, and the finer points of Rust's type system.
