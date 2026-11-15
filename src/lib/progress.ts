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
    minutes: chapter.time,
    quizzes,
    exercises,
  };
}

function ratio(done: number, total: number): number {
  return total > 0 ? Math.round((100 * done) / total) : 0;
}

export function buildChapterProgress(
  meta: ChapterMeta,
  state: ProgressState
): ChapterProgress {
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

  const units = 1 + quizTotal + exerciseTotal;
  const earned =
    (done ? 1 : 0) + Math.min(quizAnswered, quizTotal) + exerciseSolved;

  return {
    id: meta.id,
    num: meta.num,
    title: meta.title,
    short: meta.short,
    partTitle: meta.partTitle,
    kind: meta.kind,
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
  const totals: ProgressTotals = {
    chaptersTotal: rows.length,
    chaptersDone: 0,
    questionsTotal: 0,
    questionsAnswered: 0,
    questionsCorrect: 0,
    exercisesTotal: 0,
    exercisesSolved: 0,
    bookmarksTotal: 0,
    minutesRead: 0,
    minutesTotal: 0,
    pct: 0,
    accuracy: null,
  };

  let units = 0;
  let earned = 0;

  for (const row of rows) {
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
    if (row.bookmarked) totals.bookmarksTotal += 1;

    units += 1 + row.quizTotal + row.exerciseTotal;
    earned +=
      (row.done ? 1 : 0) + row.quizAnswered + row.exerciseSolved;
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
  return rows.find((row) => !row.done) ?? null;
}

export function bookmarkedChapters(rows: ChapterProgress[]): ChapterProgress[] {
  return rows.filter((row) => row.bookmarked);
}

/**
 * Split rows into the three states a reader cares about, in curriculum order:
 * finished, started, untouched. `started` is anything with partial work.
 */
export function bucketChapters(rows: ChapterProgress[]): {
  started: ChapterProgress[];
  untouched: ChapterProgress[];
} {
  const started: ChapterProgress[] = [];
  const untouched: ChapterProgress[] = [];
  for (const row of rows) {
    if (row.done) continue;
    if (row.pct > 0) started.push(row);
    else untouched.push(row);
  }
  return { started, untouched };
}
