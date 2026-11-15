@id linking-elf
@part p2
@title Object files, linking, and ELF executables
@short Linking and ELF binaries
@level intermediate
@time 50
@learn Explain what lives inside an object file (.o) and why it cannot run by itself | Distinguish static linking (.a, .rlib) from dynamic linking (.so, PLT/GOT) | Read the structure of an ELF executable: ELF header, sections (.text, .rodata, .data, .bss), and program headers | Inspect real compiled programs using readelf, objdump, nm, and ldd

Compiling a single `.rs` file produces machine instructions, yet those instructions are still missing pieces. Your code calls `println!`, which calls Rust's `std::io::_print`, which eventually calls the C library's `write` symbol—code living in completely separate compiled files. Putting all compiled fragments together and turning them into a file the Linux kernel knows how to load is the job of **linking** and the **ELF executable format**.

## Starting point: why compilation stops at object files first

:::plain Object file vs executable
An **[[object file]]** (`.o` or `.rlib`) is a half-finished building block: it holds compiled machine code for *one* crate or file, with blank placeholders wherever it calls functions from other files. An **executable** (an **[[ELF]]** binary on Linux) is the finished program after the **[[linker]]** joins all object files together and fills in every missing address.
:::

:::analogy Assembling chapters into a bound book
Writing one chapter produces loose pages with cross-references like *"see chapter ??"* because the final page numbers are not fixed yet. You need a bookbinder (**the linker**) to collect every chapter and appendix (`.o` / `.rlib` object files), replace every blank placeholder with its true page number (**relocation**), and wrap everything in a front cover (**the ELF header**) telling readers where page 1 starts.
:::

## Inside an object file (`.o` and `.rlib`)

When the compiler back-end finishes translating a module or crate, it writes an **object file** (`.o`, or packed inside `.rlib` archives for Rust libraries). An object file contains compiled machine code grouped into standard named **sections**, plus metadata explaining unresolved references:

| Section | Contents | Runtime permissions |
|---|---|---|
| `.text` | Executable machine code instructions for your functions | Read + Execute (`R-X`) |
| `.rodata` | Read-only constants: string literals (`"Habtamu"`, `"total = "`), jump tables | Read-only (`R--`) |
| `.data` | Initialised mutable global/static variables (`static mut` or non-zero statics) | Read + Write (`RW-`) |
| `.bss` | Zero-initialised globals—takes **zero bytes on disk**; OS zeros RAM on load! | Read + Write (`RW-`) |
| `.symtab` / `.dynsym` | **Symbol table**: maps function/global names to addresses or `UND` (undefined) | Metadata (not loaded if stripped) |
| `.rela.*` | **Relocation entries**: "patch bytes at offset X once you know final address of `puts`" | Link-time metadata |

Because `.o` files still have unresolved (`UND`) external calls and unplaced addresses, you cannot execute a `.o` file directly.

## Static linking vs dynamic linking

The **linker** (for example `ld`, `lld`, or `mold`) pulls in your object files, dependency crates, and system libraries to resolve every symbol using two strategies:

```text
Static Linking:                              Dynamic Linking:
+--------------------------+                 +--------------------------+
| my_app (ELF executable)  |                 | my_app (ELF executable)  |
|  - main()                |                 |  - main()                |
|  - std::io::_print       |                 |  - std::io::_print       |
|  - libc write/malloc     |  (all baked in) |  - [stub: puts@PLT] ─────┼─┐
+--------------------------+                 +--------------------------+ │
  Larger file, self-contained                                             ▼
                                             /lib/x86_64-linux-gnu/libc.so.6
                                              (shared in RAM across processes!)
```

| Aspect | Static linking (`.a` / `.rlib` / musl static) | Dynamic linking (`.so` on Linux, `.dll` Windows, `.dylib` macOS) |
|---|---|---|
| When libraries are merged | At build time (copied directly into binary) | At program load time by `ld-linux.so` |
| Binary size | Larger | Smaller |
| Deployment portability | Self-contained (zero missing `.so` dependencies on server) | Requires compatible `.so` versions on target machine |
| Memory sharing | Each distinct binary carries its own copy | One physical RAM copy of `libc.so.6` shared across all processes |
| Rust default on Linux | Rust crates link **statically** (`.rlib`), while `libc` links **dynamically** unless targeting `x86_64-unknown-linux-musl` | Default for `libc`, `libm`, `libpthread` on `gnu` Linux targets |

