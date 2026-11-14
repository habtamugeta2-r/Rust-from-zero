import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://habtamugeta2-r.github.io/Rust-from-zero/sitemap.xml",
  };
}
