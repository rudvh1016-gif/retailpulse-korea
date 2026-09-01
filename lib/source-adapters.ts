import type { CanonicalRecord, QualityStatus, SourceStatus } from "./contracts";
import { sha256 } from "./hash";

export class SourceFetchError extends Error {
  public readonly attempts: number;
  public readonly elapsedMs: number;
  public readonly retryExhausted: boolean;

  constructor(
    public readonly code: "TIMEOUT" | "HTTP" | "MALFORMED_JSON" | "SCHEMA" | "NETWORK",
    public readonly status?: number,
    /** Connection-layer cause (ENOTFOUND, ECONNRESET, ...) when the platform reports one. */
    public readonly causeCode?: string,
    context: { attempts?: number; elapsedMs?: number; retryExhausted?: boolean } = {},
  ) {
    super(causeCode ? `${code}_${causeCode}` : code);
    this.name = "SourceFetchError";
    this.attempts = Math.max(1, Math.trunc(context.attempts ?? 1));
    this.elapsedMs = Math.max(0, Math.trunc(context.elapsedMs ?? 0));
    this.retryExhausted = context.retryExhausted === true;
  }
}

/** Platform error codes are uppercase identifiers; anything else is not echoed. */
const NETWORK_CAUSE_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/**
 * Walks the error's cause chain for the platform's own code so operational
 * detail records the real reason (ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT)
 * instead of a generic label.
 */
function networkCauseCode(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && NETWORK_CAUSE_CODE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Only a real client-side abort is a TIMEOUT. Every other fetch rejection is
 * a connection-layer failure, which previously reported the same "TIMEOUT"
 * label — that made a DNS/TCP/TLS failure indistinguishable from a slow
 * provider and pointed diagnosis at the timeout budget instead of the
 * network. Classification only; retry behaviour is unchanged, because
 * NETWORK carries no HTTP status and so takes the same branch TIMEOUT did.
 */
export function classifySourceFetchFailure(error: unknown): SourceFetchError {
  if (error instanceof SourceFetchError) return error;
  if (error instanceof Error && error.name === "AbortError") return new SourceFetchError("TIMEOUT");
  return new SourceFetchError("NETWORK", undefined, networkCauseCode(error));
}

export interface FetchOfficialJsonOptions {
  timeoutMs?: number;
  /** Backwards-compatible number of retries. Prefer maxAttempts for new policies. */
  retries?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryDelaysMs?: readonly number[];
  jitterMs?: number;
  maxRetryAfterMs?: number;
  /** Test seams; Production callers use the platform defaults. */
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
  nowMs?: () => number;
}

/**
 * Low-call data.go.kr sources get a recovery window long enough to outlive a
 * short shared-gateway incident. Healthy calls still make exactly one
 * request. Four total attempts span roughly 57 seconds before jitter, while
 * remaining strictly bounded.
 */
export const DATA_GO_KR_LOW_CALL_POLICY = Object.freeze({
  timeoutMs: 30_000,
  maxAttempts: 4,
  retryDelaysMs: [2_000, 10_000, 45_000] as const,
  jitterMs: 500,
  maxRetryAfterMs: 60_000,
});

/**
 * A4-T2 can legitimately page up to three times. Three attempts per page keep
 * its absolute 96-runs/day ceiling at 864 calls while still spanning a
 * tens-of-seconds gateway incident.
 */
export const DATA_GO_KR_PAGED_POLICY = Object.freeze({
  timeoutMs: 30_000,
  maxAttempts: 3,
  retryDelaysMs: [5_000, 30_000] as const,
  jitterMs: 500,
  maxRetryAfterMs: 60_000,
});

/** W1 has three sequential grid calls, so it uses a smaller per-grid budget. */
export const KMA_GRID_RETRY_POLICY = Object.freeze({
  timeoutMs: 10_000,
  maxAttempts: 3,
  retryDelaysMs: [5_000, 30_000] as const,
  jitterMs: 500,
  maxRetryAfterMs: 60_000,
});

const MAX_SOURCE_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 60_000;

export function isTransientSourceFailure(error: SourceFetchError): boolean {
  if (error.code === "NETWORK" || error.code === "TIMEOUT") return true;
  return error.code === "HTTP" && (error.status === 429 || (error.status !== undefined && error.status >= 500));
}

function retryAfterDelayMs(value: string | null, nowMs: number): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - nowMs);
}

