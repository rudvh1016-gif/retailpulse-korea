/**
 * Airport Retail A3 — verified facility-to-zone mapping.
 *
 * A2 answers "which official facilities exist". A3 answers the much narrower
 * question "which of those facilities can be tied to an operational zone
 * *with evidence*". It creates no facility of its own: every mapping is keyed
 * by an official A2 `facility_id` (the provider's `sn`).
 *
 * The rule that shapes everything here is the no-guess rule. Gate 251 being
 * numerically next to gate 252 proves nothing about walking distance; a
 * terminal and a floor prove nothing about which checkpoint a shop sits
 * behind; "3층 면세지역" is not a gate. So a gate or checkpoint is recorded
 * only when the airport authority's own published location text names it, and
 * a facility with no such text stays AMBIGUOUS — it keeps its official
 * terminal/floor/area, and never gains a proximity claim.
 *
 * Three methods, and only three:
 *   OFFICIAL_DIRECT     the official `lcnm` text itself names a gate or a
 *                       departure checkpoint. The exact matched substring is
 *                       stored as evidence, so any reader can check it.
 *   OFFICIAL_MAP_REVIEW a human located the facility on an official Incheon
 *                       Airport map. Only a reviewed record in
 *                       config/airport-zone-map.v1.json can carry this; it is
 *                       never produced by parsing.
 *   AMBIGUOUS           the evidence is not strong enough. This is a result,
 *                       not a failure.
 */
import type { CanonicalAirportFacility, FacilityTerminal } from "./airport-facilities";

export const AIRPORT_ZONE_MAPPING_VERSION = "airport-zone-map.v1";
/** Dataset the evidence text is quoted from, so a record is traceable without this file. */
export const AIRPORT_ZONE_EVIDENCE_SOURCE = "data.go.kr 15095064 getFacilitesInfo lcnm";

export type ZoneMappingMethod = "OFFICIAL_DIRECT" | "OFFICIAL_MAP_REVIEW" | "AMBIGUOUS";
/**
 * Deliberately not a 0–100 score. A mapping either rests on evidence a reader
 * can check or it does not; a number in between would invent precision.
 */
export type ZoneMappingConfidence = "PROVEN" | "NONE";

export interface AirportZoneMapping {
  facilityId: string;
  terminal: FacilityTerminal | null;
  floor: string | null;
  dutyArea: "DUTY_FREE" | "GENERAL" | null;
  arrivalDeparture: "ARRIVAL" | "DEPARTURE" | null;
  /** The provider's location string exactly as published; the evidence of record. */
  officialLocationRaw: string | null;
  /** Official departure-checkpoint reference, only when the location text names one. */
  checkpointId: string | null;
  /** A single gate, only when the location text names exactly one. */
  gate: string | null;
  /** The literal gate range or gate list the text states — never an enumerated span. */
  gateGroup: string | null;
  mappingMethod: ZoneMappingMethod;
  evidenceSource: string;
  /** The exact substring that proved the mapping; null when nothing was proven. */
  evidenceText: string | null;
  confidence: ZoneMappingConfidence;
  reviewedAt: string;
  mappingVersion: string;
}

/**
 * A gate range as the provider writes it: "24~27번 게이트", "101-104번 탑승구".
 * Matched before the single-gate rule, otherwise a range would be misread as
 * its own last gate. The matched text is kept literally: enumerating 24,25,26,27
 * would assert that every number in between is a real gate, which the text
 * does not say.
 */
const GATE_RANGE = /(\d{1,3})\s*[~∼\-–—]\s*(\d{1,3})\s*번?\s*(?:게이트|탑승구|탑승게이트)/;
/** A single gate: "27번 게이트", "27번 탑승구", "게이트 27번". */
const GATE_SINGLE = /(?:(\d{1,3})\s*번?\s*(?:게이트|탑승구|탑승게이트)|(?:게이트|탑승구)\s*(\d{1,3})\s*번?)/;
/**
 * A departure checkpoint: "1번 출국장", "제2출국장", "출국장 3". The captured
 * number is the official checkpoint reference; it is NOT resolved against a
 * congestion feed here, because a checkpoint reference and a congestion
 * `gateId` are different vocabularies until one is proven to equal the other.
 */
const CHECKPOINT = /(?:제\s*)?(\d)\s*번?\s*출국장|출국장\s*(\d)/;

function firstGroup(match: RegExpMatchArray | null): string | null {
  if (!match) return null;
  for (let index = 1; index < match.length; index += 1) {
    if (match[index]) return match[index];
  }
  return null;
}

export interface ZoneEvidence {
  checkpointId: string | null;
  gate: string | null;
  gateGroup: string | null;
  evidenceText: string | null;
}

/**
 * Reads only what the official location text actually states.
 *
 * Returns nothing at all rather than a best guess: a text that says only
 * "제1여객터미널 3층" yields no gate and no checkpoint, because a floor is not
 * a gate. When several distinct gates are named, they are recorded as a
 * literal group instead of one of them being picked as "the" gate.
 */
