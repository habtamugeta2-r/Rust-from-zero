import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { glossaryTipsFor, inlinePlainText, loadGuide } from "../src/lib/guide-parser";
import type { BlockNode } from "../src/lib/guide-types";

const RUST_LINES = ["fn main() {", '    println!("hi");', "}"];
const RUST_HASH = crypto
  .createHash("sha1")
  .update(RUST_LINES.join("\n"), "utf8")
  .digest("hex")
  .slice(0, 16);

function fixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rust-guide-fixture-"));
  const chaptersDir = path.join(root, "guide-src", "chapters");
  const capturedDir = path.join(root, "guide-src", "captured");
  fs.mkdirSync(chaptersDir, { recursive: true });
  fs.mkdirSync(capturedDir, { recursive: true });

  fs.writeFileSync(
    path.join(chaptersDir, "01-fixture.md"),
    `@id fixture
@part p1
@title Fixture chapter
@short Fixture
@level beginner
@time 30
@learn One | Two | Three

## First heading

A paragraph about [[borrowing]] and [[nosuchterm]], linking to [the second chapter](#second).

---

> A quoted paragraph.

- one
- two

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`rust run
${RUST_LINES.join("\n")}
\`\`\`
\`\`\`output auto
\`\`\`

:::analogy A useful comparison
Think of a bridge.
:::

:::recap
- The main point.
:::

:::details More detail
Hidden words.
:::

:::quiz Check
? Which answer is right?
- The wrong one
+ The right one
= Because the fixture says so.
:::

:::exercise guided Try it
Do the thing.
::hint
Start small.
::solution
The worked answer.
:::

:::checklist
- First item
- Second item
:::

:::stepper Steps
\`\`\`rust
fn main() {}
\`\`\`
1 | [main] a = 5 !new | - | The program starts.
:::

![A fixture diagram](/images/fixture.svg "The fixture figure")

\`\`\`flame A caption
main | 100 | main
  child | 40 | child
\`\`\`
`,
  );

  fs.writeFileSync(
    path.join(chaptersDir, "02-second.md"),
    `@id second
@part p1
@title Second chapter
@short Second
@level beginner
@time 20
@learn One | Two | Three

Back to [the fixture](#fixture).
`,
  );

  fs.writeFileSync(
    path.join(chaptersDir, "90-glossary.md"),
    `@id glossary
@part app
@kind appendix
@title Glossary
@short Glossary
@level all

:::glossary
borrowing :: Using a value through a reference.
:::
`,
  );

  fs.writeFileSync(path.join(capturedDir, `${RUST_HASH}.txt`), "hi\n");

  const imagesDir = path.join(root, "public", "images");
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.writeFileSync(
    path.join(imagesDir, "fixture.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
  );
  return root;
}

function blockTypes(blocks: BlockNode[]): Set<string> {
  const types = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.type === "string") types.add(record.type);
    for (const value of Object.values(record)) visit(value);
  };
  visit(blocks);
  return types;
}

test("parser: a fixture chapter yields every block type", () => {
  const guide = loadGuide(true, fixtureRoot());
  const fixture = guide.chapterMap["fixture"];
  assert.ok(fixture, "fixture chapter is loaded");
  const types = blockTypes(fixture.blocks);
  for (const expected of [
    "heading",
    "paragraph",
    "hr",
    "blockquote",
    "list",
    "table",
    "code",
    "callout",
    "details",
    "quiz",
    "exercise",
    "checklist",
    "stepper",
    "flame",
    "figure",
  ]) {
    assert.ok(types.has(expected), `missing block type ${expected}`);
  }
  const glossary = guide.chapterMap["glossary"];
  assert.ok(blockTypes(glossary.blocks).has("glossary"));
});

test("parser: an `auto` block is filled from its capture", () => {
  const guide = loadGuide(true, fixtureRoot());
  const fixture = guide.chapterMap["fixture"];
  const codes = fixture.blocks.filter((block) => block.type === "code");
  const output = codes.find((block) => block.type === "code" && block.isOutput);
  assert.ok(output && output.type === "code");
  assert.equal(output.code, "hi");
});

