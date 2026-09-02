/**
 * Which requests the uncached gateway hands to the cached named entrypoint.
 *
 * Cloudflare's Workers Caching sits in front of an *entrypoint*, not a route,
 * so the routing decision is what decides the blast radius. It is kept here,
 * free of any Worker or vinext import, so the rule can be asserted directly in
 * tests rather than inferred from a deployed bundle.
 *
 * The rule is deliberately the narrowest one that still protects D1:
 * an exact path match, and only safe methods. Anything else — a write, a
 * health probe, a nested path, a trailing slash — stays on the uncached
 * default entrypoint and reaches the application exactly as it does today.
 */

/** The single path served through the cached entrypoint. */
export const SUMMARY_CACHE_PATH = "/api/live/summary";

/** Methods that may be served from a shared cache. */
const CACHEABLE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Note on the query string: the request is forwarded unchanged, and
 * Cloudflare's default cache key includes the full path *and* query string.
 * That is what keeps `?date=2026-09-01` and `?date=2026-09-02` on separate
 * cache entries. Never normalize, strip or reorder the query here — doing so
 * would collapse two different service dates onto one cached body.
 */
export function shouldRouteToSummaryCache(method: string, pathname: string): boolean {
  if (!CACHEABLE_METHODS.has(method.toUpperCase())) return false;
  return pathname === SUMMARY_CACHE_PATH;
}
