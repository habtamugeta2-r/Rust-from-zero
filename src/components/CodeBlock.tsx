import React from "react";
import { CodeBlockActions } from "./CodeBlockActions";

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
  hasMain?: boolean;
  children: React.ReactNode;
}

export function CodeBlock(props: CodeBlockProps) {
  const canPlay =
    props.lang === "rust" &&
    (props.kind === "run" ||
      props.kind === "wrap" ||
      (props.kind === "panic" &&
        (props.hasMain ?? (props.rawCode ?? "").includes("fn main")))) &&
    !props.isExt &&
    !props.noPlay;

  const isIntentionalFailure = props.kind === "fail" || props.kind === "panic";

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

  return (
    <figure
      data-playground={
        canPlay && props.fullCode && props.fullCode !== props.rawCode
          ? props.fullCode
          : undefined
      }
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
              props.lang === "rust"
                ? "bg-[var(--g-accent)]"
                : "bg-[var(--g-line2)]"
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
            lang={props.lang}
            canPlay={canPlay}
            isRelease={props.isRelease}
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
      >
        {props.children}
      </div>
    </figure>
  );
}
