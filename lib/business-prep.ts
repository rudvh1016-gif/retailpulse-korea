/**
 * Before-opening preparation for one store: the official facts that fall
 * inside the store's own hours, and at most three preparation actions derived
 * from them by fixed rules.
 *
 * No model and no LLM. Every action names the rule that fired, the official
 * rows it read, when those rows were issued or collected, which hours they
 * cover and what they cannot say — so a reader can check it by hand.
 *
 * Accuracy boundaries this file must never cross:
 *   - rain is not turned into sales, an event into customers, airport
 *     passengers into store visitors, or an airline into passenger nationality;
 *   - no staffing number is computed;
 *   - a forecast is never extended past the hours it actually covers;
 *   - stale or missing data is never reported as "no change".
 */
import type { AirportSidesBlock } from "./airport-sides-summary";
import { collectionStamp, splitFromSummary, type FlightSplit } from "./airport-flight-split";
import type { SplitCore, SplitEstimate } from "./airport-flight-split-copy";
import type { LiveSummary } from "../app/live-signals";
import { WEATHER_THRESHOLDS } from "./current-brief";

export type PrepArea = "myeongdong" | "hongdae" | "seongsu" | "itaewon";
export type PrepTerminal = "T1" | "T2";
export type AirportSide = "EAST" | "WEST";
/** An airport store may name its side of the terminal; null means the whole terminal. */
export type PrepPlace = { kind: "area"; area: PrepArea } | { kind: "airport"; terminal: PrepTerminal; side?: AirportSide | null };

/** Store hours in KST, "HH:MM". Equal open and close mean open all day. */
export interface BusinessHours { open: string; close: string }

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function minutesOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = TIME.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Stored or typed hours, or null when anything about them is invalid. */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  if (!value || typeof value !== "object") return null;
  const { open, close } = value as Record<string, unknown>;
  if (minutesOf(open) === null || minutesOf(close) === null) return null;
  return { open: open as string, close: close as string };
}

const HOUR_MS = 3_600_000;
const KST_MS = 9 * HOUR_MS;

/** A UTC epoch as a KST ISO instant with the explicit +09:00 offset. */
export function kstIso(ms: number): string {
  return `${new Date(ms + KST_MS).toISOString().slice(0, 19)}+09:00`;
}

function kstDayMs(day: string): number {
  return Date.parse(`${day}T00:00:00+09:00`);
}

export interface PrepWindow {
  startAt: string;
  endAt: string;
  /** No hours were set, or open equals close: the whole service day. */
  wholeDay: boolean;
  crossesMidnight: boolean;
  /** Today's window began yesterday (a late shift still running now). */
  startedYesterday: boolean;
}

/**
 * The KST instants a store's hours cover for a service date.
 *
 * Hours that close before they open run past midnight (23:00–02:00). On the
 * service day itself, a late shift that began yesterday and is still open is
 * the one that matters now, so that window is returned instead.
 */
export function prepWindow(serviceDate: string, hours: BusinessHours | null, nowIso?: string): PrepWindow {
  const day = kstDayMs(serviceDate);
  if (!Number.isFinite(day)) throw new Error("invalid_service_date");
  const open = hours ? minutesOf(hours.open) : null;
  const close = hours ? minutesOf(hours.close) : null;
  if (open === null || close === null || open === close) {
    return { startAt: kstIso(day), endAt: kstIso(day + 24 * HOUR_MS), wholeDay: true, crossesMidnight: false, startedYesterday: false };
  }
  const crossesMidnight = close < open;
  if (crossesMidnight && nowIso) {
    const now = Date.parse(nowIso);
    const yesterdayClose = day + close * 60_000;
    if (now >= day && now < yesterdayClose) {
      return { startAt: kstIso(day - 24 * HOUR_MS + open * 60_000), endAt: kstIso(yesterdayClose), wholeDay: false, crossesMidnight, startedYesterday: true };
    }
  }
  const start = day + open * 60_000;
  const end = day + (crossesMidnight ? 24 * 60 + close : close) * 60_000;
  return { startAt: kstIso(start), endAt: kstIso(end), wholeDay: false, crossesMidnight, startedYesterday: false };
}

