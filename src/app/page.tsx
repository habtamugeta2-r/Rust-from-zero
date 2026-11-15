import React from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { HomeContinueButton } from "@/components/HomeContinueButton";
import { HomeRoutesSection } from "@/components/HomeRoutesSection";
import { loadGuide } from "@/lib/guide-parser";
import { courseJsonLd } from "@/lib/seo";

export default function HomePage() {
  const guide = loadGuide();
  const { stats, parts, routes, summaries } = guide;

  const steps = [
    {
      n: "01",
      title: "Read",
      body: (
        <>
          Every idea starts with an everyday comparison. Every technical word
          is explained the first time it appears, and again in the{" "}
          <Link
            href="/chapters/glossary"
            className="font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40"
          >
            glossary
          </Link>
          .
        </>
      ),
    },
    {
      n: "02",
      title: "Run",
      body: (
        <>
          {stats.codeBlocks} code listings, and every Rust program among them
          compiled and run with the real Rust compiler. Press{" "}
          <strong className="text-[var(--g-ink)]">Run</strong> on a complete
          example to open it in the free online Rust Playground.
        </>
      ),
    },
    {
      n: "03",
      title: "Practise",
      body: (
        <>
          Guided exercises, practice tasks and challenges follow every
          concept, each with a hint and a fully explained solution. Quizzes
          give instant feedback.
        </>
      ),
    },
    {
      n: "04",
      title: "Build",
      body: (
        <>
          Projects at every milestone: a game, a to-do app, a search tool, a
          report generator, a chat server, a command-line tool, a web API with a
          database, a Linux systems inspector, and a capstone.
        </>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(courseJsonLd(parts, summaries)).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.25fr_0.95fr] lg:gap-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--g-line)] bg-[var(--g-surface)] px-3.5 py-1.5 font-sans text-xs font-semibold text-[var(--g-ink2)] shadow-card">
            <BadgeCheck className="h-3.5 w-3.5 text-[var(--g-accent)]" />
            Self-study course · Rust 2024 edition · tested on Rust 1.100
          </p>

          <h1 className="mt-5 font-sans text-[40px] leading-[1.08] font-bold tracking-[-0.02em] text-[var(--g-ink)] sm:text-[52px]">
            Learn Rust from zero.
            <br />
            <span className="text-[var(--g-accent)]">Understand the whole machine.</span>
          </h1>

          <p className="mt-5 max-w-xl font-sans text-[17px] leading-relaxed text-[var(--g-ink2)]">
            A complete guide to computer systems, Rust internals, and real-world
            software—starting from absolute zero. Follow the full journey from
            transistors, binary, and CPU registers through compilation, memory
            organisation, operating systems, I/O, networking, and storage up to
            concurrent services and Linux systems tools. Explore the{" "}
            <Link
              href="/chapters/roadmap"
              className="font-medium text-[var(--g-accent)] underline decoration-[var(--g-accent)]/40 underline-offset-4"
            >
              Complete Learning Roadmap
            </Link>{" "}
            or jump straight into Chapter 1.
          </p>

          <HomeContinueButton chapters={summaries} />

          <dl className="mt-10 grid grid-cols-2 gap-x-4 gap-y-6 border-t border-[var(--g-line)] pt-6 font-sans sm:grid-cols-4">
            {[
              [String(stats.trackedChapters), "chapters"],
              [String(stats.exercises), "exercises with solutions"],
              [String(stats.questions), "quiz questions"],
              [String(stats.projects), "hands-on projects"],
            ].map(([num, label]) => (
              <div key={label} className="flex flex-col">
                <dt className="order-2 mt-1.5 text-[13px] text-[var(--g-ink3)]">
                  {label}
                </dt>
                <dd className="order-1 text-[28px] leading-none font-bold tracking-tight tabular-nums text-[var(--g-ink)]">
                  {num}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Hero visual: editor + terminal, always-dark code card */}
        <div className="space-y-4 font-mono text-[13px]" aria-hidden="true">
          <div className="overflow-hidden rounded-card border border-[#2c2820] bg-[#191713] text-[#e8e3d8] shadow-pop">
            <div className="flex items-center justify-between border-b border-[#2c2820] bg-[#211e19] px-4 py-2 text-[12px] text-[#8f887a]">
              <span className="font-semibold text-[#c5beb0]">src/main.rs</span>
              <span className="rounded-md bg-[#2c2820] px-2 py-0.5 text-[11px] font-semibold text-[#a89f8f]">
                Rust · stable
              </span>
            </div>
            <pre className="overflow-x-auto p-4 leading-[1.7]">
              <code>
                <span className="text-[#f47067]">fn</span>{" "}
                <span className="text-[#dcbdfb]">main</span>() {"{\n"}
                {"    "}
                <span className="text-[#f47067]">let</span> learner ={" "}
                <span className="text-[#87d7a8]">{'"you"'}</span>;{"\n"}
                {"    "}
                <span className="text-[#f47067]">let</span> chapters ={" "}
                <span className="text-[#f2cc60]">{stats.trackedChapters}</span>;
                {"\n\n"}
                {"    "}
                <span className="text-[#61afef]">println!</span>(
                <span className="text-[#87d7a8]">{'"Hello, {learner}!"'}</span>
                );{"\n"}
                {"    "}
                <span className="text-[#61afef]">println!</span>(
                <span className="text-[#87d7a8]">
                  {'"'}
                  {"{chapters} chapters to go."}
                  {'"'}
                </span>
                );{"\n}"}
              </code>
            </pre>
          </div>

          <div className="overflow-hidden rounded-card border border-[var(--g-line)] bg-[var(--g-surface)] shadow-card">
            <div className="border-b border-[var(--g-line)] bg-[var(--g-sunken)] px-4 py-2 font-sans text-xs font-semibold text-[var(--g-ink3)]">
              Terminal
            </div>
            <pre className="overflow-x-auto p-4 text-[var(--g-ink2)] leading-[1.7]">
              <code>
                <span className="select-none text-[var(--g-accent)]">$ </span>
                <span className="font-semibold text-[var(--g-ink)]">
                  cargo run
                </span>
                {"\n"}
                <span className="text-[var(--g-ink3)]">
                  Compiling your-first-program v0.1.0
                  {"\n"}
                </span>
                Hello, you!{"\n"}
                {stats.trackedChapters} chapters to go.
              </code>
            </pre>
          </div>
        </div>
      </section>

      {/* How this guide works */}
      <section className="mt-20">
        <h2 className="font-sans text-[26px] font-bold tracking-tight text-[var(--g-ink)]">
          How this guide works
        </h2>
        <div className="mt-7 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="border-t-2 border-[var(--g-line)] pt-4">
              <div className="flex items-baseline justify-between font-sans">
                <span className="text-[13px] font-bold tabular-nums text-[var(--g-accent)]">
                  {s.n}
                </span>
                <span className="h-px w-8 bg-[var(--g-accent)]/50" />
              </div>
              <h3 className="mt-2.5 font-sans text-[17px] font-bold text-[var(--g-ink)]">
                {s.title}
              </h3>
              <p className="mt-1.5 font-sans text-sm leading-relaxed text-[var(--g-ink2)]">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Learning Path */}
      <HomeRoutesSection parts={parts} routes={routes} chapters={summaries} />
    </div>
  );
}
