/**
 * A weekly look for one business type, built only from what the business
 * screen already holds: the usual comparison (population, same weekday and
 * time, 1/2/4 weeks back), the official daily station counts, Seoul's
 * current card-payment activity level for the mapped categories, and the
 * quarterly releases — each named for what it is.
 *
 *   - The industry-to-category mapping is explicit and shown to the reader.
 *   - Seoul's payment activity comes from Shinhan Card domestic cardholders;
 *     it is an activity level, never "sales", "foreign sales" or store sales.
 *   - Quarterly figures are labelled quarterly, never drawn as a weekly trend.
 *   - Nothing is summed from partial data.
 */
import type { LiveSummary } from "../app/live-signals";
import type { PrepPlace } from "./business-prep";
import type { IndustryId } from "./industry-guidance";
import type { RangeChange } from "./period-comparison";
import type { UsualComparison, WeekStatus } from "./usual-comparison";

/** Seoul's official category names each business type is read against. Pop-ups have none. */
export const INDUSTRY_CATEGORIES: Record<IndustryId, readonly string[]> = {
  beauty: ["화장품"],
  fashion: ["의류/잡화"],
  food: ["한식", "일식/중식/양식", "제과/커피/패스트푸드"],
  convenience: ["생활용품"],
  popup: [],
  tourism: ["숙박", "문화/취미"],
  // No Seoul category is an honest match for either; the review says so.
  liquor: [],
  luxury: [],
};

export type RangeVerdict = "HIGHER" | "OVERLAPS" | "LOWER";

export interface WeeklyReview {
  population: Array<{ weeks: 1 | 2 | 4; date: string | null; status: WeekStatus | "UNAVAILABLE"; verdict: RangeVerdict | null }> | null;
  subway: { stations: string | null; referenceDate: string; lastWeekTenths: number | null; fourWeekTenths: number | null } | null;
  categories: { mapped: readonly string[]; rows: Array<{ category: string; level: string | null }>; observedAt: string | null } | null;
  quarterly: { salesQuarter: string | null; storeQuarter: string | null } | null;
  airport: { terminal: "T1" | "T2"; passengers: Partial<Record<7 | 28, RangeChange | null>>; flights: Partial<Record<7 | 28, RangeChange | null>> } | null;
}

function verdict(current: { min: number; max: number }, past: { min: number | null; max: number | null }): RangeVerdict | null {
  if (past.min === null || past.max === null) return null;
  return current.min > past.max ? "HIGHER" : current.max < past.min ? "LOWER" : "OVERLAPS";
}

export function buildWeeklyReview(summary: LiveSummary, place: PrepPlace, industry: IndustryId, usual: UsualComparison | null | undefined): WeeklyReview {
  if (place.kind === "airport") {
    const periods = summary.airport?.periodComparisons?.[place.terminal];
    return {
      population: null, subway: null, categories: null, quarterly: null,
      airport: {
        terminal: place.terminal,
        passengers: { 7: periods?.[7]?.passengers ?? null, 28: periods?.[28]?.passengers ?? null },
        flights: { 7: periods?.[7]?.flightRecords ?? null, 28: periods?.[28]?.flightRecords ?? null },
      },
    };
  }
  const block = summary.areas[place.area];
  const population = ([1, 2, 4] as const).map((weeks) => {
    const week = usual?.weeks.find((row) => row.weekOffset === weeks);
    if (!usual || !usual.current || !week) return { weeks, date: week?.date ?? null, status: "UNAVAILABLE" as const, verdict: null };
    return { weeks, date: week.date, status: week.status, verdict: week.status === "VALID" ? verdict(usual.current, week) : null };
  });
  const trend = block?.subwayRidership?.trend;
  const context = block?.context ?? null;
  const mapped = INDUSTRY_CATEGORIES[industry];
  return {
    population,
    subway: block?.subwayRidership ? {
      stations: block.subwayRidership.selectedStations ?? null,
      referenceDate: block.subwayRidership.referenceDate,
      lastWeekTenths: trend?.sameWeekdayLastWeek?.changeTenthsPercent ?? null,
      fourWeekTenths: trend?.fourWeekSameWeekdayAverage?.changeTenthsPercent ?? null,
    } : null,
    categories: {
      mapped,
      rows: (context?.categories ?? []).filter((row) => mapped.includes(row.category)).map((row) => ({ category: row.category, level: row.level })),
      observedAt: context?.commercialAt ?? null,
    },
    quarterly: { salesQuarter: block?.sales?.quarterCode ?? null, storeQuarter: block?.storeDynamics?.quarterCode ?? null },
    airport: null,
  };
}