export type PrepSource = "SEOUL_FORECAST" | "KMA_FORECAST" | "TOURAPI_EVENTS" | "A5_FORECAST" | "A1_FLIGHTS" | "HOLIDAY_CALENDAR";

export interface PrepForecastRow { targetAt: string; congestionLevel: number; issuedAt?: string | null; retrievedAt?: string | null }
export interface PrepWeatherRow { targetAt: string; precipitationProbability: number | null; temperatureTenthC: number | null; issuedAt?: string | null }
export interface PrepEventRow { title: string; eventStart: string; eventEnd: string | null; retrievedAt?: string | null }
export interface PrepAirportBand { targetStartAt: string; targetEndAt: string; expectedPassengers: number }
export interface PrepGateHours {
  /** count: flights in scope; unverified: flights of the terminal that hour whose gate side is not evidenced. */
  hours: ReadonlyArray<{ hour: number; count: number; unverified?: number }>;
  /**
   * TERMINAL: every flight of the terminal is counted (a terminal is known
   * even when the gate side is not). SIDE_VERIFIED_ONLY: only flights at
   * gates with an evidenced side — a partial count that must never be read
   * as the side's peak or turned into a preparation action.
   */
  scope?: "TERMINAL" | "SIDE_COMPLETE" | "SIDE_VERIFIED_ONLY";
  /** Share of the terminal's flights at a gate whose side official text names. */
  verifiedShare: number | null;
  retrievedAt: string | null;
  /** Source-level collection time (rows are written changed-only); freshness uses it when present. */
  checkedAt?: string | null;
  basis: "COLLECTED_FLIGHT_RECORDS" | "OFFICIAL_DEPARTURE_SCHEDULE";
}
export interface PrepHoliday {
  country: "KR" | "CN" | "JP";
  date: string;
  /** The official name, untranslated when a translation is uncertain. */
  name: string;
  /** Official source line for the evidence, e.g. "KASI", "gov.cn 国办发明电〔2025〕7号". */
  source: string;
}

export interface PrepInput {
  serviceDate: string;
  dayRelation: "PAST" | "TODAY" | "FUTURE";
  nowIso: string;
  place: PrepPlace;
  hours: BusinessHours | null;
  forecast?: readonly PrepForecastRow[];
  weather?: readonly PrepWeatherRow[];
  events?: readonly PrepEventRow[];
  eventsRetrievedAt?: string | null;
  airport?: {
    bands: readonly PrepAirportBand[];
    coverage: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
    retrievedAt: string | null;
    /**
     * The chosen side's departure-hall bands (A5 halls summed by side), when
     * a side is chosen and the hall split is published; otherwise null and
     * the terminal bands are used, labelled as the terminal.
     */
    sideBands?: readonly PrepAirportBand[] | null;
    sideCoverage?: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
    /** Physical departures per scheduled hour at this terminal (and side, when chosen and verified). */
    gates?: PrepGateHours | null;
    /**
     * East/west departure flights of the whole terminal and the reference
     * passenger split derived from them (lib/airport-flight-split.ts). It is
     * independent of the chosen side and of the hall split.
     */
    split?: FlightSplit | null;
  };
  holidays?: readonly PrepHoliday[];
}

/** How long an issue stays usable for "nothing changed": Seoul re-issues about every 5 min, KMA every 3 h, A5 daily. */
export const FRESHNESS_MS = {
  SEOUL_FORECAST: 3 * HOUR_MS,
  KMA_FORECAST: 6 * HOUR_MS,
  A5_FORECAST: 30 * HOUR_MS,
  // The same daily-publication window as A5: flight records older than this
  // are not used for a preparation fact.
  A1_FLIGHTS: 30 * HOUR_MS,
} as const;

