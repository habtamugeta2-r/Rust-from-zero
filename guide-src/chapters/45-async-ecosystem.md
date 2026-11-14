@id async-ecosystem
@part p10
@title Concurrency in practice: Rayon, Tokio, streams, reqwest and tower
@short Rayon, Tokio, reqwest, tower
@level advanced
@time 80
@learn Use all processor cores for a computation with Rayon | Set up a Tokio runtime, run heavy work beside it, and shut it down cleanly | Process values that arrive over time with streams | Call web APIs with reqwest | Add timeouts and limits with tower layers

Part 7 explained the machinery of concurrency: threads, locks, channels and async tasks. In daily work you rarely build on that machinery directly. A handful of crates package the common patterns, and this chapter is a tour of them.

| The work | The tool | Why |
|---|---|---|
| A calculation over a large collection | **Rayon** | splits the work over all cores, with one changed word |
| Many things that mostly wait: connections, requests, timers | **Tokio** | thousands of tasks on a few threads |
| A sequence of values that arrive over time | **streams** | iterators for async code |
| Calling a web API | **reqwest** | an HTTP client |
| Timeouts, limits, retries, logging around a service | **tower** | reusable layers |
| A few long-running background jobs | plain threads and channels | simple, and no crate is needed |

## Rayon: all cores for one calculation

:::analogy A team of movers
Four movers empty a lorry. Each one gets a quarter of the boxes. One of them has only light boxes and is finished early. A good mover does not sit down then: he walks over to a colleague who is behind, and takes boxes from the far end of that pile. Nobody plans this in advance, and still everyone is busy until the lorry is empty. Rayon's worker threads behave this way. The technique is called **work stealing**.
:::

