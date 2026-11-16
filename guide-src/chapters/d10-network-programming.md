@id network-programming
@part def
@title Networking
@short Networking
@level advanced
@time 95
@learn Build TCP/UDP clients and servers with `std::net` and Tokio | Use HTTP clients, servers, TLS and WebSockets correctly | Work with QUIC, gRPC and Protocol Buffers, including streaming | Connect to MQTT, AMQP, NATS and ZeroMQ brokers | Implement P2P, discovery, retries, load balancing and binary protocols

Networking is where Rust's ownership model pays off: buffers have one owner,
lifetimes prevent use-after-free while a request is in flight, and async tasks
make thousands of connections cheap. This chapter moves from sockets upward:
HTTP, TLS, DNS, WebSockets, QUIC, gRPC, message brokers and the distributed
patterns that keep a fleet healthy. The library's [network layers
chapter](#network-layers-ethernet-ip), [TCP/UDP chapter](#tcp-udp-sockets-kernel),
[DNS/HTTP/TLS trace](#dns-http-tls-trace) and [async chapter](#async) explain
the kernel and protocol internals; [chapter D4](#backend-development) applies all of this to backend
services.

Keep the division of labour straight. The library chapters explain how the
stack *works* — packets, kernel buffers, handshake bytes. This chapter assumes
that story and teaches how to *build with* the stack from Rust: clients and
servers (§10.1–§10.3), the protocols above HTTP (§10.6–§10.10), brokers
(§10.11–§10.14), and the resilience patterns (§10.16–§10.21) that only appear
once several services must survive each other's failures. Readers arriving
from the library can skim §10.1–§10.5 for the API shapes and slow down from
WebSockets onwards.

:::analogy A postal system with receipts
A socket is an address and a mailbox. TCP adds a conversation with sequence
numbers and receipts: bytes arrive in order or the sender learns they did not.
UDP is a postcard: it may arrive, arrive twice, or not at all, and the sender
is not told. HTTP is a letter format with a request and a response; TLS is the
sealed envelope; DNS is the address book; QUIC is a new postal service that
delivers streams over UDP with its own receipts.
:::

:::compare REST, gRPC and message queues
REST over HTTP/JSON is broadly compatible, cacheable and easy to debug, but verbose and weakly typed. gRPC gives typed contracts, streaming and efficient binary framing, at the cost of tooling and proxy support. Message queues decouple producer and consumer in time, adding durability and retries but also eventual consistency and operational complexity. Most systems use all three at different boundaries.
:::


## 10.1 TCP and UDP sockets with `std::net` and Tokio

A TCP server binds an address, listens, accepts connections and reads/writes
byte streams. Framing is the application's job: TCP is a stream, not a message
protocol.

```rust
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

fn handle(mut stream: TcpStream) -> std::io::Result<()> {
    let mut length = [0_u8; 4];
    stream.read_exact(&mut length)?;
    let size = u32::from_be_bytes(length) as usize;
    let mut payload = vec![0_u8; size];
    stream.read_exact(&mut payload)?;
    let reply = format!("echo: {}", String::from_utf8_lossy(&payload));
    let bytes = reply.as_bytes();
    stream.write_all(&(bytes.len() as u32).to_be_bytes())?;
    stream.write_all(bytes)?;
    Ok(())
}

fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:9000")?;
    for stream in listener.incoming() {
        let stream = stream?;
        thread::spawn(move || {
            if let Err(error) = handle(stream) {
                eprintln!("connection: {error}");
            }
        });
    }
    Ok(())
}
```

The four-byte length prefix makes the stream self-delimiting; without framing,
one `read` can return half a message or two messages. Common frames: length-
prefixed, newline-delimited JSON, or a fixed header plus body. `read_exact` is
the right call for a known length. Set `TCP_NODELAY` for latency-sensitive
protocols, and `SO_KEEPALIVE` or application heartbeats for long-lived idle
connections.

The Tokio version is the same shape, non-blocking:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("0.0.0.0:9000").await?;
    loop {
        let (mut socket, _peer) = listener.accept().await?;
        tokio::spawn(async move {
            let mut buffer = [0_u8; 1024];
            loop {
                match socket.read(&mut buffer).await {
                    Ok(0) => break, // peer closed
                    Ok(n) => {
                        if socket.write_all(&buffer[..n]).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
}
```

UDP is connectionless. `UdpSocket::recv_from` returns the peer address; each
datagram is independent. Use UDP for DNS, QUIC, gaming and telemetry where
latency matters more than reliability, and add sequence numbers, checksums and
retransmission at the application layer if you need reliability.

## 10.2 HTTP clients: `reqwest`, `ureq` and `hyper`

`reqwest` is the async default: connection pooling, TLS, redirects, proxies,
JSON and streaming bodies. `ureq` is a small blocking client for CLIs and
scripts. `hyper` is the low-level HTTP engine used by both.

```rust
use reqwest::Client;
use std::time::Duration;

async fn fetch(url: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = Client::builder()
        .user_agent("rust-from-zero/1.0")
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(3))
        .build()?;

    let response = client.get(url).send().await?;
    let status = response.status();
    let body = response.text().await?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {body}").into());
    }
    Ok(body)
}

#[tokio::main]
async fn main() {
    println!("{:?}", fetch("https://example.com").await.map(|body| body.len()));
}
```

Reuse one `Client`: it owns the connection pool, TLS session cache and cookie
store. Set total and connect timeouts; a default client can wait forever. Check
the status before parsing; `error_for_status` turns 4xx/5xx into an error.
Stream large bodies (`bytes_stream`) instead of `text()`, and bound the size you
accept. For JSON, `response.json::<T>()` deserialises incrementally; validate
afterwards ([chapter D6](#security-engineering)).

```rust
fn blocking_fetch(url: &str) -> Result<String, ureq::Error> {
    let body = ureq::get(url).call()?.into_string()?;
    Ok(body)
}

fn main() {
    println!("{:?}", blocking_fetch("https://example.com").map(|body| body.len()));
}
```

`hyper` exposes the protocol: you build requests and services, and it handles
HTTP/1.1 and HTTP/2 framing. Use it when you need a custom server, a proxy or
protocol-level control; use `reqwest`/`axum` otherwise.

## 10.3 HTTP server internals with `hyper`

An HTTP server is a service: a function from `Request` to `Response`. `hyper`
provides the connection state machine; `hyper-util` supplies the Tokio adapters.

```rust
use hyper::body::Incoming;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use std::convert::Infallible;

async fn handle(request: Request<Incoming>) -> Result<Response<String>, Infallible> {
    let response = match request.uri().path() {
        "/" => Response::new("hello\n".to_string()),
        "/healthz" => Response::new("ok\n".to_string()),
        _ => {
            let mut response = Response::new("not found\n".to_string());
            *response.status_mut() = StatusCode::NOT_FOUND;
            response
        }
    };
    Ok(response)
}

async fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        tokio::spawn(async move {
            let service = hyper::service::service_fn(handle);
            let _ = hyper::server::conn::http1::Builder::new()
                .serve_connection(io, service)
                .await;
        });
    }
}

fn main() {
    let _ = serve;
}
```

The important pieces: a listener, an IO adapter, a per-connection task, a service
and a protocol builder. HTTP/1.1 needs keep-alive and `Content-Length` or chunked
encoding; HTTP/2 multiplexes streams over one connection and needs TLS with ALPN
(`h2`) in browsers. Head-of-line blocking, slowloris and request smuggling are
protocol-level concerns: set header/body limits, idle timeouts and a maximum
number of connections. A framework such as Axum wraps this with routing,
extractors and graceful shutdown.

## 10.4 TLS with `rustls`, `tokio-rustls` and `native-tls`

TLS provides confidentiality, integrity and server authentication. `rustls` is
memory-safe and pure Rust with pluggable crypto providers; `native-tls` uses the
platform stack; `tokio-rustls` integrates `rustls` with Tokio.

```rust
use rustls::pki_types::{CertificateDer, ServerName};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_rustls::rustls::{ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

async fn fetch_tls(host: &str, port: u16) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    let connector = TlsConnector::from(std::sync::Arc::new(config));

    let stream = tokio::net::TcpStream::connect((host, port)).await?;
    let name = ServerName::try_from(host.to_string())?;
    let mut stream = connector.connect(name, stream).await?;
    stream.write_all(format!("GET / HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n").as_bytes()).await?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response).await?;
    Ok(response)
}

fn main() {
    let _ = (fetch_tls, CertificateDer::from);
}
```

Use TLS 1.2+ (prefer 1.3), a modern cipher suite and ALPN for HTTP/2. Server
certificates come from ACME (Let's Encrypt) or a private CA; rotate them
automatically. With `rustls`, choose the crypto provider explicitly when several
are linked. `native-tls` is useful when corporate roots are installed in the OS
store; `rustls` is preferable for static binaries and reproducibility. Never
disable verification to "make it work"; tests can use a test CA.

## 10.5 DNS resolution with `hickory-resolver`

`hickory-resolver` (formerly `trust-dns-resolver`) supports system
configuration, custom nameservers, DNSSEC validation (with features), caching and
async lookups.

```rust
use hickory_resolver::TokioAsyncResolver;

async fn resolve(host: &str) -> Result<Vec<std::net::IpAddr>, Box<dyn std::error::Error>> {
    let resolver = TokioAsyncResolver::tokio_from_system_conf()?;
    let response = resolver.lookup_ip(host).await?;
    Ok(response.iter().collect())
}

#[tokio::main]
async fn main() {
    println!("{:?}", resolve("example.com").await);
}
```

DNS is a cache with TTLs, not a database: results change, and the OS/client
resolver also caches. Respect TTLs, retry across addresses, and do not pin an IP
for a long-lived service unless you have a failover plan. For service discovery,
SRV records and `_service._tcp` names are useful. DNS rebinding and cache
poisoning are security concerns; DNSSEC validates origin authenticity, not
privacy (use DoH/DoT for that).

## 10.6 WebSockets with `tungstenite` and `tokio-tungstenite`

A WebSocket starts as an HTTP upgrade and then carries framed messages. Use
`tokio-tungstenite` for clients and servers, or the framework integration from
[chapter D4](#backend-development).

```rust
use futures::{SinkExt, StreamExt};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

async fn echo(url: &str) -> Result<(), Box<dyn std::error::Error>> {
    let (mut socket, _response) = connect_async(url).await?;
    socket.send(Message::Text("hello".into())).await?;
    while let Some(message) = socket.next().await {
        match message? {
            Message::Text(text) => {
                println!("{text}");
                socket.close(None).await?;
                break;
            }
            Message::Ping(payload) => socket.send(Message::Pong(payload)).await?,
            Message::Close(_) => break,
            _ => {}
        }
    }
    Ok(())
}

fn main() {
    let _ = echo;
}
```

WebSocket frames have an opcode (text, binary, ping, pong, close), a mask
(client frames are masked) and optional fragmentation. Handle ping/pong and
close codes; a silent half-open connection is common. Put message size limits on
the server, authenticate at the handshake, and implement application-level
heartbeats. The `Message::Text` type changed to `Utf8Bytes` in recent versions;
check the version you pin. For a server, `tokio-tungstenite::accept_async` wraps
an upgraded stream.

## 10.7 QUIC with `quinn`

QUIC runs over UDP and provides streams, TLS 1.3, congestion control and
connection migration without head-of-line blocking between streams. HTTP/3 is
QUIC plus QPACK. `quinn` is the mature Rust implementation.

```rust
use quinn::{ClientConfig, Endpoint};
use rustls::RootCertStore;
use std::net::SocketAddr;

async fn connect(server: SocketAddr, host: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let mut client_config = ClientConfig::with_root_certificates(std::sync::Arc::new(roots))?;
    client_config.transport_config(std::sync::Arc::new(quinn::TransportConfig::default()));

    let mut endpoint = Endpoint::client("0.0.0.0:0".parse()?)?;
    endpoint.set_default_client_config(client_config);
    let connection = endpoint.connect(server, host)?.await?;

    let (mut send, mut recv) = connection.open_bi().await?;
    send.write_all(b"ping").await?;
    send.finish()?;
    let response = recv.read_to_end(1024).await?;
    println!("{}", response.len());
    Ok(())
}

fn main() {
    let _ = connect;
}
```

QUIC's advantages are per-stream ordering, faster handshakes (0-RTT with
replay caveats) and connection migration. Costs: UDP may be blocked, CPU usage is
higher, and observability is less mature than TCP. Use it when your clients
support it and loss/latency matter; HTTP/3 servers often terminate QUIC at the
edge and proxy to HTTP/1.1.

## 10.8 gRPC deep dive: streaming and interceptors

gRPC has four call types: unary, server streaming, client streaming and
bidirectional streaming. `tonic` generates them from `.proto`; interceptors wrap
calls for auth, tracing, timeouts and metrics.

```rust
use tonic::{Request, Status};
use tonic::service::Interceptor;

#[derive(Clone)]
struct AuthInterceptor {
    token: String,
}

impl Interceptor for AuthInterceptor {
    fn call(&mut self, mut request: Request<()>) -> Result<Request<()>, Status> {
        let supplied = request
            .metadata()
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if supplied == self.token {
            Ok(request)
        } else {
            Err(Status::unauthenticated("missing or invalid token"))
        }
    }
}

// Server: Server::builder().layer(InterceptorLayer::new(...))
// Client: service.with_interceptor(AuthInterceptor { token })
fn main() {
    let interceptor = AuthInterceptor { token: "Bearer secret".into() };
    let _ = interceptor;
}
```

Status codes carry semantics (`INVALID_ARGUMENT`, `NOT_FOUND`, `UNAUTHENTICATED`,
`RESOURCE_EXHAUSTED`). Always set deadlines; without one, a hung server consumes a
connection forever. Flow control is per-stream and per-connection; a slow
consumer applies backpressure. For observability, propagate `traceparent` in
metadata and record method, status and latency. For errors, map domain errors to
statuses and never leak internals.

## 10.9 Protocol Buffers with `prost` and `prost-build`

Protocol Buffers are a schema and binary encoding: field numbers, wire types,
varints and length-delimited messages. `prost` generates Rust structs;
`prost-build` runs in `build.rs`; `tonic-build` adds gRPC services.

```rust
// build.rs
fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_protos(&["proto/catalogue.proto"], &["proto"])?;
    println!("cargo:rerun-if-changed=proto/catalogue.proto");
    Ok(())
}
```

```protobuf
syntax = "proto3";
package catalogue;

message Book {
  string id = 1;
  string title = 2;
  repeated string authors = 3;
  int32 year = 4;
}

service Catalogue {
  rpc Get(Book) returns (Book);
  rpc List(Book) returns (stream Book);
}
```

Field numbers are the wire contract; never reuse or renumber them. Removing a
field requires `reserved 5;` and a new number. `proto3` has no `required`;
absence is the default value, so use `optional` or a wrapper when presence
matters. Unknown fields are preserved by `prost` only with specific options;
design for forward compatibility by ignoring unknown fields and adding new ones
with defaults. Use `buf` to lint schemas and detect breaking changes.

## 10.10 Serialisation formats: MessagePack, FlatBuffers, Cap'n Proto and Avro

| Format | Schema | Zero-copy | Size | Best for |
| --- | --- | --- | --- | --- |
| JSON | no | no | large | HTTP, debugging |
| MessagePack | no | no | compact | compact JSON-like payloads |
| Protobuf | yes | no | compact | RPC, schema evolution |
| FlatBuffers | yes | yes | compact | games, read-heavy data |
| Cap'n Proto | yes | yes | compact | shared memory, RPC |
| Avro | yes | no | compact | data lakes, schema registry |

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct Telemetry {
    device: String,
    temperature: f32,
    sequence: u64,
}

fn main() {
    let value = Telemetry { device: "sensor-1".into(), temperature: 21.5, sequence: 7 };
    let bytes = rmp_serde::to_vec(&value).unwrap();
    let decoded: Telemetry = rmp_serde::from_slice(&bytes).unwrap();
    println!("{} {:?}", bytes.len(), decoded);
}
```

Choose by access pattern: JSON when humans and browsers read it; protobuf for
typed RPC and evolution; MessagePack when you want JSON-like flexibility with
less size; FlatBuffers/Cap'n Proto when you must read fields without
deserialising the whole message; Avro when a schema registry governs analytics.
Every binary format needs versioning, a size limit and validation ([chapter D6](#security-engineering)).

## 10.11 MQTT with `rumqttc` and brokers

MQTT is a publish/subscribe protocol with QoS levels, retained messages, last
will and sessions. It is the default for constrained IoT telemetry ([chapter D8](#embedded-iot)).

```rust
use rumqttc::{AsyncClient, MqttOptions, QoS};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut options = MqttOptions::new("client-1", "localhost", 1883);
    options.set_keep_alive(Duration::from_secs(30));
    let (client, mut eventloop) = AsyncClient::new(options, 32);

    tokio::spawn(async move {
        loop {
            if let Err(error) = eventloop.poll().await {
                eprintln!("mqtt: {error}");
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        }
    });

    client.subscribe("sensors/+/temperature", QoS::AtLeastOnce).await?;
    client.publish("sensors/1/temperature", QoS::AtLeastOnce, false, b"21.5").await?;
    Ok(())
}
```

QoS 0 is fire-and-forget, QoS 1 is at-least-once (duplicates possible), QoS 2 is
exactly-once (four-way handshake, higher latency). A retained message gives new
subscribers the last value; a last will notifies others of an ungraceful
disconnect. Wildcards: `+` matches one level, `#` matches the rest. `rumqttd`
is a Rust broker for local testing. Authenticate with TLS and per-device
credentials; a public broker is not a production choice.

## 10.12 AMQP with `lapin`

AMQP 0-9-1 (RabbitMQ) has exchanges, queues, bindings, routing keys,
acknowledgements and prefetch. It is a rich work-queue protocol, not a log.

```rust
use lapin::{options::*, types::FieldTable, BasicProperties, Connection, ConnectionProperties};

async fn publish() -> Result<(), Box<dyn std::error::Error>> {
    let connection = Connection::connect("amqp://guest:guest@localhost:5672/%2f", ConnectionProperties::default()).await?;
    let channel = connection.create_channel().await?;
    channel.queue_declare("jobs", QueueDeclareOptions::default(), FieldTable::default()).await?;
    channel
        .basic_publish(
            "",
            "jobs",
            BasicPublishOptions::default(),
            b"{\"job\":1}",
            BasicProperties::default().with_delivery_mode(2), // persistent
        )
        .await?
        .await?;
    Ok(())
}

fn main() {
    let _ = publish;
}
```

Consume with `basic_consume`, set `basic_qos(prefetch_count)` to bound in-flight
work, and acknowledge only after the side effect is durable. A nack or a
rejected message can go to a dead-letter exchange. Durable queues plus persistent
messages survive a broker restart; transient ones do not. Connection and channel
are separate: one channel per task, one connection per process is the usual
shape.

## 10.13 NATS with `async-nats` and JetStream

NATS is a lightweight publish/subscribe and request/reply system with subjects
and wildcards. JetStream adds persistence, consumer groups, acknowledgements
and replay.

```rust
use async_nats::ConnectOptions;

async fn nats() -> Result<(), async_nats::Error> {
    let client = ConnectOptions::new()
        .name("worker")
        .connect("nats://localhost:4222")
        .await?;

    let mut subscription = client.subscribe("jobs.>").await?;
    client.publish("jobs.email", "hello".into()).await?;

    if let Some(message) = subscription.next().await {
        println!("{:?}", message.payload);
    }
    Ok(())
}

fn main() {
    let _ = nats;
}
```

Request/reply uses `client.request(subject, payload).await`, which creates an
inbox and waits for a reply. JetStream consumers have durable names, ack
policies, replay policies and max deliver; use them for work queues that must
survive a restart. Subjects are hierarchical and case-sensitive; design them
like paths (`orders.created.eu`). Core NATS is at-most-once; JetStream is the
durable option.

## 10.14 ZeroMQ with the `zeromq` crate

ZeroMQ is a messaging library with sockets that carry patterns: request/reply,
publish/subscribe, push/pull and dealer/router. The pure-Rust `zeromq` crate
implements ZMTP without `libzmq`.

```rust
use zeromq::{Socket, SocketRecv, SocketSend, PubSocket, SubSocket};

async fn pattern() -> Result<(), Box<dyn std::error::Error>> {
    let mut publisher = PubSocket::new();
    publisher.bind("tcp://127.0.0.1:5555").await?;

    let mut subscriber = SubSocket::new();
    subscriber.connect("tcp://127.0.0.1:5555").await?;
    subscriber.subscribe("topic").await?;

    publisher.send("topic: hello".into()).await?;
    let message = subscriber.recv().await?;
    println!("{message:?}");
    Ok(())
}

fn main() {
    let _ = pattern;
}
```

ZeroMQ is a toolkit, not a broker: there is no central queue unless you add one.
Slow subscribers drop messages in pub/sub (high-water mark), and the socket
pattern defines the reliability. Use it for low-latency internal messaging where
you control both ends; prefer a broker when you need durability.

## 10.15 Peer-to-peer networking with `rust-libp2p`

libp2p provides transport encryption, multiplexing, peer identity, discovery,
Kademlia DHT, gossip (Gossipsub), and hole punching. Rust's `libp2p` is a
modular stack, heavy but capable.

```rust
use libp2p::{identity, Multiaddr, PeerId, SwarmBuilder};
use libp2p::swarm::NetworkBehaviour;

#[derive(NetworkBehaviour)]
struct Behaviour {
    ping: libp2p::ping::Behaviour,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let keypair = identity::Keypair::generate_ed25519();
    let peer_id = PeerId::from(keypair.public());
    println!("{peer_id}");

    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_tcp(
            libp2p::tcp::Config::default(),
            libp2p::noise::Config::new,
            libp2p::yamux::Config::default,
        )?
        .with_behaviour(|_key| Behaviour { ping: libp2p::ping::Behaviour::new(Default::default()) })?
        .build();

    let address: Multiaddr = "/ip4/0.0.0.0/tcp/0".parse()?;
    swarm.listen_on(address)?;
    println!("{:?}", swarm.local_peer_id());
    Ok(())
}
```

Peer identity is a keypair; the peer id is derived from the public key. Noise
encrypts transport, yamux multiplexes streams, and a behaviour composes
protocols. Gossipsub is the usual pub/sub layer for blockchains and decentralised
apps; Kademlia provides routing. Test with multiple local nodes and a NAT
simulator; real networks are hostile to hole punching.

## 10.16 Distributed systems patterns: Raft, CRDTs and gossip

- **Raft** elects a leader, replicates a log and applies commands in order. It
  gives linearisable operations for small clusters. Implementations: `raft`,
  `openraft`, `async-raft`. Use a library; do not write consensus for production
  without extensive testing.
- **CRDTs** merge state without coordination: counters, sets, maps and
  sequences. `automerge`, `yrs` (Yjs) and `crdts` implement them. They give
  eventual consistency for collaborative editing and offline-first apps.
- **Gossip** spreads membership and state probabilistically; `chitchat` (used by
  Quickwit) and `scuttlebutt`-style protocols are examples. It scales and
  tolerates churn but does not give strong consistency.

```rust
#[derive(Debug, Clone, Copy, Default)]
struct GCounter {
    counts: [u64; 3],
}

impl GCounter {
    fn increment(&mut self, replica: usize) {
        self.counts[replica] += 1;
    }

    fn merge(&mut self, other: &Self) {
        for (mine, theirs) in self.counts.iter_mut().zip(other.counts) {
            *mine = (*mine).max(theirs);
        }
    }

    fn value(&self) -> u64 {
        self.counts.iter().sum()
    }
}

fn main() {
    let mut a = GCounter::default();
    let mut b = GCounter::default();
    a.increment(0);
    a.increment(0);
    b.increment(1);
    a.merge(&b);
    b.merge(&a);
    assert_eq!(a.value(), b.value());
    println!("{}", a.value());
}
```

Every distributed design must choose a consistency model: strong (Raft),
eventual (CRDT), or causal. Say which one you chose and what happens during a
partition. Idempotency, deduplication and monotonic clocks are the practical
tools that make retries safe.

## 10.17 Service discovery: mDNS, Consul and etcd

Service discovery answers "where is a healthy instance of X?". Options:

- **Static configuration**: a file or DNS name with a load balancer. Simple,
  and often enough.
- **DNS SRV**: `_http._tcp.example.com` returns host and port with TTLs.
- **mDNS**: zero-configuration discovery on a local network; `mdns-sd` in Rust.
- **Consul**: health checks, key-value, DNS and HTTP APIs; `consulrs`/`consul-api`.
- **etcd**: a strongly consistent key-value store with leases and watch;
  `etcd-client`.

```rust
use etcd_client::Client;

async fn register() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = Client::connect(["http://127.0.0.1:2379"], None).await?;
    // Lease + put with the lease id gives automatic deregistration on crash.
    let lease = client.lease_grant(30, None).await?.id();
    client.put("/services/api/1", "10.0.0.5:8080", Some(etcd_client::PutOptions::new().with_lease(lease))).await?;
    let mut watcher = client.watch("/services/api/", None).await?;
    if let Some(response) = watcher.message().await? {
        println!("{} events", response.events().len());
    }
    Ok(())
}

fn main() {
    let _ = register;
}
```

Leases (TTL) are what make discovery self-healing: a crashed instance stops
renewing and disappears. Watches let clients react to changes. Do not put
discovery in the request path without caching; a discovery outage should not
take down every service.

## 10.18 Load balancing strategies

| Strategy | Behaviour | Use |
| --- | --- | --- |
| Round robin | rotate through instances | homogeneous, equal cost |
| Least connections | pick the least busy | variable request cost |
| Power of two choices | sample two, pick the less loaded | excellent at scale, no global state |
| Consistent hashing | same key to same instance | caches, sharding, sticky sessions |
| Random | uniform choice | simple, surprisingly good |
| Weighted | capacity-aware | heterogeneous instances |

```rust
fn pick_least_loaded(loads: &[u64]) -> usize {
    loads
        .iter()
        .enumerate()
        .min_by_key(|(_, load)| *load)
        .map(|(index, _)| index)
        .unwrap_or(0)
}

fn pick_power_of_two(loads: &[u64], first: usize, second: usize) -> usize {
    if loads[first] <= loads[second] { first } else { second }
}

fn main() {
    let loads = [4, 2, 9, 1];
    println!("{}", pick_least_loaded(&loads));
    println!("{}", pick_power_of_two(&loads, 0, 3));
}
```

Client-side balancing (`tower`'s `balance` layer) avoids an extra hop; server-
side balancing centralises policy. Health checks must reflect readiness, not
just liveness. Retry budgets prevent a failing instance from multiplying load;
combine balancing with circuit breaking.

## 10.19 Circuit breakers, retries and backoff with `tower`

A retry without a budget amplifies an outage. A circuit breaker stops calling a
failing dependency, fails fast and probes recovery. `tower` composes both.

```rust
use std::time::Duration;
use tower::ServiceBuilder;
use tower::retry::RetryLayer;
use tower::timeout::TimeoutLayer;
use tower_http::classify::ServerErrorsFailureClass;
use tower_http::retry::Retry;

fn layers<Service>(service: Service) -> impl tower::Service {
    ServiceBuilder::new()
        .layer(TimeoutLayer::new(Duration::from_secs(2)))
        .layer(RetryLayer::new(Retry::default()))
        .service(service)
}

fn main() {
    let _ = (layers::<()>, ServerErrorsFailureClass::StatusCode);
}
```

Retry only idempotent operations, or make the operation idempotent with a key.
Use exponential backoff with jitter; fixed retries create synchronised waves.
Cap attempts and total time, and retry only errors that can succeed on a retry
(connection reset, 503), not validation errors. `tower-resilience` and
`failsafe-rs` provide circuit-breaker state machines; a simple breaker counts
consecutive failures, opens for a cool-down, then half-opens with a limited
probe.

## 10.20 Connection pooling and keep-alive

Opening a connection costs a TCP handshake, TLS handshake and, for HTTP/2, a
settings exchange. Pool and reuse:

- HTTP clients pool by origin automatically (`reqwest`).
- Databases use a pool sized to the database's capacity ([chapter D4](#backend-development)).
- gRPC uses one HTTP/2 connection with multiplexed streams; a channel is the
  pool.
- Custom TCP protocols should keep connections open, with idle timeouts and a
  maximum age.

```rust
use reqwest::Client;
use std::time::Duration;

fn pooled_client() -> reqwest::Result<Client> {
    Client::builder()
        .pool_max_idle_per_host(32)
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_keepalive(Duration::from_secs(60))
        .build()
}
```

Keep-alive interacts with load balancers: an idle connection may be closed by a
NAT or a proxy without notifying the client, producing a spurious error on the
next request. Set an idle timeout shorter than the infrastructure's, or retry
once on a connection reset. `Connection: close` is a last resort.

## 10.21 Proxy and reverse proxy development

A forward proxy serves clients; a reverse proxy fronts servers, handling TLS,
routing, compression, caching, rate limits and authentication. In Rust, `hyper`
plus `tower` is enough to build one; `pingora` (Cloudflare) is a production
framework, and `sozu` is an existing proxy.

```rust
use hyper::{body::Incoming, Request, Response};
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;

type HttpClient = Client<hyper_util::client::legacy::connect::HttpConnector, Incoming>;

async fn forward(client: &HttpClient, mut request: Request<Incoming>) -> Result<Response<Incoming>, hyper::Error> {
    let path_and_query = request.uri().path_and_query().map(|value| value.as_str()).unwrap_or("/");
    let upstream = format!("http://127.0.0.1:9000{path_and_query}");
    *request.uri_mut() = upstream.parse().unwrap();

    // Hop-by-hop headers must not be forwarded.
    request.headers_mut().remove("connection");
    client.request(request).await
}

fn main() {
    let client: HttpClient = Client::builder(TokioExecutor::new()).build_http();
    let _ = (forward, client);
}
```

A reverse proxy must remove hop-by-hop headers, add `Forwarded`/`X-Forwarded-*`
deliberately, enforce body and header limits, and avoid request smuggling by
rejecting ambiguous `Content-Length`/`Transfer-Encoding` combinations. WebSocket
and HTTP/2 upgrades need explicit handling. Set upstream timeouts and circuit
breakers; a proxy without them turns a slow backend into a global outage.

## 10.22 Custom binary protocols and `nom`

A binary protocol needs a magic number, version, message type, length, payload,
checksum and a maximum size. `nom` provides parser combinators over bytes;
`bytes` provides efficient buffer types; `binrw` generates read/write code from
attributes.

```rust
use nom::{
    number::complete::{be_u16, be_u32, be_u8},
    IResult,
};

#[derive(Debug, PartialEq)]
struct Frame<'a> {
    version: u8,
    kind: u8,
    payload: &'a [u8],
}

fn frame(input: &[u8]) -> IResult<&[u8], Frame<'_>> {
    let (input, magic) = nom::bytes::complete::tag(b"RFZ1")(input)?;
    debug_assert_eq!(magic, b"RFZ1");
    let (input, version) = be_u8(input)?;
    let (input, kind) = be_u8(input)?;
    let (input, length) = be_u16(input)?;
    if length > 4096 {
        return Err(nom::Err::Failure(nom::error::Error::new(input, nom::error::ErrorKind::TooLarge)));
    }
    let (input, payload) = nom::bytes::complete::take(length)(input)?;
    let (input, _checksum) = be_u32(input)?;
    Ok((input, Frame { version, kind, payload }))
}

fn main() {
    let bytes = b"RFZ1\x01\x02\x00\x03abc\x00\x00\x00\x00";
    println!("{:?}", frame(bytes));
}
```

Design rules: fixed endianness, explicit lengths, a version field, a checksum
(CRC32 or a hash), and a parser that never trusts a length. Fuzz the parser
([chapter D6](#security-engineering)) and enforce limits before allocating. `nom` errors are composable;
map them to protocol errors with the offset. For performance, parse zero-copy
slices and avoid allocating until the frame is validated.

## Exercises

:::exercise guided A length-prefixed echo server
Write a Tokio server that accepts frames of the form `u32` big-endian length
followed by UTF-8 bytes, rejects frames over 1 MiB, echoes them back with the
same framing, and handles a client that disconnects mid-frame without panicking.
Add a test that sends two frames in one write and verifies both are echoed.
::hint
Use `read_exact` for the length and payload. Check the length before allocating;
return an error for 0 or over 1 MiB. `read_exact` returns `UnexpectedEof` on a
partial frame, which should end the connection cleanly. For the test, bind port
0, get the local address and connect.
::solution
```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

const MAX: usize = 1024 * 1024;

async fn serve_one(mut socket: TcpStream) -> std::io::Result<()> {
    loop {
        let mut length = [0_u8; 4];
        match socket.read_exact(&mut length).await {
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(()),
            Err(error) => return Err(error),
        }
        let size = u32::from_be_bytes(length) as usize;
        if size == 0 || size > MAX {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "bad length"));
        }
        let mut payload = vec![0_u8; size];
        socket.read_exact(&mut payload).await?;
        socket.write_all(&(payload.len() as u32).to_be_bytes()).await?;
        socket.write_all(&payload).await?;
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    println!("{}", listener.local_addr()?);
    loop {
        let (socket, _) = listener.accept().await?;
        tokio::spawn(async move {
            let _ = serve_one(socket).await;
        });
    }
}
```
:::

:::exercise practice Retry with backoff and a budget
Implement an async `retry` function that runs a fallible operation up to `n`
times with exponential backoff and full jitter, times out the whole operation,
and stops retrying on a non-retryable error. Test it with a counter that fails
twice then succeeds, and a counter that always fails.
::hint
Use `tokio::time::timeout` around the loop. Compute the delay as
`base * 2^attempt`, then multiply by a random factor in `[0, 1]` (full jitter).
Represent retryability as a predicate `fn(&E) -> bool` or a custom error enum.
::solution
```rust
use rand::Rng;
use std::future::Future;
use std::time::Duration;
use tokio::time::{sleep, timeout};

#[derive(Debug)]
enum CallError {
    Transient(u32),
    Permanent,
}

impl CallError {
    fn retryable(&self) -> bool {
        matches!(self, CallError::Transient(_))
    }
}

async fn retry<F, Fut, T>(mut operation: F, attempts: u32, budget: Duration) -> Result<T, CallError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<T, CallError>>,
{
    let work = async {
        let mut last = CallError::Permanent;
        for attempt in 0..attempts {
            match operation().await {
                Ok(value) => return Ok(value),
                Err(error) => {
                    if !error.retryable() {
                        return Err(error);
                    }
                    last = error;
                    let cap = 100_u64.saturating_mul(1 << attempt.min(6));
                    let jitter = rand::rng().random_range(0..=cap);
                    sleep(Duration::from_millis(jitter)).await;
                }
            }
        }
        Err(last)
    };
    timeout(budget, work).await.unwrap_or(Err(CallError::Permanent))
}

#[tokio::main]
async fn main() {
    let mut count = 0;
    let result = retry(
        || {
            count += 1;
            let attempt = count;
            async move {
                if attempt < 3 { Err(CallError::Transient(attempt)) } else { Ok(attempt) }
            }
        },
        5,
        Duration::from_secs(2),
    )
    .await;
    println!("{result:?}");
}
```
:::

:::exercise challenge A frame protocol with `nom` and a client
Extend the frame parser in section 10.22 to include a CRC32 checksum and a
request/reply client that sends three frames over TCP, reads replies, validates
the checksum and reports a clear error on a bad frame. Fuzz the parser with
`cargo-fuzz` for 60 seconds and fix any panic you find.
::hint
Compute CRC32 over the payload with the `crc32fast` crate and compare it to the
trailing `u32`. Set `length` limits before `take`. For the client, reuse the
length-prefixed echo server shape, but write the magic, version, kind, length,
payload and checksum. A bad checksum is a protocol error, not a panic.
::solution
```rust
use crc32fast::Hasher;

fn encode(kind: u8, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(12 + payload.len());
    frame.extend_from_slice(b"RFZ1");
    frame.push(1);
    frame.push(kind);
    frame.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    frame.extend_from_slice(payload);
    let mut hasher = Hasher::new();
    hasher.update(payload);
    frame.extend_from_slice(&hasher.finalize().to_be_bytes());
    frame
}

#[derive(Debug)]
enum FrameError {
    BadMagic,
    TooLarge,
    Truncated,
    BadChecksum,
}

fn decode(input: &[u8]) -> Result<(u8, &[u8]), FrameError> {
    if input.len() < 12 {
        return Err(FrameError::Truncated);
    }
    if &input[..4] != b"RFZ1" {
        return Err(FrameError::BadMagic);
    }
    let kind = input[5];
    let length = u16::from_be_bytes([input[6], input[7]]) as usize;
    if length > 4096 {
        return Err(FrameError::TooLarge);
    }
    let end = 8 + length;
    if input.len() < end + 4 {
        return Err(FrameError::Truncated);
    }
    let payload = &input[8..end];
    let checksum = u32::from_be_bytes([input[end], input[end + 1], input[end + 2], input[end + 3]]);
    let mut hasher = Hasher::new();
    hasher.update(payload);
    if hasher.finalize() != checksum {
        return Err(FrameError::BadChecksum);
    }
    Ok((kind, payload))
}

fn main() {
    let frame = encode(2, b"hello");
    println!("{:?}", decode(&frame));
    let mut bad = frame.clone();
    bad[9] ^= 0xff;
    println!("{:?}", decode(&bad));
}
```

The parser rejects a bad length before slicing, so a fuzzer cannot make it
allocate or panic. Run the fuzz target with the real frame bytes as a seed
corpus; a checksum failure should be returned, not asserted.
:::

## Quiz

:::quiz Networking check
? Why does a TCP application need its own framing?
- TCP preserves message boundaries
+ TCP is a byte stream, so reads may return partial or coalesced messages
- TLS adds framing
- Because UDP is unreliable
= TCP guarantees ordered bytes, not messages. A length prefix or delimiter is required to recover message boundaries.

? What is the main advantage of QUIC over TCP+TLS?
- It is always faster on every network
+ Independent streams avoid head-of-line blocking and the handshake includes TLS, with connection migration
- It does not need congestion control
- It works without IP
= QUIC multiplexes streams over UDP, integrates TLS 1.3 and survives address changes. The costs are UDP blocking and higher CPU use.

? When should a retry be avoided?
- When the error is a connection reset
+ When the operation is not idempotent and the server may have applied it
- When the server returns 503
- When using HTTP/2
= Retrying a non-idempotent operation can duplicate a side effect. Use an idempotency key or retry only operations that are safe to repeat.

? What does a durable JetStream consumer add over core NATS?
- Lower latency
+ Persistence, acknowledgements, replay and consumer groups
- Encryption
- Automatic TLS
= Core NATS is at-most-once and does not store messages. JetStream persists streams and tracks consumer acknowledgements for at-least-once delivery.

? Why must a proxy strip hop-by-hop headers?
- To reduce message size
+ Because they apply only to a single connection and forwarding them can cause smuggling or incorrect framing
- Because they are encrypted
- Because HTTP/2 forbids all headers
= Headers such as `Connection`, `Transfer-Encoding` and `Keep-Alive` describe one hop. Forwarding them lets two parsers disagree about message boundaries.
:::

:::recap
- TCP is a framed byte stream; UDP is independent datagrams; both are available in `std` and Tokio.
- `reqwest` and `ureq` wrap HTTP; `hyper` exposes the protocol for servers and proxies.
- TLS with `rustls` provides confidentiality and authentication; never disable verification.
- DNS is a TTL cache; respect it and plan failover. `hickory-resolver` gives control.
- WebSockets need handshake authentication, ping/pong and message limits.
- QUIC gives multiplexed streams over UDP with TLS and migration.
- gRPC adds typed streaming and interceptors on top of HTTP/2 and protobuf.
- MessagePack, FlatBuffers, Cap'n Proto and Avro trade schema, zero-copy and size differently.
- MQTT, AMQP, NATS and ZeroMQ have different delivery and routing semantics; design for duplicates.
- libp2p supplies identity, encryption, discovery and gossip for P2P.
- Raft gives strong consistency, CRDTs eventual consistency, gossip scalability.
- Discovery needs leases and watches; load balancing needs health and retry budgets.
- Circuit breakers and jittered backoff prevent retry storms; pooling avoids handshake cost.
- Proxies must handle hop-by-hop headers, limits and upgrades correctly.
- Custom protocols need versioning, length limits, checksums and fuzzed parsers.
:::