export type CoverageStatus = "COVERED" | "PARTIAL" | "NONE" | "STALE" | "NOT_YET_PUBLISHED";

export interface PrepCoverage {
  source: PrepSource;
  status: CoverageStatus;
  /** The part of the window the source covers, when it covers any. */
  coveredStartAt: string | null;
  coveredEndAt: string | null;
  issuedAt: string | null;
}

export type PrepRule = "CROWD" | "AIRPORT_PEAK" | "GATE_PEAK" | "RAIN" | "HOLIDAY" | "EVENT" | "HEAT" | "COLD";

export type PrepValue =
  | { kind: "LEVEL"; level: number }
  | { kind: "PROBABILITY"; percent: number }
  | { kind: "TEMPERATURE"; celsius: number }
  | { kind: "PASSENGERS"; count: number; side?: AirportSide | null }
  | { kind: "FLIGHTS"; count: number; side: AirportSide | null; verifiedShare: number | null }
  | { kind: "EVENTS"; count: number; title: string; eventStart: string; eventEnd: string | null }
  | { kind: "HOLIDAY"; country: PrepHoliday["country"]; name: string; officialSource: string };

/** One rule that fired, with everything needed to check it by hand. */
export interface PrepAction {
  rule: PrepRule;
  source: PrepSource;
  value: PrepValue;
  /** When it matters inside the hours, or null for a whole-date fact. */
  startAt: string | null;
  endAt: string | null;
  /** Issue or collection time of the rows read. */
  issuedAt: string | null;
}

export type PrepFact =
  | { kind: "CROWD_MAX"; level: number; startAt: string; endAt: string; issuedAt: string | null }
  | { kind: "RAIN_MAX"; percent: number; startAt: string; endAt: string; issuedAt: string | null }
  | { kind: "TEMPERATURE_RANGE"; minC: number; maxC: number; issuedAt: string | null }
  | { kind: "AIRPORT_PEAK"; count: number; startAt: string; endAt: string; issuedAt: string | null; side?: AirportSide | null }
  | { kind: "AIRPORT_TOTAL"; count: number; bands: number; startAt: string; endAt: string; issuedAt: string | null; side?: AirportSide | null }
  | { kind: "GATE_PEAK"; count: number; startAt: string; endAt: string; issuedAt: string | null; side: AirportSide | null; basis: PrepGateHours["basis"];
      /** true: counted only flights at gates with an evidenced side; unverified flights are listed, not included. */
      partial?: boolean; unverifiedInHour?: number; unverifiedInHours?: number }
  | { kind: "FLIGHT_SPLIT"; split: SplitCore; issuedAt: string | null }
  | { kind: "FLIGHT_SPLIT_ESTIMATE"; estimate: SplitEstimate; issuedAt: string | null; forecastIssuedAt: string | null }
  | { kind: "EVENTS"; count: number; title: string; eventStart: string; eventEnd: string | null; issuedAt: string | null }
  | { kind: "HOLIDAY"; country: PrepHoliday["country"]; name: string; officialSource: string };

export type PrepStatus = "ACTIONS" | "NO_CHANGE" | "PARTIAL" | "INSUFFICIENT" | "ENDED" | "PAST";

export interface BusinessPrep {
  window: PrepWindow;
  /** Start of the part still ahead: the current hour on the service day. */
  remainingStartAt: string;
  facts: PrepFact[];
  actions: PrepAction[];
  coverage: PrepCoverage[];
  status: PrepStatus;
  /**
   * The same verdict for the hour-based sources alone. A date-wide action
   * (a holiday, an event) must not hide that the hours themselves could not
   * be judged.
   */
  hourlyStatus: PrepStatus;
}

export const MAX_ACTIONS = 3;
export const CROWD_LEVEL = 3;
export const RAIN_PERCENT = WEATHER_THRESHOLDS.umbrellaProbability;
const RULE_ORDER: PrepRule[] = ["CROWD", "AIRPORT_PEAK", "GATE_PEAK", "RAIN", "HOLIDAY", "EVENT", "HEAT", "COLD"];

