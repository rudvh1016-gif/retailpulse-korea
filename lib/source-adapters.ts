import type { CanonicalRecord, QualityStatus, SourceStatus } from "./contracts";
import { sha256 } from "./hash";

export class SourceFetchError extends Error {
  constructor(public readonly code: "TIMEOUT" | "HTTP" | "MALFORMED_JSON" | "SCHEMA", public readonly status?: number) {
    super(code);
  }
}

export async function fetchOfficialJson(url: URL, options: { timeoutMs?: number; retries?: number; retryDelayMs?: number } = {}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const retries = Math.min(options.retries ?? 1, 2);
  const retryDelayMs = Math.max(0, Math.min(options.retryDelayMs ?? 250, 2_000));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) {
        if (attempt < retries && (response.status === 429 || response.status >= 500)) {
          const retryAfterSeconds = Number(response.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfterSeconds)
            ? Math.min(retryAfterSeconds * 1_000, 2_000)
            : retryDelayMs * (2 ** attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new SourceFetchError("HTTP", response.status);
      }
      try {
        return await response.json();
      } catch {
        throw new SourceFetchError("MALFORMED_JSON");
      }
    } catch (error) {
      const normalized = error instanceof SourceFetchError ? error : new SourceFetchError("TIMEOUT");
      if (attempt === retries || (normalized.status && normalized.status < 500 && normalized.status !== 429)) throw normalized;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (2 ** attempt)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new SourceFetchError("HTTP");
}

function requiredString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  throw new SourceFetchError("SCHEMA");
}

