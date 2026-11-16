import type { BlockNode, ChapterData } from "./guide-types";

/**
 * Pure progress arithmetic.
 *
 * No React and no storage here: the page hands in the chapter shapes it already
 * parsed and the reader's saved state, and gets back a fully described row per
 * chapter. That keeps the dashboard renderable on the server and keeps the
 * scoring rules in one place.
 */

export interface QuizMeta {
  id: string;
  questions: number;
}

export interface ChapterMeta {
  id: string;
  num: string;
  title: string;
  short: string;
  partTitle: string;
  kind: "chapter" | "project" | "orientation" | "appendix";
  level: string;
  minutes: number;
  quizzes: QuizMeta[];
  exercises: string[];
}

export interface StoredQuizAnswer {
  picked: number;
  correct?: boolean;
}

export interface ProgressState {
  done: Record<string, number>;
  quiz: Record<string, Record<string, StoredQuizAnswer>>;
  saved: Record<string, number>;
  bookmarks: Record<string, number>;
}

export interface ChapterProgress {
  id: string;
  num: string;
  title: string;
  short: string;
  partTitle: string;
  kind: ChapterMeta["kind"];
  level: string;
  minutes: number;
  done: boolean;
  bookmarked: boolean;
  quizTotal: number;
  quizAnswered: number;
  quizCorrect: number;
  exerciseTotal: number;
  exerciseSolved: number;
  /** 0–100, over chapters, quiz questions and exercises equally weighted. */
  pct: number;
}

export interface ProgressTotals {
  chaptersTotal: number;
  chaptersDone: number;
  questionsTotal: number;
  questionsAnswered: number;
  questionsCorrect: number;
  exercisesTotal: number;
  exercisesSolved: number;
  bookmarksTotal: number;
  minutesRead: number;
  minutesTotal: number;
  /** Everything that can be completed, as one percentage. */
  pct: number;
  /** Accuracy over answered questions, or null when nothing is answered. */
  accuracy: number | null;
}

/** Walk a chapter's blocks, including ones nested inside callouts. */
export function collectChapterMeta(chapter: ChapterData): ChapterMeta {
  const quizzes: QuizMeta[] = [];
  const exercises: string[] = [];

  const visit = (blocks: BlockNode[]) => {
    for (const block of blocks) {
      if (block.type === "quiz") {
        quizzes.push({ id: block.quizId, questions: block.questions.length });
      } else if (block.type === "exercise") {
        exercises.push(block.exerciseId);
      } else if (block.type === "callout" || block.type === "details") {
        visit(block.blocks);
      } else if (block.type === "blockquote") {
        visit(block.blocks);
      } else if (block.type === "list") {
        for (const item of block.items) visit(item.blocks);
      }
    }
  };
  visit(chapter.blocks);

  return {
    id: chapter.id,
    num: chapter.num,
    title: chapter.title,
    short: chapter.short,
    partTitle: chapter.partTitle,
    kind: chapter.kind,
    level: chapter.level,
    minutes: chapter.time,
    quizzes,
    exercises,
  };
}

function ratio(done: number, total: number): number {
  return total > 0 ? Math.round((100 * done) / total) : 0;
}

export function buildChapterProgress(meta: ChapterMeta, state: ProgressState): ChapterProgress {
  const answers = state.quiz;
  let quizTotal = 0;
  let quizAnswered = 0;
  let quizCorrect = 0;

  for (const quiz of meta.quizzes) {
    quizTotal += quiz.questions;
    const savedQuiz = answers[quiz.id] ?? {};
    for (const answer of Object.values(savedQuiz)) {
      quizAnswered += 1;
      // `correct` is absent for answers recorded by 2.0, before it was stored.
      if (answer.correct) quizCorrect += 1;
    }
  }

  const exerciseTotal = meta.exercises.length;
  const exerciseSolved = meta.exercises.filter((id) => state.saved[id]).length;
  const done = Boolean(state.done[meta.id]);

  // A question counts towards completion only when it was answered correctly.
  // Crediting any answer let a reader reach 100% by pressing random options.
  const units = 1 + quizTotal + exerciseTotal;
  const earned = (done ? 1 : 0) + Math.min(quizCorrect, quizTotal) + exerciseSolved;

  return {
    id: meta.id,
    num: meta.num,
    title: meta.title,
    short: meta.short,
    partTitle: meta.partTitle,
    kind: meta.kind,
    level: meta.level,
    minutes: meta.minutes,
    done,
    bookmarked: Boolean(state.bookmarks[meta.id]),
    quizTotal,
    quizAnswered: Math.min(quizAnswered, quizTotal),
    quizCorrect: Math.min(quizCorrect, quizTotal),
    exerciseTotal,
    exerciseSolved,
    pct: ratio(earned, units),
  };
}

