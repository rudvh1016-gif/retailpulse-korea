/**
 * 인천국제공항공사 monthly passenger statistics, collected once a day in the
 * daily Actions group (`airport_monthly_stats`) and stored as one compact row
 * per operation and month.
 *
 *   15095071  ROUTE_COUNTRY_PASSENGERS  passengers grouped by the country of
 *             each flight's route, as the provider defines it
 *   15095070  TIME_BAND_PASSENGERS      passengers per provider time band
 *
 * Both are official monthly results for the whole airport: no T1/T2 split, no
 * forecast, and the country grouping describes routes, not the travellers.
 *
 * Activated 2026-10-15 after the read-only probe (Smoke Public APIs run
 * 38671372057) answered READY for both: 2026-08 returned 58 country rows and
 * 24 time bands whose fields matched the documented contract exactly.
 *
 * Request budget: the latest complete KST month is asked for on every run, so
 * a newly published month or a revision is picked up, plus at most
 * MAX_BACKFILL_PER_OPERATION missing older months inside the kept window.
 * Steady state is 2 requests a day; the first days fill the window 3 months
 * per operation a day. Auth, key, quota and rate answers stop the run's
 * remaining requests at once and are never retried; only a timeout, a
 * connection failure or a 5xx is retried, once (the client's default ceiling).
 *
 * Writes are changed-only: the stored source hash is read first and a month is
 * written only when its rows differ. A missing count stays null, never 0, and
 * a month the provider has not published yet (NO_DATA) is simply not stored.
 */
import {
  buildMonthlyStatsRequest,
  latestCompleteMonth,
  MONTHLY_STATS_OPERATIONS,
  shiftMonth,
} from "./incheon-airport-stats.mjs";
import { requestIncheonOperation } from "./incheon-airport-stats-client.mjs";
import { sha256 } from "./hash";
import type { AirportStatsOperationId, AirportStatsRow } from "./airport-monthly-stats-read";
import {
  writeCollectorStatus,
  writeSourceHealth,
  type CollectorEnv,
  type CollectorResult,
  type SourceHealthStatus,
} from "./collector";

export type { AirportStatsOperationId };

export const AIRPORT_STATS_OPERATIONS: readonly AirportStatsOperationId[] = ["ROUTE_COUNTRY_PASSENGERS", "TIME_BAND_PASSENGERS"];

export const AIRPORT_STATS_SCHEMA_VERSION = "incheon-airport-stats-v1";

/** Months kept and backfilled: the latest complete month and the twelve before it. */
export const AIRPORT_STATS_WINDOW_MONTHS = 13;

/** Missing older months requested per operation per run, on top of the latest month. */
export const MAX_BACKFILL_PER_OPERATION = 3;

