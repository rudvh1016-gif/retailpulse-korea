import type { AreaId } from "./areas";
import { sha256 } from "./hash";

export const STORE_DYNAMICS_SOURCE_ID = "SEOUL_STORE_DYNAMICS";
export const STORE_DYNAMICS_DATASET_ID = "OA-15577";
export const STORE_DYNAMICS_MAPPING_VERSION = "oa-15577-standard-area-2026-09-03-v1";
export const STORE_DYNAMICS_SCHEMA_VERSION = "store-dynamics-v1";

export interface StoreDynamicsMapping {
  area: AreaId;
  tradeAreaCode: string;
  tradeAreaName: string;
  tradeAreaTypeCode: "A" | "D" | "U";
  tradeAreaTypeName: "골목상권" | "발달상권" | "관광특구";
}

export type StoreDynamicsExpected = StoreDynamicsMapping & { quarterCode: string };

export const storeDynamicsMappings: Record<AreaId, StoreDynamicsMapping> = {
  myeongdong: {
    area: "myeongdong",
    tradeAreaCode: "3001492",
    tradeAreaName: "명동 남대문 북창동 다동 무교동 관광특구",
    tradeAreaTypeCode: "U",
    tradeAreaTypeName: "관광특구",
  },
  hongdae: {
    area: "hongdae",
    tradeAreaCode: "3120103",
    tradeAreaName: "홍대입구역(홍대)",
    tradeAreaTypeCode: "D",
    tradeAreaTypeName: "발달상권",
  },
  seongsu: {
    area: "seongsu",
    tradeAreaCode: "3110131",
    tradeAreaName: "성수동카페거리",
    tradeAreaTypeCode: "A",
    tradeAreaTypeName: "골목상권",
  },
};

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Validates the complete stored-row contract used by both Last-good health
 * and the public summary. Keeping this in the source module prevents those
 * two truth surfaces from disagreeing about whether a row is usable.
 */
export function isValidStoredStoreDynamicsRow(
  area: AreaId,
  row: Record<string, unknown> | undefined,
): boolean {
  if (!row) return false;
  const mapping = storeDynamicsMappings[area];
  if (!mapping) return false;
  const counts = [row.totalStoreCount, row.ordinaryStoreCount, row.franchiseStoreCount, row.openingCount, row.closureCount];
  const rates = [row.openingRateTenthsPercent, row.closureRateTenthsPercent];
  return row.sourceId === STORE_DYNAMICS_SOURCE_ID
    && row.datasetId === STORE_DYNAMICS_DATASET_ID
    && row.recordOrigin === "OFFICIAL_HISTORICAL"
    && row.area === area
    && row.mappingVersion === STORE_DYNAMICS_MAPPING_VERSION
    && row.schemaVersion === STORE_DYNAMICS_SCHEMA_VERSION
    && row.qualityStatus === "VALID"
    && row.tradeAreaCode === mapping.tradeAreaCode
    && row.tradeAreaName === mapping.tradeAreaName
    && row.tradeAreaTypeCode === mapping.tradeAreaTypeCode
    && row.tradeAreaTypeName === mapping.tradeAreaTypeName
    && typeof row.quarterCode === "string" && /^\d{4}[1-4]$/.test(row.quarterCode)
    && counts.every(isNonNegativeSafeInteger)
    && rates.every((value) => isNonNegativeSafeInteger(value) && value <= 1_000)
    && (row.totalStoreCount as number) > 0
    && isNonNegativeSafeInteger(row.industryCount) && row.industryCount > 0
    && row.totalStoreCount === (row.ordinaryStoreCount as number) + (row.franchiseStoreCount as number)
    && (row.openingCount as number) <= (row.totalStoreCount as number)
    && (row.closureCount as number) <= (row.totalStoreCount as number)
    && row.openingRateTenthsPercent === Math.round(((row.openingCount as number) * 1_000) / (row.totalStoreCount as number))
    && row.closureRateTenthsPercent === Math.round(((row.closureCount as number) * 1_000) / (row.totalStoreCount as number))
    && typeof row.retrievedAt === "string" && Number.isFinite(Date.parse(row.retrievedAt));
}

