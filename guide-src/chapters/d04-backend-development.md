@id backend-development
@part def
@title Backend Development
@short Backend development
@level advanced
@time 100
@learn Build HTTP APIs with Axum, Actix-web, Rocket and Warp, and choose between them | Add authentication, authorisation, middleware and rate limiting to a service | Integrate SQL and NoSQL storage with pools, migrations and cursor pagination | Use GraphQL, gRPC, queues, caching, tracing, configuration and OpenAPI | Ship a service with health checks, background jobs and graceful shutdown

Backend work in Rust is no longer experimental. `axum`, `actix-web`, `rocket`
and `warp` are production frameworks; `sqlx`, `diesel` and `sea-orm` cover the
database layer; `tokio`, `tower` and `tracing` supply the runtime, middleware
and observability. This chapter is the map of that ecosystem and a set of
working recipes. The library's [web chapter](#web), [databases
chapter](#databases), [API project](#project-api) and [observability
chapter](#observability) go deeper on the systems side; chapter D2 supplies the
async foundation, and chapter D6 covers the security properties in detail.

:::analogy A restaurant service, not a recipe book
A backend is a kitchen during service: orders arrive (requests), a host seats
them (routing), cooks prepare dishes (handlers), the pantry is shared (database
and cache), and the pass must keep plates moving (backpressure, timeouts). A
single recipe can be excellent and still fail in service if the pantry is
locked by one cook, the pass has no limit, or nobody can tell which dish is
late. Frameworks give you the kitchen; this chapter is about service.
:::

:::compare Modular monolith and service fleet
A modular monolith is one deployable with explicit internal boundaries: in-process calls, one database, one transaction, simple operations. A service fleet gives independent deploys and scaling, at the price of network failure modes, distributed transactions, versioned contracts and observability. Start with a monolith whose modules could become services; split when a boundary has a genuinely different scaling or failure profile.
:::


## 4.1 The framework landscape

| Framework | Model | Strengths | Costs |
| --- | --- | --- | --- |
| Axum | Tokio + `tower` services, extractors | small core, composable layers, excellent ecosystem fit | fewer batteries included; you choose the stack |
| Actix-web | actor-rooted runtime, extractors | very fast, mature, built-in middleware | larger surface, its own runtime abstractions |
| Rocket | declarative routes, guards, fairings | ergonomic, typed guards, good defaults | historically slower to adopt new Rust; macro-heavy |
| Warp | filter combinators | extremely composable, type-level composition | error messages and composition become complex at scale |

All four sit on Tokio (Actix uses its own `tokio`-based runtime), all support
TLS termination behind a proxy, and all can serve HTTP/1.1 and HTTP/2. The
choice is mostly about team familiarity and the middleware model. Axum is the
default recommendation in 2026 because `tower` layers, `tracing` and `sqlx`
compose without adapters, and because it is maintained by the Tokio project.

```rust
// Axum: router, path extractor, JSON extractor, shared state.
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    greeting: Arc<String>,
}

#[derive(Deserialize)]
struct CreateUser {
    name: String,
}

#[derive(Serialize)]
struct User {
    id: u64,
    name: String,
}

async fn health() -> &'static str {
    "ok"
}

async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Json<User>, StatusCode> {
    if id == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(User { id, name: state.greeting.to_string() }))
}

async fn create_user(Json(input): Json<CreateUser>) -> (StatusCode, Json<User>) {
    (
        StatusCode::CREATED,
        Json(User { id: 1, name: input.name }),
    )
}

fn app(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/users/{id}", get(get_user))
        .route("/users", post(create_user))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    let state = AppState { greeting: Arc::new("hello".to_string()) };
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app(state)).await.unwrap();
}
```

The other frameworks express the same handler in their own idiom:

```rust
// Actix-web: attribute route, extractors, application state.
use actix_web::{get, web, App, HttpServer, Responder};

#[get("/users/{id}")]
async fn get_user(id: web::Path<u64>) -> impl Responder {
    format!("user {}", id)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(get_user))
        .bind(("0.0.0.0", 8080))?
        .run()
        .await
}
```

```rust
// Rocket: route attribute, typed guard, launch macro.
#[macro_use]
extern crate rocket;

#[get("/users/<id>")]
fn get_user(id: u64) -> String {
    format!("user {id}")
}

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", routes![get_user])
}
```

```rust
// Warp: filters compose with `and`, then terminate with `and_then`.
use std::convert::Infallible;
use warp::Filter;

#[tokio::main]
async fn main() {
    let users = warp::path!("users" / u64)
        .and(warp::get())
        .and_then(|id| async move { Ok::<_, Infallible>(format!("user {id}")) });
    warp::serve(users).run(([0, 0, 0, 0], 8080)).await;
}
```

**Extractors** are the framework's typed inputs: a path, query string, JSON
body, header, cookie, connection pool or authenticated principal. They run
before the handler and reject with a response on failure. A handler returns
anything implementing the framework's response trait: `Json<T>`, `StatusCode`,
`(StatusCode, Json<T>)`, `Result<T, E>` with an error type that converts into a
response, or a streaming body. **Middleware** wraps the service: logging,
authentication, CORS, compression, timeouts and limits. In Axum it is a
`tower::Layer`; in Actix it is a middleware factory; in Rocket a `Fairing`; in
Warp a `Filter`.

## 4.2 REST API design

A REST API is a contract, not a routing table. The practices that survive
contact with clients:

- **Nouns in paths, verbs in methods.** `GET /orders/42`, not
  `POST /getOrder`.
- **Plural collections.** `/orders`, `/orders/42`, `/orders/42/items`.
- **HTTP status codes carry meaning.** `200` read, `201` created with
  `Location`, `204` no content, `400` malformed, `401` unauthenticated, `403`
  forbidden, `404` absent, `409` conflict, `422` semantic validation, `429`
  throttled, `5xx` server fault.
- **Errors have a stable shape**, for example
  `{"code":"order_not_found","message":"...","details":{...},"request_id":"..."}`.
- **Idempotency** for `PUT`, `DELETE` and retried `POST` via an
  `Idempotency-Key` header stored with the response.
- **Content negotiation** and a versioning strategy (section 4.22).
- **Pagination is explicit** (section 4.26), never a bare array that grows.

```rust
use axum::http::StatusCode;
use serde::Serialize;

#[derive(Serialize)]
struct ApiError {
    code: &'static str,
    message: String,
    request_id: String,
}

impl ApiError {
    fn not_found(request_id: String) -> (StatusCode, axum::Json<Self>) {
        (
            StatusCode::NOT_FOUND,
            axum::Json(Self {
                code: "order_not_found",
                message: "no order with that id".to_string(),
                request_id,
            }),
        )
    }
}
```

Returning `Result<T, ApiError>` from every handler centralises the mapping from
domain errors to status codes. Do not leak database errors or stack traces;
log them with the request id and return a generic message.

## 4.3 GraphQL with `async-graphql` and `juniper`

GraphQL exposes one endpoint with a typed schema; clients select exactly the
fields they need. `async-graphql` is async-first and integrates with Axum,
Actix and Poem. `juniper` is the older, mature alternative with a
resolver-centric API.

```rust
use async_graphql::{Context, Object, Schema, SimpleObject};

#[derive(SimpleObject)]
struct User {
    id: u64,
    name: String,
}

struct Query;

#[Object]
impl Query {
    async fn user(&self, _context: &Context<'_>, id: u64) -> Option<User> {
        Some(User { id, name: format!("user-{id}") })
    }
}

let schema = Schema::build(Query, async_graphql::EmptyMutation, async_graphql::EmptySubscription)
    .finish();

// Axum integration:
// let app = Router::new().route("/graphql", post(graphql_handler)).with_state(schema);
```

GraphQL's costs are real: one endpoint makes HTTP caching harder, nested
queries need **depth and complexity limits**, and the N+1 query problem needs a
DataLoader. Field-level authorisation belongs in the resolver, not only at the
edge. Use GraphQL when clients genuinely need shape flexibility; use REST or
gRPC when the operations are fixed and cacheability matters.

## 4.4 gRPC with `tonic` and Protocol Buffers

gRPC is typed RPC over HTTP/2 with protobuf payloads, streaming in both
directions, deadlines and rich status codes. `tonic` generates client and
server code; `prost` generates the message types.

```protobuf
syntax = "proto3";
package catalog;

message GetBookRequest { string id = 1; }
message Book { string id = 1; string title = 2; int32 year = 3; }

service Catalog {
  rpc GetBook(GetBookRequest) returns (Book);
  rpc ListBooks(GetBookRequest) returns (stream Book);
}
```

```rust
use tonic::{transport::Server, Request, Response, Status};

pub mod catalog {
    tonic::include_proto!("catalog");
}

use catalog::catalog_server::{Catalog, CatalogServer};
use catalog::{Book, GetBookRequest};

#[derive(Default)]
struct CatalogService;

#[tonic::async_trait]
impl Catalog for CatalogService {
    async fn get_book(
        &self,
        request: Request<GetBookRequest>,
    ) -> Result<Response<Book>, Status> {
        let id = request.into_inner().id;
        if id.is_empty() {
            return Err(Status::invalid_argument("id is required"));
        }
        Ok(Response::new(Book { title: "Rust".into(), id, year: 2015 }))
    }

    type ListBooksStream = tokio_stream::wrappers::ReceiverStream<Result<Book, Status>>;

    async fn list_books(
        &self,
        _request: Request<GetBookRequest>,
    ) -> Result<Response<Self::ListBooksStream>, Status> {
        let (tx, rx) = tokio::sync::mpsc::channel(8);
        tokio::spawn(async move {
            let _ = tx.send(Ok(Book { id: "1".into(), title: "Rust".into(), year: 2015 })).await;
        });
        Ok(Response::new(tokio_stream::wrappers::ReceiverStream::new(rx)))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    Server::builder()
        .add_service(CatalogServer::new(CatalogService))
        .serve("0.0.0.0:50051".parse()?)
        .await?;
    Ok(())
}
```

`build.rs` runs `tonic_build::configure().compile_protos(&["proto/catalogue.proto"],
&["proto"])`. Deadlines propagate as `grpc-timeout`; always set one on the client
(`tonic::Request::set_timeout`). Interceptors add auth and tracing. Reflection
(`tonic-reflection`) makes tools such as `grpcurl` usable without the `.proto`
file. Section 10.8 covers streaming and interceptors in more depth.

## 4.5 Middleware: logging, CORS, compression, timeouts, rate limiting

Middleware is where cross-cutting policy lives. In Axum, `tower` and
`tower-http` provide production-ready layers; order matters, because the first
layer sees the request first and the response last.

```rust
use axum::Router;
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

fn layered(app: Router) -> Router {
    let governor = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(10)
        .finish()
        .unwrap();

    app.layer(
        ServiceBuilder::new()
            .layer(TraceLayer::new_for_http())
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any),
            ),
    )
    .layer(CompressionLayer::new())
    .layer(TimeoutLayer::new(Duration::from_secs(10)))
    .layer(GovernorLayer { config: governor.into() })
}
```

Order the stack deliberately: tracing outermost so it records failures from
every inner layer; CORS before auth if preflight requests must succeed without
credentials; timeout outside the handler but inside tracing; compression
outside the handler; rate limiting at the edge (a gateway or this layer) with a
shared store for multiple replicas. `Allow-Origin: *` with credentials is
invalid; list origins explicitly in production. Section 4.24 expands rate
limiting, and chapter D6 covers CORS as a browser security control.

## 4.6 Authentication: JWT, OAuth2, sessions and API keys

| Mechanism | State | Best for | Watch out for |
| --- | --- | --- | --- |
| Session cookie | server-side session store | browser apps | CSRF, cookie flags, session fixation |
| JWT access token | stateless, signed | service-to-service, APIs | revocation, algorithm confusion, long lifetimes |
| OAuth2 / OIDC | delegated authorisation | third-party login, SSO | redirect URI validation, PKCE, token audience |
| API key | static secret | machine clients | rotation, scoping, leakage in logs |

A JWT must be verified, not merely decoded. Check the algorithm against an
allow-list, the signature, `exp`, `nbf`, `iss`, `aud`, and the key id. Never
accept `alg: none`; never trust a token because it parses.

```rust
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
    roles: Vec<String>,
}

fn issue(secret: &[u8], subject: &str) -> String {
    let claims = Claims {
        sub: subject.to_string(),
        exp: 4_102_444_800,
        roles: vec!["reader".to_string()],
    };
    encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(secret)).unwrap()
}

fn verify(secret: &[u8], token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["my-api"]);
    validation.set_issuer(&["https://auth.example.com"]);
    decode::<Claims>(token, &DecodingKey::from_secret(secret), &validation).map(|data| data.claims)
}
```

Use asymmetric keys (RS256/ES256) when several services verify tokens issued by
one authority, and publish the keys as a JWKS. Access tokens should be short
lived (5–15 minutes) with a refresh token; a revocation list or a token version
claim handles logout. Store browser sessions in `HttpOnly`, `Secure`,
`SameSite=Lax` cookies, rotate the id on login, and protect state-changing
requests with CSRF tokens or a strict `SameSite` policy. API keys are hashed at
rest, shown once, scoped, and rotated. `axum-login`, `tower-sessions` and
`oauth2` are the usual building blocks; chapter D6 covers password hashing and
secret storage.

## 4.7 Authorisation: RBAC, ABAC and permission models

Authentication answers "who are you"; authorisation answers "may you do this to
this resource". Keep the decision in one place: a policy function or a small
policy engine that receives the principal, action and resource.

- **RBAC** assigns roles (`admin`, `editor`, `viewer`) and permissions to
  roles. It is simple, auditable and coarse.
- **ABAC** evaluates attributes of the principal, resource and environment
  (`owner_id == user.id`, `department == resource.department`, time of day).
  It is expressive and harder to reason about.
- **ReBAC** (relationship-based, as in Zanzibar) models ownership and sharing
  as graph edges; it fits collaborative documents and nested resources.

```rust
#[derive(Clone, Copy, PartialEq)]
enum Role {
    Admin,
    Editor,
    Viewer,
}

struct Principal {
    id: u64,
    role: Role,
}

struct Document {
    owner: u64,
    published: bool,
}

#[derive(Clone, Copy)]
enum Action {
    Read,
    Write,
    Delete,
}

fn allowed(principal: &Principal, action: Action, document: &Document) -> bool {
    match (principal.role, action) {
        (Role::Admin, _) => true,
        (_, Action::Read) => document.published || document.owner == principal.id,
        (Role::Editor, Action::Write) => document.owner == principal.id,
        (_, Action::Write | Action::Delete) => document.owner == principal.id,
        _ => false,
    }
}
```

Enforce on the server for every object, not only in the UI, and apply the same
rule to list endpoints (filter in SQL, do not fetch-then-filter). Prefer
`deny` by default and make the policy total: every combination returns a
decision. Log denials with the principal and resource id, and test the matrix
of roles and actions. For multi-tenant systems, every query must include the
tenant id; a missing filter is a data breach.

## 4.8 Database integration: SQLx, Diesel and SeaORM

| Layer | Style | Compile-time checking | Migrations |
| --- | --- | --- | --- |
| `sqlx` | async SQL, no DSL | `query!` against a live schema or offline cache | `sqlx migrate` |
| `diesel` | sync ORM/query builder | strong types, DSL checked at compile time | `diesel migration` |
| `sea-orm` | async ORM over `sqlx` | entity types, dynamic queries | `sea-orm-cli` |

```rust
use sqlx::{FromRow, PgPool};

#[derive(Debug, FromRow)]
struct User {
    id: i64,
    email: String,
}

async fn find_user(pool: &PgPool, id: i64) -> sqlx::Result<Option<User>> {
    sqlx::query_as::<_, User>("SELECT id, email FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

async fn create_user(pool: &PgPool, email: &str) -> sqlx::Result<User> {
    sqlx::query_as::<_, User>(
        "INSERT INTO users (email) VALUES ($1) RETURNING id, email",
    )
    .bind(email)
    .fetch_one(pool)
    .await
}

// Compile-time checked form: requires DATABASE_URL at build time or a
// checked-in `.sqlx` offline cache produced by `cargo sqlx prepare`.
async fn count_users(pool: &PgPool) -> sqlx::Result<i64> {
    let row = sqlx::query!("SELECT count(*) AS count FROM users")
        .fetch_one(pool)
        .await?;
    Ok(row.count.unwrap_or(0))
}
```

`sqlx` supports PostgreSQL, MySQL/MariaDB, SQLite and MSSQL through feature
flags; the driver is pure Rust for Postgres and SQLite, so no client library is
needed. Always bind parameters (`$1`, `?`) rather than formatting SQL; this is
the primary defence against injection (chapter D6). `sqlx::query_as` with
`#[derive(FromRow)]` maps columns by name. Use `fetch_optional` for a lookup and
`fetch_one` for an invariant that must hold. Diesel's query builder catches
column and type errors at compile time and is synchronous, so use
`spawn_blocking` or `diesel-async` in a Tokio service. SeaORM is convenient for
CRUD-heavy services and supports relations and lazy loading; beware of N+1
queries.

## 4.9 Connection pooling

Opening a database connection costs a TCP handshake, TLS and authentication.
A pool keeps a bounded set of live connections and hands them out. `sqlx` has
`PgPool`; `deadpool`, `bb8` and `r2d2` provide pools for drivers that lack one.

```rust
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

async fn pool(database_url: &str) -> Result<sqlx::PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(3))
        .idle_timeout(Duration::from_secs(600))
        .max_lifetime(Duration::from_secs(1_800))
        .connect(database_url)
        .await
}
```

Size the pool from the database's connection limit divided by the number of
replicas, not from a wish for more concurrency. A pool larger than the database
can serve adds queueing inside the database, where it is harder to observe.
Set `acquire_timeout` so a saturated pool returns an error instead of hanging
the request forever, and pair it with a request timeout. `r2d2` is the classic
synchronous pool; `deadpool` is async and generically managed; `bb8` is async
and Tokio-oriented. Every pooled handle must be returned on all paths, which
RAII does automatically unless you `mem::forget` it.

## 4.10 Migrations

A migration is a versioned, ordered change to the schema, applied exactly once
and recorded in a table. SQLx stores them in `_sqlx_migrations`; Diesel in
`__diesel_schema_migrations`.

```sh
sqlx migrate add create_users
# edits migrations/20261116120000_create_users.sql
sqlx migrate run
sqlx migrate revert
```

```sql
-- 20261116120000_create_users.sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_created_at_idx ON users (created_at DESC);
```

Rules that prevent outages: migrations are forward-only in production
(rollbacks are for development); add nullable columns or columns with defaults,
backfill in batches, then add constraints in a later migration; create indexes
concurrently (`CREATE INDEX CONCURRENTLY`); never rewrite a table while it is
hot; keep migrations deterministic and reviewed. `refinery` supports multiple
databases and embeds migrations in the binary. Run migrations as a separate
deploy step, not from every replica at start-up, and make the step idempotent.

## 4.11 Redis integration

Redis is an in-memory data store used for caching, rate limits, sessions,
queues and distributed locks. `redis-rs` is the standard client; its
`ConnectionManager` reconnects automatically and can be cloned across tasks.

```rust
use redis::AsyncCommands;

async fn cache_example() -> redis::RedisResult<()> {
    let client = redis::Client::open("redis://127.0.0.1/")?;
    let mut connection = client.get_connection_manager().await?;

    redis::cmd("SET")
        .arg("greeting")
        .arg("hello")
        .arg("EX")
        .arg(60)
        .query_async::<()>(&mut connection)
        .await?;

    let value: Option<String> = connection.get("greeting").await?;
    println!("{value:?}");

    let _: i64 = connection.incr("visits", 1).await?;
    Ok(())
}
```

`ConnectionManager` multiplexes commands over one connection and reconnects;
`MultiplexedConnection` is the lower-level handle. Use `SET key value NX PX
milliseconds` for a lock and release it with a Lua compare-and-delete so you do
not delete another owner's lock. A Redis lock is not a consensus protocol; for
correctness under partitions, use the database or a system designed for it.
`fred` is an alternative client with cluster support. Keep keys namespaced
(`app:env:entity:id`), set TTLs deliberately, and avoid `KEYS` in production.

## 4.12 Message queues: RabbitMQ, Kafka and NATS

| Broker | Model | Rust client | Good for |
| --- | --- | --- | --- |
| RabbitMQ (AMQP 0-9-1) | exchanges, queues, routing keys, acknowledgements | `lapin` | task queues, routing, per-message ack |
| Kafka | partitioned append-only log, consumer groups | `rdkafka` (librdkafka) | event streams, replay, high throughput |
| NATS / JetStream | subjects, at-most/at-least-once, persistence | `async-nats` | low-latency messaging, request/reply |

```rust
// RabbitMQ: declare a queue, publish, consume with manual ack.
use lapin::{options::*, types::FieldTable, BasicProperties, Connection, ConnectionProperties};

async fn rabbit() -> Result<(), Box<dyn std::error::Error>> {
    let connection = Connection::connect("amqp://127.0.0.1:5672/%2f", ConnectionProperties::default()).await?;
    let channel = connection.create_channel().await?;
    channel.queue_declare("jobs", QueueDeclareOptions::default(), FieldTable::default()).await?;

    channel.basic_publish(
        "",
        "jobs",
        BasicPublishOptions::default(),
        b"{\"job\":1}",
        BasicProperties::default(),
    ).await?.await?;
    Ok(())
}

// Kafka: a consumer loop with a group id.
use rdkafka::consumer::{Consumer, StreamConsumer};
use rdkafka::ClientConfig;

async fn kafka() {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", "worker")
        .set("bootstrap.servers", "127.0.0.1:9092")
        .create()
        .expect("consumer");
    consumer.subscribe(&["jobs"]).expect("subscribe");
    // while let Some(message) = consumer.recv().await { ... }
}

// NATS: publish and subscribe.
async fn nats() -> Result<(), async_nats::Error> {
    let client = async_nats::connect("nats://127.0.0.1:4222").await?;
    client.publish("jobs", "hello".into()).await?;
    let mut subscriber = client.subscribe("jobs").await?;
    // while let Some(message) = subscriber.next().await { ... }
    Ok(())
}
```

Delivery semantics decide your design: at-most-once may lose a message,
at-least-once may duplicate it, exactly-once is a property of a specific
pipeline. Make consumers **idempotent** by key (store processed message ids) and
commit offsets/acks only after the side effect is durable. Use a dead-letter
queue for poison messages, a retry topic with backoff, and a schema registry or
versioned payloads for evolution. Never put a database transaction and a
message publish in one atomic step without an outbox table; the dual-write
problem is real.

## 4.13 Caching strategies

Caching turns a repeated expensive read into a cheap one. The hard parts are
invalidation, staleness and stampedes.

- **Cache-aside**: read cache, on miss read the database and populate. Simple,
  and the default.
- **Write-through**: write cache and database together; consistent but slower.
- **Write-behind**: write cache, flush later; fast and risky.
- **TTL**: tolerate bounded staleness; always set one.
- **Negative caching**: cache "not found" briefly to stop repeated misses.
- **Stampede protection**: one loader per key (`moka`'s `get_with`), or a
  short-lived distributed lock.
- **Key design**: include tenant, resource id and representation version.

```rust
use moka::future::Cache;
use std::time::Duration;

async fn cached_user(cache: &Cache<u64, String>, id: u64) -> String {
    cache
        .get_with(id, async move {
            // Loader runs once per key even under concurrent misses.
            format!("user-{id}")
        })
        .await
}

fn cache() -> Cache<u64, String> {
    Cache::builder()
        .max_capacity(10_000)
        .time_to_live(Duration::from_secs(60))
        .build()
}
```

Use an in-process cache (`moka`, `quick_cache`) for hot, small, per-instance
data and Redis for shared data. Do not cache authenticated responses without
varying by user, and never let a cache key omit the tenant. Invalidate on write
by deleting the key (not updating it) and let the next read repopulate.
Measure hit rate; a cache with a 20% hit rate adds a network hop and complexity
for little gain.

## 4.14 Logging and tracing

Use `tracing` for structured, span-aware diagnostics and `tracing-subscriber`
to format and filter it. `log`/`env_logger` are fine for small tools, but they
cannot represent request-scoped spans across async tasks.

```rust
use tracing::{info, info_span, instrument};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn init_tracing() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();
}

#[instrument(skip(password), fields(user.id = %user_id))]
async fn login(user_id: u64, password: &str) -> bool {
    let span = info_span!("login_attempt");
    let _entered = span.enter();
    info!(user_id, "attempt");
    !password.is_empty()
}

fn main() {
    init_tracing();
    let _ = (info, login);
}
```

Log **events**, not prose: `info!(order_id, amount, "order accepted")` is
searchable; `"order {} accepted"` is not. Include a request id and trace id in
every span, propagate `traceparent` at service boundaries (OpenTelemetry),
and never log secrets, tokens, passwords, full card numbers or personal data.
Use levels consistently: `error` for failed requests that need a human,
`warn` for degraded behaviour, `info` for lifecycle events, `debug` for
diagnosis, `trace` for high-volume detail. Sampling belongs at the collector,
not in a way that drops errors. The [observability chapter](#observability)
builds the OpenTelemetry pipeline.

## 4.15 Configuration management

Configuration comes from layered sources: defaults, a file, environment
variables and command-line flags, in that precedence. Parse into typed structs
once at start-up and fail fast with a clear message.

```rust
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Settings {
    database_url: String,
    #[serde(default = "default_port")]
    port: u16,
    #[serde(default)]
    debug: bool,
}

fn default_port() -> u16 {
    8080
}

fn load() -> Result<Settings, config::ConfigError> {
    dotenvy::dotenv().ok(); // local development only
    config::Config::builder()
        .add_source(config::File::with_name("config/default").required(false))
        .add_source(config::Environment::with_prefix("APP").separate_variable_where(|_| true))
        .build()?
        .try_deserialize()
}
```

`config` supports TOML, YAML, JSON, RON and environment sources; `figment`
offers a similar layered model; `envy` deserialises environment variables
directly; `clap` handles flags. Prefix environment variables (`APP_PORT`) to
avoid collisions, document every variable, and keep secrets out of files and
images. Validate ranges at start-up (`port != 0`, URLs parse) and print the
effective configuration with secrets redacted. Section 9.14 covers deployment
configuration and chapter D6 covers secret injection.

## 4.16 Serialisation: `serde`, JSON, TOML, YAML, MessagePack and CBOR

`serde` separates data structures from formats. Derive `Serialize` and
`Deserialize`, then choose a format per use: JSON for HTTP, TOML for human
configuration, YAML for infrastructure, MessagePack/CBOR for compact binary,
bincode/postcard for trusted internal transport.

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
struct Event {
    id: u64,
    kind: Kind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Kind {
    Created { by: String },
    Deleted { reason: Option<String> },
}

fn main() {
    let event = Event {
        id: 1,
        kind: Kind::Created { by: "ada".into() },
        note: None,
    };
    let json = serde_json::to_string(&event).unwrap();
    println!("{json}");
    let decoded: Event = serde_json::from_str(&json).unwrap();
    println!("{decoded:?}");

    // Other formats use the same derives:
    // let toml = toml::to_string(&event)?;
    // let bytes = rmp_serde::to_vec(&event)?;
    // let cbor = ciborium::into_writer(&event, &mut buffer)?;
}
```

`deny_unknown_fields` catches typos and unexpected input; `#[serde(tag = ...)]`
produces readable tagged unions; `#[serde(flatten)]` composes common envelopes;
`skip_serializing_if` keeps payloads small. Version your wire formats and treat
unknown enum variants carefully: for forward compatibility use
`#[serde(other)]` on a catch-all variant or an `Unknown` variant that preserves
the raw value. Never deserialise untrusted input into a type whose invariants
are unchecked (chapter D6); `serde` can deserialise a `u8` but not "a valid
email". YAML is not a safe configuration format for untrusted input; prefer
JSON/TOML and disable YAML tags.

## 4.17 File uploads and multipart handling

An upload is untrusted bytes with a claimed name and content type. Stream it to
a size-limited destination, validate the actual bytes (magic numbers), generate
a new name, and never trust the client's path.

```rust
use axum::{extract::Multipart, http::StatusCode};
use tokio::io::AsyncWriteExt;

async fn upload(mut multipart: Multipart) -> Result<StatusCode, StatusCode> {
    while let Some(field) = multipart.next_field().await.map_err(|_| StatusCode::BAD_REQUEST)? {
        let file_name = field.file_name().unwrap_or("upload.bin").to_string();

        // Reject traversal and absolute paths.
        if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
            return Err(StatusCode::BAD_REQUEST);
        }

        let mut file = tokio::fs::File::create(
            std::path::Path::new("uploads").join(format!("{}-{}", uuid::Uuid::new_v4(), file_name)),
        )
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let mut field = field;
        while let Some(chunk) = field.chunk().await.map_err(|_| StatusCode::BAD_REQUEST)? {
            file.write_all(&chunk).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        file.flush().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    Ok(StatusCode::CREATED)
}
```

Enforce a maximum request body at the server or proxy (`DefaultBodyLimit`,
nginx `client_max_body_size`) and a maximum per-file size while streaming.
Store uploads outside the web root, serve them through an application route
that checks authorisation, and set `Content-Disposition: attachment` plus a
safe content type. For images, re-encode rather than trusting the extension; a
"JPEG" can contain a script. For very large files, use presigned object-store
URLs so the application never proxies the bytes.

## 4.18 WebSockets

A WebSocket upgrades an HTTP connection to a bidirectional message stream. Use
it for chat, presence, collaborative editing and live dashboards; use SSE when
the flow is server-to-client only.

```rust
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router,
};

async fn socket(upgrade: WebSocketUpgrade) -> impl IntoResponse {
    upgrade.on_upgrade(handle)
}

async fn handle(mut socket: WebSocket) {
    while let Some(Ok(message)) = socket.recv().await {
        match message {
            Message::Text(text) => {
                if socket.send(Message::Text(text.to_uppercase().into())).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
}

fn app() -> Router {
    Router::new().route("/ws", get(socket))
}
```

WebSockets have no automatic reconnection, no backpressure beyond the TCP
buffer, and no built-in authentication after the upgrade. Authenticate during
the handshake (cookie, token in a subprotocol or a short-lived ticket), cap
message size, set ping/pong keepalives, and design application-level
acknowledgements if messages must not be lost. `tokio-tungstenite` is the
client; `fastwebsockets` and `axum::extract::ws` are server options. Broadcast
to many clients through a `tokio::sync::broadcast` channel or a pub/sub system
such as Redis, not by holding a lock over a list of sockets.

## 4.19 Server-Sent Events

SSE is a long-lived HTTP response with `text/event-stream` events. It
reconnects automatically in browsers, survives proxies better than WebSockets
and is one-directional.

```rust
use axum::response::sse::{Event, Sse};
use futures::stream::{self, Stream};
use std::{convert::Infallible, time::Duration};

async fn events() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = stream::unfold(0_u64, |counter| async move {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let event = Event::default().event("tick").data(counter.to_string());
        Some((Ok(event), counter + 1))
    });
    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default())
}

// Router::new().route("/events", get(events))
```

Send an `id:` with each event and support `Last-Event-ID` if clients must
resume. Disable proxy buffering (`X-Accel-Buffering: no` for nginx), set
`Cache-Control: no-cache`, and send a comment heartbeat so idle connections are
not cut. SSE is a good fit for notifications and progress; it is not a
replacement for bidirectional protocols.

## 4.20 Background jobs and task scheduling

A background job is work that must not block the request: sending email,
resizing images, syncing a third party, generating a report. Run it in a
durable queue, not in a detached `tokio::spawn`, if losing it on a crash
matters.

```rust
use tokio_cron_scheduler::{Job, JobScheduler};

async fn scheduler() -> Result<(), Box<dyn std::error::Error>> {
    let scheduler = JobScheduler::new().await?;
    scheduler
        .add(Job::new_async("0 */5 * * * *", |_id, _lock| {
            Box::pin(async {
                println!("every five minutes");
            })
        })?)
        .await?;
    scheduler.start().await?;
    Ok(())
}
```

`tokio-cron-scheduler` runs in-process cron jobs; `fang` and `apalis` provide
Postgres/Redis-backed queues with retries; `celery-rs` speaks the Celery
protocol. In-process scheduling duplicates work when several replicas run:
either run one scheduler instance with a leader lock, or use a distributed
queue. Make every job **idempotent** and bounded (timeout, retry limit,
dead-letter), record its status, and expose it for support. A job that calls a
third party needs a circuit breaker and a backoff, not a tight retry loop.

## 4.21 API versioning strategies

- **URI versioning** (`/v1/orders`): visible, easy to route and cache, but the
  version is in every URL and clients pin early.
- **Header versioning** (`API-Version: 2026-11-01`): clean URLs, harder to
  test in a browser, good for date-based contracts.
- **Media-type versioning** (`application/vnd.api+json;version=2`): precise,
  verbose, rarely used outside public APIs.
- **Additive evolution**: new optional fields and endpoints without a version
  bump. The cheapest strategy if you can keep compatibility.

Whichever you choose, define a **deprecation policy**: announce, emit
`Deprecation` and `Sunset` headers, log usage by client, keep at least one
previous version during migration, and remove on a published date. Never change
the meaning of an existing field or status code in place. Version the schema of
events and messages too, not only HTTP.

## 4.22 Rate limiting and throttling

Rate limiting protects availability and fairness. Token bucket and leaky bucket
allow bursts; fixed and sliding windows are simpler to explain; concurrency
limits protect a downstream service.

```rust
use std::time::{Duration, Instant};

struct TokenBucket {
    capacity: f64,
    tokens: f64,
    refill_per_second: f64,
    last: Instant,
}

impl TokenBucket {
    fn new(capacity: f64, refill_per_second: f64) -> Self {
        Self { capacity, tokens: capacity, refill_per_second, last: Instant::now() }
    }

    fn allow(&mut self, cost: f64) -> bool {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last).as_secs_f64();
        self.last = now;
        self.tokens = (self.tokens + elapsed * self.refill_per_second).min(self.capacity);
        if self.tokens >= cost {
            self.tokens -= cost;
            true
        } else {
            false
        }
    }
}

fn main() {
    let mut bucket = TokenBucket::new(10.0, 2.0);
    let allowed = (0..15).filter(|_| bucket.allow(1.0)).count();
    println!("{allowed}");
    let _ = Duration::from_secs(1);
}
```

For one instance, keep the bucket in memory. For many replicas, use Redis with a
Lua script or a service such as Envoy/`tower_governor` at the edge. Key by API
key, user or IP, and return `429` with `Retry-After`, `RateLimit-Limit`,
`RateLimit-Remaining` and `RateLimit-Reset`. Do not let an unauthenticated
client consume the same budget as a trusted one; do not trust `X-Forwarded-For`
unless a known proxy sets it. Rate limiting is not a DDoS defence on its own;
that belongs to the network edge.

## 4.23 Health checks, readiness and liveness

Expose separate endpoints with different meanings:

- **`/healthz` (liveness)**: the process is alive and the runtime is making
  progress. Do not check dependencies; a database outage must not restart every
  replica.
- **`/readyz` (readiness)**: the instance can serve traffic now — migrations
  applied, pool connected, schema loaded. Remove it from the load balancer
  before shutdown.
- **`/startupz`**: for slow initialisation, tell the orchestrator when to begin
  liveness checks.

```rust
use axum::{extract::State, http::StatusCode, routing::get, Router};
use sqlx::PgPool;

async fn ready(State(pool): State<PgPool>) -> StatusCode {
    match sqlx::query("SELECT 1").execute(&pool).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

fn app(pool: PgPool) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(ready))
        .with_state(pool)
}
```

Give each check a short timeout, cache the result for a few seconds so a probe
storm does not hammer the database, and keep the endpoint unauthenticated but
free of sensitive detail. In Kubernetes, set `initialDelaySeconds`,
`periodSeconds`, `timeoutSeconds` and `failureThreshold` from measured start-up
time, not guesses.

## 4.24 OpenAPI and Swagger documentation

`utoipa` derives OpenAPI schemas from handler types; `aide` integrates with
Axum and generates the document plus a Swagger UI route. Documentation that is
generated from the code cannot silently drift.

```rust
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;

#[derive(ToSchema, serde::Serialize)]
struct Health {
    status: String,
}

#[utoipa::path(get, path = "/healthz", responses((status = 200, body = Health)))]
async fn healthz() -> axum::Json<Health> {
    axum::Json(Health { status: "ok".to_string() })
}

#[derive(OpenApi)]
#[openapi(paths(healthz), components(schemas(Health)))]
struct ApiDoc;

fn docs() -> axum::Router {
    axum::Router::new().merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
}
```

Document error shapes, authentication schemes, pagination parameters and
idempotency headers as well as success responses. Add examples; they catch
schema mistakes and make client generation useful. Validate the generated
document in CI, and treat a breaking schema change as a versioning event.
`aide` and `utoipa` both integrate with `axum`; `paperclip` is another option.

## 4.25 Pagination, filtering, sorting and cursors

Offset pagination (`?limit=20&offset=40`) is simple and unstable under
inserts: a row can appear twice or be skipped. **Keyset (cursor) pagination**
uses the last seen sort key and is stable and index-friendly.

```rust
#[derive(serde::Deserialize)]
struct Page {
    #[serde(default = "default_limit")]
    limit: u32,
    after: Option<i64>,
}

fn default_limit() -> u32 {
    20
}

async fn list(pool: &sqlx::PgPool, page: Page) -> sqlx::Result<Vec<(i64, String)>> {
    let limit = page.limit.min(100) as i64;
    let rows = sqlx::query_as::<_, (i64, String)>(
        "SELECT id, name FROM items
         WHERE ($1::bigint IS NULL OR id > $1)
         ORDER BY id ASC
         LIMIT $2",
    )
    .bind(page.after)
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}
```

Return an opaque cursor (base64 of the sort key, signed if clients must not
forge it), a `next` field and a `has_more` flag. Sort by a unique key, or add
`id` as a tiebreaker to a non-unique sort column. Cap `limit`; reject negative
offsets. For filtering, whitelist field names and bind values; never interpolate
a column name from a query string. For sorting, map an enum of allowed fields to
SQL fragments. Document the maximum page size and the meaning of an empty
`next`.

## 4.26 Graceful shutdown

A production server must stop accepting new work, finish in-flight requests,
close pools and flush telemetry. Axum supports this with
`with_graceful_shutdown`; the same idea applies to the other frameworks.

```rust
use axum::{routing::get, Router};
use tokio::signal;

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("install Ctrl-C handler");
    };
    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    println!("shutdown requested");
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(|| async { "ok" }));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}
```

Order the shutdown: mark readiness false, wait for the load balancer to remove
the instance, stop accepting connections, wait for handlers (with a hard
deadline), stop background workers, flush traces/logs, close the pool, exit.
Kubernetes sends `SIGTERM` and then `SIGKILL` after
`terminationGracePeriodSeconds`; make the deadline shorter than that. A
`CancellationToken` from `tokio-util` is a clean way to tell background tasks to
stop. Test shutdown under load, not only on an idle server.

## Exercises

:::exercise guided Validate a request body
Add a `POST /users` handler that accepts `{ "email": "...", "age": ... }`,
rejects an email without `@`, rejects an age below 13, returns `422` with a
field-specific error, and returns `201` with the created user. Keep validation
in a `fn validate(input: &CreateUser) -> Result<(), ApiError>` so it can be
unit-tested without HTTP.
::hint
Deserialise with `Json<CreateUser>`, call `validate`, and match the result. An
`ApiError` should carry a status, a code and a message; implement
`IntoResponse` or return `(StatusCode, Json<ApiError>)`. Keep the handler thin:
parse, validate, call the domain function, map the result.
::solution
```rust
use axum::{http::StatusCode, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct CreateUser {
    email: String,
    age: u8,
}

#[derive(Serialize)]
struct User {
    id: u64,
    email: String,
}

#[derive(Serialize)]
struct ErrorBody {
    code: &'static str,
    field: &'static str,
    message: &'static str,
}

fn validate(input: &CreateUser) -> Result<(), (StatusCode, Json<ErrorBody>)> {
    if !input.email.contains('@') {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorBody { code: "invalid_email", field: "email", message: "must contain @" }),
        ));
    }
    if input.age < 13 {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(ErrorBody { code: "too_young", field: "age", message: "must be at least 13" }),
        ));
    }
    Ok(())
}

async fn create(Json(input): Json<CreateUser>) -> Result<(StatusCode, Json<User>), (StatusCode, Json<ErrorBody>)> {
    validate(&input)?;
    Ok((StatusCode::CREATED, Json(User { id: 1, email: input.email })))
}

fn app() -> Router {
    Router::new().route("/users", post(create))
}

fn main() {
    let _ = app();
}
```
:::

:::exercise practice Paginated SQLx endpoint
Implement `GET /items?limit=&after=` backed by SQLx with keyset pagination on
`id`. Return `{ "items": [...], "next": 42 }`. Clamp the limit to 1–100, return
400 for an invalid cursor, and test the query against SQLite in memory.
::hint
Use `sqlx::SqlitePool::connect("sqlite::memory:")`, create the table, insert
rows, and call the handler function directly with query parameters. Bind
`after` as `Option<i64>` and use `WHERE (?1 IS NULL OR id > ?1)`. The cursor is
the last id in the page.
::solution
```rust
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, FromRow, SqlitePool};

#[derive(Deserialize)]
struct Query {
    limit: Option<u32>,
    after: Option<i64>,
}

#[derive(Serialize, FromRow)]
struct Item {
    id: i64,
    name: String,
}

#[derive(Serialize)]
struct Page {
    items: Vec<Item>,
    next: Option<i64>,
}

async fn list(pool: &SqlitePool, query: Query) -> Result<Page, &'static str> {
    let limit = query.limit.unwrap_or(20).clamp(1, 100) as i64;
    let items = sqlx::query_as::<_, Item>(
        "SELECT id, name FROM items WHERE (?1 IS NULL OR id > ?1) ORDER BY id LIMIT ?2",
    )
    .bind(query.after)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|_| "database error")?;

    let next = if items.len() as i64 == limit { items.last().map(|item| item.id) } else { None };
    Ok(Page { items, next })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = SqlitePoolOptions::new().connect("sqlite::memory:").await?;
    sqlx::query("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
        .execute(&pool)
        .await?;
    for id in 1..=5 {
        sqlx::query("INSERT INTO items (id, name) VALUES (?1, ?2)")
            .bind(id)
            .bind(format!("item-{id}"))
            .execute(&pool)
            .await?;
    }

    let page = list(&pool, Query { limit: Some(2), after: None }).await?;
    println!("{:?} next={:?}", page.items.iter().map(|item| item.id).collect::<Vec<_>>(), page.next);
    Ok(())
}
```
:::

:::exercise challenge A production-shaped service
Build a small service with: Axum; `tower-http` tracing, CORS and timeout;
`/healthz` and `/readyz`; a token-bucket rate limiter keyed by API key; an
`/openapi.json` document; request-id propagation; and graceful shutdown on
`SIGTERM`. Add integration tests with `tower::ServiceExt::oneshot`, and a
`docker-compose.yml` with Postgres and Redis. Write down the failure behaviour
when Postgres is down but the process is healthy.
::hint
Keep the layers in a `fn app(state) -> Router` so tests can call it. A request
id middleware inserts a header and a tracing span field. For the rate limiter,
use `tower_governor` or a small `Mutex<HashMap<String, TokenBucket>>` for the
exercise and note that it does not work across replicas. Readiness should
return 503 when the pool cannot execute `SELECT 1`; liveness should stay 200.
::solution
```rust
use axum::{extract::State, http::StatusCode, routing::get, Router};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tower::ServiceBuilder;
use tower_http::{timeout::TimeoutLayer, trace::TraceLayer};

struct Bucket { tokens: f64, last: Instant }

#[derive(Clone)]
struct AppState {
    buckets: Arc<Mutex<std::collections::HashMap<String, Bucket>>>,
}

fn allow(state: &AppState, key: &str) -> bool {
    const CAPACITY: f64 = 10.0;
    const RATE: f64 = 2.0;
    let mut buckets = state.buckets.lock().unwrap();
    let bucket = buckets.entry(key.to_string()).or_insert(Bucket { tokens: CAPACITY, last: Instant::now() });
    let now = Instant::now();
    let elapsed = now.duration_since(bucket.last).as_secs_f64();
    bucket.last = now;
    bucket.tokens = (bucket.tokens + elapsed * RATE).min(CAPACITY);
    if bucket.tokens >= 1.0 {
        bucket.tokens -= 1.0;
        true
    } else {
        false
    }
}

async fn healthz() -> StatusCode { StatusCode::OK }

async fn readyz(State(state): State<AppState>) -> StatusCode {
    // In a real service: run `SELECT 1` against the pool with a timeout.
    if state.buckets.lock().is_ok() { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }
}

async fn protected(State(state): State<AppState>, headers: axum::http::HeaderMap) -> StatusCode {
    let key = headers.get("x-api-key").and_then(|value| value.to_str().ok()).unwrap_or("anonymous");
    if allow(&state, key) { StatusCode::OK } else { StatusCode::TOO_MANY_REQUESTS }
}

fn app(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/protected", get(protected))
        .with_state(state)
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(TimeoutLayer::new(Duration::from_secs(5))),
        )
}

#[tokio::main]
async fn main() {
    let state = AppState { buckets: Arc::new(Mutex::new(Default::default())) };
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    axum::serve(listener, app(state)).await.unwrap();
}
```

Liveness 200 with readiness 503 is the correct pair: the process is not
restarted, but traffic is removed until the dependency returns. The in-memory
bucket above is per-replica and resets on restart; a production rate limit uses
Redis or the edge gateway.
:::

## Quiz

:::quiz Backend check
? What is the difference between authentication and authorisation?
- They are the same check at different layers
+ Authentication establishes identity; authorisation decides whether that identity may perform the action on the resource
- Authorisation happens only in the browser
- Authentication is only for API keys
= A valid token proves who the caller is. A policy still has to decide whether that caller may read or modify this particular object.

? Why is `sqlx::query!` compile-time checked?
+ It runs the query during compilation against the database schema or an offline cache
- It only checks syntax
- It embeds the whole database in the binary
- It disables runtime errors
= The macro connects to `DATABASE_URL` (or reads `.sqlx`) at build time, so column names and types are validated before the binary ships. Runtime errors such as constraint violations remain.

? Which pagination style is stable when rows are inserted during traversal?
- Offset with a large page size
+ Keyset/cursor pagination on a unique, ordered key
- `SELECT *` and sorting in memory
- Random page numbers
= Keyset pagination continues after the last seen key, so inserts before or after it do not duplicate or skip rows. Offset shifts when the underlying set changes.

? What should a liveness probe check?
- That the database is reachable
+ That the process is running and the runtime is making progress
- That every dependency is healthy
- That the disk has free space
= A liveness failure restarts the process. Checking a shared dependency would restart every replica during a database outage. Readiness is the probe that reflects dependencies.

? What is the main reason to make message consumers idempotent?
- Brokers always deliver exactly once
+ At-least-once delivery can repeat a message, so the side effect must be safe to apply twice
- It makes the queue faster
- It removes the need for acknowledgements
= Retries and redeliveries are normal. Store processed message ids or use an upsert keyed by a natural id, and acknowledge only after the effect is durable.
:::

:::recap
- Axum, Actix-web, Rocket and Warp all serve production APIs; Axum's `tower` layers compose with the rest of the ecosystem.
- REST is a contract: nouns in paths, methods as verbs, meaningful status codes, stable error shapes and idempotency.
- GraphQL trades one flexible endpoint for depth limits and N+1 work; gRPC trades HTTP familiarity for typed streaming RPC.
- Middleware order matters; tracing outermost, timeouts around handlers, rate limits at the edge.
- JWT must be verified with an algorithm allow-list and claims checks; sessions need CSRF protection and secure cookies.
- Authorisation belongs on the server for every object and every list query.
- SQLx, Diesel and SeaORM differ in checking and style; bind parameters and pool connections deliberately.
- Migrations are forward-only in production: add, backfill, constrain, and index concurrently.
- Redis caches, queues and brokers each have delivery semantics; make consumers idempotent.
- Cache keys include tenant and version; set TTLs and protect against stampedes.
- `tracing` spans, typed configuration and `serde` formats are the observability and input layer.
- Uploads, WebSockets and SSE need size limits, authentication and reconnection design.
- Version APIs explicitly, limit rates with shared state, expose liveness and readiness separately, and shut down gracefully.
- OpenAPI generated from types keeps documentation honest.
:::