export function boundedRetryDelayMs(
  baseDelayMs: number,
  options: { retryAfter?: string | null; jitterMs?: number; maxRetryAfterMs?: number; random?: () => number; nowMs?: number } = {},
): number {
  const retryAfter = retryAfterDelayMs(options.retryAfter ?? null, options.nowMs ?? Date.now());
  const boundedBase = Math.max(0, retryAfter ?? baseDelayMs);
  const maxDelay = Math.max(0, Math.min(options.maxRetryAfterMs ?? MAX_RETRY_DELAY_MS, MAX_RETRY_DELAY_MS));
  const jitterLimit = Math.max(0, Math.min(options.jitterMs ?? 0, 1_000));
  const random = Math.max(0, Math.min((options.random ?? Math.random)(), 0.999999));
  const jitter = Math.floor(random * (jitterLimit + 1));
  return Math.min(boundedBase + jitter, maxDelay);
}

function withFetchContext(
  error: SourceFetchError,
  attempts: number,
  elapsedMs: number,
  retryExhausted: boolean,
): SourceFetchError {
  return new SourceFetchError(error.code, error.status, error.causeCode, { attempts, elapsedMs, retryExhausted });
}

/**
 * Secret-safe bounded JSON request policy shared by official providers.
 * Only connection/timeout, HTTP 429 and HTTP 5xx are retryable. Successful
 * malformed JSON and deterministic schema/auth failures never retry.
 */
export async function fetchOfficialJson(url: URL, options: FetchOfficialJsonOptions = {}): Promise<unknown> {
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 8_000, 60_000));
  const requestedAttempts = options.maxAttempts ?? ((options.retries ?? 1) + 1);
  const maxAttempts = Math.max(1, Math.min(Math.trunc(requestedAttempts), MAX_SOURCE_ATTEMPTS));
  const legacyDelayMs = Math.max(0, Math.min(options.retryDelayMs ?? 250, 2_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const random = options.random ?? Math.random;
  const nowMs = options.nowMs ?? Date.now;
  const startedAt = nowMs();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let failure: SourceFetchError | null = null;
    let retryAfter: string | null = null;
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) {
        retryAfter = response.headers.get("retry-after");
        throw new SourceFetchError("HTTP", response.status);
      }
      try {
        return await response.json();
      } catch {
        throw new SourceFetchError("MALFORMED_JSON");
      }
    } catch (error) {
      failure = classifySourceFetchFailure(error);
    } finally {
      clearTimeout(timer);
    }

    const retryable = isTransientSourceFailure(failure!);
    const exhausted = retryable && attempt === maxAttempts - 1;
    if (!retryable || exhausted) {
      throw withFetchContext(failure!, attempt + 1, nowMs() - startedAt, exhausted);
    }

    const baseDelay = options.retryDelaysMs?.[attempt] ?? (legacyDelayMs * (2 ** attempt));
    const delay = boundedRetryDelayMs(baseDelay, {
      retryAfter,
      jitterMs: options.jitterMs,
      maxRetryAfterMs: options.maxRetryAfterMs,
      random,
      nowMs: nowMs(),
    });
    await sleep(delay);
  }
  throw new SourceFetchError("HTTP", undefined, undefined, { attempts: maxAttempts, elapsedMs: nowMs() - startedAt, retryExhausted: true });
}

const SAFE_INTERNAL_CAUSE_CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/;

