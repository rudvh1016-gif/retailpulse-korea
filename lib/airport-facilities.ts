/**
 * Airport Retail A2 — official passenger-terminal facility directory.
 *
 * Source: 인천국제공항공사_여객터미널 시설정보 현황 (data.go.kr 15095064),
 * operation `getFacilitesInfo` (the official spelling; do not "correct" it).
 * Free, 이용허락범위 제한 없음, development quota 1,000 requests/day.
 *
 * Shape of the work
 *   · Reference data that changes slowly, so a run that succeeded within the
 *     last FACILITY_REFRESH_DAYS is skipped without a provider request.
 *   · Korean is the structural pass: one row per official `sn`. English,
 *     Japanese and Chinese passes only add names (and the English location)
 *     to rows whose `sn` the Korean pass produced; anything else is counted
 *     as unmatched and never invents a facility.
 *   · Changed-only upsert keyed by facility_id with a semantic hash; a
 *     failed or empty run never deletes, closes or zeroes a facility and
 *     never overwrites last-good rows.
 *   · Bounded: at most FACILITY_MAX_PAGES pages of FACILITY_PAGE_SIZE rows
 *     per language, so one run is ≤ 4 × FACILITY_MAX_PAGES requests.
 */
import { buildDataGoKrUrl } from "./data-go-kr.mjs";
import { writeCollectorStatus, writeSourceHealth, type CollectorEnv, type CollectorResult } from "./collector";
import { describeWrites, NO_D1_WRITES, runD1Batches, type D1WriteCounts } from "./d1-write-counts";
import { sha256 } from "./hash";
import { fetchOfficialJson, safeSourceFailureDetail } from "./source-adapters";
import type { QualityStatus } from "./contracts";

export const FACILITY_SOURCE_ID = "INCHEON_FACILITY_DIRECTORY";
export const FACILITY_ENDPOINT = "https://apis.data.go.kr/B551177/FacilitiesInformation/getFacilitesInfo";
export const FACILITY_SCHEMA_VERSION = "airport-facility-v1";
export const FACILITY_PAGE_SIZE = 100;
export const FACILITY_MAX_PAGES = 30;
export const FACILITY_REFRESH_DAYS = 6;
/** Official `lang` values. Korean first because it is the structural pass. */
export const FACILITY_LANGS = ["K", "E", "J", "C"] as const;
export type FacilityLang = typeof FACILITY_LANGS[number];

export type FacilityTerminal = "T1" | "T2" | "CONCOURSE" | "T1_TRANSPORT" | "T2_TRANSPORT";
export type FacilityCategoryGroup = "DUTY_FREE" | "FOOD" | "CONVENIENCE" | "PHARMACY" | "EXCHANGE_TELECOM" | "SERVICE";
export const FACILITY_CATEGORY_GROUPS: readonly FacilityCategoryGroup[] = ["DUTY_FREE", "FOOD", "CONVENIENCE", "PHARMACY", "EXCHANGE_TELECOM", "SERVICE"];
export const FACILITY_TERMINALS: readonly FacilityTerminal[] = ["T1", "T2", "CONCOURSE", "T1_TRANSPORT", "T2_TRANSPORT"];

/** Official terminalid codes, verified in the dataset guide. */
const TERMINAL_BY_CODE: Record<string, FacilityTerminal> = {
  P01: "T1",
  P03: "T2",
  G01: "CONCOURSE",
  G02: "T1_TRANSPORT",
  G03: "T2_TRANSPORT",
};

export interface CanonicalAirportFacility {
  facilityId: string;
  sourceId: string;
  nameKo: string | null;
  nameEn: string | null;
  nameZh: string | null;
  nameJa: string | null;
  facilityItem: string | null;
  largeCategory: string | null;
  mediumCategory: string | null;
  smallCategory: string | null;
  /** KORETAIL grouping of the official categories; the official strings stay beside it. */
  categoryGroup: FacilityCategoryGroup;
  terminalCode: string | null;
  terminal: FacilityTerminal | null;
  floor: string | null;
  dutyArea: "DUTY_FREE" | "GENERAL" | null;
  arrivalDeparture: "ARRIVAL" | "DEPARTURE" | null;
  locationRaw: string | null;
  locationEn: string | null;
  businessHoursRaw: string | null;
  goodsBrands: string | null;
  phone: string | null;
  retrievedAt: string;
  schemaVersion: string;
  qualityStatus: QualityStatus;
  sourceHash: string;
}

