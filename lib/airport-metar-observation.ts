/** Pure connection boundary. No credentials, fetch, persistence or activation. */
import { inspectRksiMetarItem, type RksiObservation } from '../scripts/parse-rksi-metar-item.mjs';

export const AIRPORT_METAR_SOURCE = 'KMA_RKSI_METAR' as const;
const MAX_REPORTS = 100;
const MINUTE_MS = 60_000;
// A display policy, not a measured provider publication SLA.
export const METAR_FRESH_MINUTES = 90;

export type AirportMetarStatus = 'OK' | 'NO_DATA' | 'AUTH_BLOCKED' | 'RATE_LIMITED'
  | 'PROVIDER_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'SCHEMA_UNVERIFIED'
  | 'INCOMPLETE_RESPONSE' | 'OBSERVATION_TIME_INVALID' | 'CONFLICTING_REPORTS'
  | 'RETRIEVAL_TIME_INVALID' | 'OUT_OF_ORDER';
export interface AirportMetarMeasurement {
  value: number;
  unit: string;
  qualifier?: 'ABOVE' | 'BELOW';
}
export type AirportMetarField = 'airTemperature' | 'dewpointTemperature' | 'qnh'
  | 'meanWindDirection' | 'meanWindSpeed' | 'windGustSpeed' | 'prevailingVisibility';
export interface AirportMetarObservation {
  sourceId: typeof AIRPORT_METAR_SOURCE;
  station: 'RKSI';
  reportType: 'METAR' | 'SPECI';
  observedAt: string;
  measurements: Partial<Record<AirportMetarField, AirportMetarMeasurement>>;
  measurementScope: 'GROUND_OBSERVATION';
  turbulenceRisk: 'NOT_INFERRED';
}
export interface AirportMetarAttempt {
  status: AirportMetarStatus;
  retrievedAt: string | null;
  observation: AirportMetarObservation | null;
}
export interface AirportMetarResponse {
  retrievedAt: string;
  httpStatus?: number;
  payload?: unknown;
  failure?: 'TIMEOUT' | 'NETWORK';
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function utc(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19)
    ? new Date(time).toISOString() : null;
}
function integer(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function publicObservation(input: RksiObservation): AirportMetarObservation {
  return {
    sourceId: AIRPORT_METAR_SOURCE, station: input.station, reportType: input.reportType,
    observedAt: utc(input.observedAt)!, measurementScope: 'GROUND_OBSERVATION',
    turbulenceRisk: 'NOT_INFERRED',
    measurements: Object.fromEntries(Object.entries(input.measurements).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, measure]) => [name, { value: measure.value, unit: measure.unit,
        ...(measure.qualifier ? { qualifier: measure.qualifier } : {}) }])),
  };
}

