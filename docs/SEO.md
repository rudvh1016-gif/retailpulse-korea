# SEO Production Contract

`NEXT_PUBLIC_SITE_ORIGIN` is the only canonical origin. Production validation rejects chatgpt.site and localhost. Sitemap, robots, canonical, hreflang, Open Graph, X metadata and JSON-LD derive from the same origin.

Locale routes are `/ko`, `/en`, `/zh`, and `/ja`; direct locale entry must not be redirected according to browser language. The server response must render `<html lang="ko|en|zh-CN|ja">` before hydration. Root `/` redirects to `/ko`.

Only meaningful home, area, airport, insights, business and methodology pages enter the sitemap. Flight rows, filter states, search queries and archived build documents are not indexable pages. Technical Work documents live under `docs/` in the repository, not under public web assets.

robots.txt disallows `/api/` except the read-only APIs pages render their content from (listed once in `lib/crawl-policy.ts`): `/api/live/summary` and `/api/live/predictions`, and since 2026-10-13 `/api/live/flights`, `/api/live/airport-months`, `/api/live/airport-days`, `/api/live/commercial-months` and `/api/live/usual`. Google renders pages and obeys robots.txt for their data requests; with those APIs blocked, the rendered page carried only the load-failure message, and Search Console reported pages such as `/ja/hongdae` and `/en/tourism-desk/*` as Soft 404 (September 2026). Those two responses carry `X-Robots-Tag: noindex`, so they are fetched for rendering but never listed as results. `npm run check:discoverability` evaluates the served robots.txt by longest-match precedence and fails if either API is blocked, if an internal API (`/api/health`, `/api/beta-signups`) becomes crawlable, or if the tag is missing; `tests/discoverability.test.mjs` holds every other API route in this build to the same rule.

After the custom domain is connected: verify apex/www redirect, submit `/sitemap.xml` to Google Search Console and Bing Webmaster, inspect four locale pages, and monitor indexed pages, impressions, CTR, landing pages and Core Web Vitals.

### 2026-10-13 Airport glance home

PR #357 made `/{lang}` render the airport glance, so `/{lang}/airport-glance` served the same page under a second self-canonical URL, both in the sitemap, while `/{lang}` kept the retired role-and-area briefing title. Now `/{lang}/airport-glance` names `/{lang}` as canonical, shares its hreflang cluster and structured data, and is not in the sitemap (68 → 64 URLs); the home uses the approved glance title and description; the menu still links to the glance URL. Site structured data is `WebSite` only (`WebApplication` needs ratings or reviews this site does not have).

The glance home draws departures, destinations and the monthly comparison from `/api/live/flights` and `/api/live/airport-months`; the airport page's day comparison reads `/api/live/airport-days`; consumption and store pages use `/api/live/commercial-months` and `/api/live/usual`. Blocked, Google's rendered home showed those tiles as "no verified data", the September Soft 404 pattern. They are now crawlable with `X-Robots-Tag: noindex`. Free-tier cost bound: one uncached Worker request per crawler render; flights reads at most 1,201 D1 rows, airport-months and airport-days at most 63, the other two well under 100. Even if each of the 12 flight-backed URLs (`/{lang}`, `/{lang}/airport-glance`, `/{lang}/airport`) were rendered twice a day, with flights (1,202), airport-months (63) and two airport-days reads (126) each time, that is about 33,400 rows/day against the 5,000,000-row D1 Free daily read limit (0.7%). `/api/live/duty-free-exchange` (a header widget) stays blocked.

Evidence comes from `scripts/seo-live-audit.mjs`, run by the manual Production Site Smoke against the public origin (status, canonical, hreflang, robots, JSON-LD, and whether the server HTML names sources, dates and observed/forecast labels). Search Console access is not available to the agent: after deploy, the owner should inspect `/ko`, `/en/airport` and `/ja/consumption` with URL Inspection → Test live URL and resubmit `/sitemap.xml`.

### 2026-09-23 Draft review

The two content API exceptions are anchored to the exact endpoint or its query string; similarly prefixed and nested endpoints remain blocked. No page metadata, sitemap, API query, cache policy or visible UI changes. Staging still blocks the entire site.

Official guidance reviewed: [JavaScript rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [resource blocking](https://developers.google.com/search/docs/crawling-indexing/robots/intro), and [noindex response headers](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag). Browser regression tests replay all four reported URLs with robots-aware fixture responses. This proves the rendering boundary locally, not recovery of Google's live index. After an individually approved release, inspect all four URLs in Search Console and request validation.
