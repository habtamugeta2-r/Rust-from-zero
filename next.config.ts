import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/security-headers";

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy(process.env.NODE_ENV === "development"),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
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