When a dynamically linked program calls a shared-library function such as `printf` or `malloc`, the compiler cannot hard-code its runtime address ([[ASLR]] randomises where `libc.so.6` loads on every run). Instead, the linker routes calls through two small indirection tables:

- **PLT (Procedure Linkage Table):** Tiny executable trampolines in `.plt` (`call printf@PLT`) that jump through a slot in the GOT.
- **GOT (Global Offset Table):** Writable pointers in `.got.plt` patched by the dynamic linker (`ld-linux.so`) with the true runtime addresses in `libc.so.6`.

## The ELF format: sections vs segments

On Linux, object files (`.o`), shared libraries (`.so`), and finished programs are all encoded in **[[ELF]]** (**Executable and Linkable Format**). Every ELF binary begins with a 64-byte **ELF Header** (`readelf -h`):

```text
Offset 0x00:  7f 45 4c 46   02      01         01       ...
              \_________/   |       |          |
              Magic "\x7fELF" 64-bit Little-End ELF v1
  Type:       DYN (Position-Independent Executable, PIE)
  Machine:    Advanced Micro Devices X86-64
  Entry:      0x1070  (virtual address of _start!)
```

An ELF file carries **two different tables** describing its contents for two different audiences:

1. **Section Headers** (used by the **linker & debugger**): fine-grained sections like `.text`, `.rodata`, `.data`, `.bss`, `.symtab`, `.debug_info`.
2. **Program Headers / Segments** (used by the **OS kernel loader**): coarse-grained memory slices (`PT_LOAD`) grouped strictly by **page permissions** (`R`, `R E`, `R W`) and `PT_INTERP` naming `/lib64/ld-linux-x86-64.so.2`.

```text
readelf -l (Program Headers seen by Linux Kernel):
  INTERP  /lib64/ld-linux-x86-64.so.2
  LOAD    Flags: R       (ELF header, .rodata, read-only metadata)
  LOAD    Flags: R E     (.init, .plt, .text executable code)
  LOAD    Flags: R W     (.data, .bss, .got writable globals)
```

:::compare Windows PE and macOS Mach-O
While Linux uses **ELF**, Windows executables use **PE** (**Portable Executable**, `.exe` / `.dll`), and macOS uses **Mach-O**. All three solve the exact same problem: separating read-only constants, read-execute code, read-write data, and dynamic library imports so the operating system can safely map the binary into virtual memory.
:::

## Name mangling in Rust

Because Rust lets two different modules define `fn helper()`—or lets generic `Vec<i32>::push` and `Vec<String>::push` coexist as distinct compiled functions—the linker cannot simply store `"push"` in `.symtab`. Instead, `rustc` encodes crate, module, type, and a disambiguator hash into unique ASCII linker names using **symbol mangling** (such as `_RNvCs...` in v0 mangling):

- `nm -C my_binary` (or `rustfilt`) **demangles** those linker symbols right back into readable Rust paths like `my_crate::add_and_double`.

## Practical experiment: inspect a compiled Rust binary end-to-end

Compile a tiny program with `rustc` and examine all four layers with Linux binutils:

```sh
$ rustc -O hello.rs -o hello
$ file hello
hello: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, ...
$ readelf -h hello          # ELF header: magic bytes, CPU machine, entry point
$ readelf -l hello          # Program headers: PT_INTERP and PT_LOAD (R / R E / RW)
$ readelf -S hello          # Section headers: .text, .rodata, .data, .bss sizes
$ nm -C hello | grep main   # Demangled Rust symbols
$ ldd hello                 # Shared C libraries required at launch
```

And you can even inspect the ELF magic bytes directly in pure Rust! Look at this tiny reader inspecting the first bytes of any running binary on Linux (`/proc/self/exe`):

