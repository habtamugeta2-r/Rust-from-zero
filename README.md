# Rust from Zero — Systems & Internals Edition

An interactive, self-study guide that teaches both **how computers work internally** and **the Rust programming language**, starting from zero. It bridges transistors, CPU registers, compilation stages (`AST` -> `HIR` -> `MIR` -> `LLVM IR`), assembly and ELF executables, Rust language & standard-library internals, virtual memory, allocators, OS kernels, I/O (`epoll`/`io_uring`), CPU microarchitecture, concurrency/async internals, TCP/IP networking, storage filesystems, and full-stack Rust applications (`serde`, Tokio, Clap, Axum, SQLx, OpenTelemetry, Tauri, Bevy, and more).

The guide runs as a **Next.js (App Router, TypeScript, Tailwind CSS)** web
application built directly from the Markdown chapters in
[`guide-src/chapters/`](./guide-src/chapters/) and captured compiler outputs in
[`guide-src/captured/`](./guide-src/captured/). Reading progress, completed
exercises, quiz answers, themes, font size, learning-route filters, and
full-text search all work out of the box.

## What is in it

| | |
|---|---|
| Sections | 88 total across 13 Parts + 5 Appendices (81 numbered chapters + 2 welcome guides + 5 appendices), including 9 projects & labs |
| Examples | 1,308 code blocks, **991 of them Rust** (plus x86-64/ARM64 assembly, LLVM IR, C, SQL, and Linux CLI) |
| Exercises | 274, every one with a hint and a worked solution |
| Quiz questions | 351, each with an explanation of the answer |
| Captured output | 104 real compiler messages and program outputs |
| Stack | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Shiki |

Every chapter follows the same rhythm: the idea in plain words, an analogy,
comparison tables, runnable examples and machine-level walkthroughs, exercises,
a quiz, and a recap. Verified Rust examples are compiled and checked against
printed output by `guide-src/tools/check.py` (Rust Edition 2024).

## What the guide covers (13 Parts + 5 Appendices)

Explore the full dependency graph in the **[Complete Learning Roadmap](./guide-src/chapters/00b-roadmap.md)** (`#roadmap`) or filter by route (**Core Rust**, **Systems & internals**, **CLI tools**, **Web & APIs**, **Optional surveys**) directly on the home page:

- **Welcome (`00-start`, `00b-roadmap`):** How to study with the 10-stage systems lens, plus the complete chapter-by-chapter dependency map
- **Part I — Understanding computers from the inside:** why Rust exists, hardware architecture (CPU, ALU, registers, caches, DRAM, buses), bits/bytes/two's complement/IEEE-754/UTF-8/endianness, and setting up Rust + Linux inspection tools
- **Part II — From source code to machine instructions:** `rustc` pipeline (lexing, AST, HIR, MIR, LLVM IR), code generation, x86-64/ARM64 assembly, machine opcodes, object files, linking, and ELF segments
- **Part III — Rust language and compiler internals:** syntax, ownership, borrowing, slices, structs, enums, collections, modules, errors, generics, traits, lifetimes, closures, iterators, smart pointers, advanced traits, typestates, macros, `unsafe`, FFI, memory layout, standard-library internals (`RawVec`, `Vec`, `String`, `Box`, `RcBox`, `UnsafeCell`, `MaybeUninit`, provenance), idioms, and 4 progressive projects
- **Part IV — Memory management and organisation:** virtual address spaces, 4-level page tables, MMU/TLB, `/proc/self/maps`, real allocators (`GlobalAlloc`, slabs, `jemalloc`/`mimalloc`, writing a bump allocator), safety bugs, and 64-byte CPU cache locality & false sharing
- **Part V — How programs execute:** `fork`/`execve`, `ld-linux`, GOT/PLT, `_start` to `std::rt::lang_start`, System V AMD64 vs AAPCS64 calling conventions, stack frames, and a complete 10-layer end-to-end execution trace
- **Part VI — Operating system internals:** Ring 3 vs Ring 0, Linux `syscall` ABI, `vDSO`, processes vs threads (`clone`), EEVDF scheduling, context switching, hardware IRQs, POSIX signals, and `futex`
- **Part VII — Input and output (I/O):** file descriptors, pipes, `BufReader`/`BufWriter`, non-blocking `EAGAIN`, `epoll`, and `io_uring`
- **Part VIII — CPU architecture and instruction execution:** CISC vs RISC ISAs, flags & `cmov`, 5-stage pipelines, branch prediction, superscalar OoO execution & Spectre, MESI coherency, store buffers, `Acquire`/`Release`, and SIMD vectorisation
- **Part IX — Concurrency and asynchronous programming:** threads, `Arc`/`Mutex`/atomics, `async`/`.await`, async state-machine lowering, `Pin`, Tokio work-stealing scheduler, async chat server project, and Rayon/Tokio/Tower patterns
- **Part X — Networking and communication:** Ethernet/MAC/ARP, IPv4/IPv6/CIDR/NAT, TCP/UDP sockets, framing, congestion control, DNS, TLS 1.3, HTTP/1.1–3 packet trace, Axum web servers, and observability/OpenTelemetry
- **Part XI — Storage and file systems:** HDD vs NAND SSD FTL/wear leveling/NVMe `blk-mq`, VFS inodes/dentries, Linux Page Cache, crash-safe `rename()`/`fsync()`, `mmap`, SQLx/Diesel/SeaORM databases, and URL-shortener API project
- **Part XII — Practical system programming with Rust:** Cargo workspaces, `rustfmt`/Clippy/CI, testing strategies, `clap` CLI project, performance profiling & flame graphs, a pure-Rust **Linux `/proc` & ELF64 systems inspector lab**, and the full-stack library capstone project
- **Part XIII — Applied Rust ecosystem and next steps:** crate selection, Serde, WebAssembly/Tauri/GUI apps, Bevy/`no_std`/data science, and continuing paths
- **Appendices (`A`–`E`):** Searchable glossary, Rust & Linux/ABI quick reference tables, real compiler error catalogue, translation guides from Python, JS/TS, Java/C#, Go, and C/C++, and a from-source-to-silicon end-to-end compiler/OS/CPU walkthrough (`94-under-the-hood`)

