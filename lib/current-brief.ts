export type BriefScope = "all" | "T1" | "T2";
export type BriefCoverage = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export interface AreaBriefRealtime {
  congestionLevel: number;
  populationMin: number;
  populationMax: number;
  observedAt: string;
  freshness: "LIVE" | "STALE";
}

export interface AreaBriefForecast {
  targetAt: string;
  congestionLevel: number;
  populationMin: number;
  populationMax: number;
  retrievedAt?: string | null;
}

export interface AreaBriefWeather {
  targetAt: string;
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
}

export type WeatherAdvice =
  | { kind: "UMBRELLA"; probability: number; targetAt: string }
  | { kind: "CHECK_RAIN"; probability: number; targetAt: string }
  | { kind: "HOT"; temperatureC: number; targetAt: string }
  | { kind: "COLD"; temperatureC: number; targetAt: string };

/** Which KST day a forecast target falls on, relative to the reader's "now". */
export type ForecastDayOffset = "TODAY" | "TOMORROW" | "LATER";

export interface AreaUpcomingPeak extends AreaBriefForecast {
  /** Says the day out loud so "03:00" can never read as three hours ago. */
  dayOffset: ForecastDayOffset;
}

export interface AreaCurrentBrief {
  current: AreaBriefRealtime | null;
  upcomingPeak: AreaUpcomingPeak | null;
  /** How far ahead the official forecast actually reaches, for honest labelling. */
  forecastHorizonEndAt: string | null;
  weatherAdvice: WeatherAdvice | null;
  eventCount: number;
  nextEventTitle: string | null;
  evidenceTypes: Array<"REALTIME" | "SEOUL_FORECAST" | "WEATHER" | "EVENTS">;
}

export const WEATHER_THRESHOLDS = {
  umbrellaProbability: 50,
  checkRainProbability: 30,
  hotTenthC: 300,
  coldTenthC: 50,
} as const;

/**
 * Builds one area's "right now" brief from official rows only.
 *
 * The upcoming peak deliberately spans Seoul's whole published horizon rather
 * than being clipped to the current calendar day. Seoul publishes a rolling
 * 12-hour forecast, so from mid-evening onward every band it publishes falls
 * on tomorrow: the 2026-08-31 production diagnostic caught the latest issue
 * (22:55 KST) covering 00:00–11:00 the next day, which a "today only" filter
 * threw away entirely and reported as "no forecast available" — while twelve
 * perfectly good official bands sat in D1.
 *
 * The day is carried on `dayOffset` instead, so the caller states it in words
 * and a 03:00 peak can never be mistaken for one that already passed.
 */
export function buildAreaCurrentBrief(input: {
  realtime: AreaBriefRealtime | null;
  realtimeForecast: AreaBriefForecast[];
  weather: AreaBriefWeather[];
  eventCount: number;
  nextEventTitle?: string | null;
  nowIso: string;
}): AreaCurrentBrief {
  const now = Date.parse(input.nowIso);
  const kstDay = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(parsed);
  };
  const todayKst = kstDay(input.nowIso);
  const tomorrowKst = Number.isFinite(now) ? kstDay(new Date(now + 86_400_000).toISOString()) : null;
  const isCurrentOrFuture = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && (!Number.isFinite(now) || parsed >= now);
  };
  const dayOffsetOf = (value: string): ForecastDayOffset => {
    const day = kstDay(value);
    if (day && day === todayKst) return "TODAY";
    if (day && day === tomorrowKst) return "TOMORROW";
    return "LATER";
  };
  const ahead = input.realtimeForecast.filter((row) => isCurrentOrFuture(row.targetAt));
  const peakRow = [...ahead].sort((a, b) => b.congestionLevel - a.congestionLevel
    || b.populationMax - a.populationMax
    || a.targetAt.localeCompare(b.targetAt))[0] ?? null;
  const upcomingPeak: AreaUpcomingPeak | null = peakRow
    ? { ...peakRow, dayOffset: dayOffsetOf(peakRow.targetAt) }
    : null;
  const forecastHorizonEndAt = ahead.length
    ? [...ahead].sort((a, b) => a.targetAt.localeCompare(b.targetAt)).at(-1)!.targetAt
    : null;

  const weather = input.weather.filter((row) => isCurrentOrFuture(row.targetAt)).slice(0, 12);
  const wettest = [...weather]
    .filter((row) => row.precipitationProbability !== null)
    .sort((a, b) => (b.precipitationProbability ?? -1) - (a.precipitationProbability ?? -1)
      || a.targetAt.localeCompare(b.targetAt))[0];
  let weatherAdvice: WeatherAdvice | null = null;
  if ((wettest?.precipitationProbability ?? -1) >= WEATHER_THRESHOLDS.umbrellaProbability) {
    weatherAdvice = { kind: "UMBRELLA", probability: wettest!.precipitationProbability!, targetAt: wettest!.targetAt };
  } else if ((wettest?.precipitationProbability ?? -1) >= WEATHER_THRESHOLDS.checkRainProbability) {
    weatherAdvice = { kind: "CHECK_RAIN", probability: wettest!.precipitationProbability!, targetAt: wettest!.targetAt };
  } else {
    const hottest = [...weather].filter((row) => row.temperatureTenthC !== null)
      .sort((a, b) => (b.temperatureTenthC ?? -Infinity) - (a.temperatureTenthC ?? -Infinity))[0];
    const coldest = [...weather].filter((row) => row.temperatureTenthC !== null)
      .sort((a, b) => (a.temperatureTenthC ?? Infinity) - (b.temperatureTenthC ?? Infinity))[0];
    if ((hottest?.temperatureTenthC ?? -Infinity) >= WEATHER_THRESHOLDS.hotTenthC) {
      weatherAdvice = { kind: "HOT", temperatureC: hottest!.temperatureTenthC! / 10, targetAt: hottest!.targetAt };
    } else if ((coldest?.temperatureTenthC ?? Infinity) <= WEATHER_THRESHOLDS.coldTenthC) {
      weatherAdvice = { kind: "COLD", temperatureC: coldest!.temperatureTenthC! / 10, targetAt: coldest!.targetAt };
    }
  }

  const evidenceTypes: AreaCurrentBrief["evidenceTypes"] = [];
  if (input.realtime) evidenceTypes.push("REALTIME");
  if (upcomingPeak) evidenceTypes.push("SEOUL_FORECAST");
  if (weatherAdvice) evidenceTypes.push("WEATHER");
  if (input.eventCount > 0) evidenceTypes.push("EVENTS");
  return {
    current: input.realtime,
    upcomingPeak,
    forecastHorizonEndAt,
    weatherAdvice,
    eventCount: input.eventCount,
    nextEventTitle: input.nextEventTitle ?? null,
    evidenceTypes,
  };
}

