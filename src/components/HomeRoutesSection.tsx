"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Flag } from "lucide-react";
import type { ChapterSummary, PartMeta, RouteMeta } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

export function HomeRoutesSection({
  parts,
  routes,
  chapters,
}: {
  parts: PartMeta[];
  routes: RouteMeta[];
  chapters: ChapterSummary[];
}) {
  const { state } = useGuideState();
  const [activeRouteId, setActiveRouteId] = useState<string>("all");

  const activeRoute =
    routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const allowSet = useMemo(() => {
    if (!activeRoute?.chapters) return null;
    return new Set(activeRoute.chapters);
  }, [activeRoute]);

  const tracked = useMemo(
    () => chapters.filter((c) => c.kind !== "appendix"),
    [chapters]
  );

  const routeMetrics = useMemo(() => {
    let count = 0;
    let mins = 0;
    for (const c of tracked) {
      if (!allowSet || allowSet.has(c.id)) {
        count += 1;
        mins += c.time;
      }
    }
    const hrs = Math.max(1, Math.round(mins / 60));
    return { count, hrs };
  }, [tracked, allowSet]);

  const pathParts = parts.filter((p) => p.key !== "welcome");

  return (
    <section className="mt-20">
      <h2 className="font-sans text-[26px] font-bold tracking-tight text-[var(--g-ink)]">
        Your learning path
      </h2>
      <p className="mt-2 max-w-2xl font-sans text-[15px] leading-relaxed text-[var(--g-ink2)]">
        Work through the core parts in order, or highlight a goal-based route
        below so you only tackle what matches what you want to build. Tick
        chapters off as you go and your progress is saved in this browser.
      </p>

      <div
        role="group"
        aria-label="Learning route filter"
        className="mt-6 flex flex-wrap gap-2 font-sans"
      >
        {routes.map((rt) => {
          const isOn = rt.id === activeRoute.id;
          return (
            <button
              key={rt.id}
              type="button"
              aria-pressed={isOn}
              onClick={() => setActiveRouteId(rt.id)}
              className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                isOn
                  ? "border-[var(--g-accent)] bg-[var(--g-accent)] text-white shadow-card"
                  : "border-[var(--g-line2)] bg-[var(--g-surface)] text-[var(--g-ink2)] shadow-card hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
              }`}
            >
              {rt.label}
            </button>
          );
        })}
      </div>

      <p
        aria-live="polite"
        className="mt-3 mb-6 font-sans text-sm leading-relaxed text-[var(--g-ink3)]"
      >
        <span className="font-medium text-[var(--g-ink2)]">
          {activeRoute.summary}
        </span>{" "}
        ({routeMetrics.count} chapters, ~{routeMetrics.hrs} hours)
      </p>

      <ol className="space-y-4">
        {pathParts.map((part) => {
          const partChapters = chapters.filter((c) => c.part === part.key);
          if (partChapters.length === 0) return null;

          const hits = partChapters.filter(
            (c) => !allowSet || allowSet.has(c.id)
          ).length;
          const partDimmed = Boolean(allowSet && hits === 0);
          const doneCount = partChapters.filter((c) => state.done[c.id]).length;
          const allDone =
            part.key !== "app" &&
            partChapters.length > 0 &&
            doneCount === partChapters.length;

          return (
            <li
              key={part.key}
              className={`flex gap-4 rounded-card border bg-[var(--g-surface)] p-5 shadow-card transition-opacity ${
                allDone
                  ? "border-emerald-400/70 dark:border-emerald-800/70"
                  : "border-[var(--g-line)]"
              } ${partDimmed ? "opacity-40" : ""}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-sans text-[15px] font-bold tabular-nums ${
                  allDone
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                    : "bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
                }`}
              >
                {part.partLabel ? part.partLabel.replace("Part ", "") : "+"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-sans">
                  <h3 className="text-[17px] font-bold tracking-tight text-[var(--g-ink)]">
                    {part.title}
                  </h3>
                  {part.level && (
                    <span className="rounded-full border border-[var(--g-line)] bg-[var(--g-sunken)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--g-ink3)]">
                      {part.level}
                    </span>
                  )}
                  {part.key !== "app" && (
                    <span className="ml-auto text-xs font-medium tabular-nums text-[var(--g-ink3)]">
                      {doneCount}/{partChapters.length} done
                    </span>
                  )}
                </div>

                {part.blurb && (
                  <p className="mt-1.5 font-sans text-sm leading-relaxed text-[var(--g-ink2)]">
                    {part.blurb}
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2 font-sans">
                  {partChapters.map((c) => {
                    const isDone = Boolean(state.done[c.id]);
                    const isOff = Boolean(allowSet && !allowSet.has(c.id));
                    return (
                      <Link
                        key={c.id}
                        href={`/chapters/${c.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                          isDone
                            ? "border-emerald-400/70 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-200"
                            : c.kind === "project"
                              ? "border-[var(--g-accent)]/40 bg-[var(--g-accent-soft)]/50 text-[var(--g-ink)] hover:border-[var(--g-accent)]"
                              : "border-[var(--g-line)] bg-[var(--g-bg)]/60 text-[var(--g-ink2)] hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
                        } ${isOff ? "opacity-35" : ""}`}
                      >
                        <span className="font-mono text-xs font-bold text-[var(--g-ink3)]">
                          {c.num}
                        </span>
                        {c.kind === "project" && (
                          <Flag
                            className="h-3 w-3 text-[var(--g-accent)]"
                            aria-hidden="true"
                          />
                        )}
                        <span>{c.short}</span>
                        {isDone && (
                          <Check
                            className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
