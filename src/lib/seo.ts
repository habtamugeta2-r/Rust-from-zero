import type { Metadata } from "next";
import type {
  ChapterData,
  ChapterSummary,
  PartMeta,
} from "./guide-types";
import { SITE_URL } from "./site";

export const SITE_NAME = "Rust from Zero";
export const SITE_TAGLINE =
  "Computer systems, Rust internals, and systems programming from the inside out";

/** The one social card every page shares; it lives in `public/`. */
export const OG_IMAGE = "/og.png";

/** Stable "first published" date for the whole guide. */
const PUBLISHED = "2026-11-14";
/** Re-derived at build time so `dateModified` stays fresh on each deploy. */
const TODAY = new Date().toISOString().slice(0, 10);

/** Trim to a max length at a word boundary, with an ellipsis. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  const head = at > max * 0.6 ? cut.slice(0, at) : cut;
  return head.replace(/[\s,.;]+$/, "") + "\u2026";
}

/** Strip inline-markdown so schema/text fields read as plain prose. */
function clean(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chapterPath(ch: ChapterSummary): string {
  return `/chapters/${ch.id}`;
}

function chapterUrl(ch: ChapterSummary): string {
  return `${SITE_URL}${chapterPath(ch)}`;
}

/**
 * Descriptions are derived from the chapter's own objectives and prose, not
 * from a sentence written for one chapter and pasted into every project.
 * "A real crate from crates.io" was true of the API project and false of the
 * `std`-only Linux lab, which builds its inspector with no external
 * dependencies at all.
 */
function chapterDescription(ch: ChapterData): string {
  const title = clean(ch.title);
  const objective = ch.learn.map(clean).find((item) => item.length > 12);
  switch (ch.kind) {
    case "project": {
      // The first objective says what the project builds; the rest of the
      // sentence says what a project chapter always offers.
      const build = objective
        ? objective.replace(/[.\u2026]+$/, "")
        : "a complete Rust program, step by step";
      const stack = usesThirdPartyCrates(ch)
        ? "with the crates real programs use"
        : "without leaving the standard library";
      return `Project: ${lowerFirst(build)}, ${stack}. Part of ${SITE_NAME}.`;
    }
    case "appendix":
      return `${title} \u2014 a plain-language Rust reference to keep open while you code. Part of the ${SITE_NAME} course.`;
    case "orientation":
      return `${title}. A plain-English introduction to the Rust programming language with everyday analogies and real compiler output. Part of ${SITE_NAME}.`;
    default: {
      const summary = objective
        ? ` Learn ${lowerFirst(objective.replace(/[.\u2026]+$/, ""))}.`
        : "";
      return `${title}. A plain-English, hands-on Rust lesson with real compiler output, worked exercises, a quiz and everyday analogies.${summary} Part of ${SITE_NAME}.`;
    }
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Whether a chapter's listings actually depend on crates outside the standard
 * library. A dependency means a `Cargo.toml` block in the chapter, so the
 * answer comes from the content rather than a per-chapter exception list.
 */
function usesThirdPartyCrates(ch: ChapterData): boolean {
  let found = false;
  const visit = (node: unknown): void => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === "code" && record.lang === "toml" && typeof record.code === "string") {
      if (/\[dependencies\]/.test(record.code)) found = true;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "parent") continue;
      visit(value);
    }
  };
  visit(ch.blocks);
  return found;
}

/** Per-chapter <title>, description, canonical, Open Graph and Twitter card. */
export function chapterMetadata(ch: ChapterData): Metadata {
  const title = clean(ch.title);
  const desc = clip(chapterDescription(ch), 160);
  return {
    title,
    description: desc,
    alternates: { canonical: chapterPath(ch) },
    openGraph: {
      type: "article",
      // The guide is written in British English throughout.
      locale: "en_GB",
      url: chapterUrl(ch),
      siteName: SITE_NAME,
      title,
      description: desc,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [OG_IMAGE],
    },
  };
}

/** JSON-LD for one chapter: an Article / LearningResource + its breadcrumb. */
export function chapterJsonLd(ch: ChapterData): object[] {
  const url = chapterUrl(ch);
  const article = {
    "@context": "https://schema.org",
    "@type": ["Article", "LearningResource"],
    headline: clip(clean(ch.title), 110),
    description: clip(chapterDescription(ch), 200),
    inLanguage: "en-GB",
    datePublished: PUBLISHED,
    dateModified: TODAY,
    isAccessibleForFree: true,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    learningResourceType: "Online course",
    educationalLevel: ch.level,
    about: ch.learn.slice(0, 4).map(clean).filter(Boolean),
    keywords: Array.from(
      new Set(
        [clean(ch.short), "Rust", "Rust programming language", ch.partTitle]
          .map(clean)
          .filter(Boolean),
      ),
    ).join(", "),
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isPartOf: {
      "@type": "Course",
      name: `${SITE_NAME} \u2014 ${SITE_TAGLINE}`,
      url: SITE_URL,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Learn Rust", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: clean(ch.partTitle),
        item: SITE_URL,
      },
      { "@type": "ListItem", position: 3, name: clean(ch.title), item: url },
    ],
  };
  return [article, breadcrumb];
}

/** JSON-LD for the home page: the whole guide as a Course + its contents. */
export function courseJsonLd(
  parts: PartMeta[],
  summaries: ChapterSummary[],
): object[] {
  const body = summaries.filter((s) => s.kind !== "appendix");
  // Derived from the summaries, so the structured data never drifts from the
  // chapters actually present.
  const projects = summaries.filter((s) => s.kind === "project").length;
  const course = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: SITE_NAME,
    alternateName: "Rust tutorial",
    description: clip(
      `A complete self-study course teaching computer systems internals and Rust from zero: hardware, compiler stages, ELF, memory, Linux OS kernel, I/O, CPU pipelines, networking, storage, and web backends. Plain explanations, worked exercises with solutions, quizzes, and ${projects} hands-on projects.`,
      300,
    ),
    url: SITE_URL,
    inLanguage: "en-GB",
    isAccessibleForFree: true,
    provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    hasCourseSection: parts
      .filter((p) => p.key !== "welcome" && p.key !== "app")
      .map((p) => ({
        "@type": "CourseSection",
        name: p.partTitle,
        description: p.blurb ? clip(p.blurb, 200) : p.partTitle,
      })),
  };
  const itemlist = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SITE_NAME} \u2014 table of contents`,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: body.length,
    itemListElement: body.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: clean(s.title),
      url: `${SITE_URL}/chapters/${s.id}`,
    })),
  };
  return [course, itemlist];
}

/** Site-wide WebSite schema (identifying info; no client-only search action). */
export function websiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: clip(
      `${SITE_NAME}: ${SITE_TAGLINE}. Learn Rust from zero with plain-language lessons, real compiler output, exercises and projects.`,
      200,
    ),
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}
