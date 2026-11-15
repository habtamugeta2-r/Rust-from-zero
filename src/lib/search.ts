import { loadGuide } from "./guide-parser";
import type { SearchEntry, SearchHit } from "./guide-types";

/**
 * Full-text search over the guide.
 *
 * The index is built once, at parse time, from every heading and paragraph.
 * This module is the single implementation shared by `/api/search` (used by the
 * command palette) and the `/search` page (shareable, server-rendered results),
 * so both can never disagree about ranking or snippets.
 *
 * Matching, strongest first:
 *   1. a whole word equal to the query word;
 *   2. a word that starts with the query word (prefix matching, so `borrow`
 *      finds *borrowing*);
 *   3. the query word anywhere inside the text (the original substring rule).
 *
 * Query words are expanded through {@link SYNONYMS} before matching: `mut`
 * also searches for *mutability* and *mutable*, because that is the word the
 * guide actually uses. A misspelling is not a synonym — `asnyc` does not
 * expand to `async`, and this module deliberately does no typo correction:
 * a corrected guess that lands on the wrong chapter is worse than no result,
 * and the empty-results page offers suggested topics instead. Prefix matching
 * still rescues the common case of a half-typed or half-remembered word.
 */

const SNIPPET_BEFORE = 36;
const SNIPPET_AFTER = 64;

export interface SearchOptions {
  /** Hard cap on returned hits. */
  limit?: number;
}

/**
 * Abbreviations and aliases a reader plausibly types, mapped to the words the
 * guide is written in. Keys and values are lower-case single words; a query
 * word matches an entry when any of its expansions matches.
 */
export const SYNONYMS: Record<string, string[]> = {
  mut: ["mutability", "mutable"],
  immut: ["immutable"],
  stdlib: ["standard", "library"],
  cli: ["command", "line"],
  js: ["javascript"],
  ts: ["typescript"],
  py: ["python"],
  golang: ["go"],
  cpp: ["c++"],
  oop: ["object", "oriented"],
  os: ["operating", "system"],
  vtable: ["dynamic", "dispatch"],
  raii: ["drop", "ownership"],
  repl: ["playground"],
};

/** Query word -> the words it may match (itself first, then synonyms). */
export function expandWord(word: string): string[] {
  const synonyms = SYNONYMS[word] ?? [];
  return [word, ...synonyms.filter((synonym) => synonym !== word)];
}

interface Match {
  /** The text as it appears in the entry (for the snippet highlight). */
  surface: string;
  /** Index of the match in the entry's lower-cased text. */
  index: number;
  /** 3 whole word, 2 prefix, 1 substring, 0 no match. */
  strength: number;
}

function wordPrefixIndex(lower: string, word: string): { index: number; surface: string } | null {
  const pattern = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(word)}[a-z0-9]*)`, "i");
  const found = pattern.exec(lower);
  if (!found) return null;
  return { index: found.index + found[1].length, surface: found[2] };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Best match of one query word (with synonyms) against one entry. */
function matchWord(entry: SearchEntry, queryWord: string): Match | null {
  let best: Match | null = null;
  for (const word of expandWord(queryWord)) {
    const whole = new RegExp(`(^|[^a-z0-9])(${escapeRegExp(word)})(?![a-z0-9])`, "i").exec(
      entry.lower,
    );
    if (whole) {
      const candidate: Match = {
        surface: whole[2],
        index: whole.index + whole[1].length,
        strength: 3,
      };
      if (!best || candidate.strength > best.strength) best = candidate;
      continue;
    }
    const prefix = wordPrefixIndex(entry.lower, word);
    if (prefix) {
      const candidate: Match = { surface: prefix.surface, index: prefix.index, strength: 2 };
      if (!best || candidate.strength > best.strength) best = candidate;
      continue;
    }
    const index = entry.lower.indexOf(word);
    if (index >= 0) {
      const candidate: Match = {
        surface: entry.text.slice(index, index + word.length),
        index,
        strength: 1,
      };
      if (!best || candidate.strength > best.strength) best = candidate;
    }
  }
  return best;
}

function snippet(
  entry: SearchEntry,
  match: Match,
): Omit<SearchHit, "chapterId" | "num" | "chapterTitle" | "anchor" | "heading"> {
  const pos = match.index;
  const start = Math.max(0, pos - SNIPPET_BEFORE);
  const end = Math.min(entry.text.length, pos + match.surface.length + SNIPPET_AFTER);
  const slice =
    (start > 0 ? "…" : "") +
    entry.text.slice(start, end).replace(/\s+/g, " ") +
    (end < entry.text.length ? "…" : "");

  const matchAt = slice.toLowerCase().indexOf(match.surface.toLowerCase());
  if (matchAt < 0) {
    // The window can miss the word when it appears late in the paragraph.
    return { before: slice, match: "", after: "" };
  }
  return {
    before: slice.slice(0, matchAt),
    match: slice.slice(matchAt, matchAt + match.surface.length),
    after: slice.slice(matchAt + match.surface.length),
  };
}

/**
 * Rank `entries` against `query`. Pure: the caller supplies the index, so the
 * tests can rank a fixture index without loading the guide.
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const limit = options.limit ?? 40;
  const best = new Map<string, { score: number; entry: SearchEntry; match: Match }>();

  for (const entry of entries) {
    let strength = 0;
    let firstMatch: Match | null = null;
    let matchesAll = true;
    for (const word of words) {
      const match = matchWord(entry, word);
      if (!match) {
        matchesAll = false;
        break;
      }
      strength += match.strength;
      if (!firstMatch) firstMatch = match;
    }
    if (!matchesAll || !firstMatch) continue;

    const score =
      entry.weight +
      strength * 2 +
      (entry.lower.startsWith(words[0]) ? 5 : 0) -
      Math.min(4, entry.text.length / 200);
    const key = `${entry.chapterId}|${entry.anchor}`;
    const previous = best.get(key);
    if (!previous || score > previous.score) {
      best.set(key, { score, entry, match: firstMatch });
    }
  }

  return Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.entry.chapterId.localeCompare(b.entry.chapterId))
    .slice(0, limit)
    .map(({ entry, match }) => ({
      chapterId: entry.chapterId,
      num: entry.num,
      chapterTitle: entry.chapterTitle,
      anchor: entry.anchor,
      heading: entry.heading,
      ...snippet(entry, match),
    }));
}

export function searchGuide(query: string, options: SearchOptions = {}): SearchHit[] {
  const guide = loadGuide();
  return searchEntries(guide.searchIndex, query, options);
}

/** Group hits by chapter, keeping the ranking order of the first hit. */
export function groupHitsByChapter(
  hits: SearchHit[],
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
