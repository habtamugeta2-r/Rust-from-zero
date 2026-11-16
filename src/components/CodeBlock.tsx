"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleX,
  Copy,
  Loader2,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  executeRustCode,
  formatRunDuration,
  formatRustCode,
  getBlockRunMode,
  tokenizeDiagnosticLine,
  type DiagnosticSegment,
  type RunOutcome,
  type RunOutput,
} from "@/lib/rust-runner";
import { useGuideState } from "./GuideStateProvider";

export interface CodeBlockProps {
  lang: string;
  label: string;
  rawCode?: string;
  fullCode?: string;
  filename?: string;
  isContinuation: boolean;
  kind: string;
  isExt: boolean;
  noPlay: boolean;
  isRelease: boolean;
  isSoft: boolean;
  isOutput: boolean;
  isError: boolean;
  children: React.ReactNode;
}

type RunnerState =
  | { status: "idle" }
  | { status: "running"; previous?: RunOutput; previousModified?: boolean }
  | { status: "done"; output: RunOutput; ranModified: boolean }
  | { status: "error"; message: string };

const TONE_CLASS: Record<NonNullable<DiagnosticSegment["tone"]>, string> = {
  error: "err-er",
  warn: "err-wr",
  help: "err-hl",
};

export function DiagnosticPre({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <pre
      className={
        className ??
        "m-0 max-h-96 overflow-auto px-3.5 py-3 font-mono text-[13px] leading-[1.6] text-[var(--g-ink)] sm:px-4"
      }
    >
      <code>
        {lines.map((line, lineIdx) => {
          const segments = tokenizeDiagnosticLine(line);
          return (
            <React.Fragment key={lineIdx}>
              {segments.map((seg, segIdx) =>
                seg.tone ? (
                  <span key={segIdx} className={TONE_CLASS[seg.tone]}>
                    {seg.text}
                  </span>
                ) : (
                  <React.Fragment key={segIdx}>{seg.text}</React.Fragment>
                ),
              )}
              {lineIdx < lines.length - 1 ? "\n" : null}
            </React.Fragment>
          );
        })}
      </code>
    </pre>
  );
}

/** Handle Tab and Shift+Tab 4-space indentation inside an inline Rust textarea. */
export function applyTabIndent(
  el: HTMLTextAreaElement,
  value: string,
  shiftKey: boolean,
  onChange: (next: string) => void,
): void {
  const start = el.selectionStart;
  const end = el.selectionEnd;

  if (!shiftKey && start === end) {
    const next = value.slice(0, start) + "    " + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.selectionStart = start + 4;
      el.selectionEnd = start + 4;
    });
    return;
  }

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = value.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");

  let firstDelta = 0;
  let totalDelta = 0;
  const updated = lines.map((line, idx) => {
    if (shiftKey) {
      const stripped = line.replace(/^ {1,4}/, "");
      const removed = line.length - stripped.length;
      if (idx === 0) firstDelta = -removed;
      totalDelta -= removed;
      return stripped;
    }
    if (idx === 0) firstDelta = 4;
    totalDelta += 4;
    return "    " + line;
  });

  const next = value.slice(0, lineStart) + updated.join("\n") + value.slice(lineEnd);
  onChange(next);
  requestAnimationFrame(() => {
    el.selectionStart = Math.max(lineStart, start + firstDelta);
    el.selectionEnd = Math.max(lineStart, end + totalDelta);
  });
}

