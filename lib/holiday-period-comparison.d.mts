export interface DailyObservation {
  country: string;
  date: string;
  value: number | null;
  complete: boolean;
  metric: string;
  scope: string;
}
export interface HolidayInterval { start: string; end: string }
export interface ComparisonQuery {
  country: string;
  metric: string;
  scope: string;
  month: string;
  /** User-selected completed-data window; must be within month, capped by asOf. */
  start: string;
  end: string;
  asOf: string;
  holiday: HolidayInterval;
  /** Other known official holidays, excluded from the comparison group. */
  excludedHolidayIntervals?: readonly HolidayInterval[];
}
export interface DailyCoverage {
  mean: number | null;
  sampleDays: number;
  expectedDays: number;
  /** 0..1; null if the group has no eligible days. */
  coverage: number | null;
  completeDates: string[];
  missingDates: string[];
}
export interface HolidayComparison {
  status: 'available' | 'unavailable';
  reason: null | 'no_elapsed_days' | 'mixed_metric_or_scope' | 'duplicate_date' | 'no_complete_daily_data' | 'insufficient_comparison_days';
  country: string;
  metric: string;
  scope: string;
  month: string;
  comparisonLabel: string;
  excludedDates: string[];
  window: { start: string; end: string; effectiveEnd: string | null; asOf: string };
  holiday: DailyCoverage;
  nonHoliday: DailyCoverage;
  /** Holiday completed-day mean divided by nonholiday completed-day mean. */
  ratio: number | null;
  /** (ratio - 1) * 100, not a causal estimate. */
  percentDifference: number | null;
}
export function compareHolidayPeriod(rows: readonly DailyObservation[], query: ComparisonQuery): HolidayComparison;
export function describeHolidayPeriod(holiday: HolidayInterval, asOf: string): {
  phase: 'upcoming' | 'ongoing' | 'ended'; text: string;
};
