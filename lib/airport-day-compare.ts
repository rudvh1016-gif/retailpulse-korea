/**
 * "What is different today" and "days like today" for one terminal's
 * departures, from day profiles built by one function
 * (lib/airport-day-profile.ts). Plain counting, ranking and a fixed distance;
 * nothing here explains a cause or predicts sales, visitors or staff.
 *
 * Three kinds of difference are kept apart and never merged into one verdict:
 *
 *   SINCE_LAST  values that changed since this device last looked at the same
 *               date and terminal (collection times alone never count);
 *   WEEKDAY     today against the same weekday in recent weeks: complete past
 *               days only, same definition; "usual" only with 4 or more days,
 *               otherwise the plain rank ("2nd of 3");
 *   WITHIN_DAY  the busiest hour inside today's own record, which never says
 *               "more than usual".
 *
 * Side shares are compared only between days classified with the same gate
 * table, so a table revision that confirms more gates is never read as more
 * flights on a side.
 */
import { DESTINATION_GROUPS, destinationOf, type DestinationGroup } from "./airport-destinations";
import type { DayProfile, TerminalProfile } from "./airport-day-profile";

export type ViewTerminal = "T1" | "T2";

/** One terminal's day, destinations already grouped. T1 includes the concourse (as the map does); sides are the main building's, as on the card. */
export interface TerminalDay {
  day: string;
  complete: boolean;
  sidesVersion: string;
  total: number;
  hours: number[];
  sides: [number, number, number, number];
  groups: Partial<Record<DestinationGroup, number>>;
}

export const WEEKDAY_WEEKS = 8;
export const USUAL_MIN_DAYS = 4;
export const MAX_ITEMS = 3;

export function groupDestinations(destinations: Record<string, number>): Partial<Record<DestinationGroup, number>> {
  const groups: Partial<Record<DestinationGroup, number>> = {};
  for (const [name, count] of Object.entries(destinations)) {
    const group = destinationOf(name)?.group ?? "UNKNOWN";
    groups[group] = (groups[group] ?? 0) + count;
  }
  return groups;
}

function merge(a: TerminalProfile, b: TerminalProfile | null): { total: number; hours: number[]; destinations: Record<string, number> } {
  if (!b) return { total: a.total, hours: [...a.hours], destinations: { ...a.destinations } };
  const destinations = { ...a.destinations };
  for (const [key, value] of Object.entries(b.destinations)) destinations[key] = (destinations[key] ?? 0) + value;
  return { total: a.total + b.total, hours: a.hours.map((value, hour) => value + (b.hours[hour] ?? 0)), destinations };
}

export function terminalDay(profile: DayProfile, terminal: ViewTerminal): TerminalDay {
  const scope = merge(profile[terminal], terminal === "T1" ? profile.CONCOURSE : null);
  return {
    day: profile.day, complete: profile.complete, sidesVersion: profile.sidesVersion,
    total: scope.total, hours: scope.hours, sides: [...profile[terminal].sides] as TerminalDay["sides"], groups: groupDestinations(scope.destinations),
  };
}

const weekday = (day: string) => new Date(`${day}T12:00:00+09:00`).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
export const eastShare = (day: TerminalDay) => day.sides[0] + day.sides[1] > 0 ? day.sides[0] / (day.sides[0] + day.sides[1]) : null;
export function busiestHour(day: TerminalDay): { hour: number; flights: number } | null {
  let best: { hour: number; flights: number } | null = null;
  day.hours.forEach((flights, hour) => { if (flights > 0 && (!best || flights > best.flights)) best = { hour, flights }; });
  return best;
}

/** Past complete days on the same weekday within the window, newest first. */
export function sameWeekdayDays(current: TerminalDay, history: readonly TerminalDay[], weeks = WEEKDAY_WEEKS): TerminalDay[] {
  return history
    .filter((day) => day.complete && day.day < current.day && daysBetween(current.day, day.day) <= weeks * 7 && weekday(day.day) === weekday(current.day) && day.total > 0)
    .sort((a, b) => b.day.localeCompare(a.day));
}

export interface Standing {
  value: number;
  past: number[];
  /** 1 = the largest among today and the past days. */
  rank: number;
  of: number;
  min: number;
  max: number;
  verdict: "ABOVE" | "BELOW" | "WITHIN";
  /** True when there are enough days to call the range "usual". */
  usual: boolean;
}

export function standing(value: number, past: readonly number[]): Standing | null {
  if (!past.length || !Number.isFinite(value)) return null;
  const min = Math.min(...past), max = Math.max(...past);
  return {
    value, past: [...past], rank: 1 + past.filter((other) => other > value).length, of: past.length + 1, min, max,
    verdict: value > max ? "ABOVE" : value < min ? "BELOW" : "WITHIN", usual: past.length >= USUAL_MIN_DAYS,
  };
}

