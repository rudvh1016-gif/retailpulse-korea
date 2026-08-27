/**
 * Canonical target-area mapping for KORETAIL.
 *
 * Every collector and API resolves official geographic identifiers through
 * this single table instead of scattering area strings. Values were verified
 * against official documentation and cross-checked sources on 2026-08-27; see
 * docs/DATA_SOURCES.md for the evidence notes.
 *
 * Truth boundaries: a Seoul hotspot polygon, a 5km KMA grid cell and an event
 * search radius are different geographies. They are treated as area-level
 * context signals, never as one exact polygon.
 */

export type AreaId = "myeongdong" | "hongdae" | "seongsu";

export interface AreaMapping {
  id: AreaId;
  /** Seoul real-time city data hotspot code (citydata / citydata_ppltn). */
  seoulPoiCode: string;
  /** Official Seoul hotspot name for the same POI code. */
  seoulPoiName: string;
  /** KMA 단기예보 5km grid cell. */
  kmaGrid: { nx: number; ny: number };
  /** WGS84 center used for event distance mapping (approximate area center). */
  center: { lat: number; lng: number };
  /** Event search radius in meters around the center (TourAPI locationBasedList2, max 20000). */
  eventRadiusM: number;
  /**
   * Primary 서울시 상권분석서비스 trade area (current 3-prefixed code scheme).
   * One defensible primary geography per product area; alternates are
   * documented in docs/DATA_SOURCES.md rather than collected in parallel.
   * seCd is the 상권구분코드 (A 골목, D 발달, R 전통시장, U 관광특구): the
   * OpenAPI's positional filters run STDR_YYQU_CD → TRDAR_SE_CD → TRDAR_CD.
   */
  salesTradeArea: { code: string; name: string; seCd: "A" | "D" | "R" | "U" };
}

export const areaMappings: Record<AreaId, AreaMapping> = {
  myeongdong: {
    id: "myeongdong",
    seoulPoiCode: "POI003",
    seoulPoiName: "명동 관광특구",
    kmaGrid: { nx: 60, ny: 127 },
    center: { lat: 37.5636, lng: 126.9838 },
    eventRadiusM: 1500,
    salesTradeArea: { code: "3001492", name: "명동 남대문 북창동 다동 무교동 관광특구", seCd: "U" },
  },
  hongdae: {
    id: "hongdae",
    seoulPoiCode: "POI007",
    seoulPoiName: "홍대 관광특구",
    kmaGrid: { nx: 59, ny: 126 },
    center: { lat: 37.5563, lng: 126.9236 },
    eventRadiusM: 1500,
    salesTradeArea: { code: "3120103", name: "홍대입구역(홍대)", seCd: "D" },
  },
  seongsu: {
    id: "seongsu",
    seoulPoiCode: "POI068",
    seoulPoiName: "성수카페거리",
    kmaGrid: { nx: 61, ny: 126 },
    center: { lat: 37.5447, lng: 127.0557 },
    eventRadiusM: 1500,
    salesTradeArea: { code: "3110131", name: "성수동카페거리", seCd: "A" },
  },
};

/** Incheon Airport (운서동) grid for airport-context weather when needed. */
export const incheonAirportKmaGrid = { nx: 51, ny: 125 } as const;

export const allAreaIds = Object.keys(areaMappings) as AreaId[];

export function areaBySeoulPoi(code: string): AreaMapping | null {
  return allAreaIds.map((id) => areaMappings[id]).find((area) => area.seoulPoiCode === code) ?? null;
}

/** Great-circle distance in meters between two WGS84 points (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

/** Unique KMA grid cells across target areas (grid cells can be shared). */
export function uniqueKmaGrids(): Array<{ nx: number; ny: number; areas: AreaId[] }> {
  const cells = new Map<string, { nx: number; ny: number; areas: AreaId[] }>();
  for (const id of allAreaIds) {
    const { nx, ny } = areaMappings[id].kmaGrid;
    const key = `${nx},${ny}`;
    const existing = cells.get(key);
    if (existing) existing.areas.push(id);
    else cells.set(key, { nx, ny, areas: [id] });
  }
  return [...cells.values()];
}