function outcomeMeta(outcome: RunOutcome): {
  label: string;
  headTone: string;
  bodyTone: string;
  textTone: string;
  Icon: React.ComponentType<{ className?: string }>;
} {
  switch (outcome) {
    case "ok":
      return {
        label: "Result",
        headTone: "bg-[var(--g-code-head)]/80",
        bodyTone: "bg-[var(--g-sunken)]/85",
        textTone: "text-emerald-700 dark:text-emerald-400",
        Icon: CheckCircle2,
      };
    case "compiled":
      return {
        label: "Compiled",
        headTone: "bg-[var(--g-code-head)]/80",
        bodyTone: "bg-[var(--g-sunken)]/85",
        textTone: "text-emerald-700 dark:text-emerald-400",
        Icon: CheckCircle2,
      };
    case "tests-passed":
      return {
        label: "Tests passed",
        headTone: "bg-[var(--g-code-head)]/80",
        bodyTone: "bg-[var(--g-sunken)]/85",
        textTone: "text-emerald-700 dark:text-emerald-400",
        Icon: CheckCircle2,
      };
    case "tests-failed":
      return {
        label: "Tests failed",
        headTone: "bg-red-100/70 dark:bg-red-950/40",
        bodyTone: "bg-red-50/55 dark:bg-red-950/20",
        textTone: "text-red-700 dark:text-red-300",
        Icon: CircleX,
      };
    case "compile-error":
      return {
        label: "Compiler error",
        headTone: "bg-red-100/70 dark:bg-red-950/40",
        bodyTone: "bg-red-50/55 dark:bg-red-950/20",
        textTone: "text-red-700 dark:text-red-300",
        Icon: CircleX,
      };
    case "panic":
      return {
        label: "Program panicked",
        headTone: "bg-amber-100/75 dark:bg-amber-950/40",
        bodyTone: "bg-amber-50/45 dark:bg-amber-950/15",
        textTone: "text-amber-800 dark:text-amber-300",
        Icon: AlertTriangle,
      };
    case "timeout":
      return {
        label: "Timed out",
        headTone: "bg-amber-100/75 dark:bg-amber-950/40",
        bodyTone: "bg-amber-50/45 dark:bg-amber-950/15",
        textTone: "text-amber-800 dark:text-amber-300",
        Icon: AlertTriangle,
      };
    case "runtime-error":
      return {
        label: "Exited with an error",
        headTone: "bg-amber-100/75 dark:bg-amber-950/40",
        bodyTone: "bg-amber-50/45 dark:bg-amber-950/15",
        textTone: "text-amber-800 dark:text-amber-300",
        Icon: AlertTriangle,
      };
  }
}

function copyableOutputText(output: RunOutput): string {
  const parts: string[] = [];
  if (output.outcome === "compile-error") {
    if (output.diagnostics) parts.push(output.diagnostics);
  } else {
    if (output.stdout) parts.push(output.stdout);
    if (output.stderr) parts.push(output.stderr);
    if (parts.length === 0 && output.diagnostics) parts.push(output.diagnostics);
  }
  return parts.join("\n\n");
}

function revealResultIfOffscreen(el: HTMLElement | null): void {
  if (!el || typeof window === "undefined") return;
  const rect = el.getBoundingClientRect();
  if (rect.top > window.innerHeight - 72) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "nearest",
    });
  }
}

