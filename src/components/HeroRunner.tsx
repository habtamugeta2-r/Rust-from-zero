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
  Terminal as TerminalIcon,
} from "lucide-react";
import { executeRustCode, formatRunDuration, type RunOutput } from "@/lib/rust-runner";
import { applyTabIndent, DiagnosticPre } from "./CodeBlockActions";

type HeroRunState =
  | { status: "preview" }
  | { status: "running"; previous?: RunOutput }
  | { status: "done"; output: RunOutput }
  | { status: "error"; message: string };

/**
 * Live interactive `src/main.rs` + `Terminal` pair on the home page, so readers
 * can run and edit their very first Rust snippet right on arrival and see the
 * output appear directly inside the Terminal pane below.
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
      className="overflow-hidden rounded-[10px] border border-[var(--g-line2)] font-mono text-[13px] shadow-card dark:border-[var(--g-editor-line)]"
    >
      {/* Editor pane */}
      <div className="bg-[var(--g-editor-bg)] text-[#e5ece8]">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--g-editor-line)] bg-[var(--g-editor-head)] px-3.5 py-2.5 font-sans text-[12px] text-[#9ab0a7]">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#ea7642]" aria-hidden="true" />
            <span className="font-mono font-semibold text-[#e5ece8]">src/main.rs</span>
          </span>
          <span className="rounded bg-white/8 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#adc0b8]">
            Rust 2024
          </span>

          <span className="no-print ml-auto flex items-center gap-1.5">
            {isModified && (
              <button
                type="button"
                onClick={handleReset}
                title="Restore original code"
                aria-label="Restore original example"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[#324441] bg-[#1e2c2a] px-2 py-1 text-[11.5px] font-semibold text-[#c5d4cd] transition-colors hover:border-[#ea7642] hover:text-white"
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
                  ? "border-[#ea7642] bg-[#36221a] text-[#f59a6e]"
                  : "border-[#324441] bg-[#1e2c2a] text-[#c5d4cd] hover:border-[#ea7642] hover:text-white"
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
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-[#ea7642] px-3 py-1 text-[11.5px] font-bold text-[#141817] transition-colors hover:bg-[#f48a59]"
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
              className="block w-full resize-y overflow-x-auto border-0 bg-transparent p-4 font-mono text-[13px] leading-[1.72] text-[#e5ece8] [tab-size:4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea7642] focus-visible:ring-inset"
            />
            <div className="no-print border-t border-[var(--g-editor-line)] bg-[var(--g-editor-head)]/80 px-4 py-1.5 font-sans text-[11px] text-[#96aba2]">
              Ctrl+Enter (or ⌘↵) to run · Tab indents · Esc done
            </div>
          </div>
        ) : isModified ? (
          <pre className="m-0 overflow-x-auto p-4 leading-[1.72] [tab-size:4]">
            <code>{code}</code>
          </pre>
        ) : (
          <pre className="m-0 overflow-x-auto px-4 py-4 leading-[1.72]">
            <code>
              <span className="text-[#f47c6a]">fn</span>{" "}
              <span className="text-[#d4bfff]">main</span>() {"{\n"}
              {"    "}
              <span className="text-[#f47c6a]">let</span> learner ={" "}
              <span className="text-[#7ee0b4]">{'"you"'}</span>;{"\n"}
              {"    "}
              <span className="text-[#f47c6a]">let</span> chapters ={" "}
              <span className="text-[#f3cf70]">{trackedChapters}</span>;{"\n\n"}
              {"    "}
              <span className="text-[#7bc3f5]">println!</span>(
              <span className="text-[#7ee0b4]">{'"Hello, {learner}!"'}</span>
              );{"\n"}
              {"    "}
              <span className="text-[#7bc3f5]">println!</span>(
              <span className="text-[#7ee0b4]">
                {'"'}
                {"{chapters} chapters to go."}
                {'"'}
              </span>
              );{"\n}"}
            </code>
          </pre>
        )}
      </div>

      {/* Integrated live Terminal pane directly below */}
      <div
        role="status"
        aria-live="polite"
        aria-busy={isRunning}
        className="border-t border-[var(--g-editor-line)] bg-[var(--g-surface)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-3.5 py-2 font-sans text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--g-ink2)]">
            <TerminalIcon className="h-3.5 w-3.5 text-[var(--g-ink3)]" aria-hidden="true" />
            <span>Terminal</span>
          </span>

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
          ) : (
            <span className="font-mono text-[11px] text-[var(--g-ink3)]">sample output</span>
          )}
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
