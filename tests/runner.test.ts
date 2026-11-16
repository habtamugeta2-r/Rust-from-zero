import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { POST as runPost } from "../src/app/api/run/route";
import { POST as formatPost } from "../src/app/api/format/route";
import { CodeBlock } from "../src/components/CodeBlock";
import { GuideStateProvider } from "../src/components/GuideStateProvider";
import { HeroRunner } from "../src/components/HeroRunner";
import { loadGuide } from "../src/lib/guide-parser";
import type { BlockNode } from "../src/lib/guide-types";
import {
  FALLBACK_EXECUTE_PATH,
  FALLBACK_FORMAT_PATH,
  MAX_CODE_BYTES,
  PLAYGROUND_EXECUTE_URL,
  PLAYGROUND_FORMAT_URL,
  buildExecuteRequest,
  executeRustCode,
  formatRunDuration,
  formatRustCode,
  getBlockRunMode,
  parseExecuteResponse,
  referencedExternalCrates,
  tokenizeDiagnosticLine,
  validateExecuteRequest,
  validateFormatRequest,
} from "../src/lib/rust-runner";

describe("in-guide Rust runner", () => {
  it("selects the right run mode across std, fail, warns, and ext blocks", () => {
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "run",
        rawCode: 'fn main() { println!("hi"); }',
        isExt: false,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "wrap",
        rawCode: "let x = 2 + 2;",
        fullCode: "fn main() {\nlet x = 2 + 2;\n}",
        isExt: false,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "fail",
        rawCode: "fn longest(a: &str, b: &str) -> &str { a }",
        isExt: false,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "warns",
        rawCode: "fn main() { let unused = 1; }",
        isExt: false,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "panic",
        rawCode: 'fn main() { panic!("boom"); }',
        isExt: false,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "test",
        rawCode: "#[test]\nfn adds() { assert_eq!(2 + 2, 4); }",
        isExt: false,
        noPlay: false,
      }),
      "test",
    );

    // Supported external crates run in place.
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "run",
        rawCode: '#[tokio::main]\nasync fn main() { println!("async in place"); }',
        isExt: true,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "run",
        rawCode:
          'use serde::{Deserialize, Serialize};\nfn main() { let s = serde_json::to_string(&vec![1, 2]).unwrap(); println!("{s}"); }',
        isExt: true,
        noPlay: false,
      }),
      "run",
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "test",
        rawCode:
          "use itertools::Itertools;\n#[test]\nfn uniq() { assert_eq!(vec![1,1,2].into_iter().unique().count(), 2); }",
        isExt: true,
        noPlay: false,
      }),
      "test",
    );

    // Crates needing servers, DBs, outbound sockets, or special targets stay read-only.
    for (const unsupported of [
      "use axum::Router;\n#[tokio::main]\nasync fn main() { let _: Router = Router::new(); }",
      '#[tokio::main]\nasync fn main() { let _ = reqwest::get("https://example.com").await; }',
      "use sqlx::SqlitePool;\n#[tokio::main]\nasync fn main() {}",
      "use wasm_bindgen::prelude::*;\n#[wasm_bindgen]\npub fn hi() {}",
      "use tracing_subscriber::EnvFilter;\nfn main() { let _ = EnvFilter::from_default_env(); }",
      "use tokio_util::task::TaskTracker;\nfn main() { let _ = TaskTracker::new(); }",
    ]) {
      assert.equal(
        getBlockRunMode({
          lang: "rust",
          kind: "run",
          rawCode: unsupported,
          isExt: true,
          noPlay: false,
        }),
        null,
      );
    }

    // noplay, check, ext check, plain snippets, and non-Rust fences stay read-only.
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "run",
        rawCode: "fn main() {}",
        isExt: false,
        noPlay: true,
      }),
      null,
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "check",
        rawCode: "fn main() {}",
        isExt: false,
        noPlay: false,
      }),
      null,
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "check",
        rawCode: "use tokio::sync::Mutex;\nfn demo() {}",
        isExt: true,
        noPlay: false,
      }),
      null,
    );
    assert.equal(
      getBlockRunMode({
        lang: "rust",
        kind: "",
        rawCode: "let x = 5;",
        isExt: false,
        noPlay: false,
      }),
      null,
    );
    assert.equal(
      getBlockRunMode({
        lang: "sh",
        kind: "run",
        rawCode: "$ cargo run",
        isExt: false,
        noPlay: false,
      }),
      null,
    );
  });

  it("extracts external crate names while ignoring std, local mods, and strings", () => {
    const code = [
      "// use axum::Router;",
      "use std::io::{self, Write};",
      "use serde::{Deserialize, Serialize};",
      "mod helpers { pub fn run() {} }",
      "#[tokio::main]",
      "async fn main() {",
      '    let note = "reqwest::get(url)";',
      "    let _ = u32::MAX;",
      "    let _ = io::stdout().flush();",
      "    helpers::run();",
      '    let _ = serde_json::json!({ "msg": note });',
      "}",
    ].join("\n");

    assert.deepEqual(referencedExternalCrates(code).sort(), ["serde", "serde_json", "tokio"]);
  });

  it("builds accurate execute requests for binaries, unit tests, lib checks, nightly, and backtraces", () => {
    const bin = buildExecuteRequest({
      code: 'fn main() {\n    println!("Hello!");\n}',
      mode: "run",
    });
    assert.equal(bin.channel, "stable");
    assert.equal(bin.mode, "debug");
    assert.equal(bin.edition, "2024");
    assert.equal(bin.crateType, "bin");
    assert.equal(bin.tests, false);
    assert.equal(bin.backtrace, false);

    const releaseBacktrace = buildExecuteRequest({
      code: '// fn test_comment() {}\nfn main() { panic!("oops"); }',
      mode: "run",
      isRelease: true,
      backtrace: true,
    });
    assert.equal(releaseBacktrace.mode, "release");
    assert.equal(releaseBacktrace.backtrace, true);

    const libTest = buildExecuteRequest({
      code: "pub fn add(a: i32, b: i32) -> i32 { a + b }\n#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn works() { assert_eq!(add(1, 2), 3); }\n}",
      mode: "test",
    });
    assert.equal(libTest.crateType, "lib");
    assert.equal(libTest.tests, true);

    const libCheck = buildExecuteRequest({
      code: "pub fn longest<'a>(a: &'a str, b: &'a str) -> &'a str { if a.len() >= b.len() { a } else { b } }",
      mode: "run",
    });
    assert.equal(libCheck.crateType, "lib");
    assert.equal(libCheck.tests, false);

    const nightly = buildExecuteRequest({
      code: "#![feature(test)]\nfn main() {}",
      mode: "run",
    });
    assert.equal(nightly.channel, "nightly");

    // `#![feature(...)]` inside a string literal must stay on stable.
    const stringOnly = buildExecuteRequest({
      code: 'fn main() { println!("#![feature(foo)]"); }',
      mode: "run",
    });
    assert.equal(stringOnly.channel, "stable");
  });

  it("parses stdout, warnings, compile errors, library builds, panics, tests, and timeouts cleanly", () => {
    const ok = parseExecuteResponse(
      {
        success: true,
        exitDetail: "",
        stdout: "Hello, world!\n",
        stderr:
          "   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.42s\n     Running `target/debug/playground`\n",
      },
      { isTest: false, durationMs: 612 },
    );
    assert.equal(ok.outcome, "ok");
    assert.equal(ok.stdout, "Hello, world!");
    assert.equal(ok.stderr, "");
    assert.equal(ok.diagnostics, "");
    assert.equal(formatRunDuration(ok.durationMs), "612 ms");

    const compiled = parseExecuteResponse(
      {
        success: true,
        exitDetail: "",
        stdout: "",
        stderr:
          "   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.25s\n",
      },
      { isTest: false, isLibCheck: true, durationMs: 310 },
    );
    assert.equal(compiled.outcome, "compiled");
    assert.equal(compiled.diagnostics, "");

    const withWarning = parseExecuteResponse(
      {
        success: true,
        exitDetail: "",
        stdout: "42\n",
        stderr:
          '   Compiling playground v0.0.1 (/playground)\nwarning: unused variable: `x`\n --> src/main.rs:2:9\nwarning: `playground` (bin "playground") generated 1 warning\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.38s\n     Running `target/debug/playground`\ndebug note on stderr\n',
      },
      { isTest: false, durationMs: 1240 },
    );
    assert.equal(withWarning.outcome, "ok");
    assert.equal(withWarning.stdout, "42");
    assert.equal(withWarning.stderr, "debug note on stderr");
    assert.match(withWarning.diagnostics, /warning: unused variable: `x`/);
    assert.doesNotMatch(withWarning.diagnostics, /generated 1 warning/);
    assert.equal(formatRunDuration(withWarning.durationMs), "1.2 s");

    const compileErr = parseExecuteResponse(
      {
        success: false,
        exitDetail: "Exited with status 101",
        stdout: "",
        stderr:
          '   Compiling playground v0.0.1 (/playground)\nerror[E0384]: cannot assign twice to immutable variable `x`\n --> src/main.rs:3:5\nerror: could not compile `playground` (bin "playground") due to 1 previous error\n',
      },
      { isTest: false, durationMs: 500 },
    );
    assert.equal(compileErr.outcome, "compile-error");
    assert.match(compileErr.diagnostics, /error\[E0384\]/);
    assert.doesNotMatch(compileErr.diagnostics, /could not compile/);

    const panicOut = parseExecuteResponse(
      {
        success: false,
        exitDetail: "Exited with status 101",
        stdout: "before crash\n",
        stderr:
          "   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.31s\n     Running `target/debug/playground`\n\nthread 'main' panicked at src/main.rs:3:5:\nindex out of bounds\nstack backtrace:\n   0: rust_begin_unwind\n",
      },
      { isTest: false, backtrace: true, durationMs: 410 },
    );
    assert.equal(panicOut.outcome, "panic");
    assert.equal(panicOut.backtrace, true);
    assert.equal(panicOut.stdout, "before crash");
    assert.match(panicOut.stderr, /thread 'main' panicked/);
    assert.match(panicOut.stderr, /stack backtrace/);

    const testsPassed = parseExecuteResponse(
      {
        success: true,
        exitDetail: "",
        stdout:
          "\nrunning 2 tests\ntest tests::a ... ok\ntest tests::b ... ok\n\ntest result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n\n\nrunning 0 tests\n\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n",
        stderr:
          "   Compiling playground v0.0.1 (/playground)\n    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.55s\n     Running unittests src/lib.rs (target/debug/deps/playground-123)\n   Doc-tests playground\n",
      },
      { isTest: true, durationMs: 700 },
    );
    assert.equal(testsPassed.outcome, "tests-passed");
    assert.match(testsPassed.stdout, /running 2 tests/);
    assert.doesNotMatch(testsPassed.stdout, /running 0 tests/);

    const timedOut = parseExecuteResponse(
      {
        success: false,
        exitDetail: "Killed by signal 9 (SIGKILL)",
        stdout: "",
        stderr:
          "   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.30s\n     Running `target/debug/playground`\nKilled\n",
      },
      { isTest: false, durationMs: 10_200 },
    );
    assert.equal(timedOut.outcome, "timeout");
  });

  it("tokenises compiler diagnostics with error, warning, and help highlights", () => {
    assert.equal(tokenizeDiagnosticLine("error[E0382]: borrow of moved value")[0].tone, "error");
    assert.equal(tokenizeDiagnosticLine("warning: unused import")[0].tone, "warn");
    assert.equal(
      tokenizeDiagnosticLine("  = help: consider cloning").find((s) => s.text === "help")?.tone,
      "help",
    );
    assert.equal(
      tokenizeDiagnosticLine("  --> src/main.rs:2:5").find((s) => s.text === "-->")?.tone,
      "help",
    );
    assert.equal(tokenizeDiagnosticLine("3 |     ^^^^^ value borrowed here")[1].tone, "error");
  });

  it("executes in place, falls back to /api/run on CORS failure, and honours cancellation", async () => {
    const calls: string[] = [];
    const directFetch: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          success: true,
          exitDetail: "",
          stdout: "in-guide output\n",
          stderr:
            "   Compiling playground v0.0.1 (/playground)\n    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.20s\n     Running `target/debug/playground`\n",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const res = await executeRustCode({
      code: 'fn main() { println!("in-guide output"); }',
      mode: "run",
      fetchImpl: directFetch,
    });
    assert.equal(res.kind, "ok");
    if (res.kind === "ok") {
      assert.equal(res.output.outcome, "ok");
      assert.equal(res.output.stdout, "in-guide output");
    }
    assert.deepEqual(calls, [PLAYGROUND_EXECUTE_URL]);

    // Network failure on the direct call triggers one same-origin fallback.
    const fallbackCalls: string[] = [];
    const fallbackFetch: typeof fetch = async (input) => {
      const url = String(input);
      fallbackCalls.push(url);
      if (url === PLAYGROUND_EXECUTE_URL) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(
        JSON.stringify({
          success: true,
          exitDetail: "",
          stdout: "from fallback\n",
          stderr: "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.10s\n",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const fb = await executeRustCode({
      code: 'fn main() { println!("from fallback"); }',
      mode: "run",
      fetchImpl: fallbackFetch,
    });
    assert.equal(fb.kind, "ok");
    if (fb.kind === "ok") {
      assert.equal(fb.output.stdout, "from fallback");
    }
    assert.deepEqual(fallbackCalls, [PLAYGROUND_EXECUTE_URL, FALLBACK_EXECUTE_PATH]);

    // User cancellation returns `cancelled`, not an error banner.
    const ac = new AbortController();
    const cancelFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
        ac.abort();
      });
    const cancelled = await executeRustCode({
      code: "fn main() { loop {} }",
      mode: "run",
      signal: ac.signal,
      fetchImpl: cancelFetch,
    });
    assert.equal(cancelled.kind, "cancelled");
  });

  it("formats edited code with rustfmt and falls back to /api/format when needed", async () => {
    const urls: string[] = [];
    const mockFormatFetch: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url === PLAYGROUND_FORMAT_URL) {
        throw new TypeError("Blocked");
      }
      return new Response(
        JSON.stringify({
          success: true,
          exitDetail: "",
          code: 'fn main() {\n    println!("tidy");\n}\n',
          stdout: "",
          stderr: "",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const ok = await formatRustCode({
      code: 'fn main(){println!("tidy");}',
      fetchImpl: mockFormatFetch,
    });
    assert.deepEqual(ok, {
      kind: "ok",
      code: 'fn main() {\n    println!("tidy");\n}',
    });
    assert.deepEqual(urls, [PLAYGROUND_FORMAT_URL, FALLBACK_FORMAT_PATH]);

    const syntaxErr = await formatRustCode({
      code: "fn main( {",
      fallbackEndpoint: null,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            success: false,
            code: "fn main( {",
            stderr: "error: expected one of `)` or `,`, found `{`\n",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    assert.equal(syntaxErr.kind, "error");
    if (syntaxErr.kind === "error") {
      assert.match(syntaxErr.message, /expected one of/);
    }
  });

  it("validates payloads and rejects cross-site requests on /api/run and /api/format", async () => {
    assert.equal(validateExecuteRequest(null).ok, false);
    assert.equal(
      validateExecuteRequest({
        channel: "stable",
        mode: "debug",
        edition: "2024",
        crateType: "bin",
        tests: false,
        backtrace: false,
        code: "a".repeat(MAX_CODE_BYTES + 1),
      }).ok,
      false,
    );
    assert.equal(validateFormatRequest({ code: "   " }).ok, false);
    assert.equal(validateFormatRequest({ code: "fn main() {}", edition: "2024" }).ok, true);

    const crossSiteRun = new NextRequest("http://localhost:3000/api/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ code: "fn main() {}" }),
    });
    const runBlocked = await runPost(crossSiteRun);
    assert.equal(runBlocked.status, 403);
    assert.equal(runBlocked.headers.get("cache-control"), "no-store");

    const crossSiteFmt = new NextRequest("http://localhost:3000/api/format", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ code: "fn main() {}" }),
    });
    const fmtBlocked = await formatPost(crossSiteFmt);
    assert.equal(fmtBlocked.status, 403);
    assert.equal(fmtBlocked.headers.get("cache-control"), "no-store");

    const badReq = new NextRequest("http://localhost:3000/api/run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ channel: "invalid", code: "fn main() {}" }),
    });
    const bad = await runPost(badReq);
    assert.equal(bad.status, 400);
  });

  it("renders in-guide Run/Test/Edit buttons and HeroRunner with zero external redirects", () => {
    const renderBlock = (opts: {
      rawCode: string;
      kind: string;
      isExt?: boolean;
      noPlay?: boolean;
    }) =>
      renderToStaticMarkup(
        React.createElement(GuideStateProvider, {
          glossary: {},
          children: React.createElement(CodeBlock, {
            lang: "rust",
            label: "Rust",
            rawCode: opts.rawCode,
            isContinuation: false,
            kind: opts.kind,
            isExt: opts.isExt ?? false,
            noPlay: opts.noPlay ?? false,
            isRelease: false,
            isSoft: false,
            isOutput: false,
            isError: false,
            children: React.createElement("pre", null, opts.rawCode),
          }),
        }),
      );

    const runnable = renderBlock({ rawCode: 'fn main() { println!("hi"); }', kind: "run" });
    assert.match(runnable, /aria-label="Run this example in the guide"/);
    assert.match(runnable, /aria-label="Edit this code"/);
    assert.doesNotMatch(runnable, /play\.rust-lang\.org/);
    assert.doesNotMatch(runnable, /target="_blank"/);

    const failing = renderBlock({
      rawCode: 'fn main() { let x = 1; x = 2; println!("{x}"); }',
      kind: "fail",
    });
    assert.match(failing, /Does not compile — on purpose/);
    assert.match(failing, /aria-label="Run this example in the guide"/);
    assert.match(failing, /aria-label="Edit this code"/);

    const extTokio = renderBlock({
      rawCode: "#[tokio::main]\nasync fn main() {}",
      kind: "run",
      isExt: true,
    });
    assert.match(extTokio, /aria-label="Run this example in the guide"/);

    const extAxum = renderBlock({
      rawCode: "use axum::Router;\n#[tokio::main]\nasync fn main() {}",
      kind: "run",
      isExt: true,
    });
    assert.doesNotMatch(extAxum, /Run this example in the guide/);

    const noplay = renderBlock({ rawCode: "fn main() {}", kind: "run", noPlay: true });
    assert.doesNotMatch(noplay, /Run this example in the guide/);

    const testable = renderBlock({
      rawCode: "#[test]\nfn it_works() { assert_eq!(1, 1); }",
      kind: "test",
    });
    assert.match(testable, /aria-label="Test this example in the guide"/);

    const hero = renderToStaticMarkup(React.createElement(HeroRunner, { trackedChapters: 83 }));
    assert.match(hero, /src\/main\.rs/);
    assert.match(hero, /Terminal/);
    assert.match(hero, /aria-label="Run this example in the guide"/);
    assert.match(hero, /aria-label="Edit this code"/);
    assert.doesNotMatch(hero, /play\.rust-lang\.org/);
  });

  it("wires hidden setup lines and verified crate runs across the parsed guide", () => {
    const guide = loadGuide();
    let runnableCount = 0;
    let extRunnableCount = 0;
    let hiddenRunnableCount = 0;

    function visit(blocks: BlockNode[]) {
      for (const b of blocks) {
        if (b.type === "code" && b.lang === "rust") {
          const mode = getBlockRunMode({
            lang: b.lang,
            kind: b.kind,
            rawCode: b.code,
            fullCode: b.fullCode,
            isExt: b.isExt,
            noPlay: b.noPlay,
          });
          if (mode) {
            runnableCount += 1;
            if (b.isExt) extRunnableCount += 1;
          }
          if (b.fullCode && b.fullCode !== b.code) {
            hiddenRunnableCount += 1;
            assert.equal(b.code.includes("\n# "), false);
            assert.ok(b.fullCode.length > b.code.length);
          }
        } else if (b.type === "callout" || b.type === "details" || b.type === "blockquote") {
          visit(b.blocks);
        } else if (b.type === "list") {
          for (const item of b.items) visit(item.blocks);
        } else if (b.type === "exercise") {
          visit(b.body);
          if (b.hint) visit(b.hint);
          if (b.solution) visit(b.solution);
        } else if (b.type === "quiz") {
          for (const q of b.questions) {
            visit(q.prompt);
            visit(q.explanation);
          }
        }
      }
    }

    for (const ch of guide.chapters) visit(ch.blocks);

    assert.ok(runnableCount >= 660, `expected >= 660 runnable blocks, got ${runnableCount}`);
    assert.ok(
      extRunnableCount >= 55,
      `expected >= 55 runnable ext blocks, got ${extRunnableCount}`,
    );
    assert.ok(hiddenRunnableCount > 0, "expected hidden setup lines on runnable blocks");
  });
});
