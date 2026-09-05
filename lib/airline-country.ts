/**
 * Airline designator -> country lookup used by the airline ranking.
 *
 * The registry itself (lib/airline-registry.ts) is generated from the
 * OpenFlights community snapshot (ODbL). That snapshot is not an official
 * airline register and is known to lag: IATA re-assigns two-letter
 * designators, and a snapshot row can name an airline that stopped using the
 * code years ago. A wrong country is worse than no country, so a designator
 * listed below is answered with null — the site then says "unverified" —
 * until the owner verifies it against an official register (for example the
 * MOLIT 항공정보포털 airline list) and removes it from this table.
 *
 * Every entry states the snapshot row it distrusts. Nothing here asserts a
 * replacement country; suppression only withholds.
 */
import { AIRLINE_REGISTRY, AIRLINE_REGISTRY_SOURCE, type AirlineRegistryEntry } from "./airline-registry";

export const SUPPRESSED_AIRLINE_DESIGNATORS: Readonly<Record<string, string>> = {
  VJ: "snapshot row is Royal Air Cambodge (KH); designator re-assigned since the snapshot",
  RF: "snapshot row is Florida West International Airways (US); designator re-assigned since the snapshot",
  QH: "snapshot row is Air Florida (US); designator re-assigned since the snapshot",
  JX: "snapshot row is Jusur airways (EG); designator re-assigned since the snapshot",
  ZG: "snapshot row is Viva Macau (MO); designator re-assigned since the snapshot",
  IT: "snapshot row is Kingfisher Airlines (IN); designator re-assigned since the snapshot",
  GK: "snapshot row is Genesis (PK); designator re-assigned since the snapshot",
  GS: "snapshot row is Air Foyle (GB); designator re-assigned since the snapshot",
  JD: "snapshot row is Japan Air System (JP); designator re-assigned since the snapshot",
  XJ: "snapshot row is Mesaba Airlines (US); designator re-assigned since the snapshot",
  VZ: "snapshot row is MyTravel Airways (GB); designator re-assigned since the snapshot",
  KY: "snapshot row is KSY (GR); designator re-assigned since the snapshot",
  GJ: "snapshot row is Eurofly Service (IT); designator re-assigned since the snapshot",
  DZ: "snapshot row is Starline.kz (KZ); designator re-assigned since the snapshot",
  EU: "snapshot row is Empresa Ecuatoriana De Aviacion (EC); designator re-assigned since the snapshot",
  QW: "snapshot row is Blue Wings (DE); designator re-assigned since the snapshot",
  "8L": "snapshot row is Cargo Plus Aviation (AE); designator re-assigned since the snapshot",
  H1: "snapshot row is Hankook Air US (US); designator re-assigned since the snapshot",
  TV: "snapshot row is Virgin Express (BE); designator re-assigned since the snapshot",
  N4: "snapshot row is Regionalia México (MX); designator re-assigned since the snapshot",
  HZ: "snapshot row is Sat Airlines (KZ); designator re-assigned since the snapshot",
  DG: "snapshot row is South East Asian Airlines (PH); designator re-assigned since the snapshot",
  "5W": "snapshot row is Astraeus (GB); designator re-assigned since the snapshot",
  VQ: "snapshot row is Viking Hellas (GR); designator re-assigned since the snapshot",
  "7I": "snapshot country is withdrawn code AN; current CLDR aliases it to Curaçao, which is not a reliable registration-country claim",
  WM: "snapshot country is withdrawn code AN; current CLDR aliases it to Curaçao, which is not a reliable registration-country claim",
};

/**
 * Designators whose snapshot COUNTRY still holds but whose snapshot NAME is
 * a former operator of the same code in the same country. The country is
 * kept; the stale name is dropped so the provider's official name is shown.
 */
export const STALE_REGISTRY_NAMES: ReadonlySet<string> = new Set(["TR", "OD", "9C", "TZ"]);

export interface AirlineLookup {
  /** Registry name, or null when unknown or known-stale. */
  name: string | null;
  /** ISO 3166-1 alpha-2, or null when unknown or suppressed. */
  country: string | null;
}

export function lookupAirline(iata: string | null | undefined): AirlineLookup | null {
  if (!iata) return null;
  const key = iata.toUpperCase();
  // Verified 2026-09-05: Narita Airport lists Air Seoul as RS / ASV.
  // https://www.narita-airport.jp/ko/flight/airline-search/asv/
  // Air Seoul's own corporate footer identifies its Korean legal entity.
  // https://flyairseoul.com/CW/ko/main.do
  if (key === "RS") return { name: "Air Seoul", country: "KR" };
  if (SUPPRESSED_AIRLINE_DESIGNATORS[key]) return null;
  const entry: AirlineRegistryEntry | undefined = AIRLINE_REGISTRY[key];
  if (!entry) return null;
  return { name: STALE_REGISTRY_NAMES.has(key) ? null : entry.name, country: entry.country };
}

export const AIRLINE_COUNTRY_SOURCE = {
  ...AIRLINE_REGISTRY_SOURCE,
  suppressed: Object.keys(SUPPRESSED_AIRLINE_DESIGNATORS).length,
} as const;
