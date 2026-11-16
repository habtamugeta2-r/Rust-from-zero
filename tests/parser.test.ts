import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inlinePlainText, loadGuide } from "../src/lib/guide-parser";
import { flattenContentTree } from "../src/lib/content-tree";
import { LANG_LABELS } from "../src/lib/guide-config";
import type { BlockNode, ContentNodeKind, InlineNode } from "../src/lib/guide-types";

/** Every DOM anchor a chapter outline may point at, from its blocks. */
function anchorIds(blocks: BlockNode[], into = new Set<string>()): Set<string> {
  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        into.add(block.id);
        break;
      case "exercise":
        into.add(block.exerciseId);
        anchorIds(block.body, into);
        if (block.hint) anchorIds(block.hint, into);
        if (block.solution) anchorIds(block.solution, into);
        break;
      case "quiz":
        into.add(block.quizId);
        break;
      case "checklist":
        into.add(block.checklistId);
        break;
      case "callout":
        if (block.id) into.add(block.id);
        anchorIds(block.blocks, into);
        break;
      case "blockquote":
      case "details":
        anchorIds(block.blocks, into);
        break;
      case "list":
        for (const item of block.items) anchorIds(item.blocks, into);
        break;
      default:
        break;
    }
  }
  return into;
}

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
@learn Learn the compass keyword | Focus on nested list indexing | Understand flame graph widths

## First heading

