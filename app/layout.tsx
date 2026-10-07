import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./airport-date-calendar.css";
import { isStagingDeployment, pageTitle, pageDescription, siteOrigin, socialImage, shareDescription } from "./seo-config";

export const metadata: Metadata = {
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION?.trim() ? { google: process.env.GOOGLE_SITE_VERIFICATION.trim() } : {}),
    ...(process.env.NAVER_SITE_VERIFICATION?.trim() ? { other: { 'naver-site-verification': process.env.NAVER_SITE_VERIFICATION.trim() } } : {}),
  },
  metadataBase: new URL(siteOrigin),
  title: pageTitle('ko'),
  description: pageDescription('ko'),
  icons: {
    icon: [{ url: "/favicon-20261007.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" }, { url: "/favicon-20261007.svg", type: "image/svg+xml" }, { url: "/icon-192-20261007.png", sizes: "192x192", type: "image/png" }],
    shortcut: "/favicon-20261007.ico",
    // iOS ignores the manifest icons when adding to the home screen and
    // reads this one instead; without it the icon is a blurry screenshot.
    apple: [{ url: "/apple-touch-icon-20261007.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest-20261007.webmanifest",
  // Opens full screen from the iPhone home screen, under the product name.
  appleWebApp: { capable: true, title: "KORETAIL", statusBarStyle: "default" },
  robots: isStagingDeployment
    ? { index: false, follow: false, noarchive: true, nocache: true }
    : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  alternates: { canonical: "/ko", languages: { "ko-KR": "/ko", en: "/en", "zh-CN": "/zh", "ja-JP": "/ja", "x-default": "/en" } },
  openGraph: {
    title: "KORETAIL", description: shareDescription,
    url: "/ko", siteName: "KORETAIL", type: "website", locale: "ko_KR",
    images: [socialImage],
  },
  twitter: { card: "summary_large_image", title: "KORETAIL", description: shareDescription, images: [socialImage.url] },
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": ["WebSite", "WebApplication"],
          name: "KORETAIL",
          alternateName: "KORETAIL · Retail Demand Signals for Korea",
          url: siteOrigin,
          applicationCategory: "TravelApplication",
          operatingSystem: "Web",
          inLanguage: ["ko-KR", "en", "zh-CN", "ja-JP"],
          description: "Retail demand signals for Korea, combining foreign-visitor, airport and store-operating context for Seoul.",
        }) }} />
      </body>
    </html>
  );
}