export interface NormalizedStoreDynamicsRow {
  area: AreaId;
  quarterCode: string;
  tradeAreaCode: string;
  tradeAreaName: string;
  tradeAreaTypeCode: string;
  tradeAreaTypeName: string;
  industryCode: string;
  industryName: string;
  totalStoreCount: number;
  ordinaryStoreCount: number;
  franchiseStoreCount: number;
  openingCount: number;
  openingRatePercent: number;
  closureCount: number;
  closureRatePercent: number;
  retrievedAt: string;
}

export interface CanonicalStoreDynamicsAggregate {
  sourceId: typeof STORE_DYNAMICS_SOURCE_ID;
  datasetId: typeof STORE_DYNAMICS_DATASET_ID;
  recordOrigin: "OFFICIAL_HISTORICAL";
  area: AreaId;
  quarterCode: string;
  tradeAreaCode: string;
  tradeAreaName: string;
  tradeAreaTypeCode: string;
  tradeAreaTypeName: string;
  totalStoreCount: number;
  ordinaryStoreCount: number;
  franchiseStoreCount: number;
  openingCount: number;
  openingRateTenthsPercent: number;
  closureCount: number;
  closureRateTenthsPercent: number;
  industryCount: number;
  mappingVersion: typeof STORE_DYNAMICS_MAPPING_VERSION;
  retrievedAt: string;
  schemaVersion: typeof STORE_DYNAMICS_SCHEMA_VERSION;
  qualityStatus: "VALID";
  sourceHash: string;
}

export interface ParsedStoreDynamicsResponse {
  noData: boolean;
  totalCount: number;
  rows: Record<string, unknown>[];
}

function fail(code: string): never {
  throw new Error(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failOfficialResult(code: unknown): never {
  if (typeof code !== "string" || !/^(?:INFO|ERROR)-\d{3}$/.test(code)) {
    fail("store_dynamics_schema_result_code");
  }
  if (code === "INFO-100") fail("store_dynamics_service_key");
  if (/^ERROR-(?:500|600|601)$/.test(code)) {
    fail(`store_dynamics_provider_${code.toLowerCase()}`);
  }
  fail(`store_dynamics_schema_${code.toLowerCase()}`);
}

export function parseStoreDynamicsResponse(value: unknown): ParsedStoreDynamicsResponse {
  if (!isRecord(value)) fail("store_dynamics_schema_response");

  const topLevelResult = value.RESULT;
  if (isRecord(topLevelResult)) {
    if (topLevelResult.CODE === "INFO-200") {
      return { noData: true, totalCount: 0, rows: [] };
    }
    failOfficialResult(topLevelResult.CODE);
  }

  const payload = value.VwsmTrdarStorQq;
  if (!isRecord(payload)) fail("store_dynamics_schema_response");
  const result = payload.RESULT;
  if (!isRecord(result)) fail("store_dynamics_schema_result_code");
  if (result.CODE !== "INFO-000") failOfficialResult(result.CODE);

  const totalCount = payload.list_total_count;
  if (!Number.isSafeInteger(totalCount) || (totalCount as number) < 0) {
    fail("store_dynamics_schema_response");
  }
  if (!Array.isArray(payload.row) || payload.row.some((row) => !isRecord(row))) {
    fail("store_dynamics_schema_response");
  }
  const rows = payload.row as Record<string, unknown>[];
  if (rows.length > (totalCount as number) || ((totalCount as number) > 0 && rows.length === 0)) {
    fail("store_dynamics_schema_response");
  }

  return { noData: false, totalCount: totalCount as number, rows };
}

function requireRetrievedAt(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("store_dynamics_retrieved_at");
  }
  return value;
}

function requireText(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    fail(code);
  }
  return value;
}

function requireCount(value: unknown): number {
  let parsed: number;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string" && /^(?:0|[1-9]\d*)$/.test(value)) {
    parsed = Number(value);
  } else {
    fail("store_dynamics_count");
  }
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail("store_dynamics_count");
  return parsed;
}

function requireRate(value: unknown): { value: number; decimalPlaces: number } {
  let raw: string;
  if (typeof value === "number" && Number.isFinite(value)) {
    raw = String(value);
  } else if (typeof value === "string" && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    raw = value;
  } else {
    fail("store_dynamics_number");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) fail("store_dynamics_number");
  if (parsed < 0 || parsed > 100) fail("store_dynamics_rate");
  const decimalPlaces = raw.includes(".") ? raw.length - raw.indexOf(".") - 1 : 0;
  if (decimalPlaces > 6) fail("store_dynamics_number");
  return { value: parsed, decimalPlaces };
}

