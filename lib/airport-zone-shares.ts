import type { GateSide, SideCounts } from './airport-sides';

/** All zones share the selected building/window total, including unverified flights. */
export function selectedZoneShares(sides: SideCounts): Record<GateSide, number | null> {
  const fraction = (count: number) => sides.total > 0 ? count / sides.total * 100 : null;
  return { WEST: fraction(sides.WEST), CENTER: fraction(sides.CENTER), EAST: fraction(sides.EAST), UNVERIFIED: fraction(sides.UNVERIFIED) };
}
