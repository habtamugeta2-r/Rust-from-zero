import { loadGuide } from "./guide-parser";

const guide = loadGuide(true);
console.log(
  `verified guide content: ${guide.stats.totalChapters} chapters (${guide.stats.trackedChapters} tracked), ` +
    `${guide.stats.codeBlocks} code blocks, ${guide.stats.exercises} exercises, ` +
    `${guide.stats.questions} quiz questions, ${guide.stats.projects} projects, ` +
    `${guide.searchIndex.length} search entries`
);

if (guide.warnings.length > 0) {
  console.error(`${guide.warnings.length} warning(s):`);
  for (const w of guide.warnings) {
    console.error(`  - ${w}`);
  }
  process.exit(1);
}
