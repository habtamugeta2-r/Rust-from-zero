@id threads
@part p7
@title Threads: doing several things at once
@short Threads
@level advanced
@time 55
@learn Explain concurrency, parallelism, threads and data races | Start threads, wait for them and get their results | Share local data with scoped threads | Send data between threads through channels | Explain how `Send` and `Sync` let the compiler rule out data races

Every program you have written so far did one thing at a time, from the first line of `main` to the last. Modern computers have several processor cores, typically between 4 and 16, and each can run code at the same moment. A program that uses one of them leaves most of the machine idle. A program may also have to *wait* for several things at once: a download, a key press, a timer.

Doing several things at once is one of the hardest parts of programming in most languages. It is also where Rust's ownership rules pay off most. The same rules that prevent dangling references prevent the worst concurrency bug, and they do so at compile time. The Rust community calls this **fearless concurrency**.

## Words first

- **Concurrency** means dealing with several tasks in overlapping periods of time. One cook who chops vegetables while the soup simmers works concurrently.
- **Parallelism** means really doing several things at the same instant. Two cooks, each at their own stove, work in parallel. Parallelism needs several cores.
- A **process** is a running program with its own, separate memory. Your browser and your editor are processes.
- A **thread** is one line of execution inside a process. Every program starts with one, the **main thread**, and can start more. All threads of a process share its memory.

:::analogy Cooks in one kitchen
A restaurant kitchen with one cook can prepare one dish at a time. Hire three more, and four dishes are in progress at once. But the cooks share one kitchen: one fridge, one spice rack, one order board. If two of them grab the same pan, or one changes an order while another is reading it, there is chaos. More cooks means more speed, and it means rules for sharing.
:::

Sharing memory is what makes threads efficient, and what makes them dangerous.

:::key What a data race is
A **data race** happens when two threads access the same piece of memory at the same time, at least one of them writes, and nothing coordinates them. The result depends on tiny timing differences. A program with a data race may work a million times and then corrupt its data once, on a customer's machine, in a way nobody can reproduce.

Look at the definition again: several accesses, at least one writer. That is exactly what the borrowing rule "many readers **or** one writer" forbids. Rust extends that rule across threads. **A safe Rust program cannot contain a data race.** The compiler rejects it.
:::

## Starting a thread

`thread::spawn` takes a closure and runs it in a new thread:

```rust run nocmp
use std::thread;
use std::time::Duration;

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..=3 {
            println!("    helper: step {i}");
            thread::sleep(Duration::from_millis(10));
        }
    });

    for i in 1..=3 {
        println!("main: step {i}");
        thread::sleep(Duration::from_millis(10));
    }

    handle.join().unwrap();
    println!("both are done");
}
```
```output
main: step 1
    helper: step 1
main: step 2
    helper: step 2
    helper: step 3
main: step 3
both are done
```

Run it several times. The lines of the two threads mix, and the exact order can change from run to run. The operating system decides when each thread gets to run, and you cannot predict it. That unpredictability is the heart of what makes concurrent programs hard. (`thread::sleep` pauses the current thread. It is here to give the other thread a chance to run in between.)

`spawn` returns a **`JoinHandle`**. Calling `.join()` on it waits until the thread has finished.

:::warn When `main` ends, everything ends
If the main thread reaches the end of `main`, the whole program stops, even if other threads are in the middle of their work. Call `join` on every thread whose work you need.
:::

### Getting a result back

The closure's return value comes out of `join`:

```rust run
use std::thread;

fn main() {
    let handles: Vec<_> = (1..=4)
        .map(|n| thread::spawn(move || n * n))
        .collect();

    let results: Vec<u64> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("{:?}", results);
}
```
```output
[1, 4, 9, 16]
```

Four threads calculate at the same time. The results are collected in the order of the handles, so the output is always the same, whichever thread happened to finish first. `join` returns a `Result`. It is an `Err` if the thread panicked:

```rust run nocmp
use std::thread;

fn main() {
    let handle = thread::spawn(|| {
        let numbers: Vec<i32> = Vec::new();
        numbers[0]
    });

    match handle.join() {
        Ok(value) => println!("the thread returned {value}"),
        Err(_) => println!("the thread panicked, but main carries on"),
    }
}
```
```output
thread '<unnamed>' panicked at src/main.rs:6:16:
index out of bounds: the len is 0 but the index is 0
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
the thread panicked, but main carries on
```

