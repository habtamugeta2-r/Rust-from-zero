"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, RotateCcw } from "lucide-react";
import type { ChapterSummary } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

/**
 * The two entry points into the guide: start at the top, or carry on.
 *
 * Everything here renders identically on the server and on the first client
 * paint — the label says "Continue reading" either way and the caption slot is
 * reserved — so a statically cached home page cannot visibly re-flow when the
 * reader's saved chapter arrives a moment later. Only the destination and the
 * caption change after hydration.
 */
export function HomeContinueButton({
  chapters,
}: {
  chapters: ChapterSummary[];
}) {
  const { state, persistent } = useGuideState();
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

  const href = last ? `/chapters/${last.id}` : "/progress";
  const caption = last
    ? `Chapter ${last.num} · ${last.title}`
    : persistent === false && mounted
      ? "Open your progress page to pick a chapter"
      : "Pick up where you left off — or open your progress page";

  return (
    <div className="mt-8 font-sans">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/chapters/start"
          className="inline-flex items-center gap-2 rounded-well bg-[var(--g-accent)] px-5 py-3 text-sm font-bold text-white shadow-card transition-colors hover:bg-[var(--g-accent-hover)]"
        >
          <span>Start from the beginning</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>

        <Link
          href={href}
          title={last ? `Continue with ${last.title}` : "Open your progress page"}
          aria-label={
            last ? `Continue reading ${last.title}` : "Continue reading"
          }
          className="inline-flex max-w-full items-center gap-2 rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-3 text-sm font-semibold text-[var(--g-ink)] shadow-card transition-colors hover:border-[var(--g-accent)]"
        >
          <RotateCcw
            className="h-4 w-4 shrink-0 text-[var(--g-accent)]"
            aria-hidden="true"
          />
          <span>Continue reading</span>
        </Link>
      </div>

      <p className="mt-2.5 min-h-[1.25rem] truncate text-xs text-[var(--g-ink3)]">
        {caption}
      </p>
    </div>
  );
}
