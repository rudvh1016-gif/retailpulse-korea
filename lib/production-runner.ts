/**
 * Safe, explicitly selectable Production collection runner.
 *
 * This module reuses each source's existing verified collector — it never
 * duplicates source/provider logic. Sources run sequentially in the given
 * order (never concurrently), which keeps provider calls staggered instead
 * of bursty. One source throwing or returning ERROR/NEEDS_KEY never stops
 * the remaining selected sources from running.
 *
 * Source name -> KORETAIL internal source mapping:
 *   airport_recent              A1     collectAirportFlightsToday (verified D-3..today scan)
 *   airport_enrichment          A2     collectAirportFlightEnrichment
 *   airport_scheduled           A3     collectScheduledAirportFlights
 *   airport_congestion          A4-T1  collectAirportCongestion
 *   airport_congestion_t2       A4-T2  collectAirportCongestionT2
 *   airport_passenger_forecast  A5     collectAirportPassengerForecast
 *   seoul_realtime               S1    collectSeoulRealtime
 *   seoul_foreign                 S2   collectSeoulForeignPresence
 *   seoul_sales                   S3   collectEstimatedSales
 *   weather                       W1   collectWeatherForecasts
 *   events                        T1   collectTourismEvents
 *
 * Two sources are RECOVERY variants of an existing source rather than new
 * sources: `airport_passenger_forecast_recovery` and `weather_recovery`. They
 * read Production D1 first, make ZERO provider requests when the required
 * coverage is already healthy, and otherwise re-request only what is missing.
 * See lib/collection-recovery.ts for why the repair is a second short window
 * instead of a longer retry loop inside the primary job.
 */
import { collectAirportFlightsToday, hasCompleteA1RecentHistoryToday, kstDate } from "./airport-today";
import {
  collectAirportCongestion,
  collectAirportCongestionT2,
  collectAirportFlightEnrichment,
  collectAirportPassengerForecast,
  collectEstimatedSales,
  collectScheduledAirportFlights,
  collectSeoulForeignPresence,
  collectSeoulRealtime,
  collectTourismEvents,
  collectWeatherForecasts,
  type CollectorEnv,
} from "./collector";
import {
  describeForecastPlan,
  describeWeatherPlan,
  planForecastRecovery,
  planWeatherRecovery,
  SKIPPED_ALREADY_HEALTHY,
  type CollectionMode,
} from "./collection-recovery";
import { safeSourceFailureDetail } from "./source-adapters";

export interface ProductionSourceOutcome {
  status: string;
  records: number;
  detail?: string;
  trackedToday?: number;
  pagesFetched?: number;
  /** PRIMARY or RECOVERY, so a log line states which window produced it. */
  mode?: CollectionMode;
  /** Requests that actually reached the provider. 0 proves a free skip. */
  providerRequests?: number;
  /** What the run set source_health to. */
  sourceHealth?: string;
  /** True when stored rows were left intact by a failed attempt. */
  lastGoodPreserved?: boolean;
}

export type ProductionRunner = (env: CollectorEnv, now: Date) => Promise<ProductionSourceOutcome>;

/** Explicit status reported when the A1 same-day guard skips a run without any provider calls. */
export const SKIPPED_ALREADY_COMPLETE_TODAY = "SKIPPED_ALREADY_COMPLETE_TODAY";

export { SKIPPED_ALREADY_HEALTHY } from "./collection-recovery";

