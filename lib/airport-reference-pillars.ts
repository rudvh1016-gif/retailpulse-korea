import type { FlightEstimate } from './airport-flight-split';

export type ReferencePillar = { zone: 'EAST' | 'WEST' | 'CENTER' | 'CONCOURSE'; flights: number; people: number; rawPeople: number };

/** Presentation only. The existing reconciled A5/flight calculation remains authoritative. */
export function referencePillars(estimate: FlightEstimate): ReferencePillar[] | null {
  if (!Number.isFinite(estimate.total) || estimate.total < 0 || !Number.isInteger(estimate.flights) || estimate.flights <= 0
    || !Number.isInteger(estimate.outsideScope) || estimate.outsideScope !== 0
    || estimate.unverified.flights !== 0 || estimate.unverified.people !== 0) return null;
  const parts = [
    {zone:'EAST' as const,...estimate.east}, {zone:'WEST' as const,...estimate.west},
    {zone:'CENTER' as const,...estimate.center},
    ...(estimate.concourse ? [{zone:'CONCOURSE' as const,...estimate.concourse}] : []),
  ];
  if (parts.some(part=>!Number.isInteger(part.flights)||part.flights<0||!Number.isFinite(part.people)||part.people<0)
    || parts.reduce((total,part)=>total+part.flights,0)!==estimate.flights) return null;
  return parts.map(part=>({...part,rawPeople:estimate.total*part.flights/estimate.flights}));
}
