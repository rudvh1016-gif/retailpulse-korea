import type { RangeChange } from './period-comparison';

export type DemandLang = 'ko' | 'en' | 'zh' | 'ja';
export interface PopulationRange { populationMin: number; populationMax: number }
export interface PopulationObservation extends PopulationRange { observedAt: string }
export interface PopulationForecast extends PopulationRange { targetAt: string; issuedAt?: string; retrievedAt?: string }
export interface FlowPoint extends PopulationRange { at: string; time: number; kind: 'observed' | 'forecast'; issuedAt?: string; retrievedAt?: string }

export function validPopulationRange(row: PopulationRange | null | undefined): row is PopulationRange {
  return !!row && Number.isFinite(row.populationMin) && Number.isFinite(row.populationMax)
    && row.populationMin >= 0 && row.populationMax >= row.populationMin;
}
export function kstDay(value: string | number): string {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 9 * 3_600_000).toISOString().slice(0, 10) : '';
}
export function kstStamp(value: string | number): string {
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? new Date(time + 9 * 3_600_000).toISOString().slice(5, 16).replace('T', ' ') : '—';
}
export function peopleRange(row: PopulationRange, lang: DemandLang): string {
  const locale = lang === 'zh' ? 'zh-CN' : lang;
  return `${row.populationMin.toLocaleString(locale)}–${row.populationMax.toLocaleString(locale)}`;
}
export function compactPeople(value: number, lang: DemandLang): string {
  return new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : lang, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** The server already checks area/source/schema/unit compatibility and computes
 * rangeChange. Keep that result, but reject a malformed or wrong-time baseline. */
export function usableComparison(row: (PopulationObservation & { comparisons?: Partial<Record<7 | 28, RangeChange | null>> }) | null | undefined, days: 7 | 28): RangeChange | null {
  const change = row?.comparisons?.[days];
  if (!row || !validPopulationRange(row) || !change || !Number.isFinite(change.minPercent)
    || !Number.isFinite(change.maxPercent) || change.minPercent > change.maxPercent) return null;
  return Date.parse(row.observedAt) - Date.parse(change.baselineAt) === days * 86_400_000 ? change : null;
}

/** No new read: use only observations and the published forecast in the summary.
 * A past/future selected day must never inherit today's observation. */
export function populationFlow(input: {
  realtime?: PopulationObservation | null; observedSeries?: PopulationObservation[];
  realtimeForecast?: PopulationForecast[]; serviceDate: string; isToday: boolean; now: number;
}): FlowPoint[] {
  const observations = [...(input.observedSeries ?? []), ...(input.realtime ? [input.realtime] : [])];
  const points = new Map<string, FlowPoint>();
  for (const row of observations) {
    const time = Date.parse(row.observedAt);
    if (!validPopulationRange(row) || !Number.isFinite(time) || time > input.now || kstDay(time) !== input.serviceDate) continue;
    points.set(`observed:${time}`, { ...row, at: row.observedAt, time, kind: 'observed' });
  }
  for (const row of input.realtimeForecast ?? []) {
    const time = Date.parse(row.targetAt);
    if (!validPopulationRange(row) || !Number.isFinite(time) || time < input.now
      || (!input.isToday && kstDay(time) !== input.serviceDate)
      || (row.issuedAt && (!Number.isFinite(Date.parse(row.issuedAt)) || Date.parse(row.issuedAt) > input.now))) continue;
    points.set(`forecast:${time}`, { ...row, at: row.targetAt, time, kind: 'forecast' });
  }
  return [...points.values()].sort((a, b) => a.time - b.time || a.kind.localeCompare(b.kind));
}

/** Do not bridge absent observations or skipped hourly targets. The chart uses
 * straight range boundaries (no splines, midpoint line, or synthetic values).
 * Observation continuity is deliberately conservative: only adjacent provider
 * five-minute timestamps may connect; sparser observations remain intervals. */
export function flowSegments(points: FlowPoint[]): FlowPoint[][] {
  const segments: FlowPoint[][] = [];
  for (const point of points) {
    const segment = segments.at(-1), previous = segment?.at(-1);
    const cadence = point.kind === 'forecast' ? 3_600_000 : 5 * 60_000;
    if (previous && previous.kind === point.kind && point.time - previous.time === cadence
      && (point.kind !== 'forecast' || previous.issuedAt === point.issuedAt)) segment!.push(point);
    else segments.push([point]);
  }
  return segments;
}
