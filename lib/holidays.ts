import { buildDataGoKrUrl } from './data-go-kr.mjs';
import { fetchOfficialJson, safeSourceFailureDetail, sourceFailureClass } from './source-adapters';
import type { SourceHealthStatus } from './collector';
import { sha256 } from './hash';
import { isValidKstDay, kstDayOf } from './kst';
export interface Holiday { date: string; name: string }

/** KASI 특일 정보 (data.go.kr 15012690), operation getRestDeInfo. */
export const KASI_REST_DAY_ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
export const KASI_HOLIDAY_SCHEMA_VERSION = 'kasi-holidays-v1';

/**
 * A classified AUTH refusal is not asked again inside this window.
 *
 * KASI rides on the A1 runs, so it is attempted in the 00:07 early window and
 * again in the 06:07 daily group. From 2026-09-05 every one of those attempts
 * answered HTTP 403 within ~1.5 s while A1/A2/A3 succeeded with the same key
 * in the same run — the refusal is about this one service on the account, and
 * asking again cannot change it. With the cooldown a blocked service costs one
 * request a day, which is also the check that notices the owner's fix.
 */
export const HOLIDAY_AUTH_COOLDOWN_MS = 20 * 3_600_000;

export function normalizeHolidays(payload: unknown, month: string): Holiday[] {
  const value = payload as {response?: {header?:{resultCode?:unknown};body?:{totalCount?:unknown;items?:{item?:unknown}|string}}};
  // `holiday_result_NN` shares the collectors' `*_result_NN` vocabulary, so
  // 30/31/20 classify as AUTH, 22 as QUOTA and 03 as NO_DATA.
  if (String(value?.response?.header?.resultCode) !== '00') throw new Error(`holiday_result_${String(value?.response?.header?.resultCode??'missing').replace(/[^0-9]/g,'').slice(0,4)||'invalid'}`);
  const body = value.response?.body;
  const total = Number(body?.totalCount);
  if (!Number.isSafeInteger(total) || total < 0 || total > 100) throw new Error('holiday_incomplete_response');
  const raw = typeof body?.items === 'object' ? body.items?.item : undefined;
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (rows.length !== total) throw new Error('holiday_incomplete_response');
  const result: Holiday[] = [];
  for (const row of rows) {
    const date = String(row.locdate).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
    if (!isValidKstDay(date) || !date.startsWith(month) || typeof row.dateName !== 'string' || !['Y','N'].includes(row.isHoliday)) throw new Error('holiday_invalid_row');
    if (row.isHoliday === 'Y') result.push({date,name:row.dateName.slice(0,100)});
  }
  return result;
}

export type HolidayCollectionStatus = 'SUCCESS' | 'NEEDS_KEY' | 'AUTH_BLOCKED' | 'SKIPPED_AUTH_COOLDOWN' | 'ERROR';

export interface HolidayCollection {
  /**
   * AUTH_BLOCKED: the provider refused the key for this service (HTTP 401/403
   * or data.go.kr 20/21/30-33) — an owner action on data.go.kr, never a retry.
   * SKIPPED_AUTH_COOLDOWN: that refusal was recorded less than
   * HOLIDAY_AUTH_COOLDOWN_MS ago, so no request was made.
   * ERROR: anything else, including a timeout that exhausted its one retry.
   */
  status: HolidayCollectionStatus;
  records: number;
  /** Requests that reached the provider, retries included. 0 proves a free skip. */
  providerRequests: number;
  /** Secret-free failure detail in the shared failureClass vocabulary. */
  detail?: string;
  /** When the stored months were actually received; never the time of a skip. */
  retrievedAt?: string;
  /**
   * True only when holiday_months holds a stored KASI month for the current
   * or next month. A failed attempt never touches those rows, but when none
   * was ever stored there is nothing to preserve and this says so.
   */
  lastGoodPreserved: boolean;
}

interface HealthRow { status?: unknown; detail?: unknown; updated_at?: unknown }

/** True while the last recorded attempt was a classified AUTH refusal younger than the cooldown. */
export function holidayAuthCooldownActive(row: HealthRow | null | undefined, now: Date): boolean {
  if (!row || row.status !== 'ERROR' || typeof row.detail !== 'string' || !/(?:^|\s)failureClass=AUTH\b/.test(row.detail)) return false;
  const at = Date.parse(String(row.updated_at ?? ''));
  return Number.isFinite(at) && at <= now.getTime() && now.getTime() - at < HOLIDAY_AUTH_COOLDOWN_MS;
}

export interface HolidayCollectionOptions {
  /** A person started this run (workflow_dispatch / one-shot import): always check once. */
  ignoreAuthCooldown?: boolean;
  /** Test seam; Production uses the platform fetch. */
  fetchImpl?: typeof fetch;
}

