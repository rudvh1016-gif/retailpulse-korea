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
  /** Official TourAPI category name of the next event, when the provider gave one. */
  nextEventCategory: string | null;
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
  nextEventCategory?: string | null;
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
    nextEventCategory: input.nextEventCategory ?? null,
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

/**
 * The hour the reader is standing in, and where it is headed.
 *
 * The brief used to open with a wait and then jump straight to the day's
 * peak, which for most of the day is hours away — so a reader at 13:50 was
 * told about 07:00 and nothing about now. This answers "how many departing
 * passengers are officially expected in this hour, and is that rising or
 * falling", which is the other half of a current picture.
 *
 * It is a FORECAST, never an observation: `expectedPassengers` is the
 * airport's own published expectation for the band, not a count of people.
 * Callers must label it as such.
 */
export interface AirportBriefNowBand {
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
  /** The band immediately after this one; null when today has no later band. */
  nextExpectedPassengers: number | null;
  /** This band as a share of the day's busiest band, 0..1; null when no peak was proven. */
  peakShare: number | null;
}

export interface AirportCurrentBrief {
  scope: BriefScope;
  checkpoint: AirportBriefCheckpoint | null;
  checkpointBasis: "WAIT_TIME" | "WAITING_COUNT" | null;
  forecastCoverage: BriefCoverage;
  peak: AirportBriefPeak | null;
  /** Only ever present on a COMPLETE forecast for the day being read today. */
  nowBand: AirportBriefNowBand | null;
  departures: number | null;
  topGate: AirportBriefGate | null;
  evidenceTypes: Array<"CHECKPOINT" | "PASSENGER_FORECAST" | "FLIGHTS">;
}

/**
 * The band containing `nowIso`, plus the one after it.
 *
 * Three refusals, each deliberate:
 *   · Not today → null. "현재" on a past or future date names no hour the
 *     reader is in, and a stale hour dressed as "now" is worse than silence.
 *   · Coverage not COMPLETE → the caller must not ask. A day with missing
 *     bands can put a gap where "the next hour" should be, and comparing
 *     across that gap would state a rise or fall the data does not show.
 *   · The last band of the day has no successor, so `nextExpectedPassengers`
 *     is null rather than a wrap-around to the first band.
 */
export function selectAirportNowBand(input: {
  timeline: AirportBriefPeak[];
  nowIso: string;
  peakExpectedPassengers: number | null;
  isToday: boolean;
}): AirportBriefNowBand | null {
  if (!input.isToday) return null;
  const now = Date.parse(input.nowIso);
  if (!Number.isFinite(now)) return null;
  const bands = [...input.timeline].sort((a, b) => a.targetStartAt.localeCompare(b.targetStartAt));
  const index = bands.findIndex((band) => Date.parse(band.targetStartAt) <= now && now < Date.parse(band.targetEndAt));
  if (index < 0) return null;
  const band = bands[index];
  const next = bands[index + 1] ?? null;
  const peak = input.peakExpectedPassengers;
  return {
    targetStartAt: band.targetStartAt,
    targetEndAt: band.targetEndAt,
    expectedPassengers: band.expectedPassengers,
    nextExpectedPassengers: next ? next.expectedPassengers : null,
    peakShare: peak && peak > 0 ? band.expectedPassengers / peak : null,
  };
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
  nowBand?: AirportBriefNowBand | null;
  departures: number | null;
  topGate: AirportBriefGate | null;
}): AirportCurrentBrief {
  const scopedRows = input.scope === "all" ? input.congestion : input.congestion.filter((row) => row.terminal === input.scope);
  const selected = selectBusiestCheckpoint(scopedRows);
  const peak = input.forecastCoverage === "COMPLETE" ? input.peak : null;
  // Same gate as the peak: a partial day can hide the very band that would
  // make "this hour" or "the next hour" wrong.
  const nowBand = input.forecastCoverage === "COMPLETE" ? input.nowBand ?? null : null;
  const evidenceTypes: AirportCurrentBrief["evidenceTypes"] = [];
  if (selected) evidenceTypes.push("CHECKPOINT");
  if (peak || nowBand) evidenceTypes.push("PASSENGER_FORECAST");
  if (input.departures !== null || input.topGate) evidenceTypes.push("FLIGHTS");
  return {
    scope: input.scope,
    checkpoint: selected?.row ?? null,
    checkpointBasis: selected?.basis ?? null,
    forecastCoverage: input.forecastCoverage,
    peak,
    nowBand,
    departures: input.departures,
    topGate: input.topGate,
    evidenceTypes,
  };
}

export type BriefLang = "ko" | "en" | "zh" | "ja";

/**
 * What a timestamp on screen MEANS, not just when it was.
 *
 * The same clock face can answer two different questions, and mixing them up
 * is what made the airport cards unreadable: "지금부터 오늘 끝까지 12,933명"
 * was stamped "08:42 기준" while the sentence above it said the sum started
 * at 14:00. Both were true — 08:42 was when the forecast was COLLECTED, 14:00
 * was where the SUM starts — but one word ("기준") was doing both jobs.
 *
 *  · "collected" — when we fetched this from the provider (A5/A1 retrievedAt)
 *  · "observed"  — when the provider itself measured it (checkpoint observedAt)
 *  · "basis"     — generic "as of", for values that are neither
 *  · "plain"     — the clock alone, when the surrounding copy already says what it is
 *
 * A summed window (14:00–24:00) is never any of these; it is a range, and it
 * is rendered as a range so it can never be mistaken for a retrieval moment.
 */
export type FreshnessKind = "basis" | "collected" | "observed" | "plain";

export function formatHumanFreshness(
  value: string,
  nowIso: string,
  lang: BriefLang,
  kind: FreshnessKind = "basis",
): string {
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

  // The "when" half: today needs no date, yesterday says so in words, and
  // anything older carries its own date so it can never read as today.
  let stamp: string;
  if (valueDay === today) stamp = clock;
  else if (valueDay === yesterday) {
    stamp = lang === "ko" ? `어제 ${clock}` : lang === "en" ? `yesterday ${clock}` : lang === "zh" ? `昨天 ${clock}` : `昨日 ${clock}`;
  } else {
    const day = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Seoul", month: "short", day: "numeric" }).format(valueDate);
    stamp = lang === "en" ? `${day}, ${clock}` : `${day} ${clock}`;
  }
  if (kind === "plain") return stamp;

  // The "what" half. Korean/Chinese/Japanese suffix it, English prefixes it.
  const word = {
    basis: { ko: "기준", en: "As of", zh: "截至", ja: "時点" },
    collected: { ko: "수집", en: "Collected", zh: "采集", ja: "取得" },
    observed: { ko: "관측", en: "Observed", zh: "观测", ja: "観測" },
  }[kind][lang];
  return lang === "en" ? `${word} ${stamp}` : `${stamp} ${word}`;
}
