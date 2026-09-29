/**
 * "What changed since you last looked", kept on this device only.
 *
 * A snapshot holds the official values for the hours still ahead — crowding
 * level and chance of rain per hour, the airport's expected departures per
 * band — plus the event count, the holiday names and which actions fired.
 * Issue and collection times are deliberately not in it: a re-collection that
 * changed no value is not a change.
 *
 * Only the same place, service date and hours are ever compared, and only
 * for hours present in both snapshots and still ahead now, so time passing is
 * never reported as a change. The ledger is bounded, and nothing leaves the
 * device.
 */
import type { BusinessHours, BusinessPrep, PrepInput, PrepPlace, PrepRule } from "./business-prep";

export const LAST_CHECK_KEY = "koretail-last-check-v1";
export const LAST_CHECK_LIMIT = 20;
export const MAX_CHANGES = 5;

export interface CheckSignature {
  crowd: Record<string, number>;
  rain: Record<string, number>;
  airport: Record<string, number>;
  events: number;
  holidays: string[];
  actions: PrepRule[];
}

export interface CheckSnapshot {
  v: 1;
  place: string;
  date: string;
  hours: string;
  checkedAt: string;
  signature: CheckSignature;
}

export function placeKey(place: PrepPlace): string {
  return place.kind === "airport" ? `airport:${place.terminal}` : `area:${place.area}`;
}

export function hoursKey(hours: BusinessHours | null): string {
  return hours ? `${hours.open}-${hours.close}` : "day";
}

export function snapshotOf(input: PrepInput, prep: BusinessPrep, checkedAt: string): CheckSnapshot {
  const start = Date.parse(prep.remainingStartAt), end = Date.parse(prep.window.endAt);
  const inWindow = (iso: string) => {
    const at = Date.parse(iso);
    return Number.isFinite(at) && at >= start && at < end;
  };
  const crowd: Record<string, number> = {}, rain: Record<string, number> = {}, airport: Record<string, number> = {};
  for (const row of input.forecast ?? []) if (inWindow(row.targetAt) && row.congestionLevel >= 1 && row.congestionLevel <= 4) crowd[row.targetAt] = row.congestionLevel;
  for (const row of input.weather ?? []) if (inWindow(row.targetAt) && typeof row.precipitationProbability === "number") rain[row.targetAt] = row.precipitationProbability;
  for (const band of input.airport?.bands ?? []) if (inWindow(band.targetStartAt) && Number.isFinite(band.expectedPassengers)) airport[band.targetStartAt] = band.expectedPassengers;
  const events = prep.facts.find((fact) => fact.kind === "EVENTS");
  return {
    v: 1,
    place: placeKey(input.place),
    date: input.serviceDate,
    hours: hoursKey(input.hours),
    checkedAt,
    signature: {
      crowd, rain, airport,
      events: events && events.kind === "EVENTS" ? events.count : 0,
      holidays: prep.facts.flatMap((fact) => (fact.kind === "HOLIDAY" ? [`${fact.country}:${fact.name}`] : [])).sort(),
      actions: prep.actions.map((action) => action.rule).sort(),
    },
  };
}

export type CheckChange =
  | { kind: "CROWD"; at: string; from: number; to: number }
  | { kind: "RAIN"; at: string; from: number; to: number }
  | { kind: "AIRPORT"; at: string; from: number; to: number }
  | { kind: "EVENTS"; from: number; to: number }
  | { kind: "HOLIDAYS"; from: string[]; to: string[] }
  | { kind: "ACTION_ADDED"; rule: PrepRule }
  | { kind: "ACTION_REMOVED"; rule: PrepRule };

/** A rain change counts when it crosses the 50% action line or moves 20 points. */
const RAIN_STEP = 20;
/** An airport band counts when it moves 10% or more. */
const AIRPORT_RATIO = 0.1;

export function diffSnapshots(before: CheckSnapshot, after: CheckSnapshot, nowIso: string): CheckChange[] {
  if (before.place !== after.place || before.date !== after.date || before.hours !== after.hours) return [];
  const now = Date.parse(nowIso);
  const ahead = (at: string) => Date.parse(at) >= now - 3_600_000 + 1;
  const shared = (a: Record<string, number>, b: Record<string, number>) => Object.keys(b).filter((at) => at in a && ahead(at)).sort();
  const changes: CheckChange[] = [];
  for (const rule of after.signature.actions) if (!before.signature.actions.includes(rule)) changes.push({ kind: "ACTION_ADDED", rule });
  for (const rule of before.signature.actions) if (!after.signature.actions.includes(rule)) changes.push({ kind: "ACTION_REMOVED", rule });
  for (const at of shared(before.signature.crowd, after.signature.crowd)) {
    const from = before.signature.crowd[at], to = after.signature.crowd[at];
    if (from !== to) changes.push({ kind: "CROWD", at, from, to });
  }
  for (const at of shared(before.signature.rain, after.signature.rain)) {
    const from = before.signature.rain[at], to = after.signature.rain[at];
    if ((from >= 50) !== (to >= 50) || Math.abs(from - to) >= RAIN_STEP) changes.push({ kind: "RAIN", at, from, to });
  }
  for (const at of shared(before.signature.airport, after.signature.airport)) {
    const from = before.signature.airport[at], to = after.signature.airport[at];
    if (from > 0 && Math.abs(to - from) / from >= AIRPORT_RATIO) changes.push({ kind: "AIRPORT", at, from, to });
  }
  if (before.signature.events !== after.signature.events) changes.push({ kind: "EVENTS", from: before.signature.events, to: after.signature.events });
  if (before.signature.holidays.join("|") !== after.signature.holidays.join("|")) changes.push({ kind: "HOLIDAYS", from: before.signature.holidays, to: after.signature.holidays });
  return changes.slice(0, MAX_CHANGES);
}

function isSnapshot(value: unknown): value is CheckSnapshot {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  const signature = entry.signature as Record<string, unknown> | undefined;
  const numbers = (map: unknown) => !!map && typeof map === "object" && !Array.isArray(map)
    && Object.values(map as Record<string, unknown>).every((number) => typeof number === "number" && Number.isFinite(number));
  return entry.v === 1 && typeof entry.place === "string" && typeof entry.date === "string" && typeof entry.hours === "string"
    && typeof entry.checkedAt === "string" && Number.isFinite(Date.parse(entry.checkedAt)) && !!signature
    && numbers(signature.crowd) && numbers(signature.rain) && numbers(signature.airport)
    && typeof signature.events === "number" && Array.isArray(signature.holidays) && Array.isArray(signature.actions);
}

/** Strict and bounded: anything unrecognised is dropped rather than half-read. */
export function parseLedger(raw: string | null | undefined): CheckSnapshot[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter(isSnapshot).slice(-LAST_CHECK_LIMIT) : [];
  } catch {
    return [];
  }
}

export function findPrevious(ledger: readonly CheckSnapshot[], snapshot: CheckSnapshot): CheckSnapshot | null {
  return [...ledger].reverse().find((entry) => entry.place === snapshot.place && entry.date === snapshot.date && entry.hours === snapshot.hours) ?? null;
}

export function withSnapshot(ledger: readonly CheckSnapshot[], snapshot: CheckSnapshot): CheckSnapshot[] {
  const others = ledger.filter((entry) => !(entry.place === snapshot.place && entry.date === snapshot.date && entry.hours === snapshot.hours));
  return [...others, snapshot].slice(-LAST_CHECK_LIMIT);
}
