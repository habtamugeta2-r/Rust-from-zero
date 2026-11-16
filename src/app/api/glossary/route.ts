import { NextRequest, NextResponse } from "next/server";
import { loadGuide } from "@/lib/guide-parser";

/**
 * One glossary definition, for a term the current page did not ship.
 *
 * Chapter pages pass the terms their own prose links through
 * `GlossaryTipContext`; this endpoint exists for the rest — a term reached from
 * a client-rendered link, or a page that has no prose of its own. It keeps the
 * tooltip working without putting all 258 definitions on every page.
 */
export function GET(request: NextRequest) {
  const term = (request.nextUrl.searchParams.get("term") ?? "").trim().toLowerCase();
  const entry = term ? loadGuide().glossary[term] : undefined;

  if (!entry) {
    return NextResponse.json(
      { error: "unknown glossary term" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      entry: {
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
