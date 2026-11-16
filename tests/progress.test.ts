import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookmarkedChapters,
  bucketChapters,
  buildChapterProgress,
  hasProgress,
  mergeProgress,
  nextChapter,
  parseProgressExport,
  serialiseProgress,
  summariseProgress,
  type ChapterMeta,
  type ProgressState,
} from "../src/lib/progress";
import { normaliseState } from "../src/components/GuideStateProvider";

const META: ChapterMeta = {
  id: "vars",
  num: "3",
  title: "Variables",
  short: "Variables",
  partTitle: "Part 1",
  kind: "chapter",
  level: "beginner",
  minutes: 25,
  quizzes: [{ id: "vars-q1", questions: 2 }],
  exercises: ["vars-x1", "vars-x2"],
};

const EMPTY: ProgressState = { done: {}, quiz: {}, saved: {}, bookmarks: {} };

test("progress: an untouched chapter is at 0%", () => {
  const row = buildChapterProgress(META, EMPTY);
  assert.equal(row.pct, 0);
  assert.equal(row.done, false);
  assert.equal(row.quizAnswered, 0);
});

test("progress: partial work scores the units it earned", () => {
  const state: ProgressState = {
    done: {},
    quiz: { "vars-q1": { "0": { picked: 1, correct: true } } },
    saved: { "vars-x1": 1 },
    bookmarks: { vars: 1 },
  };
  const row = buildChapterProgress(META, state);
  // 5 units (chapter + 2 questions + 2 exercises), 2 earned.
  assert.equal(row.pct, 40);
  assert.equal(row.quizCorrect, 1);
  assert.equal(row.bookmarked, true);
});

test("progress: incorrect quiz answers do not count toward completion", () => {
  const row = buildChapterProgress(META, {
    ...EMPTY,
    quiz: { "vars-q1": { "0": { picked: 1, correct: false } } },
  });
  assert.equal(row.quizAnswered, 1);
  assert.equal(row.quizCorrect, 0);
  assert.equal(row.pct, 0);

  const totals = summariseProgress([row]);
  assert.equal(totals.questionsAnswered, 1);
  assert.equal(totals.questionsCorrect, 0);
  assert.equal(totals.pct, 0);
});

test("progress: a finished chapter is at 100%", () => {
  const state: ProgressState = {
    done: { vars: 1 },
    quiz: {
      "vars-q1": {
        "0": { picked: 0, correct: true },
        "1": { picked: 2, correct: true },
      },
    },
    saved: { "vars-x1": 1, "vars-x2": 1 },
    bookmarks: {},
  };
  const row = buildChapterProgress(META, state);
  assert.equal(row.pct, 100);
  const buckets = bucketChapters([row]);
  assert.equal(buckets.completed.length, 1);
  assert.equal(buckets.completed[0].id, "vars");
  assert.equal(buckets.started.length, 0);
  const totals = summariseProgress([row]);
  assert.equal(totals.pct, 100);
  assert.equal(totals.accuracy, 100);
  assert.equal(totals.minutesRead, 25);
});

test("progress: appendix bookmarks stay visible without affecting course completion", () => {
  const appendix: ChapterMeta = {
    ...META,
    id: "glossary",
    num: "A",
    title: "Glossary",
    short: "Glossary",
    partTitle: "Appendices",
    kind: "appendix",
    quizzes: [],
    exercises: [],
  };
  const row = buildChapterProgress(appendix, {
    ...EMPTY,
    bookmarks: { glossary: 1 },
  });

  assert.deepEqual(
    bookmarkedChapters([row]).map((chapter) => chapter.id),
    ["glossary"],
  );
  assert.equal(summariseProgress([row]).chaptersTotal, 0);
  assert.equal(summariseProgress([row]).bookmarksTotal, 1);
  assert.equal(nextChapter([row]), null);
  assert.deepEqual(bucketChapters([row]), {
    completed: [],
    started: [],
    untouched: [],
  });
});

test("progress: totals with no answers give null accuracy", () => {
  const totals = summariseProgress([buildChapterProgress(META, EMPTY)]);
  assert.equal(totals.accuracy, null);
  assert.equal(totals.pct, 0);
  assert.equal(nextChapter([buildChapterProgress(META, EMPTY)])?.id, "vars");
  const { completed, started, untouched } = bucketChapters([buildChapterProgress(META, EMPTY)]);
  assert.equal(completed.length, 0);
  assert.equal(started.length, 0);
  assert.equal(untouched.length, 1);
});

