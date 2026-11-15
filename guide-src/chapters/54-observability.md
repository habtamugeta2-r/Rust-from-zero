@id observability
@part p10
@title Observability: logging, traces, metrics, and health
@short Observability & telemetry
@level intermediate
@time 55
@learn Emit structured JSON logs and spans with `tracing` and `tracing-subscriber` | Avoid async span bugs by using `.instrument()` instead of `.entered()` across `.await` | Propagate request IDs and W3C trace contexts across tasks and HTTP calls | Export distributed traces with OpenTelemetry and OTLP | Record counters, gauges, and histograms with `metrics` and serve `/metrics` | Separate `/health/live` and `/health/ready` probes cleanly

For a small local program, `println!` or `dbg!` can help inspect what happened. In a concurrent service, interleaved output can be difficult to search or connect across components. **Observability** is the practice of exposing useful signals about a running system so that operators can investigate its behaviour. This chapter introduces structured logs, traces, metrics and health checks, and explains the questions each can answer.

**Observability** is designing a program so that operators can understand what is happening inside it purely from its external signals. In production Rust services, those signals rest on three pillars: structured logs, distributed traces, and numeric metrics — paired with health endpoints so load balancers know when an instance can take traffic.

:::plain Logs, metrics, and traces
Three signals answer three different questions about a running service. **Logs** are discrete events, cheap to write and expensive to search at scale, best emitted as one JSON object per line with fields you can filter on. **Metrics** are counters, gauges and histograms — aggregated numbers that make dashboards and alerts possible. **Traces** follow one request through every service as a tree of timed spans, which is the only one of the three that shows you *where* inside a slow request the time went. `tracing` produces spans and events; `tracing-subscriber` decides whether they become text, JSON, or OpenTelemetry spans, and `RUST_LOG` changes the level at run time without a rebuild.
:::

:::analogy The cockpit instruments and the black box
Flying an aircraft at night without instruments and reading a crash note afterwards is like debugging a production outage with scattered `println!` lines. Modern aircraft carry two complementary systems: live cockpit gauges (speed, altitude, fuel flow — your **metrics** and **health checks**) and flight-data recorders that record timestamped events linked to exact flight legs (**logs** and **traces**). Together they let you notice a rising engine temperature *before* anything catches fire, and reconstruct the exact chain of events if something fails.
:::

## The three pillars: logs, traces, and metrics

| Pillar | What it answers | Example | Typical Rust crate |
|---|---|---|---|
| **Logs** | What discrete event happened at this moment, and with what fields? | `order failed order_id=42 err="card declined"` | `tracing` + `tracing-subscriber` |
| **Traces** | Where did one request spend its time across async tasks and services? | `GET /checkout` (84 ms) -> `charge_card` (71 ms) | `tracing` + `tracing-opentelemetry` |
| **Metrics** | How many, how full, or how fast overall? | `http_requests_total=18420`, p99 latency `45 ms` | `metrics` + `metrics-exporter-prometheus` |

Every signal serves a different question:

- **Metrics** are cheap to store and ideal for dashboards and alerts ("alert if 5xx error rate exceeds 1% for 5 minutes"), because millions of requests collapse into a handful of numbers.
- **Traces** capture the tree of nested steps (**spans**) for individual requests so you can see *why* a single request took 1.2 seconds or failed downstream.
- **Logs** record detailed events attached to those spans, searchable by exact identifiers such as `order_id` or `request_id`.

## Structured logging and spans with `tracing`

