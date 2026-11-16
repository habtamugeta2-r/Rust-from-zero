@id project-chat
@part p9
@kind project
@title Project: a chat server
@short Project: chat server
@level advanced
@time 55
@learn Design a small network protocol and a concurrent server for it | Run one async task per client and connect the tasks with a broadcast channel | Wait for two things at once with `select!` | Guarantee clean-up with `Drop` | Test a network server automatically

In this project you build a small networked chat service. Several clients can connect, choose names and exchange messages through the server. You will also write a client and an integration test that starts the server and checks a conversation between simulated users. The project makes concurrency, message framing and error handling concrete.

This is what two users see. The lines marked with `>` are what the person typed. The mark itself is not on the screen.

```text
Sara's terminal                          Tomas's terminal
---------------------------------------  -------------------------------------------
Welcome! What is your name?              Welcome! What is your name?
> sara                                   > sara
* sara joined                            The name 'sara' is taken. Try another name:
* tomas joined                           > tomas
> hello everyone                         * tomas joined
tomas: hi sara                           sara: hello everyone
> /who                                   > hi sara
* online: sara, tomas                    > /name tom
* tomas is now tom                       * tomas is now tom
> /dance                                 > /quit
* unknown command /dance. Try /help      (the connection was closed)
* tom left
```

The project brings together async concurrency (tasks, channels, shared state, `select!`) with much of what came before: enums and pattern matching for the commands, `Drop` for clean-up, a library with a thin `main`, and tests.

:::plain One owner, many clients, messages between
A chat server is an exercise in **ownership under concurrency**. Many client sockets are alive at once, and each must be able to send to all the others. The simple, correct design puts the shared state (the list of connected clients and the room) behind a single mutex or a single owner task, and every client's read loop becomes a producer that sends into it. Broadcast channels or a fan-out of `mpsc` senders do the writing. The project's real subject is choosing between a shared `Mutex`, a channel, and a lock-free structure, and being able to say why.
:::

## Step 0: plan

### The protocol

A **protocol** is the agreement between client and server about what they send each other. Ours is as simple as a protocol can be:

- Both sides send **lines of text**, each ended by a line break.
- The first line a client sends is the name it wants.
- After that, a line that starts with `/` is a command (`/who`, `/name sara`, `/quit`, `/help`). Any other line is a chat message.
- Lines from the server that start with `*` are announcements from the server itself.

A text protocol can be tried out by hand and read by eye, which makes mistakes easy to find.

### The architecture

```text
   client A ──TCP──▶ ┌────────────┐
                     │ task for A │──┐
   client B ──TCP──▶ ├────────────┤  │      ┌───────────────────────┐
                     │ task for B │──┼─────▶│ broadcast channel     │──▶ back to every task
   client C ──TCP──▶ ├────────────┤  │      │ ("the room")          │
                     │ task for C │──┘      └───────────────────────┘
                     └────────────┘
                          │                 ┌───────────────────────┐
                          └────────────────▶│ the set of names      │
                                            │ (behind a mutex)      │
                                            └───────────────────────┘
```

- **One task per client.** Each task owns its connection and does two things: it reads what its client types, and it forwards what the others say.
- **A broadcast channel is the room.** Tokio's `broadcast` channel delivers every message to *every* receiver. A task that wants to say something sends into the channel, and each task holds a receiver.
- **A shared set of names** makes sure no two members have the same name, and answers `/who`.

