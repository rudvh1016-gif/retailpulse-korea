import { allAreaIds, areaMappings, type AreaId } from "./areas";

export const FOREIGN_PURPOSE_SOURCE_ID = "SEOUL_FOREIGN_PURPOSE_MOBILITY";
export const FOREIGN_PURPOSE_DATASET_ID = "OA-22378";
export const FOREIGN_PURPOSE_MAPPING_VERSION = "official-admin-dong-2025-06-02-v1";
export const FOREIGN_PURPOSE_SCHEMA_VERSION = "seoul-foreign-purpose-mobility-v1";
export const SHOPPING_PURPOSE_CODE = "4";
export const TOURISM_PURPOSE_CODE = "5";

export type ForeignPurpose = "shopping" | "tourism";

export interface PurposeMobilityPublication {
  datasetId: typeof FOREIGN_PURPOSE_DATASET_ID;
  infSeq: string;
  sequence: string;
  publicationId: string;
  fileName: string;
}

export interface ForeignPurposeMobilitySource {
  discoverLatest(): Promise<PurposeMobilityPublication>;
  loadLatestCsv(publication: PurposeMobilityPublication): Promise<string>;
}

export interface ForeignPurposeMobilityAggregate {
  area: AreaId;
  purpose: ForeignPurpose;
  movementValue: number;
  unit: "estimated_movements";
  destinationCodes: readonly string[];
}

export interface ForeignPurposeMobilityResult {
  referenceDate: string;
  rows: ForeignPurposeMobilityAggregate[];
  sourceRowsRead: number;
  suppressedOrInvalidRows: number;
}

type PurposeMappings = Record<AreaId, readonly string[]>;

function unescapeHtml(value: string): string {
  return value.replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&amp;", "&");
}

export function parseLatestPurposeMobilityPublication(html: string): PurposeMobilityPublication {
  const decoded = unescapeHtml(html);
  const filePattern = /seoul_purpose_admdong1_forn_(\d{6})\.zip/gi;
  const candidates: Array<{ publicationId: string; fileName: string; sequence: string }> = [];
  for (const match of decoded.matchAll(filePattern)) {
    const publicationId = match[1];
    const fileName = match[0];
    candidates.push({ publicationId, fileName, sequence: publicationId });
  }
  const latest = candidates.sort((a, b) => b.publicationId.localeCompare(a.publicationId))[0];
  if (!latest) throw new Error("official_publication_not_found:OA-22378");
  const infSeq = decoded.match(/name=["']infSeq["'][^>]*value=["']([^"']+)/i)?.[1]
    ?? decoded.match(/value=["']([^"']+)["'][^>]*name=["']infSeq["']/i)?.[1]
    ?? "1";
  return { datasetId: FOREIGN_PURPOSE_DATASET_ID, infSeq, ...latest };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("malformed_csv_quote");
  values.push(value);
  return values;
}

const REQUIRED_COLUMNS = ["d_admdong_cd", "move_purpose", "total_cnt", "etl_ymd"] as const;

export function assertPurposeMobilityHeader(headerLine: string): Map<string, number> {
  const columns = parseCsvLine(headerLine.replace(/^\uFEFF/, "")).map((column) => column.trim());
  const indexes = new Map(columns.map((column, index) => [column, index]));
  for (const required of REQUIRED_COLUMNS) {
    if (!indexes.has(required)) throw new Error(`missing_required_column:${required}`);
  }
  return indexes;
}

function defaultMappings(): PurposeMappings {
  return Object.fromEntries(allAreaIds.map((area) => [area, areaMappings[area].seoulAdministrativeDongCodes])) as PurposeMappings;
}

function destinationLookup(mappings: PurposeMappings): Map<string, AreaId> {
  const lookup = new Map<string, AreaId>();
  for (const area of allAreaIds) {
    for (const code of mappings[area]) {
      if (lookup.has(code)) throw new Error(`duplicate_destination_mapping:${code}`);
      lookup.set(code, area);
    }
  }
  return lookup;
}

function ymdToDate(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`invalid_reference_date:${value}`);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/**
 * Aggregates only the newest daily slice contained in one official CSV.
 * Raw rows and nationality dimensions never leave this function.
 */
export function aggregateForeignPurposeMobility(
  csvText: string,
  mappings: PurposeMappings = defaultMappings(),
): ForeignPurposeMobilityResult {
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length) throw new Error("empty_csv");
  const indexes = assertPurposeMobilityHeader(lines[0]);
  const destinationIndex = indexes.get("d_admdong_cd")!;
  const purposeIndex = indexes.get("move_purpose")!;
  const totalIndex = indexes.get("total_cnt")!;
  const dateIndex = indexes.get("etl_ymd")!;
  const lookup = destinationLookup(mappings);
  const parsed: Array<{ area: AreaId; purpose: ForeignPurpose; value: number; ymd: string }> = [];
  let latestYmd = "";
  let sourceRowsRead = 0;
  let suppressedOrInvalidRows = 0;

  for (const line of lines.slice(1)) {
    sourceRowsRead += 1;
    const fields = parseCsvLine(line);
    const ymd = fields[dateIndex]?.trim();
    if (/^\d{8}$/.test(ymd) && ymd > latestYmd) latestYmd = ymd;
    const area = lookup.get(fields[destinationIndex]?.trim());
    const purposeCode = fields[purposeIndex]?.trim();
    const purpose = purposeCode === SHOPPING_PURPOSE_CODE ? "shopping"
      : purposeCode === TOURISM_PURPOSE_CODE ? "tourism" : null;
    if (!area || !purpose) continue;
    if (!/^\d{8}$/.test(ymd)) throw new Error(`invalid_reference_date:${ymd}`);
    const rawValue = fields[totalIndex]?.trim();
    const value = Number(rawValue);
    if (!rawValue || rawValue === "*" || !Number.isFinite(value) || value < 0) {
      suppressedOrInvalidRows += 1;
      continue;
    }
    parsed.push({ area, purpose, value, ymd });
  }
  if (!latestYmd) {
    const dates = lines.slice(1).map((line) => parseCsvLine(line)[dateIndex]?.trim()).filter((value) => /^\d{8}$/.test(value));
    latestYmd = dates.sort().at(-1) ?? "";
  }
  if (!latestYmd) throw new Error("reference_date_not_found");

  const sums = new Map<string, number>();
  for (const row of parsed) {
    if (row.ymd !== latestYmd) continue;
    const key = `${row.area}:${row.purpose}`;
    sums.set(key, (sums.get(key) ?? 0) + row.value);
  }
  const rows = [...sums.entries()].map(([key, movementValue]) => {
    const [area, purpose] = key.split(":") as [AreaId, ForeignPurpose];
    return { area, purpose, movementValue, unit: "estimated_movements" as const, destinationCodes: mappings[area] };
  }).sort((a, b) => a.area.localeCompare(b.area) || a.purpose.localeCompare(b.purpose));
  if (rows.length > allAreaIds.length * 2) throw new Error("aggregate_row_bound_exceeded");
  return { referenceDate: ymdToDate(latestYmd), rows, sourceRowsRead, suppressedOrInvalidRows };
}
