import React from "react";
import Link from "next/link";
import { BookOpen, Code2, Hammer, Pencil } from "lucide-react";
import { HomeContinueButton } from "@/components/HomeContinueButton";
import { HomeRoutesSection } from "@/components/HomeRoutesSection";
import { loadGuide } from "@/lib/guide-parser";

export default function HomePage() {
  const guide = loadGuide();
  const { stats, parts, routes, summaries } = guide;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.25fr_0.95fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--g-line)] bg-[var(--g-surface)] px-3.5 py-1 font-sans text-xs font-semibold text-[var(--g-ink2)]">
            <span
              className="h-2 w-2 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            Self-study course · Rust 2024 edition · tested on Rust 1.100
          </p>

          <h1 className="mt-4 font-sans text-4xl font-extrabold tracking-tight text-[var(--g-ink)] sm:text-5xl">
            Learn Rust from zero.
            <br />
            <em className="not-italic text-[var(--g-accent)]">
              Build real things.
            </em>
          </h1>

          <p className="mt-4 max-w-xl text-[17.5px] leading-relaxed text-[var(--g-ink2)]">
            A complete guide for people who have never written a line of code.
            Plain language, everyday analogies and hundreds of exercises take you
            from “what is a program?” to web servers, databases, games and
            beyond. Every Rust example is compiled and run, with its real
            output, and the{" "}
            <Link
              href="/chapters/next"
              className="font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-4 hover:decoration-[var(--g-accent)]"
            >
              last chapter
            </Link>{" "}
            says plainly what the guide does not cover.
          </p>

          <HomeContinueButton chapters={summaries} />

          <dl className="mt-9 grid grid-cols-2 gap-4 border-t border-[var(--g-line)] pt-6 font-sans sm:grid-cols-4">
            <div>
              <dt className="text-2xl font-extrabold text-[var(--g-ink)]">
                {stats.trackedChapters}
              </dt>
              <dd className="text-xs font-medium text-[var(--g-ink3)]">
                chapters
              </dd>
            </div>
            <div>
              <dt className="text-2xl font-extrabold text-[var(--g-ink)]">
                {stats.exercises}
              </dt>
              <dd className="text-xs font-medium text-[var(--g-ink3)]">
                exercises with solutions
              </dd>
            </div>
            <div>
              <dt className="text-2xl font-extrabold text-[var(--g-ink)]">
                {stats.questions}
              </dt>
              <dd className="text-xs font-medium text-[var(--g-ink3)]">
                quiz questions
              </dd>
            </div>
            <div>
              <dt className="text-2xl font-extrabold text-[var(--g-ink)]">
                {stats.projects}
              </dt>
              <dd className="text-xs font-medium text-[var(--g-ink3)]">
                hands-on projects
              </dd>
            </div>
          </dl>
        </div>

        {/* Hero decorative Rust + Terminal cards */}
        <div className="space-y-4 font-mono text-[13px]" aria-hidden="true">
          <div className="overflow-hidden rounded-2xl border border-stone-800 bg-[#181b21] text-stone-100 shadow-lg">
            <div className="flex items-center gap-1.5 border-b border-stone-800 bg-[#1f232b] px-4 py-2.5 text-xs text-stone-400">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              <span className="ml-2 font-medium text-stone-300">
                src/main.rs
              </span>
            </div>
            <pre className="overflow-x-auto p-4 leading-relaxed">
              <code>
                <span className="text-rose-400">fn</span>{" "}
                <span className="text-purple-300">main</span>() {"{\n"}
                {"    "}
                <span className="text-rose-400">let</span> learner ={" "}
                <span className="text-emerald-300">{'"you"'}</span>;{"\n"}
                {"    "}
                <span className="text-rose-400">let</span> chapters ={" "}
                <span className="text-amber-300">{stats.trackedChapters}</span>;
                {"\n\n"}
                {"    "}
                <span className="text-sky-300">println!</span>(
                <span className="text-emerald-300">{'"Hello, {learner}!"'}</span>
                );{"\n"}
                {"    "}
                <span className="text-sky-300">println!</span>(
                <span className="text-emerald-300">
                  {'"'}
                  {"{chapters} chapters to go."}
                  {'"'}
                </span>
                );{"\n}"}
              </code>
            </pre>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--g-line)] bg-[var(--g-surface)] shadow-sm">
            <div className="border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-2 font-sans text-xs font-semibold text-[var(--g-ink3)]">
              Terminal
            </div>
            <pre className="overflow-x-auto p-4 text-[var(--g-ink2)] leading-relaxed">
              <code>
                <span className="text-[var(--g-ink3)]">$ </span>
                <span className="font-semibold text-[var(--g-ink)]">
                  cargo run
                </span>
                {"\n"}Hello, you!{"\n"}
                {stats.trackedChapters} chapters to go.
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* How this guide works */}
      <section className="mt-16">
        <h2 className="font-sans text-2xl font-bold tracking-tight text-[var(--g-ink)]">
          How this guide works
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
            <BookOpen
              className="h-5 w-5 text-[var(--g-accent)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-sans text-base font-bold text-[var(--g-ink)]">
              Read
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--g-ink2)]">
              Every idea starts with an everyday comparison. Every technical
              word is explained the first time it appears, and again in the{" "}
              <Link
                href="/chapters/glossary"
                className="font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40"
              >
                glossary
              </Link>
              .
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
            <Code2
              className="h-5 w-5 text-[var(--g-accent)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-sans text-base font-bold text-[var(--g-ink)]">
              Run
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--g-ink2)]">
              {stats.codeBlocks} code listings, and every Rust program among
              them compiled and run with the real Rust compiler. Press{" "}
              <strong className="text-[var(--g-ink)]">Run</strong> on a complete
              example to open it in the free online Rust Playground.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
            <Pencil
              className="h-5 w-5 text-[var(--g-accent)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-sans text-base font-bold text-[var(--g-ink)]">
              Practise
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--g-ink2)]">
              Guided exercises, practice tasks and challenges follow every
              concept, each with a hint and a fully explained solution. Quizzes
              give instant feedback.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--g-line)] bg-[var(--g-surface)] p-5">
            <Hammer
              className="h-5 w-5 text-[var(--g-accent)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-sans text-base font-bold text-[var(--g-ink)]">
              Build
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--g-ink2)]">
              Projects at every milestone: a game, a to-do app, a search tool, a
              chat server, a command-line tool, a web API with a database, and a
              capstone.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Learning Path */}
      <HomeRoutesSection parts={parts} routes={routes} chapters={summaries} />
    </div>
  );
}
