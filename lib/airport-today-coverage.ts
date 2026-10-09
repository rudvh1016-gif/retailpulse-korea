/** Current-day storage witness + the existing complete-scan marker. Read-only. */
import { hasCompleteA1RecentHistoryToday, kstDate, type A1HistoryReadDatabase } from './airport-today';
import { kstDayOf } from './kst';

export interface AirportTodayCoverageInput {
  nowIso: string;
  hasTodayRows: boolean;
  completeScan: boolean;
  retrievedAt: string | null;
}
export function airportTodayCoverage(input: AirportTodayCoverageInput) {
  const today = kstDate(new Date(input.nowIso));
  // Internal alert grace for the existing 00:07 window (3 x 20 min), not a
  // promise about GitHub dispatch or the provider's publication time.
  const pastGrace = Date.parse(input.nowIso) >= Date.parse(today + 'T01:15:00+09:00');
  const stamp = input.retrievedAt && Number.isFinite(Date.parse(input.retrievedAt)) ? input.retrievedAt : null;
  const currentStamp = !!stamp && kstDayOf(stamp) === today && Date.parse(stamp) <= Date.parse(input.nowIso);
  const state = !input.hasTodayRows ? 'MISSING_TODAY' : !input.completeScan ? 'COMPLETE_SCAN_UNVERIFIED'
    : !currentStamp ? 'OLD_OR_UNVERIFIED_STAMP' : 'CURRENT';
  return { today, state, pastGrace, alert: pastGrace && state !== 'CURRENT', retrievedAt: stamp };
}

interface AirportCoverageDatabase extends A1HistoryReadDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ results?: unknown[] }>;
      first<T = unknown>(): Promise<T | null>;
    };
  };
}

export async function readAirportTodayCoverage(db: AirportCoverageDatabase, nowIso: string) {
  const today = kstDate(new Date(nowIso));
  const [sample, health, completeScan] = await Promise.all([
    db.prepare("SELECT physical_flight_id FROM airport_flights WHERE direction='departure' AND scheduled_at>=? AND scheduled_at<? LIMIT 1")
      .bind(today, today + 'T99').first<{ physical_flight_id: string }>(),
    db.prepare("SELECT last_retrieved_at FROM source_health WHERE source_id=? LIMIT 1")
      .bind('INCHEON_FLIGHT_DETAIL').first<{ last_retrieved_at: string | null }>(),
    hasCompleteA1RecentHistoryToday(db, today),
  ]);
  return airportTodayCoverage({ nowIso, hasTodayRows: !!sample, completeScan, retrievedAt: health?.last_retrieved_at ?? null });
}
