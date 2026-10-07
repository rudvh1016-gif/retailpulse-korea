/**
 * "Compared with usual" for one area's current official population reading.
 *
 * Usual means the same weekday and the same clock time over recent weeks, on
 * the same source, definition and area mapping, from observations only:
 *
 *   - one reading per past date (the one closest to the same time, within
 *     ±10 minutes), so several readings on one day never count as several days;
 *   - at least four distinct valid dates before the word "usual" is used;
 *     with only last week, it says "compared with the same time last week";
 *   - a reading whose area code, source or schema differs from today's is
 *     not comparable and is left out, as is a date on a Korean public holiday;
 *   - ranges stay ranges: the verdict is higher / overlapping / lower than the
 *     envelope of the past ranges, never a percentage built from midpoints.
 *
 * Reads: one indexed seek per past week and one for the holiday months, so a
 * request costs a few dozen rows, never a scan of the history.
 */
export const USUAL_WEEKS = 8;
export const USUAL_MIN_DAYS = 4;
export const SLOT_TOLERANCE_MS = 10 * 60_000;

const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;
const kstIso = (ms: number) => `${new Date(ms + KST_MS).toISOString().slice(0, 19)}+09:00`;
const kstDayOfMs = (ms: number) => new Date(ms + KST_MS).toISOString().slice(0, 10);

export const USUAL_LATEST_SQL = `SELECT area, area_code AS areaCode, source_id AS sourceId, schema_version AS schemaVersion,
  quality_status AS qualityStatus, congestion_level AS congestionLevel,
  population_min AS populationMin, population_max AS populationMax, observed_at AS observedAt
FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1`;

/** One bounded statement per past week: D1 allows at most five UNION terms. */
export function usualBaselineStatements(area: string, observedAt: string, weeks = USUAL_WEEKS): Array<{ sql: string; binds: Array<string | number> }> {
  const at = Date.parse(observedAt);
  if (!Number.isFinite(at) || !Number.isInteger(weeks) || weeks < 1 || weeks > 12) throw new Error("invalid_usual_window");
  const statements = [];
  for (let week = 1; week <= weeks; week += 1) {
    const target = at - week * 7 * DAY_MS;
    statements.push({ sql: `SELECT * FROM (SELECT ? AS weekOffset, area_code AS areaCode, source_id AS sourceId, schema_version AS schemaVersion,
      quality_status AS qualityStatus, population_min AS populationMin, population_max AS populationMax, observed_at AS observedAt
      FROM seoul_realtime_area WHERE area = ? AND observed_at >= ? AND observed_at <= ? ORDER BY observed_at LIMIT 4)`,
    binds: [week, area, kstIso(target - SLOT_TOLERANCE_MS), kstIso(target + SLOT_TOLERANCE_MS)] });
  }
  return statements;
}

/** The months the past weeks fall in, so holidays can be checked for each date. */
export function holidayMonthsFor(observedAt: string, weeks = USUAL_WEEKS): string[] {
  const at = Date.parse(observedAt);
  const months = new Set<string>();
  for (let week = 0; week <= weeks; week += 1) months.add(kstDayOfMs(at - week * 7 * DAY_MS).slice(0, 7));
  return [...months].sort();
}

export function usualHolidaySql(count: number): string {
  if (!Number.isInteger(count) || count < 1 || count > 6) throw new Error("invalid_usual_window");
  return `SELECT month, payload FROM holiday_months WHERE month IN (${Array.from({ length: count }, () => "?").join(", ")})`;
}

/** Holiday dates from stored KASI months, or null when any needed month is missing. */
export function holidayDates(rows: ReadonlyArray<{ month?: unknown; payload?: unknown }>, months: readonly string[]): Set<string> | null {
  const found = new Map<string, string[]>();
  for (const row of rows) {
    try {
      const days = JSON.parse(String(row.payload)) as Array<{ date?: unknown }>;
      if (Array.isArray(days)) found.set(String(row.month), days.map((day) => String(day?.date ?? "")));
    } catch { /* an unreadable month counts as missing */ }
  }
  if (!months.every((month) => found.has(month))) return null;
  return new Set([...found.values()].flat());
}

export interface UsualRow {
  weekOffset?: unknown;
  areaCode?: unknown;
  sourceId?: unknown;
  schemaVersion?: unknown;
  qualityStatus?: unknown;
  congestionLevel?: unknown;
  populationMin?: unknown;
  populationMax?: unknown;
  observedAt?: unknown;
}

