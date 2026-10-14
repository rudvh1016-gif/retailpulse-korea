/**
 * The one-line answer a searcher came for, in the first HTML.
 *
 * Every page draws its figures in the browser from /api/live/summary, so the
 * HTML a search engine first receives says what the page is about but never
 * the answer itself — "which hour is busiest at Incheon today", "how busy is
 * Myeongdong now". This module reads exactly those two facts on the server,
 * from the same official tables and through the same honesty gates the
 * summary uses, so the page can state them before any script runs.
 *
 * Cost is bounded by construction: one D1 batch of two indexed reads (at most
 * 96 airport aggregate rows for one service date, and the latest row per
 * area), remembered per isolate for a minute. Any failure yields `null`, and a
 * null answer renders nothing — a page never shows a guessed number.
 */
import { summarizeTodayPassengerForecast, type AirportForecastAggregateRow } from "./airport-today-summary";
import { kstDayOf } from "./kst";
import { SEOUL_REALTIME_STALE_MINUTES } from "./seoul-freshness";
import { TODAY_ANSWER_AREAS, type TodayAnswer, type TodayAnswerArea } from "./today-answer-text";

// The wording and the answer's types live in ./today-answer-text (see there); re-exported here.
export { areaAnswerText, shareAnswerText, TODAY_ANSWER_AREAS, type AreaNow, type TodayAnswer, type TodayAnswerArea } from "./today-answer-text";

/** The slice of the D1 binding this reads through; tests pass a double. */
export interface AnswerClient {
  prepare(sql: string): { bind(...values: unknown[]): unknown };
  batch(statements: unknown[]): Promise<Array<{ results?: unknown[] }>>;
}

const AIRPORT_SQL = `SELECT terminal, direction, is_aggregate AS isAggregate,
    target_date AS targetDate, time_band_raw AS timeBandRaw,
    target_start_at AS targetStartAt, target_end_at AS targetEndAt,
    expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
  FROM airport_passenger_forecast
  WHERE direction = 'departure' AND is_aggregate = 1 AND target_date = ?
  ORDER BY target_start_at, terminal LIMIT 96`;

const AREA_SQL = TODAY_ANSWER_AREAS.map(() => `SELECT * FROM (SELECT area, congestion_level AS level, observed_at AS observedAt
    FROM seoul_realtime_area
    WHERE area = ? AND source_id = 'SEOUL_CITYDATA_PPLTN' AND quality_status = 'VALID'
    ORDER BY observed_at DESC LIMIT 1)`).join(" UNION ALL ");

/** A congestion reading older than this is not "now" and is not shown: the same 40-minute rule as the live screens. */
const AREA_FRESH_MS = SEOUL_REALTIME_STALE_MINUTES * 60 * 1000;
const MEMO_MS = 60 * 1000;
let memo: { at: number; value: TodayAnswer | null } | null = null;

export function composeTodayAnswer(airportRows: AirportForecastAggregateRow[], areaRows: Array<{ area: string; level: number; observedAt: string }>, nowMs: number): TodayAnswer {
  const serviceDate = kstDayOf(new Date(nowMs).toISOString());
  const forecast = summarizeTodayPassengerForecast(airportRows.filter((row) => row.targetDate === serviceDate), serviceDate);
  const T1 = forecast.peakByTerminal.T1 ?? null;
  const T2 = forecast.peakByTerminal.T2 ?? null;
  const areas: TodayAnswer["areas"] = {};
  for (const row of areaRows) {
    if (!(TODAY_ANSWER_AREAS as readonly string[]).includes(row.area)) continue;
    const level = Number(row.level);
    const observed = Date.parse(row.observedAt);
    if (!Number.isInteger(level) || level < 1 || level > 4) continue;
    if (!Number.isFinite(observed) || nowMs - observed > AREA_FRESH_MS || observed - nowMs > 5 * 60 * 1000) continue;
    areas[row.area as TodayAnswerArea] = { level, observedAt: row.observedAt };
  }
  return { serviceDate, airportPeak: T1 || T2 ? { T1, T2 } : null, areas };
}

export async function readTodayAnswer(client: AnswerClient, nowMs = Date.now()): Promise<TodayAnswer | null> {
  if (memo && nowMs - memo.at < MEMO_MS) return memo.value;
  let value: TodayAnswer | null = null;
  try {
    const serviceDate = kstDayOf(new Date(nowMs).toISOString());
    const [airport, areas] = await client.batch([
      client.prepare(AIRPORT_SQL).bind(serviceDate),
      client.prepare(AREA_SQL).bind(...TODAY_ANSWER_AREAS),
    ]);
    value = composeTodayAnswer(
      (airport?.results ?? []) as AirportForecastAggregateRow[],
      (areas?.results ?? []) as Array<{ area: string; level: number; observedAt: string }>,
      nowMs,
    );
  } catch {
    value = null;
  }
  memo = { at: nowMs, value };
  return value;
}

/** Test hook: forget the per-isolate memo. */
export function resetTodayAnswerMemo(): void {
  memo = null;
}
