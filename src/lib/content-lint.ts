import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BlockNode, LoadedGuide } from "./guide-types";

/**
 * Content lint for `guide-src/chapters/*.md`.
 *
 * The parser already refuses to build when a chapter is malformed (unknown
 * glossary term, exercise without a solution, dangling chapter link). This
 * module catches the things a parser cannot see — the house style, the
 * teaching structure and the shape of the link graph:
 *
 *   error  American spelling in British prose
 *   error  TODO / FIXME / TBD / XXX left in text a reader can see
 *   error  a tracked chapter without objectives, a recap, a quiz or exercises
 *   error  a chapter nobody links to (unreachable except from the sidebar)
 *   error  declared reading time far below the prose itself
 *   error  duplicate titles, short titles or ids
 *   error  a link to a chapter id that does not exist, or a route that is not one
 *          of the app's pages
 *
 * Everything it reports is a fact about the files, so it runs in CI (see
 * `npm run verify:content`) and fails the build the moment a rule regresses.
 */

export interface LintProblem {
  severity: "error" | "warn";
  rule: string;
  where: string;
  message: string;
}

export interface LintReport {
  problems: LintProblem[];
  info: string[];
}

/** Routes prose may link directly, e.g. `[your progress](/progress)`. */
export const APP_ROUTES = ["/", "/chapters", "/progress", "/search"] as const;

/**
 * American spellings this guide does not use, mapped to the British form.
 * Words that are correct in both (`program`, `license` as a verb) are absent,
 * and inline code is stripped before matching, so `license = "MIT"` and
 * `EXPLAIN ANALYZE` are never flagged.
 */
const AMERICAN_TO_BRITISH: Record<string, string> = {
  behavior: "behaviour",
  behaviors: "behaviours",
  color: "colour",
  colors: "colours",
  optimize: "optimise",
  optimized: "optimised",
  optimizing: "optimising",
  optimization: "optimisation",
  optimizations: "optimisations",
  initialize: "initialise",
  initializes: "initialises",
  initialized: "initialised",
  initializing: "initialising",
  initialization: "initialisation",
  uninitialized: "uninitialised",
  organize: "organise",
  organized: "organised",
  organization: "organisation",
  analyze: "analyse",
  analyzed: "analysed",
  center: "centre",
  centered: "centred",
  defense: "defence",
  modeling: "modelling",
  traveled: "travelled",
  canceled: "cancelled",
  fulfill: "fulfil",
  gray: "grey",
  artifact: "artefact",
  artifacts: "artefacts",
  prioritize: "prioritise",
  customize: "customise",
  customized: "customised",
  normalize: "normalise",
  normalized: "normalised",
  summarize: "summarise",
  categorize: "categorise",
  emphasize: "emphasise",
  recognize: "recognise",
  minimize: "minimise",
  maximize: "maximise",
  utilize: "utilise",
  parameterize: "parameterise",
  virtualization: "virtualisation",
  judgment: "judgement",
  skillful: "skilful",
  acknowledgment: "acknowledgement",
};

/**
 * Phrases that are American by name, not by accident: the C++ expansion of
 * RAII, which is a quotation. Matched case-insensitively against the whole
 * line before the spelling check runs.
 */
const ALLOWED_PHRASES = ["resource acquisition is initialization"];

const PLACEHOLDER_MARKERS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bTBD\b/,
  /\bWIP\b/,
  /\bXXX\b/,
  /lorem ipsum/i,
];

/** Words per minute used to sanity-check the declared `@time`. */
const READING_WPM = 200;
/** A chapter may not declare less than this fraction of its own reading time. */
const MIN_DECLARED_RATIO = 0.6;

interface ProseLine {
  line: number;
  text: string;
  /** True for front-matter and `:::` titles, which readers also see. */
  visible: boolean;
}

/**
 * Every line a reader can see, with code and link targets removed so that
 * `cargo add --color` or `[text](/some/url)` cannot trip the spelling rules.
 */
