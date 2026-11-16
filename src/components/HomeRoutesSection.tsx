"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ChevronUp, Clock, Flag } from "lucide-react";
import type { ChapterSummary, PartMeta, RouteMeta } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

const INITIAL_VISIBLE_PARTS = 3;

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
  const [activeRouteId, setActiveRouteId] = useState<string>("core");
  const [showAllParts, setShowAllParts] = useState(false);

  const activeRoute = routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const allowSet = useMemo(() => {
    if (!activeRoute?.chapters) return null;
    return new Set(activeRoute.chapters);
  }, [activeRoute]);

  const tracked = useMemo(() => chapters.filter((c) => c.kind !== "appendix"), [chapters]);

  const routeMetrics = useMemo(() => {
    let count = 0;
    let done = 0;
    let mins = 0;
    for (const c of tracked) {
      if (!allowSet || allowSet.has(c.id)) {
        count += 1;
        if (state.done[c.id]) done += 1;
        mins += c.time;
      }
    }
    const hrs = Math.max(1, Math.round(mins / 60));
    return { count, done, hrs };
  }, [tracked, allowSet, state.done]);

  const matchingParts = useMemo(() => {
    const pathParts = parts.filter((p) => p.key !== "welcome");
    return pathParts
      .map((part) => {
        const partChapters = chapters.filter((c) => c.part === part.key);
        const matchedChapters = allowSet
          ? partChapters.filter((c) => allowSet.has(c.id))
          : partChapters;
        return { part, partChapters, matchedChapters };
      })
      .filter(({ partChapters, matchedChapters }) =>
        partChapters.length > 0 && (!allowSet || matchedChapters.length > 0),
      );
  }, [parts, chapters, allowSet]);

  const visibleParts = showAllParts
    ? matchingParts
    : matchingParts.slice(0, INITIAL_VISIBLE_PARTS);
  const hiddenCount = Math.max(0, matchingParts.length - visibleParts.length);

  return (
    <section aria-labelledby="routes-heading">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="landing-eyebrow">
            <span /> INTERACTIVE ROUTE PLANNER
          </p>
          <h2
            id="routes-heading"
            className="mt-3 font-sans text-[28px] leading-tight font-semibold tracking-[-0.03em] text-balance text-[var(--g-ink)] sm:text-[34px]"
          >
            Choose a track that fits your goal.
          </h2>
        </div>
        <Link
          href="/chapters"
          className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-[var(--g-accent)] transition-colors hover:text-[var(--g-accent-hover)]"
        >
          <span>Browse all chapters</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <p className="mt-3 max-w-2xl font-sans text-[15px] leading-relaxed text-pretty text-[var(--g-ink2)]">
        Follow the core sequence from start to finish, or focus on a specific goal. Routes share
        foundational chapters on purpose — pick one track at a time and tick chapters off as you go.
      </p>

      {/* Route selector pills */}
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
              onClick={() => {
                setActiveRouteId(rt.id);
                setShowAllParts(false);
              }}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                isOn
                  ? "border-[var(--g-accent)] bg-[var(--g-accent)] text-[var(--g-on-accent)] shadow-card"
                  : "border-[var(--g-line2)] bg-[var(--g-surface)] text-[var(--g-ink2)] hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
              }`}
            >
              {rt.label}
            </button>
          );
        })}
      </div>

      {/* Selected route summary strip */}
      <div
        aria-live="polite"
        className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-well border border-[var(--g-line)] bg-[var(--g-surface)] px-4 py-3.5 font-sans shadow-card"
      >
        <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--g-ink2)]">
          <strong className="font-semibold text-[var(--g-ink)]">{activeRoute.label}:</strong>{" "}
          {activeRoute.summary}
        </p>
        <div className="flex shrink-0 items-center gap-4 font-mono text-[12px] text-[var(--g-ink3)] tabular-nums">
          <span>{routeMetrics.count} chapters</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />~{routeMetrics.hrs} hrs
          </span>
          {routeMetrics.done > 0 && (
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {routeMetrics.done}/{routeMetrics.count} done
            </span>
          )}
        </div>
      </div>

      {/* Matching parts list */}
      <ol className="mt-5 space-y-3.5">
        {visibleParts.map(({ part, matchedChapters }) => {
          const doneCount = matchedChapters.filter((c) => state.done[c.id]).length;
          const allDone =
            part.key !== "app" &&
            matchedChapters.length > 0 &&
            doneCount === matchedChapters.length;

          return (
            <li
              key={part.key}
              className={`flex gap-4 rounded-card border bg-[var(--g-surface)] p-5 shadow-card transition-colors ${
                allDone
                  ? "border-emerald-400/70 dark:border-emerald-800/70"
                  : "border-[var(--g-line)]"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-bold tabular-nums ${
                  allDone
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                    : "bg-[var(--g-accent-soft)] text-[var(--g-accent)]"
                }`}
              >
                {part.partLabel ? part.partLabel.replace("Part ", "") : "+"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-sans">
                  <h3 className="text-[16px] font-semibold tracking-tight text-[var(--g-ink)]">
                    {part.title}
                  </h3>
                  {part.level && (
                    <span className="rounded-full border border-[var(--g-line)] bg-[var(--g-sunken)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--g-ink3)]">
                      {part.level}
                    </span>
                  )}
                  {part.key !== "app" && (
                    <span className="ml-auto font-mono text-[11.5px] font-medium text-[var(--g-ink3)] tabular-nums">
                      {doneCount}/{matchedChapters.length}
                    </span>
                  )}
                </div>

                {part.blurb && (
                  <p className="mt-1.5 font-sans text-[13.5px] leading-relaxed text-[var(--g-ink2)]">
                    {part.blurb}
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap gap-1.5 font-sans">
                  {matchedChapters.map((c) => {
                    const isDone = Boolean(state.done[c.id]);
                    return (
                      <Link
                        key={c.id}
                        href={`/chapters/${c.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                          isDone
                            ? "border-emerald-400/60 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-200"
                            : c.kind === "project"
                              ? "border-[var(--g-accent)]/35 bg-[var(--g-accent-soft)]/55 text-[var(--g-ink)] hover:border-[var(--g-accent)]"
                              : "border-[var(--g-line)] bg-[var(--g-bg)]/70 text-[var(--g-ink2)] hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
                        }`}
                      >
                        <span className="font-mono text-[11px] font-semibold text-[var(--g-ink3)]">
                          {c.num}
                        </span>
                        {c.kind === "project" && (
                          <Flag className="h-3 w-3 text-[var(--g-accent)]" aria-hidden="true" />
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

      {matchingParts.length > INITIAL_VISIBLE_PARTS && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAllParts((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--g-ink)] shadow-card transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
          >
            {showAllParts ? (
              <>
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
                <span>Show fewer parts</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
                <span>
                  Show {hiddenCount} more {hiddenCount === 1 ? "part" : "parts"} in{" "}
                  {activeRoute.label}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
