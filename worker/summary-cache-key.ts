/**
 * The cache key of `GET /api/live/summary`, reduced to what changes the answer.
 *
 * Cloudflare's default key for a cached entrypoint is the full path *and* query
 * string, so every distinct meaningless query (`?x=1`, `?x=2`, `?_=<timestamp>`)
 * became its own cache entry and ran the whole D1 batch again. Ordinary summaries use:
 *
 *   date   a real KST calendar day; anything else means "today"
 *   month  a real YYYY-MM month for the date picker; anything else means the
 *          month of the service date
 *
 * Monthly records (`view=records`) instead use area and month. That branch has
 * a separate key and preserves invalid input as invalid so the route still returns 400.
 * Other parameters are ignored and can only multiply cache entries.
 * This module keeps the parameters that change the response, in
 * one fixed order, with the value the route would actually use, and drops the
 * rest. `canonicalSummaryRequest` returns a request that is already in that
 * form untouched and re-addresses any other one to the canonical URL.
 *
 * What this does NOT do: `date` and `month` remain real, response-changing
 * conditions and each distinct valid value still has its own entry. This bounds
 * accidental and trivial cache misses; it is not a rate limit.
 *
 * Like `summary-cache-routing.ts` this file has no Worker or vinext import so
 * the rule can be asserted directly in tests. The validity rules mirror
 * `app/api/live/summary/route.ts` (`isValidKstDay`, `availabilityPeriod`);
 * `tests/summary-cache-key.test.mjs` runs the real route on the original and the
 * reduced URL and requires the same answer.
 */
import { isValidKstDay } from "../lib/kst";
import { RECORD_AREAS } from '../lib/monthly-records';

/** A month the route would use as given (`availabilityPeriod` accepts exactly these). */
function validMonth(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}$/.test(value) && isValidKstDay(`${value}-01`) ? value : null;
}

/**
 * The URL the cached entrypoint is asked for.
 *
 * `searchParams.get` returns the FIRST occurrence, exactly as the route reads it,
 * so `?date=bad&date=2026-09-01` is "today" here just as it is in the route.
 */
export function canonicalSummaryUrl(url: URL): string {
  if (url.searchParams.get('view') === 'records') {
    const query = new URLSearchParams({ view: 'records' });
    const area = url.searchParams.get('area') ?? '';
    query.set('area', RECORD_AREAS.includes(area as typeof RECORD_AREAS[number]) ? area : 'invalid');
    const rawMonth = url.searchParams.get('month');
    // Invalid selections must still receive 400, never become a valid current-month read.
    if (rawMonth !== null) query.set('month', validMonth(rawMonth) ?? 'invalid');
    return `${url.origin}${url.pathname}?${query}`;
  }
  const date = url.searchParams.get("date");
  const month = validMonth(url.searchParams.get("month"));
  const query = new URLSearchParams();
  if (isValidKstDay(date)) query.set("date", date);
  if (month) query.set("month", month);
  const text = query.toString();
  return `${url.origin}${url.pathname}${text ? `?${text}` : ""}`;
}

/**
 * The request handed to the cached entrypoint: the original object when it is
 * already in canonical form (all real client traffic is), otherwise a request
 * with the same method and headers addressed to the canonical URL. Only GET and
 * HEAD reach here (worker/summary-cache-routing.ts), so there is no body to carry.
 *
 * `Authorization` is dropped on the way: Workers Cache does not serve or store
 * a request that carries it, and this route is public and reads no header, so
 * the header could only turn a cacheable read into a full D1 batch. This is the
 * outer-entrypoint step Cloudflare's gateway pattern describes; the rest of the
 * headers are kept as they are.
 */
export function canonicalSummaryRequest(request: Request, url: URL): Request {
  const canonical = canonicalSummaryUrl(url);
  if (canonical === url.href && !request.headers.has("authorization")) return request;
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  return new Request(canonical, { method: request.method, headers });
}
