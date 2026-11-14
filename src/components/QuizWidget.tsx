"use client";

import React from "react";
import { HelpCircle, RotateCcw } from "lucide-react";
import { useGuideState } from "./GuideStateProvider";

export interface RenderedQuizQuestion {
  index: number;
  promptNode: React.ReactNode;
  options: {
    label: string;
    correct: boolean;
    content: React.ReactNode;
  }[];
  explanationNode: React.ReactNode;
}

export function QuizWidget({
  quizId,
  title,
  questions,
}: {
  quizId: string;
  title: React.ReactNode;
  questions: RenderedQuizQuestion[];
}) {
  const { state, setQuizAnswer, resetQuiz } = useGuideState();
  const saved = state.quiz[quizId] ?? {};

  const answeredCount = questions.filter(
    (q) => saved[String(q.index)] !== undefined
  ).length;
  const correctCount = questions.filter((q) => {
    const picked = saved[String(q.index)];
    return picked !== undefined && q.options[picked]?.correct;
  }).length;

  return (
    <section
      className="my-8 overflow-hidden rounded-2xl border border-[var(--g-line2)] bg-[var(--g-surface)] shadow-sm"
      aria-label="Quiz"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-5 py-3.5 font-sans">
        <HelpCircle className="h-5 w-5 text-[var(--g-accent)]" aria-hidden="true" />
        <span className="font-bold text-[var(--g-ink)]">{title}</span>
        {answeredCount > 0 && (
          <span
            aria-live="polite"
            className="ml-auto rounded-full bg-[var(--g-surface)] px-3 py-0.5 text-xs font-semibold text-[var(--g-ink2)] ring-1 ring-[var(--g-line2)]"
          >
            {correctCount} of {questions.length} correct
          </span>
        )}
        {answeredCount > 0 && (
          <button
            type="button"
            onClick={() => resetQuiz(quizId)}
            className="no-print inline-flex items-center gap-1 rounded-lg border border-[var(--g-line2)] bg-[var(--g-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        )}
      </div>

      <div className="divide-y divide-[var(--g-line)]">
        {questions.map((q) => {
          const picked = saved[String(q.index)];
          const isAnswered = picked !== undefined;
          const isOk = isAnswered && q.options[picked]?.correct;

          return (
            <div key={q.index} className="p-5">
              <div className="mb-3.5 flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--g-accent-soft)] font-sans text-xs font-bold text-[var(--g-accent)]">
                  {q.index + 1}
                </span>
                <div className="min-w-0 flex-1 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
                  {q.promptNode}
                </div>
              </div>

              <div className="space-y-2 pl-9">
                {q.options.map((opt, oi) => {
                  const isPicked = picked === oi;
                  let cls =
                    "border-[var(--g-line)] bg-[var(--g-bg)]/60 hover:border-[var(--g-accent)] hover:bg-[var(--g-surface)]";
                  if (isAnswered) {
                    if (opt.correct) {
                      cls =
                        "border-emerald-500/70 bg-emerald-50/80 text-emerald-950 dark:border-emerald-600/70 dark:bg-emerald-950/35 dark:text-emerald-100";
                    } else if (isPicked) {
                      cls =
                        "border-red-400 bg-red-50/80 text-red-950 dark:border-red-700 dark:bg-red-950/35 dark:text-red-100";
                    } else {
                      cls = "border-[var(--g-line)] opacity-60";
                    }
                  }

                  return (
                    <button
                      key={oi}
                      type="button"
                      disabled={isAnswered}
                      onClick={() => setQuizAnswer(quizId, q.index, oi)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left font-sans text-[15px] transition-colors ${cls} disabled:cursor-default`}
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--g-surface)] text-xs font-bold text-[var(--g-ink2)] ring-1 ring-[var(--g-line2)]">
                        {opt.label}
                      </span>
                      <span className="flex-1 leading-snug">{opt.content}</span>
                    </button>
                  );
                })}
              </div>

              {isAnswered && (
                <div
                  className={`mt-3.5 ml-9 rounded-xl border px-4 py-3 font-sans text-sm leading-relaxed ${
                    isOk
                      ? "border-emerald-300 bg-emerald-50/60 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/25 dark:text-emerald-100"
                      : "border-amber-300 bg-amber-50/60 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-100"
                  }`}
                >
                  <strong className="mr-1.5 font-bold">
                    {isOk ? "Correct." : "Not quite."}
                  </strong>
                  <div className="inline [&>p]:inline [&>p:not(:last-child)]:after:content-['_']">
                    {q.explanationNode}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
