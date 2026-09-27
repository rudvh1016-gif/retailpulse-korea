import type { CanonicalAirportFlight } from './source-adapters';
import { runD1Batches, NO_D1_WRITES } from './d1-write-counts';
import type { ScheduledBriefingRow } from './scheduled-briefing';
import { isValidKstDay } from './kst';

type ScheduleFlight = { physicalFlightId: string; terminal: string | null; operatingFlight: string; scheduledTime: string;
  airlineCode?: string | null; airportCode?: string | null; gate?: string | null; checkinCounter?: string | null; status?: string };
export type ScheduledDepartureRow = ScheduledBriefingRow & ScheduleFlight;

function schedulePayload(date: string, records: CanonicalAirportFlight[]): string {
  if (!isValidKstDay(date) || records.some(r => r.scheduledAt.slice(0,10) !== date)) throw new Error('departure_schedule_date_mismatch');
  if (records.length > 2000) throw new Error('departure_schedule_population_bound');
  const unique = new Map(records.map(r => [r.physicalFlightId, r]));
  const rows: ScheduleFlight[] = [...unique.values()].filter(r => r.status !== 'cancelled').map(r => ({ physicalFlightId: r.physicalFlightId, terminal: r.terminal,
    operatingFlight: r.masterFlightNumber || r.flightNumber, scheduledTime: r.scheduledAt.slice(11,16),
    airlineCode: r.airlineCode ?? null, airportCode: r.airportCode ?? null, gate: r.gate ?? null, checkinCounter: r.checkinCounter ?? null, status: r.status ?? 'unknown' }))
    .sort((a,b) => a.physicalFlightId.localeCompare(b.physicalFlightId));
  const payload = JSON.stringify(rows);
  if (new TextEncoder().encode(payload).byteLength > 500_000) throw new Error('departure_schedule_payload_bound');
  return payload;
}

function scheduleStatement(db: D1Database, date: string, payload: string, retrievedAt: string) {
  return db.prepare(`INSERT INTO airport_departure_schedule (service_date,payload,retrieved_at)
    VALUES (?,?,?) ON CONFLICT(service_date) DO UPDATE SET payload=excluded.payload,retrieved_at=excluded.retrieved_at
    WHERE airport_departure_schedule.payload <> excluded.payload`).bind(date,payload,retrievedAt);
}

/** Replace one known date; never remove another still-future date. */
export async function persistDepartureSchedule(db: D1Database | undefined, date: string, records: CanonicalAirportFlight[]) {
  if (!db || !records.length) return NO_D1_WRITES;
  return runD1Batches(db, [scheduleStatement(db, date, schedulePayload(date, records), records[0].retrievedAt)]);
}

/** Validate the entire replacement before either history or schedules is written. */
export function prepareDepartureSchedules(db: D1Database | undefined, today: string, records: CanonicalAirportFlight[]) {
  if (!isValidKstDay(today)) throw new Error('departure_schedule_invalid_today');
  const dates = new Map<string, CanonicalAirportFlight[]>();
  for (const record of records) {
    const date = record.scheduledAt.slice(0,10);
    if (!isValidKstDay(date) || date <= today) throw new Error('departure_schedule_not_future');
    const rows = dates.get(date) ?? [];
    rows.push(record);
    dates.set(date, rows);
  }
  // Storage/statement guard, not a claim about the provider's publication horizon.
  if (dates.size > 31 || records.length > 15_000) throw new Error('departure_schedule_dates_bound');
  const snapshots = [...dates].sort(([a],[b]) => a.localeCompare(b)).map(([date, rows]) => ({date, payload: schedulePayload(date, rows), retrievedAt: rows[0].retrievedAt}));
  if (snapshots.reduce((sum, row) => sum + new TextEncoder().encode(row.payload).byteLength, 0) > 3_000_000) throw new Error('departure_schedule_total_payload_bound');
  if (!db) return [];
  const statements = snapshots.map(row => scheduleStatement(db, row.date, row.payload, row.retrievedAt));
  // Dates absent from a proven complete population are withdrawn. Expired
  // schedules are removed here; observed history is an entirely different table.
  statements.push(db.prepare(`DELETE FROM airport_departure_schedule WHERE service_date <= ?${snapshots.length ? ` OR service_date NOT IN (${snapshots.map(() => '?').join(',')})` : ' OR service_date > ?'}`)
    .bind(today, ...(snapshots.length ? snapshots.map(row => row.date) : [today])));
  return statements;
}

/** Called only after a complete A1 population scan. One atomic, changed-only batch. */
export async function persistDepartureSchedules(db: D1Database | undefined, today: string, records: CanonicalAirportFlight[]) {
  const statements = prepareDepartureSchedules(db, today, records);
  return db ? runD1Batches(db, statements) : NO_D1_WRITES;
}

export function readDepartureSchedule(snapshot: { payload?: unknown; retrievedAt?: unknown } | undefined, date: string): ScheduledDepartureRow[] {
  if (!isValidKstDay(date) || typeof snapshot?.payload !== 'string' || snapshot.payload.length > 500_000 || typeof snapshot.retrievedAt !== 'string') return [];
  try {
    const rows: unknown = JSON.parse(snapshot.payload);
    if (!Array.isArray(rows) || !rows.length || rows.length > 2000) return [];
    if (!rows.every(r => r && typeof r.physicalFlightId === 'string' && typeof r.operatingFlight === 'string' &&
      (r.terminal === null || typeof r.terminal === 'string') && typeof r.scheduledTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.scheduledTime))) return [];
    const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(`${date}T00:00:00Z`).getUTCDay()];
    return rows.map(r => ({ ...r, weekdays: JSON.stringify([weekday]), validFrom: date, validTo: date, retrievedAt: snapshot.retrievedAt as string }));
  } catch { return []; }
}
