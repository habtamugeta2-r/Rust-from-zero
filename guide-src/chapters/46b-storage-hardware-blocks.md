@id storage-hardware-blocks
@part p11
@kind chapter
@title Storage Hardware: HDD, NAND SSD, NVMe Queues & Block I/O
@short Storage hardware & NVMe
@level intermediate
@time 35
@learn Contrast HDD mechanical seek latency with NAND Flash SSD pages/blocks and NVMe multi-queue PCIe lanes | Explain SSD FTL (Flash Translation Layer), write amplification, TRIM/discard, and wear leveling | Trace a block request through Linux blk-mq, DMA scatter-gather lists, and hardware NVMe submission/completion queues | Understand power-loss hazards (disk write caches, fsync barriers, checksums) for databases

Every `File::write_all` and SQLite `COMMIT` eventually ends at physical storage silicon—a spinning magnetic platter (**HDD**) or solid-state **NAND Flash NVMe SSD** plugged directly into PCIe lanes.

Why does random 4 KiB I/O crawl at ~100 operations/sec on an HDD yet scream past **500,000+ IOPS** on an NVMe SSD? Why does overwriting 512 bytes on an SSD secretly force the drive controller to read, copy, and erase hundreds of kilobytes (**write amplification**)? And why can an SSD tell Linux `"write complete!"` while data still vanishes during a power failure unless `fsync` sends a flush barrier?

:::plain IOPS, write amplification, and fsync in one paragraph
**IOPS** counts how many small random operations a device completes per second, and it is the number that decides whether a database feels instant or unusable; sequential bandwidth is a different, much friendlier number. **Write amplification** is the ratio between bytes the host asked to write and bytes the storage actually wrote, and on NAND it is above `1` because a `4 KiB` page cannot be overwritten in place — the controller writes a new page, marks the old one dead, and later rewrites whole `2–8 MiB` erase blocks to reclaim space. **`fsync`** is the syscall that asks the device to push data out of its volatile cache and onto media, and without it a `write` that returned `Ok` can still vanish on power loss.
:::

:::analogy Vinyl turntable vs electric filing whiteboard
- An **HDD** is a record player: reading the next consecutive byte is quick once the arm sits on the right track, yet moving the mechanical needle across the spinning platter takes **5–10 milliseconds** (`5,000,000–10,000,000 ns`—an eternity!).
- An **NVMe SSD** stores electric charges in silicon Flash cells across dozens of parallel channels connected directly to PCIe—**no moving parts!** Yet NAND Flash has one bizarre physical quirk: you can **write 4–16 KiB pages**, while you can **erase only entire 2–8 MiB erase blocks**!
:::

:::compare Storage Media Hierarchy & Latency
| Medium | Interface | Random 4 KiB Read Latency | Max IOPS | Sequential Bandwidth |
|---|---|---|---|---|
| **L1d / DRAM** | On-die / DDR5 | `1 ns` / `80 ns` | Hundreds of millions | `50–100+ GB/s` |
| **HDD (7200 RPM)** | SATA / SAS | **~8–12 ms** (seek + rotation!) | ~100–200 IOPS | ~150–250 MB/s |
| **SATA SSD** | AHCI (1 queue, 32 depth) | ~60–150 µs | ~50k–90k IOPS | ~550 MB/s |
| **NVMe SSD** | **PCIe Gen4/Gen5** (up to 64k queues!) | **~15–80 µs** | **500k–1.5M+ IOPS** | **3,500–14,000 MB/s** |
:::

## Inside NAND Flash: Why SSDs Need an Embedded OS (`FTL`)

Every NVMe SSD hides a multi-core ARM processor and gigabytes of DRAM inside its own thumb-sized PCB running firmware called the **FTL (Flash Translation Layer)**:

1. **Out-of-place updates (Pages vs Erase Blocks):** Because NAND cells cannot overwrite `0 -> 1` without resetting an entire **2–8 MiB erase block**, overwriting logical block `#42` causes the FTL to write the new 4 KiB page to a *fresh* physical NAND page, mark the old physical page stale, and update a hidden virtual-to-physical **LBA mapping table**!
2. **Garbage Collection & [[write amplification]] (`WAF`):** When clean erase blocks run low, the FTL must read all live pages out of a dirty block, write them elsewhere, and erase the whole block—multiplying host writes by 2×–5× (**write amplification**). Appending sequentially (**WAL logs**, LSM-trees like RocksDB!) eliminates random overwrites and reduces write amplification sharply.
3. **[[TRIM]] (`fstrim` / `BLKDISCARD`):** When you `std::fs::remove_file` a 10 GiB file, the OS only clears file-system pointers—the SSD still thinks all 10 GiB of old blocks are "live"! Sending **`TRIM`** tells the FTL those blocks are dead so SSD garbage collection stops copying deleted bytes forever.
4. **Wear Leveling:** Each Flash cell survives only ~1,000–3,000 program/erase cycles (TLC/QLC); the FTL rotates hot logical blocks across fresh physical silicon blocks automatically.

