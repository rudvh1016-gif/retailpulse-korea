import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

/**
 * The known residual defect in `airport_flights`, fenced off.
 *
 * `airport_flights` keeps one row per physical flight (unique index on
 * `physical_flight_id`). When a provider page lists a codeshare pair under
 * the same master flight number, persistence keeps whichever marketing row
 * it wrote last — including that row's own `airline` text and `airline_code`.
 * So the stored raw label can name the codeshare PARTNER rather than the
 * operator the flight number itself names. That is why production once
 * showed KE-numbered flights labelled 아시아나항공.
 *
 * The display was fixed at the root in September 2026: every shown airline
 * identity is looked up in the verified registry using the designator parsed
 * from `flight_number`, which is the master number and therefore unaffected.
 *
 * An audit on 2026-09-04 asked the remaining question — is the misleading raw
 * label consumed anywhere? — and found that it is not. These tests keep that
 * true, so the storage defect can stay unmigrated (a destructive rewrite of
 * production rows to tidy a field nothing reads would be the larger risk)
 * without quietly becoming a public one.
 */
test("no public read path selects the raw provider airline name", async () => {
  for (const path of [
    "../app/api/live/summary/route.ts",
    "../app/api/live/flights/route.ts",
    "../app/api/airport/facility-operations/route.ts",
  ]) {
    const source = await read(path);
    for (const select of source.matchAll(/SELECT[\s\S]*?FROM airport_flights/g)) {
      assert.doesNotMatch(select[0], /(^|[\s,(])airline(\s|,|$)/,
        `${path} must not read the raw airline name: it can belong to a codeshare partner`);
    }
  }
});

test("the ranking reads the master flight number, never a stored airline label", async () => {
  const summary = await read("../app/api/live/summary/route.ts");
  const flightSelect = summary.match(/flightRows: \[client\.prepare\([\s\S]*?FROM airport_flights/)?.[0] ?? "";
  assert.ok(flightSelect.length > 0);
  assert.match(flightSelect, /flight_number AS operatingFlight/,
    "the operating identity must come from the master flight number");

  const ranking = await read("../lib/airline-ranking.ts");
  // The ranking's input type has no field for a provider-supplied name, so a
  // future caller cannot pass one in even by accident.
  const rowType = ranking.match(/export interface AirlineRankingFlightRow \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(rowType.length > 0);
  assert.doesNotMatch(rowType, /airline(Name)?\s*:/,
    "a raw airline label must not be part of the ranking's input contract");
});

test("airlineCode leaves the flights API as raw provider data, never as a rendered operator", async () => {
  const signals = await read("../app/live-signals.tsx");
  // It is allowed in the client-side search haystack — a wrong code there can
  // only change what a query matches, never assert who flies the aircraft.
  const uses = [...signals.matchAll(/flight\.airlineCode/g)];
  assert.ok(uses.length > 0, "the field is still returned; this test describes how it may be used");
  const haystack = signals.match(/return `\$\{flight\.flightNumber\}[^`]*`\.toUpperCase\(\)\.includes\(needle\)/);
  assert.ok(haystack, "the only permitted use is the search haystack");
  assert.equal(uses.length, 1,
    "any second use of airlineCode needs review: it may name a codeshare partner, not the operator");
});
