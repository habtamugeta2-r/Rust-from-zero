@id hardware-architecture
@part p1
@title Inside the machine: CPU, registers, ALU, memory, and buses
@short Inside computer hardware
@level beginner
@time 35
@learn Explain what hardware and software are and how they interact | Name the main parts inside a CPU: control unit, ALU, registers, and clock | Contrast SRAM caches, DRAM main memory, ROM firmware, SSDs, and HDDs | Describe how address, data, and control buses move bytes through one instruction cycle

When you double-click a program or run `cargo run`, it can feel as if software lives in an abstract cloud of ideas. In reality, nothing runs without moving electrical charges across copper traces and silicon transistors. Understanding that physical machinery makes every concept later in this guide—pointers, stack vs heap, CPU caches, system calls, and concurrency—feel concrete rather than mysterious.

## Starting point: hardware and software

**Hardware** is everything physical inside the machine: the processor chip, memory modules, solid-state drive, motherboard wiring, network card, and screen. **Software** is the collection of instructions and data stored as electrical charges, magnetic domains, or flash trap charges that tells the hardware what to do next.

:::analogy A kitchen and a recipe book
Think of **hardware** as a commercial kitchen: stoves, knives, counters, and storage shelves. Think of **software** as the recipe cards and order tickets. A kitchen without recipes sits idle; a recipe without a kitchen cannot cook a single meal.
:::

Most general-purpose computers follow the **stored-program architecture** (often called the **von Neumann architecture**): both the *instructions* of a running program and the *data* it computes on reside in main memory (`RAM`) as numbers, fetched over buses by the **central processing unit** (**CPU**). Modern processors use separate high-speed instruction and data caches right next to the execution engine (a split *modified Harvard* layout inside the chip) so fetching code and reading variables do not block each other, while main memory remains unified.

## Inside the CPU: control unit, ALU, registers, and clock

The CPU is the silicon engine that executes instructions one step at a time (or several in parallel on modern cores). Four core components inside every core do the work:

```text
+-----------------------------------------------------------------------+
|                              CPU Core                                 |
|                                                                       |
|  +-----------------------+          +------------------------------+  |
|  |     Control Unit      |          |   Registers (fast scratch)   |  |
|  | - Instruction Decoder |◄────────►|   rax, rbx, rcx, rdx, ...    |  |
|  | - Program Counter(PC) |          |   rsp (stack pointer)        |  |
|  | - Instruction Reg(IR) |          |   rflags (status flags)      |  |
|  +-----------+-----------+          +--------------+---------------+  |
|              |                                     |                  |
|              ▼                                     ▼                  |
|  +-----------------------------------------------------------------+  |
|  |          Arithmetic Logic Unit (ALU) & Vector Units             |  |
|  |   +  -  *  &  |  ^  <<  >>  compare (zero / carry / overflow)   |  |
|  +-----------------------------------------------------------------+  |
|                                  ▲                                    |
|                                  │  Clock signal (e.g. 3.6 GHz)       |
+----------------------------------|------------------------------------+
                                   │
                        L1i / L1d / L2 / L3 Caches
                                   │
                    ═══════ System & Memory Buses ═══════
                                   │
                                  RAM
```

- **[[Registers|register]]** are tiny, ultra-fast storage slots etched directly inside the CPU core. A 64-bit CPU typically exposes 16 to 31 general-purpose registers (each holding 64 bits = 8 bytes), plus special-purpose registers such as:
  - the **program counter** (**PC**, called `RIP` on x86-64), which holds the memory address of the next instruction to run;
  - the **instruction register** (**IR**), which holds the instruction currently being decoded;
  - the **stack pointer** (`RSP` on x86-64, `SP` on ARM64), tracking the active top of the call [[stack]];
  - a **flags register** (`RFLAGS` / `NZCV`), recording whether the last calculation produced zero, a negative sign, or arithmetic overflow.
- The **[[control unit]]** (**CU**) coordinates every step. It reads the address in the program counter, fetches that instruction from memory/[[cache]], decodes what operation the bits represent, and routes signals telling the ALU and registers what to do next.
- The **[[arithmetic logic unit|ALU]]** (**ALU**) performs actual arithmetic (`+`, `-`, integer comparisons) and bitwise logic (`AND`, `OR`, `XOR`, bit shifts) on values held in registers. Separate floating-point and vector units ([[SIMD]]) handle decimal arithmetic and parallel data lanes.
- The **clock** ticks billions of times per second (for example, `3.0 GHz` means 3 billion clock cycles per second). Each step inside the CPU is synchronised to clock ticks.