function visibleLines(markdown: string): ProseLine[] {
  const out: ProseLine[] = [];
  let inFence = false;

  markdown.split("\n").forEach((raw, index) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence || trimmed === "") return;

    const withoutCode = raw
      // inline code spans
      .replace(/`[^`]*`/g, " ")
      // markdown link targets
      .replace(/\]\([^)]*\)/g, "]")
      // glossary markup keeps only the visible label
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      // emphasis markers
      .replace(/[*_]{1,3}/g, "");

    out.push({
      line: index + 1,
      text: withoutCode,
      visible: true,
    });
  });

  return out;
}

/**
 * Prose words in a chapter: every text node except code and headings, so a
 * chapter of listings does not look longer than it reads.
 */
export function proseWordCount(blocks: BlockNode[]): number {
  let words = 0;

  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node.type === "code" || node.type === "heading") return;
    if (node.type === "text" && typeof node.text === "string") {
      for (const word of node.text.split(/\s+/)) {
        if (/[a-z0-9]/i.test(word)) words += 1;
      }
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || value === null || typeof value !== "object") continue;
      visit(value);
    }
  };

  visit(blocks);
  return words;
}

/**
 * Every node in a chapter's tree — blocks *and* the inline nodes inside them,
 * which is where links, glossary terms and text live.
 */
function collectNodes(blocks: BlockNode[]): any[] {
  const out: any[] = [];
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.type === "string") out.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "type" || value === null || typeof value !== "object") continue;
      visit(value);
    }
  };
  visit(blocks);
  return out;
}

export interface LintOptions {
  chaptersDir?: string;
  /** Directory holding `captured/*.txt`; defaults beside `chaptersDir`. */
  capturedDir?: string;
  /** README to check the published statistics against, when enabled. */
  readmePath?: string;
  /**
   * Check the statistics table in the README against the parser's numbers
   * (`docs/stats`). Opt-in so unit tests can lint fixture guides without a
   * README that describes them; `verify:content` always enables it.
   */
  checkReadmeStats?: boolean;
}

/**
 * The capture a chapter's `auto` blocks will read, in file order. This mirrors
 * the parser: a capture is named for the SHA-1 (first 16 hex digits) of the
 * Rust block above the `auto` block, and `ctx.lastHash` resets per chapter.
 */
export function capturedReferences(
  chaptersDir: string,
  files: string[],
): {
  referenced: Map<string, string[]>;
  missing: { hash: string; where: string }[];
  autoBlocks: number;
} {
  const referenced = new Map<string, string[]>();
  const missing: { hash: string; where: string }[] = [];
  let autoBlocks = 0;

  for (const file of files) {
    let markdown: string;
    try {
      markdown = fs.readFileSync(path.join(chaptersDir, file), "utf8");
    } catch {
      continue;
    }
    const lines = markdown.split("\n");
    let lastHash: string | null = null;
    let i = 0;
    while (i < lines.length) {
      const head = lines[i].trim();
      if (!head.startsWith("```")) {
        i += 1;
        continue;
      }
      const parts = head.slice(3).trim().split(/\s+/).filter(Boolean);
      const lang = parts[0] ?? "";
      const flags = parts.slice(1);
      const buf: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== "```") {
        buf.push(lines[j]);
        j += 1;
      }
      if (lang === "rust") {
        lastHash = crypto
          .createHash("sha1")
          .update(buf.join("\n"), "utf8")
          .digest("hex")
          .slice(0, 16);
      }
      if ((lang === "output" || lang === "error") && flags.includes("auto")) {
        autoBlocks += 1;
        const where = `${file}:${i + 1}`;
        if (lastHash) {
          const list = referenced.get(lastHash) ?? [];
          list.push(where);
          referenced.set(lastHash, list);
        } else {
          missing.push({ hash: "none", where });
        }
      }
      i = j + 1;
    }
  }

  return { referenced, missing, autoBlocks };
}