function optionalString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeKstTimestamp(value: string): string {
  const compact = value.replace(/\D/g, "");
  if (compact.length === 12 || compact.length === 14) {
    const year = compact.slice(0, 4);
    const month = compact.slice(4, 6);
    const day = compact.slice(6, 8);
    const hour = compact.slice(8, 10);
    const minute = compact.slice(10, 12);
    const second = compact.length === 14 ? compact.slice(12, 14) : "00";
    const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`;
    if (!Number.isNaN(Date.parse(normalized))) return normalized;
  }
  if (!Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  throw new SourceFetchError("SCHEMA");
}

export interface CanonicalAirportFlight extends CanonicalRecord {
  direction: "departure" | "arrival";
  flightNumber: string;
  airlineCode: string | null;
  airportCode: string | null;
  terminal: "T1" | "T2" | null;
  gate: string | null;
  checkinCounter: string | null;
  status: "scheduled" | "on_time" | "delayed" | "cancelled" | "unknown";
  scheduledAt: string;
  changedAt: string | null;
}

export async function normalizeAirportFlight(raw: unknown, direction: "departure" | "arrival", retrievedAt: string): Promise<CanonicalAirportFlight> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const flightNumber = requiredString(record, ["flightId", "flight_id", "fltNo"]);
  const scheduledAt = normalizeKstTimestamp(requiredString(record, ["scheduleDateTime", "scheduleDatetime", "scheduledAt"]));
  const rawTerminal = optionalString(record, ["terminalId", "terminalid", "terminal", "terminalNo"]);
  const terminal = rawTerminal === "T1" || rawTerminal === "1" ? "T1" : rawTerminal === "T2" || rawTerminal === "2" ? "T2" : null;
  const rawStatus = optionalString(record, ["remark", "status", "flightStatus"])?.toLowerCase() ?? "";
  const status = rawStatus.includes("cancel") || rawStatus.includes("결항") ? "cancelled" : rawStatus.includes("delay") || rawStatus.includes("지연") ? "delayed" : rawStatus.includes("on time") || rawStatus.includes("정상") ? "on_time" : rawStatus ? "scheduled" : "unknown";
  const changedValue = optionalString(record, ["estimatedDateTime", "changedDateTime", "changedAt"]);
  const changedAt = changedValue ? normalizeKstTimestamp(changedValue) : null;
  const qualityStatus: QualityStatus = terminal ? "VALID" : "PARTIAL";
  const freshness: SourceStatus = "LIVE";
  const semanticRecord = {
    sourceId: "INCHEON_FLIGHT_DETAIL",
    direction,
    flightNumber,
    airlineCode: optionalString(record, ["airline", "airlineCode"]),
    airportCode: optionalString(record, ["airport", "airportCode", "airportcode"]),
    terminal,
    gate: optionalString(record, ["gate", "gateNo", "gatenumber"]),
    checkinCounter: optionalString(record, ["chkinrange", "checkinCounter"]),
    status,
    scheduledAt,
    changedAt,
  } as const;
  return {
    sourceId: "INCHEON_FLIGHT_DETAIL",
    recordOrigin: "LIVE",
    direction,
    flightNumber,
    airlineCode: semanticRecord.airlineCode,
    airportCode: semanticRecord.airportCode,
    terminal,
    gate: semanticRecord.gate,
    checkinCounter: semanticRecord.checkinCounter,
    status,
    scheduledAt,
    changedAt,
    eventAt: changedAt ?? scheduledAt,
    publishedAt: null,
    retrievedAt,
    freshness,
    schemaVersion: "airport-flight-v1",
    qualityStatus,
    // Collection timestamps and unknown upstream fields must not turn an
    // unchanged flight into a new semantic version.
    sourceHash: await sha256(semanticRecord),
  };
}

export function redactServiceKey(value: string): string {
  return value.replace(/([?&](?:serviceKey|KEY|key)=)[^&]+/gi, "$1[REDACTED]");
}

/** Redact a Seoul open-data key that rides in the URL path. */
export function redactSeoulUrl(value: string): string {
  return value.replace(/(openapi\.seoul\.go\.kr:8088\/)[^/]+/gi, "$1[REDACTED]");
}

function requiredNumericString(record: Record<string, unknown>, keys: string[]): number {
  const value = Number(requiredString(record, keys).replaceAll(",", ""));
  if (!Number.isFinite(value)) throw new SourceFetchError("SCHEMA");
  return value;
}

/** "YYYY-MM-DD HH:MM" (KST, Seoul citydata) → ISO string. */
function normalizeKstMinuteTime(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new SourceFetchError("SCHEMA");
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+09:00`;
  if (Number.isNaN(Date.parse(normalized))) throw new SourceFetchError("SCHEMA");
  return normalized;
}

// Official Seoul congestion labels, orderable for the product.
const congestionLevels: Record<string, number> = { "여유": 1, "보통": 2, "약간 붐빔": 3, "붐빔": 4 };

export interface CanonicalSeoulRealtime extends CanonicalRecord {
  area: string;
  areaCode: string;
  areaName: string;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  observedAt: string;
}

export interface CanonicalSeoulForecast {
  sourceId: string;
  area: string;
  issuedAt: string;
  targetAt: string;
  congestionLevel: number;
  congestionLabel: string;
  populationMin: number;
  populationMax: number;
  retrievedAt: string;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

/**
 * S1 — Seoul real-time city data (citydata_ppltn). One record per area call.
 * The 12-hour FCST_PPLTN block is Seoul's own published forecast and is
 * returned separately so it is never stored as an observation.
 */
export async function normalizeSeoulRealtime(
  raw: unknown,
  area: string,
  retrievedAt: string,
): Promise<{ observed: CanonicalSeoulRealtime; forecasts: CanonicalSeoulForecast[] }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const congestionLabel = requiredString(record, ["AREA_CONGEST_LVL"]);
  const congestionLevel = congestionLevels[congestionLabel];
  if (!congestionLevel) throw new SourceFetchError("SCHEMA");
  const observedAt = normalizeKstMinuteTime(requiredString(record, ["PPLTN_TIME"]));
  const populationMin = requiredNumericString(record, ["AREA_PPLTN_MIN"]);
  const populationMax = requiredNumericString(record, ["AREA_PPLTN_MAX"]);
  const replaced = optionalString(record, ["REPLACE_YN"]) === "Y";
  const semanticRecord = {
    sourceId: "SEOUL_CITYDATA_PPLTN",
    area,
    areaCode: requiredString(record, ["AREA_CD"]),
    areaName: requiredString(record, ["AREA_NM"]),
    congestionLevel,
    congestionLabel,
    populationMin,
    populationMax,
    observedAt,
  } as const;

  const rawForecasts = record.FCST_PPLTN;
  const forecastItems = optionalString(record, ["FCST_YN"]) === "Y" && Array.isArray(rawForecasts) ? rawForecasts : [];
  const forecasts: CanonicalSeoulForecast[] = [];
  for (const item of forecastItems) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const label = optionalString(entry, ["FCST_CONGEST_LVL"]);
    const level = label ? congestionLevels[label] : undefined;
    const time = optionalString(entry, ["FCST_TIME"]);
    if (!label || !level || !time) continue;
    const targetAt = normalizeKstMinuteTime(time);
    const semanticForecast = {
      sourceId: "SEOUL_CITYDATA_PPLTN",
      area,
      issuedAt: observedAt,
      targetAt,
      congestionLevel: level,
      congestionLabel: label,
      populationMin: requiredNumericString(entry, ["FCST_PPLTN_MIN"]),
      populationMax: requiredNumericString(entry, ["FCST_PPLTN_MAX"]),
    } as const;
    forecasts.push({
      ...semanticForecast,
      retrievedAt,
      schemaVersion: "seoul-realtime-forecast-v1",
      qualityStatus: "VALID",
      sourceHash: await sha256(semanticForecast),
    });
  }

  return {
    observed: {
      ...semanticRecord,
      recordOrigin: "LIVE",
      eventAt: observedAt,
      publishedAt: observedAt,
      retrievedAt,
      freshness: "LIVE",
      schemaVersion: "seoul-realtime-v1",
      qualityStatus: replaced ? "PARTIAL" : "VALID",
      sourceHash: await sha256(semanticRecord),
    },
    forecasts,
  };
}

