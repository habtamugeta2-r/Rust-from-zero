"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Monitor, Moon, Search, Sun, X } from "lucide-react";
import type { ContentNode, NavigationChapter, PartMeta } from "@/lib/guide-types";
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
  chapters: NavigationChapter[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { state, persistent, resetAllProgress, cycleTheme, themeMode, stepFontSize } =
    useGuideState();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const drawerRef = useRef<HTMLElement>(null);
  const [loadedOutlines, setLoadedOutlines] = useState<Record<string, ContentNode[]>>({});
  const outlineRequests = useRef(new Set<string>());

  const requestOutline = useCallback((chapterId: string) => {
    if (outlineRequests.current.has(chapterId)) return;
    outlineRequests.current.add(chapterId);
    void fetch(`/api/outlines?chapter=${encodeURIComponent(chapterId)}`, {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`outline request failed: ${response.status}`);
        return (await response.json()) as { chapter: string; outline: ContentNode[] };
      })
      .then((payload) => {
        if (payload.chapter !== chapterId || !Array.isArray(payload.outline)) {
          throw new Error("invalid outline response");
        }
        setLoadedOutlines((current) => ({ ...current, [chapterId]: payload.outline }));
      })
      .catch(() => outlineRequests.current.delete(chapterId));
  }, []);

  const chaptersForTree = useMemo(
    () =>
      chapters.map((chapter) => ({
        ...chapter,
        outline: loadedOutlines[chapter.id] ?? chapter.outline,
      })),
    [chapters, loadedOutlines],
  );

  const activeChapterId = pathname.startsWith("/chapters/")
    ? pathname.slice("/chapters/".length)
    : null;
  const activeChapter = activeChapterId
    ? (chapters.find((c) => c.id === activeChapterId) ?? null)
    : null;
  const isKnownRoute =
    pathname === "/" ||
    pathname === "/chapters" ||
    pathname === "/progress" ||
    pathname === "/search" ||
    activeChapter !== null;

  useEffect(() => {
    if (activeChapter) requestOutline(activeChapter.id);
  }, [activeChapter, requestOutline]);

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

  // Route changes close the mobile navigation drawer.
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

  const toggleNavigation = () => {
    if (isDesktop) setSidebarOpen((open) => !open);
    else setDrawerOpen((open) => !open);
  };

  const navExpanded = isDesktop ? sidebarOpen : drawerOpen;

  // A missing route does not need to hydrate the course navigation tree,
  // command palette or reading controls. Keep its static fallback lightweight.
  if (!isKnownRoute) {
    return (
      <main id="main" className="min-h-screen">
        {children}
      </main>
    );
  }

  if (pathname === "/") {
    return (
      <div className="landing-shell">
        <header className="landing-header no-print">
          <div className="landing-header-inner">
            <Link href="/" className="landing-brand" aria-label="Rust from Zero home">
              <span className="landing-brand-mark">
                R<span>.</span>
              </span>
              <span>
                Rust <span className="landing-brand-light">from Zero</span>
              </span>
            </Link>
            <nav aria-label="Main navigation" className="landing-nav">
              <Link href="/chapters">The curriculum</Link>
              <Link href="/chapters/roadmap">Learning roadmap</Link>
              <Link href="/progress">Your progress</Link>
            </nav>
            <div className="landing-header-actions">
              <button
                type="button"
                onClick={openPalette}
                aria-label="Search the guide"
                title="Search the guide"
                className="landing-icon-button"
              >
                <Search className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={cycleTheme}
                aria-label={`Theme: ${themeLabel(themeMode)}. ${themeHint(themeMode)}`}
                title={`Theme: ${themeLabel(themeMode)} — ${themeHint(themeMode)}`}
                className="landing-icon-button"
              >
                {themeMode === "system" ? (
                  <Monitor className="h-[18px] w-[18px]" aria-hidden="true" />
                ) : themeMode === "dark" ? (
                  <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
                ) : (
                  <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
                )}
              </button>
              <Link href="/chapters/start" className="landing-header-cta">
                Start learning <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    );
  }

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

        {/* The CommandPalette is the guide's only search interface. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
          data-scroll-pane
          tabIndex={-1}
        >
          <ContentTree
            parts={parts}
            chapters={chaptersForTree}
            activeChapterId={activeChapterId}
            done={state.done}
            onNavigate={() => setDrawerOpen(false)}
            onRequestOutline={requestOutline}
          />
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

/** Shared brand mark used on the landing page and in the guide. */
function RustMark() {
  return (
    <span className="landing-brand-mark shrink-0" aria-hidden="true">
      R<span>.</span>
    </span>
  );
}
