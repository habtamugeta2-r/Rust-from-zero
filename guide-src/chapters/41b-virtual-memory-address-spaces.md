@id virtual-memory-address-spaces
@part p4
@kind chapter
@title Virtual Memory, Pages, TLB & Address Spaces
@short Virtual memory & paging
@level intermediate
@time 35
@learn Explain why every process gets its own private virtual address space | Trace virtual-to-physical translation through 4-level page tables and the TLB | Read /proc/self/maps and distinguish stack, heap, mapped segments, and guard pages | Understand ASLR, demand paging, page faults, and copy-on-write fork()

Ordinary user-space code works with **virtual addresses**, not physical RAM addresses. The processor's memory-management unit translates those addresses using mappings managed by the operating system. As a result, two processes can use the same numerical virtual address while mapping it to different physical memory; a pointer's printed value does not identify a universal location in RAM.

Virtual memory is the hardware-plus-OS illusion that gives every running process its own private, linear address space while the [[kernel]] quietly multiplexes physical RAM frames underneath. Where those frames come from — `brk` and `mmap` — is the subject of [heap allocators](#allocators-heap-internals). Where those frames come from — `brk` and `mmap` — is the subject of [heap allocators](#allocators-heap-internals). Where those frames come from — `brk` and `mmap` — is the subject of [heap allocators](#allocators-heap-internals).

:::plain Virtual address vs physical frame
A **[[virtual memory|virtual address]]** is the private address number your Rust variables see (`0x7ffe...`). A **physical frame** is an actual 4,096-byte (`4 KiB`) slice of DRAM silicon on the motherboard. Every time your program reads or writes a pointer, the CPU's [[MMU]] looks up that virtual page in the process's [[page table]] to find the real physical frame.
:::

:::analogy Post-office boxes vs street addresses
Think of virtual addresses as post-office box numbers inside your own private building. Box `0x1000` in your building and Box `0x1000` in your neighbour's building look identical on paper, yet the postal clerk (the CPU's [[MMU]]) walks behind the counter with a secret lookup ledger (the **page table**) to fetch entirely different physical storage bins in the warehouse.
:::

:::compare Direct physical addressing vs Virtual memory
| Property | Bare-metal physical RAM | Virtual memory (Linux/macOS/Windows) |
|---|---|---|
| Address isolation | None—any pointer bug corrupts other programs or the OS | Complete—process A cannot name a physical frame belonging to process B unless explicitly mapped |
| Contiguity | Huge allocations require contiguous free RAM | Disjoint 4 KiB physical frames look contiguous in virtual space |
| Permissions | Whole-RAM access | Per-4 KiB-page flags: Readable (`R`), Writable (`W`), Executable (`X`), User/Kernel (`U/S`) |
| Overcommit / Demand | Allocate upfront | Reserve virtual range now, back with physical frames only when first touched |
:::

## How a virtual address space is laid out

On Linux x86-64 (48-bit virtual addresses with 4-level paging, covering 256 TiB total), user space occupies the lower half (`0x0000_0000_0000_0000` to `0x0000_7fff_ffff_ffff`) and the kernel sits pinned in the canonical upper half (`0xffff_8000_0000_0000` and above):

:::note Linux x86-64 per-process virtual address space
```text
0xffff_ffff_ffff_ffff +------------------------------------------+
                      | Linux Kernel Space (mapped, unreachable  |
                      | from Ring 3 user code — page-faults!)    |
0xffff_8000_0000_0000 +------------------------------------------+
                      ~  non-canonical hole (hardware forbids)   ~
0x0000_7fff_ffff_ffff +------------------------------------------+
                      | [stack]  grows DOWNWARD toward lower     |
                      |          addresses (usually 8 MiB limit) |
                      | [guard page --- unreadable/unwritable]   |
                      |          (unmapped virtual gap)          |
                      | mmap region: libc.so.6, dynamic linker,  |
                      |          large allocations, file mmaps   |
                      |          grows DOWNWARD                  |
                      |                  ^                       |
                      |                  | (unmapped virtual gap)|
                      |                  v                       |
                      | [heap]   grows UPWARD via brk() / mmap() |
                      | .bss     zero-init globals (RW)          |
                      | .data    init globals (RW)               |
                      | .rodata  string literals, vtables (R)    |
                      | .text    machine instructions (R+X)      |
0x0000_0000_0000_0000 +------------------------------------------+  <- NULL (unmapped guard!)
```
:::

Look closely at the bottom and middle:

