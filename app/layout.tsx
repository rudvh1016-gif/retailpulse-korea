import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource-variable/noto-sans-jp/wght.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "./globals.css";
import { siteOrigin } from "./seo-config";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "서울 외국인 쇼핑수요 신호 | RetailPulse Korea",
  description: "명동·홍대·성수의 오늘과 내일 외국인 쇼핑수요 신호, 매장 오픈 브리프, 인천공항 T1·T2 흐름을 확인하세요.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }], shortcut: "/favicon.svg" },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  alternates: { canonical: "/ko", languages: { "ko-KR": "/ko", en: "/en", "zh-CN": "/zh", "ja-JP": "/ja", "x-default": "/en" } },
  openGraph: {
    title: "서울 외국인 쇼핑수요 신호 | RetailPulse Korea",
    description: "오늘과 내일의 서울 외국인 쇼핑수요 신호, 매장 준비와 인천공항 T1·T2 흐름을 한눈에.",
    url: "/ko", siteName: "RetailPulse Korea", type: "website", locale: "ko_KR",
    images: [{ url: "/assets/retailpulse-korea-og.jpg", width: 1200, height: 630, alt: "석양의 한강과 남산서울타워가 보이는 서울 전경" }],
  },
  twitter: { card: "summary_large_image", title: "RetailPulse Korea · Seoul", description: "서울의 외국인 쇼핑수요 신호를 오늘과 내일 관점에서 읽습니다.", images: ["/assets/retailpulse-korea-og.jpg"] },
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
          name: "RetailPulse Korea · Seoul",
          url: siteOrigin,
          applicationCategory: "TravelApplication",
          operatingSystem: "Web",
          inLanguage: ["ko-KR", "en", "zh-CN", "ja-JP"],
          description: "Foreign-visitor retail signals, airport context and store opening briefs for Seoul.",
        }) }} />
      </body>
    </html>
  );
}
