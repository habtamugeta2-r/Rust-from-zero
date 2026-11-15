"use client";

import { useEffect, useState } from "react";
import type { SearchHit } from "@/lib/guide-types";

/**
 * Debounced search against `/api/search`.
 *
 * One hook, used by the command palette, so every search surface talks to the
 * same endpoint and ranking. Returns `null` until a query is worth sending.
 */
export function useGuideSearch(query: string, enabled = true) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) {
      setHits(null);
      setPending(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setPending(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=24`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        if (!cancelled) {
          setHits(data.hits);
          setPending(false);
        }
      } catch (error) {
        if ((error as Error).name === "AbortError" || cancelled) return;
        setHits([]);
        setPending(false);
      }
    }, 140);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return { hits, pending };
}
