@id filesystems-cache-mmap
@part p11
@kind chapter
@title File Systems, the Page Cache, Journaling & Memory-Mapped I/O
@short File systems, page cache & mmap
@level intermediate
@time 35
@learn Trace Linux VFS path resolution (/data/app.db -> dentries -> inodes -> ext4 extents) | Explain hard links vs symlinks, directory atomicity (rename() crash-safe file updates!), and file-system journaling | Understand how the Linux Page Cache makes repeated file reads 1,000x faster via DRAM | Contrast read()/write() syscalls with mmap() (zero-copy file mapping, SIGBUS hazards, and Rust safety limits)

Notice something extraordinary if you run `ripgrep` across a 500 MB codebase twice in a row: the first scan might take `0.8 s`, and the second scan finishes in **`0.04 s`** (`20×` faster!) without changing a line of code. Why? Because Linux kept the entire codebase hot inside the **OS Page Cache**!

In this chapter we climb up one layer from raw NVMe blocks to the **Linux VFS**, **`ext4` / CoW file systems (`btrfs`/`ZFS`/`APFS`)**, **crash-safe file replacement**, and **`mmap` memory-mapped files**.

:::analogy A library catalog, reading table, and checkout slips
- **Directories (`dentry`)** are name-to-number index cards mapping `"notes.txt"` -> **Inode `#8821`** (a file can even appear on two cards at once—a **hard link**!).
- **Inodes** hold permissions, size, timestamps, and the map of **disk extents** (where the bytes live on SSD), *not* the filename!
- The **OS Page Cache** is the huge reading table in the library lobby: once a book comes off the warehouse shelf (SSD), it stays open on the table in fast DRAM (`~80 ns`) for anyone else reading the same file!
:::

:::compare `read()`/`write()` Syscalls vs `mmap()` File Mapping
| Property | Buffered `read()` / `write()` | `mmap()` (Memory-Mapped File) |
|---|---|---|
| Kernel -> User transfer | Copies bytes from Page Cache into your user `Vec<u8>` | **Zero copy!** Maps the exact same Page Cache physical frames straight into your virtual address space! |
| Syscalls per access | 1 syscall per buffer read/write | **Zero syscalls** on warm page cache hits (just CPU memory loads; minor/major faults on cold pages!) |
| Memory safety in Rust | 100% safe (`File::read` owns its copy) | **`unsafe`!** Another external process modifying/truncating the file causes data races or **`SIGBUS` crash**! |
| Best suited for | Streaming sequential files, network downloads, small configs | Read-only immutable assets (`LMDB`, `tantivy` search indexes, shared binaries `libc.so.6`) |
:::

## Inside VFS, Inodes, Hard Links, and Symlinks

When you open `/home/habtamu/notes.txt`, Linux's **VFS (Virtual File System)** dispatches cleanly across `ext4`, `xfs`, `btrfs`, `tmpfs`, or `/proc` through a uniform interface:
1. **Dentry cache (`dcache`):** Resolves `/`, `home`, `habtamu`, `notes.txt` from a fast kernel hash table in RAM without hitting disk on every path lookup!
2. **Inode (`stat`):** Reached via the dentry -> holds UID/GID permissions, byte length, link count (`nlink`), and pointers (or **extents**, like `(logical_offset=0, physical_block=5000, count=64 pages)`) to the file's actual data blocks!
3. **Hard links vs Symbolic links (`ln` vs `ln -s`):**
   - A **hard link** adds a second directory entry pointing straight to the **exact same Inode `#8821`** (`nlink` increments to `2`). Deleting one name leaves the other untouched until `nlink` drops to `0` AND the last open FD closes!
   - A **symbolic link (symlink)** is a tiny special file storing a *text path* (`"../target.txt"`) that can cross file systems or dangle if the target disappears.

## Crash-Safe Atomic File Updates & Journaling (`WAL` for metadata!)

Look at a catastrophic trap in naive file-saving code:

```rust
// DANGEROUS if power drops right after truncation!
std::fs::write("config.json", new_json)?; // truncates config.json to 0 bytes first!
```

If power fails (or the process crashes) right after `open(O_TRUNC)` zeroes `config.json` and before `write_all` finishes, **both the old AND new config are gone**!

Look at how production Rust tools (`cargo`, `rustup`, editors, databases) guarantee **all-or-nothing crash-safe file updates** on POSIX file systems using **`rename()`**:

:::note Crash-safe atomic file replacement pattern on POSIX
```text
1. Write full new bytes into a sibling temp file in the SAME directory:
      `config.json.tmp.<pid>`
2. Call `tmp_file.sync_all()?`  (fsync data + inode to SSD before renaming!)
3. Call `std::fs::rename("config.json.tmp.<pid>", "config.json")?`
      (POSIX guarantees atomic inode pointer swap in the directory!)
4. Call `parent_dir.sync_all()?` (fsync parent directory so new entry survives crash!)
```
:::

