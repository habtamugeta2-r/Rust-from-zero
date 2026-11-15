"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { Bookmark, Check, Clock } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";
import { buildChapterProgress, type ChapterMeta, type ChapterProgress } from "@/lib/progress";
import { LEVEL_LABELS } from "@/lib/guide-config";

const KIND_LABELS: Record<ChapterMeta["kind"], string> = {
  chapter: "Chapter",
  project: "Project",
  orientation: "Orientation",
  appendix: "Appendix",
};

/**
 * The `/chapters` index: every chapter grouped by part, with the reader's own
 * completion state. Chapter shapes arrive from the server; only the saved
 * state is client-side, matching the progress dashboard.
 */
export function ChaptersIndex({ chapters }: { chapters: ChapterMeta[] }) {
  const { state } = useGuideState();

  const groups = useMemo(() => {
    const rows = chapters.map((chapter) => buildChapterProgress(chapter, state));
    const byPart = new Map<string, ChapterProgress[]>();
    for (const row of rows) {
      const list = byPart.get(row.partTitle) ?? [];
      list.push(row);
      byPart.set(row.partTitle, list);
    }
    return Array.from(byPart.entries()).map(([partTitle, items]) => ({
      partTitle,
      items,
    }));
  }, [chapters, state]);

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.partTitle} aria-labelledby={`part-${slug(group.partTitle)}`}>
          <h2
            id={`part-${slug(group.partTitle)}`}
            className="mb-3 font-sans text-xs font-bold tracking-wider text-[var(--g-ink3)] uppercase"
          >
            {group.partTitle}
          </h2>
          <ul className="space-y-2">
            {group.items.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/chapters/${row.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-3.5 py-3 shadow-card transition-colors hover:border-[var(--g-accent)]"
                >
                  <span className="w-9 shrink-0 font-mono text-[11px] text-[var(--g-ink3)]">
                    {row.num}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[13.5px] font-semibold text-[var(--g-ink)]">
                      {row.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11.5px] text-[var(--g-ink3)]">
                      <span>{KIND_LABELS[row.kind]}</span>
                      <span>{LEVEL_LABELS[row.level] ?? "All levels"}</span>
                      {row.minutes > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {row.minutes} min
                        </span>
                      )}
                      {row.quizTotal > 0 && (
                        <span>
                          {row.quizAnswered}/{row.quizTotal} quiz
                        </span>
                      )}
                      {row.exerciseTotal > 0 && (
                        <span>
                          {row.exerciseSolved}/{row.exerciseTotal} exercises
                        </span>
                      )}
                    </span>
                  </span>
                  {row.bookmarked && (
                    <Bookmark
                      className="h-4 w-4 shrink-0 text-[var(--g-accent)]"
                      fill="currentColor"
                      aria-label="Bookmarked"
                    />
                  )}
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-sans text-[11px] font-bold ${
                      row.done
                        ? "bg-emerald-600 text-white"
                        : row.pct > 0
                          ? "bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
                          : "bg-[var(--g-sunken)] text-[var(--g-ink3)]"
                    }`}
                  >
                    {row.done && <Check className="h-3 w-3" aria-hidden="true" />}
                    {row.done ? "Done" : row.pct > 0 ? `${row.pct}%` : "Not started"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
