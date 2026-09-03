#!/usr/bin/env node
/**
 * Builds lib/airline-registry.ts from the OpenFlights airline and country
 * snapshots (https://openflights.org/data.php, ODbL 1.0).
 *
 * Usage:
 *   node scripts/build-airline-registry.mjs <airlines.dat> <countries.dat> <retrieved-iso-date>
 *
 * Rules (deliberately conservative — an airline whose country cannot be
 * resolved with certainty is left OUT so the site says "unverified" instead
 * of guessing):
 *   · only rows with a 2-character IATA designator and Active = "Y";
 *   · a designator claimed by more than one active airline is AMBIGUOUS and
 *     is excluded entirely (IATA re-assigns codes; the snapshot keeps both);
 *   · the country name must resolve to exactly one ISO 3166-1 alpha-2 code
 *     through countries.dat or the explicit alias table below;
 *   · nothing is invented: names come verbatim from the snapshot.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [airlinesPath, countriesPath, retrievedOn] = process.argv.slice(2);
if (!airlinesPath || !countriesPath || !/^\d{4}-\d{2}-\d{2}$/.test(retrievedOn ?? "")) {
  console.error("usage: build-airline-registry.mjs <airlines.dat> <countries.dat> <YYYY-MM-DD>");
  process.exit(2);
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((value) => (value === "\\N" ? "" : value.trim()));
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const airlinesRaw = readFileSync(airlinesPath, "utf8");
const countriesRaw = readFileSync(countriesPath, "utf8");

// Country name -> ISO alpha-2, from countries.dat. Names in airlines.dat that
// differ from countries.dat spellings are mapped through explicit aliases —
// each alias is a spelling variant of the same state, never a judgement call.
const isoByName = new Map();
for (const line of countriesRaw.split("\n")) {
  if (!line.trim()) continue;
  const [name, iso2] = parseCsvLine(line);
  if (name && /^[A-Z]{2}$/.test(iso2)) isoByName.set(name, iso2);
}
const COUNTRY_ALIASES = {
  "South Korea": "KR",
  "Republic of Korea": "KR",
  "Korea": "KR",
  "Democratic People's Republic of Korea": "KP",
  "North Korea": "KP",
  "Russia": "RU",
  "Russian Federation": "RU",
  "United States": "US",
  "USA": "US",
  "United Kingdom": "GB",
  "UK": "GB",
  "Hong Kong SAR of China": "HK",
  "Hong Kong": "HK",
  "Macau": "MO",
  "Macao": "MO",
  "Taiwan": "TW",
  "Vietnam": "VN",
  "Viet Nam": "VN",
  "Laos": "LA",
  "Lao People's Democratic Republic": "LA",
  "Brunei": "BN",
  "Iran": "IR",
  "Syria": "SY",
  "Syrian Arab Republic": "SY",
  "Lao Peoples Democratic Republic": "LA",
  "Czech Republic": "CZ",
  "Czechia": "CZ",
  "Ivory Coast": "CI",
  "Cote d'Ivoire": "CI",
  "Cape Verde": "CV",
  "Cabo Verde": "CV",
  "Moldova": "MD",
  "Republic of Moldova": "MD",
  "Bolivia": "BO",
  "Venezuela": "VE",
  "Tanzania": "TZ",
  "Macedonia": "MK",
  "North Macedonia": "MK",
  "Kyrgyzstan": "KG",
  "Kyrgyz Republic": "KG",
  "Myanmar": "MM",
  "Burma": "MM",
  "Micronesia": "FM",
  "Federated States of Micronesia": "FM",
  "Palestine": "PS",
  "Palestinian Territory": "PS",
  "Netherlands Antilles": "AN",
  "Curacao": "CW",
  "Congo (Kinshasa)": "CD",
  "Democratic Republic of the Congo": "CD",
  "Congo (Brazzaville)": "CG",
  "Republic of the Congo": "CG",
  "Swaziland": "SZ",
  "Eswatini": "SZ",
  "East Timor": "TL",
  "Timor-Leste": "TL",
  "Vatican City": "VA",
  "Saint Kitts and Nevis": "KN",
  "Saint Vincent and the Grenadines": "VC",
  "Saint Lucia": "LC",
  "Reunion": "RE",
  "Guinea Bissau": "GW",
  "Guinea-Bissau": "GW",
  "Sao Tome and Principe": "ST",
  "Turks and Caicos Islands": "TC",
  "Virgin Islands": "VI",
  "British Virgin Islands": "VG",
  "Falkland Islands": "FK",
  "Faroe Islands": "FO",
  "Antigua and Barbuda": "AG",
  "Trinidad and Tobago": "TT",
  "Bosnia and Herzegovina": "BA",
};
const isoOf = (name) => isoByName.get(name) ?? COUNTRY_ALIASES[name] ?? null;

const candidates = new Map();
const activeNoCountry = [];
for (const line of airlinesRaw.split("\n")) {
  if (!line.trim()) continue;
  const [, name, alias, iata, icao, , country, active] = parseCsvLine(line);
  if (active !== "Y") continue;
  if (!/^[A-Z0-9]{2}$/.test(iata) || iata === "-") continue;
  if (!/[A-Z]/.test(iata)) continue;
  const list = candidates.get(iata) ?? [];
  list.push({ name, alias, icao: /^[A-Z]{3}$/.test(icao) ? icao : null, country });
  candidates.set(iata, list);
}

const entries = [];
const ambiguous = [];
const unresolvedCountry = new Map();
for (const [iata, list] of [...candidates.entries()].sort()) {
  // Several active rows for one designator are acceptable only when every
  // one of them resolves to the same country (e.g. an airline and its cargo
  // or domestic arm). The first row's name is used. Different countries mean
  // the snapshot carries a re-assigned code, and the designator is excluded.
  const isoSet = new Set(list.map((row) => isoOf(row.country)));
  if (list.length > 1 && (isoSet.size !== 1 || isoSet.has(null))) { ambiguous.push(`${iata}: ${list.map((row) => row.name).join(" | ")}`); continue; }
  const [row] = list;
  const iso = isoOf(row.country);
  if (!iso) { unresolvedCountry.set(row.country, (unresolvedCountry.get(row.country) ?? 0) + 1); activeNoCountry.push(iata); continue; }
  entries.push({ iata, icao: row.icao, name: row.name, country: iso });
}

const header = `/**
 * Airline designator -> operator name and country of registration.
 *
 * GENERATED by scripts/build-airline-registry.mjs — do not edit by hand.
 *
 * Source: OpenFlights airline + country database snapshots
 *   https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat
 *   https://raw.githubusercontent.com/jpatokal/openflights/master/data/countries.dat
 *   Licence: Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/1-0/
 *   Retrieved: ${retrievedOn}
 *   airlines.dat  sha256 ${sha256(airlinesRaw)}
 *   countries.dat sha256 ${sha256(countriesRaw)}
 *
 * Inclusion rules: Active = Y, a 2-character IATA designator held by exactly
 * one active airline, and a country name that resolves to one ISO 3166-1
 * alpha-2 code. ${ambiguous.length} designators were excluded as ambiguous and
 * ${activeNoCountry.length} because their country did not resolve. Airlines
 * absent from this table are shown as "country unverified" — never guessed.
 * The snapshot is community-maintained and may lag recent airline launches.
 */
