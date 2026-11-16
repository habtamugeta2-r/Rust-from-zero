@id web
@part p10
@title Web servers with Axum
@short Web servers with Axum
@level intermediate
@time 80
@learn Explain requests, responses, methods and status codes | Write a web server with routes and handlers in Axum | Read paths, query strings, headers, JSON and real-time streams with extractors | Share state, load layered configuration and protect secrets | Add authentication, authorisation, security headers and rate limits | Choose between REST, gRPC and GraphQL, and compare Axum with Actix Web and Rocket

A **web server** receives requests and sends responses, often while handling many clients over time. Frameworks such as Axum provide routing and request extraction on top of HTTP libraries and operating-system I/O. Rust's type system can prevent some memory errors, but availability, correctness and security still depend on application design, configuration and testing.

:::analogy A restaurant
A guest (the client) hands an order slip (the request) to the waiter. The slip says what is wanted and for which table. The waiter (the router) looks at it and gives it to the right cook (a handler). The cook prepares a dish (the response), and the waiter brings it back. House rules apply to every order whoever cooks: orders are written in the book, and no order may take longer than twenty minutes (middleware). The pantry is shared by all cooks (state).
:::

## How the web works

The [concurrency ecosystem chapter](#async-ecosystem) introduced HTTP from the client's side, and the preceding chapters in Part 12 traced TCP, sockets, DNS, and TLS down to kernel buffers. A web framework handles the server end cleanly.

A **URL** names what the client wants:

```text
https://shop.example.com:8443/products/42?colour=red&size=m
─────   ──────────────── ──── ──────────── ─────────────────
scheme  host             port path         query string
```

The **host** and **port** lead to the server. The **path** and the **query string** are for the server to interpret.

A **request**, as it travels over the connection, is text:

```text
POST /notes HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Content-Length: 28

{"text": "water the plants"}
```

The first line holds the **method** and the path. Then come the **headers**, one per line. After an empty line follows the **body**. The **response** has the same shape, with a **status code** in its first line:

```text
HTTP/1.1 201 Created
content-type: application/json
content-length: 36

{"id":1,"text":"water the plants"}
```

### Methods

| Method | Meaning | Typical body use |
|---|---|---|
| `GET` | retrieve a representation; defined as a safe method | usually absent |
| `POST` | submit data for the resource to process | often present (optional for simple actions) |
| `PUT` | create or replace the target resource's representation | often present |
| `PATCH` | apply a partial change to the target resource | often present |
| `DELETE` | remove the target resource | usually absent |

These are common HTTP **conventions**, not rules that forbid a body or require one. A server still has to implement each method's contract correctly (such as keeping `GET` safe), and many proxies, caches, and client libraries ignore or reject bodies on `GET` and `DELETE`, so REST APIs normally do not rely on them.

### Status codes

| Group | Meaning | Common codes |
|---|---|---|
| 2xx | success | 200 OK, 201 Created, 204 No Content |
| 3xx | look elsewhere | 301 and 308 moved for good, 302 and 307 moved for now, 304 not modified |
| 4xx | the client made a mistake | 400 Bad Request, 401 Unauthorized (not logged in), 403 Forbidden (not allowed), 404 Not Found, 405 Method Not Allowed, 409 Conflict, 422 Unprocessable Entity, 429 Too Many Requests |
| 5xx | the server failed | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable |

### APIs and REST

A server for people sends HTML pages. A server for programs sends data, usually JSON. Its set of URLs and methods is called an **API**, and one URL with one method is an **endpoint**. Most APIs follow a convention named **REST**: a URL names a thing (a *resource*), and the method says what to do with it.

| Request | Meaning | Success status |
|---|---|---|
| `GET /notes` | list all notes | 200 |
| `POST /notes` | create a note | 201 |
| `GET /notes/7` | read note 7 | 200 |
| `PUT /notes/7` | replace note 7 | 200 |
| `DELETE /notes/7` | delete note 7 | 204 |

You will build exactly this API later in the chapter.

## A first server

A **web framework** is a library that does the common work of a server: it reads requests, finds the right function, and writes responses. This chapter uses **Axum**, the framework made by the Tokio team. It is the most widely used one today, it has little magic, and it is built on **Tokio** for the async runtime and **tower** for the layer stack around each service, both from [chapter 65](#async-ecosystem). The third ingredient is **Serde**, which turns structs into JSON and back; it gets a full chapter of its own later ([chapter 45](#serde)), so here is the part this chapter needs:

:::plain Serde in one box
`#[derive(Serialize)]` on a struct generates code that writes it into a data format, and `#[derive(Deserialize)]` generates the code that reads it back. A format crate such as `serde_json` supplies the actual bytes. Field names become JSON keys, `Option<T>` becomes `null` for `None`, and `#[serde(rename_all = "snake_case")]` rewrites the keys in bulk. In Axum, a handler returning `Json<T>` needs `T: Serialize`; a handler taking `Json<T>` as an argument needs `T: Deserialize`. That is the entire integration.
:::

```toml
[dependencies]
axum = "0.8.9"
tokio = { version = "1.54.1", features = ["full"] }
serde = { version = "1.0.229", features = ["derive"] }
serde_json = "1.0.154"
```

```rust ext check file=src/main.rs
use axum::{routing::get, Router};

async fn home() -> &'static str {
    "Hello from Axum!"
}

async fn about() -> &'static str {
    "This server is written in Rust."
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(home)).route("/about", get(about));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
    println!("listening on http://{}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
```

Start it with `cargo run`, and open `http://127.0.0.1:3000/` in a browser. Or use `curl`, a command-line HTTP client that is installed on most systems. With `-i` it shows the status line and the headers too:

```text
$ curl -i http://127.0.0.1:3000/
HTTP/1.1 200 OK
content-type: text/plain; charset=utf-8
content-length: 16
date: Sat, 14 Nov 2026 15:23:40 GMT

Hello from Axum!

$ curl http://127.0.0.1:3000/about
This server is written in Rust.

$ curl -i http://127.0.0.1:3000/nope
HTTP/1.1 404 Not Found
content-length: 0
```

Stop the server with {{Ctrl}}+{{C}}. The parts:

- A **handler** is an async function that produces a response. Here it returns a text.
- A **`Router`** maps paths and methods to handlers. `.route("/about", get(about))` means: for `GET /about`, call `about`. This mapping is a **route**.
- `TcpListener::bind("127.0.0.1:3000")` opens port 3000. The address `127.0.0.1` is reachable only from your own computer. A server that should be reachable from other machines binds to `0.0.0.0`.
- `axum::serve` accepts connections for ever. Each one is handled by its own Tokio task, so thousands of clients can be served at the same time.
- For paths without a route, Axum answers 404 by itself.

### Trying the examples on this page

A server that runs for ever cannot show its output here. So the examples in this chapter do not open a port. They build the router and then hand requests straight to it with a small helper function, `send`, which prints each request and its response:

```rust
/// Hands one request straight to the router, as a client would send it, and prints the response.
async fn send(app: &Router, method: &str, path: &str, body: &str) {
    use tower::ServiceExt;

    let request = axum::http::Request::builder()
        .method(method)
        .uri(path)
        .header("content-type", "application/json")
        .body(axum::body::Body::from(body.to_string()))
        .unwrap();

    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    println!("{method} {path} -> {status}  {}", String::from_utf8_lossy(&bytes));
}
```

A `Router` is a tower `Service`, and `oneshot` calls a service with one request. There is no network involved: the request is a value, and so is the response. The helper is part of every example below and is not printed again. The same technique is how Axum servers are tested, and [chapter 74](#project-api) uses it for that.

## Extractors: what a handler needs

A handler says what it needs from the request through the types of its parameters. Such a parameter type is an **extractor**. Axum takes the request apart, converts the pieces, and calls your function only if everything fits.

```rust ext run
use std::collections::HashMap;

use axum::extract::{Path, Query};
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

// A piece of the path
async fn greet(Path(name): Path<String>) -> String {
    format!("Hello, {name}!")
}

// Several pieces, with types
async fn add(Path((a, b)): Path<(i32, i32)>) -> String {
    format!("{a} + {b} = {}", a + b)
}

// The query string: ?page=2&per_page=10
#[derive(Debug, Deserialize)]
struct Paging {
    #[serde(default = "first_page")]
    page: u32,
    per_page: Option<u32>,
}

fn first_page() -> u32 {
    1
}

async fn list(Query(paging): Query<Paging>) -> String {
    format!("page {} with {} items", paging.page, paging.per_page.unwrap_or(20))
}

// Any query parameters, as a map
async fn search(Query(params): Query<HashMap<String, String>>) -> String {
    format!("searching for {:?}", params.get("q"))
}

// Headers
async fn agent(headers: HeaderMap) -> String {
    let agent = headers.get("user-agent").and_then(|value| value.to_str().ok()).unwrap_or("unknown");
    format!("you are using {agent}")
}

// A JSON body
#[derive(Debug, Deserialize)]
struct NewUser {
    name: String,
    age: u8,
}

async fn create_user(Json(user): Json<NewUser>) -> String {
    format!("created {} ({})", user.name, user.age)
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/greet/{name}", get(greet))
        .route("/add/{a}/{b}", get(add))
        .route("/items", get(list))
        .route("/search", get(search))
        .route("/agent", get(agent))
        .route("/users", post(create_user));

    send(&app, "GET", "/greet/Sara", "").await;
    send(&app, "GET", "/add/2/40", "").await;
    send(&app, "GET", "/add/2/many", "").await;
    send(&app, "GET", "/items?page=3&per_page=10", "").await;
    send(&app, "GET", "/items", "").await;
    send(&app, "GET", "/search?q=rust", "").await;
    send(&app, "GET", "/agent", "").await;
    send(&app, "POST", "/users", r#"{"name": "Lena", "age": 31}"#).await;
    send(&app, "POST", "/users", r#"{"name": "Lena"}"#).await;
    send(&app, "POST", "/users", "not json").await;
    send(&app, "GET", "/nothing-here", "").await;
    send(&app, "DELETE", "/users", "").await;
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
GET /greet/Sara -> 200 OK  Hello, Sara!
GET /add/2/40 -> 200 OK  2 + 40 = 42
GET /add/2/many -> 400 Bad Request  Invalid URL: Cannot parse value at index 1 with value `many` to a `i32`
GET /items?page=3&per_page=10 -> 200 OK  page 3 with 10 items
GET /items -> 200 OK  page 1 with 20 items
GET /search?q=rust -> 200 OK  searching for Some("rust")
GET /agent -> 200 OK  you are using unknown
POST /users -> 200 OK  created Lena (31)
POST /users -> 422 Unprocessable Entity  Failed to deserialize the JSON body into the target type: missing field `age` at line 1 column 16
POST /users -> 400 Bad Request  Failed to parse the request body as JSON: expected ident at line 1 column 2
GET /nothing-here -> 404 Not Found  
DELETE /users -> 405 Method Not Allowed  
```

Look at what you did **not** write. No code checks whether `many` is a number, whether the JSON has an `age`, or whether the method is allowed. The types say what is required, and Axum answers bad requests with the right status code before your handler runs. Inside the handler, the data is valid and typed. This is the idea you met with Serde and clap, applied to HTTP.

| Extractor | Gives you |
|---|---|
| `Path<T>` | the `{…}` pieces of the path, as one value or a tuple or a struct |
| `Query<T>` | the query string, deserialised into a struct or a map |
| `Json<T>` | the body, deserialised from JSON |
| `Form<T>` | the body of a submitted HTML form |
| `HeaderMap` | all the headers |
| `State<T>` | the shared state of the application (below) |
| `String`, `Bytes` | the raw body |
| `Request` | the whole request |
| `Option<Query<T>>`, `Result<Json<T>, JsonRejection>` | the same, but you decide what a failure means |

`Path(name): Path<String>` is a pattern in the parameter list: it takes the value out of the wrapper on the spot, as you learned in [chapter 19](#patterns).

:::warn Two rules for handlers
- An extractor that reads the **body** (`Json`, `Form`, `String`, `Bytes`, `Request`) must be the **last** parameter, since the body can be read only once.
- If a function does not fit Axum's rules, the compiler's message is long and vague ("the trait `Handler` is not implemented"). Put `#[axum::debug_handler]` above the function (feature `macros`), and the message names the real problem.
:::

:::note Older tutorials
Up to Axum 0.7, path parameters were written with a colon: `/greet/:name`. Since 0.8 they are written `/greet/{name}`. If an example from the web panics at start-up with a message about path segments, this is why.
:::

## Responses

A handler may return any type that implements the trait **`IntoResponse`**. Many types do:

```rust ext run
use axum::extract::Path;
use axum::http::{header, StatusCode};
use axum::response::{Html, IntoResponse, Redirect};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

#[derive(Serialize)]
struct Status {
    service: &'static str,
    healthy: bool,
}

async fn text() -> &'static str {
    "plain text"
}

async fn page() -> Html<&'static str> {
    Html("<h1>Hello</h1>")
}

async fn json() -> Json<Status> {
    Json(Status { service: "demo", healthy: true })
}

async fn created() -> (StatusCode, Json<Status>) {
    (StatusCode::CREATED, Json(Status { service: "new", healthy: true }))
}

async fn nothing() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn with_header() -> impl IntoResponse {
    ([(header::CACHE_CONTROL, "max-age=60")], "cached for a minute")
}

async fn old_address() -> Redirect {
    Redirect::permanent("/text")
}

async fn even(Path(n): Path<u32>) -> Result<String, (StatusCode, String)> {
    if n % 2 == 0 { Ok(format!("{n} is even")) } else { Err((StatusCode::BAD_REQUEST, format!("{n} is odd"))) }
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/text", get(text))
        .route("/page", get(page))
        .route("/json", get(json))
        .route("/created", get(created))
        .route("/nothing", get(nothing))
        .route("/cached", get(with_header))
        .route("/old", get(old_address))
        .route("/even/{n}", get(even));

    for path in ["/text", "/page", "/json", "/created", "/nothing", "/cached", "/old", "/even/4", "/even/5"] {
        send(&app, "GET", path, "").await;
    }
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
GET /text -> 200 OK  plain text
GET /page -> 200 OK  <h1>Hello</h1>
GET /json -> 200 OK  {"service":"demo","healthy":true}
GET /created -> 201 Created  {"service":"new","healthy":true}
GET /nothing -> 204 No Content  
GET /cached -> 200 OK  cached for a minute
GET /old -> 308 Permanent Redirect  
GET /even/4 -> 200 OK  4 is even
GET /even/5 -> 400 Bad Request  5 is odd
```

| Return type | Response |
|---|---|
| `&'static str`, `String` | status 200, plain text |
| `Html<T>` | status 200, an HTML page |
| `Json<T>` | status 200, `T` serialised as JSON |
| `StatusCode` | that status, empty body |
| `(StatusCode, T)` | `T`'s response with another status |
| `(headers, T)`, `(StatusCode, headers, T)` | with extra headers |
| `Redirect` | sends the client to another URL |
| `Result<T, E>` | `T`'s response or `E`'s response. Both must implement `IntoResponse` |
| `impl IntoResponse` | "some response type", when the name would be long |

## Shared state, and an API for notes

Handlers are separate functions, and many of them run at the same moment. Whatever they share (a database connection, a cache, the configuration) is put into a **state** value. The router owns it and hands a clone to each handler that asks with the extractor `State<T>`.

This example is a complete API for notes, kept in memory:

```rust ext run
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize)]
struct Note {
    id: u32,
    text: String,
}

#[derive(Debug, Deserialize)]
struct NoteInput {
    text: String,
}

/// Everything the handlers share. Cloning it only copies the `Arc`.
#[derive(Clone, Default)]
struct AppState {
    store: Arc<Mutex<Store>>,
}

#[derive(Default)]
struct Store {
    notes: BTreeMap<u32, Note>,
    next_id: u32,
}

/// All the ways a request can fail, and how each one is shown to the client.
enum ApiError {
    NotFound(u32),
    EmptyText,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::NotFound(id) => (StatusCode::NOT_FOUND, format!("there is no note {id}")),
            ApiError::EmptyText => (StatusCode::UNPROCESSABLE_ENTITY, String::from("the text must not be empty")),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

async fn list_notes(State(state): State<AppState>) -> Json<Vec<Note>> {
    let store = state.store.lock().unwrap();
    Json(store.notes.values().cloned().collect())
}

async fn create_note(State(state): State<AppState>, Json(input): Json<NoteInput>) -> Result<(StatusCode, Json<Note>), ApiError> {
    let text = input.text.trim();
    if text.is_empty() {
        return Err(ApiError::EmptyText);
    }
    let mut store = state.store.lock().unwrap();
    store.next_id += 1;
    let note = Note { id: store.next_id, text: text.to_string() };
    store.notes.insert(note.id, note.clone());
    Ok((StatusCode::CREATED, Json(note)))
}

async fn get_note(State(state): State<AppState>, Path(id): Path<u32>) -> Result<Json<Note>, ApiError> {
    let store = state.store.lock().unwrap();
    store.notes.get(&id).cloned().map(Json).ok_or(ApiError::NotFound(id))
}

async fn update_note(
    State(state): State<AppState>,
    Path(id): Path<u32>,
    Json(input): Json<NoteInput>,
) -> Result<Json<Note>, ApiError> {
    let text = input.text.trim();
    if text.is_empty() {
        return Err(ApiError::EmptyText);
    }
    let mut store = state.store.lock().unwrap();
    let note = store.notes.get_mut(&id).ok_or(ApiError::NotFound(id))?;
    note.text = text.to_string();
    Ok(Json(note.clone()))
}

async fn delete_note(State(state): State<AppState>, Path(id): Path<u32>) -> Result<StatusCode, ApiError> {
    let mut store = state.store.lock().unwrap();
    store.notes.remove(&id).map(|_| StatusCode::NO_CONTENT).ok_or(ApiError::NotFound(id))
}

fn app() -> Router {
    Router::new()
        .route("/notes", get(list_notes).post(create_note))
        .route("/notes/{id}", get(get_note).put(update_note).delete(delete_note))
        .with_state(AppState::default())
}

#[tokio::main]
async fn main() {
    let app = app();

    send(&app, "POST", "/notes", r#"{"text": "water the plants"}"#).await;
    send(&app, "POST", "/notes", r#"{"text": "  call Sara  "}"#).await;
    send(&app, "POST", "/notes", r#"{"text": "   "}"#).await;
    send(&app, "GET", "/notes", "").await;
    send(&app, "PUT", "/notes/2", r#"{"text": "call Sara at five"}"#).await;
    send(&app, "DELETE", "/notes/1", "").await;
    send(&app, "GET", "/notes/1", "").await;
    send(&app, "GET", "/notes", "").await;
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
POST /notes -> 201 Created  {"id":1,"text":"water the plants"}
POST /notes -> 201 Created  {"id":2,"text":"call Sara"}
POST /notes -> 422 Unprocessable Entity  {"error":"the text must not be empty"}
GET /notes -> 200 OK  [{"id":1,"text":"water the plants"},{"id":2,"text":"call Sara"}]
PUT /notes/2 -> 200 OK  {"id":2,"text":"call Sara at five"}
DELETE /notes/1 -> 204 No Content  
GET /notes/1 -> 404 Not Found  {"error":"there is no note 1"}
GET /notes -> 200 OK  [{"id":2,"text":"call Sara at five"}]
```

What to take from this program:

- **Routes.** `get(list_notes).post(create_note)` puts two methods on one path. The five handlers are the five rows of the REST table above.
- **State.** `.with_state(AppState::default())` gives the state to the router. `AppState` is `Clone` and holds an `Arc<Mutex<Store>>`, the sharing tool from [chapter 61](#shared-state). In the next chapters, a database pool takes the place of the `Mutex`.
- **Separate input and output types.** `NoteInput` is what a client may send. `Note` is what the server stores and returns. The client cannot choose an id, because `NoteInput` has no such field.
- **One error type.** `ApiError` lists what can go wrong, and its `IntoResponse` implementation is the one place that decides status codes and messages. Handlers return `Result<…, ApiError>` and use `?` and `ok_or` as in any Rust code. Errors are JSON, like everything else in the API.
- **A function `app()`** that builds the router, apart from `main`. Tests can call it too.

:::warn Do not hold a lock across an `.await`
A `std::sync::Mutex` guard must be released before the handler awaits anything. A guard that is still alive at an `.await` makes the handler's future not `Send`, and the compiler rejects the route. In the handlers above, the lock is taken and released without any `.await` in between. If you must keep a lock while awaiting, use `tokio::sync::Mutex`.
:::

## Middleware and limits

Because a `Router` is a tower service, the layers from [the async ecosystem chapter](#async-ecosystem) can be put around it. Axum adds a simple way to write your own: `middleware::from_fn` turns an async function into a layer.

```rust ext run
use std::time::Duration;

use axum::extract::{DefaultBodyLimit, Request};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use tower_http::timeout::TimeoutLayer;

/// Middleware written as an async function: lets a request pass only with the right key.
async fn require_key(headers: HeaderMap, request: Request, next: Next) -> Result<Response, StatusCode> {
    match headers.get("x-api-key").and_then(|value| value.to_str().ok()) {
        Some("secret-123") => Ok(next.run(request).await),
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

async fn slow() -> &'static str {
    tokio::time::sleep(Duration::from_secs(5)).await;
    "done at last"
}

async fn upload(body: String) -> String {
    format!("received {} bytes", body.len())
}

fn app() -> Router {
    // Routes that need a key
    let admin = Router::new().route("/stats", get(|| async { "42 users" })).route_layer(middleware::from_fn(require_key));

    // Routes for everyone
    let public = Router::new().route("/", get(|| async { "welcome" })).route("/slow", get(slow)).route("/upload", post(upload));

    Router::new()
        .merge(public)
        .nest("/admin", admin)
        .fallback(|| async { (StatusCode::NOT_FOUND, "no such page") })
        .layer(DefaultBodyLimit::max(1024))
        .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_millis(200)))
}

#[tokio::main]
async fn main() {
    let app = app();
    send(&app, "GET", "/", "").await;
    send(&app, "GET", "/admin/stats", "").await;
    send(&app, "GET", "/slow", "").await;
    send(&app, "POST", "/upload", "a short text").await;
    send(&app, "POST", "/upload", &"x".repeat(5000)).await;
    send(&app, "GET", "/missing", "").await;

    // The same request to /admin/stats, this time with the key
    use tower::ServiceExt;
    let request = Request::builder().uri("/admin/stats").header("x-api-key", "secret-123").body(axum::body::Body::empty()).unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    println!("with key -> {}", response.status());
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
GET / -> 200 OK  welcome
GET /admin/stats -> 401 Unauthorized  
GET /slow -> 408 Request Timeout  
POST /upload -> 200 OK  received 12 bytes
POST /upload -> 413 Payload Too Large  Failed to buffer the request body: length limit exceeded
GET /missing -> 404 Not Found  no such page
with key -> 200 OK
```

- A `from_fn` middleware takes extractors, then the `Request`, then `Next`. Calling `next.run(request).await` passes the request inwards and returns the response. Not calling it stops the request right there.
- `.route_layer(…)` applies a layer to the routes of that router only. `.layer(…)` applies it to everything added before the call, including the fallback.
- `.nest("/admin", admin)` mounts a router under a path prefix, and `.merge(public)` combines two routers. Large applications build one router per area and join them.
- `.fallback(…)` is the handler for requests that match no route.

### Limits every public server needs

A server on the internet receives requests that are slow, huge, or far too many, by accident or on purpose. Without limits, a single client can use up its memory or its connections. The chat server of [chapter 64](#project-chat) left this open. Here are the tools:

| Risk | Limit | Tool |
|---|---|---|
| A handler or a client that never finishes | a time limit per request | `tower_http::timeout::TimeoutLayer` |
| A giant request body | a size limit. Axum's default is 2 MB | `DefaultBodyLimit::max(n)` |
| Too many requests at once | a concurrency limit, and refusing when full | `tower::limit::ConcurrencyLimitLayer`, `tower::load_shed` |
| One client sending too many requests | a rate limit per client | the crate `tower_governor` |
| Stopping in the middle of requests | graceful shutdown | `axum::serve(…).with_graceful_shutdown(…)` |

The crate `tower-http` holds the layers that most servers use:

| Layer | Purpose |
|---|---|
| `TraceLayer` | log every request and response |
| `TimeoutLayer` | time limit |
| `CompressionLayer` | compress response bodies |
| `CorsLayer` | allow web pages from other sites to call the API |
| `RequestBodyLimitLayer` | size limit for bodies |
| `SetRequestIdLayer`, `PropagateRequestIdLayer` | give each request an id that appears in all its log lines |
| `ServeDir`, `ServeFile` | serve files from a folder |

### A `main` for real use

The following `main` adds logging, a time limit, compression, permissive CORS headers, a port taken from the environment, and graceful shutdown:

```toml
[dependencies]
tower = "0.5.3"
tower-http = { version = "0.7.1", features = ["trace", "timeout", "compression-gzip", "cors"] }
tracing = "0.1.44"
tracing-subscriber = "0.3.23"
```

```rust ext check file=src/main.rs
use std::time::Duration;

use axum::http::StatusCode;
use axum::routing::get;
use axum::Router;
use tower::ServiceBuilder;
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer};
use tracing::Level;

/// Completes when the user presses Ctrl+C.
async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.expect("could not listen for Ctrl+C");
    tracing::info!("stopping: no new connections, finishing the running requests");
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_target(false).init();

    let app = Router::new().route("/", get(|| async { "ok" })).layer(
        ServiceBuilder::new()
            // Log every request and its response
            .layer(
                TraceLayer::new_for_http()
                    .make_span_with(DefaultMakeSpan::new().level(Level::INFO))
                    .on_response(DefaultOnResponse::new().level(Level::INFO)),
            )
            // Give up on requests that take longer than 10 seconds
            .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_secs(10)))
            // Compress response bodies for clients that accept it
            .layer(CompressionLayer::new())
            // Let web pages from other sites call this API
            .layer(CorsLayer::permissive()),
    );

    // The port comes from the environment, with a default
    let port: u16 = std::env::var("PORT").ok().and_then(|port| port.parse().ok()).unwrap_or(3000);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("listening on {}", listener.local_addr()?);

    axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await?;
    tracing::info!("stopped");
    Ok(())
}
```

Run with `PORT=3005`, called twice with `curl`, and stopped with {{Ctrl}}+{{C}}, it logs:

```text
2026-11-14T15:26:42.577101Z  INFO listening on 0.0.0.0:3005
2026-11-14T15:26:44.083819Z  INFO request{method=GET uri=/ version=HTTP/1.1}: finished processing request latency=0 ms status=200
2026-11-14T15:26:44.091815Z  INFO request{method=GET uri=/missing version=HTTP/1.1}: finished processing request latency=0 ms status=404
2026-11-14T15:26:44.109135Z  INFO stopping: no new connections, finishing the running requests
2026-11-14T15:26:44.109277Z  INFO stopped
```

`CorsLayer::permissive()` allows every web site to call the API. That is convenient while developing. For a real service, list the sites you trust with `CorsLayer::new().allow_origin(…)`.

## HTML pages and forms

Axum serves web pages for people just as well as JSON for programs. `Html` marks a response as a page, and `Form` reads what a browser sends when a form is submitted:

```rust ext run
use axum::response::Html;
use axum::routing::get;
use axum::{Form, Router};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct SignUp {
    name: String,
    email: String,
}

/// Replaces the characters that have a meaning in HTML.
fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

async fn show_form() -> Html<&'static str> {
    Html(
        r#"<form method="post" action="/signup">
  <input name="name" placeholder="Your name">
  <input name="email" placeholder="Your e-mail">
  <button>Sign up</button>
</form>"#,
    )
}

async fn sign_up(Form(input): Form<SignUp>) -> Html<String> {
    Html(format!("<p>Thank you, {}! We will write to {}.</p>", escape(&input.name), escape(&input.email)))
}

#[tokio::main]
async fn main() {
    use tower::ServiceExt;

    let app = Router::new().route("/signup", get(show_form).post(sign_up));

    // What a browser sends when the form is submitted
    let request = axum::http::Request::builder()
        .method("POST")
        .uri("/signup")
        .header("content-type", "application/x-www-form-urlencoded")
        .body(axum::body::Body::from("name=Sara+%3Cb%3E&email=sara%40example.com"))
        .unwrap();
    let response = app.oneshot(request).await.unwrap();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    println!("{}", String::from_utf8_lossy(&bytes));
}
```
```output
<p>Thank you, Sara &lt;b&gt;! We will write to sara@example.com.</p>
```

The visitor typed `Sara <b>` as the name. The function `escape` turned `<` into `&lt;`, so the browser shows the characters and does not treat them as HTML.

:::warn Never put user input into HTML unescaped
Text from a visitor that lands in a page as it is can contain `<script>` tags. The script then runs in the browser of everyone who sees the page. This attack is called **cross-site scripting** (XSS). Escape all such text, or better, use a template library that escapes by default.
:::

For real pages, use a **template engine**: `askama` (templates are checked at compile time), `minijinja`, `tera` or `maud`. Combined with **HTMX** (check the `HX-Request` header to return either an HTML fragment or a full layout), server-rendered Axum apps stay snappy without a separate JavaScript build step—just pair every cookie-authenticated `<form>` with a per-session CSRF token or `SameSite=Lax` cookie protection.

Files such as style sheets, images, and compiled single-page apps (React, Svelte, Vue) are served with `ServeDir` and `ServeFile` from `tower-http`, or baked right into the binary with `rust-embed`:

```rust
use tower_http::services::{ServeDir, ServeFile};

// Serve `/assets/*` from disk, and fall back to `index.html` for client-side SPA routes:
let spa = ServeDir::new("dist").fallback(ServeFile::new("dist/index.html"));

let app = Router::new()
    .route("/api/health", get(health))
    .nest_service("/static", ServeDir::new("static"))
    .fallback_service(spa);
```

## Live updates: WebSockets, server-sent events, and uploads

Everything so far is request and response: the client asks, the server answers, the connection is done. Some features need the server to speak first — a chat message arriving, a job finishing, a price changing. Three techniques do that, and they are not interchangeable.

| Technique | Direction | Latency | Reconnects by itself | Works through proxies | Cost |
|---|---|---|---|---|---|
| **Polling** — ask every *n* seconds | client asks | up to *n* seconds | yes, it is just requests | yes | one request per client per interval, most of them empty |
| **Server-sent events (SSE)** | server → client, one way | immediate | yes, the browser retries | yes, it is ordinary HTTP | one long-lived HTTP response per client |
| **WebSocket** | both ways | immediate | no, you write it | usually; needs proxy support | one upgraded connection per client, with its own lifecycle |

Start with polling. It is a `setInterval` and one route you already have. Move to SSE when the client only listens. Choose a WebSocket when both sides talk.

### WebSockets in Axum

Axum has WebSockets built in, behind the `ws` feature, with no extra crate. The pattern is two steps: a handler that receives a normal HTTP request and *upgrades* it, and a function that then owns the connection as a plain async task.

The types are `axum::extract::ws::{WebSocketUpgrade, WebSocket, Message}`. A handler takes `WebSocketUpgrade`, and returns `ws.on_upgrade(handle_socket)`. From that point `handle_socket(socket: WebSocket)` loops: `socket.recv().await` gives `Option<Result<Message, Error>>`, and you `match` on `Message::Text`, `Message::Binary`, `Message::Ping`, `Message::Pong` and `Message::Close`. Sending is `socket.send(Message::Text(…)).await`. A `None` from `recv` means the peer has gone, which is the end of the task:

```rust file=src/ws.rs
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;

async fn ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.recv().await {
        match msg {
            Message::Text(text) => {
                if socket.send(Message::Text(format!("echo: {text}").into())).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}
```

Notice `.into()` on `format!("echo: {text}")`: Axum 0.8 stores text frames in `Utf8Bytes`, converted cheaply from `String` or `&'static str`. The room server of [chapter 64](#project-chat) maps onto this with almost no changes: the `Arc<Mutex<Rooms>>` and the `broadcast::Sender<String>` become the application state, and each socket task subscribes to the broadcast channel and forwards what it receives.

Three practical rules:

- **Send a heartbeat.** A ping every thirty seconds keeps idle connections alive through load balancers, which cut connections they consider dead after a minute or two of silence.
- **Bound the input.** `Message::Text` has a maximum size, set on the upgrade, and you should also cap the length of a chat line.
- **Decide where the state lives.** In-memory rooms mean two server instances do not see each other's messages. Either keep one instance, use sticky sessions, or move the fan-out to Redis pub/sub or NATS ([chapter 65](#async-ecosystem)).

### Server-sent events

SSE is a long-lived HTTP response whose body is a stream of text lines: `data: …`, optionally `event: …` and `id: …`, separated by blank lines. The browser consumes it with a few lines of JavaScript and reconnects by itself:

```js
const feed = new EventSource("/events");
feed.addEventListener("tick", (e) => console.log(e.data));
```

In Axum the response type is `axum::response::sse::Sse`, wrapping a `Stream<Item = Result<Event, E>>`; `Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))` adds the comment lines that stop proxies closing an idle connection:

```rust ext run nocmp
use std::convert::Infallible;
use std::time::Duration;

use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::get;
use axum::Router;
use futures::stream::{self, Stream, StreamExt};
use tower::ServiceExt;

async fn events() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = stream::iter(1..=3).map(|n| Ok(Event::default().data(format!("tick {n}"))));
    Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/events", get(events));
    let req = axum::http::Request::builder().uri("/events").body(axum::body::Body::empty()).unwrap();
    let res = app.oneshot(req).await.unwrap();
    let bytes = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
    print!("{}", String::from_utf8_lossy(&bytes));
}
```
```output
data: tick 1

data: tick 2

data: tick 3
```

SSE is the right choice for notifications, progress bars, live logs and dashboards. It gives you HTTP status codes, cookies, compression and proxying for free, and the browser handles reconnection and resumes with a `Last-Event-ID` header. The cost is that it is one-way: to send something back, make a normal `POST`.

### Multipart uploads and streaming bodies

Two things come up as soon as files are involved. **Uploads** stream browser `<input type="file">` payloads chunk by chunk with `axum::extract::Multipart` (enable Axum's `"multipart"` feature) without buffering a whole file in RAM—enforce a maximum size per field and raise `DefaultBodyLimit` only on the upload route, and never trust the client's `Content-Type` or file name:

```rust file=src/upload.rs
use axum::extract::{DefaultBodyLimit, Multipart};
use axum::http::StatusCode;
use axum::routing::post;
use axum::Router;

async fn upload_file(mut multipart: Multipart) -> Result<String, StatusCode> {
    let mut total_bytes = 0_usize;
    while let Some(mut field) = multipart.next_field().await.map_err(|_| StatusCode::BAD_REQUEST)? {
        while let Some(chunk) = field.chunk().await.map_err(|_| StatusCode::BAD_REQUEST)? {
            total_bytes += chunk.len();
        }
    }
    Ok(format!("uploaded {total_bytes} bytes"))
}

fn upload_router() -> Router {
    Router::new()
        .route("/upload", post(upload_file))
        .layer(DefaultBodyLimit::max(10 * 1024 * 1024)) // 10 MB cap for uploads only
}
```

**Downloads and streams** build a `Body` from a stream (`Body::from_stream(…)`) or serve a `tokio_util::io::ReaderStream` over a file, so a 2 GB export is never held in memory. Both are ordinary handlers; the only rule is that a streamed body has no `Content-Length`, so the client must not expect one.

## Describing the API: OpenAPI

Once anything but you can call the API — a front-end team, a mobile app, a customer — the question "what does this endpoint take?" needs an answer that is not a conversation. **[[OpenAPI]]** is that answer: a machine-readable description of every route, parameter, body and response, from which documentation pages, client SDKs and tests are generated.

Writing the description by hand guarantees it drifts. Two crates generate it from the code you already have:

| Crate | Style | Notes |
|---|---|---|
| [`utoipa`](https://docs.rs/utoipa) | Derive macros on the handlers and the types (`#[utoipa::path]`, `#[derive(ToSchema)]`), assembled into one `#[derive(OpenApi)]` struct | Framework-agnostic, mature, and `utoipa-swagger-ui` serves a browsable `/docs` page from the same program |
| [`aide`](https://docs.rs/aide) | Generates the document from the Axum router itself | Less typing when the router is the source of truth; Axum-specific |

```rust file=src/openapi.rs
use axum::Json;
use serde::Serialize;
use utoipa::{OpenApi, ToSchema};

#[derive(Serialize, ToSchema)]
struct Health {
    status: &'static str,
}

#[utoipa::path(get, path = "/health", responses((status = 200, body = Health)))]
async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

#[derive(OpenApi)]
#[openapi(paths(health), components(schemas(Health)))]
struct ApiDoc;
```

Either way the rules are the same as for tests: annotate the type once, keep the annotations next to the handler, and treat a mismatch between the document and the behaviour as a bug. A `GET /openapi.json` route that serves the generated document makes it checkable in CI, and that is what client generators consume.


## Security basics

Security is a large subject. These are the points that no public web server may skip.

**Use HTTPS.** Without encryption, everyone on the path can read and change the traffic. The usual set-up puts a **reverse proxy** in front of your program, such as Caddy or nginx, or the load balancer of a cloud host. The proxy handles TLS and certificates and passes plain HTTP to your server on the same machine. To serve TLS from the Rust program itself, use the crate `axum-server` with `rustls`.

**Never store passwords.** Store a **hash**: a value computed from the password by a one-way function. A password hash function is slow on purpose, and mixes in a random value (a **salt**), so that guessing is expensive and equal passwords give different hashes. The current recommendation is **Argon2**:

```toml
[dependencies]
argon2 = "0.6.0"
```

```rust ext run
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::Argon2;

/// Turns a password into a hash that is safe to store.
fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    Ok(Argon2::default().hash_password(password.as_bytes())?.to_string())
}

/// Checks a password against a stored hash.
fn verify_password(password: &str, stored_hash: &str) -> bool {
    match PasswordHash::new(stored_hash) {
        Ok(parsed) => Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

fn main() -> Result<(), argon2::password_hash::Error> {
    let first = hash_password("correct horse battery staple")?;
    let second = hash_password("correct horse battery staple")?;

    println!("{}", &first[..31]);
    println!("same password, same hash: {}", first == second);
    println!("right password: {}", verify_password("correct horse battery staple", &first));
    println!("wrong password: {}", verify_password("password123", &first));
    Ok(())
}
```
```output
$argon2id$v=19$m=19456,t=2,p=1$
same password, same hash: false
right password: true
wrong password: false
```

The stored string contains the algorithm, its settings, the salt and the hash, so `verify_password` needs nothing else. Hashing takes some tens of milliseconds by design. In an async handler, run it inside `tokio::task::spawn_blocking`.

### Who is asking, and what may they do

Two words that are constantly confused, and the difference is the difference between a login page and a security hole:

- **Authentication** answers *who is this?* — the user proved an identity, usually with a password, a session, a token or a provider.
- **Authorisation** answers *what may they do?* — this identity is allowed to read these notes and not to delete that user.

Both happen **on the server, on every request, from data the server controls**. A hidden button, a greyed-out menu item or a check in JavaScript is a convenience for honest users, never a restriction: anyone can send the request by hand. Put token or session verification inside a custom **`FromRequestParts`** extractor so every protected handler receives a verified `AuthUser` automatically, and check role or ownership early, returning **`403 Forbidden`** when a known caller lacks permission (**`401 Unauthorized`** means *"I do not know who you are"*):

```rust file=src/auth.rs
use axum::extract::FromRequestParts;
use axum::http::StatusCode;
use axum::http::request::Parts;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Role {
    Member,
    Admin,
}

#[derive(Debug, Clone)]
struct AuthUser {
    user_id: i64,
    role: Role,
}

impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;

        // In production: decode and verify JWT or look up hashed token / session
        if header == "demo-member-token" {
            Ok(AuthUser { user_id: 7, role: Role::Member })
        } else {
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

async fn delete_note_handler(auth: AuthUser, note_owner_id: i64) -> Result<StatusCode, StatusCode> {
    if note_owner_id != auth.user_id && auth.role != Role::Admin {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(StatusCode::NO_CONTENT)
}
```

:::warn Always scope queries to the authenticated owner (IDOR)
One of the most common web bugs is **IDOR** (Insecure Direct Object Reference): checking that the caller is logged in, then running `SELECT * FROM invoices WHERE id = $1` without checking who owns invoice `id`. An attacker simply tries `/invoices/101`, `/invoices/102`, and reads everyone's data. Enforce ownership right in the SQL query (`WHERE id = $1 AND user_id = $2`) or check the owner before returning the row.
:::

### Sessions, tokens and API keys

Three mechanisms cover almost every web service. They are not ranked; they are good at different things.

| | Session cookie | Signed token (JWT) | API key |
|---|---|---|---|
| Where the state lives | On the server: memory, Redis or a table | Inside the token, signed by the issuer | On the server, stored as a hash |
| Revocation | Instant: delete the row | Hard: valid until it expires, unless you keep a deny-list | Instant: delete the key |
| A browser app | Natural: the server sets a cookie | Workable, but storage invites XSS mistakes | No: browsers cannot keep a secret |
| Mobile, CLI, server-to-server | Awkward | Fits well | Fits best |
| Many services, one login | Needs a shared session store | Any service with the public key verifies offline | Needs a lookup per request |
| Best first choice for | Server-rendered pages, admin panels | Short-lived access between services, or an SPA with a refresh flow | Machine clients, integrations, webhooks |

The rule of thumb: **browsers and first-party apps get a session cookie; machines get a token or a key; anything that must be revoked instantly gets server-side state.**

### The cookie flags that matter

A session cookie is a bearer credential: whoever holds it is the user. Four attributes decide how much damage a leak can do:

- `HttpOnly` — JavaScript cannot read it, so a cross-site scripting bug cannot steal it.
- `Secure` — the browser sends it only over HTTPS.
- `SameSite=Lax` — it is not attached to a cross-site `POST`, which blocks the common form of cross-site request forgery. `Strict` is stronger and breaks links from other sites; `Lax` is the sane default. Prefix sensitive cookies with `__Host-` so subdomains cannot overwrite them.
- A short `Max-Age` plus a server-side expiry — rotate the session id at login, and delete the session **on the server** on `POST /logout`.

The crates that do this for Axum are `tower-sessions` (memory for development, Redis or PostgreSQL for production) and `axum-login`:

```toml file=Cargo.toml
[dependencies]
tower-sessions = "0.14"
```

```rust file=src/sessions.rs
use axum::routing::{get, post};
use axum::Router;
use tower_sessions::cookie::SameSite;
use tower_sessions::{Expiry, MemoryStore, Session, SessionManagerLayer};

async fn login(session: Session) -> &'static str {
    // Store the authenticated user ID on the server side; the browser holds only a random ID
    session.insert("user_id", 42_u64).await.unwrap();
    "logged in"
}

async fn whoami(session: Session) -> String {
    match session.get::<u64>("user_id").await.unwrap() {
        Some(id) => format!("user {id}"),
        None => String::from("anonymous"),
    }
}

fn app_with_sessions() -> Router {
    let store = MemoryStore::default(); // Use RedisStore or PostgresStore in production
    let session_layer = SessionManagerLayer::new(store)
        .with_secure(true)            // HTTPS only
        .with_http_only(true)         // hidden from JavaScript (`document.cookie`)
        .with_same_site(SameSite::Lax)
        .with_expiry(Expiry::OnInactivity(time::Duration::hours(24)));

    Router::new()
        .route("/login", post(login))
        .route("/whoami", get(whoami))
        .layer(session_layer)
}
```

:::warn Cross-site request forgery
A cookie is attached automatically by the browser to every request to your domain — including a request triggered by a form on `evil.example`, submitted while the user is logged in. That is **cross-site request forgery**, or CSRF, and it is why cookie-based sessions need `SameSite=Lax`, **never mutating state on `GET`**, and an `Origin` / `Sec-Fetch-Site` check or CSRF synchronizer token (`axum-csrf`) on HTML forms. Token-based APIs are immune by construction: the browser does not attach an `Authorization` header by itself. For cross-origin JSON APIs, never combine `CorsLayer::permissive()` with `.allow_credentials(true)`.
:::

### Signed tokens (JWT), and the four mistakes

A **JSON Web Token** is three base64url parts separated by dots: a header naming the algorithm, a payload of claims, and a signature. It is **signed, not encrypted** — anyone can read the payload, so never put a secret in it.

The claims that matter: `sub` (who), `exp` (expiry), `iat` (issued at), `iss` (who issued it) and `aud` (who it is for). Verify all of them, keep access tokens short — five to fifteen minutes — paired with a revocable refresh token stored hashed in the database, and explicitly pin the allowed signing algorithm (`Validation::new(Algorithm::HS256)` or `RS256`):

```toml file=Cargo.toml
[dependencies]
jsonwebtoken = { version = "10", features = ["rust_crypto"] }
serde = { version = "1.0", features = ["derive"] }
```

```rust file=src/jwt.rs
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,   // user ID
    role: String,
    iss: String,   // who issued the token
    aud: String,   // who may accept the token
    exp: usize,    // expiry (Unix timestamp in seconds)
}

fn issue_token(user_id: &str, role: &str, secret: &[u8], now_secs: usize) -> jsonwebtoken::errors::Result<String> {
    let claims = Claims {
        sub: user_id.to_owned(),
        role: role.to_owned(),
        iss: String::from("auth.example.com"),
        aud: String::from("api.example.com"),
        exp: now_secs + 900, // 15 minutes
    };
    encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(secret))
}

fn verify_token(token: &str, secret: &[u8]) -> jsonwebtoken::errors::Result<Claims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&["auth.example.com"]);
    validation.set_audience(&["api.example.com"]);
    let data = decode::<Claims>(token, &DecodingKey::from_secret(secret), &validation)?;
    Ok(data.claims)
}
```

Four mistakes account for most of the incidents:

1. **Not pinning the algorithm.** Letting the token's own header choose invites `"alg": "none"` and HS256/RS256 key-confusion attacks.
2. **Treating a signature as revocation.** A deleted user keeps working until `exp` unless you check a deny-list.
3. **Choosing HS256 in a system with many verifiers.** Every verifier with the shared secret can also *mint* tokens. Use RS256 or ES256 when multiple services verify.
4. **Checking the token in the browser.** Always verify on the server on every request.

### Validate every field

A type checks the *shape* of a body: that `limits` is a number and `email` is a string. It says nothing about whether `email` is valid or `password` is at least 12 characters. Combine `DefaultBodyLimit::max(...)` with **`garde`** or **`validator`**:

```toml file=Cargo.toml
[dependencies]
garde = { version = "0.22", features = ["derive", "email"] }
```

```rust file=src/validate_input.rs
use axum::Json;
use axum::http::StatusCode;
use garde::Validate;
use serde::Deserialize;

#[derive(Debug, Deserialize, Validate)]
struct RegisterRequest {
    #[garde(email)]
    email: String,
    #[garde(length(min = 3, max = 32), ascii)]
    username: String,
    #[garde(length(min = 12, max = 128))]
    password: String,
}

async fn register(Json(body): Json<RegisterRequest>) -> Result<StatusCode, (StatusCode, String)> {
    body.validate()
        .map_err(|report| (StatusCode::UNPROCESSABLE_ENTITY, report.to_string()))?;
    Ok(StatusCode::CREATED)
}
```

Four details that decide whether validation works in practice:

- **Normalise before you validate.** Trim whitespace and lower-case e-mail addresses before validating and storing.
- **Reject unknown fields** with `#[serde(deny_unknown_fields)]` on request types ([chapter 45](#serde)).
- **Keep the database constraints.** `NOT NULL`, `UNIQUE`, and `CHECK` constraints catch races ([chapter 73](#databases)).
- **Return 422 Unprocessable Content with field messages**, never raw SQL errors.

### Security headers

Response headers are cheap and close whole classes of attack. In `tower-http` they attach globally via `SetResponseHeaderLayer`:

| Header | Value | What it stops |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | The browser guessing an upload is a script and running it |
| `X-Frame-Options` | `DENY` | Your pages being framed invisibly to steal clicks (clickjacking) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leaking URL query strings to unrelated origins |
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'` | Inline and third-party scripts (XSS). Start with `Content-Security-Policy-Report-Only` when testing |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | Downgrade to plain HTTP (enable only once HTTPS works everywhere) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Pages using device features you never intended to offer |

```rust file=src/security_headers.rs
use axum::Router;
use axum::http::{HeaderValue, header};
use tower::ServiceBuilder;
use tower_http::set_header::SetResponseHeaderLayer;

fn add_security_headers(app: Router) -> Router {
    app.layer(
        ServiceBuilder::new()
            .layer(SetResponseHeaderLayer::overriding(
                header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::X_FRAME_OPTIONS,
                HeaderValue::from_static("DENY"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::REFERRER_POLICY,
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::STRICT_TRANSPORT_SECURITY,
                HeaderValue::from_static("max-age=63072000; includeSubDomains"),
            ))
            .layer(SetResponseHeaderLayer::overriding(
                header::CONTENT_SECURITY_POLICY,
                HeaderValue::from_static("default-src 'self'; frame-ancestors 'none'"),
            )),
    )
}
```

### Rate limiting

Without rate limits, one script can hammer `/login` with ten thousand guesses per second or starve worker tasks. Add **`tower_governor`** (token-bucket / GCRA rate limiting) alongside `tower::limit::ConcurrencyLimitLayer`, with **stricter limits on `/login` and password-reset endpoints** than on normal reads:

```rust file=src/rate_limit.rs
use std::sync::Arc;
use axum::Router;
use tower_governor::GovernorLayer;
use tower_governor::governor::GovernorConfigBuilder;

fn rate_limited_login(app_login: Router) -> Router {
    let config = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)     // replenish 1 token every 2 seconds
            .burst_size(5)     // allow short burst of 5 attempts
            .finish()
            .expect("valid governor config"),
    );
    app_login.layer(GovernorLayer::new(config))
}
```

:::warn Do not blindly trust `X-Forwarded-For`
By default, `PeerIpKeyExtractor` reads the TCP socket IP. Behind a load balancer, teams switch to `SmartIpKeyExtractor` (which reads `Forwarded` / `X-Forwarded-For`). Only enable header-based IP extraction when your server listens solely behind a **trusted reverse proxy** that strips and rewrites those headers—otherwise any client can spoof `X-Forwarded-For: 1.2.3.4` and bypass your rate limiter completely.
:::

### Signing in with someone else

"Sign in with GitHub" is **OAuth 2.0**, and with an identity layer it is **OpenID Connect** (OIDC), using the **authorisation-code flow with PKCE**:

1. Your app redirects the browser to the provider with `client_id`, `redirect_uri`, random `state` (CSRF protection for the callback), and a PKCE challenge.
2. The user signs in **on the provider's site**—you never see the password.
3. On callback, verify `state`, exchange the code for tokens, find or create the local user, and start your own session.

The crates are `oauth2` and `openidconnect`. Keep ordinary login too so you own your accounts.

### Comparing secrets without leaking timing

Comparing a submitted API key with the stored one using `==` stops at the first byte that differs, leaking prefix matches through response timing. Hash keys to fixed-length SHA-256 digests and compare in constant time with **`subtle::ConstantTimeEq`**:

```toml file=Cargo.toml
[dependencies]
sha2 = "0.10"
subtle = "2.6"
```

```rust file=src/secret_cmp.rs
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// Compares two API keys without leaking prefix or length through timing.
fn keys_match(presented_key: &str, stored_sha256: &[u8; 32]) -> bool {
    let presented_digest: [u8; 32] = Sha256::digest(presented_key.as_bytes()).into();
    bool::from(presented_digest.ct_eq(stored_sha256))
}
```

Password hashes are already compared in constant time inside `argon2`, so `verify_password` above needs nothing extra.

### Signing and retrying outbound webhooks

When your server sends webhook callbacks to customer URLs, sign `<timestamp>.<body>` with **HMAC-SHA256** (`hmac` + `sha2`) in an `X-Signature-256` header (rejecting stale timestamps to stop replays), and retry transient `5xx`/network failures with exponential backoff plus jitter (`backon`):

```rust file=src/webhook.rs
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

fn sign_webhook(secret: &[u8], timestamp: i64, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key size");
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    let sig: Vec<String> = mac.finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect();
    format!("v1={}", sig.join(""))
}
```

:::details The login flow, end to end
Whichever mechanism you choose, the shape is the same:

1. **Signup:** validate, hash, store. Reject weak or breached passwords by length and against a breach list, not by demanding arbitrary character classes.
2. **Login:** compare in constant time (the hash function does it for you), and return the *same* error and delay whether the user does not exist or the password is wrong, avoiding a user-enumeration oracle.
3. **Session or token:** a session id, or a short-lived JWT with `sub`, `exp`, `iat`, `iss`, `aud`.
4. **Every request:** an extractor resolves the credential to a user, or rejects with `401`.
5. **Authorisation:** the handler or a layer checks role or ownership, and rejects with `403`.
6. **Logout / revocation:** delete the session row on the server, or accept that a stateless token lives until `exp`.
7. **Housekeeping:** rotate session ids at login, expire idle sessions, never log passwords or secrets, and alert on spikes in failed logins.
:::

**More rules:**

- **Keep secrets out of the code.** Load keys and database URLs from environment variables or a secret manager.
- **Never build SQL from strings.** [Chapter 73](#databases) shows parameterised queries.
- **Do not show internals.** Log details with `tracing` on the server; return a neutral message to clients.
- **Keep dependencies current**, and run `cargo audit` and `cargo deny`.

## Configuration and secrets

Reading `std::env::var` one field at a time works for three variables. Once a service has database timeouts, cookie domains, OTLP endpoints, and feature flags, **layered configuration** gives one clear precedence order ([chapter 75](#cli) covers the same pattern for CLIs):

**CLI flags > environment variables (`APP_*`) > environment file (`config/prod.toml`) > base defaults (`config/default.toml`)**

In Rust, **`figment`** (or `config`) merges TOML files and prefixed environment variables cleanly into one typed `Settings` struct at startup, with optional **`dotenvy::dotenv()`** for local `.env` files. Wrap passwords, signing keys, and database URLs in **`secrecy::SecretString`**: its `Debug` implementation prints `[REDACTED]`, preventing leaks if anyone logs `tracing::info!(?settings)` on boot:

```rust file=src/settings.rs
use figment::Figment;
use figment::providers::{Env, Format, Toml};
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Settings {
    port: u16,
    database_url: SecretString,
    jwt_secret: SecretString,
}

fn load_settings() -> Result<Settings, figment::Error> {
    let _ = dotenvy::dotenv(); // Optional `.env` for local development only
    let env_name = std::env::var("APP_ENV").unwrap_or_else(|_| String::from("dev"));

    let settings: Settings = Figment::new()
        .merge(Toml::file("config/default.toml"))
        .merge(Toml::file(format!("config/{env_name}.toml")))
        .merge(Env::prefixed("APP_").split("__"))
        .extract()?;

    // Access secret bytes only at the exact point of use:
    let _db_conn_str = settings.database_url.expose_secret();
    Ok(settings)
}
```

## Choosing an API style: REST, gRPC, or GraphQL

| Style | Transport / format | Best for | Main Rust crate |
|---|---|---|---|
| **REST** | HTTP + JSON | Public APIs, CRUD services, web & mobile clients | `axum` |
| **gRPC** | HTTP/2 + Protobuf | Low-latency service-to-service RPCs and streaming ([chapter 65](#async-ecosystem)) | `tonic` |
| **GraphQL** | Single HTTP `POST /graphql` + schema | Complex nested UI views where clients choose fields without over-fetching | `async-graphql` |

GraphQL shines when a dashboard needs user profile + recent orders + billing status in one round trip without adding bespoke REST endpoints. **`async-graphql`** (paired with `async-graphql-axum`) derives the GraphQL schema directly from Rust structs and methods:

```rust file=src/graphql.rs
use async_graphql::{Context, Object, Schema, EmptyMutation, EmptySubscription};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::extract::State;
use axum::Router;

struct QueryRoot;

#[Object]
impl QueryRoot {
    async fn api_version(&self, _ctx: &Context<'_>) -> &'static str {
        "1.0"
    }
}

type AppSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

async fn graphql_handler(State(schema): State<AppSchema>, req: GraphQLRequest) -> GraphQLResponse {
    schema.execute(req.into_inner()).await.into()
}
```

If you adopt GraphQL on relational tables, pair resolvers with `async_graphql::dataloader::DataLoader` to batch ID lookups—otherwise nested GraphQL lists trigger the same N+1 SQL query problem described in [chapter 73](#databases).

## Other frameworks

Axum is one of several good frameworks. Here is the same small server in the two best-known alternatives: `GET /greet/{name}`, and `POST /users` with a JSON body.

**Actix Web** is the oldest of the major frameworks and one of the fastest in benchmarks. It marks routes with attribute macros and uses its own runtime set-up on top of Tokio:

```rust file=src/main.rs
use actix_web::{get, post, web, App, HttpResponse, HttpServer, Responder};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct User {
    name: String,
    age: u8,
}

#[get("/greet/{name}")]
async fn greet(name: web::Path<String>) -> impl Responder {
    format!("Hello, {name}!")
}

#[post("/users")]
async fn create_user(user: web::Json<User>) -> impl Responder {
    HttpResponse::Created().json(user.into_inner())
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(greet).service(create_user)).bind(("127.0.0.1", 3001))?.run().await
}
```

**Rocket** aims at ease of use. Routes are attributes with the parameters named inside them, and much is configured by convention:

```rust file=src/main.rs
#[macro_use]
extern crate rocket;

use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
struct User {
    name: String,
    age: u8,
}

#[get("/greet/<name>")]
fn greet(name: &str) -> String {
    format!("Hello, {name}!")
}

#[post("/users", data = "<user>")]
fn create_user(user: Json<User>) -> (Status, Json<User>) {
    (Status::Created, user)
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![greet, create_user])
}
```

**Warp** builds routes from small, composable pieces called **filters**. A filter describes a request as a pipeline (`and`, `or`, `map`), and the result becomes the response:

```rust file=src/main.rs
use warp::Filter;

#[tokio::main]
async fn main() {
    let greet = warp::path!("greet" / String).map(|name| format!("Hello, {name}!"));
    let users = warp::path!("users" / u32).map(|id| format!("user {id}"));

    warp::serve(greet.or(users))
        .run(([127, 0, 0, 1], 3002))
        .await;
}
```

Warp's style is functional: you describe the request, and the framework matches it. It is powerful, but its types can be long, and fewer new projects choose it today than Axum or Actix Web.

The ideas are the same in all three: routes, typed extractors as function parameters, and return types that become responses. Once you know one, the others read easily.

| Framework | Character |
|---|---|
| **Axum** | from the Tokio team. Few macros, built on tower, the largest ecosystem of middleware. The default choice today |
| **Actix Web** | mature and very fast. Its own middleware system |
| **Rocket** | the friendliest to start with. Many conveniences built in |
| **Poem**, **Salvo** | similar to Axum, with built-in generation of OpenAPI descriptions |
| **Warp** | routes composed from small "filters". An older, functional style |
| **Loco** | "Rails for Rust": a full framework on top of Axum with generators, an ORM, background jobs and mailers |
| **Leptos**, **Dioxus** | full-stack frameworks: server and browser code in one Rust project ([chapter 79](#apps)) |

## From your machine to the world

A Rust server is one executable file. Deploying it well in production takes a few deliberate habits:

1. **Bind `0.0.0.0` and read settings from config/env**, with a reverse proxy handling public TLS.
2. **Expose separate liveness and readiness probes.** `/healthz` returns `200 OK` unconditionally while the event loop runs; `/readyz` checks critical dependencies (for example `SELECT 1` on the database pool) and returns `503 Service Unavailable` during startup or DB outages so the load balancer routes traffic away cleanly.
3. **Drain in-flight requests on `SIGTERM` / {{Ctrl}}+{{C}}.** Wait for `axum::serve(listener, app).with_graceful_shutdown(shutdown_signal()).await`, then call `pool.close().await` before exiting so active requests finish instead of snapping mid-response.
4. **Use a cached multi-stage `Dockerfile` with a non-root user.** Rebuilding 200 crates from scratch on every one-line source change wastes minutes; **`cargo-chef`** splits dependency compilation from application compilation so Docker reuses the cached dependency layer whenever `Cargo.lock` hasn't changed:

```text
FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin myserver

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=builder /app/target/release/myserver /usr/local/bin/myserver
USER nonroot
ENV PORT=8080
EXPOSE 8080
CMD ["/usr/local/bin/myserver"]
```

:::warn Never bake a secret into an image
An `ENV API_KEY=…` line, or a credentials file copied into the build stage, stays in the image for ever: anyone who can pull the image can read it, and deleting the file in a later layer does not help, because the earlier layer is still there. Pass secrets at run time — Docker secrets, Kubernetes `Secret` objects, or the secret manager of the host — and let the program read them from the environment when it starts. If a secret has ever been committed by mistake, rotate it; a rewrite of the history does not reach the copies that were already fetched. The [configuration section](#cli) of the CLI chapter covers where values should come from.
:::

**Cross-compilation.** The server does not have to run on the same kind of machine it is built on. `rustup target add x86_64-unknown-linux-musl` followed by `cargo build --release --target x86_64-unknown-linux-musl` produces a statically linked Linux binary ([chapter 32](#cargo)). A container built from that binary needs almost nothing inside it, which keeps images small and startup fast.

**Nix.** Teams that want every build to be byte-identical use Nix: it pins the Rust version, the system libraries and the crate versions, and builds in a sandbox. Tools such as `crane`, `naersk` or `fenix` turn a `Cargo.lock` into a Nix derivation, and `nix develop` gives every contributor the same toolchain. The price is learning Nix itself; for a single service, the Dockerfile above is simpler.

The final image contains your program and a minimal system, with no compiler and no interpreter. Memory use of a small Axum service is typically some megabytes.

:::compare Web frameworks in other languages
- **Express** (JavaScript) and **Flask** (Python) are small and flexible. Request data is untyped, and checks are written by hand or added with libraries.
- **FastAPI** (Python) is the closest relative of Axum's style: function parameters with types describe the request. The checks happen while the program runs.
- **Spring** (Java) and **ASP.NET** (C#) are large frameworks with annotations and injection of dependencies at run time.
- **Go**'s `net/http` is in the standard library. Handlers take a request and a response writer, and decode by hand.
- **Axum** checks the shape of handlers at compile time, and a request that reaches your code is already validated against its types. A Rust server needs no separate application server. It is the server.
:::

:::recap
- HTTP is requests (method, path, headers, body) and responses (status, headers, body). REST maps resources to URLs and actions to methods.
- In Axum, a `Router` maps routes to handlers. A handler is an async function.
- Extractors (`Path`, `Query`, `Json`, `State`, …) declare what a handler needs. Bad requests are rejected before your code runs.
- Anything that implements `IntoResponse` can be returned. A custom error type with `IntoResponse` gives uniform error responses.
- Shared data lives in a state value, passed with `with_state` and received with `State<T>`.
- Middleware wraps routes: `from_fn` for your own, and `tower-http` for logging, timeouts, compression, CORS, and security headers.
- Axum handles real-time and large payloads via `ws`, `sse`, and streaming `Multipart` with bounded `DefaultBodyLimit`.
- Load typed settings with layered precedence (`figment` + optional local `dotenvy`) and wrap sensitive values in `secrecy::SecretString`.
- Protect routes with `tower-sessions` cookies (`HttpOnly`, `Secure`, `SameSite=Lax`) or short-lived `jsonwebtoken` tokens, enforce per-owner authorisation checks (preventing IDOR), validate inputs, rate-limit login routes, and compare secrets in constant time with `subtle`.
- Choose REST (`axum`), gRPC (`tonic`), or GraphQL (`async-graphql`) by client needs; Actix Web and Rocket follow similar ideas with a different style.
:::

:::quiz Check your understanding
? A handler has the signature `async fn show(Path(id): Path<u32>) -> String`. A client requests `/items/abc`. What happens?
- The handler runs with `id` equal to 0
+ Axum answers 400 Bad Request, and the handler is not called
- The server panics
- The compiler reports an error
= The extractor fails to convert `abc` into a `u32`, and its rejection becomes the response. The handler only ever sees valid values.

? Which status code fits a successful `POST` that created a new resource?
- 200 OK
- 302 Found
- 204 No Content
+ 201 Created
= 201 says that something new exists now. The response usually contains the new resource, or its address.

? How do handlers get access to shared data such as a database pool?
- Through a global `static mut` variable
- Each handler opens its own
- Through a hidden parameter of `main`
+ The router holds a state value (`with_state`), and handlers receive it with the `State<T>` extractor
= The state must be `Clone` and is usually built from `Arc`s, so that handing it out is cheap.

? Why must an extractor such as `Json<T>` be the last parameter of a handler?
+ It consumes the request body, which can be read only once
- Because of alphabetical order
- Because JSON is slow
- It is only a style rule
= Extractors for the path, the query and the headers only look at the request. A body extractor takes the body, so it has to come last.

? What should a server store to be able to check passwords?
- The password itself, in a protected file
- The password, encrypted with a secret key
- A plain SHA-256 hash of the password
+ A salted hash made by a slow password hash function such as Argon2
= A slow, salted hash cannot be reversed, and guessing is expensive. Fast hashes such as SHA-256 can be tried billions of times per second.

? Why compare API keys using `subtle::ConstantTimeEq` over SHA-256 hashes instead of plain `==`?
- Because `==` is not implemented on strings in Rust
- Because `==` runs on a separate thread
- Because `subtle` automatically rotates the API key on every request
+ Because `==` returns early on the first mismatched byte, leaking matching prefix bytes via timing differences
= Timing side-channels let an attacker measure tiny response-time differences to guess secrets byte by byte. Hashing plus constant-time comparison removes both length and prefix leaks.

? Why wrap fields like `database_url` and `jwt_secret` in `secrecy::SecretString` instead of plain `String` inside a `Settings` struct?
- It encrypts the string in RAM on every read
+ Its `Debug` implementation prints `[REDACTED]`, preventing accidental leaks when logging or formatting the settings struct
- It automatically reads `.env` files on startup
- It turns compile-time TOML errors into warnings
= Plain `String` fields print verbatim under `{settings:?}`, which commonly dumps credentials into startup logs or crash reports. `SecretString` forces explicit `.expose_secret()` calls only where the raw secret is required.

? A request arrives with a valid session for an ordinary reader, and asks to delete another user's note. Which answer is correct?
- `401 Unauthorized`, because the reader may not delete it
+ `403 Forbidden`, because the server knows who the caller is and they are not allowed
- `404 Not Found`, because the note may not be deleted
- `400 Bad Request`, because the request should not have been sent
= `401` means "I do not know who you are"; `403` means "I know, and the answer is no". `404` is sometimes used deliberately to hide the existence of a resource, but that is a decision, not the default.

? Why is a token-based API not vulnerable to cross-site request forgery?
+ Because the browser does not attach an `Authorization` header to a request made by another site
- Because tokens expire quickly
- Because tokens are encrypted
- Because tokens are stored in a cookie
= CSRF works by making the browser send credentials that it attaches automatically — a cookie. A header that your JavaScript adds explicitly is not attached by another origin's page, so the forged request arrives unauthenticated.

? What is the mistake in verifying a JWT with the algorithm taken from the token's own header?
+ An attacker can choose the algorithm, including `none` or a confusion between HS256 and RS256
- Nothing; that is what the header is for
- It makes verification slower
- It breaks the signature
= Always fix the algorithm in the verifier (`Validation::new(Algorithm::HS256)`). Letting the token choose is the classic JWT vulnerability.

? Which combination is the sane default for a server-rendered web application?
- An API key stored in `localStorage`
+ A server-side session, in a random cookie marked `HttpOnly`, `Secure` and `SameSite=Lax`
- A JWT in a cookie without `HttpOnly`, so the front end can read it
- A session id in a URL parameter
= The cookie flags remove whole classes of attack: `HttpOnly` blocks theft by scripts, `Secure` blocks plain-HTTP leaks, `SameSite=Lax` blocks cross-site posting. A session id in a URL leaks through logs, bookmarks and `Referer` headers.
:::

:::exercise guided A temperature API
Write a router with two routes: `GET /c-to-f/{celsius}` and `GET /f-to-c/{fahrenheit}`. Each returns JSON with both values, such as `{"celsius":100.0,"fahrenheit":212.0}`. Use the `send` helper of this chapter to try valid and invalid inputs.
::hint
Define `#[derive(Serialize)] struct Conversion { celsius: f64, fahrenheit: f64 }`. A handler takes `Path(celsius): Path<f64>` and returns `Json<Conversion>`. The formula is `f = c * 9 / 5 + 32`. You do not have to handle bad input yourself.
::solution
```rust ext run
use axum::extract::Path;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

#[derive(Serialize)]
struct Conversion {
    celsius: f64,
    fahrenheit: f64,
}

async fn c_to_f(Path(celsius): Path<f64>) -> Json<Conversion> {
    Json(Conversion { celsius, fahrenheit: celsius * 9.0 / 5.0 + 32.0 })
}

async fn f_to_c(Path(fahrenheit): Path<f64>) -> Json<Conversion> {
    Json(Conversion { celsius: (fahrenheit - 32.0) * 5.0 / 9.0, fahrenheit })
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/c-to-f/{celsius}", get(c_to_f)).route("/f-to-c/{fahrenheit}", get(f_to_c));

    send(&app, "GET", "/c-to-f/100", "").await;
    send(&app, "GET", "/c-to-f/-40", "").await;
    send(&app, "GET", "/f-to-c/212", "").await;
    send(&app, "GET", "/c-to-f/warm", "").await;
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
GET /c-to-f/100 -> 200 OK  {"celsius":100.0,"fahrenheit":212.0}
GET /c-to-f/-40 -> 200 OK  {"celsius":-40.0,"fahrenheit":-40.0}
GET /f-to-c/212 -> 200 OK  {"celsius":100.0,"fahrenheit":212.0}
GET /c-to-f/warm -> 400 Bad Request  Invalid URL: Cannot parse `warm` to a `f64`
```

Each handler is one line of real work. The type `Path<f64>` does the parsing and the error handling, and `Json<Conversion>` does the serialising and sets the `content-type` header. The request for `warm` never reaches your code.
:::

:::exercise practice A shared counter
Build an API with a counter that all clients share: `GET /count` returns `{"count": n}`, `POST /count/increment` adds one and returns the new value, and `POST /count/reset` sets it to zero.
::hint
The state can be `Arc<AtomicU64>`. Give it a short name with `type Counter = Arc<AtomicU64>;`. Handlers take `State(counter): State<Counter>`. Use `fetch_add`, `load` and `store`. Build JSON with the `json!` macro and return `Json<Value>`.
::solution
```rust ext run
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};

type Counter = Arc<AtomicU64>;

async fn read(State(counter): State<Counter>) -> Json<Value> {
    Json(json!({ "count": counter.load(Ordering::Relaxed) }))
}

async fn increment(State(counter): State<Counter>) -> Json<Value> {
    let new_value = counter.fetch_add(1, Ordering::Relaxed) + 1;
    Json(json!({ "count": new_value }))
}

async fn reset(State(counter): State<Counter>) -> Json<Value> {
    counter.store(0, Ordering::Relaxed);
    Json(json!({ "count": 0 }))
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/count", get(read))
        .route("/count/increment", post(increment))
        .route("/count/reset", post(reset))
        .with_state(Counter::default());

    send(&app, "GET", "/count", "").await;
    send(&app, "POST", "/count/increment", "").await;
    send(&app, "POST", "/count/increment", "").await;
    send(&app, "GET", "/count", "").await;
    send(&app, "POST", "/count/reset", "").await;
    send(&app, "GET", "/count/increment", "").await;
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
GET /count -> 200 OK  {"count":0}
POST /count/increment -> 200 OK  {"count":1}
POST /count/increment -> 200 OK  {"count":2}
GET /count -> 200 OK  {"count":2}
POST /count/reset -> 200 OK  {"count":0}
GET /count/increment -> 405 Method Not Allowed  
```

An atomic is enough for a single number, and needs no lock. `fetch_add` returns the value from before the addition, so the handler adds one to report the new value. Thousands of clients could increment at the same moment, and no update would be lost.

Changing the counter uses `POST`, never `GET`. A `GET` must not change anything, because browsers, proxies and search engines repeat and pre-load `GET` requests freely. The last line shows that Axum refuses the wrong method by itself.
:::

:::exercise practice Filtering with a query string
Given a fixed list of books (title, author, year), write `GET /books` with three optional query parameters: `author` (part of the name, ignoring case), `min_year`, and `newest_first` (true or false). Return the matching books as JSON.
::hint
Use `Query<Filter>` with `author: Option<String>`, `min_year: Option<u16>`, and `#[serde(default)] newest_first: bool`. `Option::is_none_or(|value| …)` is true when the option is `None` or the test holds, which is exactly "no filter, or it matches".
::solution
```rust ext run
use axum::extract::Query;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
struct Book {
    title: &'static str,
    author: &'static str,
    year: u16,
}

const BOOKS: [Book; 4] = [
    Book { title: "Dune", author: "Frank Herbert", year: 1965 },
    Book { title: "Neuromancer", author: "William Gibson", year: 1984 },
    Book { title: "Children of Dune", author: "Frank Herbert", year: 1976 },
    Book { title: "Snow Crash", author: "Neal Stephenson", year: 1992 },
];

#[derive(Debug, Deserialize)]
struct Filter {
    author: Option<String>,
    min_year: Option<u16>,
    #[serde(default)]
    newest_first: bool,
}

async fn books(Query(filter): Query<Filter>) -> Json<Vec<Book>> {
    let mut found: Vec<Book> = BOOKS
        .iter()
        .filter(|book| filter.author.as_ref().is_none_or(|author| book.author.to_lowercase().contains(&author.to_lowercase())))
        .filter(|book| filter.min_year.is_none_or(|year| book.year >= year))
        .cloned()
        .collect();
    if filter.newest_first {
        found.sort_by_key(|book| std::cmp::Reverse(book.year));
    }
    Json(found)
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/books", get(books));

    send(&app, "GET", "/books?author=herbert", "").await;
    send(&app, "GET", "/books?min_year=1980&newest_first=true", "").await;
    send(&app, "GET", "/books?author=gibson&min_year=1990", "").await;
    send(&app, "GET", "/books?min_year=old", "").await;
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
GET /books?author=herbert -> 200 OK  [{"title":"Dune","author":"Frank Herbert","year":1965},{"title":"Children of Dune","author":"Frank Herbert","year":1976}]
GET /books?min_year=1980&newest_first=true -> 200 OK  [{"title":"Snow Crash","author":"Neal Stephenson","year":1992},{"title":"Neuromancer","author":"William Gibson","year":1984}]
GET /books?author=gibson&min_year=1990 -> 200 OK  []
GET /books?min_year=old -> 400 Bad Request  Failed to deserialize query string: min_year: invalid digit found in string
```

The struct `Filter` documents the query parameters, with their types, in one place. Optional fields are `Option`, and the flag has a default. A search that finds nothing returns an empty list with status 200, not a 404: the resource `/books` exists, and its filtered content happens to be empty.

The filtering is an ordinary iterator chain. Nothing about it knows that it runs in a web server, so it could be moved into a function and tested without Axum.
:::

:::exercise challenge A key-value store with protected writes
Build a small key-value store. `PUT /kv/{key}` stores the request body as the value (201 if the key is new, 204 if it was replaced). `GET /kv/{key}` returns the value, or 404. `DELETE /kv/{key}` removes it. `GET /kv` lists the keys as JSON. Rules: keys contain only ASCII letters, digits and `-`. Values are at most 100 bytes long. Reading is open to everyone, but `PUT` and `DELETE` need the header `x-api-key: let-me-write`. All errors are JSON of the form `{"error": "…"}`.
::hint
Use `Arc<RwLock<BTreeMap<String, String>>>` as the state: many readers, few writers. Write an `ApiError` enum with `IntoResponse`. Put the two writing methods into their own `Router` with `.route_layer(middleware::from_fn(require_key))`, the reading routes into another, and `merge` them. The raw body is the extractor `String`, in last position. To send requests with and without the header, write a helper like `send` that takes an optional key and returns the status and the body.
::solution
```rust ext run
use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

use axum::body::Body;
use axum::extract::{Path, Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, put};
use axum::{Json, Router};
use serde_json::json;
use tower::ServiceExt;

const API_KEY: &str = "let-me-write";
const MAX_VALUE_LEN: usize = 100;

type Store = Arc<RwLock<BTreeMap<String, String>>>;

enum ApiError {
    NotFound(String),
    TooLong(usize),
    BadKey,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::NotFound(key) => (StatusCode::NOT_FOUND, format!("no value is stored under '{key}'")),
            ApiError::TooLong(len) => {
                (StatusCode::PAYLOAD_TOO_LARGE, format!("the value has {len} bytes, and the limit is {MAX_VALUE_LEN}"))
            }
            ApiError::BadKey => (StatusCode::BAD_REQUEST, String::from("keys may contain only letters, digits and '-'")),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

async fn list_keys(State(store): State<Store>) -> Json<Vec<String>> {
    Json(store.read().unwrap().keys().cloned().collect())
}

async fn get_value(State(store): State<Store>, Path(key): Path<String>) -> Result<String, ApiError> {
    store.read().unwrap().get(&key).cloned().ok_or(ApiError::NotFound(key))
}

async fn put_value(State(store): State<Store>, Path(key): Path<String>, value: String) -> Result<StatusCode, ApiError> {
    if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(ApiError::BadKey);
    }
    if value.len() > MAX_VALUE_LEN {
        return Err(ApiError::TooLong(value.len()));
    }
    let existed = store.write().unwrap().insert(key, value).is_some();
    Ok(if existed { StatusCode::NO_CONTENT } else { StatusCode::CREATED })
}

async fn delete_value(State(store): State<Store>, Path(key): Path<String>) -> Result<StatusCode, ApiError> {
    match store.write().unwrap().remove(&key) {
        Some(_) => Ok(StatusCode::NO_CONTENT),
        None => Err(ApiError::NotFound(key)),
    }
}

/// Lets a request pass only if it carries the right key.
async fn require_key(headers: HeaderMap, request: Request, next: Next) -> Response {
    let given = headers.get("x-api-key").and_then(|value| value.to_str().ok());
    if given == Some(API_KEY) {
        next.run(request).await
    } else {
        (StatusCode::UNAUTHORIZED, Json(json!({ "error": "a valid x-api-key header is required" }))).into_response()
    }
}

fn app() -> Router {
    let writing = Router::new().route("/kv/{key}", put(put_value).delete(delete_value)).route_layer(middleware::from_fn(require_key));
    let reading = Router::new().route("/kv", get(list_keys)).route("/kv/{key}", get(get_value));
    Router::new().merge(reading).merge(writing).with_state(Store::default())
}

/// Sends one request to the router and returns the status and the body.
async fn call(app: &Router, method: &str, path: &str, key: Option<&str>, body: &str) -> (StatusCode, String) {
    let mut request = Request::builder().method(method).uri(path);
    if let Some(key) = key {
        request = request.header("x-api-key", key);
    }
    let response = app.clone().oneshot(request.body(Body::from(body.to_string())).unwrap()).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, String::from_utf8_lossy(&bytes).into_owned())
}

#[tokio::main]
async fn main() {
    let app = app();
    let key = Some(API_KEY);

    println!("{:?}", call(&app, "PUT", "/kv/colour", None, "green").await);
    println!("{:?}", call(&app, "PUT", "/kv/colour", key, "green").await);
    println!("{:?}", call(&app, "PUT", "/kv/colour", key, "blue").await);
    println!("{:?}", call(&app, "PUT", "/kv/size", key, "large").await);
    println!("{:?}", call(&app, "GET", "/kv/colour", None, "").await);
    println!("{:?}", call(&app, "GET", "/kv", None, "").await);
    println!("{:?}", call(&app, "PUT", "/kv/essay", key, &"x".repeat(101)).await);
    println!("{:?}", call(&app, "PUT", "/kv/bad_key!", key, "x").await);
    println!("{:?}", call(&app, "DELETE", "/kv/size", key, "").await);
    println!("{:?}", call(&app, "GET", "/kv/size", None, "").await);
}
```
```output
(401, "{\"error\":\"a valid x-api-key header is required\"}")
(201, "")
(204, "")
(201, "")
(200, "blue")
(200, "[\"colour\",\"size\"]")
(413, "{\"error\":\"the value has 101 bytes, and the limit is 100\"}")
(400, "{\"error\":\"keys may contain only letters, digits and '-'\"}")
(204, "")
(404, "{\"error\":\"no value is stored under 'size'\"}")
```

The structure carries the rules:

- **The router shows who may do what.** The writing methods live in a router of their own, wrapped by `route_layer`. A new writing route added there is protected without anyone having to remember it. The two routers share the path `/kv/{key}` with different methods, and `merge` joins them.
- **One place for errors.** Handlers return `Result<_, ApiError>`, and the `IntoResponse` implementation decides the status and the JSON form. The middleware answers in the same form.
- **`RwLock`** lets any number of readers in at once, and gives writers exclusive access. No lock is held across an `.await`.
- **`call` returns values** and does not print them, so the same helper could be used in tests with `assert_eq!`.

A real service would not compare the key with `==`, and would not keep it in the source code. It would read the key from the environment, store only a hash of it, and compare in constant time (the crate `subtle` does that), so that the time the comparison takes does not reveal how many characters were right.
:::