/** Existing daily Actions runner only. One current and one next month; daily cache. */
export async function collectHolidays(db: D1Database, key: string | undefined, now = new Date(), options: HolidayCollectionOptions = {}): Promise<HolidayCollection> {
  const month = kstDayOf(now.toISOString()).slice(0,7);
  const next = new Date(`${month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth()+1);
  const months = [month, next.toISOString().slice(0,7)];
  let providerRequests = 0, records = 0;
  const stored = new Map<string, string>();
  try {
    for (const selected of months) {
      const cached = await db.prepare('SELECT retrieved_at FROM holiday_months WHERE month=?').bind(selected).first<{retrieved_at:string}>();
      if (cached?.retrieved_at) stored.set(selected, cached.retrieved_at);
    }
  } catch (error) {
    return { status: 'ERROR', records: 0, providerRequests: 0, detail: safeSourceFailureDetail(error), lastGoodPreserved: false };
  }
  const hasStored = () => stored.size > 0;
  if (!key) return { status: 'NEEDS_KEY', records: 0, providerRequests: 0, lastGoodPreserved: hasStored() };

  if (!options.ignoreAuthCooldown) {
    let health: HealthRow | null = null;
    try {
      health = await db.prepare('SELECT status, detail, updated_at FROM source_health WHERE source_id = ?')
        .bind('KASI_PUBLIC_HOLIDAYS').first<HealthRow>();
    } catch {
      // An unreadable cooldown is not a reason to skip: one bounded request follows.
    }
    if (holidayAuthCooldownActive(health, now)) {
      const until = new Date(Date.parse(String(health!.updated_at)) + HOLIDAY_AUTH_COOLDOWN_MS).toISOString();
      return {
        status: 'SKIPPED_AUTH_COOLDOWN', records: 0, providerRequests: 0, lastGoodPreserved: hasStored(),
        detail: `${String(health!.detail).slice(0, 300)} authCooldownUntil=${until}`,
      };
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const countedFetch: typeof fetch = (input, init) => { providerRequests += 1; return fetchImpl(input, init); };
  for (const selected of months) {
    const cachedAt = stored.get(selected);
    if (cachedAt && Date.parse(cachedAt) > now.getTime()-86400000) continue;
    const url = buildDataGoKrUrl(KASI_REST_DAY_ENDPOINT,key,
      {solYear:selected.slice(0,4),solMonth:selected.slice(5,7),numOfRows:'100',pageNo:'1',_type:'json'});
    try {
      // Bounded: one retry, and only for a timeout/connection failure or 5xx.
      // 401/403 and data.go.kr auth codes are never re-requested.
      const payload = await fetchOfficialJson(url,{timeoutMs:8000,retries:1,fetchImpl:countedFetch});
      const rows = normalizeHolidays(payload,selected);
      const retrievedAt = now.toISOString();
      await db.prepare(`INSERT INTO holiday_months(month,payload,retrieved_at,source_hash) VALUES(?,?,?,?)
        ON CONFLICT(month) DO UPDATE SET payload=excluded.payload,retrieved_at=excluded.retrieved_at,source_hash=excluded.source_hash`)
        .bind(selected,JSON.stringify(rows),retrievedAt,await sha256(rows)).run();
      stored.set(selected, retrievedAt);
      records += rows.length;
    } catch (error) {
      // Stored months are left exactly as they were, with their own retrieved_at.
      return {
        status: sourceFailureClass(error) === 'AUTH' ? 'AUTH_BLOCKED' : 'ERROR',
        records, providerRequests, detail: safeSourceFailureDetail(error), lastGoodPreserved: hasStored(),
      };
    }
  }
  // The real receipt time of the stored months, not the time of this run.
  const retrievedAt = [...stored.values()].sort().at(-1);
  return { status: 'SUCCESS', records, providerRequests, retrievedAt, lastGoodPreserved: true };
}

/**
 * The source_health write for one holiday collection, or null to leave the row
 * untouched (a cooldown skip must not move the time the refusal was observed).
 * A failure never supplies a retrievedAt, so the last real success time stays.
 */
export function holidayHealthUpdate(result: HolidayCollection): {
  status: SourceHealthStatus; detail: string; record?: { retrievedAt: string; schemaVersion: string };
} | null {
  switch (result.status) {
    case 'SUCCESS':
      return { status: 'LIVE', detail: 'SUCCESS',
        record: result.retrievedAt ? { retrievedAt: result.retrievedAt, schemaVersion: KASI_HOLIDAY_SCHEMA_VERSION } : undefined };
    case 'NEEDS_KEY':
      return { status: 'MISSING', detail: 'NEEDS_KEY' };
    case 'SKIPPED_AUTH_COOLDOWN':
      return null;
    default:
      return { status: 'ERROR', detail: result.detail ?? 'failureClass=VALIDATION causeCode=HOLIDAY_UNKNOWN' };
  }
}
