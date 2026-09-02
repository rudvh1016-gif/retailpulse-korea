/**
 * Edge-cache admission policy for `/api/live/summary`.
 *
 * The summary endpoint answers 200 far more often than it holds real data.
 * `safeAll` deliberately turns a failing statement into an empty list so one
 * broken query cannot take the whole page down — which means a partly dead D1
 * still produces a well-formed `mode: "live-summary"` body with no sources and
 * empty areas. Serving that is acceptable; *caching* it is not. The September
 * D1 incident is the precedent: a single outage payload admitted to a shared
 * edge cache is served to every subsequent visitor for the whole TTL, long
 * after the database itself recovered.
 *
 * So freshness headers are decided by the payload, never by the status code.
 * A response only earns `public` caching when it carries evidence that the
 * database path actually produced data.
 */

/** Fresh window and stale window for an admitted summary. */
export const SUMMARY_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

/**
 * Cloudflare's Workers Cache treats `no-store` as a bypass, so this both stops
 * the edge from storing the payload and stops browsers from reusing it.
 */
export const SUMMARY_NO_STORE = "no-store";

/** The subset of an area object the admission rule needs to see. */
export interface AdmissionArea {
  realtime?: unknown;
  commercial?: unknown;
  foreignPurposeMobility?: unknown;
  subwayRidership?: unknown;
  storeDynamics?: unknown;
  weather?: unknown;
}

export interface SummaryAdmissionInput {
  /** `source_health` rows. Completely absent means the health read failed. */
  sources?: unknown;
  /** Per-area payloads keyed by area id. */
  areas?: Record<string, AdmissionArea | null | undefined>;
}

function hasRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * True when the payload proves the database path produced usable data.
 *
 * Deliberately NOT part of the rule:
 *   - events > 0, which is legitimately zero on a quiet day
 *   - sales != null, which is quarterly and absent between publications
 * Requiring either would refuse to cache a perfectly healthy response.
 */
export function isCacheableSummary(input: SummaryAdmissionInput): boolean {
  if (!hasRows(input.sources)) return false;
  const areas = input.areas;
  if (!areas) return false;
  return Object.values(areas).some((area) => {
    if (!area) return false;
    return area.realtime != null || area.commercial != null || area.foreignPurposeMobility != null
      || area.subwayRidership != null || area.storeDynamics != null || hasRows(area.weather);
  });
}

/** The `cache-control` value a summary response must carry. */
export function summaryCacheControl(input: SummaryAdmissionInput): string {
  return isCacheableSummary(input) ? SUMMARY_CACHE_CONTROL : SUMMARY_NO_STORE;
}
