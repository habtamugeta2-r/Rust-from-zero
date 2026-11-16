/**
 * In-guide Rust runner and formatter.
 *
 * Compiles, executes, tests, and formats Rust snippets in place against the
 * official Rust Playground HTTP endpoints (`POST /execute` and `POST /format`,
 * which enable CORS for browser origins) and returns structured stdout,
 * runtime stderr, and compiler diagnostics so `CodeBlock` and `HeroRunner`
 * render results directly underneath the code without leaving the guide.
 *
 * When a browser extension or network policy blocks cross-origin calls, each
 * operation falls back once to its validated same-origin route (`/api/run` or
 * `/api/format`).
 */

import type { BlockNode, InlineNode } from "./guide-types";

export const PLAYGROUND_EXECUTE_URL = "https://play.rust-lang.org/execute";
export const PLAYGROUND_FORMAT_URL = "https://play.rust-lang.org/format";
export const FALLBACK_EXECUTE_PATH = "/api/run";
export const FALLBACK_FORMAT_PATH = "/api/format";
export const DEFAULT_RUN_TIMEOUT_MS = 25_000;
export const DEFAULT_FORMAT_TIMEOUT_MS = 15_000;
export const MAX_CODE_BYTES = 64 * 1024;

export type RunMode = "run" | "test";
export type RustChannel = "stable" | "beta" | "nightly";
export type RustBuildMode = "debug" | "release";
export type RustEdition = "2015" | "2018" | "2021" | "2024";
export type RustCrateType = "bin" | "lib";

export interface PlaygroundExecuteRequest {
  channel: RustChannel;
  mode: RustBuildMode;
  edition: RustEdition;
  crateType: RustCrateType;
  tests: boolean;
  backtrace: boolean;
  code: string;
}

export interface PlaygroundExecuteResponse {
  success: boolean;
  exitDetail: string;
  stdout: string;
  stderr: string;
}

export interface PlaygroundFormatRequest {
  channel: RustChannel;
  edition: RustEdition;
  code: string;
}

export type RunOutcome =
  | "ok"
  | "compiled"
  | "tests-passed"
  | "tests-failed"
  | "compile-error"
  | "panic"
  | "runtime-error"
  | "timeout";

export interface RunOutput {
  outcome: RunOutcome;
  /** Standard output printed by the program (or test runner). */
  stdout: string;
  /** Runtime standard error written by the program itself (`eprintln!`, panics, `Err`). */
  stderr: string;
  /** Compiler errors or warnings with Cargo's progress banner removed. */
  diagnostics: string;
  /** Non-zero exit description from Cargo when present. */
  exitDetail: string;
  /** Whether this run had `RUST_BACKTRACE=1` enabled. */
  backtrace: boolean;
  /** Round-trip execution time in milliseconds. */
  durationMs: number;
}

export type RunResult =
  { kind: "ok"; output: RunOutput } | { kind: "cancelled" } | { kind: "error"; message: string };

export type FormatResult =
  { kind: "ok"; code: string } | { kind: "cancelled" } | { kind: "error"; message: string };

export interface DiagnosticSegment {
  text: string;
  tone?: "error" | "warn" | "help";
}

const VALID_CHANNELS = new Set<string>(["stable", "beta", "nightly"]);
const VALID_MODES = new Set<string>(["debug", "release"]);
const VALID_EDITIONS = new Set<string>(["2015", "2018", "2021", "2024"]);
const VALID_CRATE_TYPES = new Set<string>(["bin", "lib"]);

/**
 * External crates pre-installed in the standard compiler sandbox whose versions
 * and enabled feature flags match `guide-src/tools/ext-main-Cargo.toml`.
 *
 * Crates needing extra features, outbound sockets, web servers, databases, or
 * custom targets (`axum`, `sqlx`, `reqwest`, `tracing_subscriber`,
 * `wasm_bindgen`, `embedded_hal`, …) are intentionally excluded so Run only
 * appears on listings that genuinely execute cleanly in place.
 */