You met `tracing` and `log` in [chapter 60](#async-ecosystem). In a service, two upgrades turn development logging into production telemetry: **machine-readable JSON** and **runtime filtering with `EnvFilter`**.

```toml file=Cargo.toml
[dependencies]
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
```

Instead of calling the one-line `tracing_subscriber::fmt::init()`, real applications build a **`registry()`** and compose **layers** on top of it. That lets you swap formatting between local development and production, and later plug OpenTelemetry right into the same subscriber:

```rust ext check file=src/telemetry.rs
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, fmt};

/// Configures logging: compact human text locally, JSON lines in production.
pub fn init_logging(json_output: bool) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,my_service=debug,tower_http=info"));

    let registry = tracing_subscriber::registry().with(filter);

    if json_output {
        registry
            .with(
                fmt::layer()
                    .json()
                    .with_current_span(true)
                    .with_span_list(false)
                    .flatten_event(true),
            )
            .init();
    } else {
        registry.with(fmt::layer().compact()).init();
    }
}
```

- `EnvFilter::try_from_default_env()` reads `RUST_LOG` from the environment. If it is unset, the fallback keeps noisy libraries at `info` while keeping your own crate at `debug`.
- Setting `.json().flatten_event(true)` writes one JSON object per line so log collectors (Loki, Datadog, CloudWatch, Elasticsearch) index every field without fragile regular expressions:

```text
{"timestamp":"2026-11-14T10:12:04.118Z","level":"INFO","message":"order created","order_id":"ord_91","amount_cents":2450,"span":{"request_id":"a3f9...","name":"request"}}
```

### Annotating functions cleanly with `#[instrument]`

`#[tracing::instrument]` wraps a function in a span whose lifetime matches the call. In real handlers you almost always want to **skip** arguments that are huge (`state`, `pool`) or sensitive (`password`, `token`, `api_key`), and explicitly record only safe identifiers:

```rust
use tracing::{info, instrument};

#[instrument(
    name = "create_order",
    skip(pool, auth_token),
    fields(user_id = %user_id, item_count = items.len())
)]
async fn create_order(
    pool: &DbPool,
    auth_token: &str,
    user_id: u64,
    items: &[Item],
) -> Result<OrderId, OrderError> {
    info!("reserving inventory");
    // ...
    Ok(OrderId(42))
}
```

Notice the sigils in `fields(...)`:
- `%value` formats using `Display` (clean text, no surrounding quotes).
- `?value` formats using `Debug` (useful for enums and structs).
- **`skip(...)` is mandatory for secrets and non-`Debug` types.** Never let `auth_token` or a password struct end up in span attributes.

:::warn Never hold `span.enter()` across an `.await`
Entering a span synchronously (`let _guard = span.enter();`) records "this OS thread is now inside `span`" until `_guard` drops. In async Rust, a [[task]] can pause at `.await`, another task can resume on the *same* OS thread while `_guard` is still inside the suspended [[future]], and the logs of both tasks become scrambled.

Always attach spans to async work with **`.instrument(span)`** (from `tracing::Instrument`), or use `#[tracing::instrument]` on `async fn`, which expands to `.instrument(...)` automatically:

```rust
use tracing::{Instrument, info_span};

// WRONG: `_guard` stays alive across `.await`
let span = info_span!("bad_sync_enter", job_id = 7);
let _guard = span.enter();
// do_async_work().await; // <- breaks span nesting!

// RIGHT: the span enters only while this future is actively polled
let span = info_span!("process_job", job_id = 7);
do_async_work().instrument(span).await;
```

Even `tokio::spawn` drops span context unless you attach it to the spawned future: `tokio::spawn(run_job(id).instrument(tracing::Span::current()))`.
:::

## Request IDs and correlation across hops

When two hundred clients call `/checkout` at the same second, seeing `WARN card gateway timed out` in the log tells you nothing unless you know **which request** timed out, which route triggered it, and what happened right before and after.

In Axum + `tower-http`, three layers solve this cleanly:

1. `SetRequestIdLayer::x_request_id(MakeRequestUuid)` checks whether the incoming request already has an `x-request-id` header; if not, it generates a fresh UUID v4.
2. `TraceLayer::new_for_http()` creates one `request` span per request and copies `x-request-id` onto that span via `make_span_with`.
3. `PropagateRequestIdLayer::x_request_id()` copies `x-request-id` onto the HTTP response so clients and support engineers can quote it back when reporting a bug.

```toml file=Cargo.toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.7", features = ["request-id", "trace", "util"] }
tracing = "0.1"
```

```rust file=src/main.rs
use axum::http::Request;
use axum::routing::get;
use axum::Router;
use tower::ServiceBuilder;
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::{DefaultOnResponse, TraceLayer};
use tracing::Level;

async fn checkout() -> &'static str {
    tracing::info!("validating cart");
    "ok"
}

fn app() -> Router {
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|req: &Request<_>| {
            let req_id = req
                .headers()
                .get("x-request-id")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("-");
            tracing::info_span!(
                "http_request",
                method = %req.method(),
                uri = %req.uri(),
                request_id = %req_id,
            )
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO));

    Router::new()
        .route("/checkout", get(checkout))
        .layer(
            ServiceBuilder::new()
                // Top layer runs FIRST on incoming requests:
                .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
                // So TraceLayer sees the generated x-request-id:
                .layer(trace_layer)
                // And PropagateRequestIdLayer copies it to the response:
                .layer(PropagateRequestIdLayer::x_request_id()),
        )
}
```

:::tip Layer order matters in `ServiceBuilder`
`ServiceBuilder` applies layers from top to bottom on the *incoming* request (and in reverse on the response). Always place `SetRequestIdLayer` **above** `TraceLayer` so the request ID exists before `make_span_with` reads it. If you flip them, `request_id` shows up as `"-"` on every span!
:::

When your service calls another HTTP API with `reqwest`, pass the correlation header along so the downstream service logs the same ID:

```rust
use axum::http::HeaderMap;

async fn call_billing(client: &reqwest::Client, incoming_headers: &HeaderMap) -> reqwest::Result<reqwest::Response> {
    let mut req = client.post("http://billing.internal/charge");
    if let Some(req_id) = incoming_headers.get("x-request-id").and_then(|v| v.to_str().ok()) {
        req = req.header("x-request-id", req_id);
    }
    req.send().await
}
```

## Distributed tracing with OpenTelemetry and OTLP

Request IDs link log lines by text search. **OpenTelemetry** takes the next step: it turns `tracing` spans into structured timing trees and exports them over **OTLP** (OpenTelemetry Protocol) to collectors such as Jaeger, Grafana Tempo, Honeycomb, or an OpenTelemetry Collector sidecar.

Why does `tracing-opentelemetry` fit Rust so naturally? Because your application code still uses ordinary `tracing::info_span!`, `#[tracing::instrument]`, and `tracing::info!`. Adding OpenTelemetry only adds one more layer inside `tracing_subscriber::registry()`:

```toml file=Cargo.toml
[dependencies]
opentelemetry = "0.28"
opentelemetry_sdk = { version = "0.28", features = ["rt-tokio"] }
opentelemetry-otlp = { version = "0.28", features = ["tonic"] }
tracing = "0.1"
tracing-opentelemetry = "0.29"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
```

```rust file=src/otel.rs
use opentelemetry::global;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::SpanExporter;
use opentelemetry_sdk::propagation::TraceContextPropagator;
use opentelemetry_sdk::trace::SdkTracerProvider;
use opentelemetry_sdk::Resource;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, fmt};

pub fn init_telemetry(service_name: &'static str) -> Result<SdkTracerProvider, Box<dyn std::error::Error>> {
    // Use standard W3C `traceparent` / `tracestate` headers across HTTP calls
    global::set_text_map_propagator(TraceContextPropagator::new());

    // Reads OTEL_EXPORTER_OTLP_ENDPOINT from the environment (default: http://localhost:4317)
    let exporter = SpanExporter::builder().with_tonic().build()?;

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(Resource::builder().with_service_name(service_name).build())
        .build();

    let tracer = provider.tracer(service_name);
    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().json())
        .with(otel_layer)
        .init();

    Ok(provider)
}
```

Two practical rules for OpenTelemetry in production:

1. **Always flush on shutdown.** The batch exporter buffers spans in memory and sends them every few seconds. Keep the `SdkTracerProvider` handle in `main` and call `let _ = provider.shutdown();` after `axum::serve(...).with_graceful_shutdown(...)` finishes, or the final spans of a shutting-down container are lost.
2. **Propagate `traceparent` across service boundaries.** `TraceContextPropagator` reads and writes the standard W3C `traceparent: 00-<trace-id>-<span-id>-01` HTTP header so an upstream trace ID continues seamlessly inside downstream services. Crates such as `reqwest-tracing` or a small middleware injecting `global::get_text_map_propagator(...)` automate this header injection.

## Metrics with `metrics` and Prometheus

Logs and traces tell stories about individual requests. When traffic spikes to 20,000 requests per second, you cannot inspect every request — you need **metrics** that answer "what is the p99 latency and 5xx rate right now?".

The `metrics` crate works like `tracing` or `log`: libraries and handlers call macros (`counter!`, `gauge!`, `histogram!`), while `main` installs one exporter such as `metrics-exporter-prometheus`.

| Metric type | Behaviour | When to use it |
|---|---|---|
| `counter!` | Only goes up (resets on restart); Prometheus turns it into a rate | Request counts, error counts, jobs processed |
| `gauge!` | Goes up and down freely | Active DB connections, queue length, items in cache |
| `histogram!` | Collects observations into latency/size buckets | Request latency (seconds), payload sizes (bytes) |

```toml file=Cargo.toml
[dependencies]
axum = "0.8"
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
tokio = { version = "1", features = ["full"] }
```

```rust file=src/metrics_demo.rs
use std::time::Instant;

use axum::extract::{MatchedPath, Request, State};
use axum::middleware::{self, Next};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

async fn track_metrics(req: Request, next: Next) -> impl IntoResponse {
    let start = Instant::now();
    let method = req.method().as_str().to_owned();
    // Use the route *template* ("/users/{id}"), never the raw URL ("/users/42")!
    let path = req
        .extensions()
        .get::<MatchedPath>()
        .map(|p| p.as_str().to_owned())
        .unwrap_or_else(|| String::from("unmatched"));

    gauge!("http_requests_in_flight").increment(1.0);
    let response = next.run(req).await;
    gauge!("http_requests_in_flight").decrement(1.0);

    let status = response.status().as_u16().to_string();
    let elapsed = start.elapsed().as_secs_f64();

    counter!(
        "http_requests_total",
        "method" => method.clone(),
        "path" => path.clone(),
        "status" => status
    )
    .increment(1);

    histogram!(
        "http_request_duration_seconds",
        "method" => method,
        "path" => path
    )
    .record(elapsed);

    response
}

async fn render_metrics(State(handle): State<PrometheusHandle>) -> String {
    handle.render()
}

pub fn router_with_metrics() -> Result<Router, Box<dyn std::error::Error>> {
    let handle = PrometheusBuilder::new().install_recorder()?;

    let api = Router::new()
        .route("/users/{id}", get(|| async { "user" }))
        .route_layer(middleware::from_fn(track_metrics));

    let ops = Router::new()
        .route("/metrics", get(render_metrics))
        .with_state(handle);

    Ok(api.merge(ops))
}
```

When Prometheus scrapes `GET /metrics`, it receives standard text lines ready for Grafana charts:

```text
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/users/{id}",status="200"} 142
# TYPE http_request_duration_seconds summary
http_request_duration_seconds_count{method="GET",path="/users/{id}"} 142
```

:::warn Beware of cardinality explosion in metric labels
Every unique combination of `(label_name, label_value)` allocates a separate time series in memory — permanently until restart. Putting `user_id`, `email`, `request_id`, or raw paths (`/users/1`, `/users/2`, …, `/users/999999`) in a metric label creates millions of series and crashes either your service or Prometheus.

Keep metric labels to **small, bounded sets** (`method`, route template via `MatchedPath`, coarse `status` class). High-cardinality IDs belong in **logs and traces**, never in metric labels.
:::

## Health and readiness probes

Orchestrators such as Kubernetes, Amazon ECS, and Nomad continuously ask your container two distinct questions:

1. **Liveness (`GET /health/live`)** — *"Is this process stuck or deadlocked? Should I kill and restart it?"*
   - Must do **zero external I/O**. Do **not** query the database or Redis here! If your database goes down for 5 seconds and `/health/live` returns 500, the orchestrator restarts all healthy app servers at once — turning a brief database hiccup into a full outage.
2. **Readiness (`GET /health/ready`)** — *"Should the load balancer send user traffic to this instance right now?"*
   - Checks critical dependencies (for example, `SELECT 1` on the SQLx pool under a tight timeout) and returns `200 OK` when ready or `503 Service Unavailable` when warming up, overloaded, or temporarily unable to reach the database.

```rust ext run
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

#[derive(Clone)]
struct ProbeState {
    db_healthy: Arc<AtomicBool>,
}

#[derive(Serialize)]
struct ProbeBody {
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    db: Option<&'static str>,
}

/// Liveness: cheap in-process answer. Never blocks on external services.
async fn live() -> (StatusCode, Json<ProbeBody>) {
    (StatusCode::OK, Json(ProbeBody { status: "alive", db: None }))
}

/// Readiness: checks critical dependencies within a strict timeout.
async fn ready(State(state): State<ProbeState>) -> (StatusCode, Json<ProbeBody>) {
    let check = tokio::time::timeout(Duration::from_millis(200), async {
        // In production: `sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.pool).await.is_ok()`
        state.db_healthy.load(Ordering::Relaxed)
    })
    .await;

    match check {
        Ok(true) => (
            StatusCode::OK,
            Json(ProbeBody { status: "ready", db: Some("ok") }),
        ),
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ProbeBody { status: "not_ready", db: Some("unavailable") }),
        ),
    }
}

#[tokio::main]
async fn main() {
    let healthy = Arc::new(AtomicBool::new(true));
    let app = Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .with_state(ProbeState { db_healthy: healthy.clone() });

    send(&app, "/health/live").await;
    send(&app, "/health/ready").await;

    healthy.store(false, Ordering::Relaxed);
    send(&app, "/health/live").await;
    send(&app, "/health/ready").await;
}
#
# async fn send(app: &Router, path: &str) {
#     use tower::ServiceExt;
#     let req = axum::http::Request::builder().uri(path).body(axum::body::Body::empty()).unwrap();
#     let res = app.clone().oneshot(req).await.unwrap();
#     let status = res.status();
#     let body = axum::body::to_bytes(res.into_body(), usize::MAX).await.unwrap();
#     println!("GET {path} -> {status}  {}", String::from_utf8_lossy(&body));
# }
```
```output
GET /health/live -> 200 OK  {"status":"alive"}
GET /health/ready -> 200 OK  {"status":"ready","db":"ok"}
GET /health/live -> 200 OK  {"status":"alive"}
GET /health/ready -> 503 Service Unavailable  {"status":"not_ready","db":"unavailable"}
```

