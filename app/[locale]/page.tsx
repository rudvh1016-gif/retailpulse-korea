import type { Metadata } from "next";
import { preload } from "react-dom";
import { notFound } from "next/navigation";
import RetailPulseApp from "../retailpulse-app";
import {AirportFocusGlance as AirportGlancePreview} from "../airport-focus-production";
import { buildMetadata, pageStructuredData, seoLocales, type SeoLocale } from "../seo-config";
import { isValidKstDay, kstDayOf } from "../../lib/kst";

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

/**
 * No shell-font preload on the home, unlike travel-records and airport-news.
 * On a throttled phone it competed with the scripts that hydrate the page;
 * without it the page is interactive about 0.5 s sooner and the brand face,
 * still requested by the stylesheet with `font-display: swap`, arrives about
 * 0.3 s later (owner decision, 2026-10-13).
 */
export function generateStaticParams() { return seoLocales.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) return {};
  return buildMetadata(locale as SeoLocale);
}

export default async function LocaleHome({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams?: Promise<{ date?: string | string[] }> }) {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) notFound();
  preloadLiveSummary();
  // This overview always reads the selected flight day. Reuse the client's
  // exact URL so its request can consume this preload before JS has hydrated.
  const query = await searchParams;
  const selected = Array.isArray(query?.date) ? query.date[0] : query?.date;
  const today = kstDayOf(new Date().toISOString());
  const day = isValidKstDay(selected) ? selected : today;
  preload(`/api/live/flights?date=${encodeURIComponent(day)}&_day=${today}`, { as: "fetch", crossOrigin: "anonymous" });
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialRoute initialView="airport-glance" initialScope="airport-home" AirportGlance={AirportGlancePreview} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale)) }} />
  </>;
}