/** `` ```rust `` fences in the chapter sources, counted the way `grep` counts them. */
export function countRustFences(chaptersDir: string, files: string[]): number {
  let count = 0;
  for (const file of files) {
    let markdown: string;
    try {
      markdown = fs.readFileSync(path.join(chaptersDir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of markdown.split("\n")) {
      // Lines containing the fence, as `grep -c '```rust'` counts them,
      // including the one fence quoted inside a blockquote.
      if (line.includes("```rust")) count += 1;
    }
  }
  return count;
}

/**
 * Every number the README publishes, from the same sources the parser uses.
 * Shared by `npm run stats` and the `docs/stats` rule so the two can never
 * disagree about what the true numbers are.
 */
export interface GuideNumbers {
  chapters: number;
  trackedChapters: number;
  appendices: number;
  projects: number;
  codeBlocks: number;
  rustFences: number;
  exercises: number;
  quizQuestions: number;
  capturedOutputs: number;
  autoBlocks: number;
  searchEntries: number;
  glossaryTerms: number;
  glossaryLinked: number;
  inboundEdges: number;
  proseWords: number;
  totalMinutes: number;
  longSentences: number;
}

/** Labels of the README statistics table, in the order they are printed. */
export const README_STAT_LABELS = [
  "Chapters",
  "Tracked chapters",
  "Appendices",
  "Projects",
  "Code blocks",
  "Rust code fences",
  "Exercises",
  "Quiz questions",
  "Captured outputs",
  "Search entries",
  "Glossary terms",
  "Glossary terms linked from prose",
  "Cross-links (inbound edges)",
  "Words of prose",
  "Declared reading time (minutes)",
] as const;

export function guideNumbers(
  guide: LoadedGuide,
  extras: {
    rustFences: number;
    capturedOutputs: number;
    autoBlocks: number;
    glossaryLinked: number;
    inboundEdges: number;
    proseWords: number;
    longSentences: number;
  },
): GuideNumbers {
  return {
    chapters: guide.stats.totalChapters,
    trackedChapters: guide.stats.trackedChapters,
    appendices: guide.chapters.filter((c) => c.kind === "appendix").length,
    projects: guide.stats.projects,
    codeBlocks: guide.stats.codeBlocks,
    rustFences: extras.rustFences,
    exercises: guide.stats.exercises,
    quizQuestions: guide.stats.questions,
    capturedOutputs: extras.capturedOutputs,
    autoBlocks: extras.autoBlocks,
    searchEntries: guide.searchIndex.length,
    glossaryTerms: Object.keys(guide.glossary).length,
    glossaryLinked: extras.glossaryLinked,
    inboundEdges: extras.inboundEdges,
    proseWords: extras.proseWords,
    totalMinutes: guide.stats.totalMinutes,
    longSentences: extras.longSentences,
  };
}

/** The value the README must print for one label. */
export function readmeStatValue(numbers: GuideNumbers, label: string): number {
  const values: Record<string, number> = {
    Chapters: numbers.chapters,
    "Tracked chapters": numbers.trackedChapters,
    Appendices: numbers.appendices,
    Projects: numbers.projects,
    "Code blocks": numbers.codeBlocks,
    "Rust code fences": numbers.rustFences,
    Exercises: numbers.exercises,
    "Quiz questions": numbers.quizQuestions,
    "Captured outputs": numbers.capturedOutputs,
    "Search entries": numbers.searchEntries,
    "Glossary terms": numbers.glossaryTerms,
    "Glossary terms linked from prose": numbers.glossaryLinked,
    "Cross-links (inbound edges)": numbers.inboundEdges,
    "Words of prose": numbers.proseWords,
    "Declared reading time (minutes)": numbers.totalMinutes,
  };
  return values[label];
}

export function lintContent(guide: LoadedGuide, options: LintOptions = {}): LintReport {
  const problems: LintProblem[] = [];
  const info: string[] = [];
  const chaptersDir = options.chaptersDir ?? path.join(process.cwd(), "guide-src", "chapters");
  const capturedDir = options.capturedDir ?? path.join(chaptersDir, "..", "captured");

  const knownIds = new Set(guide.chapters.map((chapter) => chapter.id));

  // ---- per-chapter structure, spelling and links -------------------------
  const inbound = new Map<string, number>();
  const outbound = new Map<string, Set<string>>();
  const termRefs = new Set<string>();
  let longestSentenceCount = 0;
  let proseWordsTotal = 0;

  for (const chapter of guide.chapters) {
    const nodes = collectNodes(chapter.blocks);
    const quizzes = nodes.filter((node) => node.type === "quiz");
    const exercises = nodes.filter((node) => node.type === "exercise");
    const callouts = nodes.filter((node) => node.type === "callout");
    const outgoing = new Set<string>();
    outbound.set(chapter.id, outgoing);

    // links
    for (const node of nodes) {
      if (node.type === "internalLink") {
        if (node.chapterId !== chapter.id && node.chapterId !== "home") {
          inbound.set(node.chapterId, (inbound.get(node.chapterId) ?? 0) + 1);
          outgoing.add(node.chapterId);
        }
        if (!knownIds.has(node.chapterId) && node.chapterId !== "home") {
          problems.push({
            severity: "error",
            rule: "link/unknown-chapter",
            where: chapter.file,
            message: `links to #${node.chapterId}, which is neither a chapter id nor the "home" route alias`,
          });
        }
      }
      if (node.type === "routeLink") {
        if (!(APP_ROUTES as readonly string[]).includes(node.href)) {
          problems.push({
            severity: "error",
            rule: "link/unknown-route",
            where: chapter.file,
            message: `links to the route ${node.href}; allowed routes are ${APP_ROUTES.join(", ")}`,
          });
        }
      }
      if (node.type === "term") termRefs.add(node.key);
    }

    // structure, only where a chapter is meant to teach
    if (chapter.kind !== "appendix") {
      if ((chapter.learnNodes?.length ?? 0) < 3) {
        problems.push({
          severity: "error",
          rule: "structure/objectives",
          where: chapter.file,
          message: `has ${chapter.learnNodes?.length ?? 0} learning objectives; every tracked chapter needs at least 3`,
        });
      }
      if (!callouts.some((node: any) => node.kind === "recap")) {
        problems.push({
          severity: "error",
          rule: "structure/recap",
          where: chapter.file,
          message: "has no :::recap callout",
        });
      }
      if (chapter.kind !== "orientation" && exercises.length === 0) {
        problems.push({
          severity: "error",
          rule: "structure/exercises",
          where: chapter.file,
          message: "has no exercises",
        });
      }
      const questions = quizzes.reduce((sum: number, node: any) => sum + node.questions.length, 0);
      if (chapter.kind === "project" || chapter.kind === "orientation") {
        if (questions === 0 && chapter.kind === "project") {
          problems.push({
            severity: "error",
            rule: "structure/project-quiz",
            where: chapter.file,
            message:
              "project chapter has no quiz; every project chapter needs one on the decisions it made",
          });
        }
      } else if (questions === 0) {
        problems.push({
          severity: "error",
          rule: "structure/quiz",
          where: chapter.file,
          message: "has no quiz questions",
        });
      }
    }

    // declared reading time vs. the prose it declares it for
    const words = proseWordCount(chapter.blocks);
    proseWordsTotal += words;
    const readingMinutes = words / READING_WPM;
    if (
      chapter.time > 0 &&
      readingMinutes > 20 &&
      chapter.time < readingMinutes * MIN_DECLARED_RATIO
    ) {
      problems.push({
        severity: "error",
        rule: "meta/reading-time",
        where: chapter.file,
        message: `declares @time ${chapter.time} min but ${words} words of prose is ~${Math.round(readingMinutes)} min of reading alone`,
      });
    }

    // ---- line-level rules ------------------------------------------------
    let markdown: string;
    try {
      markdown = fs.readFileSync(path.join(chaptersDir, chapter.file), "utf8");
    } catch {
      problems.push({
        severity: "error",
        rule: "meta/missing-file",
        where: chapter.file,
        message: "chapter file listed by the guide could not be read",
      });
      continue;
    }

    const lines = visibleLines(markdown);
    for (const { line, text } of lines) {
      for (const marker of PLACEHOLDER_MARKERS) {
        if (marker.test(text)) {
          problems.push({
            severity: "error",
            rule: "text/placeholder",
            where: `${chapter.file}:${line}`,
            message: `finished text contains “${text.match(marker)?.[0]}”`,
          });
        }
      }

      let sentenceFree = text;
      for (const phrase of ALLOWED_PHRASES) {
        sentenceFree = sentenceFree.replace(new RegExp(phrase, "gi"), " ");
      }
      for (const [american, british] of Object.entries(AMERICAN_TO_BRITISH)) {
        const match = new RegExp(`(?<![\\w-])${american}(?![\\w-])`, "i").exec(sentenceFree);
        if (match) {
          problems.push({
            severity: "error",
            rule: "text/spelling",
            where: `${chapter.file}:${line}`,
            message: `“${match[0]}” — this guide uses British spelling: “${british}”`,
          });
        }
      }
    }

    // Long sentences, reported rather than enforced. Measured per line, and
    // only on lines that actually end with sentence punctuation, so a table or
    // a list of links cannot masquerade as one enormous sentence.
    for (const { text } of lines) {
      const trimmed = text.trim();
      if (!/[.!?]"?$/.test(trimmed)) continue;
      for (const sentence of trimmed.split(/(?<=[.!?])\s+/)) {
        if (sentence.split(/\s+/).filter(Boolean).length > 55) {
          longestSentenceCount += 1;
        }
      }
    }
  }

  // ---- duplicates ---------------------------------------------------------
  const seen = new Map<string, Map<string, string>>();
  for (const field of ["id", "title", "short"] as const) {
    const map = new Map<string, string>();
    for (const chapter of guide.chapters) {
      const value = String(chapter[field] ?? "");
      if (!value) continue;
      const first = map.get(value);
      if (first) {
        problems.push({
          severity: "error",
          rule: "meta/duplicate",
          where: chapter.file,
          message: `@${field} “${value}” is already used by ${first}`,
        });
      } else {
        map.set(value, chapter.file);
      }
    }
    seen.set(field, map);
  }

  // ---- reachability -------------------------------------------------------
  const entry = guide.summaries.find((chapter) => chapter.kind !== "appendix");
  for (const chapter of guide.chapters) {
    if (chapter.kind === "appendix") continue;
    if (chapter.id === entry?.id) continue;
    if ((inbound.get(chapter.id) ?? 0) === 0) {
      problems.push({
        severity: "error",
        rule: "graph/unreachable",
        where: chapter.file,
        message: "no other chapter links here; add a cross-reference",
      });
    }
  }

  // The reverse direction: a chapter that links nowhere strands its readers
  // at a dead end, and only the sidebar leads out of it. The first chapter is
  // exempt for the same reason it is exempt above — it is where reading starts.
  for (const chapter of guide.chapters) {
    if (chapter.id === entry?.id) continue;
    if ((outbound.get(chapter.id)?.size ?? 0) === 0) {
      problems.push({
        severity: "error",
        rule: "graph/no-outgoing-link",
        where: chapter.file,
        message: "links to no other chapter; add a cross-reference where the prose calls for one",
      });
    }
  }

  // ---- captured outputs ---------------------------------------------------
  // A capture nobody references is stale output from an example that changed;
  // an `auto` block without a capture renders a placeholder. Deleting stale
  // captures is forbidden (they are the historical record), so orphans are a
  // warning to explain, not an error to silence.
  const chapterFiles = guide.chapters.map((chapter) => chapter.file);
  const captures = capturedReferences(chaptersDir, chapterFiles);
  let capturedFiles: string[];
  try {
    capturedFiles = fs.readdirSync(capturedDir).filter((name) => name.endsWith(".txt"));
  } catch {
    capturedFiles = [];
  }
  const capturedSet = new Set(capturedFiles.map((name) => name.slice(0, -4)));
  for (const hash of capturedSet) {
    if (!captures.referenced.has(hash)) {
      problems.push({
        severity: "warn",
        rule: "capture/orphan",
        where: `captured/${hash}.txt`,
        message:
          "no `auto` block references this capture; it is stale output kept under the never-delete rule",
      });
    }
  }
  for (const [hash, wheres] of captures.referenced) {
    if (!capturedSet.has(hash)) {
      for (const where of wheres) {
        problems.push({
          severity: "warn",
          rule: "capture/missing",
          where,
          message: `\`auto\` block reads captured/${hash}.txt, which does not exist (run tools/check.py)`,
        });
      }
    }
  }
  for (const miss of captures.missing) {
    problems.push({
      severity: "warn",
      rule: "capture/missing",
      where: miss.where,
      message: "`auto` block has no Rust block above it to name its capture",
    });
  }
  info.push(
    `captured outputs: ${capturedFiles.length} files, ${captures.autoBlocks} auto blocks, ${captures.referenced.size} referenced`,
  );

  // ---- published statistics -------------------------------------------------
  if (options.checkReadmeStats) {
    const readmePath = options.readmePath ?? path.join(process.cwd(), "README.md");
    const numbers = guideNumbers(guide, {
      rustFences: countRustFences(chaptersDir, chapterFiles),
      capturedOutputs: capturedFiles.length,
      autoBlocks: captures.autoBlocks,
      glossaryLinked: termRefs.size,
      inboundEdges: [...inbound.values()].reduce((a, b) => a + b, 0),
      proseWords: proseWordsTotal,
      longSentences: longestSentenceCount,
    });
    let readme: string | null;
    try {
      readme = fs.readFileSync(readmePath, "utf8");
    } catch {
      readme = null;
    }
    if (readme === null) {
      problems.push({
        severity: "error",
        rule: "docs/stats",
        where: "README.md",
        message: "could not be read, so its statistics table cannot be checked",
      });
    } else {
      const printed = new Map<string, number>();
      for (const line of readme.split("\n")) {
        const cells = line
          .split("|")
          .map((cell) => cell.trim())
          .filter(Boolean);
        if (cells.length < 2) continue;
        const value = Number(cells[1].replace(/[`*,]/g, ""));
        if (Number.isFinite(value)) printed.set(cells[0], value);
      }
      for (const label of README_STAT_LABELS) {
        const expected = readmeStatValue(numbers, label);
        const actual = printed.get(label);
        if (actual === undefined) {
          problems.push({
            severity: "error",
            rule: "docs/stats",
            where: "README.md",
            message: `statistics table has no “${label}” row; run \`npm run stats\``,
          });
        } else if (actual !== expected) {
          problems.push({
            severity: "error",
            rule: "docs/stats",
            where: "README.md",
            message: `statistics table says ${label} is ${actual}, but the parser counts ${expected}; run \`npm run stats\``,
          });
        }
      }
    }
  }

  // ---- information, for the person reading the CI log ---------------------
  const glossaryTerms = Object.keys(guide.glossary).length;
  info.push(`glossary: ${termRefs.size} of ${glossaryTerms} terms are linked from prose`);
  info.push(
    `cross-links: ${[...inbound.values()].reduce((a, b) => a + b, 0)} inbound edges across ${inbound.size} chapters`,
  );
  info.push(`sentences over 55 words: ${longestSentenceCount}`);

  return { problems, info };
}
