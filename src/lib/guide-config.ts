import type { CalloutKind, PartMeta, RouteMeta } from "./guide-types";

export const RAW_PARTS: Omit<PartMeta, "partLabel" | "partTitle">[] = [
  { key: "welcome", title: "Start here", level: "", blurb: "" },
  {
    key: "p1",
    title: "Understanding computers from the inside",
    level: "Beginner",
    blurb:
      "Hardware and software, CPU registers, the ALU and control unit, RAM/ROM/SSD/HDD, system buses, binary and hex representation, and setting up your Rust and Linux inspection toolkit.",
  },
  {
    key: "p2",
    title: "From source code to machine instructions",
    level: "Beginner",
    blurb:
      "Lexing, parsing, ASTs, semantic analysis, HIR, MIR, LLVM IR, optimisation, assembly, machine code, static and dynamic linking, ELF binaries, and inspecting compiled Rust code.",
  },
  {
    key: "p3",
    title: "Rust foundations and ownership",
    level: "Beginner",
    blurb:
      "Variables, data types, functions, control flow, stack and heap memory, ownership, borrowing, slices, structs, enums, patterns, collections, and two guided projects.",
  },
  {
    key: "p3b",
    title: "Modular Rust, abstractions, and tooling",
    level: "Intermediate",
    blurb:
      "Modules, error handling, generics, traits, lifetimes, testing, closures, iterators, Cargo workflows, formatting and Clippy, testing strategies, and two projects.",
  },
  {
    key: "p3c",
    title: "Advanced Rust, unsafe, and everyday crates",
    level: "Advanced",
    blurb:
      "Smart pointers, advanced traits, type-driven design, macros, unsafe Rust, FFI, memory layout, standard-library internals, idioms, everyday crates, and Serde.",
  },
  {
    key: "p4",
    title: "Memory management and organisation",
    level: "Intermediate",
    blurb:
      "Virtual vs physical memory, address spaces, page tables, protection, stack/heap/static segments, real allocators, pointer arithmetic, leaks/overflows, and CPU cache hierarchy.",
  },
  {
    key: "p5",
    title: "How programs execute",
    level: "Intermediate",
    blurb:
      "Executable launch, OS loaders, process memory layout, _start and lang_start, calling conventions, stack frames, CPU instruction cycles, destructors, and full end-to-end execution traces.",
  },
  {
    key: "p6",
    title: "Operating system internals",
    level: "Intermediate",
    blurb:
      "User space vs kernel space, system calls, processes and threads, scheduling, context switching, futexes, interrupts, signals, file descriptors, permissions, and Linux architecture.",
  },
  {
    key: "p7",
    title: "Input and output (I/O)",
    level: "Intermediate",
    blurb:
      "Standard streams, terminals, file descriptors, read/write syscalls, buffering, non-blocking I/O, epoll, io_uring, and tracing Rust Read/Write calls down to kernel hardware.",
  },
  {
    key: "p8",
    title: "CPU architecture and instruction execution",
    level: "Intermediate",
    blurb:
      "x86-64 and ARM64 ISAs, instruction decoding, pipelining, branch prediction, superscalar and out-of-order execution, MESI cache coherency, hardware atomics, and SIMD.",
  },
  {
    key: "p9",
    title: "Concurrency and asynchronous programming",
    level: "Advanced",
    blurb:
      "Threads, shared memory, Send/Sync, atomics, memory ordering, futex-backed mutexes, channels, async/await state machines, futures, wakers, executors, and Tokio.",
  },
  {
    key: "p10",
    title: "Networking and communication",
    level: "Intermediate",
    blurb:
      "OSI and TCP/IP models, Ethernet, IP, routing, TCP, UDP, DNS, HTTP, TLS, BSD sockets, kernel sk_buff buffers, end-to-end HTTP tracing, Axum web servers, and observability.",
  },
  {
    key: "p11",
    title: "Storage and file systems",
    level: "Intermediate",
    blurb:
      "HDD and SSD/NVMe internals, blocks and sectors, file systems, inodes, journaling, kernel page cache, mmap, std::fs operations, and relational databases.",
  },
  {
    key: "p12",
    title: "Practical system programming with Rust",
    level: "Intermediate",
    blurb:
      "CLI utilities with Clap, performance profiling, hands-on Linux inspection labs (GDB, objdump, readelf, strace, perf, /proc), and the full-stack library capstone.",
  },
  {
    key: "p13",
    title: "Applied Rust ecosystem and next steps",
    level: "Intermediate",
    blurb:
      "UI/WebAssembly/Tauri, games and embedded systems, and where to continue your journey.",
  },
  {
    key: "def",
    title: "The Definitive Curriculum",
    level: "All levels",
    blurb:
      "Thirteen domain-complete chapters, D1 to D13, covering the language, async and concurrency, systems programming, backend, blockchain, security, AI and machine learning, embedded and IoT, DevOps, networking, games, WebAssembly, and advanced meta-programming. Each chapter stands on its own and links into the deep-dive library.",
  },
  {
    key: "app",
    title: "Appendices",
    level: "",
    blurb: "Glossary, systems and Rust reference tables, compiler error catalogue, and translation guides.",
  },
];

export const CORE_IDS = [
  "what-is-rust",
  "setup",
  "variables",
  "types",
  "functions",
  "control-flow",
  "project-guessing",
  "memory",
  "ownership",
  "borrowing",
  "slices-strings",
  "structs",
  "enums",
  "patterns",
  "collections",
  "project-todo",
  "modules",
  "errors",
  "generics",
  "traits",
  "lifetimes",
  "testing",
  "project-search",
  "closures",
  "iterators",
  "project-report",
  "cargo",
  "quality-tools",
  "testing-strategies",
];