test("progress: 2.0.0 answers (bare indices) count as answered, never correct", () => {
  const parsed = parseProgressExport(
    JSON.stringify({
      format: "rust-from-zero-progress",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      state: { quiz: { "vars-q1": { "0": 1 } } },
    }),
  );
  assert.ok(parsed.ok);
  const row = buildChapterProgress(META, {
    ...EMPTY,
    quiz: parsed.state.quiz,
  });
  assert.equal(row.quizAnswered, 1);
  assert.equal(row.quizCorrect, 0);
});

test("progress: an export round-trips through serialise and parse", () => {
  const state = {
    done: { vars: 1 },
    quiz: { "vars-q1": { "0": { picked: 1, correct: true } } },
    saved: { "vars-x1": 1 },
    bookmarks: { vars: 1 },
    last: "vars",
    theme: "dark",
    fs: 20,
  };
  const parsed = parseProgressExport(
    serialiseProgress(state, new Date("2026-01-01T00:00:00.000Z")),
  );
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.state.done, state.done);
  assert.deepEqual(parsed.state.quiz, state.quiz);
  assert.deepEqual(parsed.state.saved, state.saved);
  assert.deepEqual(parsed.state.bookmarks, state.bookmarks);
  assert.equal(parsed.state.theme, "dark");
  assert.equal(parsed.state.fs, 20);
  assert.equal(hasProgress(parsed.state), true);
  assert.equal(hasProgress(EMPTY), false);
});

test("progress: invalid exports are rejected with a reason", () => {
  assert.equal(parseProgressExport("not json").ok, false);
  assert.equal(parseProgressExport(JSON.stringify({ format: "other", version: 1 })).ok, false);
  assert.equal(
    parseProgressExport(
      JSON.stringify({ format: "rust-from-zero-progress", version: 99, state: {} }),
    ).ok,
    false,
  );
  assert.equal(
    parseProgressExport(
      JSON.stringify({
        format: "rust-from-zero-progress",
        version: 1,
        state: { done: { vars: "yes" } },
      }),
    ).ok,
    false,
  );
});

test("progress: exports reject invalid indices, non-integer settings, zero markers and arrays", () => {
  const wrap = (state: unknown) =>
    JSON.stringify({
      format: "rust-from-zero-progress",
      version: 1,
      state,
    });
  const invalidStates = [
    { quiz: { "vars-q1": { "0": { picked: -1 } } } },
    { quiz: { "vars-q1": { "0": { picked: 1.5 } } } },
    { quiz: { "vars-q1": { "-1": { picked: 0 } } } },
    { quiz: [] },
    { done: [] },
    { saved: { "vars-x1": 0 } },
    { bookmarks: { vars: -1 } },
    { done: { vars: 1.5 } },
    { fs: 18.5 },
    { fs: "18" },
  ];
  for (const state of invalidStates) {
    assert.equal(parseProgressExport(wrap(state)).ok, false, JSON.stringify(state));
  }

  const valid = parseProgressExport(
    wrap({ quiz: { "vars-q1": { "0": { picked: 0, correct: true } } }, fs: 18 }),
  );
  assert.ok(valid.ok);
  assert.equal(valid.state.quiz["vars-q1"]["0"].picked, 0);
  assert.equal(valid.state.fs, 18);
});

test("progress: local storage normalisation ignores arrays masquerading as state maps", () => {
  assert.deepEqual(normaliseState([]), {
    done: {},
    saved: {},
    quiz: {},
    bookmarks: {},
    last: undefined,
    theme: undefined,
    fs: undefined,
  });
  assert.deepEqual(
    normaliseState({ done: ["vars"], saved: ["vars-x1"], quiz: [], bookmarks: ["vars"] }),
    {
      done: {},
      saved: {},
      quiz: {},
      bookmarks: {},
      last: undefined,
      theme: undefined,
      fs: undefined,
    },
  );
});

test("progress: merging keeps local work and adds imported work", () => {
  const local = {
    done: { vars: 1 },
    quiz: { "vars-q1": { "0": { picked: 0, correct: true } } },
    saved: {},
    bookmarks: {},
  };
  const imported = {
    done: { other: 1 },
    quiz: { "vars-q1": { "0": { picked: 1, correct: false }, "1": { picked: 2, correct: true } } },
    saved: { "vars-x1": 1 },
    bookmarks: { other: 1 },
  };
  const merged = mergeProgress(local, imported);
  assert.deepEqual(merged.done, { vars: 1, other: 1 });
  // The local answer wins where both machines answered the same question.
  assert.equal(merged.quiz["vars-q1"]["0"].picked, 0);
  assert.equal(merged.quiz["vars-q1"]["1"].picked, 2);
  assert.deepEqual(merged.saved, { "vars-x1": 1 });
});
