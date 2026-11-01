/**
 * A complete selected shift, on the scheduled-departure clock. This selector
 * reads the existing flights/day-profile contracts only; it never estimates
 * passengers, shop traffic or a side-by-hour history that is not stored.
 *
 * airport-days stores terminal/hour and whole-day side marginals separately.
 * Only whole-terminal, whole-hour windows can therefore use that history.
 * T1's whole-terminal history includes the concourse; a chosen T1 side does
 * not. A side selection always includes CENTER and exposes unplaced flights.
 */
import type { FlightsPayload } from '../app/flights-client';
import type { TerminalDay } from './airport-day-compare';
import type { MapFlightRow } from './airport-departure-map';
import type { GlanceWeekReference } from './glance-week-comparison';
import { minutesOf, type AirportSide, type BusinessHours, type PrepTerminal } from './business-hours';
import { AIRPORT_SIDES_VERSION, boardingAreaOf, gateSideOf } from './airport-sides';
import { cancelledFlight, latestDayFlights } from './airport-flight-hours';
import { destinationOf } from './airport-destinations';
import { isValidKstDay, kstDayOf, kstNowIsoOf, shiftKstDay } from './kst';

export interface ShiftHistoryRow { T1: TerminalDay; T2: TerminalDay }
export type ShiftReason =
  | 'INVALID_SELECTION' | 'PENDING' | 'READ_FAILED' | 'MISSING_RECORDS'
  | 'TRUNCATED_RECORDS' | 'INVALID_RECORDS' | 'STALE_RECORDS'
  | 'CURRENT_UNVERIFIED' | 'UNVERIFIED_LOCATION'
  | 'UNSUPPORTED_SIDE_HISTORY' | 'UNSUPPORTED_MINUTE_HISTORY' | 'UNSUPPORTED_OVERNIGHT'
  | 'BASELINE_MISSING' | 'BASELINE_INVALID' | 'PARTIAL_MONTH';
export type ShiftAvailability = 'READY' | 'PARTIAL' | 'LOADING' | 'UNAVAILABLE';
export interface ShiftWindow {
  startAt: string;
  endAt: string;
  startMin: number;
  endMin: number;
  wholeDay: boolean;
  crossesMidnight: boolean;
}
export interface ShiftPeak { startAt: string; endAt: string; count: number; ties: number }
export interface ShiftDestinations {
  /** Departure countries/territories, never passenger nationality or traffic. */
  countries: Array<{ country: string; flights: number }>;
  /** The evidenced selected rows with a reviewed destination mapping. */
  known: number;
  /** Selected rows whose destination is absent or not in the reviewed mapping. */
  unknown: number;
  /** Both the selected-flight scope and every destination must be complete. */
  complete: boolean;
}
export interface ShiftCurrent {
  status: ShiftAvailability;
  reason: ShiftReason | null;
  /** The complete selected scope, or null when the available records are partial. */
  total: number | null;
  /** Count of evidenced flights even when a full-scope count cannot be claimed. */
  confirmed: number | null;
  unverified: number;
  unknownBuilding: number;
  peak: ShiftPeak | null;
  /** Counts only the same physical flights as confirmed; unavailable is null. */
  destinations: ShiftDestinations | null;
  retrievedAt: string | null;
  checkedAt: string | null;
  basis: 'COLLECTED_FLIGHT_RECORDS' | 'OFFICIAL_DEPARTURE_SCHEDULE' | null;
  provisional: boolean;
  /** A matching complete-scan witness is required for historical comparisons. */
  comparisonEligible: boolean;
}
export interface ShiftComparison {
  kind: 'WEEK' | 'MONTH';
  status: ShiftAvailability;
  reason: ShiftReason | null;
  /** The previous single shift, or mean of the explicitly included shifts. */
  baseline: number | null;
  current: number | null;
  delta: number | null;
  percent: number | null;
  start: string;
  end: string;
  includedDates: string[];
  missingDates: string[];
  excludedDates: string[];
  expectedDays: number;
}
export interface ShiftBriefing {
  day: string;
  scope: { terminal: PrepTerminal; side: AirportSide | null; includesCenter: boolean; includesConcourse: boolean };
  window: ShiftWindow | null;
  current: ShiftCurrent;
  comparisons: { week: ShiftComparison; month: ShiftComparison };
  /** NO_CHANGE requires both complete exact-scope comparisons to be exactly zero. */
  status: 'READY' | 'NO_CHANGE' | 'PARTIAL' | 'INSUFFICIENT' | 'LOADING';
}
export type ShiftBriefingResult = ShiftBriefing;
export interface ShiftBriefingInput {
  day: string;
  nowIso: string;
  terminal: PrepTerminal;
  side: AirportSide | null;
  hours: BusinessHours | null;
  flights: FlightsPayload | null | undefined;
  history: readonly ShiftHistoryRow[] | null | undefined;
  weekReference?: GlanceWeekReference | null;
  /** Source-level collection timestamp, preferred over changed-only row time. */
  checkedAt?: string | null;
}

