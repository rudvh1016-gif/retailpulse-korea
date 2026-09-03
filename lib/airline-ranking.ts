/**
 * Daily airline ranking from the same physical-departure rows that feed the
 * busiest-gate ranking. Pure: no I/O, no clock.
 *
 * Truth rules
 *   · One physical flight counts once, whatever its codeshare marketing
 *     numbers — the row set is de-duplicated by physicalFlightId first.
 *   · The operating airline is the two-character designator at the start of
 *     the OPERATING flight number (the provider's master flight number when
 *     the row is a codeshare), never a marketing partner's.
 *   · The airline's display name and country come ONLY from the caller-
 *     supplied lookup (the verified registry, keyed by that designator) —
 *     never from a raw per-row provider field. `airport_flights` keeps one
 *     row per physical flight (unique index on physical_flight_id); when a
 *     provider page lists a codeshare pair under the same master flight,
 *     persistence keeps whichever marketing row it saw last, including that
 *     row's OWN "airline" text — so the stored name can belong to the
 *     codeshare PARTNER, not the operator the flight number actually names.
 *     Investigated 2026-09-03 after production data showed exactly that:
 *     KE-numbered flights labelled "아시아나항공", OZ-numbered flights
 *     labelled "대한항공", their countries both still correct because
 *     country was already registry-only. The name is now registry-only too.
 *   · When the lookup answers null the airline is reported with
 *     countryBasis "UNVERIFIED" and no name — never a guess.
 */
export interface AirlineRankingFlightRow {
  physicalFlightId: string;
  terminal: string | null;
  /** Operating (master) flight number, e.g. "KE703"; the marketing number for a non-codeshare row. */
  operatingFlight: string | null;
  retrievedAt: string;
}

export interface RankedAirline {
  /** Operating designator, e.g. "KE"; null when the flight number has none. */
  iata: string | null;
  /** Registry name, only when the lookup has a trustworthy one. */
  registryName: string | null;
  /** ISO 3166-1 alpha-2 country, or null. */
  country: string | null;
  countryBasis: "REGISTRY" | "UNVERIFIED";
  flights: number;
  /** flights / totalFlights, 0..1. */
  share: number;
}

export interface CountryRollup {
  /** ISO 3166-1 alpha-2, or null for the unverified bucket. */
  country: string | null;
  flights: number;
  airlines: number;
  share: number;
}

export interface AirlineRankingForScope {
  totalFlights: number;
  airlines: RankedAirline[];
  countries: CountryRollup[];
  retrievedAt: string | null;
}

export type AirlineLookupFn = (iata: string | null) => { name: string | null; country: string | null } | null;

const DESIGNATOR = /^([A-Z][A-Z0-9]|[0-9][A-Z])(?=[0-9]{1,4}[A-Z]?$)/;

/** "KE0703" -> "KE", "7C1101" -> "7C", "KAL703" -> null (not a two-character designator). */
export function operatingDesignator(flightNumber: string | null | undefined): string | null {
  if (!flightNumber) return null;
  const match = DESIGNATOR.exec(flightNumber.trim().toUpperCase());
  return match ? match[1] : null;
}

interface Bucket {
  iata: string | null;
  flights: number;
}

function rank(rows: AirlineRankingFlightRow[], lookup: AirlineLookupFn, limit: number): AirlineRankingForScope {
  // One row per physical flight already (the table's own unique index), so
  // this groups only to find each flight's own operating number once.
  const byPhysical = new Map<string, AirlineRankingFlightRow[]>();
  for (const row of rows) {
    const list = byPhysical.get(row.physicalFlightId) ?? [];
    list.push(row);
    byPhysical.set(row.physicalFlightId, list);
  }
  const buckets = new Map<string, Bucket>();
  let retrievedAt: string | null = null;
  for (const group of byPhysical.values()) {
    const operatingFlight = group.find((row) => row.operatingFlight)?.operatingFlight ?? null;
    const iata = operatingDesignator(operatingFlight);
    const key = iata ?? "";
    const bucket = buckets.get(key) ?? { iata, flights: 0 };
    bucket.flights += 1;
    buckets.set(key, bucket);
    for (const row of group) {
      if (!retrievedAt || row.retrievedAt > retrievedAt) retrievedAt = row.retrievedAt;
    }
  }
  const totalFlights = byPhysical.size;
  const airlines: RankedAirline[] = [...buckets.values()]
    .map((bucket) => {
      const found = bucket.iata ? lookup(bucket.iata) : null;
      return {
        iata: bucket.iata,
        registryName: found?.name ?? null,
        country: found?.country ?? null,
        countryBasis: found?.country ? "REGISTRY" as const : "UNVERIFIED" as const,
        flights: bucket.flights,
        share: totalFlights ? bucket.flights / totalFlights : 0,
      };
    })
    .sort((a, b) => {
      if (b.flights !== a.flights) return b.flights - a.flights;
      // Ties: named designators first, alphabetical; the no-designator bucket last.
      if (a.iata === null) return 1;
      if (b.iata === null) return -1;
      return a.iata < b.iata ? -1 : a.iata > b.iata ? 1 : 0;
    });
  const countryBuckets = new Map<string, CountryRollup>();
  for (const airline of airlines) {
    const key = airline.country ?? "";
    const current = countryBuckets.get(key) ?? { country: airline.country, flights: 0, airlines: 0, share: 0 };
    current.flights += airline.flights;
    current.airlines += 1;
    countryBuckets.set(key, current);
  }
  const countries = [...countryBuckets.values()]
    .map((row) => ({ ...row, share: totalFlights ? row.flights / totalFlights : 0 }))
    .sort((a, b) => {
      if (a.country === null) return 1;
      if (b.country === null) return -1;
      return b.flights - a.flights || a.country.localeCompare(b.country);
    });
  return { totalFlights, airlines: airlines.slice(0, limit), countries: countries.slice(0, limit), retrievedAt };
}

export interface AirlineRankingSummary {
  all: AirlineRankingForScope;
  byTerminal: Record<string, AirlineRankingForScope>;
}

export function summarizeAirlineRanking(rows: AirlineRankingFlightRow[], lookup: AirlineLookupFn, limit = 10): AirlineRankingSummary {
  const byTerminal = new Map<string, AirlineRankingFlightRow[]>();
  for (const row of rows) {
    if (!row.terminal) continue;
    const list = byTerminal.get(row.terminal) ?? [];
    list.push(row);
    byTerminal.set(row.terminal, list);
  }
  return {
    all: rank(rows, lookup, limit),
    byTerminal: Object.fromEntries([...byTerminal.entries()].sort().map(([terminal, list]) => [terminal, rank(list, lookup, limit)])),
  };
}
