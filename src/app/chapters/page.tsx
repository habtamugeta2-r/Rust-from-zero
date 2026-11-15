import React from "react";
import type { Metadata } from "next";
import { loadGuide } from "@/lib/guide-parser";
import { collectChapterMeta, type ChapterMeta } from "@/lib/progress";
import { ChaptersIndex } from "@/components/ChaptersIndex";

export const metadata: Metadata = {
  title: "Chapters",
  description:
    "Every chapter and appendix in the guide, grouped by part, with reading time, level and your completion state.",
  alternates: { canonical: "/chapters" },
};

/**
 * The index a reader reaches by typing `/chapters`: the whole curriculum on
 * one page, grouped by part. Chapter shapes are computed at build time; the
 * completion badges come from the reader's saved state in the browser.
 */
export default function ChaptersPage() {
  const guide = loadGuide();
  const chapters: ChapterMeta[] = guide.chapters.map(collectChapterMeta);

  return (
    <div className="mx-auto w-full max-w-[var(--page-max)] px-5 py-10 sm:px-8 lg:py-14">
      <p className="font-sans text-[11px] font-bold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
        Chapter index
      </p>
      <h1 className="mt-2 font-sans text-[30px] font-bold tracking-tight text-balance text-[var(--g-ink)] sm:text-[36px]">
        Chapters
      </h1>
      <p className="mt-3 max-w-[var(--measure)] font-sans text-[15px] leading-relaxed text-[var(--g-ink2)]">
        {guide.stats.totalChapters} chapters and appendices in reading order, grouped by part. Each
        entry shows its kind, level and declared reading time; the badge on the right is your own
        state, kept in this browser.
      </p>
      <div className="mt-8">
        <ChaptersIndex chapters={chapters} />
      </div>
    </div>
  );
}
