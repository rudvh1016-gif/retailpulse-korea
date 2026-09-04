import type { AreaId } from "./areas";
import { isValidKstDay, shiftKstDay } from "./kst";
import {
  SEOUL_SUBWAY_DATASET_ID,
  SEOUL_SUBWAY_MAPPING_VERSION,
  SEOUL_SUBWAY_SOURCE_ID,
  SUBWAY_AREA_STATIONS,
  SUBWAY_STATION_FIELD_SEPARATOR,
} from "./subway-ridership";

/**
 * The collector only receives a short recent window from OA-22723. KORETAIL
 * keeps one compact observation per station/day, and the public summary reads
 * at most this many stored observations. No provider request is made here.
 *
 * Twenty-nine days is the smallest window that can contain D, D-1...D-7 and
 * every exact D-7/D-14/D-21/D-28 observation needed by the strongest
 * currently defensible comparisons.
 */
export const SUBWAY_TREND_WINDOW_DAYS = 29;

export interface SubwayTrendComparison {
  /** Exact stored dates used as the baseline; never an inferred/backfilled day. */
  baselineDates: string[];
  /** The integer count, or rounded arithmetic mean, used as display context. */
  baselineAlightingCount: number;
  /** Tenths of one percent: 124 means +12.4%. */
  changeTenthsPercent: number;
}

export interface SubwayTrendSummary {
  /** Valid, exact-scope observations returned by the bounded history read. */
  observedDayCount: number;
  earliestReferenceDate: string;
  previousDay: SubwayTrendComparison | null;
  sameWeekdayLastWeek: SubwayTrendComparison | null;
  recentSevenDayAverage: SubwayTrendComparison | null;
  fourWeekSameWeekdayAverage: SubwayTrendComparison | null;
}

export interface SubwayTrendLatest {
  referenceDate: string;
  boardingCount: number;
  alightingCount: number;
  selectedStationCount: number;
  selectedStations: string;
  retrievedAt: string;
  datasetId: typeof SEOUL_SUBWAY_DATASET_ID;
  mappingVersion: typeof SEOUL_SUBWAY_MAPPING_VERSION;
}

export interface SubwayTrendResult {
  latest: SubwayTrendLatest;
  trend: SubwayTrendSummary;
}

type StoredSubwayRow = Record<string, unknown>;

interface ExactSubwayDay {
  referenceDate: string;
  boardingCount: number;
  alightingCount: number;
  retrievedAt: string;
}

function nonNegativeSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function exactStoredDay(area: AreaId, row: StoredSubwayRow): ExactSubwayDay | null {
  // The product mapping deliberately contains exactly one eponymous station
  // per area. If that contract changes, trend aggregation needs an explicit
  // product decision instead of silently adding nearby stations.
  const stations = SUBWAY_AREA_STATIONS[area];
  if (stations.length !== 1) return null;
  const station = stations[0];

  if (row.area !== area
    || row.sourceId !== SEOUL_SUBWAY_SOURCE_ID
    || row.datasetId !== SEOUL_SUBWAY_DATASET_ID
    || row.mappingVersion !== SEOUL_SUBWAY_MAPPING_VERSION
    || row.recordOrigin !== "OFFICIAL_DAILY"
    || row.qualityStatus !== "VALID"
    || row.stationCode !== station.stationCode
    || row.stationNumber !== station.stationNumber
    || row.stationName !== station.stationName
    || row.lineName !== station.lineName
    || !isValidKstDay(row.referenceDate)
    || typeof row.retrievedAt !== "string"
    || row.retrievedAt.length === 0) return null;

  const boardingCount = nonNegativeSafeInteger(row.boardingCount);
  const alightingCount = nonNegativeSafeInteger(row.alightingCount);
  if (boardingCount === null || alightingCount === null) return null;
  return { referenceDate: row.referenceDate, boardingCount, alightingCount, retrievedAt: row.retrievedAt };
}

function normalizeTenths(value: number): number | null {
  if (!Number.isSafeInteger(value)) return null;
  return Object.is(value, -0) ? 0 : value;
}