export function extractZoneEvidence(locationRaw: string | null | undefined): ZoneEvidence {
  const empty: ZoneEvidence = { checkpointId: null, gate: null, gateGroup: null, evidenceText: null };
  const text = typeof locationRaw === "string" ? locationRaw.trim() : "";
  if (!text) return empty;

  const evidence: string[] = [];
  let gate: string | null = null;
  let gateGroup: string | null = null;

  const rangeMatch = text.match(GATE_RANGE);
  if (rangeMatch) {
    gateGroup = `${rangeMatch[1]}~${rangeMatch[2]}`;
    evidence.push(rangeMatch[0].trim());
  } else {
    // Every distinct single gate the text names. Two gates named in one string
    // is a group, not a choice: picking one would be exactly the invented
    // proximity this module exists to prevent.
    const gates: string[] = [];
    const scan = new RegExp(GATE_SINGLE.source, "g");
    for (const match of text.matchAll(scan)) {
      const value = match[1] ?? match[2];
      if (value && !gates.includes(value)) { gates.push(value); evidence.push(match[0].trim()); }
    }
    if (gates.length === 1) gate = gates[0];
    else if (gates.length > 1) gateGroup = gates.join(",");
  }

  const checkpointMatch = text.match(CHECKPOINT);
  const checkpointId = firstGroup(checkpointMatch);
  if (checkpointMatch) evidence.push(checkpointMatch[0].trim());

  if (!gate && !gateGroup && !checkpointId) return empty;
  return { checkpointId, gate, gateGroup, evidenceText: evidence.join(" · ") || null };
}

/**
 * Derives the A3 record for one official facility.
 *
 * `reviewedAt` is supplied by the caller (the generator stamps one instant on
 * a whole run) so the same directory always produces byte-identical records.
 */
export function deriveZoneMapping(facility: CanonicalAirportFacility, reviewedAt: string): AirportZoneMapping {
  const evidence = extractZoneEvidence(facility.locationRaw);
  const proven = Boolean(evidence.gate || evidence.gateGroup || evidence.checkpointId);
  return {
    facilityId: facility.facilityId,
    terminal: facility.terminal,
    floor: facility.floor,
    dutyArea: facility.dutyArea,
    arrivalDeparture: facility.arrivalDeparture,
    officialLocationRaw: facility.locationRaw,
    checkpointId: evidence.checkpointId,
    gate: evidence.gate,
    gateGroup: evidence.gateGroup,
    mappingMethod: proven ? "OFFICIAL_DIRECT" : "AMBIGUOUS",
    evidenceSource: AIRPORT_ZONE_EVIDENCE_SOURCE,
    evidenceText: evidence.evidenceText,
    confidence: proven ? "PROVEN" : "NONE",
    reviewedAt,
    mappingVersion: AIRPORT_ZONE_MAPPING_VERSION,
  };
}

export interface AirportZoneMapFile {
  mappingVersion: string;
  generatedAt: string;
  evidenceSource: string;
  /** How the file was produced and what its absence means, kept beside the data. */
  notes: readonly string[];
  counts: ZoneMappingCounts;
  /** Only facilities with a proven mapping. Anything absent is AMBIGUOUS by construction. */
  mappings: readonly AirportZoneMapping[];
}

export interface ZoneMappingCounts {
  totalFacilities: number;
  officialDirect: number;
  officialMapReview: number;
  ambiguous: number;
  withGate: number;
  withGateGroup: number;
  withCheckpoint: number;
}

export function summarizeZoneMappings(total: number, mappings: readonly AirportZoneMapping[]): ZoneMappingCounts {
  const officialDirect = mappings.filter((row) => row.mappingMethod === "OFFICIAL_DIRECT").length;
  const officialMapReview = mappings.filter((row) => row.mappingMethod === "OFFICIAL_MAP_REVIEW").length;
  return {
    totalFacilities: total,
    officialDirect,
    officialMapReview,
    // Everything the file does not carry is ambiguous; there is no fourth state.
    ambiguous: Math.max(0, total - officialDirect - officialMapReview),
    withGate: mappings.filter((row) => row.gate).length,
    withGateGroup: mappings.filter((row) => row.gateGroup).length,
    withCheckpoint: mappings.filter((row) => row.checkpointId).length,
  };
}

/**
 * The reader used by the product.
 *
 * A facility the file does not list is AMBIGUOUS — not "unknown, assume
 * nearby". `resolveZoneMapping` therefore always returns a record, and that
 * record carries no gate, no checkpoint and no proximity when nothing was
 * proven.
 */
export function buildZoneMapIndex(file: AirportZoneMapFile): ReadonlyMap<string, AirportZoneMapping> {
  const index = new Map<string, AirportZoneMapping>();
  for (const mapping of file.mappings) {
    if (mapping.mappingVersion !== file.mappingVersion) continue;
    if (mapping.mappingMethod === "AMBIGUOUS") continue;
    index.set(mapping.facilityId, mapping);
  }
  return index;
}

export interface AmbiguousFacilityShape {
  facilityId: string;
  terminal: FacilityTerminal | null;
  floor: string | null;
  dutyArea: "DUTY_FREE" | "GENERAL" | null;
  arrivalDeparture: "ARRIVAL" | "DEPARTURE" | null;
  locationRaw: string | null;
}

export function resolveZoneMapping(
  index: ReadonlyMap<string, AirportZoneMapping>,
  facility: AmbiguousFacilityShape,
): AirportZoneMapping {
  const mapped = index.get(facility.facilityId);
  if (mapped) return mapped;
  return {
    facilityId: facility.facilityId,
    terminal: facility.terminal,
    floor: facility.floor,
    dutyArea: facility.dutyArea,
    arrivalDeparture: facility.arrivalDeparture,
    officialLocationRaw: facility.locationRaw,
    checkpointId: null,
    gate: null,
    gateGroup: null,
    mappingMethod: "AMBIGUOUS",
    evidenceSource: AIRPORT_ZONE_EVIDENCE_SOURCE,
    evidenceText: null,
    confidence: "NONE",
    reviewedAt: "",
    mappingVersion: AIRPORT_ZONE_MAPPING_VERSION,
  };
}
