import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  capturedReferences,
  guideNumbers,
  lintContent,
  README_STAT_LABELS,
  readmeStatValue,
  type LintOptions,
} from "../src/lib/content-lint";
import type { LoadedGuide } from "../src/lib/guide-types";

/**
 * One test per lint rule: the rule fires on an injected fault and stays silent
 * on the clean fixture. The clean fixture is two chapters that link to each
 * other and carry objectives, a recap, a quiz and an exercise, so the only
 * problem a test should ever see is the one it injected.
 */

interface Fixture {
  root: string;
  chaptersDir: string;
  capturedDir: string;
  files: Record<string, string>;
}

function makeFixture(extraFiles: Record<string, string> = {}): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rust-guide-lint-"));
  const chaptersDir = path.join(root, "chapters");
  const capturedDir = path.join(root, "captured");
  fs.mkdirSync(chaptersDir, { recursive: true });
  fs.mkdirSync(capturedDir, { recursive: true });
  const files: Record<string, string> = {
    "01-a.md": "Clean prose about variables and values.\n",
    "02-b.md": "Clean prose about functions and calls.\n",
    ...extraFiles,
  };
  for (const [name, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(chaptersDir, name), text);
  }
  return { root, chaptersDir, capturedDir, files };
}

type ChapterPatch = Record<string, unknown>;

function chapter(id: string, file: string, patch: ChapterPatch = {}): any {
  const isB = id === "b";
  return {
    id,
    file,
    kind: "chapter",
    title: `Title ${id}`,
    short: `Short ${id}`,
    time: 30,
    learnNodes: [[], [], []],
    blocks: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "Clean prose here." },
          {
            type: "internalLink",
            chapterId: isB ? "a" : "b",
            children: [{ type: "text", text: "link" }],
          },
        ],
      },
      { type: "callout", kind: "recap", blocks: [] },
      {
        type: "quiz",
        quizId: `${id}-q1`,
        questions: [{}, {}],
      },
      { type: "exercise", exerciseId: `${id}-x1` },
    ],
    ...patch,
  };
}

function makeGuide(chapters: any[], patch: Record<string, unknown> = {}): LoadedGuide {
  return {
    chapters,
    summaries: chapters.map((c) => ({ id: c.id, kind: c.kind })),
    glossary: {},
    stats: {
      totalChapters: chapters.length,
      trackedChapters: chapters.length,
      codeBlocks: 0,
      exercises: 0,
      questions: 0,
      projects: 0,
      totalMinutes: chapters.reduce((sum, c) => sum + (c.time ?? 0), 0),
    },
    searchIndex: [],
    ...patch,
  } as unknown as LoadedGuide;
}

function cleanGuide(patchA: ChapterPatch = {}, patchB: ChapterPatch = {}): LoadedGuide {
  return makeGuide([chapter("a", "01-a.md", patchA), chapter("b", "02-b.md", patchB)]);
}

function rulesFor(guide: LoadedGuide, fixture: Fixture, options: LintOptions = {}): string[] {
  const { problems } = lintContent(guide, {
    chaptersDir: fixture.chaptersDir,
    capturedDir: fixture.capturedDir,
    ...options,
  });
  return problems.map((problem) => problem.rule);
}

test("lint: the clean fixture produces no problems", () => {
  const fixture = makeFixture();
  assert.deepEqual(rulesFor(cleanGuide(), fixture), []);
});

test("lint: link/unknown-chapter fires on a link to a missing chapter", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [
          { type: "internalLink", chapterId: "nope", children: [] },
          { type: "internalLink", chapterId: "b", children: [] },
        ],
      },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("link/unknown-chapter"));
});

test("lint: link/unknown-route fires on a route the app does not have", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [
          { type: "routeLink", href: "/nope", children: [] },
          { type: "internalLink", chapterId: "b", children: [] },
        ],
      },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("link/unknown-route"));
});

test("lint: structure/objectives fires below three objectives", () => {
  const fixture = makeFixture();
  assert.ok(rulesFor(cleanGuide({ learnNodes: [[]] }), fixture).includes("structure/objectives"));
});

test("lint: structure/recap fires without a recap callout", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [{ type: "internalLink", chapterId: "b", children: [] }],
      },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("structure/recap"));
});

test("lint: structure/exercises fires without exercises", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [{ type: "internalLink", chapterId: "b", children: [] }],
      },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("structure/exercises"));
});

test("lint: structure/project-quiz is an error for a quizless project", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    kind: "project",
    blocks: [
      {
        type: "paragraph",
        children: [{ type: "internalLink", chapterId: "b", children: [] }],
      },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  const { problems } = lintContent(guide, {
    chaptersDir: fixture.chaptersDir,
    capturedDir: fixture.capturedDir,
  });
  const found = problems.find((p) => p.rule === "structure/project-quiz");
  assert.ok(found);
  assert.equal(found.severity, "error");
});

test("lint: structure/quiz fires for a chapter without questions", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [{ type: "internalLink", chapterId: "b", children: [] }],
      },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("structure/quiz"));
});

