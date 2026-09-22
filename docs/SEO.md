# SEO Production Contract

`NEXT_PUBLIC_SITE_ORIGIN` is the only canonical origin. Production validation rejects chatgpt.site and localhost. Sitemap, robots, canonical, hreflang, Open Graph, X metadata and JSON-LD derive from the same origin.

Locale routes are `/ko`, `/en`, `/zh`, and `/ja`; direct locale entry must not be redirected according to browser language. The server response must render `<html lang="ko|en|zh-CN|ja">` before hydration. Root `/` redirects to `/ko`.

Only meaningful home, area, airport, insights, business and methodology pages enter the sitemap. Flight rows, filter states, search queries and archived build documents are not indexable pages. Technical Work documents live under `docs/` in the repository, not under public web assets.

After the custom domain is connected: verify apex/www redirect, submit `/sitemap.xml` to Google Search Console and Bing Webmaster, inspect four locale pages, and monitor indexed pages, impressions, CTR, landing pages and Core Web Vitals.

## Answer-engine discoverability (GEO/AEO)

`docs/GEO_SEO.md` is the reference for the 2026-09-22 discoverability work:
what the first HTML response carried before and after, why the live numbers
stay client-side, how the Naver 80-character cap and the Google minimum-snippet
floor resolve into one width band, why every AI crawler is allowed, and the
ordered owner runbook for Search Console, Naver Search Advisor and Bing.

Two rules from it that belong here, because they constrain every future page:

- Any content that must reach an answer engine has to be in the **first HTML
  response**. Most AI crawlers do not execute JavaScript, and `/api/` is
  disallowed, so Googlebot's renderer cannot reach the live data either. A new
  page without an entry in `lib/page-brief.ts` fails
  `tests/rendered-html.test.mjs`.
- A meta description must sit between 80 and 160 half-width units, and a
  Korean one must also stay under 80 characters. Enforced in CI and against the
  live origin by `lib/discoverability.ts`.
