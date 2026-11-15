"use client";

import React, { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center font-sans">
      <p className="text-sm font-bold uppercase tracking-wider text-[var(--g-accent)]">
        Something went wrong
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--g-ink)]">
        This page failed to load
      </h1>
      <p className="mt-3 text-base text-[var(--g-ink2)]">
        An unexpected error occurred while rendering the guide. You can try
        again — if it keeps happening, the details below will help in a bug
        report.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-[var(--g-ink3)]">
          Error digest: {error.digest}
        </p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-[var(--g-accent)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--g-accent-hover)]"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-xl border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--g-ink)] hover:border-[var(--g-accent)]"
        >
          Go home
        </a>
      </div>
    </div>
  );
}
