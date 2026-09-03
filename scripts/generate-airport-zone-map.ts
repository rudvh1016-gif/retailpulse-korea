/**
 * Generates the A3 mapping record, config/airport-zone-map.v1.json.
 *
 * Read-only against Production D1: it SELECTs the official A2 facility rows
 * and writes only a local file. It never calls a provider and never writes to
 * the database, so re-running it can neither cost quota nor change Production.
 *
 * Only facilities whose official location text actually proves a gate or a
 * checkpoint are written. Everything else is left out on purpose — a facility
 * absent from the file is AMBIGUOUS by construction, which is what makes a
 * false proximity claim impossible rather than merely unlikely.
 *
 * Reviewed OFFICIAL_MAP_REVIEW records, if a human ever adds them, are
 * preserved across regeneration: they are evidence this script cannot derive
 * and must never silently drop.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  AIRPORT_ZONE_EVIDENCE_SOURCE,
  AIRPORT_ZONE_MAPPING_VERSION,
  deriveZoneMapping,
  summarizeZoneMappings,
  type AirportZoneMapFile,
  type AirportZoneMapping,
} from "../lib/airport-zone-map";
import type { CanonicalAirportFacility } from "../lib/airport-facilities";
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { resolveProductionDatabaseConfig } from "./production-database";

const OUTPUT = new URL("../config/airport-zone-map.v1.json", import.meta.url);
const NOTES = [
  "Generated from the official A2 facility directory; no facility is invented here.",
  "A facility absent from `mappings` is AMBIGUOUS: it keeps its official terminal, floor and area and is never given a gate, a checkpoint or any proximity claim.",
  "OFFICIAL_DIRECT means the airport authority's own published location text names the gate or checkpoint, quoted verbatim in `evidenceText`.",
  "OFFICIAL_MAP_REVIEW records are added by a human who located the facility on an official Incheon Airport map; this generator never produces them and never removes them.",
  "A stated gate range is kept literally (for example 24~27). Enumerating the numbers in between would assert that each one is a real gate, which the text does not say.",
];

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);

const result = await database.prepare(`SELECT facility_id AS facilityId, terminal, floor,
    duty_area AS dutyArea, arrival_departure AS arrivalDeparture, location_raw AS locationRaw
  FROM airport_facility ORDER BY facility_id`).run();
const rows = (result.results ?? []) as Array<Record<string, unknown>>;
if (!rows.length) throw new Error("zone_map_no_facilities: run the A2 import before generating the mapping");

// One instant for the whole run, so the same directory always regenerates to
// the same bytes and a diff shows real mapping changes rather than a clock.
const reviewedAt = new Date().toISOString();

let existingReviewed: AirportZoneMapping[] = [];
try {
  const previous = JSON.parse(readFileSync(OUTPUT, "utf8")) as AirportZoneMapFile;
  existingReviewed = (previous.mappings ?? []).filter((row) => row.mappingMethod === "OFFICIAL_MAP_REVIEW");
} catch {
  // No prior file, or an unreadable one: start from the derived mapping only.
}
const reviewedIds = new Set(existingReviewed.map((row) => row.facilityId));

const derived: AirportZoneMapping[] = [];
for (const row of rows) {
  const facility = {
    facilityId: String(row.facilityId),
    terminal: (row.terminal ?? null) as CanonicalAirportFacility["terminal"],
    floor: (row.floor ?? null) as string | null,
    dutyArea: (row.dutyArea ?? null) as CanonicalAirportFacility["dutyArea"],
    arrivalDeparture: (row.arrivalDeparture ?? null) as CanonicalAirportFacility["arrivalDeparture"],
    locationRaw: (row.locationRaw ?? null) as string | null,
  } as CanonicalAirportFacility;
  if (reviewedIds.has(facility.facilityId)) continue;
  const mapping = deriveZoneMapping(facility, reviewedAt);
  if (mapping.mappingMethod !== "AMBIGUOUS") derived.push(mapping);
}

const mappings = [...existingReviewed, ...derived].sort((left, right) =>
  left.facilityId.localeCompare(right.facilityId, "en", { numeric: true }));
const counts = summarizeZoneMappings(rows.length, mappings);

const file: AirportZoneMapFile = {
  mappingVersion: AIRPORT_ZONE_MAPPING_VERSION,
  generatedAt: reviewedAt,
  evidenceSource: AIRPORT_ZONE_EVIDENCE_SOURCE,
  notes: NOTES,
  counts,
  mappings,
};
const serialized = `${JSON.stringify(file, null, 2)}\n`;
// config/ holds no other tracked file, so a fresh checkout does not have it.
mkdirSync(new URL(".", OUTPUT), { recursive: true });
writeFileSync(OUTPUT, serialized, "utf8");
console.log(JSON.stringify({ generated: "airport-zone-map.v1", ...counts }, null, 2));

// The file has to reach the repository, and only a Production-credentialed
// runner can read the directory it is derived from. Printing it on one line
// lets the run log carry the artifact verbatim; it contains official public
// facility locations only, and no credential ever passes through here.
if (process.env.RPK_ZONE_MAP_STDOUT === "true") {
  console.log(`ZONE_MAP_FILE_BEGIN${JSON.stringify(file)}ZONE_MAP_FILE_END`);
}
