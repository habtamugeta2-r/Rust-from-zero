"use client";

import React, { useEffect } from "react";
import { Check } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";

export function ChapterActions({
  chapterId,
  trackDone,
}: {
  chapterId: string;
  trackDone: boolean;
}) {
  const { state, toggleDone, setLastChapter } = useGuideState();
  const isDone = Boolean(state.done[chapterId]);

  useEffect(() => {
    setLastChapter(chapterId);
  }, [chapterId, setLastChapter]);

  if (!trackDone) return null;

  return (
    <div className="no-print my-10 flex flex-wrap items-center justify-between gap-4 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-5 font-sans shadow-card">
      <div>
        <div className="font-bold text-[var(--g-ink)]">
          Finished this chapter?
        </div>
        <div className="text-sm text-[var(--g-ink3)]">
          Mark it complete to track your progress through the guide.
        </div>
      </div>

      <button
        type="button"
        aria-pressed={isDone}
        onClick={() => toggleDone(chapterId)}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
          isDone
            ? "border border-emerald-500/70 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
            : "bg-[var(--g-accent)] text-white hover:bg-[var(--g-accent-hover)]"
        }`}
      >
        <Check className="h-4 w-4" />
        <span>{isDone ? "Completed — click to undo" : "Mark as complete"}</span>
      </button>
    </div>
  );
}
