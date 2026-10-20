import type { Metadata } from "next";
import { preload } from "react-dom";
import { notFound } from "next/navigation";
import RetailPulseApp from "../retailpulse-app";
import {AirportFocusGlance as AirportGlancePreview} from "../airport-focus-production";
import {preloadShellFont} from '../shell-font-preload';
import { buildMetadata, pageStructuredData, seoLocales, type SeoLocale } from "../seo-config";

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
 * Experimental Korean text-led home only: matched October 20 attribution puts
 * .093245 of .094324 mobile layout shift just after the late shell-font swap.
 * Reuse the existing face/hint; unchanged CI budgets must establish whether
 * earlier stable text outweighs script contention. The former image-led home
 * intentionally omitted this hint (October 13); other routes/locales keep
 * their existing policy. This is not yet a speed-improvement claim.
 */
export function generateStaticParams() { return seoLocales.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) return {};
  return buildMetadata(locale as SeoLocale);
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) notFound();
  preloadLiveSummary();
  if (locale === 'ko') preloadShellFont('ko');
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialRoute initialView="airport-glance" initialScope="airport-home" AirportGlance={AirportGlancePreview} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale)) }} />
  </>;
}
