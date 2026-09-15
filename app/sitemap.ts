import type { MetadataRoute } from "next";
import { isStagingDeployment, seoLocales, seoPath, siteOrigin, standaloneSeoSlugs, tourismDeskAreas, type SeoSlug } from "./seo-config";

/**
 * Start of today in KST, as an instant.
 *
 * Korea has no daylight saving, so UTC+9 is a constant offset and this needs
 * no timezone database.
 */
function kstDayStart(now: Date): Date {
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  return new Date(Math.floor((now.getTime() + kstOffsetMs) / 86_400_000) * 86_400_000 - kstOffsetMs);
}

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
 * Whether we can honestly date a page.
 *
 * Every entry used to carry `lastModified: new Date()` — evaluated per
 * request, so the whole site claimed to have changed at the moment of every
 * crawl, `/about` included. Google's sitemap documentation is explicit that
 * demonstrably unreliable `lastmod` values are ignored, and it does not ignore
 * them per URL: one page that always claims "just now" devalues the signal for
 * every page beside it.
 *
 * So a date is declared only where the repository can justify it. The area,
 * airport, forecast, outlook, business and guide-desk screens are rebuilt from
 * collections that land every day, so the start of the current KST day is
 * true and — unlike `new Date()` — stable for the whole day. `/about` and
 * `/more` are explainer copy that changes only when someone edits it, and a
 * checkout cannot tell when that was, so they carry no date at all. An absent
 * `lastmod` reads as "unknown", which is what it is.
 */
const UNDATEABLE_SLUGS = new Set<SeoSlug>(["about", "more"]);

export default function sitemap(): MetadataRoute.Sitemap {
  if (isStagingDeployment) return [];
  const dailyRefresh = kstDayStart(new Date());
  return seoLocales.flatMap((locale) => [
    {
      url: `${siteOrigin}${seoPath(locale)}`,
      lastModified: dailyRefresh,
      changeFrequency: "daily" as const,
      priority: 1,
      alternates: { languages: localeAlternates() },
    },
    ...standaloneSeoSlugs.map((slug) => ({
      url: `${siteOrigin}${seoPath(locale, slug)}`,
      ...(UNDATEABLE_SLUGS.has(slug) ? {} : { lastModified: dailyRefresh }),
      changeFrequency: slug === "more" ? "weekly" as const : "daily" as const,
      priority: slug === "more" ? 0.5 : slug === "forecast" || slug === "business" ? 0.8 : 0.9,
      alternates: { languages: localeAlternates(slug) },
    })),
    ...tourismDeskAreas.map((area) => ({
      url: `${siteOrigin}${seoPath(locale, "tourism-desk", area)}`,
      lastModified: dailyRefresh,
      changeFrequency: "daily" as const,
      priority: 0.9,
      alternates: { languages: localeAlternates("tourism-desk", area) },
    })),
  ]);
}
