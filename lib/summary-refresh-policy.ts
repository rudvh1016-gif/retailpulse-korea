import {isValidKstDay} from './kst';

const MIN_DELAY = 60_000;
const MAX_DELAY = 300_000;
const CHECKPOINT_FRESH_MS = 20 * 60_000;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const instant = (value: unknown): number => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && isValidKstDay(value.slice(0, 10))
  ? Date.parse(value) : NaN;
const optionalObject = (value: unknown) => value === undefined || object(value);
const objectArrays = (value: ObjectValue, names: readonly string[]) => names.every(name =>
  value[name] === undefined || (Array.isArray(value[name]) && value[name].every(object)));

/** Validate only the structural contract needed by the reader and its policy.
 * Never repair source values, invent clocks, or turn an invalid success into data. */
export function isValidSummaryRefreshPayload(value: unknown, requestedDate: string | null): boolean {
  if (!object(value) || value.mode !== 'live-summary' || !Number.isFinite(instant(value.generatedAt))
    || !isValidKstDay(value.todayKst) || !isValidKstDay(value.serviceDateKst)
    || (requestedDate !== null && !isValidKstDay(requestedDate))
    || value.serviceDateKst !== (requestedDate ?? value.todayKst)
    || !object(value.areas) || !object(value.airport)) return false;
  if (value.sources !== undefined && (!Array.isArray(value.sources) || !value.sources.every(source =>
    object(source) && typeof source.sourceId === 'string' && source.sourceId.length > 0
    && typeof source.status === 'string' && source.status.length > 0))) return false;
  if (!Object.values(value.areas).every(area => area == null || (object(area)
    && objectArrays(area, ['realtimeForecast', 'observedSeries', 'weather'])))) return false;
  const airport = value.airport;
  if (!objectArrays(airport, ['passengerForecastTimeline', 'passengerForecast', 'scheduled', 'congestion', 'transferForecast'])
    || !optionalObject(airport.forecastCoverage) || !optionalObject(airport.arrivalForecast)) return false;
  return !object(airport.arrivalForecast) || (optionalObject(airport.arrivalForecast.forecastCoverage)
    && objectArrays(airport.arrivalForecast, ['passengerForecastTimeline']));
}

/** One bounded read cadence, independent of provider collection and source truth.
 * A cached response's age counts toward its next check; fetching it never makes
 * its observations newer. Historical/future views do not chase current queues. */
export function summaryRefreshDelay(value: unknown, now: number, defaultDelayMs: number): number {
  let delay = Number.isFinite(defaultDelayMs) ? Math.max(MIN_DELAY, Math.min(MAX_DELAY, defaultDelayMs)) : MIN_DELAY;
  if (!object(value) || !Number.isFinite(now)) return MIN_DELAY;
  const generated = instant(value.generatedAt);
  if (!Number.isFinite(generated) || generated > now || now - generated >= MAX_DELAY) return MIN_DELAY;
  delay = Math.min(delay, Math.max(MIN_DELAY, MAX_DELAY - (now - generated)));
  if (value.dayRelation !== 'TODAY' || !object(value.airport) || !Array.isArray(value.airport.congestion)) return delay;
  for (const row of value.airport.congestion) {
    if (!object(row)) { delay = Math.min(delay, 120_000); continue; }
    const observed = instant(row.observedAt);
    const age = now - observed;
    if (!Number.isFinite(age) || age < 0 || age >= CHECKPOINT_FRESH_MS
      || row.freshness === 'STALE' || row.collectionStatus === 'STALE'
      || row.collectionStatus === 'FAILED' || row.collectionStatus === 'UNKNOWN') {
      delay = Math.min(delay, 120_000);
    } else {
      delay = Math.min(delay, Math.max(MIN_DELAY, CHECKPOINT_FRESH_MS - age));
    }
  }
  return delay;
}

/** Consecutive unsuccessful reads back off without ever abandoning recovery.
 * The caller resets its failure count after a valid response. */
export function summaryFailureDelay(consecutiveFailures: number): number {
  if (!Number.isFinite(consecutiveFailures)) return MAX_DELAY;
  return [60_000, 120_000, 240_000, 300_000][Math.max(0, Math.min(3, Math.floor(consecutiveFailures) - 1))];
}
