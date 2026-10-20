import type { MetadataRoute } from "next";
import { canonicalSlug, isStagingDeployment, seoLocales, seoPath, siteOrigin, standaloneSeoSlugs, tourismDeskAreas, type SeoSlug } from "./seo-config";

/**
 * `hreflang` for one page across every locale, as absolute URLs.
 *
 * The four locale copies of a page are translations of one another, not four
 * competing pages. Declaring that here is what lets a search engine pool their
 * ranking signals and serve the Korean copy to a Korean reader and the
 * Japanese copy to a Japanese one. `buildMetadata` already emits the same
 * relationship as `<link>` tags; a crawler that reads the sitemap before it
 * renders a page learns it here first.
 */
function localeAlternates(slug?: SeoSlug, area?: (typeof tourismDeskAreas)[number]): Record<string, string> {
  const tag = { ko: "ko-KR", en: "en", zh: "zh-CN", ja: "ja-JP" } as const;
  const languages = Object.fromEntries(seoLocales.map((locale) => [tag[locale], `${siteOrigin}${seoPath(locale, slug, area)}`]));
  return { ...languages, "x-default": `${siteOrigin}${seoPath("en", slug, area)}` };
}

/**
 * lastModified is intentionally omitted. A scheduled collection or the current
 * KST date does not prove that a page changed: sources can be stale, unchanged
 * or unavailable. Restore this optional field only with a persisted timestamp
 * for a significant change to that page's actual content, not request/build time.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (isStagingDeployment) return [];
  return seoLocales.flatMap((locale) => [
    {
      url: `${siteOrigin}${seoPath(locale)}`,
      changeFrequency: "daily" as const,
      priority: 1,
      alternates: { languages: localeAlternates() },
    },
    // Only canonical URLs: a slug that serves the home (canonicalSlug) is not listed again.
    ...standaloneSeoSlugs.filter((slug) => canonicalSlug(slug) === slug).map((slug) => ({
      url: `${siteOrigin}${seoPath(locale, slug)}`,
      changeFrequency: slug === "more" ? "weekly" as const : "daily" as const,
      priority: slug === "more" ? 0.5 : slug === "forecast" || slug === "business" ? 0.8 : 0.9,
      alternates: { languages: localeAlternates(slug) },
    })),
    ...tourismDeskAreas.map((area) => ({
      url: `${siteOrigin}${seoPath(locale, "tourism-desk", area)}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
      alternates: { languages: localeAlternates("tourism-desk", area) },
    })),
  ]);
}