export const SUPPORTED_EXT_CRATES = new Set<string>([
  "anyhow",
  "chrono",
  "clap",
  "crossbeam",
  "csv",
  "env_logger",
  "futures",
  "itertools",
  "log",
  "ndarray",
  "parking_lot",
  "rand",
  "rayon",
  "regex",
  "rustc_hash",
  "serde",
  "serde_json",
  "thiserror",
  "tokio",
  "tokio_stream",
  "toml",
]);

const BUILTIN_PATH_ROOTS = new Set<string>([
  "std",
  "core",
  "alloc",
  "self",
  "super",
  "crate",
  "test",
  "bool",
  "char",
  "str",
  "u8",
  "u16",
  "u32",
  "u64",
  "u128",
  "usize",
  "i8",
  "i16",
  "i32",
  "i64",
  "i128",
  "isize",
  "f32",
  "f64",
]);

const BUILTIN_ATTR_ROOTS = new Set<string>([
  "allow",
  "warn",
  "deny",
  "forbid",
  "expect",
  "cfg",
  "cfg_attr",
  "derive",
  "test",
  "should_panic",
  "ignore",
  "inline",
  "cold",
  "repr",
  "must_use",
  "non_exhaustive",
  "deprecated",
  "doc",
  "macro_export",
  "macro_use",
  "no_mangle",
  "unsafe",
  "link",
  "link_section",
  "export_name",
  "used",
  "track_caller",
  "target_feature",
  "global_allocator",
  "panic_handler",
  "no_std",
  "no_main",
  "feature",
  "diagnostic",
  "clippy",
  "rustfmt",
]);

const COMPILING_LINE_RE =
  /^\s*(?:Compiling\s+playground\s+v\S+\s+\([^)]+\)|Blocking\s+waiting\s+for\s+file\s+lock\s+on\s+.+)\s*$/;
const FINISHED_LINE_RE =
  /^\s*Finished\s+(?:`[^`]+`|\S+)(?:\s+profile)?\s+\[[^\]]*\]\s+target\(s\)\s+in\s+[\d.]+s\s*$/;
const RUNNING_LINE_RE =
  /^\s*(?:Running\s+(?:`[^`]+`|unittests\s+\S+.*)|Doc-tests\s+playground)\s*$/;
const CARGO_SUMMARY_RE =
  /^(?:warning:\s+`playground`\s+\([^)]+\)\s+generated\s+\d+\s+warnings?.*|error:\s+could\s+not\s+compile\s+`playground`.*)$/;
const EMPTY_DOCTEST_TAIL_RE =
  /\n+running 0 tests\n+test result: ok\. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out(?:; finished in [\d.]+s)?\s*$/;
// eslint-disable-next-line no-control-regex -- strips ANSI SGR sequences if an upstream emits them
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;

/**
 * Replace comments and string literals with spaces so structural checks
 * (`fn main`, `#[test]`, `#![feature]`, `use crate::…`) ignore strings/comments.
 */
