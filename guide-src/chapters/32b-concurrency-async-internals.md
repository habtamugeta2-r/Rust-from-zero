@id concurrency-async-internals
@part p9
@kind chapter
@title Async Internals: State Machines, Pinning & Work-Stealing Runtimes
@short Async internals & Pin
@level intermediate
@time 35
@learn Hand-desugar an async fn into a Poll state-machine enum matching what rustc emits | Explain why borrows held across .await create self-referential structs requiring Pin<&mut T> | Trace Tokio's multi-threaded work-stealing scheduler, LIFO slot, cooperative budget, and mio epoll parking | Connect Arc's Release/Acquire fence pattern, lock convoys, and lock-free CAS hazards to concurrent scaling

You have used `async fn`, `.await`, `tokio::spawn`, and `select!`. Under the surface, there are **no green threads** (`go` goroutines) allocating invisible 4 KiB stacks, and **no garbage collector** keeping suspended frames alive! Instead, Rust compiles every `async fn` into a **zero-allocation stackless state-machine enum** driven by `Future::poll` and `Pin`, scheduled across a **work-stealing** thread pool coupled to `epoll`.

Opening that machinery makes `Pin`, `!Unpin`, "`Future` is not `Send`", and Tokio scheduling hiccups crystal clear forever.

:::analogy Folding a paper bookmark vs keeping an extra desk
Green-thread runtimes (Go, Erlang, Java virtual threads) give each task its own tiny call stack that swaps CPU stack pointers (`RSP`) at yield points. Rust chooses **stackless coroutines**: `rustc` reads your `async fn` once at compile time, measures the exact size of every variable alive across `.await` points, packs them into one flat enum (`Future`), and runs every `poll()` directly on the OS thread's normal stack—shrinking each idle HTTP connection to a few hundred bytes!
:::

:::compare Stackful Green Threads (Go) vs Rust Stackless Futures
| Property | Go Goroutines (Stackful) | Rust `async fn` (`Future`, Stackless) |
|---|---|---|
| Per-task memory overhead | Minimum ~2–8 KiB stack + dynamic stack growth/copy | Exact state-machine size (`size_of::<MyFuture>()`, often 64–512 B) |
| Suspension point | Anywhere (preemptive at runtime function prologues) | Strictly explicit **`.await`** boundaries (visible in code!) |
| FFI / OS syscall calls | Needs runtime stack switching (`cgo` overhead) | Direct native C ABI call on OS thread stack |
| Cancellation | Explicit `context.Context` plumbing | **Drop the `Future`** (compiler generates state-aware cleanup automatically!) |
:::

## How `rustc` lowers an `async fn` into a state-machine `enum`

Consider this tiny two-step async function:

```rust
async fn fetch_and_add(a: u32, b: u32) -> u32 {
    let x = async_step(a).await;
    x + b
}
```

When compiled, `rustc` transforms `fetch_and_add` into a concrete hidden `enum` (almost identical to an ordinary `match` state machine!) whose size is the union of the states alive across each `.await`:

```rust run
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

// Hand-written equivalent of what `async fn add_after_ready(a: u32, b: u32)` compiles to:
enum AddMachine {
    Start { a: u32, b: u32 },
    Waiting { a_val: u32, b: u32 },
    Done,
}

impl Future for AddMachine {
    type Output = u32;

    fn poll(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<u32> {
        loop {
            match *self {
                AddMachine::Start { a, b } => {
                    // Suppose step 1 yields Pending once or computes `a * 2` and advances state:
                    *self = AddMachine::Waiting { a_val: a * 2, b };
                }
                AddMachine::Waiting { a_val, b } => {
                    *self = AddMachine::Done;
                    return Poll::Ready(a_val + b);
                }
                AddMachine::Done => panic!("polled after completion"),
            }
        }
    }
}

fn main() {
    // Poll synchronously with a noop waker to watch state transitions cleanly:
    use std::task::{RawWaker, RawWakerVTable, Waker};
    unsafe fn noop(_: *const ()) {}
    unsafe fn clone(p: *const ()) -> RawWaker { RawWaker::new(p, &VTABLE) }
    static VTABLE: RawWakerVTable = RawWakerVTable::new(clone, noop, noop, noop);
    let waker = unsafe { Waker::from_raw(RawWaker::new(std::ptr::null(), &VTABLE)) };
    let mut cx = Context::from_waker(&waker);

    let mut fut = Box::pin(AddMachine::Start { a: 10, b: 5 });
    println!("Poll result = {:?}", fut.as_mut().poll(&mut cx));
    println!("State machine size = {} bytes", std::mem::size_of::<AddMachine>());
}
```
```output
Poll result = Ready(25)
State machine size = 12 bytes
```

