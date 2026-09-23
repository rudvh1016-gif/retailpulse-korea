# SEO Production Contract

`NEXT_PUBLIC_SITE_ORIGIN` is the only canonical origin. Production validation rejects chatgpt.site and localhost. Sitemap, robots, canonical, hreflang, Open Graph, X metadata and JSON-LD derive from the same origin.

Locale routes are `/ko`, `/en`, `/zh`, and `/ja`; direct locale entry must not be redirected according to browser language. The server response must render `<html lang="ko|en|zh-CN|ja">` before hydration. Root `/` redirects to `/ko`.

Only meaningful home, area, airport, insights, business and methodology pages enter the sitemap. Flight rows, filter states, search queries and archived build documents are not indexable pages. Technical Work documents live under `docs/` in the repository, not under public web assets.

robots.txt disallows `/api/` except the two read-only APIs every page renders its content from (`/api/live/summary`, `/api/live/predictions`, listed once in `lib/crawl-policy.ts`). Google renders pages and obeys robots.txt for their data requests; with those APIs blocked, the rendered page carried only the load-failure message, and Search Console reported pages such as `/ja/hongdae` and `/en/tourism-desk/*` as Soft 404 (September 2026). Those two responses carry `X-Robots-Tag: noindex`, so they are fetched for rendering but never listed as results. `npm run check:discoverability` evaluates the served robots.txt by longest-match precedence and fails if either API is blocked, if an internal API (`/api/health`, `/api/beta-signups`) becomes crawlable, or if the tag is missing; `tests/discoverability.test.mjs` holds every other API route in this build to the same rule.

After the custom domain is connected: verify apex/www redirect, submit `/sitemap.xml` to Google Search Console and Bing Webmaster, inspect four locale pages, and monitor indexed pages, impressions, CTR, landing pages and Core Web Vitals.
