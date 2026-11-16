import type {
  BlockNode,
  ContentNode,
  ContentNodeKind,
  HeadingItem,
  InlineNode,
} from "./guide-types";

/**
 * Build (and query) the hierarchical content graph of a chapter.
 *
 * A chapter is not a flat page: `##` sections contain `###` subsections,
 * which contain the key content blocks a reader actually jumps to — a
 * `####` detail, a `:::key` idea, an exercise, a quiz, a checklist, a
 * recap. `buildContentTree` folds a chapter's parsed blocks, in document
 * order, into that tree so the sidebar can render
 * `Chapter → Section → Subsection → Key Point` instead of only listing
 * chapter titles, and so every node can deep-link to its anchor.
 *
 * This module is deliberately free of the parser (and of `node:fs`) so the
 * sidebar, the chapter rail and the unit tests can all use it without
 * dragging the whole guide loader along.
 */

const HEADING_KIND: Record<2 | 3 | 4, ContentNodeKind> = {
  2: "section",
  3: "subsection",
  4: "detail",
};

const HEADING_LEVEL: Partial<Record<ContentNodeKind, 2 | 3 | 4>> = {
  section: 2,
  subsection: 3,
  detail: 4,
};

/** Plain text of an inline run, for node labels. Mirrors `inlinePlainText`. */
export function inlineNodeText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
        case "kbd":
        case "term":
          return node.text;
        case "strong":
        case "em":
        case "internalLink":
        case "routeLink":
        case "externalLink":
          return inlineNodeText(node.children);
      }
    })
    .join("");
}

function tidyLabel(text: string, fallback: string): string {
  const label = text.replace(/\s+/g, " ").trim();
  return label || fallback;
}

/**
 * Fold parsed blocks into a content tree, in document order.
 *
 * A heading opens a new branch: everything after it nests under it until a
 * heading of the same or higher level closes it. A key content block
 * becomes a leaf under the deepest heading still open (or at the chapter
 * root when it appears before the first heading). Headings and key blocks
 * nested inside callouts, details, blockquotes and list items are found
 * too — a `:::key` inside a section belongs to that section wherever it
 * sits. Exercises and quizzes are leaves: their inner prompts are not
 * sub-topics of the chapter.
 */
export function buildContentTree(blocks: BlockNode[]): ContentNode[] {
  const roots: ContentNode[] = [];
  /** Open headings, shallowest first. Leaves never join this stack. */
  const open: { level: 2 | 3 | 4; node: ContentNode }[] = [];

  const attach = (node: ContentNode) => {
    const parent = open[open.length - 1]?.node;
    if (parent) parent.children.push(node);
    else roots.push(node);
  };

  const visit = (list: BlockNode[]) => {
    for (const block of list) {
      switch (block.type) {
        case "heading": {
          const node: ContentNode = {
            id: block.id,
            label: tidyLabel(block.text, "Section"),
            kind: HEADING_KIND[block.level],
            children: [],
          };
          while (open.length > 0 && open[open.length - 1].level >= block.level) {
            open.pop();
          }
          attach(node);
          open.push({ level: block.level, node });
          break;
        }
        case "callout": {
          if (block.kind === "key" || block.kind === "recap") {
            attach({
              id: block.id ?? "",
              label: tidyLabel(
                block.title ? inlineNodeText(block.title) : "",
                block.kind === "key" ? "Key idea" : "Recap",
              ),
              kind: block.kind,
              children: [],
            });
          }
          // A heading buried in any callout still belongs to the graph.
          visit(block.blocks);
          break;
        }
        case "exercise":
          attach({
            id: block.exerciseId,
            label: tidyLabel(inlineNodeText(block.title), "Exercise"),
            kind: "exercise",
            children: [],
          });
          break;
        case "quiz":
          attach({
            id: block.quizId,
            label: tidyLabel(inlineNodeText(block.title), "Quiz"),
            kind: "quiz",
            children: [],
          });
          break;
        case "checklist":
          attach({
            id: block.checklistId,
            label:
              block.items.length === 1
                ? "Checklist · 1 item"
                : `Checklist · ${block.items.length} items`,
            kind: "checklist",
            children: [],
          });
          break;
        case "blockquote":
        case "details":
          visit(block.blocks);
          break;
        case "list":
          for (const item of block.items) visit(item.blocks);
          break;
        default:
          break;
      }
    }
  };

  visit(blocks);
  return roots;
}

/** Every node of the tree, in reading order, with its depth (roots are 0). */
export function flattenContentTree(
  nodes: ContentNode[],
  depth = 0,
): { node: ContentNode; depth: number }[] {
  const out: { node: ContentNode; depth: number }[] = [];
  for (const node of nodes) {
    out.push({ node, depth });
    out.push(...flattenContentTree(node.children, depth + 1));
  }
  return out;
}

/** Total number of nodes below (and including) the given roots. */
export function countContentNodes(nodes: ContentNode[]): number {
  return flattenContentTree(nodes).length;
}

/** Node counts per kind, e.g. for a “6 sections · 2 key ideas” caption. */
export function contentKindCounts(nodes: ContentNode[]): Record<ContentNodeKind, number> {
  const counts: Record<ContentNodeKind, number> = {
    section: 0,
    subsection: 0,
    detail: 0,
    key: 0,
    recap: 0,
    exercise: 0,
    quiz: 0,
    checklist: 0,
  };
  for (const { node } of flattenContentTree(nodes)) counts[node.kind] += 1;
  return counts;
}

/**
 * The ancestry of the node with anchor `id`: every node from the root down
 * to and including that node, or `null` when the anchor is not in the tree.
 * The sidebar uses this to expand exactly the branches that lead to the
 * section being read.
 */
export function findContentPath(nodes: ContentNode[], id: string): ContentNode[] | null {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const below = findContentPath(node.children, id);
    if (below) return [node, ...below];
  }
  return null;
}

/** True when `id` is `node` itself or sits anywhere underneath it. */
export function contentSubtreeContains(node: ContentNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((child) => contentSubtreeContains(child, id));
}

/**
 * The heading nodes of a tree as a flat `HeadingItem[]`, in reading order —
 * the shape the scroll-spy (`useActiveHeading`) already understands, so the
 * sidebar and the “On this page” rail always agree on what is being read.
 * Key content blocks are excluded: they have anchors, but they are leaves
 * under a heading, not sections in their own right.
 */
export function headingItemsFromTree(nodes: ContentNode[]): HeadingItem[] {
  const out: HeadingItem[] = [];
  for (const { node } of flattenContentTree(nodes)) {
    const level = HEADING_LEVEL[node.kind];
    if (level) out.push({ id: node.id, level, text: node.label });
  }
  return out;
}