Look closely at `size_of::<AddMachine>() = 12` bytes: there is **no heap stack**, **no extra OS thread**, and **`rustc` overlaps variables whose lifetimes do not cross the same `.await`** (just like enum variants). If an inner step is not ready yet, `poll` simply returns `Poll::Pending`, leaving the [[future]] sitting inertly in memory until its **[[waker]]** fires.

## Building a real multi-task `Future` executor in 55 lines of pure `std`

Let's remove all remaining magic around async runtimes by building a **working cooperative single-threaded executor** from scratch—using only `std::task::{RawWaker, RawWakerVTable, Waker, Context}` and a `VecDeque` ready queue, with zero external crates:

```rust run
use std::cell::RefCell;
use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll, RawWaker, RawWakerVTable, Waker};

struct TaskWaker {
    task_id: usize,
    ready_queue: Rc<RefCell<VecDeque<usize>>>,
}

fn make_waker(task_id: usize, ready_queue: Rc<RefCell<VecDeque<usize>>>) -> Waker {
    unsafe fn clone_waker(ptr: *const ()) -> RawWaker {
        let rc = unsafe { Rc::from_raw(ptr as *const TaskWaker) };
        let cloned = Rc::clone(&rc);
        let _ = Rc::into_raw(rc);
        RawWaker::new(Rc::into_raw(cloned) as *const (), &VTABLE)
    }
    unsafe fn wake(ptr: *const ()) {
        let rc = unsafe { Rc::from_raw(ptr as *const TaskWaker) };
        rc.ready_queue.borrow_mut().push_back(rc.task_id);
    }
    unsafe fn wake_by_ref(ptr: *const ()) {
        let tw = unsafe { &*(ptr as *const TaskWaker) };
        tw.ready_queue.borrow_mut().push_back(tw.task_id);
    }
    unsafe fn drop_waker(ptr: *const ()) {
        drop(unsafe { Rc::from_raw(ptr as *const TaskWaker) });
    }
    static VTABLE: RawWakerVTable =
        RawWakerVTable::new(clone_waker, wake, wake_by_ref, drop_waker);

    let ptr = Rc::into_raw(Rc::new(TaskWaker { task_id, ready_queue })) as *const ();
    unsafe { Waker::from_raw(RawWaker::new(ptr, &VTABLE)) }
}

struct Countdown {
    name: &'static str,
    remaining: u8,
}

impl Future for Countdown {
    type Output = &'static str;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        if self.remaining == 0 {
            println!("{}: Ready!", self.name);
            Poll::Ready(self.name)
        } else {
            println!("{}: Pending ({} left)", self.name, self.remaining);
            self.remaining -= 1;
            cx.waker().wake_by_ref(); // push our task_id back onto ready_queue
            Poll::Pending
        }
    }
}

fn main() {
    let ready_queue = Rc::new(RefCell::new(VecDeque::from([0_usize, 1])));
    let mut tasks: [Option<Pin<Box<dyn Future<Output = &'static str>>>>; 2] = [
        Some(Box::pin(Countdown { name: "task-A", remaining: 2 })),
        Some(Box::pin(Countdown { name: "task-B", remaining: 1 })),
    ];

    loop {
        let next_id = ready_queue.borrow_mut().pop_front();
        let Some(id) = next_id else { break };
        if let Some(mut fut) = tasks[id].take() {
            let waker = make_waker(id, Rc::clone(&ready_queue));
            let mut cx = Context::from_waker(&waker);
            match fut.as_mut().poll(&mut cx) {
                Poll::Ready(done) => println!("executor retired {done}"),
                Poll::Pending => tasks[id] = Some(fut),
            }
        }
    }
}
```
```output
task-A: Pending (2 left)
task-B: Pending (1 left)
task-A: Pending (1 left)
task-B: Ready!
executor retired task-B
task-A: Ready!
executor retired task-A
```