/** Consume the verified getMetar envelope; issue/trend time never becomes observation time. */
export function normalizeAirportMetar(input: AirportMetarResponse): AirportMetarAttempt {
  const retrievedAt = utc(input.retrievedAt);
  const result = (status: AirportMetarStatus, observation: AirportMetarObservation | null = null): AirportMetarAttempt =>
    ({ status, retrievedAt, observation });
  if (!retrievedAt) return result('RETRIEVAL_TIME_INVALID');
  if (input.failure) return result(input.failure === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK_ERROR');
  if (input.httpStatus === 401 || input.httpStatus === 403) return result('AUTH_BLOCKED');
  if (input.httpStatus === 429) return result('RATE_LIMITED');
  if (input.httpStatus !== 200) return result('PROVIDER_ERROR');
  const root = object(input.payload), response = object(root?.response), header = object(response?.header);
  const code = header?.resultCode;
  if (typeof code !== 'string' || !/^\d{2}$/.test(code)) return result('SCHEMA_UNVERIFIED');
  if (['20', '21', '30', '31'].includes(code)) return result('AUTH_BLOCKED');
  if (['22', '23'].includes(code)) return result('RATE_LIMITED');
  if (code !== '00') return result('PROVIDER_ERROR');
  const body = object(response?.body);
  const page = integer(body?.pageNo), count = integer(body?.totalCount), rows = integer(body?.numOfRows);
  if (page !== 1 || rows === null || rows < 1 || rows > MAX_REPORTS || count === null) return result('SCHEMA_UNVERIFIED');
  if (count > rows) return result('INCOMPLETE_RESPONSE');
  const raw = object(body?.items)?.item;
  if (count === 0 && (raw == null || raw === '' || Array.isArray(raw) && raw.length === 0)) return result('NO_DATA');
  const items = Array.isArray(raw) ? raw : object(raw) || typeof raw === 'string' ? [raw] : [];
  if (items.length !== count || items.length > MAX_REPORTS) return result('INCOMPLETE_RESPONSE');
  if (!items.length) return result('NO_DATA');
  const observations: AirportMetarObservation[] = [];
  for (const [index, item] of items.entries()) {
    const inspected = inspectRksiMetarItem(item, index);
    // An unreadable item could be newer: do not publish a partial page as latest.
    if (!inspected.observation) return result('SCHEMA_UNVERIFIED');
    const observedAt = utc(inspected.observation.observedAt);
    if (!observedAt || Date.parse(observedAt) > Date.parse(retrievedAt) + 5 * MINUTE_MS) return result('OBSERVATION_TIME_INVALID');
    observations.push(publicObservation(inspected.observation));
  }
  observations.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const latest = observations[0];
  if (observations.some(row => row.observedAt === latest.observedAt && JSON.stringify(row) !== JSON.stringify(latest))) return result('CONFLICTING_REPORTS');
  return result('OK', latest);
}

/** Read only: last-good display never gains a new observation/retrieval timestamp. */
export function airportMetarProjection(current: AirportMetarAttempt | null, latestAttempt: AirportMetarAttempt | null, now: string) {
  const nowUtc = utc(now), last = current?.status === 'OK' ? current : null;
  const observedAt = utc(last?.observation?.observedAt), retrievedAt = utc(last?.retrievedAt);
  const usable = !!nowUtc && !!observedAt && !!retrievedAt && last?.observation?.station === 'RKSI'
    && last.observation.sourceId === AIRPORT_METAR_SOURCE && Date.parse(retrievedAt) <= Date.parse(nowUtc)
    && Date.parse(observedAt) <= Date.parse(retrievedAt) + 5 * MINUTE_MS;
  const latestTime = utc(latestAttempt?.retrievedAt);
  const coherent = !!nowUtc && !!latestTime && Date.parse(latestTime) <= Date.parse(nowUtc)
    && (!retrievedAt || Date.parse(latestTime) >= Date.parse(retrievedAt));
  const matches = usable && coherent && latestAttempt?.status === 'OK'
    && JSON.stringify(latestAttempt.observation) === JSON.stringify(last?.observation);
  const remainingSeconds = usable ? Math.floor((Date.parse(observedAt!) + METAR_FRESH_MINUTES * MINUTE_MS - Date.parse(nowUtc!)) / 1000) : 0;
  const status = usable ? matches && remainingSeconds > 0 ? 'CURRENT' : 'STALE'
    : latestAttempt && latestAttempt.status !== 'NO_DATA' ? 'ERROR' : 'MISSING';
  const observation = usable ? last!.observation : null;
  const windVerified = typeof observation?.measurements.meanWindSpeed?.value === 'number';
  return {
    sourceId: AIRPORT_METAR_SOURCE, station: 'RKSI' as const, status,
    sourceUrl: 'https://www.data.go.kr/data/15059455/openapi.do',
    observation, retrievedAt: usable ? retrievedAt : null,
    attemptedAt: coherent ? latestTime : null,
    latestAttemptStatus: coherent ? latestAttempt!.status : 'UNVERIFIED',
    windState: windVerified ? 'OBSERVED' : 'UNKNOWN',
    fogState: 'UNKNOWN' as const, turbulenceRisk: 'NOT_INFERRED' as const,
    cacheControl: status === 'CURRENT' && windVerified ? `public, max-age=${Math.min(60, remainingSeconds)}` : 'no-store',
  };
}

/** Validate serialized canonical data before storage/serving. Never trust JSON casts. */
export function verifiedStoredMetarAttempt(input: unknown): AirportMetarAttempt | null {
  const row=object(input), retrievedAt=utc(row?.retrievedAt);
  const statuses: AirportMetarStatus[]=['OK','NO_DATA','AUTH_BLOCKED','RATE_LIMITED','PROVIDER_ERROR','TIMEOUT','NETWORK_ERROR','SCHEMA_UNVERIFIED','INCOMPLETE_RESPONSE','OBSERVATION_TIME_INVALID','CONFLICTING_REPORTS','RETRIEVAL_TIME_INVALID','OUT_OF_ORDER'];
  if(!retrievedAt||!statuses.includes(row?.status as AirportMetarStatus))return null;
  const status=row!.status as AirportMetarStatus;
  if(status!=='OK')return {status,retrievedAt,observation:null};
  const observation=object(row?.observation), observedAt=utc(observation?.observedAt);
  if(!observation||observation.sourceId!==AIRPORT_METAR_SOURCE||observation.station!=='RKSI'
    ||!['METAR','SPECI'].includes(String(observation.reportType))||!observedAt
    ||Date.parse(observedAt)>Date.parse(retrievedAt)+5*MINUTE_MS
    ||observation.measurementScope!=='GROUND_OBSERVATION'||observation.turbulenceRisk!=='NOT_INFERRED')return null;
  const original=object(observation.measurements);if(!original)return null;
  const bounds: Record<AirportMetarField,[string[],number,number]>={airTemperature:[['Cel'],-100,100],dewpointTemperature:[['Cel'],-100,100],qnh:[['hPa'],100,1200],meanWindDirection:[['deg'],0,360],meanWindSpeed:[['m/s','[kn_i]'],0,500],windGustSpeed:[['m/s','[kn_i]'],0,500],prevailingVisibility:[['m'],0,100000]};
  const measurements: AirportMetarObservation['measurements']={};
  for(const [name,[units,min,max]]of Object.entries(bounds)){
    if(original[name]===undefined)continue;const value=object(original[name]);
    if(!value||typeof value.value!=='number'||!Number.isFinite(value.value)||value.value<min||value.value>max||!units.includes(String(value.unit)))return null;
    if(value.qualifier!==undefined&&(name!=='prevailingVisibility'||!['ABOVE','BELOW'].includes(String(value.qualifier))))return null;
    measurements[name as AirportMetarField]={value:value.value,unit:String(value.unit),...(value.qualifier?{qualifier:value.qualifier as 'ABOVE'|'BELOW'}:{})};
  }
  return {status,retrievedAt,observation:{sourceId:AIRPORT_METAR_SOURCE,station:'RKSI',reportType:observation.reportType as 'METAR'|'SPECI',observedAt,measurements,measurementScope:'GROUND_OBSERVATION',turbulenceRisk:'NOT_INFERRED'}};
}
