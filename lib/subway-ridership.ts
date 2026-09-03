import { allAreaIds, type AreaId } from "./areas";
import { fetchOfficialJson } from "./source-adapters";
import { kstDayOf, shiftKstDay } from "./kst";

export const SEOUL_SUBWAY_SOURCE_ID = "SEOUL_SUBWAY_RIDERSHIP";
export const SEOUL_SUBWAY_DATASET_ID = "OA-22723";
export const SEOUL_SUBWAY_SERVICE_NAME = "getStnPsgr";
export const SEOUL_SUBWAY_MAPPING_VERSION = "oa-22723-area-stations-2026-09-02-v1";
export const SEOUL_SUBWAY_SCHEMA_VERSION = "seoul-subway-ridership-v1";
export const SEOUL_SUBWAY_BACKFILL_DAYS = 7;
export const SEOUL_SUBWAY_PAGE_SIZE = 1000;

export interface SubwayStation {
  stationCode: string;
  stationNumber: string;
  stationName: string;
  lineName: string;
}

/**
 * Deliberately conservative area catchments. Each selected station is the
 * eponymous station at the product area's centre; nearby candidates and their
 * exclusions are documented in DATA_SOURCES.md. Transfer-line station codes
 * are never combined implicitly.
 */
export const SUBWAY_AREA_STATIONS: Record<AreaId, readonly SubwayStation[]> = {
  myeongdong: [{ stationCode: "0424", stationNumber: "424", stationName: "명동", lineName: "4호선" }],
  hongdae: [{ stationCode: "0239", stationNumber: "239", stationName: "홍대입구", lineName: "2호선" }],
  seongsu: [{ stationCode: "0211", stationNumber: "211", stationName: "성수", lineName: "2호선" }],
};

/**
 * Field and record separators for the stored station list.
 *
 * The summary query concatenates the stations behind one row, and the label
 * has to be built from name and line separately (Korean needs 역 between
 * them), so the two are kept apart rather than pre-joined with a space that
 * would then have to be guessed back out.
 */
export const SUBWAY_STATION_FIELD_SEPARATOR = "|";
export const SUBWAY_STATION_RECORD_SEPARATOR = ";";

/**
 * The representative station, written the way a Korean reader says it.
 *
 * "선정 역" was internal vocabulary that told a visitor nothing; the station's
 * own name does. `역` is appended only when the official name does not already
 * carry it, so 명동 becomes 명동역 while a name already ending in 역 is left
 * alone. The name and line stay Korean in every locale: they are proper nouns
 * a reader matches against station signage, and translating them would make
 * the sign harder to find, not easier.
 */
export function formatRepresentativeStations(stored: string | null | undefined): string | null {
  if (typeof stored !== "string" || !stored.trim()) return null;
  const labels = stored.split(SUBWAY_STATION_RECORD_SEPARATOR)
    .map((record) => record.split(SUBWAY_STATION_FIELD_SEPARATOR).map((part) => part.trim()))
    .filter(([name]) => Boolean(name))
    .map(([name, line]) => {
      const station = name.endsWith("역") ? name : `${name}역`;
      return line ? `${station} ${line}` : station;
    });
  return labels.length ? labels.join(", ") : null;
}

export const SUBWAY_STATION_REQUESTS = allAreaIds.flatMap((area) =>
  SUBWAY_AREA_STATIONS[area].map((station) => ({ area, station })),
);

export interface SubwayStationDayRidership {
  station: SubwayStation;
  referenceDate: string;
  boardingCount: number;
  alightingCount: number;
  sourceRowsRead: number;
}

export interface SubwayRidershipSource {
  fetchStationDay(referenceDate: string, station: SubwayStation): Promise<unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function exactNonNegativeInteger(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`subway_invalid_${field}`);
  return number;
}

function compactDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("subway_invalid_reference_date");
  return day.replaceAll("-", "");
}

function responseParts(payload: unknown): { code: string; message: string; totalCount: number; rows: unknown[] } {
  const root = asRecord(payload);
  const response = asRecord(root.response);
  if (Object.keys(response).length) {
    const header = asRecord(response.header);
    const body = asRecord(response.body);
    const items = asRecord(body.items);
    return {
      code: String(header.resultCode ?? ""),
      message: String(header.resultMsg ?? ""),
      totalCount: exactNonNegativeInteger(body.totalCount ?? 0, "total_count"),
      rows: asArray(items.item),
    };
  }

  const service = asRecord(root[SEOUL_SUBWAY_SERVICE_NAME]);
  const result = asRecord(service.RESULT);
  return {
    code: String(result.CODE ?? ""),
    message: String(result.MESSAGE ?? ""),
    totalCount: exactNonNegativeInteger(service.list_total_count ?? 0, "total_count"),
    rows: asArray(service.row),
  };
}

export function normalizeSubwayRidershipPayload(
  payload: unknown,
  referenceDate: string,
  station: SubwayStation,
): SubwayStationDayRidership {
  const expectedDate = compactDate(referenceDate);
  const { code, message, totalCount, rows } = responseParts(payload);
  if (code !== "00" && code !== "INFO-000") throw new Error(`subway_provider_${code || "UNKNOWN"}_${message.slice(0, 40)}`);
  if (totalCount === 0 || rows.length === 0) throw new Error("subway_no_data");
  if (totalCount !== rows.length || totalCount > SEOUL_SUBWAY_PAGE_SIZE) throw new Error("subway_page_incomplete");

  let boardingCount = 0;
  let alightingCount = 0;
  for (const value of rows) {
    const row = asRecord(value);
    if (String(row.pasngDe ?? "") !== expectedDate) throw new Error("subway_date_mismatch");
    if (String(row.stnCd ?? "") !== station.stationCode
      || String(row.stnNo ?? "") !== station.stationNumber
      || String(row.stnNm ?? "") !== station.stationName
      || String(row.lineNm ?? "") !== station.lineName) {
      throw new Error("subway_station_mismatch");
    }
    const hour = String(row.pasngHr ?? "").padStart(2, "0");
    if (!/^(0\d|1\d|2[0-3])$/.test(hour)) throw new Error("subway_invalid_hour");
    boardingCount += exactNonNegativeInteger(row.rideNope, "boarding_count");
    alightingCount += exactNonNegativeInteger(row.gffNope, "alighting_count");
    if (!Number.isSafeInteger(boardingCount) || !Number.isSafeInteger(alightingCount)) {
      throw new Error("subway_count_overflow");
    }
  }
  return { station, referenceDate, boardingCount, alightingCount, sourceRowsRead: rows.length };
}

export function subwayBackfillDates(now: Date): string[] {
  if (!Number.isFinite(now.getTime())) throw new Error("subway_invalid_collection_time");
  const todayKst = kstDayOf(now.toISOString());
  return Array.from({ length: SEOUL_SUBWAY_BACKFILL_DAYS }, (_, index) => shiftKstDay(todayKst, -(index + 1)));
}

export function createSeoulSubwayRidershipSource(apiKey: string): SubwayRidershipSource {
  const key = apiKey.trim();
  if (!key) throw new Error("subway_api_key_missing");
  return {
    async fetchStationDay(referenceDate, station) {
      const date = compactDate(referenceDate);
      const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${SEOUL_SUBWAY_SERVICE_NAME}/1/${SEOUL_SUBWAY_PAGE_SIZE}/${date}/${station.stationCode}`);
      return fetchOfficialJson(url, { timeoutMs: 12_000, maxAttempts: 2, retryDelaysMs: [1_000] });
    },
  };
}