/** YYYYMM (the provider's form) to YYYY-MM (the stored and public form). */
export function dashedMonth(yyyymm: string): string {
  return `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;
}

/** The months one run asks for: always the latest, then the newest missing ones. */
export function planAirportStatsMonths(now: Date, stored: ReadonlySet<string>): string[] {
  const latest = latestCompleteMonth(now) as string;
  const missing: string[] = [];
  for (let back = 1; back < AIRPORT_STATS_WINDOW_MONTHS && missing.length < MAX_BACKFILL_PER_OPERATION; back += 1) {
    const month = shiftMonth(latest, -back) as string;
    if (!stored.has(dashedMonth(month))) missing.push(month);
  }
  return [latest, ...missing];
}

interface ParsedRow {
  label: string;
  region: string | null;
  arrivals: number | null;
  departures: number | null;
  total: number | null;
  isProviderAggregate: boolean;
  hourBand: { startHour: number; endHour: number } | null;
}

function storedRows(rows: readonly ParsedRow[]): AirportStatsRow[] {
  return rows.map((row) => ({
    label: row.label,
    region: row.region,
    arrivals: row.arrivals,
    departures: row.departures,
    total: row.total,
    aggregate: row.isProviderAggregate,
    startHour: row.hourBand?.startHour ?? null,
    endHour: row.hourBand?.endHour ?? null,
  }));
}

const STOPPING_KINDS = new Set(["KEY_NOT_CONFIGURED", "NOT_REGISTERED", "EXPIRED", "AUTH_REJECTED", "LIMIT_EXCEEDED", "RATE_LIMITED"]);

interface OperationOutcome {
  operationId: AirportStatsOperationId;
  sourceId: string;
  stored: number;
  unchanged: number;
  noData: string[];
  failures: string[];
  requests: number;
  stop: boolean;
  needsKey: boolean;
}

async function readStoredHashes(db: D1Database | undefined, fromMonth: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  if (!db) return hashes;
  const result = await db.prepare(`SELECT operation_id AS operationId, month, source_hash AS sourceHash
      FROM airport_monthly_stats WHERE month >= ? ORDER BY month, operation_id LIMIT 64`)
    .bind(fromMonth)
    .all<{ operationId: string; month: string; sourceHash: string }>();
  for (const row of result.results ?? []) hashes.set(`${row.operationId}:${row.month}`, row.sourceHash);
  return hashes;
}

/** One operation of one run. Returns as soon as the provider refuses the key or the quota. */
async function collectOperation(
  env: CollectorEnv,
  now: Date,
  operationId: AirportStatsOperationId,
  hashes: Map<string, string>,
  fetchImpl: typeof fetch | undefined,
): Promise<OperationOutcome> {
  const sourceId = MONTHLY_STATS_OPERATIONS[operationId].sourceId as string;
  const outcome: OperationOutcome = { operationId, sourceId, stored: 0, unchanged: 0, noData: [], failures: [], requests: 0, stop: false, needsKey: false };
  const storedMonths = new Set([...hashes.keys()].filter((key) => key.startsWith(`${operationId}:`)).map((key) => key.slice(operationId.length + 1)));
  for (const month of planAirportStatsMonths(now, storedMonths)) {
    const plan = buildMonthlyStatsRequest(operationId, { fromMonth: month, toMonth: month, now });
    const result = await requestIncheonOperation(plan, {
      env: { DATA_GO_KR_SERVICE_KEY: env.DATA_GO_KR_SERVICE_KEY },
      ...(fetchImpl ? { fetchImpl } : {}),
    });
    outcome.requests += result.attempts;
    const { classification } = result;
    const tag = `${dashedMonth(month)} ${classification.kind}${classification.resultCode ? ` code=${classification.resultCode}` : ""}${classification.httpStatus ? ` http=${classification.httpStatus}` : ""}`;
    if (STOPPING_KINDS.has(classification.kind)) {
      outcome.failures.push(tag);
      outcome.stop = true;
      outcome.needsKey = classification.kind === "KEY_NOT_CONFIGURED";
      break;
    }
    if (classification.kind === "NO_DATA") {
      outcome.noData.push(dashedMonth(month));
      continue;
    }
    const parsed = result.parsed as { shape?: string; status: string; rows: ParsedRow[]; contract: { status: string; unknownFieldNames: string[]; missingDocumentedFieldNames: string[]; issues: string[] } } | null;
    if (classification.kind !== "OK" || !parsed || parsed.shape !== "MONTHLY_STATS" || parsed.status !== "VALID") {
      outcome.failures.push(`${tag}${classification.issue ? ` issue=${classification.issue}` : ""}${result.retryExhausted ? " retryExhausted" : ""}`);
      continue;
    }
    // A response whose fields drifted from the observed contract is not stored:
    // the field names are reported so the parser can be reviewed first.
    if (parsed.contract.status === "DRIFT") {
      const fields = [
        ...parsed.contract.unknownFieldNames.map((name) => `+${name}`),
        ...parsed.contract.missingDocumentedFieldNames.map((name) => `-${name}`),
        ...parsed.contract.issues,
      ].slice(0, 6).join(",");
      outcome.failures.push(`${dashedMonth(month)} DRIFT ${fields}`);
      continue;
    }
    const rows = storedRows(parsed.rows);
    const sourceHash = await sha256({ operationId, month: dashedMonth(month), rows });
    const key = `${operationId}:${dashedMonth(month)}`;
    if (hashes.get(key) === sourceHash) {
      outcome.unchanged += 1;
      continue;
    }
    if (env.DB) {
      await env.DB.prepare(`INSERT INTO airport_monthly_stats (operation_id, month, payload, source_hash, retrieved_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(month, operation_id) DO UPDATE SET
            payload = excluded.payload, source_hash = excluded.source_hash, retrieved_at = excluded.retrieved_at
          WHERE airport_monthly_stats.source_hash <> excluded.source_hash`)
        .bind(operationId, dashedMonth(month), JSON.stringify({ schemaVersion: AIRPORT_STATS_SCHEMA_VERSION, rows }), sourceHash, now.toISOString())
        .run();
    }
    hashes.set(key, sourceHash);
    outcome.stored += 1;
  }
  return outcome;
}

function operationStatus(outcome: OperationOutcome): CollectorResult["status"] {
  if (outcome.needsKey) return "NEEDS_KEY";
  const succeeded = outcome.stored + outcome.unchanged;
  if (outcome.failures.length) return succeeded ? "PARTIAL" : "ERROR";
  if (!succeeded) return "NO_DATA";
  return "SUCCESS";
}

const WORST: Record<string, number> = { NEEDS_KEY: 5, ERROR: 4, PARTIAL: 3, NO_DATA: 2, SUCCESS: 1 };
const HEALTH_RANK: Partial<Record<SourceHealthStatus, number>> & Record<"OFFICIAL_HISTORICAL" | "MISSING" | "STALE" | "ERROR", number> = { OFFICIAL_HISTORICAL: 1, MISSING: 2, STALE: 3, ERROR: 4 };

/**
 * Daily collector for both operations. One operation failing never stops the
 * other unless the provider refused the shared key or quota.
 */
export async function collectAirportMonthlyStats(
  env: CollectorEnv,
  now: Date = new Date(),
  options: { fetchImpl?: typeof fetch } = {},
): Promise<CollectorResult> {
  const windowStart = dashedMonth(shiftMonth(latestCompleteMonth(now) as string, -(AIRPORT_STATS_WINDOW_MONTHS - 1)) as string);
  const hashes = await readStoredHashes(env.DB, windowStart);
  const outcomes: OperationOutcome[] = [];
  for (const operationId of AIRPORT_STATS_OPERATIONS) {
    const outcome = await collectOperation(env, now, operationId, hashes, options.fetchImpl);
    outcomes.push(outcome);
    if (outcome.stop) break;
  }
  let status: CollectorResult["status"] = "SUCCESS";
  let health: SourceHealthStatus = "OFFICIAL_HISTORICAL";
  const details: string[] = [];
  for (const operationId of AIRPORT_STATS_OPERATIONS) {
    const outcome = outcomes.find((value) => value.operationId === operationId);
    const sourceId = MONTHLY_STATS_OPERATIONS[operationId].sourceId as string;
    const months = [...hashes.keys()].filter((key) => key.startsWith(`${operationId}:`)).map((key) => key.slice(operationId.length + 1)).sort();
    const operationState = outcome ? operationStatus(outcome) : "ERROR";
    const detail = outcome
      ? `requests ${outcome.requests}; stored ${outcome.stored}; unchanged ${outcome.unchanged}; months kept ${months.length}${months.length ? ` (${months[0]}..${months.at(-1)})` : ""}${outcome.noData.length ? `; not published ${outcome.noData.join(",")}` : ""}${outcome.failures.length ? `; failed ${outcome.failures.join(" | ")}` : ""}`
      : "not requested: the shared key or quota was refused for the other operation";
    // Stored months stay usable after a failed day; with none, the source has nothing to show.
    const operationHealth: SourceHealthStatus = operationState === "SUCCESS" || operationState === "NO_DATA"
      ? (months.length ? "OFFICIAL_HISTORICAL" : "MISSING")
      : (months.length ? "STALE" : "ERROR");
    await writeCollectorStatus(env.DB, sourceId, operationState, detail, outcome?.stored ?? 0, outcome?.stored ?? 0);
    await writeSourceHealth(env.DB, sourceId, operationHealth, detail, months.length ? { retrievedAt: now.toISOString(), schemaVersion: AIRPORT_STATS_SCHEMA_VERSION } : undefined);
    if (WORST[operationState] > WORST[status]) status = operationState;
    if ((HEALTH_RANK[operationHealth] ?? 0) > (HEALTH_RANK[health] ?? 0)) health = operationHealth;
    details.push(`${operationId}: ${operationState}; ${detail}`);
  }
  const records = outcomes.reduce((sum, outcome) => sum + outcome.stored, 0);
  return {
    status,
    records,
    detail: details.join(" || "),
    providerRequests: outcomes.reduce((sum, outcome) => sum + outcome.requests, 0),
    sourceHealth: health,
    lastGoodPreserved: hashes.size > 0,
  };
}