```rust run nocmp
use std::fs::File;
use std::io::Read;

fn main() -> std::io::Result<()> {
    let mut f = File::open("/proc/self/exe")?;
    let mut header = [0_u8; 20];
    f.read_exact(&mut header)?;

    println!("ELF magic bytes : {:02x?}", &header[0..4]);
    println!("Class (2=64-bit): {}", header[4]);
    println!("Endian (1=LE)   : {}", header[5]);
    let elf_type = u16::from_le_bytes([header[16], header[17]]);
    let machine = u16::from_le_bytes([header[18], header[19]]);
    println!("ELF e_type      : {elf_type} (2=EXEC, 3=PIE/DYN)");
    println!("ELF e_machine   : 0x{machine:02x} (0x3e=x86-64, 0xb7=ARM64)");
    Ok(())
}
```
```output
ELF magic bytes : [7f, 45, 4c, 46]
Class (2=64-bit): 2
Endian (1=LE)   : 1
ELF e_type      : 3 (2=EXEC, 3=PIE/DYN)
ELF e_machine   : 0x3e (0x3e=x86-64, 0xb7=ARM64)
```

Notice `/proc/self/exe` is a Linux kernel link pointing straight to the running Rust executable itself! Every byte matches `readelf -h` exactly.

:::recap
- Compiling a module produces an **object file** (`.o` / `.rlib`) with sections (`.text`, `.rodata`, `.data`, `.bss`), symbol tables, and unresolved relocations.
- **Static linking** copies dependency code directly into the executable; **dynamic linking** leaves external calls routed via the **PLT** and **GOT** for `ld-linux.so` to resolve at startup.
- On Linux, binaries use **ELF**, exposing **section headers** for linkers/debuggers and **program headers (`PT_LOAD`, `PT_INTERP`)** for the OS loader.
- Tools like `readelf`, `objdump`, `nm -C`, and `ldd` let you verify every section, symbol, and dynamic dependency inside any Rust binary.
:::

:::quiz Check your understanding
? Which ELF section holds string literals like `"Habtamu"` and read-only constant tables?
- `.text`
+ `.rodata`
- `.bss`
- `.plt`
= `.rodata` stores read-only constant data, separated from writable `.data` and executable `.text`.

? Why does a large zero-initialised static array (`static BUF: [u8; 1_000_000] = [0; 1_000_000];`) barely increase the size of the compiled file on disk?
- Because Rust compresses arrays with gzip inside `.text`
+ Because zero-initialised globals live in `.bss`, which stores only a size in the header rather than a million zero bytes on disk
- Because `.bss` variables are deleted unless debugged
- Because the array is moved into `libc.so.6`
= The `.bss` section occupies zero bytes in the file payload; the OS loader maps zero-filled memory pages for its `MemSiz` at startup.

? What is the key structural difference between ELF section headers and ELF program headers?
- Section headers are only for ARM64, while program headers are only for x86-64
+ Section headers describe fine-grained linker/debugger sections (`.text`, `.symtab`), while program headers describe coarse page-aligned memory segments (`PT_LOAD`) for the OS loader
- Program headers store source code comments
- Section headers are encrypted by the kernel
= Linkers and debuggers inspect sections (`readelf -S`), while the kernel ELF loader maps `PT_LOAD` segments (`readelf -l`) directly into virtual memory.

? Why does `rustc` mangle symbol names before putting them into object files?
- To stop users from reading source files
+ Because module paths, impl blocks, and monomorphised generics create distinct functions that share short Rust names, while object-file symbol tables require flat unique names
- Because ELF magic numbers forbid lowercase ASCII letters
- To speed up keyboard input
= Name mangling encodes crate, module, and concrete generic types into unique ASCII linker identifiers that `nm -C` can demangle back into readable paths.
:::

:::exercise guided Inspect ELF fields by hand
Look at this 20-byte prefix of an ELF file in hex:
`7f 45 4c 46 02 01 01 00 00 00 00 00 00 00 00 00 03 00 b7 00`
Identify: (1) whether it is 32-bit or 64-bit, (2) its endianness, (3) its `e_type`, and (4) which CPU architecture (`0x00b7`) it targets.
::hint
Byte 4 is class (`1`=32-bit, `2`=64-bit), byte 5 is endianness (`1`=little, `2`=big), bytes 16..18 are little-endian `u16` `e_type`, and bytes 18..20 are little-endian `u16` `e_machine` (`0x3e` = x86-64, `0xb7` = ARM64/AArch64).
::solution
1. Byte 4 = `0x02` → **64-bit (ELF64)**.
2. Byte 5 = `0x01` → **Little-endian**.
3. Bytes 16..17 = `[0x03, 0x00]` in little-endian = `0x0003` → **`ET_DYN` (PIE executable or shared library)**.
4. Bytes 18..19 = `[0xb7, 0x00]` in little-endian = `0x00b7` → **ARM64 (`AArch64`)**.
:::

