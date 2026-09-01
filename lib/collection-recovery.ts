/**
 * Temporal self-healing for the scheduled collectors.
 *
 * The problem this solves
 * ──────────────────────
 * Provider endpoints (data.go.kr / Incheon / KMA) intermittently fail with
 * UND_ERR_CONNECT_TIMEOUT. A4 realtime survives that because another cycle
 * runs 15 minutes later. A5 runs once an hour (:42) and weather runs once per
 * KMA issuance (:10), so for those two a short outage costs an ENTIRE
 * collection opportunity even when the provider recovers minutes later —
 * which is exactly how production ended up serving an A5 forecast collected
 * at 08:42 at 14:33.
 *
 * The fix is a second, short recovery window rather than a longer retry loop
 * inside one job: retries inside a run cannot outlive the run, and making
 * them long enough to would burn an Actions runner sitting idle.
 *
 * What a recovery run is allowed to do
 * ────────────────────────────────────
 *  1. Read Production D1 FIRST.
 *  2. If the required coverage is already healthy → make ZERO provider
 *     requests and report SKIPPED_ALREADY_HEALTHY.
 *  3. Otherwise request ONLY what is missing — one selectdate, one grid —
 *     never a blind repeat of the whole primary cycle.
 *
 * This module only decides. It performs no provider calls and no writes, so
 * the decision is unit-testable against a fake D1 without a network.
 */
import { uniqueKmaGrids } from "./areas";
import { latestKmaIssuance } from "./collector";
import { summarizeTodayPassengerForecast, type AirportForecastAggregateRow } from "./airport-today-summary";

/** Reported when a recovery run finds nothing to repair. Never a failure. */
export const SKIPPED_ALREADY_HEALTHY = "SKIPPED_ALREADY_HEALTHY";

/** PRIMARY is the scheduled collection; RECOVERY is the later repair window. */
export type CollectionMode = "PRIMARY" | "RECOVERY";

/** A5 query parameter: 0 = today, 1 = tomorrow. */
export type ForecastSelectdate = "0" | "1";

/**
 * How recently the data must have been fetched to count as "this cycle's".
 *
 * A5's primary runs hourly, so anything retrieved within the last hour came
 * from the current cycle and needs no repair. Older than that means the
 * primary missed its slot, which is precisely what recovery exists for.
 * Coverage alone is not enough: a full-day forecast collected six hours ago
 * is COMPLETE and still stale, and the provider revises its numbers.
 */
export const FORECAST_FRESH_WITHIN_MS = 60 * 60_000;

export interface ForecastDayHealth {
  selectdate: ForecastSelectdate;
  targetDate: string;
  coverage: string;
  retrievedAt: string | null;
  healthy: boolean;
}

export interface ForecastRecoveryPlan {
  /** Only the days that actually need re-requesting. Empty means healthy. */
  missingSelectdates: ForecastSelectdate[];
  days: ForecastDayHealth[];
  /** True when D1 already holds usable rows, so a failed repair loses nothing. */
  hasUsableLastGood: boolean;
}

export interface WeatherGrid {
  nx: number;
  ny: number;
  areas: string[];
}

export interface WeatherRecoveryPlan {
  /** Only the grid cells with no usable row for the expected issuance. */
  missingGrids: WeatherGrid[];
  issuedAt: string;
  baseDate: string;
  baseTime: string;
  hasUsableLastGood: boolean;
}

type Row = Record<string, unknown>;

async function allRows(db: D1Database | undefined, sql: string, binds: unknown[]): Promise<Row[]> {
  if (!db) return [];
  try {
    const result = await db.prepare(sql).bind(...binds).all<Row>();
    return result.results ?? [];
  } catch {
    // A read failure must never be mistaken for "nothing is stored" — that
    // would make a recovery run request everything. The callers treat an
    // empty read as unhealthy, so the recovery still runs, but bounded.
    return [];
  }
}

