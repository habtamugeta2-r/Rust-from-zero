"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Play } from "lucide-react";
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

export function CodeBlock(props: CodeBlockProps) {
  const { showToast } = useGuideState();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const canPlay =
    props.lang === "rust" &&
    (props.kind === "run" ||
      props.kind === "wrap" ||
      (props.kind === "panic" && (props.rawCode ?? "").includes("fn main"))) &&
    !props.isExt &&
    !props.noPlay;

  const isIntentionalFailure = props.kind === "fail" || props.kind === "panic";

  const getCopyText = (): string => {
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
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast(
        "Copying is blocked here. Select the code and press Ctrl+C (Cmd+C on Mac)."
      );
    }
  };

  const handlePlay = () => {
    const mode = props.isRelease ? "release" : "debug";
    const payload = props.fullCode ?? getCopyText();
    const url = `https://play.rust-lang.org/?version=stable&mode=${mode}&edition=2024&code=${encodeURIComponent(payload)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    showToast("Opening the Rust Playground in a new tab (requires internet).");
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

  return (
    <figure
      className={`group/code my-6 overflow-hidden rounded-well border ${borderTone} ${bgTone} ${
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
          <span className="no-print ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              title="Copy this code"
              aria-label={copied ? "Copied to clipboard" : "Copy this code"}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--g-line2)] bg-[var(--g-surface)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
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

            {canPlay && (
              <button
                type="button"
                onClick={handlePlay}
                title="Open this example in the online Rust Playground"
                aria-label="Run this example in the Rust Playground"
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--g-accent)] px-3 py-1 text-[11.5px] font-bold text-white transition-colors hover:bg-[var(--g-accent-hover)]"
              >
                <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                <span className="hidden sm:inline">Run</span>
              </button>
            )}
          </span>
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

      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </figure>
  );
}
