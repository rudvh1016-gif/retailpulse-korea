import assert from "node:assert/strict";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

/**
 * Query-plan regression guard for the public read path.
 *
 * On 2026-09-01 Production D1 exhausted the Free daily row-read allowance
 * (Cloudflare 7500). The cause was not volume but plans: every hot query
 * SCANned a table that grows forever, because the indexes all lead with
 * source_id while the public queries filter by area, terminal, direction and a
 * time range. Rows scanned are billed rows read, so one uncached request cost
 * six figures.
 *
 * These tests fail if any of those queries goes back to scanning a table.
 */
// Comments in this route deliberately quote the old, slow SQL to explain why it
// was replaced, so the guard below reads the code with comments stripped.
const routeSource = readFileSync("app/api/live/summary/route.ts", "utf8");
const route = routeSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const migrations = readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort();

function freshDatabase(name) {
  const path = `tests/.d1-plan-${name}.db`;
  try { rmSync(path); } catch { /* first run */ }
  const db = new DatabaseSync(path);
  for (const file of migrations) {
    for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) db.exec(sql);
    }
  }
  return { db, path };
}

/**
 * Scans of real tables only.
 *
 * SQLite says SCAN for things that are not tables at all — `SCAN (subquery-N)`
 * for a one-row co-routine, `SCAN CONSTANT ROW` for a bare `SELECT ? AS day` —
 * and the exact wording moves between SQLite versions, so an earlier version of
 * this guard passed locally and failed on CI over `SCAN CONSTANT ROW`. Matching
 * against the schema's actual table names is what the guard means and does not
 * depend on how a given SQLite build phrases the rest.
 */
function tableScans(db, sql, binds) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)));
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds)
    .map((row) => String(row.detail))
    .filter((detail) => {
      const scanned = /^SCAN (\w+)/.exec(detail);
      return Boolean(scanned) && tables.has(scanned[1]);
    });
}

const AREAS = ["myeongdong", "hongdae", "seongsu"];
const SUBWAY_STATIONS = {
  myeongdong: { code: "0424", number: "424", name: "명동", line: "4호선" },
  hongdae: { code: "0239", number: "239", name: "홍대입구", line: "2호선" },
  seongsu: { code: "0211", number: "211", name: "성수", line: "2호선" },
};
const perKey = (keys, sql) => keys.map(() => `SELECT * FROM (${sql})`).join(" UNION ALL ");
const probe = (table, column, filter) => Array.from({ length: 21 }, () =>
  `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${filter ? `${filter} AND ` : ""}${column} >= ? AND ${column} < ?)`).join(" UNION ALL ");
const exactDayProbe = (table, column, filter) =>
  `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${filter ? `${filter} AND ` : ""}${column} = ?)`;
const FACILITY_SELECT = `SELECT facility_id, name_ko, name_en, category_group, terminal, floor, duty_area, arrival_departure, location_raw, business_hours_raw FROM airport_facility`;
const probeBinds = () => Array.from({ length: 21 }, (_, i) => [`2026-08-${10 + i}`, `2026-08-${10 + i}`, `2026-08-${11 + i}`]).flat();