A panic ends only the thread in which it happens. The other threads go on, and whoever joins the thread learns about the failure.

## Threads and ownership: `move`

A thread may use data from the place where it was started. Borrowing that data does not work:

```rust fail E0373
use std::thread;

fn main() {
    let names = vec![String::from("Sara"), String::from("Tomas")];

    let handle = thread::spawn(|| {
        println!("{:?}", names);
    });

    handle.join().unwrap();
}
```
```error auto
```

The new thread might still be running when the function that owns `names` has returned and `names` is gone. The compiler cannot know how long the thread will live, so it refuses the borrow. The fix it suggests is `move`: give the data to the thread.

```rust run
use std::thread;

fn main() {
    let names = vec![String::from("Sara"), String::from("Tomas")];

    let handle = thread::spawn(move || {
        println!("{:?}", names);
        names.len()
    });

    // `names` now belongs to the other thread and cannot be used here
    println!("{}", handle.join().unwrap());
}
```
```output
["Sara", "Tomas"]
2
```

Ownership has moved into the thread. The main thread can no longer touch `names`, so the two threads cannot conflict over it. This is the first of three ways to give data to threads: **hand it over completely**.

## Scoped threads: borrowing after all

Often the threads are only needed for a moment, to split up some work, and they should work on data that the caller keeps. **Scoped threads** allow that. Every thread started inside `thread::scope` is guaranteed to be finished when the scope ends, so it may safely borrow local variables:

```rust run
use std::thread;

fn main() {
    let numbers = vec![3, 8, 1, 9, 4, 7];
    let (left, right) = numbers.split_at(numbers.len() / 2);

    let (sum_left, sum_right) = thread::scope(|scope| {
        let a = scope.spawn(|| left.iter().sum::<i32>());
        let b = scope.spawn(|| right.iter().sum::<i32>());
        (a.join().unwrap(), b.join().unwrap())
    });

    println!("{sum_left} + {sum_right} = {}", sum_left + sum_right);
    println!("{:?} is still usable", numbers);
}
```
```output
12 + 20 = 32
[3, 8, 1, 9, 4, 7] is still usable
```

Two threads read two halves of the same vector at the same time, with no `move` and no copying. Reading is all they do, and many readers are allowed. If one of them tried to change the vector, the borrow checker would object, exactly as it does within a single thread.

Here is the pattern in a reusable form. The data is cut into chunks, one per processor core, and each chunk is summed in its own thread:

```rust run
use std::thread;

fn parallel_sum(numbers: &[u64], workers: usize) -> u64 {
    let chunk_size = numbers.len().div_ceil(workers).max(1);

    thread::scope(|scope| {
        let handles: Vec<_> = numbers
            .chunks(chunk_size)
            .map(|chunk| scope.spawn(move || chunk.iter().sum::<u64>()))
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    })
}

fn main() {
    let numbers: Vec<u64> = (1..=1_000_000).collect();
    let workers = thread::available_parallelism().map(|n| n.get()).unwrap_or(1);

    let total = parallel_sum(&numbers, workers);
    println!("{total}");
    println!("{}", total == numbers.iter().sum::<u64>());
}
```
```output
500000500000
true
```

`thread::available_parallelism()` reports how many threads can really run at the same time on this machine. Starting many more threads than that gains nothing for calculations, because the cores are already busy.

