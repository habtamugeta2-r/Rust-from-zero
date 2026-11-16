import type { MetadataRoute } from "next";
import { loadGuide } from "@/lib/guide-parser";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const guide = loadGuide();
  const base = SITE_URL;
  const lastModified = new Date().toISOString().split("T")[0];
  return [
    {
      url: `${base}/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${base}/chapters`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    ...guide.summaries.map((ch) => ({
      url: `${base}/chapters/${ch.id}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: ch.kind === "appendix" ? 0.6 : 0.8,
    })),
  ];
}