/** Converts an exception to bounded operational detail without echoing URLs or secrets. */
export function safeSourceFailureDetail(error: unknown): string {
  if (error instanceof SourceFetchError) {
    const parts = [
      `failureClass=${error.code}`,
      ...(error.causeCode ? [`causeCode=${error.causeCode}`] : []),
      ...(error.status === undefined ? [] : [`httpStatus=${error.status}`]),
      `attempts=${error.attempts}`,
      `elapsedMs=${Math.min(error.elapsedMs, 3_600_000)}`,
      `retryExhausted=${error.retryExhausted}`,
    ];
    return parts.join(" ");
  }
  const raw = error instanceof Error ? error.message : "collector_error";
  const causeCode = SAFE_INTERNAL_CAUSE_CODE.test(raw)
    ? raw.toUpperCase().replace(/[.:-]/g, "_")
    : "COLLECTOR_ERROR";
  const failureClass = /(?:^|_)RESULT_30$|SERVICE_KEY/.test(causeCode)
    ? "AUTH"
    : causeCode.includes("SCHEMA")
      ? "SCHEMA"
      : "VALIDATION";
  return `failureClass=${failureClass} causeCode=${causeCode} attempts=1 elapsedMs=0 retryExhausted=false`;
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
  physicalFlightId: string;
  upstreamFid: string | null;
  direction: "departure" | "arrival";
  flightNumber: string;
  masterFlightNumber: string | null;
  codeshare: string | null;
  airlineCode: string | null;
  airportCode: string | null;
  terminal: "T1" | "T2" | null;
  gate: string | null;
  checkinCounter: string | null;
  status: "scheduled" | "on_time" | "delayed" | "cancelled" | "unknown";
  scheduledAt: string;
  changedAt: string | null;
}

