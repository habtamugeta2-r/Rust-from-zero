"use client";

import React from "react";
import { Bookmark } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";

/**
 * Pin a chapter to the reader's list. Bookmarks are separate from completion:
 * they say "come back to this", and they survive a progress reset.
 */
export function ChapterBookmark({
  chapterId,
  title,
  labelled = true,
}: {
  chapterId: string;
  title: string;
  labelled?: boolean;
}) {
  const { state, toggleBookmark, showToast } = useGuideState();
  const bookmarked = Boolean(state.bookmarks[chapterId]);

  return (
    <button
      type="button"
      aria-pressed={bookmarked}
      aria-label={
        bookmarked
          ? `Remove bookmark from ${title}`
          : `Bookmark ${title} for later`
      }
      title={bookmarked ? "Remove bookmark" : "Save for later"}
      onClick={() => {
        toggleBookmark(chapterId);
        showToast(
          bookmarked
            ? "Bookmark removed."
            : "Bookmarked — it is on your progress page."
        );
      }}
      className={`no-print inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold transition-colors ${
        bookmarked
          ? "border-[var(--g-accent)]/50 bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
          : "border-[var(--g-line2)] text-[var(--g-ink3)] hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
      }`}
    >
      <Bookmark
        className="h-3 w-3"
        fill={bookmarked ? "currentColor" : "none"}
        aria-hidden="true"
      />
      {labelled && (bookmarked ? "Bookmarked" : "Bookmark")}
    </button>
  );
}
