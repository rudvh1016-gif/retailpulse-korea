import { NextResponse, type NextRequest } from "next/server";

const documentLanguages: Record<string, string> = {
  ko: "ko",
  en: "en",
  zh: "zh-CN",
  ja: "ja",
};

export function proxy(request: NextRequest) {
  const locale = request.nextUrl.pathname.split("/")[1] ?? "ko";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-rpk-document-language", documentLanguages[locale] ?? "ko");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|manifest.webmanifest|assets).*)"],
};