/** `(current / baseline - 1) × 100`, stored in tenths of one percent. */
function compareOne(current: number, baseline: ExactSubwayDay | undefined): SubwayTrendComparison | null {
  if (!baseline || baseline.alightingCount <= 0) return null;
  const numerator = (current - baseline.alightingCount) * 1_000;
  if (!Number.isSafeInteger(numerator)) return null;
  const changeTenthsPercent = normalizeTenths(Math.round(numerator / baseline.alightingCount));
  if (changeTenthsPercent === null) return null;
  return {
    baselineDates: [baseline.referenceDate],
    baselineAlightingCount: baseline.alightingCount,
    changeTenthsPercent,
  };
}

/**
 * Compares against an arithmetic mean without first rounding that mean:
 * `(current * n / sum - 1) × 1000` gives tenths of one percent directly.
 */
function compareAverage(current: number, baselines: readonly ExactSubwayDay[]): SubwayTrendComparison | null {
  if (!baselines.length) return null;
  const sum = baselines.reduce((total, row) => total + row.alightingCount, 0);
  if (!Number.isSafeInteger(sum) || sum <= 0) return null;
  const scaledDifference = (current * baselines.length - sum) * 1_000;
  if (!Number.isSafeInteger(scaledDifference)) return null;
  const changeTenthsPercent = normalizeTenths(Math.round(scaledDifference / sum));
  if (changeTenthsPercent === null) return null;
  return {
    baselineDates: baselines.map((row) => row.referenceDate),
    baselineAlightingCount: Math.round(sum / baselines.length),
    changeTenthsPercent,
  };
}

/**
 * Builds alighting context from real stored history only.
 *
 * Rows outside the exact product station/source/mapping/origin/quality scope
 * are discarded. Missing dates stay missing: no backfill, zero substitution,
 * or nearest-day matching is allowed.
 */
export function summarizeSubwayTrend(
  area: AreaId,
  rows: readonly StoredSubwayRow[],
): SubwayTrendResult | null {
  const byDate = new Map<string, ExactSubwayDay>();
  const duplicateDates = new Set<string>();
  for (const row of rows) {
    const exact = exactStoredDay(area, row);
    if (!exact || duplicateDates.has(exact.referenceDate)) continue;
    // A duplicate exact day cannot exist under the Production unique index.
    // If a malformed test/double nevertheless provides one, discard that day
    // completely: choosing either conflicting value would be an invention.
    if (byDate.has(exact.referenceDate)) {
      byDate.delete(exact.referenceDate);
      duplicateDates.add(exact.referenceDate);
    } else {
      byDate.set(exact.referenceDate, exact);
    }
  }

  const days = [...byDate.values()]
    .sort((left, right) => right.referenceDate.localeCompare(left.referenceDate))
    .slice(0, SUBWAY_TREND_WINDOW_DAYS);
  const latest = days[0];
  if (!latest) return null;

  const windowByDate = new Map(days.map((day) => [day.referenceDate, day]));
  const baseline = (delta: number) => windowByDate.get(shiftKstDay(latest.referenceDate, -delta));
  const recentSeven = Array.from({ length: 7 }, (_, index) => baseline(index + 1));
  const fourSameWeekday = [7, 14, 21, 28].map(baseline);
  const station = SUBWAY_AREA_STATIONS[area][0];

  return {
    latest: {
      referenceDate: latest.referenceDate,
      boardingCount: latest.boardingCount,
      alightingCount: latest.alightingCount,
      selectedStationCount: 1,
      selectedStations: `${station.stationName}${SUBWAY_STATION_FIELD_SEPARATOR}${station.lineName}`,
      retrievedAt: latest.retrievedAt,
      datasetId: SEOUL_SUBWAY_DATASET_ID,
      mappingVersion: SEOUL_SUBWAY_MAPPING_VERSION,
    },
    trend: {
      observedDayCount: days.length,
      earliestReferenceDate: days.at(-1)!.referenceDate,
      previousDay: compareOne(latest.alightingCount, baseline(1)),
      sameWeekdayLastWeek: compareOne(latest.alightingCount, baseline(7)),
      recentSevenDayAverage: recentSeven.every(Boolean)
        ? compareAverage(latest.alightingCount, recentSeven as ExactSubwayDay[])
        : null,
      fourWeekSameWeekdayAverage: fourSameWeekday.every(Boolean)
        ? compareAverage(latest.alightingCount, fourSameWeekday as ExactSubwayDay[])
        : null,
    },
  };
}
