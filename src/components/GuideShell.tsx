"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Menu,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import type { ChapterSummary, PartMeta, SearchHit } from "@/lib/guide-types";
import { useGuideState } from "./GuideStateProvider";

export function GuideShell({
  parts,
  chapters,
  children,
}: {
  parts: PartMeta[];
  chapters: ChapterSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const {
    state,
    persistent,
    resetAllProgress,
    toggleTheme,
    theme,
    stepFontSize,
  } = useGuideState();

  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [collapsedParts, setCollapsedParts] = useState<Record<string, boolean>>(
    {}
  );
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  const searchRef = useRef<HTMLInputElement>(null);
  const activeChapterId = pathname.startsWith("/chapters/")
    ? pathname.slice("/chapters/".length)
    : null;
  const activeChapter = activeChapterId
    ? chapters.find((c) => c.id === activeChapterId) ?? null
    : null;

  const tracked = useMemo(
    () => chapters.filter((c) => c.kind !== "appendix"),
    [chapters]
  );
  const doneCount = useMemo(
    () => tracked.filter((c) => Boolean(state.done[c.id])).length,
    [tracked, state.done]
  );
  const donePct = tracked.length
    ? Math.round((100 * doneCount) / tracked.length)
    : 0;

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Reading progress bar
  useEffect(() => {
    const onScroll = () => {
      if (!activeChapter) {
        setScrollPct(0);
        return;
      }
      const max =
        document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(max > 0 ? Math.min(100, (100 * window.scrollY) / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [activeChapter, pathname]);

  // `/` focuses search; `Escape` closes drawer / clears search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (e.key === "Escape") {
        setMobileDrawerOpen(false);
        if (query) {
          setQuery("");
          setHits(null);
        }
        return;
      }
      if (
        e.key === "/" &&
        tag !== "INPUT" &&
        tag !== "TEXTAREA" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        if (window.innerWidth < 1024) setMobileDrawerOpen(true);
        setTimeout(() => searchRef.current?.focus(), 20);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [query]);

  // Debounced search fetch from /api/search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const togglePart = (key: string) => {
    setCollapsedParts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className={`min-h-screen bg-[var(--g-bg)] text-[var(--g-ink)] lg:grid ${
        desktopSidebarOpen
          ? "lg:grid-cols-[300px_minmax(0,1fr)]"
          : "lg:grid-cols-[minmax(0,1fr)]"
      }`}
    >
      {/* Mobile scrim */}
      {mobileDrawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileDrawerOpen(false)}
          className="no-print fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar"
        aria-label="Guide navigation"
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-[min(88vw,310px)] flex-col border-r border-[var(--g-line)] bg-[var(--g-sunken)] font-sans transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0 ${
          mobileDrawerOpen ? "translate-x-0 shadow-drawer" : "-translate-x-full"
        } ${desktopSidebarOpen ? "" : "lg:hidden"}`}
      >
        <div className="relative flex items-center gap-3 px-4 pt-4 pb-3.5">
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-[var(--g-ink)]"
          >
            <svg
              className="h-8 w-8 shrink-0 text-[var(--g-accent)]"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <circle
                cx="16"
                cy="16"
                r="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeDasharray="4.32 4.32"
              />
              <circle
                cx="16"
                cy="16"
                r="8.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
              />
              <path
                d="M11.5 16.2l3.2 3.2 5.8-6.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="truncate">
              <strong className="block text-[15px] font-bold tracking-tight">
                Rust from Zero
              </strong>
              <small className="block text-xs text-[var(--g-ink3)]">
                The complete hands-on guide
              </small>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            aria-label="Close navigation"
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--g-ink2)] hover:bg-[var(--g-line)]/60 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <label className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--g-ink3)]"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the whole guide"
              aria-label="Search the whole guide"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] pr-8 pl-9 text-[13px] text-[var(--g-ink)] shadow-card placeholder:text-[var(--g-ink3)] focus:border-[var(--g-accent)] focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2.5 hidden rounded-md border border-[var(--g-line)] bg-[var(--g-sunken)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--g-ink3)] sm:inline-block">
              /
            </kbd>
          </label>
        </div>

        {/* Progress */}
        <div className="border-b border-[var(--g-line)] px-4 pb-3.5">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-[var(--g-ink2)]">
              {doneCount} of {tracked.length} complete
            </span>
            <strong className="font-bold tabular-nums text-[var(--g-ink)]">
              {donePct}%
            </strong>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--g-line)]">
            <div
              className="h-full rounded-full bg-[var(--g-accent)] transition-all duration-300"
              style={{ width: `${donePct}%` }}
            />
          </div>
        </div>

        {/* Search results OR Table of Contents */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {hits !== null ? (
            <div className="space-y-1">
              {searching && (
                <p className="px-2 py-2 text-xs text-[var(--g-ink3)]">
                  Searching…
                </p>
              )}
              {!searching && hits.length === 0 && (
                <p className="px-2 py-3 text-xs leading-relaxed text-[var(--g-ink3)]">
                  Nothing found for “{query}”. Try a single, shorter word — or
                  look in the glossary.
                </p>
              )}
              {hits.map((h, i) => (
                <Link
                  key={`${h.chapterId}-${h.anchor}-${i}`}
                  href={`/chapters/${h.chapterId}${h.anchor ? `#${h.anchor}` : ""}`}
                  onClick={() => {
                    setQuery("");
                    setHits(null);
                  }}
                  className="block rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--g-surface)]"
                >
                  <div className="text-[11px] font-bold text-[var(--g-accent)]">
                    {h.num} · {h.chapterTitle}
                  </div>
                  {h.heading && (
                    <div className="truncate text-xs font-semibold text-[var(--g-ink)]">
                      {h.heading}
                    </div>
                  )}
                  <div className="mt-0.5 line-clamp-2 text-[11.5px] text-[var(--g-ink2)]">
                    {h.before}
                    {h.match && (
                      <mark className="rounded bg-amber-300/60 px-0.5 text-[#33291c] dark:bg-amber-500/30 dark:text-amber-100">
                        {h.match}
                      </mark>
                    )}
                    {h.after}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <nav aria-label="Table of contents" className="space-y-1">
              {parts.map((part) => {
                const list = chapters.filter((c) => c.part === part.key);
                if (list.length === 0) return null;
                const isCollapsed = Boolean(collapsedParts[part.key]);
                const pDone = list.filter((c) => Boolean(state.done[c.id])).length;

                return (
                  <div key={part.key}>
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => togglePart(part.key)}
                      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-[var(--g-ink2)] hover:bg-[var(--g-line)]/40 hover:text-[var(--g-ink)]"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {part.partLabel && (
                          <span className="mr-1.5 text-[10.5px] uppercase tracking-wider text-[var(--g-ink3)]">
                            {part.partLabel}
                          </span>
                        )}
                        {part.title}
                      </span>
                      {part.key !== "app" && (
                        <span className="text-[11px] font-medium text-[var(--g-ink3)]">
                          {pDone}/{list.length}
                        </span>
                      )}
                    </button>

                    {!isCollapsed && (
                      <ol className="mt-0.5 space-y-0.5 pb-1.5 pl-3">
                        {list.map((c) => {
                          const isActive = c.id === activeChapterId;
                          const isDone = Boolean(state.done[c.id]);
                          return (
                            <li key={c.id}>
                              <Link
                                href={`/chapters/${c.id}`}
                                aria-current={isActive ? "page" : undefined}
                                className={`relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-snug transition-colors ${
                                  isActive
                                    ? "bg-[var(--g-accent-soft)] font-semibold text-[var(--g-accent)] before:absolute before:-left-[7px] before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-[var(--g-accent)]"
                                    : "text-[var(--g-ink2)] hover:bg-[var(--g-surface)] hover:text-[var(--g-ink)]"
                                }`}
                              >
                                <span className="min-w-[1.6rem] shrink-0 font-mono text-[11px] tabular-nums text-[var(--g-ink3)]">
                                  {c.num}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                  {c.short}
                                </span>
                                {c.kind === "project" && (
                                  <Flag
                                    className="h-3 w-3 shrink-0 text-[var(--g-accent)]"
                                    aria-hidden="true"
                                  />
                                )}
                                {isDone && (
                                  <Check
                                    className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                    aria-hidden="true"
                                  />
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                );
              })}
            </nav>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[var(--g-line)] px-4 py-2.5 text-[11.5px] text-[var(--g-ink3)]">
          <span>
            {persistent ? "Saved in browser" : "Session-only progress"}
          </span>
          <button
            type="button"
            onClick={resetAllProgress}
            className="font-semibold text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
          >
            Reset progress
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-[var(--g-line)] bg-[var(--g-bg)]/90 px-4 backdrop-blur-md">
          <button
            type="button"
            aria-label="Toggle navigation"
            title="Toggle navigation"
            onClick={() => {
              if (window.innerWidth < 1024) {
                setMobileDrawerOpen((o) => !o);
              } else {
                setDesktopSidebarOpen((o) => !o);
              }
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--g-ink2)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1 truncate font-sans text-xs sm:text-[13px]">
            {activeChapter ? (
              <span className="flex items-center gap-1.5 truncate text-[var(--g-ink3)]">
                <span className="hidden truncate sm:inline">
                  {activeChapter.partTitle}
                </span>
                <span className="hidden shrink-0 sm:inline" aria-hidden="true">
                  ›
                </span>
                <strong className="truncate font-semibold text-[var(--g-ink)]">
                  {activeChapter.kind === "appendix"
                    ? `Appendix ${activeChapter.num} · `
                    : activeChapter.num !== "0"
                      ? `${activeChapter.num} · `
                      : ""}
                  {activeChapter.title}
                </strong>
              </span>
            ) : (
              <span className="text-[var(--g-ink2)]">
                <strong className="font-bold text-[var(--g-ink)]">
                  Rust from Zero
                </strong>{" "}
                <span className="hidden sm:inline">
                  · the complete hands-on guide
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 font-sans">
            <div
              className="flex items-center overflow-hidden rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card"
              role="group"
              aria-label="Text size"
            >
              <button
                type="button"
                onClick={() => stepFontSize(-1)}
                aria-label="Smaller text"
                title="Smaller text"
                className="grid h-8 w-8 place-items-center text-[11px] font-bold text-[var(--g-ink2)] transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
              >
                A−
              </button>
              <div
                className="h-5 w-px bg-[var(--g-line)]"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => stepFontSize(1)}
                aria-label="Larger text"
                title="Larger text"
                className="grid h-8 w-8 place-items-center text-[13px] font-bold text-[var(--g-ink2)] transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
              >
                A+
              </button>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Switch between light and dark theme"
              title="Switch theme"
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] text-[var(--g-ink2)] shadow-card transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
          </div>

          <div
            aria-hidden="true"
            className="absolute right-0 bottom-0 left-0 h-0.5 bg-transparent"
          >
            <div
              className="h-full rounded-r-full bg-[var(--g-accent)] transition-[width] duration-75"
              style={{ width: `${scrollPct}%` }}
            />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
