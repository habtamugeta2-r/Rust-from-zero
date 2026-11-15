@id linux-systems-lab
@part p12
@kind project
@title Linux Systems Lab: Process & Runtime Inspector
@short Linux systems inspector lab
@level intermediate
@time 45
@learn Combine Parts I-XI systems concepts into a working Linux /proc & syscall diagnostic tool in Rust | Parse ELF headers, /proc/self/maps segments, /proc/self/status kernel metrics, /proc/net/tcp sockets and FD tables from scratch | Count every heap allocation with a global allocator and inspect the same program with readelf, strace, perf, gdb and Valgrind | Verify systems invariants (alignment, page masks, endianness, RAII cleanup) with deterministic unit tests

Look at how far you have come: in Part I you learned bits, endianness, and CPUs; in Part II you opened ELF binaries and disassembly; in Parts IV–VIII you mapped virtual memory, allocators, `syscall`, threads, `epoll`, and hardware caches; and in Parts X–XI you traced packets, sockets, blocks, and file systems.

In this hands-on systems lab, you put those concepts together into a practical **Linux Process & Binary Inspector** written in pure safe Rust (`std` only—zero external crates!). It parses real ELF64 headers by hand, reads Linux `/proc/self/maps` VMAs, inspects `/proc/self/status` memory and context-switch counters, and verifies every parser cleanly with deterministic tests.

:::analogy Building your own X-ray scope
Tools like `readelf`, `pmap`, and `htop` are not black magic written in secret kernel languages—they are ordinary user-space programs opening `/proc` virtual files and binary headers, parsing little-endian integers and ASCII tables, and formatting insights cleanly. Writing a compact inspector yourself locks every layer of this curriculum into muscle memory!
:::

:::compare Ad-hoc print debugging vs Systematic `/proc` + ELF inspection
| Question | Guesswork | Direct Systems Inspection |
|---|---|---|
| "Is my binary PIE / x86-64 / ARM64?" | Guess from Cargo target | Read bytes `0..20` of the **ELF64 header** (`e_type`, `e_machine`) directly! |
| "Where do `.text`, `[heap]`, `[stack]` live?" | Assume fixed addresses | Parse **`/proc/self/maps`** (`r-xp`, `rw-p`, ASLR ranges, page counts)! |
| "Are threads wasting CPU context switching?" | Stare at CPU % | Read `voluntary_ctxt_switches` & `VmRSS` straight from **`/proc/self/status`**! |
| "Did my server leak file descriptors?" | Wait for `EMFILE` crash | Count entries inside **`/proc/self/fd`**! |
:::

## Architecture of our `sysinspect` Tool

We structure our systems lab cleanly as three small, focused modules that compose together cleanly:

:::note Modules of the Linux Systems Inspector Lab
```text
  src/
   ├── elf_probe.rs     Zero-copy parser for ELF64 magic, class, endianness, type, machine ISA
   ├── proc_maps.rs     Parser for /proc/<pid>/maps VMAs + page/permission summary
   ├── proc_status.rs   Parser for /proc/<pid>/status (Pid, VmRSS, Threads, context switches)
   └── main.rs          Combines live self-inspection + ELF probe + clean summary output
```
:::

