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
 *   airport_recent       A1  collectAirportFlightsToday (verified D-3..today scan)
 *   airport_enrichment   A2  collectAirportFlightEnrichment
 *   airport_scheduled    A3  collectScheduledAirportFlights
 *   airport_congestion   A4  collectAirportCongestion
 *   seoul_realtime       S1  collectSeoulRealtime
 *   seoul_foreign        S2  collectSeoulForeignPresence
 *   seoul_sales          S3  collectEstimatedSales
 *   weather              W1  collectWeatherForecasts
 *   events               T1  collectTourismEvents
 */
import { collectAirportFlightsToday, hasCompleteA1RecentHistoryToday, kstDate } from "./airport-today";
import {
  collectAirportCongestion,
  collectAirportFlightEnrichment,
  collectEstimatedSales,
  collectScheduledAirportFlights,
  collectSeoulForeignPresence,
  collectSeoulRealtime,
  collectTourismEvents,
  collectWeatherForecasts,
  type CollectorEnv,
} from "./collector";

export interface ProductionSourceOutcome {
  status: string;
  records: number;
  trackedToday?: number;
  pagesFetched?: number;
}

export type ProductionRunner = (env: CollectorEnv, now: Date) => Promise<ProductionSourceOutcome>;

/** Explicit status reported when the A1 same-day guard skips a run without any provider calls. */
export const SKIPPED_ALREADY_COMPLETE_TODAY = "SKIPPED_ALREADY_COMPLETE_TODAY";

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
  seoul_realtime: (env: CollectorEnv) => collectSeoulRealtime(env),
  seoul_foreign: (env: CollectorEnv, now: Date) => collectSeoulForeignPresence(env, now),
  seoul_sales: (env: CollectorEnv, now: Date) => collectEstimatedSales(env, now),
  weather: (env: CollectorEnv, now: Date) => collectWeatherForecasts(env, now),
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
        detail: error instanceof Error ? error.message.slice(0, 200) : "collector_error",
      });
    }
  }
  return results;
}
