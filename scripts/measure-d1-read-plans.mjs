import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, rmSync } from "node:fs";

/**
 * Measures the /api/live/summary read path against a realistic local replica.
 *
 * Run with AFTER=1 and EXTRA_INDEXES set to the new migration's indexes to see
 * the optimized plans; run with neither to reproduce the pre-fix baseline that
 * exhausted the D1 Free daily row-read allowance on 2026-09-01.
 *
 *   node scripts/measure-d1-read-plans.mjs
 *   AFTER=1 EXTRA_INDEXES="$(...)" node scripts/measure-d1-read-plans.mjs
 */
const path = `${process.env.MEASURE_DB ?? "."}/measure-d1-read-plans.db`;
try { rmSync(path); } catch {}
const db = new DatabaseSync(path);
for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
    const sql = stmt.trim(); if (!sql) continue;
    try { db.exec(sql); } catch (error) { if (!/already exists|duplicate/i.test(String(error))) throw error; }
  }
}
for (const extra of (process.env.EXTRA_INDEXES ?? "").split(";;").filter(Boolean)) db.exec(extra);

// Volumes from the real production collector log of 2026-09-01:
// airport_flights "population 11733" (~1,100 rows/day), weather 24 bands x 3
// areas x 8 issuances/day, realtime 3 areas x 96 cycles/day.
const N = { airport_flights: 12000, seoul_realtime_area: 5000, seoul_realtime_forecast: 20000,
  weather_forecast: 4000, airport_congestion: 6000, seoul_estimated_sales: 400 };

const BASE = Date.UTC(2026, 7, 21);
const areas = ["myeongdong", "hongdae", "seongsu"];
const kst = (i, perDay) => {
  const at = new Date(BASE + Math.floor(i / perDay) * 86_400_000 + Math.floor(((i % perDay) * 86_400_000) / perDay));
  return `${at.toISOString().slice(0, 19)}+09:00`;
};

