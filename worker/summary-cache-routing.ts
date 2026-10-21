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

/** Public bounded reads served through the existing cached entrypoint. */
export const SUMMARY_CACHE_PATH = "/api/live/summary";
export const DUTY_FREE_CACHE_PATH = "/api/live/duty-free-exchange";
/**
 * The flight record of one KST day. Measured 2026-10-14 (measure-read-budget
 * scope "usage", run 38517413513): one uncached call reads 1,111 D1 rows, the
 * glance home, airport screen and flight board ask for it on open and every
 * two minutes while visible, and before this it reached D1 every time.
 * The route's own header decides storability: 120 s fresh, capped at KST
 * midnight, and `no-store` for its degraded answer.
 */
export const FLIGHTS_CACHE_PATH = "/api/live/flights";

/** Methods that may be served from a shared cache. */
const CACHEABLE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Note on the query string: Cloudflare's default cache key includes the full
 * path *and* query string. That is what keeps `?date=2026-09-01` and
 * `?date=2026-09-02` on separate cache entries. Never normalize, strip or
 * reorder the query HERE — this file only decides whether a request is
 * cacheable. The one place that reduces the query is
 * `worker/summary-cache-key.ts`, which keeps `date` and `month` exactly as given
 * and drops only what the route ignores.
 */
export function shouldRouteToSummaryCache(method: string, pathname: string): boolean {
  if (!CACHEABLE_METHODS.has(method.toUpperCase())) return false;
  return pathname === SUMMARY_CACHE_PATH || pathname === DUTY_FREE_CACHE_PATH || pathname === "/api/live/duty-free-exchange/monthly" || pathname === FLIGHTS_CACHE_PATH;
}
