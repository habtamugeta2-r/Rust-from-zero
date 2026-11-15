@id network-layers-ethernet-ip
@part p10
@kind chapter
@title Network Layers, Ethernet Frames, ARP, IP Routing & NAT
@short Network layers, frames & IP
@level intermediate
@time 35
@learn Trace packet encapsulation across Link (Ethernet/MAC), Network (IPv4/IPv6), Transport (TCP/UDP), and Application layers | Understand ARP address resolution, subnet masks (CIDR /24), default gateways, and NAT | Parse and construct Ethernet/IPv4 header bytes cleanly in Rust using big-endian network byte order | Contrast local LAN delivery (MAC hop-by-hop) vs global Internet routing (IP end-to-end)

Writing application bytes to a TCP socket hands them to the operating system's networking stack. TCP provides an ordered byte stream; IP routes packets between networks; and a link layer such as Ethernet carries each packet over a local connection. The layers add their own headers and work together, though packet boundaries do not correspond one-for-one with application writes. The TCP and UDP transport details are in [TCP, UDP and kernel sockets](#tcp-udp-sockets-kernel).

Understanding those layers demystifies IP addresses, ports, localhost (`127.0.0.1`), subnets (`192.168.1.0/24`), NAT routers, and why network protocols always speak **big-endian** bytes. Bytes on the wire are memory in transit: [memory layout](#memory-layout) explains how a `u32` is stored, and [bits, bytes and representation](#bits-bytes-representation) covers the endianness rules behind the headers.

:::plain Encapsulation, MTU, and NAT in one paragraph
**Encapsulation** is each layer putting its own header in front of the data the layer above handed it, so one HTTP request becomes TCP payload, then IP payload, then Ethernet payload. The **MTU** (Maximum Transmission Unit) is the largest IP packet a link will carry — `1,500` bytes on Ethernet — so anything bigger is split and reassembled, and the usable TCP payload (the **MSS**) is smaller by the header sizes. **NAT** is a router rewriting source IP and port on the way out and reversing the mapping on the way back, which is how an entire home shares one public IPv4 address. All three ideas exist because addresses identify *locations*, not machines, and every link along the path has different limits.
:::

:::analogy Mailing a letter inside nested envelopes
Think of the **IP header** as the outer street address (`From: Addis Ababa -> To: Tokyo`) that never changes across the whole international journey, while the **Ethernet MAC header** is the local courier sticker swapped at every single sorting hub along the route (`Your laptop -> Wi-Fi router -> ISP fiber switch -> Undersea gateway -> Tokyo server`).
:::

:::compare The 4-Layer TCP/IP Stack
| Layer | Unit of data | Addressing used | Core job |
|---|---|---|---|
| **4. Application** | Stream / HTTP message / JSON | URLs, DNS names (`example.com`) | What your app means (`HTTP`, `TLS`, `DNS`, `PostgreSQL`) |
| **3. Transport** | Segment (TCP) / Datagram (UDP) | **16-bit Port** (`443`, `5432`) | End-to-end multiplexing, ordering, reliability, congestion (`TCP`/`UDP`) |
| **2. Internet / Network** | **Packet** | **IPv4 (32-bit)** / **IPv6 (128-bit)** | Hop-by-hop routing across different networks (`IP`, `ICMP`, `NAT`) |
| **1. Link & Physical** | **Frame** | **48-bit MAC** (`aa:bb:cc:dd:ee:ff`) | Local wire / Wi-Fi hop delivery + **CRC32** error detection |
:::

The seven-layer **OSI** model is the teaching model you will see in every textbook; the four-layer **TCP/IP** model above is what the kernel actually implements, and the mapping is many-to-one:

| OSI layer | TCP/IP layer | In Linux | Lives in |
|---|---|---|---|
| 7 Application | Application | `HTTP`, `TLS`, `DNS`, `SMTP`, `ssh` | user space (your Rust program, `hyper`, `rustls`) |
| 6 Presentation | Application | Serde/JSON, UTF-8, TLS record encryption | user space |
| 5 Session | Application | TLS session resumption, cookie sessions | user space |
| 4 Transport | Transport | TCP, UDP, QUIC, SCTP | kernel (`net/ipv4/tcp.c`, `net/ipv4/udp.c`) |
| 3 Network | Internet | IPv4, IPv6, ICMP, IPsec, NAT | kernel (`net/ipv4/`, `net/ipv6/`) |
| 2 Data link | Link | Ethernet, Wi-Fi (802.11), ARP, VLAN, PPP | kernel driver + NIC firmware |
| 1 Physical | Link | copper, fibre, radio; 1000BASE-T line coding | PHY chip / cable |

Layers 5 and 6 never existed as separate code in the Internet stack — TLS folded session and presentation into one library, and JSON folded presentation into the application. That collapse is why the four-layer model describes the system you can actually inspect with `ss`, `tcpdump` and `strace`, while the seven-layer model still gives you the vocabulary to say *"is this a layer-3 or a layer-7 problem?"*.

## IPv4 vs IPv6: same job, different header

Both are layer 3, both are routed hop by hop, and they coexist on every modern host. The differences are worth knowing because they change what your Rust code must handle:

| | **IPv4** | **IPv6** |
|---|---|---|
| Address size | 32 bits, `192.168.1.42` | 128 bits, `2001:db8::1` (written in hex groups, `::` collapses zeros) |
| Address supply | ~4.3 billion, exhausted; needs [[NAT]] | `2^128`, effectively unlimited; NAT is optional |
| Header | `20` bytes minimum, variable up to `60` with options; `IHL` field says how long | fixed `40` bytes, options moved to extension headers chained by `next header` |
| Header checksum | yes, recomputed at every router | **none** — the link and transport layers already checksum, so routers touch fewer bytes |
| Fragmentation | routers may fragment; the destination reassembles | routers **never** fragment; the source must use Path MTU Discovery (ICMPv6 "packet too big") |
| Local address resolution | **[[ARP]]** broadcast (`ff:ff:ff:ff:ff:ff`) | **NDP** (Neighbour Discovery) over ICMPv6 multicast |
| Address configuration | DHCP, or manual | stateless autoconfiguration (SLAAC) from a router advertisement, or DHCPv6 |
| Loopback | `127.0.0.1` | `::1` |
| Rust type | `std::net::Ipv4Addr` | `std::net::Ipv6Addr` |
| Socket call | `AF_INET` | `AF_INET6` (dual-stack sockets accept IPv4-mapped `::ffff:192.168.1.42`) |

:::plain Why the IPv6 header dropped the checksum
Every router used to recompute the IPv4 header checksum because the TTL field changes on every hop. That is wasted work: TCP and UDP carry a checksum over a pseudo-header that already covers the IP addresses, and Ethernet/Wi-Fi carry a CRC32 over the frame. IPv6 therefore has no header checksum at all, and routers forward a packet by decrementing `Hop Limit` and nothing else. It is the same reasoning as replacing a `Vec<u8>` copy with a borrowed slice: do the work once, where the data is already hot, instead of at every stop along the way.
:::

## Encapsulation & MTU (`1,500` bytes)

When your Rust server calls `stream.write(b"GET / HTTP/1.1\r\n")`, bytes travel **down** the stack inside the kernel, prepending headers at each layer (and appending an Ethernet FCS CRC32 trailer on the wire):

:::note Packet encapsulation from Rust write() to Ethernet wire
```text
┌───────────────────┬───────────────┬──────────────┬───────────────────────────┬──────────┐
│ Ethernet Hdr (14B)│ IPv4 Hdr (20B)│ TCP Hdr (20B)│ App Payload ("GET / ...") │ FCS (4B) │
│ Dst/Src MAC, Type │ Src/Dst IP    │ Src/Dst Port │                           │ CRC32    │
└───────────────────┴───────────────┴──────────────┴───────────────────────────┴──────────┘
                      ◄─────────── Standard Ethernet MTU = 1,500 bytes ──────────►
                                       (Max TCP MSS ≈ 1,460 bytes!)
```
:::

Notice the **[[MTU]] = `1,500` bytes**: standard Ethernet limits the payload inside an Ethernet frame to 1,500 bytes. Subtract 20 bytes for IPv4 + 20 bytes for TCP (more with TCP timestamp options), and each TCP segment normally holds up to **`MSS = 1,460` bytes** of your application data—larger buffers get sliced across multiple packets automatically by the kernel (or hardware TCP Segmentation Offload / **TSO** on the NIC!).

Check the MTU of an interface yourself, and note that `lo` (loopback) is far larger — there is no wire to fit inside:

```sh
$ ip link show wlan0 | head -1
2: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DORMANT
$ ip link show lo | head -1
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT
```

## How your laptop knows where to send a packet: CIDR, Gateway & ARP

Suppose your laptop (`192.168.1.42/24`, mask `255.255.255.0`) wants to reach two destinations:
1. **`192.168.1.10` (local printer on the same Wi-Fi/LAN):** Masking `192.168.1.42 & 255.255.255.0 == 192.168.1.10 & 255.255.255.0` -> same `/24` subnet! Your OS broadcasts an **ARP** (*Address Resolution Protocol*) request across the LAN: *"Who has `192.168.1.10`? Tell `192.168.1.42`!"* The printer replies with its 48-bit **MAC address**, cached in the kernel ARP table (`ip neigh`).
2. **`93.184.216.34` (a server across the Internet):** Subnet bits do not match `/24`! So the kernel leaves Destination IP = `93.184.216.34`, sets **Destination MAC = your default gateway router (`192.168.1.1`)**, and hands the packet to the router. Every router along the Internet inspects the Destination IP, picks the longest-prefix match from its routing table, swaps *only* the Ethernet MAC header for the next hop, decrements IP **TTL** (Time-To-Live—preventing infinite routing loops!), and forwards it onward!

## Network Byte Order (Big-Endian) & Parsing Real Headers in Rust

Remember Part I when we noted x86-64 and ARM64 store `0x1234` in RAM little-endian (`[0x34, 0x12]`)? On the wire, **TCP/IP network protocols are universally Big-Endian** (`[0x12, 0x34]`, matching natural human left-to-right byte order)! Calling `u16::from_be_bytes` / `u16::to_be_bytes` converts wire bytes cleanly with zero platform ambiguity (compiling to a single `bswap` / `rev16` instruction!):

```rust run
use std::net::Ipv4Addr;

#[derive(Debug)]
struct Ipv4Header {
    version: u8,
    ihl_bytes: usize,
    ttl: u8,
    protocol: u8,
    total_len: u16,
    src: Ipv4Addr,
    dst: Ipv4Addr,
}

fn parse_ipv4(pkt: &[u8]) -> Option<Ipv4Header> {
    if pkt.len() < 20 {
        return None;
    }
    let ver_ihl = pkt[0];
    let version = ver_ihl >> 4;
    let ihl_bytes = ((ver_ihl & 0x0f) as usize) * 4;
    if version != 4 || ihl_bytes < 20 || pkt.len() < ihl_bytes {
        return None;
    }
    Some(Ipv4Header {
        version,
        ihl_bytes,
        total_len: u16::from_be_bytes([pkt[2], pkt[3]]),
        ttl: pkt[8],
        protocol: pkt[9], // 6 = TCP, 17 = UDP, 1 = ICMP
        src: Ipv4Addr::new(pkt[12], pkt[13], pkt[14], pkt[15]),
        dst: Ipv4Addr::new(pkt[16], pkt[17], pkt[18], pkt[19]),
    })
}

fn main() {
    // 20-byte IPv4 TCP packet header (192.168.1.42 -> 93.184.216.34, len=60, TTL=64, proto=6 TCP)
    let raw_pkt: [u8; 20] = [
        0x45, 0x00, 0x00, 0x3c, // Version=4, IHL=5 (20B), DSCP=0, TotalLen=60
        0x1c, 0x46, 0x40, 0x00, // ID, Flags=DF, FragOffset=0
        0x40, 0x06, 0x00, 0x00, // TTL=64, Protocol=6 (TCP), Checksum placeholder
        192, 168, 1, 42,        // Src IP
        93, 184, 216, 34,       // Dst IP
    ];
    let hdr = parse_ipv4(&raw_pkt).unwrap();
    println!("v{}, hdr={}B, len={}, ttl={}, proto={}, {} -> {}",
        hdr.version, hdr.ihl_bytes, hdr.total_len, hdr.ttl, hdr.protocol, hdr.src, hdr.dst);
}
```
```output
v4, hdr=20B, len=60, ttl=64, proto=6, 192.168.1.42 -> 93.184.216.34
```

## `localhost` (`127.0.0.1` / `::1`) & NAT (`Network Address Translation`)

- **Loopback (`127.0.0.1` / `::1`):** Traffic sent to `127.0.0.1` never touches an Ethernet cable or Wi-Fi radio—the Linux kernel routes the buffer directly inside its `lo` software loopback interface (even supporting jumbo `65,536`-byte loopback MTUs!).
- **NAT & Private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`):** Because 4.3 billion IPv4 addresses ran short long ago, homes and offices share one public IP via **[[NAT]]**: your router rewrites `(192.168.1.42 : 51422)` on outgoing packets to `(public_ip : 40001)`, records the mapping in a NAT table, and rewrites incoming replies back! Meanwhile **IPv6 (`128`-bit, `2^128` addresses)** gives every device globally routable addresses natively without needing NAT hacks.

Both address families are first-class in `std::net`, and the same `SocketAddr` enum covers them. This program parses both, walks the bytes, and applies a subnet mask without any crate:

```rust run
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

fn main() {
    // Parse from text exactly as a config file or a URL hands it to you.
    let v4: Ipv4Addr = "192.168.1.42".parse().unwrap();
    let v6: Ipv6Addr = "2001:db8::1".parse().unwrap();

    // 4 bytes vs 16 bytes: that difference is the whole address-space story.
    println!("v4 has {} bytes: {:?}", v4.octets().len(), v4.octets());
    println!("v6 has {} bytes: {:?}", v6.octets().len(), v6.octets());

    // A /24 mask is 24 one-bits, so "is this local?" is one AND.
    let mask = u32::from_be_bytes([255, 255, 255, 0]);
    let me = u32::from_be_bytes(v4.octets());
    for peer in ["192.168.1.10", "93.184.216.34"] {
        let peer: Ipv4Addr = peer.parse().unwrap();
        let local = (me & mask) == (u32::from_be_bytes(peer.octets()) & mask);
        println!("{peer}: local = {local}");
    }

    // An IPv4 address inside IPv6: 0xffff in group 6, then the four IPv4 bytes.
    let mapped = Ipv6Addr::new(0, 0, 0, 0, 0, 0xffff, 0xc0a8, 0x012a);
    println!("192.168.1.42 as v6 = {mapped}");
    println!("unwrapped again = {:?}", mapped.to_ipv4_mapped());

    // A dual-stack listener binds an IpAddr, so one socket serves both families.
    let any: IpAddr = IpAddr::V6(Ipv6Addr::UNSPECIFIED);
    println!("bind address = {any}");
}
```
```output
v4 has 4 bytes: [192, 168, 1, 42]
v6 has 16 bytes: [32, 1, 13, 184, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
192.168.1.10: local = true
93.184.216.34: local = false
192.168.1.42 as v6 = ::ffff:192.168.1.42
unwrapped again = Some(192.168.1.42)
bind address = ::
```

The `::ffff:192.168.1.42` form is why a single dual-stack listener on `[::]:8080` also accepts IPv4 clients: the kernel maps the IPv4 peer into an IPv6 address, and `to_ipv4_mapped()` unwraps it. One socket, both protocols, no duplicated code.

:::details Wire parsing in production: `etherparse`, `smoltcp`, and zero-copy slices
Notice how `parse_ipv4(&[u8])` borrowed `&[u8]` without allocating a single `Vec` or `String`! High-speed Rust packet tools (`smoltcp` for embedded TCP/IP, `etherparse`, and eBPF packet filters) parse multi-gigabit packet streams entirely via zero-copy slice borrowing and `from_be_bytes`!
:::

:::exercise guided CIDR subnet matching by hand
Given a host IP `10.20.4.18` with subnet mask `/22` (`255.255.252.0`), determine whether each destination is on the **same local subnet** (uses ARP directly) or routed through the **default gateway**:
1. `10.20.7.99`
2. `10.20.8.5`
::hint
`/22` means the top 22 bits match (`10.20` = 16 bits, plus the top 6 bits of the 3rd octet -> block size `4`: `0..=3`, `4..=7`, `8..=11`, ...!).
::solution
Masking the 3rd octet with `252` (`0xfc`): `4 & 252 = 4`, so subnet `10.20.4.0/22` spans `10.20.4.0` through `10.20.7.255`!
1. `10.20.7.99`: `7 & 252 = 4` -> **Same local subnet!** Uses ARP directly.
2. `10.20.8.5`: `8 & 252 = 8` -> **Different subnet!** Sent to default gateway router's MAC address.
:::

:::exercise practice Decoding network byte order into `u16` ports
A captured TCP header begins with bytes `[0xd4, 0x31, 0x01, 0xbb]` (2-byte source port, 2-byte destination port). Decode both port numbers in Rust and identify the destination service!
::hint
Use `u16::from_be_bytes` on `[0xd4, 0x31]` and `[0x01, 0xbb]`.
::solution
```rust run
fn main() {
    let tcp_ports = [0xd4, 0x31, 0x01, 0xbb];
    let src_port = u16::from_be_bytes([tcp_ports[0], tcp_ports[1]]);
    let dst_port = u16::from_be_bytes([tcp_ports[2], tcp_ports[3]]);
    println!("src={src_port}, dst={dst_port}");
}
```
```output
src=54321, dst=443
```
Port `443` is HTTPS!
:::

:::exercise challenge Why does IPv4's TTL (`Time To Live`) save the Internet from routing loops?
Suppose Router A thinks `93.184.216.34` lives via Router B, while a misconfiguration makes Router B forward it back to Router A. Trace what happens to the packet instead of spinning between A and B until the end of time.
::hint
Remember every router decrements the 8-bit `TTL` byte (`raw_pkt[8]`) by `1`!
::solution
Every router hop decrements the packet's `TTL` (starting at e.g. `64`) by `1` and recalculates the IP header checksum. Within 64 hops (`< 1` millisecond), `TTL` hits `0`, the router drops the packet, and sends back an **`ICMP Time Exceeded`** error message—which is also the exact clever trick `traceroute` uses by intentionally sending probes with `TTL = 1, 2, 3...` to discover every router hop along a path!
:::

:::recap
- Network traffic wraps down four layers (**Application -> Transport -> IP -> Link/Ethernet**), stripping and reading one header per layer at the receiver.
- **IP addresses** identify logical end-to-end hosts across networks; **MAC addresses** identify single local Link hops via **ARP** and change at every router hop.
- **CIDR masks** determine local-subnet ARP vs default-gateway routing; **NAT** shares public IPv4 addresses across private LANs (`192.168.x.x`, `10.x.x.x`).
- Wire protocols use **big-endian** byte order (`from_be_bytes` / `to_be_bytes` in Rust).
:::

:::quiz Check your understanding
? As an HTTP packet travels across 12 routers from your laptop to a remote server, which header address changes at *every* router hop, and which stays unchanged (aside from NAT)?
- IP changes every hop; Ethernet MAC stays unchanged
+ Ethernet destination/source MAC changes at every hop; Destination IP remains the remote server
- TCP destination port changes at every hop
- Neither changes anywhere
= MAC addresses operate hop-by-hop across each local link, whereas IP carries end-to-end routing addresses.

? How does your operating system translate a local LAN IP like `192.168.1.1` into the 48-bit MAC address needed to build an Ethernet frame?
- By querying DNS over UDP port 53
+ Using **ARP** (Address Resolution Protocol) broadcast on the local LAN (or Neighbour Discovery on IPv6)
- Reading `/etc/hosts`
- Guessing from the last 6 bytes of IPv4
= ARP asks the local LAN "who owns IP X?" and caches the replying MAC address in the kernel neighbour table.

? Why does `u16::from_be_bytes` matter when parsing IPv4/TCP packets on an x86-64 Linux server?
- x86-64 cannot read unaligned bytes
+ x86-64 is little-endian in RAM, whereas TCP/IP headers on the wire are universally big-endian ("network byte order")
- IPv4 uses 32-bit floats
- `from_be_bytes` decrypts TLS headers
= Network protocols standardise on big-endian byte order, so little-endian CPUs swap byte order cleanly with `from_be_bytes` / `to_be_bytes`.

? Why is standard TCP payload capacity (`MSS`) typically ~1,460 bytes instead of 65,535 bytes on the public Internet?
- Rust `TcpStream` buffers only 1,460 bytes
+ Standard Ethernet **MTU** is `1,500` bytes minus `20`B IPv4 and `20`B TCP headers = `1,460` bytes
- Linux pipes cap packets at 1,460 bytes
- Routers drop odd-sized payloads
= Fitting cleanly inside the 1,500-byte Ethernet MTU prevents expensive IP fragmentation across routers.
:::
