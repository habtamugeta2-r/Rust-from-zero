@id serde
@part p13
@title Data formats with Serde: JSON, TOML and more
@short Serde and data formats
@level intermediate
@time 50
@learn Explain what serialisation is | Convert your structs and enums to and from JSON with `derive` | Control the result with Serde attributes | Read configuration from TOML and handle data of unknown shape | Validate data while it is being read

Programs exchange data all the time: they save it to files, send it over the network, and read configuration. For that, a value in memory must be turned into a sequence of bytes in an agreed format, and back again. The first direction is called **serialisation**, and the second **deserialisation**.

In Rust, nearly all of this is done with one library: **Serde** (from "**ser**ialise" and "**de**serialise"). You describe your data as ordinary structs and enums, add one line, and Serde converts them to and from JSON, TOML, YAML, CSV and a dozen other formats.

:::plain Serde in one paragraph
**Serde** separates *what a value is* from *how it is represented*. `#[derive(Serialize, Deserialize)]` generates the conversion code for your struct once, and a separate format crate — `serde_json`, `toml`, `bincode`, `postcard` — supplies the bytes. Attributes tune the mapping: `#[serde(rename_all = "camelCase")]`, `#[serde(default)]`, `#[serde(skip_serializing_if = "Option::is_none")]`, and `#[serde(deny_unknown_fields)]` for strict inputs. Because the derive is a macro rather than reflection, the result is monomorphised and fast, and it works in `no_std` environments where there is no runtime metadata at all.
:::

:::analogy A universal adaptor
A travel adaptor has two sides: one for your plug, and one for the foreign socket. With one adaptor, any of your devices works in any country. Serde is the adaptor between Rust types on one side and data formats on the other. A type that works with Serde works with every format, and a new format works with every type.
:::

## Setting up

Serde itself defines the two traits `Serialize` and `Deserialize`. Each format is a separate crate.

```toml
[dependencies]
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.154"
toml = "1.2.1"
```

The feature `derive` provides the derive macros, which generate the conversion code for your types.

## To JSON and back

**JSON** is the most common format for exchanging data, especially on the web. It knows objects (`{ "key": value }`), lists (`[1, 2]`), strings, numbers, `true`, `false` and `null`.

```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
struct Book {
    title: String,
    author: String,
    year: u16,
    tags: Vec<String>,
    rating: Option<f32>,
}

fn main() -> Result<(), serde_json::Error> {
    let book = Book {
        title: String::from("The Rust Programming Language"),
        author: String::from("Klabnik and Nichols"),
        year: 2018,
        tags: vec![String::from("programming"), String::from("rust")],
        rating: None,
    };

    // Rust value -> JSON text
    let compact = serde_json::to_string(&book)?;
    println!("{compact}");
    println!("{}", serde_json::to_string_pretty(&book)?);

    // JSON text -> Rust value
    let text = r#"{ "title": "Dune", "author": "Frank Herbert", "year": 1965, "tags": [], "rating": 4.5 }"#;
    let dune: Book = serde_json::from_str(text)?;
    println!("{:?}", dune);

    let again: Book = serde_json::from_str(&compact)?;
    println!("{}", again == book);
    Ok(())
}
```
```output
{"title":"The Rust Programming Language","author":"Klabnik and Nichols","year":2018,"tags":["programming","rust"],"rating":null}
{
  "title": "The Rust Programming Language",
  "author": "Klabnik and Nichols",
  "year": 2018,
  "tags": [
    "programming",
    "rust"
  ],
  "rating": null
}
Book { title: "Dune", author: "Frank Herbert", year: 1965, tags: [], rating: Some(4.5) }
true
```

- `#[derive(Serialize, Deserialize)]` is all the type needs.
- `serde_json::to_string` produces JSON, and `to_string_pretty` adds line breaks and indentation for people.
- `serde_json::from_str` reads JSON. The target type comes from the annotation: `let dune: Book = …`.
- The mapping is what you would expect: a struct becomes an object, a `Vec` a list, `Option` is the value or `null`, and numbers and strings are themselves.
- `r#"…"#` is a raw string that may contain double quotes, which makes JSON in source code readable.

For files and network connections there are `serde_json::to_writer(file, &value)` and `serde_json::from_reader(file)`, which avoid building the whole text in memory.

