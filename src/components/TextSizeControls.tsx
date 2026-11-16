"use client";

import { useGuideState } from "./GuideStateProvider";

/** Adjusts chapter reading text without resizing the navigation chrome. */
export function TextSizeControls() {
  const { fontSize, stepFontSize } = useGuideState();
  return (
    <div role="group" aria-label="Chapter reading text size" className="reading-size-controls">
      <button
        type="button"
        onClick={() => stepFontSize(-1)}
        disabled={fontSize <= 15}
        aria-label="Decrease reading text size"
        title="Decrease reading text size"
      >
        A−
      </button>
      <output aria-live="polite" aria-label={`Reading text size ${fontSize} pixels`}>
        {fontSize}
      </output>
      <button
        type="button"
        onClick={() => stepFontSize(1)}
        disabled={fontSize >= 24}
        aria-label="Increase reading text size"
        title="Increase reading text size"
      >
        A+
      </button>
    </div>
  );
}