export interface AirportBriefCheckpoint {
  terminal: string;
  zone: string;
  waitTimeMinutes: number | null;
  waitTimeRaw?: string | null;
  waitingCount: number | null;
  observedAt: string;
  freshness?: "LIVE" | "STALE";
}

export interface AirportBriefPeak {
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
}

export interface AirportBriefGate {
  terminal: string | null;
  gate: string;
  flights: number;
}

export interface AirportCurrentBrief {
  scope: BriefScope;
  checkpoint: AirportBriefCheckpoint | null;
  checkpointBasis: "WAIT_TIME" | "WAITING_COUNT" | null;
  forecastCoverage: BriefCoverage;
  peak: AirportBriefPeak | null;
  departures: number | null;
  topGate: AirportBriefGate | null;
  evidenceTypes: Array<"CHECKPOINT" | "PASSENGER_FORECAST" | "FLIGHTS">;
}

function comparableWait(row: AirportBriefCheckpoint): number | null {
  if (typeof row.waitTimeMinutes === "number" && Number.isFinite(row.waitTimeMinutes)) return row.waitTimeMinutes;
  const match = row.waitTimeRaw?.match(/\d+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function selectBusiestCheckpoint(rows: AirportBriefCheckpoint[]): { row: AirportBriefCheckpoint; basis: "WAIT_TIME" | "WAITING_COUNT" } | null {
  if (!rows.length) return null;
  const withWait = rows.filter((row) => comparableWait(row) !== null);
  const basis = withWait.length ? "WAIT_TIME" : "WAITING_COUNT";
  const candidates = withWait.length ? withWait : rows;
  const row = [...candidates].sort((a, b) => {
    if (basis === "WAIT_TIME") {
      const waitDiff = (comparableWait(b) ?? -1) - (comparableWait(a) ?? -1);
      if (waitDiff) return waitDiff;
    }
    const countDiff = (b.waitingCount ?? -1) - (a.waitingCount ?? -1);
    if (countDiff) return countDiff;
    return `${a.terminal}|${a.zone}`.localeCompare(`${b.terminal}|${b.zone}`);
  })[0];
  return { row, basis };
}

export function buildAirportCurrentBrief(input: {
  scope: BriefScope;
  congestion: AirportBriefCheckpoint[];
  forecastCoverage: BriefCoverage;
  peak: AirportBriefPeak | null;
  departures: number | null;
  topGate: AirportBriefGate | null;
}): AirportCurrentBrief {
  const scopedRows = input.scope === "all" ? input.congestion : input.congestion.filter((row) => row.terminal === input.scope);
  const selected = selectBusiestCheckpoint(scopedRows);
  const peak = input.forecastCoverage === "COMPLETE" ? input.peak : null;
  const evidenceTypes: AirportCurrentBrief["evidenceTypes"] = [];
  if (selected) evidenceTypes.push("CHECKPOINT");
  if (peak) evidenceTypes.push("PASSENGER_FORECAST");
  if (input.departures !== null || input.topGate) evidenceTypes.push("FLIGHTS");
  return {
    scope: input.scope,
    checkpoint: selected?.row ?? null,
    checkpointBasis: selected?.basis ?? null,
    forecastCoverage: input.forecastCoverage,
    peak,
    departures: input.departures,
    topGate: input.topGate,
    evidenceTypes,
  };
}

export type BriefLang = "ko" | "en" | "zh" | "ja";

export function formatHumanFreshness(value: string, nowIso: string, lang: BriefLang): string {
  const valueDate = new Date(value);
  const nowDate = new Date(nowIso);
  if (Number.isNaN(valueDate.getTime()) || Number.isNaN(nowDate.getTime())) return "";
  const locale = lang === "ko" ? "ko-KR" : lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB";
  const dateParts = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  const clock = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(valueDate);
  const valueDay = dateParts(valueDate);
  const today = dateParts(nowDate);
  const yesterday = dateParts(new Date(nowDate.getTime() - 86_400_000));
  if (valueDay === today) return lang === "ko" ? `${clock} 기준` : lang === "en" ? `As of ${clock}` : lang === "zh" ? `截至 ${clock}` : `${clock} 時点`;
  if (valueDay === yesterday) return lang === "ko" ? `어제 ${clock} 기준` : lang === "en" ? `Yesterday ${clock}` : lang === "zh" ? `昨天 ${clock}` : `昨日 ${clock} 時点`;
  const day = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Seoul", month: "short", day: "numeric" }).format(valueDate);
  return lang === "ko" ? `${day} ${clock} 기준` : lang === "en" ? `${day}, ${clock}` : lang === "zh" ? `${day} ${clock}` : `${day} ${clock} 時点`;
}
