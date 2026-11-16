@id apps
@part p13
@title Apps with a user interface: WebAssembly, Tauri and native windows
@short Apps and WebAssembly
@level intermediate
@time 65
@learn Explain what WebAssembly is and what a module may and may not do | Compile a Rust function for the browser and call it from JavaScript | Change a web page from Rust, by hand and with the framework Leptos | Recognise the same ideas in Yew and Dioxus | Describe how a Tauri app divides the work between a web page and Rust | Tell apart the three designs of native GUI libraries, with egui, iced and Slint | Choose a toolkit for a given kind of app

A program can present its interface in a browser, in a desktop window or in a native graphical toolkit. Rust can participate in each approach, but the architecture and boundary between Rust and the UI differ. This chapter compares WebAssembly-based browser code, desktop webview shells and native GUI libraries so you can choose a direction for a project.

This is a survey: its job is to help you choose, using one small counter program in each world. When the choice is made, the Definitive Curriculum teaches the chosen world in depth — [WebAssembly](#webassembly) for code in the browser and at the edge, in far more detail than the overview here. Read this chapter to decide *which* interface world fits your project; read that one to build in it.

1. **Rust inside a web page.** The Rust code is compiled to *WebAssembly* and runs in the browser, next to JavaScript or in place of it.
2. **A web page inside a desktop window, with Rust behind it.** This is the design of *Tauri*.
3. **Windows drawn by Rust itself.** The libraries *egui*, *iced* and *Slint* stand for three different ways to do that.

To make the tools easy to compare, most examples build the same tiny program: a **counter**, which is a number, a button that raises it, and a button that sets it back to zero.

:::note How the programs of this chapter were tested
A program with a window cannot run in the playground, so the code blocks here have no Run button. In CI, `tools/check.py --projects` and `tools/check.py --ext` automatically extract and compile the browser WebAssembly (`wasm32-unknown-unknown` for `wasm-bindgen`, `web-sys`, Leptos, and Yew) and WASI (`wasm32-wasip1`) projects, and run the pure-Rust `cargo test` unit tests (`wasm_hello` and `text_stats`). Desktop GUI and Tauri examples require platform windowing/WebView libraries (GTK/WebKit, Wayland/X11) and were built, started, and clicked on Linux with the crate versions shown. This corner of the Rust world changes faster than the language itself: if a newer crate version rejects a line, the crate's changelog and docs show the updated spelling, while the architectural ideas stay.
:::

:::plain Where Rust runs outside the terminal
Rust's deployment targets reach well beyond a server process. **[[WebAssembly]]** compiles to a sandboxed bytecode that browsers and edge runtimes execute at near-native speed, which is how Rust powers Figma-class tools and Cloudflare Workers. **Leptos, Yew and Dioxus** build browser UIs in Rust and compile to Wasm. **Tauri** ships a Rust backend with a system webview as the front end, producing a desktop app a fraction of Electron's size. **egui, iced and Slint** render native windows without a webview at all. Each option is a trade of binary size, start-up time, and ecosystem maturity, and the survey's job is to tell you which trade fits which app.
:::

## WebAssembly: Rust in the browser

:::analogy A calculator in a locked room
Imagine you hire a brilliant calculator, a person who computes anything you ask at great speed. For safety, this person sits in a locked room without windows. Slips of paper with numbers go in through a slot, and slips with numbers come out. The calculator cannot see your house and cannot touch anything in it. Whatever needs doing outside the room, you must do yourself, on request. A WebAssembly module is this calculator, the browser is the house, and JavaScript stands at the slot.
:::

**WebAssembly**, short **Wasm**, is a compact format for program code. It is the machine language of an imagined, very simple computer. Every current browser contains a part that runs this code at high speed, next to its JavaScript engine. A compiler can produce Wasm in place of the machine code for your real processor, and the Rust compiler is one of the best at it.

Three properties shape everything that follows:

- **A module can only compute.** By itself it cannot read a file, open a network connection or change the page. It may call the functions that the surrounding program hands to it, the **imports**, and it offers functions of its own, the **exports**. The surrounding program is called the **host**. In a browser, the host is the page with its JavaScript. A closed box like this is called a **sandbox**.
- **Only numbers cross the border.** A Wasm function takes numbers and returns numbers. A text or a struct must be copied into the memory of the module, and then its address and length are passed. You met this problem in [chapter 40](#ffi), and the solution is the same: generated **glue code**.
- **Rust needs no helper inside the module.** There is no garbage collector to ship, so the files are small. The first module of this chapter has 16 kilobytes.

The tools:

| Tool | What it does |
|---|---|
| target `wasm32-unknown-unknown` | lets `rustc` produce Wasm. In this target triple ([chapter 32](#cargo)), `wasm32` is the processor, and the two `unknown`s say: no vendor, no operating system |
| crate `wasm-bindgen` | generates the glue: Rust code on one side of the border, a JavaScript file on the other |
| program `wasm-pack` | one command that runs Cargo, the glue generator and a size optimiser, and puts the result into a folder `pkg` |

The `wasm-bindgen` documentation moved to [wasm-bindgen.github.io](https://wasm-bindgen.github.io/wasm-bindgen/). The older `rustwasm.github.io` documentation site is no longer maintained; this is a documentation move, not a statement that the crate itself has been discontinued.

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### A Rust function for a web page

Create a library with `cargo new --lib wasm_hello`. The manifest asks for a `cdylib`, the kind of library that a foreign host loads ([chapter 40](#ffi)):

```toml proj=wasm_hello file=Cargo.toml
[package]
name = "wasm_hello"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.130"
```

```rust proj=wasm_hello target=host,wasm32-unknown-unknown file=src/lib.rs
use wasm_bindgen::prelude::*;

/// Greets a person.
#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}! This sentence was put together by Rust.")
}

/// Counts the prime numbers below `limit`.
#[wasm_bindgen]
pub fn count_primes(limit: u32) -> u32 {
    (0..limit).filter(|&n| is_prime(n)).count() as u32
}

fn is_prime(n: u32) -> bool {
    if n < 2 {
        return false;
    }
    let mut divisor = 2;
    while divisor * divisor <= n {
        if n % divisor == 0 {
            return false;
        }
        divisor += 1;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primes_are_counted() {
        assert_eq!(count_primes(10), 4);
        assert_eq!(count_primes(100), 25);
    }
}
```

- `#[wasm_bindgen]` exports a function and generates its glue. Without the attribute, a function stays private to the module, like `is_prime` here.
- `&str` and `String` are allowed in the signature. The glue copies the text across the border in both directions.
- Use `u32`, `i32` and `f64` for numbers. They match the JavaScript type `number`. (A `u64` would arrive as a JavaScript `BigInt`, which is clumsier to use.)
- The logic is plain Rust. `cargo test` runs the test on your own machine, without any browser.

Build the package:

```sh
wasm-pack build --target web
```
```text
[INFO]: Checking for the Wasm target...
[INFO]: Compiling to Wasm...
   Compiling wasm_hello v0.1.0 (/home/sara/wasm_hello)
    Finished `release` profile [optimized] target(s) in 8.79s
[INFO]: Optimizing wasm binaries with `wasm-opt`...
[INFO]: Optional fields missing from Cargo.toml: 'description', 'repository', and 'license'. These are not necessary, but recommended
[INFO]: :-) Done in 16.78s
[INFO]: :-) Your wasm pkg is ready to publish at /home/sara/wasm_hello/pkg.
```

On its first run, `wasm-pack` downloads the helper programs that it needs. The note about optional fields matters only if you publish the package. The folder `pkg` now holds four files that matter:

| File | Size | Content |
|---|---|---|
| `wasm_hello_bg.wasm` | 15,724 bytes | the compiled Rust code |
| `wasm_hello.js` | 7,142 bytes | the glue: one JavaScript function for each export, and a loader |
| `wasm_hello.d.ts` | | type declarations for TypeScript, with your doc comments |
| `package.json` | | makes the folder an npm package that can be published |

The type declarations show how the two functions look from the other side:

```ts file=pkg/wasm_hello.d.ts
/**
 * Counts the prime numbers below `limit`.
 */
export function count_primes(limit: number): number;

/**
 * Greets a person.
 */
export function greet(name: string): string;
```

:::details What the glue does with a string
Here is the generated JavaScript function for `greet`, unchanged. It copies the name into the memory of the module and gets an address and a length (`ptr0`, `len0`). The Wasm function receives these two numbers and returns two numbers, the address and length of the answer. The glue reads the answer out as a JavaScript string, and finally asks the module to free the memory:

```js file=pkg/wasm_hello.js
export function greet(name) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.greet(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}
```

This is the hand-written FFI of [chapter 40](#ffi), written for you by a tool.
:::

Now the page. Put this file next to `Cargo.toml`:

```html file=index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Rust in the browser</title>
  </head>
  <body>
    <h1>Rust in the browser</h1>
    <p id="greeting">Loading…</p>
    <button id="go">Count the primes below 3,000,000</button>
    <p id="result"></p>

    <script type="module">
      import init, { greet, count_primes } from "./pkg/wasm_hello.js";

      await init(); // fetch and compile the .wasm file

      document.getElementById("greeting").textContent = greet("Sara");

      document.getElementById("go").addEventListener("click", () => {
        const start = performance.now();
        const count = count_primes(3_000_000);
        const seconds = (performance.now() - start) / 1000;
        document.getElementById("result").textContent =
          `${count} primes, found in ${seconds.toFixed(2)} s`;
      });
    </script>
  </body>
</html>
```

- `<script type="module">` lets the page use `import`.
- `init()` downloads the `.wasm` file and prepares it. It is the default export of the glue file. After the `await`, the exported functions can be called like any JavaScript function.

A browser does not load modules from a page that was opened straight from the disk. The files must come from a web server, and a tiny one on your own machine is enough. Two that work:

```sh
python3 -m http.server 8000                # if Python is installed
```

```sh
cargo install miniserve                    # a small file server written in Rust
miniserve --index index.html -p 8000 .
```

Open `http://localhost:8000`. The page greets Sara, and a click on the button gives:

```text
216816 primes, found in 0.52 s
```

### How fast is it?

The same loop was measured three ways on the same machine:

| Version | Time |
|---|---|
| Rust, compiled for the processor (`cargo run --release`) | 0.51 s |
| Rust, compiled to Wasm, in Chromium | 0.52 s |
| the same loop written in JavaScript, in Chromium | 0.51 s |

The three times are the same. (The last digit moves by one from run to run.) This loop spends nearly all of its time dividing, and a division takes the processor equally long, whoever asks for it. So the Wasm version reaches the full speed of a native program here. But so does JavaScript.

:::key What WebAssembly is good for
Wasm is not a magic "faster" button. A modern JavaScript engine compiles a simple number loop to very good machine code. Wasm pays off when you want to **use Rust code in the browser**: the validation rules that your server also uses, a parser, image or sound processing, a physics simulation, a crate from crates.io. It also gives **steady** speed, without pauses for garbage collection. And remember that every call across the border costs something, above all when texts are copied. Let one call do a lot of work.
:::

`wasm-pack` can also build for other hosts. With `--target nodejs`, the result is a module for Node.js, the program that runs JavaScript outside the browser:

```sh
wasm-pack build --target nodejs --out-dir pkg-node
node try.cjs
```

```js file=try.cjs
const { greet, count_primes } = require("./pkg-node/wasm_hello.js");

console.log(greet("Node"));
console.log(count_primes(100));
```
```output
Hello, Node! This sentence was put together by Rust.
25
```

The default, `--target bundler`, produces a package for the build tools of large JavaScript projects, such as Vite or webpack.

:::tip Wasm outside the browser
The same module runs on a server, and that is how many teams sell "plug-ins with a safety rail". [`wasmtime`](https://docs.rs/wasmtime) embeds a Wasm runtime in a Rust program: you load a module, give it a narrow set of allowed functions, and it can compute but cannot read your files or open a socket unless you hand it the capability. [`extism`](https://docs.rs/extism) wraps that idea as a plug-in framework with host functions and a memory model for passing data both ways. The pattern is the one this chapter opened with — the calculator in the locked room — applied to user-supplied code: untrusted code runs at near-native speed, inside limits you set.
:::

### When a panic happens

A panic inside the module arrives in JavaScript as an error that says very little:

```text
RuntimeError: unreachable
```

The crate `console_error_panic_hook` improves this. Call `console_error_panic_hook::set_once();` once at the start, and the browser console shows the usual message:

```text
panicked at src/lib.rs:10:5:
attempt to divide by zero
```

Open the console with {{F12}} in most browsers. It is the first place to look when a page with Wasm stays empty.

### Changing the page from Rust

A web page is kept in the browser as a tree of objects: one for each heading, paragraph and button. This tree is the **DOM** ("document object model"). JavaScript changes the page by changing this tree. Rust can do the same through two crates of generated bindings:

- `web-sys` covers what the browser offers: the DOM, network requests, drawing surfaces, storage, and much more.
- `js-sys` covers what JavaScript itself offers: arrays, dates, promises.

`web-sys` is huge, so every browser type sits behind its own Cargo feature. If the compiler cannot find a method that the documentation shows, the feature for its type is missing.

```toml proj=wasm_dom file=Cargo.toml
[package]
name = "wasm_dom"
version = "0.1.0"
edition = "2024"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.130"
web-sys = { version = "0.3.107", features = ["Window", "Document", "Element", "HtmlElement", "Node", "EventTarget"] }
```

```rust proj=wasm_dom target=wasm32-unknown-unknown file=src/lib.rs
use wasm_bindgen::prelude::*;

/// Runs once, when the page has loaded the module.
#[wasm_bindgen(start)]
fn start() -> Result<(), JsValue> {
    let window = web_sys::window().expect("there is no window");
    let document = window.document().expect("the window has no document");
    let body = document.body().expect("the document has no body");

    // Build two elements and put them on the page
    let label = document.create_element("p")?;
    label.set_text_content(Some("Clicks: 0"));
    let button = document.create_element("button")?;
    button.set_text_content(Some("Click me"));
    body.append_child(&label)?;
    body.append_child(&button)?;

    // A Rust closure that JavaScript can call
    let mut clicks = 0;
    let on_click = Closure::<dyn FnMut()>::new(move || {
        clicks += 1;
        label.set_text_content(Some(&format!("Clicks: {clicks}")));
    });
    button.add_event_listener_with_callback("click", on_click.as_ref().unchecked_ref())?;

    // The page keeps calling the closure, so it must never be dropped
    on_click.forget();
    Ok(())
}
```

The page only loads the module:

```html file=index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>A counter in Rust</title>
  </head>
  <body>
    <script type="module">
      import init from "./pkg/wasm_dom.js";
      await init();
    </script>
  </body>
</html>
```

After `wasm-pack build --target web`, the page shows "Clicks: 0" and a button, and three clicks make it "Clicks: 3". The new pieces:

- `#[wasm_bindgen(start)]` marks a function that runs by itself as soon as the module is ready.
- Browser functions that can fail return `Result<_, JsValue>`. A **`JsValue`** is "any JavaScript value", here the error that was thrown.
- `Closure::new` wraps a Rust closure so that JavaScript can call it. The closure owns `clicks` and `label`, which is why it is a `move` closure.
- `on_click.as_ref().unchecked_ref()` hands the closure over as the JavaScript function that `add_event_listener_with_callback` expects.
- `on_click.forget()` is the surprising line. The page will call the closure for as long as it lives, but JavaScript knows nothing about Rust ownership. If `on_click` were dropped at the end of `start`, the next click would call a closure that no longer exists, and the glue would report an error. `forget` gives the value up without dropping it. This small, deliberate leak is the normal pattern for a listener that stays for the whole life of the page.

It works, and the module is still small (21,891 bytes). But it took thirty lines for two elements and one event. Nobody builds a whole application this way. That is the job of a framework.

### Wasm outside the browser

The locked room is useful in other houses too. Programs called **Wasm runtimes** run modules on a server or inside another application, as a safe way to run plug-ins and code from strangers. For these hosts there is a standard set of imports named **WASI**, which gives a module files, clocks and arguments, but only the ones that the host allows. Rust has targets for it. An ordinary `main` program compiles without changes:

```rust proj=wasi_hello target=wasm32-wasip1 file=src/main.rs
use std::fs;

fn main() {
    println!("Hello from WebAssembly, outside any browser!");

    let args: Vec<String> = std::env::args().collect();
    println!("arguments: {args:?}");

    match fs::read_to_string("notes.txt") {
        Ok(text) => println!("notes.txt has {} bytes", text.len()),
        Err(error) => println!("cannot read notes.txt: {error}"),
    }
}
```

```sh
rustup target add wasm32-wasip1
cargo build --target wasm32-wasip1
wasmtime target/wasm32-wasip1/debug/wasi_hello.wasm one two
```
```output
Hello from WebAssembly, outside any browser!
arguments: ["wasi_hello.wasm", "one", "two"]
cannot read notes.txt: No such file or directory (os error 44)
```

The file `notes.txt` exists in the folder, and still the program cannot see it. The runtime `wasmtime` shows a module nothing unless told to. With permission for the current folder, the file appears:

```sh
wasmtime --dir . target/wasm32-wasip1/debug/wasi_hello.wasm one two
```
```output
Hello from WebAssembly, outside any browser!
arguments: ["wasi_hello.wasm", "one", "two"]
notes.txt has 18 bytes
```

:::compare Other languages in the browser
JavaScript and TypeScript are at home in the browser. C and C++ reach it through Wasm as well, with a toolchain named Emscripten. Go and C# can be compiled to Wasm too, but they bring their runtime and garbage collector along, which makes the downloads much larger. Rust and C++ need neither, and Rust adds its safety and Cargo. This is why Rust became one of the most used languages for WebAssembly.
:::

## Web frameworks: Leptos, Yew, Dioxus

A **framework** for user interfaces turns the work around. You do not create elements and listeners by hand. You *describe* how the page looks for a given state, and the framework changes the page whenever the state changes. The description is split into **components**: functions that return a piece of the interface and can be used like new HTML tags.

:::analogy A spreadsheet
In a spreadsheet, you type `=A1*2` into cell B1 once. From then on, whenever A1 changes, B1 shows the new result by itself. Nobody writes code that says "when A1 changes, update B1". Modern interface frameworks work like this. A piece of state is a cell, and the parts of the page that show it are the formulas.
:::

### A counter with Leptos

In **Leptos**, such a cell is called a **signal**: a value that remembers who reads it. The whole counter:

```toml proj=leptos_counter file=Cargo.toml
[dependencies]
leptos = { version = "0.8.23", features = ["csr"] }
```

```rust proj=leptos_counter target=wasm32-unknown-unknown file=src/main.rs
use leptos::prelude::*;

/// A button that counts its clicks.
#[component]
fn Counter(start: i32) -> impl IntoView {
    let (count, set_count) = signal(start);

    view! {
        <p>"Clicks: " {count}</p>
        <button on:click=move |_| set_count.update(|n| *n += 1)>"Click me"</button>
        <button on:click=move |_| set_count.set(start)>"Reset"</button>
        <p>{move || if count.get() % 2 == 0 { "even" } else { "odd" }}</p>
    }
}

fn main() {
    leptos::mount::mount_to_body(|| view! { <Counter start=0 /> });
}
```

```html file=index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Leptos counter</title>
  </head>
  <body></body>
</html>
```

This is a normal binary project (`cargo new`), and the page is almost empty. The build tool for it is **Trunk**: it compiles the program to Wasm, generates the glue, adds the `<script>` to the page, and serves the result.

```sh
cargo install trunk
trunk serve --open
```

The first build takes a minute or two. Then Trunk serves the page at `http://127.0.0.1:8080`, opens it in the browser, and builds again whenever a file changes. `trunk build --release` writes the finished files into a folder `dist`, ready to be put on any web server.

Line by line:

- `#[component]` turns a function into a component. Its parameters are the **properties** that the caller sets: `<Counter start=0 />`.
- `signal(start)` creates a signal and returns two handles: `count` for reading and `set_count` for writing.
- The `view!` macro contains the description. It looks like HTML and is checked by the compiler: a tag that is never closed is a compile error. Fixed text stands in quotes, and Rust expressions stand in braces.
- `{count}` puts the signal into the page. Leptos notes that this spot depends on `count`.
- `on:click=…` attaches a Rust closure to the click event. `set_count.update(…)` changes the value in place, and `set_count.set(…)` replaces it.
- `{move || if count.get() % 2 == 0 { "even" } else { "odd" }}` is a formula like `=A1*2`. Leptos runs the closure again each time a signal that it reads changes.

The function `Counter` itself runs only **once**. A click does not rebuild the page. It changes the signal, and the signal updates exactly the two spots that read it. The feature name `csr` stands for **client-side rendering**: the whole interface is built in the browser.

### The same counter with Yew and Dioxus

**Yew** is the oldest of the three, and its design follows the JavaScript library React:

```toml proj=yew_counter file=Cargo.toml
[dependencies]
yew = { version = "0.23.0", features = ["csr"] }
```

```rust proj=yew_counter target=wasm32-unknown-unknown file=src/main.rs
use yew::prelude::*;

#[function_component]
fn Counter() -> Html {
    let count = use_state(|| 0);

    let on_click = {
        let count = count.clone();
        Callback::from(move |_| count.set(*count + 1))
    };

    html! {
        <>
            <p>{ "Clicks: " }{ *count }</p>
            <button onclick={on_click}>{ "Click me" }</button>
        </>
    }
}

fn main() {
    yew::Renderer::<Counter>::new().render();
}
```

`use_state` keeps a value between runs of the function. Here the model is different from Leptos. `count.set(…)` asks Yew to run the *whole function again*. Yew compares the new description with the previous one and changes only what differs in the real page. This comparison is the technique known as the **virtual DOM**. The handle must be cloned into the closure, because both the closure and the `html!` block use it.

**Dioxus** uses signals as well, and writes the description in a syntax that looks like Rust instead of HTML:

```toml file=Cargo.toml
[dependencies]
dioxus = { version = "0.7.10", features = ["web"] }
```

```rust file=src/main.rs
use dioxus::prelude::*;

#[component]
fn Counter() -> Element {
    let mut count = use_signal(|| 0);

    rsx! {
        p { "Clicks: {count}" }
        button { onclick: move |_| count += 1, "Click me" }
    }
}

fn main() {
    dioxus::launch(Counter);
}
```

The special strength of Dioxus is its range: the same components can run in a browser, in a desktop window and on a phone. It has its own build tool, `dx`. (For this guide, all three counters were built with Trunk. Dioxus looks for a page element with the id `main` to draw into.)

| | Leptos | Yew | Dioxus |
|---|---|---|---|
| Description | `view!`, like HTML | `html!`, like HTML | `rsx!`, like Rust |
| State | signals | hooks such as `use_state` | signals |
| On a change | only the spots that read the signal | the component runs again, then a comparison | the component runs again, then a comparison |
| Also offers | rendering on the server | rendering on the server | desktop and mobile apps, rendering on the server |

What does a framework cost in download size? Measured for the counters above, as release builds:

| Counter | Wasm file | compressed for transfer (gzip) |
|---|---|---|
| by hand with `web-sys` | 22 KB | 10 KB |
| Leptos | 210 KB | 54 KB |
| Yew | 338 KB | 93 KB |

These are the sizes with default settings. The size settings of [chapter 32](#cargo) (`opt-level = "z"`, `lto = true`) make them smaller. Most of the size is the framework itself, which is paid for only once.

### One language on both sides

The examples above build the page in the browser, and the server only delivers files. Leptos and Dioxus can also run the *same components* on the server:

- With **server-side rendering**, the server runs the components and sends finished HTML. The page is visible at once, even before the Wasm file has arrived, and search engines can read it.
- In the browser, the Wasm program then takes over the existing HTML and attaches its event handlers. This step is called **hydration**.
- A **server function** is a function that is written among the components, but runs on the server. The browser version of the program contains only a small stand-in with the same name, which sends an HTTP request.

```rust
use leptos::prelude::*;

/// Runs on the server. The browser gets a function with the same name that sends a request.
#[server]
pub async fn save_note(text: String) -> Result<usize, ServerFnError> {
    // Only the server contains this body: it may use the database, files, secrets
    println!("saving a note of {} bytes", text.len());
    Ok(text.len())
}

#[component]
pub fn NoteForm() -> impl IntoView {
    let save = ServerAction::<SaveNote>::new();

    view! {
        <ActionForm action=save>
            <input type="text" name="text" />
            <button type="submit">"Save"</button>
        </ActionForm>
        <p>{move || save.value().get().map(|result| format!("{result:?}"))}</p>
    }
}
```

The attribute `#[server]` generates both versions, and a type `SaveNote` that stands for a call of the function. The body is compiled only into the server program, so it may use the database and secrets. The component sends its form to `save_note` and shows the answer. The argument and the result travel as serialised data. Both sides are compiled from the same source, so their types cannot drift apart. (This listing was compiled in both modes for this guide, but not run. A complete project also needs a server program, usually built on Axum, and the build tool `cargo-leptos` sets one up.)

:::compare JavaScript frameworks
If you know React, Yew will feel familiar: function components, hooks, a virtual DOM. Leptos is closer to SolidJS, where signals update the page directly and components run once. Dioxus sits between the two. Compared with JavaScript frameworks, the Rust ones give you the compiler's checks across the whole application, and they let server and browser share types. The price is a longer build and a larger first download.
:::

## Tauri: a web page in a desktop window

:::analogy A restaurant
A restaurant has a dining room and a kitchen. The dining room is what the guests see, and it can be redecorated freely. The kitchen holds the knives and the fire. Guests never enter the kitchen. They order from the menu, a waiter carries the order through the door, and brings back a dish. In a Tauri app, the dining room is a web page, the kitchen is a Rust program, and the menu is a list of Rust functions that the page may call.
:::

A **Tauri** app is one program with two parts:

- A window that shows a web page. Tauri does not bring a browser. It uses the **webview** that the operating system already has: a component that displays web pages inside another program.
- A Rust program behind it, which may do everything a Rust program may do: read files, talk to devices, start threads.

The page can be made with anything that produces HTML: plain HTML and JavaScript, a JavaScript framework, or one of the Rust frameworks from the previous section.

### The project

Tauri needs a few system libraries. On Linux these are the development packages of WebKitGTK and GTK. On Windows it is the WebView2 component, which current Windows versions include, and on macOS the developer tools of Xcode. The "Prerequisites" page of the Tauri documentation lists the exact packages for each system.

Two small tools create and run projects:

```sh
cargo install create-tauri-app
cargo install tauri-cli --version "^2"
cargo create-tauri-app filestats -m cargo -t vanilla --identifier com.example.filestats -y
```

The options answer the questions that the tool would otherwise ask one by one. `-t vanilla` chooses the template with a page in plain HTML and JavaScript, and `-m cargo` says that no JavaScript tooling is used. The identifier is a unique name for the app, written like a web address in reverse. `-y` accepts the defaults for the rest. The project has two halves:

```tree
filestats/
├── src/                     the page: the dining room
│   ├── index.html
│   ├── main.js
│   └── styles.css
└── src-tauri/               the Rust program: the kitchen
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json      window title and size, name of the app, icons
    ├── capabilities/
    │   └── default.json     what the page is allowed to use
    ├── icons/
    └── src/
        ├── lib.rs           your commands
        └── main.rs          calls `filestats_lib::run()`
```

The example app does something that a page in a browser cannot do: it reads a file from the disk by its path, and counts its lines and words. Replace the generated `lib.rs`, `index.html` and `main.js` with these:

```rust file=src-tauri/src/lib.rs
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

/// What the window shows about one file. Serde turns it into a JavaScript object.
#[derive(Serialize)]
struct FileStats {
    lines: usize,
    words: usize,
    bytes: usize,
}

/// State that lives as long as the application: the files counted so far.
#[derive(Default)]
struct History(Mutex<Vec<String>>);

#[tauri::command]
fn file_stats(path: &str, history: State<'_, History>) -> Result<FileStats, String> {
    let text =
        std::fs::read_to_string(path).map_err(|error| format!("Cannot read {path}: {error}"))?;
    history.0.lock().unwrap().push(path.to_string());
    Ok(FileStats {
        lines: text.lines().count(),
        words: text.split_whitespace().count(),
        bytes: text.len(),
    })
}

#[tauri::command]
fn recent_files(history: State<'_, History>) -> Vec<String> {
    history.0.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(History::default())
        .invoke_handler(tauri::generate_handler![file_stats, recent_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```html file=src/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="stylesheet" href="styles.css" />
    <title>File statistics</title>
    <script type="module" src="/main.js" defer></script>
  </head>
  <body>
    <main class="container">
      <h1>File statistics</h1>
      <form class="row" id="stats-form">
        <input id="path" placeholder="Path of a text file" />
        <button type="submit">Count</button>
      </form>
      <p id="result"></p>
      <p id="recent"></p>
    </main>
  </body>
</html>
```

```js file=src/main.js
const { invoke } = window.__TAURI__.core;

const pathInput = document.querySelector("#path");
const result = document.querySelector("#result");
const recent = document.querySelector("#recent");

document.querySelector("#stats-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    // Calls the Rust function `file_stats`. `Ok` comes back as the value…
    const stats = await invoke("file_stats", { path: pathInput.value });
    result.textContent = `${stats.lines} lines, ${stats.words} words, ${stats.bytes} bytes`;
  } catch (message) {
    // …and `Err` arrives here
    result.textContent = message;
  }
  const files = await invoke("recent_files");
  recent.textContent = `Counted so far: ${files.join(", ")}`;
});
```

Start it from the project folder:

```sh
cargo tauri dev
```

The first build compiles a few hundred crates and takes several minutes. Then a window opens. Type the path of a small text file and press Count. For a test file of four lines, the window shows:

```text
4 lines, 6 words, 29 bytes
Counted so far: /home/sara/sample.txt
```

A path that does not exist gives the message from the `Err` branch:

```text
Cannot read /no/such/file.txt: No such file or directory (os error 2)
```

Cargo also prints a warning: the dependency `tauri-plugin-opener` is unused. The template needed it for the two links on its page. To get rid of the warning, delete that line from `src-tauri/Cargo.toml`, and the entry `"opener:default"` from `src-tauri/capabilities/default.json`.

How the two halves talk:

- `#[tauri::command]` puts a function on the menu. The page calls it by name with `invoke("file_stats", { path: … })`.
- The arguments travel as JSON, and Serde fills the Rust parameters from it. The return value travels back the same way: `FileStats` derives `Serialize` and arrives as a JavaScript object with the fields `lines`, `words` and `bytes`.
- `invoke` returns a promise. `Ok(value)` fulfils it, and `Err(message)` rejects it, which lands in the `catch` block. The error type must be serialisable, and a `String` is the simplest choice.
- `State<'_, History>` is data that lives as long as the app. It is registered once with `.manage(…)`, and any command can ask for it as a parameter. Several commands may run at the same moment, so the data sits in a `Mutex` ([chapter 61](#shared-state)).
- `generate_handler![…]` is the menu itself. A function that is not listed there cannot be called from the page.

:::warn Names change their style at the border
JavaScript names are written in camelCase, and Tauri converts the names of arguments. A Rust parameter `file_path` must be passed from JavaScript as `filePath`. With the wrong spelling, the call is rejected with this message: "invalid args `filePath` for command `file_stats`: command file_stats missing required key filePath".
:::

Treat the page like a client on the network. Check every argument inside the command, as you do in a web handler ([chapter 69](#web)). Tauri adds a second line of defence, the **capabilities**: the files in `src-tauri/capabilities` list which built-in features of Tauri a window may use, such as file dialogues, notifications or the clipboard. What is not listed is refused. Most of these features come as plug-in crates with names like `tauri-plugin-dialog`.

`cargo tauri build` produces the installers for the system it runs on. For the example, the package for Debian and Ubuntu came to 1.8 MB, with a program of 5 MB inside. The package names the WebKitGTK library of the system as a requirement, which is exactly why it can be this small.

:::compare Electron
Electron is the best-known way to build desktop apps from web pages. Editors and chat programs that you may use every day are built with it. An Electron app ships a complete browser and the Node.js runtime, so even a small one is a download of roughly a hundred megabytes, and each running app holds its own browser in memory. Tauri uses the webview of the system and a compiled Rust program, which makes apps much smaller. In exchange, the page is shown by a different engine on each system, and must be tested on each.
:::

## Native windows: egui, iced, Slint

The third road uses no web technology. The library opens a window and draws everything in it. Two words first:

- A **widget** is a building block of an interface: a label, a button, a text field, a slider.
- The **event loop** is the endless loop at the heart of every graphical program: wait for the next event (a click, a key, a timer), react, draw, repeat. The library runs this loop. Your code is called from inside it, which is why `main` ends with a call like `run` that returns only when the window closes.

The libraries differ in *how* your code is called, and there are three main designs. All three programs below were built and clicked for this guide. Each library brings 240 to 350 crates, so the first build takes a few minutes.

### egui: describe the window again for every frame

```toml file=Cargo.toml
[dependencies]
eframe = "0.37.0"
```

```rust file=src/main.rs
use eframe::egui;

fn main() -> eframe::Result {
    // The state of the application is an ordinary variable
    let mut count = 0;

    let options = eframe::NativeOptions::default();
    eframe::run_ui_native("Counter", options, move |ui, _frame| {
        // This closure runs for every frame and describes the whole window
        egui::CentralPanel::default().show(ui, |ui| {
            ui.heading("Counter");
            ui.label(format!("Clicks: {count}"));
            if ui.button("Click me").clicked() {
                count += 1;
            }
            if ui.button("Reset").clicked() {
                count = 0;
            }
        });
    })
}
```

**egui** is an **immediate mode** library. (`eframe` is the companion crate that opens the window for it.) The closure runs each time the window must be drawn, which happens after every event. Each run describes the *complete* content of the window from top to bottom. There are no widget objects that live on. `ui.button("Click me")` draws the button and reports in the same call whether it was clicked just now, so the reaction is an ordinary `if`.

The state is a normal variable, and the label shows its current value simply because the label is described anew every time. No signals, no messages, no callbacks. For tools, editors for game data, and control panels, this is the fastest way to a working window. The costs: the whole description runs again for every frame, complex layouts are harder to express, and egui draws its own style of widgets, which looks the same on every system and native on none. egui programs can also be compiled to Wasm and run inside a web page.

### iced: state, messages, update, view

```toml file=Cargo.toml
[dependencies]
iced = "0.14.0"
```

```rust file=src/main.rs
use iced::Element;
use iced::widget::{button, column, text};

#[derive(Default)]
struct Counter {
    count: i32,
}

#[derive(Debug, Clone, Copy)]
enum Message {
    Clicked,
    Reset,
}

impl Counter {
    // Every change of the state goes through this one function
    fn update(&mut self, message: Message) {
        match message {
            Message::Clicked => self.count += 1,
            Message::Reset => self.count = 0,
        }
    }

    // Describes the window for the current state
    fn view(&self) -> Element<'_, Message> {
        column![
            text(format!("Clicks: {}", self.count)),
            button("Click me").on_press(Message::Clicked),
            button("Reset").on_press(Message::Reset),
        ]
        .spacing(10)
        .padding(20)
        .into()
    }
}

fn main() -> iced::Result {
    iced::run(Counter::update, Counter::view)
}
```

**iced** follows a design that is named the **Elm architecture**, after the language that made it popular. It has four parts:

- the **state**: one struct, here `Counter`;
- the **messages**: an enum with one variant for everything that can happen;
- **`update`**: the only place where the state changes, by handling one message;
- **`view`**: a function that describes the window for the current state. Widgets do not change anything. They only say which message to send: `.on_press(Message::Clicked)`.

iced runs the cycle: draw the view, wait for a message, call `update`, draw the view again. This is more to write than the egui version. In return, every change in the program passes through one `match`, which is easy to read, to log and to test: `update` is a plain method that needs no window. The exercise at the end of the chapter tests one. iced is the base of COSMIC, a complete desktop environment for Linux.

### Slint: the interface in its own language

```toml file=Cargo.toml
[dependencies]
slint = "1.18.1"
```

```rust file=src/main.rs
slint::slint! {
    import { Button, VerticalBox } from "std-widgets.slint";

    export component CounterWindow inherits Window {
        title: "Counter";
        in-out property <int> count: 0;
        callback reset();

        VerticalBox {
            Text { text: "Clicks: " + root.count; }
            Button {
                text: "Click me";
                clicked => { root.count += 1; }
            }
            Button {
                text: "Reset";
                clicked => { root.reset(); }
            }
        }
    }
}

fn main() -> Result<(), slint::PlatformError> {
    let window = CounterWindow::new()?;

    // The markup declares the callback, and Rust decides what it does
    let handle = window.as_weak();
    window.on_reset(move || {
        if let Some(window) = handle.upgrade() {
            window.set_count(0);
        }
    });

    window.run()
}
```

**Slint** describes the interface in a small **markup language** of its own, a language made for describing what is on the screen. The `slint!` macro compiles this description into a Rust struct, here `CounterWindow`. Larger projects keep the markup in `.slint` files, and an editor extension shows a live preview of them.

- `in-out property <int> count` declares a piece of state that Rust can read and write. The macro generates `get_count` and `set_count`.
- `text: "Clicks: " + root.count;` is a **binding**: a formula as in the spreadsheet. When `count` changes, the text follows.
- Simple reactions stay in the markup: `clicked => { root.count += 1; }`.
- `callback reset();` declares an event that the Rust side handles. The macro generates `on_reset`, which takes a closure.
- The closure must not own the window, because the window owns the closure, and the two would keep each other alive for ever. `as_weak()` gives a weak handle, the same idea as `Weak` in [chapter 35](#smart-pointers).

Slint was designed for devices with small screens and little memory as well as for desktops, and the same markup can be used from C++, JavaScript and Python. Read its licence before you use it in a product: Slint is offered under the GPL, under a free licence with conditions, and under a paid one. egui and iced use the permissive MIT licence (egui also Apache-2.0), like most Rust crates.

| | egui | iced | Slint |
|---|---|---|---|
| Design | immediate mode | Elm architecture | markup with bindings |
| State lives in | your variables | one state struct | properties of the components |
| A click becomes | `true` from `.clicked()` | a message for `update` | a callback or a line of markup |
| Good first choice for | tools, debug panels, quick results | applications with a clear structure | designed interfaces, small devices |

:::note Check toolkit maturity before choosing
These projects do not all promise the same stability. The egui documentation warns that it is under heavy development and that releases may include breaking changes. The iced project describes itself as experimental and its own documentation may assume advanced Rust knowledge. Before adopting either for a long-lived product, check the exact release's changelog, minimum supported Rust version, supported platforms, and migration policy. The examples here teach their core models; they are not a guarantee of API stability.
:::

More names you will meet: `gtk4` with `relm4` on top binds the GTK toolkit of the GNOME desktop. `cxx-qt` connects Rust to the Qt toolkit. And `ratatui` builds full-screen interfaces inside a terminal ([chapter 75](#cli)).

:::compare GUI libraries elsewhere
egui is modelled on Dear ImGui, a C++ library that is popular for tools in game studios. The Elm architecture of iced is the idea behind Redux in the JavaScript world. The markup of Slint will remind you of QML from Qt, and its bindings of SwiftUI and Jetpack Compose. In C++, C# or Swift, one toolkit usually dominates a platform. Rust has no such standard yet, and several good candidates.
:::

## Phones

Rust runs well on Android and iOS, and there are two ways to use it there. Both need the development tools of the platform (Android Studio, Xcode), and neither was tried for this guide.

- **A whole app from one of the toolkits.** Tauri 2 and Dioxus can build Android and iOS apps from the same project as the desktop version.
- **A Rust core under a native interface.** The data model, the rules and the network code are written once in Rust. The interface is written in Swift and Kotlin, the languages of the two platforms. The tool `uniffi` generates the bindings between them. Large apps use this to share one tested core between their iPhone, Android and desktop versions.

## Choosing

| You want to… | A good first choice |
|---|---|
| speed up one part of a web site, or use Rust code in it | `wasm-bindgen` with `wasm-pack` |
| write a whole web application in Rust | Leptos, Dioxus or Yew |
| build a desktop app, and you know HTML and CSS | Tauri |
| make a tool or a control panel quickly | egui |
| build a desktop app in pure Rust with a clear structure | iced |
| realise a designed interface, also on small devices | Slint |
| stay in the terminal | `ratatui` |
| build a phone app with the native look | a Rust core with `uniffi` |

:::key Keep the logic out of the interface
Whichever toolkit you choose, put the rules of your program into plain functions and types, in a library crate without any interface code. `count_primes` and the `update` method of the iced counter are tested with `cargo test`, without a browser or a window. The same crate can then serve a command-line tool, a web server, a Wasm module and a desktop app. Toolkits change quickly. Well-tested logic stays.
:::

:::recap
- WebAssembly is a compact code format that browsers run in a sandbox. A module can only compute, and reaches the outside through imports and exports.
- `wasm-bindgen` generates the glue between Rust and JavaScript, and `wasm-pack build` produces a ready package. `web-sys` gives Rust the browser's own functions.
- Wasm is worth it for using Rust code in the browser and for steady speed. A simple loop is not faster than in JavaScript.
- WASI and runtimes such as `wasmtime` run Wasm modules outside the browser, with only the permissions that the host grants.
- Leptos, Yew and Dioxus describe the page as components. Signals update the spots that read them. Yew runs the component again and compares.
- A Tauri app is a web page in the system's webview with a Rust program behind it. The page calls `#[tauri::command]` functions with `invoke`.
- egui describes the window anew for every frame. iced sends messages to one `update` function. Slint uses a markup language with bindings.
- Keep the logic in a library crate, where it is tested without any interface.
:::

:::quiz Check your understanding
? What can a WebAssembly module do without any help from its host?
- Read files in the folder it was loaded from
- Change the web page it runs in
- Send network requests to the server it came from
+ Compute, using its own memory
= A module is a sandbox. Files, the network and the page are reachable only through functions that the host passes in as imports. This is what `web-sys` and WASI do.

? Why does the hand-written counter call `on_click.forget()`?
- To make the closure run faster
+ The page keeps calling the closure after `start` has returned, so it must not be dropped at the end of the function
- Because closures cannot be dropped in Wasm
- To remove the event listener again
= JavaScript holds only a reference to the closure and knows nothing about Rust ownership. Without `forget`, the closure would be dropped at the end of `start`, and the next click would fail.

? In the Leptos counter, what happens when `set_count.update(…)` runs?
- The function `Counter` runs again and builds a new page
+ Only the places in the page that read `count` are updated
- The browser reloads the page
- Nothing, until the next click
= A signal knows its readers. The component function ran once, and afterwards the signal updates exactly the text node and the closure that use it.

? Why is a Tauri app much smaller than an Electron app?
+ It uses the webview that the operating system already has, where Electron ships a whole browser
- Rust code is compressed more strongly
- It downloads the browser when it first starts
- It cannot show pictures
= The window of a Tauri app is drawn by the system's own web component. The app contains only your page and the compiled Rust program.

? Which sentence describes an immediate mode library such as egui?
- Widgets are objects that are created once and changed through callbacks
- Every change of the state is a message for one `update` function
- The interface is written in a separate markup language
+ The code describes the whole window again for every frame, and a button reports its click in the same call that draws it
= The second answer is the Elm architecture of iced, and the last one is Slint. In egui, `if ui.button("…").clicked()` both draws and asks.
:::

:::exercise guided Text statistics in the browser
Build a page with a text area. While the user types, the page shows the number of lines, words and letters of the text. The counting is done by one Rust function `text_stats` that returns all three numbers at once.
::hint
`wasm-bindgen` can export a struct: put `#[wasm_bindgen]` on a `pub struct` whose public fields are numbers. In JavaScript the returned value is then an object with these fields. Listen for the `input` event of the text area.
::solution
```rust ext test file=src/lib.rs
use wasm_bindgen::prelude::*;

/// What we know about a text.
#[wasm_bindgen]
pub struct TextStats {
    pub lines: u32,
    pub words: u32,
    pub letters: u32,
}

#[wasm_bindgen]
pub fn text_stats(text: &str) -> TextStats {
    TextStats {
        lines: text.lines().count() as u32,
        words: text.split_whitespace().count() as u32,
        letters: text.chars().filter(|c| c.is_alphabetic()).count() as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_lines_words_and_letters() {
        let stats = text_stats("Selam, world!\n2 lines");
        assert_eq!((stats.lines, stats.words, stats.letters), (2, 4, 15));
    }
}
```

```html file=index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Text statistics</title>
  </head>
  <body>
    <textarea id="text" rows="6" cols="40"></textarea>
    <p id="stats"></p>

    <script type="module">
      import init, { text_stats } from "./pkg/wasm_stats.js";

      await init();

      const text = document.getElementById("text");
      text.addEventListener("input", () => {
        const stats = text_stats(text.value);
        document.getElementById("stats").textContent =
          `${stats.lines} lines, ${stats.words} words, ${stats.letters} letters`;
        stats.free(); // give the memory inside the module back
      });
    </script>
  </body>
</html>
```

The manifest is the one of `wasm_hello` with another name. For the text "Selam, world!" followed by a second line "2 lines", the page shows `2 lines, 4 words, 15 letters`.

An exported struct stays inside the memory of the module, and JavaScript receives a small object that points to it. Reading `stats.lines` calls a generated function that fetches the number. Since the data lives in the module, somebody must free it: `stats.free()` does it at once. Without the call, the glue frees the struct when the JavaScript object is collected as garbage, at some later time. The test runs with plain `cargo test`.
:::

:::exercise practice A temperature converter with Leptos
Write a Leptos page with one text field for a temperature in degrees Celsius. Below it, the page shows the temperature in Fahrenheit (multiply by 9/5, then add 32), and follows every keystroke. If the field does not contain a number, the page says so.
::hint
Keep the *text* of the field in a signal, and compute the output in a `move ||` closure that parses it. An input reports changes through `on:input`, and the helper `event_target_value(&event)` returns its current text. `prop:value=…` sets the content of the field.
::solution
```rust file=src/main.rs
use leptos::prelude::*;

#[component]
fn Converter() -> impl IntoView {
    let (celsius_text, set_celsius_text) = signal(String::from("20"));

    // A derived value: it is computed again whenever the text changes
    let fahrenheit = move || match celsius_text.get().trim().parse::<f64>() {
        Ok(celsius) => format!("{:.1} °F", celsius * 9.0 / 5.0 + 32.0),
        Err(_) => String::from("Please type a number"),
    };

    view! {
        <label>
            "Celsius: "
            <input
                type="text"
                prop:value=celsius_text
                on:input=move |event| set_celsius_text.set(event_target_value(&event))
            />
        </label>
        <p>{fahrenheit}</p>
    }
}

fn main() {
    leptos::mount::mount_to_body(Converter);
}
```

`Cargo.toml` and `index.html` are the ones of the Leptos counter. The field starts with 20 and the page shows `68.0 °F`. Typing 100 gives `212.0 °F`, and `abc` gives the request for a number.

Only one signal is needed. The Fahrenheit text is not state of its own: it is *derived* from the Celsius text, like a formula cell. The closure `fahrenheit` reads the signal with `.get()`, so Leptos runs it again after every `set`. Storing the result in a second signal would be an invitation for the two to disagree.
:::

:::exercise challenge A counter with a step, in iced
Extend the iced counter. A text field holds the step, and a button "Add" adds the step to the count. The step may be negative. While the field does not contain a whole number, the Add button is disabled. Write a test for `update` that needs no window.
::hint
The view must not change the state, so the text of the field is part of the state, and every keystroke is a message: `text_input("Step", &self.step_text).on_input(Message::StepChanged)`. Parse the text in `view`. A button made with `.on_press_maybe(option)` is disabled when the option is `None`.
::solution
```rust file=src/main.rs
use iced::Element;
use iced::widget::{button, column, text, text_input};

struct Counter {
    count: i64,
    step_text: String,
}

impl Default for Counter {
    fn default() -> Self {
        Counter {
            count: 0,
            step_text: String::from("1"),
        }
    }
}

#[derive(Debug, Clone)]
enum Message {
    StepChanged(String),
    Add(i64),
    Reset,
}

impl Counter {
    fn update(&mut self, message: Message) {
        match message {
            Message::StepChanged(text) => self.step_text = text,
            Message::Add(step) => self.count = self.count.saturating_add(step),
            Message::Reset => self.count = 0,
        }
    }

    fn view(&self) -> Element<'_, Message> {
        // `None` when the text is not a number: a button without a message is disabled
        let step = self.step_text.trim().parse::<i64>().ok();

        column![
            text(format!("Count: {}", self.count)),
            text_input("Step", &self.step_text).on_input(Message::StepChanged),
            button("Add").on_press_maybe(step.map(Message::Add)),
            button("Reset").on_press(Message::Reset),
        ]
        .spacing(10)
        .padding(20)
        .into()
    }
}

fn main() -> iced::Result {
    iced::run(Counter::update, Counter::view)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn messages_change_the_state() {
        let mut counter = Counter::default();
        counter.update(Message::Add(5));
        counter.update(Message::Add(-2));
        assert_eq!(counter.count, 3);

        counter.update(Message::Reset);
        assert_eq!(counter.count, 0);
    }
}
```

- The message `Add` carries the step that was valid when the button was drawn, so `update` has nothing left to check. `step.map(Message::Add)` turns the `Option<i64>` into an `Option<Message>`, because a tuple variant can be used as a function.
- `Message` can no longer be `Copy`, since one variant holds a `String`.
- `saturating_add` stops at the largest `i64` where `+` would overflow and panic in a debug build. A user can type a very large step.
- The test drives the program through its messages, exactly as the window would, and runs in a fraction of a second with `cargo test`.
:::
