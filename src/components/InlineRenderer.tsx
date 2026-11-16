"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { InlineNode } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

export function InlineRenderer({ nodes }: { nodes: InlineNode[] }) {
  const { showGlossaryTip, hideGlossaryTip, cancelHideGlossaryTip, activeTipKey } = useGuideState();

  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <React.Fragment key={i}>{node.text}</React.Fragment>;
          case "code":
            return (
              <code
                key={i}
                className="rounded-md border border-[var(--g-line)] bg-[var(--g-sunken)] px-1.5 py-0.5 text-[0.86em] font-medium text-[var(--g-ink)]"
              >
                {node.text}
              </code>
            );
          case "kbd":
            return (
              <kbd
                key={i}
                className="inline-block rounded border border-[var(--g-line2)] bg-[var(--g-sunken)] px-1.5 py-0.5 text-[0.78em] font-semibold text-[var(--g-ink2)] shadow-[0_1px_0_var(--g-line2)]"
              >
                {node.text}
              </kbd>
            );
          case "strong":
            return (
              <strong key={i} className="font-semibold text-[var(--g-ink)]">
                <InlineRenderer nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i} className="italic">
                <InlineRenderer nodes={node.children} />
              </em>
            );
          case "term":
            return (
              <button
                key={i}
                type="button"
                data-glossary-term={node.key}
                title={`Glossary: ${node.text}`}
                // The popover opens 8px away, so leaving the word must not close
                // it instantly: the delay lets the pointer cross the gap, and
                // re-entering the word cancels the close.
                onMouseEnter={(e) => {
                  cancelHideGlossaryTip();
                  showGlossaryTip(node.key, e.currentTarget);
                }}
                onMouseLeave={hideGlossaryTip}
                // A reader who tabs onto the word keeps the definition open
                // while they read it; blur (moving focus elsewhere) closes it
                // after the same grace period, which also allows tabbing into
                // the popover's "Glossary →" link.
                onFocus={(e) => {
                  cancelHideGlossaryTip();
                  showGlossaryTip(node.key, e.currentTarget);
                }}
                onBlur={hideGlossaryTip}
                onClick={(e) => {
                  if (activeTipKey === node.key) hideGlossaryTip();
                  else showGlossaryTip(node.key, e.currentTarget);
                }}
                className="cursor-help border-b border-dotted border-[var(--g-accent)] font-inherit text-inherit transition-colors hover:text-[var(--g-accent)] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--g-accent)]"
              >
                {node.text}
              </button>
            );
          case "internalLink": {
            const href =
              node.chapterId === "home"
                ? "/"
                : `/chapters/${node.chapterId}${
                    node.anchor
                      ? `#${node.chapterId}--${node.anchor.replace(`${node.chapterId}--`, "")}`
                      : ""
                  }`;
            return (
              <Link
                key={i}
                href={href}
                className="font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-[3px] transition-colors hover:text-[var(--g-accent-hover)] hover:decoration-[var(--g-accent)]"
              >
                <InlineRenderer nodes={node.children} />
              </Link>
            );
          }
          case "routeLink":
            return (
              <Link
                key={i}
                href={node.href}
                className="font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-[3px] transition-colors hover:text-[var(--g-accent-hover)] hover:decoration-[var(--g-accent)]"
              >
                <InlineRenderer nodes={node.children} />
              </Link>
            );
          case "externalLink":
            return (
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-baseline gap-0.5 font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-[3px] transition-colors hover:text-[var(--g-accent-hover)] hover:decoration-[var(--g-accent)]"
              >
                <InlineRenderer nodes={node.children} />
                <ExternalLink
                  className="inline h-[0.72em] w-[0.72em] shrink-0 self-center opacity-75"
                  aria-hidden="true"
                />
              </a>
            );
        }
      })}
    </>
  );
}
