@id webassembly
@part def
@title WebAssembly
@short WebAssembly
@level intermediate
@time 85
@learn Compile Rust to Wasm and expose a typed API with `wasm-bindgen` | Manipulate the DOM with `web-sys` and build UIs with Yew, Leptos, Dioxus and Sycamore | Explain WASI preview 1 and preview 2 and the component model | Run Wasm with Wasmtime, Wasmer and WasmEdge, and build plugins | Optimise binary size, memory sharing, threads and edge deployment

WebAssembly is a portable bytecode with a sandboxed memory and an explicit
import/export surface. Rust is one of its best source languages: no garbage
collector, small binaries with the right profile, and a mature toolchain. The
same `.wasm` module can run in a browser, a Node.js process, a serverless edge,
a plugin host or an embedded runtime. This chapter covers the browser path, the
server path and the component model that connects them. The [security chapter](#security-engineering) covers the
sandbox and capability model; the [DevOps chapter](#devops-tooling) covers size
optimisation and release profiles.

The library's [apps survey](#apps) introduces the same sandbox, the same
`wasm-bindgen` glue and the same counter program, as one option among desktop
and native toolkits. That survey is about choosing an interface world; this
chapter assumes the choice is made. Survey readers can move quickly through
§12.1–§12.4 and slow down for the four interface frameworks (§12.5–§12.8),
WASI and the component model (§12.9–§12.11), and running Wasm outside a
browser (§12.15–§12.19).

:::analogy A shipping container for code
A container has a standard exterior, a declared manifest and no ability to
touch the ship except through the doors it was given. Wasm gives code a standard
binary format and a sandbox: the host decides which functions are imported and
which memory is shared. Portability comes from the standard exterior; safety
comes from the manifest, not from trusting the cargo.
:::

:::compare Wasm and JavaScript
JavaScript ships source that the engine parses, JIT-compiles and garbage-collects; it has full DOM access and a mature ecosystem. Wasm ships validated bytecode with sandboxed linear memory and predictable performance, but needs glue for strings, objects and the DOM. Use Wasm for compute-heavy code, portability and untrusted plugins; use JavaScript for UI glue and small scripts.
:::


## 12.1 `wasm-bindgen` fundamentals and JavaScript interop

`wasm-bindgen` generates the glue between Rust and JavaScript: it wraps exported
functions, converts strings and structs, and generates TypeScript definitions.
The Rust side uses `#[wasm_bindgen]`; the JS side calls the generated module.

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Counter {
    value: u32,
}

#[wasm_bindgen]
impl Counter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { value: 0 }
    }

    pub fn increment(&mut self) -> u32 {
        self.value += 1;
        self.value
    }

    pub fn value(&self) -> u32 {
        self.value
    }
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}!")
}

#[wasm_bindgen]
pub fn sum(values: &[f64]) -> f64 {
    values.iter().sum()
}
```

```js
import init, { Counter, greet, sum } from "./pkg/demo.js";

await init();
console.log(greet("Ada"));
const counter = new Counter();
counter.increment();
console.log(counter.value(), sum(new Float64Array([1, 2, 3])));
```

Export rules: numbers are cheap; strings are copied and encoded as UTF-8;
`&[T]` and `Vec<T>` are copied unless you use `Float64Array` views; structs
returned by value are allocated in Wasm memory and owned by JS until freed.
`wasm-bindgen` handles `Option`, `Result`, `Box<[T]>`, `JsValue` and closures.
A `#[wasm_bindgen(start)]` function runs on module initialisation. Keep the
public surface small and typed; every boundary crossing has a cost.

## 12.2 `wasm-pack` tooling and build workflows

`wasm-pack` orchestrates `cargo build --target wasm32-unknown-unknown`,
`wasm-bindgen` and packaging for npm, bundlers or Node.

```sh
cargo install wasm-pack
wasm-pack build --target web --release
wasm-pack build --target bundler
wasm-pack build --target nodejs
wasm-pack test --headless --chrome
```

