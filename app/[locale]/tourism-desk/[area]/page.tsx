import { notFound, permanentRedirect } from "next/navigation";
import { seoLocales, type SeoLocale } from "../../../seo-config";

export default async function RetiredTourismDesk({ params }: { params: Promise<{ locale: string; area: string }> }) {
  const { locale } = await params;
  if (!seoLocales.includes(locale as SeoLocale)) notFound();
  permanentRedirect(`/${locale}`);
}
