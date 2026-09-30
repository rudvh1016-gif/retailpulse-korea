/**
 * A cache key nobody has used, for probes that must read what THIS build emits
 * instead of a copy the edge already holds.
 *
 * `/api/live/summary` used to give every distinct query string its own edge
 * entry, so probes appended `?cacheProbe=<time>`. The gateway now drops every
 * parameter the route does not read (worker/summary-cache-key.ts), so such a
 * probe lands on the shared entry and no longer tests anything. A cold key has
 * to be a real one: `month` is a real, response-changing parameter (it selects
 * the date picker's calendar month), and a month far from today (any of the
 * 1,200 months from 2000-01 to 2099-12) changes nothing else in the answer.
 */
export function coldSummaryMonth(seed: number): string {
  const n = Math.abs(Math.floor(seed));
  const year = 2000 + (Math.floor(n / 12) % 100);
  const month = 1 + (n % 12);
  return `${year}-${String(month).padStart(2, "0")}`;
}