Notice how little is shared. Messages travel through a channel, as recommended in [chapter 59](#shared-state). The only data behind a lock is the set of names, and it is locked for an instant at a time.

### The files

```text
chat/
├── Cargo.toml
├── src/
│   ├── lib.rs           the server: all the logic
│   ├── main.rs          starts the server
│   └── bin/
│       └── client.rs    a small chat client
└── tests/
    └── chat.rs          an automated test with simulated users
```

Create the project and add Tokio:

```text
cargo new chat
cd chat
cargo add tokio --features full
```

```toml proj=chat file=Cargo.toml
[package]
name = "chat"
version = "0.1.0"
edition = "2024"

[dependencies]
tokio = { version = "1", features = ["full"] }
```

Every Rust file placed in `src/bin/` becomes an additional program of the package. This package therefore has two programs, `chat` (from `src/main.rs`) and `client`. With more than one, you must say which to run: `cargo run --bin chat` and `cargo run --bin client`.

## Step 1: the room

All of the following goes into `src/lib.rs`. Start with the message type and the state that the client tasks have in common:

```rust
use std::collections::BTreeSet;
use std::io;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast::{self, error::RecvError};

/// One line of chat, as it travels from one client task to all the others.
#[derive(Debug, Clone)]
struct Message {
    from: u64, // the id of the sending client, or 0 for the server itself
    text: String,
}

/// Everything the client tasks have in common.
struct Shared {
    names: Mutex<BTreeSet<String>>,
    sender: broadcast::Sender<Message>,
}

impl Shared {
    fn new() -> Shared {
        let (sender, _) = broadcast::channel(100);
        Shared { names: Mutex::new(BTreeSet::new()), sender }
    }

    /// Sends a line to every connected client.
    fn send(&self, from: u64, text: String) {
        // An error only means that nobody is listening right now.
        let _ = self.sender.send(Message { from, text });
    }

    fn who(&self) -> String {
        let names = self.names.lock().unwrap();
        names.iter().cloned().collect::<Vec<String>>().join(", ")
    }
}
```

- `broadcast::channel(100)` creates the room. Each receiver gets its own copy of every message, which is why `Message` must be `Clone`. The number is the capacity: how many messages the channel keeps for receivers that have not caught up yet.
- The receiver that `channel` returns is thrown away (`_`). Each client task will ask for its own with `sender.subscribe()`.
- Every client gets a number, its **id**. A message carries the id of its sender, so that a task can recognise its own messages and need not echo them back. The id 0 stands for the server.
- `send` ignores the result with `let _ =`. Sending fails only when there are no receivers, which is normal for an empty room. This is one of the rare places where ignoring an error is right, and the comment says why.
- A `BTreeSet` keeps its elements sorted, so `/who` lists the names in alphabetical order with no extra work.

## Step 2: names

A name must be acceptable and must be free. Taking a name has a counterpart that is easy to forget: the name must be given back when the member leaves, **whichever way** they leave. They may type `/quit`, close the window, lose their connection, or the server may hit an error while writing to them.

Rust has a tool that makes forgetting impossible: `Drop`, from [chapter 32](#smart-pointers). A `Member` value represents a registered name. When it is dropped, for any reason, the name is released.

```rust
impl Shared {
    /// Registers a name. Fails if the name is not acceptable or already taken.
    fn join(self: &Arc<Self>, name: &str) -> Result<Member, String> {
        check_name(name)?;
        if !self.names.lock().unwrap().insert(name.to_string()) {
            return Err(format!("The name '{name}' is taken."));
        }
        Ok(Member { name: name.to_string(), shared: Arc::clone(self) })
    }
}

/// A registered chat member. Dropping it frees the name and tells the others.
struct Member {
    name: String,
    shared: Arc<Shared>,
}

impl Member {
    fn rename(&mut self, new_name: &str) -> Result<String, String> {
        check_name(new_name)?;
        let mut names = self.shared.names.lock().unwrap();
        if !names.insert(new_name.to_string()) {
            return Err(format!("The name '{new_name}' is taken."));
        }
        names.remove(&self.name);
        Ok(std::mem::replace(&mut self.name, new_name.to_string()))
    }
}

impl Drop for Member {
    fn drop(&mut self) {
        if let Ok(mut names) = self.shared.names.lock() {
            names.remove(&self.name);
        }
        self.shared.send(0, format!("* {} left", self.name));
    }
}

fn check_name(name: &str) -> Result<(), String> {
    let length = name.chars().count();
    if length == 0 || length > 20 {
        return Err(String::from("A name needs 1 to 20 characters."));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(String::from("A name may only contain letters, digits, - and _."));
    }
    Ok(())
}
```

- `insert` on a set returns `false` if the value was already there. Checking and inserting therefore happen in one step, under one lock. If the code first asked "is the name free?" and inserted afterwards, two tasks could both get the answer "yes" for the same name.
- `join` takes `self: &Arc<Self>`. That is a method that can only be called on an `Arc<Shared>`, and it lets the new `Member` keep its own `Arc` to the shared state.
- In `rename`, the new name is inserted before the old one is removed, so the member never stands without a name. `std::mem::replace(&mut a, b)` puts `b` into `a` and returns the old content of `a`. Here it stores the new name and hands back the old one for the announcement.
- `drop` uses `if let Ok(...)` and not `unwrap()`. A destructor should never panic: it may be running *because* of a panic, and a second panic at that moment ends the whole program.

The only way to get a `Member` is `join`, and losing a `Member` always frees the name. The set of names and the set of living `Member` values cannot disagree. This is the idea of [chapter 34](#type-system) again: a value whose existence proves a fact.

## Step 3: understand the input

Each line from a client is turned into a precise value once, at the edge:

```rust
/// What a client can ask for.
#[derive(Debug, PartialEq)]
enum Input {
    Say(String),
    Rename(String),
    Who,
    Help,
    Quit,
    Empty,
    Unknown(String),
}

fn parse(line: &str) -> Input {
    let line = line.trim();
    if line.is_empty() {
        return Input::Empty;
    }
    let Some(command) = line.strip_prefix('/') else {
        return Input::Say(line.to_string());
    };
    let (word, rest) = command.split_once(' ').unwrap_or((command, ""));
    match (word, rest.trim()) {
        ("who", _) => Input::Who,
        ("help", _) => Input::Help,
        ("quit", _) => Input::Quit,
        ("name", new_name) if !new_name.is_empty() => Input::Rename(new_name.to_string()),
        _ => Input::Unknown(word.to_string()),
    }
}
```

`strip_prefix('/')` returns the rest of the line if it starts with a slash. If not, the line is an ordinary message. `parse` is a pure function, so its tests are short. They go at the bottom of `src/lib.rs`:

```rust proj=chat file=src/lib.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_is_a_message() {
        assert_eq!(parse("  hello there "), Input::Say(String::from("hello there")));
    }

    #[test]
    fn commands_start_with_a_slash() {
        assert_eq!(parse("/who"), Input::Who);
        assert_eq!(parse("/quit now"), Input::Quit);
        assert_eq!(parse("/name sara"), Input::Rename(String::from("sara")));
        assert_eq!(parse("/name"), Input::Unknown(String::from("name")));
        assert_eq!(parse("/dance"), Input::Unknown(String::from("dance")));
        assert_eq!(parse("   "), Input::Empty);
    }

    #[test]
    fn names_are_checked() {
        assert!(check_name("sara_92").is_ok());
        assert!(check_name("").is_err());
        assert!(check_name("two words").is_err());
        assert!(check_name("a-very-long-name-indeed-yes").is_err());
    }

    #[test]
    fn a_name_can_be_taken_only_once() {
        let shared = Arc::new(Shared::new());
        let first = shared.join("sara");
        assert!(first.is_ok());
        assert!(shared.join("sara").is_err());
        drop(first);
        assert!(shared.join("sara").is_ok());
    }
}
```

The last test checks the `Drop` behaviour: once the first member is gone, the name is free again.

## Step 4: one client's session

Now the heart of the server: the function that talks to one client from the first line to the last. It has two phases.

```rust
const HELP: &str = "* commands: /who  /name <new name>  /help  /quit";

async fn write_line(writer: &mut OwnedWriteHalf, text: &str) -> io::Result<()> {
    writer.write_all(format!("{text}\n").as_bytes()).await
}

/// Talks to one client from connection to goodbye.
async fn session(stream: TcpStream, shared: Arc<Shared>, id: u64) -> io::Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    // Ask for a name until we get one that is free.
    write_line(&mut writer, "Welcome! What is your name?").await?;
    let mut member = loop {
        let Some(line) = lines.next_line().await? else {
            return Ok(()); // the client left before giving a name
        };
        match shared.join(line.trim()) {
            Ok(member) => break member,
            Err(reason) => write_line(&mut writer, &format!("{reason} Try another name:")).await?,
        }
    };

    // From now on, listen to the room. Then tell everyone, including ourselves.
    let mut inbox = shared.sender.subscribe();
    shared.send(0, format!("* {} joined", member.name));

    loop {
        tokio::select! {
            // Something arrived from this client.
            line = lines.next_line() => {
                let Some(line) = line? else { break };
                match parse(&line) {
                    Input::Say(text) => shared.send(id, format!("{}: {text}", member.name)),
                    Input::Who => write_line(&mut writer, &format!("* online: {}", shared.who())).await?,
                    Input::Help => write_line(&mut writer, HELP).await?,
                    Input::Rename(new_name) => match member.rename(&new_name) {
                        Ok(old_name) => shared.send(0, format!("* {old_name} is now {new_name}")),
                        Err(reason) => write_line(&mut writer, &format!("* {reason}")).await?,
                    },
                    Input::Quit => break,
                    Input::Empty => {}
                    Input::Unknown(word) => {
                        write_line(&mut writer, &format!("* unknown command /{word}. Try /help")).await?
                    }
                }
            }
            // Something arrived from the room.
            message = inbox.recv() => match message {
                Ok(message) if message.from != id => write_line(&mut writer, &message.text).await?,
                Ok(_) => {} // our own message: the client has already seen it
                Err(RecvError::Lagged(missed)) => {
                    write_line(&mut writer, &format!("* you missed {missed} messages")).await?
                }
                Err(RecvError::Closed) => break,
            },
        }
    }
    Ok(())
}
```

**Phase 1: the name.** The `loop` asks until `shared.join` succeeds, and `break member` hands the new `Member` out of the loop. `lines.next_line().await?` yields `Some(line)`, or `None` when the client has closed the connection. The `let … else` covers that case.

**Phase 2: the conversation.** The task must wait for two things at the same time: a line from its own client, and a message from the room. It cannot know which comes first. This is exactly what `select!` is for. Each time round the loop, `select!` waits for both, and runs the branch of whichever is ready first.

- A line from the client is parsed, and the `match` handles each kind of input. Thanks to the enum, the compiler checks that no case was forgotten.
- A message from the room is written to the client, unless this client sent it.

Some details that matter:

- **The order of `subscribe` and the join announcement.** The task subscribes first and announces after, so the new member receives its own "joined" line. It serves as the confirmation that the name was accepted.
- **Slow clients.** If a client reads more slowly than the room talks, messages pile up in the channel for it. Once more than 100 are waiting, the oldest are discarded, and `recv` reports `Lagged(n)`. The task tells the client and carries on. One slow client cannot make the server's memory grow without limit, and cannot hold up the others.
- **Errors.** Every write ends in `?`. If the client has vanished, the write fails, and the function returns the error.

And the clean-up? There is none to write. When `session` ends, by `/quit`, by a closed connection, or by an error passed up with `?`, its local variables are dropped. Dropping `member` frees the name and announces the departure. Dropping `writer` and `lines` closes the connection.

## Step 5: accept clients

```rust
/// Accepts clients for ever and starts one task for each.
pub async fn serve(listener: TcpListener) {
    let shared = Arc::new(Shared::new());
    let mut next_id = 1;

    loop {
        let (stream, address) = match listener.accept().await {
            Ok(connection) => connection,
            Err(error) => {
                eprintln!("could not accept a connection: {error}");
                continue;
            }
        };
        let id = next_id;
        next_id += 1;
        let shared = Arc::clone(&shared);

        tokio::spawn(async move {
            if let Err(error) = session(stream, shared, id).await {
                eprintln!("client {id} ({address}): {error}");
            }
        });
    }
}
```

`serve` is the only public item of the library. It takes a listener that is already bound to an address. That small decision makes the server testable: a test can bind to any free port and hand the listener in.

An error from one client is printed and ends only that client's task. The accept loop and all other clients are unaffected.

The program itself is short. Put it into `src/main.rs`:

```rust proj=chat file=src/main.rs
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let address = std::env::args().nth(1).unwrap_or_else(|| String::from("127.0.0.1:8080"));
    let listener = TcpListener::bind(&address).await?;
    println!("Chat server listening on {}. Press Ctrl+C to stop.", listener.local_addr()?);

    tokio::select! {
        _ = chat::serve(listener) => {}
        _ = tokio::signal::ctrl_c() => println!("\nShutting down."),
    }
    Ok(())
}
```

`tokio::signal::ctrl_c()` is a future that completes when the user presses Ctrl+C. The `select!` runs the server until that happens. Then `main` returns, the runtime shuts down, and all tasks are dropped, which closes every connection.

## Step 6: a client

To talk to the server you need a program that connects, sends what you type, and shows what arrives. Tools such as `nc` (netcat) or `telnet` can do that, but not every computer has them. A client of our own takes 25 lines. Put it into `src/bin/client.rs`:

```rust check noplay proj=chat file=src/bin/client.rs
use std::io::{self, BufRead, BufReader, Write};
use std::net::TcpStream;
use std::thread;

fn main() -> io::Result<()> {
    let address = std::env::args().nth(1).unwrap_or_else(|| String::from("127.0.0.1:8080"));
    let mut stream = TcpStream::connect(&address)?;
    let from_server = BufReader::new(stream.try_clone()?);

    // A second thread prints everything the server sends.
    thread::spawn(move || {
        for line in from_server.lines() {
            match line {
                Ok(line) => println!("{line}"),
                Err(_) => break,
            }
        }
        println!("(the connection was closed)");
        std::process::exit(0);
    });

    // The main thread sends everything that is typed.
    for line in io::stdin().lines() {
        stream.write_all(format!("{}\n", line?).as_bytes())?;
    }
    Ok(())
}
```

The client has exactly two things to wait for: the keyboard and the server. For that, two plain threads are the simplest tool, and no async runtime is needed. This is the standard library's own, blocking `TcpStream`.

- `stream.try_clone()` gives a second handle to the same connection, so that one thread can read while the other writes.
- When the server closes the connection, the reading thread ends the whole program with `process::exit`. Otherwise the main thread would go on waiting for the keyboard.

## Try it

Open three terminals in the project folder.

```text
Terminal 1                 $ cargo run --bin chat
                           Chat server listening on 127.0.0.1:8080. Press Ctrl+C to stop.

Terminal 2                 $ cargo run --bin client
                           Welcome! What is your name?

Terminal 3                 $ cargo run --bin client
                           Welcome! What is your name?
```

Type a name in each client, then chat. Try a name that is taken, `/who`, `/name`, an unknown command, and `/quit`. Close one client's window without `/quit` and watch the other: `* … left` appears all the same. Finally press Ctrl+C in the server's terminal, and both clients report that the connection was closed.

If you type `cargo run`, Cargo answers:

```text
error: `cargo run` could not determine which binary to run. Use the `--bin` option to specify a binary, or the `default-run` manifest key.
available binaries: chat, client
```

:::tip Chat across your network
The server listens on `127.0.0.1`, which is reachable only from the same computer. Start it with `cargo run --bin chat -- 0.0.0.0:8080` to accept connections from other computers in your network. They connect with `cargo run --bin client -- <your address>:8080`. Be aware that this server has no passwords and no encryption. Use it among friends on a private network, not on the open internet.
:::

## Step 7: test it automatically

Trying things by hand in three terminals does not scale. An integration test can start the server and play several users. Put this into `tests/chat.rs`:

```rust proj=chat file=tests/chat.rs
use std::net::SocketAddr;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::timeout;

/// Starts a server on a free port and returns its address.
async fn start_server() -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(chat::serve(listener));
    address
}

struct TestClient {
    lines: Lines<BufReader<OwnedReadHalf>>,
    writer: OwnedWriteHalf,
}

impl TestClient {
    /// Connects and logs in under the given name.
    async fn join(address: SocketAddr, name: &str) -> TestClient {
        let (reader, writer) = TcpStream::connect(address).await.unwrap().into_split();
        let mut client = TestClient { lines: BufReader::new(reader).lines(), writer };
        client.expect("Welcome! What is your name?").await;
        client.send(name).await;
        client.expect(&format!("* {name} joined")).await;
        client
    }

    async fn send(&mut self, text: &str) {
        self.writer.write_all(format!("{text}\n").as_bytes()).await.unwrap();
    }

    /// Waits for the next line and checks it. Fails after two seconds.
    async fn expect(&mut self, wanted: &str) {
        let line = timeout(Duration::from_secs(2), self.lines.next_line())
            .await
            .expect("no line arrived in time")
            .unwrap()
            .expect("the connection was closed");
        assert_eq!(line, wanted);
    }
}

#[tokio::test]
async fn a_message_reaches_the_other_client() {
    let address = start_server().await;
    let mut sara = TestClient::join(address, "sara").await;
    let mut tomas = TestClient::join(address, "tomas").await;
    sara.expect("* tomas joined").await;

    sara.send("hello everyone").await;
    tomas.expect("sara: hello everyone").await;

    tomas.send("hi sara").await;
    sara.expect("tomas: hi sara").await;
}

#[tokio::test]
async fn names_are_unique_and_can_be_changed() {
    let address = start_server().await;
    let mut sara = TestClient::join(address, "sara").await;

    // A second client asks for the same name and is refused.
    let (reader, writer) = TcpStream::connect(address).await.unwrap().into_split();
    let mut other = TestClient { lines: BufReader::new(reader).lines(), writer };
    other.expect("Welcome! What is your name?").await;
    other.send("sara").await;
    other.expect("The name 'sara' is taken. Try another name:").await;
    other.send("lena").await;
    other.expect("* lena joined").await;
    sara.expect("* lena joined").await;

    other.send("/name tomas").await;
    other.expect("* lena is now tomas").await;
    sara.expect("* lena is now tomas").await;

    sara.send("/who").await;
    sara.expect("* online: sara, tomas").await;
}

#[tokio::test]
async fn leaving_is_announced() {
    let address = start_server().await;
    let mut sara = TestClient::join(address, "sara").await;
    let mut tomas = TestClient::join(address, "tomas").await;
    sara.expect("* tomas joined").await;

    tomas.send("/quit").await;
    sara.expect("* tomas left").await;

    let lena = TestClient::join(address, "lena").await;
    sara.expect("* lena joined").await;
    drop(lena); // closing the connection counts as leaving
    sara.expect("* lena left").await;

    sara.send("/who").await;
    sara.expect("* online: sara").await;
}
```

How the test is built:

- **`#[tokio::test]`** is the async version of `#[test]`. It starts a runtime for the test function.
- **`start_server`** binds to port 0, which makes the operating system pick a free port. Every test gets its own server on its own port, so the tests can run in parallel without disturbing each other.
- **`TestClient`** hides the plumbing. A test then reads like a script of the conversation: `sara.send(...)`, `tomas.expect(...)`.
- **`expect` has a timeout.** If the server never sends the line, the test fails after two seconds with a clear message. Without the timeout it would hang for ever. Every test that waits for something should have a limit.

```text
$ cargo test
running 4 tests
test tests::a_name_can_be_taken_only_once ... ok
test tests::commands_start_with_a_slash ... ok
test tests::names_are_checked ... ok
test tests::plain_text_is_a_message ... ok

running 3 tests
test a_message_reaches_the_other_client ... ok
test leaving_is_announced ... ok
test names_are_unique_and_can_be_changed ... ok
```

The third test, `leaving_is_announced`, covers both ways of leaving: `/quit`, and a connection that is simply dropped.

## The complete server

```rust ext check proj=chat file=src/lib.rs
use std::collections::BTreeSet;
use std::io;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast::{self, error::RecvError};

/// One line of chat, as it travels from one client task to all the others.
#[derive(Debug, Clone)]
struct Message {
    from: u64, // the id of the sending client, or 0 for the server itself
    text: String,
}

/// Everything the client tasks have in common.
struct Shared {
    names: Mutex<BTreeSet<String>>,
    sender: broadcast::Sender<Message>,
}

impl Shared {
    fn new() -> Shared {
        let (sender, _) = broadcast::channel(100);
        Shared { names: Mutex::new(BTreeSet::new()), sender }
    }

    /// Sends a line to every connected client.
    fn send(&self, from: u64, text: String) {
        // An error only means that nobody is listening right now.
        let _ = self.sender.send(Message { from, text });
    }

    /// Registers a name. Fails if the name is not acceptable or already taken.
    fn join(self: &Arc<Self>, name: &str) -> Result<Member, String> {
        check_name(name)?;
        if !self.names.lock().unwrap().insert(name.to_string()) {
            return Err(format!("The name '{name}' is taken."));
        }
        Ok(Member { name: name.to_string(), shared: Arc::clone(self) })
    }

    fn who(&self) -> String {
        let names = self.names.lock().unwrap();
        names.iter().cloned().collect::<Vec<String>>().join(", ")
    }
}

/// A registered chat member. Dropping it frees the name and tells the others.
struct Member {
    name: String,
    shared: Arc<Shared>,
}

impl Member {
    fn rename(&mut self, new_name: &str) -> Result<String, String> {
        check_name(new_name)?;
        let mut names = self.shared.names.lock().unwrap();
        if !names.insert(new_name.to_string()) {
            return Err(format!("The name '{new_name}' is taken."));
        }
        names.remove(&self.name);
        Ok(std::mem::replace(&mut self.name, new_name.to_string()))
    }
}

impl Drop for Member {
    fn drop(&mut self) {
        if let Ok(mut names) = self.shared.names.lock() {
            names.remove(&self.name);
        }
        self.shared.send(0, format!("* {} left", self.name));
    }
}

fn check_name(name: &str) -> Result<(), String> {
    let length = name.chars().count();
    if length == 0 || length > 20 {
        return Err(String::from("A name needs 1 to 20 characters."));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(String::from("A name may only contain letters, digits, - and _."));
    }
    Ok(())
}

/// What a client can ask for.
#[derive(Debug, PartialEq)]
enum Input {
    Say(String),
    Rename(String),
    Who,
    Help,
    Quit,
    Empty,
    Unknown(String),
}

fn parse(line: &str) -> Input {
    let line = line.trim();
    if line.is_empty() {
        return Input::Empty;
    }
    let Some(command) = line.strip_prefix('/') else {
        return Input::Say(line.to_string());
    };
    let (word, rest) = command.split_once(' ').unwrap_or((command, ""));
    match (word, rest.trim()) {
        ("who", _) => Input::Who,
        ("help", _) => Input::Help,
        ("quit", _) => Input::Quit,
        ("name", new_name) if !new_name.is_empty() => Input::Rename(new_name.to_string()),
        _ => Input::Unknown(word.to_string()),
    }
}

const HELP: &str = "* commands: /who  /name <new name>  /help  /quit";

async fn write_line(writer: &mut OwnedWriteHalf, text: &str) -> io::Result<()> {
    writer.write_all(format!("{text}\n").as_bytes()).await
}

/// Talks to one client from connection to goodbye.
async fn session(stream: TcpStream, shared: Arc<Shared>, id: u64) -> io::Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();

    // Ask for a name until we get one that is free.
    write_line(&mut writer, "Welcome! What is your name?").await?;
    let mut member = loop {
        let Some(line) = lines.next_line().await? else {
            return Ok(()); // the client left before giving a name
        };
        match shared.join(line.trim()) {
            Ok(member) => break member,
            Err(reason) => write_line(&mut writer, &format!("{reason} Try another name:")).await?,
        }
    };

    // From now on, listen to the room. Then tell everyone, including ourselves.
    let mut inbox = shared.sender.subscribe();
    shared.send(0, format!("* {} joined", member.name));

    loop {
        tokio::select! {
            // Something arrived from this client.
            line = lines.next_line() => {
                let Some(line) = line? else { break };
                match parse(&line) {
                    Input::Say(text) => shared.send(id, format!("{}: {text}", member.name)),
                    Input::Who => write_line(&mut writer, &format!("* online: {}", shared.who())).await?,
                    Input::Help => write_line(&mut writer, HELP).await?,
                    Input::Rename(new_name) => match member.rename(&new_name) {
                        Ok(old_name) => shared.send(0, format!("* {old_name} is now {new_name}")),
                        Err(reason) => write_line(&mut writer, &format!("* {reason}")).await?,
                    },
                    Input::Quit => break,
                    Input::Empty => {}
                    Input::Unknown(word) => {
                        write_line(&mut writer, &format!("* unknown command /{word}. Try /help")).await?
                    }
                }
            }
            // Something arrived from the room.
            message = inbox.recv() => match message {
                Ok(message) if message.from != id => write_line(&mut writer, &message.text).await?,
                Ok(_) => {} // our own message: the client has already seen it
                Err(RecvError::Lagged(missed)) => {
                    write_line(&mut writer, &format!("* you missed {missed} messages")).await?
                }
                Err(RecvError::Closed) => break,
            },
        }
    }
    Ok(())
}

/// Accepts clients for ever and starts one task for each.
pub async fn serve(listener: TcpListener) {
    let shared = Arc::new(Shared::new());
    let mut next_id = 1;

    loop {
        let (stream, address) = match listener.accept().await {
            Ok(connection) => connection,
            Err(error) => {
                eprintln!("could not accept a connection: {error}");
                continue;
            }
        };
        let id = next_id;
        next_id += 1;
        let shared = Arc::clone(&shared);

        tokio::spawn(async move {
            if let Err(error) = session(stream, shared, id).await {
                eprintln!("client {id} ({address}): {error}");
            }
        });
    }
}
```

Add the test module from step 3 at the end of the file.

## What makes this server solid, and what is missing

Worth noticing in the design:

- **No lock is held across an `.await`.** The mutex around the names is taken and released within one statement or one short function.
- **Memory is bounded.** The broadcast channel has a fixed capacity, and slow receivers lose old messages.
- **Failures are contained.** An error in one session ends one task.
- **Clean-up cannot be skipped**, because it lives in `Drop`.

A server for the real world needs more. It should limit the length of a line (a client that sends gigabytes without a line break would fill the memory), limit how fast a client may send, encrypt the connections with TLS, and identify users with passwords. Those layers are explored in [Part 12](#dns-http-tls-trace).

:::details When one server becomes several
This chat server holds every room in one process. That is the right design for thousands of users, and it stops working when you need two servers behind a load balancer: a message sent to server A never reaches the clients connected to server B.

The usual next step is to make the servers **stateless** and move the shared state out: room membership and message history into a database, and the live fan-out through a message broker — each server subscribes to `room.*` and delivers to its own clients ([chapter 63](#async-ecosystem) covers the brokers). Redis pub/sub is the smallest version of this; NATS is the next.

Beyond that the questions stop being about Rust and start being about distributed systems, and they have names worth recognising before you meet them in an incident report:

- **Service discovery** — how does a client find a healthy instance? DNS, a load balancer, or a registry such as etcd or Consul.
- **Consensus** — how do several machines agree on one value after a crash? The Raft algorithm is the readable one; `openraft` is a Rust implementation.
- **Replication and the CAP trade-off** — when the network partitions, choose consistency or availability, and know which you chose.
- **Idempotency** — every distributed system retries. A retried request must not charge a card twice.

You do not need these to build this project; you need to know the words exist, so that "run two of them" does not sound like a small change. The book for this territory is *Designing Data-Intensive Applications* by Martin Kleppmann, and it is the one every team has a copy of.
:::

## Make it better

:::exercise practice Actions with `/me`
Add a command `/me <action>`. When Sara types `/me waves`, everybody, including Sara, sees `* sara waves`.
::hint
Three small changes: a new variant `Action(String)` in `Input`, a new arm in `parse` (model it on the `"name"` arm), and a new arm in the `match` inside `session`. Send the line with the id 0, so that the sender receives it too.
::solution
```rust
// 1. In `enum Input`
Action(String),

// 2. In `parse`, before the last arm
("me", action) if !action.is_empty() => Input::Action(action.to_string()),

// 3. In `session`, in the `match parse(&line)`
Input::Action(action) => shared.send(0, format!("* {} {action}", member.name)),
```

After step 1, the compiler refuses the `match` in `session` until step 3 is done: "pattern `Input::Action(_)` not covered". The enum made sure the new command could not be half-finished.

The line is sent with `from: 0`. Messages with the sender's own id are skipped by the sender's task, and here Sara should see her own action as everyone else does. A matching test is one line each of `sara.send("/me waves")` and `sara.expect("* sara waves")`.
:::

:::exercise practice Show what was said before
A newcomer sees an empty screen and has no idea what the conversation is about. Keep the last 10 lines that were sent to the room, and show them to every new member right after the name was accepted, marked with `(earlier)`.
::hint
Add a field `history: Mutex<VecDeque<String>>` to `Shared`. In `Shared::send`, push the text to the back and remove the oldest line when there are more than 10. Add a method `recent(&self) -> Vec<String>` that returns a copy. In `session`, write those lines before subscribing. Copy the lines out and let go of the lock before you start writing: a standard mutex must not be held across an `.await`.
::solution
```rust
use std::collections::{BTreeSet, VecDeque};

const HISTORY_SIZE: usize = 10;

struct Shared {
    names: Mutex<BTreeSet<String>>,
    sender: broadcast::Sender<Message>,
    history: Mutex<VecDeque<String>>,
}

impl Shared {
    fn send(&self, from: u64, text: String) {
        let _ = self.sender.send(Message { from, text: text.clone() });

        let mut history = self.history.lock().unwrap();
        if history.len() == HISTORY_SIZE {
            history.pop_front();
        }
        history.push_back(text);
    }

    fn recent(&self) -> Vec<String> {
        self.history.lock().unwrap().iter().cloned().collect()
    }
}

// In `session`, after the name was accepted and before `subscribe`:
for line in shared.recent() {
    write_line(&mut writer, &format!("(earlier) {line}")).await?;
}
```

`Shared::new` also needs `history: Mutex::new(VecDeque::new())`.

A `VecDeque` is the right collection: lines are added at the back and removed at the front, both in constant time. `recent()` clones the lines into a `Vec` and releases the lock when it returns. Only then does `session` write them to the client, which involves `.await`. Holding the guard during those writes would not even compile, because the task would no longer be `Send`.

When you run the tests after this change, the integration tests fail: a second member now receives `(earlier) * sara joined` before its own join line. Nothing is broken. The behaviour changed, and the tests noticed. Update `TestClient::join` so that it skips lines that start with `(earlier)`.
:::

:::exercise challenge Private messages
Add `/msg <name> <text>`. Only the named member receives the line, shown as `(private) sara: …`. If nobody has that name, the sender is told so.
::hint
Give `Message` a field `to: Option<String>`: `None` means "for everyone", and `Some(name)` means "only for this member". Every task still receives every message from the room, and decides whether to show it: a public message is shown unless it is the task's own, and a private one is shown only if `to` equals the task's current name. Add `Shared::send_private`, which first checks that the name exists.
::solution
```rust
#[derive(Debug, Clone)]
struct Message {
    from: u64,
    to: Option<String>, // None: for everyone. Some(name): only for that member
    text: String,
}

// In `enum Input`
Private { to: String, text: String },

// In `parse`, before the last arm
("msg", rest) => match rest.split_once(' ') {
    Some((to, text)) if !text.trim().is_empty() => {
        Input::Private { to: to.to_string(), text: text.trim().to_string() }
    }
    _ => Input::Unknown(String::from("msg")),
},

impl Shared {
    // `send` now builds `Message { from, to: None, text }`

    fn send_private(&self, from: u64, to: String, text: String) -> bool {
        if !self.names.lock().unwrap().contains(&to) {
            return false;
        }
        let _ = self.sender.send(Message { from, to: Some(to), text });
        true
    }
}

// In `session`, in the `match parse(&line)`
Input::Private { to, text } => {
    let line = format!("(private) {}: {text}", member.name);
    if !shared.send_private(id, to.clone(), line) {
        write_line(&mut writer, &format!("* nobody here is called {to}")).await?;
    }
}

// In `session`, the branch for messages from the room
message = inbox.recv() => match message {
    Ok(message) => {
        let for_me = match &message.to {
            None => message.from != id,
            Some(name) => *name == member.name,
        };
        if for_me {
            write_line(&mut writer, &message.text).await?;
        }
    }
    Err(RecvError::Lagged(missed)) => {
        write_line(&mut writer, &format!("* you missed {missed} messages")).await?
    }
    Err(RecvError::Closed) => break,
},
```

The private text never leaves the server towards the wrong client: each task filters before it writes. Adding the field to `Message` made the compiler point at every place that builds one.

This design is simple, and it has a cost: every task wakes up for every private message, only to throw it away. With thousands of members, a different structure is better: a map from each name to that member's own `mpsc` sender, so that a private message goes straight to one mailbox. The broadcast channel then carries only what is truly for everyone. Choosing between "simple and good enough" and "more efficient and more complex" is a normal engineering decision. Start simple, and measure before you complicate.
:::

## What you have learned

:::recap
- A network server is an accept loop that spawns one task per connection.
- A broadcast channel delivers each message to every subscriber. It is a natural model for a chat room.
- `select!` lets a task wait for its client and for the room at the same time.
- Shared data is kept small: one set of names behind a mutex that is never held across an `.await`.
- A value with a `Drop` implementation guarantees clean-up on every exit path.
- Parsing each line into an enum keeps the session loop clear, and the compiler checks that every command is handled.
- Passing an already bound listener into `serve` makes the server testable on a free port.
- Tests that wait for network data need timeouts.
:::

:::quiz Check your understanding
? The chat room uses a broadcast channel. Why is broadcast the right shape for it?
- A broadcast channel never fails, so the server cannot crash
+ Every subscriber should receive every message, which is exactly what broadcast does
- Broadcast is the only channel Tokio provides
- It lets one sender talk to one receiver only
= A chat room is one-to-many: each message goes to every connected client. Broadcast delivers a copy to every subscriber, and each subscriber's own slow connection cannot hold up the others.

? The names are kept behind a mutex, and the server never holds that mutex across an `.await`. Why is that rule important?
- The mutex would be locked forever
- Tokio forbids `Mutex` in async code
+ A mutex across an `.await` can block every other task, and the borrow checker will not allow it to be held
- The names would be lost
= Holding a lock across an `.await` means the task can be suspended while other tasks wait for the same lock, which can stall the whole runtime or deadlock it. The project's rule is to take the value out, drop the guard, and only then await.

? In the session loop, `select!` waits for two things at once. What are they?
- Two lines from the client
- The client connection and the server process
- A timer and a network read
+ The next line from the client, and a message addressed to this client from the room
= A client session must react both to what the person types and to what other people say. `select!` waits for whichever arrives first and handles that branch, so neither side waits idly for the other.

? The `serve` function takes a listener that is already bound to a port. What does that make possible?
+ The server can be tested on a free port, without racing for a fixed one
- The listener can be used by two servers at once
- The port number is written into the source code
- The server can start without the operating system
= Binding in the test and then handing the listener over means the test picks a free port, so two tests can run at the same time without one stealing the other's port.
:::


:::checklist
- I built the server and the client, and chatted between two terminals.
- All unit tests and integration tests pass with `cargo test`.
- I closed a client window without `/quit` and saw the departure announced.
- I can explain what each branch of the `select!` in `session` does.
- I can explain why `Member` implements `Drop`, and what would go wrong without it.
- I added the `/me` command.
- I added the history for newcomers and adapted the tests.
- I added private messages.
:::

You have built a concurrent async chat server with tasks, channels, and shared state, and you know how Rust keeps multi-core execution safe. Next, [Concurrency in practice](#async-ecosystem) scales these primitives with Rayon and Tokio middleware before Part 12 dives into the network stack itself.
