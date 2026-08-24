# SEO Production Contract

`NEXT_PUBLIC_SITE_ORIGIN` is the only canonical origin. Production validation rejects chatgpt.site and localhost. Sitemap, robots, canonical, hreflang, Open Graph, X metadata and JSON-LD derive from the same origin.

Locale routes are `/ko`, `/en`, `/zh`, and `/ja`; direct locale entry must not be redirected according to browser language. The server response must render `<html lang="ko|en|zh-CN|ja">` before hydration. Root `/` redirects to `/ko`.

Only meaningful home, area, airport, insights, business and methodology pages enter the sitemap. Flight rows, filter states, search queries and archived build documents are not indexable pages. Technical Work documents live under `docs/` in the repository, not under public web assets.

After the custom domain is connected: verify apex/www redirect, submit `/sitemap.xml` to Google Search Console and Bing Webmaster, inspect four locale pages, and monitor indexed pages, impressions, CTR, landing pages and Core Web Vitals.