Also keep `/health/*` and `/metrics` quiet: either attach `TraceLayer` only to your business router or exclude probe paths in your logging filter/middleware, and make sure `/metrics` is not exposed directly to the public internet (serve it on an internal admin port or restrict it at your reverse proxy).

:::compare Observability in Rust vs Python, Go, and Java
- **Python (`logging` / `structlog`) and Node (`pino`)**: Easy to start, but async correlation relies on thread-local or `AsyncLocalStorage` context variables, and logging adds measurable CPU and reflection overhead per call.
- **Go (`log/slog` + OpenTelemetry)**: Clean standard structured logger, though you pass `context.Context` explicitly into every function to carry trace spans.
- **Rust (`tracing`)**: Span filtering compiles down to fast integer bitmasks checked *before* formatting arguments, so disabled `debug!` / `trace!` logs cost a few nanoseconds. And instead of wiring a `Context` parameter through every function signature, `.instrument(span)` rides directly inside the state machine of each `async` [[future]].
:::

:::recap
- Logs record discrete events, traces track timing trees across async tasks and services, and metrics aggregate numbers for alerts and dashboards.
- Compose `tracing_subscriber::registry()` with `EnvFilter`, `fmt::layer().json()` in production, and `tracing_opentelemetry::layer()` for OTLP spans.
- Never hold `span.enter()` across an `.await`. Attach spans to futures with `.instrument(span)` or `#[tracing::instrument]`.
- Always `skip(...)` passwords, tokens, and huge values in `#[instrument]`.
- Place `SetRequestIdLayer` above `TraceLayer` in `ServiceBuilder` so request spans record the ID, and propagate `x-request-id` / `traceparent` to downstream services.
- Keep Prometheus labels low-cardinality (use `MatchedPath`, never user IDs or raw URLs).
- Separate `/health/live` (fast in-process check, never touches the DB) from `/health/ready` (bounded dependency check returning 200 or 503).
:::

