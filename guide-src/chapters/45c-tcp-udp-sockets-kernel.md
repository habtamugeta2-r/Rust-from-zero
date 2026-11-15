@id tcp-udp-sockets-kernel
@part p10
@kind chapter
@title Sockets, TCP State Machines, Congestion Control & UDP
@short Sockets, TCP & UDP internals
@level intermediate
@time 35
@learn Trace the exact Linux socket syscalls behind Rust TcpListener and TcpStream (socket, bind, listen, accept, connect) | Follow TCP's 3-way handshake, sequence/ACK numbers, sliding windows, and 4-way FIN teardown (TIME_WAIT / SO_REUSEADDR) | Contrast TCP's ordered byte stream (message framing pitfalls!) with UDP's datagram boundaries | Understand TCP congestion control (cwnd, slow start, BBR/CUBIC), Nagle's algorithm, and TCP_NODELAY

In Part VII you learned how `epoll` watches thousands of file descriptors. In this chapter we look inside the **socket** file descriptors themselves—how Rust's `std::net::TcpListener`, `TcpStream`, and `UdpSocket` map directly onto Linux kernel socket buffers and **TCP's state machine**!

Why can `TcpStream::read` return just 3 bytes when the client wrote 500 bytes in one `write_all`? Why does restarting a crashed server complain `Address already in use` (`EADDRINUSE`) unless `SO_REUSEADDR` is set? And why can `TCP_NODELAY` slash interactive latency by 40 milliseconds?

:::analogy Phone call (TCP) vs throwing postcards in the mail (UDP)
- **TCP** is a continuous, ordered phone call: both sides dial and say *"Hello? Can you hear me? Yes!"* (3-way handshake), sequence every spoken word so missing phrases get re-requested (`ACK` + retransmit), slow down if the listener asks for breathing room (**flow control**), slow down if the highway clogs (**congestion control**), and say *"Goodbye / Goodbye"* (`FIN` / `TIME_WAIT`)—with **zero boundary lines** separating sentences unless you add punctuation!
- **UDP** is dropping fixed-size postcards into a mailbox: each `send()` stays one distinct card (never split across two cards or merged into another), takes minimal headers (8 bytes!), needs no handshake—yet cards can arrive out of order, twice, or vanish silently if overloaded!
:::

:::compare TCP vs UDP Inside the Linux Kernel
| Property | TCP (`SOCK_STREAM`) | UDP (`SOCK_DGRAM`) |
|---|---|---|
| Header size | **20+ bytes** | **8 bytes** (src port, dst port, len, checksum) |
| Boundary semantics | **Unbounded byte stream** (must frame messages yourself!) | **Message-preserving datagrams** (`1 send = 1 recv`) |
| Reliability & Ordering | Guaranteed in-order delivery via seq/ACK + retransmit | Best-effort only (can drop, reorder, duplicate) |
| Flow & Congestion Control | Sliding window (`rwnd`) + CUBIC/BBR (`cwnd`) | None built-in (HTTP/3 QUIC implements custom congestion on UDP!) |
| Kernel Socket Queues | `SYN` queue + `Accept` backlog + per-conn `SO_RCVBUF`/`SO_SNDBUF` | Single socket receive/send packet queue |
:::

## Socket syscalls behind `TcpListener` and `TcpStream`

Watch how Rust's `std::net` calls directly into the POSIX socket API:

:::note Client & Server socket syscalls + TCP 3-way handshake
```text
SERVER (`TcpListener::bind("0.0.0.0:8080")`)          CLIENT (`TcpStream::connect(...)`)
--------------------------------------------         ---------------------------------
1. socket(AF_INET, SOCK_STREAM, 0) -> fd 3           1. socket(AF_INET, SOCK_STREAM) -> fd 4
2. setsockopt(fd 3, SO_REUSEADDR, 1)                 2. connect(fd 4, 8080)
3. bind(fd 3, 0.0.0.0:8080)                                │
4. listen(fd 3, backlog=128)                               │ ─── SYN (seq=x) ──────────►
5. accept(fd 3)  [blocks or awaits epoll!]                 │ ◄── SYN-ACK (seq=y, ack=x+1)─
       │  (kernel moves completed conn to accept queue!)   │ ─── ACK (ack=y+1) ──────────►
       ▼                                                   ▼
   returns NEW fd 5 (`TcpStream` for this client!)      connect() returns Ok(TcpStream)!
```
:::

Notice the crucial insight at `accept()`: **`TcpListener` (`fd 3`) never transfers application bytes!** It only acts as a doorbell socket generating brand-new per-client `TcpStream` file descriptors (`fd 5`, `fd 6`, `fd 7`...), each uniquely keyed inside the kernel by the **4-tuple `(src_ip, src_port, dst_ip, dst_port)`**! That is how one server port `:443` accepts 100,000 separate clients simultaneously without mixing bytes!

## TCP's Big Gotcha: It Is a Byte Stream, NOT Messages!