Every production executor—Tokio, `smol`, `embassy` on bare-metal microcontrollers—is built around this exact loop. The only difference in Tokio is that instead of `Countdown` calling `wake_by_ref()` immediately, Tokio hands that `Waker` to its [[epoll]] / timer reactor ([Chapter 51](#blocking-epoll-io-uring)), which calls `wake()` milliseconds later when a network packet or timer fires.

## Why `Pin<&mut T>` exists: Self-Referential Futures

:::plain Why `Pin<&mut T>` exists in plain words
Moving an ordinary Rust struct copies its bytes to a new address (`memcpy`). If a suspended `async fn` holds a reference pointing **into another local variable inside that same Future**, moving the Future to a new address would leave that internal pointer pointing at the old, dead address. **[[Pin]]** locks the Future at one fixed memory address so internal borrows across `.await` can never dangle.
:::

Now look at what happens the instant an `async fn` holds a **reference across an `.await`**:

```rust
async fn sneaky() {
    let buf = [10_u8, 20, 30, 40];
    let slice: &[u8] = &buf[1..3]; // Points INTO `buf` inside this exact Future struct!
    some_io(slice).await;          // Suspended here while `slice` is STILL alive!
    println!("{slice:?}");
}
```

Draw the bytes of `SneakyFuture` in RAM right after returning `Poll::Pending`:

```text
Memory address 0x5500:
  ┌──────────────────────────┬────────────────────────────────┐
  │ buf: [10, 20, 30, 40]    │ slice.ptr: 0x5501 (points HERE)│
  └──────────────────────────┴────────────────────────────────┘
               ▲                                   │
               └────────── internal pointer ───────┘

Now imagine you MOVE SneakyFuture to 0x6800 (`std::mem::swap` or moving a Vec!):
  ┌──────────────────────────┬────────────────────────────────┐
  │ buf: [10, 20, 30, 40]    │ slice.ptr: 0x5501  <-- DANGLING! Points at old freed slot!
  └──────────────────────────┴────────────────────────────────┘
```

Because Rust moves structs via a shallow `memcpy` without running custom move-constructors (unlike C++), moving a suspended self-referential future would turn `slice.ptr` into an instant **use-after-free dangling pointer**!

**`Pin<&mut T>` solves that statically in the type system:**

- Ordinary `Copy`/`Vec`/`String`/`i32` types implement the marker trait **`Unpin`** automatically—moving them is always harmless, so `Pin<&mut T>` hands out `&mut T` freely.
- Generated `async fn` futures that hold borrows across `.await` are marked **`!Unpin`** by the compiler.
- Putting a `!Unpin` future behind **`Pin<P>`** (via `Box::pin(fut)` on the heap or `std::pin::pin!(fut)` on the current stack frame) **promises in safe Rust that the memory address will never move again until `Drop` runs.** Safe code can never pull `&mut T` back out of `Pin<&mut T>` when `T: !Unpin`, making self-referential `.await` borrows completely memory-safe.

## Inside Tokio's Work-Stealing Multi-Threaded Scheduler

When you call `tokio::spawn(async move { ... })` on a multi-threaded Tokio runtime (`N` OS worker threads, one per core):

:::note Tokio multi-threaded work-stealing architecture
```text
Shared Injection Queue (global mutex/list — external spawns & reactor wakeups)
          │
          ▼  (polled occasionally so injected work never starves)
┌──────────────────────┐        steals half!        ┌──────────────────────┐
│ Worker Thread 0      │ ◄───────────────────────── │ Worker Thread 1      │
│  • LIFO slot (1 task)│                            │  • LIFO slot (1 task)│
│  • Local ring (256)  │                            │  • Local ring (256)  │
└──────────┬───────────┘                            └──────────┬───────────┘
           │ idle? pops local -> steals sibling -> parks on epoll/condvar!
           ▼
   Shared `mio` Reactor (`epoll_wait` on network FDs & timer wheel)
```
:::

Four systems optimisations sit inside Tokio's scheduler:

1. **Per-worker lock-free local run queue (256 slots):** Most spawns and wakeups happen on the *current* worker thread and push onto its private lock-free ring buffer without touching global locks.
2. **The LIFO slot (cache locality trick):** When Task A wakes Task B over an internal channel, Tokio places B in the current thread's **LIFO slot** so B runs *immediately next* on the exact same CPU core—often finding Task A's message **still warm in L1 cache**.
3. **Work stealing:** If Worker 1 finishes all local tasks, it picks a sibling worker and **steals half** of that worker's local queue rather than sitting idle while Worker 0 holds 200 queued requests.
4. **Cooperative preemption budget (`128` per poll):** If a future keeps finding ready work without yielding (`loop { stream.next().await }` when data is always ready), Tokio forces `Poll::Pending` after 128 operations so one busy task cannot starve sibling HTTP connections.

## Why `!Send` types (`Rc`, `MutexGuard`) fail across `.await`

Now you can see why holding `std::sync::MutexGuard` or `Rc<T>` across an `.await` fails compilation under `tokio::spawn`:

- `tokio::spawn` requires the spawned `Future` to be **`Send`**, because **Worker 1 might steal that suspended `Future` and resume `.await` on Worker 1.**
- Because every local variable alive across an `.await` becomes a **field of the compiler-generated state-machine `enum`**, if a `!Send` type (`Rc` or `MutexGuard`) lives across `.await`, the entire `Future` enum contains a `!Send` field and cannot safely move to another OS thread. Dropping the `MutexGuard` inside an inner `{ ... }` block *before* `.await` excludes it from the suspended variant, making the `Future` `Send` again.

## Lock-free atomics & `Arc`'s `Release` / `Acquire` drop fence

Remember from Part VIII why `Arc::clone` and `Arc::drop` perform a subtle dance under the hood:
- **`Arc::clone`:** `strong.fetch_add(1, Ordering::Relaxed)`—incrementing the counter doesn't publish any writes yet, so `Relaxed` works cleanly!
- **`Arc::drop`:** Calls `strong.fetch_sub(1, Ordering::Release)`. Only the **last** thread that sees old count `== 1` executes **`std::sync::atomic::fence(Ordering::Acquire)`** *before* running `Drop::drop` on `T`! That single `Release` on every decrement + `Acquire` fence on the *final* decrement guarantees that every write performed by *any* former `Arc` owner becomes 100% visible to the winning destructor thread before memory is freed!

:::exercise guided Spotting why an `async` future failed `Send`
This snippet fails to compile with `future cannot be sent between threads safely`:
```rust
async fn handle(counter: std::sync::Arc<std::sync::Mutex<u64>>) {
    let mut guard = counter.lock().unwrap();
    *guard += 1;
    some_async_call().await;
}
```
Explain what field lives inside the generated state machine across `.await`, and show the two-line fix!
::hint
Wrap the lock acquisition inside `{ ... }` or `drop(guard);` before `.await`!
::solution
Because `guard` (`MutexGuard<'_, u64>`, which is `!Send`!) is still in scope at `some_async_call().await`, `rustc` stores `guard` as a field inside `handle`'s suspended enum variant—making the entire `Future` `!Send` (plus holding a blocking mutex across `.await` risks deadlocking Tokio worker threads!). Fix by releasing `guard` before `.await`:
```rust
{
    let mut guard = counter.lock().unwrap();
    *guard += 1;
} // guard dropped here -> not stored in state machine!
some_async_call().await;
```
:::

:::exercise practice Tracing `Pin<&mut T>` vs `Unpin`
Which of these values can be safely moved out of a `Pin<Box<T>>` with `std::mem::swap`, and why?
1. `Pin<Box<String>>`
2. `Pin<Box<async fn()>>` holding a local slice `&buf[..]` across `.await`
::hint
Check which implements `Unpin`!
::solution
1. **`Pin<Box<String>>`:** `String` is `Unpin` (it holds only a heap pointer, never an interior pointer back to its own stack address). So `Pin::into_inner(boxed)` or `Pin::get_mut()` works in safe Rust!
2. **`Pin<Box<async fn()>>`:** Self-referential async futures are **`!Unpin`**. Safe Rust refuses to unwrap `&mut T` or swap it, guaranteeing the heap address never changes while suspended!
:::

:::exercise challenge Why does Tokio's LIFO slot stay fast—and when can it starve?
Tokio runs a newly woken task inside the current worker's **LIFO slot** immediately rather than pushing it to the back of the FIFO ring. Explain both why LIFO improves cache latency AND why Tokio caps consecutive LIFO runs (`MAX_LIFO_POLLS_PER_TICK`)!
::hint
Think about cache locality (L1d hot messages) vs two tasks ping-ponging each other forever while 50 queued HTTP requests wait in the FIFO ring!
::solution
- **Why LIFO helps:** When Task A sends a message over a channel to Task B, Task B runs immediately on the exact same CPU core while the message bytes are still hot in **L1 cache**!
- **Why Tokio caps LIFO streaks:** If Task A wakes B and B immediately wakes A over and over on every turn, a strict LIFO slot would bounce A <-> B indefinitely and **starve** all 50 tasks waiting behind them in the local FIFO queue. Capping consecutive LIFO polls guarantees fairness without sacrificing common-case cache warmth.
:::

:::recap
- Rust compiles every `async fn` into a stackless **state-machine enum** implementing `Future`, storing only locals alive across `.await` points.
- Futures holding local borrows across `.await` are self-referential (**`!Unpin`**) and protected by **`Pin<&mut T>`** so moving them cannot dangle internal pointers.
- **Tokio's work-stealing scheduler** pairs per-worker local queues, a cache-friendly **LIFO slot**, sibling **work stealing**, a cooperative poll budget, and **`mio`/`epoll`** reactor wake-ups.
- Variables alive across `.await` determine whether a spawned future is `Send`; drop `!Send` guards before `.await`.
:::

:::quiz Check your understanding
? Why does `Pin<&mut T>` exist in async Rust?
- To allocate every integer on the heap
+ To prevent safe code from moving a suspended self-referential `!Unpin` future in memory after it stored pointers into its own struct fields across an `.await`
- To make async futures automatically `Send + Sync`
- To bypass the Linux `epoll` loop
= Moving a self-referential struct via bitwise `memcpy` would leave its internal pointers pointing to the old stale address; `Pin` guarantees address stability for `!Unpin` types.

? Why must a `std::sync::MutexGuard` be dropped BEFORE an `.await` inside a `tokio::spawn` task?
- `MutexGuard` uses `io_uring` internally
+ Locals alive across `.await` become fields of the generated future state machine, and `MutexGuard` is `!Send` (plus blocking across `.await` deadlocks worker threads!)
- Rust forbids locking mutexes inside async functions altogether
- `MutexGuard` allocates 2 MiB per `.await`
= Keeping a `!Send` guard live across `.await` infects the future state machine with `!Send` and blocks the executor thread.

? How does Tokio avoid global lock contention when 16 CPU cores spawn thousands of tasks per second?
- It runs all tasks on 1 thread
+ Each worker maintains a private local run queue and LIFO slot, only touching global queues or stealing work from siblings when local work runs dry
- It allocates a separate process per task
- It uses `spin_loop` on a global `Mutex<Vec>`
= Per-worker local run queues and work stealing keep scheduling local to the active core with minimal cross-core contention.

? When an `Arc<T>` is dropped, why does `Arc::drop` use `Ordering::Release` on `fetch_sub` paired with an `Acquire` fence on the final `1 -> 0` transition?
- To make `Arc::clone` slower
+ To guarantee all mutations made through previous `Arc` owners happen-before the winning last thread runs `T::drop`
- Because `Arc` uses `Pin` internally
- To prevent integer overflow
= Synchronizing `Release` across all drops with a final `Acquire` fence before destruction prevents memory reclamation races across CPU cores.
:::
