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

/** The slice of a glossary entry the hover tooltip needs. */
export interface GlossaryTipItem {
  key: string;
  term: string;
  definitionPlain: string;
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
      /**
       * Whether this block has a runnable wrapper (`fullCode`) different from
       * the visible code. The wrapper itself is fetched on demand from
       * `GET /api/playground`, because carrying it inside the chapter made the
       * RSC payload as large as the page itself.
       */
      hasFullCode: boolean;
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
  | { type: "callout"; kind: CalloutKind; title?: InlineNode[]; blocks: BlockNode[] }
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
}

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

/**
 * The slice of a part the client shell needs: its identity, for the sidebar
 * heading. The blurb and level are server-side facts and stay out of the
 * serialised payload.
 */
export interface PartNav {
  key: string;
  partLabel: string;
  partTitle: string;
}

/**
 * The slice of a chapter the client shell needs: enough to draw a sidebar row,
 * tick it as read and count progress. Titles and numbering, no prose.
 */
export interface ChapterProgressInput {
  id: string;
  num: string;
  part: string;
  kind: string;
  short: string;
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
  /**
   * Runnable wrappers (`fullCode`) keyed by the SHA-1 of the block they wrap.
   * Served on demand by `GET /api/playground`, so the wrapper of every listing
   * is not shipped inside every page that renders it.
   */
  wrappers: Record<string, string>;
  warnings: string[];
}
