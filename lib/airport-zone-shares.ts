import type { GateSide, SideCounts } from './airport-sides';
import type { DepartureMap, MapBuilding } from './airport-departure-map';

/** Reuse the map's time window, codeshare collapse and cancellation filtering.
 * Unknown buildings are never assigned to one of the three pictures.
 */
export function buildingZoneCounts(map: Pick<DepartureMap, 'flights'>): Record<MapBuilding, SideCounts> {
  const empty = (): SideCounts => ({ WEST: 0, CENTER: 0, EAST: 0, UNVERIFIED: 0, total: 0 });
  const counts = { T1: empty(), T2: empty(), CONCOURSE: empty() };
  for (const flight of map.flights) {
    if (flight.building === 'UNKNOWN') continue;
    counts[flight.building][flight.side]++;
    counts[flight.building].total++;
  }
  return counts;
}

/** All zones share the selected building/window total, including unverified flights. */
export function selectedZoneShares(sides: SideCounts): Record<GateSide, number | null> {
  const fraction = (count: number) => sides.total > 0 ? count / sides.total * 100 : null;
  return { WEST: fraction(sides.WEST), CENTER: fraction(sides.CENTER), EAST: fraction(sides.EAST), UNVERIFIED: fraction(sides.UNVERIFIED) };
}
