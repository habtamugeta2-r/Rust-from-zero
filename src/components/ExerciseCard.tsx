"use client";

import React from "react";
import { CheckCircle2, ChevronDown, Lightbulb, Pencil } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";

const KIND_LABELS: Record<"guided" | "practice" | "challenge", string> = {
  guided: "Guided exercise",
  practice: "Practice",
  challenge: "Challenge",
};

const KIND_BADGES: Record<"guided" | "practice" | "challenge", string> = {
  guided: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-300",
  practice: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  challenge: "bg-purple-100 text-purple-900 dark:bg-purple-950/60 dark:text-purple-300",
};

export function ExerciseCard({
  exerciseId,
  kind,
  title,
  body,
  hint,
  solution,
}: {
  exerciseId: string;
  kind: "guided" | "practice" | "challenge";
  title: React.ReactNode;
  body: React.ReactNode;
  hint?: React.ReactNode;
  solution?: React.ReactNode;
}) {
  const { state, setSaved } = useGuideState();
  const isDone = Boolean(state.saved[exerciseId]);

  return (
    <div
      id={exerciseId}
      className={`my-7 overflow-hidden rounded-card border transition-colors ${
        isDone
          ? "border-emerald-400/70 bg-[var(--g-surface)] dark:border-emerald-800/70"
          : "border-[var(--g-line)] bg-[var(--g-surface)]"
      } shadow-card`}
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-3 font-sans sm:px-5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${KIND_BADGES[kind]}`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {KIND_LABELS[kind]}
        </span>
        <span className="text-[15px] font-bold tracking-tight text-[var(--g-ink)]">{title}</span>
        <label className="no-print ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--g-ink2)] select-none">
          <input
            type="checkbox"
            checked={isDone}
            onChange={(e) => setSaved(exerciseId, e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--g-accent)]"
          />
          <span>{isDone ? "Done" : "Mark done"}</span>
        </label>
      </div>

      <div className="px-4 py-4 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 sm:px-5">
        {body}
      </div>

      {(hint || solution) && (
        <div className="space-y-2 border-t border-[var(--g-line)] bg-[var(--g-bg)]/50 px-4 py-3 font-sans text-[15px] sm:px-5">
          {hint && (
            <details className="group rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 font-semibold text-[var(--g-ink2)] hover:text-[var(--g-accent)]">
                <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <span>Need a hint?</span>
                <ChevronDown
                  className="ml-auto h-4 w-4 text-[var(--g-ink3)] transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="guide-prose mt-3 border-t border-[var(--g-line)] pt-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {hint}
              </div>
            </details>
          )}
          {solution && (
            <details className="group rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-4 py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 py-0.5 font-semibold text-[var(--g-ink2)] hover:text-[var(--g-accent)]">
                <CheckCircle2
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                <span>Show solution and explanation</span>
                <ChevronDown
                  className="ml-auto h-4 w-4 text-[var(--g-ink3)] transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="guide-prose mt-3 border-t border-[var(--g-line)] pt-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                {solution}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
