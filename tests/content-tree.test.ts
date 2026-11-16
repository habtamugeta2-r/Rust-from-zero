import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildContentTree,
  contentKindCounts,
  contentSubtreeContains,
  countContentNodes,
  findContentPath,
  flattenContentTree,
  headingItemsFromTree,
} from "../src/lib/content-tree";
import type { BlockNode, ContentNode, InlineNode } from "../src/lib/guide-types";

const text = (value: string): InlineNode[] => [{ type: "text", text: value }];

const heading = (level: 2 | 3 | 4, id: string, label: string): BlockNode => ({
  type: "heading",
  level,
  id,
  text: label,
  children: text(label),
});

const paragraph = (value: string): BlockNode => ({ type: "paragraph", children: text(value) });

function shape(nodes: ContentNode[]): unknown {
  return nodes.map((node) => ({
    id: node.id,
    label: node.label,
    kind: node.kind,
    children: shape(node.children),
  }));
}

test("content tree: sections hold subsections, which hold key points", () => {
  const tree = buildContentTree([
    // Before the first heading, a block belongs to the chapter itself.
    { type: "exercise", exerciseId: "ch-x1", kind: "guided", title: text("Warm up"), body: [] },
    heading(2, "ch--ownership", "Ownership"),
    paragraph("A value has one owner."),
    heading(3, "ch--moves", "Moves"),
    heading(4, "ch--copy-types", "Copy types"),
    {
      type: "callout",
      kind: "key",
      id: "ch--callout-1",
      title: text("One owner at a time"),
      blocks: [],
    },
    {
      type: "exercise",
      exerciseId: "ch-x2",
      kind: "practice",
      title: text("Trace a move"),
      body: [],
    },
    heading(3, "ch--borrowing", "Borrowing"),
    { type: "quiz", quizId: "ch-q1", title: text("Check your understanding"), questions: [] },
    heading(2, "ch--recap-section", "Wrapping up"),
    { type: "callout", kind: "recap", id: "ch--callout-2", blocks: [] },
    { type: "checklist", checklistId: "ch-c1", items: [{ id: "ch-c1-1", children: text("Done") }] },
  ]);

  assert.deepEqual(shape(tree), [
    { id: "ch-x1", label: "Warm up", kind: "exercise", children: [] },
    {
      id: "ch--ownership",
      label: "Ownership",
      kind: "section",
      children: [
        {
          id: "ch--moves",
          label: "Moves",
          kind: "subsection",
          children: [
            {
              id: "ch--copy-types",
              label: "Copy types",
              kind: "detail",
              children: [
                { id: "ch--callout-1", label: "One owner at a time", kind: "key", children: [] },
                { id: "ch-x2", label: "Trace a move", kind: "exercise", children: [] },
              ],
            },
          ],
        },
        {
          id: "ch--borrowing",
          label: "Borrowing",
          kind: "subsection",
          children: [
            { id: "ch-q1", label: "Check your understanding", kind: "quiz", children: [] },
          ],
        },
      ],
    },
    {
      id: "ch--recap-section",
      label: "Wrapping up",
      kind: "section",
      children: [
        { id: "ch--callout-2", label: "Recap", kind: "recap", children: [] },
        { id: "ch-c1", label: "Checklist · 1 item", kind: "checklist", children: [] },
      ],
    },
  ]);
});

test("content tree: a same-or-higher heading closes the branches below it", () => {
  const tree = buildContentTree([
    heading(3, "ch--orphan", "Orphan subsection"),
    heading(2, "ch--first", "First"),
    heading(3, "ch--nested", "Nested"),
    heading(2, "ch--second", "Second"),
  ]);

  assert.deepEqual(
    flattenContentTree(tree).map(({ node, depth }) => `${depth}:${node.id}`),
    ["0:ch--orphan", "0:ch--first", "1:ch--nested", "0:ch--second"],
  );
});

test("content tree: headings inside containers join the graph, exercise bodies do not", () => {
  const tree = buildContentTree([
    heading(2, "ch--outer", "Outer"),
    {
      type: "details",
      title: text("More"),
      blocks: [heading(3, "ch--inner", "Inner")],
    },
    {
      type: "exercise",
      exerciseId: "ch-x1",
      kind: "practice",
      title: text("Try it"),
      // A heading inside an exercise prompt is part of the exercise,
      // not a sub-topic of the chapter.
      body: [heading(3, "ch--inside-exercise", "Not a topic")],
    },
  ]);

  const ids = flattenContentTree(tree).map(({ node }) => node.id);
  assert.deepEqual(ids, ["ch--outer", "ch--inner", "ch-x1"]);
});

test("content tree: ordinary callouts and prose are not key points", () => {
  const tree = buildContentTree([
    heading(2, "ch--s", "Section"),
    { type: "callout", kind: "tip", id: "ch--callout-1", title: text("A tip"), blocks: [] },
    { type: "callout", kind: "warn", id: "ch--callout-2", title: text("Careful"), blocks: [] },
    paragraph("Just prose."),
  ]);

  assert.equal(countContentNodes(tree), 1);
});

test("content tree: counts, paths, subtree search and heading items agree", () => {
  const tree = buildContentTree([
    heading(2, "ch--a", "A"),
    heading(3, "ch--a1", "A1"),
    { type: "callout", kind: "key", id: "ch--callout-1", title: text("Remember this"), blocks: [] },
    heading(2, "ch--b", "B"),
  ]);

  assert.equal(countContentNodes(tree), 4);
  assert.deepEqual(contentKindCounts(tree), {
    section: 2,
    subsection: 1,
    detail: 0,
    key: 1,
    recap: 0,
    exercise: 0,
    quiz: 0,
    checklist: 0,
  });

  const path = findContentPath(tree, "ch--callout-1");
  assert.deepEqual(
    path?.map((node) => node.id),
    ["ch--a", "ch--a1", "ch--callout-1"],
  );
  assert.equal(findContentPath(tree, "ch--missing"), null);

  assert.equal(contentSubtreeContains(tree[0], "ch--callout-1"), true);
  assert.equal(contentSubtreeContains(tree[1], "ch--callout-1"), false);

  // The scroll-spy consumes heading items only: key blocks are leaves
  // under a heading, never sections in their own right.
  assert.deepEqual(headingItemsFromTree(tree), [
    { id: "ch--a", level: 2, text: "A" },
    { id: "ch--a1", level: 3, text: "A1" },
    { id: "ch--b", level: 2, text: "B" },
  ]);
});

test("content tree: an empty chapter has an empty graph", () => {
  assert.deepEqual(buildContentTree([]), []);
  assert.deepEqual(buildContentTree([paragraph("No headings at all.")]), []);
});