:::plain Latency numbers that govern everything
A CPU core can read a **register** in less than a nanosecond (under 1 clock cycle), whereas fetching bytes from main **RAM** takes around **60–100 nanoseconds**—hundreds of clock cycles where the processor would sit idle without caches. Reading from an **NVMe SSD** takes tens of thousands of nanoseconds, and a spinning **HDD** takes millions. Every layer of caches, buffers, and async I/O you will learn in this guide exists because of that speed gap.
:::

## Memory and storage: SRAM, DRAM, ROM, SSD, and HDD

Computers store information across a **storage hierarchy**, trading cost and capacity for speed and persistence:

| Tier | Technology | Volatile? | Typical size | Access time | Role |
|---|---|---|---|---|---|
| **CPU registers** | Flip-flops on CPU die | Yes (lost on power-off) | Hundreds of bytes | ~0.3 ns (1 cycle) | Operands of the instruction running right now |
| **L1 / L2 / L3 cache** | **SRAM** (6 transistors/bit) | Yes | 32 KB – 64 MB | ~1 – 15 ns | Copies of hot instructions and memory lines near the core |
| **Main memory (RAM)** | **DRAM** (1 capacitor + transistor/bit) | Yes | 8 GB – 256 GB | ~60 – 100 ns | Active programs, stack, heap, OS page cache |
| **ROM / Flash firmware** | Non-volatile EEPROM / NOR flash | No | 8 MB – 64 MB | Microseconds | Motherboard **UEFI / BIOS** boot code before the OS starts |
| **SSD (NVMe / SATA)** | **NAND flash** cells | No | 256 GB – 8 TB | ~20 – 100 µs | Persistent files, executables, databases |
| **HDD** | Spinning magnetic platters + head | No | 1 TB – 20+ TB | ~4 – 10 ms | High-capacity bulk archival storage |

Notice two crucial boundaries:

:::plain Volatile vs non-volatile memory
**Volatile** memory (registers, SRAM [[cache]], and DRAM main memory) needs continuous power: switch off the computer and every stored bit disappears immediately. **Non-volatile** storage (ROM firmware, SSDs, and HDDs) keeps its bytes even when unplugged—which is why saved files rest on an SSD, and are copied into DRAM whenever a program opens or runs them.
:::

1. **RAM vs storage:** The CPU can only execute instructions and directly address variables that are mapped into **main memory (RAM)** and caches. Files sitting on an **SSD** or **HDD** must first be copied into RAM before your program can inspect their bytes.
2. **ROM/UEFI firmware:** When you press the power button, RAM is completely empty garbage. The CPU is hard-wired to start fetching its very first instructions from **read-only / non-volatile firmware** (**UEFI** on modern PCs, **BIOS** on older ones), which initialises the memory controller and loads the operating system bootloader from disk.

## Buses and data transfer

Components talk over shared electrical pathways called **buses** (and modern high-speed point-to-point interconnects such as **PCIe** and integrated memory channels). Conceptually, a memory transfer uses three logical bus channels:

1. **Address bus:** Carries *which* memory location the CPU wants to read or write. The width of physical address wiring determines the maximum physical RAM the memory controller can index (for example, 46 or 48 physical address lines).
2. **Data bus:** Carries the actual payload bytes moving between RAM and the CPU (typically 64 bits wide per memory channel on modern desktops, transferring cache lines in bursts).
3. **Control bus:** Carries coordination signals: "this is a memory read", "this is a memory write", clock timing, and **interrupt** lines notifying the CPU when a disk or network card has finished work.

:::compare Why virtual addresses feel simple in Rust
From inside Rust, memory looks like one flat numbered street of bytes. Underneath, every read passes from your variable through a CPU register, checks L1/L2/L3 caches, travels across the memory controller and DRAM address/data/control lines if cached copies miss, and—if the bytes were still on disk—waits for a PCIe NVMe transfer first.
:::

## Following the ten-stage lens on a single addition