```toml
[lib]
crate-type = ["cdylib", "rlib"]

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
panic = "abort"
```

Targets: `web` produces an ES module plus `.wasm` for browsers; `bundler` emits
an npm package for webpack/Vite; `nodejs` emits CommonJS. `wasm-opt` (from
Binaryen) shrinks the module further; `wasm-pack` runs it by default in release.
The `wasm32-unknown-unknown` target has no filesystem, threads or clock beyond
what JS provides; `wasm32-wasip1` adds the WASI system interface. `trunk` is a
build tool tailored to Yew/Leptos apps; `vite-plugin-wasm` and
`wasm-pack-plugin` integrate with bundlers.

## 12.3 `js-sys` and `web-sys`

`js-sys` binds JavaScript built-ins (`Array`, `Promise`, `Date`, `Math`,
`JSON`); `web-sys` binds browser APIs (`Window`, `Document`, `Element`,
`CanvasRenderingContext2d`, `WebSocket`, `fetch`). Both use `wasm-bindgen`
types and require the right feature flags to keep the binary small.

```toml
[dependencies]
wasm-bindgen = "0.2"
js-sys = "0.3"

[dependencies.web-sys]
version = "0.3"
features = [
  "Document", "Element", "HtmlElement", "Window", "console",
  "CanvasRenderingContext2d", "HtmlCanvasElement",
]
```

```rust
use wasm_bindgen::prelude::*;
use web_sys::window;

#[wasm_bindgen(start)]
pub fn start() -> Result<(), JsValue> {
    let document = window().unwrap().document().unwrap();
    let body = document.body().unwrap();
    let heading = document.create_element("h1")?;
    heading.set_text_content(Some("Hello from Rust"));
    body.append_child(&heading)?;

    let canvas = document
        .get_element_by_id("canvas")
        .unwrap()
        .dyn_into::<web_sys::HtmlCanvasElement>()?;
    let context = canvas
        .get_context("2d")?
        .unwrap()
        .dyn_into::<web_sys::CanvasRenderingContext2d>()?;
    context.set_fill_style_str("tomato");
    context.fill_rect(10.0, 10.0, 80.0, 40.0);
    Ok(())
}
```

Feature flags are additive and compile-time; request only the APIs you use.
Every DOM call can fail (`Result<_, JsValue>`); `unwrap` in browser code turns a
missing element into an unhelpful panic. Use `gloo` for ergonomic wrappers
(`gloo::events`, `gloo::timers`, `gloo::storage`) and `wasm-bindgen-futures` to
await JavaScript promises.

## 12.4 Browser DOM manipulation from Rust

Direct DOM manipulation is imperative and fast to start; a virtual DOM framework
is declarative and scales better. The boundary cost is dominated by DOM calls,
not by Rust arithmetic: batch writes, avoid layout thrashing, and cache element
handles.

```rust
use wasm_bindgen::prelude::*;
use web_sys::{window, HtmlInputElement};

#[wasm_bindgen]
pub fn bind_greeting() -> Result<(), JsValue> {
    let document = window().unwrap().document().unwrap();
    let input = document.get_element_by_id("name").unwrap().dyn_into::<HtmlInputElement>()?;
    let output = document.get_element_by_id("output").unwrap();

    let callback = Closure::<dyn FnMut()>::new(move || {
        let name = input.value();
        output.set_text_content(Some(&format!("Hello, {name}!")));
    });
    // Keep the closure alive for the lifetime of the page.
    input.add_event_listener_with_callback("input", callback.as_ref().unchecked_ref())?;
    callback.forget();
    Ok(())
}
```

`Closure::forget` leaks the closure intentionally; for repeated setup, store it
and drop it on teardown. `web-sys` events are untyped; cast with
`dyn_into` and handle failures. For forms, prevent the default submit and
validate in Rust, remembering that client-side validation is convenience, not
security.