Rayon gives **data parallelism**: the same operation is applied to many pieces of data, on all cores at once. Its main idea is the **parallel iterator**. You write an iterator chain as in [chapter 25](#iterators), and replace `iter()` by `par_iter()`:

```toml
[dependencies]
rayon = "1.12.0"
```

```rust ext run
use rayon::prelude::*;

fn is_prime(n: u64) -> bool {
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

fn main() {
    let numbers: Vec<u64> = (1..=1_000_000).collect();

    let one_thread: u64 = numbers.iter().map(|n| n * n).sum();
    let all_cores: u64 = numbers.par_iter().map(|n| n * n).sum();
    println!("{one_thread}");
    println!("{}", one_thread == all_cores);

    let primes = (0..100_000u64).into_par_iter().filter(|&n| is_prime(n)).count();
    println!("{primes} primes below 100000");

    // The order of the results is the order of the input
    let squares: Vec<u64> = (1..=8u64).into_par_iter().map(|n| n * n).collect();
    println!("{:?}", squares);
}
```
```output
333333833333500000
true
9592 primes below 100000
[1, 4, 9, 16, 25, 36, 49, 64]
```

- `use rayon::prelude::*;` brings the parallel methods into scope.
- `par_iter()` borrows the items, `par_iter_mut()` borrows them mutably, and `into_par_iter()` takes them. These are the three familiar forms, with `par_` in front. Ranges, vectors, slices, hash maps and strings all have them.
- Rayon starts one worker thread per core, once, and reuses them for every parallel operation in the program. You never create or join a thread.
- `collect` on a parallel iterator keeps the order of the input, although the pieces are computed in any order.

### How much faster?

In [chapter 30](#threads) you counted the primes below three million with two hand-made threads. It took 0.51 seconds on one thread and 0.32 seconds on two, because the upper half of the numbers is more work than the lower half. With Rayon, the whole program is this line:

```rust
let primes = (0..3_000_000u64).into_par_iter().filter(|&n| is_prime(n)).count();
```

On the same two-core machine it takes 0.25 seconds: twice as fast as one thread, and faster than the hand-made version. The reason is work stealing. Rayon does not cut the range into two fixed halves. It keeps splitting it into smaller pieces, and a thread that runs out of work takes pieces from the other one. Uneven work is balanced without any planning.

### More parallel tools

```rust ext run
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};

fn main() {
    // Change every element in place
    let mut prices = vec![100.0, 250.0, 80.0, 1200.0];
    prices.par_iter_mut().for_each(|price| *price *= 1.5);
    println!("{:?}", prices);

    // Sort on all cores
    let mut words = vec!["pear", "apple", "fig", "banana", "kiwi"];
    words.par_sort();
    println!("{:?}", words);

    // Search
    let numbers: Vec<i64> = (1..=1000).collect();
    println!("{}", numbers.par_iter().any(|&n| n * n == 3136));
    println!("{:?}", numbers.par_iter().find_first(|&&n| n * n > 2000));

    // Count with a shared atomic
    let long_words = AtomicUsize::new(0);
    words.par_iter().for_each(|word| {
        if word.len() > 4 {
            long_words.fetch_add(1, Ordering::Relaxed);
        }
    });
    println!("{}", long_words.load(Ordering::Relaxed));

    // Combine partial results: fold on each thread, then reduce
    let text = "the quick brown fox jumps over the lazy dog the end";
    let counts: HashMap<&str, usize> = text
        .par_split_whitespace()
        .fold(HashMap::new, |mut map, word| {
            *map.entry(word).or_insert(0) += 1;
            map
        })
        .reduce(HashMap::new, |mut left, right| {
            for (word, count) in right {
                *left.entry(word).or_insert(0) += count;
            }
            left
        });
    println!("the: {}, fox: {}", counts["the"], counts["fox"]);
}
```
```output
[150.0, 375.0, 120.0, 1800.0]
["apple", "banana", "fig", "kiwi", "pear"]
true
Some(45)
2
the: 3, fox: 1
```

| Method | Purpose |
|---|---|
| `map`, `filter`, `flat_map`, `sum`, `count`, `min`, `max`, `collect` | as on ordinary iterators |
| `for_each` | run a closure for every item. The order is not defined |
| `any`, `all`, `find_any`, `find_first` | searching. `find_any` returns whichever match is found first in time, `find_first` the first in order |
| `par_sort`, `par_sort_unstable`, `par_sort_by_key` | sorting a slice |
| `par_chunks(n)`, `par_chunks_mut(n)` | work on pieces of `n` items, such as the rows of an image |
| `fold` + `reduce` | build a partial result per thread, then merge the partial results |
| `par_bridge()` | turn any ordinary iterator into a parallel one |
| `rayon::join(a, b)` | run two closures, possibly at the same time |

In a parallel `fold`, every thread builds its own map without any locking. `reduce` then merges the maps in pairs. This "split, work alone, merge" pattern is much faster than one shared map behind a `Mutex`.

### The compiler still watches

Parallel code in most languages is risky, because nothing stops two threads from changing the same variable. In Rust the same rules as always apply. This attempt to add numbers into a shared variable is rejected:

```rust
use rayon::prelude::*;

fn main() {
    let numbers = vec![1, 2, 3, 4];
    let mut total = 0;
    numbers.par_iter().for_each(|n| total += n);
    println!("{total}");
}
```
```error
error[E0596]: cannot borrow `total` as mutable, as it is a captured variable in a `Fn` closure
 --> src/main.rs:6:37
  |
5 |     let mut total = 0;
  |         --------- `total` declared here, outside the closure
6 |     numbers.par_iter().for_each(|n| total += n);
  |                        -------------^^^^^------
  |                        |        |   |
  |                        |        |   cannot borrow as mutable
  |                        |        in this closure
  |                        expects `Fn` instead of `FnMut`
```

Rayon's `for_each` asks for a closure that is `Fn + Sync + Send`: one that several threads may call at the same moment. A closure that changes a captured variable is `FnMut`, so it does not qualify. The data race is caught before the program exists. The fixes are the ones you know: let Rayon combine the values (`.sum()`), or use an atomic or a `Mutex`.

This is what "fearless concurrency" means in practice. You can change `iter` to `par_iter` in a large program, and if it compiles, it has no data race.

### Divide and conquer with `join`

`rayon::join` runs two closures and returns both results. If another core is free, they run at the same time. Used inside a recursive function, it spreads a problem over all cores:

```rust ext run
/// Adds up a slice by splitting it in two, again and again.
fn parallel_sum(numbers: &[u64]) -> u64 {
    if numbers.len() <= 1_000 {
        return numbers.iter().sum();
    }
    let (left, right) = numbers.split_at(numbers.len() / 2);
    let (a, b) = rayon::join(|| parallel_sum(left), || parallel_sum(right));
    a + b
}

fn main() {
    let numbers: Vec<u64> = (1..=100_000).collect();
    println!("{}", parallel_sum(&numbers));
}
```
```output
5000050000
```

The two closures borrow `left` and `right` from the caller. That is allowed because `join` returns only when both are finished, as with scoped threads. Below 1,000 items the function stops splitting, because handing out very small pieces costs more than computing them.

### Dynamic scoped tasks with `rayon::scope`

`rayon::join` runs two tasks. When the number of parallel pieces is known only at run time (for example, traversing a tree or updating chunks of a slice) and those tasks need to borrow local data, use **`rayon::scope`**:

```rust ext run
fn main() {
    let mut out = [0_u64; 3];
    let inputs = [10_u64, 20, 30];

    rayon::scope(|s| {
        for (slot, &val) in out.iter_mut().zip(&inputs) {
            s.spawn(move |_| {
                *slot = val * val;
            });
        }
    });

    println!("{out:?}");
}
```
```output
[100, 400, 900]
```

Like `std::thread::scope`, `rayon::scope` guarantees every task spawned inside finishes before `scope` returns—so closures can hold short-lived `&` and disjoint `&mut` borrows safely without `'static` bounds or `Arc`.

### When Rayon does not help

- **Small jobs.** Handing work to other threads costs time. Measured on the test machine: adding up 1,000 numbers, repeated 1,000 times, took 0.05 milliseconds with `iter()` and 20 milliseconds with `par_iter()`. That is 400 times *slower*. Parallelism pays when each call has real work to do: roughly, when the sequential version takes at least a tenth of a millisecond.
- **Waiting.** Rayon's threads are meant for computing. Tasks that wait for the network or the disk belong to Tokio. A waiting task would block one of Rayon's few threads.
- **Work that depends on order.** `for_each` runs in any order. If you print inside it, the lines come out mixed.
- **Already parallel code.** If the outer loop is parallel, a parallel inner loop adds little.

So measure before and after, with `--release`.

## Tokio in practice

[Chapter 32](#async) introduced async programming with Tokio: tasks, `join!`, `select!`, channels and timeouts. Here are three things that every real service needs in addition.

### Choosing and building the runtime

`#[tokio::main]` creates a runtime with one worker thread per core. The attribute takes options, and a runtime can also be built by hand:

```rust ext run
use std::time::Duration;

fn main() {
    // A runtime built by hand, in a program whose `main` is not async
    let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().unwrap();

    let answer = runtime.block_on(async {
        let task = tokio::spawn(async {
            tokio::time::sleep(Duration::from_millis(10)).await;
            42
        });
        task.await.unwrap()
    });
    println!("{answer}");

    // One thread only
    let small = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    println!("{}", small.block_on(async { 1 + 1 }));
}
```
```output
42
2
```

| Form | Meaning |
|---|---|
| `#[tokio::main]` | multi-threaded runtime, one worker per core |
| `#[tokio::main(worker_threads = 4)]` | a fixed number of workers |
| `#[tokio::main(flavor = "current_thread")]` | everything on the calling thread. Good for small tools and for tests |
| `Builder::new_multi_thread()…build()` | by hand, for full control |
| `runtime.block_on(future)` | run a future to completion from ordinary, non-async code |

`block_on` is the bridge from synchronous code into async code. A program that is mostly synchronous can keep a runtime in a variable and call `block_on` where it needs an async library.

### Three async runtimes

Tokio is the runtime you will meet most often, but it is not the only one:

| | Tokio | async-std | smol |
|---|---|---|---|
| API | its own types (`tokio::spawn`, `tokio::time::sleep`) | deliberately similar to `std` (`async_std::task::spawn`, `async_std::stream`) | small and explicit (`smol::scale`, your own `Executor`) |
| How it starts | `#[tokio::main]` or a `Runtime` you build | `#[async_std::main]` | `smol::run(async { … })` |
| Ecosystem | the largest: Axum, reqwest, SQLx, tower all assume Tokio | smaller | smallest |
| Best fit | web services and most async programs | code that should read like `std` | tiny binaries and constrained devices |

All three run many tasks on a few threads, and all three follow the same golden rule: never block a worker thread. Tokio is the default choice because nearly every async crate is tested with it first.

### Heavy work beside async tasks

The golden rule of chapter 32 was: never block the runtime. A calculation that takes 50 milliseconds holds up every other task on that worker thread. There are two ways to move it out of the way:

```rust ext run
use tokio::sync::oneshot;

fn count_primes(limit: u64) -> usize {
    (2..limit).filter(|n| (2..*n).take_while(|d| d * d <= *n).all(|d| n % d != 0)).count()
}

#[tokio::main]
async fn main() {
    // 1. One blocking or heavy call: a thread from Tokio's blocking pool
    let primes = tokio::task::spawn_blocking(|| count_primes(50_000)).await.unwrap();
    println!("{primes}");

    // 2. Heavy parallel work: hand it to Rayon, and wait for the answer without blocking
    let (sender, receiver) = oneshot::channel();
    rayon::spawn(move || {
        use rayon::prelude::*;
        let total: usize = (0..4u64).into_par_iter().map(|i| count_primes(10_000 * (i + 1))).sum();
        let _ = sender.send(total);
    });
    println!("{}", receiver.await.unwrap());
}
```
```output
5133
10939
```

- `spawn_blocking` is for code that blocks: a slow calculation, a synchronous library, a file operation. Tokio runs it on a separate pool of threads.
- For work that should use all cores, start it with `rayon::spawn` and send the result back through a `oneshot` channel, which carries exactly one value. Awaiting the receiver does not block anything.

The two runtimes then work side by side: Tokio's threads handle the waiting, and Rayon's threads handle the computing.

### Shutting down cleanly

A server should not simply vanish when it is stopped. It should stop accepting new work, let running requests finish, save what must be saved, and then end. This is called a **graceful shutdown**. The crate `tokio-util` has two helpers for it:

```toml
[dependencies]
tokio-util = { version = "0.7.20", features = ["rt"] }
```

```rust ext run
use std::time::Duration;

use tokio::time::sleep;
use tokio_util::sync::CancellationToken;
use tokio_util::task::TaskTracker;

async fn worker(stop: CancellationToken) -> u32 {
    let mut jobs_done = 0;
    loop {
        tokio::select! {
            _ = stop.cancelled() => {
                // Tidy up here: flush files, close connections ...
                return jobs_done;
            }
            _ = sleep(Duration::from_millis(10)) => {
                jobs_done += 1;
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let stop = CancellationToken::new();
    let tracker = TaskTracker::new();

    for _ in 0..3 {
        tracker.spawn(worker(stop.clone()));
    }

    // In a real server: tokio::signal::ctrl_c().await
    sleep(Duration::from_millis(55)).await;

    println!("shutting down");
    stop.cancel();
    tracker.close();
    tracker.wait().await;
    println!("all workers have finished");
}
```
```output
shutting down
all workers have finished
```

- A **`CancellationToken`** is a signal that can be cloned and handed to every task. `cancel()` sets it, and `cancelled().await` completes when it is set. Each task checks it in a `select!`, next to its normal work.
- A **`TaskTracker`** remembers the tasks it spawned. `close()` followed by `wait().await` waits until all of them have returned.

The pattern is always the same: wait for the stop signal, cancel the token, wait for the tasks, and add a time limit in case one of them hangs.

### More of Tokio

| Part | Contents |
|---|---|
| `tokio::fs` | async versions of the file functions |
| `tokio::process` | start other programs and talk to them |
| `tokio::signal` | {{Ctrl}}+{{C}} and other signals from the operating system |
| `tokio::time` | `sleep`, `timeout`, `interval` (a tick every so often), `Instant` |
| `tokio::sync` | `mpsc`, `oneshot`, `broadcast`, `watch` (the latest value of something), `Mutex`, `RwLock`, `Semaphore`, `Notify`, `OnceCell` |
| `tokio::task` | `spawn`, `spawn_blocking`, `JoinSet`, `yield_now`, `LocalSet` (for futures that are not `Send`) |
| `tokio::io` | `BufReader`, `copy`, `split`, and `duplex` (a connection in memory, for tests) |
| `tokio-util` | cancellation tokens, task trackers, and codecs that cut a byte stream into messages |
| `tokio-console` | a live view of all the tasks in a running program |

## Streams: values that arrive over time

An iterator hands out values that are already there. A **stream** hands out values that arrive over time: messages from a connection, rows from a database, ticks of a timer. Getting the next value is something you `await`.

| | Iterator | Stream |
|---|---|---|
| The next value | `iterator.next()` | `stream.next().await` |
| The loop | `for x in iterator` | `while let Some(x) = stream.next().await` |
| Trait | `std::iter::Iterator` | `futures::Stream` |
| Adaptors | `map`, `filter`, `take`, … | the same, from `StreamExt` |

The standard library has no stable stream trait yet (as of Rust 1.100), so streams come from the crate `futures`, with helpers in `tokio-stream`:

```toml
[dependencies]
futures = "0.3.34"
tokio-stream = "0.1.19"
```

```rust ext run
use futures::stream::{self, StreamExt};

#[tokio::main]
async fn main() {
    // A stream from a list of values
    let mut numbers = stream::iter(1..=3);
    while let Some(n) = numbers.next().await {
        println!("got {n}");
    }

    // Adaptors, as with iterators
    let evens: Vec<u32> = stream::iter(1..=10).filter(|n| std::future::ready(n % 2 == 0)).map(|n| n * 10).collect().await;
    println!("{:?}", evens);

    // `then` runs an async step for each item, one after the other
    let lengths: Vec<usize> = stream::iter(["a", "bb", "ccc"])
        .then(|word| async move {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            word.len()
        })
        .collect()
        .await;
    println!("{:?}", lengths);

    let total = stream::iter(1..=100u32).fold(0, |sum, n| async move { sum + n }).await;
    println!("{total}");
}
```
```output
got 1
got 2
got 3
[20, 40, 60, 80, 100]
[1, 2, 3]
5050
```

- `use futures::stream::StreamExt;` provides `next` and the adaptors, as `Iterator` does for iterators.
- There is no `for` loop for streams yet. `while let Some(item) = stream.next().await` takes its place.
- Some adaptors of `futures` expect a closure that returns a future. For a plain test, `std::future::ready(value)` wraps a value into a future that is finished at once. That explains the `filter` line.

### Many at a time, but not too many

The most useful stream tool controls **how many** async operations run at the same time. `map` turns each item into a future, and `buffer_unordered(n)` runs up to `n` of those futures at once:

```rust ext run
use std::time::{Duration, Instant};

use futures::stream::{self, StreamExt};

/// Pretends to download a page. Every "download" takes 100 milliseconds.
async fn download(id: u32) -> String {
    tokio::time::sleep(Duration::from_millis(100)).await;
    format!("page {id}")
}

#[tokio::main]
async fn main() {
    let start = Instant::now();
    let pages: Vec<String> = stream::iter(1..=6).then(download).collect().await;
    println!("one at a time: {} pages in about {} ms", pages.len(), start.elapsed().as_millis() / 100 * 100);

    let start = Instant::now();
    let pages: Vec<String> = stream::iter(1..=6).map(download).buffer_unordered(3).collect().await;
    println!("three at a time: {} pages in about {} ms", pages.len(), start.elapsed().as_millis() / 100 * 100);

    let start = Instant::now();
    let pages: Vec<String> = stream::iter(1..=6).map(download).buffered(6).collect().await;
    println!("all at once, in order: {:?} in about {} ms", pages, start.elapsed().as_millis() / 100 * 100);
}
```
```output
one at a time: 6 pages in about 600 ms
three at a time: 6 pages in about 200 ms
all at once, in order: ["page 1", "page 2", "page 3", "page 4", "page 5", "page 6"] in about 100 ms
```

| Adaptor | Behaviour |
|---|---|
| `.then(f)` | one at a time, in order |
| `.map(f).buffered(n)` | up to `n` at a time. Results in the order of the input |
| `.map(f).buffer_unordered(n)` | up to `n` at a time. Results as soon as each is ready |
| `.for_each_concurrent(n, f)` | run `f` for each item, up to `n` at a time, with no results |

Why limit at all? Ten thousand downloads at once would overload your network, the other server, or the limit on open files. A limit of some tens keeps the speed and stays polite.

### `FuturesUnordered` and custom `Stream`s

When you want to poll a dynamic set of futures inside the **current** task—without spawning them onto Tokio (so they can borrow local variables and do not even need to be `Send`)—reach for **`FuturesUnordered`** from `futures::stream`:

```rust ext run nocmp
use std::time::Duration;
use futures::stream::{FuturesUnordered, StreamExt};

#[tokio::main]
async fn main() {
    let mut pending = FuturesUnordered::new();
    for (label, ms) in [("third", 120), ("first", 10), ("second", 50)] {
        pending.push(async move {
            tokio::time::sleep(Duration::from_millis(ms)).await;
            label
        });
    }

    let mut order = Vec::new();
    while let Some(label) = pending.next().await {
        order.push(label);
    }
    println!("{order:?}");
}
```
```output
["first", "second", "third"]
```

Choose between the three dynamic concurrency tools like this:

| Tool | Runs where | Bounds required | Cancellation on drop |
|---|---|---|---|
| `tokio::task::JoinSet` | Spawned across Tokio worker threads | Futures must be `Send + 'static` | Aborts all spawned tasks when dropped |
| `FuturesUnordered` | Polled cooperatively inside the current task | Can borrow local data; no `Send` needed | Drops all inner futures when dropped |
| `.map(f).buffer_unordered(n)` | Polled inside the current task with concurrency cap `n` | Driven lazily as you pull from the stream | Stops polling remaining items when dropped |

You can also implement `futures::Stream` on your own wrapper type by projecting `Pin<&mut Self>` with `pin-project-lite` ([chapter 32](#async)):

```rust
use std::pin::Pin;
use std::task::{Context, Poll};
use futures::Stream;
use pin_project_lite::pin_project;

pin_project! {
    /// Wraps any stream and counts yielded items.
    struct CountedStream<S> {
        #[pin]
        inner: S,
        seen: usize,
    }
}

impl<S: Stream> Stream for CountedStream<S> {
    type Item = (usize, S::Item);

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();
        match this.inner.poll_next(cx) {
            Poll::Ready(Some(item)) => {
                *this.seen += 1;
                Poll::Ready(Some((*this.seen, item)))
            }
            Poll::Ready(None) => Poll::Ready(None),
            Poll::Pending => Poll::Pending,
        }
    }
}
```

### Channels and timers as streams

`tokio-stream` wraps Tokio's types as streams, so that the adaptors work on them:

```rust ext run
use std::time::Duration;

use tokio::sync::mpsc;
use tokio_stream::wrappers::{IntervalStream, ReceiverStream};
use tokio_stream::StreamExt;

#[tokio::main]
async fn main() {
    // A channel as a stream
    let (sender, receiver) = mpsc::channel(8);
    tokio::spawn(async move {
        for reading in [21.5, 22.0, 35.5, 22.5, 40.0] {
            sender.send(reading).await.unwrap();
        }
    });

    let mut alarms = ReceiverStream::new(receiver).filter(|&temperature| temperature > 30.0).map(|t| format!("too hot: {t}"));
    while let Some(alarm) = alarms.next().await {
        println!("{alarm}");
    }

    // A timer as a stream
    let ticks = IntervalStream::new(tokio::time::interval(Duration::from_millis(20)));
    let count = ticks.take(3).fold(0, |n, _| n + 1).await;
    println!("{count} ticks");
}
```
```output
too hot: 35.5
too hot: 40
3 ticks
```

`tokio_stream::StreamExt` is a second trait with the same name as the one in `futures`. Its `filter` takes a plain closure. Import one of the two in a file, not both, or the compiler will complain that method names are ambiguous.

## reqwest: calling web APIs

Programs talk to web services through **HTTP**, the protocol of the web. The idea is simple:

- The **client** sends a **request**: a **method** (`GET` to read, `POST` to create, `PUT` or `PATCH` to change, `DELETE` to remove), a **URL**, some **headers** (extra information as name–value pairs), and sometimes a **body** (the data).
- The **server** returns a **response**: a **status code** (200 means OK, 404 means not found, 500 means the server failed), headers, and a body.

Most web APIs send and expect JSON bodies. An **HTTP client** is a library that sends requests. In Rust the standard choice is **reqwest**. It builds on Tokio and works with Serde.

```toml
[dependencies]
reqwest = { version = "0.13.5", features = ["json"] }
tokio = { version = "1.54.1", features = ["full"] }
serde = { version = "1.0.229", features = ["derive"] }
```

### A practice server

The examples need a server to talk to. So that they work without an internet connection and always give the same answers, each example starts a tiny server inside the same program, with the function below. It uses Axum, which is the subject of the [next chapter](#web), so there is no need to understand it yet. In the examples that follow, this function is part of the program but is not printed again.

```rust
/// Starts a small practice server inside this program and returns its address.
async fn start_demo_server() -> String {
    use axum::extract::Path;
    use axum::http::StatusCode;
    use axum::routing::{get, post};
    use axum::{Json, Router};
    use serde_json::{json, Value};

    let app = Router::new()
        .route("/hello", get(|| async { "Hello from the server!" }))
        .route(
            "/users/{id}",
            get(|Path(id): Path<u32>| async move {
                match id {
                    1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
                    2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
                    _ => Err(StatusCode::NOT_FOUND),
                }
            }),
        )
        .route(
            "/users",
            post(|Json(body): Json<Value>| async move {
                (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
            }),
        )
        .route(
            "/numbers/{id}",
            get(|Path(id): Path<u64>| async move {
                match id {
                    5 => {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        Ok(Json(json!({ "value": 50 })))
                    }
                    7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
                    _ => Ok(Json(json!({ "value": id * 10 }))),
                }
            }),
        )
        .route(
            "/slow",
            get(|| async {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                "finally"
            }),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}
```

It answers at `/hello` with a text, at `/users/1` and `/users/2` with a user as JSON, at `/numbers/<n>` with a number, and at `/slow` only after two seconds. With a real service, `base` would be an address such as `https://api.example.com`.

### A first request

```rust ext run
#[tokio::main]
async fn main() -> Result<(), reqwest::Error> {
    let base = start_demo_server().await;

    let response = reqwest::get(format!("{base}/hello")).await?;
    println!("status: {}", response.status());
    println!("type: {:?}", response.headers().get("content-type").unwrap());

    let body = response.text().await?;
    println!("body: {body}");
    Ok(())
}
#
# /// Starts a small practice server inside this program and returns its address.
# async fn start_demo_server() -> String {
#     use axum::extract::Path;
#     use axum::http::StatusCode;
#     use axum::routing::{get, post};
#     use axum::{Json, Router};
#     use serde_json::{json, Value};
#
#     let app = Router::new()
#         .route("/hello", get(|| async { "Hello from the server!" }))
#         .route(
#             "/users/{id}",
#             get(|Path(id): Path<u32>| async move {
#                 match id {
#                     1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
#                     2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
#                     _ => Err(StatusCode::NOT_FOUND),
#                 }
#             }),
#         )
#         .route(
#             "/users",
#             post(|Json(body): Json<Value>| async move {
#                 (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
#             }),
#         )
#         .route(
#             "/numbers/{id}",
#             get(|Path(id): Path<u64>| async move {
#                 match id {
#                     5 => {
#                         tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                         Ok(Json(json!({ "value": 50 })))
#                     }
#                     7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
#                     _ => Ok(Json(json!({ "value": id * 10 }))),
#                 }
#             }),
#         )
#         .route(
#             "/slow",
#             get(|| async {
#                 tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                 "finally"
#             }),
#         );
#
#     let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
#     let address = listener.local_addr().unwrap();
#     tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
#     format!("http://{address}")
# }
```
```output
status: 200 OK
type: "text/plain; charset=utf-8"
body: Hello from the server!
```

There are two `await`s. The first waits for the status and the headers. The second, in `text()`, waits for the body, which may be large and arrive later.

### JSON in both directions

```rust ext run
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct User {
    id: u32,
    name: String,
    email: String,
}

#[derive(Debug, Serialize)]
struct NewUser {
    name: String,
    email: String,
}

#[tokio::main]
async fn main() -> Result<(), reqwest::Error> {
    let base = start_demo_server().await;

    // Build one client and reuse it for all requests
    let client = reqwest::Client::builder().timeout(Duration::from_secs(5)).user_agent("rust-guide-example/1.0").build()?;

    // GET, with the JSON body converted into a struct
    let user: User = client.get(format!("{base}/users/1")).send().await?.error_for_status()?.json().await?;
    println!("{:?}", user);

    // POST with a JSON body
    let new_user = NewUser { name: String::from("Lena"), email: String::from("lena@example.com") };
    let response = client.post(format!("{base}/users")).json(&new_user).send().await?;
    println!("{}", response.status());
    let created: User = response.json().await?;
    println!("{} has id {} ({})", created.name, created.id, created.email);
    Ok(())
}
#
# /// Starts a small practice server inside this program and returns its address.
# async fn start_demo_server() -> String {
#     use axum::extract::Path;
#     use axum::http::StatusCode;
#     use axum::routing::{get, post};
#     use axum::{Json, Router};
#     use serde_json::{json, Value};
#
#     let app = Router::new()
#         .route("/hello", get(|| async { "Hello from the server!" }))
#         .route(
#             "/users/{id}",
#             get(|Path(id): Path<u32>| async move {
#                 match id {
#                     1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
#                     2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
#                     _ => Err(StatusCode::NOT_FOUND),
#                 }
#             }),
#         )
#         .route(
#             "/users",
#             post(|Json(body): Json<Value>| async move {
#                 (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
#             }),
#         )
#         .route(
#             "/numbers/{id}",
#             get(|Path(id): Path<u64>| async move {
#                 match id {
#                     5 => {
#                         tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                         Ok(Json(json!({ "value": 50 })))
#                     }
#                     7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
#                     _ => Ok(Json(json!({ "value": id * 10 }))),
#                 }
#             }),
#         )
#         .route(
#             "/slow",
#             get(|| async {
#                 tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                 "finally"
#             }),
#         );
#
#     let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
#     let address = listener.local_addr().unwrap();
#     tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
#     format!("http://{address}")
# }
```
```output
User { id: 1, name: "Sara", email: "sara@example.com" }
201 Created
Lena has id 3 (lena@example.com)
```

- A **`Client`** keeps connections open and reuses them. Create one for the whole program and share it. It is cheap to clone, because it holds an `Arc` inside.
- A request is built step by step: `client.get(url)` or `.post(url)`, then optional parts, then `.send().await`.
- `.json(&value)` serialises a value as the request body. `response.json::<T>().await` deserialises the response body. Both use Serde.

| Builder method | Adds |
|---|---|
| `.header("X-Api-Key", "…")` | a header |
| `.bearer_auth(token)` | a login token in the `Authorization` header |
| `.query(&[("page", "2")])` | parameters at the end of the URL: `?page=2` |
| `.json(&value)` | a JSON body |
| `.form(&value)` | a body in the format of web forms |
| `.body(text_or_bytes)` | a raw body |
| `.timeout(duration)` | a time limit for this request |

### What can go wrong

```rust ext run
use std::time::Duration;

#[tokio::main]
async fn main() {
    let base = start_demo_server().await;
    let client = reqwest::Client::builder().timeout(Duration::from_millis(300)).build().unwrap();

    // 1. The server answers, but with an error status
    let response = client.get(format!("{base}/users/99")).send().await.unwrap();
    println!("{} (is success: {})", response.status(), response.status().is_success());
    match response.error_for_status() {
        Ok(_) => println!("fine"),
        Err(error) => println!("as an error: status = {:?}", error.status()),
    }

    // 2. The server is too slow
    match client.get(format!("{base}/slow")).send().await {
        Ok(_) => println!("fine"),
        Err(error) => println!("is_timeout: {}", error.is_timeout()),
    }

    // 3. Nobody is listening at this address
    match client.get("http://127.0.0.1:1/").send().await {
        Ok(_) => println!("fine"),
        Err(error) => println!("is_connect: {}", error.is_connect()),
    }

    // 4. The body is not what we expected
    let result = client.get(format!("{base}/hello")).send().await.unwrap().json::<Vec<u32>>().await;
    println!("is_decode: {}", result.unwrap_err().is_decode());
}
#
# /// Starts a small practice server inside this program and returns its address.
# async fn start_demo_server() -> String {
#     use axum::extract::Path;
#     use axum::http::StatusCode;
#     use axum::routing::{get, post};
#     use axum::{Json, Router};
#     use serde_json::{json, Value};
#
#     let app = Router::new()
#         .route("/hello", get(|| async { "Hello from the server!" }))
#         .route(
#             "/users/{id}",
#             get(|Path(id): Path<u32>| async move {
#                 match id {
#                     1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
#                     2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
#                     _ => Err(StatusCode::NOT_FOUND),
#                 }
#             }),
#         )
#         .route(
#             "/users",
#             post(|Json(body): Json<Value>| async move {
#                 (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
#             }),
#         )
#         .route(
#             "/numbers/{id}",
#             get(|Path(id): Path<u64>| async move {
#                 match id {
#                     5 => {
#                         tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                         Ok(Json(json!({ "value": 50 })))
#                     }
#                     7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
#                     _ => Ok(Json(json!({ "value": id * 10 }))),
#                 }
#             }),
#         )
#         .route(
#             "/slow",
#             get(|| async {
#                 tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                 "finally"
#             }),
#         );
#
#     let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
#     let address = listener.local_addr().unwrap();
#     tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
#     format!("http://{address}")
# }
```
```output
404 Not Found (is success: false)
as an error: status = Some(404)
is_timeout: true
is_connect: true
is_decode: true
```

:::warn A 404 is not an `Err`
`send()` returns `Ok` whenever the server answered at all, even with "404 Not Found" or "500 Internal Server Error". Check `response.status()`, or call `.error_for_status()?`, which turns error statuses into an `Err`. Forgetting this is the most common mistake with HTTP clients.
:::

:::warn Always set a timeout
reqwest has no time limit by default. A request to a server that never answers waits for ever, and so does your task. Set `.timeout(…)` on the client.
:::

### A smaller client: `ureq`

reqwest is powerful, and it needs Tokio. A script or a command-line tool often does not want an async runtime at all. **ureq** is a minimal, blocking HTTP client: one call does the whole request and waits for the answer.

```toml
ureq = "2.11"
```

A tiny server and a client that talks to it, all in one program:

```rust ext run
use std::io::Write;
use std::net::TcpListener;
use std::thread;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let address = listener.local_addr()?;

    thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: 11\r\n\r\nhello, ureq",
            );
        }
    });

    let response = ureq::get(&format!("http://{address}/"))
        .timeout(std::time::Duration::from_secs(5))
        .call()?;

    println!("status: {}", response.status());
    println!("{}", response.into_string()?);
    Ok(())
}
```

```output
status: 200
hello, ureq
```

- `.call()` performs the request and waits. No `async`, no `await`, no runtime.
- `response.status()` is the status code, and `into_string()` reads the whole body as text.
- `timeout` sets an upper bound: a server that never answers does not wait forever.
- Other builders: `.set("header", "value")` for headers, `.send_json(&value)` for a JSON body, and `ureq::Agent` to reuse connections across many requests (the equivalent of reqwest's `Client`).

| | reqwest | ureq |
|---|---|---|
| Async | yes, on Tokio | no |
| Best fit | services, many requests at once | scripts and command-line tools |

Choose reqwest for a server or for many requests at once; choose ureq when a small dependency and no runtime matter more.


### Many requests at once

Streams and reqwest together give the standard recipe for calling an API many times: a limited number of requests in flight, and a time limit for each.

```rust ext run
use std::time::{Duration, Instant};

use futures::stream::{self, StreamExt};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct Number {
    value: u64,
}

async fn fetch(client: &reqwest::Client, base: &str, id: u64) -> Result<u64, reqwest::Error> {
    let number: Number = client.get(format!("{base}/numbers/{id}")).send().await?.error_for_status()?.json().await?;
    Ok(number.value)
}

#[tokio::main]
async fn main() {
    let base = start_demo_server().await;
    let client = reqwest::Client::builder().timeout(Duration::from_millis(300)).build().unwrap();
    let start = Instant::now();

    let mut results: Vec<(u64, Result<u64, reqwest::Error>)> = stream::iter(1..=8u64)
        .map(|id| {
            let client = &client;
            let base = &base;
            async move { (id, fetch(client, base, id).await) }
        })
        .buffer_unordered(4)
        .collect()
        .await;
    results.sort_by_key(|(id, _)| *id);

    let mut total = 0;
    for (id, result) in &results {
        match result {
            Ok(value) => total += value,
            Err(error) if error.is_timeout() => println!("number {id}: too slow"),
            Err(error) => println!("number {id}: failed with {:?}", error.status()),
        }
    }
    println!("total of the others: {total}");
    println!("finished in under a second: {}", start.elapsed() < Duration::from_secs(1));
}
#
# /// Starts a small practice server inside this program and returns its address.
# async fn start_demo_server() -> String {
#     use axum::extract::Path;
#     use axum::http::StatusCode;
#     use axum::routing::{get, post};
#     use axum::{Json, Router};
#     use serde_json::{json, Value};
#
#     let app = Router::new()
#         .route("/hello", get(|| async { "Hello from the server!" }))
#         .route(
#             "/users/{id}",
#             get(|Path(id): Path<u32>| async move {
#                 match id {
#                     1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
#                     2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
#                     _ => Err(StatusCode::NOT_FOUND),
#                 }
#             }),
#         )
#         .route(
#             "/users",
#             post(|Json(body): Json<Value>| async move {
#                 (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
#             }),
#         )
#         .route(
#             "/numbers/{id}",
#             get(|Path(id): Path<u64>| async move {
#                 match id {
#                     5 => {
#                         tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                         Ok(Json(json!({ "value": 50 })))
#                     }
#                     7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
#                     _ => Ok(Json(json!({ "value": id * 10 }))),
#                 }
#             }),
#         )
#         .route(
#             "/slow",
#             get(|| async {
#                 tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                 "finally"
#             }),
#         );
#
#     let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
#     let address = listener.local_addr().unwrap();
#     tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
#     format!("http://{address}")
# }
```
```output
number 5: too slow
number 7: failed with Some(500)
total of the others: 240
finished in under a second: true
```

The practice server answers number 5 only after two seconds, and number 7 with an error. Each result is kept together with its id, so one failure does not hide the other answers. This is the same idea as in [chapter 25](#iterators): decide per item what an error means.

:::note Encrypted connections
An address that starts with `https://` is encrypted with **TLS**. reqwest handles this for you. In version 0.13 it uses `rustls` by default, a TLS library written in Rust, so that no system library has to be installed. For a small script that needs no async code, `reqwest::blocking` offers the same API without `await` (enable the feature `blocking`). The crate `ureq` is a smaller, blocking alternative.
:::

## tower: layers around a service

A request should have a time limit. There should not be too many at once. Each one should be logged. Failed ones might be retried. These wishes are the same for every server and every client, whatever the request means. **tower** is the crate that lets such behaviour be written once and reused everywhere.

:::analogy An onion
A tower service is built like an onion. In the middle is your own code. Around it are layers: one checks the time, one counts, one writes the log. A request passes through the layers from the outside to the middle, and the response travels back out through the same layers. Each layer can change the request, refuse it, or act on the response.
:::

Two ideas are enough:

- A **`Service`** is an async function with a name: it takes a request and returns a future of `Result<Response, Error>`.
- A **`Layer`** wraps a service and gives back a new service. Code that sits in the path of every request like this is called **middleware**.

```toml
[dependencies]
tower = { version = "0.5.3", features = ["util", "timeout", "limit"] }
```

```rust ext run
use std::time::Duration;

use tower::{BoxError, Service, ServiceBuilder, ServiceExt};

/// The innermost service: an async function from a request to a response.
async fn lookup(word: String) -> Result<String, BoxError> {
    match word.as_str() {
        "slow" => {
            tokio::time::sleep(Duration::from_secs(2)).await;
            Ok(String::from("finally"))
        }
        "" => Err("empty request".into()),
        _ => Ok(format!("{word} has {} letters", word.len())),
    }
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let mut service = ServiceBuilder::new()
        .concurrency_limit(10) // at most 10 requests at the same time
        .timeout(Duration::from_millis(100)) // give up after 100 ms
        .map_request(|word: &str| word.trim().to_lowercase())
        .map_response(|answer: String| format!("[{answer}]"))
        .service_fn(lookup);

    for request in ["  Rust ", "slow", ""] {
        match service.ready().await?.call(request).await {
            Ok(answer) => println!("{answer}"),
            Err(error) => println!("error: {error}"),
        }
    }
    Ok(())
}
```
```output
[rust has 4 letters]
error: request timed out
error: empty request
```

- `ServiceBuilder` stacks layers. The first one listed is the outermost.
- `service_fn` turns an async function into a service.
- `service.ready().await?` waits until the service can take a request (the concurrency limit may make it wait), and `.call(request)` sends it.
- The function `lookup` knows nothing about timeouts or limits. The layers add them from outside.

| Layer | Effect |
|---|---|
| `timeout` | fail a request that takes too long |
| `concurrency_limit` | at most `n` requests at the same time. The others wait |
| `rate_limit` | at most `n` requests per period |
| `load_shed` | refuse at once when the service is busy, without waiting |
| `retry` | repeat failed requests, by a policy you define |
| `buffer` | put a queue in front of the service, so that it can be shared |

The crate **`tower-http`** adds layers that understand HTTP: request logging (`TraceLayer`), compression, CORS headers, limits on body size, time limits, and serving files. In the next chapter you will add them to a web server with one line each.

The real value of tower is that the ecosystem agrees on it. The web framework Axum, the gRPC library `tonic` and the HTTP library `hyper` all speak in tower services. A layer written once works with all of them, for servers and for clients.

:::details How a layer is built
You will rarely write a layer yourself. Seeing one removes the mystery. This layer counts the requests that pass through:

```rust ext run
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::task::{Context, Poll};

use tower::{service_fn, BoxError, Layer, Service, ServiceExt};

/// The layer: a recipe for wrapping a service.
#[derive(Clone)]
struct CountLayer {
    counter: Arc<AtomicU32>,
}

impl<S> Layer<S> for CountLayer {
    type Service = Count<S>;

    fn layer(&self, inner: S) -> Count<S> {
        Count { inner, counter: self.counter.clone() }
    }
}

/// The wrapped service: counts each request, then passes it on.
#[derive(Clone)]
struct Count<S> {
    inner: S,
    counter: Arc<AtomicU32>,
}

impl<S, Request> Service<Request> for Count<S>
where
    S: Service<Request>,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = S::Future;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, request: Request) -> Self::Future {
        self.counter.fetch_add(1, Ordering::Relaxed);
        self.inner.call(request)
    }
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    let counter = Arc::new(AtomicU32::new(0));
    let double = service_fn(|n: u32| async move { Ok::<u32, BoxError>(n * 2) });

    let mut service = CountLayer { counter: counter.clone() }.layer(double);

    for n in [1, 2, 3] {
        println!("{}", service.ready().await?.call(n).await?);
    }
    println!("requests seen: {}", counter.load(Ordering::Relaxed));
    Ok(())
}
```
```output
2
4
6
requests seen: 3
```

The `Service` trait has two methods. `poll_ready` says whether the service can accept a request now. `call` takes the request and returns a future. `Count<S>` is generic over the inner service `S`, so it wraps any service at all. That is all there is to middleware: a struct that holds the next service, does something, and passes the request on. For simple cases, Axum offers a shorter way with an async function, as the next chapter shows.
:::

## gRPC services with `tonic`

Between internal backend services, HTTP + JSON is sometimes slower or looser than you want: every field name is repeated as text on the wire, and clients and servers only discover schema mismatches when parsing fails. **gRPC** solves both with **Protocol Buffers** (`.proto` schemas) over HTTP/2: compact binary frames, generated client and server structs in Rust, and bidirectional streaming built in.

In Rust, **`tonic`** (built on Tokio, Hyper, and Tower) is the standard gRPC crate, paired with **`prost`** and `tonic-build`:

```protobuf file=proto/greeter.proto
syntax = "proto3";
package greeter;

service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
}

message HelloRequest { string name = 1; }
message HelloReply   { string message = 1; }
```

```rust file=build.rs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::compile_protos("proto/greeter.proto")?;
    Ok(())
}
```

```rust file=src/main.rs
use tonic::{Request, Response, Status, transport::Server};

pub mod greeter {
    tonic::include_proto!("greeter");
}

use greeter::greeter_server::{Greeter, GreeterServer};
use greeter::{HelloReply, HelloRequest};

#[derive(Default)]
struct MyGreeter;

#[tonic::async_trait]
impl Greeter for MyGreeter {
    async fn say_hello(&self, request: Request<HelloRequest>) -> Result<Response<HelloReply>, Status> {
        let name = request.into_inner().name;
        Ok(Response::new(HelloReply { message: format!("Hello, {name}!") }))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let addr = "0.0.0.0:50051".parse()?;
    Server::builder()
        .add_service(GreeterServer::new(MyGreeter))
        .serve(addr)
        .await?;
    Ok(())
}
```

Because `tonic` runs on `tower`, timeouts, concurrency limits, and request-ID / OpenTelemetry layers attach to a gRPC server the exact same way as to Axum. Choose **REST/JSON** for public browser APIs and simple integrations; choose **gRPC (`tonic`)** for high-throughput internal service-to-service contracts and streaming RPCs.

## Background jobs, queues, and messaging

Spawning a background task with `tokio::spawn` works for fire-and-forget work inside a single process, **until the server restarts or crashes**: anything sitting only in memory vanishes. Production services separate accepting a request from doing slow work (sending email, resizing images, syncing billing) using durable queues and message brokers:

- **Durable job queues on your existing database** (`sqlx` + `SELECT ... FOR UPDATE SKIP LOCKED`, or the `apalis` crate): workers claim pending rows in SQL transactions. Zero new infrastructure, ACID guarantees, and survived restarts.
- **Task queues / pub-sub (`lapin` for RabbitMQ, `async-nats` for NATS)**: route messages between independent services with explicit acknowledgements (**ACK** after the work succeeds, **NACK** / dead-letter queue after repeated failures).
- **Distributed event logs (`rdkafka` for Kafka / Redpanda)**: append-only partitioned logs when multiple consumer groups need to replay days of events independently.

```rust file=src/worker.rs
use futures::StreamExt;
use tokio_util::sync::CancellationToken;

async fn run_nats_worker(client: async_nats::Client, stop: CancellationToken) -> Result<(), Box<dyn std::error::Error>> {
    let mut subscriber = client.subscribe("orders.created").await?;

    loop {
        tokio::select! {
            _ = stop.cancelled() => {
                // Stop reading new messages and flush any in-flight work
                break;
            }
            Some(msg) = subscriber.next() => {
                // Handlers must be idempotent: redelivering the same event_id
                // after a network glitch must not charge a customer twice.
                println!("received {} bytes on {}", msg.payload.len(), msg.subject);
            }
        }
    }
    Ok(())
}
```

:::warn Design message handlers to be idempotent
Virtually every queue delivers messages **at least once**: if a worker processes a job and crashes a millisecond before sending the ACK, the broker hands the same message to another worker. Store a unique `idempotency_key` (or processed event ID in a `UNIQUE` database column) inside the same transaction so duplicate deliveries become harmless no-ops.
:::

## More crates for networking

| Need | Crates |
|---|---|
| HTTP at a low level | `hyper` (reqwest and Axum are built on it), `http` (the shared types) |
| gRPC (typed calls between services) | `tonic`, with `prost` for Protocol Buffers |
| WebSockets (a lasting two-way connection) | `tokio-tungstenite`. Axum has them built in |
| TLS | `rustls`, `tokio-rustls` |
| QUIC and HTTP/3 | `quinn`, `h3` |
| Message queues | `lapin` (RabbitMQ), `rdkafka` (Kafka), `async-nats` (NATS) |
| Redis | `redis`, `fred` |
| E-mail | `lettre` |
| DNS | `hickory-resolver` |
| Other async runtimes | `smol` (small and simple), `embassy` (for microcontrollers, [chapter 50](#games-embedded)) |

:::compare Parallelism and HTTP elsewhere
- **Python** has `multiprocessing` and `concurrent.futures`. Because of the interpreter lock, parallel calculations long needed separate processes, with data copied between them. `requests` and `httpx` are its HTTP clients.
- **Java** has parallel streams (`list.parallelStream()`), built on a work-stealing pool like Rayon's. Nothing checks that the lambda is safe to run in parallel.
- **C#** has PLINQ (`.AsParallel()`) and `Parallel.ForEach`, with the same caveat.
- **C++** has parallel algorithms and OpenMP. Data races are undefined behaviour.
- **Go** starts a goroutine per piece of work and collects results through channels. Limits are built by hand with a channel used as a semaphore.
- **JavaScript** uses `Promise.all` for concurrent requests, on one thread. Limiting the number in flight needs a helper library.
- **Rust** offers the one-word change of Java and C#, with the compiler's proof that the closure is safe to share between threads.
:::

:::recap
- Rayon runs iterator chains on all cores: `par_iter`, `par_iter_mut`, `into_par_iter`. Work stealing balances uneven work. The closure rules (`Fn + Send + Sync`) rule out data races.
- Parallelism pays for large jobs. For small ones it is slower. Measure in release mode.
- A Tokio runtime can be configured or built by hand. `block_on` runs a future from synchronous code.
- Heavy work leaves the async threads through `spawn_blocking`, or through Rayon with a `oneshot` channel.
- `CancellationToken` and `TaskTracker` give a graceful shutdown.
- A stream is an async iterator. `map(…).buffer_unordered(n)` runs up to `n` operations at once.
- reqwest sends HTTP requests. Reuse one `Client`, set a timeout, and check the status.
- tower wraps services in layers such as timeouts and limits. The same layers work across the ecosystem.
:::

:::quiz Check your understanding
? What do you change to make `numbers.iter().map(f).sum()` use all cores with Rayon?
- Wrap the line in `thread::spawn`
+ Replace `iter()` by `par_iter()` (and import `rayon::prelude::*`)
- Add `.await`
- Put the vector in a `Mutex`
= Parallel iterators have the same adaptors as ordinary ones. Rayon splits the work and combines the results.

? Why did Rayon count the primes faster than two hand-made threads that each took half of the range?
- Rayon uses more threads than there are cores
- Rayon has a faster prime test
+ Work stealing: a thread that runs out of work takes pieces from the other, so uneven work is balanced
- Rayon skips some numbers
= The upper half of the range is more work. Fixed halves leave one thread idle at the end. Rayon keeps splitting and sharing.

? A parallel `for_each` closure does `total += n` on a captured variable. What happens?
- The result is sometimes wrong
- The program panics
+ It does not compile: the closure would be `FnMut`, and Rayon requires `Fn + Send + Sync`
- Rayon adds a lock automatically
= The data race is rejected at compile time. Use `.sum()`, an atomic, or a `Mutex`.

? What does `stream::iter(urls).map(fetch).buffer_unordered(5)` do?
- It fetches the URLs one after the other, in groups of five
+ It keeps up to five fetches running at the same time, and yields each result as soon as it is ready
- It fetches only the first five URLs
- It starts five threads
= `map` creates the futures lazily, and `buffer_unordered(5)` drives at most five of them at once. No extra threads are involved.

? A reqwest call `client.get(url).send().await` returns `Ok(response)`. What do you know?
- The request succeeded with status 200
+ Only that the server answered. The status may still be 404 or 500
- The body has been downloaded and is valid JSON
- The connection was encrypted
= An HTTP error status is a normal response. Check `status()`, or use `error_for_status()`.
:::

:::exercise guided Count words on all cores
Create 2,000 texts of different lengths (for example `"rust is fun ".repeat(i % 50 + 1)`). Count the words of all texts together, once with `iter()` and once with `par_iter()`, and check that the results are equal. Then find the largest word count of a single text, in parallel.
::hint
Write `fn count_words(text: &str) -> usize` with `split_whitespace().count()`. The total is `documents.par_iter().map(|text| count_words(text)).sum()`. For the largest, end the same chain with `.max()`.
::solution
```rust ext run
use rayon::prelude::*;

fn count_words(text: &str) -> usize {
    text.split_whitespace().count()
}

fn main() {
    // 2,000 "documents" of different lengths
    let documents: Vec<String> = (1..=2_000).map(|i| "rust is fun ".repeat(i % 50 + 1)).collect();

    let one_thread: usize = documents.iter().map(|text| count_words(text)).sum();
    let all_cores: usize = documents.par_iter().map(|text| count_words(text)).sum();

    println!("{one_thread} words");
    println!("{}", one_thread == all_cores);

    let longest = documents.par_iter().map(|text| count_words(text)).max();
    println!("{:?}", longest);
}
```
```output
153000 words
true
Some(150)
```

The parallel version differs by four letters. This works because `count_words` is a pure function: it reads its input and returns a value, and touches nothing else. Pure functions are the ideal partners for Rayon. Comparing the parallel result with the sequential one, as done here, is also a good test to keep.
:::

:::exercise practice Image rows
A grey image is stored as a `Vec<u8>` with one byte per pixel, row after row. For an image 8 wide and 4 high, with pixel `i` having the value `i * 8`: brighten every pixel by 60 without overflow, find the brightest pixel of each row, and mirror every row. Use Rayon for all three steps.
::hint
`par_iter_mut().for_each(…)` with `saturating_add` brightens. `par_chunks(width)` gives the rows as slices, and `par_chunks_mut(width)` gives them mutably, so that `row.reverse()` can mirror them.
::solution
```rust ext run
use rayon::prelude::*;

fn main() {
    let width = 8;
    let height = 4;
    // A grey image: one byte per pixel, row after row
    let mut pixels: Vec<u8> = (0..width * height).map(|i| (i * 8) as u8).collect();

    // Brighten every pixel. `saturating_add` stops at 255.
    pixels.par_iter_mut().for_each(|pixel| *pixel = pixel.saturating_add(60));

    // Work on whole rows: the brightest pixel of each row
    let brightest: Vec<u8> = pixels.par_chunks(width).map(|row| row.iter().copied().max().unwrap_or(0)).collect();
    println!("{:?}", brightest);

    // Mirror each row in place
    pixels.par_chunks_mut(width).for_each(|row| row.reverse());
    println!("{:?}", &pixels[..width]);

    let average = pixels.par_iter().map(|&p| p as u32).sum::<u32>() / pixels.len() as u32;
    println!("{average}");
}
```
```output
[116, 180, 244, 255]
[116, 108, 100, 92, 84, 76, 68, 60]
177
```

`par_chunks_mut` hands each thread its own rows. The slices do not overlap, so several threads may write at the same time, and the borrow checker can see that this is safe. Image processing fits Rayon well: a real photo has millions of pixels, and each row can be handled alone. For an image this small, of course, the sequential version would be faster.
:::

:::exercise practice Try again
Network calls fail now and then, and often work at the second attempt. Write an async function `retry(attempts, first_pause, operation)` that calls an async closure until it returns `Ok`, at most `attempts` times. After each failure it waits, and the pause doubles each time (this is called **exponential backoff**). Test it with an operation that fails twice and then succeeds.
::hint
The parameter can be `mut operation: impl AsyncFnMut() -> Result<T, E>`, and the call is `operation().await`. Use a `loop` with a `match`. A match guard `Err(error) if attempt < attempts` separates "try again" from "give up". For the test, an async closure can capture and change a counter: `async || { calls += 1; … }`.
::solution
```rust ext run
use std::fmt::Display;
use std::time::Duration;

/// Calls `operation` until it succeeds, at most `attempts` times.
/// The pause doubles after each failure.
async fn retry<T, E: Display>(attempts: u32, first_pause: Duration, mut operation: impl AsyncFnMut() -> Result<T, E>) -> Result<T, E> {
    let mut pause = first_pause;
    let mut attempt = 1;
    loop {
        match operation().await {
            Ok(value) => return Ok(value),
            Err(error) if attempt < attempts => {
                println!("attempt {attempt} failed: {error}. Waiting {} ms", pause.as_millis());
                tokio::time::sleep(pause).await;
                pause *= 2;
                attempt += 1;
            }
            Err(error) => return Err(error),
        }
    }
}

#[tokio::main]
async fn main() {
    // An operation that fails twice and then works
    let mut calls = 0;
    let result = retry(5, Duration::from_millis(10), async || {
        calls += 1;
        if calls < 3 { Err(format!("server busy (call {calls})")) } else { Ok(calls * 100) }
    })
    .await;
    println!("{:?} after {calls} calls", result);

    // An operation that never works
    let result: Result<u32, &str> = retry(3, Duration::from_millis(10), async || Err("no connection")).await;
    println!("{:?}", result);
}
```
```output
attempt 1 failed: server busy (call 1). Waiting 10 ms
attempt 2 failed: server busy (call 2). Waiting 20 ms
Ok(300) after 3 calls
attempt 1 failed: no connection. Waiting 10 ms
attempt 2 failed: no connection. Waiting 20 ms
Err("no connection")
```

`AsyncFnMut` is the async relative of `FnMut`: a closure that can be called several times, may change what it captured, and returns a future each time. The function is generic over the success type `T` and the error type `E`, so it works with any operation.

Doubling the pause matters in real systems. If a server is overloaded and a thousand clients retry at once, they overload it again. Growing pauses give it room to recover. Real implementations also add a little randomness to the pause (called *jitter*), so that the clients do not all return at the same instant. And retry only operations that are safe to repeat: reading is, "transfer money" may not be.
:::

:::exercise challenge A health checker
Write a program that checks whether a list of services is alive. Each service has a name and a URL. Check them concurrently, at most three at a time, with a time limit of 300 milliseconds each. Classify each as `Up` (success status), `Broken(code)` (an error status), `Slow` (timed out) or `Unreachable` (no connection). Print a report sorted by name, and a summary line. Use the practice server: `/hello` and `/users/1` are fine, `/slow` is slow, `/numbers/7` answers with status 500, and nothing listens at `http://127.0.0.1:1/`.
::hint
Define `enum Health` and an `async fn check(client: &reqwest::Client, url: &str) -> Health` that matches on the result of `send().await`. Use match guards: `Ok(response) if response.status().is_success()`, and `Err(error) if error.is_timeout()`. Run the checks with `stream::iter(&services).map(…).buffer_unordered(3).collect().await`, with each future returning `(name, health)`. Sort the result before printing.
::solution
```rust ext run
use std::time::Duration;

use futures::stream::{self, StreamExt};

#[derive(Debug, PartialEq)]
enum Health {
    Up,
    Slow,
    Unreachable,
    Broken(u16),
}

async fn check(client: &reqwest::Client, url: &str) -> Health {
    match client.get(url).send().await {
        Ok(response) if response.status().is_success() => Health::Up,
        Ok(response) => Health::Broken(response.status().as_u16()),
        Err(error) if error.is_timeout() => Health::Slow,
        Err(_) => Health::Unreachable,
    }
}

#[tokio::main]
async fn main() {
    let base = start_demo_server().await;
    let services = vec![
        ("greeter", format!("{base}/hello")),
        ("reports", format!("{base}/slow")),
        ("users", format!("{base}/users/1")),
        ("billing", format!("{base}/numbers/7")),
        ("archive", String::from("http://127.0.0.1:1/")),
    ];

    let client = reqwest::Client::builder().timeout(Duration::from_millis(300)).build().unwrap();

    let mut report: Vec<(&str, Health)> = stream::iter(&services)
        .map(|(name, url)| {
            let client = &client;
            async move { (*name, check(client, url).await) }
        })
        .buffer_unordered(3)
        .collect()
        .await;
    report.sort_by_key(|(name, _)| *name);

    for (name, health) in &report {
        println!("{name:<8} {health:?}");
    }
    let up = report.iter().filter(|(_, health)| *health == Health::Up).count();
    println!("{up} of {} services are up", report.len());
}
#
# /// Starts a small practice server inside this program and returns its address.
# async fn start_demo_server() -> String {
#     use axum::extract::Path;
#     use axum::http::StatusCode;
#     use axum::routing::{get, post};
#     use axum::{Json, Router};
#     use serde_json::{json, Value};
#
#     let app = Router::new()
#         .route("/hello", get(|| async { "Hello from the server!" }))
#         .route(
#             "/users/{id}",
#             get(|Path(id): Path<u32>| async move {
#                 match id {
#                     1 => Ok(Json(json!({ "id": 1, "name": "Sara", "email": "sara@example.com" }))),
#                     2 => Ok(Json(json!({ "id": 2, "name": "Tomas", "email": "tomas@example.com" }))),
#                     _ => Err(StatusCode::NOT_FOUND),
#                 }
#             }),
#         )
#         .route(
#             "/users",
#             post(|Json(body): Json<Value>| async move {
#                 (StatusCode::CREATED, Json(json!({ "id": 3, "name": body["name"], "email": body["email"] })))
#             }),
#         )
#         .route(
#             "/numbers/{id}",
#             get(|Path(id): Path<u64>| async move {
#                 match id {
#                     5 => {
#                         tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                         Ok(Json(json!({ "value": 50 })))
#                     }
#                     7 => Err(StatusCode::INTERNAL_SERVER_ERROR),
#                     _ => Ok(Json(json!({ "value": id * 10 }))),
#                 }
#             }),
#         )
#         .route(
#             "/slow",
#             get(|| async {
#                 tokio::time::sleep(std::time::Duration::from_secs(2)).await;
#                 "finally"
#             }),
#         );
#
#     let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
#     let address = listener.local_addr().unwrap();
#     tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
#     format!("http://{address}")
# }
```
```output
archive  Unreachable
billing  Broken(500)
greeter  Up
reports  Slow
users    Up
2 of 5 services are up
```

The function `check` never returns an error. It turns every outcome into a `Health` value, because for a health checker a failure is a result, not an accident. The `match` with guards reads like the specification: answered well, answered badly, too slow, or not reachable.

The checks run concurrently on a single task. `buffer_unordered(3)` holds three futures at a time and polls them in turn. The futures borrow `client` and the URLs, which is allowed because they all live inside `main`'s future. With `tokio::spawn`, every task would need owned copies. The whole report takes about as long as the slowest check, around 300 milliseconds, and not the sum of all of them.

Since the results arrive in the order of completion, the program sorts them before printing. A report whose order changes from run to run would be hard to read and to test.
:::