:::tip The easy way: Rayon
The crate **`rayon`** reduces this whole pattern to one word. Write `numbers.par_iter().sum()` in place of `numbers.iter().sum()`, and Rayon splits the work across all cores for you. [Chapter 45](#async-ecosystem) shows it.
:::

## Channels: passing messages

The second way for threads to cooperate is to share nothing, and to send each other **messages**. A **channel** is a one-way pipe: one end sends values in, and the other end takes them out.

:::analogy A conveyor belt
One worker puts parcels on a conveyor belt. Another worker at the far end takes them off, in the order they were put on. The two never touch the same parcel at the same time, and they never need to talk about who has what.
:::

```rust run
use std::sync::mpsc;
use std::thread;

fn main() {
    let (sender, receiver) = mpsc::channel();

    thread::spawn(move || {
        for word in ["one", "two", "three"] {
            sender.send(word.to_string()).unwrap();
        }
        // `sender` is dropped here, which closes the channel
    });

    for message in receiver {
        println!("got {message}");
    }
    println!("the channel is closed");
}
```
```output
got one
got two
got three
the channel is closed
```

- `mpsc::channel()` creates the two ends. The name stands for "multiple producer, single consumer": many senders, one receiver.
- `sender.send(value)` puts a value in. The value is **moved** into the channel. After sending a `String`, the sending thread no longer owns it and cannot use it. Ownership travels with the message, so two threads never hold the same data.
- The `for` loop over the receiver waits for each message and ends when the channel is closed. A channel closes when all senders have been dropped.
- `receiver.recv()` waits for one message, and `receiver.try_recv()` checks without waiting.

Several threads can send into the same channel. Each needs its own clone of the sender:

```rust run
use std::sync::mpsc;
use std::thread;

fn main() {
    let (sender, receiver) = mpsc::channel();

    for id in 1..=3 {
        let sender = sender.clone();
        thread::spawn(move || {
            sender.send((id, id * 100)).unwrap();
        });
    }
    drop(sender);      // drop the original, so the channel closes when the workers are done

    let mut results: Vec<(u32, u32)> = receiver.iter().collect();
    results.sort();
    println!("{:?}", results);
}
```
```output
[(1, 100), (2, 200), (3, 300)]
```

The messages arrive in whatever order the threads happen to send them, so the example sorts them before printing. Notice the `drop(sender)`: without it, the original sender would stay alive in `main`, the channel would never close, and `receiver.iter()` would wait for ever.

A plain `channel` can hold any number of waiting messages. If the senders are faster than the receiver, the backlog grows without limit. `mpsc::sync_channel(n)` creates a **bounded** channel with room for `n` messages. When it is full, `send` waits until there is room, which slows the producers down to the speed of the consumer. This effect is called **backpressure**.

:::compare "Share memory by communicating"
The Go language made a slogan of this style: *do not communicate by sharing memory; share memory by communicating.* Go's channels and Rust's channels work alike. The difference is in what happens when you break the rule. In Go you can still keep and change a value after sending it, and get a data race. In Rust the value has moved, and using it is a compile error.
:::

## `Send` and `Sync`: how the compiler knows

Why did the compiler accept a `Vec<String>` being moved into a thread? And how does it know what is dangerous? Through two marker traits ([chapter 28](#advanced-traits)):

- **`Send`**: a type is `Send` if a value of it may be **moved to another thread**.
- **`Sync`**: a type is `Sync` if it may be **used from several threads at once** through shared references.

Almost every type is both, and the compiler works it out automatically: a struct is `Send` if all its fields are. `thread::spawn` demands that its closure, and with it everything the closure captures, is `Send`.

The best known type that is not `Send` is `Rc<T>`. Its counter of owners is an ordinary number with no protection. Two threads that clone and drop the same `Rc` at the same time could corrupt the count, and the value might be freed while still in use.

```rust fail E0277
use std::rc::Rc;
use std::thread;

fn main() {
    let shared = Rc::new(5);

    let handle = thread::spawn(move || {
        println!("{shared}");
    });

    handle.join().unwrap();
}
```
```error auto lines=14
```

In C++, the same mistake with a non-atomic counter compiles without complaint and fails rarely and mysteriously. In Rust, it is the message above. The next chapter introduces `Arc`, the version of `Rc` that is safe to share.

`RefCell` and `Cell` are `Send` but not `Sync`: you may give one to another thread, but two threads may not use the same one together, because their borrow tracking is not protected either.

You almost never implement `Send` or `Sync` yourself. You only need to understand the error message when a type lacks one of them.

## How much faster?

Threads do not make everything faster. Starting a thread takes time (tens of microseconds), so the work per thread must be much larger than that. And the gain is limited by the part of the work that cannot be split.

A test that is easy to split is counting prime numbers. On the two-core machine used to check this guide, counting the primes below three million took 0.51 seconds in one thread and 0.32 seconds in two. The speed-up is less than double, because the work was not split evenly: testing large numbers takes longer than testing small ones, so the thread with the upper half had more to do. Dividing work well is its own craft. One of the exercises lets you measure this on your machine.

Always measure before and after. And use `cargo run --release` for any timing: a debug build is many times slower and tells you little.

:::compare Threads in other languages
- **C and C++** give you threads and no protection. Data races are undefined behaviour, and finding them needs special tools.
- **Java and C#** have threads and locks built in. Forgetting a lock compiles and produces wrong results now and then.
- **Python** has threads, but for decades its "global interpreter lock" let only one of them run Python code at a time, so threads did not speed up calculations. (Recent versions offer a build without that lock.)
- **JavaScript** runs your code in a single thread. Web Workers are separate, and can only exchange messages.
- **Go** has very cheap threads (goroutines) and channels, and a race detector that finds data races at run time, if a test happens to trigger them.
- **Rust** checks at compile time. The cost is that you must sometimes convince the compiler. The gain is that a whole class of the hardest bugs is gone.
:::

:::recap
- A thread is a separate line of execution in the same program. Threads share memory.
- `thread::spawn(closure)` starts a thread. `handle.join()` waits for it and returns its result, or an `Err` if it panicked.
- Use `move` to give data to a thread. Use `thread::scope` to let threads borrow local data for a limited time.
- A channel moves values from one thread to another. Sending transfers ownership.
- A data race needs shared access with at least one writer and no coordination. Rust's borrowing rules, extended by `Send` and `Sync`, rule it out at compile time.
- Threads help when the work is large and can be split. Measure.
:::

:::quiz Check your understanding
? What happens to spawned threads when the main thread reaches the end of `main`?
- The program waits for all of them
+ The program ends, and unfinished threads are stopped
- They continue as separate programs
- The compiler does not allow this
= The process ends with the main thread. Use `join` (or scoped threads) to wait for work that must complete.

? Why does `thread::spawn(|| println!("{:?}", list))` not compile when `list` is a local `Vec`?
- Vectors cannot be printed in threads
+ The closure only borrows `list`, and the thread might outlive the function that owns it
- `spawn` does not accept closures
- `list` must be declared `mut`
= The thread's lifetime is not tied to the current function. Use `move` to give the vector to the thread, or use a scoped thread.

? What makes scoped threads (`thread::scope`) able to borrow local variables?
- They copy the variables
- They run in the main thread
+ All of them are guaranteed to finish before the scope ends, so the borrowed data is still alive
- They ignore the borrow checker
= The scope joins every thread it started before it returns. The compiler can therefore prove that the borrows do not outlive the data.

? After `sender.send(text).unwrap();`, can the sending thread still use `text` (a `String`)?
- Yes, both threads share it
- Yes, but only for reading
+ No. The value was moved into the channel
- Only after the receiver has read it
= Sending transfers ownership. That is what guarantees that two threads never access the same value.

? Why is `Rc<T>` not `Send`?
- It is too large
- It lives on the heap
+ Its reference counter is not protected against simultaneous changes from several threads
- It contains a closure
= Two threads updating the plain counter at once could corrupt it. `Arc` uses an atomic counter and is `Send`.
:::

:::exercise guided Three workers
Start three threads. Each receives a number (10, 20, 30), computes the sum of all whole numbers from 1 up to it, and returns the result. Collect the three results in order and print them.
::hint
Loop over `[10_u64, 20, 30]` and call `thread::spawn(move || (1..=n).sum::<u64>())` for each. Collect the handles in a `Vec`, then call `join().unwrap()` on each.
::solution
```rust run
use std::thread;

fn main() {
    let mut handles = Vec::new();
    for n in [10_u64, 20, 30] {
        handles.push(thread::spawn(move || (1..=n).sum::<u64>()));
    }

    for handle in handles {
        println!("{}", handle.join().unwrap());
    }
}
```
```output
55
210
465
```

`move` copies `n` into each closure (a `u64` is `Copy`). The handles are joined in the order they were created, so the output is in a fixed order although the threads run at the same time. All three threads are started before the first is joined. If you joined inside the first loop, each thread would finish before the next one started, and nothing would run in parallel.
:::

:::exercise practice Count words in parallel
Write `count_words(texts: &[String]) -> usize` that counts the words of all texts, using one scoped thread per text. Test it with four texts and compare with a sequential count.
::hint
Inside `thread::scope(|scope| { ... })`, map over `texts.iter()` and spawn `scope.spawn(move || text.split_whitespace().count())` for each. Collect the handles, then sum the joined results.
::solution
```rust run
use std::thread;

fn count_words(texts: &[String]) -> usize {
    thread::scope(|scope| {
        let handles: Vec<_> = texts
            .iter()
            .map(|text| scope.spawn(move || text.split_whitespace().count()))
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    })
}

fn main() {
    let texts = vec![
        String::from("the quick brown fox"),
        String::from("jumps over"),
        String::from("the lazy dog"),
        String::from(""),
    ];

    let parallel = count_words(&texts);
    let sequential: usize = texts.iter().map(|t| t.split_whitespace().count()).sum();
    println!("{parallel} {}", parallel == sequential);
}
```
```output
9 true
```

Each thread borrows one `&String` from the slice. That is allowed because the scope guarantees the threads end before `count_words` returns. `collect()` is essential: it starts all threads before any is joined. Without it, the lazy iterator would spawn and join one thread at a time.

For texts this short, the threads cost far more than they save. The structure pays off when each piece of work is large, such as a whole file.
:::

:::exercise practice A pipeline
Build a pipeline of three stages connected by two channels. Stage 1 sends the numbers 1 to 5. Stage 2 receives each number, squares it and sends it on. The main thread receives the squares and prints their sum.
::hint
Create two channels: `(tx1, rx1)` and `(tx2, rx2)`. The first thread owns `tx1`. The second thread owns `rx1` and `tx2`: `for n in rx1 { tx2.send(n * n).unwrap(); }`. The main thread computes `rx2.iter().sum()`. Each stage ends when the previous stage drops its sender.
::solution
```rust run
use std::sync::mpsc;
use std::thread;

fn main() {
    let (tx_numbers, rx_numbers) = mpsc::channel();
    let (tx_squares, rx_squares) = mpsc::channel();

    thread::spawn(move || {
        for n in 1..=5_u32 {
            tx_numbers.send(n).unwrap();
        }
    });

    thread::spawn(move || {
        for n in rx_numbers {
            tx_squares.send(n * n).unwrap();
        }
    });

    let total: u32 = rx_squares.iter().sum();
    println!("{total}");
}
```
```output
55
```

The shutdown runs through the pipeline by itself. When stage 1 finishes, `tx_numbers` is dropped, so the loop in stage 2 ends, so `tx_squares` is dropped, so the iterator in `main` ends. No thread needs to be told to stop, and no `join` is needed, because `main` waits for the last channel to close.

No data is shared at any point. Each number is owned by exactly one stage at a time.
:::

:::exercise challenge Measure the speed-up
Write `is_prime(n: u64) -> bool` (test all divisors `d` with `d * d <= n`) and count the primes below 3,000,000 twice: in one thread, and split across as many scoped threads as `available_parallelism` reports. Check that both counts agree, and print both times with `std::time::Instant`. Run it with `cargo run --release`.
::hint
Divide the range `0..limit` into `workers` equal parts: part `w` goes from `w * step` to `(w + 1) * step`, limited to `limit`. `Instant::now()` before and `.elapsed()` after gives a `Duration`, which prints nicely with `{:.2?}`.
::solution
```rust run nocmp
use std::ops::Range;
use std::thread;
use std::time::Instant;

fn is_prime(n: u64) -> bool {
    if n < 2 {
        return false;
    }
    let mut d = 2;
    while d * d <= n {
        if n % d == 0 {
            return false;
        }
        d += 1;
    }
    true
}

fn count_primes(range: Range<u64>) -> usize {
    range.filter(|n| is_prime(*n)).count()
}

fn main() {
    let limit = 3_000_000;
    let workers = thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as u64;

    let start = Instant::now();
    let sequential = count_primes(0..limit);
    let time_one = start.elapsed();

    let start = Instant::now();
    let step = limit.div_ceil(workers);
    let parallel: usize = thread::scope(|scope| {
        let handles: Vec<_> = (0..workers)
            .map(|w| {
                let from = w * step;
                let to = (from + step).min(limit);
                scope.spawn(move || count_primes(from..to))
            })
            .collect();
        handles.into_iter().map(|h| h.join().unwrap()).sum()
    });
    let time_many = start.elapsed();

    println!("{sequential} primes below {limit}");
    println!("same result: {}", sequential == parallel);
    println!("{workers} workers: sequential {:.2?}, parallel {:.2?}", time_one, time_many);
}
```
```output
216816 primes below 3000000
same result: true
2 workers: sequential 508.00ms, parallel 320.17ms
```

Your times and worker count will differ. This output is from a two-core machine and a release build. The speed-up is about 1.6 and not 2, because the ranges are equal in length but not in work: large numbers need more divisions, so the last thread finishes last while the first one is already idle.

Two ways to balance the load: cut the range into many small pieces and let the threads take the next piece whenever they are free (a *work queue*), or deal the numbers out in turn (thread 0 takes 0, 4, 8, …). Libraries such as Rayon do the first automatically, with a technique called *work stealing*.
:::
