/**
 * Does the discoverability check actually catch a site nobody can find?
 *
 * A checker that has only ever been watched pass proves nothing. These tests
 * serve deliberately broken sites to the real lib/discoverability.ts and
 * require it to fail on each one — above all on the staging robots.txt, the
 * failure that silently removes KORETAIL from every search engine while every
 * page still answers 200 and every screenshot still looks perfect.
 *
 * No network, no provider, no credential: the fetcher is a function.
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SITE_ORIGIN ??= "https://koretaildata.com";

const { runDiscoverabilityChecks } = await import("../lib/discoverability.ts");
const { seoLocales, seoPath, standaloneSeoSlugs, tourismDeskAreas, pageTitle, pageDescription } =
  await import("../app/seo-config.ts");

const ORIGIN = "https://koretaildata.com";

const LANG_TAG = { ko: "ko-KR", en: "en", zh: "zh-CN", ja: "ja-JP" };

function indexablePaths() {
  return seoLocales.flatMap((locale) => [
    seoPath(locale),
    ...standaloneSeoSlugs.map((slug) => seoPath(locale, slug)),
    ...tourismDeskAreas.map((area) => seoPath(locale, "tourism-desk", area)),
  ]);
}

function pageHtml(locale, slug, overrides = {}) {
  const path = seoPath(locale, slug);
  const title = overrides.title ?? pageTitle(locale, slug);
  const description = overrides.description ?? pageDescription(locale, slug);
  const alternates = seoLocales
    .map((other) => `<link rel="alternate" hreflang="${LANG_TAG[other]}" href="${ORIGIN}${seoPath(other, slug)}"/>`)
    .join("");
  const jsonLd = JSON.stringify([
    { "@context": "https://schema.org", "@type": "WebPage", url: `${ORIGIN}${path}`, name: title },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [] },
  ]);
  return [
    `<!DOCTYPE html><html lang="${overrides.lang ?? LANG_TAG[locale]}"><head>`,
    `<title>${title}</title>`,
    `<meta name="description" content="${description}"/>`,
    overrides.robotsMeta ? `<meta name="robots" content="${overrides.robotsMeta}"/>` : "",
    `<link rel="canonical" href="${ORIGIN}${path}"/>`,
    alternates,
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}${seoPath("en", slug)}"/>`,
    `<meta property="og:image" content="/og-image.png"/>`,
    `<script type="application/ld+json">${jsonLd}</script>`,
    `</head><body>KORETAIL</body></html>`,
  ].join("");
}

function robotsTxt() {
  return `User-Agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\nHost: ${ORIGIN}\n`;
}

function sitemapXml(paths, { lastmod = "2026-09-15T00:00:00.000Z", withAlternates = true } = {}) {
  const entries = paths.map((path) => [
    "<url>",
    `<loc>${ORIGIN}${path}</loc>`,
    withAlternates ? `<xhtml:link rel="alternate" hreflang="ko-KR" href="${ORIGIN}${path}"/>` : "",
    lastmod ? `<lastmod>${typeof lastmod === "function" ? lastmod() : lastmod}</lastmod>` : "",
    "</url>",
  ].join("")).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries}</urlset>`;
}

/** A site that is findable. Every fault below is one edit away from this. */
function healthySite(faults = {}) {
  const paths = faults.sitemapPaths ?? indexablePaths();
  return (url, init = {}) => {
    const { pathname } = new URL(url);
    const reply = (body, status = 200, headers = {}) =>
      Promise.resolve(new Response(body, { status, headers }));

    if (pathname === "/robots.txt") return reply(faults.robots ?? robotsTxt(), 200, { "content-type": "text/plain" });
    if (pathname === "/sitemap.xml") {
      return reply(faults.sitemap ?? sitemapXml(paths, faults.sitemapOptions), 200, { "content-type": "application/xml" });
    }
    if (pathname === "/og-image.png") return reply("PNGDATA", 200, { "content-type": "image/png" });
    if (pathname === "/") {
      return init.redirect === "manual"
        ? reply("", 308, { location: `${ORIGIN}/ko` })
        : reply(pageHtml("ko"), 200, { "content-type": "text/html" });
    }

    const segments = pathname.split("/").filter(Boolean);
    const locale = segments[0];
    if (!seoLocales.includes(locale)) return reply("not found", 404);
    const slug = segments[1] === "tourism-desk" ? "tourism-desk" : segments[1];
    if (faults.missingPaths?.includes(pathname)) return reply("not found", 404);
    return reply(pageHtml(locale, slug, faults.pageOverrides?.(pathname) ?? {}), 200, { "content-type": "text/html" });
  };
}

