import type { RangeChange } from './period-comparison';

export type DemandLang = 'ko' | 'en' | 'zh' | 'ja';
export interface PopulationRange { populationMin: number; populationMax: number }
interface PopulationContinuity { sourceId?: string; schemaVersion?: string; gapBefore?: boolean }
export interface PopulationObservation extends PopulationRange, PopulationContinuity { observedAt: string }
export interface PopulationForecast extends PopulationRange { targetAt: string; issuedAt?: string; retrievedAt?: string }
export interface FlowPoint extends PopulationRange, PopulationContinuity { at: string; time: number; kind: 'observed' | 'forecast'; issuedAt?: string; retrievedAt?: string }

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

/** Axis labels use elapsed KST time, never the number/density of samples.
 * Keep midnight first so a date change survives narrow screens; other labels
 * yield when their actual pixel positions would collide. No data is resampled. */
export function populationTicks(start: number, end: number, plotWidth: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  if (start === end) return [start];
  const gap = 72, limit = Math.max(2, Math.min(6, Math.floor(plotWidth / gap) + 1));
  const hour = 3_600_000, offset = 9 * hour;
  const desired = (end - start) / (limit - 1);
  const step = [.25, .5, 1, 2, 3, 4, 6, 12, 24, 48, 168].map(v => v * hour).find(v => v >= desired) ?? Math.ceil(desired / (24 * hour)) * 24 * hour;
  const midnight: number[] = [];
  for (let t = Math.floor((start + offset) / (24 * hour)) * 24 * hour - offset + 24 * hour; t <= end; t += 24 * hour) midnight.push(t);
  const regular: number[] = [];
  for (let t = Math.ceil((start + offset) / step) * step - offset; t <= end; t += step) regular.push(t);
  const chosen: number[] = [];
  for (const time of [...midnight, start, end, ...regular]) {
    if (chosen.length >= limit) break;
    if (chosen.every(t => Math.abs(t - time) / (end - start) * plotWidth >= gap)) chosen.push(time);
  }
  return chosen.sort((a, b) => a - b);
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
  const observations = [...(input.observedSeries ?? []), ...(input.realtime ? [input.realtime] : [])]
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const points = new Map<string, FlowPoint>();
  let gapBefore = false;
  for (const row of observations) {
    const time = Date.parse(row.observedAt);
    if (!Number.isFinite(time) || time > input.now || kstDay(time) !== input.serviceDate) continue;
    if (!validPopulationRange(row)) { gapBefore = true; continue; }
    const key = `observed:${time}`, existing = points.get(key);
    points.set(key, { ...row, at: row.observedAt, time, kind: 'observed',
      ...(gapBefore || row.gapBefore || existing?.gapBefore ? { gapBefore: true } : {}) });
    gapBefore = false;
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

/** Straight source min/max boundaries, never a midpoint or resampled values.
 * The collector runs every 15 minutes; the provider updates on its own clock.
 * Adjacent observations up to 30 minutes apart describe sampled boundaries,
 * not continuous measurement. Longer gaps, explicit gaps/invalid rows and
 * source/schema/day changes break. Forecasts keep exact hourly issue cohorts.
 * The summary has no outage ledger: a shorter unreported outage is unknown. */
export function flowSegments(points: FlowPoint[]): FlowPoint[][] {
  const segments: FlowPoint[][] = [];
  for (const point of points) {
    const segment = segments.at(-1), previous = segment?.at(-1);
    const elapsed = previous ? point.time - previous.time : 0;
    const continuous = previous && previous.kind === point.kind && !point.gapBefore
      && previous.sourceId === point.sourceId && previous.schemaVersion === point.schemaVersion
      && (point.kind === 'forecast' ? elapsed === 3_600_000 && previous.issuedAt === point.issuedAt
        : elapsed > 0 && elapsed <= 30 * 60_000 && kstDay(previous.time) === kstDay(point.time));
    if (continuous) segment!.push(point);
    else segments.push([point]);
  }
  return segments;
}
