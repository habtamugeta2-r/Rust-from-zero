import assert from "node:assert/strict";
import { test } from "node:test";
import { expandWord, groupHitsByChapter, searchEntries, SYNONYMS } from "../src/lib/search";
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

test("search: short tokens require word-boundary or prefix match, not infix substring", () => {
  const entries = [
    entry({ chapterId: "infix", text: "We compute permutations in parallel." }),
    entry({ chapterId: "word", text: "Declare let mut count = 0;" }),
  ];
  const hits = searchEntries(entries, "mut");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].chapterId, "word");
});

test("search: caps query length at 120 chars and deduplicated tokens at 8", () => {
  const longQuery = `${"borrowing ".repeat(20)}nonexistenttokenbeyond120chars`;
  const hits = searchEntries(INDEX, longQuery);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].chapterId, "borrowing");

  const eightWords = "borrowing lets a function read value without owning nonexistent9thword";
  const cappedTokens = searchEntries(INDEX, eightWords);
  assert.equal(cappedTokens.length, 1);
  assert.equal(cappedTokens[0].chapterId, "borrowing");
});
