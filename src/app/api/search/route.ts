import { NextRequest, NextResponse } from "next/server";
import { searchGuide } from "@/lib/search";

/**
 * JSON search for the command palette.
 *
 * Ranking lives in `@/lib/search` and is shared with the `/search` page, so a
 * query returns the same hits wherever it is asked.
 */
export function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const rawLimit = request.nextUrl.searchParams.get("limit")?.trim() ?? "";
  const parsed = rawLimit ? Number(rawLimit) : 40;
  const limit = Number.isFinite(parsed)
    ? Math.min(60, Math.max(1, Math.round(parsed)))
    : 40;

  const hits = q.length < 2 ? [] : searchGuide(q, { limit });

  return NextResponse.json(
    { query: q, hits, results: hits },
    {
      headers: {
        // The search index is static per deployment, so let the CDN cache it.
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=1200",
      },
    }
  );
}
