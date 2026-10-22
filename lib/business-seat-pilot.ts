import {isValidKstDay, kstDayOf} from './kst';
/** Offline review model only. No fetch, provider, database, scheduler or customer inputs. */
export interface PilotSource { url: string; checkedAt: string; publishedAt: string | null }
export interface PilotLayout {
  id: string; operator: string; aircraftSubtype: string; totalSeats: number;
  businessSeats: number | null; firstSeats: number | null; premiumEconomySeats: number | null;
  source: PilotSource; confidence: 'OFFICIAL_CONFIGURATION' | 'CABIN_COUNT_UNCONFIRMED';
}
export interface PilotFlight {
  direction: 'departure' | 'arrival'; serviceDate: string; scheduledTime: string;
  operatingFlight: string; marketingFlight: string; operator: string; destination: string; destinationCity: string | null;
  terminal: string | null; gate: string | null;
  aircraftSubtype: string | null; aircraftRegNo: string | null;
  status: 'scheduled' | 'cancelled' | 'unknown';
  evidenceKind: 'PUBLISHED_SCHEDULE' | 'DATED_FLIGHT_RECORD'; source: PilotSource;
}
export interface PilotAssignment {
  scope: 'DATED_FLIGHT_CONFIGURATION' | 'DATED_TAIL_CONFIGURATION' | 'PUBLISHED_SCHEDULE';
  physicalKey: string; aircraftRegNo: string | null; layoutId: string;
  /** Required for a dated join: the exact reviewed observation, invalidated by refresh/swap. */
  flightSourceCheckedAt?: string;
  validFrom: string; validThrough: string; source: PilotSource;
}
export function physicalPilotKey(row: PilotFlight): string {
  return [row.direction, row.serviceDate, row.operatingFlight.toUpperCase().replace(/\s/g, ''), row.scheduledTime].join('|');
}
function sameAircraft(a: PilotFlight, b: PilotFlight) {
  return a.aircraftSubtype === b.aircraftSubtype && a.aircraftRegNo === b.aircraftRegNo && a.destination === b.destination && a.destinationCity === b.destinationCity && a.operator === b.operator;
}
/** Explicit zoned instants only: never depend on the process clock or local timezone. */
function instantMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !isValidKstDay(value.slice(0,10))) return NaN;
  return Date.parse(value);
}
function validSource(source: PilotSource, asOf: string) {
  try {
    const checkedAt = instantMs(source.checkedAt);
    const cutoff = instantMs(asOf);
    // A date-only publication date is a UTC calendar-day lower bound, not a precise release time.
    const publishedAt = source.publishedAt === null ? null : isValidKstDay(source.publishedAt) ? Date.parse(source.publishedAt) : instantMs(source.publishedAt);
    return new URL(source.url).protocol === 'https:' && Number.isFinite(checkedAt) && checkedAt <= cutoff
      && (publishedAt === null || Number.isFinite(publishedAt) && publishedAt <= cutoff);
  } catch { return false; }
}
export function buildBusinessSeatPilot(flights: PilotFlight[], layouts: PilotLayout[], assignments: PilotAssignment[], asOf: string) {
  if (!Number.isFinite(instantMs(asOf)) || flights.length > 2000 || layouts.length > 100 || assignments.length > 2000) throw new Error('pilot_input_bound');
  for (const layout of layouts) {
    const knownCabinTotal = [layout.businessSeats, layout.firstSeats, layout.premiumEconomySeats].reduce<number>((sum, n) => sum + (n ?? 0), 0);
    if (knownCabinTotal > layout.totalSeats || !Number.isInteger(layout.totalSeats) || layout.totalSeats <= 0 || [layout.businessSeats,layout.firstSeats,layout.premiumEconomySeats].some(n => n !== null && (!Number.isInteger(n) || n < 0 || n > layout.totalSeats))) throw new Error('pilot_layout_counts');
  }
  if (new Set(layouts.map(l => l.id)).size !== layouts.length) throw new Error('pilot_duplicate_layout');
  for (const a of assignments) {
    if (!['DATED_FLIGHT_CONFIGURATION','DATED_TAIL_CONFIGURATION','PUBLISHED_SCHEDULE'].includes(a.scope) || !isValidKstDay(a.validFrom) || !isValidKstDay(a.validThrough) || a.validFrom > a.validThrough) throw new Error('pilot_assignment_scope');
  }
  const groups = new Map<string, PilotFlight[]>();
  for (const flight of flights) {
    if (!['departure','arrival'].includes(flight.direction) || !['PUBLISHED_SCHEDULE','DATED_FLIGHT_RECORD'].includes(flight.evidenceKind) || !['scheduled','cancelled','unknown'].includes(flight.status) || !isValidKstDay(flight.serviceDate) || !/^[A-Z0-9]{2}$/.test(flight.operator) || !flight.operatingFlight.startsWith(flight.operator) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(flight.scheduledTime) || !/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(flight.operatingFlight.replace(/\s/g, '').toUpperCase())) throw new Error('pilot_flight_identity');
    const key = physicalPilotKey(flight); groups.set(key, [...(groups.get(key) ?? []), flight]);
  }
  const rows = [...groups].sort(([a],[b]) => a.localeCompare(b)).map(([physicalKey, group]) => {
    const row = group.find(f => f.marketingFlight === f.operatingFlight) ?? group[0];
    const conflict = group.some(f => !sameAircraft(f, row) || f.status !== row.status || f.evidenceKind !== row.evidenceKind);
    const candidates = layouts.filter(l => l.operator === row.operator && l.aircraftSubtype === row.aircraftSubtype && validSource(l.source, asOf));
    const links = assignments.filter(a => a.physicalKey === physicalKey && a.validFrom <= row.serviceDate && a.validThrough >= row.serviceDate && validSource(a.source, asOf)
      && (a.scope === 'PUBLISHED_SCHEDULE' || a.flightSourceCheckedAt === row.source.checkedAt && a.aircraftRegNo === row.aircraftRegNo)
      && (a.scope !== 'DATED_TAIL_CONFIGURATION' || !!row.aircraftRegNo && a.aircraftRegNo === row.aircraftRegNo));
    const linksMatch = links.filter(a => candidates.some(l => l.id === a.layoutId && validSource(l.source, asOf)));
    const link = links.length === 1 && linksMatch.length === 1 ? linksMatch[0] : null;
    const layout = link ? candidates.find(l => l.id === link.layoutId)! : null;
    const eligible = !conflict && row.status !== 'cancelled' && validSource(row.source, asOf);
    // A held future schedule is not an observation of that service day.
    const eligibleForActualPilot = eligible && row.evidenceKind === 'DATED_FLIGHT_RECORD' && row.serviceDate <= kstDayOf(row.source.checkedAt);
    const datedConfiguration = eligibleForActualPilot && link !== null && link.scope !== 'PUBLISHED_SCHEDULE';
    const countConfirmed = layout?.confidence === 'OFFICIAL_CONFIGURATION' && layout.businessSeats !== null;
    const verified = datedConfiguration && countConfirmed;
    const planned = eligible && link?.scope === 'PUBLISHED_SCHEDULE' && countConfirmed;
    const counts = candidates.map(l => l.businessSeats);
    // A model-only range is catalogue context, never a confirmed per-flight bound.
    const candidateRange = counts.length > 0 && counts.every((n): n is number => Number.isInteger(n) && n !== null && n >= 0)
      ? {min: Math.min(...counts as number[]), max: Math.max(...counts as number[])} : null;
    const missingFields = [!row.destinationCity && 'destinationCity', !row.terminal && 'terminal', !row.gate && 'gate', !row.aircraftSubtype && 'aircraftSubtype', !row.aircraftRegNo && 'aircraftRegNo', !datedConfiguration && 'datedFlightConfiguration', !layout && 'layoutId', !countConfirmed && 'businessSeatCount', conflict && 'consistentCodeshareEvidence'].filter((s): s is string => !!s);
    return {...row, physicalKey, eligibleForActualPilot, marketingFlights: [...new Set(group.map(f => f.marketingFlight))].sort(), sourceRows: group.length,
      layoutId: layout?.id ?? null, businessSeatsVerified: verified ? layout!.businessSeats : null,
      businessSeatsPublishedSchedule: planned ? layout!.businessSeats : null,
      catalogueCandidateRange: candidateRange, candidateLayoutIds: candidates.map(l => l.id),
      confidence: row.status === 'cancelled' ? 'EXCLUDED_CANCELLED' : conflict ? 'CONFLICT_UNCONFIRMED' : verified ? 'VERIFIED_DATED_CONFIGURATION' : datedConfiguration ? 'DATED_CONFIGURATION_COUNT_UNCONFIRMED' : planned ? 'PUBLISHED_SCHEDULE_ONLY' : 'CONFIGURATION_UNCONFIRMED',
      missingFields, layoutSource: layout?.source ?? null, assignmentSource: link?.source ?? null};
  });
  // One qualified-observation denominator for coverage, dates/cities and seat totals.
  const eligible = rows.filter(r => r.eligibleForActualPilot);
  const serviceDates = [...new Set(eligible.map(r => r.serviceDate))].sort();
  const cities = [...new Set(eligible.map(r => r.destinationCity).filter((city): city is string => !!city))].sort();
  const verified = eligible.filter(r => r.businessSeatsVerified !== null);
  return {schemaVersion: 'business-seat-pilot-v1', asOf, rows, summary: {
    sourceRows: flights.length, physicalFlights: rows.length, duplicateMarketingRows: flights.length - rows.length,
    datedFlightRecords: eligible.length,
    excludedDatedFlightRecords: rows.filter(r => r.evidenceKind === 'DATED_FLIGHT_RECORD').length - eligible.length,
    serviceDates, cities,
    verifiedPhysicalFlights: verified.length, unknownConfigurationFlights: eligible.length - verified.length,
    verifiedBusinessSeatSubtotal: verified.length ? verified.reduce((sum, r) => sum + r.businessSeatsVerified!, 0) : null,
    completeCapacityCoverage: eligible.length > 0 && verified.length === eligible.length,
    target: {physicalFlights: 30, cities: 3, serviceDates: 3},
    actualPilotTargetMet: eligible.length >= 30 && cities.length >= 3 && serviceDates.length >= 3,
  }};
}
