import { rangeChange, type RangeChange } from "./period-comparison";
import { summarizePassengerForecast, type AirportForecastAggregateRow } from "./airport-today-summary";

/**
 * Month-to-date departure-hall forecast, and the same span of the month before.
 *
 * Two rules govern everything here, and both exist because a monthly figure is
 * the easiest number on the screen to quietly get wrong.
 *
 * 1. A DAY COUNTS ONLY IF IT IS COMPLETE, and completeness is decided by the
 *    same `summarizePassengerForecast` the daily screen uses — not by a second
 *    definition written for this file. A day missing an hour is not worth a
 *    fraction of a day; it is worth nothing, and the range says so. Treating a
 *    missing day as zero is the specific failure this guards: it produces a
 *    number that looks complete, reads low, and cannot be told apart from a
 *    genuinely quiet month.
 *
 * 2. TWO RANGES ARE COMPARED ONLY IF BOTH ARE COMPLETE and cover the same
 *    number of days. A 13-day month-to-date against a 12-day previous span is
 *    not growth, it is arithmetic about two different questions.
 */

export type MtdStatus = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export interface MtdDay {
  date: string;
  /** null when that day is not COMPLETE for this scope — never 0 as a stand-in. */
  total: number | null;
}

export interface MtdRange {
  start: string;
  end: string;
  /** Sum of the COMPLETE days only. null unless every day in the span is complete. */
  total: number | null;
  /** Calendar days the span covers, independent of what was collected. */
  expectedDays: number;
  completeDays: number;
  status: MtdStatus;
  /** Up to five dates that are not complete, so the screen can name one. */
  missingDates: string[];
}

export interface MonthToDate {
  current: MtdRange & { days: MtdDay[] };
  /**
   * null when the previous month has no same-numbered day (31 March has no
   * 31 February). Comparing 31 days to 28 would answer a different question,
   * so the range is withheld and the screen says why rather than silently
   * sliding to the month end.
   */
  previous: MtdRange | null;
  previousAbsentReason: "NO_SUCH_DAY" | null;
  /**
   * Growth, only when both ranges are COMPLETE and cover equal spans. Built
   * through `rangeChange` so the sub-resolution and zero-baseline rules that
   * already govern every other comparison on this site govern this one too:
   * a zero or negative previous total yields null rather than Infinity/NaN.
   */
  change: RangeChange | null;
}

const DAY_MS = 86_400_000;

/** "2026-09-13" -> "2026-09-01". Pure string work; no Date, no timezone drift. */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Calendar days in a KST month, from its own year/month numbers. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The same day-of-month one month earlier, or null when it does not exist.
 *
 * Returning null for 31 March is the point: every caller then has to decide
 * visibly what to show, and none of them can accidentally compare a 31-day
 * span against a 28-day one.
 */
export function previousMonthSameDay(date: string): string | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  if (day > daysInMonth(prevYear, prevMonth)) return null;
  return `${String(prevYear).padStart(4, "0")}-${String(prevMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Every calendar date from start to end inclusive, as KST day strings. */
export function datesBetween(start: string, end: string): string[] {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return [];
  const out: string[] = [];
  for (let at = first; at <= last; at += DAY_MS) out.push(new Date(at).toISOString().slice(0, 10));
  return out;
}

export type MtdScope = "all" | "T1" | "T2";

/**
 * Per-day totals for one scope, using the daily screen's own completeness rule.
 *
 * `all` requires BOTH terminals complete on that date with matching band grids,
 * exactly as the day view does, so a month total can never be a T1-only figure
 * wearing an all-airport label.
 */
function dayTotal(rows: AirportForecastAggregateRow[], date: string, scope: MtdScope): number | null {
  const summary = summarizePassengerForecast(rows, date, "departure");
  if (scope === "all") return summary.coverage.all === "COMPLETE" ? summary.total : null;
  return summary.coverage.byTerminal[scope] === "COMPLETE" ? summary.totalByTerminal[scope] ?? null : null;
}

export function summarizeRange(
  rowsByDate: Map<string, AirportForecastAggregateRow[]>,
  start: string,
  end: string,
  scope: MtdScope,
): MtdRange & { days: MtdDay[] } {
  const dates = datesBetween(start, end);
  const days: MtdDay[] = dates.map((date) => ({ date, total: dayTotal(rowsByDate.get(date) ?? [], date, scope) }));
  const complete = days.filter((day) => day.total !== null);
  const missingDates = days.filter((day) => day.total === null).map((day) => day.date);
  const status: MtdStatus = dates.length === 0 || complete.length === 0
    ? "UNAVAILABLE"
    : complete.length === dates.length ? "COMPLETE" : "PARTIAL";
  return {
    start,
    end,
    // A total is published only for a whole span. A partial sum carries no
    // honest label: it is neither the month so far nor any stated sub-period.
    total: status === "COMPLETE" ? complete.reduce((sum, day) => sum + (day.total ?? 0), 0) : null,
    expectedDays: dates.length,
    completeDays: complete.length,
    status,
    missingDates: missingDates.slice(0, 5),
    days,
  };
}

export function buildMonthToDate(
  rowsByDate: Map<string, AirportForecastAggregateRow[]>,
  serviceDate: string,
  scope: MtdScope,
): MonthToDate {
  const current = summarizeRange(rowsByDate, monthStartOf(serviceDate), serviceDate, scope);
  const previousEnd = previousMonthSameDay(serviceDate);
  // The previous span needs no per-day series — only its total and whether it
  // is whole — so the days are dropped rather than shipped to every client.
  const previousFull = previousEnd ? summarizeRange(rowsByDate, monthStartOf(previousEnd), previousEnd, scope) : null;
  const previous: MtdRange | null = previousFull
    ? {
      start: previousFull.start, end: previousFull.end, total: previousFull.total,
      expectedDays: previousFull.expectedDays, completeDays: previousFull.completeDays,
      status: previousFull.status, missingDates: previousFull.missingDates,
    }
    : null;
  const comparable = previous
    && current.status === "COMPLETE" && previous.status === "COMPLETE"
    && current.expectedDays === previous.expectedDays;
  return {
    current,
    previous,
    previousAbsentReason: previousEnd ? null : "NO_SUCH_DAY",
    change: comparable && current.total !== null && previous.total !== null
      ? rangeChange(current.total, current.total, previous.total, previous.total, `${previous.start}~${previous.end}`)
      : null,
  };
}
