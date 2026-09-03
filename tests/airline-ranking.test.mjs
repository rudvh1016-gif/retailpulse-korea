import assert from "node:assert/strict";
import test from "node:test";

import { AIRLINE_COUNTRY_SOURCE, lookupAirline, STALE_REGISTRY_NAMES, SUPPRESSED_AIRLINE_DESIGNATORS } from "../lib/airline-country.ts";
import { AIRLINE_REGISTRY } from "../lib/airline-registry.ts";
import { operatingDesignator, summarizeAirlineRanking } from "../lib/airline-ranking.ts";

const row = (overrides) => ({
  physicalFlightId: "p1", terminal: "T1", operatingFlight: "KE703", airlineLabel: "대한항공", codeshare: "N", retrievedAt: "2026-09-03T00:03:00Z", ...overrides,
});

const lookup = (iata) => ({ KE: { name: "Korean Air", country: "KR" }, OZ: { name: "Asiana Airlines", country: "KR" }, JL: { name: "Japan Airlines", country: "JP" } })[iata] ?? null;

test("operating designator is the two-character prefix of a flight number, or null", () => {
  assert.equal(operatingDesignator("KE703"), "KE");
  assert.equal(operatingDesignator("ke0703"), "KE");
  assert.equal(operatingDesignator("7C1101"), "7C");
  assert.equal(operatingDesignator("KAL703"), null);
  assert.equal(operatingDesignator(""), null);
  assert.equal(operatingDesignator(null), null);
});

test("a codeshare pair is one flight for its operator, labelled with the operator's own name", () => {
  const rows = [
    row({ physicalFlightId: "a", operatingFlight: "KE703", airlineLabel: "대한항공", codeshare: "N" }),
    row({ physicalFlightId: "a", operatingFlight: "KE703", airlineLabel: "델타항공", codeshare: "Y" }),
    row({ physicalFlightId: "b", operatingFlight: "KE705", airlineLabel: "대한항공", codeshare: "N" }),
    row({ physicalFlightId: "c", operatingFlight: "OZ102", airlineLabel: "아시아나항공", codeshare: "N", terminal: "T2" }),
    row({ physicalFlightId: "d", operatingFlight: "JL092", airlineLabel: "일본항공", codeshare: "N", terminal: "T2", retrievedAt: "2026-09-03T00:09:00Z" }),
    row({ physicalFlightId: "e", operatingFlight: "RS701", airlineLabel: "에어서울", codeshare: "N" }),
  ];
  const summary = summarizeAirlineRanking(rows, lookup, 10);
  assert.equal(summary.all.totalFlights, 5);
  assert.deepEqual(summary.all.airlines.map((a) => [a.iata, a.flights, a.providerName, a.country, a.countryBasis]), [
    ["KE", 2, "대한항공", "KR", "REGISTRY"],
    ["JL", 1, "일본항공", "JP", "REGISTRY"],
    ["OZ", 1, "아시아나항공", "KR", "REGISTRY"],
    ["RS", 1, "에어서울", null, "UNVERIFIED"],
  ]);
  assert.equal(summary.all.airlines[0].share, 0.4);
  assert.deepEqual(summary.all.countries.map((c) => [c.country, c.flights, c.airlines]), [["KR", 3, 2], ["JP", 1, 1], [null, 1, 1]]);
  assert.equal(summary.all.retrievedAt, "2026-09-03T00:09:00Z");
  assert.deepEqual(Object.keys(summary.byTerminal), ["T1", "T2"]);
  assert.equal(summary.byTerminal.T1.totalFlights, 3);
  assert.deepEqual(summary.byTerminal.T2.airlines.map((a) => a.iata), ["JL", "OZ"]);
});

test("flights without a designator are counted in the total but never invent an airline", () => {
  const rows = [row({ physicalFlightId: "a", operatingFlight: "KAL703", airlineLabel: null }), row({ physicalFlightId: "b", operatingFlight: "KE1" })];
  const summary = summarizeAirlineRanking(rows, lookup, 10);
  assert.equal(summary.all.totalFlights, 2);
  assert.deepEqual(summary.all.airlines.map((a) => [a.iata, a.flights]), [["KE", 1], [null, 1]]);
  assert.equal(summary.all.airlines[1].providerName, null);
});

test("the limit bounds both lists and empty input is an empty summary", () => {
  const rows = ["KE", "OZ", "LJ", "7C"].map((code, i) => row({ physicalFlightId: `p${i}`, operatingFlight: `${code}10${i}`, airlineLabel: code }));
  const summary = summarizeAirlineRanking(rows, lookup, 2);
  assert.equal(summary.all.airlines.length, 2);
  assert.equal(summary.all.totalFlights, 4);
  assert.deepEqual(summarizeAirlineRanking([], lookup).all, { totalFlights: 0, airlines: [], countries: [], retrievedAt: null });
});

test("the registry answers Korean carriers and withholds every suppressed or unknown designator", () => {
  assert.deepEqual(lookupAirline("KE"), { name: "Korean Air", country: "KR" });
  assert.equal(lookupAirline("oz").country, "KR");
  assert.equal(lookupAirline("7C").country, "KR");
  for (const code of Object.keys(SUPPRESSED_AIRLINE_DESIGNATORS)) {
    assert.equal(lookupAirline(code), null, `${code} must be withheld`);
    assert.ok(AIRLINE_REGISTRY[code], `${code} suppression must point at a real snapshot row`);
  }
  for (const code of STALE_REGISTRY_NAMES) {
    const found = lookupAirline(code);
    if (found) assert.equal(found.name, null, `${code} stale name must be dropped`);
  }
  assert.equal(lookupAirline("00"), null);
  assert.equal(lookupAirline("KEX"), null);
  assert.equal(lookupAirline(null), null);
  assert.equal(AIRLINE_COUNTRY_SOURCE.licence, "ODbL 1.0");
  assert.match(AIRLINE_COUNTRY_SOURCE.retrievedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(AIRLINE_COUNTRY_SOURCE.suppressed, Object.keys(SUPPRESSED_AIRLINE_DESIGNATORS).length);
});

test("every registry entry is a two-character designator with an ISO alpha-2 country", () => {
  for (const [code, entry] of Object.entries(AIRLINE_REGISTRY)) {
    assert.match(code, /^[A-Z0-9]{2}$/);
    assert.equal(entry.iata, code);
    assert.match(entry.country, /^[A-Z]{2}$/);
    assert.ok(entry.name.length > 0);
  }
});
