import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { isStagingDeployment, organizationNode, pageTitle, pageDescription, siteOrigin, socialImage, websiteNode } from "./seo-config";

export const metadata: Metadata = {
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } : {}),
    ...(process.env.NAVER_SITE_VERIFICATION?.trim() ? { other: { 'naver-site-verification': process.env.NAVER_SITE_VERIFICATION.trim() } } : {}),
  },
  metadataBase: new URL(siteOrigin),
  title: pageTitle('ko'),
  description: pageDescription('ko'),
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/favicon.svg",
    // iOS ignores the manifest icons when adding to the home screen and
    // reads this one instead; without it the icon is a blurry screenshot.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  // Opens full screen from the iPhone home screen, under the product name.
  appleWebApp: { capable: true, title: "KORETAIL", statusBarStyle: "default" },
  /*
   * There is no AI-specific opt-in. Google states that whether a page can
   * appear in AI Overviews and AI Mode is governed by the ordinary preview
   * directives — nosnippet, max-snippet, max-image-preview — and nothing
   * else. The rendered tag used to stop at `max-image-preview:large`, which
   * leaves the TEXT snippet at Google's default length; `max-snippet:-1`
   * removes that cap and is the one directive that actually widens how much
   * of a page a generative surface may quote.
   */
  robots: isStagingDeployment
    ? { index: false, follow: false, noarchive: true, nocache: true }
    : {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
  alternates: { canonical: "/ko", languages: { "ko-KR": "/ko", en: "/en", "zh-CN": "/zh", "ja-JP": "/ja", "x-default": "/en" } },
  openGraph: {
    title: pageTitle('ko'),
    description: pageDescription('ko'),
    url: "/ko", siteName: "KORETAIL", type: "website", locale: "ko_KR",
    images: [socialImage],
  },
  twitter: { card: "summary_large_image", title: pageTitle('ko'), description: pageDescription('ko'), images: [socialImage.url] },
};

// White-first: the browser chrome and PWA splash match the page, which is
// pure white. A tinted theme colour would read as a different site.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#FFFFFF" };

const supportedDocumentLanguages = new Set(["ko", "en", "zh-CN", "ja"]);

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const requestedLanguage = requestHeaders.get("x-rpk-document-language") ?? "ko";
  const documentLanguage = supportedDocumentLanguages.has(requestedLanguage) ? requestedLanguage : "ko";

  return (
    <html lang={documentLanguage} suppressHydrationWarning>
      <body>
        {children}
        {/*
          One `@graph` rather than two unrelated nodes: the Organization is the
          publisher of the WebSite, and every page's WebPage node points back
          at both by `@id`. An engine reading any single page can therefore
          resolve "who publishes this" without guessing, which is the step that
          precedes a citation.
        */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [organizationNode, websiteNode],
        }) }} />
      </body>
    </html>
  );
}
