import type { Metadata } from "next";
import type {
  ChapterData,
  ChapterSummary,
  PartMeta,
} from "./guide-types";
import { SITE_URL } from "./site";

export const SITE_NAME = "Rust from Zero";
export const SITE_TAGLINE =
  "The complete hands-on guide to the Rust programming language";

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

function chapterDescription(ch: ChapterData): string {
  const title = clean(ch.title);
  switch (ch.kind) {
    case "project":
      return `${title}. Build and run a complete Rust program step by step \u2014 functions, loops, decisions, error handling and a real crate from crates.io. Part of ${SITE_NAME}.`;
    case "appendix":
      return `${title} \u2014 a plain-language Rust reference to keep open while you code. Part of the ${SITE_NAME} course.`;
    case "orientation":
      return `${title}. A plain-English introduction to the Rust programming language with everyday analogies and real compiler output. Part of ${SITE_NAME}.`;
    default:
      return `${title}. A plain-English, hands-on Rust lesson with real compiler output, worked exercises, a quiz and everyday analogies. Part of ${SITE_NAME}.`;
  }
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
      locale: "en_US",
      url: chapterUrl(ch),
      siteName: SITE_NAME,
      title,
      description: desc,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
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
    inLanguage: "en",
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
  const course = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: SITE_NAME,
    alternateName: "Rust tutorial",
    description: clip(
      "A complete self-study course that teaches the Rust programming language from absolute zero: from the first line of syntax, through numbers, lists, bytes, the heap and the stack, to building web services, async code and systems software. Plain-language explanations, real compiler output, 193 solved exercises, quizzes and eight hands-on projects.",
      300,
    ),
    url: SITE_URL,
    inLanguage: "en",
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
  const body = summaries.filter((s) => s.kind !== "appendix");
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
