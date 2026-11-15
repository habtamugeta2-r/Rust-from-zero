import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadGuide } from "../src/lib/guide-parser";
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
