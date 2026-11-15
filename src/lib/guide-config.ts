import type { CalloutKind, PartMeta, RouteMeta } from "./guide-types";

export const RAW_PARTS: Omit<PartMeta, "partLabel" | "partTitle">[] = [
  { key: "welcome", title: "Start here", level: "", blurb: "" },
  {
    key: "p1",
    title: "First steps",
    level: "Beginner",
    blurb:
      "What programming is, how to install Rust, and the building blocks every program is made of: values, functions, decisions and loops.",
  },
  {
    key: "p2",
    title: "Ownership: Rust's big idea",
    level: "Beginner",
    blurb:
      "How computers store data, and the one rule set that lets Rust be both safe and fast: ownership, borrowing and slices.",
  },
  {
    key: "p3",
    title: "Modelling data",
    level: "Beginner",
    blurb:
      "Describe real things in code with structs and enums, take them apart with pattern matching, and store many of them in collections.",
  },
  {
    key: "p4",
    title: "Building bigger programs",
    level: "Intermediate",
    blurb:
      "Organise code into modules, handle errors properly, and write flexible, reusable code with generics, traits and lifetimes. Then prove it works with tests.",
  },
  {
    key: "p5",
    title: "Functional style",
    level: "Intermediate",
    blurb:
      "Closures and iterators: short, expressive code that runs as fast as hand-written loops.",
  },
  {
    key: "p6",
    title: "Memory and types mastery",
    level: "Intermediate",
    blurb:
      "Smart pointers for sharing and shaping data, and a deeper look at Rust's type system.",
  },
  {
    key: "p7",
    title: "Concurrency",
    level: "Advanced",
    blurb:
      "Do many things at once without fear: threads, channels, shared state and async/await.",
  },
  {
    key: "p8",
    title: "Tooling and workflow",
    level: "Intermediate",
    blurb:
      "Everyday Cargo workspaces, formatting with rustfmt, Clippy lints, debugging, CI, and professional testing strategies.",
  },
  {
    key: "p9",
    title: "Advanced Rust",
    level: "Advanced",
    blurb:
      "Macros, unsafe code, talking to other languages, memory layout, and the idioms experienced Rust developers rely on.",
  },
  {
    key: "p10",
    title: "The ecosystem",
    level: "Intermediate",
    blurb:
      "Goal-based domain guides and optional surveys: Serde, Clap, Tokio, Axum, SQLx, observability, UI, games, and embedded.",
  },
  {
    key: "p11",
    title: "Becoming a Rust developer",
    level: "Advanced",
    blurb:
      "Performance, a full capstone project, and a plan for what to do after this guide.",
  },
  {
    key: "app",
    title: "Appendices",
    level: "",
    blurb: "Glossary, cheat sheets and reference tables to keep open while you code.",
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

export const ROUTES: RouteMeta[] = [
  {
    id: "all",
    label: "All chapters",
    summary:
      "The complete curriculum: every language chapter, tool, domain overview, and all 8 projects.",
    chapters: null,
  },
  {
    id: "core",
    label: "Core path",
    summary:
      "Parts 1–5 + Part 8 Tooling: the beginner foundation and everyday Cargo, formatting, Clippy, and testing workflow.",
    chapters: CORE_IDS,
  },
  {
    id: "cli",
    label: "CLI tools",
    summary:
      "Core path plus everyday crate selection, Serde, and the Clap command-line tool project.",
    chapters: [...CORE_IDS, "crates", "serde", "cli"],
  },
  {
    id: "web",
    label: "Web & APIs",
    summary:
      "Core path plus concurrency, async, Axum, SQLx databases, URL shortener API, observability, and capstone.",
    chapters: [
      ...CORE_IDS,
      "smart-pointers",
      "threads",
      "shared-state",
      "async",
      "project-chat",
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
    id: "systems",
    label: "Systems & deep dive",
    summary:
      "Core path plus smart pointers, type system, threads, Part 9 (macros, unsafe, FFI, layout, idioms), and performance.",
    chapters: [
      ...CORE_IDS,
      "smart-pointers",
      "advanced-traits",
      "type-system",
      "threads",
      "shared-state",
      "macros",
      "unsafe",
      "ffi",
      "memory-layout",
      "idioms",
      "performance",
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
  error: "Compiler message",
  dockerfile: "Dockerfile",
  css: "CSS",
  tree: "Folder layout",
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
