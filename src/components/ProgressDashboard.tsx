"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookMarked,
  Bookmark,
  Check,
  CircleDot,
  Clock,
  Download,
  ListChecks,
  RotateCcw,
  Target,
  Upload,
} from "lucide-react";
import { useGuideState } from "./GuideStateProvider";
import {
  bookmarkedChapters,
  bucketChapters,
  buildChapterProgress,
  hasProgress,
  nextChapter,
  parseProgressExport,
  serialiseProgress,
  summariseProgress,
  type ChapterMeta,
  type ExportableProgressState,
} from "@/lib/progress";

/**
 * The dashboard body. Chapter shapes come from the server (parsed once at build
 * time); only the reader's own state is client-side, so the page stays usable
 * even before storage has hydrated.
 */
export function ProgressDashboard({ chapters }: { chapters: ChapterMeta[] }) {
  const {
    state,
    persistent,
    resetAllProgress,
    toggleDone,
    toggleBookmark,
    importProgress,
    showToast,
  } = useGuideState();
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingImport, setPendingImport] = useState<ExportableProgressState | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportProgress = () => {
    const text = serialiseProgress(state);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rust-from-zero-progress.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Progress exported as a JSON file.");
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseProgressExport(await file.text());
    if (!result.ok) {
      setPendingImport(null);
      setImportError(result.error);
      return;
    }
    setImportError(null);
    if (hasProgress(state)) {
      // Local work exists: ask before anything is replaced or merged.
      setPendingImport(result.state);
    } else {
      importProgress(result.state, "replace");
    }
  };

  const rows = useMemo(
    () => chapters.map((chapter) => buildChapterProgress(chapter, state)),
    [chapters, state],
  );
  const totals = useMemo(() => summariseProgress(rows), [rows]);
  const upNext = useMemo(() => nextChapter(rows), [rows]);
  const marks = useMemo(() => bookmarkedChapters(rows), [rows]);
  const { started, untouched } = useMemo(() => bucketChapters(rows), [rows]);

  const nothingYet = totals.chaptersDone === 0 && totals.questionsAnswered === 0;

  return (
    <div className="space-y-10">
      {/* Headline numbers */}
      <section aria-labelledby="progress-summary">
        <h2 id="progress-summary" className="sr-only">
          Summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={Check}
            value={`${totals.chaptersDone}/${totals.chaptersTotal}`}
            label="chapters done"
          />
          <Stat
            icon={Target}
            value={totals.accuracy === null ? "—" : `${totals.accuracy}%`}
            label={
              totals.questionsAnswered > 0
                ? `${totals.questionsAnswered} answered`
                : "quiz accuracy"
            }
          />
          <Stat
            icon={ListChecks}
            value={`${totals.exercisesSolved}/${totals.exercisesTotal}`}
            label="exercises solved"
          />
          <Stat icon={Bookmark} value={`${totals.bookmarksTotal}`} label="bookmarks" />
        </div>

        <div className="mt-4 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-sans text-sm font-semibold text-[var(--g-ink)]">
              Overall completion
            </span>
            <span className="font-sans text-xs text-[var(--g-ink3)]">
              {totals.pct}% · {totals.minutesRead} of {totals.minutesTotal} min of reading done
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Overall completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={totals.pct}
            className="h-2 overflow-hidden rounded-full bg-[var(--g-line)]"
          >
            <div
              className="h-full rounded-full bg-[var(--g-accent)] transition-[width] duration-300"
              style={{ width: `${totals.pct}%` }}
            />
          </div>
          <p className="mt-2.5 font-sans text-xs leading-relaxed text-[var(--g-ink3)]">
            Chapter completion, quiz answers and solved exercises all count toward this number.
          </p>
        </div>
      </section>

      {/* Up next */}
      {upNext && (
        <section aria-labelledby="up-next">
          <h2
            id="up-next"
            className="mb-3 font-sans text-xs font-bold tracking-wider text-[var(--g-ink3)] uppercase"
          >
            {nothingYet ? "Start here" : "Continue"}
          </h2>
          <Link
            href={`/chapters/${upNext.id}`}
            className="group flex items-center gap-4 rounded-card border border-[var(--g-line2)] bg-[var(--g-surface)] p-4 shadow-card transition-colors hover:border-[var(--g-accent)] sm:p-5"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--g-accent-soft)] font-mono text-sm font-bold text-[var(--g-accent)]">
              {upNext.num}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-sans text-[15px] font-bold text-[var(--g-ink)]">
                {upNext.title}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs text-[var(--g-ink3)]">
                <span className="truncate">{upNext.partTitle}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {upNext.minutes} min
                </span>
                {upNext.pct > 0 && <span>{upNext.pct}% done</span>}
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-[var(--g-ink3)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--g-accent)]"
              aria-hidden="true"
            />
          </Link>
        </section>
      )}

      {/* Bookmarks */}
      <section aria-labelledby="bookmarks">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="bookmarks"
            className="font-sans text-xs font-bold tracking-wider text-[var(--g-ink3)] uppercase"
          >
            Bookmarks
          </h2>
          <span className="font-sans text-xs text-[var(--g-ink3)]">{marks.length}</span>
        </div>
        {marks.length === 0 ? (
          <p className="rounded-card border border-dashed border-[var(--g-line2)] px-4 py-6 text-center font-sans text-sm text-[var(--g-ink3)]">
            No bookmarks yet. Open any chapter and press{" "}
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--g-ink2)]">
              <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
              Bookmark
            </span>{" "}
            to keep it here.
          </p>
        ) : (
          <ul className="space-y-2">
            {marks.map((row) => (
              <li key={row.id}>
                <div className="flex items-center gap-3 rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-3.5 py-2.5">
                  <Link
                    href={`/chapters/${row.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="w-7 shrink-0 font-mono text-[11px] text-[var(--g-ink3)]">
                      {row.num}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] font-semibold text-[var(--g-ink)]">
                      {row.short}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleBookmark(row.id)}
                    aria-label={`Remove bookmark from ${row.title}`}
                    title="Remove bookmark"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--g-accent)] hover:bg-[var(--g-sunken)]"
                  >
                    <Bookmark className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* In progress */}
      {started.length > 0 && (
        <section aria-labelledby="in-progress">
          <h2
            id="in-progress"
            className="mb-3 font-sans text-xs font-bold tracking-wider text-[var(--g-ink3)] uppercase"
          >
            In progress
          </h2>
          <ul className="space-y-2">
            {started.map((row) => (
              <ChapterRow
                key={row.id}
                row={row}
                onToggleDone={toggleDone}
                onToggleBookmark={toggleBookmark}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Not started */}
      {untouched.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-sans text-xs font-bold tracking-wider text-[var(--g-ink3)] uppercase hover:text-[var(--g-ink)]">
            <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
            Not started yet
            <span className="font-medium normal-case">({untouched.length})</span>
          </summary>
          <ul className="mt-3 space-y-2">
            {untouched.map((row) => (
              <ChapterRow
                key={row.id}
                row={row}
                onToggleDone={toggleDone}
                onToggleBookmark={toggleBookmark}
              />
            ))}
          </ul>
        </details>
      )}

      {/* Housekeeping */}
      <section
        aria-labelledby="storage"
        className="rounded-card border border-[var(--g-line)] bg-[var(--g-sunken)] p-4 font-sans"
      >
        <h2 id="storage" className="text-[13px] font-bold text-[var(--g-ink)]">
          {persistent ? "Saved in this browser" : "Session-only progress"}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--g-ink3)]">
          {persistent
            ? "Progress, quiz answers, solved exercises and bookmarks are stored locally in this browser. Nothing is uploaded."
            : "This browser is blocking local storage, so progress disappears when you close the tab."}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--g-ink3)]">
          Moving to another machine or browser? Export your progress as a JSON file and import it
          there. The file holds your finished chapters, quiz answers, solved exercises, bookmarks,
          theme and text size. An import is checked before it is applied, and when this browser
          already holds progress you choose whether to replace it or merge the two.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportProgress}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--g-line2)] bg-[var(--g-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export progress
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--g-line2)] bg-[var(--g-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Import progress
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Choose a progress export file to import"
            className="sr-only"
            onChange={(event) => {
              void onImportFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {importError && (
          <p role="alert" className="mt-2 text-xs font-medium text-red-700">
            Import stopped: {importError} Nothing was changed.
          </p>
        )}
        {pendingImport && (
          <div className="mt-3 rounded-xl border border-[var(--g-line2)] bg-[var(--g-surface)] p-3">
            <p className="text-xs leading-relaxed text-[var(--g-ink2)]">
              This browser already holds progress. Replace it with the imported file, or merge the
              two? Merging keeps everything already here and adds anything the file has that this
              browser lacks.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  importProgress(pendingImport, "replace");
                  setPendingImport(null);
                }}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800"
              >
                Replace my progress
              </button>
              <button
                type="button"
                onClick={() => {
                  importProgress(pendingImport, "merge");
                  setPendingImport(null);
                }}
                className="rounded-lg border border-[var(--g-line2)] px-3 py-1.5 text-xs font-semibold text-[var(--g-ink2)] hover:text-[var(--g-ink)]"
              >
                Merge the two
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-lg border border-[var(--g-line2)] px-3 py-1.5 text-xs font-semibold text-[var(--g-ink2)] hover:text-[var(--g-ink)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirmReset ? (
            <>
              <button
                type="button"
                onClick={() => {
                  resetAllProgress();
                  setConfirmReset(false);
                }}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800"
              >
                Yes, erase progress
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-[var(--g-line2)] px-3 py-1.5 text-xs font-semibold text-[var(--g-ink2)] hover:text-[var(--g-ink)]"
              >
                Cancel
              </button>
              <span className="text-xs text-[var(--g-ink3)]">Bookmarks are kept.</span>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--g-line2)] bg-[var(--g-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset progress
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-3.5 shadow-card">
      <Icon className="h-4 w-4 text-[var(--g-accent)]" aria-hidden="true" />
      <div className="mt-2 font-sans text-xl font-bold tracking-tight text-[var(--g-ink)] tabular-nums">
        {value}
      </div>
      <div className="font-sans text-[11.5px] leading-tight text-[var(--g-ink3)]">{label}</div>
    </div>
  );
}

function ChapterRow({
  row,
  onToggleDone,
  onToggleBookmark,
}: {
  row: {
    id: string;
    num: string;
    title: string;
    short: string;
    done: boolean;
    bookmarked: boolean;
    pct: number;
    quizTotal: number;
    quizAnswered: number;
    exerciseTotal: number;
    exerciseSolved: number;
  };
  onToggleDone: (id: string) => void;
  onToggleBookmark: (id: string) => void;
}) {
  const parts: string[] = [];
  if (row.quizTotal > 0) {
    parts.push(`${row.quizAnswered}/${row.quizTotal} quiz`);
  }
  if (row.exerciseTotal > 0) {
    parts.push(`${row.exerciseSolved}/${row.exerciseTotal} exercises`);
  }

  return (
    <li className="rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onToggleDone(row.id)}
          aria-pressed={row.done}
          aria-label={`${row.done ? "Mark as not done" : "Mark as done"}: ${row.title}`}
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors ${
            row.done
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-[var(--g-line2)] text-transparent hover:border-[var(--g-accent)]"
          }`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <Link href={`/chapters/${row.id}`} className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <span className="w-7 shrink-0 font-mono text-[11px] text-[var(--g-ink3)]">{row.num}</span>
          <span className="min-w-0 flex-1 truncate font-sans text-[13.5px] font-semibold text-[var(--g-ink)]">
            {row.short}
          </span>
        </Link>

        <button
          type="button"
          onClick={() => onToggleBookmark(row.id)}
          aria-pressed={row.bookmarked}
          aria-label={`${row.bookmarked ? "Remove bookmark from" : "Bookmark"} ${row.title}`}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--g-sunken)] ${
            row.bookmarked ? "text-[var(--g-accent)]" : "text-[var(--g-ink3)]"
          }`}
        >
          <Bookmark
            className="h-3.5 w-3.5"
            fill={row.bookmarked ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3 pl-9">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--g-line)]"
          aria-hidden="true"
        >
          <div
            className={`h-full rounded-full ${row.done ? "bg-emerald-600" : "bg-[var(--g-accent)]"}`}
            style={{ width: `${row.pct}%` }}
          />
        </div>
        <span className="shrink-0 font-sans text-[11px] text-[var(--g-ink3)] tabular-nums">
          {parts.length > 0 ? parts.join(" · ") : `${row.pct}%`}
        </span>
      </div>
    </li>
  );
}