export function summariseProgress(rows: ChapterProgress[]): ProgressTotals {
  const trackedRows = rows.filter((row) => row.kind !== "appendix");
  const totals: ProgressTotals = {
    chaptersTotal: trackedRows.length,
    chaptersDone: 0,
    questionsTotal: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    exercisesTotal: 0,
    exercisesSolved: 0,
    bookmarksTotal: rows.filter((row) => row.bookmarked).length,
    minutesRead: 0,
    minutesTotal: 0,
    pct: 0,
    accuracy: null,
  };

  let units = 0;
  let earned = 0;

  for (const row of trackedRows) {
    if (row.done) {
      totals.chaptersDone += 1;
      totals.minutesRead += row.minutes;
    }
    totals.questionsTotal += row.quizTotal;
    totals.questionsAnswered += row.quizAnswered;
    totals.questionsCorrect += row.quizCorrect;
    totals.exercisesTotal += row.exerciseTotal;
    totals.exercisesSolved += row.exerciseSolved;
    totals.minutesTotal += row.minutes;

    units += 1 + row.quizTotal + row.exerciseTotal;
    earned += (row.done ? 1 : 0) + row.quizCorrect + row.exerciseSolved;
  }

  totals.pct = ratio(earned, units);
  totals.accuracy =
    totals.questionsAnswered > 0
      ? Math.round((100 * totals.questionsCorrect) / totals.questionsAnswered)
      : null;

  return totals;
}

/** The chapter to read next: the first unfinished one, in curriculum order. */
export function nextChapter(rows: ChapterProgress[]): ChapterProgress | null {
  return rows.find((row) => row.kind !== "appendix" && !row.done) ?? null;
}

// ---- progress export / import ---------------------------------------------
//
// A reader's progress lives in one browser. The export is a small JSON
// document they can carry to another machine; the import validates it against
// the schema below before anything is applied, and the reader chooses between
// replacing and merging — imported state never silently overwrites local
// state. There is no account, no upload and no server copy.

/** State that may travel in an export: progress plus reading preferences. */
export interface ExportableProgressState extends ProgressState {
  last?: string;
  theme?: string;
  fs?: number;
}

export const PROGRESS_EXPORT_FORMAT = "rust-from-zero-progress";
export const PROGRESS_EXPORT_VERSION = 1;

export interface ProgressExport {
  format: typeof PROGRESS_EXPORT_FORMAT;
  version: typeof PROGRESS_EXPORT_VERSION;
  exportedAt: string;
  state: ExportableProgressState;
}

export function serialiseProgress(
  state: ExportableProgressState,
  exportedAt: Date = new Date(),
): string {
  const document: ProgressExport = {
    format: PROGRESS_EXPORT_FORMAT,
    version: PROGRESS_EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    state: {
      done: state.done,
      quiz: state.quiz,
      saved: state.saved,
      bookmarks: state.bookmarks,
      last: state.last,
      theme: state.theme,
      fs: state.fs,
    },
  };
  return JSON.stringify(document, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidStateKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 200 &&
    key !== "__proto__" &&
    key !== "constructor" &&
    key !== "prototype"
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function numberRecord(value: unknown, field: string): Record<string, number> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`“${field}” must be an object`);
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isValidStateKey(key)) throw new Error(`“${field}” contains an invalid key`);
    if (typeof entry !== "number" || !Number.isSafeInteger(entry) || entry <= 0) {
      throw new Error(`“${field}.${key}” must be a positive integer`);
    }
    out[key] = entry;
  }
  return out;
}

function quizRecord(value: unknown): Record<string, Record<string, StoredQuizAnswer>> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error("“quiz” must be an object");
  const out: Record<string, Record<string, StoredQuizAnswer>> = {};
  for (const [quizId, answers] of Object.entries(value)) {
    if (!isValidStateKey(quizId)) throw new Error("“quiz” contains an invalid key");
    if (!isRecord(answers)) throw new Error(`“quiz.${quizId}” must be an object`);
    const clean: Record<string, StoredQuizAnswer> = {};
    for (const [index, answer] of Object.entries(answers)) {
      const questionIndex = Number(index);
      if (!/^(0|[1-9]\d*)$/.test(index) || !Number.isSafeInteger(questionIndex)) {
        throw new Error(`“quiz.${quizId}.${index}” is not a valid question index`);
      }

      if (typeof answer === "number") {
        // 2.0.0 stored the bare option index, before correctness was kept.
        if (!isNonNegativeInteger(answer)) {
          throw new Error(`“quiz.${quizId}.${index}” has an invalid option index`);
        }
        clean[index] = { picked: answer };
      } else if (isRecord(answer) && isNonNegativeInteger(answer.picked)) {
        if (answer.correct !== undefined && typeof answer.correct !== "boolean") {
          throw new Error(`“quiz.${quizId}.${index}.correct” must be a boolean`);
        }
        clean[index] = {
          picked: answer.picked,
          correct: typeof answer.correct === "boolean" ? answer.correct : undefined,
        };
      } else {
        throw new Error(`“quiz.${quizId}.${index}” is not a stored answer`);
      }
    }
    if (Object.keys(clean).length > 0) out[quizId] = clean;
  }
  return out;
}