const MINUTE_MS = 60_000;
const FRESH_MS = 30 * 3_600_000;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Equal open/close retains the existing all-day contract. Overnight is explicit. */
export function shiftWindow(day: string, hours: BusinessHours | null): ShiftWindow | null {
  if (!isValidKstDay(day)) return null;
  const open = hours ? minutesOf(hours.open) : 0, close = hours ? minutesOf(hours.close) : 1440;
  if (open === null || close === null) return null;
  const wholeDay = hours === null || open === close;
  const startMin = wholeDay ? 0 : open;
  const endMin = wholeDay ? 1440 : close < open ? close + 1440 : close;
  const start = Date.parse(`${day}T00:00:00+09:00`);
  return { startMin, endMin, wholeDay, crossesMidnight: endMin > 1440,
    startAt: kstNowIsoOf(new Date(start + startMin * MINUTE_MS).toISOString()),
    endAt: kstNowIsoOf(new Date(start + endMin * MINUTE_MS).toISOString()) };
}

const unavailableCurrent = (reason: ShiftReason, status: ShiftAvailability = 'UNAVAILABLE'): ShiftCurrent => ({
  status, reason, total: null, confirmed: null, unverified: 0, unknownBuilding: 0, peak: null,
  destinations: null, retrievedAt: null, checkedAt: null, basis: null, provisional: true, comparisonEligible: false,
});

function destinationCounts(rows: readonly MapFlightRow[], completeScope: boolean): ShiftDestinations {
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const row of rows) {
    // Only the airport feed's destination field is evidence. Do not infer a
    // country from the operating airline, flight number or boarding side.
    const country = destinationOf(typeof row.airportCode === 'string' ? row.airportCode : null)?.country;
    if (country) counts.set(country, (counts.get(country) ?? 0) + 1);
    else unknown++;
  }
  const countries = [...counts].map(([country, flights]) => ({ country, flights }))
    .sort((a, b) => b.flights - a.flights || (a.country < b.country ? -1 : a.country > b.country ? 1 : 0));
  return { countries, known: rows.length - unknown, unknown, complete: completeScope && unknown === 0 };
}

function comparison(kind: ShiftComparison['kind'], start: string, end: string): ShiftComparison {
  const days: string[] = [];
  if (isValidKstDay(start) && isValidKstDay(end)) for (let day = start; day <= end; day = shiftKstDay(day, 1)) days.push(day);
  return { kind, status: 'UNAVAILABLE', reason: 'BASELINE_MISSING', baseline: null, current: null, delta: null,
    percent: null, start, end, includedDates: [], missingDates: days, excludedDates: [], expectedDays: days.length };
}

/** The same newest physical row decides the time, terminal and side together. */
function flightRows(payload: FlightsPayload, day: string): MapFlightRow[] | null {
  if (payload.flights.some(row => !row || typeof row !== 'object' || Array.isArray(row)
    || (row.direction !== undefined && row.direction !== 'departure' && row.direction !== 'arrival'))) return null;
  const departures = payload.flights.filter(row => row.direction === undefined || row.direction === 'departure');
  if (departures.some(row => !String(row.physicalFlightId ?? '').trim()
    || !Number.isFinite(Date.parse(String(row.scheduledAt ?? '')))
    || kstDayOf(String(row.scheduledAt)) !== day)) return null;
  // Stored profiles use the service-date prefix; a different offset contract
  // must not silently produce an empty/current-zero comparison.
  if (departures.some(row => String(row.scheduledAt).slice(0, 16) !== kstNowIsoOf(String(row.scheduledAt)).slice(0, 16))) return null;
  return [...latestDayFlights(departures, day).values()].filter(row => !cancelledFlight(row));
}

function fullScanMatches(input: ShiftBriefingInput, rows: readonly MapFlightRow[], at: number, now: number): boolean {
  const { day, weekReference: reference } = input;
  if (input.flights?.basis !== 'COLLECTED_FLIGHT_RECORDS' || reference?.day !== day || !reference.selectedFlights) return false;
  const totals = { all: rows.length, T1: 0, T2: 0, CONCOURSE: 0 };
  for (const row of rows) { const building = boardingAreaOf(row); if (building !== 'UNKNOWN') totals[building]++; }
  if (!(Object.keys(totals) as Array<keyof typeof totals>).every(scope => count(reference.selectedFlights?.[scope]) && reference.selectedFlights![scope] === totals[scope])) return false;
  if (day < kstDayOf(input.nowIso)) return !reference.selectedFlightSnapshot;
  const snapshot = reference.selectedFlightSnapshot;
  return day === kstDayOf(input.nowIso) && snapshot?.day === day && snapshot.provisional === true
    && Number.isFinite(at) && at <= now && kstDayOf(input.flights!.retrievedAt!) === day
    && Date.parse(snapshot.retrievedAt) === at;
}

