import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CornerDownLeft, Search as SearchIcon } from "lucide-react";
import {
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  SUGGESTED_QUERIES,
  groupHitsByChapter,
  searchGuide,
} from "@/lib/search";
import { loadGuide } from "@/lib/guide-parser";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search every chapter, section and code listing in Rust from Zero.",
  // A results page is useful to a reader and noise to a crawler.
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (raw ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const hits = query.length >= MIN_QUERY_LENGTH ? searchGuide(query, { limit: 60 }) : [];
  const groups = groupHitsByChapter(hits);
  const chapterCount = groups.length;
  const guide = loadGuide();

  return (
    <div className="mx-auto w-full max-w-[var(--page-max)] px-5 py-10 sm:px-8 lg:py-14">
      <p className="font-sans text-[11px] font-bold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
        Search
      </p>
      <h1 className="mt-2 font-sans text-[30px] font-bold tracking-tight text-balance text-[var(--g-ink)] sm:text-[36px]">
        Find anything in the guide
      </h1>
      <p className="mt-2 max-w-2xl font-sans text-[15px] leading-relaxed text-pretty text-[var(--g-ink2)]">
        Every heading, paragraph and explanation is indexed across{" "}
        {guide.stats.trackedChapters} chapters — {guide.searchIndex.length}{" "}
        entries in total.
      </p>

      <form
        action="/search"
        method="get"
        role="search"
        className="mt-6 flex max-w-2xl items-center gap-2"
      >
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">Search the guide</span>
          <SearchIcon
            className="pointer-events-none absolute left-3.5 h-4 w-4 text-[var(--g-ink3)]"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            autoComplete="off"
            spellCheck={false}
            placeholder="ownership, epoll, lifetimes…"
            className="h-11 w-full rounded-well border border-[var(--g-line)] bg-[var(--g-surface)] pr-11 pl-10 font-sans text-[15px] text-[var(--g-ink)] shadow-card placeholder:text-[var(--g-ink3)] focus:border-[var(--g-accent)] focus:outline-none"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-3 hidden rounded border border-[var(--g-line)] bg-[var(--g-sunken)] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--g-ink3)] sm:inline"
          >
            ↵
          </kbd>
        </label>
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-well bg-[var(--g-accent)] px-4 font-sans text-sm font-bold text-white shadow-card transition-colors hover:bg-[var(--g-accent-hover)]"
        >
          Search
        </button>
      </form>

      {query.length >= 2 ? (
        <section aria-label="Search results" className="mt-8">
          <p aria-live="polite" className="font-sans text-sm text-[var(--g-ink2)]">
            {hits.length === 0 ? (
              <>
                No section matched <strong className="text-[var(--g-ink)]">“{query}”</strong>.
                Try one shorter word, or browse the{" "}
                <Link
                  href="/chapters/glossary"
                  className="font-semibold text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-2"
                >
                  glossary
                </Link>
                .
              </>
            ) : (
              <>
                <strong className="font-semibold text-[var(--g-ink)]">
                  {hits.length}
                </strong>{" "}
                {hits.length === 1 ? "result" : "results"} in {chapterCount}{" "}
                {chapterCount === 1 ? "chapter" : "chapters"} for{" "}
                <strong className="font-semibold text-[var(--g-ink)]">
                  “{query}”
                </strong>
              </>
            )}
          </p>

          {groups.length > 0 && (
            <ol className="mt-5 space-y-4">
              {groups.map((group) => (
                <li
                  key={group.chapterId}
                  className="overflow-hidden rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card"
                >
                  <div className="flex items-center gap-2 border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-2.5 font-sans">
                    <span className="font-mono text-[11px] font-bold text-[var(--g-ink3)]">
                      {group.num}
                    </span>
                    <Link
                      href={`/chapters/${group.chapterId}`}
                      className="min-w-0 truncate text-[13.5px] font-bold text-[var(--g-ink)] hover:text-[var(--g-accent)]"
                    >
                      {group.chapterTitle}
                    </Link>
                    <span className="ml-auto shrink-0 text-[11px] font-medium text-[var(--g-ink3)]">
                      {group.hits.length}{" "}
                      {group.hits.length === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  <ul className="divide-y divide-[var(--g-line)]">
                    {group.hits.map((hit, index) => (
                      <li key={`${hit.anchor}-${index}`}>
                        <Link
                          href={`/chapters/${hit.chapterId}${
                            hit.anchor ? `#${hit.anchor}` : ""
                          }`}
                          className="group flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--g-bg)]/70"
                        >
                          <CornerDownLeft
                            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--g-line2)] transition-colors group-hover:text-[var(--g-accent)]"
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            {hit.heading && (
                              <span className="block font-sans text-[13px] font-semibold text-[var(--g-ink)]">
                                {hit.heading}
                              </span>
                            )}
                            <span className="mt-0.5 block text-[14px] leading-relaxed text-[var(--g-ink3)]">
                              {hit.before}
                              {hit.match && (
                                <mark className="rounded bg-amber-300/60 px-0.5 text-[#33291c] dark:bg-amber-500/30 dark:text-amber-100">
                                  {hit.match}
                                </mark>
                              )}
                              {hit.after}
                            </span>
                          </span>
                          <ArrowRight
                            className="mt-1 ml-auto hidden h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:translate-x-0.5 sm:block"
                            aria-hidden="true"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <section aria-label="Suggested searches" className="mt-8">
          <h2 className="font-sans text-[13px] font-bold tracking-[0.08em] text-[var(--g-ink3)] uppercase">
            Try one of these
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTED_QUERIES.map((term) => (
              <Link
                key={term}
                href={`/search?q=${encodeURIComponent(term)}`}
                className="rounded-full border border-[var(--g-line2)] bg-[var(--g-surface)] px-3.5 py-1.5 font-sans text-[13px] font-semibold text-[var(--g-ink2)] shadow-card transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
              >
                {term}
              </Link>
            ))}
          </div>
          <p className="mt-6 font-sans text-sm text-[var(--g-ink3)]">
            The whole outline is also browsable from the{" "}
            <Link
              href="/chapters/roadmap"
              className="font-semibold text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-2"
            >
              learning roadmap
            </Link>
            .
          </p>
        </section>
      )}
    </div>
  );
}
