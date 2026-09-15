/**
 * Can a customer find this site at all?
 *
 * The problem this solves
 * ──────────────────────
 * Everything KORETAIL publishes is worth nothing to a reader who never
 * arrives, and almost every reader arrives from a search engine. Yet on
 * 2026-09-15 an audit found that not one check anywhere — unit, e2e, smoke or
 * health — ever fetched the live `/robots.txt` or `/sitemap.xml`. The SEO
 * tests in tests/rendered-html.test.mjs assert on the TEXT OF THE SOURCE FILE
 * (`assert.match(robots, /sitemap:/)`): they prove `app/robots.ts` mentions a
 * sitemap, not that the production edge serves one.
 *
 * That gap hides a silent, catastrophic failure. `app/robots.ts` answers
 * `Disallow: /` and `app/sitemap.ts` answers an empty list whenever
 * `RPK_DEPLOYMENT_STAGE === "staging"`, and `deploy-cloudflare.yml` takes that
 * value from `inputs.stage || 'production'`. One dispatch with the wrong input
 * de-indexes the entire site from Google and Naver. Every page would still
 * answer 200, every existing check would still pass, the visual check would
 * still photograph a perfect screen — and over the following weeks the traffic
 * would go to zero with nothing to point at. Recovery from a de-indexing takes
 * far longer than causing one.
 *
 * So this is the read-only, secret-free counterpart to site-smoke.yml for the
 * one surface nobody was watching: the surface search engines read.
 *
 * Derived, not restated
 * ─────────────────────
 * The expected page inventory is imported from `app/seo-config.ts` — the same
 * module the site builds its own metadata from. Adding a page to
 * `standaloneSeoSlugs` therefore makes this check demand that page live,
 * automatically. A hardcoded list here would have become wrong the first time
 * someone added a route, which is how the checks above became decorative.
 *
 * Nothing here writes anything, sends anything, or needs a credential.
 */
import {
  seoLocales,
  seoPath,
  standaloneSeoSlugs,
  tourismDeskAreas,
  pageTitle,
  pageDescription,
  type SeoLocale,
  type SeoSlug,
} from "../app/seo-config";

/**
 * Roughly how wide a string renders, in half-width units.
 *
 * A search result truncates a description by PIXELS, not by characters, and a
 * Chinese, Japanese or Korean character carries about twice the width — and
 * far more meaning — than a Latin one. Counting `.length` would call a
 * perfectly full 47-character Chinese description "too short" while passing a
 * 60-character English one that says less. This is the comparison that treats
 * the four locales fairly.
 */
export function snippetWidth(text: string): number {
  const wide = /[\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60]/;
  return [...text].reduce((total, character) => total + (wide.test(character) ? 2 : 1), 0);
}

/** Below this, a search engine tends to write its own snippet instead. */
export const MINIMUM_SNIPPET_WIDTH = 80;

const TIMEOUT_MS = 20_000;

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DiscoverabilityReport {
  origin: string;
  checks: Check[];
  notes: Record<string, unknown>[];
  failed: Check[];
  ok: boolean;
}

/**
 * `fetch` is a parameter, not a global, so tests/discoverability.test.mjs can
 * serve a deliberately de-indexed site to this exact code and prove the check
 * fails on it. A checker nobody has ever watched fail is a checker nobody
 * knows works — which is how the source-text SEO assertions this file
 * complements passed for months without verifying anything live.
 */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface Context {
  origin: string;
  fetch: Fetcher;
  checks: Check[];
  notes: Record<string, unknown>[];
}

function check(context: Context, name: string, ok: boolean, detail: string): boolean {
  context.checks.push({ name, ok, detail });
  return ok;
}

function note(context: Context, payload: Record<string, unknown>): void {
  context.notes.push(payload);
}

