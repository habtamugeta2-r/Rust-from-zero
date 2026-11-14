@id async
@part p7
@title Async Rust: thousands of tasks at once
@short Async and await
@level advanced
@time 70
@learn Explain when async is the right tool and when threads are | Write `async` functions and use `.await` | Run tasks concurrently with `join!`, `spawn`, `select!` and timeouts | Use async channels and shared state, and avoid blocking the runtime | Describe what a future and a runtime are underneath

Threads are perfect when you have a handful of long calculations. Many programs have a different problem. A web server may have ten thousand clients connected at once, and nearly all of them are doing nothing at a given moment: the server is *waiting* for them to send something. A chat server, a download manager and a web crawler are the same. They are not short of processor time. They spend their lives waiting for the network or the disk.

One thread per waiting client is wasteful. Every thread reserves memory for its own stack, and the operating system needs time to switch between threads. A few hundred are fine. A hundred thousand are not.

**Asynchronous programming** ("async" for short) is a way to handle huge numbers of waiting tasks with a few threads.

:::analogy One waiter, many tables
A restaurant could hire one waiter per table. Each waiter takes an order, walks to the kitchen, and stands there until the dish is ready. With fifty tables, that is fifty waiters, most of them standing around.

A good waiter works differently. He takes an order at table 1, hands it to the kitchen, and while the kitchen cooks, he goes to table 2, then brings the drinks to table 3. When the kitchen rings the bell, he picks up the dish. One waiter serves many tables, because he never stands still when he could do something else.

An async program is that waiter. Whenever a task has to wait, the thread sets it aside and works on another task that is ready to continue.
:::

| | Threads | Async tasks |
|---|---|---|
| Best for | long calculations (CPU-bound work) | waiting for network, disk, timers (I/O-bound work) |
| Cost of one | a stack of its own (often megabytes reserved), an operating-system thread | a small object, often a few hundred bytes |
| Sensible number | tens to hundreds | hundreds of thousands |
| Who switches between them | the operating system, at any moment | the program, only at `.await` points |

## A first async program

Async Rust needs a **runtime**: a library that keeps track of all tasks and runs whichever one is ready. The language provides the syntax, and the runtime comes from a crate. The most widely used runtime is **Tokio**. Create a project and add it:

```text
cargo new async_demo
cd async_demo
cargo add tokio --features full
```

That writes the following into `Cargo.toml`:

```toml
[dependencies]
tokio = { version = "1.54.1", features = ["full"] }
```

```rust ext run
use std::time::{Duration, Instant};
use tokio::time::sleep;

async fn make_tea() -> String {
    println!("kettle on");
    sleep(Duration::from_millis(200)).await;
    println!("tea is ready");
    String::from("tea")
}

async fn make_toast() -> String {
    println!("bread in the toaster");
    sleep(Duration::from_millis(100)).await;
    println!("toast is ready");
    String::from("toast")
}

fn rounded(duration: Duration) -> u128 {
    (duration.as_millis() + 50) / 100 * 100
}

#[tokio::main]
async fn main() {
    let start = Instant::now();
    let tea = make_tea().await;
    let toast = make_toast().await;
    println!("{tea} and {toast}, one after the other: about {} ms\n", rounded(start.elapsed()));

    let start = Instant::now();
    let (tea, toast) = tokio::join!(make_tea(), make_toast());
    println!("{tea} and {toast}, at the same time: about {} ms", rounded(start.elapsed()));
}
```
```output
kettle on
tea is ready
bread in the toaster
toast is ready
tea and toast, one after the other: about 300 ms

kettle on
bread in the toaster
toast is ready
tea is ready
tea and toast, at the same time: about 200 ms
```

The new pieces:

