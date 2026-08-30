import type { AreaId } from "./areas";
import { sha256 } from "./hash";

export const SEOUL_FOREIGN_SOURCE_ID = "SEOUL_SHORT_STAY_FOREIGN_LIVING_POPULATION";
export const SEOUL_FOREIGN_PRODUCT_VERSION = "OA-23018:Spop250mFornTempDong";
export const SEOUL_FOREIGN_SCHEMA_VERSION = "seoul-foreign-oa23018-v1";
export const SEOUL_FOREIGN_MAPPING_VERSION = "official-admin-dong-2025-06-02-v1";

const nationalityCodes = [
  "CAN", "CHN", "ETC", "FRA", "IDN", "IND", "JPN", "KAZ", "KHM", "LKA",
  "MNG", "NPL", "PAK", "PHL", "RUS", "THA", "USA", "UZB", "VNM",
] as const;

type NationalityCode = (typeof nationalityCodes)[number];

export interface CanonicalSeoulForeignDong {
  sourceId: typeof SEOUL_FOREIGN_SOURCE_ID;
  productVersion: typeof SEOUL_FOREIGN_PRODUCT_VERSION;
  administrativeDongCode: string;
  referenceAt: string;
  retrievedAt: string;
  value: number;
  unit: "people";
  nationalityValues: Record<NationalityCode, number | null>;
  schemaVersion: typeof SEOUL_FOREIGN_SCHEMA_VERSION;
  sourceHash: string;
}

export interface CanonicalSeoulForeignArea {
  sourceId: typeof SEOUL_FOREIGN_SOURCE_ID;
  productVersion: typeof SEOUL_FOREIGN_PRODUCT_VERSION;
  area: AreaId;
  referenceAt: string;
  retrievedAt: string;
  value: number;
  unit: "people";
  administrativeDongCodes: string[];
  mappingVersion: typeof SEOUL_FOREIGN_MAPPING_VERSION;
  schemaVersion: typeof SEOUL_FOREIGN_SCHEMA_VERSION;
  sourceHash: string;
}

function requiredNumber(value: unknown, field: string): number {
  if (value === null || value === undefined || value === "") throw new Error(`invalid_${field}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`invalid_${field}`);
  return parsed;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`invalid_${field}`);
  return parsed;
}

function referenceAt(row: Record<string, unknown>): string {
  const ymd = String(row.YMD ?? "");
  const rawTime = String(row.TT ?? "");
  if (!/^\d{8}$/.test(ymd) || !/^\d{1,4}$/.test(rawTime)) throw new Error("invalid_reference_time");
  const paddedTime = rawTime.padStart(rawTime.length <= 2 ? 2 : 4, "0");
  const hour = paddedTime.length === 2 ? paddedTime : paddedTime.slice(0, 2);
  const minute = paddedTime.length === 2 ? "00" : paddedTime.slice(2);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  if (hourNumber > 23 || minuteNumber > 59) throw new Error("invalid_reference_time");
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hour}:${minute}:00+09:00`;
}

export async function normalizeSeoulForeignRows(
  rows: readonly Record<string, unknown>[],
  retrievedAt: string,
): Promise<CanonicalSeoulForeignDong[]> {
  return Promise.all(rows.map(async (row) => {
    const administrativeDongCode = String(row.H_DNG_CD ?? "");
    if (!/^\d{8}$/.test(administrativeDongCode)) throw new Error("invalid_H_DNG_CD");
    const timestamp = referenceAt(row);
    const value = requiredNumber(row.SPOP, "SPOP");
    const nationalityValues = Object.fromEntries(
      nationalityCodes.map((code) => [code, optionalNumber(row[code], code)]),
    ) as Record<NationalityCode, number | null>;
    const semanticValue = {
      sourceId: SEOUL_FOREIGN_SOURCE_ID,
      productVersion: SEOUL_FOREIGN_PRODUCT_VERSION,
      administrativeDongCode,
      referenceAt: timestamp,
      value,
      unit: "people",
      nationalityValues,
      schemaVersion: SEOUL_FOREIGN_SCHEMA_VERSION,
    } as const;
    return {
      ...semanticValue,
      retrievedAt,
      sourceHash: await sha256(semanticValue),
    };
  }));
}

export async function aggregateSeoulForeignByArea(
  rows: readonly CanonicalSeoulForeignDong[],
  mapping: Record<AreaId, readonly string[]>,
): Promise<CanonicalSeoulForeignArea[]> {
  const output: CanonicalSeoulForeignArea[] = [];
  for (const [area, configuredCodes] of Object.entries(mapping) as [AreaId, readonly string[]][]) {
    const codeSet = new Set(configuredCodes);
    const byReference = new Map<string, CanonicalSeoulForeignDong[]>();
    for (const row of rows) {
      if (!codeSet.has(row.administrativeDongCode)) continue;
      const grouped = byReference.get(row.referenceAt) ?? [];
      grouped.push(row);
      byReference.set(row.referenceAt, grouped);
    }
    for (const [timestamp, grouped] of byReference) {
      const administrativeDongCodes = [...new Set(grouped.map((row) => row.administrativeDongCode))].sort();
      const value = grouped.reduce((sum, row) => sum + row.value, 0);
      const semanticValue = {
        sourceId: SEOUL_FOREIGN_SOURCE_ID,
        productVersion: SEOUL_FOREIGN_PRODUCT_VERSION,
        area,
        referenceAt: timestamp,
        value,
        unit: "people",
        administrativeDongCodes,
        mappingVersion: SEOUL_FOREIGN_MAPPING_VERSION,
        schemaVersion: SEOUL_FOREIGN_SCHEMA_VERSION,
      } as const;
      output.push({
        ...semanticValue,
        retrievedAt: grouped.map((row) => row.retrievedAt).sort().at(-1)!,
        sourceHash: await sha256(semanticValue),
      });
    }
  }
  return output.sort((a, b) => a.referenceAt.localeCompare(b.referenceAt) || a.area.localeCompare(b.area));
}
