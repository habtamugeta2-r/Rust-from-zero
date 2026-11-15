"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { HeadingItem } from "@/lib/guide-types";

export function ChapterRail({ headings }: { headings: HeadingItem[] }) {
  const h2Headings = useMemo(
    () => headings.filter((h) => h.level === 2),
    [headings]
  );
  const [activeId, setActiveId] = useState<string>(h2Headings[0]?.id ?? "");

  useEffect(() => {
    if (h2Headings.length === 0) return;
    const onScroll = () => {
      let current = h2Headings[0]?.id ?? "";
      for (const h of h2Headings) {
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
  }, [h2Headings]);

  if (h2Headings.length < 2) return null;

  return (
    <nav
      aria-label="In this chapter"
      className="no-print sticky top-20 hidden max-h-[calc(100vh-6rem)] w-52 shrink-0 overflow-y-auto self-start xl:block"
    >
      <p className="mb-3 font-sans text-xs font-bold uppercase tracking-wider text-[var(--g-ink3)]">
        In this chapter
      </p>
      <ul className="space-y-1.5 border-l border-[var(--g-line)] pl-3 font-sans text-[13px]">
        {h2Headings.map((h) => {
          const isOn = h.id === activeId;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={`block py-0.5 leading-snug transition-colors ${
                  isOn
                    ? "font-semibold text-[var(--g-accent)]"
                    : "text-[var(--g-ink3)] hover:text-[var(--g-ink)]"
                }`}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
