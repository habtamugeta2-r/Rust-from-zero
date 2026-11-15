"use client";

import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";

export interface RenderedGlossaryItem {
  plainTerm: string;
  plainDef: string;
  termNode: React.ReactNode;
  defNode: React.ReactNode;
}

export function GlossaryDirectory({
  entries,
}: {
  entries: RenderedGlossaryItem[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.plainTerm.includes(q) || e.plainDef.includes(q)
    );
  }, [entries, query]);

  return (
    <div className="my-6">
      <label className="relative mb-6 block font-sans">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--g-ink3)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter the glossary…"
          aria-label="Filter the glossary"
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-[var(--g-line)] bg-[var(--g-surface)] pr-4 pl-10 text-sm text-[var(--g-ink)] shadow-card placeholder:text-[var(--g-ink3)] focus:border-[var(--g-accent)] focus:outline-none"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-[var(--g-line)] bg-[var(--g-surface)] p-4 font-sans text-sm text-[var(--g-ink3)]">
          No matching term. Try a shorter word.
        </p>
      ) : (
        <dl className="divide-y divide-[var(--g-line)] rounded-card border border-[var(--g-line)] bg-[var(--g-surface)]">
          {filtered.map((entry, idx) => (
            <div
              key={idx}
              className="grid gap-1 px-5 py-3.5 md:grid-cols-[12rem_1fr] md:gap-6"
            >
              <dt className="font-sans font-bold text-[var(--g-ink)]">
                {entry.termNode}
              </dt>
              <dd className="text-[0.95em] text-[var(--g-ink2)]">
                {entry.defNode}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