test("parser: a figure keeps its src, alt text and caption", () => {
  const guide = loadGuide(true, fixtureRoot());
  const fixture = guide.chapterMap["fixture"];
  const figure = fixture.blocks.find((block) => block.type === "figure");
  assert.ok(figure && figure.type === "figure");
  assert.equal(figure.src, "/images/fixture.svg");
  assert.equal(figure.alt, "A fixture diagram");
  assert.ok(
    !guide.warnings.some((warning) => warning.includes("figure image not found")),
    `an existing image must not warn, got: ${guide.warnings.join("; ")}`,
  );
});

test("parser: a figure whose image is missing is a warning", () => {
  const root = fixtureRoot();
  const second = path.join(root, "guide-src", "chapters", "02-second.md");
  fs.appendFileSync(second, "\n![A missing diagram](/images/nope.svg)\n");
  const guide = loadGuide(true, root);
  assert.ok(
    guide.warnings.some((warning) => warning.includes("figure image not found")),
    `expected a missing-figure warning, got: ${guide.warnings.join("; ")}`,
  );
});

test("parser: an unknown glossary term is a warning, a known one is not", () => {
  const guide = loadGuide(true, fixtureRoot());
  assert.ok(
    guide.warnings.some((warning) => warning.includes("[[nosuchterm]]")),
    `expected an unknown-term warning, got: ${guide.warnings.join("; ")}`,
  );
  assert.ok(
    !guide.warnings.some((warning) => warning.includes("[[borrowing]]")),
    "the defined term must not warn",
  );
});

test("parser: fixture statistics count exercises, questions and code", () => {
  const guide = loadGuide(true, fixtureRoot());
  assert.equal(guide.stats.exercises, 1);
  assert.equal(guide.stats.questions, 1);
  assert.ok(guide.stats.codeBlocks >= 1);
  assert.equal(guide.stats.totalChapters, 3);
});

test("parser: a chapter's tooltip glossary is only what its prose links", () => {
  const guide = loadGuide();
  const chapter = guide.chapterMap.terms ?? guide.chapterMap.variables;
  const tips = glossaryTipsFor(chapter.id);
  const keys = Object.keys(tips);
  assert.ok(keys.length > 0, "the chapter links at least one term");
  assert.ok(keys.length < Object.keys(guide.glossary).length, "and not the whole glossary");
  for (const [key, tip] of Object.entries(tips)) {
    assert.equal(tip.key, key);
    assert.equal(tip.term, guide.glossary[key].term);
    assert.equal(tip.definitionPlain, guide.glossary[key].definitionPlain);
  }
  // Every key really does occur as a `term` node in the chapter tree.
  const referenced = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    const record = node as Record<string, unknown>;
    if (record.type === "term" && typeof record.key === "string") referenced.add(record.key);
    for (const [k, v] of Object.entries(record)) if (k !== "parent") visit(v);
  };
  visit(chapter.blocks);
  for (const key of keys) assert.ok(referenced.has(key), `${key} is not linked from the chapter`);
});

test("parser: runnable wrappers live in the index, not on the block", () => {
  const guide = loadGuide();
  const wrappers = Object.entries(guide.wrappers);
  assert.ok(wrappers.length > 0, "the guide has at least one wrapped listing");
  assert.ok(guide.searchIndex.length > 0);
  let wrapped = 0;
  let leaked = 0;
  for (const chapter of guide.chapters) {
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      const record = node as Record<string, unknown>;
      if (record.type === "code") {
        if (record.hasFullCode) wrapped += 1;
        // The wrapper text itself must never be on the block: that is what
        // used to double the size of the largest pages.
        if ("fullCode" in record) leaked += 1;
      }
      for (const [k, v] of Object.entries(record)) if (k !== "parent") visit(v);
    };
    visit(chapter.blocks);
  }
  assert.ok(wrapped > 0, "some block is marked as having a wrapper");
  assert.equal(leaked, 0, "no block carries its wrapper inline");
  for (const [hash, code] of wrappers) {
    assert.match(hash, /^[0-9a-f]{16}$/);
    assert.ok(code.length > 0);
  }
});