:::note How to read the short Rust previews in Chapters 2 and 3
You have **not** learned Rust syntax yet—[Chapter 4](#setup) installs Rust from scratch, and [Part III](#variables) teaches every word (`fn`, `let`, `for`, `if`) step by step. For now, treat these tiny programs as live lab demonstrations: read the `//` comments and watch what the hardware does with the numbers!
:::

Suppose we want to add two numbers (`10 + 32`) on a computer. Watch how the layers connect:

1. **Starting point:** Adding two small numbers and keeping the answer.
2. **Source code:**
```rust run
fn main() {
    // Store two 32-bit whole numbers and add them:
    let a: i32 = 10;
    let b: i32 = 32;
    let sum = a + b;
    println!("sum = {sum}");
}
```
```output
sum = 42
```
3. **Compiler perspective:** `rustc` checks that `a` and `b` are both 32-bit signed integers (`i32`) and lowers `+` to an integer addition operation.
4. **Compiled representation:** At optimisation level 3, the compiler may precompute `42` directly (`constant folding`); without folding, it emits an `add` instruction on two CPU registers.
5. **Memory perspective:** On a real unoptimised run, `10` and `32` start in registers or stack slots in RAM and are cached in L1d.
6. **Execution perspective:** The **fetch-decode-execute cycle** drives the machine:
   - **Fetch:** Control unit sends `PC` to the L1 instruction cache and pulls the `add` instruction bytes into `IR`, advancing `PC`.
   - **Decode:** Control unit decodes the bits as "integer add `edi` + `esi`, store in `eax`".
   - **Execute:** ALU adds `10` and `32` in one cycle, writes `42` into the destination register, and updates status flags.
7. **OS perspective:** Printing `sum = 42` later hands the formatted UTF-8 bytes to the Linux kernel via a system call.
8. **Hardware perspective:** Flip-flop latches inside the register file store `42` as voltages representing `00101010` in binary, while the system clock coordinates the next instruction fetch.
9. **Practical experiment:** Probe your own machine's CPU, caches, and RAM right from Rust and Linux.
10. **Conclusion:** High-level Rust syntax compiles directly down to register moves, ALU operations, and bus transfers—no interpreter layer stands in between.

## Practical experiment: inspect your hardware from Linux and Rust

On Linux, the kernel exposes real hardware topology in `/proc/cpuinfo` and `/proc/meminfo` (and via `lscpu`). You can inspect core counts and cache/RAM hardware directly from the terminal and from a Rust program:

```sh
$ lscpu | head -n 12
$ grep -E 'MemTotal|MemAvailable' /proc/meminfo
```

And in pure Rust (`std`), you can query how many logical hardware threads the OS exposes to your process and read the top lines of `/proc/meminfo`. Your output will show the exact CPU thread count and RAM of your own machine; here is an example run on a 2-core Linux system:

```rust run nocmp
fn main() {
    // Ask the OS how many logical CPU threads are available:
    if let Ok(cores) = std::thread::available_parallelism() {
        println!("Logical CPU threads available: {cores}");
    }

    // Read the first three lines of Linux's live memory report:
    if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
        for line in meminfo.lines().take(3) {
            println!("{line}");
        }
    }
}
```
```output
Logical CPU threads available: 2
MemTotal:        8153420 kB
MemFree:         5120300 kB
MemAvailable:    6412100 kB
```

:::recap
- **Hardware** is physical silicon, memory chips, buses, and drives; **software** consists of encoded instructions and data loaded into memory.
- A CPU core executes instructions with its **control unit** (fetch/decode/PC), **ALU** (arithmetic/logic), **registers** (fastest storage), and **clock**.
- Memory spans a sharp latency hierarchy: registers (<1 ns) → SRAM caches (1–15 ns) → DRAM RAM (60–100 ns) → NVMe SSD (µs) → HDD (ms), while non-volatile ROM/UEFI boots the machine.
- Address, data, and control buses move instructions and data between CPU, memory, and I/O devices.
:::

:::quiz Check your understanding
? Which CPU component is responsible for performing integer addition and bitwise comparisons?
- The program counter
+ The arithmetic logic unit (ALU)
- The address bus
- The solid-state drive
= The ALU performs arithmetic (`+`, `-`) and logical/comparison operations on operands held in registers.

? Why does a CPU keep L1, L2, and L3 SRAM caches on the processor chip when a machine already has gigabytes of RAM?
- Because RAM forgets data every clock cycle unless cached
- Because only caches can store instructions
+ Because reading main DRAM takes roughly 60–100 ns (hundreds of CPU cycles), whereas SRAM caches respond in nanoseconds
- Because buses cannot transfer 64-bit integers from DRAM
= Main RAM is far slower than CPU clock speeds; small SRAM caches close to the core keep hot instructions and data immediately available.

? Why must a running program live in RAM rather than staying only on an SSD?
+ The CPU's instruction fetch and register load/store units directly address cached/main memory over the memory bus, not SSD flash blocks
- SSDs can only hold text files, not machine code
- SSDs erase their contents as soon as the computer finishes booting
- The ALU reads bytes directly from the keyboard instead of storage
= Persistent storage (SSD/HDD) holds files across power-offs, but the OS must load executable code and active data into RAM before the CPU can execute them.

? What do the three conceptual bus channels carry during a memory read?
- Registers, opcodes, and stack frames
+ The target address (address bus), timing/read-write signals (control bus), and the returned bytes (data bus)
- Source code, assembly, and linking symbols
- IP packets, Ethernet frames, and disk sectors
= Every memory transfer specifies *where* (address bus), *what action* (control bus), and moves the actual payload bytes (data bus).
:::

:::exercise guided Trace a fetch-decode-execute cycle
Write down in order what the **program counter**, **address bus**, **instruction register**, **control unit**, **ALU**, and **registers** do for one instruction that adds `5` to register `rax`.
::hint
Start with the address sitting in the program counter before the instruction is fetched, then follow the bytes back into the control unit and out to the ALU.
::solution
1. The **program counter (`PC`)** holds the memory address of the `add` instruction.
2. The **control unit** places that address on the **address bus** with a read signal on the **control bus**.
3. Instruction bytes return over the **data bus** (usually from L1 instruction cache) into the **instruction register (`IR`)**, and `PC` advances to the next instruction.
4. The **control unit** decodes the `IR` bits as "add immediate `5` to `rax`".
5. The **ALU** takes the current value in register `rax` and the constant `5`, computes the sum, writes the result back into `rax`, and updates the status flags.
:::

:::exercise practice Inspect your hardware architecture
Trace or run a small Rust program that reads `/proc/cpuinfo` (falling back cleanly if the file does not exist) and prints only lines starting with `"model name"`, `"cpu MHz"`, or `"cache size"` for the first CPU core.
::hint
Use `if let Ok(text) = std::fs::read_to_string("/proc/cpuinfo")`, loop over `for line in text.lines()`, stop at the first empty line (which separates CPU cores in `/proc/cpuinfo`), and check `line.starts_with(...)`.
::solution
```rust run nocmp
fn main() {
    if let Ok(text) = std::fs::read_to_string("/proc/cpuinfo") {
        for line in text.lines() {
            if line.is_empty() {
                break; // stop after CPU 0
            }
            if line.starts_with("model name")
                || line.starts_with("cpu MHz")
                || line.starts_with("cache size")
            {
                println!("{line}");
            }
        }
    } else {
        println!("Not on Linux /proc/cpuinfo");
    }
}
```
```output
model name      : Intel(R) Xeon(R) Processor @ 2.60GHz
cpu MHz         : 2600.012
cache size      : 16384 KB
```

Stopping at the first blank line shows hardware properties for core 0 without duplicating identical entries across every logical CPU.
:::

:::exercise challenge Estimate a latency budget
Suppose a CPU runs at `4.0 GHz` (`0.25 ns` per clock cycle). Roughly how many clock cycles pass while the CPU waits for:
1. An L1 cache hit (`1 ns`)
2. A DRAM main memory miss (`80 ns`)
3. An NVMe SSD read (`40,000 ns`)
4. An HDD seek (`5,000,000 ns`)

Verify your numbers with a tiny Rust calculation.
::hint
Divide each latency in nanoseconds by `0.25` (or multiply by `4` cycles per nanosecond).
::solution
```rust run
fn main() {
    let cycles_per_ns = 4_u64; // 4.0 GHz = 4 cycles per nanosecond
    let tiers = [
        ("L1 cache hit", 1_u64),
        ("DRAM RAM read", 80),
        ("NVMe SSD read", 40_000),
        ("HDD seek", 5_000_000),
    ];

    for (name, ns) in tiers {
        println!("{name:<16} {ns:>10} ns = {:>10} CPU cycles", ns * cycles_per_ns);
    }
}
```
```output
L1 cache hit              1 ns =          4 CPU cycles
DRAM RAM read            80 ns =        320 CPU cycles
NVMe SSD read         40000 ns =     160000 CPU cycles
HDD seek            5000000 ns =   20000000 CPU cycles
```

A single disk seek costs twenty million clock cycles—explaining why operating systems keep hot files cached in RAM and why avoiding unnecessary disk or heap trips matters so much.
:::
