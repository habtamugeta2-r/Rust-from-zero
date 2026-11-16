import { NextRequest, NextResponse } from "next/server";
import { PLAYGROUND_FORMAT_URL, validateFormatRequest } from "@/lib/rust-runner";

export const maxDuration = 20;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

/**
 * Same-origin fallback for in-guide `rustfmt` formatting.
 */
export async function POST(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !ALLOWED_FETCH_SITES.has(fetchSite)) {
    return NextResponse.json(
      { error: "Cross-site requests are not permitted." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const validated = validateFormatRequest(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const upstream = await fetch(PLAYGROUND_FORMAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(validated.request),
      cache: "no-store",
      signal: AbortSignal.timeout(14_000),
    });

    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok || !data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Could not format this code right now." },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(data, { status: 200, headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the Rust formatter service." },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }
}