/** Fills every column so NOT NULL never trips; only predicate columns are overridden. */
function seed(table, rows, overrides) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const insert = db.prepare(`INSERT INTO ${table} (${columns.map((c) => c.name).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  for (let i = 0; i < rows; i += 1) {
    const custom = overrides(i);
    insert.run(...columns.map((column) => {
      if (Object.hasOwn(custom, column.name)) return custom[column.name];
      if (column.name === "id") return `${table}-${i}`;
      if (/INT|REAL|NUM/i.test(column.type)) return i % 100;
      return `${column.name}-${i % 997}`;
    }));
  }
}

db.exec("BEGIN");
seed("airport_flights", N.airport_flights, (i) => ({
  source_id: "INCHEON_FLIGHT_DETAIL", direction: i % 2 ? "departure" : "arrival",
  flight_number: `KE${i}`, terminal: i % 3 === 0 ? null : `T${1 + (i % 2)}`,
  physical_flight_id: `p${i}`, scheduled_at: kst(i, 1100), gate: `${i % 60}`, retrieved_at: "2026-09-01T00:00:00Z" }));
seed("seoul_realtime_area", N.seoul_realtime_area, (i) => ({
  source_id: "SEOUL_CITYDATA_PPLTN", area: areas[i % 3], observed_at: kst(i, 288) }));
seed("seoul_realtime_forecast", N.seoul_realtime_forecast, (i) => ({
  source_id: "SEOUL_CITYDATA_PPLTN", area: areas[i % 3], issued_at: kst(i, 1152), target_at: kst(i + 1, 1152) }));
seed("weather_forecast", N.weather_forecast, (i) => ({
  source_id: "KMA_VILAGE_FCST", area: areas[i % 3], issued_at: kst(i, 576), target_at: kst(i + 1, 576) }));
seed("airport_congestion", N.airport_congestion, (i) => ({
  source_id: "INCHEON_DEPARTURE_CONGESTION", terminal: `T${1 + (i % 2)}`, zone: `Z${i % 6}`, observed_at: kst(i, 576) }));
seed("seoul_estimated_sales", N.seoul_estimated_sales, (i) => ({
  source_id: "SEOUL_ESTIMATED_SALES", area: areas[i % 3], quarter_code: `2026${1 + (i % 2)}`,
  trade_area_code: `t${i}`, industry_code: `i${i}` }));
db.exec("COMMIT");

const DAY = db.prepare("SELECT substr(scheduled_at,1,10) AS d FROM airport_flights ORDER BY scheduled_at DESC LIMIT 1").get().d;
const NEXT = new Date(Date.parse(`${DAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const rows = {};
for (const table of Object.keys(N)) rows[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
console.log("TABLE ROWS:", JSON.stringify(rows), "| SAMPLE DAY:", DAY);

const AFTER = process.env.AFTER === "1";
const DAYS = Array.from({ length: 21 }, (_, i) => new Date(Date.parse(`${DAY}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10));
const probe = (table, column, filter = "") => DAYS.map(() => `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${filter ? filter + " AND " : ""}${column} >= ? AND ${column} < ?)`).join(" UNION ALL ");
const probeBinds = () => DAYS.flatMap((d) => [d, d, new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)]);
const per = (keys, sql) => keys.map(() => `SELECT * FROM (${sql})`).join(" UNION ALL ");
const QUERIES = AFTER ? {
  "summary.latestRealtime": [per(areas, `SELECT area, observed_at FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1`), [...areas]],
  "summary.latestForecast": [per(areas, `SELECT area, issued_at FROM seoul_realtime_forecast WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?) ORDER BY target_at LIMIT 40`), areas.flatMap((a) => [a, a])],
  "summary.latestWeather": [per(areas, `SELECT area, issued_at FROM weather_forecast WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM weather_forecast WHERE area = ?) ORDER BY target_at LIMIT 60`), areas.flatMap((a) => [a, a])],
  "summary.latestSales": [per(areas, `SELECT area, quarter_code FROM seoul_estimated_sales WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?) ORDER BY sales_amount DESC`), areas.flatMap((a) => [a, a])],
  "summary.latestCongestion": [per(["T1", "T2"], `SELECT terminal, zone FROM airport_congestion WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?) ORDER BY zone LIMIT 12`), ["T1", "T1", "T2", "T2"]],
  "summary.flightsForDay": [`SELECT physical_flight_id, terminal, gate FROM airport_flights WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? LIMIT 2000`, [DAY, NEXT]],
  "summary.availableFlightDates": [probe("airport_flights", "scheduled_at", "direction = 'departure'"), probeBinds()],
  "summary.availableRealtimeDates": [probe("seoul_realtime_area", "observed_at"), probeBinds()],
} : {
  "summary.latestRealtime": [`SELECT area, observed_at FROM seoul_realtime_area a WHERE observed_at = (SELECT MAX(observed_at) FROM seoul_realtime_area b WHERE b.area = a.area)`, []],
  "summary.latestForecast": [`SELECT area, issued_at FROM seoul_realtime_forecast f WHERE f.issued_at = (SELECT MAX(g.issued_at) FROM seoul_realtime_forecast g WHERE g.area = f.area) ORDER BY f.area, f.target_at LIMIT 120`, []],
  "summary.latestWeather": [`SELECT area, issued_at FROM weather_forecast w WHERE w.issued_at = (SELECT MAX(x.issued_at) FROM weather_forecast x WHERE x.area = w.area) ORDER BY w.area, w.target_at LIMIT 180`, []],
  "summary.latestSales": [`SELECT area, quarter_code FROM seoul_estimated_sales s WHERE quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales t WHERE t.area = s.area)`, []],
  "summary.latestCongestion": [`SELECT terminal, zone FROM airport_congestion c WHERE observed_at = (SELECT MAX(observed_at) FROM airport_congestion d WHERE d.terminal = c.terminal) ORDER BY terminal, zone LIMIT 24`, []],
  "summary.flightsForDay": [`SELECT physical_flight_id, terminal, gate FROM airport_flights WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ? LIMIT 2000`, [DAY]],
  "summary.flightCountAll": [`SELECT COUNT(DISTINCT physical_flight_id) AS flights FROM airport_flights WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ?`, [DAY]],
  "summary.flightCountByTerminal": [`SELECT terminal, COUNT(DISTINCT physical_flight_id) AS flights FROM airport_flights WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ? AND terminal IS NOT NULL GROUP BY terminal`, [DAY]],
  "summary.availableFlightDates": [`SELECT DISTINCT substr(scheduled_at, 1, 10) AS day FROM airport_flights WHERE direction = 'departure' ORDER BY day DESC LIMIT 21`, []],
  "summary.availableRealtimeDates": [`SELECT DISTINCT substr(observed_at, 1, 10) AS day FROM seoul_realtime_area ORDER BY day DESC LIMIT 21`, []],
};
let scans = 0;
for (const [label, [sql, binds]] of Object.entries(QUERIES)) {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds).map((r) => r.detail).join(" | ");
  const returned = db.prepare(sql).all(...binds).length;
  if (/SCAN/.test(plan)) scans += 1;
  console.log(`${label.padEnd(32)} ret=${String(returned).padEnd(5)} ${plan}`);
}
console.log(`\nqueries with a SCAN: ${scans}/${Object.keys(QUERIES).length}`);
db.close();
