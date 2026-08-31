/**
 * KST date helpers shared by the API, the briefs and the date navigation.
 *
 * Canonical rows are stored with an explicit `+09:00` offset. Comparing those
 * against a UTC `...Z` string lexicographically is wrong for nine hours of
 * every day, so every comparison key here is built in the same offset space
 * the rows use.
 */

export const KST_OFFSET_MS = 9 * 3_600_000;

/** `YYYY-MM-DD` for the KST day containing `nowIso`. */
export function kstDayOf(nowIso: string): string {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("invalid_kst_instant");
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Current KST wall-clock instant as a comparable `+09:00` string. */
export function kstNowIsoOf(nowIso: string): string {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("invalid_kst_instant");
  return `${new Date(now + KST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

/**
 * Start of the current KST hour, as a comparable `+09:00` string.
 *
 * Hourly forecast bands are keyed by their start, so filtering with the exact
 * current instant silently drops the band the reader is standing in.
 */
export function kstHourStartIsoOf(nowIso: string): string {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("invalid_kst_instant");
  return `${new Date(now + KST_OFFSET_MS).toISOString().slice(0, 13)}:00:00+09:00`;
}

/** Shifts a `YYYY-MM-DD` KST day by whole days, using calendar arithmetic only. */
export function shiftKstDay(day: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error("invalid_kst_day");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays))
    .toISOString().slice(0, 10);
}

/** True for a well-formed, real `YYYY-MM-DD` calendar day. */
export function isValidKstDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** Day boundaries for a KST service day, in the `+09:00` space rows are stored in. */
export function kstDayBounds(day: string): { startAt: string; endAt: string } {
  return { startAt: `${day}T00:00:00+09:00`, endAt: `${shiftKstDay(day, 1)}T00:00:00+09:00` };
}

export type DayRelation = "PAST" | "TODAY" | "FUTURE";

export function relateKstDay(day: string, todayKst: string): DayRelation {
  if (day === todayKst) return "TODAY";
  return day < todayKst ? "PAST" : "FUTURE";
}