## Linux `blk-mq` & NVMe's 64,000 Lockless Hardware Queues

Old **SATA/AHCI** drives exposed a *single* command queue of 32 slots protected by a global lock—creating massive multi-core contention on 32-core servers. **NVMe** was designed right alongside modern multi-core CPUs:

:::note Linux blk-mq mapping CPU cores directly to NVMe PCIe hardware queues
```text
Core 0 (Rust thread) ──► Software Queue 0 ──► NVMe Submission Queue 0 ──┐
Core 1 (Rust thread) ──► Software Queue 1 ──► NVMe Submission Queue 1 ──┼─► PCIe DMA <-> NAND Chips
Core N (Rust thread) ──► Software Queue N ──► NVMe Submission Queue N ──┘
                                                  ▲
                                          NVMe Completion Queues + MSI-X IRQ per core!
```
:::

Notice the astonishing design symmetry: **NVMe's ring-buffer Submission/Completion Queues in DMA RAM inspired Linux's `io_uring`!** Each CPU core submits 4 KiB block commands to its *own* queue without locking other cores, and the NVMe controller DMAs blocks straight into RAM and fires an IRQ back to that exact core.

## Block Alignment (`4096` / `512` bytes) & Write Ordering Hazards

Hardware disks do **not** read or write single arbitrary bytes: they transfer **sectors** (`512` B logical, **`4096` B physical** 4Kn pages!) — the boundary is called [[block alignment]] and it decides how much of your `write` really reaches the device. Even a single-byte edit on a file reads the enclosing 4 KiB page into OS page cache, flips one byte, and schedules a 4 KiB block writeback.

Even more critical for databases (`SQLite`, `PostgreSQL`, `sled`):
1. **Volatile drive write cache:** Most consumer SSDs/HDDs carry a fast DRAM cache in front of Flash/platters. Without an explicit flush/barrier command (`fsync()` -> `SYNCHRONIZE_CACHE` / `NVMe Flush` or **`FUA`** *Force Unit Access*), the drive acknowledges writes *while they sit in volatile drive RAM*! Power loss wipes them out—even though `write()` returned `Ok`!
2. **Torn 4 KiB writes:** Writing an 8 KiB or 16 KiB database page spans multiple 4 KiB SSD pages; if power drops halfway through, the page ends up half-new and half-old (**torn page**)! That is why real databases write a sequential **Write-Ahead Log (WAL)** with **CRC32C / BLAKE3 checksums** or double-write buffers before touching B-tree pages in place.

Let's simulate aligned block chunking + CRC integrity checks in pure Rust—mirroring how databases and file systems verify every 4 KiB storage block against silent bit-rot or torn writes:

```rust run
const BLOCK_SIZE: usize = 64; // scaled down from 4096B for clean readable demo

fn fnv1a_checksum(data: &[u8]) -> u32 {
    let mut h: u32 = 0x811c_9dc5;
    for &b in data {
        h ^= b as u32;
        h = h.wrapping_mul(0x0100_0193);
    }
    h
}

fn encode_block(payload: &[u8]) -> [u8; BLOCK_SIZE] {
    assert!(payload.len() <= BLOCK_SIZE - 4);
    let mut blk = [0_u8; BLOCK_SIZE];
    blk[..payload.len()].copy_from_slice(payload);
    let crc = fnv1a_checksum(&blk[..BLOCK_SIZE - 4]);
    blk[BLOCK_SIZE - 4..].copy_from_slice(&crc.to_be_bytes());
    blk
}

fn verify_block(blk: &[u8; BLOCK_SIZE]) -> bool {
    let stored = u32::from_be_bytes(blk[BLOCK_SIZE - 4..].try_into().unwrap());
    stored == fnv1a_checksum(&blk[..BLOCK_SIZE - 4])
}

fn main() {
    let mut block = encode_block(b"WAL tx=42 commit");
    println!("clean block valid = {}", verify_block(&block));

    // Simulate a single flipped bit (bit-rot or torn sector!):
    block[5] ^= 0x01;
    println!("after 1-bit corruption = {}", verify_block(&block));
}
```
```output
clean block valid = true
after 1-bit corruption = false
```

:::details Why `O_DIRECT` bypasses the OS page cache
Most applications want the Linux page cache (covered next!). Yet high-performance databases like PostgreSQL (optionally) or ScyllaDB/RocksDB sometimes open files with **`O_DIRECT`**, which forces **4 KiB-aligned user buffers** to DMA **directly between user RAM and NVMe hardware**, avoiding double-caching (database buffer pool + OS page cache holding the same pages twice!) and giving predictable tail latency.
:::

