import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { isStagingDeployment, siteOrigin, socialImage } from "./seo-config";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "서울 외국인 쇼핑수요 신호 | KORETAIL",
  description: "명동·홍대·성수의 오늘과 내일 외국인 쇼핑수요 신호, 매장 오픈 브리프, 인천공항 T1·T2 흐름을 KORETAIL에서 확인하세요.",
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
  robots: isStagingDeployment
    ? { index: false, follow: false, noarchive: true, nocache: true }
    : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  alternates: { canonical: "/ko", languages: { "ko-KR": "/ko", en: "/en", "zh-CN": "/zh", "ja-JP": "/ja", "x-default": "/en" } },
  openGraph: {
    title: "서울 외국인 쇼핑수요 신호 | KORETAIL",
    description: "오늘과 내일의 서울 외국인 쇼핑수요 신호, 매장 준비와 인천공항 T1·T2 흐름을 한눈에.",
    url: "/ko", siteName: "KORETAIL", type: "website", locale: "ko_KR",
    images: [socialImage],
  },
  twitter: { card: "summary_large_image", title: "KORETAIL", description: "Retail Demand Signals for Korea — 서울의 외국인 쇼핑수요 신호를 오늘과 내일 관점에서 읽습니다.", images: [socialImage.url] },
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