export async function normalizeAirportFlight(raw: unknown, direction: "departure" | "arrival", retrievedAt: string, sourceId = "INCHEON_FLIGHT_DETAIL"): Promise<CanonicalAirportFlight> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const marketingFlightNumber = requiredString(record, ["flightId", "flight_id", "fltNo"]);
  const scheduledAt = normalizeKstTimestamp(requiredString(record, ["scheduleDateTime", "scheduleDatetime", "scheduledAt"]));
  const masterFlightNumber = optionalString(record, ["masterFlightId"]);
  const flightNumber = masterFlightNumber ?? marketingFlightNumber;
  const rawTerminal = optionalString(record, ["terminalId", "terminalid", "terminal", "terminalNo"]);
  const terminal: "T1" | "T2" | null = ["P01", "T1", "1"].includes(rawTerminal ?? "") ? "T1" : ["P03", "T2", "2"].includes(rawTerminal ?? "") ? "T2" : null;
  const rawStatus = optionalString(record, ["remark", "status", "flightStatus"])?.toLowerCase() ?? "";
  const status = rawStatus.includes("cancel") || rawStatus.includes("결항") ? "cancelled" : rawStatus.includes("delay") || rawStatus.includes("지연") ? "delayed" : rawStatus.includes("on time") || rawStatus.includes("정상") ? "on_time" : rawStatus ? "scheduled" : "unknown";
  const changedValue = optionalString(record, ["estimatedDateTime", "changedDateTime", "changedAt"]);
  const changedAt = changedValue ? normalizeKstTimestamp(changedValue) : null;
  const qualityStatus: QualityStatus = terminal ? "VALID" : "PARTIAL";
  const freshness: SourceStatus = "LIVE";
  const physicalFlightId = await sha256({
    direction,
    serviceDate: scheduledAt.slice(0, 10),
    operatingFlight: masterFlightNumber ?? flightNumber,
    scheduledTime: scheduledAt.slice(11, 16),
  });
  const semanticRecord = {
    sourceId,
    physicalFlightId,
    upstreamFid: optionalString(record, ["fid"]),
    direction,
    flightNumber,
    masterFlightNumber,
    codeshare: optionalString(record, ["codeshare"]),
    airlineCode: optionalString(record, ["airline", "airlineCode"]),
    airportCode: optionalString(record, ["airport", "airportCode", "airportcode"]),
    terminal,
    gate: optionalString(record, ["gateNumber", "gate", "gateNo", "gatenumber"]),
    checkinCounter: optionalString(record, ["chkinRange", "chkinrange", "checkinCounter"]),
    status,
    scheduledAt,
    changedAt,
  } as const;
  return {
    sourceId,
    recordOrigin: "LIVE",
    physicalFlightId,
    upstreamFid: semanticRecord.upstreamFid,
    direction,
    flightNumber,
    masterFlightNumber,
    codeshare: semanticRecord.codeshare,
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

export interface CanonicalScheduledAirportFlight {
  sourceId: string;
  physicalScheduleId: string;
  upstreamFid: string | null;
  season: string;
  validFrom: string;
  validTo: string;
  weekdays: string[];
  flightNumber: string;
  masterFlightNumber: string | null;
  codeshare: string | null;
  airline: string | null;
  airlineCode: string | null;
  airport: string | null;
  airportCode: string | null;
  terminal: "T1" | "T2" | null;
  scheduledTime: string;
  retrievedAt: string;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

/** A3 schedule rows are kept separate from actual/current operations. */
export async function normalizeScheduledAirportFlight(raw: unknown, retrievedAt: string): Promise<CanonicalScheduledAirportFlight> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const flightNumber = requiredString(record, ["flightId"]);
  const rawTerminal = optionalString(record, ["terminalId"]);
  const terminal: "T1" | "T2" | null = ["P01", "T1", "1"].includes(rawTerminal ?? "") ? "T1" : ["P03", "T2", "2"].includes(rawTerminal ?? "") ? "T2" : null;
  const time = requiredString(record, ["st"]).replace(/\D/g, "").padStart(4, "0");
  if (!/^\d{4}$/.test(time)) throw new SourceFetchError("SCHEMA");
  const weekdayFields = [["ynMon", "MON"], ["ynTue", "TUE"], ["ynWed", "WED"], ["ynThu", "THU"], ["ynFri", "FRI"], ["ynSat", "SAT"], ["ynSun", "SUN"]] as const;
  const weekdays = weekdayFields.filter(([key]) => optionalString(record, [key]) === "Y").map(([, day]) => day);
  const semantic = {
    sourceId: "INCHEON_SCHEDULED_DUTY_FREE",
    season: requiredString(record, ["season"]),
    validFrom: normalizeYyyymmdd(requiredString(record, ["firstdate"])),
    validTo: normalizeYyyymmdd(requiredString(record, ["lastdate"])),
    weekdays,
    flightNumber,
    masterFlightNumber: optionalString(record, ["masterFlightId"]),
    codeshare: optionalString(record, ["codeshare"]),
    airline: optionalString(record, ["airline"]),
    airlineCode: optionalString(record, ["airlineCode"]),
    airport: optionalString(record, ["airport"]),
    airportCode: optionalString(record, ["airportCode"]),
    terminal,
    scheduledTime: `${time.slice(0, 2)}:${time.slice(2)}`,
  };
  return {
    ...semantic,
    physicalScheduleId: await sha256({ season: semantic.season, operatingFlight: semantic.masterFlightNumber ?? flightNumber, terminal, scheduledTime: semantic.scheduledTime }),
    upstreamFid: optionalString(record, ["fid"]),
    retrievedAt,
    schemaVersion: "airport-schedule-v1",
    qualityStatus: terminal && weekdays.length ? "VALID" : "PARTIAL",
    sourceHash: await sha256(semantic),
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
  /**
   * Raw provider wait-time string. The provider can return a lower-bound form
   * such as "60+" (60 minutes or more, A4-T2's official 매우혼잡 case); that
   * value is preserved here and NEVER coerced into a false-exact
   * `waitTimeMinutes`. Only a plain non-negative integer string becomes an
   * exact `waitTimeMinutes`.
   */
  waitTimeRaw: string | null;
  waitingCount: number;
  observedAt: string;
  retrievedAt: string;
  freshness: SourceStatus;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

/** Shared by A4-T1 and A4-T2: only an exact integer string becomes a numeric wait time. */
function parseWaitTime(rawWait: string | null): { minutes: number | null; raw: string | null } {
  if (rawWait === null) return { minutes: null, raw: null };
  const minutes = /^\d+$/.test(rawWait) ? Number(rawWait) : null;
  return { minutes, raw: rawWait };
}

/**
 * A4-T1 — departure-hall checkpoint congestion (제1여객터미널, `15148225`).
 * Checkpoint waiting counts are a demand-flow proxy only; they are never
 * duty-free visitors or store traffic.
 */
export async function normalizeAirportCongestion(raw: unknown, retrievedAt: string): Promise<CanonicalAirportCongestion> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const rawTerminal = requiredString(record, ["terminalId", "terminalid"]);
  const terminal = rawTerminal === "P01" || rawTerminal === "T1" ? "T1" : null;
  if (!terminal) throw new SourceFetchError("SCHEMA");
  const { minutes: waitTimeMinutes, raw: waitTimeRaw } = parseWaitTime(optionalString(record, ["waitTime", "waittime"]));
  const semanticRecord = {
    sourceId: "INCHEON_DEPARTURE_CONGESTION",
    terminal,
    zone: requiredString(record, ["gateId", "gateid"]),
    waitTimeMinutes,
    waitTimeRaw,
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

/** Official documented A4-T2 gate IDs (departure-gate checkpoint groups). */
const A4_T2_GATE_IDS = new Set(["DG1_A", "DG1_B", "DG1_C", "DG1_D", "DG2_A", "DG2_B", "DG2_C", "DG2_D"]);

/**
 * A4-T2 — 출국장 혼잡도 제2여객터미널 조회 (`15161098`,
 * statusOfDepartureCongestionT2/getDepartureCongestionT2). This is a
 * genuinely separate dataset from A4-T1 (`15148225`), not a `terminalId`
 * value on the T1 endpoint. The official response's `terminalId` is always
 * `"P03"` meaning Terminal 2 — it is NOT a `gateId`. The guide's own sample
 * request using `gateId=P03` is a documented inconsistency in the official
 * doc and must never be copied; valid `gateId` values are `DG1_A..DG1_D` /
 * `DG2_A..DG2_D` (see docs/DATA_SOURCES.md). `waitTime` can be a "60+"
 * lower-bound string; see `parseWaitTime`.
 */
export async function normalizeAirportCongestionT2(raw: unknown, retrievedAt: string): Promise<CanonicalAirportCongestion> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA");
  const record = raw as Record<string, unknown>;
  const rawTerminal = requiredString(record, ["terminalId", "terminalid"]);
  if (rawTerminal !== "P03") throw new SourceFetchError("SCHEMA");
  const zone = requiredString(record, ["gateId", "gateid"]);
  const { minutes: waitTimeMinutes, raw: waitTimeRaw } = parseWaitTime(optionalString(record, ["waitTime", "waittime"]));
  const semanticRecord = {
    sourceId: "INCHEON_DEPARTURE_CONGESTION_T2",
    terminal: "T2" as const,
    zone,
    waitTimeMinutes,
    waitTimeRaw,
    waitingCount: requiredNumericString(record, ["waitLength", "waitlength"]),
    observedAt: normalizeKstTimestamp(requiredString(record, ["occurtime", "occurTime"])),
  } as const;
  return {
    ...semanticRecord,
    recordOrigin: "LIVE",
    retrievedAt,
    freshness: "LIVE",
    schemaVersion: "airport-congestion-t2-v1",
    // An undocumented gateId is stored honestly rather than dropped, but
    // flagged PARTIAL so it is never silently treated as fully verified.
    qualityStatus: A4_T2_GATE_IDS.has(zone) ? "VALID" : "PARTIAL",
    sourceHash: await sha256(semanticRecord),
  };
}

/** Official A5 field -> (terminal, direction, zone, isAggregate) map. V5.0 field names only; never the pre-V5.0 aliases. */
const A5_FIELDS = [
  { key: "t1dg1", terminal: "T1", direction: "departure", isAggregate: false },
  { key: "t1dg2", terminal: "T1", direction: "departure", isAggregate: false },
  { key: "t1dg3", terminal: "T1", direction: "departure", isAggregate: false },
  { key: "t1dg4", terminal: "T1", direction: "departure", isAggregate: false },
  { key: "t1dg5", terminal: "T1", direction: "departure", isAggregate: false },
  { key: "t1dg6", terminal: "T1", direction: "departure", isAggregate: false },
  { key: "t1dgsum1", terminal: "T1", direction: "departure", isAggregate: true },
  { key: "t1eg1", terminal: "T1", direction: "arrival", isAggregate: false },
  { key: "t1eg2", terminal: "T1", direction: "arrival", isAggregate: false },
  { key: "t1eg3", terminal: "T1", direction: "arrival", isAggregate: false },
  { key: "t1eg4", terminal: "T1", direction: "arrival", isAggregate: false },
  { key: "t1egsum1", terminal: "T1", direction: "arrival", isAggregate: true },
  { key: "t2dg1", terminal: "T2", direction: "departure", isAggregate: false },
  { key: "t2dg2", terminal: "T2", direction: "departure", isAggregate: false },
  // Official field is t2dgsum2 (not t2dgsum1) — do not "correct" it to look symmetrical with t1dgsum1.
  { key: "t2dgsum2", terminal: "T2", direction: "departure", isAggregate: true },
  { key: "t2eg1", terminal: "T2", direction: "arrival", isAggregate: false },
  { key: "t2eg2", terminal: "T2", direction: "arrival", isAggregate: false },
  { key: "t2egsum1", terminal: "T2", direction: "arrival", isAggregate: true },
] as const satisfies ReadonlyArray<{ key: string; terminal: "T1" | "T2"; direction: "departure" | "arrival"; isAggregate: boolean }>;

/** A finite, non-negative official numeric value; missing/negative/NaN is dropped, never coerced to 0. Explicit 0/0.0 is preserved. */
function parseA5Count(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

/**
 * A5 rows carry a reason code instead of a bare SCHEMA label.
 *
 * Production run 33344958504 normalized 46 of 50 provider rows and rejected
 * 4 with an indistinguishable "SCHEMA", which cannot say which field failed
 * or why. Reasons are fixed uppercase constants derived from the field name
 * only — provider content is never echoed — and MISSING is kept distinct
 * from TYPE so a numeric `adate`/`atime` is diagnosable without another
 * provider call. Acceptance is unchanged: exactly the non-empty strings
 * requiredString already accepted.
 */
function requiredA5String(record: Record<string, unknown>, key: "adate" | "atime"): string {
  const value = record[key];
  const field = key.toUpperCase();
  if (value === undefined || value === null) throw new SourceFetchError("SCHEMA", undefined, `A5_${field}_MISSING`);
  if (typeof value !== "string") throw new SourceFetchError("SCHEMA", undefined, `A5_${field}_TYPE`);
  if (!value.trim()) throw new SourceFetchError("SCHEMA", undefined, `A5_${field}_MISSING`);
  return value.trim();
}

/**
 * A5 `atime` is an hourly interval such as "09_10" or "23_24", not an
 * instantaneous observation. The final band of a KST day must resolve to
 * next-day 00:00, never an invalid same-day "24:00".
 *
 * The provider writes that final band as `"23_00"` — the clock wrapping past
 * midnight — as well as `"23_24"`. Production evidence (2026-08-31 diagnostic):
 * every day stored exactly 23 of 24 bands, ending at 23:00, while the
 * collector reported one `SCHEMA_A5_ATIME_END_HOUR` rejection per request.
 * Rejecting the wrap form cost the last band of every single day, which in
 * turn made `evaluateTerminalCoverage` permanently PARTIAL and hid the daily
 * total, the peak and the timeline behind "확인 불가".
 *
 * `23_00` is accepted because it is unambiguous: a band that starts at 23:00
 * and ends at hour 00 can only end at the following midnight. A `00` end hour
 * after any other start (`05_00`) stays rejected — that would be a backwards
 * or day-long interval, and inventing a meaning for it would fabricate data.
 */
function parseA5TimeBand(adate: string, atime: string): { targetDate: string; targetStartAt: string; targetEndAt: string } {
  const dateMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(adate.trim());
  if (!dateMatch) throw new SourceFetchError("SCHEMA", undefined, "A5_ADATE_FORMAT");
  const targetDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const bandMatch = /^(\d{2})_(\d{2})$/.exec(atime.trim());
  if (!bandMatch) throw new SourceFetchError("SCHEMA", undefined, "A5_ATIME_FORMAT");
  const startHour = Number(bandMatch[1]);
  const rawEndHour = Number(bandMatch[2]);
  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) throw new SourceFetchError("SCHEMA", undefined, "A5_ATIME_START_HOUR");
  // Normalize the midnight wrap before range-checking, so the day's last band
  // is kept instead of being discarded as an out-of-range end hour.
  const endHour = rawEndHour === 0 && startHour === 23 ? 24 : rawEndHour;
  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) throw new SourceFetchError("SCHEMA", undefined, "A5_ATIME_END_HOUR");
  const targetStartAt = `${targetDate}T${String(startHour).padStart(2, "0")}:00:00+09:00`;
  let targetEndAt: string;
  if (endHour === 24) {
    // Pure KST calendar-date arithmetic (never through a UTC instant, which
    // would silently pick the wrong calendar day near a +09:00 boundary).
    const nextDay = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]) + 1)).toISOString().slice(0, 10);
    targetEndAt = `${nextDay}T00:00:00+09:00`;
  } else {
    targetEndAt = `${targetDate}T${String(endHour).padStart(2, "0")}:00:00+09:00`;
  }
  if (Number.isNaN(Date.parse(targetStartAt)) || Number.isNaN(Date.parse(targetEndAt))) throw new SourceFetchError("SCHEMA", undefined, "A5_TIME_BAND_UNPARSEABLE");
  return { targetDate, targetStartAt, targetEndAt };
}

