@id shared-state
@part p7
@title Shared state: `Arc`, `Mutex` and atomics
@short Shared state
@level advanced
@time 55
@learn Share read-only data between threads with `Arc` | Protect changeable data with `Mutex` and `RwLock` | Use atomic types for simple counters and flags | Create global values safely with `static`, `OnceLock` and `LazyLock` | Recognise and avoid deadlocks, and choose between messages and shared state

The last chapter showed two ways for threads to work together: give data away with `move`, or send it through a channel. Both avoid sharing. Sometimes sharing is the natural design: a cache that all threads consult, a counter that all threads increase, a list of connected users. This chapter is about the third way: **several threads use the same data, with coordination**.

## `Arc<T>`: shared ownership across threads

`Rc<T>` gives a value several owners, but cannot leave its thread. **`Arc<T>`** is the same idea with a counter that is safe to change from several threads at once. The "A" stands for **atomic**: an atomic operation happens in one indivisible step, so two threads cannot interfere with each other in the middle.

```rust run
use std::sync::Arc;
use std::thread;

fn main() {
    let dictionary = Arc::new(vec![
        String::from("apple"),
        String::from("banana"),
        String::from("cherry"),
    ]);

    let mut handles = Vec::new();
    for letter in ['a', 'b', 'z'] {
        let dictionary = Arc::clone(&dictionary);
        handles.push(thread::spawn(move || {
            dictionary.iter().filter(|word| word.starts_with(letter)).count()
        }));
    }

    let counts: Vec<usize> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    println!("{:?}, owners now: {}", counts, Arc::strong_count(&dictionary));
}
```
```output
[1, 1, 0], owners now: 1
```

Each thread gets its own `Arc`, a pointer to the one shared vector. The line `let dictionary = Arc::clone(&dictionary);` inside the loop creates a new variable with the same name that holds the clone, and the `move` closure takes that clone. This is the standard idiom. When all threads have finished and dropped their pointers, one owner is left.

Like `Rc`, an `Arc` gives **read-only** access. Many threads reading the same data is always safe. `Arc` costs a little more than `Rc`, because atomic operations are slower than plain ones, so use `Rc` when everything stays in one thread.

## `Mutex<T>`: one at a time

To *change* shared data, the threads must take turns. A **mutex** (from "mutual exclusion") makes sure that only one thread at a time can reach the data.

:::analogy A room with one key
A meeting room has a single key, hanging on a hook. Whoever wants to use the room takes the key. Everyone else who comes by finds the hook empty and waits. When the room is free again, the key goes back on the hook, and the next person takes it.
:::

```rust run
use std::sync::Mutex;

fn main() {
    let counter = Mutex::new(0);

    {
        let mut guard = counter.lock().unwrap();     // take the key
        *guard += 1;
        *guard += 1;
    }                                                // the guard is dropped: the key is returned

    println!("{:?}", counter.lock().unwrap());
}
```
```output
2
```

