"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Play } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";

export interface CodeBlockActionsProps {
  lang: string;
  canPlay: boolean;
  isRelease: boolean;
}

export function CodeBlockActions({ lang, canPlay, isRelease }: CodeBlockActionsProps) {
  const { showToast } = useGuideState();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const getCopyText = (btn: HTMLElement): string => {
    const domCode = btn.closest("figure")?.querySelector("pre code")?.textContent ?? "";
    const code = domCode;
    if (lang === "sh") {
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

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const text = getCopyText(e.currentTarget);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      showToast("Copying is blocked here. Select the code and press Ctrl+C (Cmd+C on Mac).");
    }
  };

  const handlePlay = (e: React.MouseEvent<HTMLButtonElement>) => {
    const mode = isRelease ? "release" : "debug";
    const figure = e.currentTarget.closest("figure");
    const payload = figure?.getAttribute("data-playground") ?? getCopyText(e.currentTarget);
    const url = `https://play.rust-lang.org/?version=stable&mode=${mode}&edition=2024&code=${encodeURIComponent(payload)}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
