import { datesBetween, daysInMonth } from './airport-mtd';
import { isValidKstDay, kstDayOf, shiftKstDay } from './kst';
import { rangeChange } from './period-comparison';

export const RECORD_AREAS = ['myeongdong', 'hongdae', 'seongsu', 'itaewon'] as const;
export type RecordArea = typeof RECORD_AREAS[number];
export const RECORD_SOURCE = 'SEOUL_CITYDATA_PPLTN';
export const validRecordMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && isValidKstDay(`${value}-01`);
export const previousRecordMonth = (month: string) => shiftKstDay(`${month}-01`, -1).slice(0, 7);
export const recordMonthDays = (month: string) => datesBetween(`${month}-01`, `${month}-${daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7))).toString().padStart(2, '0')}`);

export interface RecordObservation {
  area?: unknown; areaCode?: unknown; sourceId?: unknown; schemaVersion?: unknown;
  qualityStatus?: unknown; recordOrigin?: unknown; observedAt?: unknown;
  populationMin?: unknown; populationMax?: unknown;
}
export interface RecordDay {
  date: string; hours: number | null; min: number | null; max: number | null;
  status: 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'IN_PROGRESS' | 'FUTURE';
}
export interface RecordMonth {
  month: string; start: string; cutoff: string | null; includedDays: number; expectedDays: number;
  min: number | null; max: number | null; days: RecordDay[];
}
export interface MonthlyRecords {
  area: RecordArea; generatedAt: string; currentMonth: string;
  availableFrom: string | null; availableThrough: string | null;
  definition: { sourceId: string; areaCode: string | null; schemaVersion: string | null; timezone: 'Asia/Seoul'; hoursPerDay: 24 };
  current: RecordMonth; previous: RecordMonth; change: ReturnType<typeof rangeChange>;
}

/** Equal weights at both stages: 24 hourly samples per day, then complete days per month.
 * Each sample is the last stored observation within its own KST hour. No carry-forward,
 * missing-as-zero, population sum, midpoint, forecast or partial-day average enters this metric.
 */
export function buildMonthlyRecords(input: {
  area: RecordArea; month: string; generatedAt: string; rows: readonly RecordObservation[];
  first: RecordObservation | null; last: RecordObservation | null;
}): MonthlyRecords {
  const today = kstDayOf(input.generatedAt);
  const last = input.last;
  const definition: MonthlyRecords['definition'] = {
    sourceId: RECORD_SOURCE, areaCode: typeof last?.areaCode === 'string' ? last.areaCode : null,
    schemaVersion: typeof last?.schemaVersion === 'string' ? last.schemaVersion : null,
    timezone: 'Asia/Seoul', hoursPerDay: 24,
  };
  const hourly = new Map<string, RecordObservation>();
  for (const row of input.rows) {
    const at = row.observedAt;
    if (!definition.areaCode || !definition.schemaVersion || row.area !== input.area || row.sourceId !== RECORD_SOURCE
      || row.areaCode !== definition.areaCode || row.schemaVersion !== definition.schemaVersion
      || row.qualityStatus !== 'VALID' || row.recordOrigin !== 'LIVE'
      || typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\+09:00$/.test(at)
      || !isValidKstDay(at.slice(0, 10)) || !Number.isFinite(Date.parse(at)) || Date.parse(at) > Date.parse(input.generatedAt)
      || typeof row.populationMin !== 'number' || !Number.isFinite(row.populationMin) || row.populationMin < 0
      || typeof row.populationMax !== 'number' || !Number.isFinite(row.populationMax) || row.populationMax < row.populationMin) continue;
    const key = at.slice(0, 13);
    const prior = hourly.get(key);
    if (!prior || String(prior.observedAt) < at) hourly.set(key, row);
  }
  function summarize(month: string): RecordMonth {
    const days = recordMonthDays(month).map((date): RecordDay => {
      const rows = [...hourly.entries()].filter(([key]) => key.slice(0, 10) === date).map(([, row]) => row);
      const status = date > today ? 'FUTURE' : date === today ? 'IN_PROGRESS' : rows.length === 24 ? 'COMPLETE' : rows.length ? 'PARTIAL' : 'MISSING';
      return { date, hours: date >= today ? null : rows.length, status,
        min: status === 'COMPLETE' ? rows.reduce((sum, row) => sum + (row.populationMin as number), 0) / 24 : null,
        max: status === 'COMPLETE' ? rows.reduce((sum, row) => sum + (row.populationMax as number), 0) / 24 : null };
    });
    const eligible = days.filter(day => day.date < today);
    const complete = days.filter(day => day.status === 'COMPLETE');
    return { month, start: `${month}-01`, cutoff: eligible.at(-1)?.date ?? null, expectedDays: eligible.length, includedDays: complete.length, days,
      min: complete.length ? complete.reduce((sum, day) => sum + day.min!, 0) / complete.length : null,
      max: complete.length ? complete.reduce((sum, day) => sum + day.max!, 0) / complete.length : null };
  }
  const current = summarize(input.month), previous = summarize(previousRecordMonth(input.month));
  return { area: input.area, generatedAt: input.generatedAt, currentMonth: today.slice(0, 7), definition,
    availableFrom: typeof input.first?.observedAt === 'string' ? input.first.observedAt.slice(0, 10) : null,
    availableThrough: typeof last?.observedAt === 'string' ? last.observedAt.slice(0, 10) : null,
    current, previous, change: rangeChange(current.min, current.max, previous.min, previous.max, previous.month) };
}
