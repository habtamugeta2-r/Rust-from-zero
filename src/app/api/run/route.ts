import { NextRequest, NextResponse } from "next/server";
import { PLAYGROUND_EXECUTE_URL, validateExecuteRequest } from "@/lib/rust-runner";

export const maxDuration = 30;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

const ALLOWED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

/**
 * Same-origin fallback for in-guide Rust execution.
 *
 * Browsers normally call `play.rust-lang.org/execute` directly over CORS; this
 * route handles the case where a reader's privacy extension or network policy
 * blocks third-party requests while still reaching the guide itself.
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

  const validated = validateExecuteRequest(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const upstream = await fetch(PLAYGROUND_EXECUTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(validated.request),
      cache: "no-store",
      signal: AbortSignal.timeout(24_000),
    });

    const data: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const upstreamErr =
        data &&
        typeof data === "object" &&
        typeof (data as Record<string, unknown>).error === "string"
          ? ((data as Record<string, unknown>).error as string)
          : `The Rust compiler service returned HTTP ${upstream.status}.`;
      return NextResponse.json(
        { error: upstreamErr },
        {
          status: upstream.status >= 500 ? 502 : upstream.status,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (!data || typeof data !== "object") {
      return NextResponse.json(
        { error: "Invalid response from the Rust compiler service." },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(data, { status: 200, headers: NO_STORE_HEADERS });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      {
        error: isTimeout
          ? "Compilation timed out. The Rust compiler service may be busy — press Run to try again."
          : "Could not reach the Rust compiler service. Check your internet connection and try again.",
      },
      { status: isTimeout ? 504 : 502, headers: NO_STORE_HEADERS },
    );
  }
}
