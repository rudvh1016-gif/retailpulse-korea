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

/**
 * The shell font, requested from the head instead of after the stylesheet.
 *
 * A font referenced only by an @font-face `src` is not discoverable until the
 * browser has downloaded and parsed globals.css AND laid out an element that
 * uses it — three serialized steps before the request even starts. On the LTE
 * connection this product is read over that is the difference between text
 * appearing in the brand face and text appearing in the fallback and then
 * shifting. `font-display: swap` is already set, so this shortens the swap
 * rather than introducing one.
 *
 * ONE face per locale, deliberately. Preloading all six would push 3.3 MB at
 * a reader who needs 241 KB of it, which is slower, not faster. Each entry is
 * the face that `--font-ui` actually resolves to for that locale in
 * app/globals.css (`.app.lang-ja`, `.app.lang-zh`, and the `:root` default
 * that ko and en both use), and only the regular weight: the bold face is for
 * headings, which can swap a moment later without moving body text.
 *
 * `crossOrigin: "anonymous"` is required, not optional — fonts are always
 * fetched in CORS mode, and a preload without it is fetched a second time.
 */
const SHELL_FONT: Record<SeoLocale, string> = {
  ko: "/fonts/koretail-sans-variable.woff2",
  en: "/fonts/koretail-sans-variable.woff2",
  ja: "/fonts/noto-sans-jp-400.woff2",
  zh: "/fonts/noto-sans-sc-400.woff2",
};

function preloadShellFont(locale: SeoLocale) {
  preload(SHELL_FONT[locale], { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
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
  preloadShellFont(locale as SeoLocale);
  return <>
    <RetailPulseApp initialLang={locale as SeoLocale} initialRoute initialScope="home" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageStructuredData(locale as SeoLocale)) }} />
  </>;
}