## 12.5 Yew: components, hooks, virtual DOM and routing

Yew is a React-like framework: function components with `#[function_component]`,
hooks (`use_state`, `use_effect`, `use_reducer`, `use_context`), an `html!`
macro and `yew-router`.

```rust
use yew::prelude::*;

#[function_component(Counter)]
fn counter() -> Html {
    let count = use_state(|| 0_u32);
    let onclick = {
        let count = count.clone();
        Callback::from(move |_| count.set(*count + 1))
    };

    html! {
        <div class="counter">
            <p>{ format!("count: {}", *count) }</p>
            <button {onclick}>{ "increment" }</button>
        </div>
    }
}

#[function_component(App)]
fn app() -> Html {
    html! {
        <main>
            <h1>{ "Yew demo" }</h1>
            <Counter />
        </main>
    }
}

fn main() {
    yew::Renderer::<App>::new().render();
}
```

Hooks follow React's rules: call them unconditionally at the top of a component,
and use stable keys in lists. `html!` is type-checked and escapes text by
default; `Html::from_html_unchecked` is the escape hatch and a security risk.
Yew apps are usually built with `trunk serve`; routing uses `BrowserRouter` and
`Switch`. Yew is the most established Rust UI framework; its ecosystem is
smaller than React's but sufficient for dashboards and internal tools.

## 12.6 Leptos: signals, reactive primitives and SSR

Leptos is built on fine-grained reactivity: signals (`RwSignal`, `Memo`),
effects, resources and a view macro. It supports client-side rendering,
server-side rendering with hydration, and server functions.

```rust
use leptos::prelude::*;

#[component]
fn Counter() -> impl IntoView {
    let (count, set_count) = signal(0_i32);

    view! {
        <div>
            <p>"count: " {move || count.get()}</p>
            <button on:click=move |_| *set_count.write() += 1>
                "increment"
            </button>
        </div>
    }
}

#[component]
fn App() -> impl IntoView {
    view! {
        <main>
            <h1>"Leptos demo"</h1>
            <Counter />
        </main>
    }
}

fn main() {
    leptos::mount::mount_to_body(App);
}
```

Fine-grained reactivity updates only the DOM nodes that depend on a signal, so
there is no virtual DOM diff. `create_resource` handles async data; `Suspense`
and `Transition` render fallbacks. SSR renders HTML on the server and hydrates
on the client; server functions (`#[server]`) run only on the server and are
called like async functions. Use `leptos_router` for routes and `leptos_axum`
for the server integration.

## 12.7 Dioxus: components, hooks and multiple targets

Dioxus targets web, desktop (WebView or native), mobile and terminal from one
component tree. Its RSX syntax is similar to JSX; it has hooks, signals,
assets and a router.

```rust
use dioxus::prelude::*;

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    let mut count = use_signal(|| 0);
    rsx! {
        div {
            h1 { "Dioxus demo" }
            p { "count: {count}" }
            button { onclick: move |_| count += 1, "increment" }
        }
    }
}

#[component]
fn Hello(name: String) -> Element {
    rsx! { p { "Hello, {name}!" } }
}
```

The renderer is a feature: `dioxus-web`, `dioxus-desktop`, `dioxus-mobile`,
`dioxus-native`. Desktop uses a system WebView by default, which keeps binaries
small; the native renderer uses wgpu. Dioxus is a strong choice for a desktop UI
that reuses web skills; its ecosystem is younger than Yew's or Leptos's.

## 12.8 Sycamore: reactive signals and templates

Sycamore is a fine-grained reactive library with a `view!` macro and signals. It
predates many of the newer frameworks and remains a compact choice.

```rust
use sycamore::prelude::*;

#[component]
fn Counter() -> View {
    let count = create_signal(0_i32);
    view! {
        div {
            p { "count: " (count.get()) }
            button(on:click = move |_| count.set(count.get() + 1)) { "increment" }
        }
    }
}

fn main() {
    sycamore::render(|| view! { Counter });
}
```

