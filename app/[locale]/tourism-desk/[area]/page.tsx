import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { preload } from "react-dom";
import RetailPulseApp from "../../../retailpulse-app";
import {
  buildMetadata,
  pageStructuredData,
  seoLocales,
  tourismDeskAreas,
  type SeoLocale,
  type TourismDeskArea,
} from "../../../seo-config";

function preloadLiveSummary() {
  preload("/api/live/summary", { as: "fetch", crossOrigin: "anonymous" });
}

export function generateStaticParams() {
  return seoLocales.flatMap((locale) => tourismDeskAreas.map((area) => ({ locale, area })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; area: string }> }): Promise<Metadata> {
  const { locale, area } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !tourismDeskAreas.includes(area as TourismDeskArea)) return {};
  return buildMetadata(locale as SeoLocale, "tourism-desk", area as TourismDeskArea);
}

export default async function TourismDeskAreaPage({ params }: { params: Promise<{ locale: string; area: string }> }) {
  const { locale, area } = await params;
  if (!seoLocales.includes(locale as SeoLocale) || !tourismDeskAreas.includes(area as TourismDeskArea)) notFound();
  preloadLiveSummary();
  return <>
    <RetailPulseApp
      initialLang={locale as SeoLocale}
      initialView="tourism-desk"
      initialArea={area as TourismDeskArea}
      initialRoute
    />
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale, "tourism-desk", area as TourismDeskArea)) }}
    />
  </>;
}