function text(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/**
 * KORETAIL grouping. Keyword rules over the official category names and
 * the facility name, Korean pass only. Anything unmatched is SERVICE; no
 * facility is ever dropped because it did not match a keyword.
 */
export function classifyFacility(input: { largeCategory: string | null; mediumCategory: string | null; smallCategory: string | null; facilityItem: string | null; nameKo: string | null }): FacilityCategoryGroup {
  const haystack = [input.largeCategory, input.mediumCategory, input.smallCategory, input.facilityItem, input.nameKo].filter(Boolean).join(" ");
  if (/면세/.test(haystack)) return "DUTY_FREE";
  if (/약국|드럭스토어|약\s*국/.test(haystack)) return "PHARMACY";
  if (/편의점/.test(haystack)) return "CONVENIENCE";
  if (/환전|은행|통신|로밍|유심|USIM|SIM|ATM|우체국|택배|보험/i.test(haystack)) return "EXCHANGE_TELECOM";
  if (/식당|음식|카페|커피|레스토랑|푸드|베이커리|제과|디저트|간식|주점|맥주|치킨|피자|버거|국수|라멘|분식|한식|중식|일식|양식|F&B|푸드코트|스낵|아이스크림|음료|주스/i.test(haystack)) return "FOOD";
  return "SERVICE";
}

export async function normalizeAirportFacility(raw: unknown, retrievedAt: string): Promise<CanonicalAirportFacility> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("facility_schema");
  const record = raw as Record<string, unknown>;
  const facilityId = text(record, ["sn", "SN"]);
  if (!facilityId) throw new Error("facility_missing_sn");
  const terminalCode = text(record, ["terminalid", "terminalId"]);
  const lcduty = (text(record, ["lcduty"]) ?? "").toUpperCase();
  const arrordep = (text(record, ["arrordep"]) ?? "").toUpperCase();
  const semantic = {
    facilityId,
    nameKo: text(record, ["facilitynm", "facilityNm"]),
    facilityItem: text(record, ["facilityitem", "facilityItem"]),
    largeCategory: text(record, ["lcategorynm"]),
    mediumCategory: text(record, ["mcategorynm"]),
    smallCategory: text(record, ["scategorynm"]),
    terminalCode,
    terminal: terminalCode ? TERMINAL_BY_CODE[terminalCode] ?? null : null,
    floor: text(record, ["floorinfo", "floorInfo"]),
    dutyArea: lcduty === "Y" ? "DUTY_FREE" as const : lcduty === "N" ? "GENERAL" as const : null,
    arrivalDeparture: arrordep === "A" ? "ARRIVAL" as const : arrordep === "D" ? "DEPARTURE" as const : null,
    locationRaw: text(record, ["lcnm"]),
    businessHoursRaw: text(record, ["servicetime", "serviceTime"]),
    goodsBrands: text(record, ["GOODS", "goods"]),
    phone: text(record, ["tel"]),
  };
  const categoryGroup = classifyFacility(semantic);
  return {
    ...semantic,
    sourceId: FACILITY_SOURCE_ID,
    nameEn: null,
    nameZh: null,
    nameJa: null,
    locationEn: null,
    categoryGroup,
    retrievedAt,
    schemaVersion: FACILITY_SCHEMA_VERSION,
    qualityStatus: semantic.nameKo && semantic.terminal ? "VALID" : "PARTIAL",
    sourceHash: await sha256({ ...semantic, categoryGroup }),
  };
}

/** Adds one language's names to the Korean-keyed rows; returns how many rows matched. */
export function mergeFacilityLanguage(rows: Map<string, CanonicalAirportFacility>, lang: FacilityLang, items: unknown[]): { matched: number; unmatched: number } {
  let matched = 0;
  let unmatched = 0;
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { unmatched += 1; continue; }
    const record = raw as Record<string, unknown>;
    const id = text(record, ["sn", "SN"]);
    const row = id ? rows.get(id) : undefined;
    if (!row) { unmatched += 1; continue; }
    const name = text(record, ["facilitynm", "facilityNm"]);
    if (lang === "E") { row.nameEn = name; row.locationEn = text(record, ["lcnm"]); }
    else if (lang === "J") row.nameJa = name;
    else if (lang === "C") row.nameZh = name;
    matched += 1;
  }
  return { matched, unmatched };
}

