import type { Metadata } from "next";
import { preload } from "react-dom";
import { notFound } from "next/navigation";
import RetailPulseApp from "../../retailpulse-app";
import { shareAnswerText } from "../../../lib/today-answer";
import { loadTodayAnswer } from "../../../lib/today-answer-server";
import { buildMetadata, pageStructuredData, seoLocales, standaloneSeoSlugs, type SeoLocale, type SeoSlug } from "../../seo-config";
import {preloadShellFont} from '../../shell-font-preload';

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

const areaSlugs = ["myeongdong", "hongdae", "seongsu", "itaewon"] as const;

export function generateStaticParams() {
  return seoLocales.flatMap((locale) => standaloneSeoSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !standaloneSeoSlugs.includes(slug as typeof standaloneSeoSlugs[number])) return {};
  const metadata = buildMetadata(locale as SeoLocale, slug as SeoSlug);
  // A shared link previews the page's answer with its date. The search
  // description (<meta name="description">) stays the static one.
  const sharePage = slug === "airport" || areaSlugs.includes(slug as typeof areaSlugs[number]) ? slug as "airport" | typeof areaSlugs[number] : null;
  const share = sharePage ? shareAnswerText(await loadTodayAnswer(), locale as SeoLocale, sharePage) : null;
  if (!share) return metadata;
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, description: share },
    twitter: { ...metadata.twitter, description: share },
  };
}

export default async function LocalePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !standaloneSeoSlugs.includes(slug as typeof standaloneSeoSlugs[number])) notFound();
  const isArea = areaSlugs.includes(slug as typeof areaSlugs[number]);
  const view = isArea ? "today" : slug as "predictions" | "forecast" | "airport" | "business" | "about" | "more";
  const area = isArea ? slug as typeof areaSlugs[number] : "myeongdong";
  preloadLiveSummary();
  preloadShellFont(locale as SeoLocale);
  // Only the pages whose question this answers pay for the read.
  const todayAnswer = isArea || slug === "airport" ? await loadTodayAnswer() : null;
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialView={view} initialArea={area} initialRoute initialScope={isArea ? "area" : "home"} todayAnswer={todayAnswer} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale, slug as SeoSlug)) }} />
  </>;
}
