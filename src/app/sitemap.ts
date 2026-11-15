import type { MetadataRoute } from "next";
import { loadGuide } from "@/lib/guide-parser";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const guide = loadGuide();
  const base = SITE_URL;
  return [
    {
      url: `${base}/`,
      lastModified: new Date("2026-11-14"),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...guide.summaries.map((ch) => ({
      url: `${base}/chapters/${ch.id}`,
      lastModified: new Date("2026-11-14"),
      changeFrequency: "monthly" as const,
      priority: ch.kind === "appendix" ? 0.6 : 0.8,
    })),
  ];
}
