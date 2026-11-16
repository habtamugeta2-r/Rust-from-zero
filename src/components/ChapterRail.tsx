"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, ListTree, X } from "lucide-react";
import type { HeadingItem } from "@/lib/guide-types";
import { tocItems } from "@/lib/headings";
import { scrollToTop, useActiveHeading } from "./use-active-heading";

/**
 * "On this page", in two shapes.
 *
 * From 1240px up the page renders `<ChapterRail>` as the second column of the
 * chapter grid: a sticky table of contents that tracks the section being read.
 * Below that width the same list lives in `<ChapterTocTrigger>`, a compact
 * button that opens a sheet — so the table of contents is never dumped on top
 * of the article where it used to sit.
 */

/* -------------------------------------------------------------------------- */
/* Wide screens: the sticky right-hand rail                                    */
/* -------------------------------------------------------------------------- */

export function ChapterRail({ headings }: { headings: HeadingItem[] }) {
  // Stable identity keeps the scroll listener from being rebuilt every render.
  const items = useMemo(() => tocItems(headings), [headings]);
  const activeId = useActiveHeading(items);
  const [pct, setPct] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, (100 * window.scrollY) / max) : 0);
      setShowTop(window.scrollY > 640);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Keep the current entry visible inside the rail. Adjusting `scrollTop`
  // directly (rather than scrollIntoView) means the page itself never moves.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const el = nav.querySelector<HTMLElement>(`[data-toc-id="${activeId}"]`);
    if (!el) return;
    const navRect = nav.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    const pad = 8;
    if (itemRect.top < navRect.top + pad) {
      nav.scrollTop -= navRect.top + pad - itemRect.top;
    } else if (itemRect.bottom > navRect.bottom - pad) {
      nav.scrollTop += itemRect.bottom - (navRect.bottom - pad);
    }
  }, [activeId]);

  return (
    <div className="flex max-h-[inherit] flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-mono text-[10.5px] font-semibold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
          On this page
        </p>
        <span className="font-mono text-[11px] font-semibold text-[var(--g-ink3)] tabular-nums">
          {Math.round(pct)}%
        </span>
      </div>

      <nav
        ref={navRef}
        aria-label="On this page"
        data-scroll-pane
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto pr-1"
      >
        <ol className="font-sans">
          {items.map((heading) => {
            const isOn = heading.id === activeId;
            return (
              <li key={heading.id}>
                <a
                  href={`#${heading.id}`}
                  data-toc-id={heading.id}
                  aria-current={isOn ? "location" : undefined}
                  className={`relative block rounded-r-md border-l-2 py-[6px] pr-2 text-[12.5px] leading-snug transition-colors ${
                    heading.level === 3 ? "pl-5 text-[12px]" : "pl-3"
                  } ${
                    isOn
                      ? "border-[var(--g-accent)] bg-[var(--g-accent-soft)]/55 font-semibold text-[var(--g-accent)]"
                      : "border-[var(--g-line)] text-[var(--g-ink3)] hover:border-[var(--g-line2)] hover:text-[var(--g-ink)]"
                  }`}
                >
                  {heading.text}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-4 flex shrink-0 items-center gap-3 border-t border-[var(--g-line)] pt-3">
        <ProgressRing pct={pct} />
        <button
          type="button"
          onClick={scrollToTop}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[12px] font-semibold text-[var(--g-ink3)] transition-opacity hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)] ${
            showTop ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          tabIndex={showTop ? 0 : -1}
          aria-hidden={showTop ? undefined : true}
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
          Back to top
        </button>
      </div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--g-line)"
        strokeWidth="3"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--g-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct / 100)}
        style={{ transition: "stroke-dashoffset 150ms linear" }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Narrow and mid-width screens: button + sheet                                */
/* -------------------------------------------------------------------------- */

export function ChapterTocTrigger({ headings }: { headings: HeadingItem[] }) {
  const items = useMemo(() => tocItems(headings), [headings]);
  const [open, setOpen] = useState(false);
  const activeId = useActiveHeading(items);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";

    const node = panelRef.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
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
      body.style.overflow = previous;
      // preventScroll: the click may also be an anchor jump to a section, and
      // focusing the trigger must not drag the reader back to the top.
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  // The sheet locks page scrolling, so the jump to a section has to wait until
  // the lock is released; otherwise the browser has nowhere to scroll to.
  useEffect(() => {
    if (open) return;
    const id = pendingTarget.current;
    if (!id) return;
    pendingTarget.current = null;
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }, [open]);

  if (items.length < 2) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="toc-trigger inline-flex items-center gap-1.5 rounded-full border border-[var(--g-line)] bg-[var(--g-surface)] px-3 py-1 text-[11px] font-bold tracking-wide text-[var(--g-ink2)] shadow-card transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-ink)]"
      >
        <ListTree className="h-3.5 w-3.5 text-[var(--g-accent)]" aria-hidden="true" />
        On this page
        <span className="font-medium text-[var(--g-ink3)] tabular-nums">
          {items.filter((h) => h.level === 2).length}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--g-ink3)]" aria-hidden="true" />
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="On this page"
            className="relative z-10 flex max-h-[80dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--g-line)] bg-[var(--g-surface)] shadow-pop sm:max-w-md sm:rounded-card"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--g-line)] px-4 py-3">
              <div className="min-w-0">
                <p className="font-sans text-[11px] font-bold tracking-[0.09em] text-[var(--g-ink3)] uppercase">
                  On this page
                </p>
                <p className="font-sans text-sm font-bold text-[var(--g-ink)]">
                  {items.filter((h) => h.level === 2).length} sections
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close table of contents"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--g-ink2)] hover:bg-[var(--g-sunken)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <nav
              aria-label="On this page"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
            >
              <ol className="font-sans">
                {items.map((heading) => {
                  const isOn = heading.id === activeId;
                  return (
                    <li key={heading.id}>
                      <a
                        href={`#${heading.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          pendingTarget.current = heading.id;
                          setOpen(false);
                        }}
                        aria-current={isOn ? "location" : undefined}
                        className={`block rounded-lg py-2 pr-2 leading-snug transition-colors ${
                          heading.level === 3 ? "pl-8 text-[13px]" : "pl-3 text-[14px]"
                        } ${
                          isOn
                            ? "bg-[var(--g-accent-soft)] font-semibold text-[var(--g-accent)]"
                            : "text-[var(--g-ink2)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]"
                        }`}
                      >
                        {heading.text}
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>

            <div className="border-t border-[var(--g-line)] px-4 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  scrollToTop();
                }}
                className="inline-flex items-center gap-1.5 font-sans text-[12.5px] font-semibold text-[var(--g-ink3)] hover:text-[var(--g-accent)]"
              >
                <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                Back to top
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