- **`async fn`** declares a function that can pause. Calling it does not run it. It returns a **future**: a value that stands for a result that will exist later.
- **`.await`** runs a future to its end and gives you the result. If the future has to wait (here: for a timer), `.await` *pauses the current task* and lets the thread do other work. Later the task continues exactly where it stopped. Note the position: `.await` is written **after** the expression.
- **`#[tokio::main]`** turns `async fn main` into a normal `main` that starts the runtime and runs the async code in it.
- **`tokio::time::sleep`** is a timer that waits without occupying a thread.
- **`tokio::join!`** runs several futures concurrently and waits until all are finished.

In the first half, the tea is finished before the toast is started: 200 ms plus 100 ms. In the second half, both wait at the same time, and the total is the longer of the two. The work was not done faster. The *waiting* overlapped.

## Futures are lazy

Like iterators, futures do nothing until someone drives them:

```rust ext run
async fn greet() {
    println!("hello from the future");
}

#[tokio::main]
async fn main() {
    let future = greet();
    println!("the future exists, but nothing has run yet");
    future.await;
}
```
```output
the future exists, but nothing has run yet
hello from the future
```

Calling `greet()` only creates the future. The body runs when it is awaited. Forgetting `.await` is the most common beginner mistake in async code. Usually the compiler catches it, with a type error or with the warning "futures do nothing unless you `.await` or poll them":

```rust fail E0369
async fn fetch_number() -> u32 {
    42
}

async fn double() -> u32 {
    let n = fetch_number();
    n * 2
}

fn main() {}
```
```error auto
```

`n` is not a number. It is an `impl Future<Output = u32>`: a future that *will produce* a `u32`. Writing `fetch_number().await` fixes it.

:::compare A difference to JavaScript and C#
In JavaScript, calling an `async` function starts it running immediately and returns a promise. In Rust, calling an `async fn` runs nothing. This laziness is deliberate: a future that nobody awaits costs nothing, and you decide exactly when and where it runs.
:::

## Tasks: `tokio::spawn`

`join!` runs futures concurrently *inside the current task*. **`tokio::spawn`** starts an independent **task**: the runtime takes the future and runs it in the background, possibly on another thread. It is the async counterpart of `thread::spawn`, and far cheaper.

```rust ext run
use std::time::Duration;
use tokio::time::sleep;

async fn download(id: u64) -> String {
    sleep(Duration::from_millis(50 * id)).await;      // stands in for waiting on the network
    format!("file {id}")
}

#[tokio::main]
async fn main() {
    let handles: Vec<_> = (1..=3).map(|id| tokio::spawn(download(id))).collect();

    for handle in handles {
        let name = handle.await.unwrap();
        println!("finished {name}");
    }
}
```
```output
finished file 1
finished file 2
finished file 3
```

`spawn` returns a `JoinHandle`, which is itself a future. Awaiting it gives a `Result`: an `Err` means the task panicked. Unlike a plain future, a spawned task starts running at once, whether or not you await the handle.

When you want the results **in the order in which the tasks finish**, use a `JoinSet`:

```rust ext run
use std::time::Duration;
use tokio::task::JoinSet;
use tokio::time::sleep;

#[tokio::main]
async fn main() {
    let mut tasks = JoinSet::new();
    for (name, delay) in [("slow", 150), ("fast", 20), ("medium", 80)] {
        tasks.spawn(async move {
            sleep(Duration::from_millis(delay)).await;
            name
        });
    }

    while let Some(result) = tasks.join_next().await {
        println!("{} finished", result.unwrap());
    }
}
```
```output
fast finished
medium finished
slow finished
```

`async move { ... }` is an **async block**: a future written in place, like a closure. With `move` it takes ownership of the variables it uses, which a spawned task needs for the same reason a spawned thread does.

### Tasks must be `Send`

Tokio may move a task from one thread to another whenever the task is paused. So everything a task holds **across an `.await`** must be `Send`. An `Rc` is not:

