/**
 * The public read of A6 monthly passenger statistics (lib/airport-monthly-stats.ts
 * writes them). Kept apart from the collector so the Worker route and the page
 * never bundle the provider client.
 */
export type AirportStatsOperationId = "ROUTE_COUNTRY_PASSENGERS" | "TIME_BAND_PASSENGERS";

export interface AirportStatsRow {
  /** The provider's own label: a country name or a time band, as published. */
  label: string;
  region: string | null;
  arrivals: number | null;
  departures: number | null;
  /** The provider's own total field; never computed here. */
  total: number | null;
  /** A provider total/subtotal row: use it or its parts, never both. */
  aggregate: boolean;
  /** Time bands only, when the label reads unambiguously. */
  startHour: number | null;
  endHour: number | null;
}

export interface AirportStatsMonth {
  operationId: AirportStatsOperationId;
  /** YYYY-MM, the month the request asked for. */
  month: string;
  rows: AirportStatsRow[];
  retrievedAt: string;
}

function previousMonthOf(month: string): string {
  const [year, value] = month.split("-").map(Number);
  const index = year * 12 + value - 2;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The stored month at or before `month`, and the month before it, for one public read. */
export async function readAirportMonthlyStats(db: Pick<D1Database, "prepare">, month: string): Promise<{
  month: string | null;
  previousMonth: string | null;
  current: Partial<Record<AirportStatsOperationId, AirportStatsMonth>>;
  previous: Partial<Record<AirportStatsOperationId, AirportStatsMonth>>;
  rowsRead: number;
}> {
  // Primary-key range: at most two months per operation, newest first.
  const result = await db.prepare(`SELECT operation_id AS operationId, month, payload, retrieved_at AS retrievedAt
      FROM airport_monthly_stats WHERE month <= ? ORDER BY month DESC, operation_id LIMIT 4`)
    .bind(month)
    .all<{ operationId: AirportStatsOperationId; month: string; payload: string; retrievedAt: string }>();
  if (result.success === false) throw new Error("AIRPORT_MONTHLY_STATS_READ_FAILED");
  const rows = result.results ?? [];
  const months = [...new Set(rows.map((row) => row.month))].sort().reverse();
  const pick = (target: string | undefined) => Object.fromEntries(rows.filter((row) => row.month === target).flatMap((row) => {
    try {
      const payload = JSON.parse(row.payload) as { rows?: AirportStatsRow[] };
      return Array.isArray(payload.rows) ? [[row.operationId, { operationId: row.operationId, month: row.month, rows: payload.rows, retrievedAt: row.retrievedAt }]] : [];
    } catch {
      return [];
    }
  })) as Partial<Record<AirportStatsOperationId, AirportStatsMonth>>;
  const current = months[0];
  // The previous month only when it is the calendar month right before, so a gap is never compared across.
  const expectedPrevious = current ? previousMonthOf(current) : undefined;
  const previous = months[1] === expectedPrevious ? months[1] : undefined;
  return { month: current ?? null, previousMonth: previous ?? null, current: pick(current), previous: pick(previous), rowsRead: rows.length };
}
