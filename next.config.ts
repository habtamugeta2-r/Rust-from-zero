import type { NextConfig } from "next";

/**
 * Security headers, emitted unconditionally.
 *
 * These used to be gated on `process.env.VERCEL`, which meant any other
 * deployment — a container, a self-hosted node, a preview host — shipped with
 * no frame protection and no HSTS at all. A header that only exists on one
 * platform is not a policy; it is a coincidence. They now apply everywhere.
 *
 * There is one deliberate exception, kept narrow and explicit:
 *
 *   Arena and E2B serve the app *inside an iframe* for a live preview. A
 *   frame-blocking header there shows the reader a blank pane, so the
 *   frame-ancestors *allowance* is added only when `GUIDE_EMBED_ORIGINS` names
 *   the embedding origin (the preview host sets it). Production sets nothing
 *   and gets `'none'`. Nothing is inferred from `NODE_ENV` or from the
 *   hosting provider, so a forgetful deployment cannot silently lose the
 *   protection.
 */
const EMBED_ORIGINS = (process.env.GUIDE_EMBED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const FRAME_ANCESTORS = EMBED_ORIGINS.length > 0 ? `'self' ${EMBED_ORIGINS.join(" ")}` : "'none'";

/**
 * A baseline content policy. The app ships no third-party scripts, no remote
 * fonts and no remote images, so everything is `'self'`; the inline script and
 * style allowances are for the pre-paint theme script and the highlighted
 * code's inline `--shiki-*` custom properties, which Next cannot nonce on
 * statically generated pages.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  `frame-ancestors ${FRAME_ANCESTORS}`,
].join("; ");

const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Two years, subdomains included; a browser only honours the preload list
  // once the header has been seen on HTTPS, so sending it over plain HTTP in
  // development is harmless and keeps the deployed and local config identical.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  // Kept for browsers that predate `frame-ancestors`. A preview embed cannot
  // express "allow this one origin" in this header, so it is omitted there and
  // the (modern) CSP carries the policy instead.
  ...(EMBED_ORIGINS.length > 0 ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  outputFileTracingIncludes: {
    "/*": ["./guide-src/chapters/**/*", "./guide-src/captured/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["./guide-src/tools/**/*"],
  },
};

export default nextConfig;