- Address `0x0` (`NULL`) is deliberately unmapped. Dereferencing a null raw pointer in C or unsafe Rust triggers an instant hardware [[page fault]] (`SIGSEGV`) instead of silently touching real RAM.
- Between the stack and the mmap area sits an unmapped **[[guard page]]**. If infinite recursion blows past the stack limit and touches the guard page, the OS raises a stack-overflow fault rather than letting the stack silently overwrite heap variables.
- **[[ASLR]]** (Address Space Layout Randomisation) shuffles the base offsets of `.text`, `[heap]`, `mmap`, and `[stack]` on every launch so attackers cannot hardcode jump addresses.

## Reading `/proc/self/maps` live from Rust

On Linux, `/proc/self/maps` shows the calling process's exact virtual memory map (Virtual Memory Areas, or VMAs). Every line displays the virtual address range, permissions (`r`, `w`, `x`, and `p` private copy-on-write vs `s` shared), file offset, and backing file or label:

```rust run nocmp
use std::fs;

fn main() {
    let stack_local = 42_u64;
    let heap_box = Box::new(99_u64);
    static RO_TEXT: &str = "Habtamu";

    println!("stack addr = {:p}", &stack_local);
    println!("heap  addr = {:p}", &*heap_box);
    println!("rodata ptr = {:p}", RO_TEXT.as_ptr());

    if let Ok(maps) = fs::read_to_string("/proc/self/maps") {
        for line in maps.lines().take(12) {
            println!("{line}");
        }
    }
}
```

A captured run on Linux x86-64 produces output shaped like:

```text
stack addr = 0x7ffe8245635c
heap  addr = 0x55608aa662a0
rodata ptr = 0x55608523e040
55608523c000-55608523d000 r--p 00000000 fe:00 549835  /path/to/binary
55608523d000-55608523e000 r-xp 00001000 fe:00 549835  /path/to/binary
55608523e000-55608523f000 r--p 00002000 fe:00 549835  /path/to/binary
556085240000-556085241000 rw-p 00003000 fe:00 549835  /path/to/binary
55608aa66000-55608aa87000 rw-p 00000000 00:00 0       [heap]
7f3617042000-7f3617198000 r-xp 00026000 fe:00 1350    /usr/lib/x86_64-linux-gnu/libc.so.6
7ffe82436000-7ffe82457000 rw-p 00000000 00:00 0       [stack]
```

Notice the strict **W^X** (Write XOR Execute) discipline: `.text` is `r-xp` (readable + executable, never writable) while `[heap]` and `[stack]` are `rw-p` (readable + writable, never executable—enforced in hardware via the NX / No-Execute bit). Even if corrupted data enters a stack buffer, the CPU refuses to execute bytes from it.

## Pages, 4-level page tables, and the TLB

Memory is not mapped byte by byte—tracking 256 TiB per byte would need more RAM than exists on Earth. Instead, virtual and physical memory are sliced into fixed-size **[[page]]s** (commonly **4 KiB**, `4096 = 2^12` bytes on x86-64; 4 KiB, 16 KiB on Apple Silicon ARM64, or 64 KiB on some servers).

Every 64-bit virtual address on x86-64 with 4-level paging splits cleanly into index fields:

| Bits | Width | Role |
|---|---|---|
| `63..48` | 16 bits | Canonical sign extension (must match bit 47) |
| `47..39` | 9 bits | Index (`0..511`) into **PML4** (Level 4 page directory) |
| `38..30` | 9 bits | Index (`0..511`) into **PDPT** (Level 3) |
| `29..21` | 9 bits | Index (`0..511`) into **PD** (Level 2; optional 2 MiB huge page) |
| `20..12` | 9 bits | Index (`0..511`) into **PT** (Level 1 page table -> 4 KiB frame) |
| `11..0` | 12 bits | Byte offset inside the 4 KiB page (`0..4095`) |

The CPU register **`CR3`** (x86-64) or **`TTBR0_EL1`** (ARM64) holds the **physical** address of the current process's top-level page table. Walking 4 levels in DRAM on every single `mov` or `add` would multiply memory latency by 4× (`~250 ns` instead of `~60 ns`)!

To avoid that disaster, the [[MMU]] keeps a tiny, ultra-fast hardware cache right inside the CPU core called the **[[TLB]]** (Translation Lookaside Buffer):

```text
Virtual Address ──► TLB Cache Hit? (~0.5 ns) ──Yes──► Physical Frame + Offset ──► Cache/RAM
                         │
                         No (TLB Miss)
                         ▼
               Hardware Page-Table Walk (4 levels via CR3, ~30-200 ns)
                         │
            ┌────────────┴────────────┐
         Present=1                 Present=0 or Violation
            ▼                         ▼
     Fill TLB & Retry          CPU Page Fault (#PF) -> Kernel Handler
```

