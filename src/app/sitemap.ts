import path from "node:path";
import { execFileSync } from "node:child_process";
import type { MetadataRoute } from "next";
import { loadGuide } from "@/lib/guide-parser";
import { SITE_URL } from "@/lib/site";

/**
 * `lastModified` has to be a fact about this tree, not a date typed once.
 *
 * Resolution order, cheapest and most honest first:
 *   1. the last git commit that touched `guide-src/chapters` — the real answer,
 *      and the only one that moves when the prose changes;
 *   2. the build's own clock, when the deploy has no git metadata (a tarball,
 *      a container built from a shallow copy);
 *   3. nothing, which lets Next omit the field rather than publish a lie.
 *
 * A chapter file's own commit date is used when it has one, so a sitemap of 88
 * entries gives a crawler a truthful per-page signal.
 */
function gitDate(args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    })
      .toString()
      .trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

const GUIDE_DATE = gitDate(["log", "-1", "--format=%cs", "--", "guide-src/chapters"]);

/** Commit date of one chapter file, memoised for the life of the build. */
const fileDates = new Map<string, string | null>();
function lastCommit(file: string): string | null {
  if (!fileDates.has(file)) {
    fileDates.set(
      file,
      gitDate(["log", "-1", "--format=%cs", "--", path.posix.join("guide-src/chapters", file)]),
    );
  }
  return fileDates.get(file) ?? null;
}

const today = (): string => new Date().toISOString().slice(0, 10);

export default function sitemap(): MetadataRoute.Sitemap {
  const guide = loadGuide();
  const base = SITE_URL;
  // Both are real directories of content, so both take the chapters' date.
  const siteDate = new Date(GUIDE_DATE ?? today());
  const entry = (
    url: string,
    priority: number,
    lastModified: Date = siteDate,
  ): MetadataRoute.Sitemap[number] => ({
    url,
    lastModified,
    changeFrequency: "monthly",
    priority,
  });

  return [
    entry(`${base}/`, 1),
    entry(`${base}/chapters`, 0.9),
    ...guide.summaries.map((ch) => {
      const own = lastCommit(ch.file);
      return entry(
        `${base}/chapters/${ch.id}`,
        ch.kind === "appendix" ? 0.6 : 0.8,
        new Date(own ?? GUIDE_DATE ?? today()),
      );
    }),
  ];
}
