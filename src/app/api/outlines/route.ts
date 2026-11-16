import { NextRequest, NextResponse } from "next/server";
import { loadChapter } from "@/lib/guide-parser";

/** Fetch one chapter's content map on demand instead of shipping every outline. */
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("chapter")?.trim() ?? "";
  if (!id || id.length > 100) {
    return NextResponse.json({ chapter: null, outline: [] }, { status: 400 });
  }

  const chapter = loadChapter(id);
  if (!chapter) {
    return NextResponse.json({ chapter: id, outline: [] }, { status: 404 });
  }

  return NextResponse.json(
    { chapter: id, outline: chapter.outline },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
