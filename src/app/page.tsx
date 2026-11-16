import React from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpen, Braces, Layers3 } from "lucide-react";
import { HeroRunner } from "@/components/HeroRunner";
import { HomeContinueButton } from "@/components/HomeContinueButton";
import { HomeRoutesSection } from "@/components/HomeRoutesSection";
import { LandingShowcase } from "@/components/LandingShowcase";
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

      <section className="landing-container">
        <div className="landing-hero">
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
              practical guide for curious minds — from your first program to real-world systems and
              projects.
            </p>
            <HomeContinueButton chapters={summaries} />
            <div className="landing-hero-note">
              <span className="landing-note-line" aria-hidden="true" />
              <span>FREE TO EXPLORE</span>
              <span aria-hidden="true">·</span>
              <span>RUNS RUST 2024 IN-BROWSER</span>
              <span aria-hidden="true">·</span>
              <span>SAVED LOCALLY</span>
            </div>
          </div>

          <div className="landing-hero-visual">
            <div className="landing-visual-top">
              <span>YOUR FIRST PROGRAM</span>
              <span>LIVE PLAYGROUND</span>
            </div>
            <HeroRunner trackedChapters={stats.trackedChapters} />
            <div className="landing-visual-bottom">
              <span>WRITE IT. RUN IT. UNDERSTAND IT.</span>
              <span>PRESS RUN OR EDIT ↗</span>
            </div>
          </div>
        </div>

        <div className="landing-scroll-row">
          <a className="landing-scroll" href="#approach">
            <ArrowDown size={14} aria-hidden="true" />
            <span>SCROLL TO EXPLORE</span>
          </a>
        </div>
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
              <BookOpen size={20} aria-hidden="true" />
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
              <Braces size={20} aria-hidden="true" />
            </div>
            <span className="landing-feature-number">02 / THE PRACTICE</span>
            <h3>Learn by doing.</h3>
            <p>
              Edit and run real Rust code in place, work through solved exercises, and turn new
              ideas into skills you can actually use.
            </p>
          </article>
          <article>
            <div className="landing-feature-icon">
              <Layers3 size={20} aria-hidden="true" />
            </div>
            <span className="landing-feature-number">03 / THE BIG PICTURE</span>
            <h3>Go beneath the code.</h3>
            <p>
              Explore memory, compilers, operating systems, networking, and the machinery that makes
              your programs run.
            </p>
          </article>
        </div>
      </section>

      <LandingShowcase />

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
              Follow the guide from beginning to end, or pick the chapters that match what you want
              to build. Your progress, bookmarks, and quiz scores stay privately saved in your
              browser.
            </p>
            <Link href="/chapters" className="landing-text-link">
              <span>Explore the full curriculum</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="landing-path-list">
            <Link href="/chapters/start">
              <span>01</span>
              <span className="landing-path-copy">
                <strong>Start with the essentials</strong>
                <small>Chapter 0 orientation, tools, and your first program</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/chapters/roadmap">
              <span>02</span>
              <span className="landing-path-copy">
                <strong>Find your learning path</strong>
                <small>See how the 15 parts and 9 projects fit together</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link href="/progress">
              <span>03</span>
              <span className="landing-path-copy">
                <strong>Track your progress</strong>
                <small>Bookmarks, solved exercises, and exportable local state</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <div className="landing-container landing-routes-wrap">
        <HomeRoutesSection parts={parts} routes={routes} chapters={summaries} />
      </div>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-main">
          <div className="landing-footer-brand">
            <strong>
              Rust from Zero<span>.</span>
            </strong>
            <p>A little curiosity goes a long way.</p>
          </div>

          <nav aria-label="Footer navigation" className="landing-footer-links">
            <Link href="/chapters">Curriculum</Link>
            <Link href="/chapters/roadmap">Roadmap</Link>
            <Link href="/progress">Progress</Link>
            <Link href="/search">Search</Link>
            <Link href="/chapters/glossary">Glossary</Link>
          </nav>

          <Link href="/chapters/start" className="landing-footer-cta">
            <span>Let&apos;s get started</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="landing-container landing-footer-attribution">
          <a href="https://github.com/rust-lang/rust-artwork/tree/master/logo">Rust logo</a> by the
          Rust Project, used under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>; recolored and used
          as a browser icon. Rust from Zero is an independent guide and is not endorsed by the Rust
          Project.
        </div>
      </footer>
    </div>
  );
}
