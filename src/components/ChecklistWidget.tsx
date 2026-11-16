"use client";

import React from "react";
import { useGuideState } from "./GuideStateProvider";

export function ChecklistWidget({
  checklistId,
  items,
}: {
  checklistId?: string;
  items: { id: string; content: React.ReactNode }[];
}) {
  const { state, setSaved } = useGuideState();
  const doneCount = items.filter((item) => Boolean(state.saved[item.id])).length;

  return (
    <ul
      id={checklistId}
      role="group"
      aria-label={`Checklist, ${doneCount} of ${items.length} complete`}
      className="my-5 space-y-2.5 rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] p-4 shadow-card sm:p-5"
    >
      {items.map((item) => {
        const checked = Boolean(state.saved[item.id]);
        return (
          <li key={item.id} className="list-none">
            <label data-reading-checklist className="flex cursor-pointer items-start gap-3 font-sans text-[15.5px] leading-snug">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setSaved(item.id, e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded accent-[var(--g-accent)]"
              />
              <span
                className={
                  checked
                    ? "text-[var(--g-ink3)] line-through"
                    : "text-[var(--g-ink)]"
                }
              >
                {item.content}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