async function get(context: Context, url: string, redirect: RequestRedirect = "follow") {
  const response = await context.fetch(url, { redirect, signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { response, body: await response.text() };
}

/** Every indexable path this build claims to publish, derived from seo-config. */
function expectedPaths(): string[] {
  return seoLocales.flatMap((locale) => [
    seoPath(locale),
    ...standaloneSeoSlugs.map((slug) => seoPath(locale, slug as SeoSlug)),
    ...tourismDeskAreas.map((area) => seoPath(locale, "tourism-desk", area)),
  ]);
}

function attribute(html: string, pattern: RegExp): string | null {
  return html.match(pattern)?.[1] ?? null;
}

/**
 * robots.txt is the single switch that decides whether any of this matters.
 *
 * A blanket `Disallow: /` under `User-agent: *` is the staging answer. Seeing
 * it on the production origin is the one failure in this file that costs
 * months, so it is checked first and stated plainly.
 */
async function checkRobots(context: Context): Promise<void> {
  const { origin } = context;
  const { response, body } = await get(context, `${origin}/robots.txt`);
  if (!check(context, "robots.txt is served", response.status === 200, `status ${response.status}`)) return;
  note(context, { robotsTxt: body.trim().slice(0, 400) });

  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const blanketDisallow = lines.some((line) => /^disallow:\s*\/\s*$/i.test(line));
  check(context,
    "crawling is allowed (no blanket Disallow: /)",
    !blanketDisallow,
    blanketDisallow ? "PRODUCTION IS SERVING THE STAGING robots.txt — the site is being de-indexed" : "no site-wide disallow",
  );
  check(context,
    "robots.txt allows the site root",
    lines.some((line) => /^allow:\s*\//i.test(line)),
    "expected an Allow: / rule",
  );
  const declaredSitemap = lines.find((line) => /^sitemap:/i.test(line))?.slice("sitemap:".length).trim() ?? "";
  check(context,
    "robots.txt points at this origin's sitemap",
    declaredSitemap === `${origin}/sitemap.xml`,
    `declared ${declaredSitemap || "nothing"}`,
  );
  check(context,
    "the internal API is kept out of the index",
    lines.some((line) => /^disallow:\s*\/api\//i.test(line)),
    "expected Disallow: /api/",
  );
}

/**
 * The sitemap is how a crawler discovers pages that client-side navigation
 * hides. An empty or short one is not a cosmetic problem: the pages missing
 * from it are pages no reader will be sent to.
 */
async function checkSitemap(context: Context): Promise<string[]> {
  const { origin } = context;
  const { response, body } = await get(context, `${origin}/sitemap.xml`);
  if (!check(context, "sitemap.xml is served", response.status === 200, `status ${response.status}`)) return [];
  check(context,
    "sitemap.xml is served as XML",
    (response.headers.get("content-type") ?? "").includes("xml"),
    `content-type ${response.headers.get("content-type")}`,
  );

  const urls = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
  const expected = expectedPaths().map((path) => `${origin}${path}`);
  note(context, { sitemap: { listed: urls.length, expected: expected.length } });

  check(context, "sitemap.xml is not empty", urls.length > 0, `${urls.length} URLs — an empty sitemap is the staging answer`);
  check(context, "sitemap URLs are unique", new Set(urls).size === urls.length, `${urls.length} entries, ${new Set(urls).size} distinct`);

  const missing = expected.filter((url) => !urls.includes(url));
  check(context, "every page this build publishes is in the sitemap", missing.length === 0, missing.slice(0, 6).join(", ") || "none missing");

  const foreign = urls.filter((url) => !url.startsWith(`${origin}/`));
  check(context, "no sitemap URL points off the canonical origin", foreign.length === 0, foreign.slice(0, 3).join(", ") || "all on-origin");

  // A lastmod that is always "now" is the reason Google discards lastmod for a
  // whole site, so a stable date is the point. Two reads seconds apart must
  // agree; a per-request timestamp would not.
  const lastmods = [...body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1].trim());
  const second = await get(context, `${origin}/sitemap.xml`);
  const lastmodsAgain = [...second.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1].trim());
  check(context,
    "lastmod is stable between two reads",
    lastmods.length > 0 && lastmods.join("|") === lastmodsAgain.join("|"),
    `${lastmods.length} dated entries; first ${lastmods[0] ?? "none"}`,
  );
  check(context,
    "the sitemap declares its locale alternates",
    /hreflang=/.test(body),
    "expected xhtml:link rel=alternate entries so the four locales are pooled, not competing",
  );

  return urls;
}

/**
 * A page in the sitemap that does not answer 200 is a page a crawler is
 * invited to and then turned away from, which costs crawl budget and trust.
 */
async function checkSitemapUrlsResolve(context: Context, urls: string[]): Promise<void> {
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const response = await context.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status !== 200) failures.push(`${url} -> ${response.status}`);
    } catch (error) {
      failures.push(`${url} -> ${(error as Error).message}`);
    }
  }
  check(context,
    "every sitemap URL answers 200 without redirecting",
    failures.length === 0,
    failures.slice(0, 5).join("; ") || `${urls.length} URLs all 200`,
  );
}

