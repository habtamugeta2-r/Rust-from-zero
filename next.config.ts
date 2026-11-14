import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.e2b.app"],
  outputFileTracingIncludes: {
    "/*": ["./guide-src/chapters/**/*", "./guide-src/captured/**/*"],
  },
  outputFileTracingExcludes: {
    "/*": ["./guide-src/tools/**/*"],
  },
};

export default nextConfig;
