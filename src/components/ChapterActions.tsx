"use client";

import React, { useEffect } from "react";
import { Check, CircleCheck } from "lucide-react";
import { ChapterBookmark } from "./ChapterBookmark";
import { useGuideState } from "./GuideStateProvider";

export function ChapterActions({
  chapterId,
  chapterTitle,
  trackDone,
}: {
  chapterId: string;
  chapterTitle: string;
  trackDone: boolean;
}) {
  const { state, toggleDone, setLastChapter, showToast } = useGuideState();
  const isDone = Boolean(state.done[chapterId]);

  // Reading a chapter is what makes it "last opened", whether or not it is
  // finished — the palette and the home page both continue from here.
  useEffect(() => {
    setLastChapter(chapterId);
  }, [chapterId, setLastChapter]);

  if (!trackDone) {
    return (
      <div className="no-print my-10 flex justify-end">
        <ChapterBookmark chapterId={chapterId} title={chapterTitle} />
      </div>
    );
  }

  const onToggle = () => {
    toggleDone(chapterId);
    showToast(
      isDone
        ? "Chapter marked as not complete."
        : "Chapter complete. Progress saved."
    );
  };

  return (
    <div
      className={`no-print my-10 flex flex-wrap items-center justify-between gap-4 rounded-card border p-4 font-sans shadow-card transition-colors sm:p-5 ${
        isDone
          ? "border-emerald-400/70 bg-emerald-50/50 dark:border-emerald-800/70 dark:bg-emerald-950/20"
          : "border-[var(--g-line)] bg-[var(--g-surface)]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-bold text-[var(--g-ink)]">
          {isDone && (
            <CircleCheck
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          )}
          {isDone ? "Chapter complete" : "Finished this chapter?"}
        </div>
        <div className="mt-0.5 text-sm text-[var(--g-ink3)]">
          {isDone
            ? "It counts toward your progress. Undo at any time."
            : "Mark it complete to track your progress through the guide."}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <ChapterBookmark chapterId={chapterId} title={chapterTitle} />
        <button
          type="button"
          aria-pressed={isDone}
          onClick={onToggle}
          className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-well px-4 py-2 text-sm font-semibold transition-colors ${
            isDone
              ? "border border-emerald-500/70 bg-transparent text-emerald-800 hover:bg-emerald-100/60 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
              : "bg-[var(--g-accent)] text-[var(--g-on-accent)] hover:bg-[var(--g-accent-hover)]"
          }`}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          <span>
            {isDone ? "Completed — click to undo" : "Mark as complete"}
          </span>
        </button>
      </div>
    </div>
  );
}
