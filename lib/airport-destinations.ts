/**
 * Destination of a departure, from the destination text the airport's flight
 * feed itself carries (stored in airport_flights.airport_code, e.g.
 * "도쿄/나리타", "오사카/ 간사이" — the airport's own Korean names, not IATA
 * codes).
 *
 * The table (config/airport-destinations.v1.json) lists only destinations that
 * were actually seen in the stored departures, each with its country and one
 * group, the source that shows the country and the date it was checked. A
 * value that is not in the table stays "region not confirmed": nothing is
 * guessed from the airline, the flight number or the passengers' nationality.
 *
 * Groups never overlap: a destination belongs to exactly one, so group totals
 * add up to the flights counted and a country is never counted again inside a
 * wider region.
 */
import table from "../config/airport-destinations.v1.json" with { type: "json" };

export const DESTINATION_GROUPS = [
  "JP", "CN", "HK_MO_TW", "SEA", "ASIA_OTHER", "MIDDLE_EAST", "EUROPE", "AMERICAS", "OCEANIA", "AFRICA", "DOMESTIC", "UNKNOWN",
] as const;
export type DestinationGroup = (typeof DESTINATION_GROUPS)[number];

export interface DestinationEntry {
  /** The destination text exactly as stored. */
  name: string;
  /** The airport's IATA code, from the airport's own destination list. */
  iata: string;
  /** ISO 3166-1 alpha-2 code of the country or territory the airport is in. */
  country: string;
  group: Exclude<DestinationGroup, "UNKNOWN">;
  /** English label for non-Korean screens: IATA's city (and airport) name. */
  en: string;
  /** Key into the table's sources list. */
  source: string;
}

interface Table {
  version: string;
  checkedOn: string;
  sources: Record<string, { title: string; url: string; checkedOn: string }>;
  groupOf: Record<string, Exclude<DestinationGroup, "UNKNOWN">>;
  destinations: Array<Omit<DestinationEntry, "group">>;
}

const TABLE = table as unknown as Table;
export const DESTINATIONS_VERSION = TABLE.version;
export const DESTINATION_SOURCES = TABLE.sources;

/** Stored text is compared after trimming and folding repeated spaces ("오사카/ 간사이" and "오사카/간사이" differ only in spacing). */
export const normalizeDestination = (value: string) => value.trim().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ");

const BY_NAME = new Map(TABLE.destinations.map((entry) => [normalizeDestination(entry.name), {
  ...entry,
  group: TABLE.groupOf[entry.country],
} as DestinationEntry]));
/** Labels and evidenced IATA codes resolve to the same reviewed entry; no country is guessed. */
const BY_IATA = new Map(TABLE.destinations.map(entry=>[entry.iata.toUpperCase(),{...entry,group:TABLE.groupOf[entry.country]} as DestinationEntry]));

export function destinationOf(stored: string | null | undefined): DestinationEntry | null {
  if (!stored) return null;
  const entry = BY_NAME.get(normalizeDestination(stored)) ?? BY_IATA.get(stored.trim().toUpperCase());
  return entry && entry.group ? entry : null;
}

export function destinationCount(): number {
  return BY_NAME.size;
}
