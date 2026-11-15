@id tcp-udp-sockets-kernel
@part p10
@kind chapter
@title Sockets, TCP State Machines, Congestion Control & UDP
@short Sockets, TCP & UDP internals
@level intermediate
@time 35
@learn Trace the exact Linux socket syscalls behind Rust TcpListener and TcpStream (socket, bind, listen, accept, connect) | Follow TCP's 3-way handshake, sequence/ACK numbers, sliding windows, and 4-way FIN teardown (TIME_WAIT / SO_REUSEADDR) | Contrast TCP's ordered byte stream (message framing pitfalls!) with UDP's datagram boundaries | Understand TCP congestion control (cwnd, slow start, BBR/CUBIC), Nagle's algorithm, and TCP_NODELAY

In Part VII you learned how `epoll` watches thousands of file descriptors ([blocking, `epoll` and `io_uring`](#blocking-epoll-io-uring)). In this chapter we look inside the **socket** file descriptors themselves—how Rust's `std::net::TcpListener`, `TcpStream`, and `UdpSocket` map directly onto Linux kernel socket buffers and **TCP's state machine**! The packets those sockets put on the wire are wrapped by [network layers, Ethernet and IP](#network-layers-ethernet-ip).

Why can `TcpStream::read` return just 3 bytes when the client wrote 500 bytes in one `write_all`? Why does restarting a crashed server complain `Address already in use` (`EADDRINUSE`) unless `SO_REUSEADDR` is set? And why can `TCP_NODELAY` slash interactive latency by 40 milliseconds?

:::analogy Phone call (TCP) vs throwing postcards in the mail (UDP)
- **[[TCP]]** is a continuous, ordered phone call: both sides dial and say *"Hello? Can you hear me? Yes!"* (3-way handshake), sequence every spoken word so missing phrases get re-requested (`ACK` + retransmit), slow down if the listener asks for breathing room (**flow control**), slow down if the highway clogs (**congestion control**), and say *"Goodbye / Goodbye"* (`FIN` / `TIME_WAIT`)—with **zero boundary lines** separating sentences unless you add punctuation!
- **[[UDP]]** is dropping fixed-size postcards into a mailbox: each `send()` stays one distinct card (never split across two cards or merged into another), takes minimal headers (8 bytes!), needs no handshake—yet cards can arrive out of order, twice, or vanish silently if overloaded!
:::

:::plain UDP in one paragraph
**UDP** is a thin wrapper around IP: an 8-byte header carrying source port, destination port, length and checksum, and nothing else. Every `send_to` produces exactly one datagram that either arrives whole or not at all, so message boundaries survive — a 900-byte datagram never arrives as 400 + 500 bytes. What UDP does *not* give you is ordering, retransmission, duplicate suppression, flow control or congestion control; those are your job if you need them, which is why QUIC (HTTP/3) rebuilds all of them in user space on top of UDP. It is the right choice when a late answer is worthless (voice, video, game state), or when you want to implement the reliability policy yourself.
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

## `UdpSocket`: datagrams that keep their edges

The API is smaller than `TcpStream` because there is no connection state to manage. One `send_to` is one datagram; one `recv_from` returns one whole datagram plus the sender's address. There is no `accept`, no handshake, and no ordering:

```rust run
use std::net::UdpSocket;

fn main() -> std::io::Result<()> {
    // Port 0 means "the kernel picks a free port" - always do this in tests.
    let server = UdpSocket::bind("127.0.0.1:0")?;
    let addr = server.local_addr()?;

    let client = UdpSocket::bind("127.0.0.1:0")?;
    client.send_to(b"PING", addr)?;

    // One recv_from == one whole datagram, at most 65,507 bytes.
    let mut buf = [0_u8; 16];
    let (n, peer) = server.recv_from(&mut buf)?;
    println!("server got {:?} from loopback", std::str::from_utf8(&buf[..n]).unwrap());
    println!("reply address is a real socket: {}", peer.port() != 0);

    // The reply needs no connection: the destination comes from `peer`.
    server.send_to(b"PONG", peer)?;
    let (n, _) = client.recv_from(&mut buf)?;
    println!("client got {:?}", std::str::from_utf8(&buf[..n]).unwrap());
    Ok(())
}
```
```output
server got "PING" from loopback
reply address is a real socket: true
client got "PONG"
```

The client's port is whatever the kernel handed out, so the program prints a boolean instead of a number that would change on every run — that is `bind("...:0")` doing its job. Two rules follow from the missing guarantees:

- **Datagrams are not free of size limits.** The IPv4 length field caps a UDP payload at `65,507` bytes, and most paths will drop anything beyond the path MTU unless fragmentation is allowed. Treat ~`1,200` bytes as a safe upper bound for internet traffic.
- **`recv_from` truncates silently.** If the datagram is larger than your buffer, the excess is discarded and you only learn about it from `MSG_TRUNC` when you pass flags with `recv_from`'s lower-level equivalent. Size the buffer to the largest message you accept.
- **Nothing is retransmitted.** A lost packet is lost. QUIC, DNS over TCP fallback, and game netcode all exist because somebody had to rebuild those pieces above UDP.

:::compare Same job, different syscall
| Task | TCP | UDP |
|---|---|---|
| Create the socket | `socket(AF_INET, SOCK_STREAM, 0)` | `socket(AF_INET, SOCK_DGRAM, 0)` |
| Set up | `bind`, `listen`, `accept` | `bind` only |
| Send | `write` on the connected fd | `sendto(fd, buf, addr)` per datagram |
| Receive | `read` on the accepted fd | `recvfrom(fd, buf)` returns payload + peer |
| Handle peers | one fd per connection | one fd for *all* peers; you track them |
| Kernel state | full state machine per connection | a single receive queue |
:::

## What the kernel does between `send` and the wire

The socket API is the boundary you can see, but the interesting part is the path a packet takes inside the kernel. On Linux it looks like this in both directions:

```text
  TX                                                    RX
  ──                                                    ──
  write() on fd                                         NIC receives a frame
      │                                                      │
      ▼                                                      ▼
  socket layer: copy user bytes into an sk_buff         DMA writes the frame into
      │                                                 a ring-buffer descriptor
      ▼                                                      │
  TCP/UDP: header, checksum, sequence                    NIC raises an interrupt
      │                                                      │
      ▼                                                      ▼
  IP: routing lookup, TTL, fragmentation                hard IRQ handler is tiny:
      │                                                 it only schedules NAPI
      ▼                                                      │
  qdisc (queueing discipline): fair queue,               NAPI poll: batches up to
  pacing, AQM                                           64 frames per poll, builds
      │                                                 sk_buff for each
      ▼                                                      │
  driver: map sk_buff into the TX ring,                 IP: reassembly, routing check
  hand a descriptor to the NIC                              │
      │                                                      ▼
      ▼                                                 socket receive queue
  NIC DMA-reads the frame, sends it                     (SO_RCVBUF, drops when full)
  and interrupts to reclaim the descriptor                   │
                                                             ▼
                                                        read() wakes the process
```

Four ideas carry most of the weight:

- **`sk_buff`** ([[sk_buff]]) is the kernel's packet struct: a header plus headroom, a data region, and a tail, so each layer can prepend its header *in place* without copying the payload. When you hear "zero-copy networking", this extra headroom is what makes it possible.
- **Ring buffers** ([[ring buffer]]) are circular arrays of descriptors shared between the driver and the NIC. The NIC reads a descriptor, DMAs the frame straight into RAM, and writes the completion index; the CPU never copies the payload for the device.
- **[[DMA]]** (direct memory access) lets the NIC read and write system memory without the CPU moving bytes. The CPU only sets up descriptors and handles completions, which is why a `10 Gbit/s` link can saturate one core.
- **[[NAPI]]** is the interrupt-coalescing trick: under load, the driver switches from "one interrupt per packet" to "one interrupt, then poll a batch", so a flood of small packets cannot livelock the machine in interrupt handlers.

You can watch every stage with `ss` (socket queues), `nstat`/`netstat -s` (drops and retransmits), `ethtool -S` (ring-buffer overruns), and `dropwatch` (where in the stack a packet was dropped). A receive queue that stays at its `SO_RCVBUF` limit while `ethtool` shows no drops means your *application* is not reading fast enough — the kernel is doing its job and applying backpressure.

:::details Tuning socket buffers without guessing
`SO_RCVBUF` is auto-tuned by default, and that is usually correct. When it is not, the numbers to check are `net.core.rmem_max`, `net.ipv4.tcp_rmem` and `net.ipv4.tcp_wmem`; raise the ceiling, not the default, and measure with `ss -m` before and after. For UDP, a receive buffer sized for one datagram is a bug: size it for the burst you expect during a scheduling hiccup, or you will drop packets in the kernel while your process is simply not scheduled.
:::

## A complete loopback conversation: TCP and UDP in one program

Nothing above needs a second machine. This program runs a real TCP listener and a real UDP socket on `127.0.0.1`, talks to both, and shuts down cleanly — the shape of any integration test you will write for a networked Rust program:

```rust run
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::thread;

fn main() -> std::io::Result<()> {
    // --- TCP: bind to an ephemeral port, then serve one connection ---
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let tcp_addr = listener.local_addr()?;
    println!("listening on loopback, port {} (chosen by the kernel)", tcp_addr.port() > 0);

    let server = thread::spawn(move || -> std::io::Result<()> {
        let (mut conn, peer) = listener.accept()?;      // one per-client fd
        conn.set_nodelay(true)?;                        // no Nagle for this RPC
        let mut buf = [0_u8; 5];
        conn.read_exact(&mut buf)?;                     // wait for the whole frame
        conn.write_all(b"HELLO, BACK")?;
        println!("server saw {:?} from {}", std::str::from_utf8(&buf).unwrap(), peer.ip());
        Ok(())
    });

    let mut client = TcpStream::connect(tcp_addr)?;
    client.write_all(b"HELLO")?;
    let mut reply = String::new();
    client.read_to_string(&mut reply)?;                 // EOF ends the read
    println!("client received {reply:?}");
    server.join().unwrap()?;

    // --- UDP: one datagram out, one datagram back, on the same loopback ---
    let udp_server = UdpSocket::bind("127.0.0.1:0")?;
    let udp_addr = udp_server.local_addr()?;
    let udp_client = UdpSocket::bind("127.0.0.1:0")?;
    udp_client.send_to(b"ping", udp_addr)?;

    let mut buf = [0_u8; 32];
    let (n, peer) = udp_server.recv_from(&mut buf)?;
    println!("udp server got {:?}", std::str::from_utf8(&buf[..n]).unwrap());
    udp_server.send_to(b"pong", peer)?;                 // reply needs no connect

    let (n, _) = udp_client.recv_from(&mut buf)?;
    println!("udp client got {:?}", std::str::from_utf8(&buf[..n]).unwrap());
    Ok(())
}
```
```output
listening on loopback, port true (chosen by the kernel)
server saw "HELLO" from 127.0.0.1
client received "HELLO, BACK"
udp server got "ping"
udp client got "pong"
```

The port numbers change on every run, so the program prints `true` instead of a number — the sequence does not change, and that is exactly what a test cares about. Two details are worth copying into real code:

- **`read_to_string` terminates on EOF, not on the end of the reply.** It returned the moment the server thread dropped `conn` and the kernel sent `FIN`, which is why the server does not need a length prefix here. With a long-lived connection you *must* frame messages, as the previous section showed.
- **The server thread owns the listener.** Moving `listener` into the thread is what lets the main thread keep using `tcp_addr` without a lock, and `join()` propagates the `io::Result` so a failed `accept` is not silently lost.

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