export interface CanonicalAirportPassengerForecastRow {
  sourceId: string;
  recordOrigin: "FORECAST";
  terminal: "T1" | "T2";
  direction: "departure" | "arrival";
  zone: string;
  isAggregate: boolean;
  targetDate: string;
  timeBandRaw: string;
  targetStartAt: string;
  targetEndAt: string;
  expectedPassengers: number;
  retrievedAt: string;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

/**
 * A5 — 승객예고-출·입국장별 (`15095066`, OpenAPI 활용가이드 V5.0,
 * passgrAnncmt/getPassgrAnncmt). This is FORECAST/EXPECTED passenger data,
 * never an actual observed queue — it must never be written into
 * `airport_congestion`. One provider row bundles every T1/T2
 * departure/arrival field for one hourly `atime` band; this expands that row
 * into one canonical row per official field, tagging the provider's own
 * total fields (`t1dgsum1`, `t1egsum1`, `t2dgsum2`, `t2egsum1`) with
 * `isAggregate=true` so downstream summation can use the official total OR
 * sum components, but never both (double-count prevention).
 */
export async function normalizeAirportPassengerForecastRow(raw: unknown, retrievedAt: string): Promise<CanonicalAirportPassengerForecastRow[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SourceFetchError("SCHEMA", undefined, "A5_ROW_NOT_OBJECT");
  const record = raw as Record<string, unknown>;
  const adate = requiredA5String(record, "adate");
  const atimeRaw = requiredA5String(record, "atime");
  const { targetDate, targetStartAt, targetEndAt } = parseA5TimeBand(adate, atimeRaw);
  const results: CanonicalAirportPassengerForecastRow[] = [];
  for (const field of A5_FIELDS) {
    const expectedPassengers = parseA5Count(record[field.key]);
    // Missing or malformed/negative individual fields are dropped, not
    // fabricated as zero and not allowed to abort the whole time band.
    if (expectedPassengers === null) continue;
    const semanticRecord = {
      sourceId: "INCHEON_PASSENGER_FORECAST",
      terminal: field.terminal,
      direction: field.direction,
      zone: field.key,
      isAggregate: field.isAggregate,
      targetDate,
      timeBandRaw: atimeRaw,
      targetStartAt,
      targetEndAt,
      expectedPassengers,
    } as const;
    results.push({
      ...semanticRecord,
      recordOrigin: "FORECAST",
      retrievedAt,
      schemaVersion: "airport-passenger-forecast-v1",
      qualityStatus: "VALID",
      sourceHash: await sha256(semanticRecord),
    });
  }
  return results;
}
