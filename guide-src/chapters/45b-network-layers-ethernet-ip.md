@id network-layers-ethernet-ip
@part p10
@kind chapter
@title Network Layers, Ethernet Frames, ARP, IP Routing & NAT
@short Network layers, frames & IP
@level intermediate
@time 35
@learn Trace packet encapsulation across Link (Ethernet/MAC), Network (IPv4/IPv6), Transport (TCP/UDP), and Application layers | Understand ARP address resolution, subnet masks (CIDR /24), default gateways, and NAT | Parse and construct Ethernet/IPv4 header bytes cleanly in Rust using big-endian network byte order | Contrast local LAN delivery (MAC hop-by-hop) vs global Internet routing (IP end-to-end)

Before a single byte of an HTTP request leaves your Rust `TcpStream`, the Linux kernel and your network interface card (NIC) wrap it like nested Russian dolls: application text -> TCP header -> IP header -> Ethernet frame -> electrical signals or Wi-Fi radio waves.

Understanding those layers demystifies IP addresses, ports, localhost (`127.0.0.1`), subnets (`192.168.1.0/24`), NAT routers, and why network protocols always speak **big-endian** bytes.

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

Notice **`MTU = 1,500` bytes**: standard Ethernet limits the payload inside an Ethernet frame to 1,500 bytes. Subtract 20 bytes for IPv4 + 20 bytes for TCP (more with TCP timestamp options), and each TCP segment normally holds up to **`MSS = 1,460` bytes** of your application data—larger buffers get sliced across multiple packets automatically by the kernel (or hardware TCP Segmentation Offload / **TSO** on the NIC!).

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
- **NAT & Private IP ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`):** Because 4.3 billion IPv4 addresses ran short long ago, homes and offices share one public IP via **NAT**: your router rewrites `(192.168.1.42 : 51422)` on outgoing packets to `(public_ip : 40001)`, records the mapping in a NAT table, and rewrites incoming replies back! Meanwhile **IPv6 (`128`-bit, `2^128` addresses)** gives every device globally routable addresses natively without needing NAT hacks.

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