const HOT_QUERIES = {
  "summary.latestRealtime": [perKey(AREAS, "SELECT area, observed_at FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1"), [...AREAS]],
  "summary.latestCommercial": [perKey(AREAS, "SELECT area, observed_at FROM seoul_realtime_commercial WHERE area = ? ORDER BY observed_at DESC LIMIT 1"), [...AREAS]],
  "summary.latestForecast": [perKey(AREAS, "SELECT area FROM seoul_realtime_forecast WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?) AND target_at >= ? ORDER BY target_at LIMIT 40"), AREAS.flatMap((a) => [a, a, "2026-08-31T00:00:00+09:00"])],
  "summary.latestWeather": [perKey(AREAS, "SELECT area FROM weather_forecast WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM weather_forecast WHERE area = ?) AND target_at >= ? ORDER BY target_at LIMIT 60"), AREAS.flatMap((a) => [a, a, "2026-08-31T00:00:00+09:00"])],
  "summary.latestSales": [perKey(AREAS, "SELECT area FROM seoul_estimated_sales WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?) ORDER BY sales_amount DESC"), AREAS.flatMap((a) => [a, a])],
  "summary.latestStoreDynamics": [perKey(AREAS, "SELECT area FROM seoul_store_dynamics WHERE area = ? AND source_id = ? AND mapping_version = ? AND record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID' ORDER BY quarter_code DESC LIMIT 1"), AREAS.flatMap((a) => [a, "SEOUL_STORE_DYNAMICS", "oa-15577-standard-area-2026-09-03-v1"])],
  "collector.storeDynamicsLastGood": [perKey(AREAS, "SELECT source_id, dataset_id, record_origin, area, quarter_code, trade_area_code, trade_area_name, trade_area_type_code, trade_area_type_name, overall_store_count, ordinary_store_count, franchise_store_count, opening_store_count, opening_rate_tenths_percent, closure_store_count, closure_rate_tenths_percent, mapping_version, retrieved_at, schema_version, quality_status FROM seoul_store_dynamics WHERE source_id = ? AND mapping_version = ? AND record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID' AND area = ? ORDER BY quarter_code DESC LIMIT 1"), AREAS.flatMap((a) => ["SEOUL_STORE_DYNAMICS", "oa-15577-standard-area-2026-09-03-v1", a])],
  "summary.latestForeignPurpose": [perKey(AREAS, "SELECT area, purpose FROM seoul_foreign_purpose_mobility WHERE area = ? AND source_id = ? AND mapping_version = ? AND reference_date = (SELECT MAX(reference_date) FROM seoul_foreign_purpose_mobility WHERE area = ? AND source_id = ? AND mapping_version = ?) ORDER BY purpose LIMIT 2"), AREAS.flatMap((a) => [a, "SEOUL_FOREIGN_PURPOSE_MOBILITY", "official-admin-dong-2025-06-02-v1", a, "SEOUL_FOREIGN_PURPOSE_MOBILITY", "official-admin-dong-2025-06-02-v1"])],
  "summary.subwayHistory": [perKey(AREAS, "SELECT area, reference_date, boarding_count, alighting_count FROM seoul_subway_ridership WHERE area = ? AND mapping_version = ? AND reference_date <= ? AND station_code = ? AND station_number = ? AND station_name = ? AND line_name = ? AND source_id = ? AND dataset_id = ? AND record_origin = 'OFFICIAL_DAILY' AND quality_status = 'VALID' ORDER BY reference_date DESC LIMIT 29"), AREAS.flatMap((area) => {
    const station = SUBWAY_STATIONS[area];
    return [area, "oa-22723-area-stations-2026-09-02-v1", "2026-09-04", station.code, station.number, station.name, station.line, "SEOUL_SUBWAY_RIDERSHIP", "OA-22723"];
  })],
  "summary.latestCongestion": [perKey(["T1", "T2"], "SELECT terminal FROM airport_congestion WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?) ORDER BY zone LIMIT 12"), ["T1", "T1", "T2", "T2"]],
  "summary.passengerForecast": ["SELECT terminal, direction FROM airport_passenger_forecast WHERE direction IN ('departure', 'arrival') AND is_aggregate = 1 AND target_date = ? ORDER BY target_date DESC, direction, target_start_at, terminal LIMIT 288", ["2026-08-31"]],
  "summary.flightsForDay": ["SELECT physical_flight_id, terminal, gate FROM airport_flights WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? LIMIT 2000", ["2026-08-31", "2026-09-01"]],
  "summary.availableFlightDates": [probe("airport_flights", "scheduled_at", "direction = 'departure'"), probeBinds()],
  "summary.availableForecastDates": [exactDayProbe("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"), ["2026-08-31", "2026-08-31"]],
  "summary.availableRealtimeDates": [probe("seoul_realtime_area", "observed_at", ""), probeBinds()],
  // A2 facility directory. The endpoint always carries a leading equality on
  // terminal or category_group (it defaults the terminal when the caller
  // gives neither), so every shape below seeks an index.
  "facilities.terminalAndCategory": [`${FACILITY_SELECT} WHERE terminal = ? AND category_group = ? ORDER BY name_ko LIMIT ? OFFSET ?`, ["T1", "DUTY_FREE", 61, 0]],
  "facilities.terminalOnly": [`${FACILITY_SELECT} WHERE terminal = ? ORDER BY name_ko LIMIT ? OFFSET ?`, ["T2", 61, 0]],
  "facilities.categoryOnly": [`${FACILITY_SELECT} WHERE category_group = ? ORDER BY name_ko LIMIT ? OFFSET ?`, ["PHARMACY", 61, 0]],
  "facilities.filteredAndSearched": [`${FACILITY_SELECT} WHERE terminal = ? AND category_group = ? AND floor = ? AND duty_area = ? AND arrival_departure = ? AND (name_ko LIKE ? OR name_en LIKE ? OR goods_brands LIKE ? OR facility_item LIKE ?) ORDER BY name_ko LIMIT ? OFFSET ?`, ["T1", "FOOD", "3층", "DUTY_FREE", "DEPARTURE", "%cafe%", "%cafe%", "%cafe%", "%cafe%", 61, 0]],
};

