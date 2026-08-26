import type { MetadataRoute } from "next";
import { isStagingDeployment, seoLocales, seoSlugs, siteOrigin } from "./seo-config";

export default function sitemap(): MetadataRoute.Sitemap {
  if (isStagingDeployment) return [];
  const now = new Date();
  return seoLocales.flatMap((locale) => [
    {
      url: `${siteOrigin}/${locale}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1,
    },
    ...seoSlugs.map((slug) => ({
      url: `${siteOrigin}/${locale}/${slug}`,
      lastModified: now,
      changeFrequency: slug === "more" ? "weekly" as const : "daily" as const,
      priority: slug === "more" ? 0.5 : slug === "forecast" || slug === "business" ? 0.8 : 0.9,
    })),
  ]);
}
