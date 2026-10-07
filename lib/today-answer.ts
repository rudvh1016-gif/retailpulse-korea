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
import { summarizeTodayPassengerForecast, type AirportForecastAggregateRow, type ForecastBand } from "./airport-today-summary";
import { kstDayOf } from "./kst";

export const TODAY_ANSWER_AREAS = ["myeongdong", "hongdae", "seongsu", "itaewon"] as const;
export type TodayAnswerArea = typeof TODAY_ANSWER_AREAS[number];
type Lang = "ko" | "en" | "zh" | "ja";

export interface AreaNow {
  /** Official Seoul city-data congestion level, 1 (quiet) to 4 (crowded). */
  level: number;
  observedAt: string;
}

export interface TodayAnswer {
  serviceDate: string;
  /** Per-terminal busiest official departure band. Null unless that terminal's day is COMPLETE. */
  airportPeak: { T1: ForecastBand | null; T2: ForecastBand | null } | null;
  areas: Partial<Record<TodayAnswerArea, AreaNow>>;
}

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

/** A congestion reading older than this is not "now" and is not shown. */
const AREA_FRESH_MS = 2 * 60 * 60 * 1000;
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

const levelText: Record<Lang, string[]> = {
  ko: ["", "여유", "보통", "약간 붐빔", "붐빔"],
  en: ["", "quiet", "moderate", "slightly busy", "busy"],
  zh: ["", "空闲", "一般", "略拥挤", "拥挤"],
  ja: ["", "余裕", "普通", "やや混雑", "混雑"],
};

const areaName: Record<TodayAnswerArea, Record<Lang, string>> = {
  myeongdong: { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" },
  hongdae: { ko: "홍대", en: "Hongdae", zh: "弘大", ja: "弘大" },
  seongsu: { ko: "성수", en: "Seongsu", zh: "圣水", ja: "聖水" },
  itaewon: { ko: "이태원", en: "Itaewon", zh: "梨泰院", ja: "梨泰院" },
};

export function areaAnswerText(answer: TodayAnswer | null | undefined, lang: Lang, only?: TodayAnswerArea): string | null {
  if (!answer) return null;
  const list = (only ? [only] : [...TODAY_ANSWER_AREAS]).flatMap((area) => {
    const now = answer.areas[area];
    return now ? [{ area, now }] : [];
  });
  if (!list.length) return null;
  const time = list.map(({ now }) => now.observedAt).sort().at(-1)!.slice(11, 16);
  const body = list.map(({ area, now }) => `${areaName[area][lang]} ${levelText[lang][now.level]}`).join(" · ");
  return {
    ko: `지금(${time} KST) 서울시 실시간 혼잡도: ${body}`,
    en: `Now (${time} KST), Seoul city real-time congestion: ${body}`,
    zh: `现在（${time} KST）首尔市实时拥挤度：${body}`,
    ja: `いま（${time} KST）ソウル市リアルタイム混雑度：${body}`,
  }[lang];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-28" → 9월 28일 / Sep 28 / 9月28日. */
function calendarDay(day: string, lang: Lang): string {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return { ko: `${month}월 ${date}일`, en: `${MONTHS[month - 1]} ${date}`, zh: `${month}月${date}日`, ja: `${month}月${date}日` }[lang];
}

/**
 * The line a messenger shows under a shared link (og:description).
 *
 * KakaoTalk and other chat apps keep a link preview long after it was made,
 * so this names its own calendar day and never says "today" or "now": a
 * preview read a day later is then old, but still true. Null when there is no
 * answer, and the page keeps its ordinary description.
 */
export function shareAnswerText(answer: TodayAnswer | null | undefined, lang: Lang, page: "airport" | TodayAnswerArea): string | null {
  if (!answer) return null;
  // The owner removed the airport peak paragraph site-wide, including previews.
  if (page === "airport") return null;
  const now = answer.areas[page];
  if (!now) return null;
  const day = calendarDay(now.observedAt.slice(0, 10), lang);
  const time = now.observedAt.slice(11, 16);
  const name = areaName[page][lang];
  const level = levelText[lang][now.level];
  return {
    ko: `${day} ${time} KST 기준 ${name} 서울시 실시간 혼잡도: ${level}`,
    en: `${name} at ${time} KST on ${day}, Seoul city real-time congestion: ${level}`,
    zh: `${day} ${time} KST ${name}首尔市实时拥挤度：${level}`,
    ja: `${day} ${time} KST時点の${name}、ソウル市リアルタイム混雑度：${level}`,
  }[lang];
}