:::exercise practice Locate static vs read-only data in Rust
Write a small Rust program containing a constant string `"hello"`, an immutable `static` number `1234`, and a mutable `AtomicU64` static counter (`static HITS: AtomicU64 = AtomicU64::new(0);`). Explain which ELF section holds each item—`.rodata`, `.data`, or `.bss`.
::hint
Notice `AtomicU64::new(0)` starts at zero, whereas `"hello"` is immutable read-only text!
::solution
```rust run
use std::sync::atomic::{AtomicU64, Ordering};

static MAGIC: u64 = 0xCAFE_BABE;
static HITS: AtomicU64 = AtomicU64::new(0);

fn main() {
    let label = "hello";
    HITS.fetch_add(1, Ordering::Relaxed);
    println!("{label} 0x{:x} hits={}", MAGIC, HITS.load(Ordering::Relaxed));
}
```
```output
hello 0xcafebabe hits=1
```

- `"hello"` and `static MAGIC: u64` are immutable and non-mutable, so they belong in read-only **`.rodata`** (or inlined as immediate constants if unused by address).
- `static HITS: AtomicU64 = AtomicU64::new(0)` requires interior mutability at runtime (`RW`) and starts at zero, so it sits in **`.bss`** (or **`.data`** if initialised to a non-zero value).
:::

:::exercise challenge Build a mini ELF magic & endianness validator
Write a function `describe_elf_header(bytes: &[u8]) -> Result<String, &'static str>` that validates a slice is at least 20 bytes long, checks the 4-byte `\x7fELF` magic prefix, reads little- vs big-endian `e_machine`, and returns a clean human summary (e.g., `"ELF64 LE x86-64"`). Test it on both a valid x86-64 header and a corrupted slice.
::hint
Slice `bytes.get(0..4)` for `[0x7f, b'E', b'L', b'F']`, check `bytes[4]` (1 or 2) and `bytes[5]` (1 or 2), then decode `e_machine` from `bytes[18..20]` using `from_le_bytes` or `from_be_bytes`.
::solution
```rust run
fn describe_elf_header(bytes: &[u8]) -> Result<String, &'static str> {
    if bytes.len() < 20 {
        return Err("buffer shorter than 20 bytes");
    }
    if &bytes[0..4] != b"\x7fELF" {
        return Err("missing ELF magic");
    }
    let bits = match bytes[4] {
        1 => "ELF32",
        2 => "ELF64",
        _ => return Err("unknown ELF class"),
    };
    let little = match bytes[5] {
        1 => true,
        2 => false,
        _ => return Err("unknown endianness"),
    };
    let raw_mach = [bytes[18], bytes[19]];
    let mach = if little {
        u16::from_le_bytes(raw_mach)
    } else {
        u16::from_be_bytes(raw_mach)
    };
    let arch = match mach {
        0x3e => "x86-64",
        0xb7 => "ARM64",
        0xf3 => "RISC-V",
        _ => "other-arch",
    };
    let end = if little { "LE" } else { "BE" };
    Ok(format!("{bits} {end} {arch}"))
}

fn main() {
    let x86_hdr = [
        0x7f, b'E', b'L', b'F', 2, 1, 1, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        3, 0, 0x3e, 0,
    ];
    println!("{:?}", describe_elf_header(&x86_hdr));
    println!("{:?}", describe_elf_header(b"NOT_ELF_000000000000"));
}
```
```output
Ok("ELF64 LE x86-64")
Err("missing ELF magic")
```

In Part XII's hands-on Linux lab, you will expand this tiny parser into a full ELF64 reader that inspects section and program headers directly from disk!
:::