function currentShift(input: ShiftBriefingInput, window: ShiftWindow | null): ShiftCurrent {
  const now = Date.parse(input.nowIso), payload = input.flights;
  if (!window || !Number.isFinite(now)) return unavailableCurrent('INVALID_SELECTION');
  if (window.crossesMidnight) return unavailableCurrent('UNSUPPORTED_OVERNIGHT');
  if (payload === undefined) return unavailableCurrent('PENDING', 'LOADING');
  if (payload === null) return unavailableCurrent('READ_FAILED');
  if (payload.mode !== 'live-flights' || payload.serviceDateKst !== input.day || !Array.isArray(payload.flights)
    || !['COLLECTED_FLIGHT_RECORDS', 'OFFICIAL_DEPARTURE_SCHEDULE'].includes(payload.basis ?? '')) return unavailableCurrent('INVALID_RECORDS');
  if (payload.truncated !== false) return unavailableCurrent('TRUNCATED_RECORDS');
  const at = Date.parse(payload.retrievedAt ?? ''), checkedAt = input.checkedAt ?? payload.retrievedAt ?? null;
  const checked = Date.parse(checkedAt ?? '');
  if (!Number.isFinite(at) || !Number.isFinite(checked) || at > now || checked > now) return unavailableCurrent('INVALID_RECORDS');
  if (input.day >= kstDayOf(input.nowIso) && now - checked > FRESH_MS) return unavailableCurrent('STALE_RECORDS');
  const rows = flightRows(payload, input.day);
  if (!rows) return unavailableCurrent('INVALID_RECORDS');
  const witnessed = fullScanMatches(input, rows, at, now);
  if (!rows.length && !witnessed) return unavailableCurrent('MISSING_RECORDS');
  const start = Date.parse(window.startAt), end = Date.parse(window.endAt);
  const selected: MapFlightRow[] = [];
  let unverified = 0, unknownBuilding = 0;
  for (const row of rows) {
    const time = Date.parse(String(row.scheduledAt));
    if (time < start || time >= end) continue;
    const building = boardingAreaOf(row);
    if (building === 'UNKNOWN') { unknownBuilding++; continue; }
    if (input.side) {
      if (building !== input.terminal) continue;
      const side = gateSideOf(building, row.gate);
      if (side === 'UNVERIFIED') { unverified++; continue; }
      if (side !== input.side && side !== 'CENTER') continue;
    } else if (building !== input.terminal && !(input.terminal === 'T1' && building === 'CONCOURSE')) continue;
    selected.push(row);
  }
  const complete = witnessed && unverified === 0 && unknownBuilding === 0;
  const hours = new Map<number, number>();
  for (const row of selected) {
    const hour = Math.floor((Date.parse(String(row.scheduledAt)) - Date.parse(`${input.day}T00:00:00+09:00`)) / 3_600_000);
    hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }
  const maximum = hours.size ? Math.max(...hours.values()) : 0;
  const peakHours = [...hours].filter(([, value]) => value === maximum).map(([hour]) => hour).sort((a, b) => a - b);
  const peakHour = peakHours[0], dayStart = Date.parse(`${input.day}T00:00:00+09:00`);
  const peak = complete && maximum > 0 ? {
    startAt: kstNowIsoOf(new Date(Math.max(start, dayStart + peakHour * 3_600_000)).toISOString()),
    endAt: kstNowIsoOf(new Date(Math.min(end, dayStart + (peakHour + 1) * 3_600_000)).toISOString()),
    count: maximum, ties: peakHours.length,
  } : null;
  return { status: complete ? 'READY' : 'PARTIAL', reason: complete ? null : unverified || unknownBuilding ? 'UNVERIFIED_LOCATION' : 'CURRENT_UNVERIFIED',
    total: complete ? selected.length : null, confirmed: selected.length, unverified, unknownBuilding, peak,
    destinations: destinationCounts(selected, complete),
    retrievedAt: payload.retrievedAt!, checkedAt, basis: payload.basis as ShiftCurrent['basis'],
    provisional: input.day >= kstDayOf(input.nowIso), comparisonEligible: complete };
}

function historicalCount(value: TerminalDay | undefined, day: string, window: ShiftWindow): number | null {
  if (!value || value.day !== day || value.complete !== true || value.sidesVersion !== AIRPORT_SIDES_VERSION
    || !count(value.total) || !Array.isArray(value.hours) || value.hours.length !== 24 || !value.hours.every(count)
    || sum(value.hours) !== value.total) return null;
  return sum(value.hours.slice(window.startMin / 60, window.endMin / 60));
}