async function run(faults) {
  return runDiscoverabilityChecks({ origin: ORIGIN, fetch: healthySite(faults) });
}

function failing(report) {
  return report.failed.map((item) => item.name);
}

test("a findable site passes every check", async () => {
  const report = await run({});
  assert.equal(report.ok, true, `unexpected failures: ${failing(report).join(", ")}`);
  assert.ok(report.checks.length >= 50, `expected a substantial check set, got ${report.checks.length}`);
});

test("the staging robots.txt on production is caught — the silent de-indexing", async () => {
  // Exactly what app/robots.ts answers when RPK_DEPLOYMENT_STAGE === "staging",
  // which deploy-cloudflare.yml takes from `inputs.stage || 'production'`.
  const report = await run({ robots: "User-Agent: *\nDisallow: /\n" });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("crawling is allowed (no blanket Disallow: /)"),
    "a production robots.txt that forbids every crawler must fail loudly");
});

test("an empty sitemap is caught, not read as a quiet day", async () => {
  const report = await run({ sitemap: sitemapXml([]) });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("sitemap.xml is not empty"));
  assert.ok(failing(report).includes("every page this build publishes is in the sitemap"));
});

test("a page this build publishes but the sitemap omits is caught", async () => {
  const kept = indexablePaths().filter((path) => path !== "/ko/airport");
  const report = await run({ sitemapPaths: kept });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("every page this build publishes is in the sitemap"));
});

test("a sitemap URL that 404s is caught", async () => {
  const report = await run({ missingPaths: ["/ja/business"] });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("every sitemap URL answers 200 without redirecting"));
});

test("lastmod that changes on every read is caught", async () => {
  // The pre-2026-09-15 sitemap used `lastModified: new Date()`, so every crawl
  // was told the whole site had just changed. Google discards a lastmod it
  // cannot trust, and it does not discard it per URL.
  const report = await run({ sitemapOptions: { lastmod: () => new Date().toISOString() + Math.random() } });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("lastmod is stable between two reads"));
});

test("a sitemap with no locale alternates is caught", async () => {
  const report = await run({ sitemapOptions: { withAlternates: false } });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("the sitemap declares its locale alternates"));
});

test("a noindex meta tag is caught", async () => {
  const report = await run({ pageOverrides: (path) => (path === "/ko" ? { robotsMeta: "noindex, nofollow" } : {}) });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("/ko is indexable"));
});

test("a description that merely repeats the title is caught", async () => {
  // The real defect this was written for: descriptions.predictions was a copy
  // of titles.predictions in all four locales, brand pipe included.
  const report = await run({
    pageOverrides: (path) => (path === "/ko/predictions" ? { description: pageTitle("ko", "predictions") } : {}),
  });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("/ko/predictions description is not a copy of the title"));
  assert.ok(failing(report).includes("/ko/predictions description is long enough to be a snippet"));
});

test("a stale edge serving another build's metadata is caught", async () => {
  const report = await run({
    pageOverrides: (path) => (path === "/en" ? { title: "RetailPulse Korea — old build" } : {}),
  });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes("/en serves the metadata this build declares"));
});

test("a wrong html lang is caught", async () => {
  const report = await run({ pageOverrides: (path) => (path === "/ja" ? { lang: "en" } : {}) });
  assert.equal(report.ok, false);
  assert.ok(failing(report).includes('/ja declares lang="ja-JP"'));
});

test("the check issues only GET requests and never carries a credential", async () => {
  const seen = [];
  const site = healthySite({});
  await runDiscoverabilityChecks({
    origin: ORIGIN,
    fetch: (url, init) => { seen.push({ url, init }); return site(url, init); },
  });
  assert.ok(seen.length > 0);
  for (const { init } of seen) {
    assert.ok(!init?.method || init.method === "GET", `unexpected method ${init?.method}`);
    assert.equal(init?.body, undefined, "a discoverability check must never send a body");
    assert.equal(init?.headers, undefined, "no header means no credential can be attached");
  }
});

// ── The metadata this build declares, checked at the source ────────────────
// The tests above prove the live checker catches a broken site. These prove
// this checkout is not the broken site.

