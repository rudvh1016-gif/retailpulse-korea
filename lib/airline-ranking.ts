/**
 * Daily airline ranking from the same physical-departure rows that feed the
 * busiest-gate ranking. Pure: no I/O, no clock.
 *
 * Truth rules
 *   · One physical flight counts once, whatever its codeshare marketing
 *     numbers — the row set is de-duplicated by physicalFlightId first.
 *   · The operating airline is the two-character designator at the start of
 *     the OPERATING flight number (the provider's master flight number when
 *     the row is a codeshare), never the marketing partner's.
 *   · The provider's own airline name is preferred for the label; it comes
 *     from the row whose codeshare flag is not "Y", i.e. the operator's row.
 *   · Country comes only from the caller-supplied lookup; when it answers
 *     null the airline is reported with countryBasis "UNVERIFIED".
 */
export interface AirlineRankingFlightRow {
  physicalFlightId: string;
  terminal: string | null;
  /** Operating (master) flight number, e.g. "KE703"; the marketing number for a non-codeshare row. */
  operatingFlight: string | null;
  /** Provider airline label as stored (A1 `airline`), for this marketing row. */
  airlineLabel: string | null;
  codeshare: string | null;
  retrievedAt: string;
}

export interface RankedAirline {
  /** Operating designator, e.g. "KE"; null when the flight number has none. */
  iata: string | null;
  /** Provider's official airline name for the operator, when stored. */
  providerName: string | null;
  /** Registry name when the lookup has a trustworthy one. */
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
  labels: Map<string, number>;
  operatorLabels: Map<string, number>;
  flights: number;
}

function mostFrequent(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [label, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && label < best)) { best = label; bestCount = count; }
  }
  return best;
}

function rank(rows: AirlineRankingFlightRow[], lookup: AirlineLookupFn, limit: number): AirlineRankingForScope {
  // Group every marketing row under its physical flight so a codeshare pair
  // is one flight with (possibly) several labels.
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
    const bucket = buckets.get(key) ?? { iata, labels: new Map(), operatorLabels: new Map(), flights: 0 };
    bucket.flights += 1;
    for (const row of group) {
      const label = row.airlineLabel?.trim();
      if (label) {
        bucket.labels.set(label, (bucket.labels.get(label) ?? 0) + 1);
        if ((row.codeshare ?? "").trim().toUpperCase() !== "Y") bucket.operatorLabels.set(label, (bucket.operatorLabels.get(label) ?? 0) + 1);
      }
      if (!retrievedAt || row.retrievedAt > retrievedAt) retrievedAt = row.retrievedAt;
    }
    buckets.set(key, bucket);
  }
  const totalFlights = byPhysical.size;
  const airlines: RankedAirline[] = [...buckets.values()]
    .map((bucket) => {
      const found = bucket.iata ? lookup(bucket.iata) : null;
      return {
        iata: bucket.iata,
        providerName: mostFrequent(bucket.operatorLabels) ?? mostFrequent(bucket.labels),
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
