"use client";

import { useEffect, useMemo, useState } from "react";
import type { HeadingItem } from "@/lib/guide-types";

/**
 * Track which section the reader is looking at.
 *
 * Shared by the wide-screen rail and the compact sheet so both highlight the
 * same entry. Measurement is throttled with `requestAnimationFrame`; the loop
 * only reads `getBoundingClientRect`, so it never forces a layout thrash on
 * every scroll event.
 */
export function useActiveHeading(headings: HeadingItem[]): string {
  const ids = useMemo(() => headings.map((h) => h.id), [headings]);
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    if (ids.length === 0) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        // Just below the sticky header + anchor offset.
        if (el && el.getBoundingClientRect().top <= 112) current = id;
      }
      // At the very bottom of a long page the last section may never reach the
      // top of the viewport; still mark it as read.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY >= max - 8) current = ids[ids.length - 1];
      setActiveId((prev) => (prev === current ? prev : current));
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
  }, [ids]);

  return activeId;
}

/** Scroll the window to an element, honouring `prefers-reduced-motion`. */
export function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}
