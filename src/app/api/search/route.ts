import { NextRequest, NextResponse } from "next/server";
import { loadGuide } from "@/lib/guide-parser";
import type { SearchHit } from "@/lib/guide-types";

export function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return NextResponse.json({ hits: [] });
  }

  const guide = loadGuide();
  const best = new Map<string, { score: number; entry: (typeof guide.searchIndex)[number] }>();

  for (const entry of guide.searchIndex) {
    let matchesAll = true;
    for (let i = 0; i < words.length; i++) {
      if (!entry.lower.includes(words[i])) {
        matchesAll = false;
        break;
      }
    }
    if (!matchesAll) continue;

    const score =
      entry.weight +
      (entry.lower.startsWith(words[0]) ? 5 : 0) -
      Math.min(4, entry.text.length / 200);
    const key = `${entry.chapterId}|${entry.anchor}`;
    const prev = best.get(key);
    if (!prev || score > prev.score) {
      best.set(key, { score, entry });
    }
  }

  const sorted = Array.from(best.values())
    .sort((a, b) => b.score - a.score || a.entry.chapterId.localeCompare(b.entry.chapterId))
    .slice(0, 40);

  const word = words[0];
  const hits: SearchHit[] = sorted.map(({ entry }) => {
    const pos = entry.lower.indexOf(word);
    const start = Math.max(0, pos - 36);
    const end = Math.min(entry.text.length, pos + word.length + 64);
    const slice =
      (start > 0 ? "…" : "") +
      entry.text.slice(start, end).replace(/\s+/g, " ") +
      (end < entry.text.length ? "…" : "");
    const low = slice.toLowerCase();
    const qIdx = low.indexOf(word);
    if (qIdx < 0) {
      return {
        chapterId: entry.chapterId,
        num: entry.num,
        chapterTitle: entry.chapterTitle,
        anchor: entry.anchor,
        heading: entry.heading,
        before: slice,
        match: "",
        after: "",
      };
    }
    return {
      chapterId: entry.chapterId,
      num: entry.num,
      chapterTitle: entry.chapterTitle,
      anchor: entry.anchor,
      heading: entry.heading,
      before: slice.slice(0, qIdx),
      match: slice.slice(qIdx, qIdx + word.length),
      after: slice.slice(qIdx + word.length),
    };
  });

  return NextResponse.json(
    { hits },
    {
      headers: {
        // The search index is static per deployment, so let the CDN cache it.
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=1200",
      },
    }
  );
}
