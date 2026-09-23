/**
 * Which API responses a search engine may fetch, and on what terms.
 *
 * The problem this solves
 * ──────────────────────
 * Every page on the site ships its layout in the first HTML and then draws
 * its main content from `/api/live/summary`; the four `/predictions` pages
 * also read `/api/live/predictions`. Googlebot renders pages, and when it
 * renders it obeys robots.txt for the page's own data requests too. With a
 * bare `Disallow: /api/` those requests were refused, so the page Google
 * rendered carried only its chrome and the load-failure message. In
 * September 2026 Search Console reported four of those pages as Soft 404.
 *
 * The fix is the pattern Google documents for rendering data: let the
 * crawler fetch the responses a page needs, and keep those responses out of
 * the index with `X-Robots-Tag: noindex` — a robots.txt block cannot do both,
 * because a URL the crawler may not fetch is also a URL it cannot render
 * with. Every other `/api/` path (writes, health, diagnostics) stays
 * disallowed.
 *
 * Kept outside `app/` so robots.txt, the two route handlers and the
 * discoverability check all read the same list; it cannot drift between the
 * rule that permits a path and the check that verifies it.
 */

/**
 * The read-only APIs a sitemap page fetches to render its main content.
 *
 * Verified 2026-09-23 by loading all 52 sitemap URLs in a browser and
 * recording every `/api/` request made on first view: `/api/live/summary`
 * by all 52, `/api/live/predictions` by the four `/predictions` pages, and
 * nothing else.
 */
export const crawlableContentApis = ["/api/live/summary", "/api/live/predictions"] as const;

// Anchor the endpoint and separately permit query strings. A bare prefix
// would also expose /summary-internal or /predictions/debug in the future.
export const contentApiAllowRules = crawlableContentApis.flatMap(path => [`${path}$`, `${path}?`]);

/** Lets a crawler render with the response while never listing it as a result. */
export const CONTENT_API_ROBOTS_TAG = "noindex";