export type RadarItem =
  | { kind: "WEEKDAY_TOTAL"; standing: Standing; days: string[]; score: number }
  | { kind: "WEEKDAY_EAST_SHARE"; standing: Standing; days: string[]; score: number }
  | { kind: "WEEKDAY_GROUP"; group: DestinationGroup; standing: Standing; days: string[]; score: number }
  | { kind: "SINCE_LAST"; checkedAt: string; changes: Array<{ what: "TOTAL" | "EAST" | "WEST" | DestinationGroup; before: number; after: number }>; score: number }
  | { kind: "HOLIDAY"; country: string; name: string; score: number }
  | { kind: "WITHIN_DAY_PEAK"; hour: number; flights: number; score: number };

/** What this device remembered last time for the same date and terminal (values only). */
export interface LastSeen {
  date: string;
  terminal: ViewTerminal;
  checkedAt: string;
  total: number;
  east: number;
  west: number;
  groups: Partial<Record<DestinationGroup, number>>;
}

export function lastSeenOf(current: TerminalDay, terminal: ViewTerminal, checkedAt: string): LastSeen {
  return { date: current.day, terminal, checkedAt, total: current.total, east: current.sides[0], west: current.sides[1], groups: { ...current.groups } };
}

/**
 * At most three items, chosen by a fixed rule:
 *   1. same-weekday values outside the past range, largest relative gap first
 *      (a destination group only when it averages at least 3 flights);
 *   2. value changes since this device's last look at the same date and terminal;
 *   3. an official CN/JP holiday on the date, as a reference;
 *   4. the busiest hour of today's own record.
 * A value inside the past range is not "different" and is not listed.
 */
export function radar(input: {
  current: TerminalDay;
  history: readonly TerminalDay[];
  lastSeen?: LastSeen | null;
  terminal: ViewTerminal;
  holidays?: ReadonlyArray<{ country: string; name: string }>;
}): { items: RadarItem[]; weekdayDays: TerminalDay[] } {
  const { current, terminal } = input;
  const weekdayDays = sameWeekdayDays(current, input.history);
  const days = weekdayDays.map((day) => day.day);
  const candidates: RadarItem[] = [];
  const outside = (s: Standing, scale: number) => s.verdict === "WITHIN" ? 0 : (s.verdict === "ABOVE" ? s.value - s.max : s.min - s.value) / scale;
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

  if (current.total > 0 && weekdayDays.length) {
    const total = standing(current.total, weekdayDays.map((day) => day.total));
    if (total && total.verdict !== "WITHIN") candidates.push({ kind: "WEEKDAY_TOTAL", standing: total, days, score: 10 + outside(total, Math.max(1, mean(total.past))) });
    const sameTable = weekdayDays.filter((day) => day.sidesVersion === current.sidesVersion && eastShare(day) !== null);
    const share = eastShare(current);
    if (share !== null && sameTable.length) {
      const s = standing(Math.round(share * 1000) / 10, sameTable.map((day) => Math.round((eastShare(day) as number) * 1000) / 10));
      if (s && s.verdict !== "WITHIN") candidates.push({ kind: "WEEKDAY_EAST_SHARE", standing: s, days: sameTable.map((day) => day.day), score: 10 + outside(s, 100) });
    }
    for (const group of DESTINATION_GROUPS) {
      if (group === "UNKNOWN") continue;
      const past = weekdayDays.map((day) => day.groups[group] ?? 0);
      if (mean(past) < 3) continue;
      const s = standing(current.groups[group] ?? 0, past);
      if (s && s.verdict !== "WITHIN") candidates.push({ kind: "WEEKDAY_GROUP", group, standing: s, days, score: 10 + outside(s, Math.max(1, mean(past))) });
    }
  }
  const last = input.lastSeen;
  if (last && last.date === current.day && last.terminal === terminal) {
    const changes: Array<{ what: "TOTAL" | "EAST" | "WEST" | DestinationGroup; before: number; after: number }> = [];
    if (last.total !== current.total) changes.push({ what: "TOTAL", before: last.total, after: current.total });
    if (last.east !== current.sides[0]) changes.push({ what: "EAST", before: last.east, after: current.sides[0] });
    if (last.west !== current.sides[1]) changes.push({ what: "WEST", before: last.west, after: current.sides[1] });
    for (const group of DESTINATION_GROUPS) {
      const before = last.groups[group] ?? 0, after = current.groups[group] ?? 0;
      if (before !== after) changes.push({ what: group, before, after });
    }
    if (changes.length) candidates.push({ kind: "SINCE_LAST", checkedAt: last.checkedAt, changes: changes.slice(0, 4), score: 5 + Math.min(1, changes.reduce((sum, change) => sum + Math.abs(change.after - change.before), 0) / 100) });
  }
  for (const day of input.holidays ?? []) candidates.push({ kind: "HOLIDAY", country: day.country, name: day.name, score: 3 });
  const peak = busiestHour(current);
  if (peak) candidates.push({ kind: "WITHIN_DAY_PEAK", hour: peak.hour, flights: peak.flights, score: 1 });
  candidates.sort((a, b) => b.score - a.score);
  return { items: candidates.slice(0, MAX_ITEMS), weekdayDays };
}