export interface CanonicalEstimatedSales {
  sourceId: string;
  recordOrigin: "OFFICIAL_HISTORICAL";
  area: string;
  quarterCode: string;
  tradeAreaCode: string;
  tradeAreaName: string | null;
  industryCode: string;
  industryName: string | null;
  salesAmount: number;
  salesCount: number | null;
  retrievedAt: string;
  freshness: SourceStatus;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

/**
 * S3 — 서울시 상권분석서비스 추정매출-상권 (VwsmTrdarSelngQq). Quarterly
 * modelled estimates; recordOrigin stays OFFICIAL_HISTORICAL and the value is
 * never presented as live or foreign sales.
 */
export async function normalizeEstimatedSales(raw: unknown, area: string, retrievedAt: string): Promise<CanonicalEstimatedSales> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const readNumber = (keys: string[]): number | null => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() && Number.isFinite(Number(value.replaceAll(",", "")))) {
        return Number(value.replaceAll(",", ""));
      }
    }
    return null;
  };
  const salesAmount = readNumber(["THSMON_SELNG_AMT"]);
  if (salesAmount === null) throw new SourceFetchError("SCHEMA");
  const semanticRecord = {
    sourceId: "SEOUL_ESTIMATED_SALES",
    area,
    quarterCode: requiredString(record, ["STDR_YYQU_CD"]),
    tradeAreaCode: requiredString(record, ["TRDAR_CD"]),
    tradeAreaName: optionalString(record, ["TRDAR_CD_NM"]),
    industryCode: requiredString(record, ["SVC_INDUTY_CD"]),
    industryName: optionalString(record, ["SVC_INDUTY_CD_NM"]),
    salesAmount,
    salesCount: readNumber(["THSMON_SELNG_CO"]),
  } as const;
  return {
    ...semanticRecord,
    recordOrigin: "OFFICIAL_HISTORICAL",
    retrievedAt,
    freshness: "OFFICIAL_HISTORICAL",
    schemaVersion: "seoul-estimated-sales-v1",
    qualityStatus: "VALID",
    sourceHash: await sha256(semanticRecord),
  };
}

export interface CanonicalWeatherForecast {
  sourceId: string;
  area: string;
  issuedAt: string;
  targetAt: string;
  precipitationProbability: number | null;
  temperatureTenthC: number | null;
  conditionCode: string | null;
  retrievedAt: string;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

function kmaConditionCode(sky: string | null, pty: string | null): string | null {
  if (pty && pty !== "0") {
    if (pty === "3" || pty === "6" || pty === "7") return "snow";
    if (pty === "4" || pty === "5") return "shower";
    return "rain";
  }
  if (sky === "1") return "clear";
  if (sky === "3") return "cloudy";
  if (sky === "4") return "overcast";
  return null;
}

/**
 * W1 — KMA 단기예보 (getVilageFcst). Items arrive one category per row; this
 * groups them into one canonical row per forecast target hour, preserving the
 * issue time separately from the target time.
 */
export async function normalizeWeatherForecast(items: unknown[], area: string, retrievedAt: string): Promise<CanonicalWeatherForecast[]> {
  const buckets = new Map<string, Record<string, string>>();
  let baseDate = "";
  let baseTime = "";
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const category = optionalString(record, ["category"]);
    const fcstDate = optionalString(record, ["fcstDate"]);
    const fcstTime = optionalString(record, ["fcstTime"]);
    const fcstValue = optionalString(record, ["fcstValue"]);
    baseDate = optionalString(record, ["baseDate"]) ?? baseDate;
    baseTime = optionalString(record, ["baseTime"]) ?? baseTime;
    if (!category || !fcstDate || !fcstTime || fcstValue === null) continue;
    const key = `${fcstDate}${fcstTime}`;
    const bucket = buckets.get(key) ?? {};
    bucket[category] = fcstValue;
    buckets.set(key, bucket);
  }
  if (!baseDate || !baseTime) throw new SourceFetchError("SCHEMA");
  const issuedAt = normalizeKstTimestamp(`${baseDate}${baseTime}`);
  const results: CanonicalWeatherForecast[] = [];
  for (const [key, values] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const targetAt = normalizeKstTimestamp(key);
    const pop = values.POP !== undefined && Number.isFinite(Number(values.POP)) ? Number(values.POP) : null;
    const temp = values.TMP !== undefined && Number.isFinite(Number(values.TMP)) ? Math.round(Number(values.TMP) * 10) : null;
    const semanticRecord = {
      sourceId: "KMA_VILAGE_FCST",
      area,
      issuedAt,
      targetAt,
      precipitationProbability: pop,
      temperatureTenthC: temp,
      conditionCode: kmaConditionCode(values.SKY ?? null, values.PTY ?? null),
    } as const;
    results.push({
      ...semanticRecord,
      retrievedAt,
      schemaVersion: "kma-vilage-fcst-v1",
      qualityStatus: pop === null && temp === null ? "PARTIAL" : "VALID",
      sourceHash: await sha256(semanticRecord),
    });
  }
  return results;
}

