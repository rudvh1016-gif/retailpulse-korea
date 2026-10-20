import { isExactDate, isExactMonth } from './calendar-context.mjs';

/** Pure civil-date arithmetic. No Date/clock/timezone/network access. */
function nextDate(date) {
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7)), day = Number(date.slice(8));
  const candidate = `${date.slice(0, 8)}${String(day + 1).padStart(2, '0')}`;
  if (isExactDate(candidate)) return candidate;
  return month === 12 ? `${String(year + 1).padStart(4, '0')}-01-01` : `${date.slice(0, 5)}${String(month + 1).padStart(2, '0')}-01`;
}
const emptyGroup = () => ({ mean: null, sampleDays: 0, expectedDays: 0, coverage: null, completeDates: [], missingDates: [] });
/**
 * Compare completed daily observations within ONE explicitly selected month.
 * Never substitute monthly values, calendar duration, or inferred return dates.
 * @param {readonly import('./holiday-period-comparison.mjs').DailyObservation[]} rows
 * @param {import('./holiday-period-comparison.mjs').ComparisonQuery} query
 */
export function compareHolidayPeriod(rows, query) {
  const { month, start, end, asOf, holiday, country, metric, scope } = query;
  if (!isExactMonth(month) || ![start, end, asOf, holiday?.start, holiday?.end].every(isExactDate)
    || start > end || holiday.start > holiday.end || start.slice(0, 7) !== month || end.slice(0, 7) !== month
    || !/^[A-Z]{2}$/.test(country) || !metric?.trim() || !scope?.trim()) throw new RangeError('An exact same-month window, holiday interval, country, metric and scope are required');
  const exclusions = query.excludedHolidayIntervals ?? [];
  if (!Array.isArray(exclusions) || exclusions.some(interval => !isExactDate(interval.start) || !isExactDate(interval.end) || interval.start > interval.end)) throw new RangeError('Exact excluded holiday intervals are required');
  const effectiveEnd = end < asOf ? end : asOf;
  const groups = { holiday: emptyGroup(), nonHoliday: emptyGroup() };
  const base = { status: 'unavailable', reason: null, country, metric, scope, month,
    window: { start, end, effectiveEnd: effectiveEnd >= start ? effectiveEnd : null, asOf },
    holiday: groups.holiday, nonHoliday: groups.nonHoliday, ratio: null, percentDifference: null };
  const days = [];
  const excludedDates = [];
  base.excludedDates = excludedDates;
  base.comparisonLabel = '해당 휴일 외 완료일(제공된 다른 휴일 제외)';
  if (effectiveEnd >= start) for (let date = start; date <= effectiveEnd;) {
    if (!(date >= holiday.start && date <= holiday.end) && exclusions.some(interval => date >= interval.start && date <= interval.end)) excludedDates.push(date);
    else days.push(date);
    if (date === effectiveEnd) break;
    date = nextDate(date);
  }
  const groupFor = date => date >= holiday.start && date <= holiday.end ? groups.holiday : groups.nonHoliday;
  for (const date of days) groupFor(date).missingDates.push(date);
  for (const group of Object.values(groups)) group.expectedDays = group.missingDates.length;
  if (!days.length) return { ...base, reason: 'no_elapsed_days' };
  const eligibleDates = new Set(days);
  const applicable = rows.filter(row => row.country === country && isExactDate(row.date) && eligibleDates.has(row.date));
  // Refuse mixed dimensions rather than silently produce a selective comparison.
  if (applicable.some(row => row.metric !== metric || row.scope !== scope)) return { ...base, reason: 'mixed_metric_or_scope' };
  if (new Set(applicable.map(row => row.date)).size !== applicable.length) return { ...base, reason: 'duplicate_date' };
  const complete = applicable.filter(row => row.complete === true && typeof row.value === 'number' && Number.isFinite(row.value)).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const values = { holiday: [], nonHoliday: [] };
  for (const row of complete) {
    const key = row.date >= holiday.start && row.date <= holiday.end ? 'holiday' : 'nonHoliday';
    values[key].push(row.value); groups[key].completeDates.push(row.date);
  }
  for (const key of ['holiday', 'nonHoliday']) {
    const group = groups[key];
    group.completeDates.sort();
    const dates = new Set(group.completeDates);
    group.missingDates = group.missingDates.filter(date => !dates.has(date));
    group.sampleDays = values[key].length;
    group.coverage = group.expectedDays ? group.sampleDays / group.expectedDays : null;
    // Division before addition avoids overflowing a finite-valued daily mean.
    group.mean = group.sampleDays ? values[key].reduce((sum, value) => sum + value / group.sampleDays, 0) : null;
  }
  if (!groups.holiday.sampleDays || !groups.nonHoliday.sampleDays) return { ...base, reason: !complete.length ? 'no_complete_daily_data' : 'insufficient_comparison_days' };
  const rawRatio = groups.nonHoliday.mean === 0 ? null : groups.holiday.mean / groups.nonHoliday.mean;
  const ratio = rawRatio !== null && Number.isFinite(rawRatio) ? rawRatio : null;
  const rawPercent = ratio === null ? null : (ratio - 1) * 100;
  return { ...base, status: 'available', reason: null, ratio,
    percentDifference: rawPercent !== null && Number.isFinite(rawPercent) ? rawPercent : null };
}
/** Calendar-only tense; no inferred return peak or return date. */
export function describeHolidayPeriod(holiday, asOf) {
  if (!holiday || !isExactDate(holiday.start) || !isExactDate(holiday.end) || holiday.start > holiday.end || !isExactDate(asOf)) throw new RangeError('Exact holiday dates and asOf are required');
  if (asOf < holiday.start) return { phase: 'upcoming', text: `휴일 일정은 ${holiday.start}~${holiday.end}로 예정되어 있습니다.` };
  if (asOf <= holiday.end) return { phase: 'ongoing', text: `휴일 일정은 ${holiday.start}~${holiday.end}로, 기준일 현재 진행 중입니다.` };
  return { phase: 'ended', text: `휴일 일정은 ${holiday.end}에 종료되었습니다.` };
}