:::quiz Check your understanding
? Why should you avoid calling `let _guard = span.enter();` before an `.await` inside an `async fn`?
- Because `enter()` is deprecated in Rust 2024
- Because `tracing` drops all spans when `tokio` starts
+ Because the guard stays active on the thread while the future is paused, corrupting span trees for other tasks polled on that thread
- Because `.enter()` panics inside Tokio tasks
= An entered guard marks the *current thread* until dropped. When an async task suspends at `.await`, another task can run on that thread and inherit the wrong parent span. Use `.instrument(span)` instead.

? A handler has `#[tracing::instrument(skip(password))]` on `async fn login(email: String, password: String)`. Why is `skip(password)` essential?
- Because `String` does not implement `Debug`
+ Because `#[instrument]` otherwise records every argument into span attributes and logs, which would expose user passwords in log files
- Because Tokio only allows one parameter to be instrumented
- Because `skip` makes the function run without spawning a task
= Never log secrets, API keys, or tokens. Use `skip(...)` on sensitive or large parameters, and prefer logging only safe IDs.

? In Axum with `ServiceBuilder`, you notice `request_id` is empty inside `TraceLayer`'s `make_span_with`, even though `SetRequestIdLayer` is present. What is the likeliest cause?
- `SetRequestIdLayer` only works on `POST` requests
+ `TraceLayer` was placed above `SetRequestIdLayer`, so it ran before the header was set
- UUIDs cannot be stored in HTTP headers
- `PropagateRequestIdLayer` deletes the request header before handlers run
= `ServiceBuilder` runs layers top-to-bottom on incoming requests. `SetRequestIdLayer` must appear *above* `TraceLayer` so the ID exists when `make_span_with` inspects the headers.