And how does `ext4` keep the *directory structure itself* from corrupting mid-`rename` or mid-`mkdir` if power cuts out? **Journaling (Write-Ahead Logging)**: before updating directory/inode/bitmap blocks in place, `ext4` writes a small commit record into its circular **JBD2 journal** (`ordered` mode writes file data *before* committing metadata so files never end up pointing to garbage uninitialized disk blocks!). Newer **Copy-on-Write (CoW)** file systems (`btrfs`, `ZFS`, `APFS`) never overwrite blocks in place at all—writing new blocks + updating the tree root atomically!

## The Linux Page Cache: Why Unused RAM Is Cached Disk

Look at `free -h` on any busy Linux server: `buff/cache` routinely occupies gigabytes of free RAM! Linux automatically turns every spare physical RAM frame into the **Page Cache**:
- **Clean pages:** Exact mirrors of file blocks on NVMe—if a Rust process calls `Box::new` and RAM runs tight, the kernel reclaims clean page-cache frames instantly (`0` disk writes!).
- **Dirty pages (`writeback`):** Pages written by `File::write_all` waiting ~5–30 seconds to be flushed smoothly in batches by kernel `kworker` flushers (`pdflush`).
- **Sequential Read-Ahead:** When the kernel sees you reading pages `0, 1, 2` sequentially, it asynchronously starts fetching pages `3..15` off the SSD *before* your `BufReader` even requests them!

## `mmap`: Zero-Copy Speed & Why `Mmap` Is `unsafe` in Rust

Notice how `libc.so.6` and your own compiled executable loaded in Part V: **`mmap()`** maps file pages directly into your process's virtual address space (`CR3`). When you read byte `idx` of a memory-mapped file:
- If the 4 KiB page is already in the OS **Page Cache**, the MMU points your virtual address straight at that exact physical RAM frame—**zero kernel copy, zero `read()` syscall, shared cleanly across processes!**
- If missing, a **major page fault** pulls that 4 KiB page from NVMe on demand!

**Wait—why does Rust's standard library intentionally leave `mmap` out of safe `std`, requiring crates like `memmap2` with `unsafe` constructors?**
Because safe Rust promises `&[u8]` is **immutable** and valid for its entire lifetime! Yet with `mmap`, an unrelated process running `truncate -s 0 data.db` or overwriting `data.db` on disk violates *both* promises simultaneously:
1. Mutating bytes from outside creates **unsynchronised aliasing mutations** behind `&[u8]` (Undefined Behaviour!).
2. Shrinking the file below the mapped offset makes reading `&slice[idx]` trigger a fatal **`SIGBUS`** hardware crash!

Only when your application controls the file (e.g., an immutable search index, or advisory file locks + controlled database formats like LMDB) can you justify `unsafe { Mmap::map(&file) }`.

Let's inspect the crash-safe temp-file + `sync_all` + `rename` pattern safely using an in-memory/temp simulation (demonstrating exact order cleanly in `run`!):

```rust run
use std::fs::{self, File};
use std::io::Write;

fn atomic_write_file(dir: &std::path::Path, filename: &str, data: &[u8]) -> std::io::Result<()> {
    let target = dir.join(filename);
    let tmp = dir.join(format!(".{filename}.tmp.{}", std::process::id()));

    {
        let mut f = File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?; // Step 1: flush new file data & metadata to persistent disk!
    }
    fs::rename(&tmp, &target)?; // Step 2: POSIX atomic directory swap!

    // Step 3: sync parent directory so the updated name entry survives crash!
    if let Ok(d) = File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
}

fn main() {
    let tmp_dir = std::env::temp_dir().join(format!("rust_fs_demo_{}", std::process::id()));
    fs::create_dir_all(&tmp_dir).unwrap();

    atomic_write_file(&tmp_dir, "settings.toml", b"workers = 4\n").unwrap();
    atomic_write_file(&tmp_dir, "settings.toml", b"workers = 8\n").unwrap();

    let contents = fs::read_to_string(tmp_dir.join("settings.toml")).unwrap();
    println!("settings.toml = {}", contents.trim());

    fs::remove_dir_all(&tmp_dir).unwrap();
}
```
```output
settings.toml = workers = 8
```

Notice we never wrote `"settings.toml"` in place! Even if power failed mid-write during the second update, `settings.toml` would still hold `"workers = 4\n"` intact instead of zero bytes!

:::exercise guided Hard links vs Symbolic links (`inode` refcount behaviour)
Suppose you create `a.txt` containing `"hello"`, create a **hard link** `b.txt` pointing to `a.txt`, and a **symbolic link** `c.txt -> a.txt`. Then you run `std::fs::remove_file("a.txt")`. What happens when you try to read `b.txt` vs `c.txt`?
::hint
Remember a hard link points straight to the **inode number**, whereas a symlink stores only the **path string `"a.txt"`**!
::solution
- **`b.txt` (hard link):** Reads `"hello"` cleanly! `a.txt`'s inode had `nlink = 2`; removing `a.txt` dropped `nlink` to `1`, keeping the inode and data blocks alive until `b.txt` is also removed.
- **`c.txt` (symbolic link):** Fails with `NotFound` (`ENOENT`)! `c.txt` only stored the text string `"a.txt"`, which now resolves to nothing (**dangling symlink**).
:::