```rust
use std::rc::Rc;
use std::time::Duration;

async fn work() {
    let local = Rc::new(5);
    tokio::time::sleep(Duration::from_millis(10)).await;
    println!("{local}");
}

#[tokio::main]
async fn main() {
    tokio::spawn(work()).await.unwrap();
}
```
```error
error: future cannot be sent between threads safely
  --> src/main.rs:12:18
   |
12 |     tokio::spawn(work()).await.unwrap();
   |                  ^^^^^^ future returned by `work` is not `Send`
   |
   = help: within `impl Future<Output = ()>`, the trait `Send` is not implemented for `Rc<i32>`
note: future is not `Send` as this value is used across an await
  --> src/main.rs:6:51
   |
 5 |     let local = Rc::new(5);
   |         ----- has type `Rc<i32>` which is not `Send`
 6 |     tokio::time::sleep(Duration::from_millis(10)).await;
   |                                                   ^^^^^ await occurs here, with `local` maybe used later
```

The message is precise: which value, and which `.await` it lives across. Use `Arc` in place of `Rc`, or make sure the value is dropped before the `.await`.

## Timeouts and `select!`

Anything that waits on the outside world should have a time limit. `timeout` wraps a future and gives up after a given duration:

```rust ext run
use std::time::Duration;
use tokio::time::{sleep, timeout};

async fn slow_answer() -> u32 {
    sleep(Duration::from_millis(300)).await;
    42
}

#[tokio::main]
async fn main() {
    match timeout(Duration::from_millis(50), slow_answer()).await {
        Ok(value) => println!("got {value}"),
        Err(_) => println!("gave up after 50 ms"),
    }

    match timeout(Duration::from_millis(600), slow_answer()).await {
        Ok(value) => println!("got {value}"),
        Err(_) => println!("gave up after 600 ms"),
    }

    tokio::select! {
        value = slow_answer() => println!("the answer came first: {value}"),
        _ = sleep(Duration::from_millis(100)) => println!("the timer came first"),
    }
}
```
```output
gave up after 50 ms
got 42
the timer came first
```

**`select!`** waits for several futures at once and continues with whichever finishes **first**. The others are dropped. It is the tool for "wait for a message *or* a shutdown signal *or* a timer".

:::key Dropping a future cancels it
When a future is dropped before it has finished, its work simply stops at the `.await` where it was paused. That is how `timeout` and `select!` cancel the losers. There is no special cancel operation. It also means that the code after any `.await` might never run. If a task must finish a step once it has started (for example, write a complete record), do that step without an `.await` in the middle, or run it in its own spawned task.
:::

## Channels and shared state

Tokio has async versions of the tools from the last two chapters. Its `mpsc` channel looks familiar. `send` and `recv` are async, so a task that waits for a message does not block a thread:

```rust ext run
use tokio::sync::mpsc;

#[tokio::main]
async fn main() {
    let (sender, mut receiver) = mpsc::channel::<String>(8);

    for id in 1..=3 {
        let sender = sender.clone();
        tokio::spawn(async move {
            sender.send(format!("report from task {id}")).await.unwrap();
        });
    }
    drop(sender);

    let mut reports = Vec::new();
    while let Some(report) = receiver.recv().await {
        reports.push(report);
    }
    reports.sort();
    println!("{:?}", reports);
}
```
```output
["report from task 1", "report from task 2", "report from task 3"]
```

The channel is bounded: `channel(8)` holds at most eight waiting messages, and a sender pauses when it is full. Tokio offers more kinds of channel for particular jobs:

| Channel | Senders → receivers | Use it for |
|---|---|---|
| `mpsc` | many → one | a queue of work or events |
| `oneshot` | one → one, a single value | sending back the answer to one request |
| `broadcast` | many → many, every receiver gets every message | chat rooms, notifications |
| `watch` | one → many, only the latest value is kept | configuration, "current state" |

Shared state works with `Arc<Mutex<T>>`, as with threads:

