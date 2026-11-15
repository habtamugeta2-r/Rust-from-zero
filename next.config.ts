import type { NextConfig } from "next";

/**
 * The site is meant to be read, not embedded: on a real deployment it refuses
 * to be framed and keeps the usual hardening headers. Inside a sandbox preview
 * (Arena, E2B, a local tunnel) the app is *served inside a frame*, so the
 * frame-blocking header is left out there — otherwise the preview pane stays
 * blank while production is still protected.
 */
const FRAMED_PREVIEW =
  process.env.NODE_ENV !== "production" || !process.env.VERCEL;

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  ...(FRAMED_PREVIEW
    ? []
    : [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ]),
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
