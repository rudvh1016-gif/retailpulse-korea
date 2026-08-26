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