```rust ext run
use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() {
    let visits = Arc::new(Mutex::new(0_u32));

    let handles: Vec<_> = (0..100)
        .map(|_| {
            let visits = Arc::clone(&visits);
            tokio::spawn(async move {
                *visits.lock().unwrap() += 1;
            })
        })
        .collect();

    for handle in handles {
        handle.await.unwrap();
    }
    println!("{}", *visits.lock().unwrap());
}
```
```output
100
```

:::tip Which mutex?
The ordinary `std::sync::Mutex` is the right choice in async code as long as the lock is taken and released **without an `.await` in between**, as above. If you must keep a lock while awaiting something, use `tokio::sync::Mutex`, whose `lock()` is async. Holding a standard mutex guard across an `.await` either fails to compile (the guard is not `Send`) or risks blocking the runtime.
:::

## The golden rule: never block the runtime

The runtime has a few threads, and each of them serves thousands of tasks. A task gives its thread back only at an `.await`. If a task does something slow **without** awaiting, every other task on that thread is stuck behind it.

Things that block:

- `std::thread::sleep` (use `tokio::time::sleep`),
- the file and network functions of the standard library, such as `std::fs::read_to_string` (use `tokio::fs`, `tokio::net`),
- long calculations,
- waiting on a `std::sync::mpsc` channel or a busy `std::sync::Mutex`.

For work that is truly blocking or heavy, hand it to a thread that is meant for it with `spawn_blocking`:

```rust ext run
use tokio::task;

fn heavy_calculation(limit: u64) -> u64 {
    (1..=limit).filter(|n| n % 7 == 0).count() as u64
}

#[tokio::main]
async fn main() {
    let result = task::spawn_blocking(|| heavy_calculation(10_000_000)).await.unwrap();
    println!("{result}");
}
```
```output
1428571
```

`spawn_blocking` runs the closure on a separate pool of threads and returns a handle you can await. The async tasks keep running meanwhile. A rule of thumb: if a piece of code can take more than about a tenth of a millisecond without reaching an `.await`, it does not belong directly in an async task.

## A small network server

Here is async Rust doing what it was made for. This program starts a server that accepts TCP connections and answers every line it receives. To keep the example self-contained, the same program then connects to its own server as a client.

**TCP** is the basic protocol of the internet for sending a stream of bytes reliably from one program to another. A server *listens* on an address and a numbered **port**. A client *connects* to it. Both then read from and write to the connection.

```rust ext run
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

async fn handle_client(stream: TcpStream) -> std::io::Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    while let Some(line) = lines.next_line().await? {
        let answer = format!("you said: {}\n", line.to_uppercase());
        writer.write_all(answer.as_bytes()).await?;
    }
    Ok(())
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // port 0 asks the operating system for any free port
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;

    // the server: accept connections for ever, one task per client
    tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            tokio::spawn(async move {
                if let Err(error) = handle_client(stream).await {
                    eprintln!("client error: {error}");
                }
            });
        }
    });

    // a client in the same program, to try the server out
    let stream = TcpStream::connect(address).await?;
    let (reader, mut writer) = stream.into_split();
    let mut answers = BufReader::new(reader).lines();

    for message in ["hello", "async rust"] {
        writer.write_all(format!("{message}\n").as_bytes()).await?;
        if let Some(answer) = answers.next_line().await? {
            println!("{answer}");
        }
    }
    Ok(())
}
```
```output
you said: HELLO
you said: ASYNC RUST
```

The structure of nearly every async server is in these lines:

- `TcpListener::bind(...)` opens a listening address. `127.0.0.1` is the computer itself ("localhost").
- The accept loop waits for a client and **spawns one task per connection**. A task costs so little that ten thousand open connections are no problem.
- `handle_client` reads lines and writes answers. Every `.await` in it is a point where this client's task steps aside while it waits for the network.
- `into_split()` divides the connection into a reading half and a writing half, so that the two can be used independently.
- `?` works in async functions exactly as elsewhere.

In the next chapter this skeleton grows into a chat server.

## What happens underneath