/** Re-hash after the language merge so a translated name change is a change. */
export async function finalizeFacilityHashes(rows: Iterable<CanonicalAirportFacility>): Promise<CanonicalAirportFacility[]> {
  const out: CanonicalAirportFacility[] = [];
  for (const row of rows) {
    // The hash covers meaning, not when it was fetched: retrievedAt and the
    // previous hash are excluded so an unchanged facility is not rewritten.
    const semantic: Partial<CanonicalAirportFacility> = { ...row };
    delete semantic.retrievedAt;
    delete semantic.sourceHash;
    out.push({ ...row, sourceHash: await sha256(semantic) });
  }
  return out;
}

export interface FacilityCoverage {
  total: number;
  byTerminal: Record<string, number>;
  byGroup: Record<FacilityCategoryGroup, number>;
  dutyFreeArea: number;
  generalArea: number;
  arrivalSide: number;
  departureSide: number;
  missingHours: number;
  missingLocation: number;
  missingTerminal: number;
  withEnglishName: number;
  withJapaneseName: number;
  withChineseName: number;
}

export function summarizeFacilityCoverage(rows: readonly CanonicalAirportFacility[]): FacilityCoverage {
  const coverage: FacilityCoverage = {
    total: rows.length, byTerminal: {},
    byGroup: { DUTY_FREE: 0, FOOD: 0, CONVENIENCE: 0, PHARMACY: 0, EXCHANGE_TELECOM: 0, SERVICE: 0 },
    dutyFreeArea: 0, generalArea: 0, arrivalSide: 0, departureSide: 0,
    missingHours: 0, missingLocation: 0, missingTerminal: 0,
    withEnglishName: 0, withJapaneseName: 0, withChineseName: 0,
  };
  for (const row of rows) {
    const terminalKey = row.terminal ?? "UNKNOWN";
    coverage.byTerminal[terminalKey] = (coverage.byTerminal[terminalKey] ?? 0) + 1;
    coverage.byGroup[row.categoryGroup] += 1;
    if (row.dutyArea === "DUTY_FREE") coverage.dutyFreeArea += 1;
    if (row.dutyArea === "GENERAL") coverage.generalArea += 1;
    if (row.arrivalDeparture === "ARRIVAL") coverage.arrivalSide += 1;
    if (row.arrivalDeparture === "DEPARTURE") coverage.departureSide += 1;
    if (!row.businessHoursRaw) coverage.missingHours += 1;
    if (!row.locationRaw) coverage.missingLocation += 1;
    if (!row.terminal) coverage.missingTerminal += 1;
    if (row.nameEn) coverage.withEnglishName += 1;
    if (row.nameJa) coverage.withJapaneseName += 1;
    if (row.nameZh) coverage.withChineseName += 1;
  }
  return coverage;
}

export function describeFacilityCoverage(coverage: FacilityCoverage): string {
  const terminals = Object.entries(coverage.byTerminal).map(([k, v]) => `${k}:${v}`).join(",");
  const groups = Object.entries(coverage.byGroup).map(([k, v]) => `${k}:${v}`).join(",");
  return `facilities ${coverage.total}; terminals ${terminals}; groups ${groups}; duty ${coverage.dutyFreeArea}/general ${coverage.generalArea}; arr ${coverage.arrivalSide}/dep ${coverage.departureSide}; en ${coverage.withEnglishName} ja ${coverage.withJapaneseName} zh ${coverage.withChineseName}; missing hours ${coverage.missingHours} location ${coverage.missingLocation} terminal ${coverage.missingTerminal}`;
}

type Fetcher = (url: URL, options?: { timeoutMs?: number; retries?: number }) => Promise<unknown>;

interface FacilityBody { items?: unknown[] | { item?: unknown[] | unknown }; totalCount?: number | string }
interface Envelope { response?: { header?: { resultCode?: string }; body?: FacilityBody } }