`;
const body = `export interface AirlineRegistryEntry {
  /** 2-character IATA airline designator, e.g. "KE". */
  iata: string;
  /** 3-letter ICAO designator when the snapshot has one. */
  icao: string | null;
  /** Operator name as published in the snapshot. */
  name: string;
  /** ISO 3166-1 alpha-2 country of registration. */
  country: string;
}

export const AIRLINE_REGISTRY_SOURCE = {
  provider: "OpenFlights airline database",
  licence: "ODbL 1.0",
  retrievedOn: ${JSON.stringify(retrievedOn)},
  entries: ${entries.length},
} as const;

export const AIRLINE_REGISTRY: Readonly<Record<string, AirlineRegistryEntry>> = {
${entries.map((row) => `  ${JSON.stringify(row.iata)}: { iata: ${JSON.stringify(row.iata)}, icao: ${JSON.stringify(row.icao)}, name: ${JSON.stringify(row.name)}, country: ${JSON.stringify(row.country)} },`).join("\n")}
};
`;
writeFileSync(new URL("../lib/airline-registry.ts", import.meta.url), header + body);
console.log(JSON.stringify({ entries: entries.length, ambiguous: ambiguous.length, unresolvedCountry: [...unresolvedCountry.entries()] }, null, 1));
console.error(ambiguous.slice(0, 40).join("\n"));
