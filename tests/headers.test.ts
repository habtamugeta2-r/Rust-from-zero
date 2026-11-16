import assert from "node:assert/strict";
import { test } from "node:test";
import nextConfig from "../next.config";

/**
 * Security headers must not depend on where the app is deployed.
 *
 * The regression these tests exist for: the frame-blocking headers used to be
 * gated on `process.env.VERCEL`, so every non-Vercel deployment shipped without
 * them and nobody noticed. The assertions below read the real `next.config.ts`
 * export, so a future conditional added to the header list fails here.
 */

async function headersForAllPaths(): Promise<Map<string, string>> {
  const rules = await nextConfig.headers!();
  const all = rules.find((rule) => rule.source === "/:path*");
  assert.ok(all, "next.config.ts must publish headers for /:path*");
  return new Map(all!.headers.map((header) => [header.key, header.value]));
}

test("headers: frame protection is unconditional", async () => {
  const headers = await headersForAllPaths();
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
});

test("headers: transport security and nosniff are always sent", async () => {
  const headers = await headersForAllPaths();
  assert.match(headers.get("Strict-Transport-Security") ?? "", /max-age=\d{6,}/);
  assert.match(headers.get("Strict-Transport-Security") ?? "", /includeSubDomains/);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
});

test("headers: the content policy is a real baseline, not just frame-ancestors", async () => {
  const csp = (await headersForAllPaths()).get("Content-Security-Policy") ?? "";
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]) {
    assert.ok(csp.includes(directive), `missing ${directive} in ${csp}`);
  }
});

test("headers: the framework's version header stays off", () => {
  assert.equal(nextConfig.poweredByHeader, false);
});