function stripCommentsAndStrings(code: string): string {
  let out = "";
  let i = 0;
  const n = code.length;

  while (i < n) {
    const ch = code[i];
    const next = i + 1 < n ? code[i + 1] : "";

    // Line comment
    if (ch === "/" && next === "/") {
      while (i < n && code[i] !== "\n") i += 1;
      continue;
    }

    // Nested block comment
    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (code[i] === "/" && code[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (code[i] === "*" && code[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else {
          if (code[i] === "\n") out += "\n";
          i += 1;
        }
      }
      out += " ";
      continue;
    }

    // Raw string literal: r"...", r#"..."#, br#"..."#, cr#"..."#
    if (ch === "r" || ((ch === "b" || ch === "c") && next === "r")) {
      const prev = i > 0 ? code[i - 1] : "";
      if (!/[a-zA-Z0-9_]/.test(prev)) {
        let j = ch === "r" ? i + 1 : i + 2;
        let hashes = 0;
        while (j < n && code[j] === "#") {
          hashes += 1;
          j += 1;
        }
        if (j < n && code[j] === '"') {
          j += 1;
          const closing = '"' + "#".repeat(hashes);
          const end = code.indexOf(closing, j);
          const stop = end >= 0 ? end + closing.length : n;
          for (let k = i; k < stop; k += 1) {
            if (code[k] === "\n") out += "\n";
          }
          out += '""';
          i = stop;
          continue;
        }
      }
    }

    // Ordinary string literal
    if (ch === '"') {
      i += 1;
      while (i < n && code[i] !== '"') {
        if (code[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (code[i] === "\n") out += "\n";
        i += 1;
      }
      if (i < n) i += 1;
      out += '""';
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Extract external crate roots referenced by a Rust listing (via `use`,
 * `extern crate`, qualified paths `foo::bar`, or `#[foo::attr]`).
 */
export function referencedExternalCrates(code: string): string[] {
  const clean = stripCommentsAndStrings(code);
  const localMods = new Set<string>();
  for (const m of clean.matchAll(/\bmod\s+([a-z_][a-z0-9_]*)\b/g)) {
    localMods.add(m[1]);
  }

  const explicitRoots = new Set<string>();
  const candidates = new Set<string>();

  for (const m of clean.matchAll(/\buse\s+(?:::)?([a-z_][a-z0-9_]*)(?:::|\s*;|\s+as\b)/g)) {
    const name = m[1];
    if (!BUILTIN_PATH_ROOTS.has(name) && !localMods.has(name)) {
      explicitRoots.add(name);
      candidates.add(name);
    }
  }

  for (const m of clean.matchAll(/\bextern\s+crate\s+([a-z_][a-z0-9_]*)\b/g)) {
    const name = m[1];
    if (!BUILTIN_PATH_ROOTS.has(name)) {
      explicitRoots.add(name);
      candidates.add(name);
    }
  }

  // Track submodules imported with `use parent::sub;` so `sub::item()` is not
  // mistaken for an external crate named `sub`.
  const importedNames = new Set<string>();
  for (const m of clean.matchAll(/\buse\s+([^;]+);/g)) {
    const clause = m[1];
    const firstSep = clause.indexOf("::");
    if (firstSep < 0) continue;
    const tail = clause.slice(firstSep + 2);
    for (const id of tail.matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) {
      if (id[1] !== "self" && id[1] !== "super" && id[1] !== "as") {
        importedNames.add(id[1]);
      }
    }
  }

  for (const m of clean.matchAll(/(?<![:.\w])([a-z][a-z0-9_]*)::/g)) {
    const name = m[1];
    if (
      !BUILTIN_PATH_ROOTS.has(name) &&
      !localMods.has(name) &&
      (!importedNames.has(name) || explicitRoots.has(name))
    ) {
      candidates.add(name);
    }
  }

  for (const m of clean.matchAll(/#!?\s*\[\s*([a-z][a-z0-9_]*)::/g)) {
    const name = m[1];
    if (!BUILTIN_PATH_ROOTS.has(name) && !BUILTIN_ATTR_ROOTS.has(name) && !localMods.has(name)) {
      candidates.add(name);
    }
  }

  return [...candidates];
}

export function areExtCratesSupported(code: string): boolean {
  const crates = referencedExternalCrates(code);
  return crates.length > 0 && crates.every((c) => SUPPORTED_EXT_CRATES.has(c));
}

export function hasMainFn(code: string): boolean {
  return /\bfn\s+main\s*\(/.test(stripCommentsAndStrings(code));
}

export function hasTestAttr(code: string): boolean {
  return /#\[\s*(?:[a-zA-Z0-9_]+::)*test\s*(?:\([^)]*\))?\s*\]/.test(stripCommentsAndStrings(code));
}

export function usesNightlyFeature(code: string): boolean {
  return /^\s*#!\[feature\s*\(/m.test(stripCommentsAndStrings(code));
}

/**
 * Decide whether a parsed code block can execute directly inside the guide.
 *
 * - Standard-library `run`, `wrap`, `panic`, `warns`, and `fail` blocks get
 *   **Run** + **Edit** (on `fail` blocks, Run shows the live compiler error
 *   and Edit lets the reader fix it and watch it pass right below).
 * - Standard-library `test` blocks get **Test** + **Edit**.
 * - Crate (`ext`) `run` and `test` blocks get **Run** / **Test** + **Edit**
 *   whenever every external crate they import is in `SUPPORTED_EXT_CRATES`
 *   (e.g. `tokio`, `serde`, `serde_json`, `toml`, `csv`, `chrono`, `clap`,
 *   `rayon`, `regex`, `itertools`, `rand`, `futures`, `anyhow`, `thiserror`).
 * - Blocks flagged `noplay` (local files, interactive stdin, CLI pipes) stay
 *   read-only.
 */
export function getBlockRunMode(opts: {
  lang: string;
  kind: string;
  rawCode?: string;
  fullCode?: string;
  isExt: boolean;
  noPlay: boolean;
}): RunMode | null {
  if (opts.lang !== "rust" || opts.noPlay) return null;
  const source = opts.fullCode ?? opts.rawCode ?? "";
  if (source.trim().length === 0) return null;

  if (opts.isExt) {
    if (opts.kind !== "run" && opts.kind !== "test") return null;
    if (!areExtCratesSupported(source)) return null;
    return opts.kind === "test" ? "test" : "run";
  }

  if (
    opts.kind === "run" ||
    opts.kind === "wrap" ||
    opts.kind === "fail" ||
    opts.kind === "warns"
  ) {
    return "run";
  }
  if (opts.kind === "panic" && hasMainFn(source)) return "run";
  if (opts.kind === "test") return "test";
  return null;
}

const RUN_LEAD_IN_RE = /^Run cargo (?:run|test)\b/;

/**
 * When `blocks[index]` is a runnable Rust code block followed by its static
 * pre-written `output` or `error` block (either immediately at `index + 1`, or
 * after a short `"Run cargo run/test…"` lead-in paragraph at `index + 1` with
 * the output/error at `index + 2`), return how many following sibling blocks
 * belong to that static output slot (`1` or `2`; otherwise `0`).
 *
 * Pairing them lets `CodeBlockActions` swap out the static output box as soon
 * as the reader clicks Run, Test, or Edit, preventing duplicate live + static
 * outputs from appearing together.
 */
export function consumedPairedOutputCount(
  blocks: readonly BlockNode[],
  index: number,
  plainText: (nodes: InlineNode[]) => string,
): 0 | 1 | 2 {
  const current = blocks[index];
  if (!current || current.type !== "code" || current.isOutput || current.isError) {
    return 0;
  }

  const runMode = getBlockRunMode({
    lang: current.lang,
    kind: current.kind,
    rawCode: current.code,
    fullCode: current.fullCode,
    isExt: current.isExt,
    noPlay: current.noPlay,
  });
  if (!runMode) return 0;

  const next = blocks[index + 1];
  if (!next) return 0;

  if (next.type === "code" && (next.isOutput || next.isError)) {
    return 1;
  }

  const afterNext = blocks[index + 2];
  if (
    next.type === "paragraph" &&
    afterNext?.type === "code" &&
    (afterNext.isOutput || afterNext.isError)
  ) {
    const text = plainText(next.children).trim();
    if (text.length <= 120 && RUN_LEAD_IN_RE.test(text)) {
      return 2;
    }
  }

  return 0;
}

export function buildExecuteRequest(opts: {
  code: string;
  mode: RunMode;
  isRelease?: boolean;
  backtrace?: boolean;
  edition?: RustEdition;
}): PlaygroundExecuteRequest {
  const main = hasMainFn(opts.code);
  const testAttr = hasTestAttr(opts.code);
  const tests = opts.mode === "test" ? testAttr || !main : !main && testAttr;
  const crateType: RustCrateType = main ? "bin" : "lib";

  return {
    channel: usesNightlyFeature(opts.code) ? "nightly" : "stable",
    mode: opts.isRelease ? "release" : "debug",
    edition: opts.edition ?? "2024",
    crateType,
    tests,
    backtrace: Boolean(opts.backtrace),
    code: opts.code,
  };
}

export function validateExecuteRequest(
  body: unknown,
): { ok: true; request: PlaygroundExecuteRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.code !== "string" || raw.code.trim().length === 0) {
    return { ok: false, error: "Code must be a non-empty string." };
  }
  const byteLength = new TextEncoder().encode(raw.code).length;
  if (byteLength > MAX_CODE_BYTES) {
    return {
      ok: false,
      error: "Code is too large to run in the browser (64 KB limit).",
    };
  }
  if (typeof raw.channel !== "string" || !VALID_CHANNELS.has(raw.channel)) {
    return { ok: false, error: "Invalid compiler channel." };
  }
  if (typeof raw.mode !== "string" || !VALID_MODES.has(raw.mode)) {
    return { ok: false, error: "Invalid build mode." };
  }
  if (typeof raw.edition !== "string" || !VALID_EDITIONS.has(raw.edition)) {
    return { ok: false, error: "Invalid Rust edition." };
  }
  if (typeof raw.crateType !== "string" || !VALID_CRATE_TYPES.has(raw.crateType)) {
    return { ok: false, error: "Invalid crate type." };
  }
  if (typeof raw.tests !== "boolean" || typeof raw.backtrace !== "boolean") {
    return { ok: false, error: "Invalid execution flags." };
  }

  return {
    ok: true,
    request: {
      channel: raw.channel as RustChannel,
      mode: raw.mode as RustBuildMode,
      edition: raw.edition as RustEdition,
      crateType: raw.crateType as RustCrateType,
      tests: raw.tests,
      backtrace: raw.backtrace,
      code: raw.code,
    },
  };
}

export function validateFormatRequest(
  body: unknown,
): { ok: true; request: PlaygroundFormatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }
  const raw = body as Record<string, unknown>;
  if (typeof raw.code !== "string" || raw.code.trim().length === 0) {
    return { ok: false, error: "Code must be a non-empty string." };
  }
  const byteLength = new TextEncoder().encode(raw.code).length;
  if (byteLength > MAX_CODE_BYTES) {
    return {
      ok: false,
      error: "Code is too large to format in the browser (64 KB limit).",
    };
  }
  const channel = typeof raw.channel === "string" ? raw.channel : "stable";
  if (!VALID_CHANNELS.has(channel)) {
    return { ok: false, error: "Invalid compiler channel." };
  }
  const edition = typeof raw.edition === "string" ? raw.edition : "2024";
  if (!VALID_EDITIONS.has(edition)) {
    return { ok: false, error: "Invalid Rust edition." };
  }
  return {
    ok: true,
    request: {
      channel: channel as RustChannel,
      edition: edition as RustEdition,
      code: raw.code,
    },
  };
}

function normaliseNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function trimBlankLines(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end).join("\n");
}

/**
 * Split a raw Rust Playground `/execute` response into clean stdout, runtime
 * stderr, and compiler diagnostics, and classify the outcome.
 */
export function parseExecuteResponse(
  res: PlaygroundExecuteResponse,
  opts: {
    isTest: boolean;
    isLibCheck?: boolean;
    backtrace?: boolean;
    durationMs: number;
  },
): RunOutput {
  const rawStderr = normaliseNewlines(res.stderr ?? "").replace(ANSI_ESCAPE_RE, "");
  const exitDetail = (res.exitDetail ?? "").trim();

  const diagnosticLines: string[] = [];
  const runtimeStderrLines: string[] = [];
  let didCompile = false;

  for (const line of rawStderr.split("\n")) {
    if (!didCompile) {
      if (FINISHED_LINE_RE.test(line)) {
        didCompile = true;
        continue;
      }
      if (COMPILING_LINE_RE.test(line) || CARGO_SUMMARY_RE.test(line)) {
        continue;
      }
      diagnosticLines.push(line);
    } else {
      if (RUNNING_LINE_RE.test(line)) {
        continue;
      }
      runtimeStderrLines.push(line);
    }
  }

  let diagnostics = trimBlankLines(diagnosticLines);
  const stderr = trimBlankLines(runtimeStderrLines);

  let stdout = normaliseNewlines(res.stdout ?? "").replace(/\n+$/, "");
  if (opts.isTest && didCompile) {
    stdout = stdout.replace(/^\n+/, "");
    // `cargo test` on a library crate runs doc-tests after unit tests; hide the
    // empty "running 0 tests" trailer when unit tests already printed above it.
    if (/^running [1-9]\d* tests?\b/m.test(stdout)) {
      stdout = stdout.replace(EMPTY_DOCTEST_TAIL_RE, "");
    }
  }

  // Never hide why a failed build failed if Cargo emitted an unusual line.
  if (!res.success && !didCompile && diagnostics === "" && rawStderr.trim() !== "") {
    diagnostics = trimBlankLines(rawStderr.split("\n"));
  }

  const timedOut =
    !res.success &&
    (/\b(?:timed?\s*out|time limit|SIGKILL|signal:?\s*9)\b/i.test(exitDetail) ||
      /(?:^|\n)Killed\s*$/.test(stderr));

  let outcome: RunOutcome;
  if (timedOut) {
    outcome = "timeout";
  } else if (res.success) {
    outcome = opts.isTest ? "tests-passed" : opts.isLibCheck ? "compiled" : "ok";
  } else if (!didCompile) {
    outcome = "compile-error";
  } else if (opts.isTest) {
    outcome = "tests-failed";
  } else if (/thread '[^']+' (?:\(\d+\) )?panicked\b/.test(stderr)) {
    outcome = "panic";
  } else {
    outcome = "runtime-error";
  }

  return {
    outcome,
    stdout,
    stderr,
    diagnostics,
    exitDetail,
    backtrace: Boolean(opts.backtrace),
    durationMs: Math.max(0, Math.round(opts.durationMs)),
  };
}

/**
 * Tokenise one compiler or panic line into plain and tinted spans matching the
 * guide's `.err-er` / `.err-wr` / `.err-hl` classes (no `innerHTML` needed).
 */
export function tokenizeDiagnosticLine(line: string): DiagnosticSegment[] {
  const errHead = /^(error(?:\[E\d+\])?)(:.*)?$/.exec(line);
  if (errHead) {
    return errHead[2]
      ? [{ text: errHead[1], tone: "error" }, { text: errHead[2] }]
      : [{ text: errHead[1], tone: "error" }];
  }

  const panicHead = /^(thread '[^']+' (?:\(\d+\) )?panicked)(.*)$/.exec(line);
  if (panicHead) {
    return panicHead[2]
      ? [{ text: panicHead[1], tone: "error" }, { text: panicHead[2] }]
      : [{ text: panicHead[1], tone: "error" }];
  }

  const warnHead = /^(warning(?:\[[^\]]+\])?)(:.*)?$/.exec(line);
  if (warnHead) {
    return warnHead[2]
      ? [{ text: warnHead[1], tone: "warn" }, { text: warnHead[2] }]
      : [{ text: warnHead[1], tone: "warn" }];
  }

  const helpNote = /^(\s*=?\s*)(help|note)(:.*)$/.exec(line);
  if (helpNote) {
    return [
      ...(helpNote[1] ? [{ text: helpNote[1] }] : []),
      { text: helpNote[2], tone: "help" },
      { text: helpNote[3] },
    ];
  }

  const arrow = /^(\s*)(-->)(.*)$/.exec(line);
  if (arrow) {
    return [
      ...(arrow[1] ? [{ text: arrow[1] }] : []),
      { text: arrow[2], tone: "help" },
      { text: arrow[3] },
    ];
  }

  const caret = /^(\s*(?:\d+)?\s*\|\s*)((?:\^+|-{2,})[^\n]*)$/.exec(line);
  if (caret) {
    return [
      { text: caret[1] },
      {
        text: caret[2],
        tone: caret[2].includes("^") ? "error" : "help",
      },
    ];
  }

  return [{ text: line }];
}

export function formatRunDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`;
}

async function postJson(
  url: string,
  payload: unknown,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  isCrossOrigin: boolean,
): Promise<Response> {
  return fetchImpl(url, {
    method: "POST",
    mode: isCrossOrigin ? "cors" : "same-origin",
    credentials: isCrossOrigin ? "omit" : "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
}

async function postWithFallback(opts: {
  endpoint: string;
  fallback: string | null;
  payload: unknown;
  timeoutMs: number;
  userSignal?: AbortSignal;
  fetchImpl: typeof fetch;
}): Promise<
  | { kind: "response"; response: Response }
  | { kind: "cancelled" }
  | { kind: "error"; message: string }
> {
  if (opts.userSignal?.aborted) return { kind: "cancelled" };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs);

  const onUserAbort = () => controller.abort();
  opts.userSignal?.addEventListener("abort", onUserAbort, { once: true });

  const timeoutMessage =
    "Compilation timed out. The Rust compiler service may be busy — press Run to try again.";

  try {
    try {
      const response = await postJson(
        opts.endpoint,
        opts.payload,
        controller.signal,
        opts.fetchImpl,
        opts.endpoint.startsWith("http"),
      );
      return { kind: "response", response };
    } catch {
      if (opts.userSignal?.aborted) return { kind: "cancelled" };
      if (timedOut) return { kind: "error", message: timeoutMessage };
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      if (offline || !opts.fallback) {
        return {
          kind: "error",
          message: offline
            ? "You appear to be offline. Connect to the internet and press Run again."
            : "Could not reach the Rust compiler service. Check your internet connection and try again.",
        };
      }
      const response = await postJson(
        opts.fallback,
        opts.payload,
        controller.signal,
        opts.fetchImpl,
        false,
      );
      return { kind: "response", response };
    }
  } catch {
    if (opts.userSignal?.aborted) return { kind: "cancelled" };
    if (timedOut) return { kind: "error", message: timeoutMessage };
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    return {
      kind: "error",
      message: offline
        ? "You appear to be offline. Connect to the internet and press Run again."
        : "Could not reach the Rust compiler service. Check your internet connection and try again.",
    };
  } finally {
    clearTimeout(timer);
    opts.userSignal?.removeEventListener("abort", onUserAbort);
  }
}

async function readExecutePayload(
  response: Response,
): Promise<{ ok: true; data: PlaygroundExecuteResponse } | { ok: false; message: string }> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const serverError =
    record && typeof record.error === "string" && record.error.trim().length > 0
      ? record.error.trim()
      : null;

  if (!response.ok) {
    return {
      ok: false,
      message:
        serverError ??
        `The Rust compiler service returned an error (HTTP ${response.status}). Please try again.`,
    };
  }

  if (serverError) {
    return { ok: false, message: serverError };
  }

  if (!record || typeof record.success !== "boolean") {
    return {
      ok: false,
      message: "Received an unexpected response from the Rust compiler service.",
    };
  }

  return {
    ok: true,
    data: {
      success: record.success,
      exitDetail: typeof record.exitDetail === "string" ? record.exitDetail : "",
      stdout: typeof record.stdout === "string" ? record.stdout : "",
      stderr: typeof record.stderr === "string" ? record.stderr : "",
    },
  };
}

export interface ExecuteRustOptions {
  code: string;
  mode: RunMode;
  isRelease?: boolean;
  backtrace?: boolean;
  edition?: RustEdition;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  fallbackEndpoint?: string | null;
}

/**
 * Compile and run Rust code in place, returning a structured `RunResult`.
 */
export async function executeRustCode(opts: ExecuteRustOptions): Promise<RunResult> {
  if (opts.code.trim().length === 0) {
    return {
      kind: "error",
      message: "Nothing to run — enter some Rust code first.",
    };
  }

  const byteLength = new TextEncoder().encode(opts.code).length;
  if (byteLength > MAX_CODE_BYTES) {
    return {
      kind: "error",
      message: "This snippet is too large to run in the browser (64 KB limit).",
    };
  }

  const req = buildExecuteRequest({
    code: opts.code,
    mode: opts.mode,
    isRelease: opts.isRelease,
    backtrace: opts.backtrace,
    edition: opts.edition,
  });

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  const sent = await postWithFallback({
    endpoint: opts.endpoint ?? PLAYGROUND_EXECUTE_URL,
    fallback: opts.fallbackEndpoint === undefined ? FALLBACK_EXECUTE_PATH : opts.fallbackEndpoint,
    payload: req,
    timeoutMs: opts.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
    userSignal: opts.signal,
    fetchImpl: opts.fetchImpl ?? fetch,
  });

  if (sent.kind !== "response") return sent;

  const parsed = await readExecutePayload(sent.response);
  if (!parsed.ok) {
    return { kind: "error", message: parsed.message };
  }

  const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    kind: "ok",
    output: parseExecuteResponse(parsed.data, {
      isTest: req.tests,
      isLibCheck: !req.tests && req.crateType === "lib",
      backtrace: req.backtrace,
      durationMs: endedAt - startedAt,
    }),
  };
}

export interface FormatRustOptions {
  code: string;
  edition?: RustEdition;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  fallbackEndpoint?: string | null;
}

/**
 * Format Rust source code in place with `rustfmt`.
 */
export async function formatRustCode(opts: FormatRustOptions): Promise<FormatResult> {
  if (opts.code.trim().length === 0) {
    return { kind: "ok", code: opts.code };
  }
  const byteLength = new TextEncoder().encode(opts.code).length;
  if (byteLength > MAX_CODE_BYTES) {
    return {
      kind: "error",
      message: "This snippet is too large to format (64 KB limit).",
    };
  }

  const req: PlaygroundFormatRequest = {
    channel: usesNightlyFeature(opts.code) ? "nightly" : "stable",
    edition: opts.edition ?? "2024",
    code: opts.code,
  };

  const sent = await postWithFallback({
    endpoint: opts.endpoint ?? PLAYGROUND_FORMAT_URL,
    fallback: opts.fallbackEndpoint === undefined ? FALLBACK_FORMAT_PATH : opts.fallbackEndpoint,
    payload: req,
    timeoutMs: opts.timeoutMs ?? DEFAULT_FORMAT_TIMEOUT_MS,
    userSignal: opts.signal,
    fetchImpl: opts.fetchImpl ?? fetch,
  });

  if (sent.kind !== "response") return sent;

  let body: unknown;
  try {
    body = await sent.response.json();
  } catch {
    body = null;
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!sent.response.ok || !record) {
    const err =
      record && typeof record.error === "string"
        ? record.error
        : "Could not format this code right now.";
    return { kind: "error", message: err };
  }

  if (record.success !== true || typeof record.code !== "string") {
    const stderr =
      typeof record.stderr === "string" && record.stderr.trim().length > 0
        ? record.stderr.trim().split("\n")[0]
        : "Fix syntax errors before formatting.";
    return { kind: "error", message: stderr };
  }

  return { kind: "ok", code: record.code.replace(/\n+$/, "") };
}