/**
 * What a reader sees in the result list, and what tells a crawler which of the
 * four locale copies to show them.
 */
async function checkPageIdentity(context: Context, locale: SeoLocale, slug?: SeoSlug): Promise<void> {
  const { origin } = context;
  const path = seoPath(locale, slug);
  const label = slug ? `${path}` : `/${locale}`;
  const { response, body } = await get(context, `${origin}${path}`);
  if (!check(context, `${label} is served`, response.status === 200, `status ${response.status}`)) return;

  const expectedLang = locale === "zh" ? "zh-CN" : locale === "ja" ? "ja-JP" : locale === "ko" ? "ko-KR" : "en";
  check(context,
    `${label} declares lang="${expectedLang}"`,
    new RegExp(`<html[^>]*\\slang="${expectedLang}"`).test(body),
    attribute(body, /<html[^>]*\slang="([^"]+)"/) ?? "no lang attribute",
  );

  // noindex anywhere on a page meant to rank silently removes it from search.
  const robotsMeta = attribute(body, /<meta[^>]+name="robots"[^>]+content="([^"]+)"/i);
  check(context, `${label} is indexable`, !/noindex/i.test(robotsMeta ?? ""), `robots meta: ${robotsMeta ?? "absent"}`);

  const canonical = attribute(body, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
  check(context,
    `${label} names itself as canonical`,
    canonical === `${origin}${path}`,
    `canonical ${canonical ?? "absent"}`,
  );

  const hreflangs = [...body.matchAll(/<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"/gi)].map((match) => match[1]);
  check(context,
    `${label} links its other locales`,
    ["ko-KR", "en", "zh-CN", "ja-JP", "x-default"].every((tag) => hreflangs.includes(tag)),
    `hreflang: ${hreflangs.join(",") || "none"}`,
  );

  const title = body.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? "";
  const description = attribute(body, /<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.trim() ?? "";
  check(context, `${label} has a title`, title.length > 0, `${title.length} chars`);
  check(context, `${label} has a description`, description.length > 0, `${description.length} chars`);

  // On 2026-09-15 `/predictions` shipped a description that was a copy of its
  // own title — brand pipe included — in all four locales, so the search
  // snippet said nothing a reader could act on. It was invisible because no
  // check compared the two. This is that comparison, run against the live site.
  check(context,
    `${label} description is not a copy of the title`,
    description.length > 0 && description.replace(/\s*\|\s*KORETAIL$/, "") !== title.replace(/\s*\|\s*KORETAIL$/, ""),
    `title "${title.slice(0, 40)}…" vs description "${description.slice(0, 40)}…"`,
  );
  check(context,
    `${label} description is long enough to be a snippet`,
    snippetWidth(description) >= MINIMUM_SNIPPET_WIDTH,
    `width ${snippetWidth(description)} (${description.length} chars) — a snippet this thin gets replaced by text the search engine picks itself`,
  );
  check(context,
    `${label} serves the metadata this build declares`,
    title === pageTitle(locale, slug) && description === pageDescription(locale, slug),
    "the edge is serving metadata from a different build than this checkout",
  );

  const structured = [...body.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => { try { return JSON.parse(match[1]); } catch { return null; } });
  check(context, `${label} structured data parses`, structured.length > 0 && structured.every(Boolean), `${structured.length} blocks`);
  const types = structured.filter(Boolean).flatMap((block) => Array.isArray(block) ? block.map((entry) => entry["@type"]) : [block["@type"]]);
  check(context,
    `${label} describes itself to crawlers`,
    types.includes("WebPage") && types.includes("BreadcrumbList"),
    `@type: ${types.join(",") || "none"}`,
  );

  note(context, { page: label, title, descriptionChars: description.length, structuredTypes: types });
}

/** A share with a broken preview image converts worse than one with none. */
async function checkSocialPreview(context: Context): Promise<void> {
  const { origin } = context;
  const { body } = await get(context, `${origin}/ko`);
  const image = attribute(body, /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (!check(context, "the home page declares a share image", Boolean(image), image ?? "og:image absent")) return;
  const url = image!.startsWith("http") ? image! : `${origin}${image}`;
  const response = await context.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const type = response.headers.get("content-type") ?? "";
  const bytes = (await response.arrayBuffer()).byteLength;
  check(context, "the share image actually loads", response.status === 200 && type.startsWith("image/") && bytes > 0, `${response.status}; ${type}; ${bytes}B`);
}

/** One address per page. Two addresses for one page split its ranking. */
async function checkEntryRedirect(context: Context): Promise<void> {
  const { origin } = context;
  const response = await context.fetch(`${origin}/`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const location = response.headers.get("location") ?? "";
  check(context,
    "the bare origin sends readers to one locale",
    [301, 302, 307, 308].includes(response.status) && /\/ko\/?$/.test(location),
    `status ${response.status} -> ${location || "no Location"}`,
  );
}

/**
 * Runs every discoverability check against one origin.
 *
 * Read-only and credential-free by construction: it issues GET requests to
 * public URLs and nothing else, so it is safe to point at Production from any
 * runner.
 */
export async function runDiscoverabilityChecks(options: { origin: string; fetch?: Fetcher }): Promise<DiscoverabilityReport> {
  const context: Context = {
    origin: new URL(options.origin).origin,
    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
    checks: [],
    notes: [],
  };

  await checkRobots(context);
  const urls = await checkSitemap(context);
  if (urls.length > 0) await checkSitemapUrlsResolve(context, urls);
  for (const locale of seoLocales) await checkPageIdentity(context, locale);
  for (const slug of ["airport", "predictions", "business", "forecast"] as SeoSlug[]) {
    await checkPageIdentity(context, "ko", slug);
  }
  await checkSocialPreview(context);
  await checkEntryRedirect(context);

  const failed = context.checks.filter((item) => !item.ok);
  return { origin: context.origin, checks: context.checks, notes: context.notes, failed, ok: failed.length === 0 };
}

/** Human-readable rendering of a report, for the CLI and for job logs. */
export function summarizeDiscoverability(report: DiscoverabilityReport): string {
  const lines = [`KORETAIL discoverability check \u2014 ${report.origin}`, ""];
  for (const payload of report.notes) lines.push(JSON.stringify(payload));
  lines.push("");
  for (const item of report.checks) lines.push(`${item.ok ? "PASS" : "FAIL"}  ${item.name}  \u2014  ${item.detail}`);
  lines.push("");
  lines.push(`DISCOVERABILITY ${report.ok ? "OK" : "BROKEN"} \u2014 ${report.checks.length - report.failed.length}/${report.checks.length} checks passed`);
  if (!report.ok) {
    lines.push("", "Failing:");
    for (const item of report.failed) lines.push(`  - ${item.name}: ${item.detail}`);
  }
  return lines.join("\n");
}
