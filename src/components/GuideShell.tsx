"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Monitor, Moon, Search, Sun, X } from "lucide-react";
import type { ChapterSummary, PartMeta, SearchHit } from "@/lib/guide-types";
import { themeHint, themeLabel } from "@/lib/theme";
import { CommandPalette } from "./CommandPalette";
import { ContentTree } from "./ContentTree";
import { useGuideState } from "./GuideStateProvider";

const SIDEBAR_KEY = "rust-guide-sidebar";

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
  const router = useRouter();
  const { state, persistent, resetAllProgress, cycleTheme, themeMode, stepFontSize } =
    useGuideState();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeHit, setActiveHit] = useState(-1);
  const [confirmReset, setConfirmReset] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const activeChapterId = pathname.startsWith("/chapters/")
    ? pathname.slice("/chapters/".length)
    : null;
  const activeChapter = activeChapterId
    ? (chapters.find((c) => c.id === activeChapterId) ?? null)
    : null;

  const tracked = useMemo(() => chapters.filter((c) => c.kind !== "appendix"), [chapters]);
  const doneCount = useMemo(
    () => tracked.filter((c) => Boolean(state.done[c.id])).length,
    [tracked, state.done],
  );
  const donePct = tracked.length ? Math.round((100 * doneCount) / tracked.length) : 0;

  /* ---------------- environment + persisted chrome state ---------------- */

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_KEY);
      if (stored === "closed") setSidebarOpen(false);
    } catch {
      /* private mode: keep the default */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "open" : "closed");
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  /* ---------------- mobile drawer: scroll lock, focus trap ---------------- */

  useEffect(() => {
    if (!drawerOpen) return;

    const body = document.body;
    const prevOverflow = body.style.overflow;
    // `scrollbar-gutter: stable` on <html> keeps the scrollbar's space
    // reserved, so locking the page cannot make the layout jump.
    body.style.overflow = "hidden";

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = drawerRef.current;

    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    // Focus the first link rather than the search field, so opening the menu on
    // a phone does not summon the on-screen keyboard. Search lives in the
    // command palette now, which manages its own focus.
    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = prevOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [drawerOpen]);

  // Close the drawer when the viewport becomes a desktop layout.
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  // Route change: close the drawer and drop any transient search state.
  useEffect(() => {
    setDrawerOpen(false);
    setQuery("");
    setHits(null);
    setActiveHit(-1);
  }, [pathname]);

  /* ---------------- keyboard shortcuts ---------------- */

  const openPalette = useCallback(() => {
    setDrawerOpen(false);
    setPaletteOpen(true);
  }, []);

  // Any page can summon search (the home page has a Search button).
  useEffect(() => {
    const onRequest = () => openPalette();
    window.addEventListener("rust-guide:search", onRequest);
    return () => window.removeEventListener("rust-guide:search", onRequest);
  }, [openPalette]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "Escape") {
        setDrawerOpen(false);
        setPaletteOpen(false);
        if (query || hits) {
          setQuery("");
          setHits(null);
          setActiveHit(-1);
        }
        return;
      }

      if (typing) return;

      const isSlash = event.key === "/";
      const isCmdK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (isSlash || isCmdK) {
        event.preventDefault();
        openPalette();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [query, hits, openPalette]);

  /* ---------------- search ---------------- */

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      setSearching(false);
      setActiveHit(-1);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        setHits(data.hits);
        setActiveHit(-1);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!hits || hits.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveHit((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveHit((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (event.key === "Enter" && activeHit >= 0) {
      event.preventDefault();
      const hit = hits[activeHit];
      router.push(`/chapters/${hit.chapterId}${hit.anchor ? `#${hit.anchor}` : ""}`);
    }
  };

  const toggleNavigation = () => {
    if (isDesktop) setSidebarOpen((open) => !open);
    else setDrawerOpen((open) => !open);
  };

  const navExpanded = isDesktop ? sidebarOpen : drawerOpen;

  return (
    <div className="app-shell" data-sidebar={sidebarOpen ? "open" : "closed"}>
      {/* Mobile scrim */}
      {drawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
          className="app-scrim no-print fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
        />
      )}

      {/*
        Sidebar / mobile drawer.
        When it is off-screen on a phone, `inert` keeps it out of the tab order
        without hiding focusable content the way `aria-hidden` would; when it is
        open it becomes a modal dialog with a trapped focus ring.
      */}
      <aside
        ref={drawerRef}
        id="sidebar"
        aria-label="Guide navigation"
        inert={!isDesktop && !drawerOpen ? true : undefined}
        role={!isDesktop && drawerOpen ? "dialog" : undefined}
        aria-modal={!isDesktop && drawerOpen ? true : undefined}
        className={`app-sidebar no-print fixed inset-y-0 left-0 z-50 flex w-[min(88vw,19rem)] flex-col border-r border-[var(--g-line)] bg-[var(--g-sunken)] font-sans transition-transform duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-dvh lg:w-auto lg:translate-x-0 lg:shadow-none ${
          drawerOpen ? "translate-x-0 shadow-drawer" : "-translate-x-full"
        } ${sidebarOpen ? "" : "lg:hidden"}`}
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5 text-[var(--g-ink)]">
            <RustMark />
            <span className="truncate">
              <strong className="block text-[15px] font-bold tracking-tight">Rust from Zero</strong>
              <small className="block text-xs text-[var(--g-ink3)]">
                The complete hands-on guide
              </small>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-[var(--g-ink2)] hover:bg-[var(--g-line)]/60 lg:hidden"
          >
            <X className="h-4 w-4" aria-hidden="true" />
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
              onKeyDown={onSearchKeyDown}
              placeholder="Search the whole guide"
              aria-label="Search the whole guide"
              title="Search the whole guide (press / or Ctrl-K)"
              role="combobox"
              aria-expanded={hits !== null}
              aria-controls="search-results"
              aria-activedescendant={activeHit >= 0 ? `search-hit-${activeHit}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] pr-14 pl-9 text-[13px] text-[var(--g-ink)] shadow-card placeholder:text-[var(--g-ink3)] focus:border-[var(--g-accent)] focus:outline-none"
            />
            <kbd
              aria-hidden="true"
              title="Press / or Ctrl-K"
              className="pointer-events-none absolute right-2.5 hidden rounded-md border border-[var(--g-line)] bg-[var(--g-sunken)] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[var(--g-ink3)] sm:inline-block"
            >
              /
            </kbd>
          </label>
        </div>

        {/* Progress */}
        <div className="border-b border-[var(--g-line)] px-4 pb-3.5">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <Link
              href="/progress"
              title="Open your progress dashboard"
              className="rounded font-medium text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
            >
              {doneCount} of {tracked.length} complete
            </Link>
            <Link
              href="/progress"
              tabIndex={-1}
              aria-hidden="true"
              className="font-bold tabular-nums text-[var(--g-ink)] hover:text-[var(--g-accent)]"
            >
              {donePct}%
            </Link>
          </div>
          <div
            role="progressbar"
            aria-label="Course progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={donePct}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--g-line)]"
          >
            <div
              className="h-full rounded-full bg-[var(--g-accent)] transition-[width] duration-300"
              style={{ width: `${donePct}%` }}
            />
          </div>
        </div>

        {/* Search results OR table of contents */}
        <div
          id="search-results"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
          data-scroll-pane
          tabIndex={-1}
        >
          {hits !== null ? (
            <div className="space-y-1" role="listbox" aria-label="Search results">
              {searching && <p className="px-2 py-2 text-xs text-[var(--g-ink3)]">Searching…</p>}
              {!searching && hits.length === 0 && (
                <p className="px-2 py-3 text-xs leading-relaxed text-[var(--g-ink3)]">
                  Nothing found for “{query}”. Try a single, shorter word — or look in the glossary.
                </p>
              )}
              {!searching && hits.length > 0 && (
                <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-[var(--g-ink3)] uppercase">
                  {hits.length} {hits.length === 1 ? "match" : "matches"} · ↑↓ to move, Enter to
                  open
                </p>
              )}
              {hits.map((hit, index) => (
                <Link
                  key={`${hit.chapterId}-${hit.anchor}-${index}`}
                  id={`search-hit-${index}`}
                  role="option"
                  aria-selected={index === activeHit}
                  href={`/chapters/${hit.chapterId}${hit.anchor ? `#${hit.anchor}` : ""}`}
                  onMouseEnter={() => setActiveHit(index)}
                  className={`block scroll-mt-2 rounded-lg px-2 py-1.5 transition-colors ${
                    index === activeHit
                      ? "bg-[var(--g-accent-soft)] text-[var(--g-ink)]"
                      : "hover:bg-[var(--g-surface)]"
                  }`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="shrink-0 font-mono text-[11px] text-[var(--g-ink3)]">
                      {hit.num}
                    </span>
                    <span className="min-w-0 truncate text-[12px] font-bold text-[var(--g-ink)]">
                      {hit.chapterTitle}
                    </span>
                  </div>
                  {hit.heading && (
                    <div className="truncate text-[11px] font-medium text-[var(--g-accent)]">
                      {hit.heading}
                    </div>
                  )}
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--g-ink3)]">
                    {hit.before}
                    {hit.match && (
                      <mark className="rounded bg-amber-300/60 px-0.5 text-[#33291c] dark:bg-amber-500/30 dark:text-amber-100">
                        {hit.match}
                      </mark>
                    )}
                    {hit.after}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <ContentTree
              parts={parts}
              chapters={chapters}
              activeChapterId={activeChapterId}
              done={state.done}
              onNavigate={() => setDrawerOpen(false)}
            />
          )}
        </div>

        {/* Footer: reading settings live here on small screens */}
        <div className="border-t border-[var(--g-line)] px-4 py-3 text-[11.5px] text-[var(--g-ink3)]">
          <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
            <span className="font-medium text-[var(--g-ink2)]">Text size</span>
            <div
              role="group"
              aria-label="Text size"
              className="flex items-center overflow-hidden rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)]"
            >
              <button
                type="button"
                onClick={() => stepFontSize(-1)}
                aria-label="Smaller text"
                className="grid h-8 w-9 place-items-center text-[11px] font-bold text-[var(--g-ink2)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
              >
                A−
              </button>
              <div className="h-5 w-px bg-[var(--g-line)]" aria-hidden="true" />
              <button
                type="button"
                onClick={() => stepFontSize(1)}
                aria-label="Larger text"
                className="grid h-8 w-9 place-items-center text-[13px] font-bold text-[var(--g-ink2)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
              >
                A+
              </button>
            </div>
          </div>
          <nav
            aria-label="Study tools"
            className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold"
          >
            <Link
              href="/chapters"
              className="text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
            >
              Chapters
            </Link>
            <Link
              href="/progress"
              className="text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
            >
              Progress
            </Link>
            <Link
              href="/search"
              className="text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
            >
              Search
            </Link>
            <Link
              href="/chapters/roadmap"
              className="text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
            >
              Roadmap
            </Link>
          </nav>

          <div className="flex items-center justify-between gap-2">
            <span>{persistent ? "Saved in browser" : "Session-only progress"}</span>
            {confirmReset ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetAllProgress();
                    setConfirmReset(false);
                  }}
                  className="font-bold text-red-700 underline-offset-2 hover:underline dark:text-red-400"
                >
                  Erase all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="font-semibold text-[var(--g-ink2)] underline-offset-2 hover:underline"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="font-semibold text-[var(--g-ink2)] underline-offset-2 hover:text-[var(--g-accent)] hover:underline"
              >
                Reset progress
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="app-body">
        <header className="app-header no-print sticky top-0 z-30 flex h-[var(--shell-header)] items-center gap-2 border-b border-[var(--g-line)] bg-[var(--g-bg)]/90 px-3 backdrop-blur-md sm:px-4">
          <button
            type="button"
            aria-label={navExpanded ? "Hide navigation" : "Show navigation"}
            aria-expanded={navExpanded}
            aria-controls="sidebar"
            title="Navigation"
            onClick={toggleNavigation}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[var(--g-ink2)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1 truncate font-sans text-xs sm:text-[13px]">
            {activeChapter ? (
              <span className="flex items-center gap-1.5 truncate text-[var(--g-ink3)]">
                <span className="hidden truncate sm:inline">{activeChapter.partTitle}</span>
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
                <strong className="font-bold text-[var(--g-ink)]">Rust from Zero</strong>
                <span className="hidden sm:inline"> · the complete hands-on guide</span>
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 font-sans">
            <button
              type="button"
              onClick={openPalette}
              aria-haspopup="dialog"
              aria-expanded={paletteOpen}
              aria-label="Search the guide"
              title="Search (press / or ⌘K)"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] text-[var(--g-ink2)] shadow-card hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)] md:hidden"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={openPalette}
              aria-haspopup="dialog"
              aria-expanded={paletteOpen}
              title="Search (press / or ⌘K)"
              className="hidden h-9 items-center gap-2 rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] px-2.5 text-[12.5px] font-medium text-[var(--g-ink3)] shadow-card transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)] md:flex"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">Search the guide</span>
              <kbd
                aria-hidden="true"
                className="rounded border border-[var(--g-line)] bg-[var(--g-sunken)] px-1 font-sans text-[10px] font-semibold text-[var(--g-ink3)]"
              >
                /
              </kbd>
            </button>

            <div
              className="hidden items-center overflow-hidden rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card sm:flex"
              role="group"
              aria-label="Text size"
            >
              <button
                type="button"
                onClick={() => stepFontSize(-1)}
                aria-label="Smaller text"
                title="Smaller text"
                className="grid h-9 w-9 place-items-center text-[11px] font-bold text-[var(--g-ink2)] transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
              >
                A−
              </button>
              <div className="h-5 w-px bg-[var(--g-line)]" aria-hidden="true" />
              <button
                type="button"
                onClick={() => stepFontSize(1)}
                aria-label="Larger text"
                title="Larger text"
                className="grid h-9 w-9 place-items-center text-[13px] font-bold text-[var(--g-ink2)] transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
              >
                A+
              </button>
            </div>

            <button
              type="button"
              onClick={cycleTheme}
              aria-label={`Theme: ${themeLabel(themeMode)}. ${themeHint(themeMode)}`}
              title={`Theme: ${themeLabel(themeMode)} — ${themeHint(themeMode)}`}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] text-[var(--g-ink2)] shadow-card transition-colors hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
            >
              {themeMode === "system" ? (
                <Monitor className="h-4 w-4" aria-hidden="true" />
              ) : themeMode === "dark" ? (
                <Moon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        <main id="main" className="app-main">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** The gear-and-tick mark, drawn inline so it needs no network request. */
function RustMark() {
  return (
    <svg className="h-8 w-8 shrink-0 text-[var(--g-accent)]" viewBox="0 0 32 32" aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeDasharray="4.32 4.32"
      />
      <circle cx="16" cy="16" r="8.4" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path
        d="M11.5 16.2l3.2 3.2 5.8-6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
