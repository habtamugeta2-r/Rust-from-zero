import type { Metadata, Viewport } from "next";
import { GuideShell } from "@/components/GuideShell";
import { GuideStateProvider } from "@/components/GuideStateProvider";
import { loadGuide } from "@/lib/guide-parser";
import { websiteJsonLd } from "@/lib/seo";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

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
    title: "Rust from Zero — The Complete Hands-On Guide",
    description: `Learn computer systems and Rust from scratch with plain language, architecture traces, ${EXERCISES} solved exercises, ${QUIZZES} quizzes and ${PROJECTS} hands-on projects.`,
    url: SITE_URL,
    images: ["/og.png"],
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
    { media: "(prefers-color-scheme: light)", color: "#f7f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

/**
 * Runs before first paint so a reader who chose dark never sees a light flash.
 * "system" is the default, and it is resolved here rather than in React so the
 * first frame is already correct on a statically cached page.
 */
const THEME_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem("rust-guide-v1");var d=raw?JSON.parse(raw):null;var mode=(d&&(d.theme==="dark"||d.theme==="light"||d.theme==="system"))?d.theme:"system";var theme=mode==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):mode;document.documentElement.classList.toggle("dark",theme==="dark");document.documentElement.setAttribute("data-theme",theme);document.documentElement.setAttribute("data-theme-mode",mode);if(d&&typeof d.fs==="number"&&d.fs>=15&&d.fs<=24){document.documentElement.style.setProperty("--guide-fs",d.fs+"px");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const guide = loadGuide();

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
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
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[var(--g-accent)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to content
        </a>
        <GuideStateProvider>
          <GuideShell
            parts={guide.parts.map(({ key, partLabel, partTitle }) => ({
              key,
              partLabel,
              partTitle,
            }))}
            chapters={guide.summaries.map(({ id, num, part, kind, short }) => ({
              id,
              num,
              part,
              kind,
              short,
            }))}
          >
            {children}
          </GuideShell>
        </GuideStateProvider>
      </body>
    </html>
  );
}