const DEFAULT_RUNNERS = {
  airport_recent: async (env: CollectorEnv, now: Date): Promise<ProductionSourceOutcome> => {
    const targetDate = kstDate(now);
    if (await hasCompleteA1RecentHistoryToday(env.DB, targetDate)) {
      return { status: SKIPPED_ALREADY_COMPLETE_TODAY, records: 0 };
    }
    return collectAirportFlightsToday(env, now);
  },
  airport_enrichment: (env: CollectorEnv) => collectAirportFlightEnrichment(env),
  airport_scheduled: (env: CollectorEnv) => collectScheduledAirportFlights(env),
  airport_congestion: (env: CollectorEnv) => collectAirportCongestion(env),
  airport_congestion_t2: (env: CollectorEnv) => collectAirportCongestionT2(env),
  airport_passenger_forecast: async (env: CollectorEnv, now: Date): Promise<ProductionSourceOutcome> => {
    const result = await collectAirportPassengerForecast(env, { now });
    return {
      status: result.status,
      records: result.records,
      mode: "PRIMARY",
      providerRequests: result.providerRequests ?? 0,
      sourceHealth: result.sourceHealth,
      lastGoodPreserved: result.lastGoodPreserved,
      detail: result.detail,
    };
  },
  /**
   * A5 repair window. Reads D1 first: a day that is COMPLETE and was collected
   * within this hour is not re-requested, so a recovery after a healthy
   * primary makes no provider request at all.
   */
  airport_passenger_forecast_recovery: async (env: CollectorEnv, now: Date): Promise<ProductionSourceOutcome> => {
    const plan = await planForecastRecovery(env.DB, now);
    const planned = describeForecastPlan(plan);
    if (!plan.missingSelectdates.length) {
      return {
        status: SKIPPED_ALREADY_HEALTHY, records: 0, mode: "RECOVERY", providerRequests: 0,
        lastGoodPreserved: plan.hasUsableLastGood, detail: `mode=RECOVERY; ${planned}`,
      };
    }
    const result = await collectAirportPassengerForecast(env, {
      selectdates: plan.missingSelectdates,
      mode: "RECOVERY",
      hasUsableLastGood: plan.hasUsableLastGood,
      now,
    });
    return {
      status: result.status,
      records: result.records,
      mode: "RECOVERY",
      providerRequests: result.providerRequests ?? 0,
      sourceHealth: result.sourceHealth,
      // The collector re-reads storage after writing, so its answer is the
      // one that reflects reality at the end of the run.
      lastGoodPreserved: result.lastGoodPreserved ?? plan.hasUsableLastGood,
      detail: `${planned}; ${result.detail ?? ""}`.trim(),
    };
  },
  seoul_realtime: (env: CollectorEnv) => collectSeoulRealtime(env),
  seoul_foreign: (env: CollectorEnv, now: Date) => collectSeoulForeignPresence(env, now),
  seoul_sales: (env: CollectorEnv, now: Date) => collectEstimatedSales(env, now),
  weather: (env: CollectorEnv, now: Date) => collectWeatherForecasts(env, now),
  /**
   * W1 repair window. A grid whose areas already hold the expected KMA
   * issuance is not re-requested, so a recovery after a healthy primary makes
   * no provider request at all.
   */
  weather_recovery: async (env: CollectorEnv, now: Date): Promise<ProductionSourceOutcome> => {
    const plan = await planWeatherRecovery(env.DB, now);
    const planned = describeWeatherPlan(plan);
    if (!plan.missingGrids.length) {
      return {
        status: SKIPPED_ALREADY_HEALTHY, records: 0, mode: "RECOVERY", providerRequests: 0,
        lastGoodPreserved: plan.hasUsableLastGood, detail: `mode=RECOVERY; ${planned}`,
      };
    }
    const result = await collectWeatherForecasts(env, now, {
      grids: plan.missingGrids,
      mode: "RECOVERY",
      hasUsableLastGood: plan.hasUsableLastGood,
    });
    return {
      status: result.status,
      records: result.records,
      mode: "RECOVERY",
      providerRequests: result.providerRequests ?? 0,
      sourceHealth: result.sourceHealth,
      lastGoodPreserved: plan.hasUsableLastGood,
      detail: `${planned}; ${result.detail ?? ""}`.trim(),
    };
  },
  events: (env: CollectorEnv, now: Date) => collectTourismEvents(env, now),
} as const satisfies Record<string, ProductionRunner>;

export type ProductionSourceName = keyof typeof DEFAULT_RUNNERS;

export const PRODUCTION_SOURCE_NAMES = Object.keys(DEFAULT_RUNNERS) as ProductionSourceName[];

export function isProductionSourceName(value: string): value is ProductionSourceName {
  return Object.prototype.hasOwnProperty.call(DEFAULT_RUNNERS, value);
}

export interface ProductionSourceResult extends ProductionSourceOutcome {
  source: string;
  detail?: string;
}

export function hasProductionSourceFailure(results: readonly ProductionSourceResult[]): boolean {
  return results.some((result) => result.status === "ERROR" || result.status === "NEEDS_KEY");
}

/**
 * Runs exactly the selected sources, once each, in the given order.
 *
 * `runners` defaults to the real collectors and only needs overriding in
 * tests. An unknown source name reports ERROR without touching any other
 * requested source. A thrown error from one source is caught and reported
 * as ERROR so it can never corrupt or block the remaining sources.
 */
export async function runSelectedProductionSources(
  env: CollectorEnv,
  sourceNames: readonly string[],
  now: Date = new Date(),
  runners: Partial<Record<ProductionSourceName, ProductionRunner>> = DEFAULT_RUNNERS,
): Promise<ProductionSourceResult[]> {
  const results: ProductionSourceResult[] = [];
  for (const source of sourceNames) {
    if (!isProductionSourceName(source) || !runners[source]) {
      results.push({ source, status: "ERROR", records: 0, detail: "unknown_source" });
      continue;
    }
    try {
      const outcome = await runners[source](env, now);
      results.push({ source, ...outcome });
    } catch (error) {
      results.push({
        source,
        status: "ERROR",
        records: 0,
        detail: safeSourceFailureDetail(error),
      });
    }
  }
  return results;
}