export function CodeBlock(props: CodeBlockProps) {
  const { showToast } = useGuideState();
  const [copied, setCopied] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const initialRunCode = props.fullCode ?? props.rawCode ?? "";
  const [editedCode, setEditedCode] = useState(initialRunCode);
  const [runner, setRunner] = useState<RunnerState>({ status: "idle" });

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const formatAbortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (outputCopyTimer.current) clearTimeout(outputCopyTimer.current);
      abortRef.current?.abort();
      formatAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (isEditing) {
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [isEditing]);

  const runMode = getBlockRunMode({
    lang: props.lang,
    kind: props.kind,
    rawCode: props.rawCode,
    fullCode: props.fullCode,
    isExt: props.isExt,
    noPlay: props.noPlay,
  });

  const isModified = runMode !== null && editedCode !== initialRunCode;
  const isRunning = runner.status === "running";
  const isIntentionalFailure = props.kind === "fail" || props.kind === "panic";

  const getCopyText = (): string => {
    if (isModified) return editedCode;
    const code = props.rawCode ?? "";
    if (props.lang === "sh") {
      const cmds = code
        .split("\n")
        .filter((l) => l.startsWith("$ "))
        .map((l) => {
          const rest = l.slice(2);
          const idx = rest.indexOf("  # ");
          return idx >= 0 ? rest.slice(0, idx) : rest;
        });
      if (cmds.length > 0) return cmds.join("\n");
    }
    return code;
  };

  const handleCopy = async () => {
    const text = getCopyText();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast("Copying is blocked here. Select the code and press Ctrl+C (Cmd+C on Mac).");
    }
  };

  const handleCopyOutput = async (output: RunOutput) => {
    const text = copyableOutputText(output);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOutput(true);
      if (outputCopyTimer.current) clearTimeout(outputCopyTimer.current);
      outputCopyTimer.current = setTimeout(() => setCopiedOutput(false), 1600);
    } catch {
      showToast("Copying is blocked here. Select the output and press Ctrl+C (Cmd+C on Mac).");
    }
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const runCode = useCallback(
    async (source: string, modified: boolean, backtrace = false) => {
      if (!runMode) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setRunner((prev) =>
        prev.status === "done"
          ? {
              status: "running",
              previous: prev.output,
              previousModified: prev.ranModified,
            }
          : prev.status === "running"
            ? prev
            : { status: "running" },
      );

      requestAnimationFrame(() => revealResultIfOffscreen(resultRef.current));

      const result = await executeRustCode({
        code: source,
        mode: runMode,
        isRelease: props.isRelease,
        backtrace,
        signal: controller.signal,
      });

      if (abortRef.current !== controller) return;
      abortRef.current = null;

      if (result.kind === "cancelled") {
        setRunner((prev) =>
          prev.status === "running" && prev.previous
            ? {
                status: "done",
                output: prev.previous,
                ranModified: prev.previousModified ?? false,
              }
            : { status: "idle" },
        );
        return;
      }

      if (result.kind === "error") {
        setRunner({ status: "error", message: result.message });
        requestAnimationFrame(() => revealResultIfOffscreen(resultRef.current));
        return;
      }

      setRunner({
        status: "done",
        output: result.output,
        ranModified: modified,
      });
      requestAnimationFrame(() => revealResultIfOffscreen(resultRef.current));
    },
    [props.isRelease, runMode],
  );

  const handleFormat = useCallback(async () => {
    if (isFormatting) return;
    formatAbortRef.current?.abort();
    const controller = new AbortController();
    formatAbortRef.current = controller;
    setIsFormatting(true);

    const res = await formatRustCode({
      code: editedCode,
      signal: controller.signal,
    });

    if (formatAbortRef.current !== controller) return;
    formatAbortRef.current = null;
    setIsFormatting(false);

    if (res.kind === "ok") {
      setEditedCode(res.code);
    } else if (res.kind === "error") {
      showToast(res.message);
    }
  }, [editedCode, isFormatting, showToast]);

  const handleRunClick = () => {
    if (isRunning) {
      handleStop();
      return;
    }
    const source = isEditing || isModified ? editedCode : initialRunCode;
    void runCode(source, source !== initialRunCode, false);
  };

  const handleToggleBacktrace = (currentBacktrace: boolean) => {
    const source = isEditing || isModified ? editedCode : initialRunCode;
    void runCode(source, source !== initialRunCode, !currentBacktrace);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    formatAbortRef.current?.abort();
    formatAbortRef.current = null;
    setIsFormatting(false);
    setEditedCode(initialRunCode);
    setIsEditing(false);
    setRunner({ status: "idle" });
  };

  const handleCloseOutput = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunner({ status: "idle" });
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void runCode(editedCode, editedCode !== initialRunCode, false);
      return;
    }

    if (e.shiftKey && e.altKey && (e.key === "F" || e.key === "f")) {
      e.preventDefault();
      void handleFormat();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
      requestAnimationFrame(() => editButtonRef.current?.focus());
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      applyTabIndent(e.currentTarget, editedCode, e.shiftKey, setEditedCode);
    }
  };

  const borderTone = props.isError
    ? "border-red-300/80 dark:border-red-900/70"
    : isIntentionalFailure
      ? "border-amber-300/90 dark:border-amber-800/80"
      : "border-[var(--g-line)]";

  const bgTone = props.isOutput
    ? "bg-[var(--g-sunken)]/80"
    : props.isError
      ? "bg-red-50/60 dark:bg-red-950/20"
      : "bg-[var(--g-code-bg)]";

  const headTone = props.isError
    ? "bg-red-100/70 dark:bg-red-950/40"
    : isIntentionalFailure
      ? "bg-amber-50/90 dark:bg-amber-950/35"
      : "bg-[var(--g-code-head)]";

  const showActions = !props.isOutput && !props.isError;
  const runLabel = runMode === "test" ? "Test" : "Run";
  const runTitle = isRunning
    ? "Stop running this code"
    : runMode === "test"
      ? "Compile and run these unit tests — results appear below"
      : props.kind === "fail"
        ? "Compile this example to see the error below — or press Edit to fix it"
        : props.isRelease
          ? "Compile and run in release mode — result appears below"
          : "Compile and run this example — result appears below";

  const editorRows = Math.max(3, Math.min(30, editedCode.split("\n").length));
  const displayedOutput =
    runner.status === "done"
      ? runner.output
      : runner.status === "running"
        ? runner.previous
        : undefined;
  const displayedModified =
    runner.status === "done"
      ? runner.ranModified
      : runner.status === "running"
        ? (runner.previousModified ?? false)
        : false;
  const meta = displayedOutput ? outcomeMeta(displayedOutput.outcome) : null;
  const outCopyText = displayedOutput ? copyableOutputText(displayedOutput) : "";

  return (
    <figure
      className={`group/code my-6 overflow-hidden rounded-well border shadow-card transition-shadow duration-200 hover:shadow-pop ${borderTone} ${bgTone} ${
        props.isSoft ? "code-soft" : ""
      }`}
    >
      <figcaption
        className={`flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-[var(--g-line)] px-3 py-2 font-sans text-xs sm:px-4 ${headTone}`}
      >
        <span className="flex items-center gap-2 font-semibold tracking-[0.08em] text-[var(--g-ink3)] uppercase">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              props.lang === "rust" ? "bg-[var(--g-accent)]" : "bg-[var(--g-line2)]"
            }`}
            aria-hidden="true"
          />
          {props.label}
        </span>

        {props.filename && (
          <span className="max-w-full truncate rounded-md bg-[var(--g-surface)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--g-ink2)] ring-1 ring-[var(--g-line)]">
            {props.filename}
            {props.isContinuation ? " (continued)" : ""}
          </span>
        )}

        {props.isRelease && runMode && (
          <span className="rounded-full border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--g-ink3)]">
            Release
          </span>
        )}

        {isModified && (
          <span className="no-print rounded-full bg-[var(--g-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--g-accent)]">
            Edited
          </span>
        )}

        {props.kind === "fail" && !isModified && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/70 dark:text-red-300">
            Does not compile — on purpose
          </span>
        )}

        {props.kind === "panic" && !isModified && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-300">
            Compiles, crashes when run — on purpose
          </span>
        )}

        {(props.isOutput || props.isError) && (
          <span className="rounded-full border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--g-ink2)]">
            {props.isError ? "Compiler output" : "Output"}
          </span>
        )}

        {showActions && (
          <span className="no-print ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              title="Copy this code"
              aria-label={copied ? "Copied to clipboard" : "Copy this code"}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
            >
              {copied ? (
                <Check
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>

            {runMode && isEditing && (
              <button
                type="button"
                onClick={() => void handleFormat()}
                disabled={isFormatting}
                title="Format with rustfmt (Shift+Alt+F)"
                aria-label="Format code with rustfmt"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-1 text-[11.5px] font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)] disabled:opacity-50"
              >
                {isFormatting ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">Format</span>
              </button>
            )}

            {runMode && isModified && (
              <button
                type="button"
                onClick={handleReset}
                title="Restore the original example"
                aria-label="Restore the original example"
                className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-1 text-[11.5px] font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            {runMode && (
              <button
                ref={editButtonRef}
                type="button"
                onClick={() => setIsEditing((prev) => !prev)}
                aria-pressed={isEditing}
                title={
                  isEditing
                    ? "Finish editing this example"
                    : "Edit this example and run your changes right here"
                }
                aria-label={isEditing ? "Finish editing code" : "Edit this code"}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                  isEditing
                    ? "border-[var(--g-accent)] bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
                    : "border-[var(--g-line2)] bg-[var(--g-surface)] text-[var(--g-ink2)] hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
                }`}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                <span className="hidden sm:inline">{isEditing ? "Done" : "Edit"}</span>
              </button>
            )}

            {runMode && (
              <button
                type="button"
                onClick={handleRunClick}
                title={runTitle}
                aria-label={
                  isRunning ? "Stop running this example" : `${runLabel} this example in the guide`
                }
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
                    <span>{runLabel}</span>
                  </>
                )}
              </button>
            )}
          </span>
        )}
      </figcaption>

      {isEditing ? (
        <div className="bg-[var(--g-surface)]">
          <textarea
            ref={editorRef}
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
            onKeyDown={handleEditorKeyDown}
            rows={editorRows}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label={`Edit ${props.label} code`}
            className="block w-full resize-y overflow-x-auto border-0 bg-transparent px-[1.15rem] py-4 font-mono text-[13px] leading-[1.6] text-[var(--g-ink)] [tab-size:4] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--g-accent)] focus-visible:ring-inset"
          />
          <div className="no-print flex flex-wrap items-center justify-between gap-2 border-t border-[var(--g-line)] bg-[var(--g-code-head)]/55 px-3.5 py-1.5 font-sans text-[11px] text-[var(--g-ink3)] sm:px-4">
            <span>
              <kbd className="rounded border border-[var(--g-line2)] bg-[var(--g-surface)] px-1 py-0.5 font-mono text-[10.5px] text-[var(--g-ink2)]">
                Ctrl
              </kbd>
              +
              <kbd className="rounded border border-[var(--g-line2)] bg-[var(--g-surface)] px-1 py-0.5 font-mono text-[10.5px] text-[var(--g-ink2)]">
                Enter
              </kbd>{" "}
              (or{" "}
              <kbd className="rounded border border-[var(--g-line2)] bg-[var(--g-surface)] px-1 py-0.5 font-mono text-[10.5px] text-[var(--g-ink2)]">
                ⌘↵
              </kbd>
              ) to {runLabel.toLowerCase()} ·{" "}
              <kbd className="rounded border border-[var(--g-line2)] bg-[var(--g-surface)] px-1 py-0.5 font-mono text-[10.5px] text-[var(--g-ink2)]">
                Tab
              </kbd>{" "}
              indents ·{" "}
              <kbd className="rounded border border-[var(--g-line2)] bg-[var(--g-surface)] px-1 py-0.5 font-mono text-[10.5px] text-[var(--g-ink2)]">
                Esc
              </kbd>{" "}
              done
            </span>
          </div>
        </div>
      ) : isModified ? (
        <div
          className="code-scroll"
          data-scroll-pane
          tabIndex={0}
          role="group"
          aria-label={`Edited ${props.label} code`}
        >
          <pre className="code-pre">
            <code>{editedCode}</code>
          </pre>
        </div>
      ) : (
        /* Keyboard users can scroll a long line without touching the mouse. */
        <div
          className="code-scroll"
          data-scroll-pane
          tabIndex={0}
          role="group"
          aria-label={`${props.label} code`}
        >
          {props.children}
        </div>
      )}

      {/* Inline result drawer: opens directly below the code on Run. */}
      {runner.status !== "idle" && (
        <div
          ref={resultRef}
          role="region"
          aria-label="Execution output"
          aria-live="polite"
          aria-busy={isRunning}
          className={`no-print border-t-2 border-[var(--g-line2)] ${
            runner.status === "error"
              ? "bg-red-50/55 dark:bg-red-950/20"
              : (meta?.bodyTone ?? "bg-[var(--g-sunken)]/85")
          }`}
        >
          {/* Result header bar */}
          <div
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--g-line)] px-3 py-1.5 font-sans text-xs sm:px-4 ${
              isRunning
                ? "bg-[var(--g-code-head)]/80"
                : runner.status === "error"
                  ? "bg-red-100/70 dark:bg-red-950/40"
                  : (meta?.headTone ?? "bg-[var(--g-code-head)]/80")
            }`}
          >
            {isRunning ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--g-ink2)]">
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--g-accent)]"
                  aria-hidden="true"
                />
                <span>
                  {runMode === "test"
                    ? "Compiling and running tests…"
                    : props.isRelease
                      ? "Compiling and running (release)…"
                      : "Compiling and running…"}
                </span>
              </span>
            ) : runner.status === "error" ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Could not run</span>
              </span>
            ) : (
              meta &&
              displayedOutput && (
                <>
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold ${meta.textTone}`}
                  >
                    <meta.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{meta.label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-[var(--g-ink3)] tabular-nums">
                    {formatRunDuration(displayedOutput.durationMs)}
                    {props.isRelease ? " · release" : ""}
                    {displayedModified ? " · edited" : ""}
                  </span>
                  {displayedOutput.outcome === "runtime-error" && displayedOutput.exitDetail && (
                    <span className="font-mono text-[11px] text-[var(--g-ink3)]">
                      ({displayedOutput.exitDetail})
                    </span>
                  )}
                </>
              )
            )}

            <span className="ml-auto flex items-center gap-1">
              {isRunning ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
                >
                  <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  <span>Stop</span>
                </button>
              ) : (
                <>
                  {runner.status === "error" && (
                    <button
                      type="button"
                      onClick={handleRunClick}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-0.5 text-[11px] font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      <span>Try again</span>
                    </button>
                  )}

                  {displayedOutput?.outcome === "panic" && (
                    <button
                      type="button"
                      onClick={() => handleToggleBacktrace(displayedOutput.backtrace)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
                    >
                      <span>{displayedOutput.backtrace ? "Hide backtrace" : "Show backtrace"}</span>
                    </button>
                  )}

                  {displayedOutput && outCopyText.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleCopyOutput(displayedOutput)}
                      title="Copy output"
                      aria-label={copiedOutput ? "Output copied to clipboard" : "Copy output"}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-[11px] font-medium text-[var(--g-ink3)] transition-colors hover:border-[var(--g-line2)] hover:bg-[var(--g-surface)] hover:text-[var(--g-ink)]"
                    >
                      {copiedOutput ? (
                        <Check
                          className="h-3 w-3 text-emerald-600 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Copy className="h-3 w-3" aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">{copiedOutput ? "Copied" : "Copy"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCloseOutput}
                    title="Hide output"
                    aria-label="Hide output"
                    className="inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent p-1 text-[var(--g-ink3)] transition-colors hover:border-[var(--g-line2)] hover:bg-[var(--g-surface)] hover:text-[var(--g-ink)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </>
              )}
            </span>
          </div>

          {/* Result body */}
          {runner.status === "error" ? (
            <p className="m-0 px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-[var(--g-ink2)] sm:px-4">
              {runner.message}
            </p>
          ) : displayedOutput ? (
            <div className={isRunning ? "opacity-55 transition-opacity" : ""}>
              {displayedOutput.outcome === "compile-error" ? (
                <DiagnosticPre
                  text={
                    displayedOutput.diagnostics ||
                    displayedOutput.exitDetail ||
                    "Compilation failed."
                  }
                />
              ) : (
                <>
                  {displayedOutput.stdout.length > 0 && (
                    <pre className="m-0 max-h-96 overflow-auto px-3.5 py-3 font-mono text-[13px] leading-[1.6] text-[var(--g-ink)] sm:px-4">
                      <code>{displayedOutput.stdout}</code>
                    </pre>
                  )}

                  {displayedOutput.stderr.length > 0 && (
                    <div
                      className={
                        displayedOutput.stdout.length > 0 ? "border-t border-[var(--g-line)]" : ""
                      }
                    >
                      {displayedOutput.stdout.length > 0 && (
                        <div className="px-3.5 pt-2 font-sans text-[11px] font-semibold tracking-[0.06em] text-[var(--g-ink3)] uppercase sm:px-4">
                          {displayedOutput.outcome === "panic" ? "Panic output" : "Standard error"}
                        </div>
                      )}
                      <DiagnosticPre text={displayedOutput.stderr} />
                    </div>
                  )}

                  {displayedOutput.stdout.length === 0 && displayedOutput.stderr.length === 0 && (
                    <p className="m-0 px-3.5 py-2.5 font-mono text-[12.5px] italic text-[var(--g-ink3)] sm:px-4">
                      {displayedOutput.outcome === "timeout"
                        ? "The program exceeded the time limit and was stopped. Check for an infinite loop."
                        : displayedOutput.outcome === "compiled"
                          ? "Compiled cleanly with no errors."
                          : "Finished with no output."}
                    </p>
                  )}

                  {displayedOutput.outcome === "timeout" &&
                    (displayedOutput.stdout.length > 0 || displayedOutput.stderr.length > 0) && (
                      <p className="m-0 border-t border-[var(--g-line)] px-3.5 py-2 font-sans text-xs text-amber-800 sm:px-4 dark:text-amber-300">
                        The program exceeded the time limit and was stopped.
                      </p>
                    )}

                  {displayedOutput.diagnostics.length > 0 && (
                    <details
                      open={displayedModified || props.kind === "warns"}
                      className="group/warn border-t border-[var(--g-line)]"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-1.5 font-sans text-xs font-semibold text-amber-800 hover:text-[var(--g-ink)] sm:px-4 dark:text-amber-300">
                        <ChevronRight
                          className="h-3.5 w-3.5 transition-transform group-open/warn:rotate-90"
                          aria-hidden="true"
                        />
                        <span>Compiler warnings</span>
                      </summary>
                      <div className="border-t border-[var(--g-line)]">
                        <DiagnosticPre text={displayedOutput.diagnostics} />
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="m-0 px-3.5 py-2.5 font-mono text-[12.5px] text-[var(--g-ink3)] sm:px-4">
              Rust stable · 2024 edition
              {props.isRelease ? " · release build" : ""}
            </p>
          )}
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : copiedOutput ? "Output copied to clipboard" : ""}
      </span>
    </figure>
  );
}
