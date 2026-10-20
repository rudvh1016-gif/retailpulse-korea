/**
 * Deterministic, offline calendar context for already-published monthly data.
 * No clock reads, timezone conversion, network, traffic estimates, or causality.
 * TRUST BOUNDARY: status=verified means an upstream reviewer checked the dates,
 * scope and sourceURL against the official publisher. URL syntax alone cannot
 * prove official provenance. observedAt is collection time, NOT verification.
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} country ISO uppercase two-letter country code
 * @property {string} [region] Required applicability label for every nonnational scope; display verbatim.
 * @property {'national'|'regional'|'local'|'institutional'} scope
 * @property {string} name
 * @property {'public_holiday'|'school_break'} kind
 * @property {string} start Inclusive local civil date, YYYY-MM-DD
 * @property {string} end Inclusive local civil date, YYYY-MM-DD
 * @property {'verified'|'expired'|'unverified'|'superseded'} status
 * @property {string} sourceURL Official publication URL, verified upstream
 * @property {string} verifiedAt Official evidence review date, YYYY-MM-DD
 * @property {string} [observedAt] Collection timestamp, never a verification substitute
 * @property {string} [reviewValidUntil] Inclusive review-validity date, not event end
 * @typedef {Object} CalendarQuery
 * @property {string} country Route country, not passenger nationality; OTHER excluded
 * @property {string} selectedMonth Exact YYYY-MM actually displayed by the chart
 * @property {readonly string[]} actualDataMonths Months with actual chart data
 * @property {string} asOf Explicit review date YYYY-MM-DD (never browser time)
 * @property {boolean} [includePreviousMonth] Include only the adjacent actual month
 * @property {boolean} [includeOriginContext] Opt in to separately labeled KR origin
 * @property {string} [region] If supplied, retain national plus this exact region
 * @property {'public_holiday'|'school_break'} [kind]
 */

/** @param {number} year @param {number} month */
const daysInMonth = (year, month) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
/** @param {unknown} value */
export function isExactMonth(value) {
  return typeof value === 'string' && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
/** @param {unknown} value */
export function isExactDate(value) {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  return Number(value.slice(8)) <= daysInMonth(Number(value.slice(0, 4)), Number(value.slice(5, 7)));
}
/** @param {string} month */
export function previousMonth(month) {
  if (!isExactMonth(month)) throw new RangeError('Expected an exact YYYY-MM month');
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5));
  if (year === 1 && number === 1) return null;
  return number === 1 ? `${String(year - 1).padStart(4, '0')}-12` : `${month.slice(0, 4)}-${String(number - 1).padStart(2, '0')}`;
}
/** @param {string} value */
function isSourceURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
/** @param {CalendarEvent} event @param {string} asOf */
function isUsable(event, asOf) {
  return !!event && typeof event.id === 'string' && !!event.id.trim()
    && /^[A-Z]{2}$/.test(event.country) && typeof event.name === 'string' && !!event.name.trim()
    && ['national', 'regional', 'local', 'institutional'].includes(event.scope)
    && (event.scope === 'national' || (typeof event.region === 'string' && !!event.region.trim()))
    && ['public_holiday', 'school_break'].includes(event.kind)
    && event.status === 'verified' && isSourceURL(event.sourceURL)
    && isExactDate(event.start) && isExactDate(event.end) && event.start <= event.end
    && isExactDate(event.verifiedAt) && event.verifiedAt <= asOf
    && (event.reviewValidUntil === undefined || (isExactDate(event.reviewValidUntil)
      && event.reviewValidUntil >= event.verifiedAt && asOf <= event.reviewValidUntil));
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
/**
 * Invalid query dates throw; unknown/missing months or countries return no context.
 * Invalid, stale, unverified, and superseded rows are silently withheld, not
 * interpreted as absence of holidays. Summary is capped at two; details has all.
 * @param {readonly CalendarEvent[]} events
 * @param {CalendarQuery} query
 */
export function matchCalendarContext(events, query) {
  if (!isExactMonth(query.selectedMonth) || !isExactDate(query.asOf)) throw new RangeError('Exact selectedMonth and asOf dates are required');
  if (!Array.isArray(query.actualDataMonths) || !query.actualDataMonths.every(isExactMonth)) throw new RangeError('actualDataMonths must contain exact YYYY-MM values');
  const empty = { summary: [], details: [] };
  if (query.country === 'OTHER' || !/^[A-Z]{2}$/.test(query.country) || !query.actualDataMonths.includes(query.selectedMonth)) return empty;
  const previous = previousMonth(query.selectedMonth);
  const periods = [{ month: query.selectedMonth, relation: 'selected' }];
  if (query.includePreviousMonth && previous && query.actualDataMonths.includes(previous)) periods.push({ month: previous, relation: 'previous' });
  const details = [];
  for (const period of periods) {
    const first = `${period.month}-01`;
    const last = `${period.month}-${daysInMonth(Number(period.month.slice(0, 4)), Number(period.month.slice(5)))}`;
    for (const event of events) {
      if (!isUsable(event, query.asOf)) continue;
      const origin = event.country === 'KR';
      if (origin ? !query.includeOriginContext : event.country !== query.country) continue;
      if (!origin && query.region && event.scope !== 'national' && event.region !== query.region) continue;
      if (query.kind && event.kind !== query.kind) continue;
      if (event.start > last || event.end < first) continue;
      const geography = event.scope === 'national' ? `${event.country} 전국` : `${event.country} ${event.region}`;
      const role = origin ? '한국 출발지 참고' : '노선 국가 참고';
      const monthLabel = `${period.relation === 'previous' ? '직전 월' : '선택 월'} ${period.month}`;
      const dates = event.start === event.end ? event.start : `${event.start}~${event.end}`;
      details.push({ eventId: event.id, country: event.country, region: event.region ?? null,
        scope: event.scope, kind: event.kind, role: origin ? 'origin' : 'route',
        month: period.month, relation: period.relation, start: event.start, end: event.end,
        text: `${monthLabel} · ${role} · ${geography} ${event.name}(${event.kind === 'school_break' ? '방학' : '공휴일'}, ${dates}) 기간과 겹칩니다.`,
        sourceURL: event.sourceURL, verifiedAt: event.verifiedAt,
      });
    }
  }
  details.sort((a, b) => compare(a.relation === 'selected' ? 0 : 1, b.relation === 'selected' ? 0 : 1)
    || compare(a.role === 'route' ? 0 : 1, b.role === 'route' ? 0 : 1)
    || compare(a.start, b.start) || compare(a.country, b.country) || compare(a.eventId, b.eventId));
  const unique = details.filter((row, index) => details.findIndex(other => other.eventId === row.eventId && other.country === row.country && other.month === row.month) === index);
  return { summary: unique.slice(0, 2), details: unique };
}