const sitemapModule = await import("../app/sitemap.ts");

test("no page's description is a copy of its own title, in any locale", async () => {
  const offenders = [];
  for (const locale of seoLocales) {
    const pages = [undefined, ...standaloneSeoSlugs, "tourism-desk"];
    for (const slug of pages) {
      const title = pageTitle(locale, slug).replace(/\s*\|\s*KORETAIL$/, "").trim();
      const description = pageDescription(locale, slug).replace(/\s*\|\s*KORETAIL$/, "").trim();
      if (description === title) offenders.push(`${locale}/${slug ?? "home"}`);
    }
  }
  assert.deepEqual(offenders, [],
    "a description that repeats the title tells a searcher nothing, so Google writes its own snippet instead");
});

test("every description is long enough to survive as a search snippet", async () => {
  const { snippetWidth, MINIMUM_SNIPPET_WIDTH } = await import("../lib/discoverability.ts");
  const short = [];
  for (const locale of seoLocales) {
    for (const slug of [undefined, ...standaloneSeoSlugs, "tourism-desk"]) {
      const width = snippetWidth(pageDescription(locale, slug));
      if (width < MINIMUM_SNIPPET_WIDTH) short.push(`${locale}/${slug ?? "home"} (width ${width})`);
    }
  }
  assert.deepEqual(short, []);
});

test("snippet width counts CJK as wide, so the four locales are judged on the same scale", async () => {
  const { snippetWidth } = await import("../lib/discoverability.ts");
  assert.equal(snippetWidth("abcd"), 4);
  assert.equal(snippetWidth("\uBA85\uB3D9"), 4, "Hangul is full-width");
  assert.equal(snippetWidth("\u660E\u6D1E"), 4, "Han is full-width");
  assert.ok(snippetWidth("\u67E5\u770BKORETAIL") > "\u67E5\u770BKORETAIL".length,
    "a raw character count would under-measure a mixed CJK/Latin snippet");
});

test("the sitemap dates only the pages a checkout can honestly date", () => {
  const entries = sitemapModule.default();
  assert.ok(entries.length > 0);
  const undated = entries.filter((entry) => !entry.lastModified).map((entry) => entry.url);
  // about and more are explainer copy; nothing in a checkout knows when they
  // last changed, and a lastmod Google decides is unreliable is discarded for
  // the whole site, not just for the URL that lied.
  assert.equal(undated.length, seoLocales.length * 2, `undated: ${undated.join(", ")}`);
  assert.ok(undated.every((url) => /\/(about|more)$/.test(url)), undated.join(", "));
});

test("sitemap lastmod is stable within a day, not a fresh timestamp per request", () => {
  const first = sitemapModule.default();
  const second = sitemapModule.default();
  const stamp = (entries) => entries.map((entry) => entry.lastModified?.toISOString() ?? "").join("|");
  assert.equal(stamp(first), stamp(second));
  const dated = first.find((entry) => entry.lastModified);
  assert.ok(dated.lastModified.toISOString().endsWith("T15:00:00.000Z"),
    `expected the start of a KST day, got ${dated.lastModified.toISOString()}`);
});

test("every sitemap entry declares all four locales plus x-default", () => {
  for (const entry of sitemapModule.default()) {
    const languages = entry.alternates?.languages ?? {};
    assert.deepEqual(
      Object.keys(languages).sort(),
      ["en", "ja-JP", "ko-KR", "x-default", "zh-CN"],
      `${entry.url} does not declare its translations, so the four locales compete instead of pooling`,
    );
    for (const href of Object.values(languages)) {
      assert.ok(href.startsWith(`${ORIGIN}/`), `${href} must be absolute and on the canonical origin`);
    }
  }
});

test("the discoverability check is actually wired to a workflow, not decorative", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = new URL("../.github/workflows/", import.meta.url);
  const files = await readdir(dir);
  const bodies = await Promise.all(files.map((file) => readFile(new URL(file, dir), "utf8")));
  const runners = files.filter((_, index) => bodies[index].includes("check:discoverability"));
  assert.ok(runners.length > 0,
    "lib/discoverability.ts exists and nothing runs it — exactly the decorative mechanism it was written to replace");
  const workflow = bodies[files.indexOf(runners[0])];
  assert.match(workflow, /workflow_run:/, "it must run automatically after a deploy, not only when someone remembers");
  assert.match(workflow, /workflows: \[Deploy Cloudflare\]/);
});