A paragraph about [[borrowing]] and [[nosuchterm]], linking to [the second chapter](#second).

---

> A quoted paragraph.

- one
- two
- Parent list item phrase
  > Nested block content phrase.

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
zero | 0 | zero
  empty | 0 | empty
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

function collectInlineNodes(
  node: unknown,
  type: InlineNode["type"],
  into: InlineNode[] = [],
): InlineNode[] {
  if (!node || typeof node !== "object") return into;
  if (Array.isArray(node)) {
    for (const child of node) collectInlineNodes(child, type, into);
    return into;
  }
  const record = node as Record<string, unknown>;
  if (record.type === type) into.push(record as InlineNode);
  for (const child of Object.values(record)) collectInlineNodes(child, type, into);
  return into;
}

function collectCodeBlocks(
  node: unknown,
  into: Extract<BlockNode, { type: "code" }>[] = [],
): Extract<BlockNode, { type: "code" }>[] {
  if (!node || typeof node !== "object") return into;
  if (Array.isArray(node)) {
    for (const child of node) collectCodeBlocks(child, into);
    return into;
  }
  const record = node as Record<string, unknown>;
  if (record.type === "code" && typeof record.code === "string") {
    into.push(record as Extract<BlockNode, { type: "code" }>);
  }
  for (const child of Object.values(record)) collectCodeBlocks(child, into);
  return into;
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

test("parser: route-link plain text returns the visible labels", () => {
  const roadmap = loadGuide(true).chapterMap["roadmap"];
  const routeLinks = collectInlineNodes(roadmap.blocks, "routeLink");
  const labels = routeLinks.map((node) => inlinePlainText([node]));
  assert.ok(labels.includes("your progress"), `route labels were ${labels.join(", ")}`);
  assert.ok(labels.includes("search"), `route labels were ${labels.join(", ")}`);
});

test("parser: search indexes nested list labels and interactive block content", () => {
  const guide = loadGuide(true, fixtureRoot());
  const texts = guide.searchIndex
    .filter((entry) => entry.chapterId === "fixture")
    .map((entry) => entry.text.toLowerCase());
  const expected = [
    "parent list item phrase",
    "nested block content phrase",
    "which answer is right?",
    "the wrong one",
    "because the fixture says so.",
    "first item",
    "the program starts.",
    "a caption",
    "empty",
    "learn the compass keyword",
  ];
  for (const phrase of expected) {
    assert.ok(
      texts.some((text) => text.includes(phrase)),
      `search index is missing “${phrase}”`,
    );
  }
});

test("parser: zero-width flame parents never produce NaN or Infinity", () => {
  const guide = loadGuide(true, fixtureRoot());
  const flame = guide.chapterMap["fixture"].blocks.find((block) => block.type === "flame");
  assert.ok(flame && flame.type === "flame");
  const zero = flame.roots.find((node) => node.label === "zero");
  assert.ok(zero);
  const empty = zero.children.find((node) => node.label === "empty");
  assert.ok(empty);
  assert.equal(zero.widthPct, 0);
  assert.equal(empty.widthPct, 0);
  assert.ok(Number.isFinite(zero.widthPct));
  assert.ok(Number.isFinite(empty.widthPct));
});

test("parser: blockquoted Rust fences preserve code indentation", () => {
  const chapter = loadGuide(true).chapterMap["next"];
  const quotedExample = collectCodeBlocks(chapter.blocks).find((block) =>
    block.code.includes("let total: f64"),
  );
  assert.ok(quotedExample, "the quoted runnable sketch is parsed as a code block");
  assert.equal(
    quotedExample.code,
    'fn main() {\n    let total: f64 = (0..10).map(|n| n as f64).sum();\n    println!("{total}");\n}',
  );
});

test("parser: language labels cover protobuf, flame, tree and MIR blocks", () => {
  assert.equal(LANG_LABELS.protobuf, "Protocol Buffers");
  assert.equal(LANG_LABELS.flame, "Flame graph");
  assert.equal(LANG_LABELS.tree, "Folder layout");
  assert.equal(LANG_LABELS.mir, "Rust MIR");
});

test("parser: a chapter summary carries its content graph", () => {
  const guide = loadGuide(true, fixtureRoot());
  const fixture = guide.chapterMap["fixture"];
  const flat = flattenContentTree(fixture.outline);

  // The fixture has one `##` heading; its quiz, exercise, checklist and
  // recap all hang underneath it, in document order.
  assert.equal(flat[0].node.kind, "section");
  assert.equal(flat[0].node.label, "First heading");
  assert.equal(flat[0].depth, 0);
  const leafKinds = flat.slice(1).map(({ node }) => node.kind);
  for (const expected of ["recap", "quiz", "exercise", "checklist"]) {
    assert.ok(
      leafKinds.includes(expected as ContentNodeKind),
      `outline is missing a ${expected} node`,
    );
  }
  assert.ok(flat.every(({ depth }) => depth <= 1));

  // Every node in the graph is a working deep link: its anchor exists on
  // a block the chapter page renders with that id.
  const anchors = anchorIds(fixture.blocks);
  for (const { node } of flat) {
    assert.ok(anchors.has(node.id), `outline node ${node.id} has no matching anchor`);
  }

  // Summaries and chapter data share the same graph (the sidebar reads
  // summaries, so a graph only on ChapterData would never reach it).
  const summary = guide.summaries.find((c) => c.id === "fixture");
  assert.deepEqual(summary?.outline, fixture.outline);
});

test("parser: the real guide's content graphs resolve to real anchors", () => {
  const guide = loadGuide(true);
  assert.ok(guide.summaries.length > 50, "the real guide is loaded");

  let totalNodes = 0;
  for (const chapter of guide.chapters) {
    const flat = flattenContentTree(chapter.outline);
    totalNodes += flat.length;

    const sections = flat.filter(({ node }) => node.kind === "section").length;
    assert.equal(
      sections,
      chapter.headings.filter((h) => h.level === 2).length,
      `${chapter.id}: outline sections must mirror its ## headings`,
    );

    const anchors = anchorIds(chapter.blocks);
    const seen = new Set<string>();
    for (const { node, depth } of flat) {
      assert.ok(node.id, `${chapter.id}: outline node “${node.label}” has no anchor`);
      assert.ok(!seen.has(node.id), `${chapter.id}: duplicate outline anchor ${node.id}`);
      seen.add(node.id);
      assert.ok(
        anchors.has(node.id),
        `${chapter.id}: outline anchor ${node.id} is not rendered on the page`,
      );
      assert.ok(depth <= 3, `${chapter.id}: outline nests deeper than key-point level`);
    }
  }

  // The whole knowledge base at a glance: well over a thousand topics.
  assert.ok(totalNodes > 1000, `expected a deep content graph, got ${totalNodes} nodes`);
});

test("parser: fixture statistics count exercises, questions and code", () => {
  const guide = loadGuide(true, fixtureRoot());
  assert.equal(guide.stats.exercises, 1);
  assert.equal(guide.stats.questions, 1);
  assert.ok(guide.stats.codeBlocks >= 1);
  assert.equal(guide.stats.totalChapters, 3);
});