const within = (at: number, start: number, end: number) => at >= start && at < end;

function latestIssue(values: ReadonlyArray<string | null | undefined>): string | null {
  const valid = values.filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));
  return valid.length ? valid.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b)) : null;
}

/** Hour bands inside [start, end) that the rows cover, as one covered span. */
function coverageOf(
  source: PrepSource,
  hoursCovered: number[],
  start: number,
  end: number,
  issuedAt: string | null,
  now: number,
  dayRelation: PrepInput["dayRelation"],
): PrepCoverage {
  const needed = Math.max(0, Math.ceil((end - start) / HOUR_MS));
  const staleAfter = source in FRESHNESS_MS ? FRESHNESS_MS[source as keyof typeof FRESHNESS_MS] : Infinity;
  const stale = issuedAt !== null && now - Date.parse(issuedAt) > staleAfter;
  if (!hoursCovered.length) {
    // Seoul publishes only ~12 hours ahead; a later date is simply not out yet.
    const status: CoverageStatus = source === "SEOUL_FORECAST" && dayRelation === "FUTURE" ? "NOT_YET_PUBLISHED" : "NONE";
    return { source, status, coveredStartAt: null, coveredEndAt: null, issuedAt };
  }
  const first = Math.min(...hoursCovered), last = Math.max(...hoursCovered) + HOUR_MS;
  const status: CoverageStatus = stale ? "STALE" : hoursCovered.length >= needed ? "COVERED" : "PARTIAL";
  return { source, status, coveredStartAt: kstIso(Math.max(first, start)), coveredEndAt: kstIso(Math.min(last, end)), issuedAt };
}

/** First and last hour of the rows that reach a value, as one span. */
function spanOf(times: number[]): { startAt: string; endAt: string } {
  return { startAt: kstIso(Math.min(...times)), endAt: kstIso(Math.max(...times) + HOUR_MS) };
}