? Why should metric labels use `MatchedPath` (`/users/{id}`) instead of `req.uri().path()` (`/users/42`)?
- `MatchedPath` is faster to parse than UTF-8 strings
+ Raw paths with unbounded IDs cause cardinality explosion, exhausting memory in both the service and Prometheus
- Prometheus rejects labels containing digits
- `req.uri().path()` is only populated on `404` responses
= Each unique combination of metric label values creates a permanent time series. Keep metric labels bounded; put IDs in logs and traces.

? Your Postgres server restarts for 4 seconds. Which health endpoint should return `503 Service Unavailable`, and which should keep returning `200 OK`?
- Both should return `503` so Kubernetes restarts all containers immediately
+ `/health/ready` should return `503` to pause traffic, while `/health/live` should keep returning `200 OK` so the process is not restarted unnecessarily
- `/health/live` should return `503` and `/health/ready` should return `200`
- Neither should return `503`; return `404` instead
= Liveness checks whether the process itself is alive; readiness checks whether dependencies allow serving traffic. Restarting healthy pods during a brief DB blip causes cascading outages.
:::

:::exercise guided Configure JSON logging and safe instrumentation
Write a small library function `charge_user(user_id: u64, card_token: &str, amount_cents: u64)` annotated with `#[tracing::instrument]` so that `card_token` is **never** logged, `user_id` and `amount_cents` are recorded, and an `init_tracing(json: bool)` helper configures `tracing_subscriber` with `EnvFilter` (defaulting to `info`).
::hint
Use `#[tracing::instrument(skip(card_token))]` and check both `fmt::layer().json()` and `fmt::layer().compact()` under `tracing_subscriber::registry().with(filter)`.
::solution
```rust ext check file=src/main.rs
use tracing::{info, instrument};
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{EnvFilter, fmt};

fn init_tracing(json: bool) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let reg = tracing_subscriber::registry().with(filter);
    if json {
        reg.with(fmt::layer().json().flatten_event(true)).init();
    } else {
        reg.with(fmt::layer().compact()).init();
    }
}

#[instrument(skip(card_token), fields(user_id, amount_cents))]
async fn charge_user(user_id: u64, card_token: &str, amount_cents: u64) -> bool {
    // `card_token` is used here without ever entering span fields
    let _token_len = card_token.len();
    info!("payment authorised");
    true
}

#[tokio::main]
async fn main() {
    let use_json = std::env::var("LOG_FORMAT").as_deref() == Ok("json");
    init_tracing(use_json);
    charge_user(104, "tok_secret_live_999", 1999).await;
}
```