test("lint: meta/reading-time fires when declared time is far below the prose", () => {
  const fixture = makeFixture();
  const guide = cleanGuide({
    time: 5,
    blocks: [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "word ".repeat(6000) },
          { type: "internalLink", chapterId: "b", children: [] },
        ],
      },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("meta/reading-time"));
});

test("lint: meta/missing-file fires when a chapter file cannot be read", () => {
  const fixture = makeFixture();
  const guide = makeGuide([chapter("a", "99-missing.md"), chapter("b", "02-b.md")]);
  assert.ok(rulesFor(guide, fixture).includes("meta/missing-file"));
});

test("lint: text/placeholder fires on a leftover marker", () => {
  const fixture = makeFixture({ "01-a.md": "This section is a TODO item.\n" });
  assert.ok(rulesFor(cleanGuide(), fixture).includes("text/placeholder"));
});

test("lint: text/spelling fires on an American spelling", () => {
  const fixture = makeFixture({ "01-a.md": "The color of the value matters.\n" });
  assert.ok(rulesFor(cleanGuide(), fixture).includes("text/spelling"));
});

test("lint: meta/duplicate fires on a repeated title", () => {
  const fixture = makeFixture();
  const guide = makeGuide([
    chapter("a", "01-a.md"),
    chapter("b", "02-b.md", { title: "Title a", short: "Other short" }),
  ]);
  assert.ok(rulesFor(guide, fixture).includes("meta/duplicate"));
});

test("lint: graph/unreachable fires when nobody links to a chapter", () => {
  const fixture = makeFixture();
  const guide = makeGuide([
    chapter("a", "01-a.md", {
      blocks: [
        {
          type: "paragraph",
          children: [{ type: "internalLink", chapterId: "a", children: [] }],
        },
        { type: "callout", kind: "recap", blocks: [] },
        { type: "quiz", quizId: "a-q1", questions: [{}] },
        { type: "exercise", exerciseId: "a-x1" },
      ],
    }),
    chapter("b", "02-b.md"),
  ]);
  assert.ok(rulesFor(guide, fixture).includes("graph/unreachable"));
});

test("lint: graph/no-outgoing-link fires when a chapter links nowhere", () => {
  const fixture = makeFixture();
  const guide = makeGuide([
    chapter("a", "01-a.md"),
    chapter("b", "02-b.md", {
      blocks: [
        { type: "paragraph", children: [{ type: "text", text: "No links." }] },
        { type: "callout", kind: "recap", blocks: [] },
        { type: "quiz", quizId: "b-q1", questions: [{}] },
        { type: "exercise", exerciseId: "b-x1" },
      ],
    }),
  ]);
  assert.ok(rulesFor(guide, fixture).includes("graph/no-outgoing-link"));
});

test("lint: capture/orphan warns on a capture no auto block references", () => {
  const fixture = makeFixture();
  fs.writeFileSync(path.join(fixture.capturedDir, "deadbeefdeadbeef.txt"), "old\n");
  const rules = rulesFor(cleanGuide(), fixture);
  assert.ok(rules.includes("capture/orphan"));
});

test("lint: a documented archived capture is retained without a warning", () => {
  const fixture = makeFixture();
  fs.writeFileSync(path.join(fixture.capturedDir, "deadbeefdeadbeef.txt"), "old\n");
  const result = lintContent(cleanGuide(), {
    chaptersDir: fixture.chaptersDir,
    capturedDir: fixture.capturedDir,
    archivedCaptures: ["deadbeefdeadbeef"],
  });
  assert.equal(
    result.problems.some((problem) => problem.rule === "capture/orphan"),
    false,
  );
  assert.ok(result.info.includes("captured outputs: 1 documented historical orphan(s) retained"));
});

test("lint: capture/missing warns on an auto block without its capture", () => {
  const rust = ["fn main() {}", ""].join("\n");
  const fixture = makeFixture({
    "01-a.md": "```rust run\nfn main() {}\n```\n```output auto\n```\n",
  });
  const rules = rulesFor(cleanGuide(), fixture);
  assert.ok(rules.includes("capture/missing"));
  // The hash the lint computes is the one the parser would read.
  const refs = capturedReferences(fixture.chaptersDir, ["01-a.md", "02-b.md"]);
  const expected = crypto
    .createHash("sha1")
    .update("fn main() {}", "utf8")
    .digest("hex")
    .slice(0, 16);
  assert.ok(refs.referenced.has(expected), `expected ${expected} in references`);
  void rust;
});

