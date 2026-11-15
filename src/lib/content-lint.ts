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
export const APP_ROUTES = ["/", "/progress", "/search"] as const;

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
function proseWordCount(blocks: BlockNode[]): number {
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

export function lintContent(
  guide: LoadedGuide,
  options: { chaptersDir?: string } = {}
): LintReport {
  const problems: LintProblem[] = [];
  const info: string[] = [];
  const chaptersDir =
    options.chaptersDir ?? path.join(process.cwd(), "guide-src", "chapters");

  const knownIds = new Set(guide.chapters.map((chapter) => chapter.id));

  // ---- per-chapter structure, spelling and links -------------------------
  const inbound = new Map<string, number>();
  const termRefs = new Set<string>();
  let longestSentenceCount = 0;

  for (const chapter of guide.chapters) {
    const nodes = collectNodes(chapter.blocks);
    const quizzes = nodes.filter((node) => node.type === "quiz");
    const exercises = nodes.filter((node) => node.type === "exercise");
    const callouts = nodes.filter((node) => node.type === "callout");

    // links
    for (const node of nodes) {
      if (node.type === "internalLink") {
        if (node.chapterId !== chapter.id && node.chapterId !== "home") {
          inbound.set(node.chapterId, (inbound.get(node.chapterId) ?? 0) + 1);
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
      const questions = quizzes.reduce(
        (sum: number, node: any) => sum + node.questions.length,
        0
      );
      if (chapter.kind === "project" || chapter.kind === "orientation") {
        if (questions === 0 && chapter.kind === "project") {
          problems.push({
            severity: "warn",
            rule: "structure/project-quiz",
            where: chapter.file,
            message: "project chapter has no quiz (the other projects are the same)",
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
        const match = new RegExp(`(?<![\\w-])${american}(?![\\w-])`, "i").exec(
          sentenceFree
        );
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

  // ---- information, for the person reading the CI log ---------------------
  const glossaryTerms = Object.keys(guide.glossary).length;
  info.push(
    `glossary: ${termRefs.size} of ${glossaryTerms} terms are linked from prose`
  );
  info.push(
    `cross-links: ${[...inbound.values()].reduce((a, b) => a + b, 0)} inbound edges across ${inbound.size} chapters`
  );
  info.push(`sentences over 55 words: ${longestSentenceCount}`);

  return { problems, info };
}
