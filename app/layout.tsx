import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { isStagingDeployment, siteOrigin } from "./seo-config";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "서울 외국인 쇼핑수요 신호 | KORETAIL",
  description: "명동·홍대·성수의 오늘과 내일 외국인 쇼핑수요 신호, 매장 오픈 브리프, 인천공항 T1·T2 흐름을 KORETAIL에서 확인하세요.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  robots: isStagingDeployment
    ? { index: false, follow: false, noarchive: true, nocache: true }
    : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  alternates: { canonical: "/ko", languages: { "ko-KR": "/ko", en: "/en", "zh-CN": "/zh", "ja-JP": "/ja", "x-default": "/en" } },
  openGraph: {
    title: "서울 외국인 쇼핑수요 신호 | KORETAIL",
    description: "오늘과 내일의 서울 외국인 쇼핑수요 신호, 매장 준비와 인천공항 T1·T2 흐름을 한눈에.",
    url: "/ko", siteName: "KORETAIL", type: "website", locale: "ko_KR",
  },
  twitter: { card: "summary", title: "KORETAIL", description: "Retail Demand Signals for Korea — 서울의 외국인 쇼핑수요 신호를 오늘과 내일 관점에서 읽습니다." },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f3ed" };

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
