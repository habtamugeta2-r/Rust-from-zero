"use client";

import React, { useEffect } from "react";
import Link from "next/link";

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
    <div className="mx-auto max-w-2xl px-5 py-20 text-center font-sans sm:px-8 lg:py-28">
      <p className="text-sm font-bold tracking-wider text-[var(--g-accent)]">
        Something went wrong
      </p>
      <h1 className="mt-2 text-[32px] leading-tight font-bold tracking-tight text-[var(--g-ink)]">
        This page panicked
      </h1>
      <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-[var(--g-ink2)]">
        An unexpected error occurred while rendering the guide. You can try
        again — if it keeps happening, the details below will help in a bug
        report.
      </p>
      {error.digest && (
        <p className="mt-3 inline-block rounded-md bg-[var(--g-sunken)] px-3 py-1.5 font-mono text-xs text-[var(--g-ink3)]">
          Error digest: {error.digest}
        </p>
      )}
      <div className="mt-8 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-well bg-[var(--g-accent)] px-5 py-2.5 text-sm font-bold text-[var(--g-on-accent)] shadow-card transition-colors hover:bg-[var(--g-accent-hover)]"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--g-ink)] shadow-card transition-colors hover:border-[var(--g-accent)]"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
