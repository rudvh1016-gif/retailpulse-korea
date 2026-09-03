import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RetailPulseApp from "../../retailpulse-app";
import { buildMetadata, pageStructuredData, seoLocales, seoSlugs, type SeoLocale, type SeoSlug } from "../../seo-config";

const areaSlugs = ["myeongdong", "hongdae", "seongsu"] as const;

export function generateStaticParams() {
  return seoLocales.flatMap((locale) => seoSlugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !seoSlugs.includes(slug as SeoSlug)) return {};
  return buildMetadata(locale as SeoLocale, slug as SeoSlug);
}

export default async function LocalePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !seoSlugs.includes(slug as SeoSlug)) notFound();
  const isArea = areaSlugs.includes(slug as typeof areaSlugs[number]);
  const view = isArea ? "today" : slug as "forecast" | "airport" | "business" | "about" | "more";
  const area = isArea ? slug as typeof areaSlugs[number] : "myeongdong";
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialView={view} initialArea={area} initialRoute initialScope={isArea ? "area" : "home"} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale, slug as SeoSlug)) }} />
  </>;
}
