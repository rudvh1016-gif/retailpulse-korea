import { redactSeoulUrl, redactServiceKey } from "./source-adapters";

/** Keep operational diagnostics useful without ever emitting authenticated URLs. */
export function sanitizeProductionDetail(value: unknown): string {
  const detail = typeof value === "string" ? value : String(value ?? "");
  return redactSeoulUrl(redactServiceKey(detail))
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 500);
}

/**
 * Canonical operational `source_id` per production source name.
 *
 * Keys deliberately reuse the exact names lib/production-runner.ts already
 * accepts, so a diagnostic selection and a collector selection are spelled
 * the same way. Values are the literal ids the collectors write to
 * collector_runs/source_health — they are asserted against the collector
 * sources in tests/production-runner.test.mjs so this table can never drift
 * into a guess.
 */
export const DIAGNOSTIC_SOURCE_IDS = {
  airport_recent: "INCHEON_FLIGHT_DETAIL",
  airport_enrichment: "INCHEON_DUTY_FREE_ACTUAL",
  airport_scheduled: "INCHEON_SCHEDULED_DUTY_FREE",
  airport_congestion: "INCHEON_DEPARTURE_CONGESTION",
  airport_congestion_t2: "INCHEON_DEPARTURE_CONGESTION_T2",
  airport_passenger_forecast: "INCHEON_PASSENGER_FORECAST",
  seoul_realtime: "SEOUL_CITYDATA_PPLTN",
  seoul_foreign: "SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION",
  seoul_sales: "SEOUL_ESTIMATED_SALES",
  weather: "KMA_VILAGE_FCST",
  events: "KTO_TOURAPI_EVENT",
} as const satisfies Record<string, string>;

export type DiagnosticSourceName = keyof typeof DIAGNOSTIC_SOURCE_IDS;

export const DIAGNOSTIC_SOURCE_NAMES = Object.keys(DIAGNOSTIC_SOURCE_IDS) as DiagnosticSourceName[];

/**
 * Resolves a comma-separated selection into canonical source ids.
 *
 * An empty/absent selection inspects every known source, which is a strict
 * superset of the original A2/A3/T1 default and stays read-only either way.
 * Both a production source name (`airport_congestion_t2`) and a raw
 * canonical id (`INCHEON_DEPARTURE_CONGESTION_T2`) are accepted; anything
 * else throws so a typo can never look like "this source has no rows".
 */
export function resolveDiagnosticSourceIds(selection?: string): string[] {
  const requested = (selection ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requested.length) return DIAGNOSTIC_SOURCE_NAMES.map((name) => DIAGNOSTIC_SOURCE_IDS[name]);

  const known = new Set<string>(Object.values(DIAGNOSTIC_SOURCE_IDS));
  const resolved: string[] = [];
  const unknown: string[] = [];
  for (const value of requested) {
    const id = Object.prototype.hasOwnProperty.call(DIAGNOSTIC_SOURCE_IDS, value)
      ? DIAGNOSTIC_SOURCE_IDS[value as DiagnosticSourceName]
      : known.has(value)
        ? value
        : undefined;
    if (!id) unknown.push(value);
    else if (!resolved.includes(id)) resolved.push(id);
  }
  if (unknown.length) throw new Error(`unknown_diagnostic_sources_${unknown.join("_")}`);
  return resolved;
}
