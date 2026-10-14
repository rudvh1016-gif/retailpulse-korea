/**
 * Which source problems make an open page re-check the summary sooner.
 *
 * An open page re-checks `/api/live/summary` every 5 minutes, or every 2
 * minutes while the summary is partial (app/live-summary.tsx). Each re-check
 * past the edge copy's 60-second freshness runs the whole summary read again
 * (about 5,900 D1 rows; read-budget run 38518409619, 2026-10-14).
 *
 * Looking again sooner only helps when the problem can be repaired before the
 * next normal re-check. That is true of the sources collected within the hour:
 * realtime crowd and departure congestion every 15 minutes, the A5 passenger
 * forecast hourly with a recovery window, KMA weather per issuance with two
 * recovery windows. A source collected once a day or less cannot change
 * between two re-checks, yet its ERROR alone kept every open page on the
 * 2-minute cadence: KASI_PUBLIC_HOLIDAYS (HTTP 403) and SEOUL_ESTIMATED_SALES
 * (weekly, last attempt 2026-10-04) were the only sources in ERROR on the
 * public summary on 2026-10-14 (Production Site Smoke run 38520165375).
 *
 * The status a page shows is unchanged: a daily source in ERROR is still
 * reported as ERROR. Only how soon the page asks again changes.
 *
 * The set mirrors the sub-hourly `nextScheduledSlotBehavior` rows of
 * lib/recovery-capability.ts; tests/summary-recheck.test.ts keeps them equal,
 * so a source whose schedule changes cannot drift silently. It is a literal
 * here so the browser bundle does not carry the recovery matrix.
 */
export const FAST_RECHECK_SOURCE_IDS: ReadonlySet<string> = new Set([
  'INCHEON_DEPARTURE_CONGESTION',
  'INCHEON_DEPARTURE_CONGESTION_T2',
  'INCHEON_PASSENGER_FORECAST',
  'KMA_VILAGE_FCST',
  'SEOUL_CITYDATA_CMRCL',
  'SEOUL_CITYDATA_PPLTN',
]);

const PROBLEM_STATUSES: ReadonlySet<string> = new Set(['ERROR', 'DEGRADED', 'MISSING']);

/** True when this source's problem justifies the 2-minute re-check. */
export function shortensSummaryRecheck(source: { sourceId?: string | null; status?: string | null }): boolean {
  return FAST_RECHECK_SOURCE_IDS.has(source.sourceId ?? '') && PROBLEM_STATUSES.has(source.status ?? '');
}