function verifyPublishedRate(count: number, total: number, rate: { value: number; decimalPlaces: number }): void {
  if (total === 0 && count !== 0) fail("store_dynamics_rate_formula");
  const exact = total === 0 ? 0 : (count * 100) / total;
  if (exact > 100) fail("store_dynamics_rate_formula");
  const scale = 10 ** rate.decimalPlaces;
  const expected = Math.round(exact * scale) / scale;
  if (Math.abs(rate.value - expected) > Number.EPSILON * Math.max(1, scale)) {
    // TEMP diagnostic (no secrets, business counts only): capture the real
    // official values so the mismatch can be root-caused, then remove.
    console.error(`store_dynamics_rate_formula_diagnostic count=${count} total=${total} publishedRate=${rate.value} decimalPlaces=${rate.decimalPlaces} expectedRate=${expected}`);
    fail("store_dynamics_rate_formula");
  }
}

function assertExpectedIdentity(expected: StoreDynamicsExpected): void {
  const mapping = storeDynamicsMappings[expected.area];
  if (!mapping
    || expected.tradeAreaCode !== mapping.tradeAreaCode
    || expected.tradeAreaName !== mapping.tradeAreaName
    || expected.tradeAreaTypeCode !== mapping.tradeAreaTypeCode
    || expected.tradeAreaTypeName !== mapping.tradeAreaTypeName
    || !/^\d{4}[1-4]$/.test(expected.quarterCode)) {
    fail("store_dynamics_identity");
  }
}

export function storeDynamicsQuarterCandidates(now: Date): string[] {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    fail("invalid_store_dynamics_candidate_time");
  }
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1_000);
  let year = kst.getUTCFullYear();
  let quarter = Math.floor(kst.getUTCMonth() / 3) + 1;
  const candidates: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    candidates.push(`${year}${quarter}`);
    quarter -= 1;
    if (quarter === 0) {
      year -= 1;
      quarter = 4;
    }
  }
  return candidates;
}

export function normalizeStoreDynamicsRow(
  raw: unknown,
  expected: StoreDynamicsExpected,
  retrievedAt: string,
): NormalizedStoreDynamicsRow {
  assertExpectedIdentity(expected);
  const collectedAt = requireRetrievedAt(retrievedAt);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("store_dynamics_object");
  const record = raw as Record<string, unknown>;

  const quarterCode = requireText(record.STDR_YYQU_CD, "store_dynamics_identity");
  const tradeAreaTypeCode = requireText(record.TRDAR_SE_CD, "store_dynamics_identity");
  const tradeAreaTypeName = requireText(record.TRDAR_SE_CD_NM, "store_dynamics_identity");
  const tradeAreaCode = requireText(record.TRDAR_CD, "store_dynamics_identity");
  const tradeAreaName = requireText(record.TRDAR_CD_NM, "store_dynamics_identity");
  if (quarterCode !== expected.quarterCode
    || tradeAreaCode !== expected.tradeAreaCode
    || tradeAreaName !== expected.tradeAreaName
    || tradeAreaTypeCode !== expected.tradeAreaTypeCode
    || tradeAreaTypeName !== expected.tradeAreaTypeName) {
    fail("store_dynamics_identity");
  }

  const industryCode = requireText(record.SVC_INDUTY_CD, "store_dynamics_identity");
  const industryName = requireText(record.SVC_INDUTY_CD_NM, "store_dynamics_identity");
  const totalStoreCount = requireCount(record.SIMILR_INDUTY_STOR_CO);
  const ordinaryStoreCount = requireCount(record.STOR_CO);
  const franchiseStoreCount = requireCount(record.FRC_STOR_CO);
  const openingCount = requireCount(record.OPBIZ_STOR_CO);
  const openingRate = requireRate(record.OPBIZ_RT);
  const closureCount = requireCount(record.CLSBIZ_STOR_CO);
  const closureRate = requireRate(record.CLSBIZ_RT);

  if (totalStoreCount !== ordinaryStoreCount + franchiseStoreCount) {
    fail("store_dynamics_total_breakdown");
  }
  verifyPublishedRate(openingCount, totalStoreCount, openingRate);
  verifyPublishedRate(closureCount, totalStoreCount, closureRate);

  return {
    area: expected.area,
    quarterCode,
    tradeAreaCode,
    tradeAreaName,
    tradeAreaTypeCode,
    tradeAreaTypeName,
    industryCode,
    industryName,
    totalStoreCount,
    ordinaryStoreCount,
    franchiseStoreCount,
    openingCount,
    openingRatePercent: openingRate.value,
    closureCount,
    closureRatePercent: closureRate.value,
    retrievedAt: collectedAt,
  };
}

