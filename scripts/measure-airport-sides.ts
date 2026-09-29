/**
 * Read-only evidence for the airport east/west work: what the stored A5
 * departure-hall rows and A1 gate values actually look like in Production.
 *
 * Bounded SELECTs only (every one has a LIMIT and seeks an indexed column);
 * no provider call, no write. Prints counts and shapes, never a secret.
 */
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { resolveProductionDatabaseConfig } from "./production-database";
import { AIRPORT_SIDES_VERSION, summarizeGateSides } from "../lib/airport-sides";

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
const kstDay = (offset: number) => new Date(Date.now() + 9 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const today = kstDay(0);
const tomorrow = kstDay(1);
let rowsRead = 0;

async function all(label: string, sql: string, ...binds: unknown[]) {
  const statement = database.prepare(sql).bind(...binds);
  const result = await statement.all<Record<string, unknown>>();
  const meta = (result as unknown as { meta?: { rows_read?: number } }).meta;
  rowsRead += Number(meta?.rows_read ?? 0);
  console.log(`\n## ${label} (rows ${result.results?.length ?? 0}, rows_read ${meta?.rows_read ?? "?"})`);
  return result.results ?? [];
}

const zones = await all("A5 departure rows today+tomorrow",
  `SELECT target_date AS d, terminal AS t, zone AS z, is_aggregate AS a, time_band_raw AS b, expected_passengers AS n, retrieved_at AS r
   FROM airport_passenger_forecast WHERE target_date IN (?, ?) AND direction = 'departure' LIMIT 600`, today, tomorrow);
const byKey = new Map<string, Record<string, unknown>[]>();
for (const row of zones) {
  const key = `${row.d} ${row.t} ${row.z}`;
  byKey.set(key, [...(byKey.get(key) ?? []), row]);
}
for (const [key, rows] of [...byKey].sort()) {
  const retrieved = [...new Set(rows.map((row) => String(row.r)))];
  console.log(`${key}: bands ${rows.length}, total ${rows.reduce((sum, row) => sum + Number(row.n), 0)}, zero bands ${rows.filter((row) => Number(row.n) === 0).length}, retrieved_at values ${retrieved.length} (latest ${retrieved.sort().at(-1)})`);
}
// Per hour: does the official aggregate equal the sum of the components, and which ones?
for (const day of [today, tomorrow]) {
  for (const terminal of ["T1", "T2"]) {
    const rows = zones.filter((row) => row.d === day && row.t === terminal);
    const bands = [...new Set(rows.map((row) => String(row.b)))].sort();
    let equalAll = 0; let equalWithout6 = 0; let other = 0;
    const samples: string[] = [];
    for (const band of bands) {
      const inBand = rows.filter((row) => row.b === band);
      const aggregate = inBand.find((row) => Number(row.a) === 1);
      const parts = inBand.filter((row) => Number(row.a) === 0);
      if (!aggregate) continue;
      const sum = parts.reduce((total, row) => total + Number(row.n), 0);
      const sumWithout6 = parts.filter((row) => row.z !== "t1dg6").reduce((total, row) => total + Number(row.n), 0);
      if (Math.abs(sum - Number(aggregate.n)) < 0.5) equalAll++;
      else if (Math.abs(sumWithout6 - Number(aggregate.n)) < 0.5) equalWithout6++;
      else other++;
      if (samples.length < 4) samples.push(`${band}: ${parts.map((row) => `${row.z}=${row.n}`).join(" ")} | agg ${aggregate.z}=${aggregate.n}`);
    }
    console.log(`${day} ${terminal}: bands ${bands.length}; aggregate == sum(all parts) ${equalAll}; == sum(without t1dg6) ${equalWithout6}; neither ${other}`);
    for (const sample of samples) console.log(`   ${sample}`);
  }
}

const since = kstDay(-3);
const gates = await all("Departure gate values by terminal, last 3 KST days (distinct physical flights)",
  `SELECT terminal AS t, gate AS g, COUNT(DISTINCT physical_flight_id) AS n FROM airport_flights
   WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? GROUP BY terminal, gate ORDER BY terminal, gate LIMIT 400`, since, tomorrow);
const byTerminal = new Map<string, string[]>();
for (const row of gates) byTerminal.set(String(row.t), [...(byTerminal.get(String(row.t)) ?? []), `${row.g ?? "∅"}:${row.n}`]);
for (const [terminal, values] of byTerminal) console.log(`${terminal}: ${values.join(" ")}`);

await all("Status values and changed_at presence, today departures",
  `SELECT status AS s, COUNT(*) AS n, SUM(changed_at IS NOT NULL) AS changed, SUM(physical_flight_id IS NULL) AS noPhysical,
     SUM(gate IS NULL OR gate = '') AS noGate, SUM(terminal IS NULL OR terminal = '') AS noTerminal
   FROM airport_flights WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? GROUP BY status LIMIT 50`, today, tomorrow)
  .then((rows) => rows.forEach((row) => console.log(JSON.stringify(row))));

await all("changed_at shape sample",
  `SELECT scheduled_at AS s, changed_at AS c, status AS st, gate AS g, terminal AS t FROM airport_flights
   WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? AND changed_at IS NOT NULL LIMIT 5`, today, tomorrow)
  .then((rows) => rows.forEach((row) => console.log(JSON.stringify(row))));

// One fixed, finished day and one flight set: classification coverage with
// the current config/airport-sides.v1.json, and why the rest is unverified.
const fixedDay = process.env.RPK_SIDES_DATE && /^\d{4}-\d{2}-\d{2}$/.test(process.env.RPK_SIDES_DATE) ? process.env.RPK_SIDES_DATE : kstDay(-1);
const next = new Date(Date.parse(`${fixedDay}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const dayRows = await all(`Departures on ${fixedDay} for side coverage`,
  `SELECT physical_flight_id AS physicalFlightId, terminal, gate, scheduled_at AS scheduledAt, status, retrieved_at AS retrievedAt
   FROM airport_flights WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? LIMIT 2000`, fixedDay, next);
const summary = summarizeGateSides(dayRows, fixedDay);
console.log(JSON.stringify({ sidesVersion: AIRPORT_SIDES_VERSION, date: fixedDay, sourceRows: dayRows.length, physicalFlights: summary.total, cancelled: summary.cancelled,
  byArea: summary.byArea, unverifiedByArea: summary.unverifiedByArea, unmappedGates: summary.unmappedGates }));

console.log(`\nTOTAL rows_read ${rowsRead}`);
