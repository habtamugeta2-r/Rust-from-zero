@id advanced-patterns
@part def
@title Advanced Patterns and Meta-Programming
@short Advanced patterns
@level advanced
@time 95
@learn Use higher-ranked bounds, GATs and variance correctly | Build derive and attribute macros with `syn`, `quote` and good error spans | Structure large systems with plugins, dependency injection and event-driven boundaries | Apply CQRS, event sourcing, DDD and hexagonal architecture in Rust | Profile, benchmark and memory-audit a Rust program with the right tools

This chapter is about the seams of a large Rust program: the type-level tricks
that make invalid states unrepresentable, the macros that remove repetition
without hiding logic, and the architectural patterns that keep a codebase
changeable. It ends with the measurement tools that tell you whether any of it
matters. The library's [advanced traits](#advanced-traits), [type
system](#type-system), [macros](#macros) and [performance](#performance)
chapters go deeper on each mechanism; chapter D1 establishes the language
basics this chapter assumes.

:::analogy A building, not a pile of bricks
A small program can be a pile of bricks: any brick can be moved anywhere. A
large program needs load-bearing walls, service corridors and labelled doors.
Patterns are those structural decisions. They cost something, so a shed does not
need a lift shaft; a hospital does. The skill is matching the structure to the
change you expect.
:::

:::compare Patterns that pay and patterns that cost
A pattern pays when it removes a class of bugs or makes an expected change local: typestate stops invalid calls, ports isolate the domain, an outbox prevents lost events. It costs when it adds indirection without a concrete change it enables. The test is whether you can name the change or failure the structure prevents; if not, the simpler code is the better architecture.
:::


## 13.1 Advanced lifetime patterns: HRTBs, GATs and variance

A **higher-ranked trait bound** (HRTB) says "for any lifetime", written
`for<'a>`. It appears when a function must work for a borrowed input whose
lifetime is chosen by the caller, rather than a single lifetime fixed at the
definition.

```rust
fn apply_to_str<F>(f: F, value: &str) -> String
where
    F: for<'a> Fn(&'a str) -> &'a str,
{
    f(value).to_string()
}

fn first_word(input: &str) -> &str {
    input.split_whitespace().next().unwrap_or("")
}

fn main() {
    println!("{}", apply_to_str(first_word, "hello world"));
    println!("{}", apply_to_str(|text| &text[..1], "abc"));
}
```

The bound `F: for<'a> Fn(&'a str) -> &'a str` means the closure must return a
borrow tied to its argument for *every* input lifetime, which is stronger than
`Fn(&'static str) -> &'static str` and different from
`for<'a> Fn(&'a str) -> &'static str`. Desugared `Fn` sugar hides the HRTB;
writing it explicitly is often the fix for "implementation of `Fn` is not
general enough".

**Variance** describes when a type parameter may be substituted with a shorter
or longer lifetime. `&'a T` is covariant in `'a` (a longer borrow can be used
where a shorter one is expected); `&'a mut T` is covariant in `'a` but
invariant in `T` (you cannot shorten the referent's type through a mutable
reference); `Cell<T>`, `RefCell<T>` and `Mutex<T>` are invariant in `T` because
they allow mutation through a shared reference. Function arguments are
contravariant, which is why `fn(&'long str)` can be used where `fn(&'short
str)` is expected. Variance errors usually surface as "lifetime may not live
long enough" in code that stores a reference behind a mutable container.

**GATs** (section 1.15) let an associated type borrow for a caller-chosen
lifetime. Combined with HRTBs, they express lending iterators, borrowed views
and zero-copy parsers. A trait with a GAT often needs `where Self: 'a` to state
that the implementor outlives the borrow.

```rust
trait View {
    type Item<'a>
    where
        Self: 'a;

    fn view(&self) -> Self::Item<'_>;
}

struct Numbers(Vec<u32>);

impl View for Numbers {
    type Item<'a> = &'a [u32]
    where
        Self: 'a;

    fn view(&self) -> Self::Item<'_> {
        &self.0
    }
}

fn main() {
    let numbers = Numbers(vec![1, 2, 3]);
    println!("{:?}", numbers.view());
}
```

Use HRTBs for callbacks, GATs for borrowing associated types, and variance
knowledge when designing wrappers. Do not add lifetime parameters to a type
unless the type genuinely borrows; an owned type with a `'static` bound is
usually a design smell, not a fix.

## 13.2 Type-level programming and typestate machines

Rust's type system can encode protocol states, units, permissions and
non-empty collections. The **typestate** pattern (section 1.28) is the most
practical form: each state is a type, transitions consume the old state and
return the new one, so an invalid call does not compile.

```rust
use std::marker::PhantomData;

struct Locked;
struct Unlocked;

struct Door<State> {
    name: &'static str,
    state: PhantomData<State>,
}

impl Door<Locked> {
    fn new(name: &'static str) -> Self {
        Self { name, state: PhantomData }
    }

    fn unlock(self) -> Door<Unlocked> {
        Door { name: self.name, state: PhantomData }
    }
}

impl Door<Unlocked> {
    fn open(&self) -> String {
        format!("{} opens", self.name)
    }

    fn lock(self) -> Door<Locked> {
        Door { name: self.name, state: PhantomData }
    }
}

fn main() {
    let door = Door::new("front");
    // door.open(); // does not compile: Locked has no `open`
    let door = door.unlock();
    println!("{}", door.open());
    let _door = door.lock();
}
```

Other type-level techniques:

- **Unit types**: `struct Meters(f64); struct Seconds(f64);` prevents adding the
  wrong quantity. Implement `Add<Meters> for Meters`, not a generic `Add`.
- **Const generics**: fixed-size buffers, matrix dimensions and protocol frame
  sizes checked at compile time.
- **Marker traits**: `trait Validated {}` gates functions that require
  validation; combine with a private constructor.
- **Sealed traits**: a public trait with a private supertrait prevents external
  implementations while allowing external use.
- **Type-state builders**: `Builder<Missing<Email>, Set<Name>>` with setters that
  change the type; `build()` exists only when all required fields are present.

The cost is complexity and error messages. Use typestate when the protocol is
small, stable and safety-critical; use runtime validation when the state
transitions depend on data. Write a doc example for every public typestate type,
because the type signatures are the documentation.

## 13.3 Custom derive macros: a full walkthrough

A derive macro parses an item, generates an `impl`, and must handle generics,
where clauses, visibility and errors. This walkthrough builds a `Builder` derive
that generates a builder for a named struct.

```rust
// proc-macro crate: src/lib.rs
use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{parse_macro_input, Data, DeriveInput, Fields, Type};

#[proc_macro_derive(Builder, attributes(builder))]
pub fn derive_builder(input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as DeriveInput);
    match expand(&item) {
        Ok(tokens) => tokens.into(),
        Err(error) => error.to_compile_error().into(),
    }
}

fn expand(item: &DeriveInput) -> syn::Result<proc_macro2::TokenStream> {
    let name = &item.ident;
    let builder_name = format_ident!("{}Builder", name);
    let visibility = &item.vis;

    let fields = match &item.data {
        Data::Struct(data) => match &data.fields {
            Fields::Named(fields) => &fields.named,
            _ => {
                return Err(syn::Error::new_spanned(
                    item,
                    "Builder can only be derived for structs with named fields",
                ))
            }
        },
        _ => {
            return Err(syn::Error::new_spanned(
                item,
                "Builder can only be derived for structs",
            ))
        }
    };

    let mut builder_fields = Vec::new();
    let mut setters = Vec::new();
    let mut initialisers = Vec::new();
    let mut assignments = Vec::new();

    for field in fields {
        let field_name = field.ident.as_ref().expect("named field");
        let field_type = &field.ty;
        let setter_name = format_ident!("{}", field_name);

        builder_fields.push(quote! { #field_name: ::core::option::Option<#field_type> });
        setters.push(quote! {
            pub fn #setter_name(mut self, value: #field_type) -> Self {
                self.#field_name = ::core::option::Option::Some(value);
                self
            }
        });
        initialisers.push(quote! { #field_name: ::core::option::Option::None });
        assignments.push(quote! {
            #field_name: self.#field_name.ok_or(concat!(
                "missing field: ", stringify!(#field_name)
            ))?
        });
    }

    let (impl_generics, type_generics, where_clause) = item.generics.split_for_impl();

    Ok(quote! {
        #visibility struct #builder_name #impl_generics #where_clause {
            #(#builder_fields,)*
        }

        impl #impl_generics #builder_name #type_generics #where_clause {
            pub fn new() -> Self {
                Self { #(#initialisers,)* }
            }

            #(#setters)*

            pub fn build(self) -> ::core::result::Result<#name #type_generics, &'static str> {
                ::core::result::Result::Ok(#name {
                    #(#assignments,)*
                })
            }
        }

        impl #impl_generics ::core::default::Default for #builder_name #type_generics #where_clause {
            fn default() -> Self {
                Self::new()
            }
        }
    })
}
```

```rust
use demo_derive::Builder;

#[derive(Builder)]
struct Config {
    host: String,
    port: u16,
}

fn main() {
    let config = Config::builder()
        .host("localhost".to_string())
        .port(8080)
        .build()
        .unwrap();
    println!("{} {}", config.host, config.port);
}
```

What the walkthrough demonstrates: `split_for_impl` preserves generics and
where clauses; `format_ident!` builds names; `Error::to_compile_error` produces
a diagnostic at the right span; `Option` fields track missing values; and
`stringify!` gives a field-level error without a second pass. Add `trybuild`
tests for a missing field, a tuple struct and a generic struct. Document that
the derive requires named fields and that field types must be `Sized`.

## 13.4 Attribute macros and DSLs

An attribute macro receives the annotated item and returns a replacement. It is
how `#[tokio::main]`, `#[tracing::instrument]` and `#[route]` work. Keep the
transformation local and preserve spans.

```rust
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, ItemFn, LitInt};

#[proc_macro_attribute]
pub fn retry(attr: TokenStream, item: TokenStream) -> TokenStream {
    let attempts = parse_macro_input!(attr as LitInt)
        .base10_parse::<u32>()
        .unwrap_or(3);
    let function = parse_macro_input!(item as ItemFn);
    let name = &function.sig.ident;
    let inputs = &function.sig.inputs;
    let output = &function.sig.output;
    let block = &function.block;

    let tokens = quote! {
        fn #name(#inputs) #output {
            let mut last_error = None;
            for _ in 0..#attempts {
                match (|| #block)() {
                    Ok(value) => return Ok(value),
                    Err(error) => last_error = Some(error),
                }
            }
            Err(last_error.expect("at least one attempt"))
        }
    };
    tokens.into()
}
```

This simplified macro assumes the function returns `Result` and takes no
`self`, so it should reject other shapes with a spanned error. A **DSL** built
with a function-like macro can be readable, but it hides control flow from
rust-analyzer and error messages. Prefer methods and traits for ordinary APIs;
use a DSL when the syntax is genuinely declarative (routes, queries, state
machines). Test expansion with `cargo expand` and UI tests with `trybuild`.

## 13.5 Compiler plugins and rustc internals overview

Rust no longer supports arbitrary compiler plugins on stable. The supported
extension points are:

- **Procedural macros** (stable) for derive, attribute and function-like
  expansion.
- **Clippy lints** upstream, or **Dylint** for organisation-specific lints.
- **`rustc_private`** crates (nightly, unstable) for tools such as Miri, Clippy
  and rust-analyzer; not for production build dependencies.
- **Build scripts and code generation** for everything else.

The compiler pipeline: lexing and parsing produce an AST; name resolution and
macro expansion produce the HIR; type checking and trait solving operate on the
HIR; MIR is built for borrow checking, const evaluation and optimisation; then
code generation produces LLVM IR or Cranelift IR and finally machine code. The
query system memoises each step by input hash, which is why incremental builds
are fast.

```text
source -> tokens -> AST -> HIR -> THIR -> MIR -> LLVM IR -> object code -> link
                    ^ expansion        ^ borrowck ^ const eval
```

Writing a lint is a good way to learn the compiler: use `dylint` with a
`LateLintPass` over the HIR, register it in a library, and run it as a cargo
subcommand. A lint must have a clear message, a suggestion where possible and
tests for false positives. Do not depend on compiler internals in application
code; the APIs change every night. The [compilation pipeline
chapter](#compilation-pipeline) traces the stages with real output.

## 13.6 The `proc-macro2`, `syn` and `quote` ecosystem

- **`proc-macro2`** provides a token-stream type that works outside a proc-macro
  crate, which makes macros unit-testable.
- **`syn`** parses Rust syntax into typed AST nodes: `DeriveInput`, `ItemFn`,
  `Expr`, `Type`, `Attribute`, `parse_quote!`.
- **`quote`** builds token streams with `#variable` interpolation and
  repetition.
- **`trybuild`** compiles fixtures and compares compiler errors.
- **`cargo-expand`** shows the generated code; `cargo-semver-checks` checks API
  compatibility.

```rust
use syn::{parse_quote, ItemFn};

fn make_async(item: ItemFn) -> ItemFn {
    let mut item = item;
    item.sig.asyncness = Some(parse_quote!(async));
    item
}
```

`syn` 2 changed parsing APIs: use `attr.path()`, `parse_args`, `Punctuated` and
`parse_quote!`. Preserve spans by reusing the input tokens' spans; a generated
error with `Span::call_site` points at the macro, not the user's field. For
repetition, use `#(#items)*` with matching delimiters. Write unit tests for the
expansion function (not the `#[proc_macro]` wrapper), because it takes and
returns `proc_macro2::TokenStream`.

## 13.7 Code generation patterns

| Technique | When | Cost |
| --- | --- | --- |
| `macro_rules!` | local syntactic repetition | harder errors, limited analysis |
| derive macro | repetitive trait impls | compile time, API surface |
| attribute macro | wrapping/annotating items | hidden control flow |
| `build.rs` + `include!` | generated tables, protocol bindings | build complexity |
| `xtask` | project automation | another crate |
| external generator (protobuf, SQL, OpenAPI) | schema-driven code | toolchain dependency |

```rust
// xtask: a workspace binary for repeatable project tasks.
// cargo xtask dist
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let task = std::env::args().nth(1).unwrap_or_default();
    match task.as_str() {
        "dist" => println!("build release artefacts"),
        "schema" => println!("regenerate the schema"),
        other => eprintln!("unknown task: {other}"),
    }
    Ok(())
}
```

Generated code should be checked into the repository when consumers need to
build without the generator, or generated in `build.rs` when it must match the
local schema. Either way, make generation deterministic, run it in CI, and diff
to catch drift. Never edit generated files by hand.

## 13.8 Plugin architectures

A plugin system has three parts: a stable host interface, a registry and a
lifecycle. In-process plugins use trait objects; out-of-process plugins use a
protocol (gRPC, JSON-RPC) or a sandbox (Wasm, chapter D12).

```rust
use std::collections::HashMap;

trait Plugin: Send + Sync {
    fn name(&self) -> &'static str;
    fn run(&self, input: &str) -> String;
}

struct Uppercase;
struct Reverse;

impl Plugin for Uppercase {
    fn name(&self) -> &'static str { "uppercase" }
    fn run(&self, input: &str) -> String { input.to_uppercase() }
}

impl Plugin for Reverse {
    fn name(&self) -> &'static str { "reverse" }
    fn run(&self, input: &str) -> String { input.chars().rev().collect() }
}

struct Registry {
    plugins: HashMap<&'static str, Box<dyn Plugin>>,
}

impl Registry {
    fn new() -> Self {
        Self { plugins: HashMap::new() }
    }

    fn register(&mut self, plugin: impl Plugin + 'static) {
        self.plugins.insert(plugin.name(), Box::new(plugin));
    }

    fn run(&self, name: &str, input: &str) -> Option<String> {
        self.plugins.get(name).map(|plugin| plugin.run(input))
    }
}

fn main() {
    let mut registry = Registry::new();
    registry.register(Uppercase);
    registry.register(Reverse);
    println!("{:?} {:?}", registry.run("uppercase", "hello"), registry.run("reverse", "hello"));
}
```

Design rules: version the trait and protocol; keep the interface narrow; define
error types and timeouts; isolate panics (`catch_unwind`) or processes; and
never let a plugin block the host thread. For dynamic loading, `abi_stable`
provides a stable ABI, but Wasm is the safer default for untrusted plugins.
Configuration and discovery belong to the host, not the plugin.

## 13.9 Dependency injection patterns

Rust does dependency injection with constructors and traits, not a container
that reflects over annotations. Pass dependencies as parameters, store them as
generics or trait objects, and construct the graph in `main`.

```rust
trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
}

trait UserStore: Send + Sync {
    fn find(&self, id: u64) -> Option<String>;
}

struct Service<C, S> {
    clock: C,
    store: S,
}

impl<C: Clock, S: UserStore> Service<C, S> {
    fn new(clock: C, store: S) -> Self {
        Self { clock, store }
    }

    fn describe(&self, id: u64) -> String {
        match self.store.find(id) {
            Some(name) => format!("{name} at {}", self.clock.now_ms()),
            None => "unknown".to_string(),
        }
    }
}

struct SystemClock;
impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0)
    }
}

struct MemoryStore;
impl UserStore for MemoryStore {
    fn find(&self, id: u64) -> Option<String> {
        (id == 1).then(|| "Ada".to_string())
    }
}

fn main() {
    let service = Service::new(SystemClock, MemoryStore);
    println!("{}", service.describe(1));
}
```

Generic injection is zero-cost and type-safe; trait-object injection allows
runtime configuration and heterogeneous lists. A `shaku` container automates
wiring for large graphs. Avoid a service locator (`fn get::<T>()`) that hides
dependencies and makes tests need global state. In async services, inject a
cloneable handle (an `Arc<dyn Trait>`) and keep the graph owned by the
application, not by each handler.

## 13.10 Event-driven architecture

An event-driven system decouples producers from consumers through events: a
producer publishes a fact, consumers react. In-process, use channels or a bus;
across services, use a broker with an outbox.

```rust
use tokio::sync::broadcast;

#[derive(Debug, Clone)]
enum Event {
    UserRegistered { id: u64, email: String },
    OrderPlaced { id: u64, total_cents: u64 },
}

#[tokio::main]
async fn main() {
    let (sender, mut receiver) = broadcast::channel::<Event>(64);
    let mut second = sender.subscribe();

    sender.send(Event::UserRegistered { id: 1, email: "ada@example.com".into() }).unwrap();
    println!("{:?}", receiver.recv().await);
    println!("{:?}", second.recv().await);
}
```

Patterns and pitfalls: **at-least-once** delivery means consumers must be
idempotent; **ordering** is per partition, not global; **schema evolution** needs
versioned events; **poison messages** need a dead-letter queue; and the
**dual-write problem** requires an outbox table (write the event in the same
transaction, publish it later). Events are facts in the past tense
(`OrderPlaced`), commands are requests (`PlaceOrder`). Do not use events for
request/response where a direct call is simpler.

## 13.11 CQRS and event sourcing in Rust

**CQRS** separates writes (commands, invariants) from reads (queries,
projections). **Event sourcing** stores the sequence of events as the source of
truth and derives state by replay. They pair well but are independent.

```rust
#[derive(Debug, Clone, PartialEq)]
enum AccountEvent {
    Opened { id: u64 },
    Deposited { amount: u64 },
    Withdrawn { amount: u64 },
}

#[derive(Debug, Default, PartialEq)]
struct Account {
    id: Option<u64>,
    balance: u64,
}

impl Account {
    fn apply(&mut self, event: &AccountEvent) {
        match event {
            AccountEvent::Opened { id } => self.id = Some(*id),
            AccountEvent::Deposited { amount } => self.balance += amount,
            AccountEvent::Withdrawn { amount } => self.balance = self.balance.saturating_sub(*amount),
        }
    }

    fn replay(events: &[AccountEvent]) -> Self {
        let mut account = Self::default();
        for event in events {
            account.apply(event);
        }
        account
    }
}

fn main() {
    let events = vec![
        AccountEvent::Opened { id: 1 },
        AccountEvent::Deposited { amount: 100 },
        AccountEvent::Withdrawn { amount: 30 },
    ];
    println!("{:?}", Account::replay(&events));
}
```

A production design adds: an aggregate that validates commands against current
state and emits events; optimistic concurrency with a version; a store that
appends atomically; snapshots to bound replay time; projections for queries
(updated asynchronously); and an outbox to publish. Event-sourced systems are
hard to change once events are written; version events and keep upcasters.
Use them when auditability and temporal queries are core requirements, not as a
default architecture.

## 13.12 Domain-Driven Design in Rust

DDD models the business domain in code: **value objects** (immutable, validated),
**entities** (identity), **aggregates** (consistency boundaries), **domain
events**, **repositories** (persistence interfaces) and **services** (operations
that do not belong to one entity).

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct Email(String);

impl Email {
    fn parse(value: &str) -> Result<Self, DomainError> {
        let value = value.trim().to_lowercase();
        if !value.contains('@') || value.len() > 254 {
            return Err(DomainError::InvalidEmail);
        }
        Ok(Email(value))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Customer {
    id: u64,
    email: Email,
    active: bool,
}

#[derive(Debug, PartialEq)]
enum DomainError {
    InvalidEmail,
    InactiveCustomer,
}

impl Customer {
    fn deactivate(&mut self) -> Result<(), DomainError> {
        if !self.active {
            return Err(DomainError::InactiveCustomer);
        }
        self.active = false;
        Ok(())
    }
}

fn main() {
    let email = Email::parse(" ADA@EXAMPLE.COM ").unwrap();
    let mut customer = Customer { id: 1, email, active: true };
    assert!(customer.deactivate().is_ok());
    println!("{:?} {:?}", customer, customer.deactivate());
}
```

Rust's type system makes DDD natural: newtypes for value objects, private fields
for invariants, enums for state, and traits for repositories. Keep domain types
free of `serde`, SQLx and HTTP derives where possible; put those in adapter
types. Use a module per bounded context, and make the boundaries explicit with
`pub(crate)` visibility. A shared `core` crate with no dependencies is a good
sign; a `core` that imports the web framework is not.

## 13.13 Hexagonal and clean architecture

Hexagonal (ports and adapters) puts the domain at the centre and infrastructure
at the edge. The domain defines **ports** (traits); adapters implement them
(Postgres, HTTP, messaging). Dependencies point inward; the domain knows nothing
about Axum or SQL.

```rust
// Domain: no framework imports.
trait UserRepository {
    type Error;
    fn find(&self, id: u64) -> Result<Option<String>, Self::Error>;
    fn save(&self, id: u64, name: &str) -> Result<(), Self::Error>;
}

struct RegisterUser<R> {
    repository: R,
}

impl<R: UserRepository> RegisterUser<R> {
    fn execute(&self, id: u64, name: &str) -> Result<String, R::Error> {
        self.repository.save(id, name)?;
        Ok(format!("registered {name}"))
    }
}

// Adapter: implements the port with a real store.
struct MemoryRepository;

impl UserRepository for MemoryRepository {
    type Error = std::convert::Infallible;

    fn find(&self, _id: u64) -> Result<Option<String>, Self::Error> {
        Ok(None)
    }

    fn save(&self, _id: u64, _name: &str) -> Result<(), Self::Error> {
        Ok(())
    }
}

fn main() {
    let use_case = RegisterUser { repository: MemoryRepository };
    println!("{:?}", use_case.execute(1, "Ada"));
}
```

Crates: `domain` (pure), `application` (use cases, ports), `adapters` (web, db,
messaging), `main` (wiring). The rule is mechanical: the domain crate must not
depend on `axum`, `sqlx`, `serde` or `tokio`. This makes tests fast (a fake
adapter) and changes local (a new adapter). The cost is more types and mapping
between layers; collapse layers when the application is genuinely small.

## 13.14 Performance profiling: flamegraph, perf and divan

Measure before optimising. `cargo-flamegraph` wraps `perf` and renders an SVG;
`perf` gives counters and call graphs; `divan` measures with low overhead and a
simple API. On macOS use Instruments; on Windows use WPA or Superluminal.

```sh
cargo install flamegraph
cargo flamegraph --release --bin api
perf record -g -- ./target/release/api
perf report
```

```rust
fn main() {
    let numbers: Vec<u64> = (0..1_000_000).collect();
    divan::black_box(numbers.iter().sum::<u64>());
}
```

A flamegraph shows inclusive and exclusive time; look for wide plateaus, not
single peaks. `perf stat` reports cycles, instructions, cache misses and branch
misses; a high miss rate suggests a data-layout problem (chapter D3). Profile
the release build with debug symbols (`debug = 1`) and the same features as
production. Tokio applications need `tokio-console` for task-level insight;
async tasks that block show up as long poll times.

## 13.15 Benchmarking with criterion, divan and iai

| Tool | Measures | Strength |
| --- | --- | --- |
| `criterion` | wall-clock time, statistical analysis | mature, plots, regression detection |
| `divan` | wall-clock time, allocation counts | low-overhead, simple generic API |
| `iai-callgrind` | instruction counts, cache misses | deterministic, CI-friendly |

```rust
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        n => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn bench(c: &mut Criterion) {
    let mut group = c.benchmark_group("fibonacci");
    for n in [10_u64, 15, 20] {
        group.bench_with_input(format!("n={n}"), &n, |bencher, n| {
            bencher.iter(|| fibonacci(black_box(*n)));
        });
    }
    group.finish();
}

criterion_group!(benches, bench);
criterion_main!(benches);
```

Benchmark the same work the application does, with realistic data and sizes.
Use `black_box` to stop the optimiser removing the work. Run benchmarks on an
idle machine, pin the CPU where possible, and compare medians with confidence
intervals. Instruction-count benchmarks (`iai-callgrind`) are stable in CI where
wall-clock time is noisy. Store results and fail on regressions beyond a
threshold.

## 13.16 Memory profiling: dhat, valgrind and heaptrack

- **`dhat`** records allocation sites and heap usage; the `dhat` crate emits a
  JSON profile for the DHAT viewer.
- **Valgrind Massif** profiles heap over time; `--tool=massif` plus `ms_print`.
- **heaptrack** gives allocation flamegraphs and leak detection on Linux.
- **`bytehound`** is a Rust-friendly memory profiler.

```rust
#[global_allocator]
static ALLOCATOR: dhat::Alloc = dhat::Alloc;

fn main() {
    let _profiler = dhat::Profiler::new_heap();
    let mut values = Vec::new();
    for value in 0..10_000 {
        values.push(value.to_string());
    }
    println!("{}", values.len());
}
```

Look for allocation count as well as bytes: a hot loop that allocates a small
`String` per iteration can dominate. Reduce clones, reuse buffers, reserve
capacity, and use `Cow` or `&str` where ownership is unnecessary. Valgrind also
detects invalid reads/writes and leaks; run it on tests with `--leak-check=full`.
Memory profiling complements CPU profiling: a program can be fast and still
exhaust memory under load.

## Exercises

:::exercise guided A typestate HTTP request
Model an HTTP request as `Request<Unsent>`, `Request<Sent>`, `Request<Answered>`
with methods `send`, `await_response` and `body`. Add a header builder that sets
`Content-Type` only once, using a marker type to prevent duplicate calls at
compile time.
::hint
Use `PhantomData` for the state. `send(self) -> Request<Sent>` consumes the
unsent request; `await_response(self) -> Request<Answered>` consumes the sent one.
For the header, use `Request<WithoutContentType>` and
`Request<WithContentType>` or a field of type `Option<Header>` with a setter that
consumes `self` and returns a type where the field is set.
::solution
```rust
use std::marker::PhantomData;

struct Unsent;
struct Sent;
struct Answered;
struct NoContentType;
struct HasContentType;

struct Request<State, Header = NoContentType> {
    url: String,
    body: Option<String>,
    content_type: Option<&'static str>,
    state: PhantomData<State>,
    header: PhantomData<Header>,
}

impl Request<Unsent, NoContentType> {
    fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            body: None,
            content_type: None,
            state: PhantomData,
            header: PhantomData,
        }
    }

    fn content_type(self, value: &'static str) -> Request<Unsent, HasContentType> {
        Request {
            url: self.url,
            body: self.body,
            content_type: Some(value),
            state: PhantomData,
            header: PhantomData,
        }
    }
}

impl Request<Unsent, HasContentType> {
    fn body(mut self, body: impl Into<String>) -> Self {
        self.body = Some(body.into());
        self
    }
}

impl<H> Request<Unsent, H> {
    fn send(self) -> Request<Sent, H> {
        println!("sending {} to {}", self.body.as_deref().unwrap_or(""), self.url);
        Request {
            url: self.url,
            body: self.body,
            content_type: self.content_type,
            state: PhantomData,
            header: PhantomData,
        }
    }
}

impl<H> Request<Sent, H> {
    fn await_response(self) -> Request<Answered, H> {
        Request {
            url: self.url,
            body: self.body,
            content_type: self.content_type,
            state: PhantomData,
            header: PhantomData,
        }
    }
}

impl<H> Request<Answered, H> {
    fn status(&self) -> u16 {
        200
    }
}

fn main() {
    let request = Request::new("https://example.com")
        .content_type("application/json")
        .body("{}")
        .send()
        .await_response();
    println!("{}", request.status());
}
```
:::

:::exercise practice A derive macro with UI tests
Extend the `Builder` derive from section 13.3 to support `#[builder(default)]`
on a field and return a `BuildError` type listing every missing field instead of
the first one. Add `trybuild` fixtures for a missing required field and for an
unsupported tuple struct.
::hint
Record whether each field has the attribute by inspecting `field.attrs`. For
defaults, use `Default::default()` instead of `Option::ok_or`. To collect all
missing fields, build the struct with a temporary `Vec<&'static str>` and check
it before constructing; or generate an error type with a `Vec` and return it.
::solution
```rust
use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{parse_macro_input, Data, DeriveInput, Fields};

#[proc_macro_derive(Builder, attributes(builder))]
pub fn derive_builder(input: TokenStream) -> TokenStream {
    let item = parse_macro_input!(input as DeriveInput);
    let name = &item.ident;
    let builder_name = format_ident!("{}Builder", name);

    let fields = match &item.data {
        Data::Struct(data) => match &data.fields {
            Fields::Named(fields) => &fields.named,
            _ => return syn::Error::new_spanned(item, "named structs only").to_compile_error().into(),
        },
        _ => return syn::Error::new_spanned(item, "structs only").to_compile_error().into(),
    };

    let mut declarations = Vec::new();
    let mut setters = Vec::new();
    let mut defaults = Vec::new();
    let mut checks = Vec::new();
    let mut construction = Vec::new();

    for field in fields {
        let ident = field.ident.as_ref().unwrap();
        let ty = &field.ty;
        let has_default = field.attrs.iter().any(|attr| {
            attr.path().is_ident("builder") && attr.parse_args::<syn::Ident>().map(|id| id == "default").unwrap_or(false)
        });

        declarations.push(quote! { #ident: ::core::option::Option<#ty> });
        setters.push(quote! {
            pub fn #ident(mut self, value: #ty) -> Self {
                self.#ident = ::core::option::Option::Some(value);
                self
            }
        });

        if has_default {
            defaults.push(quote! { #ident: ::core::option::Option::None });
            construction.push(quote! {
                #ident: self.#ident.unwrap_or_default()
            });
        } else {
            defaults.push(quote! { #ident: ::core::option::Option::None });
            checks.push(quote! {
                if self.#ident.is_none() {
                    missing.push(stringify!(#ident));
                }
            });
            construction.push(quote! {
                #ident: self.#ident.expect("checked above")
            });
        }
    }

    let (impl_generics, type_generics, where_clause) = item.generics.split_for_impl();
    quote! {
        #[derive(Debug, Default)]
        pub struct BuildError {
            pub missing: ::std::vec::Vec<&'static str>,
        }

        pub struct #builder_name #impl_generics #where_clause {
            #(#declarations,)*
        }

        impl #impl_generics #builder_name #type_generics #where_clause {
            pub fn new() -> Self { Self { #(#defaults,)* } }
            #(#setters)*

            pub fn build(self) -> ::core::result::Result<#name #type_generics, BuildError> {
                let mut missing = ::std::vec::Vec::new();
                #(#checks)*
                if !missing.is_empty() {
                    return ::core::result::Result::Err(BuildError { missing });
                }
                ::core::result::Result::Ok(#name { #(#construction,)* })
            }
        }

        impl #impl_generics ::core::default::Default for #builder_name #type_generics #where_clause {
            fn default() -> Self { Self::new() }
        }
    }
    .into()
}
```

The `expect` is justified by the preceding check, but a production macro should
generate a single error path and avoid panics entirely. `trybuild` fixtures catch
the cases the happy-path test cannot: missing fields, tuple structs and bad
attribute arguments.
:::

:::exercise challenge An event-sourced inventory with a projection
Implement an inventory aggregate with events `StockAdded`, `StockRemoved` and
`ItemReserved`, a command handler that rejects removing more than is available,
an event store in memory with a per-aggregate version, and a projection that
maintains a `HashMap<String, u32>` of available stock. Add an idempotency check
for duplicated event ids and a test that replays 1,000 events.
::hint
The aggregate's `apply` is pure; the command handler loads events, replays,
validates and appends. The store maps aggregate id to `Vec<(version, event)>`.
The projection subscribes to appended events and updates its map. Rejecting
duplicates uses a `HashSet<Uuid>` of processed event ids.
::solution
```rust
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
enum Event {
    StockAdded { sku: String, quantity: u32 },
    StockRemoved { sku: String, quantity: u32 },
}

#[derive(Debug, Default, PartialEq)]
struct Inventory {
    stock: HashMap<String, u32>,
}

impl Inventory {
    fn apply(&mut self, event: &Event) {
        match event {
            Event::StockAdded { sku, quantity } => {
                *self.stock.entry(sku.clone()).or_insert(0) += quantity;
            }
            Event::StockRemoved { sku, quantity } => {
                if let Some(current) = self.stock.get_mut(sku) {
                    *current = current.saturating_sub(*quantity);
                }
            }
        }
    }

    fn replay(events: &[Event]) -> Self {
        let mut inventory = Self::default();
        for event in events {
            inventory.apply(event);
        }
        inventory
    }
}

struct Store {
    events: Vec<(u64, Event)>,
    projection: HashMap<String, u32>,
}

impl Store {
    fn new() -> Self {
        Self { events: Vec::new(), projection: HashMap::new() }
    }

    fn append(&mut self, event: Event) {
        self.projection.clear();
        self.events.push((self.events.len() as u64 + 1, event));
        let inventory = Inventory::replay(&self.events.iter().map(|(_, event)| event.clone()).collect::<Vec<_>>());
        self.projection = inventory.stock;
    }

    fn available(&self, sku: &str) -> u32 {
        *self.projection.get(sku).unwrap_or(&0)
    }
}

fn main() {
    let mut store = Store::new();
    store.append(Event::StockAdded { sku: "tea".into(), quantity: 10 });
    store.append(Event::StockRemoved { sku: "tea".into(), quantity: 3 });
    println!("{} {}", store.available("tea"), store.events.len());
}
```

The projection rebuild in `append` is deliberately simple; a real system applies
the event incrementally and stores the projection separately. Include the
aggregate version in the store key so concurrent appends are detectable, and
make event ids unique and idempotent for the consumer.
:::

## Quiz

:::quiz Advanced patterns check
? What does `F: for<'a> Fn(&'a str) -> &'a str` require?
- A closure that only accepts `'static` strings
+ A closure that works for every input lifetime and ties the output borrow to the input
- A closure that returns an owned `String`
- A closure that can be called once
= The higher-ranked bound quantifies over all lifetimes. It is stronger than fixing one lifetime and is required for generic borrowing callbacks.

? Why is `&mut T` invariant in `T`?
- Because mutable references are always `Copy`
+ Because allowing a subtype substitution through a mutable reference could write a value of the wrong type
- Because `T` must be `Sized`
- Because lifetimes are erased
= Mutation through `&mut T` would let a shorter-lived or narrower type be written where a longer-lived type is expected. Invariance prevents that.

? What makes a derive macro error readable?
- Panicking with a message
+ Returning `syn::Error::to_compile_error` with spans on the offending tokens
- Printing to stderr
- Using `unwrap` in the macro
= Compile errors carry spans. `to_compile_error` turns a `syn::Error` into a diagnostic at the right source location; a panic only shows a macro backtrace.

? Which architecture keeps the domain free of framework dependencies?
- Layered MVC
+ Hexagonal/clean architecture with ports and adapters
- A single crate with feature flags
- Event sourcing only
= Ports are traits defined by the domain; adapters implement them. Dependency arrows point inward, so the domain crate does not import Axum or SQLx.

? Why use instruction counts (`iai-callgrind`) in CI rather than wall-clock time?
- They are easier to read
+ They are deterministic and unaffected by noisy machines
- They measure memory
- They work without a compiler
= Wall-clock benchmarks vary with load, frequency scaling and neighbours. Instruction and cache counts are stable enough to catch regressions in CI.

:::

:::recap
- HRTBs quantify over lifetimes; GATs let associated types borrow; variance explains substitution errors.
- Typestate, unit types, const generics and sealed traits make invalid states unrepresentable.
- A derive macro parses an item, preserves generics, generates an impl and reports spanned errors.
- Attribute macros transform items; keep the transformation local and test it with `trybuild`.
- Stable compiler extension points are proc macros, Clippy/Dylint and build scripts, not arbitrary plugins.
- `proc-macro2`, `syn` and `quote` are the macro toolkit; test expansion without the compiler.
- Code generation is deterministic and checked in or regenerated in CI.
- Plugins need a narrow, versioned interface and isolation; Wasm is the safe default for untrusted code.
- Dependency injection is constructor and trait based; avoid service locators.
- Event-driven systems need idempotency, ordering and an outbox.
- CQRS separates writes from reads; event sourcing stores facts and derives state.
- DDD uses newtypes, aggregates and repositories; hexagonal architecture points dependencies inward.
- Profile with flamegraph/perf, benchmark with criterion/divan/iai, and audit memory with dhat/Valgrind.
:::
