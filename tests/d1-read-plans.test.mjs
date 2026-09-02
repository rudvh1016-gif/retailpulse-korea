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
const perKey = (keys, sql) => keys.map(() => `SELECT * FROM (${sql})`).join(" UNION ALL ");
const probe = (table, column, filter) => Array.from({ length: 21 }, () =>
  `SELECT ? AS day WHERE EXISTS (SELECT 1 FROM ${table} WHERE ${filter ? `${filter} AND ` : ""}${column} >= ? AND ${column} < ?)`).join(" UNION ALL ");
const probeBinds = () => Array.from({ length: 21 }, (_, i) => [`2026-08-${10 + i}`, `2026-08-${10 + i}`, `2026-08-${11 + i}`]).flat();

const HOT_QUERIES = {
  "summary.latestRealtime": [perKey(AREAS, "SELECT area, observed_at FROM seoul_realtime_area WHERE area = ? ORDER BY observed_at DESC LIMIT 1"), [...AREAS]],
  "summary.latestForecast": [perKey(AREAS, "SELECT area FROM seoul_realtime_forecast WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM seoul_realtime_forecast WHERE area = ?) AND target_at >= ? ORDER BY target_at LIMIT 40"), AREAS.flatMap((a) => [a, a, "2026-08-31T00:00:00+09:00"])],
  "summary.latestWeather": [perKey(AREAS, "SELECT area FROM weather_forecast WHERE area = ? AND issued_at = (SELECT MAX(issued_at) FROM weather_forecast WHERE area = ?) AND target_at >= ? ORDER BY target_at LIMIT 60"), AREAS.flatMap((a) => [a, a, "2026-08-31T00:00:00+09:00"])],
  "summary.latestSales": [perKey(AREAS, "SELECT area FROM seoul_estimated_sales WHERE area = ? AND quarter_code = (SELECT MAX(quarter_code) FROM seoul_estimated_sales WHERE area = ?) ORDER BY sales_amount DESC"), AREAS.flatMap((a) => [a, a])],
  "summary.latestCongestion": [perKey(["T1", "T2"], "SELECT terminal FROM airport_congestion WHERE terminal = ? AND observed_at = (SELECT MAX(observed_at) FROM airport_congestion WHERE terminal = ?) ORDER BY zone LIMIT 12"), ["T1", "T1", "T2", "T2"]],
  "summary.flightsForDay": ["SELECT physical_flight_id, terminal, gate FROM airport_flights WHERE direction = 'departure' AND scheduled_at >= ? AND scheduled_at < ? LIMIT 2000", ["2026-08-31", "2026-09-01"]],
  "summary.availableFlightDates": [probe("airport_flights", "scheduled_at", "direction = 'departure'"), probeBinds()],
  "summary.availableRealtimeDates": [probe("seoul_realtime_area", "observed_at", ""), probeBinds()],
};

test("no hot read-path query scans a growing table", (context) => {
  const { db, path } = freshDatabase("hot");
  context.after(() => { db.close(); rmSync(path); });
  for (const [label, [sql, binds]] of Object.entries(HOT_QUERIES)) {
    const scans = tableScans(db, sql, binds);
    assert.deepEqual(scans, [], `${label} scans a table: ${scans.join(" | ")}`);
  }
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
    "seoul_realtime_forecast_area_issue_idx", "weather_forecast_area_issue_idx",
    "seoul_estimated_sales_area_quarter_idx", "airport_congestion_terminal_observed_idx",
    "airport_flights_direction_scheduled_idx", "weather_forecast_issued_area_idx",
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

/**
 * The Production read-budget measurement must measure the query the site
 * actually runs.
 *
 * scripts/measure-production-read-budget.ts replays the hot path against
 * Production D1 and reports each statement's real rows_read. That evidence is
 * only worth anything while its SQL matches the live route, so every measured
 * statement carries a `guard` fragment that has to appear verbatim in
 * app/api/live/summary/route.ts. This test enforces the same contract in CI,
 * so a route change that leaves the diagnostic behind fails here rather than
 * producing a confident measurement of a query nobody serves.
 */
test("every measured hot-path statement still exists in the live route", () => {
  const measureSource = readFileSync("scripts/measure-production-read-budget.ts", "utf8");
  const routeText = readFileSync("app/api/live/summary/route.ts", "utf8");
  const guards = [...measureSource.matchAll(/^ {4}guard: (`[^`]*`|"(?:[^"\\]|\\.)*"),$/gm)]
    .map((match) => (match[1].startsWith("`") ? match[1].slice(1, -1) : JSON.parse(match[1])));
  assert.equal(guards.length, 14, "expected one guard per measured statement");
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
    /client\.batch<Row>\(\s*pickerDays\.map\(/.test(source),
    "the per-day probes must be sent through client.batch, not one statement at a time",
  );
});