You can use async Rust without this section. It is here because knowing what is inside takes away the mystery.

**A future is a value with one method, `poll`.** Polling a future asks: "are you finished?" It answers `Poll::Ready(value)` or `Poll::Pending` ("not yet, I will let you know").

```rust
trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output>;
}
```

**An `async fn` is turned into a state machine by the compiler.** It becomes a hidden struct that stores the local variables and remembers at which `.await` the function is paused. Each `poll` runs the code up to the next `.await` that is not ready, and returns `Pending`. This is why an async task is so small: it stores only its live variables, not a whole stack.

**A runtime is a loop that polls futures.** It keeps a queue of tasks that are ready, polls them, and puts aside those that return `Pending`. A pending future has stored a **waker** (handed in through the `Context`). When the event it waits for arrives, such as data on a socket or a timer firing, the waker puts the task back into the ready queue.

Here is all of that in a program small enough to read, with no crate at all: a future written by hand, and a runtime of eight lines.

```rust run
use std::future::Future;
use std::pin::{pin, Pin};
use std::task::{Context, Poll, Waker};

struct Countdown(u32);

impl Future for Countdown {
    type Output = &'static str;

    fn poll(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        if self.0 == 0 {
            Poll::Ready("lift-off")
        } else {
            println!("{}...", self.0);
            self.0 -= 1;
            context.waker().wake_by_ref();     // "please ask me again"
            Poll::Pending
        }
    }
}

/// A tiny executor: asks the future again and again until it is ready.
fn block_on<F: Future>(future: F) -> F::Output {
    let mut future = pin!(future);
    let mut context = Context::from_waker(Waker::noop());
    loop {
        if let Poll::Ready(value) = future.as_mut().poll(&mut context) {
            return value;
        }
    }
}

fn main() {
    let result = block_on(async {
        let word = Countdown(3).await;
        format!("{word}!")
    });
    println!("{result}");
}
```
```output
3...
2...
1...
lift-off!
```

`Countdown` answers `Pending` three times and then `Ready`. `block_on` is the simplest possible runtime: it polls in a loop until the future is done. A real runtime does not spin like this. It sleeps until a waker tells it that a task can make progress, and it manages many tasks and several threads. The principle is the same.

:::plain What is `Pin`?
The state machine behind an `async fn` may hold references to its own local variables. If such a value were moved to a different place in memory, those references would point to the old place. `Pin<&mut T>` is a pointer type that promises: "the value behind me will not be moved any more". `poll` requires it, so that self-referential futures are safe. In everyday code you never write `Pin` yourself. When you do need to pin something, the macro `pin!` (as above) or `Box::pin(...)` does it.

Most types do not care whether they are moved: numbers, strings, vectors. They carry the marker trait **`Unpin`**, and for them `Pin` changes nothing. The futures that `async` creates are the important types that are *not* `Unpin`. That is why some functions ask you to pin a future before you hand it over, and why the compiler sometimes says that a future "cannot be unpinned".
:::

## More async features

**Async closures** capture their surroundings and return a future. They are written `async |x| { ... }`:

```rust ext run
#[tokio::main]
async fn main() {
    let prefix = String::from("item");
    let label = async |n: u32| format!("{prefix} {n}");

    println!("{} {}", label(1).await, label(2).await);
}
```
```output
item 1 item 2
```

**Async functions in traits** work directly:

```rust ext run
trait Storage {
    async fn load(&self, key: &str) -> Option<String>;
}

struct Memory;

impl Storage for Memory {
    async fn load(&self, key: &str) -> Option<String> {
        if key == "greeting" { Some(String::from("hello")) } else { None }
    }
}

async fn show(storage: &impl Storage, key: &str) {
    println!("{key}: {:?}", storage.load(key).await);
}

#[tokio::main]
async fn main() {
    show(&Memory, "greeting").await;
    show(&Memory, "missing").await;
}
```
```output
greeting: Some("hello")
missing: None
```

