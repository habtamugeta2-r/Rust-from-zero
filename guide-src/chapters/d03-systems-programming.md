@id systems-programming
@part def
@title Systems Programming
@short Systems programming
@level advanced
@time 90
@learn Lay out structs for the C ABI and explain padding, alignment and `repr` | Write sound `unsafe` code with raw pointers, FFI and clear safety contracts | Build, inspect and control processes, files, signals and memory maps | Use SIMD, inline assembly, custom allocators and panic hooks where they are justified | Cross-compile, read debug symbols and debug a crash with GDB or LLDB

Systems programming is where Rust earns its reputation: no garbage collector,
predictable layout, direct access to the operating system, and a compiler that
still checks most of what you write. This chapter covers the tools that let you
leave the safety of the standard library deliberately. The library's [unsafe
chapter](#unsafe), [FFI chapter](#ffi), [memory-layout
chapter](#memory-layout) and [Linux systems lab](#linux-systems-lab) go deeper;
this chapter is the practical tour.

:::analogy A workshop with sharp tools
Safe Rust is a workshop where every blade is retracted until you ask for it.
`unsafe` does not remove the blade guards from the whole workshop; it opens one
guard for one block of code, and you become responsible for that block. The
compiler still type-checks it, still borrow-checks the safe parts, and still
requires you to document why the block is sound.
:::

:::compare Safe Rust, unsafe Rust and C
Safe Rust enforces its invariants at compile time. `unsafe` Rust keeps the type system but moves specific obligations (aliasing, initialisation, validity) to the programmer, who must document them. C has no such contract: the compiler assumes nothing and checks nothing. FFI is the boundary where the three meet, so the C ABI, ownership and error conventions must be written down and tested on both sides.
:::


## 3.1 Memory layout, alignment and padding

Every type has a size and an alignment. The alignment is the address multiple
that the hardware and ABI require; the compiler inserts **padding** so each
field starts at a correctly aligned offset, and the struct's size is rounded up
to a multiple of its alignment so arrays work.

```rust
use std::mem::{align_of, offset_of, size_of};

#[repr(C)]
struct COrder {
    tag: u8,
    value: u32,
    flag: u8,
}

struct RustOrder {
    tag: u8,
    value: u32,
    flag: u8,
}

#[repr(packed)]
struct Packed {
    tag: u8,
    value: u32,
}

#[repr(transparent)]
struct Wrapper(u32);

#[repr(C, align(16))]
struct Aligned16 {
    bytes: [u8; 4],
}

fn main() {
    println!("{} {}", size_of::<COrder>(), align_of::<COrder>());
    println!("{} {}", size_of::<RustOrder>(), align_of::<RustOrder>());
    println!("{} {}", size_of::<Packed>(), align_of::<Packed>());
    println!("{} {}", size_of::<Wrapper>(), size_of::<u32>());
    println!("{} {}", size_of::<Aligned16>(), align_of::<Aligned16>());

    println!("value at {}", offset_of!(COrder, value));
}
```

`#[repr(C)]` uses the C ABI's field order and padding rules; it is mandatory at
an FFI boundary and when the layout is part of a file format. The default
`repr(Rust)` may reorder fields to reduce padding, so `size_of::<RustOrder>()`
is often 8 bytes while a naive C layout is 12. `#[repr(packed)]` removes all
padding, which makes unaligned field access unsafe: taking `&packed.value` is
undefined behaviour unless you copy the field out. `#[repr(transparent)]`
guarantees the wrapper has exactly the layout of its single non-zero-sized
field, which is correct for newtypes passed across FFI. `#[repr(align(N))]`
raises alignment, useful for cache-line separation. Use `offset_of!` rather
than hard-coding offsets; the [memory-layout chapter](#memory-layout) draws the
byte maps.

## 3.2 Stack and heap allocation

The **stack** is LIFO memory managed by moving the stack pointer. Allocation is
a subtraction, deallocation an addition; it is deterministic and fast, and the
size must be known at compile time. The **heap** is a general-purpose allocator
from which arbitrary-sized blocks are requested at run time; `Box`, `Vec`,
`String`, `Rc` and `Arc` own heap memory.

```rust
fn stack_value() -> i32 {
    let array = [0_u8; 1024]; // 1 KiB on the stack
    array[0] as i32
}

fn heap_value() -> Vec<u8> {
    vec![0; 1024] // 1 KiB on the heap, 24 bytes of Vec metadata on the stack
}

fn main() {
    let _ = stack_value();
    let buffer = heap_value();
    println!("{} {}", std::mem::size_of_val(&buffer), buffer.len());

    // A boxed slice keeps the length beside the pointer.
    let boxed: Box<[u8]> = vec![0; 1024].into_boxed_slice();
    println!("{}", boxed.len());
}
```

A stack frame is released when the function returns; a heap allocation lives
until its owner drops. Recursion consumes stack frames, so deep recursion can
overflow the stack; the main thread's stack is typically 8 MiB on Linux, and a
spawned thread's stack is 2 MiB unless configured with `thread::Builder`. Large
arrays should be boxed to avoid copying them onto the stack. The [memory
chapter](#memory) and [allocators chapter](#allocators-heap-internals) follow
the actual addresses, page faults and allocator metadata.

## 3.3 Custom allocators

The global allocator is a type implementing `GlobalAlloc`. `#[global_allocator]`
installs it for the whole program. A custom allocator can add accounting, use a
different backing allocator, or serve a `no_std` target, but it must uphold the
contract: `alloc` returns a block aligned to `layout.align()` and large enough
for `layout.size()`, and `dealloc` receives exactly the layout that was
allocated.

```rust
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

struct Counting;

static ALLOCATED: AtomicUsize = AtomicUsize::new(0);
static ALLOCATIONS: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        ALLOCATED.fetch_add(layout.size(), Ordering::Relaxed);
        ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
        // SAFETY: the layout is passed through unchanged to the system
        // allocator, which satisfies the GlobalAlloc contract.
        unsafe { System.alloc(layout) }
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        ALLOCATED.fetch_sub(layout.size(), Ordering::Relaxed);
        // SAFETY: `pointer` came from `System.alloc` with this layout.
        unsafe { System.dealloc(pointer, layout) }
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

fn main() {
    let data = vec![0_u8; 4096];
    println!("{} bytes live", ALLOCATED.load(Ordering::Relaxed));
    drop(data);
    println!("{} allocations", ALLOCATIONS.load(Ordering::Relaxed));
}
```

Real allocators such as `jemallocator`, `mimalloc` and `snmalloc` are installed
the same way. The unstable `Allocator` trait generalises allocation to
collections (`Vec::new_in(allocator)`), which is what `allocator-api2` and
`bumpalo` use on stable. A bump allocator is the simplest useful custom
allocator: increment a pointer, and free everything at once. It is fast for
request-scoped data and unsuitable when individual frees matter. The
[allocators chapter](#allocators-heap-internals) builds one and explains
fragmentation and alignment.

## 3.4 Unsafe Rust

`unsafe` unlocks five powers: dereferencing raw pointers, calling `unsafe`
functions, accessing mutable statics, implementing `unsafe` traits, and
accessing fields of `union`s. It does not disable the borrow checker, type
checker or lifetime checks. Every `unsafe` block should have a **safety
comment** stating the invariant that makes it sound.

```rust
fn split_at_mut<T>(values: &mut [T], index: usize) -> (&mut [T], &mut [T]) {
    let length = values.len();
    let pointer = values.as_mut_ptr();
    assert!(index <= length, "index out of bounds");

    // SAFETY: the two ranges [0, index) and [index, length) are disjoint, and
    // the returned lifetimes are tied to the input borrow. The caller cannot
    // observe two mutable references to the same element.
    unsafe {
        (
            std::slice::from_raw_parts_mut(pointer, index),
            std::slice::from_raw_parts_mut(pointer.add(index), length - index),
        )
    }
}

unsafe trait Trusted {
    fn trusted(&self) -> bool;
}

struct Checked;

// SAFETY: `Checked` has no invariants that can be violated from safe code.
unsafe impl Trusted for Checked {
    fn trusted(&self) -> bool {
        true
    }
}

fn main() {
    let mut numbers = [1, 2, 3, 4];
    let (left, right) = split_at_mut(&mut numbers, 2);
    left[0] = 9;
    right[0] = 8;
    println!("{left:?} {right:?}");
    println!("{}", Checked.trusted());
}
```

Raw pointers (`*const T`, `*mut T`) are not checked for null, alignment,
lifetime or aliasing. Creating them is safe; dereferencing is not. A reference
created from a raw pointer must point to a live, aligned, initialised value,
and mutable references must be unique for their lifetime. `unsafe fn` shifts
the obligation to the caller; document the preconditions in a `# Safety`
section. `unsafe trait` marks a trait whose implementation carries a safety
invariant (`Send`, `Sync`, `GlobalAlloc`), so `unsafe impl` is a promise. Run
`cargo miri test` to catch undefined behaviour that ordinary tests miss; the
[unsafe chapter](#unsafe) and [pointers chapter](#pointers-safety-caches) cover
provenance, stacked borrows and `MaybeUninit`.

## 3.5 FFI: calling C from Rust, calling Rust from C

Rust can call C functions through `extern "C"` declarations, and expose Rust
functions to C with `#[unsafe(no_mangle)]` and an `extern "C"` ABI. Since Rust
2024, `no_mangle` is itself unsafe because symbol collisions are a soundness
hazard.

```rust
use std::ffi::{c_char, c_int, CStr, CString};

unsafe extern "C" {
    fn abs(input: c_int) -> c_int;
    fn strlen(text: *const c_char) -> usize;
}

#[unsafe(no_mangle)]
pub extern "C" fn double_input(value: i32) -> i32 {
    value * 2
}

/// # Safety
/// `text` must be a valid, NUL-terminated C string.
unsafe fn c_length(text: *const c_char) -> usize {
    // SAFETY: the caller promised a valid C string.
    unsafe { strlen(text) }
}

fn main() {
    // SAFETY: `abs` has no preconditions.
    println!("{}", unsafe { abs(-7) });

    let text = CString::new("hello").unwrap();
    // SAFETY: `text` owns a NUL-terminated buffer that outlives the call.
    println!("{}", unsafe { c_length(text.as_ptr()) });

    // SAFETY: the pointer is valid for the duration of this borrow.
    let borrowed = unsafe { CStr::from_ptr(text.as_ptr()) };
    println!("{:?}", borrowed.to_str().unwrap());
}
```

Rules for a stable C boundary: use `#[repr(C)]` for structs, avoid `String`,
`Vec` and trait objects in signatures, use `CString`/`CStr` for text, and never
let a Rust panic unwind into C (`catch_unwind` or `panic = "abort"`). Returning
an owned Rust allocation to C requires a matching free function, because C will
call `free` while Rust used its own allocator. `Option<&T>` and `Option<Box<T>>`
are nullable-pointer-sized thanks to the null niche, but `Option<u32>` is not
`0`-representable, so use a sentinel or an out-parameter. On Windows, `extern
"system"` selects the platform's calling convention. The [FFI chapter](#ffi)
covers symbol visibility, `cbindgen` output and ABI bugs.

## 3.6 C++ interop with `cxx`

The `cxx` crate generates a safe bridge between Rust and C++. You describe the
shared API in a `#[cxx::bridge]` module; `cxx` generates the C++ header, the
Rust glue and the FFI checks.

```rust
#[cxx::bridge]
mod ffi {
    struct Point {
        x: f64,
        y: f64,
    }

    extern "Rust" {
        fn distance(a: Point, b: Point) -> f64;
    }

    unsafe extern "C++" {
        include!("demo/include/engine.h");
        type Engine;
        fn start(engine: &mut Engine, point: Point);
        fn name(engine: &Engine) -> String;
    }
}

fn distance(a: ffi::Point, b: ffi::Point) -> f64 {
    ((a.x - b.x).powi(2) + (a.y - b.y).powi(2)).sqrt()
}
```

`cxx` supports shared structs, `String`, `Vec`, slices, `UniquePtr`, `Box`,
enums, results that map to exceptions, and opaque C++ types. It does not make
arbitrary C++ safe: types must be labelled and the build script must compile the
C++ side (`cc::Build`). For a C API with manual headers, `bindgen` is the
alternative; for an existing C++ library with a stable C API, bind to the C API
and skip C++ interop entirely. The [FFI chapter](#ffi) compares `cxx`, `bindgen`
and hand-written shims.

## 3.7 `bindgen` and `cbindgen`

**`bindgen`** reads C/C++ headers and generates Rust `extern` declarations.
**`cbindgen`** reads Rust source and generates a C/C++ header for the exported
API. Both run in `build.rs` or as standalone tools.

```rust
// build.rs
fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");

    let bindings = bindgen::Builder::default()
        .header("wrapper.h")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .allowlist_function("math_.*")
        .generate()
        .expect("generate bindings");

    let out = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
    bindings.write_to_file(out.join("bindings.rs")).unwrap();
}
```

```toml
# cbindgen.toml
language = "C"
include_guard = "DEMO_H"
```

```sh
cbindgen --config cbindgen.toml --crate demo --output include/demo.h
```

Keep generated bindings out of hand-edited paths, pin the bindgen version, and
run the generator in CI so the checked-in header cannot drift. `bindgen` is
unsafe by construction: every function is an `unsafe extern` call, and the
header's invariants become your responsibility. `cbindgen` is the safer side:
it documents what you already export, and it fails when a type cannot cross the
boundary.

## 3.8 OS-level I/O: files, directories, paths and metadata

`std::fs` and `std::path` cover the common surface: `Path` and `PathBuf` for
paths, `File` and `OpenOptions` for handles, `read_dir` for directories,
`metadata` for permissions and timestamps, and `symlink_metadata` when you must
not follow a link.

```rust
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

fn write_lines(path: &Path, lines: &[&str]) -> io::Result<()> {
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    for line in lines {
        writeln!(file, "{line}")?;
    }
    file.sync_all() // durability, not just visibility to other processes
}

fn read_lines(path: &Path) -> io::Result<Vec<String>> {
    let file = File::open(path)?;
    BufReader::new(file).lines().collect()
}

fn main() -> io::Result<()> {
    let directory = PathBuf::from("demo-data");
    fs::create_dir_all(&directory)?;
    let path = directory.join("greetings.txt");

    write_lines(&path, &["hello", "world"])?;
    println!("{:?}", read_lines(&path)?);

    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        println!(
            "{:?} {} bytes dir={} readonly={}",
            entry.file_name(),
            metadata.len(),
            metadata.is_dir(),
            metadata.permissions().readonly()
        );
    }

    // Paths are not strings: non-UTF-8 file names exist on Unix.
    println!("{}", path.extension().and_then(|e| e.to_str()).unwrap_or(""));
    println!("{}", path.with_extension("log").display());

    fs::remove_file(&path)?;
    fs::remove_dir(&directory)?;
    Ok(())
}
```

Paths are `OsStr`, not `str`, because Unix paths are arbitrary bytes. Use
`Path::display()` for messages and `to_str()` only when you genuinely require
UTF-8. Opening a file does not make its contents durable: `write` reaches the
page cache, `sync_all` (or `fsync`) reaches the device. To replace a file
atomically, write a temporary file in the same directory, `sync_all` it, then
`rename` it over the target. `read_dir` order is unspecified; sort if the order
mattered to a human. The [storage chapter](#filesystems-cache-mmap) explains
inodes and the page cache.

## 3.9 Process management

`std::process::Command` starts a child process with an explicit argument
vector, environment and working directory. Use piped stdin/stdout/stderr to
communicate; never build a shell string from untrusted input.

```rust
use std::io::Write;
use std::process::{Command, Stdio};

fn main() -> std::io::Result<()> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("printf 'hello from child'")
        .output()?;
    println!("status={} stdout={:?}", output.status, String::from_utf8_lossy(&output.stdout));

    let mut child = Command::new("cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()?;

    {
        let stdin = child.stdin.as_mut().expect("piped stdin");
        stdin.write_all(b"piped text")?;
    } // close stdin so `cat` sees EOF
    let finished = child.wait_with_output()?;
    println!("{}", String::from_utf8_lossy(&finished.stdout));

    let status = Command::new("false").status()?;
    println!("success={}", status.success());
    Ok(())
}
```

`output()` captures both streams and waits; `spawn()` lets you interact. Writing
to `child.stdin` requires it to be piped, and `wait_with_output` closes stdin
before waiting. `status.success()` inspects the exit code; a signal termination
has a different representation. `Command::env_clear()` gives a child a
predictable environment, which is a common hardening step for build tooling.
For a timeout, implement a wait loop with `try_wait`, or use the `wait-timeout`
crate; the standard library has no `wait(timeout)`.

## 3.10 Signal handling

Signals interrupt a process asynchronously. A signal handler must do almost
nothing: it may set an atomic flag or write to a self-pipe, not allocate, lock
or print. The `signal-hook` and `ctrlc` crates provide safe wrappers.

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

fn main() {
    let running = Arc::new(AtomicBool::new(true));
    signal_hook::flag::register(signal_hook::consts::SIGINT, Arc::clone(&running))
        .expect("register SIGINT");

    while running.load(Ordering::Relaxed) {
        std::thread::sleep(Duration::from_millis(50));
    }
    println!("shutting down cleanly");
}

// Simpler for a console program: ctrlc::set_handler(|| shutdown.store(true, ...)).
```

`SIGINT` is Ctrl-C, `SIGTERM` is a polite termination request, `SIGHUP` often
means "reload configuration", and `SIGKILL` cannot be caught. A graceful
shutdown sets a flag, stops accepting work, drains tasks and then exits; section
4.42 applies the same pattern to a web server. `signal_hook_tokio` integrates
signals with an async runtime. Do not call `std::process::exit` from a handler;
it skips destructors and buffered output.

## 3.11 Memory-mapped files

`memmap2` maps a file into the address space, so reads and writes become memory
accesses handled by the page cache. It is excellent for large read-only indexes
and for shared memory; it is a poor fit for a file that another process may
truncate, because accessing a mapped page beyond the new length is undefined
behaviour.

```rust
use std::fs::OpenOptions;
use memmap2::Mmap;

fn main() -> std::io::Result<()> {
    let path = "demo-map.bin";
    std::fs::write(path, b"0123456789abcdef")?;

    let file = OpenOptions::new().read(true).write(true).open(path)?;
    // SAFETY: no other process truncates or writes this file while mapped.
    let mut map = unsafe { Mmap::map(&file)? };

    println!("{:?}", &map[..4]);
    map[4..8].copy_from_slice(b"WXYZ");
    map.flush()?;
    println!("{:?}", &map[4..8]);

    std::fs::remove_file(path)?;
    Ok(())
}
```

Mapping does not copy the file; a page fault loads the needed 4 KiB page on
demand, and the OS may evict it later. Writes are visible to other mappings of
the same file but become durable only after `flush` or `sync`. `MmapMut` is the
mutable form. Use a mapping for read-mostly data, an index or an arena; use
ordinary buffered I/O for append-heavy logs and small files. The [filesystems
chapter](#filesystems-cache-mmap) explains the page cache and `msync`.

## 3.12 SIMD intrinsics

Single instruction, multiple data processes several values per instruction.
Stable Rust exposes target intrinsics in `std::arch`; the portable SIMD API
(`std::simd`) is nightly-only, and libraries such as `wide` or `pulp` hide the
difference.

```rust
#[cfg(target_arch = "x86_64")]
fn add_four(a: &[i32; 4], b: &[i32; 4]) -> [i32; 4] {
    use std::arch::x86_64::*;

    // SAFETY: SSE2 is guaranteed on x86_64, and the loads read exactly 16
    // bytes from each input array.
    unsafe {
        let left = _mm_loadu_si128(a.as_ptr().cast());
        let right = _mm_loadu_si128(b.as_ptr().cast());
        let sum = _mm_add_epi32(left, right);
        let mut output = [0_i32; 4];
        _mm_storeu_si128(output.as_mut_ptr().cast(), sum);
        output
    }
}

fn main() {
    #[cfg(target_arch = "x86_64")]
    println!("{:?}", add_four(&[1, 2, 3, 4], &[10, 20, 30, 40]));

    #[cfg(not(target_arch = "x86_64"))]
    println!("SIMD example is x86_64-only");
}
```

Use `is_x86_feature_detected!("avx2")` before calling AVX2 intrinsics and
provide a scalar fallback, or compile with `-C target-cpu=native` when the
binary is built for the machine that runs it. Alignment matters: `_mm_load_si128`
requires 16-byte alignment, while `loadu` does not. Vectorisation also happens
automatically: LLVM turns simple loops over slices into SIMD when it can prove
the bounds and aliasing. Measure before hand-writing intrinsics; the [SIMD and
caches chapter](#cache-coherency-atomics-simd) shows the generated assembly.

## 3.13 Inline assembly

`asm!` embeds target assembly in a function. It is unstable on most targets in
stable Rust; the stable interface is `std::arch::asm!` on x86-64, ARM64 and
RISC-V as of recent versions, with target-specific constraints. Treat it as a
last resort for CPU features that have no intrinsic.

```rust
#[cfg(target_arch = "x86_64")]
fn read_cycle_counter() -> u64 {
    let low: u32;
    let high: u32;
    // SAFETY: RDTSC is available on all x86_64 CPUs and has no memory effects;
    // it is not a serialising instruction, so it measures an approximation.
    unsafe {
        std::arch::asm!(
            "rdtsc",
            out("eax") low,
            out("edx") high,
            options(nomem, nostack, preserves_flags)
        );
    }
    ((high as u64) << 32) | low as u64
}

fn main() {
    #[cfg(target_arch = "x86_64")]
    println!("{}", read_cycle_counter());
}
```

Declare every register and memory effect honestly: `options(nomem)` promises no
memory access, `nostack` promises no stack use, `preserves_flags` promises the
flags are unchanged. A missing clobber is a miscompile. Inline assembly is not
portable, not checked by the borrow checker, and hard to review; prefer
intrinsics, then `core::arch`, then a separate assembly file linked with the
build script.

## 3.14 Custom panic handlers and OOM handlers

A panic unwinds by default. `panic = "abort"` in the release profile makes it
abort instead, which shrinks the binary and removes landing pads. You can
install a hook to log a panic, and in `no_std` you must define
`#[panic_handler]`.

```rust
use std::panic;

fn main() {
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        eprintln!("fatal: {info}");
        previous(info);
    }));

    let result = panic::catch_unwind(|| {
        let values = vec![1, 2, 3];
        values[9]
    });
    println!("caught={}", result.is_err());
}
```

`catch_unwind` requires the closure to be `UnwindSafe`; it is for isolating a
plugin or a worker, not for ordinary error handling. A panic hook runs on the
panicking thread and must not allocate if the panic came from an allocation
failure. An **out-of-memory** condition aborts by default. `#[alloc_error_handler]`
on nightly can customise `alloc` failures in `no_std`; on stable with `std`,
the allocator calls `handle_alloc_error`, which aborts. A custom allocator can
return null and let the runtime abort, but it cannot recover: Rust's collections
do not have a fallible-allocation API on stable. Design services to bound memory
(bounded channels, request limits) rather than to catch OOM.

## 3.15 Linker scripts and build scripts

`build.rs` runs before the crate is compiled. It can generate code, compile C
or C++, set linker arguments and emit `cargo:` directives. For embedded and
kernel work it also selects a linker script that places sections at fixed
addresses.

```rust
// build.rs
use std::env;
use std::path::PathBuf;

fn main() {
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());
    let target = env::var("TARGET").unwrap();

    let generated = format!("pub const TARGET: &str = {target:?};\n");
    std::fs::write(out.join("target.rs"), generated).unwrap();

    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=memory.x");
    println!("cargo:rustc-link-arg=-Tmemory.x");
    println!("cargo:rustc-link-search={}", out.display());
}
```

```rust
// src/main.rs
include!(concat!(env!("OUT_DIR"), "/target.rs"));

fn main() {
    println!("built for {TARGET}");
}
```

A linker script such as `memory.x` for a Cortex-M part declares `FLASH` and
`RAM` origins and lengths, and places `.vector_table`, `.text`, `.rodata`,
`.data` and `.bss`. Getting the sections wrong produces a binary that boots to a
hard fault. `cargo:rustc-link-arg` is passed only to the final binary link, not
to dependencies; `cargo:rustc-link-lib` adds a native library. Keep build
scripts deterministic and free of network access so that reproducible builds
stay possible (section 9.14).

## 3.16 Cross-compilation targets and toolchains

A **target triple** names the CPU, vendor and OS/ABI: `x86_64-unknown-linux-gnu`,
`aarch64-unknown-linux-musl`, `thumbv7em-none-eabihf`,
`wasm32-unknown-unknown`. Rust ships the standard library for many triples;
`rustup target add <triple>` installs it.

```toml
# .cargo/config.toml
[target.aarch64-unknown-linux-musl]
linker = "aarch64-linux-musl-gcc"
rustflags = ["-C", "target-feature=+crt-static"]

[target.thumbv7em-none-eabihf]
runner = "probe-rs run --chip STM32F411RETx"
```

```sh
rustup target add aarch64-unknown-linux-musl
cargo build --target aarch64-unknown-linux-musl --release
# Or let `cross` provide the linker and sysroot in a container:
cargo install cross
cross build --target aarch64-unknown-linux-musl --release
```

`cross` uses Docker images with the right sysroot; `cargo-zigbuild` uses Zig as
a cross linker and needs no container; `musl` targets produce statically linked
Linux binaries that run on any distribution with the same kernel ABI. For
embedded, the target has no operating system, so `std` is unavailable and the
program needs `#![no_std]` and a panic handler ([chapter D8](#embedded-iot)). Always test the
produced artefact on the target or in an emulator (`qemu-user`), not only check
that it compiled.

## 3.17 Core dumps and debugging with GDB/LLDB

Compile with debug information (`debug = true`, the default in dev), keep the
binary and its symbols, and reproduce the crash. A **core dump** captures the
process memory at the moment of a fatal signal and can be inspected after the
fact.

```sh
ulimit -c unlimited
cargo build
./target/debug/demo            # crashes, writes core
coredumpctl list               # systemd-coredump
gdb ./target/debug/demo core
```

```text
(gdb) bt                 # backtrace, all threads with `thread apply all bt`
(gdb) frame 2            # select a frame
(gdb) info locals        # variables in that frame
(gdb) p *pointer         # inspect memory
(gdb) x/16xb address     # hex dump
```

Rust ships `rust-gdb` and `rust-lldb` wrappers that load pretty-printers for
`String`, `Vec` and enums. Useful settings: `set print pretty on`,
`break src/main.rs:42`, `run`, `next`, `step`, `continue`. For a release build,
`debug = 1` keeps line tables without full variable information; `split-debuginfo`
keeps debug files separate for smaller deployed binaries. On Linux,
`/proc/<pid>/maps` shows the address space, `strace -f` shows syscalls and
`perf record` shows where time goes. The [Linux systems lab](#linux-systems-lab)
walks through these tools; [chapter D9](#devops-tooling) covers `cargo-flamegraph` and `divan`.

## Exercises

:::exercise guided A sound `unsafe` split
Implement `fn split_first<T>(values: &mut [T]) -> Option<(&mut T, &mut [T])>`
without using `split_first_mut`, using `as_mut_ptr`, `from_raw_parts_mut` and
`ptr::add`. Write the safety comment, then test it with an empty slice and a
one-element slice.
::hint
Return `None` when `values.is_empty()`. Otherwise take the pointer, build a
one-element slice for the first item and a slice of length `len - 1` starting at
`pointer.add(1)`. The two slices are disjoint, so mutable aliasing is sound.
::solution
```rust
fn split_first<T>(values: &mut [T]) -> Option<(&mut T, &mut [T])> {
    let length = values.len();
    if length == 0 {
        return None;
    }
    let pointer = values.as_mut_ptr();

    // SAFETY: `pointer` is valid for `length` elements. The first slice covers
    // index 0 and the second covers 1..length, so they are disjoint. Both
    // borrows are tied to the input lifetime.
    unsafe {
        let first = &mut *pointer;
        let rest = std::slice::from_raw_parts_mut(pointer.add(1), length - 1);
        Some((first, rest))
    }
}

fn main() {
    let mut empty: [u8; 0] = [];
    assert!(split_first(&mut empty).is_none());

    let mut one = [7_u8];
    let (first, rest) = split_first(&mut one).unwrap();
    *first = 9;
    assert!(rest.is_empty());

    let mut many = [1, 2, 3];
    let (first, rest) = split_first(&mut many).unwrap();
    *first = 10;
    rest[0] = 20;
    println!("{many:?}");
}
```
:::

:::exercise practice Inspect a directory and run a child process
Write a program that takes a directory path, prints every regular file with its
size sorted by name, counts the total bytes, and then runs `wc -c` on the
largest file with `Command`, capturing stdout. Return `io::Result<()>` and
handle a missing directory without panicking.
::hint
`fs::read_dir`, `entry.metadata()?.is_file()`, collect into a `Vec<(String,
u64)>`, sort by the name, and use `Command::new("wc").arg("-c").arg(path).output()`.
Use `?` for I/O and `unwrap_or_default()` for a missing file name.
::solution
```rust
use std::fs;
use std::io;
use std::path::Path;
use std::process::Command;

fn main() -> io::Result<()> {
    let directory = std::env::args().nth(1).unwrap_or_else(|| ".".to_string());
    let mut files = Vec::new();

    for entry in fs::read_dir(Path::new(&directory))? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_file() {
            let name = entry.file_name().to_string_lossy().into_owned();
            files.push((name, metadata.len()));
        }
    }

    files.sort_by(|a, b| a.0.cmp(&b.0));
    let mut total = 0;
    for (name, size) in &files {
        println!("{name} {size}");
        total += size;
    }
    println!("total {total}");

    if let Some((name, _)) = files.iter().max_by_key(|(_, size)| *size) {
        let output = Command::new("wc").arg("-c").arg(name).output()?;
        print!("{}", String::from_utf8_lossy(&output.stdout));
    }
    Ok(())
}
```
:::

:::exercise challenge A counting allocator and a crash report
Install a `GlobalAlloc` that counts live bytes, peak bytes and allocation
count. Use it to compare the allocations made by `Vec::with_capacity(1000)`
against a `Vec` grown by pushing 1,000 integers. Then write a deliberately
panicking program, install a panic hook that prints the location and thread
name, run it under `gdb` or `lldb`, and capture a backtrace. Explain in a
comment why the hook must not allocate.
::hint
Wrap `System` and update atomics in `alloc`, `dealloc` and `realloc`; `realloc`
must account for the difference. `Vec::with_capacity` makes one allocation;
repeated `push` may make about ten. A panic hook runs during unwinding and may
run after a failed allocation, so it should write to stderr with
`write_all`/`eprintln!` only.
::solution
```rust
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

struct Counting;

static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
static COUNT: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() {
            COUNT.fetch_add(1, Ordering::Relaxed);
            let live = LIVE.fetch_add(layout.size(), Ordering::Relaxed) + layout.size();
            PEAK.fetch_max(live, Ordering::Relaxed);
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        LIVE.fetch_sub(layout.size(), Ordering::Relaxed);
        unsafe { System.dealloc(pointer, layout) }
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let new_pointer = unsafe { System.realloc(pointer, layout, new_size) };
        if !new_pointer.is_null() {
            if new_size > layout.size() {
                let live = LIVE.fetch_add(new_size - layout.size(), Ordering::Relaxed)
                    + (new_size - layout.size());
                PEAK.fetch_max(live, Ordering::Relaxed);
            } else {
                LIVE.fetch_sub(layout.size() - new_size, Ordering::Relaxed);
            }
        }
        new_pointer
    }
}

#[global_allocator]
static GLOBAL: Counting = Counting;

fn main() {
    let before = COUNT.load(Ordering::Relaxed);
    let mut preallocated = Vec::with_capacity(1_000);
    for value in 0..1_000 {
        preallocated.push(value);
    }
    let after_preallocated = COUNT.load(Ordering::Relaxed);

    let mut grown = Vec::new();
    for value in 0..1_000 {
        grown.push(value);
    }
    let after_grown = COUNT.load(Ordering::Relaxed);

    println!("preallocated allocations: {}", after_preallocated - before);
    println!("grown allocations: {}", after_grown - after_preallocated);
    println!("peak live bytes: {}", PEAK.load(Ordering::Relaxed));
}
```

Run the second part as a separate binary so the allocator statistics are not
confused by the panic machinery. The hook allocation rule exists because the
panic may have been caused by allocation failure; allocating in the hook can
recurse or abort.
:::

## Quiz

:::quiz Systems programming check
? Why is `#[repr(C)]` required at an FFI boundary?
- It makes the struct faster to access
+ It fixes field order and padding to the C ABI, so both sides agree on offsets
- It removes all padding
- It makes every field public
= The default `repr(Rust)` is free to reorder fields. `repr(C)` is the portable layout contract; `repr(packed)` removes padding and makes unaligned references unsafe.

? What does an `unsafe` block allow that safe Rust does not?
- It disables the borrow checker
+ It permits dereferencing raw pointers, calling unsafe functions and accessing mutable statics, among other operations
- It turns off all compiler checks
- It makes code run faster automatically
= `unsafe` unlocks specific operations. Type, lifetime and trait checks still apply, which is why safety comments and invariants remain necessary.

? What is the correct way to hand a Rust `String` to C?
- Pass the `String` by value
+ Pass `string.as_ptr()` after converting to a `CString` and keep the owner alive for the call
- Cast the `String` to `*mut c_char` and call `free`
- Use `std::mem::forget`
= C expects a NUL-terminated buffer with C lifetime and deallocation rules. `CString` provides that; passing a `String`'s pointer without a length is not a C string.

? Why must a signal handler avoid allocation and locks?
- Signals are delivered only at program start
+ A handler may interrupt code that already holds the allocator or a lock, and async-signal-safety forbids most library calls
- Allocation is slower in a handler
- The kernel blocks allocation during signals
= The handler runs on an arbitrary thread at an arbitrary instruction. Setting an atomic flag or writing to a self-pipe is safe; calling `malloc` or a mutex can deadlock.

? What is the main risk of `memmap2` on a file that another process can truncate?
- The mapping consumes the file
+ Touching a page beyond the new end raises `SIGBUS` or is undefined, so the mapping needs an external lifetime guarantee
- The file becomes read-only
- `flush` cannot be called
= A mapping reflects the file's pages; truncation invalidates them. `memmap2::Mmap::map` is unsafe for this reason. Use it for stable or exclusively owned files.
:::

:::recap
- `repr(C)` fixes layout for FFI; padding and alignment are visible through `size_of`, `align_of` and `offset_of!`.
- Stack allocation is LIFO and deterministic; heap allocation is flexible and owned by smart pointers.
- `GlobalAlloc` installs a program-wide allocator; the contract is exact layout and matching deallocation.
- `unsafe` is a scoped promise; document the invariant and test with Miri where possible.
- `extern "C"`, `CString`/`CStr` and `#[unsafe(no_mangle)]` build a C ABI boundary; panics must not cross it.
- `cxx` bridges C++ with a described shared API; `bindgen` and `cbindgen` generate the two directions of a C header.
- `std::fs`, `Path`, `Command` and signal crates cover files, processes and shutdown.
- Mappings, SIMD, inline assembly, panic hooks and build scripts are tools of last resort when the safe abstraction does not exist.
- Cross-compilation needs a target's standard library, linker and sysroot; test on the target.
- GDB/LLDB plus core dumps turn a crash into a backtrace and a set of locals.
:::