Beginners frequently test `client.write_all(b"HELLO");` followed by `server.read(&mut buf)` on localhost and see `"HELLO"` arrive intact—and deploy a subtle bug! Over real WAN links (or high load):
- Two rapid writes `write_all(b"MSG1")` + `write_all(b"MSG2")` can merge inside the kernel `SO_SNDBUF` and arrive at the server in one `read()` as **`"MSG1MSG2"`**!
- Or a single `write_all(big_4kb)` splits across MTU segments and arrives as **`1,460` bytes first, then `1,460`, then `1,176`**!

That is why every real TCP protocol defines explicit **framing** (either `\n` delimiter lines like HTTP/1.1 headers / Redis RESP, or a **4-byte length prefix** `[len: u32 big-endian][payload]`):

```rust run
use std::io::{Cursor, Read, Write};

fn write_frame(w: &mut impl Write, msg: &[u8]) -> std::io::Result<()> {
    let len = u32::try_from(msg.len()).expect("frame <= 4 GiB");
    w.write_all(&len.to_be_bytes())?;
    w.write_all(msg)?;
    Ok(())
}

fn read_frame(r: &mut impl Read) -> std::io::Result<Vec<u8>> {
    let mut len_buf = [0_u8; 4];
    r.read_exact(&mut len_buf)?;
    let len = u32::from_be_bytes(len_buf) as usize;
    let mut payload = vec![0_u8; len];
    r.read_exact(&mut payload)?;
    Ok(payload)
}

fn main() {
    let mut wire = Vec::new();
    write_frame(&mut wire, b"alpha").unwrap();
    write_frame(&mut wire, b"beta-payload").unwrap();

    // Even if TCP merged both frames into one buffer, read_exact extracts exact boundaries!
    let mut cursor = Cursor::new(wire);
    println!("frame 1 = {:?}", String::from_utf8(read_frame(&mut cursor).unwrap()).unwrap());
    println!("frame 2 = {:?}", String::from_utf8(read_frame(&mut cursor).unwrap()).unwrap());
}
```
```output
frame 1 = "alpha"
frame 2 = "beta-payload"
```

Look how **`read_exact`** solves partial TCP reads automatically: it loops internally until either all `len` bytes arrive or EOF breaks mid-frame (`UnexpectedEof`)!

## Flow control, Congestion control, `TCP_NODELAY`, and `TIME_WAIT`

