"use client";

import React from "react";
import { useGuideState } from "./GuideStateProvider";

export function GlossaryTerm({ termKey, text }: { termKey: string; text: string }) {
  const { showGlossaryTip, hideGlossaryTip, activeTipKey } = useGuideState();
  const isActive = activeTipKey === termKey;

  const keepTooltipOpenOnFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    const next = event.relatedTarget;
    if (
      next instanceof HTMLElement &&
      (next.closest('[role="tooltip"]') || next.closest("[data-glossary-term]"))
    ) {
      return;
    }
    hideGlossaryTip();
  };

  const focusTooltipLink = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Tab" || event.shiftKey || !isActive) return;
    const link = document.querySelector<HTMLAnchorElement>("[data-glossary-tooltip-link]");
    if (!link) return;
    event.preventDefault();
    link.focus();
  };

  return (
    <button
      type="button"
      data-glossary-term={termKey}
      aria-describedby={isActive ? "glossary-tooltip" : undefined}
      aria-expanded={isActive}
      title={`Glossary: ${text}`}
      onMouseEnter={(event) => showGlossaryTip(termKey, event.currentTarget)}
      onMouseLeave={() => hideGlossaryTip()}
      onFocus={(event) => showGlossaryTip(termKey, event.currentTarget)}
      onBlur={keepTooltipOpenOnFocus}
      onKeyDown={focusTooltipLink}
      onClick={(event) => {
        if (isActive) hideGlossaryTip();
        else showGlossaryTip(termKey, event.currentTarget);
      }}
      className="cursor-help border-b border-dotted border-[var(--g-accent)] font-inherit text-inherit transition-colors hover:text-[var(--g-accent)] focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--g-accent)]"
    >
      {text}
    </button>
  );
}