- `Mutex::new(0)` wraps the value. **The data lives inside the mutex.** There is no way to reach it without going through `lock`.
- `lock()` waits until the mutex is free, and then returns a **guard**. The guard is a smart pointer: `*guard` is the protected value.
- When the guard is dropped, the lock is released. This happens automatically at the end of its scope, by the `Drop` trait from [chapter 27](#smart-pointers). You cannot forget to unlock.

:::compare A lock that owns its data
In C, C++, Java and Go, a mutex is a separate object that sits *next to* the data it is meant to protect. The connection exists only in comments and in the programmers' heads: "always lock `m` before touching `balance`". Forget it once, and you have a data race that compiles without complaint. Rust's `Mutex<T>` contains the data. The only path to the data leads through the lock, and the compiler checks every access.
:::

### Sharing a mutex: `Arc<Mutex<T>>`

Several threads need shared ownership of the mutex (`Arc`) and controlled access to its content (`Mutex`):

```rust run
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let counter = Arc::new(Mutex::new(0_u32));
    let mut handles = Vec::new();

    for _ in 0..8 {
        let counter = Arc::clone(&counter);
        handles.push(thread::spawn(move || {
            for _ in 0..1000 {
                *counter.lock().unwrap() += 1;
            }
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }
    println!("{}", *counter.lock().unwrap());
}
```
```output
8000
```

Eight threads each add one, a thousand times. The result is always exactly 8000. Without the lock, the classic race would strike: two threads read the same old value, both add one, and both write back the same new value. One increment is lost. In languages without protection, such a program prints a different number below 8000 on each run.

`Arc<Mutex<T>>` is the multi-threaded twin of `Rc<RefCell<T>>`:

| | One thread | Several threads |
|---|---|---|
| Shared ownership | `Rc<T>` | `Arc<T>` |
| Change through a shared reference | `RefCell<T>` | `Mutex<T>`, `RwLock<T>` |
| Both together | `Rc<RefCell<T>>` | `Arc<Mutex<T>>` |
| If the rules are broken | panic | the thread waits |

### What the `unwrap` is for: poisoning

`lock()` returns a `Result`. If a thread panics *while it holds the lock*, the data may have been left half-changed. The mutex is then marked as **poisoned**, and every later `lock()` returns an `Err` as a warning. Calling `.unwrap()` passes the panic on, which is usually the right reaction: if one thread crashed in the middle of an update, the others should not carry on with broken data.

### Keep the lock short

While one thread holds a lock, all others that want it wait. Hold a lock only for the moment you need the data, and never during slow work such as reading a file or waiting for the network.

```rust run
use std::sync::Mutex;

fn slow_calculation(n: u64) -> u64 {
    (1..=n).sum()
}

fn main() {
    let results = Mutex::new(Vec::new());

    // Good: do the slow work first, then lock briefly to store the result
    let value = slow_calculation(1_000);
    results.lock().unwrap().push(value);

    // A block ends the lock early, before more slow work follows
    let count = {
        let guard = results.lock().unwrap();
        guard.len()
    };
    println!("{count} result(s), first: {}", results.lock().unwrap()[0]);
}
```
```output
1 result(s), first: 500500
```

In `results.lock().unwrap().push(value);` the guard is a temporary value. It is dropped at the end of that statement, so the lock is held only for the `push`.

## Deadlock: waiting for ever

Locks bring a new kind of bug. A **deadlock** occurs when threads wait for each other in a circle, so that none can ever continue.

:::analogy Two keys, two people
Sara holds the key to room A and needs room B as well. Tomas holds the key to room B and needs room A as well. Each waits politely for the other to finish. They wait for ever.
:::

```rust
// Thread 1                          // Thread 2
let a = account_a.lock().unwrap();   let b = account_b.lock().unwrap();
let b = account_b.lock().unwrap();   let a = account_a.lock().unwrap();
// waits for thread 2 ...            // waits for thread 1 ...
```

Rust prevents data races. It does **not** prevent deadlocks. A deadlock is not memory-unsafe: nothing is corrupted, the program just stops making progress. The compiler cannot detect it, so you need habits:

1. **Hold only one lock at a time**, whenever you can.
2. If you need several, **always take them in the same order**, everywhere in the program. If every thread locks A before B, the circle cannot form.
3. **Keep the locked region small**, and do not call unknown code (callbacks, other people's functions) while holding a lock.
4. Do not lock the same mutex twice in one thread. The second `lock()` waits for the first to be released, which never happens.

```rust run
use std::sync::{Arc, Mutex};
use std::thread;

struct Account {
    id: u32,
    balance: Mutex<i64>,
}

fn transfer(from: &Account, to: &Account, amount: i64) {
    // Always lock the account with the smaller id first
    let (first, second) = if from.id < to.id { (from, to) } else { (to, from) };
    let mut first_guard = first.balance.lock().unwrap();
    let mut second_guard = second.balance.lock().unwrap();

    let (from_balance, to_balance) = if from.id < to.id {
        (&mut *first_guard, &mut *second_guard)
    } else {
        (&mut *second_guard, &mut *first_guard)
    };
    *from_balance -= amount;
    *to_balance += amount;
}

fn main() {
    let a = Arc::new(Account { id: 1, balance: Mutex::new(1000) });
    let b = Arc::new(Account { id: 2, balance: Mutex::new(1000) });

    let (a1, b1) = (Arc::clone(&a), Arc::clone(&b));
    let t1 = thread::spawn(move || {
        for _ in 0..1000 {
            transfer(&a1, &b1, 1);
        }
    });
    let (a2, b2) = (Arc::clone(&a), Arc::clone(&b));
    let t2 = thread::spawn(move || {
        for _ in 0..1000 {
            transfer(&b2, &a2, 2);
        }
    });

    t1.join().unwrap();
    t2.join().unwrap();
    let (x, y) = (*a.balance.lock().unwrap(), *b.balance.lock().unwrap());
    println!("{x} + {y} = {}", x + y);
}
```
```output
2000 + 0 = 2000
```

One thread moves money from A to B, and the other from B to A, two thousand transfers in all. Because both always lock account 1 before account 2, they can never block each other, and the total stays 2000. `&mut *first_guard` turns the guard into a plain mutable reference to the number inside.

## `RwLock<T>`: many readers or one writer

A mutex lets one thread in, even if all of them only want to read. An **`RwLock`** ("read-write lock") applies the borrowing rule at run time across threads: any number of readers at once, **or** one writer alone.

```rust run
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::thread;

fn main() {
    let settings = Arc::new(RwLock::new(HashMap::from([("volume", 5)])));

    let readers: Vec<_> = (0..3)
        .map(|_| {
            let settings = Arc::clone(&settings);
            thread::spawn(move || *settings.read().unwrap().get("volume").unwrap())
        })
        .collect();
    let values: Vec<i32> = readers.into_iter().map(|h| h.join().unwrap()).collect();
    println!("{:?}", values);

    settings.write().unwrap().insert("volume", 9);
    println!("{:?}", settings.read().unwrap().get("volume"));
}
```
```output
[5, 5, 5]
Some(9)
```

`read()` gives shared access, and `write()` gives exclusive access. An `RwLock` is worth it when reads are far more frequent than writes and take some time. For short, simple accesses, a `Mutex` is just as good and a little cheaper.

## Atomics: no lock needed

For a single number or flag, a lock is more than necessary. The **atomic types** in `std::sync::atomic` (`AtomicUsize`, `AtomicU64`, `AtomicI32`, `AtomicBool`, …) offer operations that the processor carries out in one indivisible step:

```rust run
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;

fn main() {
    let hits = Arc::new(AtomicU64::new(0));
    let stop = Arc::new(AtomicBool::new(false));

    let handles: Vec<_> = (0..8)
        .map(|_| {
            let hits = Arc::clone(&hits);
            thread::spawn(move || {
                for _ in 0..1000 {
                    hits.fetch_add(1, Ordering::Relaxed);
                }
            })
        })
        .collect();
    for handle in handles {
        handle.join().unwrap();
    }

    stop.store(true, Ordering::Relaxed);
    println!("{} {}", hits.load(Ordering::Relaxed), stop.load(Ordering::Relaxed));
}
```
```output
8000 true
```

- `fetch_add(1, …)` adds one and returns the previous value, as one step. `load` reads, `store` writes, `swap` exchanges.
- These methods take `&self`. An atomic can be changed through a shared reference, with no `mut` and no lock.
- A shared `AtomicBool` is the usual way to tell worker threads to stop: they check it now and then.

:::details What is the `Ordering` argument?
It tells the compiler and the processor how strictly this operation must be ordered relative to operations on *other* memory. `Ordering::Relaxed` promises the least, and is enough for an independent counter or flag like the ones above. `Ordering::SeqCst` ("sequentially consistent") is the strictest and the easiest to reason about. The others (`Acquire`, `Release`, `AcqRel`) are for people who build locks and lock-free data structures.

A safe rule while learning: use `Relaxed` for plain counters and statistics, and `SeqCst` whenever the value of one atomic decides what you do with other data. If you find yourself thinking hard about orderings, use a `Mutex`.
:::

Atomics are faster than locks and cannot deadlock. They only protect **one value**. If two values must change together (a balance and a list of transactions), you need a mutex around both.


### Read, decide, write: `compare_exchange`

`fetch_add` is one step. "Read the value, decide something, write a new value" is three steps, and another thread can get in between. Suppose 100 seats are free, and a thread should take one only if any are left. Written as `if free.load(…) > 0 { free.fetch_sub(1, …); }`, two threads can both see the last seat and both take it.

The tool for this is **`compare_exchange`**: "if the value is still what I read, replace it with my new value; if not, tell me what it is now."

```rust run
use std::sync::atomic::{AtomicU32, Ordering};
use std::thread;

/// Takes one of the free seats. Returns `false` when none is left.
fn take_seat(free: &AtomicU32) -> bool {
    let mut seen = free.load(Ordering::Relaxed);
    loop {
        if seen == 0 {
            return false;
        }
        match free.compare_exchange(seen, seen - 1, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => return true,
            Err(now) => seen = now, // another thread was faster: decide again
        }
    }
}

fn main() {
    let free = AtomicU32::new(100);

    let taken: usize = thread::scope(|scope| {
        let workers: Vec<_> = (0..8)
            .map(|_| scope.spawn(|| (0..50).filter(|_| take_seat(&free)).count()))
            .collect();
        workers.into_iter().map(|worker| worker.join().unwrap()).sum()
    });

    println!("{taken} seats taken, {} left", free.load(Ordering::Relaxed));
}
```
```output
100 seats taken, 0 left
```

Eight threads try 400 times, and exactly 100 attempts succeed. The loop "read, compute, `compare_exchange`, repeat if somebody else was faster" is the basic pattern of all lock-free code. For this common shape there is a ready-made method, `fetch_update`, which runs the loop for you with a closure.

## Global data: `static`

A `static` is a value that exists once, for the whole run of the program, at a fixed place in memory. It can be reached from every function and every thread, so it must be safe to share (`Sync`).

```rust run
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex, OnceLock};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

static LOG: Mutex<Vec<String>> = Mutex::new(Vec::new());

static COUNTRIES: LazyLock<HashMap<&str, &str>> = LazyLock::new(|| {
    println!("(building the table)");
    HashMap::from([("ET", "Ethiopia"), ("DE", "Germany"), ("JP", "Japan")])
});

static STARTED_BY: OnceLock<String> = OnceLock::new();

fn next_id() -> u64 {
    NEXT_ID.fetch_add(1, Ordering::Relaxed)
}

fn main() {
    println!("{} {}", next_id(), next_id());

    LOG.lock().unwrap().push(String::from("started"));
    println!("{:?}", LOG.lock().unwrap());

    println!("{:?}", COUNTRIES.get("ET"));
    println!("{:?}", COUNTRIES.get("JP"));

    STARTED_BY.set(String::from("Sara")).unwrap();
    println!("{:?} {}", STARTED_BY.get(), STARTED_BY.set(String::from("Tomas")).is_err());
}
```
```output
1 2
["started"]
(building the table)
Some("Ethiopia")
Some("Japan")
Some("Sara") true
```

Four tools for four needs:

| Need | Tool |
|---|---|
| a global counter or flag | `static X: AtomicU64` |
| global data that changes | `static X: Mutex<T>` |
| a global value that is expensive to build, created on first use | `static X: LazyLock<T>` |
| a global value that is set once at run time (from arguments or a file) | `static X: OnceLock<T>` |

`LazyLock` runs its closure the first time the value is used, exactly once, even if several threads ask at the same moment. The output shows "(building the table)" once, before the first lookup.

A `const` is different: it is a value that the compiler pastes in wherever the name is used, and it has no fixed place in memory. Use `const` for plain constants, and `static` when there must be exactly one instance.

:::warn Globals are a last resort
Global data makes programs harder to understand and to test, because any function may depend on it invisibly. Prefer passing values as parameters. Good uses for a global are few: a logger, a table that is costly to build, the configuration that is read once at the start. There is also `static mut`, a global that can be changed without any protection. Using it requires `unsafe` code, it is almost never needed, and it is easy to get wrong. Use the tools above.
:::

## A worker pool

A real program rarely starts a fresh thread for every small job. It keeps a fixed team of threads, a **thread pool**, and hands them jobs through a queue. This small pool combines everything from the last two chapters: channels, `Arc`, `Mutex`, closures and `join`.

```rust run
use std::sync::{mpsc, Arc, Mutex};
use std::thread;

type Job = Box<dyn FnOnce() + Send + 'static>;

struct Pool {
    sender: Option<mpsc::Sender<Job>>,
    workers: Vec<thread::JoinHandle<()>>,
}

impl Pool {
    fn new(size: usize) -> Pool {
        let (sender, receiver) = mpsc::channel::<Job>();
        let receiver = Arc::new(Mutex::new(receiver));

        let workers = (0..size)
            .map(|_| {
                let receiver = Arc::clone(&receiver);
                thread::spawn(move || loop {
                    // lock only to take one job out of the queue
                    let job = receiver.lock().unwrap().recv();
                    match job {
                        Ok(job) => job(),
                        Err(_) => break,        // the channel is closed: no more work
                    }
                })
            })
            .collect();

        Pool { sender: Some(sender), workers }
    }

    fn run(&self, job: impl FnOnce() + Send + 'static) {
        if let Some(sender) = &self.sender {
            sender.send(Box::new(job)).unwrap();
        }
    }

    /// Waits until all jobs are done and the workers have stopped.
    fn finish(mut self) {
        drop(self.sender.take());               // close the channel
        for worker in self.workers.drain(..) {
            worker.join().unwrap();
        }
    }
}

fn main() {
    let pool = Pool::new(4);
    let total = Arc::new(Mutex::new(0_u64));

    for n in 1..=20_u64 {
        let total = Arc::clone(&total);
        pool.run(move || {
            let square = n * n;
            *total.lock().unwrap() += square;
        });
    }

    pool.finish();
    println!("{}", *total.lock().unwrap());
}
```
```output
2870
```

How it fits together:

- A **job** is a boxed closure. `FnOnce()` because each job runs once, `Send` because it travels to another thread, and `'static` because it must not borrow anything that could disappear.
- The jobs go into a channel. A channel has one receiver, but four workers want to take from it. So the receiver is shared with `Arc` and guarded by a `Mutex`.
- Each worker loops: lock the receiver, take one job, release the lock, run the job. In `let job = receiver.lock().unwrap().recv();` the guard is a temporary that is dropped at the end of the statement. The lock is therefore **not** held while the job runs, and the other workers can fetch jobs in the meantime.
- `finish` drops the sender. The channel closes, every worker's `recv()` returns `Err`, the loops end, and `join` collects the threads.

Twenty jobs are spread over four threads, and the sum of the squares from 1 to 20 is 2870 every time. In real programs you would use a tested pool from a library, such as Rayon's. Building one once shows that there is no magic inside.


## Waiting for something: `Condvar`

A worker with nothing to do should sleep, and wake up when work arrives. Checking a shared flag in a loop would keep a processor core busy for nothing. A **condition variable** (`Condvar`) is the tool for "sleep until somebody tells me that something changed". It always works together with a mutex:

```rust run
use std::collections::VecDeque;
use std::sync::{Condvar, Mutex};
use std::thread;

struct State {
    jobs: VecDeque<u32>,
    closed: bool,
}

struct Queue {
    state: Mutex<State>,
    changed: Condvar,
}

impl Queue {
    fn push(&self, job: u32) {
        self.state.lock().unwrap().jobs.push_back(job);
        self.changed.notify_one(); // wake one sleeping worker
    }

    fn close(&self) {
        self.state.lock().unwrap().closed = true;
        self.changed.notify_all(); // wake them all, so that they can finish
    }

    /// Waits for the next job. Returns `None` when the queue is closed and empty.
    fn pop(&self) -> Option<u32> {
        let mut state = self.state.lock().unwrap();
        loop {
            if let Some(job) = state.jobs.pop_front() {
                return Some(job);
            }
            if state.closed {
                return None;
            }
            // Gives the lock back, sleeps, and holds the lock again when it returns
            state = self.changed.wait(state).unwrap();
        }
    }
}

fn main() {
    let queue = Queue {
        state: Mutex::new(State { jobs: VecDeque::new(), closed: false }),
        changed: Condvar::new(),
    };

    let total: u32 = thread::scope(|scope| {
        let workers: Vec<_> = (0..3)
            .map(|_| {
                scope.spawn(|| {
                    let mut sum = 0;
                    while let Some(job) = queue.pop() {
                        sum += job;
                    }
                    sum
                })
            })
            .collect();

        for job in 1..=100 {
            queue.push(job);
        }
        queue.close();

        workers.into_iter().map(|worker| worker.join().unwrap()).sum()
    });

    println!("{total}");
}
```
```output
5050
```

Three workers share the jobs 1 to 100, and every job is done exactly once. The important line is `self.changed.wait(state)`:

- **`wait` takes the lock guard, and gives it back.** It releases the mutex and goes to sleep as one indivisible step, so no `notify` can slip through between "I looked, there was nothing" and "I am asleep". When the thread wakes, it holds the lock again.
- **Always wait inside a loop that checks again.** After waking up, another worker may already have taken the job, and a thread is also allowed to wake up with no notification at all. So the code looks again before it trusts anything.
- **`notify_one` wakes one waiting thread, `notify_all` wakes all of them.** Use `notify_all` when the change concerns everybody, as closing does.

This is roughly what a channel does inside. When a channel fits, use the channel. A `Condvar` is the piece you need when you build such a tool yourself. Its smallest relative is `thread::park()`: the current thread sleeps until another thread calls `unpark()` on its handle.

## Messages or shared state?

| | Channels (messages) | Shared state (`Arc<Mutex<T>>`) |
|---|---|---|
| Idea | each piece of data has one owner at a time | several threads access the same data, in turns |
| Good for | pipelines, handing out work, events | caches, counters, registries that many threads look up |
| Risks | a forgotten sender keeps a channel open. An unbounded queue can grow | deadlocks. Threads waiting on a busy lock |
| Reasoning | simple: follow the data | harder: think about every possible interleaving |

A common and sensible default: **start with messages**. Give one thread sole ownership of a piece of state, and let the others send it requests. Use shared state when many threads need quick access to the same data, and keep what is shared as small as possible.

One more tool in `std::sync` for a special need: `Barrier` makes several threads wait until all of them have reached the same point.

:::recap
- `Arc<T>` is shared ownership that works across threads. The content is read-only.
- `Mutex<T>` holds data that only one thread at a time can reach. `lock()` returns a guard, and dropping the guard unlocks.
- `Arc<Mutex<T>>` is shared, changeable data for threads. `RwLock` allows many readers or one writer.
- Atomic types change a single number or flag in one indivisible step, without a lock.
- `static` values are global. Use atomics, `Mutex`, `LazyLock` or `OnceLock` for them.
- Rust prevents data races, not deadlocks. Lock in a fixed order, hold locks briefly, and hold one at a time where possible.
- Prefer messages. Share state when it is the simpler design, and share little.
:::

:::quiz Check your understanding
? Why is `Arc<T>` used with threads, and not `Rc<T>`?
- `Arc` is faster
- `Rc` can only hold numbers
+ `Arc` updates its owner count with atomic operations, so several threads can clone and drop it safely
- `Arc` allows changing the value
= `Rc`'s counter is unprotected, so the compiler refuses to send it to another thread. `Arc` pays a small price for a thread-safe counter.

? When is a `Mutex` unlocked?
- When `unlock()` is called
+ When the guard returned by `lock()` is dropped
- At the end of the program
- When another thread asks for it
= The guard releases the lock in its destructor. There is no `unlock` method to forget.

? Which bug does Rust's compiler **not** prevent?
- A data race
- Using a value after it was moved to another thread
+ A deadlock
- Sending an `Rc` to another thread
= A deadlock does not break memory safety. Two threads that wait for each other's lock compile fine. Avoiding it is up to the design.

? Eight threads each call `counter.fetch_add(1, Ordering::Relaxed)` a thousand times on a shared `AtomicU64` that starts at 0. What is the final value?
- Some unpredictable number up to 8000
+ Exactly 8000
- 1000
- It does not compile
= `fetch_add` is atomic: reading, adding and writing happen as one step, so no increment can be lost.

? Why does the worker pool wrap its `Receiver` in `Arc<Mutex<…>>`?
- To make receiving faster
+ A channel has a single receiver, and several workers need to share it and take jobs in turns
- Because `Receiver` is not `Send`
- To keep the channel open
= `Arc` gives each worker access to the same receiver. The `Mutex` makes sure that only one worker at a time takes a job from it.
:::

:::exercise guided A shared counter
Start 5 threads. Each one adds the numbers 1 to 100 to a shared total, protected by a mutex. Print the total after all threads have finished. What number do you expect?
::hint
The total is an `Arc<Mutex<u64>>`. Inside the loop that creates the threads, clone the `Arc` first, then `move` the clone into the closure. In the thread: `for n in 1..=100 { *total.lock().unwrap() += n; }`.
::solution
```rust run
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let total = Arc::new(Mutex::new(0_u64));

    let handles: Vec<_> = (0..5)
        .map(|_| {
            let total = Arc::clone(&total);
            thread::spawn(move || {
                for n in 1..=100 {
                    *total.lock().unwrap() += n;
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().unwrap();
    }
    println!("{}", *total.lock().unwrap());
}
```
```output
25250
```

The sum of 1 to 100 is 5050, and five threads add it once each. The lock is taken and released for every single addition, which is correct but slow. A better design adds up locally and locks once per thread: `let sum: u64 = (1..=100).sum(); *total.lock().unwrap() += sum;`. Sharing less is nearly always faster.
:::

:::exercise practice Word frequencies from several threads
Given a list of texts, count how often each word appears in all of them together. Use scoped threads, one per text, and collect the counts in one `Mutex<HashMap<String, usize>>`. Print the counts for "the" and "fox".
::hint
With `thread::scope`, the threads can borrow the mutex directly, and no `Arc` is needed. To keep the lock short, let each thread build its own local `HashMap` first, then lock once and merge it into the shared map.
::solution
```rust run
use std::collections::HashMap;
use std::sync::Mutex;
use std::thread;

fn main() {
    let texts = [
        "the quick brown fox",
        "the lazy dog and the fox",
        "a fox is quick",
    ];
    let counts: Mutex<HashMap<String, usize>> = Mutex::new(HashMap::new());

    thread::scope(|scope| {
        for text in &texts {
            scope.spawn(|| {
                let mut local: HashMap<&str, usize> = HashMap::new();
                for word in text.split_whitespace() {
                    *local.entry(word).or_insert(0) += 1;
                }

                let mut shared = counts.lock().unwrap();
                for (word, n) in local {
                    *shared.entry(word.to_string()).or_insert(0) += n;
                }
            });
        }
    });

    let counts = counts.into_inner().unwrap();
    println!("the: {}, fox: {}", counts["the"], counts["fox"]);
}
```
```output
the: 3, fox: 3
```

Scoped threads borrow `counts` and `texts` directly, so there is no `Arc` and no `clone`. Each thread does its counting in a private map without any locking, and holds the shared lock only for the short merge at the end. That keeps the threads from getting in each other's way.

`into_inner()` takes the map out of the mutex once the threads are done. It needs no locking, because owning the mutex proves that no one else can be using it.
:::

:::exercise practice Stop on request
Start a worker thread that counts upwards in a loop for as long as a shared `AtomicBool` called `running` is true. Let the main thread sleep for 50 milliseconds, set the flag to false, and join the worker. The worker returns how far it counted. Print whether the count is greater than zero.
::hint
Share the flag with `Arc<AtomicBool>`. The worker loop is `while running.load(Ordering::Relaxed) { count += 1; }`. The main thread calls `running.store(false, Ordering::Relaxed)`.
::solution
```rust run
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

fn main() {
    let running = Arc::new(AtomicBool::new(true));

    let worker = {
        let running = Arc::clone(&running);
        thread::spawn(move || {
            let mut count: u64 = 0;
            while running.load(Ordering::Relaxed) {
                count += 1;
            }
            count
        })
    };

    thread::sleep(Duration::from_millis(50));
    running.store(false, Ordering::Relaxed);

    let count = worker.join().unwrap();
    println!("the worker counted, and stopped cleanly: {}", count > 0);
}
```
```output
the worker counted, and stopped cleanly: true
```

A thread cannot be stopped from outside in Rust. It must stop itself. A shared flag that the worker checks regularly is the standard way to ask it to. The worker finishes its current step, leaves its loop, and returns normally, so all its values are cleaned up properly. The exact count depends on the speed of the machine.
:::

:::exercise challenge A thread-safe cache
Write `struct Cache { entries: RwLock<HashMap<u64, u64>>, computations: AtomicUsize }` with a method `get(&self, n: u64) -> u64`. It returns the square of `n`. If the result is already in the map, it is read under a read lock. Otherwise it is computed, stored under a write lock, and the computation counter is increased. Call `get` from 4 threads, each asking for the numbers 1 to 50, and print how many computations happened.
::hint
First try `self.entries.read().unwrap().get(&n).copied()` in its own statement, so that the read lock is released before you ask for the write lock. Holding the read lock while requesting the write lock on the same `RwLock` is a deadlock. After taking the write lock, use `entry(n).or_insert_with(...)`, so that the value is computed only if no other thread stored it in the meantime.
::solution
```rust run
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::RwLock;
use std::thread;

struct Cache {
    entries: RwLock<HashMap<u64, u64>>,
    computations: AtomicUsize,
}

impl Cache {
    fn new() -> Self {
        Cache { entries: RwLock::new(HashMap::new()), computations: AtomicUsize::new(0) }
    }

    fn get(&self, n: u64) -> u64 {
        // Fast path: many threads can read at the same time
        let known = self.entries.read().unwrap().get(&n).copied();
        if let Some(value) = known {
            return value;
        }

        // Slow path: one thread at a time. Another thread may have
        // stored the value since we looked, so check again.
        let mut entries = self.entries.write().unwrap();
        *entries.entry(n).or_insert_with(|| {
            self.computations.fetch_add(1, Ordering::Relaxed);
            n * n
        })
    }
}

fn main() {
    let cache = Cache::new();

    thread::scope(|scope| {
        for _ in 0..4 {
            scope.spawn(|| {
                for n in 1..=50 {
                    assert_eq!(cache.get(n), n * n);
                }
            });
        }
    });

    println!("{} computations for 200 requests", cache.computations.load(Ordering::Relaxed));
}
```
```output
50 computations for 200 requests
```

Two hundred requests, fifty computations: each value was computed exactly once, although four threads asked for it at nearly the same time.

The method shows a pattern called **check, lock, check again**. Between the failed read and the write lock, another thread may have stored the value. `entry(n).or_insert_with(…)` performs the second check under the write lock, so the closure runs at most once per key. The read lock is released at the end of the `let known = …;` statement, before the write lock is requested. That ordering matters: asking for the write lock while still holding the read lock would block for ever.

`get` takes `&self`, yet changes the cache. `RwLock` and the atomic counter provide interior mutability that is safe across threads, the same idea as `RefCell` and `Cell` in a single thread.
:::
