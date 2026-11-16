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

/**
 * Limits that keep one request cheap. The index is 14k entries, so every word
 * is matched against all of them: an unbounded query is a free denial of
 * service on a shared deployment, and a longer one was never more useful.
 */
export const MAX_QUERY_LENGTH = 120;
/** Distinct query words considered. Eight is already a very narrow phrase. */
export const MAX_QUERY_WORDS = 8;
/**
 * Longest single token kept. No word the guide indexes is this long; a
 * 110-character blob is a paste accident (a hash, a URL), and building a
 * regular expression from it would be the only cost it ever adds.
 */
export const MAX_TOKEN_LENGTH = 40;
/** Shortest query the API will answer, matching the palette's own threshold. */
export const MIN_QUERY_LENGTH = 2;

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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A word's two boundary patterns, built once and reused for every entry. */
interface WordPatterns {
  whole: RegExp;
  prefix: RegExp;
}

/**
 * Compiled patterns, keyed by word. Building a `RegExp` per entry per query
 * word was the whole cost of a search: the index is 14k entries, so a
 * three-word query built tens of thousands of identical patterns. There are
 * only ever a few hundred distinct words (the query words and their synonyms),
 * so one cache makes the loop a set of `exec` calls.
 */
const PATTERN_CACHE = new Map<string, WordPatterns>();
/** Bound on the cache, so a bot cannot grow it with arbitrary long queries. */
const PATTERN_CACHE_LIMIT = 500;

function patternsFor(word: string): WordPatterns {
  const cached = PATTERN_CACHE.get(word);
  if (cached) return cached;
  const escaped = escapeRegExp(word);
  const patterns: WordPatterns = {
    whole: new RegExp(`(^|[^a-z0-9])(${escaped})(?![a-z0-9])`, "i"),
    prefix: new RegExp(`(^|[^a-z0-9])(${escaped}[a-z0-9]*)`, "i"),
  };
  if (PATTERN_CACHE.size >= PATTERN_CACHE_LIMIT) PATTERN_CACHE.clear();
  PATTERN_CACHE.set(word, patterns);
  return patterns;
}

/** Distinct patterns currently cached. Exported so the limit can be tested. */
export function patternCacheSize(): number {
  return PATTERN_CACHE.size;
}

/**
 * Below this length a token is too common as a fragment (`os` inside *cost*,
 * `pin` inside *spinner*) for an infix match to mean anything, so short tokens
 * must match a word boundary or a word prefix.
 */
const MIN_INFIX_LENGTH = 4;

/** Best match of one query word (with synonyms) against one entry. */
function matchWord(entry: SearchEntry, queryWord: string): Match | null {
  let best: Match | null = null;
  for (const word of expandWord(queryWord)) {
    const patterns = patternsFor(word);
    const whole = patterns.whole.exec(entry.lower);
    if (whole) {
      const candidate: Match = {
        surface: whole[2],
        index: whole.index + whole[1].length,
        strength: 3,
      };
      if (!best || candidate.strength > best.strength) best = candidate;
      continue;
    }
    const prefix = patterns.prefix.exec(entry.lower);
    if (prefix) {
      const candidate: Match = {
        surface: prefix[2],
        index: prefix.index + prefix[1].length,
        strength: 2,
      };
      if (!best || candidate.strength > best.strength) best = candidate;
      continue;
    }
    if (word.length < MIN_INFIX_LENGTH) continue;
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

/**
 * The distinct words of a query, lower-cased and capped: the first
 * {@link MAX_QUERY_LENGTH} characters, at most {@link MAX_QUERY_WORDS} distinct
 * words. Truncation cuts at a word boundary where it can, so a long paste does
 * not end in half a word.
 */
export function queryWords(query: string): string[] {
  let text = query.trim();
  if (text.length > MAX_QUERY_LENGTH) {
    text = text.slice(0, MAX_QUERY_LENGTH);
    const lastSpace = text.lastIndexOf(" ");
    if (lastSpace > MAX_QUERY_LENGTH * 0.5) text = text.slice(0, lastSpace);
  }
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0 && word.length <= MAX_TOKEN_LENGTH);
  return Array.from(new Set(words)).slice(0, MAX_QUERY_WORDS);
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
  const words = queryWords(query);
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
