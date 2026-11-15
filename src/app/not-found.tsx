import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20 sm:px-8 lg:py-28">
      <p className="font-mono text-sm font-bold tracking-wider text-[var(--g-accent)]">
        404
      </p>
      <h1 className="mt-2 font-sans text-[32px] leading-tight font-bold tracking-tight text-[var(--g-ink)]">
        Chapter not found
      </h1>
      <p className="mt-3 max-w-lg font-sans text-base leading-relaxed text-[var(--g-ink2)]">
        The compiler checked and this page does not exist in the guide. Head
        back to the overview, or jump straight to Chapter 0.
      </p>

      {/* The on-brand part: the error, styled like the real ones in the guide */}
      <figure className="mt-8 overflow-hidden rounded-well border border-[var(--g-line)] bg-[var(--g-code-bg)]">
        <figcaption className="flex items-center gap-2.5 border-b border-[var(--g-line)] bg-[var(--g-code-head)] px-4 py-2 font-sans text-xs font-semibold tracking-[0.08em] text-[var(--g-ink3)] uppercase">
          <span
            className="h-2 w-2 rounded-full bg-[var(--g-line2)]"
            aria-hidden="true"
          />
          Compiler message
        </figcaption>
        <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-[1.6]">
          <code>
            <span className="err-er">error[E0404]</span>: page not found{"\n"}
            <span className="err-hl">--&gt;</span>{" "}
            <span className="sh-c">/chapters/you-are-here</span>:1:12{"\n"}
            <span className="err-hl"> 1 |</span> /chapters/you-are-here{"\n"}
            <span className="err-hl">   |</span>{"      "}
            <span className="err-er">^^^^^^^^^^^^^^^</span>{"\n"}
            <span className="err-hl">   |</span>{"\n"}
            <span className="err-hl">   = </span>
            <span className="err-hl">help</span>: try{" "}
            <span className="sh-cmd">/chapters/start</span> instead, or go
            home{"\n"}
          </code>
        </pre>
      </figure>

      <div className="mt-8 flex flex-wrap gap-3 font-sans">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-well bg-[var(--g-accent)] px-5 py-2.5 text-sm font-bold text-white shadow-card transition-colors hover:bg-[var(--g-accent-hover)]"
        >
          Go home
        </Link>
        <Link
          href="/chapters/start"
          className="inline-flex items-center gap-2 rounded-well border border-[var(--g-line2)] bg-[var(--g-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--g-ink)] shadow-card transition-colors hover:border-[var(--g-accent)]"
        >
          Chapter 0: Before you start
        </Link>
      </div>
    </div>
  );
}
