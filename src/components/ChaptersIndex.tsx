"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Check, Clock, Flag, Search, X } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";
import { buildChapterProgress, type ChapterMeta, type ChapterProgress } from "@/lib/progress";
import { LEVEL_LABELS } from "@/lib/guide-config";
import { partAnchor } from "@/lib/navigation";

const KIND_LABELS: Record<ChapterMeta["kind"], string> = {
  chapter: "Chapter",
  project: "Project",
  orientation: "Orientation",
  appendix: "Appendix",
};

type FilterKind = "all" | "in-progress" | "done" | "projects" | "bookmarked";

/**
 * The `/chapters` index: every chapter grouped by part, with lightweight
 * client-side filtering and the reader's own completion state.
 */
export function ChaptersIndex({ chapters }: { chapters: ChapterMeta[] }) {
  const { state } = useGuideState();
  const [filter, setFilter] = useState<FilterKind>("all");
  const [query, setQuery] = useState("");

  const allRows = useMemo(
    () => chapters.map((chapter) => buildChapterProgress(chapter, state)),
    [chapters, state],
  );

  const counts = useMemo(() => {
    let inProgress = 0;
    let done = 0;
    let projects = 0;
    let bookmarked = 0;
    for (const row of allRows) {
      if (row.kind !== "appendix" && row.done) done += 1;
      if (row.kind !== "appendix" && !row.done && row.pct > 0) inProgress += 1;
      if (row.kind === "project") projects += 1;
      if (row.bookmarked) bookmarked += 1;
    }
    return { all: allRows.length, inProgress, done, projects, bookmarked };
  }, [allRows]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allRows.filter((row) => {
      if (filter === "done" && (row.kind === "appendix" || !row.done)) return false;
      if (filter === "in-progress" && (row.kind === "appendix" || row.done || row.pct === 0))
        return false;
      if (filter === "projects" && row.kind !== "project") return false;
      if (filter === "bookmarked" && !row.bookmarked) return false;
      if (q) {
        const hay = `${row.num} ${row.title} ${row.partTitle} ${row.kind}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const byPart = new Map<string, ChapterProgress[]>();
    for (const row of filtered) {
      const list = byPart.get(row.partTitle) ?? [];
      list.push(row);
      byPart.set(row.partTitle, list);
    }
    return Array.from(byPart.entries()).map(([partTitle, items]) => ({
      partTitle,
      items,
    }));
  }, [allRows, filter, query]);

  const filterTabs: { id: FilterKind; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "projects", label: "Projects", count: counts.projects },
    { id: "in-progress", label: "In progress", count: counts.inProgress },
    { id: "done", label: "Completed", count: counts.done },
    { id: "bookmarked", label: "Bookmarked", count: counts.bookmarked },
  ];

  const isFiltered = filter !== "all" || query.trim().length > 0;

  return (
    <div className="max-w-[880px]">
      {/* Filter & quick search toolbar */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter chapters" className="flex flex-wrap gap-1.5 font-sans">
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(tab.id)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                  active
                    ? "border-[var(--g-accent)] bg-[var(--g-accent)] text-[var(--g-on-accent)] shadow-card"
                    : "border-[var(--g-line)] bg-[var(--g-surface)] text-[var(--g-ink2)] hover:border-[var(--g-line2)] hover:text-[var(--g-ink)]"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? "opacity-85" : "text-[var(--g-ink3)]"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <label className="relative block w-full font-sans sm:w-60">
          <span className="sr-only">Filter chapters by title or part</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[var(--g-ink3)]"
            aria-hidden="true"
          />
          <input
            type="text"
            role="searchbox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter chapters…"
            autoComplete="off"
            className="h-9 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] pr-8 pl-8.5 text-[13px] text-[var(--g-ink)] shadow-card placeholder:text-[var(--g-ink3)] focus:border-[var(--g-accent)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute top-1/2 right-2 grid h-5 w-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-[var(--g-ink3)] hover:text-[var(--g-ink)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-card border border-dashed border-[var(--g-line2)] bg-[var(--g-surface)] px-6 py-10 text-center font-sans">
          <p className="text-sm font-semibold text-[var(--g-ink)]">No chapters match this view.</p>
          <p className="mt-1 text-xs text-[var(--g-ink3)]">
            Try clearing your filter or switching back to all chapters.
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
              className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--g-line2)] bg-[var(--g-bg)] px-3.5 py-1.5 text-xs font-semibold text-[var(--g-ink)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
            >
              Show all chapters
            </button>
          )}
        </div>
      ) : (
        <div className="curriculum-groups">
          {groups.map((group) => {
            const groupDone = group.items.filter(
              (item) => item.kind !== "appendix" && item.done,
            ).length;
            const hasTracked = group.items.some((item) => item.kind !== "appendix");

            return (
              <section key={group.partTitle} aria-labelledby={partAnchor(group.partTitle)}>
                <div className="curriculum-group-heading">
                  <h2 id={partAnchor(group.partTitle)}>{group.partTitle}</h2>
                  <span>
                    {hasTracked && groupDone > 0 ? `${groupDone}/` : ""}
                    {group.items.length} {group.items.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
                <ul className="curriculum-list">
                  {group.items.map((row) => (
                    <li key={row.id}>
                      <Link href={`/chapters/${row.id}`} className="curriculum-row group">
                        <span className="curriculum-row-number">{row.num}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-sans text-[15px] font-semibold text-[var(--g-ink)] transition-colors group-hover:text-[var(--g-accent)]">
                            <span className="truncate">{row.title}</span>
                            {row.kind === "project" && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--g-accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--g-accent)]">
                                <Flag className="h-2.5 w-2.5" aria-hidden="true" />
                                Project
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[12px] text-[var(--g-ink3)]">
                            {row.kind !== "project" && <span>{KIND_LABELS[row.kind]}</span>}
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
                        {row.kind === "appendix" ? (
                          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--g-line)] bg-[var(--g-surface)] px-2.5 py-0.5 font-sans text-[11px] font-medium text-[var(--g-ink3)]">
                            Reference
                          </span>
                        ) : row.done ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/95 px-2.5 py-0.5 font-sans text-[11px] font-semibold text-white">
                            <Check className="h-3 w-3" aria-hidden="true" />
                            Done
                          </span>
                        ) : row.pct > 0 ? (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-[var(--g-accent-soft)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--g-accent)] tabular-nums">
                            {row.pct}%
                          </span>
                        ) : null}
                        <ArrowRight className="curriculum-row-arrow" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
