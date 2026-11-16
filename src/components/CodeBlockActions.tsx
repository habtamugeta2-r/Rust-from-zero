"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Play } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";

/**
 * The interactive half of a code block: Copy and Run.
 *
 * Deliberately the only client component in a listing, and deliberately a
 * *sibling* of the highlighted code rather than its parent: markup passed into
 * a client component is serialised into the RSC payload, so wrapping the code
 * in this component would send it twice. See `CodeBlock.tsx`.
 */
export interface CodeBlockActionsProps {
  /** The text Copy puts on the clipboard. */
  copyText: string;
  /** SHA-1 of the raw code, used to fetch the runnable wrapper on demand. */
  codeHash?: string;
  /**
   * Whether a runnable wrapper exists beyond the visible code. The wrapper
   * itself is fetched from `/api/playground` when Run is pressed.
   */
  hasFullCode?: boolean;
  canPlay: boolean;
  isRelease: boolean;
  /** Accessible label prefix for the status announcement. */
  label: string;
}

export function CodeBlockActions(props: CodeBlockActionsProps) {
  const { showToast } = useGuideState();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.copyText);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast("Copying is blocked here. Select the code and press Ctrl+C (Cmd+C on Mac).");
    }
  };

  /**
   * Open the Playground. The wrapper for a `#`-hidden or `wrap` block is not in
   * the page (that would duplicate every listing into the RSC payload), so it
   * is fetched here, at the moment the reader asks to run it. The tab is opened
   * synchronously first, because an `await` before `window.open` is what popup
   * blockers stop.
   */
  const handlePlay = async () => {
    const mode = props.isRelease ? "release" : "debug";
    const target = window.open("", "_blank", "noopener,noreferrer");
    let payload = props.copyText;
    if (props.hasFullCode && props.codeHash) {
      try {
        const res = await fetch(`/api/playground?h=${props.codeHash}`);
        if (res.ok) payload = ((await res.json()) as { code: string }).code;
      } catch {
        // Fall through with the visible code; it is better than nothing.
      }
    }
    const url = `https://play.rust-lang.org/?version=stable&mode=${mode}&edition=2024&code=${encodeURIComponent(payload)}`;
    if (target) {
      target.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    showToast("Opening the Rust Playground in a new tab (requires internet).");
  };

  return (
    <>
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

        {props.canPlay && (
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

      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
