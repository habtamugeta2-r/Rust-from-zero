"use client";

import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Layers, RotateCcw } from "lucide-react";
import type { StepperStackEntry } from "@/lib/guide-types";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];
const STATE_TAG: Record<string, { label: string; good?: boolean }> = {
  moved: { label: "moved out" },
  gone: { label: "gone" },
  freed: { label: "freed" },
  mut: { label: "mutable", good: true },
  ref: { label: "borrow", good: true },
};

const HEAP_COLORS = [
  "bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200",
  "bg-purple-100 text-purple-900 dark:bg-purple-950/80 dark:text-purple-200",
];

function renderValueWithPointers(value: string) {
  const parts = value.split(/(->#\d+)/g);
  return parts.map((part, idx) => {
    const m = part.match(/^->#(\d+)$/);
    if (!m) return <React.Fragment key={idx}>{part}</React.Fragment>;
    const num = Number(m[1]);
    const tone = HEAP_COLORS[(num - 1) % HEAP_COLORS.length];
    return (
      <span
        key={idx}
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold ${tone}`}
      >
        → {CIRCLED[num - 1] ?? num}
      </span>
    );
  });
}

export interface RenderedStepperStep {
  lines: number[];
  stack: StepperStackEntry[];
  heap: { id: number; value: string; state: string }[];
  note: React.ReactNode;
}

export function MemoryStepper({
  title,
  highlightedLines,
  steps,
}: {
  title: React.ReactNode;
  highlightedLines: string[];
  steps: RenderedStepperStep[];
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const current = steps[stepIdx];

  const seenLines = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i <= stepIdx; i++) {
      for (const ln of steps[i]?.lines ?? []) set.add(ln);
    }
    return set;
  }, [steps, stepIdx]);

  const stackFrames = useMemo(() => {
    const order: string[] = [];
    const byFrame: Record<string, StepperStackEntry[]> = {};
    for (const v of current?.stack ?? []) {
      if (!byFrame[v.frame]) {
        byFrame[v.frame] = [];
        order.push(v.frame);
      }
      byFrame[v.frame].push(v);
    }
    return order.slice().reverse().map((frame) => ({
      frame,
      vars: byFrame[frame],
    }));
  }, [current]);

  if (!current) return null;

  const isLast = stepIdx === steps.length - 1;

  return (
    <div className="my-7 overflow-hidden rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-3 font-sans">
        <div className="flex items-center gap-2 font-bold text-[var(--g-ink)]">
          <Layers className="h-4 w-4 text-[var(--g-accent)]" aria-hidden="true" />
          <span>Step through it: {title}</span>
        </div>

        <div className="no-print flex items-center gap-2">
          <button
            type="button"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--g-line2)] bg-[var(--g-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--g-ink2)] transition-colors hover:border-[var(--g-accent)] disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="min-w-[5.5rem] text-center text-xs font-medium text-[var(--g-ink3)]">
            Step {stepIdx + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => setStepIdx(isLast ? 0 : stepIdx + 1)}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--g-accent)] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--g-accent-hover)]"
          >
            {isLast ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Start over
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      <ol className="divide-y divide-[var(--g-line)]/40 bg-[var(--g-code-bg)] py-2 font-mono text-[13.5px] leading-relaxed">
        {highlightedLines.map((htmlLine, idx) => {
          const lineNum = idx + 1;
          const active = current.lines.includes(lineNum);
          const seen = seenLines.has(lineNum);
          return (
            <li
              key={lineNum}
              className={`flex items-baseline gap-3 px-4 py-0.5 transition-colors ${
                active
                  ? "border-l-4 border-[var(--g-accent)] bg-[var(--g-accent-soft)]/70 font-medium"
                  : seen
                    ? "border-l-4 border-transparent"
                    : "border-l-4 border-transparent opacity-65"
              }`}
            >
              <span className="w-5 shrink-0 select-none text-right text-[11px] text-[var(--g-ink3)]">
                {lineNum}
              </span>
              <code
                className="shiki min-w-0 flex-1 whitespace-pre"
                dangerouslySetInnerHTML={{ __html: htmlLine || " " }}
              />
            </li>
          );
        })}
      </ol>

      <div className="grid gap-4 border-t border-[var(--g-line)] bg-[var(--g-bg)]/60 p-4 font-sans md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wider text-[var(--g-ink3)]">
            <span>Stack</span>
            <span className="font-normal normal-case">small, fast, automatic</span>
          </div>
          {stackFrames.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--g-line2)] px-3 py-2.5 text-xs italic text-[var(--g-ink3)]">
              nothing yet
            </div>
          ) : (
            <div className="space-y-2.5">
              {stackFrames.map((f) => (
                <div
                  key={f.frame}
                  className="overflow-hidden rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)]"
                >
                  <div className="border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-3 py-1 font-mono text-xs font-bold text-[var(--g-ink2)]">
                    {f.frame}()
                  </div>
                  <div className="divide-y divide-[var(--g-line)]/60">
                    {f.vars.map((v, vi) => {
                      const tag = STATE_TAG[v.state];
                      const muted = v.state === "moved" || v.state === "gone";
                      return (
                        <div
                          key={vi}
                          className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                            muted ? "opacity-50" : ""
                          }`}
                        >
                          <span className="font-mono font-bold text-[var(--g-ink)]">
                            {v.name}
                          </span>
                          <span className="flex items-center gap-2 font-mono text-[13px] text-[var(--g-ink2)]">
                            {renderValueWithPointers(v.value)}
                            {tag && (
                              <span
                                className={`rounded-full px-2 py-0.5 font-sans text-[10.5px] font-bold ${
                                  tag.good
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                                    : "bg-[var(--g-sunken)] text-[var(--g-ink2)] ring-1 ring-[var(--g-line)]"
                                }`}
                              >
                                {tag.label}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between text-xs font-bold uppercase tracking-wider text-[var(--g-ink3)]">
            <span>Heap</span>
            <span className="font-normal normal-case">big, flexible, must be freed</span>
          </div>
          {current.heap.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--g-line2)] px-3 py-2.5 text-xs italic text-[var(--g-ink3)]">
              empty
            </div>
          ) : (
            <div className="space-y-2">
              {current.heap.map((h) => {
                const tone = HEAP_COLORS[(h.id - 1) % HEAP_COLORS.length];
                const freed = h.state === "freed";
                return (
                  <div
                    key={h.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] px-3 py-2 text-sm ${
                      freed ? "opacity-50" : ""
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${tone}`}
                    >
                      {CIRCLED[h.id - 1] ?? h.id}
                    </span>
                    <span className="flex items-center gap-2 font-mono text-[13px] text-[var(--g-ink2)]">
                      {renderValueWithPointers(h.value)}
                      {freed && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 font-sans text-[10.5px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          freed
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p
        aria-live="polite"
        className="border-t border-[var(--g-line)] bg-[var(--g-surface)] px-4 py-3 font-sans text-sm leading-relaxed text-[var(--g-ink)]"
      >
        {current.note}
      </p>
    </div>
  );
}
