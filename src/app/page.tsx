import React from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen, Braces, Layers3 } from "lucide-react";
import { HeroRunner } from "@/components/HeroRunner";
import { HomeContinueButton } from "@/components/HomeContinueButton";
import { HomeRoutesSection } from "@/components/HomeRoutesSection";
import { loadGuide } from "@/lib/guide-parser";
import { courseJsonLd } from "@/lib/seo";

export default function HomePage() {
  const { stats, parts, routes, summaries } = loadGuide();

  return (
    <div className="landing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(courseJsonLd(parts, summaries)).replace(/</g, "\\u003c"),
        }}
      />

      <section className="landing-hero landing-container">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">
            <span /> A HANDS-ON GUIDE TO RUST
          </p>
          <h1>
            Understand more.
            <br />
            <em>Build better.</em>
          </h1>
          <p className="landing-hero-description">
            Learn Rust from the ground up, and discover how your code works beneath the surface. A
            practical guide for curious minds, from your first program to real-world projects.
          </p>
          <HomeContinueButton chapters={summaries} />
          <div className="landing-hero-note">
            <span className="landing-note-line" /> FREE TO EXPLORE <span>·</span> LEARN AT YOUR OWN
            PACE
          </div>
        </div>
        <div className="landing-hero-visual">
          <div className="landing-visual-top">
            <span>YOUR FIRST PROGRAM</span>
            <span>01 / 01</span>
          </div>
          <HeroRunner trackedChapters={stats.trackedChapters} />
          <div className="landing-visual-bottom">
            <span>WRITE IT. RUN IT. UNDERSTAND IT.</span>
            <span>↗</span>
          </div>
        </div>
        <a className="landing-scroll" href="#approach">
          <ArrowDown size={15} aria-hidden="true" /> SCROLL TO EXPLORE
        </a>
      </section>

      <section className="landing-stats" aria-label="Course at a glance">
        <div className="landing-container landing-stats-inner">
          <p>
            AN ENTIRE WORLD
            <br />
            <strong>TO EXPLORE.</strong>
          </p>
          {[
            [stats.trackedChapters, "chapters"],
            [stats.exercises, "solved exercises"],
            [stats.questions, "quiz questions"],
            [stats.projects, "hands-on projects"],
          ].map(([number, label]) => (
            <div className="landing-stat" key={label}>
              <strong>{number}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="approach" className="landing-container landing-approach">
        <div className="landing-section-heading">
          <div>
            <p className="landing-eyebrow">
              <span /> THE APPROACH
            </p>
            <h2>
              Learn the language.
              <br />
              <em>See the bigger picture.</em>
            </h2>
          </div>
          <p>
            Good software starts with understanding. This guide connects the concepts to the code,
            one thoughtful step at a time.
          </p>
        </div>
        <div className="landing-feature-grid">
          <article>
            <div className="landing-feature-icon">
              <BookOpen size={21} />
            </div>
            <span className="landing-feature-number">01 / THE FOUNDATIONS</span>
            <h3>Start with clarity.</h3>
            <p>
              Build your understanding with plain-language explanations, visual examples, and a pace
              that works for you.
            </p>
          </article>
          <article>
            <div className="landing-feature-icon">
              <Braces size={21} />
            </div>
            <span className="landing-feature-number">02 / THE PRACTICE</span>
            <h3>Learn by doing.</h3>
            <p>
              Run real Rust code, work through exercises, and turn new ideas into skills you can
              actually use.
            </p>
          </article>
          <article>
            <div className="landing-feature-icon">
              <Layers3 size={21} />
            </div>
            <span className="landing-feature-number">03 / THE BIG PICTURE</span>
            <h3>Go beneath the code.</h3>
            <p>
              Explore memory, operating systems, networking, and the machinery that makes your
              programs run.
            </p>
          </article>
        </div>
      </section>

      <section className="landing-curriculum">
        <div className="landing-container landing-curriculum-inner">
          <div>
            <p className="landing-eyebrow">
              <span /> YOUR PATH FORWARD
            </p>
            <h2>
              From first steps
              <br />
              <em>to what&apos;s next.</em>
            </h2>
            <p>
              Follow the guide from beginning to end, or find the chapters that match what you want
              to build. Your progress stays saved in your browser.
            </p>
            <Link href="/chapters" className="landing-text-link">
              Explore the curriculum <ArrowRight size={17} />
            </Link>
          </div>
          <div className="landing-path-list">
            <Link href="/chapters/start">
              <span>01</span>
              <strong>Start with the essentials</strong>
              <ArrowRight size={18} />
            </Link>
            <Link href="/chapters/roadmap">
              <span>02</span>
              <strong>Find your learning path</strong>
              <ArrowRight size={18} />
            </Link>
            <Link href="/progress">
              <span>03</span>
              <strong>Track your progress</strong>
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <div className="landing-container landing-routes">
        <details>
          <summary>
            Explore the interactive learning paths <span>+</span>
          </summary>
          <HomeRoutesSection parts={parts} routes={routes} chapters={summaries} />
        </details>
      </div>
      <footer className="landing-footer">
        <div className="landing-container">
          <strong>
            Rust from Zero<span>.</span>
          </strong>
          <p>A little curiosity goes a long way.</p>
          <Link href="/chapters/start">
            Let&apos;s get started <ArrowRight size={16} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
