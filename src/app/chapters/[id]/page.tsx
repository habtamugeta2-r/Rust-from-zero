import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { ChapterActions } from "@/components/ChapterActions";
import { BlockList } from "@/components/ChapterBody";
import { ChapterRail } from "@/components/ChapterRail";
import { InlineRenderer } from "@/components/InlineRenderer";
import { loadChapter, loadGuide } from "@/lib/guide-parser";
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

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const chapter = loadChapter(id);
  if (!chapter) notFound();

  const { prev, next } = chapter;

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
    <div className="mx-auto flex max-w-[78rem] flex-col px-5 py-8 sm:px-8 lg:py-12 xl:flex-row xl:justify-center xl:gap-10 2xl:gap-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(chapterJsonLd(chapter)).replace(/</g, "\\u003c"),
        }}
      />
      <article className="mx-auto min-w-0 w-full max-w-3xl xl:mx-0 xl:max-w-none xl:flex-[0_1_54rem]">
        {/* Breadcrumb (visible + mirrors the BreadcrumbList schema) */}
        <nav
          aria-label="Breadcrumb"
          className="mb-5 font-sans text-xs text-[var(--g-ink3)]"
        >
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <li>
              <Link href="/" className="hover:text-[var(--g-accent)]">
                Learn Rust
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate">{chapter.partTitle}</li>
            <li aria-hidden="true">/</li>
            <li className="truncate text-[var(--g-ink2)]" aria-current="page">
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
            <span className="text-[var(--g-ink3)]">{chapter.partTitle}</span>
            {chapter.time > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--g-ink3)]">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                ~{chapter.time} min
              </span>
            )}
          </div>

          <h1 className="mt-3.5 font-sans text-[32px] leading-[1.15] font-bold tracking-[-0.02em] text-[var(--g-ink)] sm:text-[38px]">
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

        {/* Table of contents: a collapsed panel below xl, a sticky rail above it */}
        <ChapterRail headings={chapter.headings} />

        {/* Body */}
        <div className="guide-prose">
          <BlockList blocks={chapter.blocks} />
        </div>

        {/* Completion action */}
        <ChapterActions
          chapterId={chapter.id}
          trackDone={chapter.kind !== "appendix"}
        />

        {/* Prev / Next Navigation */}
        <nav
          aria-label="Chapter pagination"
          className="no-print mt-10 grid gap-3 border-t border-[var(--g-line)] pt-6 font-sans sm:grid-cols-2"
        >
          {prev ? (
            <Link
              href={`/chapters/${prev.id}`}
              className="group flex items-center gap-3 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 shadow-card transition-colors hover:border-[var(--g-accent)]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:-translate-x-0.5 group-hover:text-[var(--g-accent)]" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--g-ink3)]">
                  Previous
                </div>
                <div className="truncate text-sm font-bold text-[var(--g-ink)]">
                  {prev.num} · {prev.short}
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/"
              className="group flex items-center gap-3 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 shadow-card transition-colors hover:border-[var(--g-accent)]"
            >
              <ArrowLeft className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:-translate-x-0.5 group-hover:text-[var(--g-accent)]" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--g-ink3)]">
                  Overview
                </div>
                <div className="truncate text-sm font-bold text-[var(--g-ink)]">
                  Home &amp; learning path
                </div>
              </div>
            </Link>
          )}

          {next ? (
            <Link
              href={`/chapters/${next.id}`}
              className="group flex items-center justify-end gap-3 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 text-right transition-colors hover:border-[var(--g-accent)]"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--g-ink3)]">
                  Next
                </div>
                <div className="truncate text-sm font-bold text-[var(--g-ink)]">
                  {next.num} · {next.short}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--g-accent)]" />
            </Link>
          ) : (
            <Link
              href="/"
              className="group flex items-center justify-end gap-3 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 text-right transition-colors hover:border-[var(--g-accent)]"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--g-ink3)]">
                  Finish
                </div>
                <div className="truncate text-sm font-bold text-[var(--g-ink)]">
                  Back to Home
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--g-accent)]" />
            </Link>
          )}
        </nav>
      </article>
    </div>
  );
}
