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
  // `get` returns null when the parameter is absent — Number(null) is 0, so the
  // default has to be chosen before coercing.
  const limitParam = request.nextUrl.searchParams.get("limit");
  const parsed = limitParam === null ? Number.NaN : Number(limitParam);
  const limit = Number.isFinite(parsed)
    ? Math.min(60, Math.max(1, Math.round(parsed)))
    : 40;

  const hits = searchGuide(q, { limit });

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