test("no hot read-path query scans a growing table", (context) => {
  const { db, path } = freshDatabase("hot");
  context.after(() => { db.close(); rmSync(path); });
  for (const [label, [sql, binds]] of Object.entries(HOT_QUERIES)) {
    const scans = tableScans(db, sql, binds);
    assert.deepEqual(scans, [], `${label} scans a table: ${scans.join(" | ")}`);
  }
});

test("the 29-day exact-station subway history is bounded and never scans its growing table", (context) => {
  const { db, path } = freshDatabase("subway-history");
  context.after(() => { db.close(); rmSync(path); });
  const [sql, binds] = HOT_QUERIES["summary.subwayHistory"];
  assert.equal((sql.match(/LIMIT 29/g) ?? []).length, 3, "each exact area scope must have its own 29-row ceiling");
  for (const predicate of [
    "area = ?", "mapping_version = ?", "reference_date <= ?", "station_code = ?",
    "station_number = ?", "station_name = ?", "line_name = ?", "source_id = ?",
    "dataset_id = ?", "record_origin = 'OFFICIAL_DAILY'", "quality_status = 'VALID'",
  ]) assert.ok(sql.includes(predicate), `missing exact subway predicate: ${predicate}`);
  assert.deepEqual(tableScans(db, sql, binds), [], "the bounded subway-history query must use an index SEARCH");
});

test("the recovery planners look up D1 without scanning either table", (context) => {
  // D1-first recovery only earns its keep if the lookup is cheap. These run on
  // every A5 and weather recovery window - 48 times a day between them - so a
  // scan here would undo the saving the recovery design exists to make.
  const { db, path } = freshDatabase("recovery");
  context.after(() => { db.close(); rmSync(path); });
  const queries = {
    "recovery.weatherCoverage": ["SELECT area, COUNT(*) AS rowCount FROM weather_forecast WHERE issued_at = ? GROUP BY area", ["2026-09-01T14:00:00+09:00"]],
    "recovery.a5Bands": ["SELECT terminal FROM airport_passenger_forecast WHERE direction = 'departure' AND is_aggregate = 1 AND target_date = ? ORDER BY target_start_at, terminal LIMIT 96", ["2026-09-01"]],
    "recovery.sourceHealth": ["SELECT last_retrieved_at FROM source_health WHERE source_id = ?", ["INCHEON_PASSENGER_FORECAST"]],
  };
  for (const [label, [sql, binds]] of Object.entries(queries)) {
    const scans = tableScans(db, sql, binds);
    assert.deepEqual(scans, [], `${label} scans a table: ${scans.join(" | ")}`);
  }
});

