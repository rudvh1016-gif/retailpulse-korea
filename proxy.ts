import { airportOnlyDestination } from "./app/airport-only-routes";
import { NextResponse, type NextRequest } from "next/server";

const documentLanguages: Record<string, string> = {
  ko: "ko",
  en: "en",
  zh: "zh-CN",
  ja: "ja",
};

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const destination = request.nextUrl.clone();
    destination.pathname = "/ko";
    return NextResponse.redirect(destination, 308);
  }
  // Resolve retired product paths before the RSC adapter can discard query
  // props. Only a validated selected date crosses into the airport scope.
  const retiredRoute = /^\/(ko|en|zh|ja)\/([^/]+)(?:\/([^/]+))?\/?$/.exec(request.nextUrl.pathname);
  if (retiredRoute && (!retiredRoute[3] || retiredRoute[2] === "tourism-desk") && airportOnlyDestination(retiredRoute[1], retiredRoute[2])) {
    const dates = request.nextUrl.searchParams.getAll("date");
    const destination = airportOnlyDestination(retiredRoute[1], retiredRoute[2], dates.length === 1 ? dates[0] : undefined)!;
    return NextResponse.redirect(new URL(destination, request.url), 308);
  }
  const locale = request.nextUrl.pathname.split("/")[1] ?? "ko";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-rpk-document-language", documentLanguages[locale] ?? "ko");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.svg|manifest.webmanifest|assets).*)"],
};
