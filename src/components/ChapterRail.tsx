"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { HeadingItem } from "@/lib/guide-types";

/**
 * The table of contents for one chapter.
 *
 * Wide screens get a sticky rail with both `h2` and `h3` entries. Narrower
 * screens get the same tree inside a `<details>` panel above the prose, so a
 * long chapter is navigable on a laptop or a phone without a separate route.
 */
export function ChapterRail({ headings }: { headings: HeadingItem[] }) {
  const items = useMemo(
    () => headings.filter((h) => h.level === 2 || h.level === 3),
    [headings]
  );
  const h2Headings = useMemo(() => items.filter((h) => h.level === 2), [items]);
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    if (items.length === 0) return;
    const onScroll = () => {
      let current = items[0]?.id ?? "";
      for (const h of items) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top < 140) {
          current = h.id;
        }
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  if (h2Headings.length < 2) return null;

  const link = (h: HeadingItem) => {
    const isOn = h.id === activeId;
    return (
      <a
        key={h.id}
        href={`#${h.id}`}
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
      {/* Narrow screens: one collapsed panel, closed by default. */}
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

      {/* Wide screens: sticky rail. */}
      <nav
        aria-label="In this chapter"
        className="no-print sticky top-20 hidden max-h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto self-start xl:block"
      >
        <p className="mb-3 font-sans text-[11px] font-bold tracking-[0.08em] uppercase text-[var(--g-ink3)]">
          In this chapter
        </p>
        <ul className="space-y-0.5 font-sans text-[13px]">
          {items.map((h) => (
            <li key={h.id}>{link(h)}</li>
          ))}
        </ul>
      </nav>
    </>
  );
}
