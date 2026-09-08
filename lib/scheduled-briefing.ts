import { summarizeAirlineRanking, type AirlineLookupFn } from './airline-ranking';

export interface ScheduledBriefingRow {
  terminal: string | null;
  operatingFlight: string | null;
  scheduledTime: string;
  weekdays: string;
  validFrom: string;
  validTo: string;
  retrievedAt: string;
}

/** A3 is a partial schedule, never observed operations or a whole-day total. */
export function summarizeScheduledBriefing(rows: ScheduledBriefingRow[], date: string, lookup: AirlineLookupFn, basis: 'PARTIAL_SCHEDULE' | 'OFFICIAL_DEPARTURE_SCHEDULE' = 'PARTIAL_SCHEDULE') {
  const weekday = ['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date(`${date}T00:00:00Z`).getUTCDay()];
  const selected = new Map<string, ScheduledBriefingRow>();
  for (const row of rows.slice(0, 2000)) {
    if (row.validFrom > date || row.validTo < date || !row.operatingFlight) continue;
    let days: unknown;
    try { days = JSON.parse(row.weekdays); } catch { continue; }
    if (!Array.isArray(days) || !days.includes(weekday)) continue;
    const key = JSON.stringify([row.terminal, row.operatingFlight, row.scheduledTime]);
    const prior = selected.get(key);
    if (!prior || row.retrievedAt > prior.retrievedAt) selected.set(key, row);
  }
  const flights = [...selected].map(([physicalFlightId, row]) => ({...row, physicalFlightId}));
  const ranking = summarizeAirlineRanking(flights, lookup, 10);
  const scopes = [...new Set(flights.map(row => row.terminal))];
  const scheduled = scopes.map(terminal => {
    const scoped = flights.filter(row => row.terminal === terminal);
    return { terminal, flights: scoped.length, firstTime: scoped.map(row=>row.scheduledTime).sort()[0], lastTime: scoped.map(row=>row.scheduledTime).sort().at(-1)!, retrievedAt: scoped.map(row=>row.retrievedAt).sort().at(-1)! };
  });
  return { serviceDateKst: date, basis, capped: rows.length > 2000, ranking, scheduled };
}
