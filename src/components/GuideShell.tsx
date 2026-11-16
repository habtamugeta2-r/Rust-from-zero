"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { themeHint, themeLabel } from "@/lib/theme";
import type { ChapterProgressInput, PartNav } from "@/lib/guide-types";
import { CommandPalette } from "./CommandPalette";
import { useGuideState } from "./GuideStateProvider";
import { usePageInfo } from "./GlossaryTipContext";

const SIDEBAR_KEY = "rust-guide-sidebar";

/**
 * The app chrome: header, sidebar, drawer, palette and the reading column.
 *
 * Everything here is a client component, so its props are serialised into
 * every page's RSC payload. That is why they are narrow, per-page facts —
 * {@link PartNav} and {@link ChapterProgressInput} without prose, objectives
 * or block trees — rather than the parser's full chapter objects. It used to
 * be handed all 88 `ChapterSummary` records and used three fields of one.
 */
export function GuideShell({
  parts,
  chapters,
  children,
}: {
  parts: PartNav[];
  chapters: ChapterProgressInput[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { state, persistent, resetAllProgress, cycleTheme, themeMode, stepFontSize } =
    useGuideState();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [collapsedParts, setCollapsedParts] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const drawerRef = useRef<HTMLElement>(null);

  const page = usePageInfo();
  const activeChapterId = pathname.startsWith("/chapters/")
    ? pathname.slice("/chapters/".length)
    : null;
  const activeChapter = page.chapter ?? null;

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

  // Route change: close the drawer.
  useEffect(() => {
    setDrawerOpen(false);
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
  }, [openPalette]);

  const togglePart = (key: string) => {
    setCollapsedParts((prev) => ({ ...prev, [key]: !prev[key] }));
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

        {/* Search lives in one place: the command palette. A second input here
            duplicated it, and its `/` badge was a lie — the shortcut opens the
            palette, not this box. The trigger below says so honestly. */}
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={openPalette}
            aria-keyshortcuts="/ Control+k Meta+k"
            className="flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] px-3 text-left text-[13px] text-[var(--g-ink3)] shadow-card transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink2)]"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate">Search the whole guide</span>
            <kbd
              aria-hidden="true"
              className="hidden rounded-md border border-[var(--g-line)] bg-[var(--g-sunken)] px-1.5 py-0.5 font-sans text-[11px] font-medium sm:inline-block"
            >
              /
            </kbd>
          </button>
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
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
          data-scroll-pane
          tabIndex={-1}
        >
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
                    aria-controls={`part-list-${part.key}`}
                    onClick={() => togglePart(part.key)}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-[var(--g-ink2)] hover:bg-[var(--g-line)]/40 hover:text-[var(--g-ink)]"
                  >
                    {isCollapsed ? (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronDown
                        className="h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {part.partLabel && (
                        <span className="mr-1.5 text-[10.5px] tracking-wider text-[var(--g-ink3)] uppercase">
                          {part.partLabel}
                        </span>
                      )}
                      {part.partTitle}
                    </span>
                    {part.key !== "app" && (
                      <span className="text-[11px] font-medium text-[var(--g-ink3)] tabular-nums">
                        {pDone}/{list.length}
                      </span>
                    )}
                  </button>

                  {!isCollapsed && (
                    <ol id={`part-list-${part.key}`} className="mt-0.5 space-y-0.5 pb-1.5 pl-3">
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
                                  ? "bg-[var(--g-accent-soft)] font-semibold text-[var(--g-accent)]"
                                  : "text-[var(--g-ink2)] hover:bg-[var(--g-surface)] hover:text-[var(--g-ink)]"
                              }`}
                            >
                              {isActive && (
                                <span
                                  aria-hidden="true"
                                  className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-full bg-[var(--g-accent)]"
                                />
                              )}
                              <span className="min-w-[1.6rem] shrink-0 font-mono text-[11px] tabular-nums text-[var(--g-ink3)]">
                                {c.num}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{c.short}</span>
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
