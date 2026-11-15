"use client";

import { Search } from "lucide-react";

/**
 * Opens the guide's search field from anywhere on the page.
 *
 * The sidebar owns the real input, so this dispatches a window event that the
 * shell listens for — no duplicated search state, and the shortcut still works
 * when the navigation is collapsed.
 */
export function GuideSearchButton({
  chapters,
}: {
  chapters: number;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("rust-guide:search"))}
      className="inline-flex items-center gap-2 rounded-full border border-[var(--g-line)] bg-[var(--g-surface)] px-3.5 py-1.5 font-sans text-xs font-semibold text-[var(--g-ink2)] shadow-card transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
    >
      <Search className="h-3.5 w-3.5 text-[var(--g-accent)]" aria-hidden="true" />
      Search {chapters} chapters
      <kbd
        aria-hidden="true"
        className="ml-1 rounded border border-[var(--g-line)] bg-[var(--g-sunken)] px-1 py-0.5 font-sans text-[10px] font-medium text-[var(--g-ink3)]"
      >
        /
      </kbd>
    </button>
  );
}
