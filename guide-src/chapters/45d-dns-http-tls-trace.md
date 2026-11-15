@id dns-http-tls-trace
@part p10
@kind chapter
@title DNS, TLS 1.3, HTTP/1.1 vs HTTP/2 vs HTTP/3 & Packet Trace
@short DNS, HTTP, TLS & packet trace
@level intermediate
@time 35
@learn Trace DNS resolution from /etc/hosts and glibc nsswitch to UDP/53 recursive resolvers and TTL caching | Explain TLS 1.3 (X25519 key exchange, X.509 certificate chains, AEAD encryption) in 1-RTT | Contrast HTTP/1.1 text streams, HTTP/2 binary multiplexed frames, and HTTP/3 over QUIC/UDP | Follow reqwest::get("https://example.com/data") end-to-end across every network packet and syscall

The [end-to-end trace](#end-to-end-trace) followed a local program from source code to terminal output. This chapter follows a network request through name resolution, transport and application protocols, then relates those layers to the Rust code that initiates it. The path varies with configuration, caches and protocol negotiation, so the trace is a model of a common case rather than a fixed route.

```rust
let body = reqwest::get("https://example.com/data").await?.text().await?;
```

Before `"example.com"` responds with JSON or HTML, your machine resolves DNS names to IP addresses, opens a TCP connection, negotiates **TLS 1.3** cryptography (via `rustls` or OpenSSL), sends an **HTTP** request, receives encrypted TCP packets through NIC interrupts and `epoll`, decrypts them in user space, and delivers `&str` bytes!

:::plain DNS, TLS, and HTTP in one paragraph
**[[DNS]]** turns a name into an IP address by asking a chain of servers, each answer carrying a **TTL** that says how long to cache it. **[[TLS]]** then turns the TCP connection into an authenticated, encrypted channel: the server proves its identity with a certificate chain, both sides derive a shared key with ephemeral Diffie–Hellman, and every later byte is encrypted and integrity-checked. **HTTP** is what travels inside that channel — text in HTTP/1.1, binary frames in HTTP/2, and independent streams over QUIC in HTTP/3. Each layer exists to solve one problem: naming, trust, or meaning.
:::

:::analogy Calling a foreign bank securely
First you check your phone contacts (`/etc/hosts`) or directory assistance (**DNS**) to get the building's street number (`IP`). Next you walk up and knock (**TCP 3-way handshake**). Before sharing account numbers, you verify the teller's passport (**X.509 Certificate** signed by a trusted **CA**) and agree on a private shared secret pad (**X25519 Diffie-Hellman -> TLS 1.3 symmetric keys**). Only inside that encrypted tunnel do you speak the structured bank request (**HTTP**) and verify every sealed envelope (**AEAD ChaCha20-Poly1305 / AES-GCM**).
:::

:::compare HTTP/1.1 vs HTTP/2 vs HTTP/3
| Feature | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Transport layer | TCP | TCP | **QUIC over UDP** |
| Wire format | Plain ASCII text (`GET / ...`) | Binary **multiplexed streams** & HPACK header compression | Binary multiplexed streams + QPACK + built-in **TLS 1.3** |
| Concurrency over 1 connection | Sequential (1 request at a time; browsers open 6 TCP connections!) | Many concurrent streams on 1 TCP connection | Many concurrent **independent** streams on 1 UDP association |
| TCP Head-of-Line blocking? | Yes | **Yes!** (1 lost TCP packet pauses *all* HTTP/2 streams on that connection!) | **Fixed!** (Packet loss pauses only the affected QUIC stream!) |
| Handshake latency (cold TLS) | TCP (1 RTT) + TLS 1.3 (1 RTT) = 2 RTT | TCP + TLS 1.3 (ALPN `h2`) = 2 RTT | **1 RTT** (QUIC combines transport + TLS 1.3; `0-RTT` resume!) |
:::

Both HTTP/2 and HTTP/3 replace HTTP/1.1's text lines with **binary framing**, because a parser that reads a length and then a fixed number of bytes cannot be tricked into mis-splitting a message the way a text parser can. In HTTP/2 every frame begins with the same 9-byte header:

```text
 HTTP/2 frame header (always 9 bytes, big-endian)
┌───────────────┬───────────────┬──────────────────┬─────────────────────────┐
│ Length (24 b) │ Type (8 b)    │ Flags (8 b)      │ Stream ID (31 b + 1 R)  │
└───────────────┴───────────────┴──────────────────┴─────────────────────────┘
   payload size   0=DATA 1=HEADERS   END_STREAM,        which stream this
                  ...   3=SETTINGS   END_HEADERS        frame belongs to
```

A single request/response is then a sequence of frames, all interleaved on one TCP connection with frames from other requests:

```text
stream 1: HEADERS(END_HEADERS) → DATA → DATA(END_STREAM)
stream 3:            HEADERS(END_HEADERS) → DATA(END_STREAM)
stream 5: HEADERS(END_HEADERS) → DATA(END_STREAM)
             ▲ all three share one TCP byte stream and one TLS record stream
```

The `Stream ID` is what lets the receiver demultiplex: the kernel delivers one ordered byte stream, and the HTTP/2 state machine cuts it back into per-stream messages. That works beautifully until a TCP segment is lost: the kernel cannot deliver *any* later bytes, so the frames of every stream behind the hole wait. This is **TCP head-of-line blocking at the transport layer**, and it is the only reason HTTP/3 exists.

HTTP/3 keeps the frame concept but moves each stream onto its own **[[QUIC]]** stream, which is a first-class object in the protocol rather than an ID inside a shared byte stream:

```text
QUIC connection (one UDP 4-tuple, one TLS 1.3 handshake)
├── stream 0  (control: settings, GOAWAY)
├── stream 1  request 1 : HEADERS → DATA        lost packet here?
├── stream 3  request 3 : HEADERS → DATA        ...only stream 1 stalls
└── stream 5  request 5 : HEADERS → DATA        ...these keep flowing
```

Because QUIC acknowledges and retransmits **per stream**, a lost packet only delays the stream it belonged to. QUIC also carries the TLS handshake itself, so the transport and crypto setup share one round trip instead of two, and a resumed connection can send data in `0-RTT`.

One field chooses between all of this before a single byte of HTTP is sent: **[[ALPN]]** (Application-Layer Protocol Negotiation), an extension in the TLS `ClientHello` that lists the protocols the client speaks (`h2`, `http/1.1`, `h3`). The server picks one and echoes it in `ServerHello`, so port `443` serves an old `curl` and a modern browser without guessing and without an extra round trip.

## Step 1: DNS Resolution (`/etc/hosts` -> UDP Port 53 -> Caching)

When `reqwest` (or `std::net::ToSocketAddrs`) calls `getaddrinfo("example.com", "443")`:
1. **`/etc/nsswitch.conf` & `/etc/hosts`:** First libc checks local `/etc/hosts` (instant local file hit for `localhost` -> `127.0.0.1`).
2. **Stub resolver -> Recursive Resolver:** Otherwise it sends a compact binary **DNS query over UDP port 53** (`DoH`/`DoT` over TCP/TLS if encrypted) to your ISP/corporate/local `systemd-resolved` DNS resolver (`8.8.8.8` / `1.1.1.1` / `127.0.0.53`), asking for **`A`** (IPv4) and **`AAAA`** (IPv6) records (and `HTTPS` records for HTTP/3 hints!).
3. **Hierarchical walk (when resolver cache misses):** Root servers (`.`) -> Top-Level Domain servers (`.com`) -> Authoritative nameserver (`example.com`) -> returns `93.184.216.34` with a **`TTL`** (e.g. `3600` seconds) so subsequent lookups hit local caches instead of querying across the globe.

:::warn `std::net::ToSocketAddrs` blocks!
Unlike non-blocking sockets, POSIX `getaddrinfo()` is a **blocking C function**! That is why Tokio runs `tokio::net::lookup_host` on `spawn_blocking`, and async high-concurrency crawlers often embed pure-async DNS resolvers (`hickory-resolver`) speaking UDP/53 directly on `epoll`!
:::

## Step 2: TLS 1.3 Handshake (`rustls` / AES-GCM / ChaCha20)

Right after TCP's `SYN / SYN-ACK / ACK` completes on port `443`, `reqwest` (via **`rustls`**—memory-safe pure-Rust TLS!) executes **TLS 1.3** in just **1 round trip**:

:::note TLS 1.3 1-RTT Handshake & Encrypted Application Data
```text
CLIENT (reqwest + rustls)                                SERVER (Axum / nginx :443)
-------------------------                                --------------------------
1. ClientHello
   • SNI: "example.com"  • ALPN: ["h2", "http/1.1"]
   • KeyShare: Client X25519 Ephemeral Public Key  ──────►
                                                           Server picks TLS 1.3 + h2,
                                                           derives shared secret from X25519,
                                                           signs handshake with private key!
                           ◄────────────────────────────── 2. ServerHello + {EncryptedExtensions}
                                                              + {X.509 Certificate Chain}
                                                              + {CertificateVerify Signature}
                                                              + {Finished HMAC}
3. Client verifies cert chain against OS/Mozilla CA roots,
   verifies CertificateVerify signature, derives identical
   symmetric AEAD session keys (AES-128-GCM / ChaCha20),
   sends {Finished} + FIRST ENCRYPTED HTTP REQUEST! ──────►  4. Decrypts & sends HTTP 200!
```
:::

Notice three rock-solid cryptographic pillars in TLS 1.3:
- **Perfect Forward Secrecy (PFS):** Each connection generates throwaway **X25519** ephemeral keys (`ECDHE`). Even if an attacker steals the server's long-term private certificate key next year, recorded traffic from today **cannot** be decrypted!
- **Identity Authentication:** **X.509 Certificates** tie the public key to `"example.com"`, signed by a trusted **Certificate Authority (CA)** (`webpki-roots` / OS `/etc/ssl/certs`), verified via `CertificateVerify` so no middlebox can impersonate the server.
- **AEAD Integrity + Confidentiality:** Every encrypted HTTP record uses **AES-GCM** or **ChaCha20-Poly1305**—guaranteeing both secrecy and tamper detection (`tag` fails immediately if even 1 bit flips!).

## Step 3: Parsing & Building HTTP/1.1 Request Wire Framing in Rust

Look at what actually flows inside that encrypted TLS pipe for a plain HTTP/1.1 request (HTTP/2 binary frames compress the exact same semantic method, path, headers, and status):

```rust run
fn build_http1_get(host: &str, path: &str) -> Vec<u8> {
    format!(
        "GET {path} HTTP/1.1\r\n\
         Host: {host}\r\n\
         User-Agent: rust-systems-guide/1.0\r\n\
         Accept: application/json\r\n\
         Connection: close\r\n\
         \r\n"
    )
    .into_bytes()
}

fn parse_status_line(raw: &[u8]) -> Option<(u16, &str)> {
    let text = std::str::from_utf8(raw).ok()?;
    let (head, _rest) = text.split_once("\r\n")?;
    let mut parts = head.splitn(3, ' ');
    let _version = parts.next()?; // e.g. "HTTP/1.1"
    let code: u16 = parts.next()?.parse().ok()?;
    let reason = parts.next().unwrap_or("");
    Some((code, reason))
}

fn main() {
    let req = build_http1_get("example.com", "/data");
    println!("wire request ({} bytes):\n{}", req.len(), String::from_utf8_lossy(&req).trim_end());

    let mock_resp = b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}";
    println!("parsed response = {:?}", parse_status_line(mock_resp));
}
```
```output
wire request (122 bytes):
GET /data HTTP/1.1
Host: example.com
User-Agent: rust-systems-guide/1.0
Accept: application/json
Connection: close
parsed response = Some((200, "OK"))
```

Notice the **`\r\n\r\n`** blank line: that is the framing boundary separating HTTP headers from the response body (whose length is declared either via `Content-Length: N` or `Transfer-Encoding: chunked`).

The same request in HTTP/2 is unreadable to a human but trivial for a machine to delimit. Here is a 9-byte frame header parsed and re-emitted, with no HTTP crate at all:

```rust run
#[derive(Debug, PartialEq)]
struct FrameHeader {
    length: u32,
    kind: u8,
    flags: u8,
    stream_id: u32,
}

const DATA: u8 = 0x0;
const HEADERS: u8 = 0x1;
const END_STREAM: u8 = 0x1;

fn parse_frame_header(raw: &[u8; 9]) -> FrameHeader {
    // 24-bit length, then type, flags, and a 31-bit stream id (top bit reserved).
    let length = (u32::from(raw[0]) << 16) | (u32::from(raw[1]) << 8) | u32::from(raw[2]);
    let stream_id = u32::from_be_bytes([raw[5] & 0x7f, raw[6], raw[7], raw[8]]);
    FrameHeader { length, kind: raw[3], flags: raw[4], stream_id }
}

fn build_frame_header(length: u32, kind: u8, flags: u8, stream_id: u32) -> [u8; 9] {
    let len = length.to_be_bytes();
    let sid = stream_id.to_be_bytes();
    [len[1], len[2], len[3], kind, flags, sid[0] & 0x7f, sid[1], sid[2], sid[3]]
}

fn name(kind: u8) -> &'static str {
    match kind {
        DATA => "DATA",
        HEADERS => "HEADERS",
        0x4 => "SETTINGS",
        0x6 => "PING",
        _ => "OTHER",
    }
}

fn main() {
    // A HEADERS frame that ends the stream: length 87, type 1, flags END_STREAM, stream 1.
    let request = build_frame_header(87, HEADERS, END_STREAM, 1);
    let parsed = parse_frame_header(&request);
    println!("{:?}", parsed);
    println!("{} bytes of {} on stream {}", parsed.length, name(parsed.kind), parsed.stream_id);
    println!("ends stream = {}", parsed.flags & END_STREAM != 0);

    // A DATA frame carrying 512 bytes on stream 3, no flags set.
    let body = parse_frame_header(&build_frame_header(512, DATA, 0, 3));
    println!("{} bytes of {} on stream {}", body.length, name(body.kind), body.stream_id);
}
```
```output
FrameHeader { length: 87, kind: 1, flags: 1, stream_id: 1 }
87 bytes of HEADERS on stream 1
ends stream = true
512 bytes of DATA on stream 3
```

Every HTTP/2 and HTTP/3 implementation starts with exactly this function. The length field is what makes the parser safe: read `N` bytes, and the next frame starts at a known offset — no scanning for `\r\n`, no ambiguity when the body happens to contain newlines.

## Step 4: The Complete Packet & Syscall Trace of `reqwest::get`

Watch every single step end-to-end across hardware, kernel, and Rust:
1. **`reqwest` checks connection pool:** Reuses an idle warm TLS/HTTP2 socket if available (`0 RTT` overhead!); otherwise starts fresh.
2. **DNS (`getaddrinfo` / `hickory`):** Sends UDP packet `:53` -> receives `A` / `AAAA` IP (`93.184.216.34`).
3. **Non-blocking `connect()` + `epoll`:** `socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK)` -> `connect()` returns `EINPROGRESS` -> registers FD with Tokio `mio`/`epoll` -> kernel sends TCP `SYN`, wakes Tokio `Waker` on `SYN-ACK`.
4. **TLS 1.3 (`rustls`):** Writes `ClientHello` via `write()` syscall -> kernel TCP splits/wraps with IPv4 + Ethernet MAC (`ARP` resolved to gateway router) -> NIC DMA transmits frame -> server returns `ServerHello + Cert + Finished` -> NIC IRQ wakes `epoll` -> `rustls` verifies X.509 signature and derives AES-GCM keys!
5. **HTTP Request & Response:** `reqwest` encrypts `GET /data` (or HTTP/2 `HEADERS` frame) into TLS records -> `write()` -> server Axum handler runs -> returns encrypted `200 OK` JSON -> `epoll` wakes task -> `rustls` decrypts & checks AEAD auth tag -> `Response::text()` validates UTF-8 and returns `String` to your `main`!

:::details Why `rustls` + pure-Rust cryptography matters for security
Historically, critical C TLS bugs like **Heartbleed (OpenSSL, 2014)** stemmed directly from out-of-bounds buffer reads (`memcpy` trusting an unvalidated length field!)—stealing private server keys straight out of heap memory. Rust's **`rustls`** parses every TLS handshake packet through checked slices (`&[u8]`), turning out-of-bounds bugs into impossible-to-compile errors or clean alerts rather than secret RAM leaks!
:::

:::exercise guided Diagnosing why a corporate TLS proxy or expired system clock breaks HTTPS
A Rust client using `reqwest` + `rustls` suddenly rejects `https://example.com` on an embedded Linux board whose real-time clock booted at `1970-01-01`. Why does TLS fail even though DNS, TCP, and cryptography keys are completely valid?
::hint
What fields sit inside every X.509 server certificate?
::solution
Every X.509 certificate specifies **`Not Before`** and **`Not After`** validity timestamps (e.g. `2026-09-01` to `2026-12-01`). Because the embedded Linux clock reads `1970-01-01`, `rustls` checks `now < NotBefore`, concludes the certificate is not yet valid, and aborts the handshake cleanly before trusting the connection—always run NTP clock sync before verifying TLS!
:::

:::exercise practice Tracing `ALPN` protocol negotiation (`h2` vs `http/1.1`)
How does a single server listening on TCP port `443` seamlessly serve an `HTTP/1.1` curl client AND an `HTTP/2` browser without guessing bytes or adding extra round trips?
::hint
Look at the `ALPN` field sent inside step 1 (`ClientHello`) of the TLS 1.3 diagram!
::solution
Inside the very first unencrypted `ClientHello`, the client lists supported application protocols via **ALPN** (*Application-Layer Protocol Negotiation*, e.g. `["h2", "http/1.1"]`). The server selects the highest protocol both support (`"h2"` or `"http/1.1"`) inside `ServerHello`'s encrypted extensions—costing **zero extra round trips** before HTTP begins!
:::

:::exercise challenge Why does HTTP/3 eliminate TCP Head-of-Line blocking?
Compare downloading 10 CSS/JS/API streams concurrently over one **HTTP/2 (over TCP)** connection vs one **HTTP/3 (over QUIC/UDP)** connection when 1% packet loss hits the user's cellular link.
::hint
Does the Linux kernel's TCP stack know that byte range `0..1460` belonged only to Stream #1 while bytes `1461..2920` belonged to independent Stream #3?
::solution
- **HTTP/2 over TCP:** The OS kernel sees only *one single ordered TCP byte stream*. When a single packet carrying Stream #1 drops, the kernel holds back *every subsequent packet* (even packets belonging to completely unrelated Streams #2–#10!) inside `SO_RCVBUF` until retransmission arrives (**TCP Head-of-Line blocking**).
- **HTTP/3 over QUIC/UDP:** QUIC implements independent stream buffers inside **UDP datagrams** in user space. Losing a datagram containing Stream #1 stalls **only Stream #1**, while Streams #2–#10 deliver data immediately with zero stall!
:::

:::recap
- **DNS** translates hostnames via `/etc/hosts` -> UDP/53 resolvers (with TTL caching) into `A`/`AAAA` IP addresses; use async DNS or `spawn_blocking` since POSIX `getaddrinfo` blocks.
- **TLS 1.3** delivers Forward Secrecy (**X25519**), Server Authentication (**X.509** certs verified against trusted **CA** roots), and **AEAD** encryption in a single round trip (`1-RTT`).
- **HTTP/1.1** uses `\r\n`-framed text; **HTTP/2** multiplexes binary streams on one TCP connection; **HTTP/3** moves multiplexing onto **QUIC/UDP** to eliminate TCP Head-of-Line blocking.
:::

:::quiz Check your understanding
? How many network round trips does a cold **TLS 1.3** handshake take after TCP connects (compared to TLS 1.2's 2 round trips)?
- 0 round trips always
+ 1 round trip (client sends `ClientHello` + ephemeral `KeyShare`, server completes handshake in one reply)
- 3 round trips
- 5 round trips
= TLS 1.3 eliminates the extra key-exchange round trip by sending the ephemeral X25519 key share eagerly inside `ClientHello`.

? What does **Perfect Forward Secrecy (PFS)** in TLS 1.3 protect against?
- DNS spoofing
+ Past encrypted recordings being decrypted later even if the server's long-term X.509 private key is stolen
- Unbuffered TCP writes
- SQL injection attacks
= Ephemeral Diffie-Hellman keys (`X25519`) are discarded when the connection closes; the long-term certificate key only *signs* the handshake, never encrypts traffic directly.

? What security failure did Heartbleed demonstrate in C TLS implementations that Rust's `rustls` eliminates structurally?
- Slow `X25519` curve math
+ Reading out-of-bounds heap memory past an untrusted packet slice length; Rust enforces slice bounds checks on every parse
- Forgetting to set `TCP_NODELAY`
- DNS cache poisoning
= Checked slice indexing in Rust refuses to copy past `&pkt[..]` boundaries even if an attacker lies about a length prefix.

? Why does HTTP/3 switch from TCP to QUIC (built over UDP)?
- UDP automatically guarantees zero packet loss
+ To eliminate cross-stream **TCP Head-of-Line blocking** and integrate TLS 1.3 + transport handshakes cleanly
- Because browsers stopped supporting TCP port 443
- To disable flow control
= Running QUIC streams independently atop UDP datagrams prevents one dropped packet from freezing every other concurrent stream on the connection.
:::