export const SYSTEMS_IDS = [
  "what-is-rust",
  "hardware-architecture",
  "bits-bytes-representation",
  "setup",
  "compilation-pipeline",
  "assembly-machine-code",
  "linking-elf",
  "memory",
  "ownership",
  "borrowing",
  "slices-strings",
  "smart-pointers",
  "advanced-traits",
  "type-system",
  "unsafe",
  "ffi",
  "memory-layout",
  "rust-stdlib-internals",
  "virtual-memory-address-spaces",
  "allocators-heap-internals",
  "pointers-safety-caches",
  "program-loading-startup",
  "calling-conventions-execution",
  "end-to-end-trace",
  "kernel-syscalls-processes",
  "processes-threads-scheduling",
  "sync-interrupts-signals",
  "streams-fds-buffering",
  "blocking-epoll-io-uring",
  "isa-opcodes-control-flow",
  "pipelines-branch-prediction-ooo",
  "cache-coherency-atomics-simd",
  "threads",
  "shared-state",
  "async",
  "concurrency-async-internals",
  "network-layers-ethernet-ip",
  "tcp-udp-sockets-kernel",
  "dns-http-tls-trace",
  "storage-hardware-blocks",
  "filesystems-cache-mmap",
  "performance",
  "linux-systems-lab",
];

/**
 * The thirteen chapters of the definitive curriculum, in reading order. They
 * carry a `D` prefix because the 83 numbered chapters and 524 in-prose
 * references to them predate this track; renumbering the library would
 * falsify every one of those references.
 */
export const DEFINITIVE_IDS = [
  "core-language",
  "async-concurrency",
  "systems-programming",
  "backend-development",
  "blockchain-development",
  "security-engineering",
  "ai-ml",
  "embedded-iot",
  "devops-tooling",
  "network-programming",
  "game-development",
  "webassembly",
  "advanced-patterns",
];

export const ROUTES: RouteMeta[] = [
  {
    id: "all",
    label: "All chapters",
    summary:
      "The complete 15-part curriculum: computer systems from hardware up, Rust internals, and 9 hands-on projects.",
    chapters: null,
  },
  {
    id: "definitive",
    label: "Definitive 13",
    summary:
      "The domain-complete track, D1 to D13: language, async and concurrency, systems, backend, blockchain, security, AI and ML, embedded and IoT, DevOps, networking, games, WebAssembly, and advanced meta-programming.",
    chapters: DEFINITIVE_IDS,
  },
  {
    id: "core",
    label: "Core Rust path",
    summary:
      "Beginner-friendly Rust syntax, ownership, traits, testing, Cargo, formatting, Clippy, and testing strategies.",
    chapters: CORE_IDS,
  },
  {
    id: "systems",
    label: "Systems & internals",
    summary:
      "Hardware, compiler IR/ELF, Rust internals, virtual memory, allocators, OS kernel, I/O, CPU pipelines, networking, storage & Linux lab.",
    chapters: SYSTEMS_IDS,
  },
  {
    id: "cli",
    label: "CLI tools",
    summary:
      "Core path plus I/O streams, everyday crate selection, Serde, and the Clap command-line tool project.",
    chapters: [...CORE_IDS, "streams-fds-buffering", "crates", "serde", "cli"],
  },
  {
    id: "web",
    label: "Web & APIs",
    summary:
      "Core path plus concurrency, async/epoll, TCP/TLS/HTTP, Axum, SQLx databases, URL shortener API, observability, and capstone.",
    chapters: [
      ...CORE_IDS,
      "smart-pointers",
      "blocking-epoll-io-uring",
      "threads",
      "shared-state",
      "async",
      "concurrency-async-internals",
      "project-chat",
      "network-layers-ethernet-ip",
      "tcp-udp-sockets-kernel",
      "dns-http-tls-trace",
      "crates",
      "serde",
      "async-ecosystem",
      "web",
      "databases",
      "project-api",
      "observability",
      "capstone",
    ],
  },
  {
    id: "surveys",
    label: "Optional surveys",
    summary:
      "Standalone domain overviews (WebAssembly, Tauri, desktop GUI, games, embedded, data) to explore as needed.",
    chapters: ["apps", "games-embedded"],
  },
];

export const LEVEL_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  all: "All levels",
};

export const CALLOUT_LABELS: Record<CalloutKind, string> = {
  analogy: "Real-world analogy",
  plain: "In plain English",
  compare: "How other languages do it",
  warn: "Watch out",
  tip: "Tip",
  note: "Good to know",
  key: "Key idea",
  recap: "Recap",
};

export const LANG_LABELS: Record<string, string> = {
  rust: "Rust",
  toml: "TOML",
  sh: "Terminal",
  c: "C",
  cpp: "C++",
  json: "JSON",
  protobuf: "Protocol Buffers",
  sql: "SQL",
  html: "HTML",
  python: "Python",
  js: "JavaScript",
  ts: "TypeScript",
  yaml: "YAML",
  java: "Java",
  go: "Go",
  text: "Text",
  output: "Output",
  flame: "Flame graph",
  error: "Compiler message",
  dockerfile: "Dockerfile",
  css: "CSS",
  tree: "Folder layout",
  asm: "Assembly",
  llvm: "LLVM IR",
  mir: "Rust MIR",
  diff: "Diff",
};

export const CHECK_FLAGS = new Set([
  "run",
  "wrap",
  "check",
  "fail",
  "panic",
  "test",
  "ext",
  "warns",
]);