test("the read-path indexes the queries depend on exist in a migration", (context) => {
  const { db, path } = freshDatabase("indexes");
  context.after(() => { db.close(); rmSync(path); });
  const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => String(row.name)));
  for (const index of [
    "seoul_realtime_area_area_observed_idx", "seoul_realtime_area_observed_idx",
    "seoul_realtime_commercial_area_observed_idx",
    "seoul_foreign_purpose_mobility_area_reference_idx",
    "seoul_subway_ridership_unique",
    "seoul_subway_ridership_area_reference_idx",
    "seoul_realtime_forecast_area_issue_idx", "weather_forecast_area_issue_idx",
    "seoul_estimated_sales_area_quarter_idx", "seoul_store_dynamics_area_quarter_idx",
    "seoul_store_dynamics_unique", "airport_congestion_terminal_observed_idx",
    "airport_flights_direction_scheduled_idx", "airport_passenger_forecast_target_idx",
    "weather_forecast_issued_area_idx",
  ]) assert.ok(present.has(index), `${index} is missing; the read path would scan again`);
});

test("the route never wraps an indexed column in a function again", () => {
  // substr(scheduled_at, 1, 10) = ? is what made four flight queries unindexable.
  assert.equal(/substr\([a-z_]+, 1, 10\) = /.test(route), false, "a function-wrapped predicate cannot use an index");
  // The correlated MAX form is what forced the outer scan on five lookups.
  assert.equal(/= \(SELECT MAX\([a-z.]+\) FROM [a-z_]+ [a-z] WHERE/.test(route), false, "correlated latest-per-key forces a full scan");
});

test("a bare-date range selects exactly the rows the old substr predicate did", (context) => {
  const { db, path } = freshDatabase("equivalence");
  context.after(() => { db.close(); rmSync(path); });
  const columns = db.prepare("PRAGMA table_info(airport_flights)").all();
  const insert = db.prepare(`INSERT INTO airport_flights (${columns.map((c) => c.name).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  // Boundaries that matter: the first and last instant of the KST day, the
  // instant after it, and a day-shaped value with a different suffix.
  const stamps = ["2026-08-30T23:59:59+09:00", "2026-08-31T00:00:00+09:00", "2026-08-31T23:59:59+09:00",
    "2026-08-31T12:00:00.500+09:00", "2026-09-01T00:00:00+09:00"];
  stamps.forEach((scheduledAt, index) => {
    insert.run(...columns.map((column) => {
      if (column.name === "id") return `f${index}`;
      if (column.name === "scheduled_at") return scheduledAt;
      if (column.name === "direction") return "departure";
      if (column.name === "flight_number") return `KE${index}`;
      if (column.name === "physical_flight_id") return `p${index}`;
      return /INT|REAL|NUM/i.test(column.type) ? 0 : `${column.name}`;
    }));
  });
  const bySubstr = db.prepare("SELECT id FROM airport_flights WHERE direction = 'departure' AND substr(scheduled_at, 1, 10) = ? ORDER BY id").all("2026-08-31");
  const byRange = db.prepare("SELECT id FROM airport_flights WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? ORDER BY id").all("2026-08-31", "2026-09-01");
  assert.deepEqual(byRange, bySubstr, "the range must select exactly the old day set, including the sub-second stamp");
  assert.equal(byRange.length, 3);
});

test("bounded forecast date probes preserve the aggregate-departure picker contract", (context) => {
  const { db, path } = freshDatabase("forecast-date-equivalence");
  context.after(() => { db.close(); rmSync(path); });
  const columns = db.prepare("PRAGMA table_info(airport_passenger_forecast)").all();
  const insert = db.prepare(`INSERT INTO airport_passenger_forecast (${columns.map((column) => column.name).join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
  const rows = [
    { id: "included", target_date: "2026-08-31", direction: "departure", is_aggregate: 1 },
    { id: "arrival", target_date: "2026-08-30", direction: "arrival", is_aggregate: 1 },
    { id: "component", target_date: "2026-08-29", direction: "departure", is_aggregate: 0 },
    { id: "outside-window", target_date: "2026-08-08", direction: "departure", is_aggregate: 1 },
  ];
  for (const row of rows) {
    insert.run(...columns.map((column) => {
      if (column.name in row) return row[column.name];
      return /INT|REAL|NUM/i.test(column.type) ? 0 : `${column.name}`;
    }));
  }

  const sql = exactDayProbe(
    "airport_passenger_forecast",
    "target_date",
    "direction = 'departure' AND is_aggregate = 1",
  );
  const pickerDays = ["2026-08-31", "2026-08-30", "2026-08-29"];
  const available = pickerDays.flatMap((day) => db.prepare(sql).all(day, day)).map((row) => row.day);
  assert.deepEqual(available, ["2026-08-31"]);
});

test("the live summary reads both A5 directions once while the Airport date picker stays departure-only", () => {
  assert.equal((route.match(/FROM airport_passenger_forecast f/g) ?? []).length, 1,
    "one bounded D1 statement must serve both departure and arrival summaries");
  assert.match(route, /WHERE f\.direction IN \('departure', 'arrival'\) AND f\.is_aggregate = 1 AND f\.target_date IN \(\?, \?, \?\)/);
  assert.match(route, /ORDER BY target_date DESC, direction, target_start_at, terminal LIMIT 288/);
  assert.match(route, /passengerForecastRows\.filter\(\(row\) => row\.direction === "departure"\)/);
  assert.match(route, /passengerForecastRows\.filter\(\(row\) => row\.direction === "arrival"\)/);
  assert.match(route, /dayValueExistsSql\("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"\)/,
    "the Airport detail date picker remains departure-scoped");
});

test("the live summary exposes one indexed latest commercial observation per known area", () => {
  assert.match(route, /commercialRows: \[client\.prepare\(/, "the commercial block is one statement in the route's single batched read");
  assert.match(route, /FROM seoul_realtime_commercial WHERE area = \? ORDER BY observed_at DESC LIMIT 1/);
  assert.match(route, /const commercial = commercialRows\.find\(\(row\) => row\.area === area\) \?\? null/);
  assert.match(route, /commercial: commercial \? \{ \.\.\.commercial, comparisons: areaComparisons\(commercial, "paymentAmountMin", "paymentAmountMax"\), freshness:/);
});

test("the live summary exposes one compact indexed Store Dynamics row per exact current mapping", () => {
  assert.match(route, /storeDynamicsRows: \[client\.prepare\(/, "the Store Dynamics block is one statement in the route's single batched read");
  assert.match(route, /FROM seoul_store_dynamics\s+WHERE area = \? AND source_id = \? AND mapping_version = \?/);
  assert.match(route, /record_origin = 'OFFICIAL_HISTORICAL' AND quality_status = 'VALID'/);
  assert.match(route, /ORDER BY quarter_code DESC LIMIT 1/);
  assert.match(route, /if \(!isValidStoredStoreDynamics\(area, row\)\) return null/);
  const publicBlock = route.match(/storeDynamics: \(\(\) => \{[\s\S]*?\n        \}\)\(\),/)?.[0] ?? "";
  assert.doesNotMatch(publicBlock, /sourceId:|recordOrigin:|schemaVersion:|qualityStatus:|industryCount:/,
    "validation-only metadata must not leak into the compact public area block");
  const block = route.match(/storeDynamicsRows: \[client\.prepare\([\s\S]*?\)\],/)?.[0] ?? "";
  assert.doesNotMatch(block, /SVC_INDUTY|industry_name|raw_payload/,
    "the summary must not expose industry rows or provider payload fields");
});

/**
 * The Production read-budget measurement must measure the query the site
 * actually runs.
 *
 * scripts/measure-production-read-budget.ts replays the hot path against
 * Production D1 and reports each statement's real rows_read. That evidence is
 * only worth anything while its SQL matches the live route, so every measured
 * statement carries a `guard` fragment that has to appear verbatim in one of
 * the two public read paths — the summary route or the A2 facility directory
 * endpoint. This test enforces the same contract in CI,
 * so a route change that leaves the diagnostic behind fails here rather than
 * producing a confident measurement of a query nobody serves.
 */
test("every measured hot-path statement still exists in the live route", () => {
  const measureSource = readFileSync("scripts/measure-production-read-budget.ts", "utf8").replace(/\r\n/g, "\n");
  const routeText = [
    readFileSync("app/api/live/summary/route.ts", "utf8"),
    readFileSync("app/api/airport/facilities/route.ts", "utf8"),
    // A4 reads only when a store is selected, but it is still a public read
    // path and its statements must stay measurable.
    readFileSync("app/api/airport/facility-operations/route.ts", "utf8"),
  ].join("\n").replace(/\r\n/g, "\n");
  const guards = [...measureSource.matchAll(/^ {4}guard: (`[^`]*`|"(?:[^"\\]|\\.)*"),$/gm)]
    .map((match) => (match[1].startsWith("`") ? match[1].slice(1, -1) : JSON.parse(match[1])));
  assert.equal(guards.length, 24, "expected one guard per measured statement");
  for (const guard of guards) {
    assert.ok(routeText.includes(guard), `the live route no longer contains: ${guard.slice(0, 80)}`);
  }
});

test("the read-budget measurement only ever reads", () => {
  const measureSource = readFileSync("scripts/measure-production-read-budget.ts", "utf8");
  // Statement text lives in `sql:` entries and in the two literal statements
  // the script builds itself; none of them may mutate Production.
  const statements = [
    ...[...measureSource.matchAll(/prepare\(\s*`([^`]*)`/g)].map((match) => match[1]),
    ...[...measureSource.matchAll(/^ {4}sql: `([^`]*)`/gm)].map((match) => match[1]),
  ];
  assert.ok(statements.length > 0, "expected to find the statements the script runs");
  for (const statement of statements) {
    assert.ok(
      /^\s*(SELECT|EXPLAIN)/i.test(statement.replace(/^\s*\$\{[^}]*\}/, "SELECT")),
      `not a read-only statement: ${statement.slice(0, 60)}`,
    );
    assert.ok(
      !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|PRAGMA)\b/i.test(statement),
      `mutating keyword in a diagnostic statement: ${statement.slice(0, 60)}`,
    );
  }
});

/**
 * The date-picker probes must stay one statement per day.
 *
 * Production, 2026-09-02: the probes shipped as one 21-way UNION ALL carrying
 * 63 bound parameters. D1 rejects that statement — on the Workers binding and
 * on the REST endpoint alike — and because safeAll turns a failing statement
 * into an empty list, nothing surfaced: /api/live/summary answered 200 while
 * dateAvailability.airportFlights and .seoulObserved were both empty and the
 * date picker silently offered no days. Sent as a batch of single-day
 * statements the same probes cost exactly one row read each.
 *
 * This test fails if the probes are ever recombined into one statement.
 */
test("the date-picker probes are one statement per day, sent as a batch", () => {
  const source = readFileSync("app/api/live/summary/route.ts", "utf8");
  const builder = /function dayExistsSql\([^)]*\): string \{[\s\S]*?\n\}/.exec(source);
  assert.ok(builder, "expected a dayExistsSql builder");
  assert.ok(
    !/UNION ALL/.test(builder[0]),
    "the day probe must be a single statement; joining days with UNION ALL is what D1 rejects",
  );
  assert.equal(
    (builder[0].match(/SELECT \? AS day/g) ?? []).length,
    1,
    "the builder must emit exactly one probe",
  );
  assert.ok(
    /pickerDays\.map\(\(day\) => client\.prepare\(sql\)\.bind\(/.test(source),
    "the per-day probes must stay one prepared statement per day",
  );
  // Since 2026-09-04 the probes ride inside the route's single batched read
  // (lib/d1-read-batch.ts) rather than a batch of their own; either way they
  // are never sent one statement at a time.
  assert.ok(
    /readGroups\(client, \{ \.\.\.statementGroups, \.\.\.probeGroups \}\)/.test(source),
    "the per-day probes must be read through the route's one batched read, not one statement at a time",
  );
  assert.equal(
    /SELECT DISTINCT target_date AS day FROM airport_passenger_forecast/.test(source),
    false,
    "the A5 picker must not scan all historical forecast dates",
  );
  assert.ok(
    /probeDays\(\s*dayValueExistsSql\("airport_passenger_forecast", "target_date", "direction = 'departure' AND is_aggregate = 1"\)/.test(source),
    "the A5 picker must use bounded exact-day existence probes",
  );
});

/**
 * The nearby-events window used to be `COALESCE(event_end, event_start) >= ?`.
 * A COALESCE over two columns cannot use an index, so this statement always
 * SCANned tourism_events — the Production read-budget diagnostic measured it
 * at 32 rows read over a 16-row table on 2026-09-02, and its hardened form
 * (since PR #89) fails the whole measurement on any unindexed hot-path scan.
 * The rewritten predicate selects exactly the same rows and lets SQLite serve
 * both OR branches from one composite (event_end, event_start) index
 * (migration 0014). Two single-column indexes were tried first: with a bare
 * event_start index the planner walked that whole index in ORDER BY order,
 * which this guard correctly reports as a SCAN.
 */
test("the nearby-events window is served from indexes and selects the same rows the COALESCE form did", (context) => {
  const { db, path } = freshDatabase("events-window");
  context.after(() => { db.close(); rmSync(path); });
  const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((row) => String(row.name)));
  assert.ok(present.has("tourism_events_window_idx"), "tourism_events_window_idx missing");

  const sql = `SELECT area, content_id AS contentId, title, event_start AS eventStart, event_end AS eventEnd
      FROM tourism_events
      WHERE (event_end >= ? OR (event_end IS NULL AND event_start >= ?))
      ORDER BY event_start LIMIT 30`;
  assert.match(route, /WHERE \(event_end >= \? OR \(event_end IS NULL AND event_start >= \?\)\)/, "the route uses the indexable predicate");
  assert.doesNotMatch(route, /COALESCE\(event_end, event_start\)/, "the un-indexable COALESCE form must not return");

  const insert = db.prepare(`INSERT INTO tourism_events (id, source_id, record_origin, area, content_id, title, event_start, event_end, retrieved_at, freshness, schema_version, quality_status, source_hash)
    VALUES (?, 'KTO_TOURAPI_EVENT', 'LIVE', 'myeongdong', ?, ?, ?, ?, '2026-08-31T05:00:00Z', 'LIVE', 'v1', 'VALID', ?)`);
  const rows = [
    ["past-ended", "2026-08-01", "2026-08-20"],
    ["running", "2026-08-20", "2026-09-10"],
    ["ends-today", "2026-08-25", "2026-08-31"],
    ["open-ended-past", "2026-08-10", null],
    ["open-ended-today", "2026-08-31", null],
    ["open-ended-future", "2026-09-05", null],
    ["future", "2026-09-02", "2026-09-03"],
  ];
  rows.forEach(([id, start, end], index) => insert.run(id, `c${index}`, id, start, end, `h${index}`));

  const day = "2026-08-31";
  const expected = db.prepare(`SELECT content_id AS c FROM tourism_events WHERE COALESCE(event_end, event_start) >= ? ORDER BY event_start, content_id`).all(day).map((row) => row.c);
  const actual = db.prepare(`SELECT content_id AS c FROM tourism_events WHERE (event_end >= ? OR (event_end IS NULL AND event_start >= ?)) ORDER BY event_start, content_id`).all(day, day).map((row) => row.c);
  assert.deepEqual(actual, expected, "the rewritten predicate must select exactly the rows the COALESCE form selected");
  assert.equal(actual.length, 5, "past-ended and open-ended-past are excluded; running, ends-today and every open-ended/future row are kept");

  const scans = tableScans(db, sql, [day, day]);
  assert.deepEqual(scans, [], `events window scans a table: ${scans.join(" | ")}`);
});
