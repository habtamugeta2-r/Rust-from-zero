import { NextRequest, NextResponse } from "next/server";
import { loadGuide } from "@/lib/guide-parser";

/**
 * The runnable wrapper for one code block.
 *
 * A `rust run` block that uses `#` hidden lines renders as a short listing, but
 * the Playground needs the whole program. That wrapper used to travel inside
 * the chapter's RSC payload, where it duplicated the code the reader can see
 * and made the biggest chapter pages as large as the page itself. It now lives
 * in the (server-only) guide index and is fetched when the reader actually
 * presses Run.
 *
 * `h` is the SHA-1 of the block's raw code, the same hash the parser gives a
 * captured output, so a wrapper is never addressed by anything a caller can
 * invent.
 */
export function GET(request: NextRequest) {
  const hash = (request.nextUrl.searchParams.get("h") ?? "").trim();
  const wrapper = /^[0-9a-f]{16}$/.test(hash) ? loadGuide().wrappers[hash] : undefined;

  if (!wrapper) {
    return NextResponse.json(
      { error: "no runnable wrapper for that code block" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { code: wrapper },
    {
      headers: {
        // Wrappers are pure functions of the chapter text, so they never
        // change within a deployment.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
