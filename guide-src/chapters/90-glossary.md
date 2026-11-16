@id glossary
@part app
@kind appendix
@title Glossary
@short Glossary
@level all
@time 25

Use this glossary when a technical term is unfamiliar or when you want to find where the guide discusses it. Definitions are brief orientation, not a replacement for the linked chapter's fuller explanation. Type a word in the filter to narrow the entries.

:::glossary
ABI :: The exact rules by which compiled code calls other compiled code: where arguments go, how values are laid out. The C ABI is the common language between programming languages. See [chapter 37](#ffi) and [chapter 45](#calling-conventions-execution).
aliasing :: Reaching the same value through more than one name. Rust allows it only while nobody changes the value. See [chapter 15](#borrowing).
alignment :: The rule that a value must start at an address divisible by a certain number, usually its size. It is the reason for padding inside structs. See [chapter 38](#memory-layout).
allocation :: Asking for a block of memory on the heap. It takes time, so fast code avoids doing it in a loop. See [chapter 42](#allocators-heap-internals) and [chapter 74](#performance).
ALU :: Arithmetic Logic Unit: the circuitry inside a CPU core that executes integer addition, subtraction, shifts, and bitwise logic on registers. See [chapter 2](#hardware-architecture).
API :: The set of functions and types that a library or a web service offers to its users.
argument :: A value that is passed to a function in a call. The function receives it in a parameter.
ALPN :: Application-Layer Protocol Negotiation: the TLS extension in `ClientHello` that lists the application protocols a client speaks (`h2`, `http/1.1`, `h3`), so the server picks one without an extra round trip. See [chapter 63](#dns-http-tls-trace).
ARP :: Address Resolution Protocol: the local network broadcast protocol that translates an IPv4 address (such as `192.168.1.1`) into a hardware Ethernet MAC address on the same local network. See [chapter 61](#network-layers-ethernet-ip).
array :: A list with a fixed length, known at compile time, whose elements all have the same type: `[i32; 3]`. See [chapter 9](#types).
ASLR :: Address Space Layout Randomisation: shuffling where `.text`, heap, shared libraries, and stack map in virtual memory on every launch. See [chapter 41](#virtual-memory-address-spaces) and [chapter 44](#program-loading-startup).
assembly :: The human-readable spelling of machine-code instructions, such as `mov eax, edi`. Each line stands for one instruction. See [chapter 6](#assembly-machine-code) and [the silicon appendix](#under-the-hood).
AST :: Abstract Syntax Tree: the structured tree of expressions, statements, and items produced when the parser reads tokens of source code. See [chapter 5](#compilation-pipeline).
associated function :: A function that belongs to a type but has no `self` parameter, called as `Type::name()`. `String::new()` is one.
associated type :: A type that a trait leaves open and each implementation fills in, such as `Item` in `Iterator`. See [chapter 33](#advanced-traits).
async :: A way to write code that waits (for the network, for a timer) without blocking a thread. An `async fn` returns a future. See [chapter 57](#async).
atomic :: A type whose operations happen in one indivisible step, so that several threads can use it without a lock. See [chapter 56](#shared-state).
attribute :: An instruction for the compiler written above an item, such as `#[derive(Debug)]` or `#[test]`.
backtrace :: The list of function calls that were active when a program panicked. Switch it on with `RUST_BACKTRACE=1`.
benchmark :: A measurement of how long a piece of code takes, repeated often enough to be trusted. See [chapter 74](#performance).
binary :: A file that the computer can run directly. Also called an executable or a program file.
binding :: A name attached to a value. `let x = 5;` binds the name `x` to 5.
bit :: The smallest unit of data: 0 or 1. Eight bits make a byte.
block :: Code between `{` and `}`. A block is an expression: its value is the value of its last expression.
block alignment :: The rule that a device transfers and a file system allocates in fixed units (`512` B or `4 KiB` sectors, `4 KiB` pages), so a small write still costs a whole block. See [chapter 66](#storage-hardware-blocks).
boolean :: A value of type `bool`, which is either `true` or `false`. Every `if`, `while` and `match` guard needs one. See [chapter 6](#control-flow).
borrow checker :: The part of the compiler that checks the rules for references: many readers or one writer, and no reference outlives its value. See [chapter 15](#borrowing).
borrowing :: Using a value through a reference, without becoming its owner.
bound :: A requirement on a type parameter: `T: Display` means "any type `T` that can be printed". See [chapter 24](#generics).
Box :: A pointer that owns a value on the heap. See [chapter 32](#smart-pointers).
buffer :: A block of memory that collects data so that it can be read or written in large pieces, not byte by byte.
bug :: A mistake in a program that makes it behave wrongly.
build script :: A file `build.rs` that Cargo runs before it compiles a package, for example to generate code in `OUT_DIR` or compile C code. See [chapter 37](#ffi) and [chapter 70](#cargo).
byte :: Eight bits. The unit in which memory and files are measured.
cache :: A small, fast memory between the processor and RAM that keeps recently used data. Fetching from it costs about a nanosecond. See [chapter 2](#hardware-architecture), [chapter 43](#pointers-safety-caches), and [the silicon appendix](#under-the-hood).
cache line :: The fixed 64-byte chunk transferred as a unit between main DRAM and CPU L1/L2/L3 caches. See [chapter 43](#pointers-safety-caches) and [the silicon appendix](#under-the-hood).
cancellation safety :: Whether an async operation can be dropped mid-`.await` (for example in `tokio::select!`) without losing data or leaving corrupt state. See [chapter 57](#async).
Cargo :: Rust's tool for building, testing, documenting and publishing packages, and for fetching dependencies. See [chapter 70](#cargo).
cgroup :: Control group: a Linux kernel mechanism (`cgroups` v2) that caps and accounts for CPU time, memory (`memory.max`), and I/O across a group of processes, forming the resource boundary of containers. See [chapter 49](#sync-interrupts-signals).
channel :: A queue for sending values from one thread or task to another. See [chapter 55](#threads).
CI :: Continuous integration: a server that builds and tests the project automatically after every change. See [chapter 71](#quality-tools).
CIDR :: Classless Inter-Domain Routing: prefix notation such as `192.168.1.0/24` telling how many leading bits of an IP address identify the network versus the host. See [chapter 61](#network-layers-ethernet-ip).
Clippy :: A tool with several hundred extra checks that suggests better ways to write code: `cargo clippy`.
clone :: An explicit, complete copy of a value, made with `.clone()`. It may be expensive.
character :: A single Unicode scalar value, written `'a'`, of type `char`, which is four bytes wide because it can hold any code point. See [chapter 4](#types).
closure :: A function without a name that can use variables from the place where it was written: `|x| x + offset`. See [chapter 29](#closures).
cmov :: Conditional move: a branchless CPU instruction (`cmovne`, `csel`) that selects between two register values using status flags without jumping or risking a branch misprediction. See [chapter 52](#isa-opcodes-control-flow).
collection :: A type that holds many values: `Vec`, `HashMap`, `HashSet` and others. See [chapter 20](#collections).
compile time :: The moment when the compiler translates the program. A mistake found "at compile time" never reaches a user.
compiler :: The tool that translates your source code into a program the computer can run, and checks it for mistakes first. Rust's compiler is called `rustc`. See [chapter 5](#compilation-pipeline) and [the silicon appendix](#under-the-hood).
concurrency :: Dealing with several tasks during the same period of time. They may take turns on one processor core.
context switch :: The kernel saving one thread's CPU registers and switching stacks (and `CR3` page tables across processes) to resume another runnable thread. See [chapter 48](#processes-threads-scheduling).
control unit :: The circuitry inside a CPU core that fetches instructions, decodes their opcodes, and directs the ALU, registers, and memory unit through each clock cycle. See [chapter 2](#hardware-architecture).
const :: A value that is fixed when the program is compiled, with a name in capital letters.
constant :: See const.
Copy :: A trait for small values that are duplicated bit by bit instead of moved, such as numbers and `bool`. See [chapter 14](#ownership).
copy-on-write :: Sharing physical memory pages read-only between processes (for example after `fork()`) and duplicating a page only if one side writes to it. See [chapter 41](#virtual-memory-address-spaces).
crate :: The unit that the compiler translates in one go: one library or one program. Also the word for a library published on crates.io. See [chapter 22](#modules).
crates.io :: The public registry where Rust libraries are published.
dangling pointer :: A pointer to memory that has already been freed. Using it is a serious bug, and safe Rust makes it impossible.
data race :: Two threads touching the same memory at the same time, at least one of them writing, with nothing to coordinate them. Safe Rust rules it out at compile time.
deadlock :: Two threads that each wait for a lock the other one holds, for ever. See [chapter 56](#shared-state).
debug build :: The quick, unoptimised build that `cargo build` makes. Good for development, far too slow for measuring speed.
dependency :: A crate that your package uses. It is listed in `Cargo.toml`.
dentry :: Directory entry: an in-memory Linux VFS cache node mapping a filename component (such as `"app.db"`) to its underlying inode number so path lookups rarely touch disk. See [chapter 67](#filesystems-cache-mmap).
dereference :: To follow a reference or pointer to the value behind it, written `*r`.
derive :: To let the compiler write a trait implementation for you: `#[derive(Debug, Clone)]`.
deserialisation :: Turning data in a format such as JSON into Rust values. See [chapter 78](#serde).
destructuring :: Taking a value apart with a pattern: `let (x, y) = point;`. See [chapter 19](#patterns).
discriminant :: The hidden number in an enum value that says which variant it is.
DMA :: Direct Memory Access: hardware transferring disk or network buffers straight into physical RAM without CPU byte-copy loops, raising an IRQ on completion. See [chapter 49](#sync-interrupts-signals).
DNS :: Domain Name System: the distributed directory (usually queried over UDP port 53) that translates human domain names such as `example.com` into IP addresses. See [chapter 63](#dns-http-tls-trace).
documentation comment :: A comment that starts with `///`. `cargo doc` turns such comments into web pages, and their examples are run as tests.
drop :: The moment a value is cleaned up, when its owner goes out of scope. Types can run their own code then, through the trait `Drop`.
dyn :: Marks a trait object: `dyn Shape` is "some type that implements `Shape`, decided while the program runs".
dynamic dispatch :: Choosing which function to call while the program runs, by looking it up in a table. It is what `dyn Trait` does.
edition :: A version of the language's surface, such as 2021 or 2024. A crate chooses one, and crates of different editions work together. See [chapter 70](#cargo).
ELF :: Executable and Linkable Format: the standard binary file layout on Linux for `.o` object files, `.so` shared libraries, and executables. See [chapter 7](#linking-elf).
endianness :: The byte order in memory: little-endian puts the least-significant byte first (x86-64/ARM64 RAM); big-endian puts the most-significant byte first (network wire protocols). See [chapter 3](#bits-bytes-representation).
enum :: A type whose value is exactly one of several named variants, each of which can carry its own data. See [chapter 18](#enums).
epoll :: Linux's scalable I/O readiness multiplexer monitoring tens of thousands of sockets in `O(ready)` time, backing `mio` and Tokio. See [chapter 51](#blocking-epoll-io-uring).
error :: Either a message from the compiler that stops the build, or a value of type `Err(…)` that a function returns when something went wrong.
executable :: See binary.
expression :: A piece of code that produces a value: `2 + 3`, a function call, an `if` with its branches. See [chapter 10](#functions).
feature :: A named, optional part of a crate that can be switched on in `Cargo.toml`. See [chapter 70](#cargo).
FFI :: Foreign function interface: calling code written in another language, or being called by it. See [chapter 37](#ffi).
field :: A named piece of data inside a struct.
file descriptor :: A small non-negative integer (`0` stdin, `1` stdout, `2` stderr, `3+` opened handles) indexing a process's open files, pipes, or sockets inside the OS kernel. See [chapter 50](#streams-fds-buffering).
flame graph :: A picture of where a program spends its time: one bar for each function, as wide as its share of the time. See [chapter 74](#performance).
float :: A number with a fractional part, stored with limited precision: `f32` or `f64`.
fsync :: The system call (`File::sync_all` in Rust) that forces modified pages from the OS page cache and drive write cache onto persistent storage media before returning. See [chapter 50](#streams-fds-buffering) and [chapter 66](#storage-hardware-blocks).
FTL :: Flash Translation Layer: the controller firmware inside an SSD that maps logical block addresses to physical NAND flash pages for wear levelling and fast writes. See [chapter 66](#storage-hardware-blocks).
function :: A named piece of code with parameters and a result. See [chapter 10](#functions).
futex :: Fast Userspace Mutex: Linux's hybrid lock primitive that stays in user space for uncontended atomics and sleeps in the kernel only on contention. See [chapter 49](#sync-interrupts-signals).
future :: A value that stands for a result that will be ready later. Awaiting it gives the result. See [chapter 57](#async).
fuzzing :: Testing a function with huge numbers of random inputs to find the ones that make it crash. See [chapter 72](#testing-strategies).
garbage collector :: A part of many languages that searches for unused memory and frees it while the program runs. Rust has none.
GAT :: Generic associated type: an associated type inside a trait that takes lifetime or type parameters of its own, such as `type Item<'a>`. See [chapter 33](#advanced-traits).
generic :: Written once for many types, with a type parameter such as `T`. See [chapter 24](#generics).
guard :: A value whose only job is to undo something when it is dropped, such as the guard that unlocks a mutex. Also: an extra `if` condition on a `match` arm.
guard page :: A page of memory deliberately left unmapped at the end of a stack. The first write into it faults, stopping runaway recursion cleanly. See [chapter 13](#memory), [chapter 41](#virtual-memory-address-spaces), and [the silicon appendix](#under-the-hood).
handle :: A value that stands for something you cannot hold directly, such as an open file or a running thread.
hash :: A number computed from a value, used to find it quickly in a `HashMap`.
HashMap :: A collection that finds a value by its key. See [chapter 20](#collections).
heap :: The part of memory for data whose size is not known in advance or that must live longer than one function call. See [chapter 13](#memory) and [chapter 42](#allocators-heap-internals).
HIR :: High-level Intermediate Representation: `rustc`'s desugared AST after macro expansion and name resolution, used for type inference and trait solving. See [chapter 5](#compilation-pipeline).
idempotency :: Performing the same operation or delivering the same message more than once without changing the outcome beyond the first execution. See [chapter 60](#async-ecosystem).
idiomatic :: Written the way experienced users of the language would write it. See [chapter 40](#idioms).
immutable :: Not changeable. Variables and references are immutable unless marked `mut`.
impl :: The block in which the methods of a type, or the implementation of a trait for a type, are written.
inlining :: An optimisation that copies the body of a small function into the place where it is called.
inode :: Index node: the numbered file-system metadata record storing a file's owner, permissions, byte size, timestamps, and physical block extents (everything except its filename). See [chapter 67](#filesystems-cache-mmap).
instruction :: One operation the processor can carry out. Machine code is a sequence of instructions with numeric opcodes. See [chapter 6](#assembly-machine-code), [chapter 52](#isa-opcodes-control-flow), and [the silicon appendix](#under-the-hood).
integer :: A whole number. Rust has signed ones (`i8` to `i128`, `isize`) and unsigned ones (`u8` to `u128`, `usize`).
integration test :: A test in the folder `tests/` that uses a crate from the outside, as a user would. See [chapter 27](#testing).
interior mutability :: Changing a value through a shared reference, with the safety check moved to run time or to the processor. `Cell`, `RefCell`, `Mutex` and atomics do this. See [chapter 32](#smart-pointers).
interrupt :: An asynchronous hardware signal (IRQ) from a device or timer causing the CPU to pause user code and jump to a Ring 0 kernel handler. See [chapter 49](#sync-interrupts-signals).
invariant :: Something that must always be true for a value, such as "the percentage is between 0 and 100". Private fields and constructors protect invariants.
io_uring :: Linux's lockless shared-ring completion interface for asynchronous disk and network I/O with minimal system calls. See [chapter 51](#blocking-epoll-io-uring).
ISA :: Instruction Set Architecture: the hardware contract between software and a processor family (such as x86-64, ARM64, or RISC-V) defining its registers, opcodes, and memory model. See [chapter 52](#isa-opcodes-control-flow).
item :: Something defined at the top level of a module: a function, struct, enum, trait, constant, `impl` block or module.
iterator :: A value that hands out a sequence of items one by one. See [chapter 30](#iterators).
JSON :: A widespread text format for data, used by nearly every web API. See [chapter 78](#serde).
kernel :: The privileged core of the operating system running in Ring 0 / EL1 that manages virtual memory, processes, hardware devices, and system calls. See [chapter 47](#kernel-syscalls-processes).
keyword :: A word that belongs to the language and cannot be used as a name, such as `fn` or `let`. The list is in [the reference appendix](#reference).
lazy :: Doing work only when the result is asked for. Iterators and futures are lazy.
library :: Code meant to be used by other programs. It has no `main` function.
lifetime :: The stretch of the program during which a reference is valid. Written `'a` where the compiler needs to be told. See [chapter 26](#lifetimes).
linker :: The tool that joins all compiled pieces into one program file, as the last step of a build. See [chapter 7](#linking-elf).
lint :: A check for code that compiles but is probably a mistake or bad style. Warnings come from lints.
literal :: A value written directly in the code: `42`, `"hello"`, `true`.
LLVM IR :: Target-independent Static Single Assignment (SSA) intermediate representation emitted by `rustc` for LLVM optimisations and machine code generation. See [chapter 5](#compilation-pipeline) and [the silicon appendix](#under-the-hood).
lock :: See mutex.
machine code :: The bytes of a program as the processor fetches and executes them. Produced by the compiler backend; `89 F8` is one instruction. See [chapter 6](#assembly-machine-code) and [the silicon appendix](#under-the-hood).
macro :: Code that writes code. A macro call ends in `!`, as in `println!`. See [chapter 35](#macros).
match :: The expression that compares a value with a list of patterns and runs the first arm that fits. It must cover every case.
memory leak :: Memory that is never freed although nothing uses it any more.
memory safety :: The guarantee that a program never reads or writes memory it should not: no dangling pointers, no access past the end of a list, no data races.
method :: A function that belongs to a type and is called with a dot: `text.len()`. Its first parameter is `self`.
MIR :: Mid-level Intermediate Representation: Rust's control-flow graph IR used for borrow checking, drop elaboration, and constant evaluation before LLVM. See [chapter 5](#compilation-pipeline), [chapter 39](#rust-stdlib-internals), and [the silicon appendix](#under-the-hood).
mmap :: A system call that maps anonymous zeroed memory or file pages directly into a process's virtual address space. See [chapter 41](#virtual-memory-address-spaces) and [chapter 67](#filesystems-cache-mmap).
MMU :: Memory Management Unit: the CPU hardware component that translates virtual memory addresses into physical RAM frames using page tables and the TLB. See [chapter 41](#virtual-memory-address-spaces) and [the silicon appendix](#under-the-hood).
module :: A named group of items inside a crate, with its own privacy boundary. See [chapter 22](#modules).
monomorphisation :: The way the compiler handles generics: it makes a separate, specialised copy of the code for every type it is used with.
move :: Handing a value over to a new owner. The old variable can no longer be used. See [chapter 14](#ownership).
MTU :: Maximum Transmission Unit: the largest payload (typically 1,500 bytes on Ethernet) that a single link-layer frame can carry without fragmentation. See [chapter 61](#network-layers-ethernet-ip).
mutable :: Changeable. Asked for with `mut`.
mutex :: A lock that lets only one thread at a time reach the data inside it. See [chapter 56](#shared-state).
mutability :: Whether a binding or borrow may be changed. Rust asks for `let mut` explicitly, and a `&mut T` is the only reference that can write. See [chapter 3](#variables).
namespace :: A Linux kernel isolation boundary (`mnt`, `pid`, `net`, `user`, `uts`, `ipc`) giving a group of processes its own view of process IDs, network interfaces, or mount points; combined with cgroups to build containers. See [chapter 48](#processes-threads-scheduling).
NAPI :: New API: the Linux network driver scheme that switches from one interrupt per packet to a single interrupt followed by batched polling, so a flood of packets cannot livelock the CPU in interrupt handlers. See [chapter 62](#tcp-udp-sockets-kernel).
NAT :: Network Address Translation: a router rewriting private LAN `IP:port` pairs (such as `192.168.1.42:51422`) to its single public IP address and back. See [chapter 61](#network-layers-ethernet-ip).
newtype :: A struct with a single field, made to give a value its own type: `struct Metres(f64);`. See [chapter 34](#type-system).
niche :: An invalid bit pattern inside a type (such as `0` inside `&T` or `NonZeroU64`, or `2..=255` inside `bool`) that `rustc` reuses to store `Option::None` at zero extra byte cost. See [chapter 39](#rust-stdlib-internals).
no_std :: A crate that does not use the standard library, so that it can run without an operating system. See [chapter 80](#games-embedded).
NVMe :: Non-Volatile Memory Express: high-speed PCIe storage protocol exposing thousands of parallel hardware submission and completion queues directly to CPU cores. See [chapter 66](#storage-hardware-blocks).
object file :: A compiled `.o` file holding machine code and unresolved symbol references before the linker joins everything into a final executable. See [chapter 7](#linking-elf).
opcode :: Operation code: the numeric byte(s) in machine code that tell the CPU which operation to perform (for example `0xc3` for `ret` on x86-64). See [chapter 6](#assembly-machine-code) and [chapter 52](#isa-opcodes-control-flow).
OpenAPI :: A standard JSON or YAML schema describing HTTP routes, request bodies, and responses so tools like Swagger UI can generate interactive docs. See [chapter 64](#web).
Option :: The type for a value that may be missing: `Some(value)` or `None`. See [chapter 18](#enums).
out-of-order execution :: Hardware CPU technique that executes independent instructions ahead of stalled earlier instructions while retiring results in program order. See [chapter 53](#pipelines-branch-prediction-ooo).
overflow :: A calculation whose result does not fit into the type. In a debug build Rust panics, in a release build the number wraps around.
ownership :: Rust's central rule: every value has exactly one owner, and is freed when that owner goes out of scope. See [chapter 14](#ownership).
package :: A folder with a `Cargo.toml`: one or more crates that are built and published together.
page :: The fixed-size (typically 4 KiB) chunk of virtual or physical memory tracked by OS page tables and the MMU. See [chapter 41](#virtual-memory-address-spaces).
page cache :: Unused physical DRAM managed by the OS kernel as an automatic cache of recent disk file blocks. See [chapter 67](#filesystems-cache-mmap).
page fault :: A CPU exception raised when accessing an unmapped, demand-zeroed, file-backed, or permission-violating virtual memory page. See [chapter 41](#virtual-memory-address-spaces).
page table :: The per-process multi-level table that the MMU walks to map a virtual page onto physical memory. See [chapter 41](#virtual-memory-address-spaces) and [the silicon appendix](#under-the-hood).
panic :: The controlled stop of a thread after a bug was detected, with a message and a location. See [chapter 23](#errors).
parallelism :: Doing several things at the same instant, on several processor cores.
parameter :: A variable in a function definition that receives an argument.
pattern :: A shape that a value is compared with, and that can take it apart: `Some(x)`, `(a, b)`, `1..=5`. See [chapter 19](#patterns).
Pin :: A wrapper (`Pin<&mut T>`) guaranteeing a `!Unpin` value (such as a self-referential async future) will never move in memory before being dropped. See [chapter 58](#concurrency-async-internals).
pipeline :: Hardware architecture overlapping fetch, decode, execute, memory, and writeback stages across consecutive instructions inside a CPU core. See [chapter 53](#pipelines-branch-prediction-ooo).
pointer :: A value that holds the address of another value in memory.
prelude :: The small set of names that every Rust file can use without a `use` line, such as `Vec`, `Option` and `String`.
procedural macro :: A macro written as a Rust function that receives code and returns code. `#[derive(…)]` macros are of this kind.
profile :: A set of compiler settings in Cargo. `dev` and `release` are the two that matter most.
profiler :: A tool that measures where a running program spends its time.
provenance :: The compile-time and abstract-machine permission attached to a pointer tracking which allocation it is allowed to read or write, beyond its raw numeric address. See [chapter 39](#rust-stdlib-internals) and [chapter 43](#pointers-safety-caches).
PTY :: Pseudo-terminal: a kernel pair of virtual character devices allowing terminal emulators, `tmux`, and SSH sessions to behave like hardware serial terminals with line editing and signals (`Ctrl+C`). See [chapter 50](#streams-fds-buffering).
QUIC :: An encrypted, multiplexed transport protocol built over UDP that eliminates TCP head-of-line blocking and powers HTTP/3. See [chapter 63](#dns-http-tls-trace).
race condition :: A bug where the result depends on which of two threads happens to be faster.
raw pointer :: A pointer without any guarantee, `*const T` or `*mut T`. It can only be followed in `unsafe` code. See [chapter 36](#unsafe).
Rc :: A pointer with a counter that allows several owners of one value in one thread. `Arc` is the version for several threads.
recursion :: A function that calls itself.
reference :: A pointer that Rust guarantees to be valid: `&T` for reading, `&mut T` for changing. See [chapter 15](#borrowing).
register :: Smallest, fastest storage slots inside the CPU core itself (`rax`, `rdi`, `rsp`, `rip`; `x0`–`x30`), read in under one nanosecond. See [chapter 2](#hardware-architecture), [chapter 45](#calling-conventions-execution), and [the silicon appendix](#under-the-hood).
release build :: The optimised build made by `cargo build --release`. It is the one to measure and to ship.
Result :: The type for an operation that can fail: `Ok(value)` or `Err(error)`. See [chapter 23](#errors).
return value :: The value that a function hands back to its caller.
run time :: The time while the program is running. Also: the support code that a language needs while a program runs. Rust's is tiny.
runtime (async) :: The library that runs async tasks and wakes them when they can continue. Tokio is the usual one.
rustc :: The Rust compiler. You normally start it through Cargo.
rustup :: The tool that installs and updates Rust itself.
ring buffer :: A fixed-size circular array of slots shared between a device and a driver, so producer and consumer index into it without allocating. Network cards, NVMe drives and io_uring all use one. See [chapter 62](#tcp-udp-sockets-kernel).
scope :: The region of code in which a name is valid, usually up to the closing `}` of its block.
semantic versioning :: The convention for version numbers `major.minor.patch`: a change that breaks users raises the first number. Short: semver.
Send :: The marker trait for types that may be moved to another thread. See [chapter 55](#threads).
serialisation :: Turning Rust values into a format such as JSON, for storing or sending. See [chapter 78](#serde).
shadowing :: Declaring a new variable with the name of an existing one. The old one is hidden from then on.
signature :: The first line of a function: its name, its parameters with their types, and its return type.
SIMD :: Single instruction, multiple data: CPU vector instructions that operate on several numbers at once in one register. See [chapter 54](#cache-coherency-atomics-simd) and [chapter 74](#performance).
sk_buff :: Socket buffer: the Linux kernel's packet structure, with headroom before the data so each layer can prepend its header without copying the payload. See [chapter 62](#tcp-udp-sockets-kernel).
slice :: A view of a run of elements inside an array, a `Vec` or a string: `&[T]` or `&str`. See [chapter 16](#slices-strings).
smart pointer :: A type that behaves like a pointer and does something more, such as owning the value (`Box`) or counting owners (`Rc`).
socket :: An OS kernel file descriptor endpoint for network communication (`TCP`/`UDP`/Unix domain). See [chapter 62](#tcp-udp-sockets-kernel).
span :: A timed unit of work in structured `tracing`, tracking everything that happens during one request or operation along with its fields. See [chapter 65](#observability).
stack :: The part of memory for the local variables of the functions that are running. It is fast, and it is tidied up automatically. See [chapter 13](#memory).
stack frame :: The slice of the stack belonging to one active function call, holding its parameters, local variables, saved registers, and return address. See [chapter 13](#memory) and [chapter 45](#calling-conventions-execution).
standard library :: The library that comes with Rust: collections, text, files, threads and more. A map is in [the reference appendix](#reference).
statement :: A piece of code that does something and produces no value, such as a `let`. It ends with a semicolon.
static :: A value with a fixed place in memory that lives for the whole run of the program.
static dispatch :: Choosing which function to call at compile time. It is what generics do, and it costs nothing at run time.
String :: Owned, growable text on the heap. Its borrowed relative is the string slice, `&str`. See [chapter 16](#slices-strings).
struct :: A type that groups several named values into one. See [chapter 17](#structs).
Sync :: The marker trait for types that may be shared between threads by reference.
system call :: A controlled CPU trap (`syscall` / `svc #0`) transferring privilege from Ring 3 user space to the Ring 0 kernel for I/O, memory mapping, or process management. See [chapter 47](#kernel-syscalls-processes).
task :: A piece of async work that a runtime runs alongside others. Much cheaper than a thread.
TCP :: Transmission Control Protocol: the reliable, ordered, connection-oriented transport that carries most of the web, with a 20-byte header, sequence numbers, acknowledgements and congestion control. See [chapter 62](#tcp-udp-sockets-kernel).
test :: A function marked `#[test]` that checks that code does what it should. `cargo test` runs them all. See [chapter 27](#testing).
thread :: A separate line of execution inside one program. Several threads can run at the same time on several cores. See [chapter 55](#threads).
TLB :: Translation Lookaside Buffer: small ultra-fast hardware cache inside the MMU storing recent virtual-to-physical page translations. See [chapter 41](#virtual-memory-address-spaces).
TLS :: Transport Layer Security (cryptographic protocol securing HTTPS via X25519 key exchange, X.509 certificates, and AEAD encryption), or Thread-Local Storage depending on context. See [chapter 63](#dns-http-tls-trace).
toolchain :: The compiler together with its tools: Cargo, the standard library, rustfmt, Clippy.
TRIM :: The ATA/NVMe command (`BLKDISCARD`, `fstrim`) that tells a flash drive which blocks a deleted file no longer uses, so garbage collection stops copying dead data. See [chapter 66](#storage-hardware-blocks).
trait :: A set of methods that a type can implement. Traits describe what types have in common. See [chapter 25](#traits).
trait object :: A value used through a trait without knowing its exact type: `&dyn Trait` or `Box<dyn Trait>`.
tuple :: A fixed group of values that may have different types: `(i32, String)`.
turbofish :: The syntax `::<T>` for naming a type in a call: `"5".parse::<i32>()`.
two's complement :: The universal binary representation for signed integers where negative `-x` is formed by inverting every bit of `x` and adding `1`, allowing one adder circuit to add positive and negative numbers alike. See [chapter 3](#bits-bytes-representation).
type :: What kind of value something is: a number, text, a list. It decides how the value is stored and what can be done with it.
type inference :: The compiler working out a type from how a value is used, so that you do not have to write it.
UDP :: User Datagram Protocol: a lightweight, connectionless transport protocol that sends discrete packets (datagrams) without handshakes, retransmissions, or head-of-line blocking. See [chapter 62](#tcp-udp-sockets-kernel).
undefined behaviour :: An operation for which the language promises nothing at all: the program may crash, give wrong results, or seem to work. It can only come from `unsafe` code. See [chapter 36](#unsafe).
unit :: The empty tuple `()`. It is the "result" of code that returns nothing useful.
unit test :: A test next to the code it checks, usually in a `mod tests` at the end of the file.
unsafe :: The keyword that marks code whose safety the compiler cannot check, so that the programmer takes over the responsibility. See [chapter 36](#unsafe).
UTF-8 :: The way Rust stores text: every character takes one to four bytes.
variable :: A name for a value.
variant :: One of the possibilities of an enum.
vDSO :: Virtual Dynamic Shared Object: read-only kernel memory page mapped into every user process so high-frequency read calls like `clock_gettime` run without a syscall trap. See [chapter 47](#kernel-syscalls-processes).
Vec :: A list that can grow, with all elements of one type, stored on the heap. See [chapter 20](#collections).
VFS :: Virtual File System: the Linux kernel abstraction layer presenting one unified tree of paths, file descriptors, dentries, and inodes over ext4, XFS, tmpfs, `/proc`, pipes, and sockets. See [chapter 67](#filesystems-cache-mmap).
virtual address :: The address a program sees, translated by the MMU through page tables into a physical frame; every process has its own address space. See [chapter 41](#virtual-memory-address-spaces).
virtual memory :: Hardware-enforced private per-process address space mapped through multi-level page tables onto physical RAM frames. See [chapter 41](#virtual-memory-address-spaces).
W^X :: Write XOR Execute: virtual memory security rule ensuring executable pages (`r-xp`) are never writable and writable heap/stack pages (`rw-p`) are never executable. See [chapter 41](#virtual-memory-address-spaces).
waker :: The callback handle (`std::task::Waker`) passed into `Future::poll` so an I/O reactor or timer can notify the async executor when a paused task is ready to be polled again. See [chapter 58](#concurrency-async-internals).
WAL :: Write-ahead log: an append-only record of changes written and flushed before the data it describes is modified, so a crash can be replayed or rolled back. Databases and journaling file systems both use one. See [chapter 63](#dns-http-tls-trace) and [chapter 67](#filesystems-cache-mmap).
write amplification :: The ratio of bytes a storage device writes to bytes the host asked for; on NAND it exceeds one because whole erase blocks must be rewritten to reclaim space. See [chapter 66](#storage-hardware-blocks).
WebAssembly :: A compact code format that browsers and other hosts can run at near-native speed. Rust compiles to it. Short: Wasm. See [chapter 79](#apps).
workspace :: Several packages that are developed together and share one `Cargo.lock` and one `target` folder. See [chapter 70](#cargo).
zero-cost abstraction :: A convenient way of writing code that the compiler turns into machine code as fast as the hand-written version. Iterators are the standard example.
:::
