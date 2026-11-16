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
    num: isB ? "2" : "1",
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
});

test("lint: link/chapter-number reads the raw markdown, not the parsed label", () => {
  // The parser rewrites `[Chapter 6](#control-flow)` to the live number while it
  // builds the AST, so an AST-level check can never see a stale label. This
  // exercises the raw-source path that actually catches them.
  const guide = cleanGuide({
    blocks: [
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  const source = (label: string) => `# A\n\nSee [${label}](#b).\n`;
  const rulesForSource = (label: string): string[] => {
    const fx = makeFixture({ "01-a.md": source(label) });
    return rulesFor(guide, fx);
  };
  assert.ok(rulesForSource("Chapter 9").includes("link/chapter-number"));
  // "Chapter 2" is how a reader meets chapter 02: the leading zero is not a
  // mismatch, and a correct label must never fire.
  assert.ok(!rulesForSource("Chapter 2").includes("link/chapter-number"));
  assert.ok(!rulesForSource("chapter 2").includes("link/chapter-number"));
});

test("lint: docs/start-stats fires when chapter 0 advertises a stale count", () => {
  const table = (listings: number, blocks: number, exercises: number, quizzes: number) =>
    "# How to use\n\n" +
    `| Rust examples | ${listings} Rust listings across ${blocks} code blocks |\n` +
    `| Exercises & Quizzes | ${exercises} worked exercises and ${quizzes} instant-feedback quiz questions |\n`;
  // The fixture tree has no code blocks, exercises or questions, so any
  // non-zero number in the table is a claim the parser cannot support.
  const stale = makeFixture({ "00-start.md": table(991, 1308, 274, 351) });
  const guide = makeGuide([chapter("start", "00-start.md"), chapter("b", "02-b.md")]);
  const rules = rulesFor(guide, stale);
  assert.ok(rules.includes("docs/start-stats"), `expected docs/start-stats in ${rules}`);

  const truthful = makeFixture({ "00-start.md": table(0, 0, 0, 0) });
  const fixed = rulesFor(guide, truthful);
  assert.ok(!fixed.includes("docs/start-stats"), `unexpected on the true table: ${fixed}`);
});

test("lint: code/playground-too-long fires on a listing a browser cannot open", () => {
  const fixture = makeFixture();
  const longCode = `fn main() {\n${"    // padding padding padding padding padding\n".repeat(160)}}\n`;
  const guide = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [{ type: "internalLink", chapterId: "b", children: [] }],
      },
      { type: "code", lang: "rust", kind: "run", code: longCode, noPlay: false, isExt: false },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(rulesFor(guide, fixture).includes("code/playground-too-long"));

  // The same listing with `noplay` is legal: that is the fix the rule asks for.
  const fixed = cleanGuide({
    blocks: [
      {
        type: "paragraph",
        children: [{ type: "internalLink", chapterId: "b", children: [] }],
      },
      { type: "code", lang: "rust", kind: "run", code: longCode, noPlay: true, isExt: false },
      { type: "callout", kind: "recap", blocks: [] },
      { type: "quiz", quizId: "a-q1", questions: [{}] },
      { type: "exercise", exerciseId: "a-x1" },
    ],
  });
  assert.ok(!rulesFor(fixed, fixture).includes("code/playground-too-long"));
});

test("lint: docs/roadmap-part-title keeps the roadmap in step with guide-config", () => {
  const fixture = makeFixture({ "01-a.md": "# A\n\nClean prose.\n" });
  const guide = makeGuide([chapter("roadmap", "01-a.md")], {
    parts: [
      { key: "welcome", title: "Start here", partLabel: "", partTitle: "Start here" },
      { key: "p1", title: "Core Rust fundamentals", partLabel: "Part 1", partTitle: "" },
    ],
  });
  const heading = (title: string) => `# A\n\n## Part 1 \u2014 ${title}\n\nClean prose.\n`;

  // The roadmap writes the same words as the config, so the part number the
  // reader sees in navigation matches the map.
  fs.writeFileSync(path.join(fixture.chaptersDir, "01-a.md"), heading("Core Rust fundamentals"));
  assert.ok(!rulesFor(guide, fixture).includes("docs/roadmap-part-title"));

  fs.writeFileSync(path.join(fixture.chaptersDir, "01-a.md"), heading("Core Rust everything"));
  assert.ok(rulesFor(guide, fixture).includes("docs/roadmap-part-title"));
});

test("lint: text/dismissive warns on reader-facing filler", () => {
  const fixture = makeFixture();
  const guide = cleanGuide();
  const body = (prose: string) =>
    `# A\n\n${prose}\n\n` +
    ":::recap\nDone.\n:::\n\n:::quiz Q\n? What?\n- no\n+ yes\n= because\n:::\n\n:::exercise X\n:::\n";
  const prose = (text: string): string => {
    fs.writeFileSync(path.join(fixture.chaptersDir, "01-a.md"), body(text));
    return rulesFor(guide, fixture).join(" ");
  };
  assert.ok(prose("Now just add the new field.").includes("text/dismissive"));
  assert.ok(prose("The counter obviously ran out.").includes("text/dismissive"));
  // "merely" is a statement about the machine, not about the reader.
  assert.ok(!prose("The counter simply ran out.").includes("text/dismissive"));
});
