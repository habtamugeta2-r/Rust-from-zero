import { loadGuide } from "./guide-parser";
import type { SearchEntry, SearchHit } from "./guide-types";

/**
 * Full-text search over the guide.
 *
 * The index is built once, at parse time, from every heading and paragraph.
 * This module is the single implementation shared by `/api/search` (used by the
 * command palette) and the `/search` page (shareable, server-rendered results),
 * so both can never disagree about ranking or snippets.
 */

const SNIPPET_BEFORE = 36;
const SNIPPET_AFTER = 64;

export interface SearchOptions {
  /** Hard cap on returned hits. */
  limit?: number;
}

function snippet(entry: SearchEntry, word: string): Omit<SearchHit, "chapterId" | "num" | "chapterTitle" | "anchor" | "heading"> {
  const pos = entry.lower.indexOf(word);
  const start = Math.max(0, pos - SNIPPET_BEFORE);
  const end = Math.min(entry.text.length, pos + word.length + SNIPPET_AFTER);
  const slice =
    (start > 0 ? "…" : "") +
    entry.text.slice(start, end).replace(/\s+/g, " ") +
    (end < entry.text.length ? "…" : "");

  const matchAt = slice.toLowerCase().indexOf(word);
  if (matchAt < 0) {
    // The window can miss the word when it appears late in the paragraph.
    return { before: slice, match: "", after: "" };
  }
  return {
    before: slice.slice(0, matchAt),
    match: slice.slice(matchAt, matchAt + word.length),
    after: slice.slice(matchAt + word.length),
  };
}

export function searchGuide(query: string, options: SearchOptions = {}): SearchHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const limit = options.limit ?? 40;
  const guide = loadGuide();
  const best = new Map<
    string,
    { score: number; entry: SearchEntry }
  >();

  for (const entry of guide.searchIndex) {
    let matchesAll = true;
    for (const word of words) {
      if (!entry.lower.includes(word)) {
        matchesAll = false;
        break;
      }
    }
    if (!matchesAll) continue;

    const score =
      entry.weight +
      (entry.lower.startsWith(words[0]) ? 5 : 0) -
      Math.min(4, entry.text.length / 200);
    const key = `${entry.chapterId}|${entry.anchor}`;
    const previous = best.get(key);
    if (!previous || score > previous.score) {
      best.set(key, { score, entry });
    }
  }

  return Array.from(best.values())
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.entry.chapterId.localeCompare(b.entry.chapterId)
    )
    .slice(0, limit)
    .map(({ entry }) => ({
      chapterId: entry.chapterId,
      num: entry.num,
      chapterTitle: entry.chapterTitle,
      anchor: entry.anchor,
      heading: entry.heading,
      ...snippet(entry, words[0]),
    }));
}

/** Group hits by chapter, keeping the ranking order of the first hit. */
export function groupHitsByChapter(
  hits: SearchHit[]
): { chapterId: string; num: string; chapterTitle: string; hits: SearchHit[] }[] {
  const groups = new Map<
    string,
    { chapterId: string; num: string; chapterTitle: string; hits: SearchHit[] }
  >();
  for (const hit of hits) {
    const existing = groups.get(hit.chapterId);
    if (existing) {
      existing.hits.push(hit);
    } else {
      groups.set(hit.chapterId, {
        chapterId: hit.chapterId,
        num: hit.num,
        chapterTitle: hit.chapterTitle,
        hits: [hit],
      });
    }
  }
  return Array.from(groups.values());
}

/** Topics offered on an empty search page, so the page is never a dead end. */
export const SUGGESTED_QUERIES = [
  "ownership",
  "borrowing",
  "lifetimes",
  "async",
  "epoll",
  "ELF",
  "SQLx",
  "unsafe",
] as const;