With `LOG_FORMAT=json`, the line prints `user_id` and `amount_cents` as structured JSON fields and omits `card_token` completely.
:::

:::exercise practice Liveness, readiness, and bounded metrics
Extend an Axum service so that:
1. `GET /health/live` always returns `200 OK` without checking the database.
2. `GET /health/ready` checks a `ping_db()` async flag under a 200 ms timeout and returns `503 Service Unavailable` if it times out or returns `false`.
3. A `track_metrics` middleware records `http_requests_total` using `MatchedPath` so `/items/1` and `/items/2` share the single label `path="/items/{id}"`, and `/health/*` routes are placed outside that middleware.
::hint
Build one `Router` for business routes (`api`) with `.route_layer(middleware::from_fn(track_metrics))`, and merge it with an `ops` router containing `/health/live`, `/health/ready`, and `/metrics`.
::solution
```rust file=src/main.rs
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use axum::extract::{MatchedPath, Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use metrics::{counter, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

#[derive(Clone)]
struct AppState {
    db_ok: Arc<AtomicBool>,
    metrics: PrometheusHandle,
}

async fn track_metrics(req: Request, next: Next) -> impl IntoResponse {
    let start = Instant::now();
    let method = req.method().as_str().to_owned();
    let path = req
        .extensions()
        .get::<MatchedPath>()
        .map(|m| m.as_str().to_owned())
        .unwrap_or_else(|| String::from("unmatched"));

    let res = next.run(req).await;
    let status = res.status().as_u16().to_string();
    counter!("http_requests_total", "method" => method.clone(), "path" => path.clone(), "status" => status).increment(1);
    histogram!("http_request_duration_seconds", "method" => method, "path" => path).record(start.elapsed().as_secs_f64());
    res
}

async fn live() -> StatusCode {
    StatusCode::OK
}

async fn ready(State(state): State<AppState>) -> StatusCode {
    let ok = tokio::time::timeout(Duration::from_millis(200), async {
        state.db_ok.load(Ordering::Relaxed)
    })
    .await
    .unwrap_or(false);
    if ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }
}

async fn export_metrics(State(state): State<AppState>) -> String {
    state.metrics.render()
}

pub fn build_app() -> Result<Router, Box<dyn std::error::Error>> {
    let state = AppState {
        db_ok: Arc::new(AtomicBool::new(true)),
        metrics: PrometheusBuilder::new().install_recorder()?,
    };

    let api = Router::new()
        .route("/items/{id}", get(|| async { "item" }))
        .route_layer(middleware::from_fn(track_metrics));

    let ops = Router::new()
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/metrics", get(export_metrics));

    Ok(api.merge(ops).with_state(state))
}
```

