export type ChapterKind = "chapter" | "project" | "orientation" | "appendix";
export type ChapterLevel = "beginner" | "intermediate" | "advanced" | "all";

export type CalloutKind =
  | "analogy"
  | "plain"
  | "compare"
  | "warn"
  | "tip"
  | "note"
  | "key"
  | "recap";

export interface PartMeta {
  key: string;
  title: string;
  partLabel: string; // e.g. "Part 1" or ""
  partTitle: string; // e.g. "Part 1 · First steps" or "Start here"
  level: string;
  blurb: string;
}

export interface RouteMeta {
  id: string;
  label: string;
  summary: string;
  chapters: string[] | null;
}

export interface GlossaryEntry {
  key: string;
  term: string;
  definitionMarkdown: string;
  definitionNodes: InlineNode[];
  definitionPlain: string;
}

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "kbd"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "term"; text: string; key: string }
  | { type: "internalLink"; chapterId: string; anchor?: string; children: InlineNode[] }
  /** A link to one of the app's own routes, e.g. `/progress`. */
  | { type: "routeLink"; href: string; children: InlineNode[] }
  | { type: "externalLink"; href: string; children: InlineNode[] };

export interface FlameNode {
  id: string;
  label: string;
  long: string;
  pct: number;
  widthPct: number;
  hue: number;
  children: FlameNode[];
}

export interface StepperStackEntry {
  frame: string;
  name: string;
  value: string;
  state: string;
}

export interface StepperHeapEntry {
  id: number;
  value: string;
  state: string;
}

export interface StepperStep {
  lines: number[];
  stack: StepperStackEntry[];
  heap: StepperHeapEntry[];
  note: InlineNode[];
}

export interface QuizQuestion {
  index: number;
  prompt: BlockNode[];
  options: { label: string; correct: boolean; children: InlineNode[] }[];
  explanation: BlockNode[];
}

export type BlockNode =
  | { type: "heading"; level: 2 | 3 | 4; id: string; text: string; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "hr" }
  | { type: "blockquote"; blocks: BlockNode[] }
  | { type: "list"; ordered: boolean; items: { children: InlineNode[]; blocks: BlockNode[] }[] }
  | { type: "table"; headers: InlineNode[][]; rows: InlineNode[][][] }
  | {
      type: "code";
      lang: string;
      label: string;
      code: string;
      fullCode?: string;
      filename?: string;
      isContinuation: boolean;
      kind: string;
      isExt: boolean;
      noPlay: boolean;
      isRelease: boolean;
      isSoft: boolean;
      isOutput: boolean;
      isError: boolean;
      isPanicOutput: boolean;
    }
  | { type: "flame"; caption: InlineNode[]; roots: FlameNode[] }
  | { type: "figure"; src: string; alt: string; caption: InlineNode[] }
  | { type: "callout"; kind: CalloutKind; id?: string; title?: InlineNode[]; blocks: BlockNode[] }
  | { type: "details"; title: InlineNode[]; blocks: BlockNode[] }
  | { type: "quiz"; quizId: string; title: InlineNode[]; questions: QuizQuestion[] }
  | {
      type: "exercise";
      exerciseId: string;
      kind: "guided" | "practice" | "challenge";
      title: InlineNode[];
      body: BlockNode[];
      hint?: BlockNode[];
      solution?: BlockNode[];
    }
  | { type: "checklist"; checklistId: string; items: { id: string; children: InlineNode[] }[] }
  | { type: "stepper"; title: InlineNode[]; code: string; steps: StepperStep[] }
  | {
      type: "glossary";
      entries: { term: InlineNode[]; definition: InlineNode[]; plainTerm: string; plainDef: string }[];
    };

export interface HeadingItem {
  id: string;
  level: 2 | 3 | 4;
  text: string;
}

/**
 * One node of a chapter's internal content graph.
 *
 * The sidebar renders a chapter as a tree of these: a section (`##`) holds
 * its subsections (`###`), which hold their key points — a `####` detail,
 * a `:::key` callout, an exercise, a quiz, a checklist or a recap. Every
 * node's `id` is the DOM anchor of the block it came from inside the
 * chapter page, so a node is also a deep link: `/chapters/<id>#<node id>`.
 * `children` is always present (empty for leaves) so renderers and tests
 * never have to null-check the graph.
 */
export type ContentNodeKind =
  | "section"
  | "subsection"
  | "detail"
  | "key"
  | "recap"
  | "exercise"
  | "quiz"
  | "checklist";

export interface ContentNode {
  /** DOM anchor id inside the chapter page (a heading id, `exerciseId`, …). */
  id: string;
  label: string;
  kind: ContentNodeKind;
  children: ContentNode[];
}

export interface ChapterSummary {
  id: string;
  num: string;
  part: string;
  partTitle: string;
  kind: ChapterKind;
  level: ChapterLevel;
  title: string;
  short: string;
  time: number;
  learn: string[];
  file: string;
  /** The chapter broken down into its internal content graph. */
  outline: ContentNode[];
}

/** Minimal chapter metadata sent to the client-side navigation shell. */
export type NavigationChapter = Pick<
  ChapterSummary,
  "id" | "num" | "part" | "partTitle" | "kind" | "title" | "short" | "time"
> & {
  /** Fetched on demand for the active chapter or when a reader expands it. */
  outline?: ContentNode[];
};

export interface ChapterData extends ChapterSummary {
  learnNodes: InlineNode[][];
  blocks: BlockNode[];
  headings: HeadingItem[];
  prev: ChapterSummary | null;
  next: ChapterSummary | null;
}

export interface GuideStats {
  totalChapters: number;
  trackedChapters: number;
  codeBlocks: number;
  exercises: number;
  questions: number;
  projects: number;
  totalMinutes: number;
}

export interface SearchEntry {
  chapterId: string;
  num: string;
  chapterTitle: string;
  anchor: string;
  heading: string;
  text: string;
  lower: string;
  weight: number;
}

export interface SearchHit {
  chapterId: string;
  num: string;
  chapterTitle: string;
  anchor: string;
  heading: string;
  before: string;
  match: string;
  after: string;
}

export interface LoadedGuide {
  parts: PartMeta[];
  routes: RouteMeta[];
  chapters: ChapterData[];
  chapterMap: Record<string, ChapterData>;
  summaries: ChapterSummary[];
  glossary: Record<string, GlossaryEntry>;
  stats: GuideStats;
  searchIndex: SearchEntry[];
  warnings: string[];
}