export type WeekStatus = "VALID" | "MISSING" | "INCOMPATIBLE" | "HOLIDAY";
export type UsualBasis = "USUAL" | "LAST_WEEK" | "COLLECTING" | "NO_CURRENT";
export type UsualVerdict = "HIGHER" | "OVERLAPS" | "LOWER";

export interface UsualComparison {
  area: string;
  basis: UsualBasis;
  verdict: UsualVerdict | null;
  current: { observedAt: string; min: number; max: number; level: number | null } | null;
  /** The envelope of the past ranges the verdict was taken against. */
  range: { min: number; max: number } | null;
  weeks: Array<{ weekOffset: number; date: string; status: WeekStatus; observedAt: string | null; min: number | null; max: number | null }>;
  validDays: number;
  /** "UNAVAILABLE" when holiday months are not stored: holidays could not be left out. */
  holidayCheck: "CHECKED" | "UNAVAILABLE";
  todayIsHoliday: boolean | null;
  generatedAt: string;
}

const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function validRange(row: UsualRow): { min: number; max: number } | null {
  const min = finite(row.populationMin), max = finite(row.populationMax);
  return min !== null && max !== null && min >= 0 && min <= max ? { min, max } : null;
}

export function compareWithUsual(input: {
  area: string;
  current: UsualRow | null;
  candidates: readonly UsualRow[];
  holidays: Set<string> | null;
  todayKst: string;
  generatedAt: string;
  weeks?: number;
}): UsualComparison {
  const weeksWanted = input.weeks ?? USUAL_WEEKS;
  const empty: UsualComparison = {
    area: input.area, basis: "NO_CURRENT", verdict: null, current: null, range: null, weeks: [], validDays: 0,
    holidayCheck: input.holidays ? "CHECKED" : "UNAVAILABLE",
    todayIsHoliday: input.holidays ? input.holidays.has(input.todayKst) : null,
    generatedAt: input.generatedAt,
  };
  const current = input.current;
  const currentRange = current ? validRange(current) : null;
  const currentAt = current ? Date.parse(String(current.observedAt)) : NaN;
  if (!current || current.qualityStatus !== "VALID" || !currentRange || !Number.isFinite(currentAt) || kstDayOfMs(currentAt) !== input.todayKst) return empty;

  const weeks: UsualComparison["weeks"] = [];
  for (let week = 1; week <= weeksWanted; week += 1) {
    const target = currentAt - week * 7 * DAY_MS;
    const date = kstDayOfMs(target);
    const rows = input.candidates.filter((row) => Number(row.weekOffset) === week);
    const comparable = rows.filter((row) => row.qualityStatus === "VALID" && row.areaCode === current.areaCode
      && row.sourceId === current.sourceId && row.schemaVersion === current.schemaVersion && validRange(row)
      && Math.abs(Date.parse(String(row.observedAt)) - target) <= SLOT_TOLERANCE_MS);
    const closest = comparable.sort((a, b) => Math.abs(Date.parse(String(a.observedAt)) - target) - Math.abs(Date.parse(String(b.observedAt)) - target))[0];
    const status: WeekStatus = input.holidays?.has(date) ? "HOLIDAY" : closest ? "VALID" : rows.length ? "INCOMPATIBLE" : "MISSING";
    const range = closest ? validRange(closest) : null;
    weeks.push({
      weekOffset: week, date, status,
      observedAt: status === "VALID" && closest ? String(closest.observedAt) : null,
      min: status === "VALID" ? range?.min ?? null : null,
      max: status === "VALID" ? range?.max ?? null : null,
    });
  }
  const valid = weeks.filter((week) => week.status === "VALID" && week.min !== null && week.max !== null);
  const lastWeek = weeks.find((week) => week.weekOffset === 1 && week.status === "VALID");
  const basis: UsualBasis = valid.length >= USUAL_MIN_DAYS ? "USUAL" : lastWeek ? "LAST_WEEK" : "COLLECTING";
  const pool = basis === "USUAL" ? valid : basis === "LAST_WEEK" && lastWeek ? [lastWeek] : [];
  const range = pool.length ? { min: Math.min(...pool.map((week) => week.min as number)), max: Math.max(...pool.map((week) => week.max as number)) } : null;
  const verdict: UsualVerdict | null = range
    ? currentRange.min > range.max ? "HIGHER" : currentRange.max < range.min ? "LOWER" : "OVERLAPS"
    : null;
  return {
    ...empty,
    basis,
    verdict,
    current: { observedAt: String(current.observedAt), min: currentRange.min, max: currentRange.max, level: finite(current.congestionLevel) },
    range,
    weeks,
    validDays: valid.length,
  };
}
