import { airportOnlyDestination } from "../../../airport-only-routes";
import { notFound, permanentRedirect } from "next/navigation";
import { seoLocales, type SeoLocale } from "../../../seo-config";

export default async function RetiredTourismDesk({ params, searchParams }: { params: Promise<{ locale: string; area: string }>; searchParams?: Promise<{ date?: string | string[] }> }) {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) notFound();
  permanentRedirect(airportOnlyDestination(locale, "tourism-desk", (await searchParams)?.date)!);
}
