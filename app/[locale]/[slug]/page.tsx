import type { Metadata } from "next";
import { preload } from "react-dom";
import { notFound } from "next/navigation";
import RetailPulseApp from "../../retailpulse-app";
import { buildMetadata, pageStructuredData, seoLocales, standaloneSeoSlugs, type SeoLocale, type SeoSlug } from "../../seo-config";

/**
 * Starts the summary request from the HTML head, so it overlaps the JS
 * download instead of waiting for hydration. Every view mounts a summary
 * reader (the KST date chip in the top bar at least), so the fetch is never
 * wasted; `crossorigin` makes the preload match the client's `fetch()`
 * (mode "cors", credentials "same-origin") so the browser reuses it rather
 * than requesting twice.
 */
function preloadLiveSummary() {
  preload("/api/live/summary", { as: "fetch", crossOrigin: "anonymous" });
}

const areaSlugs = ["myeongdong", "hongdae", "seongsu"] as const;

export function generateStaticParams() {
  return seoLocales.flatMap((locale) => standaloneSeoSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !standaloneSeoSlugs.includes(slug as typeof standaloneSeoSlugs[number])) return {};
  return buildMetadata(locale as SeoLocale, slug as SeoSlug);
}

export default async function LocalePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !standaloneSeoSlugs.includes(slug as typeof standaloneSeoSlugs[number])) notFound();
  const isArea = areaSlugs.includes(slug as typeof areaSlugs[number]);
  const view = isArea ? "today" : slug as "forecast" | "airport" | "business" | "about" | "more";
  const area = isArea ? slug as typeof areaSlugs[number] : "myeongdong";
  preloadLiveSummary();
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialView={view} initialArea={area} initialRoute initialScope={isArea ? "area" : "home"} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale, slug as SeoSlug)) }} />
  </>;
}
