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
    <div className="guide-index-page mx-auto w-full max-w-[var(--page-max)] px-5 py-10 sm:px-8 lg:py-14">
      <header className="guide-page-intro">
        <p className="guide-page-eyebrow">
          THE CURRICULUM <span> / </span> YOUR LEARNING LIBRARY
        </p>
        <h1>
          Find your next <em>chapter.</em>
        </h1>
        <p>
          Explore {guide.stats.totalChapters} chapters and appendices, from the fundamentals to
          real-world Rust. Follow the sequence or jump into a topic that interests you.
        </p>
      </header>
      <div className="mt-8">
        <ChaptersIndex chapters={chapters} />
      </div>
    </div>
  );
}