1. **Flow Control (`rwnd`, receiver-driven):** Every TCP `ACK` advertises the receiver's free `SO_RCVBUF` window size (`rwnd`). If a slow Rust server stops calling `.read()`, its kernel `SO_RCVBUF` fills, advertises `rwnd = 0`, and forces the sender's kernel to pause transmitting—**end-to-end TCP backpressure**!
2. **Congestion Control (`cwnd`, network-driven — CUBIC / BBR):** A server sending to a slow phone link cannot dump 100 MB instantaneously or core routers overflow and drop packets. TCP starts conservatively (**Slow Start**), ramps its **congestion window (`cwnd`)** exponentially, detects congestion via packet drops (or RTT pacing in Google's **BBR**), and scales back smoothly.
3. **Nagle's Algorithm & `TCP_NODELAY`:** By default, TCP coalesces tiny writes (`write("a")`, `write("b")`) waiting up to **~40–200 ms** for delayed ACKs unless disabled! For interactive RPCs, game state, or small JSON API responses, call `stream.set_nodelay(true)` (sets `TCP_NODELAY`) and batch writes cleanly with `BufWriter` in user space instead!
4. **4-way `FIN` close & `TIME_WAIT` (`SO_REUSEADDR`):** Whoever closes a TCP connection *first* (`active close`) enters **`TIME_WAIT`** for ~60 seconds (`2 * MSL`) so stray delayed packets from the old connection cannot confuse a brand-new connection on the exact same port! That is why Rust's `TcpListener::bind` automatically sets **`SO_REUSEADDR`** on Unix—so restarting your web server while old client connections are still in `TIME_WAIT` succeeds immediately instead of throwing `EADDRINUSE`!

:::details Live kernel socket inspection (`ss` / `/proc/net/tcp`)
On Linux, `ss -tulnp` or reading `/proc/net/tcp` lists every active socket, its exact state (`LISTEN`, `ESTABLISHED`, `SYN_RECV`, `TIME_WAIT`, `CLOSE_WAIT`), its `Recv-Q` / `Send-Q` backlog bytes, and owning PID. Seeing hundreds of sockets stuck in `CLOSE_WAIT` tells you instantly that your application forgot to drop/close sockets when clients disconnected!
:::

:::exercise guided Diagnosing `CLOSE_WAIT` vs `TIME_WAIT` leaks
Your production server runs `ss -tan` and discovers 15,000 sockets stuck in **`CLOSE_WAIT`**. Is this normal network cleanup (like `TIME_WAIT`), or an application bug?
::hint
Who calls `close()` when a socket sits in `CLOSE_WAIT` vs `TIME_WAIT`?
::solution
**Application bug!** `TIME_WAIT` means *your* server already closed its socket cleanly and the kernel is merely holding the port tuple safely for ~60s. **`CLOSE_WAIT`**, by contrast, means the *remote peer* sent `FIN` and closed its side, yet **your Rust server has NOT dropped/closed its own `TcpStream` file descriptor yet** (often an uncancelled task stuck awaiting something else without reading EOF!).
:::

:::exercise practice Choosing TCP vs UDP for real-time voice vs file transfer
Compare a live multi-player FPS/voice stream against a database replication stream: why does real-time voice/gaming prefer **UDP** (or QUIC), while database replication uses **TCP**?
::hint
Think about **Head-of-Line (HoL) blocking** when packet #10 is lost while packets #11, #12, #13 arrive cleanly!
::solution
- **TCP** enforces strict in-order byte delivery: if packet #10 drops, the kernel refuses to hand packets #11–#20 to your application until #10 is retransmitted (`50–200 ms` freeze—**Head-of-Line blocking**!). For live audio or player coordinates, stale 150 ms-old audio is worthless; dropping it and playing fresh frame #11 on **UDP** sounds crisp!
- **Database replication** demands exact, lossless, ordered WAL bytes—TCP handles sequence numbering, checksums, retransmits, and backpressure natively.
:::

:::exercise challenge Computing Bandwidth-Delay Product (BDP) for a fast link
Suppose a Rust tool streams backups from Addis Ababa to Frankfurt over a `1 Gbps` (`125 MB/s`) fiber link with `120 ms` (`0.12 s`) Round-Trip Time (RTT). How large must the TCP window (`rwnd` / `cwnd`) be so the sender doesn't stall waiting for ACKs?
::hint
Compute `BDP = Bandwidth (bytes/sec) × RTT (seconds)`!
::solution
`125,000,000 bytes/s × 0.12 s = 15,000,000 bytes ≈ 15 MB`! If the kernel socket receive buffer or TCP window were capped at `64 KiB` (classic pre-window-scaling limit), the link would stall at `64 KiB / 0.12 s ≈ 533 KB/s` (**< 0.5% of fiber speed!**). TCP **Window Scaling** (RFC 7323) and Linux's auto-tuned `SO_RCVBUF` scale windows up to tens of megabytes automatically.
:::

:::recap
- **`TcpListener::bind/listen/accept`** spawns independent per-client `TcpStream` FDs keyed by 4-tuple `(src_ip, src_port, dst_ip, dst_port)`.
- TCP delivers an **unbounded byte stream** (not messages)—always frame protocols explicitly (`\n` or `[len: u32]` + `read_exact`), and set **`TCP_NODELAY`** for low-latency RPCs.
- TCP pairs receiver **flow control (`rwnd`)** with network **congestion control (`cwnd`)** and **`TIME_WAIT`** (`SO_REUSEADDR`) safe teardown.
- **UDP** sends discrete 8-byte-header datagrams without handshakes, ordering, or head-of-line blocking.
:::

:::quiz Check your understanding
? A client calls `stream.write_all(b"HELLO")` and immediately calls `stream.write_all(b"WORLD")`. On the receiving server, what might one `stream.read(&mut buf)` return?
- Always `"HELLO"` first, then `"WORLD"`
+ `"HELLOWORLD"`, or `"HEL"`, or `"HELLO"` — TCP makes zero message-boundary guarantees
- An automatic `4`-byte length prefix
- A UDP datagram error
= TCP is a pure byte stream; consecutive writes may coalesce or split across MTU boundaries depending on kernel buffers and network timing.

? What is the difference between **flow control** (`rwnd`) and **congestion control** (`cwnd`) in TCP?
- They are two names for `SO_REUSEADDR`
+ Flow control stops a fast sender from overflowing the *receiver's* kernel buffer (`SO_RCVBUF`), whereas congestion control avoids saturating *intermediate network routers*
- Congestion control is used only by UDP
- Flow control runs only during the 3-way handshake
= TCP sends up to `min(cwnd, rwnd)` unacknowledged bytes, protecting both the destination host and the network path.

? Why does `TcpListener::bind` set `SO_REUSEADDR` on Unix?
- So two unrelated programs can listen on the exact same TCP port simultaneously and share packets
+ So a restarted server can rebind its port immediately even while old client connections linger safely in `TIME_WAIT`
- To bypass `SYN` handshakes
- To enable UDP broadcasting
= `TIME_WAIT` protects against stale packets for ~60s; `SO_REUSEADDR` lets a new `LISTEN` socket bind cleanly without blocking restarts.

? When should you call `stream.set_nodelay(true)` (`TCP_NODELAY`) on a `TcpStream`?
- Whenever downloading a 10 GiB file
+ For interactive request/response RPCs or real-time streams where Nagle + Delayed-ACK could stall small writes by ~40–200 ms
- Only inside `UdpSocket`
- To disable TLS encryption
= Disabling Nagle's algorithm transmits small user-buffered RPC frames immediately without artificial ~40 ms delayed-ACK stalls.
:::
