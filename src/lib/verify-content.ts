import { lintContent } from "./content-lint";
import { loadGuide } from "./guide-parser";

/**
 * `npm run verify:content`
 *
 * Two gates:
 *   1. the parser itself (malformed chapters, unknown glossary terms, exercises
 *      without solutions, links to chapters that do not exist);
 *   2. the content lint (`content-lint.ts`) — house style, teaching structure,
 *      reading times and the link graph.
 *
 * Both must be clean. The lint is what stops the rules from eroding: it fails
 * on an American spelling, a stray TODO, a chapter nobody links to, a project
 * chapter that loses its exercises, or a link to a route the app does not have.
 */

const guide = loadGuide(true);
console.log(
  `verified guide content: ${guide.stats.totalChapters} chapters (${guide.stats.trackedChapters} tracked), ` +
    `${guide.stats.codeBlocks} code blocks, ${guide.stats.exercises} exercises, ` +
    `${guide.stats.questions} quiz questions, ${guide.stats.projects} projects, ` +
    `${guide.searchIndex.length} search entries`,
);

let failed = false;

if (guide.warnings.length > 0) {
  console.error(`${guide.warnings.length} parser warning(s):`);
  for (const warning of guide.warnings) console.error(`  - ${warning}`);
  failed = true;
}

const { problems, info } = lintContent(guide, { checkReadmeStats: true });
const errors = problems.filter((problem) => problem.severity === "error");
const warnings = problems.filter((problem) => problem.severity === "warn");

for (const line of info) console.log(`lint: ${line}`);

if (warnings.length > 0) {
  console.warn(`${warnings.length} lint warning(s):`);
  for (const warning of warnings) {
    console.warn(`  - [${warning.rule}] ${warning.where}: ${warning.message}`);
  }
}

if (errors.length > 0) {
  console.error(`${errors.length} lint error(s):`);
  for (const problem of errors) {
    console.error(`  - [${problem.rule}] ${problem.where}: ${problem.message}`);
  }
  failed = true;
} else {
  console.log("content lint: clean");
}

if (failed) process.exit(1);