export interface CanonicalTourismEvent {
  sourceId: string;
  recordOrigin: "LIVE";
  area: string;
  contentId: string;
  title: string;
  address: string | null;
  lat: string | null;
  lng: string | null;
  distanceM: number | null;
  eventStart: string;
  eventEnd: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  freshness: SourceStatus;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

function normalizeYyyymmdd(value: string): string {
  const compact = value.replace(/\D/g, "");
  if (compact.length < 8) throw new SourceFetchError("SCHEMA");
  const normalized = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  if (Number.isNaN(Date.parse(normalized))) throw new SourceFetchError("SCHEMA");
  return normalized;
}

/**
 * T1 — TourAPI festival/event row from locationBasedList2/searchFestival2.
 * An event is context only: existence is not attendance and never demand.
 */
export async function normalizeTourismEvent(raw: unknown, area: string, retrievedAt: string): Promise<CanonicalTourismEvent> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const rawDistance = optionalString(record, ["dist"]);
  const distanceM = rawDistance !== null && Number.isFinite(Number(rawDistance)) ? Math.round(Number(rawDistance)) : null;
  const modified = optionalString(record, ["modifiedtime"]);
  const eventStart = optionalString(record, ["eventstartdate"]);
  const eventEnd = optionalString(record, ["eventenddate"]);
  const semanticRecord = {
    sourceId: "KTO_TOURAPI_EVENT",
    area,
    contentId: requiredString(record, ["contentid"]),
    title: requiredString(record, ["title"]),
    address: optionalString(record, ["addr1"]),
    lat: optionalString(record, ["mapy"]),
    lng: optionalString(record, ["mapx"]),
    distanceM,
    eventStart: eventStart ? normalizeYyyymmdd(eventStart) : null,
    eventEnd: eventEnd ? normalizeYyyymmdd(eventEnd) : null,
  } as const;
  if (!semanticRecord.eventStart) throw new SourceFetchError("SCHEMA");
  return {
    ...semanticRecord,
    eventStart: semanticRecord.eventStart,
    recordOrigin: "LIVE",
    publishedAt: modified ? normalizeKstTimestamp(modified) : null,
    retrievedAt,
    freshness: "LIVE",
    schemaVersion: "tourapi-event-v1",
    qualityStatus: semanticRecord.lat && semanticRecord.lng ? "VALID" : "PARTIAL",
    sourceHash: await sha256(semanticRecord),
  };
}

export interface CanonicalAirportCongestion {
  sourceId: string;
  recordOrigin: "LIVE";
  terminal: "T1" | "T2";
  zone: string;
  waitTimeMinutes: number | null;
  waitingCount: number;
  observedAt: string;
  retrievedAt: string;
  freshness: SourceStatus;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

/**
 * A4 — departure-hall checkpoint congestion. Checkpoint waiting counts are a
 * demand-flow proxy only; they are never duty-free visitors or store traffic.
 */
export async function normalizeAirportCongestion(raw: unknown, retrievedAt: string): Promise<CanonicalAirportCongestion> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const rawTerminal = requiredString(record, ["terminalId", "terminalid"]);
  const terminal = rawTerminal === "P01" || rawTerminal === "T1" ? "T1" : rawTerminal === "P03" || rawTerminal === "T2" ? "T2" : null;
  if (!terminal) throw new SourceFetchError("SCHEMA");
  const rawWait = optionalString(record, ["waitTime", "waittime"]);
  const semanticRecord = {
    sourceId: "INCHEON_DEPARTURE_CONGESTION",
    terminal,
    zone: requiredString(record, ["gateId", "gateid"]),
    waitTimeMinutes: rawWait !== null && Number.isFinite(Number(rawWait)) ? Number(rawWait) : null,
    waitingCount: requiredNumericString(record, ["waitLength", "waitlength"]),
    observedAt: normalizeKstTimestamp(requiredString(record, ["occurtime", "occurTime"])),
  } as const;
  return {
    ...semanticRecord,
    recordOrigin: "LIVE",
    retrievedAt,
    freshness: "LIVE",
    schemaVersion: "airport-congestion-v1",
    qualityStatus: "VALID",
    sourceHash: await sha256(semanticRecord),
  };
}