test("parser: a route link keeps its visible text", () => {
  const guide = loadGuide();
  const find = (nodes: any[]): string[] => {
    const out: string[] = [];
    const visit = (node: any): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (node.type === "routeLink") {
        const text = inlinePlainText(node.children);
        assert.ok(text.length > 0, `${node.href} lost its text`);
        out.push(node.href);
      }
      for (const [k, v] of Object.entries(node)) if (k !== "parent") visit(v);
    };
    visit(nodes);
    return out;
  };
  const hrefs = guide.chapters.flatMap((ch) => find(ch.blocks));
  assert.ok(hrefs.length >= 2, "the guide links to /progress and /search from prose");
  // And the text a reader sees survives into the plain-text helper.
  const roadmap = guide.chapterMap.roadmap;
  const text = roadmap.blocks.flatMap((block) => JSON.stringify(block)).join(" ");
  assert.ok(text.includes("routeLink"));
});

test("parser: a fenced block inside a quote keeps its indentation", () => {
  const next = loadGuide().chapterMap.next;
  const quoted: any[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "blockquote") quoted.push(node);
    for (const [k, v] of Object.entries(node)) if (k !== "parent") visit(v);
  };
  visit(next.blocks);
  assert.ok(quoted.length > 0, "the chapter has a quoted example");
  const code = quoted
    .flatMap((quote) => quote.blocks)
    .find((block: any) => block.type === "code" && block.lang === "rust");
  assert.ok(code, "the quote contains a Rust listing");
  // The body was indented inside `fn main`, and that nesting must survive.
  assert.match(code.code, /\n {4}\S/);
});

test("parser: a flame graph with a zero parent share cannot produce NaN", () => {
  const guide = loadGuide();
  const flames: any[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === "flame") flames.push(node);
    for (const [k, v] of Object.entries(node)) if (k !== "parent") visit(v);
  };
  for (const chapter of guide.chapters) visit(chapter.blocks);
  assert.ok(flames.length > 0);
  const check = (node: any): void => {
    assert.ok(Number.isFinite(node.widthPct), `widthPct is ${node.widthPct}`);
    assert.ok(node.widthPct >= 0 && node.widthPct <= 100);
    for (const child of node.children) check(child);
  };
  for (const flame of flames) for (const root of flame.roots) check(root);
});

test("parser: quizzes, checklists, steppers and objectives are searchable", () => {
  const guide = loadGuide();
  const index = guide.searchIndex;
  const variables = guide.chapterMap.variables;

  // An objective from the chapter's own @learn list.
  const objective = variables.learn[0].split("|")[0].trim().slice(0, 24).toLowerCase();
  assert.ok(
    index.some((entry) => entry.chapterId === "variables" && entry.lower.includes(objective)),
    `no index entry for the objective “${objective}”`,
  );

  // A quiz explanation, which is teaching content like any paragraph.
  const quizEntry = index.find(
    (entry) => entry.weight === 6 && /^(yes|no|because|[A-Z])/.test(entry.text),
  );
  assert.ok(quizEntry, "quiz prompts or options are indexed");
});

test("quiz: correct answers are spread across all four positions", () => {
  // A reader who always picks the same letter should score about 25%, not 56%.
  // Before the rebalance, B held 56% of answers and D held 1%.
  const guide = loadGuide();
  const tally = new Map<number, number>();
  let total = 0;
  for (const chapter of guide.chapters) {
    for (const block of chapter.blocks) {
      if (block.type !== "quiz") continue;
      for (const question of block.questions) {
        const index = question.options.findIndex((option) => option.correct);
        assert.ok(index >= 0, `${chapter.id}: a question has no correct option`);
        tally.set(index, (tally.get(index) ?? 0) + 1);
        total += 1;
      }
    }
  }
  assert.ok(total > 300, `expected the full question bank, found ${total}`);
  for (let position = 0; position < 4; position += 1) {
    const share = (tally.get(position) ?? 0) / total;
    assert.ok(
      share > 0.15 && share < 0.35,
      `position ${"ABCD"[position]} holds ${(share * 100).toFixed(1)}% of answers`,
    );
  }
});
