export type SeoulFacilityArea = 'myeongdong' | 'hongdae' | 'seongsu' | 'itaewon';
export interface SeoulToilet {
  id: string; name: string; district: string; address: string; lotAddress: string;
  longitude: number | null; latitude: number | null; hours: string; phone: string;
  type: string; facilities: string; accessible: string; equipment: string; notes: string;
}
export interface SeoulToiletSnapshot {
  dataset: 'OA-22586'; snapshotDate: string; area: SeoulFacilityArea; district: string;
  sourceRows: number; rows: SeoulToilet[];
}
export function toiletSnapshot(value: unknown, area: SeoulFacilityArea): SeoulToiletSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as SeoulToiletSnapshot;
  if (candidate.dataset !== 'OA-22586' || candidate.area !== area || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.snapshotDate)
    || !Array.isArray(candidate.rows) || candidate.rows.length > 4455 || candidate.sourceRows !== 4455) return null;
  const ids = new Set<string>();
  for (const row of candidate.rows) {
    if (!row || ['id','name','district','address','lotAddress','hours','phone','type','facilities','accessible','equipment','notes'].some(key => typeof row[key as keyof SeoulToilet] !== 'string')
      || row.district !== candidate.district || ids.has(row.id)) return null;
    if (row.longitude !== null && (!Number.isFinite(row.longitude) || row.longitude < 126 || row.longitude > 128)) return null;
    if (row.latitude !== null && (!Number.isFinite(row.latitude) || row.latitude < 37 || row.latitude > 38)) return null;
    ids.add(row.id);
  }
  return candidate;
}
export function searchToilets(rows: readonly SeoulToilet[], query: string): SeoulToilet[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter(row => `${row.name} ${row.address} ${row.lotAddress}`.toLocaleLowerCase().includes(needle));
}
