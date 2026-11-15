import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center font-sans">
      <p className="text-sm font-bold uppercase tracking-wider text-[var(--g-accent)]">
        404
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--g-ink)]">
        Chapter not found
      </h1>
      <p className="mt-3 text-base text-[var(--g-ink2)]">
        That page does not exist in this guide. Head back to the overview or jump
        straight to Chapter 0.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-[var(--g-accent)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--g-accent-hover)]"
        >
          Go home
        </Link>
        <Link
          href="/chapters/start"
          className="rounded-xl border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--g-ink)] hover:border-[var(--g-accent)]"
        >
          Chapter 0: Before you start
        </Link>
      </div>
    </div>
  );
}