:::tip Huge pages (2 MiB / 1 GiB)
Databases, game engines, and large allocators sometimes request **2 MiB huge pages** (`madvise(..., MADV_HUGEPAGE)` or `MAP_HUGETLB`). Covering 1 GiB with 4 KiB pages needs 262,144 TLB entries (overflowing a typical ~1,536-entry L2 TLB constantly), whereas 2 MiB huge pages need only 512 entries—cutting TLB misses sharply.
:::

## Page faults, demand paging, and Copy-on-Write (`COW`)

When a page-table entry has `Present = 0` or violates permissions (`W=0` on a write), the CPU raises a hardware **page fault** exception and transfers control to the kernel:

1. **Minor (soft) page fault (demand zeroing):** `Vec::with_capacity(10_000_000)` calls `mmap` to reserve 10 MB of virtual address space, yet consumes **zero bytes** of physical RAM immediately. The very first write to each 4 KiB page triggers a minor fault; the kernel hands over a fresh zeroed physical frame, updates the page table (`Present=1`), and resumes the instruction seamlessly.
2. **Major (hard) page fault:** The page belongs to a memory-mapped file (like part of `libc.so.6` or an `mmap`'d database) not yet in the OS page cache. The kernel pauses the thread, reads the 4 KiB block from NVMe/SSD into RAM, updates the page table, and wakes the thread. The file-system side of that read is in [file systems, the page cache and `mmap`](#filesystems-cache-mmap). The file-system side of that read is in [file systems, the page cache and `mmap`](#filesystems-cache-mmap).
3. **Invalid page fault (`SIGSEGV`):** The virtual address is unmapped (null pointer, past stack guard page) or violates `R/W/X` permissions (writing into `.rodata`). The kernel terminates the process with segmentation fault.
4. **Copy-on-Write (`COW`) on `fork()`:** When a parent process spawns a child via `fork()`, Linux does **not** copy gigabytes of RAM! (The `fork()` and `clone()` machinery is in [processes, threads and scheduling](#processes-threads-scheduling).) (The `fork()` and `clone()` machinery is in [processes, threads and scheduling](#processes-threads-scheduling).) (The `fork()` and `clone()` machinery is in [processes, threads and scheduling](#processes-threads-scheduling).) Instead, both processes share the exact same physical pages marked **read-only**. The instant either parent or child writes to a page, a page fault occurs, the kernel allocates one private 4 KiB physical copy for the writer, flips its writable bit on, and lets both continue independently.

:::details Stack growth vs heap exhaustion
Notice why a Rust `Box::new` vs a local variable behave differently when RAM runs tight:

- **Stack:** Starts small (often 1–2 pages mapped upfront out of an 8 MiB virtual reservation) and grows page-by-page downward via minor faults until hitting the unmapped guard page (triggering stack overflow).
- **Heap:** Managed by user-space allocator code calling `brk()` or [[mmap]]. Calling `std::alloc::alloc` or pushing onto a `Vec` can request gigabytes in virtual space before physical frames back it—until a real write exhausts RAM/swap and wakes the Linux **OOM killer**.
:::

:::exercise guided Inspecting page alignment and addresses
Predict which two variables share the same 4 KiB page and why. Given stack variables `a` at `0x7ffd10003f14` and `b` at `0x7ffd10003f10`, and a `Vec` heap element at `0x55a1b2c04010`:
1. Compute the 4 KiB page base address (`addr & !0xfff`) of each.
2. Determine the page offset (`addr & 0xfff`) of each.
::hint
In hex, dividing by `4096` (`0x1000`) drops the bottom three hex digits. Those bottom three digits are the offset inside the page!
::solution
1. Page bases (`addr & !0xfff`): `a` and `b` both sit in page `0x7ffd10003000`. The heap element sits in page `0x55a1b2c04000`.
2. Page offsets (`addr & 0xfff`): `a` is at offset `0xf14` (`3860`), `b` is at offset `0xf10` (`3856`), and the heap element is at offset `0x010` (`16`). Because `a` and `b` share page `0x7ffd10003000`, one TLB entry translates both!
:::

:::exercise practice Observing lazy physical allocation (demand paging)
Write a small Rust program that allocates a `Vec<u8>` of 16 MiB using `vec![0u8; 16 * 1024 * 1024]` vs `Vec::<u8>::with_capacity(16 * 1024 * 1024)` and reads `/proc/self/statm` before and after touching one byte every 4,096 bytes. (Run it locally if you have `rustc` installed, or trace how each line affects RSS.)
::hint
The second field in `/proc/self/statm` is Resident Set Size (RSS) in 4 KiB pages. `with_capacity` calls the allocator (`mmap`) without writing bytes; touching every `4096`th byte faults in one 4 KiB page per iteration.
::solution
```rust run nocmp
use std::fs;

fn read_rss_pages() -> u64 {
    fs::read_to_string("/proc/self/statm")
        .ok()
        .and_then(|s| s.split_whitespace().nth(1)?.parse().ok())
        .unwrap_or(0)
}

fn main() {
    let before = read_rss_pages();
    let mut buf: Vec<u8> = Vec::with_capacity(16 * 1024 * 1024);
    let after_reserve = read_rss_pages();

    // Uninit spare capacity isn't touched yet; safely fill first:
    buf.resize(16 * 1024 * 1024, 1);
    let after_touch = read_rss_pages();

    println!("RSS pages: before={before}, reserved={after_reserve}, touched={after_touch}");
    println!("First & last byte: {} {}", buf[0], buf[buf.len() - 1]);
}
```
`after_reserve` barely changes because `Vec::with_capacity` reserves virtual addresses without dirtying every page; `after_touch` jumps by roughly `4096` pages (`16 MiB / 4 KiB`) as `resize(..., 1)` writes every page and faults physical frames into RSS.
:::

:::exercise challenge Decoding 4-level page-table indices
Take the 48-bit virtual address `0x0000_7ffe_8245_635c` (a typical Linux stack pointer). Break out the binary/hex bit slices for PML4, PDPT, PD, PT, and page offset.
::hint
Shift right by `39`, `30`, `21`, and `12` bits and mask each with `0x1ff` (9 bits = `0..511`). The lowest 12 bits (`& 0xfff`) give the byte offset.
::solution
```rust run
fn main() {
    let addr: u64 = 0x0000_7ffe_8245_635c;
    let pml4   = (addr >> 39) & 0x1ff;
    let pdpt   = (addr >> 30) & 0x1ff;
    let pd     = (addr >> 21) & 0x1ff;
    let pt     = (addr >> 12) & 0x1ff;
    let offset = addr & 0xfff;
    println!("PML4={pml4}, PDPT={pdpt}, PD={pd}, PT={pt}, offset=0x{offset:03x}");
}
```
```output
PML4=255, PDPT=506, PD=18, PT=86, offset=0x35c
```
Notice `PML4 = 255` (`0xff`)—the very top slot (`0..255`) of the user-space lower half!
:::

:::recap
- Every user-space pointer is a **virtual address** translated per 4 KiB (or huge) **page** through multi-level page tables pointed to by `CR3` / `TTBR0_EL1`.
- The **TLB** caches recent translations inside the CPU core so normal loads/stores avoid slow 4-level RAM walks.
- Permissions (`R/W/X`) live on page-table entries and enforce **W^X**, null-pointer traps, and stack **guard pages** in hardware.
- **Page faults** are normal OS machinery for demand zeroing, file-backed paging, and **Copy-on-Write** `fork()`, turning fatal only on unmapped or forbidden accesses (`SIGSEGV`).
:::

:::quiz Check your understanding
? Two separate processes both print a local stack variable at virtual address `0x7ffe8245635c` and write different numbers to it. Why do they not overwrite each other?
- Stack variables live inside the CPU registers only
+ Each process has its own page tables mapped to distinct physical RAM frames
- The OS swaps one process out to disk before running the other
- The compiler rewrites addresses at runtime
= The same virtual address translates through each process's own `CR3` / page table to completely separate physical RAM frames.

? What is the primary job of the TLB (Translation Lookaside Buffer)?
- Storing heap metadata headers for `malloc`
- Keeping copy-on-write forks synchronised
+ Caching recent virtual-to-physical page translations inside the CPU core
- Compressing unused pages onto SSD swap
= Walking a 4-level page table in DRAM on every memory instruction would be prohibitively slow; the TLB caches translations in fast hardware registers.

? Which `/proc/self/maps` permission flags represent a normal `.text` code segment under W^X security?
- `rw-p`
+ `r-xp`
- `rwxp`
- `---p`
= Code segments are readable (`r`) and executable (`x`) but never writable (`-`), preventing runtime code injection.

? What happens during a minor (soft) page fault right after reserving virtual memory?
- The program crashes immediately with `SIGSEGV`
- The kernel reads the missing page from the NVMe disk
+ The kernel allocates a zeroed physical RAM frame, maps it into the page table, and resumes the instruction
- The MMU flushes every entry from the TLB across all CPU cores
= Demand paging assigns physical frames lazily on first write via a minor page fault—no disk I/O is needed.
:::