/** The KST calendar day `offsetDays` from now, as YYYY-MM-DD. */
export function kstDayFrom(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + 9 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** The issuance identifier the weather rows carry, e.g. 2026-09-01T14:00:00+09:00. */
export function expectedWeatherIssuedAt(now: Date): { issuedAt: string; baseDate: string; baseTime: string } {
  const { baseDate, baseTime } = latestKmaIssuance(now);
  const issuedAt = `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6, 8)}T${baseTime.slice(0, 2)}:${baseTime.slice(2, 4)}:00+09:00`;
  return { issuedAt, baseDate, baseTime };
}

/**
 * Decides which A5 days a recovery run must re-request.
 *
 * Required coverage is unchanged from the product contract: today AND
 * tomorrow, each COMPLETE across both T1 and T2 (see
 * summarizeTodayPassengerForecast — `coverage.all` is COMPLETE only when both
 * terminals are complete on a matching band grid). A day that is complete but
 * was collected before this cycle counts as missing, because the primary run
 * that should have refreshed it did not happen.
 */
export async function planForecastRecovery(db: D1Database | undefined, now: Date): Promise<ForecastRecoveryPlan> {
  const freshFrom = now.getTime() - FORECAST_FRESH_WITHIN_MS;
  const days: ForecastDayHealth[] = [];
  let anyStoredRow = false;

  for (const selectdate of ["0", "1"] as const) {
    const targetDate = kstDayFrom(now, selectdate === "0" ? 0 : 1);
    const rows = await allRows(
      db,
      `SELECT terminal, direction, is_aggregate AS isAggregate, target_date AS targetDate,
         time_band_raw AS timeBandRaw, target_start_at AS targetStartAt,
         target_end_at AS targetEndAt, expected_passengers AS expectedPassengers,
         retrieved_at AS retrievedAt
       FROM airport_passenger_forecast
       WHERE direction = 'departure' AND is_aggregate = 1 AND target_date = ?
       ORDER BY target_start_at, terminal LIMIT 96`,
      [targetDate],
    );
    if (rows.length) anyStoredRow = true;
    const summary = summarizeTodayPassengerForecast(rows as unknown as AirportForecastAggregateRow[], targetDate);
    const retrievedAt = summary.retrievedAt;
    const fresh = Boolean(retrievedAt) && Date.parse(retrievedAt!) >= freshFrom;
    days.push({
      selectdate,
      targetDate,
      coverage: summary.coverage.all,
      retrievedAt,
      healthy: summary.coverage.all === "COMPLETE" && fresh,
    });
  }

  return {
    missingSelectdates: days.filter((day) => !day.healthy).map((day) => day.selectdate),
    days,
    hasUsableLastGood: anyStoredRow,
  };
}

/**
 * Decides which KMA grid cells a recovery run must re-request.
 *
 * A grid is healthy when every product area it covers already has at least
 * one row for the issuance the collector would ask for right now. Nothing is
 * re-requested on a grid that already stored that issuance, so a recovery run
 * after a fully successful primary costs zero provider requests.
 */
export async function planWeatherRecovery(db: D1Database | undefined, now: Date): Promise<WeatherRecoveryPlan> {
  const { issuedAt, baseDate, baseTime } = expectedWeatherIssuedAt(now);
  const rows = await allRows(
    db,
    `SELECT area, COUNT(*) AS rowCount FROM weather_forecast WHERE issued_at = ? GROUP BY area`,
    [issuedAt],
  );
  const storedAreas = new Set(
    rows.filter((row) => Number(row.rowCount ?? 0) > 0).map((row) => String(row.area ?? "")),
  );
  const anyStored = await allRows(db, `SELECT 1 AS present FROM weather_forecast LIMIT 1`, []);

  const missingGrids = uniqueKmaGrids().filter((grid) => grid.areas.some((area) => !storedAreas.has(area)));
  return {
    missingGrids: missingGrids.map((grid) => ({ nx: grid.nx, ny: grid.ny, areas: [...grid.areas] })),
    issuedAt,
    baseDate,
    baseTime,
    hasUsableLastGood: anyStored.length > 0,
  };
}

/** Compact, secret-free description of what a plan decided. Safe to log. */
export function describeForecastPlan(plan: ForecastRecoveryPlan): string {
  const days = plan.days
    .map((day) => `${day.targetDate}=${day.coverage}${day.healthy ? "/fresh" : "/stale"}`)
    .join(" ");
  return `missingSelectdates=${plan.missingSelectdates.join(",") || "none"}; ${days}`;
}

export function describeWeatherPlan(plan: WeatherRecoveryPlan): string {
  const grids = plan.missingGrids.map((grid) => `${grid.nx},${grid.ny}`).join(" ") || "none";
  return `issuance=${plan.baseDate}${plan.baseTime}; missingGrids=${grids}`;
}
