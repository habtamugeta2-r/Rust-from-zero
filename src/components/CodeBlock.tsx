import React from "react";
import { CodeBlockActions } from "./CodeBlockActions";

/**
 * One code listing, rendered on the server.
 *
 * The frame, the label chips and the highlighted code are all Server Component
 * output. The only client component is {@link CodeBlockActions} — two buttons —
 * and it is a *sibling* of the code, not its parent.
 *
 * That distinction is the whole optimisation: a `"use client"` wrapper forces
 * everything inside it into the Flight payload, so a client `CodeBlock` that
 * received the Shiki markup as a child element had to have that markup
 * serialised into the RSC stream *as well as* rendered into the HTML — the
 * largest chapter pages carried their listings twice. With the buttons as a
 * sibling, the markup never crosses the client boundary and appears once.
 */
export interface CodeBlockProps {
  lang: string;
  label: string;
  /** The text Copy puts on the clipboard (absent for output and diagnostics). */
  copyText?: string;
  /** SHA-1 of the raw code, used to fetch the runnable wrapper on demand. */
  codeHash?: string;
  /**
   * Whether a runnable wrapper exists beyond the visible code. The wrapper
   * itself is fetched from `/api/playground` when Run is pressed.
   */
  hasFullCode?: boolean;
  filename?: string;
  isContinuation: boolean;
  /** The block's flags: `run`, `wrap`, `check`, `fail`, `panic`, `test`, … */
  kind: string;
  isExt: boolean;
  noPlay: boolean;
  isRelease: boolean;
  isSoft: boolean;
  isOutput: boolean;
  isError: boolean;
  /** Already-highlighted markup from `highlightCode()`. */
  html: string;
}

/** Whether this block can be opened in the Rust Playground. */
function canPlayInPlayground(props: CodeBlockProps, rawCode: string): boolean {
  if (props.lang !== "rust" || props.isExt || props.noPlay) return false;
  if (props.kind === "run" || props.kind === "wrap") return true;
  return props.kind === "panic" && rawCode.includes("fn main");
}

export function CodeBlock(props: CodeBlockProps) {
  const isIntentionalFailure = props.kind === "fail" || props.kind === "panic";
  const rawCode = props.copyText ?? "";

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

  const showActions = props.copyText !== undefined && !props.isOutput && !props.isError;

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

        {props.kind === "fail" && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/70 dark:text-red-300">
            Does not compile — on purpose
          </span>
        )}

        {props.kind === "panic" && (
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
          <CodeBlockActions
            copyText={props.copyText ?? ""}
            codeHash={props.codeHash}
            hasFullCode={props.hasFullCode}
            canPlay={canPlayInPlayground(props, rawCode)}
            isRelease={props.isRelease}
            label={`${props.label} code`}
          />
        )}
      </figcaption>

      {/* Keyboard users can scroll a long line without touching the mouse. */}
      <div
        className="code-scroll"
        data-scroll-pane
        tabIndex={0}
        role="group"
        aria-label={`${props.label} code`}
        dangerouslySetInnerHTML={{ __html: props.html }}
      />
    </figure>
  );
}