function pageItems(body: FacilityBody | undefined): unknown[] {
  const raw = body?.items;
  if (Array.isArray(raw)) return raw;
  const nested = raw && typeof raw === "object" ? (raw as { item?: unknown[] | unknown }).item : undefined;
  return Array.isArray(nested) ? nested : nested ? [nested] : [];
}

/** Reads every page of one language, bounded. Returns the raw items and the request count. */
export async function fetchFacilityLanguage(serviceKey: string, lang: FacilityLang, fetcher: Fetcher): Promise<{ items: unknown[]; requests: number; totalCount: number }> {
  const items: unknown[] = [];
  let requests = 0;
  let totalCount = 0;
  for (let pageNo = 1; pageNo <= FACILITY_MAX_PAGES; pageNo += 1) {
    const url = buildDataGoKrUrl(FACILITY_ENDPOINT, serviceKey, { type: "json", lang, numOfRows: String(FACILITY_PAGE_SIZE), pageNo: String(pageNo) });
    requests += 1;
    const payload = await fetcher(url, { timeoutMs: 30_000, retries: 1 }) as Envelope;
    const code = payload?.response?.header?.resultCode;
    if (code !== "00") throw new Error(`facility_result_${String(code ?? "missing")}_lang_${lang}_page_${pageNo}`);
    const body = payload.response?.body;
    if (pageNo === 1) totalCount = Number(body?.totalCount) || 0;
    const page = pageItems(body);
    items.push(...page);
    if (page.length < FACILITY_PAGE_SIZE || items.length >= totalCount) break;
  }
  return { items, requests, totalCount };
}

/** True when a SUCCESS run within the refresh window already exists — the run is then free. */
export async function hasFreshFacilityRun(db: D1Database | undefined, now: Date): Promise<boolean> {
  if (!db) return false;
  const since = new Date(now.getTime() - FACILITY_REFRESH_DAYS * 86_400_000).toISOString();
  const result = await db.prepare(`SELECT started_at FROM collector_runs WHERE source_id = ? AND status = 'SUCCESS' AND started_at >= ? ORDER BY started_at DESC LIMIT 1`)
    .bind(FACILITY_SOURCE_ID, since).all<{ started_at: string }>();
  return (result.results ?? []).length > 0;
}

async function persistFacilities(db: D1Database | undefined, rows: CanonicalAirportFacility[]): Promise<D1WriteCounts> {
  if (!db || !rows.length) return NO_D1_WRITES;
  const statements = rows.map((row) => db.prepare(`INSERT INTO airport_facility (
      facility_id, source_id, name_ko, name_en, name_zh, name_ja, facility_item,
      large_category, medium_category, small_category, category_group,
      terminal_code, terminal, floor, duty_area, arrival_departure,
      location_raw, location_en, business_hours_raw, goods_brands, phone,
      retrieved_at, schema_version, quality_status, source_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(facility_id) DO UPDATE SET
      name_ko = excluded.name_ko, name_en = excluded.name_en, name_zh = excluded.name_zh, name_ja = excluded.name_ja,
      facility_item = excluded.facility_item, large_category = excluded.large_category,
      medium_category = excluded.medium_category, small_category = excluded.small_category,
      category_group = excluded.category_group, terminal_code = excluded.terminal_code, terminal = excluded.terminal,
      floor = excluded.floor, duty_area = excluded.duty_area, arrival_departure = excluded.arrival_departure,
      location_raw = excluded.location_raw, location_en = excluded.location_en,
      business_hours_raw = excluded.business_hours_raw, goods_brands = excluded.goods_brands, phone = excluded.phone,
      retrieved_at = excluded.retrieved_at, schema_version = excluded.schema_version,
      quality_status = excluded.quality_status, source_hash = excluded.source_hash
    WHERE airport_facility.source_hash <> excluded.source_hash`)
    .bind(row.facilityId, row.sourceId, row.nameKo, row.nameEn, row.nameZh, row.nameJa, row.facilityItem,
      row.largeCategory, row.mediumCategory, row.smallCategory, row.categoryGroup,
      row.terminalCode, row.terminal, row.floor, row.dutyArea, row.arrivalDeparture,
      row.locationRaw, row.locationEn, row.businessHoursRaw, row.goodsBrands, row.phone,
      row.retrievedAt, row.schemaVersion, row.qualityStatus, row.sourceHash));
  return runD1Batches(db, statements);
}