export type ProgressImportResult =
  { ok: true; state: ExportableProgressState; exportedAt: string } | { ok: false; error: string };

/** Validate an export document. Nothing is applied when this fails. */
export function parseProgressExport(text: string): ProgressImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not JSON." };
  }
  try {
    if (!isRecord(raw)) throw new Error("The file does not hold an export document.");
    if (raw.format !== PROGRESS_EXPORT_FORMAT) {
      throw new Error("That file was not exported by Rust from Zero.");
    }
    if (raw.version !== PROGRESS_EXPORT_VERSION) {
      throw new Error(`Export version ${String(raw.version)} is not supported here.`);
    }
    if (!isRecord(raw.state)) throw new Error("The export has no “state” object.");
    if (
      raw.state.fs !== undefined &&
      (typeof raw.state.fs !== "number" ||
        !Number.isSafeInteger(raw.state.fs) ||
        raw.state.fs < 15 ||
        raw.state.fs > 24)
    ) {
      throw new Error("“fs” must be an integer between 15 and 24");
    }
    const state: ExportableProgressState = {
      done: numberRecord(raw.state.done, "done"),
      quiz: quizRecord(raw.state.quiz),
      saved: numberRecord(raw.state.saved, "saved"),
      bookmarks: numberRecord(raw.state.bookmarks, "bookmarks"),
      last: typeof raw.state.last === "string" ? raw.state.last : undefined,
      theme:
        raw.state.theme === "light" || raw.state.theme === "dark" || raw.state.theme === "system"
          ? raw.state.theme
          : undefined,
      fs: typeof raw.state.fs === "number" ? raw.state.fs : undefined,
    };
    return {
      ok: true,
      state,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "That export is not valid.",
    };
  }
}

/** True when a state holds anything a reader would mind losing. */
export function hasProgress(state: ExportableProgressState): boolean {
  return (
    Object.keys(state.done).length > 0 ||
    Object.keys(state.quiz).length > 0 ||
    Object.keys(state.saved).length > 0 ||
    Object.keys(state.bookmarks).length > 0
  );
}

/**
 * Merge an import into local state without removing local work: every local
 * entry stays, and imported entries are added only where local state has
 * nothing. Replacing wholesale is a separate, explicit choice in the
 * interface; merging is the safe default when the reader is unsure which
 * machine is newer.
 */
export function mergeProgress(
  local: ExportableProgressState,
  imported: ExportableProgressState,
): ExportableProgressState {
  const quiz: ExportableProgressState["quiz"] = { ...imported.quiz };
  for (const [quizId, answers] of Object.entries(local.quiz)) {
    quiz[quizId] = { ...(imported.quiz[quizId] ?? {}), ...answers };
  }
  return {
    done: { ...imported.done, ...local.done },
    quiz,
    saved: { ...imported.saved, ...local.saved },
    bookmarks: { ...imported.bookmarks, ...local.bookmarks },
    last: local.last ?? imported.last,
    theme: local.theme ?? imported.theme,
    fs: local.fs ?? imported.fs,
  };
}

export function bookmarkedChapters(rows: ChapterProgress[]): ChapterProgress[] {
  return rows.filter((row) => row.bookmarked);
}

/**
 * Split rows into the three states a reader cares about, in curriculum order:
 * finished, started, untouched. `started` is anything with partial work.
 */
export function bucketChapters(rows: ChapterProgress[]): {
  completed: ChapterProgress[];
  started: ChapterProgress[];
  untouched: ChapterProgress[];
} {
  const completed: ChapterProgress[] = [];
  const started: ChapterProgress[] = [];
  const untouched: ChapterProgress[] = [];
  for (const row of rows) {
    if (row.kind === "appendix") continue;
    if (row.done) completed.push(row);
    else if (row.quizAnswered > 0 || row.pct > 0) started.push(row);
    else untouched.push(row);
  }
  return { completed, started, untouched };
}
