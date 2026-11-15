"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import type { HeadingItem } from "@/lib/guide-types";

/**
 * The table of contents for one chapter, plus a reading aid.
 *
 * Wide screens get a sticky rail with both `h2` and `h3` entries. Narrower
 * screens get the same tree inside a `<details>` panel above the prose, so a
 * long chapter is navigable on a laptop or a phone without a separate route.
 *
 * The rail also reports reading progress through the chapter and offers a
 * "top" button once the header has scrolled away: on a 5,000-word chapter a
 * reader who wants to jump back to the section list should not have to scroll.
 */
export function ChapterRail({ headings }: { headings: HeadingItem[] }) {
  const items = useMemo(
    () => headings.filter((h) => h.level === 2 || h.level === 3),
    [headings]
  );
  const h2Headings = useMemo(() => items.filter((h) => h.level === 2), [items]);
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");
  const [pct, setPct] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const railRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = items[0]?.id ?? "";
      for (const h of items) {
        const el = document.getElementById(h.id);
        // Just below the 4.5rem scroll-padding used for anchor jumps.
        if (el && el.getBoundingClientRect().top < 88) current = h.id;
      }
      setActiveId(current);

      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, (100 * window.scrollY) / max) : 0);
      setShowTop(window.scrollY > 600);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  // Keep the active entry visible inside the rail when the reader is deep in
  // a chapter with more subsections than fit on screen.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>(`[data-toc-id="${activeId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rr = rail.getBoundingClientRect();
    if (r.top < rr.top + 8 || r.bottom > rr.bottom - 8) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeId]);

  if (h2Headings.length < 2) return null;

  const link = (h: HeadingItem) => {
    const isOn = h.id === activeId;
    return (
      <a
        key={h.id}
        href={`#${h.id}`}
        data-toc-id={h.id}
        aria-current={isOn ? "true" : undefined}
        className={[
          "block rounded-md leading-snug transition-colors",
          h.level === 3 ? "ml-3 py-1 pl-2.5 text-[12px]" : "px-3 py-1.5",
          isOn
            ? "bg-[var(--g-accent-soft)] font-semibold text-[var(--g-accent)]"
            : "text-[var(--g-ink3)] hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)]",
        ].join(" ")}
      >
        {h.text}
      </a>
    );
  };

  return (
    <>
      {/* Narrow screens: one collapsible panel, closed by default. */}
      <details className="no-print group mb-8 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card xl:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-sans text-[13px] font-semibold text-[var(--g-ink)] [&::-webkit-details-marker]:hidden">
          <span>
            In this chapter
            <span className="ml-2 font-normal text-[var(--g-ink3)]">
              {h2Headings.length} sections
            </span>
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <ul className="space-y-0.5 border-t border-[var(--g-line)] px-2 py-2 font-sans text-[13px]">
          {items.map((h) => (
            <li key={h.id}>{link(h)}</li>
          ))}
        </ul>
      </details>

      {/* Wide screens: sticky rail with progress and a jump-to-top control. */}
      <div className="no-print sticky top-20 hidden max-h-[calc(100vh-6rem)] w-56 shrink-0 2xl:w-60 self-start xl:order-2 xl:flex xl:flex-col">
        <p className="mb-3 font-sans text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--g-ink3)]">
          In this chapter
        </p>
        <nav
          ref={railRef}
          aria-label="In this chapter"
          className="min-h-0 flex-1 overflow-y-auto pr-1"
        >
          <ul className="space-y-0.5 font-sans text-[13px]">
            {items.map((h) => (
              <li key={h.id}>{link(h)}</li>
            ))}
          </ul>
        </nav>

        <div className="mt-3 shrink-0 border-t border-[var(--g-line)] pt-3">
          {/* The thin bar in the sticky header already reports progress to
              assistive tech, so this one is decorative and the button carries
              the number. */}
          <div
            aria-hidden="true"
            className="h-1 overflow-hidden rounded-full bg-[var(--g-sunken)]"
          >
            <div
              className="h-full rounded-full bg-[var(--g-accent)] transition-[width] duration-150"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[12px] font-semibold text-[var(--g-ink3)] transition-all hover:bg-[var(--g-sunken)] hover:text-[var(--g-ink)] ${
              showTop ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            tabIndex={showTop ? 0 : -1}
            aria-hidden={showTop ? undefined : true}
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            {Math.round(pct)}% · back to top
          </button>
        </div>
      </div>
    </>
  );
}