async function storedFacilityCount(db: D1Database | undefined): Promise<number> {
  if (!db) return 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM airport_facility`).first<{ n: number }>();
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

export interface FacilityCollectorResult extends CollectorResult {
  coverage?: FacilityCoverage;
  unmatchedTranslations?: number;
}

export interface FacilityCollectionOptions {
  /**
   * Re-collects even when a SUCCESS run is inside the refresh window.
   *
   * The refresh window exists to keep a repeated run free, so this is not a
   * routine switch: it is the one way to prove in Production that
   * re-collecting an unchanged directory writes nothing, which the skip would
   * otherwise hide behind a zero-request short-circuit. One forced run costs
   * the same bounded ~52 requests as the first, and the recurring scheduler
   * never sets it.
   */
  forceRefresh?: boolean;
}

export async function collectAirportFacilities(
  env: CollectorEnv,
  now = new Date(),
  fetcher: Fetcher = fetchOfficialJson,
  options: FacilityCollectionOptions = {},
): Promise<FacilityCollectorResult> {
  if (!env.DATA_GO_KR_SERVICE_KEY) {
    await writeCollectorStatus(env.DB, FACILITY_SOURCE_ID, "NEEDS_KEY", "DATA_GO_KR_SERVICE_KEY is not configured");
    await writeSourceHealth(env.DB, FACILITY_SOURCE_ID, "MISSING", "DATA_GO_KR_SERVICE_KEY is not configured");
    return { status: "NEEDS_KEY", records: 0, providerRequests: 0 };
  }
  if (!options.forceRefresh && await hasFreshFacilityRun(env.DB, now)) {
    return { status: "SKIPPED_NO_NEW_PUBLICATION", records: 0, providerRequests: 0, detail: `facility directory refreshed within ${FACILITY_REFRESH_DAYS} days; no provider request` };
  }
  let providerRequests = 0;
  try {
    const retrievedAt = now.toISOString();
    const korean = await fetchFacilityLanguage(env.DATA_GO_KR_SERVICE_KEY, "K", fetcher);
    providerRequests += korean.requests;
    if (!korean.items.length) throw new Error("facility_no_data");
    const rows = new Map<string, CanonicalAirportFacility>();
    for (const item of korean.items) {
      const row = await normalizeAirportFacility(item, retrievedAt);
      rows.set(row.facilityId, row);
    }
    let unmatched = 0;
    const translations: string[] = [];
    for (const lang of FACILITY_LANGS.filter((value) => value !== "K")) {
      const page = await fetchFacilityLanguage(env.DATA_GO_KR_SERVICE_KEY, lang, fetcher);
      providerRequests += page.requests;
      const merged = mergeFacilityLanguage(rows, lang, page.items);
      unmatched += merged.unmatched;
      translations.push(`${lang}:${merged.matched}/${page.items.length}`);
    }
    const finalRows = await finalizeFacilityHashes(rows.values());
    const written = await persistFacilities(env.DB, finalRows);
    const coverage = summarizeFacilityCoverage(finalRows);
    const detail = `${describeFacilityCoverage(coverage)}; translations ${translations.join(" ")}; unmatched ${unmatched}; provider requests ${providerRequests}; ${describeWrites(written)}`;
    await writeCollectorStatus(env.DB, FACILITY_SOURCE_ID, "SUCCESS", detail, korean.items.length, written.changedRows);
    await writeSourceHealth(env.DB, FACILITY_SOURCE_ID, "LIVE", detail, { retrievedAt, schemaVersion: FACILITY_SCHEMA_VERSION });
    return { status: "SUCCESS", records: written.changedRows, detail, providerRequests, coverage, unmatchedTranslations: unmatched };
  } catch (error) {
    const detail = `${safeSourceFailureDetail(error)}; provider requests ${providerRequests}`;
    // Last-good preservation: stored facilities stay untouched; health says
    // STALE when a directory exists, ERROR only when there is none.
    const stored = await storedFacilityCount(env.DB);
    await writeCollectorStatus(env.DB, FACILITY_SOURCE_ID, "ERROR", detail);
    await writeSourceHealth(env.DB, FACILITY_SOURCE_ID, stored > 0 ? "STALE" : "ERROR", detail);
    return { status: "ERROR", records: 0, detail, providerRequests };
  }
}