function checkedSum(values: number[]): number {
  let sum = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) fail("store_dynamics_count");
    sum += value;
    if (!Number.isSafeInteger(sum)) fail("store_dynamics_count_overflow");
  }
  return sum;
}

export async function aggregateStoreDynamicsRows(
  rows: NormalizedStoreDynamicsRow[],
  expected: StoreDynamicsExpected,
  retrievedAt: string,
): Promise<CanonicalStoreDynamicsAggregate> {
  assertExpectedIdentity(expected);
  const collectedAt = requireRetrievedAt(retrievedAt);
  if (!Array.isArray(rows) || rows.length === 0) fail("store_dynamics_no_rows");

  const industries = new Set<string>();
  for (const row of rows) {
    if (row.area !== expected.area
      || row.quarterCode !== expected.quarterCode
      || row.tradeAreaCode !== expected.tradeAreaCode
      || row.tradeAreaName !== expected.tradeAreaName
      || row.tradeAreaTypeCode !== expected.tradeAreaTypeCode
      || row.tradeAreaTypeName !== expected.tradeAreaTypeName) {
      fail("store_dynamics_identity");
    }
    requireText(row.industryCode, "store_dynamics_identity");
    requireText(row.industryName, "store_dynamics_identity");
    requireRetrievedAt(row.retrievedAt);
    for (const count of [
      row.totalStoreCount,
      row.ordinaryStoreCount,
      row.franchiseStoreCount,
      row.openingCount,
      row.closureCount,
    ]) requireCount(count);
    requireRate(row.openingRatePercent);
    requireRate(row.closureRatePercent);
    if (row.totalStoreCount !== row.ordinaryStoreCount + row.franchiseStoreCount) {
      fail("store_dynamics_total_breakdown");
    }
    if (industries.has(row.industryCode)) fail("store_dynamics_duplicate_industry");
    industries.add(row.industryCode);
  }

  const totalStoreCount = checkedSum(rows.map((row) => row.totalStoreCount));
  const ordinaryStoreCount = checkedSum(rows.map((row) => row.ordinaryStoreCount));
  const franchiseStoreCount = checkedSum(rows.map((row) => row.franchiseStoreCount));
  const openingCount = checkedSum(rows.map((row) => row.openingCount));
  const closureCount = checkedSum(rows.map((row) => row.closureCount));
  if (totalStoreCount !== ordinaryStoreCount + franchiseStoreCount) {
    fail("store_dynamics_total_breakdown");
  }
  if (totalStoreCount === 0) fail("store_dynamics_zero_total");

  const semantic: Omit<CanonicalStoreDynamicsAggregate, "retrievedAt" | "sourceHash"> = {
    sourceId: STORE_DYNAMICS_SOURCE_ID,
    datasetId: STORE_DYNAMICS_DATASET_ID,
    recordOrigin: "OFFICIAL_HISTORICAL" as const,
    area: expected.area,
    quarterCode: expected.quarterCode,
    tradeAreaCode: expected.tradeAreaCode,
    tradeAreaName: expected.tradeAreaName,
    tradeAreaTypeCode: expected.tradeAreaTypeCode,
    tradeAreaTypeName: expected.tradeAreaTypeName,
    totalStoreCount,
    ordinaryStoreCount,
    franchiseStoreCount,
    openingCount,
    openingRateTenthsPercent: totalStoreCount === 0 ? 0 : Math.round((openingCount * 1_000) / totalStoreCount),
    closureCount,
    closureRateTenthsPercent: totalStoreCount === 0 ? 0 : Math.round((closureCount * 1_000) / totalStoreCount),
    industryCount: industries.size,
    mappingVersion: STORE_DYNAMICS_MAPPING_VERSION,
    schemaVersion: STORE_DYNAMICS_SCHEMA_VERSION,
    qualityStatus: "VALID" as const,
  };

  return {
    ...semantic,
    retrievedAt: collectedAt,
    sourceHash: await sha256(semantic),
  };
}
