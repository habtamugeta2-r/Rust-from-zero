import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GuideShell } from "@/components/GuideShell";
import { GuideStateProvider } from "@/components/GuideStateProvider";
import { loadGuide } from "@/lib/guide-parser";
import { websiteJsonLd } from "@/lib/seo";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Counts come from the chapters themselves, so adding a chapter or an exercise
 * can never leave the meta description advertising yesterday's numbers.
 */
const guideStats = loadGuide().stats;
const CHAPTERS = guideStats.trackedChapters;
const EXERCISES = guideStats.exercises;
const QUIZZES = guideStats.questions;
const PROJECTS = guideStats.projects;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Rust from Zero — The Complete Hands-On Guide",
    template: "%s · Rust from Zero",
  },
  description: `Learn computer systems internals and Rust from zero: ${CHAPTERS} chapters and orientation guides from CPU registers, compilers, ELF, and Linux syscalls to virtual memory, async runtimes, networking, and storage. ${EXERCISES} solved exercises, ${QUIZZES} quiz questions, and ${PROJECTS} hands-on projects.`,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "book",
    locale: "en_GB",
    title: "Rust from Zero — The Complete Hands-On Guide",
    description: `Learn computer systems and Rust from scratch with plain language, architecture traces, ${EXERCISES} solved exercises, ${QUIZZES} quizzes and ${PROJECTS} hands-on projects.`,
    url: SITE_URL,
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rust from Zero — The Complete Hands-On Guide",
    description: `Learn computer systems and Rust from zero: ${CHAPTERS} chapters, ${EXERCISES} solved exercises, ${QUIZZES} quiz questions and ${PROJECTS} real projects.`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Native UI (scrollbars, form controls, the address bar on mobile) follows
  // the same light/dark choice as the stylesheet.
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#121918" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const guide = loadGuide();
  const navigationChapters = guide.summaries.map(
    ({ id, num, part, partTitle, kind, title, short, time }) => ({
      id,
      num,
      part,
      partTitle,
      kind,
      title,
      short,
      time,
    }),
  );

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Book",
      name: "Rust from Zero — The Complete Hands-On Guide",
      description:
        "A complete self-study Rust 2024 programming guide for beginners through web services, databases, systems programming and production tooling.",
      inLanguage: "en",
      isAccessibleForFree: true,
      numberOfPages: guide.stats.trackedChapters,
      url: SITE_URL,
    },
    websiteJsonLd(),
  ];

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {jsonLd.map((obj, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(obj).replace(/</g, "\\u003c"),
            }}
          />
        ))}
      </head>
      <body className="antialiased">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[var(--g-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-[var(--g-on-accent)]"
        >
          Skip to content
        </a>
        <GuideStateProvider>
          <GuideShell parts={guide.parts} chapters={navigationChapters}>
            {children}
          </GuideShell>
        </GuideStateProvider>
      </body>
    </html>
  );
}
