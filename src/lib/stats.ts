import fs from "node:fs";
import path from "node:path";
import {
  capturedReferences,
  countRustFences,
  guideNumbers,
  proseWordCount,
  README_STAT_LABELS,
  readmeStatValue,
} from "./content-lint";
import { loadGuide } from "./guide-parser";

/**
 * `npm run stats`
 *
 * Prints every number the guide publishes, measured from the parser and the
 * chapter sources in this tree. The README statistics table is checked
 * against these numbers by the `docs/stats` lint rule, so a number that
 * drifts is a failing gate, not a stale sentence.
 */

function collectFacts(guide: ReturnType<typeof loadGuide>): {
  glossaryLinked: number;
  inboundEdges: number;
  proseWords: number;
} {
  const terms = new Set<string>();
  let inboundEdges = 0;
  let proseWords = 0;

  const visit = (node: unknown, chapterId: string): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, chapterId);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === "term" && typeof record.key === "string") {
      terms.add(record.key);
    }
    if (
      record.type === "internalLink" &&
      typeof record.chapterId === "string" &&
      record.chapterId !== chapterId &&
      record.chapterId !== "home"
    ) {
      inboundEdges += 1;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "type" || value === null || typeof value !== "object") continue;
      visit(value, chapterId);
    }
  };

  for (const chapter of guide.chapters) {
    visit(chapter.blocks, chapter.id);
    proseWords += proseWordCount(chapter.blocks);
  }
  return { glossaryLinked: terms.size, inboundEdges, proseWords };
}

const guide = loadGuide(true);
const chaptersDir = path.join(process.cwd(), "guide-src", "chapters");
const capturedDir = path.join(process.cwd(), "guide-src", "captured");
const files = guide.chapters.map((chapter) => chapter.file);
const captures = capturedReferences(chaptersDir, files);
const capturedOutputs = fs.existsSync(capturedDir)
  ? fs.readdirSync(capturedDir).filter((name) => name.endsWith(".txt")).length
  : 0;
const facts = collectFacts(guide);

const numbers = guideNumbers(guide, {
  rustFences: countRustFences(chaptersDir, files),
  capturedOutputs,
  autoBlocks: captures.autoBlocks,
  glossaryLinked: facts.glossaryLinked,
  inboundEdges: facts.inboundEdges,
  proseWords: facts.proseWords,
  longSentences: 0,
});

console.log("Guide statistics, measured from this tree:\n");
const rows: [string, number][] = [
  ["Chapters", numbers.chapters],
  ["Tracked chapters", numbers.trackedChapters],
  ["Appendices", numbers.appendices],
  ["Projects", numbers.projects],
  ["Code blocks", numbers.codeBlocks],
  ["Rust code fences", numbers.rustFences],
  ["Exercises", numbers.exercises],
  ["Quiz questions", numbers.quizQuestions],
  ["Captured outputs", numbers.capturedOutputs],
  ["Auto blocks", numbers.autoBlocks],
  ["Search entries", numbers.searchEntries],
  ["Glossary terms", numbers.glossaryTerms],
  ["Glossary terms linked from prose", numbers.glossaryLinked],
  ["Cross-links (inbound edges)", numbers.inboundEdges],
  ["Words of prose", numbers.proseWords],
  ["Declared reading time (minutes)", numbers.totalMinutes],
];
for (const [label, value] of rows) {
  console.log(`${label}: ${value.toLocaleString("en-GB")}`);
}

console.log("\nREADME statistics table (paste between the stats markers):\n");
console.log("| Published number | Count |");
console.log("| --- | ---: |");
for (const label of README_STAT_LABELS) {
  console.log(`| ${label} | ${readmeStatValue(numbers, label).toLocaleString("en-GB")} |`);
}

if (guide.warnings.length > 0) {
  console.error(`\n${guide.warnings.length} parser warning(s):`);
  for (const warning of guide.warnings) console.error(`  - ${warning}`);
  process.exit(1);
}
