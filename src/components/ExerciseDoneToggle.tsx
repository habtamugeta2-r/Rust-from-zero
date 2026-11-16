"use client";

import React from "react";
import { useGuideState } from "./GuideStateProvider";

export function ExerciseDoneToggle({ exerciseId }: { exerciseId: string }) {
  const { state, setSaved } = useGuideState();
  const isDone = Boolean(state.saved[exerciseId]);

  return (
    <label className="no-print ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[var(--g-ink2)] select-none">
      <input
        type="checkbox"
        checked={isDone}
        onChange={(e) => setSaved(exerciseId, e.target.checked)}
        className="h-4 w-4 rounded accent-[var(--g-accent)]"
      />
      <span>{isDone ? "Done" : "Mark done"}</span>
    </label>
  );
}
