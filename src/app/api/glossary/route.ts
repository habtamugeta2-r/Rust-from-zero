import { NextRequest, NextResponse } from "next/server";
import { loadGuide } from "@/lib/guide-parser";

/** Return only the requested public glossary entry, never the full glossary. */
export function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("term")?.trim() ?? "";
  if (!key || key.length > 120) {
    return NextResponse.json({ term: null }, { status: 400 });
  }

  const entry = loadGuide().glossary[key];
  if (!entry) {
    return NextResponse.json({ term: null }, { status: 404 });
  }

  return NextResponse.json(
    {
      term: {
        key: entry.key,
        term: entry.term,
        definitionPlain: entry.definitionPlain,
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
