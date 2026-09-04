import { notFound, permanentRedirect } from "next/navigation";
import { seoLocales, type SeoLocale } from "../../seo-config";

/**
 * Compatibility route for links published during the Myeongdong-only pilot.
 * It renders no indexable copy of its own: the canonical Tourism Desk pages
 * always include the selected area in their URL.
 */
export default async function TourismDeskRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) notFound();
  permanentRedirect(`/${locale}/tourism-desk/myeongdong`);
}
