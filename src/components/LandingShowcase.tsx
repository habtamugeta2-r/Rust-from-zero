"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface ShowcaseSlide {
  id: string;
  num: string;
  title: string;
  subtitle: string;
  chapterHref: string;
  chapterLabel: string;
  lightSrc: string;
  darkSrc: string;
  alt: string;
}

const SLIDES: ShowcaseSlide[] = [
  {
    id: "ownership",
    num: "01",
    title: "Ownership & moves",
    subtitle:
      "See why Rust needs no garbage collector — and catches use-after-move at compile time.",
    chapterHref: "/chapters/ownership",
    chapterLabel: "Read Chapter 9: Ownership",
    lightSrc: "/images/ownership-move.svg",
    darkSrc: "/images/ownership-move-dark.svg",
    alt: "Diagram showing how let b = a transfers heap ownership from a to b without copying bytes.",
  },
  {
    id: "pipeline",
    num: "02",
    title: "The compilation pipeline",
    subtitle:
      "Follow your source text through tokens, AST, HIR, MIR borrow checking, LLVM IR and ELF.",
    chapterHref: "/chapters/compilation-pipeline",
    chapterLabel: "Read the compilation pipeline",
    lightSrc: "/images/compilation-pipeline.svg",
    darkSrc: "/images/compilation-pipeline-dark.svg",
    alt: "Diagram of the rustc compilation pipeline from main.rs to an ELF executable.",
  },
  {
    id: "virtual-memory",
    num: "03",
    title: "Virtual memory & hardware",
    subtitle:
      "Connect Rust pointers and allocators down to page tables, the MMU, and physical RAM.",
    chapterHref: "/chapters/virtual-memory-address-spaces",
    chapterLabel: "Read virtual memory & address spaces",
    lightSrc: "/images/virtual-memory.svg",
    darkSrc: "/images/virtual-memory-dark.svg",
    alt: "Diagram illustrating how page tables and the MMU translate virtual addresses into physical RAM frames.",
  },
];

/**
 * Interactive preview of real diagrams from the guide, giving visitors an
 * immediate sense of the visual explanations waiting inside.
 */
export function LandingShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = SLIDES[activeIndex];

  const selectTab = (nextIndex: number) => {
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      selectTab((index + 1) % SLIDES.length);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab((index - 1 + SLIDES.length) % SLIDES.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTab(SLIDES.length - 1);
    }
  };

  return (
    <section className="landing-showcase" aria-labelledby="showcase-heading">
      <div className="landing-container landing-showcase-grid">
        <div className="landing-showcase-head">
          <p className="landing-eyebrow">
            <span /> INSIDE THE GUIDE
          </p>
          <h2 id="showcase-heading">
            Visual mental models,
            <br />
            <em>not wall-to-wall jargon.</em>
          </h2>
          <p className="mt-4 max-w-md font-sans text-[15px] leading-relaxed text-[var(--g-ink2)]">
            Every core concept pairs plain-English prose with custom architecture plates,
            step-by-step memory traces, and runnable Rust listings.
          </p>

          <div role="tablist" aria-label="Guide visual examples" className="landing-showcase-tabs">
            {SLIDES.map((slide, index) => {
              const selected = index === activeIndex;
              return (
                <button
                  key={slide.id}
                  ref={(el) => {
                    tabRefs.current[index] = el;
                  }}
                  id={`showcase-tab-${slide.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`showcase-panel-${slide.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={(e) => onTabKeyDown(e, index)}
                  className="landing-showcase-tab"
                >
                  <span className="landing-showcase-tab-num">{slide.num}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-sans text-[15px] font-semibold text-[var(--g-ink)]">
                      {slide.title}
                    </span>
                    <span className="mt-1 block font-sans text-[13px] leading-relaxed text-[var(--g-ink2)]">
                      {slide.subtitle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          id={`showcase-panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`showcase-tab-${current.id}`}
          className="min-w-0"
        >
          <figure className="landing-showcase-frame">
            <img
              src={current.lightSrc}
              alt={current.alt}
              className="guide-figure-light"
              loading="lazy"
              decoding="async"
            />
            <img
              src={current.darkSrc}
              alt={current.alt}
              className="guide-figure-dark"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--g-line)] bg-[var(--g-surface)] px-4 py-3 font-sans text-[13px]">
              <span className="flex items-center gap-2 text-[var(--g-ink2)]">
                <span className="font-mono text-[11px] font-semibold tracking-wider text-[var(--g-accent-2)] uppercase">
                  Plate {current.num}
                </span>
                <span aria-hidden="true" className="text-[var(--g-line2)]">
                  ·
                </span>
                <span className="font-medium text-[var(--g-ink)]">{current.title}</span>
              </span>
              <Link
                href={current.chapterHref}
                className="inline-flex items-center gap-1.5 font-semibold text-[var(--g-accent)] transition-colors hover:text-[var(--g-accent-hover)]"
              >
                <span>{current.chapterLabel}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
