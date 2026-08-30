/**
 * Manual, bounded, one-shot import of verified sources into D1.
 *
 * This is NOT the recurring production collector. It runs only from the
 * workflow_dispatch-only import workflow, requires the literal confirmation
 * value IMPORT, executes each selected collector exactly once with bounded
 * request/row counts, and never schedules anything.
 *
 * The recurring scheduler (.github/workflows/collect-production.yml) stays
 * gated behind ENABLE_PRODUCTION_COLLECTOR and separate owner approval.
 */
import { readFileSync } from "node:fs";
import { collectAirportFlightsToday } from "../lib/airport-today";
import {
  collectAirportCongestion,
  collectAirportFlightEnrichment,
  collectAirportFlights,
  collectScheduledAirportFlights,
  collectEstimatedSales,
  collectSeoulForeignPresence,
  collectSeoulRealtime,
  collectTourismEvents,
  collectWeatherForecasts,
} from "../lib/collector";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";

if (process.env.RPK_ONESHOT_CONFIRM !== "IMPORT") {
  throw new Error("oneshot_not_confirmed: set the confirm input to IMPORT");
}

const wranglerConfig = JSON.parse(readFileSync(new URL("../wrangler.production.jsonc", import.meta.url), "utf8")) as {
  account_id: string;
  env: Record<string, { d1_databases: Array<{ database_id: string }> }>;
};

const stage = process.env.RPK_ONESHOT_STAGE?.trim() || "production";
const databaseId = wranglerConfig.env[stage]?.d1_databases?.[0]?.database_id;
if (!databaseId || databaseId.startsWith("00000000")) throw new Error(`oneshot_stage_unavailable_${stage}`);

// Prefer the least-privilege dedicated write token when configured; the
// deploy token already carries D1 edit rights as a fallback.
const apiToken = process.env.CLOUDFLARE_D1_WRITE_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!apiToken) throw new Error("missing_cloudflare_api_token");

// The account is always the pinned wrangler config value: the historical
// CLOUDFLARE_ACCOUNT_ID secret pointed at the wrong account (see PR #12),
// which surfaces here as d1_http_403.
const restDatabase = new CloudflareD1RestDatabase(
  wranglerConfig.account_id,
  databaseId,
  apiToken,
);
const database = restDatabase as unknown as D1Database;

const env = {
  DB: database,
  DATA_GO_KR_SERVICE_KEY: process.env.DATA_GO_KR_SERVICE_KEY?.trim() || undefined,
  SEOUL_OPEN_DATA_KEY: process.env.SEOUL_OPEN_DATA_KEY?.trim() || undefined,
};

type OneShotResult = {
  status: string;
  records: number;
  trackedToday?: number;
  pagesFetched?: number;
};

type A1VerificationSnapshot = {
  targetDateKst: string;
  windowStartKst: string;
  counts: Record<string, number>;
  duplicateGroups: number;
  futureFlights: number;
};

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function targetDateKst(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

async function readA1VerificationSnapshot(targetDate: string): Promise<A1VerificationSnapshot> {
  const windowStart = shiftIsoDate(targetDate, -3);
  const [countsResult, duplicatesResult, futureResult] = await restDatabase.execute([
    {
      sql: `SELECT substr(scheduled_at, 1, 10) AS service_date,
                   COUNT(DISTINCT physical_flight_id) AS physical_flights
            FROM airport_flights
            WHERE source_id = ? AND direction = 'departure'
              AND substr(scheduled_at, 1, 10) BETWEEN ? AND ?
            GROUP BY substr(scheduled_at, 1, 10)
            ORDER BY service_date`,
      params: ["INCHEON_FLIGHT_DETAIL", windowStart, targetDate],
    },
    {
      sql: `SELECT COUNT(*) AS duplicate_groups FROM (
              SELECT physical_flight_id
              FROM airport_flights
              WHERE source_id = ? AND direction = 'departure'
                AND substr(scheduled_at, 1, 10) BETWEEN ? AND ?
              GROUP BY physical_flight_id
              HAVING COUNT(*) > 1
            )`,
      params: ["INCHEON_FLIGHT_DETAIL", windowStart, targetDate],
    },
    {
      sql: `SELECT COUNT(DISTINCT physical_flight_id) AS future_flights
            FROM airport_flights
            WHERE source_id = ? AND direction = 'departure'
              AND substr(scheduled_at, 1, 10) > ?`,
      params: ["INCHEON_FLIGHT_DETAIL", targetDate],
    },
  ]);
  const countRows = (countsResult.results ?? []) as Array<{ service_date?: unknown; physical_flights?: unknown }>;
  const duplicateRow = (duplicatesResult.results?.[0] ?? {}) as { duplicate_groups?: unknown };
  const futureRow = (futureResult.results?.[0] ?? {}) as { future_flights?: unknown };
  return {
    targetDateKst: targetDate,
    windowStartKst: windowStart,
    counts: Object.fromEntries(countRows.map((row) => [String(row.service_date), Number(row.physical_flights ?? 0)])),
    duplicateGroups: Number(duplicateRow.duplicate_groups ?? 0),
    futureFlights: Number(futureRow.future_flights ?? 0),
  };
}

const collectors: Record<string, () => Promise<OneShotResult>> = {
  seoul_realtime: () => collectSeoulRealtime(env),
  seoul_foreign: () => collectSeoulForeignPresence(env),
  seoul_sales: () => collectEstimatedSales(env),
  weather: () => collectWeatherForecasts(env),
  events: () => collectTourismEvents(env),
  airport_congestion: () => collectAirportCongestion(env),
  airport_flights: () => collectAirportFlights(env),
  airport_flights_today: () => collectAirportFlightsToday(env),
  airport_flight_enrichment: () => collectAirportFlightEnrichment(env),
  airport_scheduled: () => collectScheduledAirportFlights(env),
};

const requested = (process.env.RPK_ONESHOT_SOURCES ?? "seoul_realtime,seoul_sales")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const unknown = requested.filter((name) => !collectors[name]);
if (unknown.length) throw new Error(`unknown_sources_${unknown.join("_")}`);
if (!requested.length) throw new Error("no_sources_selected");

let failures = 0;
for (const name of requested) {
  try {
    const a1TargetDate = name === "airport_flights_today" ? targetDateKst() : null;
    const a1Before = a1TargetDate ? await readA1VerificationSnapshot(a1TargetDate) : null;
    if (a1Before) console.log(JSON.stringify({ a1Verification: "before", ...a1Before }));
    const result = await collectors[name]();
    console.log(JSON.stringify({
      oneshot: name,
      stage,
      status: result.status,
      changedRows: result.records,
      ...(result.trackedToday === undefined ? {} : { trackedToday: result.trackedToday }),
      ...(result.pagesFetched === undefined ? {} : { pagesFetched: result.pagesFetched }),
    }));
    if (a1TargetDate && a1Before) {
      const a1After = await readA1VerificationSnapshot(a1TargetDate);
      console.log(JSON.stringify({
        a1Verification: "after",
        ...a1After,
        previousCounts: a1Before.counts,
        futureFlightsDelta: a1After.futureFlights - a1Before.futureFlights,
      }));
    }
    if (result.status === "ERROR" || result.status === "NEEDS_KEY") failures += 1;
  } catch (error) {
    // One failing source (for example a D1 auth problem surfacing on write)
    // must not abort the remaining selected sources.
    console.log(JSON.stringify({ oneshot: name, stage, status: "ERROR", detail: error instanceof Error ? error.message.slice(0, 200) : "collector_error" }));
    failures += 1;
  }
}
if (failures === requested.length) process.exitCode = 1;