### Wrong data is an error, with a position

Deserialising checks the data against your types. Whatever does not fit is reported, with the line and column:

```rust ext run
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct User {
    name: String,
    age: u8,
}

fn main() {
    let inputs = [
        r#"{"name": "Sara", "age": 29}"#,
        r#"{"name": "Sara", "age": "old"}"#,
        r#"{"name": "Sara"}"#,
        r#"{"name": "Sara", "age": 300}"#,
        r#"{"name": "Sara", "age": 29"#,
    ];
    for input in inputs {
        match serde_json::from_str::<User>(input) {
            Ok(user) => println!("ok: {:?}", user),
            Err(error) => println!("error: {error}"),
        }
    }
}
```
```output
ok: User { name: "Sara", age: 29 }
error: invalid type: string "old", expected u8 at line 1 column 29
error: missing field `age` at line 1 column 16
error: invalid value: integer `300`, expected u8 at line 1 column 27
error: EOF while parsing an object at line 1 column 26
```

A wrong type, a missing field, a number too big for a `u8`, and a missing brace are all caught. This is "parse, don't validate" from [chapter 34](#type-system), for free: once you hold a `User`, the data has the right shape, and the rest of the program needs no checks. In languages where JSON becomes a loose dictionary, such mistakes surface later, somewhere deep in the program.

## Shaping the output with attributes

The names and rules of an existing format rarely match Rust's conventions exactly. Attributes adjust the mapping without changing your types:

```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Account {
    user_name: String,

    #[serde(rename = "mail")]
    email_address: String,

    #[serde(default)]
    is_admin: bool,

    #[serde(default = "default_language")]
    language: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    nickname: Option<String>,

    #[serde(skip)]
    session_token: String,
}

fn default_language() -> String {
    String::from("en")
}

fn main() -> Result<(), serde_json::Error> {
    let text = r#"{ "userName": "sara", "mail": "sara@example.com" }"#;
    let account: Account = serde_json::from_str(text)?;
    println!("{:?}", account);
    println!("{}", serde_json::to_string(&account)?);
    println!("{}", account.session_token.is_empty());
    Ok(())
}
```
```output
Account { user_name: "sara", email_address: "sara@example.com", is_admin: false, language: "en", nickname: None, session_token: "" }
{"userName":"sara","mail":"sara@example.com","isAdmin":false,"language":"en"}
true
```

| Attribute | Effect |
|---|---|
| `#[serde(rename_all = "camelCase")]` | convert all field names: `user_name` ↔ `userName`. Others: `"snake_case"`, `"kebab-case"`, `"SCREAMING_SNAKE_CASE"`, `"lowercase"` |
| `#[serde(rename = "mail")]` | a different name for one field |
| `#[serde(alias = "e-mail")]` | accept a second name when reading |
| `#[serde(default)]` | if the field is missing, use `Default::default()` |
| `#[serde(default = "function")]` | if the field is missing, call this function |
| `#[serde(skip_serializing_if = "Option::is_none")]` | leave the field out when writing, if the test is true |
| `#[serde(skip)]` | never read or write this field |
| `#[serde(flatten)]` | put the fields of a nested struct directly into the parent |
| `#[serde(deny_unknown_fields)]` | reject input with fields the struct does not have |
| `#[serde(with = "module")]` | use custom functions for this field |

By default, unknown fields in the input are ignored. Together with `default`, that makes formats able to grow: an old program reads new files and skips what it does not know, and a new program reads old files and fills in defaults.

## Enums

Enums map to JSON in several ways. The default wraps the data in an object named after the variant. Often you want a field that names the kind, and one attribute does that:

```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
enum Plain {
    Circle { radius: f64 },
    Point,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    Login { user: String },
    Purchase { user: String, cents: u64 },
    Logout,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum Id {
    Number(u64),
    Text(String),
}

fn main() -> Result<(), serde_json::Error> {
    println!("{}", serde_json::to_string(&vec![Plain::Circle { radius: 1.5 }, Plain::Point])?);

    let events = vec![
        Event::Login { user: String::from("sara") },
        Event::Purchase { user: String::from("sara"), cents: 1250 },
        Event::Logout,
    ];
    let text = serde_json::to_string(&events)?;
    println!("{text}");

    let back: Vec<Event> = serde_json::from_str(&text)?;
    println!("{:?}", back[1]);

    let ids: Vec<Id> = serde_json::from_str(r#"[42, "abc-7"]"#)?;
    println!("{:?}", ids);
    Ok(())
}
```
```output
[{"Circle":{"radius":1.5}},"Point"]
[{"type":"login","user":"sara"},{"type":"purchase","user":"sara","cents":1250},{"type":"logout"}]
Purchase { user: "sara", cents: 1250 }
[Number(42), Text("abc-7")]
```

| Representation | Attribute | JSON for `Login { user: "sara" }` |
|---|---|---|
| externally tagged (default) | none | `{"Login": {"user": "sara"}}` |
| internally tagged | `#[serde(tag = "type")]` | `{"type": "Login", "user": "sara"}` |
| adjacently tagged | `#[serde(tag = "t", content = "c")]` | `{"t": "Login", "c": {"user": "sara"}}` |
| untagged | `#[serde(untagged)]` | `{"user": "sara"}`: the first variant that fits is chosen |

The internally tagged form is what most web APIs use. A list of events of different kinds becomes one `Vec<Event>` that you handle with a `match`.

## Data of unknown shape

Sometimes you do not know the structure in advance, or need only one value from a large document. `serde_json::Value` is an enum that can hold any JSON:

```rust ext run
use serde_json::{json, Value};

fn main() -> Result<(), serde_json::Error> {
    let text = r#"{ "name": "Sara", "skills": ["rust", "sql"], "address": { "city": "Addis Ababa" }, "age": 29 }"#;
    let value: Value = serde_json::from_str(text)?;

    println!("{}", value["name"]);
    println!("{:?}", value["name"].as_str());
    println!("{}", value["skills"][0]);
    println!("{}", value["address"]["city"]);
    println!("{}", value["missing"]["deeper"]);
    println!("{:?}", value["age"].as_u64());

    if let Some(skills) = value["skills"].as_array() {
        println!("{} skills", skills.len());
    }

    let built = json!({
        "ok": true,
        "count": 2,
        "items": ["a", "b"],
        "owner": value["name"],
    });
    println!("{built}");
    Ok(())
}
```
```output
"Sara"
Some("Sara")
"rust"
"Addis Ababa"
null
Some(29)
2 skills
{"count":2,"items":["a","b"],"ok":true,"owner":"Sara"}
```

- Indexing with `["key"]` or `[0]` never panics. A missing entry gives `Value::Null`.
- `as_str()`, `as_u64()`, `as_array()` and their relatives return an `Option`, because the value may be of another kind.
- The `json!` macro builds a `Value` from JSON-like syntax, with Rust expressions inside.

Use `Value` for exploring and for truly free-form data. For anything with a known structure, define structs. You then get checking, documentation and auto-completion.

## Configuration files with TOML

**TOML** is the format of `Cargo.toml`, and the usual choice for configuration files in Rust programs. It is easy for people to read and edit. The crate `toml` works exactly like `serde_json`:

```rust ext run
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    title: String,
    #[serde(default)]
    debug: bool,
    server: Server,
    #[serde(default)]
    users: Vec<User>,
    #[serde(default)]
    limits: HashMap<String, u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Server {
    host: String,
    #[serde(default = "default_port")]
    port: u16,
}

#[derive(Debug, Serialize, Deserialize)]
struct User {
    name: String,
    admin: bool,
}

fn default_port() -> u16 {
    8080
}

const TEXT: &str = r#"
title = "My service"

[server]
host = "127.0.0.1"

[[users]]
name = "sara"
admin = true

[[users]]
name = "tomas"
admin = false

[limits]
requests = 100
"#;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config: Config = toml::from_str(TEXT)?;
    println!("{} on {}:{}", config.title, config.server.host, config.server.port);
    println!("debug: {}, users: {}, limit: {:?}", config.debug, config.users.len(), config.limits.get("requests"));

    let admins: Vec<&str> = config.users.iter().filter(|u| u.admin).map(|u| u.name.as_str()).collect();
    println!("{:?}", admins);

    println!("{}", toml::to_string(&config.server)?);
    Ok(())
}
```
```output
My service on 127.0.0.1:8080
debug: false, users: 2, limit: Some(100)
["sara"]
host = "127.0.0.1"
port = 8080

```

The TOML syntax in brief: `key = value` lines, `[section]` for a nested struct, and `[[name]]` for one element of a list of structs. The port and the `debug` flag are missing from the file and get their defaults.

In a real program, read the text with `std::fs::read_to_string("config.toml")`. A typical start-up sequence is: read the file, deserialise it into a `Config` struct, report any error with its position, and pass the `Config` on. From then on the configuration is a checked, typed value.

## Other formats

Since the conversion is described once by the derive, switching the format is a matter of calling a different crate:

| Format | Crate | Typical use |
|---|---|---|
| JSON | `serde_json` | web APIs, data exchange |
| TOML | `toml` | configuration files |
| YAML | `serde_yaml` and its successors | configuration, Kubernetes files |
| CSV | `csv` | tables, spreadsheets |
| MessagePack | `rmp-serde` | compact binary exchange between languages |
| bincode, postcard | `bincode`, `postcard` | very compact binary data between Rust programs. `postcard` suits embedded devices |
| CBOR | `ciborium` | binary, standardised |
| RON | `ron` | a Rust-like text format, used for game data |
| URL query strings and forms | `serde_urlencoded` | web forms |

Web frameworks, database libraries and command-line parsers build on Serde as well. A struct with `Deserialize` can be filled from an HTTP request body, a row of a database, or environment variables.

### Binary formats: `bincode` and MessagePack

JSON and TOML are text: easy to read and debug, but verbose and slow to parse. When the data never needs to be read by a person — saved to a file, sent between two services, kept in a message queue — a **binary format** is smaller and faster. Both sides must agree on the type, usually by sharing the same crate; the bytes themselves contain no schema and no field names unless the format adds them.

**`bincode`** turns a Serde type into the smallest possible bytes: field names disappear, and numbers are written in their binary form. It is the natural choice when both sides are Rust.

**`rmp-serde`** implements **MessagePack**: a binary form of JSON-like data (maps, lists, strings, numbers). Other languages can read it, so it fits services written in more than one language.

```toml
bincode = "1.3"
rmp-serde = "1.4"
serde = { version = "1.0.229", features = ["derive"] }
```

```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Reading {
    sensor: u8,
    temperature: i16,
    ok: bool,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let reading = Reading { sensor: 3, temperature: -125, ok: true };

    // bincode: Rust to Rust, with no field names in the data
    let bytes = bincode::serialize(&reading)?;
    let back: Reading = bincode::deserialize(&bytes)?;
    println!("bincode: {} bytes  {:02x?}", bytes.len(), bytes);
    println!("round trip: {}", back == reading);

    // rmp-serde: MessagePack, readable by other languages too
    let packed = rmp_serde::to_vec(&reading)?;
    let back2: Reading = rmp_serde::from_slice(&packed)?;
    println!("messagepack round trip: {}", back2 == reading);
    Ok(())
}
```

```output
bincode: 4 bytes  [03, 83, ff, 01]
round trip: true
messagepack round trip: true
```

- Four bytes for three values, and none of them are the words `sensor`, `temperature` or `ok`. The reader must know the struct shape in advance — that is the contract of a binary format.
- The size difference matters at scale: ten thousand readings take about 40 kilobytes with bincode, roughly ten times less than the same data as JSON.

| | `bincode` | `rmp-serde` (MessagePack) | JSON |
|---|---|---|---|
| Field names in the data | no | yes | yes |
| Readable by other languages | rarely | yes | yes |
| Size | smallest | small | larger |
| Best for | Rust ↔ Rust | mixed-language services | files people edit |

Because the bytes carry no names, adding or removing a field can break files written by an older version of the program. Use `Option`, `#[serde(default)]` and `#[serde(skip_serializing_if = "…")]` to tolerate change (described earlier in this chapter), or keep a text format for data that must last years.

### Tables: CSV

[Chapter 31](#project-report) read a table of sales by splitting lines at commas, and noted that real CSV files are harder: a field may contain a comma or a quote. The crate `csv` knows these rules, and with Serde each row becomes a struct:

```toml
[dependencies]
csv = "1.4.0"
serde = { version = "1.0.229", features = ["derive"] }
```

```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Sale {
    customer: String,
    product: String,
    quantity: u32,
    price: f64,
}

fn main() -> Result<(), csv::Error> {
    let text = r#"customer,product,quantity,price
"Smith, John",tea,2,3.50
Sara,"mug ""XL""",1,7.25
Tomas,coffee,many,4.00
"#;

    // Reading: the first line names the columns. Every further line becomes one struct
    let mut reader = csv::Reader::from_reader(text.as_bytes());
    let mut sales = Vec::new();
    for (index, record) in reader.deserialize::<Sale>().enumerate() {
        match record {
            Ok(sale) => sales.push(sale),
            Err(error) => println!("row {} skipped: {error}", index + 1),
        }
    }
    for sale in &sales {
        println!("{:<12} {:<9} {} x {:.2}", sale.customer, sale.product, sale.quantity, sale.price);
    }

    // Writing: quotes are added where a field needs them
    let mut writer = csv::Writer::from_writer(Vec::new());
    for sale in &sales {
        writer.serialize(sale)?;
    }
    let bytes = writer.into_inner().expect("writing into memory cannot fail");
    print!("{}", String::from_utf8_lossy(&bytes));
    Ok(())
}
```
```output
row 3 skipped: CSV deserialize error: record 3 (line: 4, byte: 82): field 2: invalid digit found in string
Smith, John  tea       2 x 3.50
Sara         mug "XL"  1 x 7.25
customer,product,quantity,price
"Smith, John",tea,2,3.5
Sara,"mug ""XL""",1,7.25
```

- The columns are matched to the fields by the names in the first line, so their order in the file does not matter.
- `"Smith, John"` is one field with a comma inside, and `""` inside quotes stands for one quote character. The hand-written parser of [chapter 31](#project-report) would have split the first row into five fields.
- `deserialize` returns an iterator of `Result`s. A bad row (here `many` is not a number) gives an error with its line number, and the program decides whether to skip it or to stop.
- To work with a file, use `csv::Reader::from_path("sales.csv")` and `csv::Writer::from_path(…)`.

## Validating while reading

Serde can call your own conversion code, which lets a type protect its rules even when the data comes from outside. The attribute `try_from` says: "to deserialise me, first read this simpler type, then run my `TryFrom`":

```rust ext run
use serde::{Deserialize, Serialize};

/// A percentage from 0 to 100. Invalid numbers cannot be deserialised.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "u8", into = "u8")]
struct Percent(u8);

impl TryFrom<u8> for Percent {
    type Error = String;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        if value <= 100 { Ok(Percent(value)) } else { Err(format!("{value} is more than 100 percent")) }
    }
}

impl From<Percent> for u8 {
    fn from(percent: Percent) -> u8 {
        percent.0
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct Sale {
    product: String,
    discount: Percent,
}

fn main() {
    let good: Sale = serde_json::from_str(r#"{ "product": "tea", "discount": 20 }"#).unwrap();
    println!("{:?}", good);
    println!("{}", serde_json::to_string(&good).unwrap());

    let bad = serde_json::from_str::<Sale>(r#"{ "product": "tea", "discount": 150 }"#);
    println!("{}", bad.unwrap_err());
}
```
```output
Sale { product: "tea", discount: Percent(20) }
{"product":"tea","discount":20}
150 is more than 100 percent at line 1 column 37
```

A `Sale` with a discount of 150 percent cannot come into existence, whether it is built in code or read from a file. The error from `TryFrom` is reported with the position in the input. This closes a common gap: without it, `#[derive(Deserialize)]` would fill the private field directly and bypass the constructor's check.

For full control, you can implement `Serialize` and `Deserialize` by hand. That is rarely necessary.

:::tip How Serde stays fast
Serde does not build an intermediate tree of generic values. The derive macro generates code for exactly your type, which the compiler optimises like hand-written parsing code. Deserialising into structs is therefore fast and uses little memory. A field of type `&str` can even borrow directly from the input text, with no copy at all.
:::

:::compare Serialisation in other languages
- **JavaScript** (`JSON.parse`) and **Python** (`json.loads`) return loose objects and dictionaries. Nothing checks the shape, unless you add a validation library such as Zod or Pydantic.
- **Java** (Jackson, Gson) and **C#** (System.Text.Json) fill classes using reflection: they inspect types while the program runs, which costs time and finds some mistakes late.
- **Go** uses struct tags and reflection. A missing field silently becomes a zero value.
- **Serde** does the work at compile time. Missing fields and wrong types are errors unless you say otherwise, and no reflection is involved.
:::

:::tip When the error does not say which field
Serde's error message names the problem but not always its address: on a deep configuration file it can say "invalid type: string, expected a boolean" without telling you *which* of two hundred fields. The crate `serde_path_to_error` wraps the deserialiser and reports the path — `server.tls.require_client_cert`, not just "field". It is ten lines of integration and it pays for itself the first time a user sends you a broken configuration file.
:::

:::recap
- Serialisation turns values into bytes in some format, and deserialisation turns them back.
- `#[derive(Serialize, Deserialize)]` makes a type work with every format Serde supports.
- `serde_json::to_string`, `to_string_pretty` and `from_str` convert to and from JSON. Errors name the problem and its position.
- Attributes adjust names (`rename`, `rename_all`), fill gaps (`default`), omit fields (`skip…`) and choose the enum representation (`tag`).
- `serde_json::Value` and `json!` handle free-form JSON.
- `toml` reads configuration files into typed structs, with defaults for missing settings.
- `#[serde(try_from = "…")]` runs your validation during deserialisation.
:::

:::quiz Check your understanding
? What do you have to add to a struct so that it can be written as JSON and read back?
- Implement a method `to_json`
+ `#[derive(Serialize, Deserialize)]`, with the `serde` crate and its `derive` feature
- Nothing. All structs can be serialised
- `#[derive(Json)]`
= The two derives generate implementations of Serde's traits. Any format crate can then convert the type.

? The JSON `{"name": "Sara"}` is deserialised into `struct User { name: String, age: u8 }`. What happens?
- `age` becomes 0
- The program panics
+ `from_str` returns an error: missing field `age`
- `age` becomes `null`
= Missing fields are errors by default. Use `Option<u8>` or `#[serde(default)]` if the field may be absent.

? Which attribute makes the Rust field `user_name` appear as `userName` in JSON, for all fields of the struct?
- `#[serde(default)]`
- `#[serde(flatten)]`
+ `#[serde(rename_all = "camelCase")]`
- `#[serde(tag = "camelCase")]`
= `rename_all` converts every field name to the given style. `rename` does it for a single field.

? What does `#[serde(tag = "type")]` on an enum do?
- It removes the variant name
+ It stores the variant's name in a field called `type`, next to the variant's own fields
- It converts the enum to a string
- It sorts the variants
= This is the internally tagged representation: `{"type": "login", "user": "sara"}`.

? When is `serde_json::Value` the right tool, and not a struct?
- Always. Structs are slower
+ When the structure of the data is not known in advance, or only a small part of it is needed
- When the JSON is very large
- When the data contains numbers
= `Value` can hold anything, at the price of checking kinds by hand. Known structures are better served by structs.
:::

:::exercise guided A round trip
Define a struct `Recipe` with a `name`, a number of `servings`, a list of `ingredients` (strings), and an optional `note`. Create one, convert it to pretty JSON, print it, read it back, and check that the result equals the original.
::hint
Derive `Debug, PartialEq, Serialize, Deserialize`. Use `serde_json::to_string_pretty` and `serde_json::from_str`. The return type of `main` can be `Result<(), serde_json::Error>`.
::solution
```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Serialize, Deserialize)]
struct Recipe {
    name: String,
    servings: u8,
    ingredients: Vec<String>,
    note: Option<String>,
}

fn main() -> Result<(), serde_json::Error> {
    let recipe = Recipe {
        name: String::from("Lentil stew"),
        servings: 4,
        ingredients: vec![String::from("lentils"), String::from("onion"), String::from("berbere")],
        note: None,
    };

    let json = serde_json::to_string_pretty(&recipe)?;
    println!("{json}");

    let back: Recipe = serde_json::from_str(&json)?;
    println!("{}", back == recipe);
    Ok(())
}
```
```output
{
  "name": "Lentil stew",
  "servings": 4,
  "ingredients": [
    "lentils",
    "onion",
    "berbere"
  ],
  "note": null
}
true
```

A round-trip test like this (`from_str(to_string(x)) == x`) is the basic check for any type you serialise. It is also a natural property test: generate random recipes and assert the same equality. The `None` appears as `null`. With `#[serde(skip_serializing_if = "Option::is_none")]` on the field, it would be left out, and reading would still work, because a missing `Option` field is read as `None`.
:::

:::exercise practice Settings with defaults
Define a `Settings` struct for a game: `player_name: String` (required), `volume: u8` (default 80), `fullscreen: bool` (default false), and `keys: Keys` with `jump` and `fire` (both strings, with the defaults `"space"` and `"ctrl"`, and the whole `[keys]` section may be missing). Read it from TOML, and show that a file with only `player_name = "Sara"` works.
::hint
`#[serde(default = "function_name")]` for `volume`. For the whole `keys` field, `#[serde(default)]` needs `Keys` to implement `Default`: write that `impl` by hand so that it returns the two key names. Put `#[serde(default)]` on the struct `Keys` as well, so that a section with only one of the two keys is accepted.
::solution
```rust ext run
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Settings {
    player_name: String,
    #[serde(default = "default_volume")]
    volume: u8,
    #[serde(default)]
    fullscreen: bool,
    #[serde(default)]
    keys: Keys,
}

#[derive(Debug, Deserialize)]
#[serde(default)]
struct Keys {
    jump: String,
    fire: String,
}

impl Default for Keys {
    fn default() -> Self {
        Keys { jump: String::from("space"), fire: String::from("ctrl") }
    }
}

fn default_volume() -> u8 {
    80
}

fn main() -> Result<(), toml::de::Error> {
    let minimal: Settings = toml::from_str(r#"player_name = "Sara""#)?;
    println!("{:?}", minimal);

    let custom: Settings = toml::from_str(
        r#"
        player_name = "Tomas"
        volume = 30
        fullscreen = true

        [keys]
        jump = "w"
        "#,
    )?;
    println!("{} {} {} {} {}", custom.player_name, custom.volume, custom.fullscreen, custom.keys.jump, custom.keys.fire);

    println!("{}", toml::from_str::<Settings>("volume = 10").is_err());
    Ok(())
}
```
```output
Settings { player_name: "Sara", volume: 80, fullscreen: false, keys: Keys { jump: "space", fire: "ctrl" } }
Tomas 30 true w ctrl
true
```

Three levels of defaults work together. A field with `default = "…"` calls a function. A field with plain `default` uses the type's `Default`. And `#[serde(default)]` on a whole struct fills every missing field from the struct's `Default`, which is why `fire` is `"ctrl"` when only `jump` is given. The required field stays required: a file without `player_name` is an error.
:::

:::exercise practice Messages of several kinds
A chat protocol sends JSON messages of three kinds: `{"kind": "text", "from": "sara", "body": "hi"}`, `{"kind": "join", "user": "tomas"}`, and `{"kind": "ping"}`. Model them as one enum, deserialise a list containing one of each, and print a line for each with a `match`.
::hint
Use `#[serde(tag = "kind", rename_all = "lowercase")]`. The variants are `Text { from: String, body: String }`, `Join { user: String }` and `Ping`.
::solution
```rust ext run
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Message {
    Text { from: String, body: String },
    Join { user: String },
    Ping,
}

fn main() -> Result<(), serde_json::Error> {
    let input = r#"[
        {"kind": "text", "from": "sara", "body": "hi"},
        {"kind": "join", "user": "tomas"},
        {"kind": "ping"}
    ]"#;

    let messages: Vec<Message> = serde_json::from_str(input)?;
    for message in &messages {
        match message {
            Message::Text { from, body } => println!("{from} says: {body}"),
            Message::Join { user } => println!("{user} joined"),
            Message::Ping => println!("ping"),
        }
    }

    let unknown = serde_json::from_str::<Message>(r#"{"kind": "dance"}"#);
    println!("{}", unknown.is_err());
    println!("{}", serde_json::to_string(&Message::Join { user: String::from("lena") })?);
    Ok(())
}
```
```output
sara says: hi
tomas joined
ping
true
{"kind":"join","user":"lena"}
```

The enum is the protocol's specification in code. An unknown kind is rejected at the border, and the `match` must handle every kind that exists. When a fourth message kind is added to the enum, the compiler leads you to every place that needs to deal with it. This is how the chat server of [chapter 59](#project-chat) would look with a JSON protocol.
:::

:::exercise challenge Save the to-do list as JSON
In [chapter 23](#errors) you saved the to-do list in a home-made text format that broke on special characters. Replace it with JSON. A `TodoFile` has a `version` number and a list of tasks. A `Task` has an `id`, a `title`, a `done` flag, a `priority` (`low`, `normal` or `high`) and a list of `tags`. Files written by an older version, without `done`, `priority` and `tags`, must still load. Write `save` and `load` with helpful error messages, using `anyhow`.
::hint
Use `#[serde(default)]` on the three newer fields. `Priority` needs `Default`: derive it and mark the `Normal` variant with `#[default]`. Use `#[serde(rename_all = "lowercase")]` on the enum. In `save` and `load`, add context to errors with `.with_context(|| format!(…))`. Print an error with `{error:#}` to see the whole chain in one line.
::solution
```rust ext run
use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Priority {
    Low,
    #[default]
    Normal,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Task {
    id: u32,
    title: String,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    priority: Priority,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct TodoFile {
    version: u32,
    tasks: Vec<Task>,
}

fn save(path: &Path, list: &TodoFile) -> Result<()> {
    let text = serde_json::to_string_pretty(list).context("could not convert the list to JSON")?;
    fs::write(path, text).with_context(|| format!("could not write {}", path.display()))
}

fn load(path: &Path) -> Result<TodoFile> {
    let text = fs::read_to_string(path).with_context(|| format!("could not read {}", path.display()))?;
    serde_json::from_str(&text).with_context(|| format!("{} is not a valid to-do file", path.display()))
}

fn main() -> Result<()> {
    let path = Path::new("todo_demo.json");

    let list = TodoFile {
        version: 1,
        tasks: vec![
            Task { id: 1, title: String::from("buy milk"), done: true, priority: Priority::Low, tags: vec![] },
            Task {
                id: 2,
                title: String::from("learn serde"),
                done: false,
                priority: Priority::High,
                tags: vec![String::from("rust")],
            },
        ],
    };

    save(path, &list)?;
    println!("{}", fs::read_to_string(path)?);

    let loaded = load(path)?;
    println!("same as before: {}", loaded == list);

    // An older file without the newer fields still loads
    fs::write(path, r#"{ "version": 1, "tasks": [ { "id": 7, "title": "old task" } ] }"#)?;
    println!("{:?}", load(path)?.tasks[0]);

    // A broken file gives a helpful error
    fs::write(path, r#"{ "version": 1, "tasks": [ { "id": "seven", "title": "x" } ] }"#)?;
    if let Err(error) = load(path) {
        println!("error: {error:#}");
    }

    fs::remove_file(path)?;
    Ok(())
}
```
```output
{
  "version": 1,
  "tasks": [
    {
      "id": 1,
      "title": "buy milk",
      "done": true,
      "priority": "low"
    },
    {
      "id": 2,
      "title": "learn serde",
      "done": false,
      "priority": "high",
      "tags": [
        "rust"
      ]
    }
  ]
}
same as before: true
Task { id: 7, title: "old task", done: false, priority: Normal, tags: [] }
error: todo_demo.json is not a valid to-do file: invalid type: string "seven", expected u32 at line 1 column 42
```

Compared with the hand-written format, there is no parsing code at all, and titles may contain any character, including quotes and line breaks. Three design points:

- **Growing the format.** The fields added later have `#[serde(default)]`, so the old file with only `id` and `title` loads, and the missing values are filled in. The `version` field is there for the day when a change cannot be handled by defaults.
- **Tidy output.** `skip_serializing_if = "Vec::is_empty"` keeps empty tag lists out of the file.
- **Errors with context.** Serde says what is wrong and where in the text. `with_context` adds which file it was. `{error:#}` prints the chain: the file, then the cause.

`#[default]` on an enum variant, together with `#[derive(Default)]`, chooses the default variant.
:::
