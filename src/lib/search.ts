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
export const MAX_QUERY_LENGTH = 120;
export const MAX_QUERY_TOKENS = 8;

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
  /** True when the matched word is the exact token the user typed. */
  exactToken?: boolean;
}

interface CompiledCandidate {
  word: string;
  isOriginal: boolean;
  whole: RegExp;
  prefix: RegExp;
  allowPrefix: boolean;
  allowInfix: boolean;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WORD_REGEX_CACHE = new Map<string, { whole: RegExp; prefix: RegExp }>();

function getWordRegexes(word: string): { whole: RegExp; prefix: RegExp } {
  let cached = WORD_REGEX_CACHE.get(word);
  if (!cached) {
    const escaped = escapeRegExp(word);
    cached = {
      whole: new RegExp(`(^|[^a-z0-9])(${escaped})(?![a-z0-9])`, "i"),
      prefix: new RegExp(`(^|[^a-z0-9])(${escaped}[a-z0-9]*)`, "i"),
    };
    WORD_REGEX_CACHE.set(word, cached);
  }
  return cached;
}

// Pre-compile all synonym keys and expansions at module load time.
for (const [key, expansions] of Object.entries(SYNONYMS)) {
  getWordRegexes(key);
  for (const synonym of expansions) {
    getWordRegexes(synonym);
  }
}

function compileQueryWord(queryWord: string): CompiledCandidate[] {
  const isSynonymKey = Object.prototype.hasOwnProperty.call(SYNONYMS, queryWord);
  return expandWord(queryWord).map((word) => {
    const { whole, prefix } = getWordRegexes(word);
    const isShort = word.length <= 3;
    return {
      word,
      isOriginal: word === queryWord,
      whole,
      prefix,
      allowPrefix: !(isShort && word === queryWord && isSynonymKey),
      allowInfix: !isShort,
    };
  });
}

/** Best match of one query word (with synonyms) against one entry. */
function matchCompiledWord(entry: SearchEntry, candidates: CompiledCandidate[]): Match | null {
  let best: Match | null = null;
  for (const candidate of candidates) {
    const whole = candidate.whole.exec(entry.lower);
    if (whole) {
      const match: Match = {
        surface: whole[2],
        index: whole.index + whole[1].length,
        strength: 3,
        exactToken: candidate.isOriginal,
      };
      if (
        !best ||
        match.strength > best.strength ||
        (match.strength === best.strength && match.exactToken && !best.exactToken)
      ) {
        best = match;
      }
      continue;
    }
    if (candidate.allowPrefix) {
      const prefix = candidate.prefix.exec(entry.lower);
      if (prefix) {
        const match: Match = {
          surface: prefix[2],
          index: prefix.index + prefix[1].length,
          strength: 2,
          exactToken: candidate.isOriginal,
        };
        if (!best || match.strength > best.strength) best = match;
        continue;
      }
    }
    if (candidate.allowInfix) {
      const index = entry.lower.indexOf(candidate.word);
      if (index >= 0) {
        const match: Match = {
          surface: entry.text.slice(index, index + candidate.word.length),
          index,
          strength: 1,
          exactToken: candidate.isOriginal,
        };
        if (!best || match.strength > best.strength) best = match;
      }
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
  const capped = query.trim().slice(0, MAX_QUERY_LENGTH);
  const words = Array.from(new Set(capped.toLowerCase().split(/\s+/).filter(Boolean))).slice(
    0,
    MAX_QUERY_TOKENS,
  );
  if (words.length === 0) return [];

  const compiledWords = words.map(compileQueryWord);
  const limit = options.limit ?? 40;
  const best = new Map<string, { score: number; entry: SearchEntry; match: Match }>();

  for (const entry of entries) {
    let strength = 0;
    let firstMatch: Match | null = null;
    let matchesAll = true;
    for (const candidates of compiledWords) {
      const match = matchCompiledWord(entry, candidates);
      if (!match) {
        matchesAll = false;
        break;
      }
      strength += match.strength + (match.exactToken && match.strength === 3 ? 1 : 0);
      if (!firstMatch) firstMatch = match;
    }
    if (!matchesAll || !firstMatch) continue;

    const startsBonus =
      firstMatch.index === 0 && firstMatch.strength === 3 && firstMatch.exactToken
        ? 18
        : entry.lower.startsWith(words[0])
          ? 5
          : 0;
    const score = entry.weight + strength * 2 + startsBonus - Math.min(4, entry.text.length / 200);
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
