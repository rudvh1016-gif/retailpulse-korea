import type { Metadata } from "next";
import { preload } from "react-dom";
import { notFound } from "next/navigation";
import RetailPulseApp from "../retailpulse-app";
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
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialRoute initialScope="home" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale)) }} />
  </>;
}
