"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
} from "lucide-react";
import { executeRustCode, formatRunDuration, type RunOutput } from "@/lib/rust-runner";
import { applyTabIndent, DiagnosticPre } from "./CodeBlock";

type HeroRunState =
  | { status: "preview" }
  | { status: "running"; previous?: RunOutput }
  | { status: "done"; output: RunOutput }
  | { status: "error"; message: string };

/**
 * Live interactive `src/main.rs` + `Terminal` pair on the home page, so readers
 * can run and edit their very first Rust snippet right on arrival and see the
 * output appear directly inside the Terminal card below.
 */
export function HeroRunner({ trackedChapters }: { trackedChapters: number }) {
  const initialCode = `fn main() {\n    let learner = "you";\n    let chapters = ${trackedChapters};\n\n    println!("Hello, {learner}!");\n    println!("{chapters} chapters to go.");\n}`;

  const [code, setCode] = useState(initialCode);
  const [isEditing, setIsEditing] = useState(false);
  const [state, setState] = useState<HeroRunState>({ status: "preview" });
  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const editBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (isEditing) {
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [isEditing]);

  const isModified = code !== initialCode;
  const isRunning = state.status === "running";

  const handleRun = useCallback(async (source: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) =>
      prev.status === "done" ? { status: "running", previous: prev.output } : { status: "running" },
    );

    const result = await executeRustCode({
      code: source,
      mode: "run",
      signal: controller.signal,
    });

    if (abortRef.current !== controller) return;
    abortRef.current = null;

    if (result.kind === "cancelled") {
      setState((prev) =>
        prev.status === "running" && prev.previous
          ? { status: "done", output: prev.previous }
          : { status: "preview" },
      );
      return;
    }

    if (result.kind === "error") {
      setState({ status: "error", message: result.message });
      return;
    }

    setState({ status: "done", output: result.output });
  }, []);

  const handleRunButton = () => {
    if (isRunning) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    void handleRun(code);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setCode(initialCode);
    setIsEditing(false);
    setState({ status: "preview" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleRun(code);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
      requestAnimationFrame(() => editBtnRef.current?.focus());
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      applyTabIndent(e.currentTarget, code, e.shiftKey, setCode);
    }
  };

  const output =
    state.status === "done"
      ? state.output
      : state.status === "running"
        ? state.previous
        : undefined;

  const editorRows = Math.max(7, Math.min(18, code.split("\n").length));

  return (
    <div
      role="region"
      aria-label="Interactive Rust example"
      className="space-y-4 font-mono text-[13px]"
    >
      {/* Editor card */}
      <div className="overflow-hidden rounded-card border border-[#2c2820] bg-[#191713] text-[#e8e3d8] shadow-pop">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#2c2820] bg-[#211e19] px-4 py-2 font-sans text-[12px] text-[#8f887a]">
          <span className="font-mono font-semibold text-[#c5beb0]">src/main.rs</span>
          <span className="rounded-md bg-[#2c2820] px-2 py-0.5 text-[11px] font-semibold text-[#a89f8f]">
            Rust · 2024
          </span>

          <span className="no-print ml-auto flex items-center gap-1.5">
            {isModified && (
              <button
                type="button"
                onClick={handleReset}
                title="Restore original code"
                aria-label="Restore original example"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#3a342a] bg-[#27231d] px-2 py-1 text-[11.5px] font-semibold text-[#c5beb0] transition-colors hover:border-[var(--g-accent)] hover:text-white"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset</span>
              </button>
            )}

            <button
              ref={editBtnRef}
              type="button"
              onClick={() => setIsEditing((v) => !v)}
              aria-pressed={isEditing}
              title={isEditing ? "Finish editing" : "Edit this program and run it"}
              aria-label={isEditing ? "Finish editing code" : "Edit this code"}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                isEditing
                  ? "border-[#e9743e] bg-[#39231a] text-[#f59a6e]"
                  : "border-[#3a342a] bg-[#27231d] text-[#c5beb0] hover:border-[#e9743e] hover:text-white"
              }`}
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              <span>{isEditing ? "Done" : "Edit"}</span>
            </button>

            <button
              type="button"
              onClick={handleRunButton}
              title={
                isRunning
                  ? "Stop running"
                  : "Compile and run — output appears in the Terminal below"
              }
              aria-label={isRunning ? "Stop running this example" : "Run this example in the guide"}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--g-accent)] px-3 py-1 text-[11.5px] font-bold text-white transition-colors hover:bg-[var(--g-accent-hover)]"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  <span>Running…</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                  <span>Run</span>
                </>
              )}
            </button>
          </span>
        </div>

        {isEditing ? (
          <div>
            <textarea
              ref={editorRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={editorRows}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              wrap="off"
              aria-label="Edit src/main.rs"
              className="block w-full resize-y overflow-x-auto border-0 bg-transparent p-4 font-mono text-[13px] leading-[1.7] text-[#e8e3d8] [tab-size:4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e9743e] focus-visible:ring-inset"
            />
            <div className="no-print border-t border-[#2c2820] bg-[#211e19]/80 px-4 py-1.5 font-sans text-[11px] text-[#9b9384]">
              Ctrl+Enter (or ⌘↵) to run · Tab indents · Esc done
            </div>
          </div>
        ) : isModified ? (
          <pre className="m-0 overflow-x-auto p-4 leading-[1.7] [tab-size:4]">
            <code>{code}</code>
          </pre>
        ) : (
          <pre className="m-0 overflow-x-auto p-4 leading-[1.7]">
            <code>
              <span className="text-[#f47067]">fn</span>{" "}
              <span className="text-[#dcbdfb]">main</span>() {"{\n"}
              {"    "}
              <span className="text-[#f47067]">let</span> learner ={" "}
              <span className="text-[#87d7a8]">{'"you"'}</span>;{"\n"}
              {"    "}
              <span className="text-[#f47067]">let</span> chapters ={" "}
              <span className="text-[#f2cc60]">{trackedChapters}</span>;{"\n\n"}
              {"    "}
              <span className="text-[#61afef]">println!</span>(
              <span className="text-[#87d7a8]">{'"Hello, {learner}!"'}</span>
              );{"\n"}
              {"    "}
              <span className="text-[#61afef]">println!</span>(
              <span className="text-[#87d7a8]">
                {'"'}
                {"{chapters} chapters to go."}
                {'"'}
              </span>
              );{"\n}"}
            </code>
          </pre>
        )}
      </div>

      {/* Live Terminal output directly below */}
      <div
        role="status"
        aria-live="polite"
        aria-busy={isRunning}
        className="overflow-hidden rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-2 font-sans text-xs">
          <span className="font-semibold text-[var(--g-ink3)]">Terminal</span>

          {isRunning ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--g-ink2)]">
              <Loader2
                className="h-3.5 w-3.5 animate-spin text-[var(--g-accent)]"
                aria-hidden="true"
              />
              <span>Compiling &amp; running…</span>
            </span>
          ) : state.status === "error" ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300">
              <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Could not run</span>
            </span>
          ) : output ? (
            <span className="inline-flex items-center gap-1.5">
              {output.outcome === "ok" ||
              output.outcome === "compiled" ||
              output.outcome === "tests-passed" ? (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Live result</span>
                </span>
              ) : output.outcome === "compile-error" || output.outcome === "tests-failed" ? (
                <span className="inline-flex items-center gap-1 font-semibold text-red-700 dark:text-red-300">
                  <CircleX className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Compiler error</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {output.outcome === "panic"
                      ? "Panicked"
                      : output.outcome === "timeout"
                        ? "Timed out"
                        : "Exited with error"}
                  </span>
                </span>
              )}
              <span className="font-mono text-[11px] text-[var(--g-ink3)] tabular-nums">
                · {formatRunDuration(output.durationMs)}
              </span>
            </span>
          ) : null}
        </div>

        {state.status === "error" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 font-sans text-[13.5px] text-[var(--g-ink2)]">
            <span>{state.message}</span>
            <button
              type="button"
              onClick={handleRunButton}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--g-line2)] bg-[var(--g-sunken)] px-2.5 py-1 text-xs font-semibold text-[var(--g-ink)] hover:border-[var(--g-accent)]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : output ? (
          <div className={isRunning ? "opacity-55 transition-opacity" : ""}>
            {output.outcome === "compile-error" ? (
              <DiagnosticPre
                text={output.diagnostics || "Compilation failed."}
                className="m-0 max-h-72 overflow-auto p-4 font-mono text-[13px] leading-[1.65] text-[var(--g-ink)]"
              />
            ) : (
              <>
                {output.stdout.length > 0 && (
                  <pre className="m-0 max-h-72 overflow-auto p-4 leading-[1.7] text-[var(--g-ink)]">
                    <code>{output.stdout}</code>
                  </pre>
                )}
                {output.stderr.length > 0 && (
                  <DiagnosticPre
                    text={output.stderr}
                    className={`m-0 max-h-72 overflow-auto p-4 font-mono text-[13px] leading-[1.65] text-[var(--g-ink)] ${
                      output.stdout.length > 0 ? "border-t border-[var(--g-line)]" : ""
                    }`}
                  />
                )}
                {output.stdout.length === 0 && output.stderr.length === 0 && (
                  <p className="m-0 p-4 font-mono text-[12.5px] italic text-[var(--g-ink3)]">
                    Finished with no output.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <pre
            className={`m-0 overflow-x-auto p-4 leading-[1.7] text-[var(--g-ink2)] ${
              isRunning ? "opacity-55 transition-opacity" : ""
            }`}
          >
            <code>
              <span className="select-none text-[var(--g-accent)]">$ </span>
              <span className="font-semibold text-[var(--g-ink)]">cargo run</span>
              {"\n"}
              <span className="text-[var(--g-ink3)]">
                Compiling your-first-program v0.1.0
                {"\n"}
              </span>
              Hello, you!{"\n"}
              {trackedChapters} chapters to go.
            </code>
          </pre>
        )}
      </div>
    </div>
  );
}