One limit remains: a trait with async methods cannot be used directly as `dyn Trait`. Where trait objects are needed, the crate `async-trait` is the usual answer.


**An async function that calls itself** needs a box. The future of such a function would have to contain a future of the same function, which contains another one, without end. It is the problem of the list that contains a list from [chapter 27](#smart-pointers), and the remedy is the same:

```rust ext run
async fn depth(n: u32) -> u32 {
    if n == 0 {
        0
    } else {
        // Without `Box::pin` this is error E0733: "recursion in an async fn requires boxing".
        1 + Box::pin(depth(n - 1)).await
    }
}

#[tokio::main]
async fn main() {
    println!("{}", depth(5).await);
}
```
```output
5
```

**Streams** are the async relatives of iterators: a sequence of values that arrive over time, such as lines from a connection. They come from the crates `futures` and `tokio-stream`, and you will see them in [chapter 45](#async-ecosystem).

**Other runtimes.** Tokio is the default choice for servers and network tools. `smol` is a small alternative, and `embassy` brings async to microcontrollers that have no operating system. Libraries are often written for one runtime, so pick one per program. This guide uses Tokio throughout.

## Pitfalls to remember

- **A forgotten `.await`.** The future is created and silently does nothing. Heed the compiler's warning.
- **Blocking in a task.** `std::thread::sleep`, heavy loops, synchronous file access. Use the async versions or `spawn_blocking`.
- **Async is contagious.** An `async fn` can only be awaited from other async code, so the choice spreads up through the callers to `main`. This is sometimes called *function colouring*. Keep the plain logic of your program in ordinary functions and put the async layer around it. That also keeps the logic easy to test.
- **Async does not speed up calculations.** For CPU-bound work, use threads or Rayon.
- **Unlimited spawning.** A loop that spawns a task for every incoming item, without any limit, can exhaust memory under load. Use bounded channels or a `tokio::sync::Semaphore` to cap the number of tasks at work.

:::compare Async in other languages
- **JavaScript** has one thread and an event loop built into the language. `async`/`await` there looks almost the same, and a blocking loop freezes everything, for the same reason as in Rust.
- **Python** (`asyncio`) and **C#** (`Task`) follow the same model with a runtime that ships with the language.
- **Go** hides the difference: every function may pause, and the runtime moves "goroutines" between threads without `async` or `await`. That is simpler to use. The price is a runtime in every program, and less control.
- **Rust** compiles each async function to a state machine with no heap allocation of its own, leaves the choice of runtime to you, and runs the same async code on a server with 64 cores and on a microcontroller with 16 kilobytes of memory. It asks for more understanding in return.
:::

:::recap
- Async is for many tasks that mostly wait. Threads are for heavy calculations.
- `async fn` returns a future. Nothing runs until it is awaited or spawned. `.await` pauses the task while it waits, and frees the thread.
- A runtime such as Tokio runs the tasks. `#[tokio::main]` starts it.
- `join!` waits for all, `select!` for the first, `timeout` limits the wait, `tokio::spawn` starts a background task.
- Dropping a future cancels it at its current `.await`.
- Spawned tasks must be `Send`. Use `Arc`, and async channels to communicate.
- Never block the runtime. Use async I/O and `spawn_blocking`.
- Underneath, a future is a state machine with a `poll` method, and a runtime is a loop that polls.
:::

:::quiz Check your understanding
? What does calling an `async fn` do, by itself?
- It runs the function in a new thread
- It runs the function until the first `.await`
+ It creates a future. Nothing runs until the future is awaited or spawned
- It blocks until the function is finished
= Futures are lazy. The call only builds the value that describes the work.

? Two futures each wait 100 ms on a timer. How long does `tokio::join!(a, b)` take, roughly?
- 200 ms
+ 100 ms
- 50 ms
- It depends on the number of processor cores
= `join!` drives both at once. Their waiting times overlap, so the total is the longer of the two, even on a single thread.

? Why must you not call `std::thread::sleep` inside an async task?
- It does not compile
- It is less precise
+ It blocks the whole thread, so all other tasks that share that thread stop too
- It cancels the task
= A runtime thread serves many tasks and gets control back only at an `.await`. A blocking call holds it hostage. Use `tokio::time::sleep(...).await`.

? What happens to the slower branch of a `tokio::select!`?
- It keeps running in the background
- It is paused and continues at the next `select!`
+ Its future is dropped, which cancels it at the `.await` where it was waiting
- It panics
= `select!` continues with the first finished branch and drops the rest. Dropping a future is how cancellation works in async Rust.

? Which task is async the **wrong** tool for?
- A chat server with 20,000 open connections
- Downloading 500 web pages
+ Rendering a large image, which needs minutes of pure calculation
- Waiting for messages from several sources
= Async helps when tasks wait. A long calculation never waits, and gains nothing. It needs threads on several cores.
:::

:::exercise guided Three things at once
Write three async functions that each wait a different time (100, 200 and 300 ms) and return a number. Run all three with `tokio::join!`, add up the results, and show that the total time is close to 300 ms and not 600.
::hint
Each function is `async fn one() -> u32 { sleep(Duration::from_millis(100)).await; 1 }`. Measure with `Instant::now()` and `.elapsed()`. To get an output that is the same on every run, print whether the time was below 450 ms.
::solution
```rust ext run
use std::time::{Duration, Instant};
use tokio::time::sleep;

async fn wait_and_return(millis: u64, value: u32) -> u32 {
    sleep(Duration::from_millis(millis)).await;
    value
}

#[tokio::main]
async fn main() {
    let start = Instant::now();

    let (a, b, c) = tokio::join!(
        wait_and_return(100, 1),
        wait_and_return(200, 2),
        wait_and_return(300, 3),
    );

    let elapsed = start.elapsed();
    println!("sum {}", a + b + c);
    println!("faster than 450 ms: {}", elapsed < Duration::from_millis(450));
}
```
```output
sum 6
faster than 450 ms: true
```

One function with parameters replaces three nearly identical ones. `join!` returns a tuple with the results in the order of its arguments. The three timers run down together, so the total is about 300 ms. Awaiting them one after the other would take 600 ms.
:::

:::exercise practice A deadline for every request
Write `fetch(id: u32) -> String`, an async function that pretends to be a slow server: it waits `id * 60` milliseconds and returns `"page <id>"`. Request the ids 1 to 5 concurrently, each with a timeout of 200 ms, and print for each id whether it arrived or timed out, in order of id.
::hint
Spawn one task per id. Inside the task: `timeout(Duration::from_millis(200), fetch(id)).await`, which gives `Result<String, Elapsed>`. Collect the handles in a `Vec` and await them in order.
::solution
```rust ext run
use std::time::Duration;
use tokio::time::{sleep, timeout};

async fn fetch(id: u32) -> String {
    sleep(Duration::from_millis(id as u64 * 60)).await;
    format!("page {id}")
}

#[tokio::main]
async fn main() {
    let handles: Vec<_> = (1..=5)
        .map(|id| {
            tokio::spawn(async move {
                (id, timeout(Duration::from_millis(200), fetch(id)).await)
            })
        })
        .collect();

    for handle in handles {
        match handle.await.unwrap() {
            (_, Ok(page)) => println!("{page} arrived"),
            (id, Err(_)) => println!("request {id} timed out"),
        }
    }
}
```
```output
page 1 arrived
page 2 arrived
page 3 arrived
request 4 timed out
request 5 timed out
```

Each task returns a pair: its id and the outcome. Pages 1 to 3 need 60, 120 and 180 ms and arrive in time. Pages 4 and 5 would need 240 and 300 ms, and are cut off at 200. Because all five run concurrently, the whole program takes about 200 ms. When a timeout fires, the `fetch` future is dropped, and its work stops.
:::

:::exercise practice A worker with a mailbox
Give one task sole ownership of a `HashMap<String, u32>` of word counts. Other tasks send it words through an `mpsc` channel. When all senders are done, the owning task returns the map. Spawn 3 sender tasks that send the words of three sentences, and print the counts for "the" and "fox".
::hint
The owner is `tokio::spawn(async move { let mut counts = HashMap::new(); while let Some(word) = receiver.recv().await { *counts.entry(word).or_insert(0) += 1; } counts })`. Remember to `drop` the original sender, so that the channel closes when the three tasks have finished.
::solution
```rust ext run
use std::collections::HashMap;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() {
    let (sender, mut receiver) = mpsc::channel::<String>(16);

    let owner = tokio::spawn(async move {
        let mut counts: HashMap<String, u32> = HashMap::new();
        while let Some(word) = receiver.recv().await {
            *counts.entry(word).or_insert(0) += 1;
        }
        counts
    });

    for sentence in ["the quick brown fox", "the lazy dog and the fox", "a fox is quick"] {
        let sender = sender.clone();
        tokio::spawn(async move {
            for word in sentence.split_whitespace() {
                sender.send(word.to_string()).await.unwrap();
            }
        });
    }
    drop(sender);

    let counts = owner.await.unwrap();
    println!("the: {}, fox: {}", counts["the"], counts["fox"]);
}
```
```output
the: 3, fox: 3
```

The map has exactly one owner, the `owner` task, so it needs no `Arc` and no `Mutex`. Everyone else talks to it by sending messages. This design is called the **actor pattern**: a task that owns some state and a mailbox. Compare it with the mutex version of the same job in the last chapter. Here nothing is shared, and nothing can deadlock.
:::

:::exercise challenge At most three at a time
You have 10 jobs that each take 50 ms. Run them concurrently, but never more than 3 at the same moment. Use `tokio::sync::Semaphore`. Track the largest number of jobs that were running together with atomics, and print it.
::hint
`let limit = Arc::new(Semaphore::new(3));`. In each task, `let _permit = limit.acquire().await.unwrap();` waits for a free slot, and the slot is given back when `_permit` is dropped at the end of the task. Keep two `Arc<AtomicUsize>`: one for the number currently running (`fetch_add` at the start, `fetch_sub` at the end), and one for the maximum seen (`fetch_max`).
::solution
```rust ext run
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Semaphore;
use tokio::time::sleep;

#[tokio::main]
async fn main() {
    let limit = Arc::new(Semaphore::new(3));
    let running = Arc::new(AtomicUsize::new(0));
    let highest = Arc::new(AtomicUsize::new(0));

    let handles: Vec<_> = (1..=10)
        .map(|id| {
            let (limit, running, highest) = (Arc::clone(&limit), Arc::clone(&running), Arc::clone(&highest));
            tokio::spawn(async move {
                let _permit = limit.acquire().await.unwrap();

                let now = running.fetch_add(1, Ordering::SeqCst) + 1;
                highest.fetch_max(now, Ordering::SeqCst);
                sleep(Duration::from_millis(50)).await;      // the "work"
                running.fetch_sub(1, Ordering::SeqCst);

                id * 10
            })
        })
        .collect();

    let mut total = 0;
    for handle in handles {
        total += handle.await.unwrap();
    }
    println!("total {total}, at most {} jobs ran together", highest.load(Ordering::SeqCst));
}
```
```output
total 550, at most 3 jobs ran together
```

A **semaphore** is a counter of free slots. `acquire().await` takes one, and waits if none is free. The permit gives its slot back when it is dropped. All ten tasks are spawned at once, but seven of them wait at `acquire` until a slot opens.

Limiting concurrency like this is essential in real programs. It keeps a crawler from opening a thousand connections to one server, and keeps a service from being flooded by its own background work.
:::
