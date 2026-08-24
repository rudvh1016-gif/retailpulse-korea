import type { Metadata } from "next";
import { notFound } from "next/navigation";
import RetailPulseApp from "../page";
import { buildMetadata, seoLocales, type SeoLocale } from "../seo-config";

export function generateStaticParams() { return seoLocales.map((locale) => ({ locale })); }

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) return {};
  return buildMetadata(locale as SeoLocale);
}

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) notFound();
  return <RetailPulseApp initialLang={locale as SeoLocale} initialRoute />;
}

