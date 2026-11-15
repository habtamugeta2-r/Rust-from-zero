@id linux-systems-lab
@part p12
@kind project
@title Linux Systems Lab: Process & Runtime Inspector
@short Linux systems inspector lab
@level intermediate
@time 45
@learn Combine Parts I-XI systems concepts into a working Linux /proc & syscall diagnostic tool in Rust | Parse ELF headers, /proc/self/maps segments, /proc/self/status kernel metrics, and FD tables from scratch | Build a fast, zero-copy buffered CLI pipeline measuring user-space buffering vs system metrics | Verify systems invariants (alignment, page masks, endianness, RAII cleanup) with deterministic unit tests

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

## Step 3: Live Complete Self-Diagnostic Program on Linux

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