Separating `api` and `ops` keeps probe scrapes out of business latency histograms and ensures `/items/1` and `/items/999` map to the single bounded label `/items/{id}`.
:::

:::exercise challenge Correlating requests end-to-end
Write an Axum router using `ServiceBuilder` with `SetRequestIdLayer`, `TraceLayer` (extracting `x-request-id` into a span field), and `PropagateRequestIdLayer`. Add a handler `GET /proxy` that reads `x-request-id` from the request headers and attaches it to an outbound `reqwest::RequestBuilder`, and test with `tower::ServiceExt::oneshot` that sending a custom `x-request-id: req-777` echoes the exact same header back on the HTTP response while a request without the header receives a generated UUID.
::hint
Put `SetRequestIdLayer::x_request_id(MakeRequestUuid)` first inside `ServiceBuilder`, then `TraceLayer`, then `PropagateRequestIdLayer::x_request_id()`. Pass `HeaderMap` into the handler to read `"x-request-id"`.
::solution
```rust ext run
use axum::extract::State;
use axum::http::{HeaderMap, Request};
use axum::routing::get;
use axum::Router;
use tower::{ServiceBuilder, ServiceExt};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};
use tower_http::trace::TraceLayer;

async fn proxy_handler(State(client): State<reqwest::Client>, headers: HeaderMap) -> String {
    let req_id = headers
        .get("x-request-id")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("missing");

    // In production, reuse the shared `Client` and forward the header downstream:
    let _outbound = client
        .get("https://httpbin.org/get")
        .header("x-request-id", req_id);

    format!("handled with {req_id}")
}

fn app() -> Router {
    let trace = TraceLayer::new_for_http().make_span_with(|req: &Request<_>| {
        let req_id = req.headers().get("x-request-id").and_then(|v| v.to_str().ok()).unwrap_or("-");
        tracing::info_span!("request", method = %req.method(), uri = %req.uri(), request_id = %req_id)
    });

    Router::new()
        .route("/proxy", get(proxy_handler))
        .with_state(reqwest::Client::new())
        .layer(
            ServiceBuilder::new()
                .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
                .layer(trace)
                .layer(PropagateRequestIdLayer::x_request_id()),
        )
}

#[tokio::main]
async fn main() {
    let app = app();

    // 1. Existing request ID is preserved
    let res1 = app
        .clone()
        .oneshot(Request::builder().uri("/proxy").header("x-request-id", "req-777").body(axum::body::Body::empty()).unwrap())
        .await
        .unwrap();
    println!("echoed: {:?}", res1.headers().get("x-request-id").unwrap());

    // 2. Missing request ID is generated as a UUID
    let res2 = app
        .oneshot(Request::builder().uri("/proxy").body(axum::body::Body::empty()).unwrap())
        .await
        .unwrap();
    let generated = res2.headers().get("x-request-id").unwrap().to_str().unwrap();
    println!("generated uuid length: {}", generated.len());
}
```
```output
echoed: "req-777"
generated uuid length: 36
```

`SetRequestIdLayer` preserves caller-provided IDs when valid and mints a fresh 36-character UUID otherwise, `TraceLayer` attaches it to the span, and `PropagateRequestIdLayer` echoes it on the response.
:::