test("lint: docs/stats fires on a stale README and is silent on a true one", () => {
  const fixture = makeFixture();
  const guide = cleanGuide();
  const readmePath = path.join(fixture.root, "README.md");

  fs.writeFileSync(readmePath, "| Published number | Count |\n| --- | ---: |\n");
  const stale = rulesFor(guide, fixture, {
    checkReadmeStats: true,
    readmePath,
  });
  assert.ok(stale.includes("docs/stats"));

  const numbers = guideNumbers(guide, {
    rustFences: 0,
    capturedOutputs: 0,
    autoBlocks: 0,
    glossaryLinked: 0,
    inboundEdges: 2,
    proseWords: 8,
    longSentences: 0,
  });
  const table = [
    "| Published number | Count |",
    "| --- | ---: |",
    ...README_STAT_LABELS.map((label) => `| ${label} | ${readmeStatValue(numbers, label)} |`),
  ].join("\n");
  fs.writeFileSync(readmePath, table);
  const fresh = rulesFor(guide, fixture, {
    checkReadmeStats: true,
    readmePath,
  });
  assert.ok(!fresh.includes("docs/stats"), `unexpected docs/stats: ${fresh}`);

  const startPath = path.join(fixture.chaptersDir, "00-start.md");
  fs.writeFileSync(
    startPath,
    "| Rust examples | 999 Rust listings across 888 code blocks |\n| Exercises & Quizzes | 77 worked exercises and 66 quiz questions |\n",
  );
  const staleStart = rulesFor(guide, fixture, {
    checkReadmeStats: true,
    readmePath,
  });
  assert.ok(staleStart.includes("docs/stats"));
});

test("lint: link/chapter-number inspects raw markdown even when AST label is rewritten", () => {
  const fixture = makeFixture({
    "01-a.md": "See [Chapter 99](#b) for details.\n",
    "02-b.md": "Back to [Chapter 1](#a).\n",
  });
  const guide = makeGuide([
    chapter("a", "01-a.md", {
      num: "01",
      blocks: [
        {
          type: "paragraph",
          children: [
            // Simulate parser rewriting AST label to "Chapter 2" while raw markdown has [Chapter 99](#b)
            {
              type: "internalLink",
              chapterId: "b",
              children: [{ type: "text", text: "Chapter 2" }],
            },
          ],
        },
        { type: "callout", kind: "recap", blocks: [] },
        { type: "quiz", quizId: "a-q1", questions: [{}] },
        { type: "exercise", exerciseId: "a-x1" },
      ],
    }),
    chapter("b", "02-b.md", { num: "02" }),
  ]);
  assert.ok(rulesFor(guide, fixture).includes("link/chapter-number"));

  // Updating raw markdown to match target num clears the error
  fs.writeFileSync(path.join(fixture.chaptersDir, "01-a.md"), "See [Chapter 2](#b) for details.\n");
  assert.equal(rulesFor(guide, fixture).includes("link/chapter-number"), false);
});

test("lint: glossary/duplicate fires on repeated glossary keys", () => {
  const fixture = makeFixture({
    "90-glossary.md":
      ":::glossary\nborrow :: first definition\nborrow :: duplicate definition\n:::\n",
  });
  const guide = makeGuide([
    chapter("a", "01-a.md", {
      blocks: [
        {
          type: "paragraph",
          children: [
            { type: "internalLink", chapterId: "b", children: [] },
            { type: "internalLink", chapterId: "glossary", children: [] },
          ],
        },
        { type: "callout", kind: "recap", blocks: [] },
        { type: "quiz", quizId: "a-q1", questions: [{}] },
        { type: "exercise", exerciseId: "a-x1" },
      ],
    }),
    chapter("b", "02-b.md"),
    chapter("glossary", "90-glossary.md", { kind: "appendix" }),
  ]);
  assert.ok(rulesFor(guide, fixture).includes("glossary/duplicate"));
});

test("lint: text/dismissive catches dismissive filler while allowing quoted or allowed phrases", () => {
  const fixture = makeFixture({
    "01-a.md": "You can simply run cargo build.\n",
  });
  assert.ok(rulesFor(cleanGuide(), fixture).includes("text/dismissive"));

  fs.writeFileSync(
    path.join(fixture.chaptersDir, "01-a.md"),
    'Avoid saying "simply run" and ensure the invariant is obviously correct.\n',
  );
  assert.equal(rulesFor(cleanGuide(), fixture).includes("text/dismissive"), false);
});

test("lint: docs/roadmap-part-title checks roadmap part headings against guide parts", () => {
  const fixture = makeFixture({
    "00b-roadmap.md": "## Part 1 — Wrong title\n",
  });
  const guide = makeGuide(
    [
      chapter("roadmap", "00b-roadmap.md", {
        kind: "orientation",
        blocks: [
          {
            type: "paragraph",
            children: [{ type: "internalLink", chapterId: "b", children: [] }],
          },
          { type: "callout", kind: "recap", blocks: [] },
        ],
      }),
      chapter("b", "02-b.md", {
        blocks: [
          {
            type: "paragraph",
            children: [{ type: "internalLink", chapterId: "roadmap", children: [] }],
          },
          { type: "callout", kind: "recap", blocks: [] },
          { type: "quiz", quizId: "b-q1", questions: [{}] },
          { type: "exercise", exerciseId: "b-x1" },
        ],
      }),
    ],
    { parts: [{ key: "p1", title: "Foundations" }] },
  );
  assert.ok(rulesFor(guide, fixture).includes("docs/roadmap-part-title"));

  fs.writeFileSync(path.join(fixture.chaptersDir, "00b-roadmap.md"), "## Part 1 — Foundations\n");
  assert.equal(rulesFor(guide, fixture).includes("docs/roadmap-part-title"), false);
});