export interface SimilarDay {
  day: TerminalDay;
  /** Weighted mean of the available component distances, each 0 (same) .. 1 (fully different). */
  distance: number;
  components: Array<{ name: "TOTAL" | "HOURS" | "EAST_SHARE" | "DESTINATIONS" | "WEEKDAY" | "HOLIDAY"; distance: number }>;
  /** Components that could not be compared (never counted as 0). */
  missing: string[];
}

const variation = (a: readonly number[], b: readonly number[]) => {
  const sa = a.reduce((x, y) => x + y, 0), sb = b.reduce((x, y) => x + y, 0);
  if (!(sa > 0) || !(sb > 0)) return null;
  return a.reduce((sum, value, index) => sum + Math.abs(value / sa - (b[index] ?? 0) / sb), 0) / 2;
};

/**
 * Up to three past days most like the current one. Every component is scaled
 * to 0..1. The four measured components weigh 1 each; the two calendar flags
 * weigh 0.5, because they jump straight from 0 to 1 while a measured
 * difference is graded, and a full weight let a day of another weekday with an
 * identical flight pattern lose to a same-weekday day of a clearly different
 * size:
 *   TOTAL        |a − b| / max(a, b)
 *   HOURS        half the sum of |share_a(h) − share_b(h)| over 24 hours
 *   EAST_SHARE   |east share a − east share b| (same gate table only)
 *   DESTINATIONS half the sum of |share_a(g) − share_b(g)| over groups
 *   WEEKDAY      0 same weekday, 1 otherwise
 *   HOLIDAY      0 same holiday status, 1 otherwise (when both are known)
 * A day qualifies only if TOTAL and HOURS can be compared. Ties go to the
 * more recent day. The number is a ranking aid, not an accuracy.
 */
export function similarDays(input: {
  current: TerminalDay;
  history: readonly TerminalDay[];
  isHoliday?: (day: string) => boolean | null;
  limit?: number;
}): SimilarDay[] {
  const { current } = input;
  const groupsOf = (day: TerminalDay) => DESTINATION_GROUPS.map((group) => day.groups[group] ?? 0);
  const result: SimilarDay[] = [];
  for (const day of input.history) {
    if (!day.complete || day.day >= current.day || day.total <= 0 || current.total <= 0) continue;
    const components: SimilarDay["components"] = [];
    const missing: string[] = [];
    components.push({ name: "TOTAL", distance: Math.abs(current.total - day.total) / Math.max(current.total, day.total) });
    const hours = variation(current.hours, day.hours);
    if (hours === null) continue;
    components.push({ name: "HOURS", distance: hours });
    const ea = eastShare(current), eb = eastShare(day);
    if (ea !== null && eb !== null && day.sidesVersion === current.sidesVersion) components.push({ name: "EAST_SHARE", distance: Math.abs(ea - eb) });
    else missing.push("EAST_SHARE");
    const destinations = variation(groupsOf(current), groupsOf(day));
    if (destinations !== null) components.push({ name: "DESTINATIONS", distance: destinations });
    else missing.push("DESTINATIONS");
    components.push({ name: "WEEKDAY", distance: weekday(day.day) === weekday(current.day) ? 0 : 1 });
    const holidayA = input.isHoliday?.(current.day) ?? null, holidayB = input.isHoliday?.(day.day) ?? null;
    if (holidayA !== null && holidayB !== null) components.push({ name: "HOLIDAY", distance: holidayA === holidayB ? 0 : 1 });
    else missing.push("HOLIDAY");
    const weight = (name: SimilarDay["components"][number]["name"]) => (name === "WEEKDAY" || name === "HOLIDAY" ? 0.5 : 1);
    const distance = components.reduce((sum, component) => sum + weight(component.name) * component.distance, 0)
      / components.reduce((sum, component) => sum + weight(component.name), 0);
    result.push({ day, distance, components, missing });
  }
  return result.sort((a, b) => a.distance - b.distance || b.day.day.localeCompare(a.day.day)).slice(0, input.limit ?? 3);
}
