"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, RotateCcw } from "lucide-react";
import type { ChapterSummary } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

/** Entry points for new readers and readers returning to their last chapter. */
export function HomeContinueButton({
  chapters,
}: {
  chapters: ChapterSummary[];
}) {
  const { state } = useGuideState();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Support legacy /#chapter-id links cleanly
  useEffect(() => {
    const rawHash = window.location.hash.slice(1);
    if (!rawHash || rawHash === "home") return;
    const [cid, anchor] = rawHash.split("/");
    const match = chapters.find((c) => c.id === cid);
    if (match) {
      router.replace(
        `/chapters/${cid}${anchor ? `#${cid}--${anchor.replace(`${cid}--`, "")}` : ""}`
      );
    }
  }, [chapters, router]);

  const last = mounted && state.last
    ? chapters.find((c) => c.id === state.last) ?? null
    : null;

  const href = last ? `/chapters/${last.id}` : "/chapters";
  const caption = last
    ? `Last opened: ${last.title}`
    : "New here? Start at the beginning or explore the curriculum.";

  return (
    <div className="mt-8 font-sans">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/chapters/start"
          className="inline-flex items-center gap-2 rounded-well bg-[var(--g-accent)] px-5 py-3 text-sm font-bold text-[var(--g-on-accent)] shadow-card transition-colors hover:bg-[var(--g-accent-hover)]"
        >
          <span>Start from the beginning</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>

        <Link
          href={href}
          title={last ? `Continue with ${last.title}` : "Explore all chapters"}
          aria-label={last ? `Continue reading ${last.title}` : "Explore all chapters"}
          className="inline-flex max-w-full items-center gap-2 rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-3 text-sm font-semibold text-[var(--g-ink)] shadow-card transition-colors hover:border-[var(--g-accent)]"
        >
          {last ? (
            <RotateCcw className="h-4 w-4 shrink-0 text-[var(--g-accent)]" aria-hidden="true" />
          ) : (
            <BookOpen className="h-4 w-4 shrink-0 text-[var(--g-accent)]" aria-hidden="true" />
          )}
          <span>{last ? "Continue reading" : "Explore chapters"}</span>
        </Link>
      </div>

      <p className="mt-2.5 min-h-[1.25rem] text-xs text-[var(--g-ink3)]">
        {caption}
      </p>
    </div>
  );
}