:::exercise practice Choosing `mmap` vs `BufReader` for two real Rust tools
1. A tool scanning 50 GiB of sequential compressed log files once from start to finish on a 16 GiB RAM machine.
2. A search daemon (`tantivy`) performing millions of random 64-byte lookups across an immutable 4 GiB inverted index file that never gets truncated while running.
Which tool should use `BufReader` / sequential `read()`, and which shines with `mmap`?
::hint
Think about page-table TLB thrashing + minor/major faults vs syscall-free random reads!
::solution
1. **Sequential 50 GiB log scan:** Use streaming **`BufReader`** (sequential `read()` reuses one tiny 64 KiB buffer, activates kernel read-ahead cleanly, avoids mapping 50 GiB of virtual address space / page-table entries, and has zero `unsafe`!).
2. **Random lookups in immutable 4 GiB index:** **`mmap`** shines here—once warm in the OS Page Cache, millions of random slice lookups compile to direct DRAM loads with zero `read()`/`lseek()` syscalls and zero double-buffering copies!
:::

:::exercise challenge Why does `atomic_write_file` create its `.tmp` file inside the **same directory** as the target instead of `/tmp`?
Explain why placing `.tmp` in `/tmp/settings.tmp` and calling `fs::rename("/tmp/settings.tmp", "/var/lib/app/settings.toml")` fails on many Linux systems with `EXDEV` (*Invalid cross-device link*)!
::hint
Recall how POSIX `rename()` actually works inside a file system: does it copy bytes across disks, or swap a directory pointer to an **inode** inside one mounted filesystem?
::solution
`/tmp` is often a separate mounted filesystem (`tmpfs` in RAM) from `/var/lib/app` (`ext4` on NVMe). Because `rename()` only atomically moves an **inode reference** inside a single mounted filesystem (zero byte copying!), renaming across mount points is impossible and returns **`EXDEV`**. Putting the temp file right next to the destination inside the same directory guarantees both live on the exact same mount so `rename()` is 100% atomic and O(1)!
:::

:::recap
- **VFS** maps paths through **dentries -> inodes -> disk extents**; hard links share the same inode (`nlink`), while symlinks store path text.
- **Linux Page Cache** caches disk blocks across unused DRAM and handles read-ahead and dirty writeback automatically.
- **Crash-safe file saves** write a same-directory temp file, call `sync_all()`, call atomic `fs::rename()`, and sync the parent directory; **journaling / CoW** protects file-system metadata itself.
- **`mmap`** eliminates user-kernel byte copies and syscalls by mapping Page Cache frames directly into virtual memory—fast for immutable indexes, yet `unsafe` in Rust due to external mutation and `SIGBUS` truncation hazards.
:::

:::quiz Check your understanding
? Why can modifying a file via `std::fs::write("config.json", ...)` corrupt or empty the file on a sudden crash or power loss?
- Rust compresses files on drop
+ `fs::write` opens with `O_TRUNC` (emptying the file to 0 bytes first) before writing new bytes, leaving an empty or half-written file if interrupted
- Linux forbids writing JSON files sequentially
- `write()` skips the page cache
= Crash-safe updates write to a same-directory temporary file, `sync_all()`, and atomically `rename()` over the target.

? Why must the temporary file used for atomic `fs::rename` live in the **same directory/filesystem** as the destination file?
- `std::fs::rename` only accepts hidden dotfiles starting with `.`
+ `rename()` atomically updates a directory pointer to an existing inode within one filesystem; crossing filesystems (`/tmp` -> `/home`) fails with `EXDEV`
- Otherwise `fs::write` cannot flush buffers
- Linux denies permissions in `/tmp`
= Same-filesystem `rename()` is an atomic O(1) metadata swap, not a byte copy.

? Why is creating a `&[u8]` slice directly over a memory-mapped file (`memmap2::Mmap`) marked `unsafe` in Rust?
- `mmap` allocates memory slower than `malloc`
+ If another process writes to or truncates the mapped file underneath, Rust's `&[u8]` mutates behind a shared borrow (UB) or crashes with `SIGBUS`
- `mmap` bypasses virtual memory addresses
- `mmap` cannot read UTF-8 strings
= The OS cannot stop external processes from modifying or shrinking mapped files while Rust assumes `&[u8]` is immutable and valid.

? When `free -h` on Linux shows `0` MB completely free because `buff/cache` holds 12 GB, what happens when a Rust app calls `Vec::with_capacity(4 GiB)` and writes to it?
- The app crashes immediately with Out-Of-Memory
+ The kernel immediately reclaims clean Page Cache frames in microseconds to back the application's new memory
- Every file on disk is deleted
- The app swaps directly to HDD
= Clean Page Cache RAM is opportunistically borrowed idle memory that Linux hands back immediately on demand.
:::