Sycamore's reactivity is similar to Leptos's: signals, memos, effects and
scopes. It supports SSR and hydration. Choose it for a small, fast app with a
minimal dependency footprint; the API has changed across major versions, so pin
the version and read the migration guide.

| Framework | Model | Rendering | Best for |
| --- | --- | --- | --- |
| Yew | React-like hooks + virtual DOM | CSR, SSR | teams with React experience |
| Leptos | fine-grained signals | CSR, SSR, hydration | performance-sensitive apps |
| Dioxus | hooks + RSX | web, desktop, mobile, terminal | cross-platform UI |
| Sycamore | fine-grained signals | CSR, SSR | compact reactive apps |

## 12.9 WASI: preview 1 and preview 2

The WebAssembly System Interface gives Wasm modules a standard way to access
files, clocks, random numbers and network sockets without a browser. **Preview
1** (`wasi_snapshot_preview1`) is a flat set of POSIX-like functions; it is what
`wasm32-wasip1` targets and what most runtimes support today. **Preview 2** is
built on the Component Model: typed interfaces (`wasi:filesystem`,
`wasi:http`, `wasi:cli`, `wasi:sockets`) composed into a world, with capability-
based imports.

```rust
fn main() {
    println!("hello from WASI");
    let args: Vec<String> = std::env::args().collect();
    println!("{} arguments", args.len());
}
```

```sh
rustup target add wasm32-wasip1
cargo build --target wasm32-wasip1 --release
wasmtime run target/wasm32-wasip1/release/app.wasm -- hello
```

WASI preview 1 provides a virtual filesystem through preopened directories; a
module cannot see a path unless the host maps it. Preview 2 replaces the flat
imports with typed resources and async streams, enabling HTTP and sockets
without a provider-specific ABI. `wasm32-wasip2` builds components; `cargo
component` and `wit-bindgen` generate bindings. The transition is incomplete:
some hosts support only preview 1, so check the target before committing.

## 12.10 Wasm runtimes: Wasmtime, Wasmer and WasmEdge

| Runtime | Strengths | Use |
| --- | --- | --- |
| Wasmtime | Bytecode Alliance reference, Cranelift, components, WASI | servers, plugins, edge |
| Wasmer | multiple backends, WASIX extensions | apps needing WASIX |
| WasmEdge | lightweight, AI extensions, CNCF | edge, serverless, inference |

```rust
use wasmtime::{Engine, Linker, Module, Store};

fn run() -> anyhow::Result<()> {
    let engine = Engine::default();
    let module = Module::from_file(&engine, "target/wasm32-wasip1/release/app.wasm")?;
    let mut store = Store::new(&engine, ());
    let mut linker = Linker::new(&engine);
    wasmtime_wasi::preview1::add_to_linker_sync(&mut linker, |state| state)?;

    let instance = linker.instantiate(&mut store, &module)?;
    let start = instance.get_typed_func::<(), ()>(&mut store, "_start")?;
    start.call(&mut store, ())?;
    Ok(())
}

fn main() {
    let _ = run;
}
```