## What it deliberately does not cover

"Everything in computing" is unbounded, so this guide maintains a clear coverage boundary declared in [Where to go from here](./guide-src/chapters/53-next.md): blockchain/Web3 (`solana`, `anchor`), writing a complete standalone bootable OS kernel from scratch (`blog_os`, Rust for Linux kernel drivers), robotics (`ROS 2`), high-frequency trading, and provider-specific cloud SDKs beyond S3-compatible patterns are pointed cleanly to dedicated follow-on references.

## Run locally

Requires Node.js 22+ and npm. From the repository root:

```sh
npm install
npm run dev       # start development server at http://localhost:3000
```

For a production build and server:

```sh
npm run verify:content   # validates all 88 sections, links & captured outputs
npm run typecheck        # TypeScript check
npm run build            # builds all routes and static chapter pages
npm start                # serves the production Next.js app on port 3000
```

The editable chapters live in [`guide-src/chapters/`](./guide-src/chapters/),
captured outputs live in [`guide-src/captured/`](./guide-src/captured/), and the
Next.js parser, syntax highlighter and UI live in [`src/`](./src/).

## Deploy to Vercel

The repository is a standard Next.js App Router project and deploys to Vercel
with no extra configuration:

```sh
npx vercel        # preview deployment
npx vercel --prod # production deployment
```

Or import the repository in the Vercel dashboard (framework preset: **Next.js**;
Node.js 22.x). The `/api/search` route runs as a serverless function; the
chapter pages are fully prerendered static output.

## Verify

```sh
# Content & Next.js checks:
npm run verify:content
npm run typecheck
npm run build

# Structure: header fields, analogies, boxes, exercise/quiz minimums.
# Must report "0 structural remark(s)".
python3 guide-src/tools/audit.py --strict

python3 guide-src/tools/audit.py outline    # the full table of contents
python3 guide-src/tools/audit.py terms      # every glossary term
python3 guide-src/tools/audit.py find epoll # which chapters mention a word

# Compile, run and diff every Rust example (needs the Rust toolchain).
guide-src/tools/setup-env.sh                # installs it under /opt/rs
python3 guide-src/tools/check.py            # the whole guide
python3 guide-src/tools/check.py serde web  # only chapters matching a substring
python3 guide-src/tools/check.py --ext      # also cargo-check & cargo-test the crate examples
python3 guide-src/tools/check.py --projects # rebuild & test all multi-file and Wasm/no_std projects
```

CI verifies the Next.js build, `verify:content`, and `audit.py --strict` on
every push, and **compiles and tests every verified Rust example and extracted
project** (see [`.github/workflows/build.yml`](./.github/workflows/build.yml)
and [`.github/workflows/guide-checks.yml`](./.github/workflows/guide-checks.yml)).

## Licence

Prose and figures: CC BY 4.0. Code listings and tools: MIT. See
[`LICENSE`](./LICENSE).