:::exercise guided Comparing sequential vs random I/O throughput on HDD vs NVMe
A log analyzer reads `1 GiB` of records:
- Pattern A: Sequential scan across one contiguous `1 GiB` log file.
- Pattern B: `262,144` random `4 KiB` seeks across scattered offsets.
Estimate approximate wall-clock time on a `200 MB/s` (`10 ms` seek) HDD vs a `4,000 MB/s` (`50 µs` read) NVMe SSD!
::hint
Multiply `262,144 × 10 ms` vs `262,144 × 50 µs` (or parallel queue depth `32`)!
::solution
- **Sequential `1 GiB`:** HDD takes `~5 seconds` (`1000 MB / 200 MB/s`); NVMe takes `~0.25 seconds` (20× faster).
- **Random `262,144 × 4 KiB`:** HDD takes `262,144 × 0.01 s ≈ 2,621 seconds` (**~44 MINUTES!**); NVMe at queue depth 1 takes `~13 seconds`, and at queue depth 32 (`io_uring` / parallel threads) finishes in **< 0.5 seconds** (over **5,000× faster** than the HDD!).
:::

:::exercise practice Why append-only logs & LSM-trees thrive on Flash SSDs
Explain how an append-only WAL or LSM-tree database (like `RocksDB` or `redb` / log compaction) reduces SSD **write amplification** compared to randomly updating 100-byte structs inside a fixed file!
::hint
Remember NAND Flash writes pages out-of-place and erases whole multi-megabyte erase blocks!
::solution
Random 100-byte in-place updates dirty scattered 4 KiB pages across dozens of separate 4 MiB erase blocks, forcing the SSD's FTL garbage collector to constantly copy surviving pages out before erasing. Sequential large writes fill contiguous erase blocks cleanly together and expire whole blocks cleanly via compaction/TRIM, cutting write amplification dramatically and extending SSD lifespan.
:::

:::exercise challenge Why can a checksum on every 4 KiB block detect torn writes even when `write()` returned `Ok`?
Suppose a database writes an 8 KiB record across two 4 KiB NVMe pages without atomic multi-block hardware support, and power fails right after page 1 reaches Flash while page 2 still holds old bytes from an earlier transaction. How does a trailing checksum or generation number catch the partial write on crash recovery?
::hint
Look at `verify_block` above: where did we store the checksum, and what happens if the first half of the block has *new* bytes while the trailing bytes at `[end - 4..]` still hold the *old* checksum?
::solution
If a write tears mid-way across sectors, the beginning contains **new** payload bytes while the tail still holds the **old** checksum (or vice versa), so on restart `fnv1a / CRC32C(payload) != stored_checksum` immediately exposes the torn write! The database rejects the corrupt tail record safely and replays/keeps the last valid committed state from its WAL.
:::

:::recap
- **HDDs** pay multi-millisecond mechanical seek delays on random reads; **NVMe SSDs** execute hundreds of thousands of parallel IOPS across PCIe lanes with multi-queue **`blk-mq`**.
- **NAND Flash** writes 4–16 KiB pages yet erases 2–8 MiB erase blocks; the SSD's **FTL** manages LBA mapping, garbage collection, wear leveling, and **`TRIM`**.
- Storage transfers aligned blocks (`512 B` / `4 KiB`), and drive write caches require explicit **`fsync` / `FUA` flush barriers** plus block **checksums** to survive power loss safely.
:::

:::quiz Check your understanding
? Why can overwriting a single 4 KiB block in place on an SSD trigger several times more internal NAND writes (**write amplification**)?
- NVMe SSDs encrypt every byte 4 times
+ NAND Flash cannot overwrite cells in place; it writes the updated page elsewhere and later copies live neighbours out before erasing an entire multi-megabyte block
- Linux always writes files twice
- PCIe lanes duplicate every packet
= Page-write / block-erase granularity mismatch inside NAND Flash requires out-of-place writes and background garbage collection.

? What happens when the Linux OS sends a **`TRIM` (`BLKDISCARD`)** command after deleting a large file?
- It immediately zeroes every byte on the CPU
+ It informs the SSD's FTL that those logical blocks no longer contain live data, sparing garbage collection from copying dead bytes and reducing write amplification
- It compresses the remaining files
- It disables the OS page cache
= Without `TRIM`, the SSD FTL has no way to distinguish deleted file blocks from live data.

? Why did NVMe introduce up to 64,000 hardware submission/completion queues compared to legacy SATA/AHCI's single queue?
- To hold 64,000 separate files open
+ So every CPU core submits and completes I/O lock-free in its own queue (`blk-mq`) without spinning on a single global hardware queue lock
- Because SATA cables only have 1 wire
- To eliminate RAM completely
= Per-core submission/completion queues scale cleanly to dozens of cores and >1,000,000 IOPS.

? After `file.write_all(bytes)` returns `Ok(())`, why is data STILL not guaranteed safe across a sudden power cut?
- Rust buffers every `File` automatically in user space
+ `write()` copies into the kernel page cache (and drives often buffer writes in volatile drive DRAM cache) until `fsync()`/`sync_all()` flushes barriers down to non-volatile media
- SSDs only persist writes every 10 minutes
- `write_all` skips checksums
= Both OS page caches and disk write caches require explicit `fsync`/`sync_all` flush commands for crash durability.
:::