Wasmtime compiles modules with Cranelift or Winch, supports fuel and epoch
interruption, and has a component model implementation. Configure limits: a
module that loops forever must be interrupted (`consume_fuel(true)` and
`set_fuel`, or epochs with a ticker), memory must be capped, and only the
imports you intend should be linked. The runtime is the security boundary;
sandboxing is only as strong as the capability set you grant ([chapter D6](#security-engineering)).

## 12.11 The Wasm Component Model and WIT

The Component Model composes Wasm modules with typed interfaces, independent of
the source language. **WIT** (Wasm Interface Types) describes those interfaces:
records, variants, lists, options, results, resources and functions.

```wit
package example:catalogue@0.1.0;

interface store {
  record book {
    id: u64,
    title: string,
    authors: list<string>,
  }

  variant lookup-error {
    not-found(u64),
    unavailable(string),
  }

  get: func(id: u64) -> result<book, lookup-error>;
  list: func(limit: u32) -> list<book>;
}

world catalogue {
  import wasi:logging/logging@0.1.0;
  export store;
}
```

```sh
cargo install cargo-component
cargo component build --release
wasm-tools component wit target/wasm32-wasip1/release/app.wasm
```

A **world** describes the imports and exports of a component. The component
model handles string and list marshalling, resource lifetimes and async streams,
so a Rust component can call a Python or Go component through the same typed
interface. `wit-bindgen` generates bindings; `wasm-tools` validates and composes.
The model is still stabilising; preview 2 is the current target, and tooling
coverage varies by language.

## 12.12 Memory management between JavaScript and Wasm

Wasm has a linear memory: a growable `ArrayBuffer` owned by the module (or
imported). JS cannot hold a Rust reference; it holds an index or an object
wrapper. `wasm-bindgen` copies strings and slices by default; for large data,
use typed-array views into Wasm memory or shared memory.

```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn fill(buffer: &mut [u8], value: u8) {
    buffer.fill(value);
}

#[wasm_bindgen]
pub fn allocate(length: usize) -> *mut u8 {
    let mut buffer = vec![0_u8; length];
    let pointer = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    pointer
}

#[wasm_bindgen]
pub unsafe fn free(pointer: *mut u8, length: usize) {
    // SAFETY: the pointer came from `allocate` with the same length.
    unsafe {
        drop(Vec::from_raw_parts(pointer, length, length));
    }
}
```

`memory.buffer` can be detached when Wasm memory grows; re-create views after a
growth. For zero-copy, expose a function that returns a pointer and length, then
construct `Uint8Array(wasm.memory.buffer, pointer, length)` in JS. Ownership
must be explicit: JS must not free memory that Rust still owns, and Rust must
not reallocate a buffer that JS is viewing. `SharedArrayBuffer` plus atomics
enables threads, but requires cross-origin isolation headers
(`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`).

## 12.13 Performance optimisation for Wasm

Two budgets: download size and execution speed.

- **Size**: `opt-level = "s"/"z"`, LTO, `codegen-units = 1`, `panic = "abort"`,
  `strip`, `wasm-opt -Oz`, remove unused `web-sys` features, avoid `format!` and
  heavy dependencies, and split code into lazy-loaded chunks.
- **Speed**: avoid boundary crossings in hot loops, pass typed arrays instead of
  arrays of objects, batch DOM writes, use `requestAnimationFrame`, and compile
  with SIMD when the runtime supports it.
- **Startup**: reduce the module size, use streaming compilation
  (`WebAssembly.instantiateStreaming`), and avoid large static initialisers.

```sh
wasm-opt -Oz -o app.opt.wasm app.wasm
wasm-tools strip app.opt.wasm -o app.stripped.wasm
twiggy top -n 20 app.wasm
```

Measure in the target runtime: browser performance profiles differ from
Wasmtime, and JIT warm-up matters. `wasm-bindgen` has a `--debug` mode and a
`console_error_panic_hook` for readable panics; keep them out of production if
size matters.

## 12.14 Multithreading with Web Workers and `SharedArrayBuffer`

Wasm threads require shared memory, atomics and a worker pool. The browser
enforces cross-origin isolation; a worker runs the same module on another
thread, and shared memory is a `SharedArrayBuffer` with atomics.

```rust
// In a worker: read a chunk index from shared memory and process its range.
use wasm_bindgen::prelude::*;
use web_sys::WorkerGlobalScope;

#[wasm_bindgen]
pub fn worker_main(start: usize, end: usize) -> Vec<u8> {
    let scope: WorkerGlobalScope = js_sys::global().unchecked_into();
    let _ = scope;
    (start..end).map(|value| (value % 251) as u8).collect()
}
```

```js
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
worker.postMessage({ start: 0, end: 1000 });
```

`wasm-bindgen-rayon` bridges Rayon's thread pool to Web Workers, letting
parallel iterators run in the browser. Without cross-origin isolation, use
message passing and copy data. Threads add complexity; measure single-threaded
performance first.

## 12.15 Wasm in Node.js and Deno

Node can instantiate a `.wasm` module directly or load a `wasm-pack --target
nodejs` package. Deno supports Wasm imports natively and has first-class
`WebAssembly` APIs, including WASI (unstable).

```js
// Node.js: instantiate a raw module with imports.
const fs = require("node:fs");
const bytes = fs.readFileSync("app.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {
  env: {
    log: (pointer, length) => console.log(pointer, length),
  },
});
instance.exports._start();
```

For WASI in Node, use `node:wasi` (experimental) or run the module with
`wasmtime`. Deno's `Deno.Command` can run a Wasm binary, and `deno run` supports
WASI imports with permissions. The browser is not the only deployment target;
a CLI tool compiled to Wasm can be distributed as one file and run on any
runtime with the right imports.

## 12.16 Cloudflare Workers with `workers-rs`

Cloudflare Workers run Wasm at the edge with a V8 isolate, a fetch API, KV,
Durable Objects, R2 and D1. `workers-rs` provides the bindings and a
`#[event(fetch)]` entry point.

```rust
use worker::*;

#[event(fetch)]
async fn fetch(request: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let url = request.url()?;
    let name = url
        .query_pairs()
        .find(|(key, _)| key == "name")
        .map(|(_, value)| value.into_owned())
        .unwrap_or_else(|| "world".to_string());

    Response::ok(format!("hello, {name}"))
}

fn main() {
    // `worker-build` generates the wasm-bindgen glue for `wrangler deploy`.
}
```

```toml
# wrangler.toml
name = "hello"
main = "build/worker/shim.mjs"
compatibility_date = "2026-11-01"
```

Workers have CPU-time and memory limits, no blocking I/O, and a cold-start
budget. Keep the module small, avoid heavy dependencies, use `wait_until` for
background work, and store state in KV/D1/Durable Objects rather than memory.
The same code can run on Fastly Compute, Fermyon Spin or Deno Deploy with
adapter changes.

## 12.17 Wasm plugins and extensibility patterns

A plugin system uses Wasm to run untrusted extensions with a capability-limited
host. The host defines imports (logging, storage, HTTP), instantiates the plugin
with fuel/memory limits, and calls exported functions. `extism` is a
plug-in framework with a simple ABI; Wasmtime's component model is the typed
alternative.

```rust
use extism::{Manifest, Plugin, Wasm};

fn run_plugin() -> anyhow::Result<()> {
    let wasm = Wasm::file("plugin.wasm");
    let manifest = Manifest::new([wasm]).with_timeout(std::time::Duration::from_secs(2));
    let mut plugin = Plugin::new(&manifest, [], true)?;
    let output = plugin.call::<&str, &str>("transform", "input")?;
    println!("{output}");
    Ok(())
}

fn main() {
    let _ = run_plugin;
}
```

Design the host ABI as a versioned, minimal capability set. Never expose a
generic `read_file(path)` import; expose `read_config(key)` scoped to the
tenant. Limit fuel, memory and wall-clock time; validate plugin output; and
sign plugins if the supply chain matters. The same pattern powers Envoy filters,
proxy extensions, data pipelines and user scripting.

## 12.18 Wasm for edge computing and serverless

Edge Wasm gives fast cold starts, per-request isolation and portable deployment.
The trade-offs: limited CPU/memory, no arbitrary sockets (unless the host
provides them), a smaller ecosystem and a debugging story that is still
maturing. Use it for request transformation, auth, A/B routing, image
resizing and lightweight APIs; use native containers for long-running,
CPU-heavy or stateful workloads.

Cold start depends on module size and runtime: a 2 MB module compiles in
milliseconds with Wasmtime's pooling allocator and ahead-of-time compilation.
Precompile modules at deploy time (`wasmtime compile`), cache them, and avoid
initialising large data structures at startup. Measure p99 latency, not only the
warm path.

## 12.19 Wasm for embedded and constrained environments

Wasm runtimes such as WAMR, WasmEdge and `wasmi` run on microcontrollers and
small Linux devices. They offer sandboxed plugins on a device, over-the-air
updates of individual modules, and language independence. Constraints: no
`std`, limited memory, no threads, and an interpreter is slower than native.

Use Wasm on a device for business logic that changes independently of firmware,
for third-party applets, or for deterministic sandboxing. Keep the host ABI
tiny and versioned; the firmware is the trusted computing base. `wasmi` is a
pure-Rust interpreter that runs on `no_std`; it is slower than Cranelift but
portable and simple to embed.

## Exercises

:::exercise guided A typed Wasm API with `wasm-bindgen`
Build a `wasm-pack` library that exposes a `TodoList` class: `new`, `add(text)`,
`remove(index)`, `items()` returning a JS array of strings, and `len()`. Add a
TypeScript test that constructs it, adds three items, removes one and checks the
length. Build for `--target web` and explain which calls copy data.
::hint
Use `#[wasm_bindgen] pub struct TodoList { items: Vec<String> }` and
`#[wasm_bindgen] impl TodoList`. Returning `Vec<String>` copies every string
across the boundary; a `js_sys::Array` is the JS-native alternative. `items()`
can return `Vec<String>` and wasm-bindgen converts it.
::solution
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct TodoList {
    items: Vec<String>,
}

#[wasm_bindgen]
impl TodoList {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    pub fn add(&mut self, text: String) {
        self.items.push(text);
    }

    pub fn remove(&mut self, index: usize) -> Option<String> {
        if index < self.items.len() {
            Some(self.items.remove(index))
        } else {
            None
        }
    }

    pub fn items(&self) -> Vec<String> {
        self.items.clone()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}
```
:::

:::exercise practice A WASI file counter
Write a CLI that takes a directory path, counts the bytes in every regular file
and prints the total. Build it for `wasm32-wasip1`, run it with Wasmtime with the
directory preopened, and then run it without the preopen to observe the
capability boundary.
::hint
Use `std::fs::read_dir` and `metadata`; WASI preview 1 maps the preopened
directory into the sandbox. Run
`wasmtime run --dir . target/wasm32-wasip1/release/count.wasm .`. Without
`--dir`, opening the path fails with a permission error.
::solution
```rust
use std::fs;
use std::io;

fn main() -> io::Result<()> {
    let directory = std::env::args().nth(1).unwrap_or_else(|| ".".to_string());
    let mut total = 0_u64;
    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_file() {
            total += metadata.len();
        }
    }
    println!("{total} bytes in {directory}");
    Ok(())
}
```

The same binary has no ambient filesystem authority; the host grants it one
directory. That is capability-based security in practice: the program's code did
not change, only the imports the host allowed.
:::

:::exercise challenge A fuel-limited Wasm plugin host
Write a host with Wasmtime that loads a plugin, grants only a `log` function,
limits it to 10 million fuel and 16 MiB of memory, and calls `run(input)` with a
2-second timeout. Add a plugin that loops forever and verify that it is
interrupted, and a plugin that allocates too much and verify that it fails
cleanly.
::hint
Configure `Config::consume_fuel(true)`, `store.set_fuel(10_000_000)`, and a
`ResourceLimiter` for memory. Epoch interruption (`Config::epoch_interruption`,
`store.set_epoch_deadline`) is the wall-clock mechanism. The host function is
defined with `func_wrap`.
::solution
```rust
use wasmtime::{Config, Engine, Linker, Module, Store};

struct State {
    logs: Vec<String>,
}

fn host() -> anyhow::Result<()> {
    let mut config = Config::new();
    config.consume_fuel(true);
    config.epoch_interruption(true);
    let engine = Engine::new(&config)?;

    let module = Module::from_file(&engine, "plugin.wasm")?;
    let mut store = Store::new(&engine, State { logs: Vec::new() });
    store.set_fuel(10_000_000)?;

    let mut linker = Linker::new(&engine);
    linker.func_wrap("env", "log", |mut caller: wasmtime::Caller<'_, State>, value: i32| {
        caller.data_mut().logs.push(format!("value {value}"));
    })?;

    let instance = linker.instantiate(&mut store, &module)?;
    let run = instance.get_typed_func::<(), ()>(&mut store, "run")?;

    // In production, bump the epoch from a watchdog thread and map the trap to
    // a timeout error rather than panicking.
    match run.call(&mut store, ()) {
        Ok(()) => println!("plugin finished: {:?}", store.data().logs),
        Err(error) => println!("plugin trapped: {error}"),
    }
    Ok(())
}

fn main() {
    let _ = host;
}
```

Fuel bounds CPU instructions; epochs bound wall-clock time; a `ResourceLimiter`
bounds memory and table growth. The host must treat every trap as untrusted
output, log it, and never expose a panic back to the plugin caller.
:::

## Quiz

:::quiz WebAssembly check
? What does `wasm-bindgen` add on top of raw Wasm?
- A garbage collector
+ Generated JS glue and TypeScript types for strings, structs, classes and closures
- A JIT compiler
- Threads
= Raw Wasm can only pass numbers and access linear memory. wasm-bindgen encodes the conversions and ownership rules at the boundary.

? Why does WASI use preopened directories?
- To improve performance
+ To grant filesystem capabilities explicitly, rather than exposing the whole host filesystem
- To mount network drives
- To compress files
= A Wasm module has no ambient authority. The host passes handles for specific directories, and the module cannot escape them without another capability.

? What is the Component Model's main benefit over raw modules?
- Smaller binaries in every case
+ Typed, language-neutral interfaces with WIT and composition of components
- Faster execution than native code
- It removes the sandbox
= WIT describes records, variants, resources and functions; components can be composed across languages while the host keeps the sandbox.

? What is the risk of holding a `Uint8Array` view into Wasm memory?
- It is immutable
+ Growing the Wasm memory can detach the underlying `ArrayBuffer`, leaving the view invalid
- It cannot be garbage-collected
- It forces a copy on every access
= Memory growth replaces the buffer. Re-create the view after growth, or use a shared buffer with explicit synchronisation.

? Why limit fuel or epochs in Wasmtime?
- To make the module portable
+ To interrupt untrusted code that would otherwise loop forever or consume the host
- To reduce binary size
- To enable threads
= A sandbox does not bound CPU time by itself. Fuel bounds instructions and epochs bound wall-clock time; memory limits are separate.

:::

:::recap
- `wasm-bindgen` generates JS glue for typed exports, classes, strings and closures.
- `wasm-pack` builds for web, bundler or Node; `trunk` suits Yew and Leptos.
- `js-sys` and `web-sys` expose JavaScript and browser APIs behind feature flags.
- Yew uses a virtual DOM; Leptos and Sycamore use fine-grained signals; Dioxus targets web and native.
- WASI preview 1 is the current POSIX-like ABI; preview 2 uses typed component interfaces.
- Wasmtime, Wasmer and WasmEdge run modules outside the browser with different strengths.
- The Component Model and WIT compose typed components across languages.
- JS/Wasm memory is copied unless you pass views; growth detaches views.
- Size and speed budgets need profiles, `wasm-opt`, feature pruning and boundary-aware design.
- Threads need `SharedArrayBuffer`, cross-origin isolation and a worker pool.
- Node, Deno and edge runtimes all execute Wasm; capabilities and limits differ.
- Plugins should receive a minimal, versioned capability set with fuel and memory limits.
- Edge and embedded Wasm trade ecosystem and CPU for isolation, portability and fast start-up.
:::
