"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  Gauge,
  ListTree,
  Monitor,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import type { SearchHit } from "@/lib/guide-types";
import { themeHint, themeLabel, type ThemeMode } from "@/lib/theme";
import { useGuideState } from "./GuideStateProvider";
import { useGuideSearch } from "./use-guide-search";

type ActionItem = {
  kind: "action";
  id: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

type HitItem = { kind: "hit"; id: string; hit: SearchHit };

type Item = ActionItem | HitItem;

/**
 * The single search surface for the whole guide.
 *
 * Opens from the header button, the home-page button, or the `/` and ⌘K /
 * Ctrl-K shortcuts. Search results and navigation actions live in
 * one list so a reader can type a word *or* jump straight to a page without
 * deciding which box to use first.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { themeMode, cycleTheme, state } = useGuideState();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const { hits: fetched, resolved, pending } = useGuideSearch(query, open);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Results for a string the reader has already typed past are stale: showing
  // them would let Enter open the wrong hit.
  const hits = fetched && resolved === query.trim() ? fetched : null;

  const lastChapter = state.last
    ? `/chapters/${state.last}`
    : "/chapters/start";

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  const actions = useMemo<ActionItem[]>(
    () => [
      {
        kind: "action",
        id: "continue",
        label: state.last ? "Continue where you left off" : "Start at chapter 0",
        hint: state.last ? state.last : "start",
        icon: BookOpen,
        run: () => go(lastChapter),
      },
      {
        kind: "action",
        id: "progress",
        label: "Your progress",
        hint: "chapters, quizzes, bookmarks",
        icon: Gauge,
        run: () => go("/progress"),
      },
      {
        kind: "action",
        id: "roadmap",
        label: "Learning roadmap",
        hint: "the whole curriculum",
        icon: ListTree,
        run: () => go("/chapters/roadmap"),
      },
      {
        kind: "action",
        id: "theme",
        label: `Theme: ${themeLabel(themeMode)}`,
        hint: themeHint(themeMode),
        icon: themeIcon(themeMode),
        run: () => {
          cycleTheme();
        },
      },
    ],
    [go, lastChapter, state.last, themeMode, cycleTheme]
  );

  const items = useMemo<Item[]>(() => {
    const q = query.trim();
    if (q.length < 2) return actions;
    const hitItems: HitItem[] = (hits ?? []).slice(0, 8).map((hit, i) => ({
      kind: "hit",
      id: `hit-${i}`,
      hit,
    }));
    return [
      ...hitItems,
      {
        kind: "action",
        id: "all-results",
        label: `See all results for “${q}”`,
        hint: "opens the search page",
        icon: ArrowRight,
        run: () => go(`/search?q=${encodeURIComponent(q)}`),
      },
    ];
  }, [actions, hits, query, go]);

  // Reset the highlight whenever the list changes underneath it.
  useEffect(() => {
    setActive(0);
  }, [query, hits]);

  // Opening: move focus in. Closing: put it back where it came from.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(id);
  }, [open]);

  // Scroll lock while the palette is open.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
      restoreFocusTo.current?.focus({ preventScroll: true });
    };
  }, [open]);

  // Keep the highlighted row in view and let assistive tech follow along.
  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[active];
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const activate = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      if (item.kind === "hit") {
        go(
          `/chapters/${item.hit.chapterId}${
            item.hit.anchor ? `#${item.hit.anchor}` : ""
          }`
        );
      } else {
        item.run();
      }
    },
    [items, go]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    // Tab walks the dialog — field, close button and every row — and wraps at
    // the ends, so keyboard users can reach a result without the arrow keys.
    if (event.key === "Tab") {
      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    // Arrows and Enter drive the highlight only while the field has focus; on a
    // row, Enter and Space keep their native meaning for that row.
    if (event.target !== inputRef.current) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) =>
        items.length === 0 ? 0 : (i - 1 + items.length) % items.length
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activate(active);
    }
  };

  if (!open) return null;

  const q = query.trim();
  const activeItem = items[active];
  const activeLabel =
    activeItem === undefined
      ? ""
      : activeItem.kind === "hit"
        ? `${activeItem.hit.chapterTitle}: ${activeItem.hit.heading}`
        : activeItem.label;

  return (
    <div
      className="no-print fixed inset-0 z-[60] flex items-start justify-center px-3 pt-[8vh] sm:px-4 sm:pt-[12vh]"
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden="true"
        onClick={close}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the guide"
        className="relative flex max-h-[82dvh] w-full max-w-xl flex-col overflow-hidden rounded-card border border-[var(--g-line2)] bg-[var(--g-surface)] shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-[var(--g-line)] px-4">
          <Search
            className="h-4 w-4 shrink-0 text-[var(--g-ink3)]"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chapters, sections and terms…"
            role="combobox"
            aria-label="Search the guide"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls="palette-listbox"
            aria-activedescendant={
              activeItem ? `palette-option-${activeItem.id}` : undefined
            }
            aria-describedby="palette-hint"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent font-sans text-[15px] text-[var(--g-ink)] placeholder:text-[var(--g-ink3)] focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--g-ink3)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p aria-live="polite" className="sr-only">
          {q.length >= 2
            ? pending
              ? "Searching"
              : `${hits?.length ?? 0} results. ${activeLabel}`
            : activeLabel}
        </p>

        <ul
          id="palette-listbox"
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          aria-label={q.length >= 2 ? "Search results" : "Quick links"}
        >
          {q.length >= 2 && pending && (hits === null || hits.length === 0) && (
            <li className="px-3 py-4 font-sans text-[13px] text-[var(--g-ink3)]">
              Searching…
            </li>
          )}

          {q.length >= 2 && !pending && hits !== null && hits.length === 0 && (
            <li className="px-3 py-4 font-sans text-[13px] leading-relaxed text-[var(--g-ink3)]">
              Nothing matched “{q}”. Try one shorter word — or press Enter to
              search the whole guide.
            </li>
          )}

          {items.map((item, index) => {
            const isActive = index === active;
            const shared = `flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
              isActive ? "bg-[var(--g-accent-soft)]" : ""
            }`;

            if (item.kind === "hit") {
              const { hit } = item;
              return (
                <li
                  key={item.id}
                  id={`palette-option-${item.id}`}
                  role="option"
                  aria-selected={isActive}
                >
                  <Link
                    ref={(node) => {
                      itemRefs.current[index] = node;
                    }}
                    href={`/chapters/${hit.chapterId}${
                      hit.anchor ? `#${hit.anchor}` : ""
                    }`}
                    onClick={close}
                    onMouseMove={() => setActive(index)}
                    tabIndex={-1}
                    className={shared}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--g-surface)] font-mono text-[10px] font-bold text-[var(--g-ink3)] ring-1 ring-[var(--g-line2)]">
                      {hit.num}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate font-sans text-[13px] font-bold text-[var(--g-ink)]">
                          {hit.chapterTitle}
                        </span>
                        {hit.heading && (
                          <span className="truncate font-sans text-[11.5px] text-[var(--g-accent)]">
                            {hit.heading}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 line-clamp-2 font-sans text-[12px] leading-snug text-[var(--g-ink3)]">
                        {hit.before}
                        {hit.match && (
                          <mark className="rounded bg-amber-300/60 px-0.5 text-[#33291c] dark:bg-amber-500/30 dark:text-amber-100">
                            {hit.match}
                          </mark>
                        )}
                        {hit.after}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            }

            const Icon = item.icon;
            return (
              <li
                key={item.id}
                id={`palette-option-${item.id}`}
                role="option"
                aria-selected={isActive}
              >
                <button
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  type="button"
                  onClick={item.run}
                  onMouseMove={() => setActive(index)}
                  tabIndex={-1}
                  className={shared}
                >
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--g-surface)] text-[var(--g-ink2)] ring-1 ring-[var(--g-line2)]">
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[13px] font-semibold text-[var(--g-ink)]">
                      {item.label}
                    </span>
                    <span className="block truncate font-sans text-[11.5px] text-[var(--g-ink3)]">
                      {item.hint}
                    </span>
                  </span>
                  {isActive && (
                    <CornerDownLeft
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--g-ink3)]"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div
          id="palette-hint"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-2 font-sans text-[11px] text-[var(--g-ink3)]"
        >
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1">
            <Kbd>esc</Kbd> close
          </span>
          <span className="ml-auto hidden sm:inline">
            {q.length < 2
              ? "Type to search the whole guide"
              : pending
                ? "Searching…"
                : `${hits?.length ?? 0} matches`}
          </span>
        </div>
      </div>
    </div>
  );
}

function themeIcon(mode: ThemeMode) {
  if (mode === "system") return Monitor;
  return mode === "dark" ? Moon : Sun;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--g-line2)] bg-[var(--g-surface)] px-1 py-0.5 font-sans text-[10px] font-semibold text-[var(--g-ink2)]">
      {children}
    </kbd>
  );
}