function fillComparison(base: ShiftComparison, input: ShiftBriefingInput, window: ShiftWindow | null, current: ShiftCurrent): ShiftComparison {
  const unavailable = (reason: ShiftReason, status: ShiftAvailability = 'UNAVAILABLE') => ({ ...base, reason, status });
  if (!window) return unavailable('INVALID_SELECTION');
  if (window.crossesMidnight) return unavailable('UNSUPPORTED_OVERNIGHT');
  if (input.side) return unavailable('UNSUPPORTED_SIDE_HISTORY');
  if (window.startMin % 60 || window.endMin % 60) return unavailable('UNSUPPORTED_MINUTE_HISTORY');
  if (current.status === 'LOADING' || input.history === undefined) return unavailable('PENDING', 'LOADING');
  if (!current.comparisonEligible || current.total === null) return unavailable(current.reason ?? 'CURRENT_UNVERIFIED');
  if (input.history === null) return unavailable('READ_FAILED');
  const byDay = new Map<string, TerminalDay[]>();
  for (const row of input.history) {
    const value = row?.[input.terminal];
    if (!value || !isValidKstDay(value.day) || value.day < base.start || value.day > base.end) continue;
    const found = byDay.get(value.day) ?? []; found.push(value); byDay.set(value.day, found);
  }
  const includedDates: string[] = [], missingDates: string[] = [], excludedDates: string[] = [], values: number[] = [];
  for (let day = base.start; day <= base.end; day = shiftKstDay(day, 1)) {
    const candidates = byDay.get(day) ?? [];
    const value = candidates.length === 1 ? historicalCount(candidates[0], day, window) : null;
    if (value === null) { missingDates.push(day); if (candidates.length) excludedDates.push(day); }
    else { includedDates.push(day); values.push(value); }
  }
  if (!values.length) return { ...base, missingDates, excludedDates, reason: excludedDates.length ? 'BASELINE_INVALID' : 'BASELINE_MISSING' };
  const baseline = sum(values) / values.length, delta = current.total - baseline;
  return { ...base, status: missingDates.length ? 'PARTIAL' : 'READY', reason: missingDates.length ? 'PARTIAL_MONTH' : null,
    baseline, current: current.total, delta, percent: baseline > 0 ? delta / baseline * 100 : null,
    includedDates, missingDates, excludedDates };
}

export function buildShiftBriefing(input: ShiftBriefingInput): ShiftBriefing {
  const validDay = isValidKstDay(input.day), previousDay = validDay ? shiftKstDay(input.day, -7) : '';
  const previousEnd = validDay ? shiftKstDay(input.day.slice(0, 7) + '-01', -1) : '';
  const previousStart = previousEnd ? previousEnd.slice(0, 7) + '-01' : '';
  const validScope = ['T1', 'T2'].includes(input.terminal) && (input.side === null || ['EAST', 'WEST'].includes(input.side));
  const window = validScope ? shiftWindow(input.day, input.hours) : null;
  const current = currentShift(input, window);
  const week = fillComparison(comparison('WEEK', previousDay, previousDay), input, window, current);
  const month = fillComparison(comparison('MONTH', previousStart, previousEnd), input, window, current);
  const ready = week.status === 'READY' && month.status === 'READY';
  const status = current.status === 'LOADING' ? 'LOADING'
    : current.confirmed === null ? 'INSUFFICIENT'
      : !ready || current.status !== 'READY' ? 'PARTIAL'
        : week.delta === 0 && month.delta === 0 ? 'NO_CHANGE' : 'READY';
  return { day: input.day, scope: { terminal: input.terminal, side: input.side,
    includesCenter: input.side !== null, includesConcourse: input.terminal === 'T1' && input.side === null },
    window, current, comparisons: { week, month }, status };
}

/** Serializable evidence for a saved briefing; nulls and coverage remain intact. */
export function serializeShiftBriefing(value: ShiftBriefing): string { return JSON.stringify(value); }

/** Refresh clocks alone are not a briefing change. Scope, values, coverage and
 * availability remain part of the signature, including a lost/recovered source. */
export function shiftBriefingSignature(value: ShiftBriefing): string {
  const current = value.current;
  return JSON.stringify({ day: value.day, scope: value.scope, window: value.window,
    current: { status: current.status, reason: current.reason, total: current.total,
      confirmed: current.confirmed, unverified: current.unverified, unknownBuilding: current.unknownBuilding,
      peak: current.peak, destinations: current.destinations, basis: current.basis, provisional: current.provisional,
      comparisonEligible: current.comparisonEligible },
    comparisons: value.comparisons, status: value.status });
}
