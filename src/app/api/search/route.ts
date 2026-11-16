import { NextRequest, NextResponse } from "next/server";
import { MIN_QUERY_LENGTH, searchGuide } from "@/lib/search";

/**
 * JSON search for the command palette.
 *
 * Ranking lives in `@/lib/search` and is shared with the `/search` page, so a
 * query returns the same hits wherever it is asked.
 *
 * Both query parameters are parsed defensively. `?limit=` (present but empty)
 * is a common accident, and a bare `Number("")` is 0, which would clamp to a
 * single hit; a one-character query is below the threshold the palette itself
 * uses, so the API answers it with no hits rather than a flood of matches.
 */
export function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsed = rawLimit ? Number(rawLimit) : Number.NaN;
  const limit = Number.isFinite(parsed)
    ? Math.min(60, Math.max(1, Math.round(parsed)))
    : 40;

  const hits = q.length < MIN_QUERY_LENGTH ? [] : searchGuide(q, { limit });

  return NextResponse.json(
    { query: q, hits },
    {
      headers: {
        // The search index is static per deployment, so let the CDN cache it.
        "Cache-Control":
          "public, max-age=60, s-maxage=600, stale-while-revalidate=1200",
      },
    }
  );
}
