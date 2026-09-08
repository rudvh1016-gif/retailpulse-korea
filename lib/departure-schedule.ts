import type { CanonicalAirportFlight } from './source-adapters';
import { runD1Batches, NO_D1_WRITES } from './d1-write-counts';
import type { ScheduledBriefingRow } from './scheduled-briefing';

type ScheduleFlight = { physicalFlightId: string; terminal: string | null; operatingFlight: string; scheduledTime: string };

/** Reuse the already-fetched A1 population; never put future schedules in actual history. */
export async function persistDepartureSchedule(db: D1Database | undefined, date: string, records: CanonicalAirportFlight[]) {
  if (!db || !records.length) return NO_D1_WRITES;
  if (records.length > 2000) throw new Error('departure_schedule_population_bound');
  const rows: ScheduleFlight[] = records.map(r => ({ physicalFlightId: r.physicalFlightId, terminal: r.terminal,
    operatingFlight: r.masterFlightNumber || r.flightNumber, scheduledTime: r.scheduledAt.slice(11,16) }))
    .sort((a,b) => a.physicalFlightId.localeCompare(b.physicalFlightId));
  const payload = JSON.stringify(rows);
  if (payload.length > 500_000) throw new Error('departure_schedule_payload_bound');
  // One atomic date snapshot removes cancelled/withdrawn rows on a successful rescan.
  // An empty/failed provider scan never erases the last good snapshot.
  return runD1Batches(db, [db.prepare(`INSERT INTO airport_departure_schedule (service_date,payload,retrieved_at)
    VALUES (?,?,?) ON CONFLICT(service_date) DO UPDATE SET payload=excluded.payload,retrieved_at=excluded.retrieved_at
    WHERE airport_departure_schedule.payload <> excluded.payload`).bind(date,payload,records[0].retrievedAt),
    db.prepare('DELETE FROM airport_departure_schedule WHERE service_date < ?').bind(date)]);
}

export function readDepartureSchedule(snapshot: { payload?: unknown; retrievedAt?: unknown } | undefined, date: string): ScheduledBriefingRow[] {
  if (typeof snapshot?.payload !== 'string' || snapshot.payload.length > 500_000 || typeof snapshot.retrievedAt !== 'string') return [];
  try {
    const rows: unknown = JSON.parse(snapshot.payload);
    if (!Array.isArray(rows) || !rows.length || rows.length > 2000) return [];
    if (!rows.every(r => r && typeof r.physicalFlightId === 'string' && typeof r.operatingFlight === 'string' &&
      (r.terminal === null || typeof r.terminal === 'string') && typeof r.scheduledTime === 'string' && /^\d{2}:\d{2}$/.test(r.scheduledTime))) return [];
    const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(`${date}T00:00:00Z`).getUTCDay()];
    return rows.map(r => ({ ...r, weekdays: JSON.stringify([weekday]), validFrom: date, validTo: date, retrievedAt: snapshot.retrievedAt as string }));
  } catch { return []; }
}
