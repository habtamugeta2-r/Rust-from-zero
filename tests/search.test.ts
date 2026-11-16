import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandWord,
  groupHitsByChapter,
  MAX_QUERY_LENGTH,
  MAX_QUERY_WORDS,
  patternCacheSize,
  queryWords,
  searchEntries,
  SYNONYMS,
} from "../src/lib/search";
import type { SearchEntry } from "../src/lib/guide-types";

function entry(partial: Partial<SearchEntry>): SearchEntry {
  const text = partial.text ?? "";
  return {
    chapterId: "chapter",
    num: "1",
    chapterTitle: "Chapter",
    anchor: "",
    heading: "",
    text,
    lower: text.toLowerCase(),
    weight: 10,
    ...partial,
  };
}

const INDEX: SearchEntry[] = [
  entry({
    chapterId: "borrowing",
    chapterTitle: "Borrowing",
    anchor: "borrowing--rules",
    heading: "The rules",
    text: "Borrowing lets a function read a value without owning it. A reference is a pointer Rust guarantees to be valid.",
    weight: 20,
  }),
  entry({
    chapterId: "variables",
    chapterTitle: "Variables",
    anchor: "variables--mut",
    heading: "Changing a value",
    text: "Mutability is opt-in: a variable marked mut may change, and every other variable is immutable.",
    weight: 20,
  }),
  entry({
    chapterId: "ownership",
    chapterTitle: "Ownership",
    anchor: "ownership--moves",
    heading: "Moves",
    text: "An assignment moves ownership. The old variable becomes unusable, so there is never a second owner.",
    weight: 20,
  }),
];

test("search: a whole-word match outranks a substring match", () => {
  const hits = searchEntries(
    [
      entry({ chapterId: "a", text: "Ownership is the central rule.", weight: 10 }),
      entry({ chapterId: "b", text: "A ship sails ownerships daily.", weight: 10 }),
    ],
    "ownership",
  );
  assert.equal(hits[0].chapterId, "a");
});

test("search: prefix matching finds borrowing from `borrow`", () => {
  const hits = searchEntries(INDEX, "borrow");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].chapterId, "borrowing");
  assert.match(hits[0].match.toLowerCase(), /^borrow/);
});

test("search: synonyms expand `mut` to the guide's own words", () => {
  assert.deepEqual(expandWord("mut"), ["mut", ...SYNONYMS.mut]);
  const hits = searchEntries(INDEX, "mut");
  assert.ok(hits.some((hit) => hit.chapterId === "variables"));
});

test("search: every query word must match", () => {
  const hits = searchEntries(INDEX, "borrowing valid");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((hit) => hit.chapterId === "borrowing"));
  assert.equal(searchEntries(INDEX, "borrowing spaceship").length, 0);
});

test("search: the snippet highlights the matched surface form", () => {
  const hits = searchEntries(INDEX, "borrow");
  assert.ok(hits[0].match.length > 0);
  assert.ok((hits[0].before + hits[0].match + hits[0].after).length > hits[0].match.length);
});

test("search: an empty query returns nothing and the limit is honoured", () => {
  assert.deepEqual(searchEntries(INDEX, "   "), []);
  assert.equal(searchEntries(INDEX, "a", { limit: 1 }).length, 1);
});

test("search: hits group by chapter in ranking order", () => {
  const hits = searchEntries(INDEX, "value");
  const groups = groupHitsByChapter(hits);
  assert.equal(
    groups.reduce((sum, group) => sum + group.hits.length, 0),
    hits.length,
  );
  assert.equal(groups[0].chapterId, hits[0].chapterId);
});

test("search: a query is capped in length and in distinct words", () => {
  // 400 characters of padding and twelve distinct words: only the first eight
  // words of the first 120 characters may reach the matcher.
  const words = queryWords(
    "mut " + "x ".repeat(300) + "ownership borrowing value function module trait generic macro",
  );
  assert.ok(words.length <= MAX_QUERY_WORDS, `got ${words.length} words`);
  assert.equal(words[0], "mut");
  for (const word of words) assert.ok(word.length <= MAX_QUERY_LENGTH);
  assert.deepEqual(queryWords("mut mut mut"), ["mut"]);
  assert.deepEqual(queryWords("   "), []);
});

test("search: a truncated query keeps whole words and drops a giant blob", () => {
  const long = "ownership borrowing lifetimes ".repeat(20);
  assert.deepEqual(queryWords(long), ["ownership", "borrowing", "lifetimes"]);
  // A single unbroken token longer than any indexed word is a paste accident.
  assert.deepEqual(queryWords("a".repeat(300)), []);
});

test("search: short tokens do not match inside longer words", () => {
  const index = [
    entry({ chapterId: "cost", text: "The cost of a copy is low, and a loss is rare." }),
    entry({ chapterId: "os", text: "The operating system schedules the work." }),
  ];
  // `os` used to match *cost* and *loss* as a substring; now it needs a word
  // boundary or a word prefix, so only the real entry matches.
  const hits = searchEntries(index, "os");
  assert.deepEqual(
    hits.map((hit) => hit.chapterId),
    ["os"],
  );
  // Four characters or more may still match infix, so `yst` finds *system*.
  assert.ok(searchEntries(index, "ystem").length > 0);
});

test("search: the pattern cache is bounded and reused", () => {
  // Many distinct words must not grow the cache without limit.
  for (let i = 0; i < 700; i += 1) {
    searchEntries(INDEX, `word${i}`);
  }
  assert.ok(patternCacheSize() <= 500, `cache grew to ${patternCacheSize()}`);
});
