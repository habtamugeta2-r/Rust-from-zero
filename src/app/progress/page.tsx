import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { loadGuide } from "@/lib/guide-parser";
import { collectChapterMeta, type ChapterMeta } from "@/lib/progress";

export const metadata: Metadata = {
  title: "Your progress",
  description:
    "Chapters finished, quiz accuracy, solved exercises and bookmarks — all stored in your own browser.",
  // Personal, client-rendered state: nothing here belongs in a search index.
  robots: { index: false, follow: true },
};

/**
 * A single page that answers "how far am I?".
 *
 * The chapter shapes are computed once at build time and shipped as props, so
 * the only thing the browser has to add is the reader's own saved state.
 */
export default function ProgressPage() {
  // Appendices are included: they carry no completion tracking, but a reader
  // can bookmark one (the bookmark toast says "find it on your progress page"),
  // so filtering them out here made that link a dead end.
  const guide = loadGuide();
  const chapters: ChapterMeta[] = guide.chapters.map(collectChapterMeta);

  return (
    <div className="mx-auto w-full max-w-[var(--page-max)] px-5 py-10 sm:px-8 lg:py-14">
      <p className="font-sans text-[11px] font-bold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
        Your progress
      </p>
      <h1 className="mt-2 font-sans text-[30px] font-bold tracking-tight text-balance text-[var(--g-ink)] sm:text-[36px]">
        How far you have come
      </h1>
      <p className="mt-3 max-w-[var(--measure)] font-sans text-[15px] leading-relaxed text-[var(--g-ink2)]">
        Everything below is kept in this browser only. Work through a chapter,
        answer a quiz, tick an exercise — the numbers update as you go, and the
        dashboard always points at the next thing to read.
      </p>

      <div className="mt-8">
        <ProgressDashboard chapters={chapters} />
      </div>

      <nav
        aria-label="Keep going"
        className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--g-line)] pt-6 font-sans text-[13.5px] font-semibold"
      >
        <Link
          href="/chapters/roadmap"
          className="inline-flex items-center gap-1.5 text-[var(--g-accent)] hover:underline hover:underline-offset-2"
        >
          See the whole roadmap
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
        <Link
          href="/search"
          className="inline-flex items-center gap-1.5 text-[var(--g-ink2)] hover:text-[var(--g-accent)]"
        >
          Search the guide
        </Link>
      </nav>
    </div>
  );
}