export function buildBusinessPrep(input: PrepInput): BusinessPrep {
  const now = Date.parse(input.nowIso);
  const window = prepWindow(input.serviceDate, input.hours, input.dayRelation === "TODAY" ? input.nowIso : undefined);
  const windowStart = Date.parse(window.startAt), windowEnd = Date.parse(window.endAt);
  const hourNow = Math.floor((now + KST_MS) / HOUR_MS) * HOUR_MS - KST_MS;
  const start = input.dayRelation === "TODAY" ? Math.max(windowStart, hourNow) : windowStart;
  const base = { window, remainingStartAt: kstIso(start), facts: [] as PrepFact[], actions: [] as PrepAction[], coverage: [] as PrepCoverage[] };
  if (input.dayRelation === "PAST") return { ...base, status: "PAST", hourlyStatus: "PAST" };
  if (start >= windowEnd) return { ...base, status: "ENDED", hourlyStatus: "ENDED" };

  const facts: PrepFact[] = [];
  const actions: PrepAction[] = [];
  const coverage: PrepCoverage[] = [];

  if (input.place.kind === "area") {
    // Seoul's official congestion forecast, hourly bands.
    const bands = (input.forecast ?? []).filter((row) => Number.isFinite(Date.parse(row.targetAt)) && row.congestionLevel >= 1 && row.congestionLevel <= 4)
      .filter((row) => within(Date.parse(row.targetAt), start, windowEnd));
    const forecastIssued = latestIssue((input.forecast ?? []).map((row) => row.issuedAt ?? row.retrievedAt));
    const forecastCoverage = coverageOf("SEOUL_FORECAST", bands.map((row) => Date.parse(row.targetAt)), start, windowEnd, forecastIssued, now, input.dayRelation);
    coverage.push(forecastCoverage);
    if (bands.length && forecastCoverage.status !== "STALE") {
      const top = Math.max(...bands.map((row) => row.congestionLevel));
      const span = spanOf(bands.filter((row) => row.congestionLevel === top).map((row) => Date.parse(row.targetAt)));
      facts.push({ kind: "CROWD_MAX", level: top, ...span, issuedAt: forecastIssued });
      if (top >= CROWD_LEVEL) actions.push({ rule: "CROWD", source: "SEOUL_FORECAST", value: { kind: "LEVEL", level: top }, ...span, issuedAt: forecastIssued });
    }

    // KMA short-term forecast, hourly rows.
    const weather = (input.weather ?? []).filter((row) => Number.isFinite(Date.parse(row.targetAt)) && within(Date.parse(row.targetAt), start, windowEnd));
    const weatherIssued = latestIssue((input.weather ?? []).map((row) => row.issuedAt));
    const weatherCoverage = coverageOf("KMA_FORECAST", weather.map((row) => Date.parse(row.targetAt)), start, windowEnd, weatherIssued, now, input.dayRelation);
    coverage.push(weatherCoverage);
    if (weather.length && weatherCoverage.status !== "STALE") {
      const probabilities = weather.filter((row) => typeof row.precipitationProbability === "number");
      if (probabilities.length) {
        const top = Math.max(...probabilities.map((row) => row.precipitationProbability as number));
        const span = spanOf(probabilities.filter((row) => row.precipitationProbability === top).map((row) => Date.parse(row.targetAt)));
        facts.push({ kind: "RAIN_MAX", percent: top, ...span, issuedAt: weatherIssued });
        const wet = probabilities.filter((row) => (row.precipitationProbability as number) >= RAIN_PERCENT).map((row) => Date.parse(row.targetAt));
        if (wet.length) actions.push({ rule: "RAIN", source: "KMA_FORECAST", value: { kind: "PROBABILITY", percent: top }, ...spanOf(wet), issuedAt: weatherIssued });
      }
      const temperatures = weather.filter((row) => typeof row.temperatureTenthC === "number");
      if (temperatures.length) {
        const values = temperatures.map((row) => row.temperatureTenthC as number);
        const minC = Math.min(...values) / 10, maxC = Math.max(...values) / 10;
        facts.push({ kind: "TEMPERATURE_RANGE", minC, maxC, issuedAt: weatherIssued });
        const hot = temperatures.filter((row) => (row.temperatureTenthC as number) >= WEATHER_THRESHOLDS.hotTenthC).map((row) => Date.parse(row.targetAt));
        const cold = temperatures.filter((row) => (row.temperatureTenthC as number) <= WEATHER_THRESHOLDS.coldTenthC).map((row) => Date.parse(row.targetAt));
        if (hot.length) actions.push({ rule: "HEAT", source: "KMA_FORECAST", value: { kind: "TEMPERATURE", celsius: maxC }, ...spanOf(hot), issuedAt: weatherIssued });
        if (cold.length) actions.push({ rule: "COLD", source: "KMA_FORECAST", value: { kind: "TEMPERATURE", celsius: minC }, ...spanOf(cold), issuedAt: weatherIssued });
      }
    }

    // Official TourAPI events whose own period includes the service date.
    const running = (input.events ?? []).filter((event) => event.eventStart <= input.serviceDate && (event.eventEnd ?? event.eventStart) >= input.serviceDate);
    if (running.length) {
      const first = running[0];
      const value = { kind: "EVENTS" as const, count: running.length, title: first.title, eventStart: first.eventStart, eventEnd: first.eventEnd };
      const issuedAt = input.eventsRetrievedAt ?? latestIssue(running.map((event) => event.retrievedAt));
      facts.push({ kind: "EVENTS", count: value.count, title: value.title, eventStart: value.eventStart, eventEnd: value.eventEnd, issuedAt });
      actions.push({ rule: "EVENT", source: "TOURAPI_EVENTS", value, startAt: null, endAt: null, issuedAt });
    }
  } else {
    // A5: the airport's own expected departures — the chosen side's halls
    // when that split is published, otherwise the whole terminal.
    const airport = input.airport;
    const side = input.place.kind === "airport" ? input.place.side ?? null : null;
    const useSide = Boolean(side && airport?.sideBands);
    const bandSide = useSide ? side : null;
    const bands = ((useSide ? airport?.sideBands : airport?.bands) ?? []).filter((band) => {
      const bandStart = Date.parse(band.targetStartAt), bandEnd = Date.parse(band.targetEndAt);
      return Number.isFinite(bandStart) && Number.isFinite(bandEnd) && bandEnd > start && bandStart < windowEnd && Number.isFinite(band.expectedPassengers);
    });
    const issuedAt = airport?.retrievedAt ?? null;
    const hoursCovered = bands.flatMap((band) => {
      const hours: number[] = [];
      for (let at = Math.max(Date.parse(band.targetStartAt), start); at < Math.min(Date.parse(band.targetEndAt), windowEnd); at += HOUR_MS) hours.push(at);
      return hours;
    });
    const a5 = coverageOf("A5_FORECAST", hoursCovered, start, windowEnd, issuedAt, now, input.dayRelation);
    // The provider's own coverage verdict wins over a count of hours.
    if (a5.status === "COVERED" && (useSide ? airport?.sideCoverage : airport?.coverage) !== "COMPLETE") a5.status = "PARTIAL";
    coverage.push(a5);
    if (bands.length && a5.status !== "STALE") {
      const peak = bands.reduce((best, band) => band.expectedPassengers > best.expectedPassengers ? band : best);
      facts.push({ kind: "AIRPORT_PEAK", count: peak.expectedPassengers, startAt: peak.targetStartAt, endAt: peak.targetEndAt, issuedAt, side: bandSide });
      actions.push({ rule: "AIRPORT_PEAK", source: "A5_FORECAST", value: { kind: "PASSENGERS", count: peak.expectedPassengers, side: bandSide }, startAt: peak.targetStartAt, endAt: peak.targetEndAt, issuedAt });
      // A total is only honest when every hour inside the hours has its band.
      // A band cut by the opening or closing time is never halved: then no total.
      if (a5.status === "COVERED") {
        const whole = bands.every((band) => Date.parse(band.targetStartAt) >= start && Date.parse(band.targetEndAt) <= windowEnd);
        if (whole) facts.push({ kind: "AIRPORT_TOTAL", count: bands.reduce((sum, band) => sum + band.expectedPassengers, 0), bands: bands.length, startAt: kstIso(start), endAt: kstIso(windowEnd), issuedAt, side: bandSide });
      }
    }

    // A1: physical departures by scheduled hour at gates of this terminal
    // (and side). A flight count, never a person count, and on the flight's
    // own departure clock — not moved to a guessed shopping hour.
    const gates = airport?.gates;
    const gatesStamp = gates?.checkedAt ?? gates?.retrievedAt ?? null;
    const gatesStale = gatesStamp ? now - Date.parse(gatesStamp) > FRESHNESS_MS.A1_FLIGHTS : false;
    if (gates && !gatesStale) {
      const inHours = gates.hours.filter((row) => {
        const at = Date.parse(`${input.serviceDate}T${String(row.hour).padStart(2, "0")}:00:00+09:00`);
        return row.count > 0 && at + HOUR_MS > start && at < windowEnd;
      });
      if (inHours.length) {
        const top = inHours.reduce((best, row) => (row.count > best.count ? row : best));
        const startAt = `${input.serviceDate}T${String(top.hour).padStart(2, "0")}:00:00+09:00`;
        const endAt = kstIso(Date.parse(startAt) + HOUR_MS);
        const unverifiedInHours = gates.hours.filter((row) => {
          const at = Date.parse(`${input.serviceDate}T${String(row.hour).padStart(2, "0")}:00:00+09:00`);
          return at + HOUR_MS > start && at < windowEnd;
        }).reduce((sum, row) => sum + (row.unverified ?? 0), 0);
        // Partial is judged on the hours this answer counts: unverified
        // flights earlier in the day (or outside the store's hours) cannot
        // hide a later side peak, so they do not make it partial.
        const partial = gates.scope === "SIDE_VERIFIED_ONLY" && unverifiedInHours > 0;
        facts.push({ kind: "GATE_PEAK", count: top.count, startAt, endAt, issuedAt: gates.retrievedAt, side, basis: gates.basis,
          ...(partial ? { partial: true, unverifiedInHour: top.unverified ?? 0, unverifiedInHours } : {}) });
        // A partial side count is shown as a fact only: it can never say where
        // the side's departures peak, so it never becomes a preparation action.
        if (!partial) actions.push({ rule: "GATE_PEAK", source: "A1_FLIGHTS", value: { kind: "FLIGHTS", count: top.count, side, verifiedShare: gates.verifiedShare }, startAt, endAt, issuedAt: gates.retrievedAt });
      }
    }

    // The whole-day east/west flight comparison of this terminal, with the
    // reference passenger split. Never an action: it says which side has more
    // flights, not what to staff or stock. Stale flight records give nothing.
    const split = airport?.split;
    const splitStamp = split?.checkedAt ?? split?.retrievedAt ?? null;
    const splitStale = splitStamp ? now - Date.parse(splitStamp) > FRESHNESS_MS.A1_FLIGHTS : false;
    if (split && !splitStale) {
      const core: SplitCore = { terminal: split.terminal, total: split.total, east: split.east, west: split.west, center: split.center, unverified: split.unverified,
        verified: split.verified, eastPct: split.eastPct, westPct: split.westPct, unverifiedPct: split.unverifiedPct, larger: split.larger };
      facts.push({ kind: "FLIGHT_SPLIT", split: core, issuedAt: split.retrievedAt });
      if (split.expected && core.eastPct !== null) facts.push({ kind: "FLIGHT_SPLIT_ESTIMATE", estimate: { terminal: split.terminal, ...split.expected }, issuedAt: split.retrievedAt, forecastIssuedAt: split.expectedIssuedAt });
    }
  }

  for (const holiday of input.holidays ?? []) {
    if (holiday.date !== input.serviceDate) continue;
    const value = { kind: "HOLIDAY" as const, country: holiday.country, name: holiday.name, officialSource: holiday.source };
    facts.push({ kind: "HOLIDAY", country: holiday.country, name: holiday.name, officialSource: holiday.source });
    actions.push({ rule: "HOLIDAY", source: "HOLIDAY_CALENDAR", value, startAt: null, endAt: null, issuedAt: null });
  }

  const ranked = actions
    .map((action, index) => ({ action, index }))
    .sort((a, b) => RULE_ORDER.indexOf(a.action.rule) - RULE_ORDER.indexOf(b.action.rule)
      || (a.action.startAt && b.action.startAt ? Date.parse(a.action.startAt) - Date.parse(b.action.startAt) : 0)
      || a.index - b.index)
    .map((entry) => entry.action);
  // One action per rule; holidays in two countries on one date stay two rows.
  const seen = new Set<string>();
  const chosen = ranked.filter((action) => {
    const key = action.rule === "HOLIDAY" && action.value.kind === "HOLIDAY" ? `HOLIDAY:${action.value.country}` : action.rule;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ACTIONS);

  const primary = coverage.filter((entry) => entry.source !== "SEOUL_FORECAST" || input.dayRelation === "TODAY");
  const coverageVerdict: PrepStatus = primary.length && primary.every((entry) => entry.status === "COVERED")
    ? "NO_CHANGE"
    : primary.some((entry) => entry.status === "COVERED" || entry.status === "PARTIAL")
      ? "PARTIAL"
      : "INSUFFICIENT";
  const hourly = chosen.some((action) => action.startAt !== null);
  const status: PrepStatus = chosen.length ? "ACTIONS" : coverageVerdict;
  const hourlyStatus: PrepStatus = hourly ? "ACTIONS" : coverageVerdict;

  return { ...base, facts, actions: chosen, coverage, status, hourlyStatus };
}

/**
 * Maps the one shared summary payload onto the rule inputs. It makes no
 * request of its own: the screen already holds this payload for the graphs.
 */
export function prepInputFromSummary(
  summary: LiveSummary,
  place: PrepPlace,
  hours: BusinessHours | null,
  nowIso: string,
  extraHolidays: readonly PrepHoliday[] = [],
): PrepInput {
  const korean: PrepHoliday[] = (summary.holidays ?? []).flatMap((month) =>
    (month.days ?? []).map((day) => ({ country: "KR" as const, date: day.date, name: day.name, source: "KASI" })));
  const base = {
    serviceDate: summary.serviceDateKst,
    dayRelation: summary.dayRelation,
    nowIso,
    place,
    hours,
    holidays: [...korean, ...extraHolidays],
  };
  if (place.kind === "area") {
    const block = summary.areas[place.area];
    return {
      ...base,
      forecast: block?.realtimeForecast ?? [],
      weather: (block?.weather ?? []) as PrepWeatherRow[],
      events: block?.events ?? [],
      eventsRetrievedAt: summary.sources?.find((source) => source.sourceId === "KTO_TOURAPI_EVENT")?.retrievedAt ?? null,
    };
  }
  const airport = summary.airport;
  const sameDay = airport?.serviceDateKst === summary.serviceDateKst;
  // `airport.sides` (lib/airport-sides-summary.ts) is read through a local
  // type so the locked summary type file does not change.
  const sides = sameDay ? (airport as (typeof airport & { sides?: AirportSidesBlock }) | undefined)?.sides ?? null : null;
  const side = place.side ?? null;
  const halls = sides?.halls?.[place.terminal] ?? null;
  const sideBands = side && halls ? halls.bands
    .filter((band) => (side === "EAST" ? band.east : band.west) !== null)
    .map((band) => ({ targetStartAt: band.startAt, targetEndAt: band.endAt, expectedPassengers: Number(side === "EAST" ? band.east : band.west) })) : null;
  const gateDay = sides?.gates ?? null;
  const terminalCounts = gateDay?.byArea[place.terminal];
  const verifiedShare = terminalCounts?.total ? (terminalCounts.total - terminalCounts.UNVERIFIED) / terminalCounts.total : null;
  const gates: PrepGateHours | null = gateDay && sides?.gateBasis ? {
    hours: gateDay.byHour.map((row) => {
      const counts = row.byArea[place.terminal];
      return { hour: row.hour, count: side ? counts[side] : counts.total, unverified: counts.UNVERIFIED };
    }),
    // A terminal's own flights are all counted; a side is complete only when
    // every flight of the terminal has an evidenced gate side.
    scope: !side ? "TERMINAL" : verifiedShare === 1 ? "SIDE_COMPLETE" : "SIDE_VERIFIED_ONLY",
    verifiedShare,
    retrievedAt: gateDay.retrievedAt,
    checkedAt: collectionStamp(summary, "INCHEON_FLIGHT_DETAIL", gateDay.retrievedAt),
    basis: sides.gateBasis,
  } : null;
  const flightSplit = splitFromSummary(summary, sides, place.terminal, nowIso);
  return {
    ...base,
    airport: {
      split: flightSplit.status === "OK" ? flightSplit.split : null,
      bands: sameDay ? airport?.passengerForecastTimelineByTerminal?.[place.terminal] ?? [] : [],
      coverage: sameDay ? airport?.forecastCoverage?.byTerminal?.[place.terminal] ?? "UNAVAILABLE" : "UNAVAILABLE",
      retrievedAt: sameDay ? airport?.passengerForecastRetrievedAtByTerminal?.[place.terminal] ?? null : null,
      sideBands,
      sideCoverage: halls?.coverage ?? "UNAVAILABLE",
      gates,
    },
  };
}
