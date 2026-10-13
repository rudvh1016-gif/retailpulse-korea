#!/usr/bin/env node
/**
 * Read-only search evidence for a deployed KORETAIL origin.
 *
 * Requests each public page the way a crawler does (no redirects followed, no
 * JavaScript run) and prints one JSON line per URL: status, redirect target,
 * indexing headers, title, description, robots meta, canonical, hreflang
 * alternates, JSON-LD types, H1, and whether the server HTML itself names a
 * data source, a reference date and an observed/forecast label. Also reads
 * robots.txt and sitemap.xml. It never writes anything and sends no secrets.
 *
 *   node scripts/seo-live-audit.mjs https://koretaildata.com
 */
const origin = (process.argv[2] ?? "https://koretaildata.com").replace(/\/$/, "");
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const PATHS = [
  "/", "/ko", "/en", "/zh", "/ja",
  "/ko/airport-glance", "/en/airport-glance", "/ko/airport", "/ko/airport-glance-preview",
  "/ko/where-to", "/ko/myeongdong", "/en/myeongdong", "/ko/consumption", "/ko/business", "/ko/forecast",
  "/ko/about", "/ko/more", "/ko/tourism-desk", "/ko/tourism-desk/myeongdong", "/ko/today",
  // Query combinations a visitor can share; each must name one canonical page.
  "/ko?date=2026-10-10", "/ko/airport?date=2026-10-10&terminal=T2", "/ko/airport?building=CONCOURSE",
  "/ko/airport-glance?date=2026-10-10", "/ko/myeongdong?date=2026-10-10", "/ko/consumption?area=myeongdong",
  "/ko/where-to?date=2026-10-10&area=hongdae", "/ko/business?industry=beauty&area=seongsu",
  // Unknown pages must not answer 200.
  "/ko/does-not-exist", "/xx", "/ko/airport/extra", "/ko/myeongdong/extra",
];

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, "i")); return m ? decode(m[2] ?? m[3]) : null; };
const tags = (html, re) => [...html.matchAll(re)].map((m) => m[0]);

function visibleText(html) {
  return decode(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

const SOURCE_RE = /인천국제공항공사|Incheon International Airport Corporation|서울 열린데이터|Seoul Open Data|공공데이터포털|data\.go\.kr|기상청|Korea Meteorological|한국관광공사|Korea Tourism|신한카드|Shinhan|국토교통부|한국천문연구원|출처|Source[s]?:/gi;
const DATE_RE = /20\d\d[-.]\d\d[-.]\d\d|20\d\d년\s?\d{1,2}월\s?\d{1,2}일|\d{1,2}:\d\d\s?KST|KST/g;
const KIND_RE = /관측|실측|예상|예측|추정|공식 예측|observed|forecast|estimated|official/gi;

async function page(path) {
  const started = Date.now();
  const response = await fetch(origin + path, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html" } });
  const html = response.headers.get("content-type")?.includes("html") ? await response.text() : "";
  const head = html.split(/<\/head>/i)[0] ?? "";
  const canonical = tags(head, /<link[^>]+rel=["']canonical["'][^>]*>/gi).map((t) => attr(t, "href"));
  const alternates = tags(head, /<link[^>]+rel=["']alternate["'][^>]*hreflang[^>]*>|<link[^>]+hreflang[^>]*rel=["']alternate["'][^>]*>/gi)
    .map((t) => `${attr(t, "hreflang") ?? attr(t, "hrefLang")}=${attr(t, "href")}`);
  const robotsMeta = tags(head, /<meta[^>]+name=["'](robots|googlebot)["'][^>]*>/gi).map((t) => `${attr(t, "name")}:${attr(t, "content")}`);
  const description = tags(head, /<meta[^>]+name=["']description["'][^>]*>/gi).map((t) => attr(t, "content"));
  const ldTypes = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
    try { const data = JSON.parse(m[1]); const list = Array.isArray(data) ? data : data["@graph"] ?? [data];
      return list.map((item) => `${item["@type"]}${item.name ? `:${String(item.name).slice(0, 40)}` : ""}${item.dateModified ? `@${item.dateModified}` : ""}`).join("|"); }
    catch { return "INVALID_JSON"; }
  });
  const body = html.split(/<body[^>]*>/i)[1] ?? "";
  const text = visibleText(body.split(/self\.__VINEXT_RSC_CHUNKS__/)[0] ?? body);
  const uniq = (re) => [...new Set((text.match(re) ?? []).map((s) => s.trim()))].slice(0, 12);
  return {
    path, status: response.status, ms: Date.now() - started,
    location: response.headers.get("location"),
    xRobots: response.headers.get("x-robots-tag"), link: response.headers.get("link"),
    cache: response.headers.get("cache-control"), contentType: response.headers.get("content-type"),
    lang: (html.match(/<html[^>]*\slang=["']([^"']+)/i) ?? [])[1] ?? null,
    title: decode((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "") || null,
    description, robotsMeta, canonical, alternates, ldTypes,
    h1: tags(body, /<h1[\s\S]*?<\/h1>/gi).map((t) => visibleText(t)).slice(0, 3),
    textLength: text.length,
    sources: uniq(SOURCE_RE), dates: uniq(DATE_RE), kinds: uniq(KIND_RE),
    textStart: text.slice(0, 600),
  };
}

const out = (line) => console.log(JSON.stringify(line));
for (const path of PATHS) {
  try { out(await page(path)); } catch (error) { out({ path, error: String(error) }); }
}
for (const file of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
  try {
    const response = await fetch(origin + file, { redirect: "manual", headers: { "user-agent": UA } });
    const body = await response.text();
    if (file === "/sitemap.xml") {
      const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      const lastmods = [...new Set([...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]))];
      out({ file, status: response.status, contentType: response.headers.get("content-type"), urls: urls.length,
        withQuery: urls.filter((u) => u.includes("?")).length, alternates: (body.match(/xhtml:link/g) ?? []).length,
        lastmods: lastmods.slice(0, 8), distinctLastmods: lastmods.length, sample: urls.slice(0, 60) });
    } else {
      out({ file, status: response.status, contentType: response.headers.get("content-type"), body: body.slice(0, 1500) });
    }
  } catch (error) { out({ file, error: String(error) }); }
}
