"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { ChapterSummary } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

export function HomeContinueButton({
  chapters,
}: {
  chapters: ChapterSummary[];
}) {
  const { state } = useGuideState();
  const router = useRouter();

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

  const last = state.last ? chapters.find((c) => c.id === state.last) : null;

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 font-sans">
      <Link
        href="/chapters/start"
        className="inline-flex items-center gap-2 rounded-well bg-[var(--g-accent)] px-5 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-[var(--g-accent-hover)]"
      >
        <span>Start from the beginning</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>

      {last && (
        <Link
          href={`/chapters/${last.id}`}
          className="inline-flex max-w-full items-center gap-2 rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-3 text-sm font-semibold text-[var(--g-ink)] shadow-card transition-colors hover:border-[var(--g-accent)]"
        >
          <RotateCcw className="h-4 w-4 shrink-0 text-[var(--g-accent)]" aria-hidden="true" />
          <span className="truncate">Continue: {last.title}</span>
        </Link>
      )}
    </div>
  );
}
