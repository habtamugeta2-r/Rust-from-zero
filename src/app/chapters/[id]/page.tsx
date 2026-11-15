import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Flag } from "lucide-react";
import { ChapterActions } from "@/components/ChapterActions";
import { ChapterBookmark } from "@/components/ChapterBookmark";
import { BlockList } from "@/components/ChapterBody";
import { ChapterRail, ChapterTocTrigger } from "@/components/ChapterRail";
import { InlineRenderer } from "@/components/InlineRenderer";
import { hasTableOfContents } from "@/lib/headings";
import { loadChapter, loadGuide } from "@/lib/guide-parser";
import type { ChapterSummary } from "@/lib/guide-types";
import { chapterJsonLd, chapterMetadata } from "@/lib/seo";

export function generateStaticParams() {
  const guide = loadGuide();
  return guide.summaries.map((c) => ({ id: c.id }));
}

// Every chapter is prerendered at build time; anything else is a hard 404.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ch = loadChapter(id);
  if (!ch) {
    return { title: "Chapter not found" };
  }
  return chapterMetadata(ch);
}

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chapter = loadChapter(id);
  if (!chapter) notFound();

  const { prev, next } = chapter;
  const showRail = hasTableOfContents(chapter.headings);

  const eyebrow =
    chapter.kind === "project"
      ? `Project · Chapter ${chapter.num}`
      : chapter.kind === "appendix"
        ? `Appendix ${chapter.num}`
        : chapter.id === "roadmap"
          ? "Curriculum map"
          : chapter.num === "0"
            ? "Before you start"
            : `Chapter ${chapter.num}`;

  return (
    <div className="chapter-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(chapterJsonLd(chapter)).replace(/</g, "\\u003c"),
        }}
      />

      <div className="chapter-layout" data-rail={showRail ? "on" : "off"}>
        <article className="chapter-article">
          {/* Breadcrumb (visible + mirrors the BreadcrumbList schema) */}
          <nav aria-label="Breadcrumb" className="mb-5 font-sans text-xs text-[var(--g-ink3)]">
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <li>
                <Link href="/" className="hover:text-[var(--g-accent)]">
                  Learn Rust
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="max-w-full truncate">{chapter.partTitle}</li>
              <li aria-hidden="true">/</li>
              <li className="max-w-full truncate text-[var(--g-ink2)]" aria-current="page">
                {chapter.short}
              </li>
            </ol>
          </nav>

          {/* Chapter header */}
          <header className="mb-9 border-b border-[var(--g-line)] pb-7">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-sans text-xs font-semibold">
              <span className="rounded-full bg-[var(--g-accent-soft)] px-3 py-1 text-[11px] font-bold tracking-wide text-[var(--g-accent)]">
                {eyebrow}
              </span>
              <span className="hidden text-[var(--g-ink3)] sm:inline">{chapter.partTitle}</span>
              <ChapterTocTrigger headings={chapter.headings} />
              <ChapterBookmark chapterId={chapter.id} title={chapter.title} />
              {chapter.time > 0 && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--g-ink3)]">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />~{chapter.time} min
                </span>
              )}
            </div>

            <h1 className="mt-3.5 font-sans text-[30px] leading-[1.14] font-bold tracking-[-0.02em] text-balance text-[var(--g-ink)] sm:text-[38px]">
              {chapter.title}
            </h1>

            {chapter.learnNodes.length > 0 && (
              <div className="mt-6 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-5 font-sans shadow-card">
                <div className="mb-3 text-[11px] font-bold tracking-[0.08em] text-[var(--g-ink3)] uppercase">
                  In this chapter you will learn
                </div>
                <ul className="grid gap-x-6 gap-y-2 text-sm leading-relaxed text-[var(--g-ink2)] sm:grid-cols-2">
                  {chapter.learnNodes.map((nodes, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--g-accent)]"
                        aria-hidden="true"
                      />
                      <span>
                        <InlineRenderer nodes={nodes} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </header>

          {/* Body */}
          <div className="guide-prose min-w-0">
            <BlockList blocks={chapter.blocks} />
          </div>

          {/* Completion action */}
          <ChapterActions
            chapterId={chapter.id}
            chapterTitle={chapter.title}
            trackDone={chapter.kind !== "appendix"}
          />

          {/* Prev / next */}
          <nav
            aria-label="Chapter pagination"
            className="no-print mt-10 grid gap-3 border-t border-[var(--g-line)] pt-6 font-sans sm:grid-cols-2"
          >
            {prev ? (
              <ChapterStepLink direction="previous" href={`/chapters/${prev.id}`} chapter={prev} />
            ) : (
              <ChapterStepLink
                direction="previous"
                href="/"
                label="Overview"
                title="Home & learning path"
              />
            )}

            {next ? (
              <ChapterStepLink direction="next" href={`/chapters/${next.id}`} chapter={next} />
            ) : (
              <ChapterStepLink direction="next" href="/" label="Finish" title="Back to home" />
            )}
          </nav>
        </article>

        {showRail && (
          <aside className="chapter-aside no-print" aria-label="On this page">
            <ChapterRail headings={chapter.headings} />
          </aside>
        )}
      </div>
    </div>
  );
}

/** An `@learn` objective as plain text for the next-chapter card. */
function plainObjective(markdown: string): string {
  return markdown
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();
}

function ChapterStepLink({
  direction,
  href,
  chapter,
  label,
  title,
}: {
  direction: "previous" | "next";
  href: string;
  chapter?: ChapterSummary;
  label?: string;
  title?: string;
}) {
  const isNext = direction === "next";
  const heading = label ?? (isNext ? "Next" : "Previous");
  const name = title ?? (chapter ? `${chapter.num} · ${chapter.short}` : "");

  return (
    <Link
      href={href}
      rel={isNext ? "next" : "prev"}
      className={`group flex items-center gap-3 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 shadow-card transition-colors hover:border-[var(--g-accent)] ${
        isNext ? "justify-end text-right" : ""
      }`}
    >
      {!isNext && (
        <ArrowLeft
          className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:-translate-x-0.5 group-hover:text-[var(--g-accent)]"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--g-ink3)] uppercase">
          {chapter?.kind === "project" && (
            <Flag className="h-3 w-3 text-[var(--g-accent)]" aria-hidden="true" />
          )}
          {heading}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm font-bold text-[var(--g-ink)]">{name}</div>
        {chapter && chapter.time > 0 && (
          <div className="mt-0.5 text-[11.5px] font-medium text-[var(--g-ink3)]">
            ~{chapter.time} min
          </div>
        )}
        {isNext && chapter?.learn?.[0] && (
          <div className="mt-1 line-clamp-2 text-[11.5px] leading-snug font-medium text-[var(--g-ink2)]">
            You will learn: {plainObjective(chapter.learn[0])}
          </div>
        )}
      </div>
      {isNext && (
        <ArrowRight
          className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--g-accent)]"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