Notice how cleanly every part connects directly to chapters you just finished:
- `elf_probe` uses exact byte offsets from **[Chapter 7](#linking-elf)** and `from_le_bytes` / `from_be_bytes` from **[Chapter 3](#bits-bytes-representation)**.
- `proc_maps` parses the exact `r--p` / `r-xp` / `rw-p` virtual memory areas and `4 KiB` page counts from **[Chapter 41](#virtual-memory-address-spaces)**.
- `proc_status` reads the exact `task_struct` metrics from **[Chapters 47 & 48](#kernel-syscalls-processes)** (`kernel-syscalls-processes` and [`processes-threads-scheduling`](#processes-threads-scheduling)).

## Step 1: Zero-Copy ELF64 Header Inspector

Remember the exact layout of the first 24 bytes of any ELF executable (`0x7f 'E' 'L' 'F'`):
- `0..4`: ELF magic (`[0x7f, b'E', b'L', b'F']`)
- `4`: Class (`1` = 32-bit, `2` = 64-bit)
- `5`: Data encoding (`1` = Little-Endian, `2` = Big-Endian!)
- `16..18`: `e_type` (`2` = `ET_EXEC`, `3` = `ET_DYN` / PIE or `.so`)
- `18..20`: `e_machine` (`0x3e` = x86-64, `0xb7` = AArch64 / ARM64, `0xf3` = RISC-V)
- `24..32`: `e_entry` (64-bit virtual entry point!)

Let's write and run the complete ELF64 parser on real captured header bytes right now:

```rust run
#[derive(Debug, PartialEq)]
struct ElfSummary {
    bits: u8,
    little_endian: bool,
    kind: &'static str,
    arch: &'static str,
    entry: u64,
}

fn parse_elf_header(bytes: &[u8]) -> Result<ElfSummary, &'static str> {
    if bytes.len() < 32 || &bytes[0..4] != b"\x7fELF" {
        return Err("not an ELF binary");
    }
    let bits = match bytes[4] {
        1 => 32,
        2 => 64,
        _ => return Err("unknown ELF class"),
    };
    let little_endian = match bytes[5] {
        1 => true,
        2 => false,
        _ => return Err("unknown ELF endianness"),
    };
    let read_u16 = |off: usize| -> u16 {
        let b: [u8; 2] = [bytes[off], bytes[off + 1]];
        if little_endian { u16::from_le_bytes(b) } else { u16::from_be_bytes(b) }
    };
    let read_u64 = |off: usize| -> u64 {
        let mut b = [0_u8; 8];
        b.copy_from_slice(&bytes[off..off + 8]);
        if little_endian { u64::from_le_bytes(b) } else { u64::from_be_bytes(b) }
    };

    let kind = match read_u16(16) {
        1 => "ET_REL (relocatable .o)",
        2 => "ET_EXEC (fixed executable)",
        3 => "ET_DYN (PIE executable / .so)",
        _ => "other ELF",
    };
    let arch = match read_u16(18) {
        0x3e => "x86-64",
        0xb7 => "AArch64 (ARM64)",
        0xf3 => "RISC-V",
        _ => "other ISA",
    };
    let entry = if bits == 64 { read_u64(24) } else { 0 };
    Ok(ElfSummary { bits, little_endian, kind, arch, entry })
}

fn main() {
    // Real Linux x86-64 PIE executable header bytes (first 32 bytes):
    let sample_pie: [u8; 32] = [
        0x7f, b'E', b'L', b'F', 2, 1, 1, 0,  0, 0, 0, 0, 0, 0, 0, 0,
        0x03, 0x00, // e_type = 3 (ET_DYN PIE)
        0x3e, 0x00, // e_machine = 0x3e (x86-64)
        0x01, 0x00, 0x00, 0x00,
        0xa0, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // e_entry = 0x10a0
    ];
    let info = parse_elf_header(&sample_pie).unwrap();
    println!("{}-bit le={} {} {} entry=0x{:x}", info.bits, info.little_endian, info.arch, info.kind, info.entry);
}
```
```output
64-bit le=true x86-64 ET_DYN (PIE executable / .so) entry=0x10a0
```

Look at that: **zero heap allocations** for ELF inspection, honoring both endianness flags dynamically just like `readelf`!

## Step 2: Parsing `/proc/self/maps` VMAs & Counting Pages per Permission

Now let's parse Linux `/proc/self/maps` lines cleanly into typed structs, grouping total virtual pages (`(end - start) / 4096`) by `r-xp` (executable code), `rw-p` (stack/heap/writable data), and `r--p` (read-only constants/RELRO):

```rust run
#[derive(Debug, Default)]
struct MapsStats {
    regions: usize,
    exec_pages: u64,
    rw_pages: u64,
    ro_pages: u64,
}

fn parse_proc_maps(text: &str) -> MapsStats {
    let mut stats = MapsStats::default();
    for line in text.lines() {
        let mut fields = line.split_whitespace();
        let (Some(range), Some(perms)) = (fields.next(), fields.next()) else {
            continue;
        };
        let Some((start_hex, end_hex)) = range.split_once('-') else {
            continue;
        };
        let (Ok(start), Ok(end)) = (u64::from_str_radix(start_hex, 16), u64::from_str_radix(end_hex, 16)) else {
            continue;
        };
        let pages = end.saturating_sub(start) / 4096;
        stats.regions += 1;
        if perms.starts_with("r-x") {
            stats.exec_pages += pages;
        } else if perms.starts_with("rw-") {
            stats.rw_pages += pages;
        } else if perms.starts_with("r--") {
            stats.ro_pages += pages;
        }
    }
    stats
}

fn main() {
    let sample_maps = "\
55608523c000-55608523d000 r--p 00000000 fe:00 10 /demo
55608523d000-55608523e000 r-xp 00001000 fe:00 10 /demo
55608aa66000-55608aa87000 rw-p 00000000 00:00 0  [heap]
7ffe82436000-7ffe82457000 rw-p 00000000 00:00 0  [stack]
";
    let s = parse_proc_maps(sample_maps);
    println!(
        "regions={} (4KiB pages: exec={}, rw={}, ro={})",
        s.regions, s.exec_pages, s.rw_pages, s.ro_pages
    );
}
```
```output
regions=4 (4KiB pages: exec=1, rw=66, ro=1)
```

Notice why `[heap]` (`0x55608aa87000 - 0x55608aa66000 = 0x21000 = 33 pages = 132 KiB`) and `[stack]` (`0x21000 = 33 pages = 132 KiB`) add up to `66` `rw-p` pages (`264 KiB` virtual)!

## Step 2b: Reading the kernel's own socket table

`/proc/self/maps` and `/proc/self/status` describe memory; `/proc/net/tcp` describes the network, and it is the same data `ss` prints. Every non-header line is one socket, and the fields that matter are columns `1` (local address), `2` (peer address) and `3` (TCP state):

```text
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 18213
```

Two traps make this a real parsing exercise. First, **the addresses are hex but byte-reversed** (`0100007F` is `127.0.0.1`, not `127.0.0.1` read left to right). Second, **the state is a hex number**, not a word (`0A` is `LISTEN`). This parser handles both and is pure `std`:

```rust run
fn parse_hex_addr(field: &str) -> Option<(std::net::Ipv4Addr, u16)> {
    let (ip, port) = field.split_once(':')?;
    let port = u16::from_str_radix(port, 16).ok()?;
    let raw = u32::from_str_radix(ip, 16).ok()?;
    // The kernel prints the 4 address bytes in host order: reverse them back.
    Some((std::net::Ipv4Addr::from(raw.to_le_bytes()), port))
}

fn state_name(hex: &str) -> &'static str {
    match hex {
        "01" => "ESTABLISHED",
        "02" => "SYN_SENT",
        "06" => "TIME_WAIT",
        "08" => "CLOSE_WAIT",
        "0A" => "LISTEN",
        _ => "OTHER",
    }
}

fn parse_net_tcp(table: &str) -> Vec<(std::net::SocketAddr, &'static str)> {
    table
        .lines()
        .skip(1) // the header row
        .filter_map(|line| {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() < 4 {
                return None;
            }
            let (ip, port) = parse_hex_addr(cols[1])?;
            Some((std::net::SocketAddr::from((ip, port)), state_name(cols[3])))
        })
        .collect()
}

fn main() {
    // Two real rows from a laptop: a local dev server and an outbound TLS connection.
    let table = r#"  sl  local_address rem_address   st
   0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00:00000000
   1: 0100007F:C350 5DB8D822:01BB 01 00000000:00000000 00:00000000 00:00000000
"#;
    for (addr, state) in parse_net_tcp(table) {
        println!("{addr} {state}");
    }
}
```
```output
127.0.0.1:8080 LISTEN
127.0.0.1:50000 ESTABLISHED
```

`5DB8D822` decodes to `34.216.184.93`, the peer of the second connection, which this program prints only for the local side — a useful reminder that `/proc/net/tcp` gives you the 4-tuple of *each* socket, and joining the two halves is how tools like `ss` reconstruct a connection.

## Step 2c: Counting every allocation with a global allocator

Parts IV and VI explained the allocator from the outside. This lab shows it from the inside, with about thirty lines: a `#[global_allocator]` that wraps `System` and counts every call. It compiles on stable Rust and needs no crate:

```rust run nocmp
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

struct CountingAllocator;

static ALLOCS: AtomicUsize = AtomicUsize::new(0);
static BYTES: AtomicUsize = AtomicUsize::new(0);
static FREES: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCS.fetch_add(1, Ordering::Relaxed);
        BYTES.fetch_add(layout.size(), Ordering::Relaxed);
        // SAFETY: we forward the exact layout we were given.
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        FREES.fetch_add(1, Ordering::Relaxed);
        // SAFETY: ptr and layout came from the matching alloc call.
        unsafe { System.dealloc(ptr, layout) }
    }
}

#[global_allocator]
static GLOBAL: CountingAllocator = CountingAllocator;

fn report(label: &str) {
    println!(
        "{label}: allocs={} frees={} live={} bytes={}",
        ALLOCS.load(Ordering::Relaxed),
        FREES.load(Ordering::Relaxed),
        ALLOCS.load(Ordering::Relaxed) - FREES.load(Ordering::Relaxed),
        BYTES.load(Ordering::Relaxed),
    );
}

fn main() {
    report("start");
    let v: Vec<u32> = (0..1000).collect();
    report("after Vec of 1000 u32");
    drop(v);
    report("after drop");
    let s = String::from("hello");
    report("after String::from");
    println!("{s}");
}
```

Three lessons fall out of running it, and they are the reason every allocator chapter eventually shows this program:

- **The counts are not the ones you expect.** Between `start` and the first `report` there are already allocations: `println!` itself allocates, and so does the stdout lock. Reading the *difference* between two labels is the only honest measurement.
- **`frees` never equals `allocs`.** The runtime keeps buffers alive for the life of the program, so "live" is a floor, not a leak counter.
- **`Ordering::Relaxed` is enough here** because every counter is independent; you are not using one to publish another. The moment you use a counter to decide *when* to print, you need `Acquire`/`Release`.

The same pattern, with `jemalloc` or `mimalloc` underneath instead of `System`, is how production services get allocation metrics into Prometheus without instrumenting a single call site.

## Step 3: A command-line lab you can run in five minutes

Every tool in this guide is a command you can run yourself. Here is the sequence a working systems programmer actually types when a Rust program misbehaves, in the order that finds the answer fastest:

```sh
# 1. What did the compiler emit? Intermediate artifacts, not just a binary.
rustc --emit=obj,asm,llvm-ir -O hello.rs     # hello.o, hello.s, hello.ll

# 2. What is inside the binary? Sections, symbols, dynamic dependencies.
readelf -hW ./hello                          # ELF header: class, machine, entry
readelf -SW ./hello | head -20               # sections: .text .rodata .data .bss
readelf -dW ./hello | head                  # needed shared objects (libc, libgcc)
nm -C ./hello | grep ' T '                  # defined text symbols, demangled

# 3. What does the machine code do?
objdump -d --no-show-raw-insn ./hello | head -40

# 4. Which syscalls does it make? This is the ground truth.
strace -f -e trace=openat,read,write,mmap,exit_group ./hello

# 5. Where does the time go? Sample, do not guess.
perf stat -d ./hello                         # cycles, instructions, cache misses
perf record -g ./hello && perf report        # flame-graph input, no root needed

# 6. If it crashes, take the core apart.
rust-gdb ./hello                              # Rust-aware pretty printers
RUST_BACKTRACE=full ./hello                   # panics only, but zero setup

# 7. If it leaks or corrupts memory, ask a second opinion.
valgrind --leak-check=full --show-leak-kinds=all ./hello
```

The tools answer different questions, and confusing them wastes hours:

| Question | Tool | What you are looking at |
|---|---|---|
| Did the compiler do what I meant? | `--emit=asm`, `--emit=llvm-ir` | its own output, before linking |
| What is in the binary? | `readelf`, `nm`, `objdump` | sections, symbols, relocations |
| What did the program *ask the kernel* for? | `strace` | real syscalls, real arguments, real errors |
| Where does the CPU time go? | `perf stat`, `perf record` | hardware counters, sampled stacks |
| What happens at a crash? | `rust-gdb`, core dump, `RUST_BACKTRACE` | registers, frames, unwound stack |
| Is memory used correctly? | Valgrind, Miri | invalid reads, leaks, undefined behaviour |

Two of these deserve a standing habit. Run `strace -f -e trace=%file` whenever a program cannot find a file: the syscall log tells you the exact path it tried, which is usually a current-directory or `PATH` surprise rather than a bug. And run `perf stat` before optimising anything, because the answer to "where is the time" is regularly not where the code *looks* slow.

## Step 4: Live Complete Self-Diagnostic Program on Linux

Now wire `elf_probe` (`/proc/self/exe`), `parse_proc_maps` (`/proc/self/maps`), `/proc/self/status`, and open file descriptors (`/proc/self/fd`) together into one live Linux inspection binary:

```rust run nocmp
use std::fs::{self, File};
use std::io::Read;

fn inspect_self_elf() -> String {
    let Ok(mut f) = File::open("/proc/self/exe") else {
        return "ELF probe skipped (non-Linux)".to_string();
    };
    let mut hdr = [0_u8; 32];
    if f.read_exact(&mut hdr).is_err() || &hdr[0..4] != b"\x7fELF" {
        return "not ELF".to_string();
    }
    let arch = match u16::from_le_bytes([hdr[18], hdr[19]]) {
        0x3e => "x86-64",
        0xb7 => "AArch64",
        other => return format!("ISA=0x{other:x}"),
    };
    let entry = u64::from_le_bytes(hdr[24..32].try_into().unwrap());
    format!("ELF64 {arch}, e_entry=0x{entry:x}")
}

fn main() {
    println!("Binary   : {}", inspect_self_elf());

    if let Ok(status) = fs::read_to_string("/proc/self/status") {
        for key in ["Pid:", "Threads:", "VmRSS:", "voluntary_ctxt_switches:"] {
            if let Some(line) = status.lines().find(|l| l.starts_with(key)) {
                println!("Status   : {line}");
            }
        }
    }

    if let Ok(fds) = fs::read_dir("/proc/self/fd") {
        let count = fds.filter_map(Result::ok).count();
        println!("Open FDs : {count}");
    }
}
```

Watch what happens when you run that on your Linux machine: the program opens **its very own executable image** through the kernel's `/proc/self/exe` magic symlink, reads bytes `0..32` straight from the page cache, inspects its own `task_struct` metrics via `/proc/self/status`, and counts its live open FDs (which even catches the extra FD held momentarily by `fs::read_dir("/proc/self/fd")` itself!).

:::exercise guided Adding W^X Security Auditing to `parse_proc_maps`
Extend `parse_proc_maps` so it flags any VMA whose permission string contains **both `w` and `x`** (`rwxp` / `rwx`—a classic W^X violation indicating writable executable JIT or vulnerable stack!).
::hint
Check `perms.contains('w') && perms.contains('x')`!
::solution
```rust run
fn audit_wx_violations(maps: &str) -> Vec<&str> {
    maps.lines()
        .filter(|line| {
            line.split_whitespace()
                .nth(1)
                .is_some_and(|p| p.contains('w') && p.contains('x'))
        })
        .collect()
}

fn main() {
    let sample = "\
55608523d000-55608523e000 r-xp 00001000 fe:00 10 /demo
7f0000001000-7f0000005000 rwxp 00000000 00:00 0  [jit-insecure]
";
    println!("W^X violations = {:?}", audit_wx_violations(sample));
}
```
```output
W^X violations = ["7f0000001000-7f0000005000 rwxp 00000000 00:00 0  [jit-insecure]"]
```
In hardened binaries, zero lines ever carry `rwxp`; JIT engines flip pages cleanly between `rw-p` (compile) and `r-xp` (execute) using `mprotect()`.
:::

:::exercise practice Parsing `/proc/self/status` `VmRSS` & `Threads` deterministically
Write a clean parser function `parse_status_kb(text: &str, key: &str) -> Option<u64>` that extracts `"VmRSS:\t   4096 kB"` -> `Some(4096)` safely without allocating `String`s or panicking on malformed lines.
::hint
Find the line starting with `key`, split the remainder by whitespace, and parse the numeric token!
::solution
```rust run
fn parse_status_kb(text: &str, key: &str) -> Option<u64> {
    let line = text.lines().find(|l| l.starts_with(key))?;
    let rest = line.strip_prefix(key)?;
    rest.split_whitespace().next()?.parse::<u64>().ok()
}

fn main() {
    let mock = "Name:\tsysinspect\nVmPeak:\t   18432 kB\nVmRSS:\t    4096 kB\n";
    println!("VmRSS = {:?} KiB", parse_status_kb(mock, "VmRSS:"));
}
```
```output
VmRSS = Some(4096) KiB
```
Notice the zero-allocation `&str` chain (`lines -> find -> strip_prefix -> split_whitespace -> parse`)!
:::

:::exercise challenge Measuring your own FD cleanup with RAII
Suppose you record open FD count inside `/proc/self/fd`, then open a `File` inside `{ let _f = File::open("/proc/self/exe")?; ... }`, and count `/proc/self/fd` again right *inside* the block vs *outside* the block. Predict the integer delta and explain why `Drop` guarantees zero leaks.
::hint
Each open `File` adds `1` FD inside `/proc/self/fd` until `File::drop` calls `close(fd)`.
::solution
Inside the `{ ... }` scope while `_f` is alive, `/proc/self/fd` rises by **`+1`** (say `4 -> 5`, accounting for `0, 1, 2`, the `read_dir` handle itself, plus `_f`). The instant `}` closes, `_f` drops (`close(fd)`), and `/proc/self/fd` immediately returns to `4`. Even if an early `?` error exited mid-block, `Drop` still closes `_f` deterministically—preventing `EMFILE` leaks completely.
:::

:::recap
- Pure safe Rust (`from_le_bytes`, checked slice bounds, iterators, `File::read_exact`, `Result`) gives you direct systems visibility into ELF headers, `/proc/<pid>/maps`, `/proc/<pid>/status`, and `/proc/<pid>/fd` without sacrificing safety.
- Auditing **`rwxp` W^X violations**, VMA page counts, RSS memory, context switches, and open FD counts turns abstract kernel concepts into live numbers you can measure on any Linux machine.
:::

:::quiz Check your understanding
? Which 4 bytes identify a valid ELF executable or shared library at offset `0..4`?
- `0x4d, 0x5a, 0x90, 0x00`
+ `0x7f, b'E', b'L', b'F'`
- `b"RUST"`
- `0xca, 0xfe, 0xba, 0xbe`
= Every ELF file begins with the 4-byte magic sequence `\x7fELF`.

? Why does `sysinspect` open `/proc/self/exe` rather than trusting `std::env::args().next()` to inspect its own binary?
- `args[0]` is always encrypted
+ `args[0]` is just an arbitrary string passed by the parent shell (`execve` can lie about `argv[0]`), whereas `/proc/self/exe` is a kernel symlink straight to the running binary's actual inode
- `/proc/self/exe` skips the OS page cache
- `env::args()` requires `unsafe`
= The kernel's `/proc/self/exe` link always identifies the exact running executable file reliably.

? What does finding an `rwxp` mapping inside `/proc/<pid>/maps` tell a security auditor?
- The process has zero heap allocations
+ A memory page is simultaneously **writable and executable**, violating W^X hardening
- ASLR is enabled cleanly
- The stack guard page is active
= Standard safe Rust programs keep code `r-xp` and data `rw-p`, never `rwxp`.

? In our lab's `parse_elf_header` function, why did it check `bytes[5]` (`1` vs `2`) before reading `e_type` and `e_entry`?
- To measure CPU clock speed
+ Because ELF supports both little-endian (`1`, x86-64/ARM64) and big-endian (`2`, older SPARC/PowerPC/MIPS) binaries, changing how 16-bit and 64-bit integers decode
- To detect whether the binary uses tokio
- To count open file descriptors
= Reading the ELF data-encoding byte at offset `5` ensures integers decode properly across both little- and big-endian architectures.
:::

:::checklist
- I parsed a real 64-bit ELF header (`\x7fELF`, ISA, type, `e_entry`) using zero-copy little-endian/big-endian byte reads.
- I decoded `/proc/self/maps` permissions (`r-xp`, `rw-p`, `r--p`), audited for `rwxp` W^X violations, and computed 4 KiB page counts.
- I extracted live `Pid`, `Threads`, `VmRSS`, `voluntary_ctxt_switches`, and open FD counts from Linux `/proc/self/*` and verified RAII cleanup.
:::
