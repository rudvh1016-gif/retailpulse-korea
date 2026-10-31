/**
 * Read-only D1 usage diagnostic: which database, and which statements, spend
 * the daily rows_read / rows_written allowance.
 *
 * The 2026-10-14 owner instruction asks for the biggest consumers to be
 * reduced first, measured as real rows_read / rows_written — not as fewer
 * returned rows or fewer requests. Every figure printed here says where it
 * came from:
 *
 *   OFFICIAL_ANALYTICS    Cloudflare's GraphQL analytics for the account
 *                         (needs a token with Account Analytics Read)
 *   MEASURED_LOWER_BOUND  the collectors' own recorded D1 usage
 *                         (operational_usage_daily); excludes site reads
 *   UNAVAILABLE           not readable from here; the reason is given
 *
 * Safety properties, all load-bearing:
 *   - D1 sees one bounded primary-key range SELECT on the collectors' ledger
 *     and one uncached replay of each airport read API (the routes' own
 *     exported readers, SELECT only), plus a single before/after pair of the
 *     96-row single-day forecast read. Nothing writes or retries, and no data
 *     provider is called.
 *   - Analytics calls read Cloudflare's own counters; they do not touch D1.
 *   - No secret is printed. Tokens are named only by their variable names,
 *     errors are reduced to safe characters, and statement text is the SQL
 *     Cloudflare recorded (placeholders, not bound values).
 *   - Manual dispatch only (measure-read-budget.yml, scope "usage").
 */
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { kstDayOf, shiftKstDay } from "../lib/kst";
import { readFlightsForDate } from "../app/api/live/flights/route";
import { readAirportDays } from "../app/api/live/airport-days/route";
import { readAirportMonths } from "../app/api/live/airport-months/route";
import { resolveProductionDatabaseConfig } from "./production-database";
import { AIRPORT_SQL } from "../lib/today-answer";

const API = "https://api.cloudflare.com/client/v4";
const FREE_DAILY_ROWS_READ = 5_000_000;
const FREE_DAILY_ROWS_WRITTEN = 100_000;
const DAYS = Number(process.env.RPK_USAGE_DAYS ?? 7);
if (!Number.isInteger(DAYS) || DAYS < 1 || DAYS > 30) throw new Error("invalid_usage_days");

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const tokens = (["CLOUDFLARE_D1_WRITE_TOKEN", "CLOUDFLARE_API_TOKEN"] as const)
  .map((name) => ({ name, value: process.env[name]?.trim() ?? "" }))
  .filter((token) => token.value);

const now = new Date();
const todayUtc = now.toISOString().slice(0, 10);
const utcDaysAgo = (count: number) => new Date(Date.parse(`${todayUtc}T00:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 160);
}

function at(value: unknown, ...path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

async function cloudflareJson(path: string, token: string, init?: RequestInit): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, reason: `http_${response.status}_${safeError(at(body, "errors", 0, "message") ?? "")}` };
    if (at(body, "success") === false) return { ok: false, reason: `api_error_${safeError(at(body, "errors", 0, "message") ?? "unknown")}` };
    return { ok: true, body };
  } catch (error) {
    return { ok: false, reason: safeError(error) };
  }
}

type GraphResult = { ok: true; token: string; groups: unknown[] } | { ok: false; reasons: string[] };

/** Tries each available token in turn; reports which one Cloudflare accepted. */
async function graphql(query: string, variables: Record<string, string>): Promise<GraphResult> {
  const reasons: string[] = [];
  for (const token of tokens) {
    const response = await cloudflareJson("/graphql", token.value, { method: "POST", body: JSON.stringify({ query, variables }) });
    if (!response.ok) { reasons.push(`${token.name}:${response.reason}`); continue; }
    const failures = at(response.body, "errors");
    if (Array.isArray(failures) && failures.length) { reasons.push(`${token.name}:graphql_${safeError(at(failures, 0, "message") ?? "error")}`); continue; }
    const account = at(response.body, "data", "viewer", "accounts", 0);
    const groups = account && typeof account === "object" ? Object.values(account)[0] : null;
    if (Array.isArray(groups)) return { ok: true, token: token.name, groups };
    reasons.push(`${token.name}:graphql_unexpected_shape`);
  }
  return { ok: false, reasons: reasons.length ? reasons : ["no_token_available"] };
}

const report: Record<string, unknown> = { generatedAt: now.toISOString(), windowDays: DAYS, tokensTried: tokens.map((t) => t.name) };
const print = (label: string, value: unknown) => console.log(`${label} ${JSON.stringify(value)}`);

// 1 — database names, so per-database figures say which database they are.
const names = new Map<string, string>();
for (const token of tokens) {
  const listed = await cloudflareJson(`/accounts/${encodeURIComponent(accountId)}/d1/database?per_page=100`, token.value);
  if (!listed.ok) continue;
  const entries = at(listed.body, "result");
  for (const entry of Array.isArray(entries) ? entries : []) {
    const id = String(at(entry, "uuid") ?? "");
    if (id) names.set(id, `${String(at(entry, "name") ?? "unnamed")} (${id.slice(0, 8)}${id === databaseId ? ", production binding" : ""})`);
  }
  break;
}
const label = (id: string) => names.get(id) ?? `${id.slice(0, 8)}${id === databaseId ? " (production binding)" : ""}`;

// 2 — official daily usage per database.
const daily = await graphql(`query ($accountTag: string!, $start: Date!, $end: Date!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1AnalyticsAdaptiveGroups(limit: 1000, filter: { date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
      sum { readQueries writeQueries rowsRead rowsWritten }
      dimensions { date databaseId }
    }
  } }
}`, { accountTag: accountId, start: utcDaysAgo(DAYS), end: todayUtc });
if (daily.ok) {
  const rows = daily.groups.map((group) => ({
    date: String(at(group, "dimensions", "date") ?? ""),
    database: label(String(at(group, "dimensions", "databaseId") ?? "")),
    rowsRead: num(at(group, "sum", "rowsRead")),
    rowsWritten: num(at(group, "sum", "rowsWritten")),
    readQueries: num(at(group, "sum", "readQueries")),
    writeQueries: num(at(group, "sum", "writeQueries")),
  }));
  const perDay = new Map<string, { rowsRead: number; rowsWritten: number }>();
  for (const row of rows) {
    const day = perDay.get(row.date) ?? { rowsRead: 0, rowsWritten: 0 };
    day.rowsRead += row.rowsRead ?? 0;
    day.rowsWritten += row.rowsWritten ?? 0;
    perDay.set(row.date, day);
  }
  report.daily = { basis: "OFFICIAL_ANALYTICS", token: daily.token, rows };
  console.log(`\nOFFICIAL_ANALYTICS daily D1 usage (UTC days; free allowance resets 00:00 UTC; token ${daily.token})`);
  for (const row of rows) {
    const read = row.rowsRead ?? 0;
    console.log(`  ${row.date}  ${row.database.padEnd(48)} rowsRead ${String(row.rowsRead).padStart(11)} (${(100 * read / FREE_DAILY_ROWS_READ).toFixed(1)}% of 5M)  rowsWritten ${String(row.rowsWritten).padStart(9)} (${(100 * (row.rowsWritten ?? 0) / FREE_DAILY_ROWS_WRITTEN).toFixed(1)}% of 100k)  readQueries ${row.readQueries}  writeQueries ${row.writeQueries}`);
  }
  console.log("  account total per day:");
  for (const [date, day] of perDay) console.log(`    ${date} rowsRead ${day.rowsRead} (${(100 * day.rowsRead / FREE_DAILY_ROWS_READ).toFixed(1)}%)  rowsWritten ${day.rowsWritten} (${(100 * day.rowsWritten / FREE_DAILY_ROWS_WRITTEN).toFixed(1)}%)`);
} else {
  report.daily = { basis: "UNAVAILABLE", reasons: daily.reasons };
  console.log(`\nUNAVAILABLE daily D1 usage: ${daily.reasons.join(" | ")}`);
}

// 2b — the same hours on consecutive UTC days, so a deploy is compared with
// the hours before it at equal length, not a partial day with a whole one.
const HOURLY_DAYS = 3;
const hourlyStart = `${utcDaysAgo(HOURLY_DAYS)}T00:00:00Z`;
const hourlyEnd = now.toISOString();
const d1Hours = await graphql(`query ($accountTag: string!, $start: Time!, $end: Time!, $databaseId: string!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1AnalyticsAdaptiveGroups(limit: 200, filter: { datetimeHour_geq: $start, datetimeHour_leq: $end, databaseId: $databaseId }, orderBy: [datetimeHour_ASC]) {
      sum { rowsRead rowsWritten readQueries writeQueries }
      dimensions { datetimeHour }
    }
  } }
}`, { accountTag: accountId, start: hourlyStart, end: hourlyEnd, databaseId });
const workerHours = await graphql(`query ($accountTag: string!, $start: Time!, $end: Time!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    workersInvocationsAdaptive(limit: 1000, filter: { datetimeHour_geq: $start, datetimeHour_leq: $end }, orderBy: [datetimeHour_ASC]) {
      sum { requests }
      dimensions { datetimeHour scriptName }
    }
  } }
}`, { accountTag: accountId, start: hourlyStart, end: hourlyEnd });
if (d1Hours.ok) {
  const hours = new Map<string, { rowsRead: number; rowsWritten: number; readQueries: number; requests: number | null }>();
  for (const group of d1Hours.groups) {
    const hour = String(at(group, "dimensions", "datetimeHour") ?? "").slice(0, 13);
    hours.set(hour, { rowsRead: num(at(group, "sum", "rowsRead")) ?? 0, rowsWritten: num(at(group, "sum", "rowsWritten")) ?? 0,
      readQueries: num(at(group, "sum", "readQueries")) ?? 0, requests: null });
  }
  if (workerHours.ok) for (const group of workerHours.groups) {
    const hour = String(at(group, "dimensions", "datetimeHour") ?? "").slice(0, 13);
    const entry = hours.get(hour) ?? { rowsRead: 0, rowsWritten: 0, readQueries: 0, requests: null };
    entry.requests = (entry.requests ?? 0) + (num(at(group, "sum", "requests")) ?? 0);
    hours.set(hour, entry);
  }
  // Only whole hours: the running hour is still filling.
  const lastWholeHour = now.getUTCHours();
  const sameWindow = Array.from({ length: HOURLY_DAYS + 1 }, (_, back) => {
    const day = utcDaysAgo(back);
    const totals = { day, hours: `00-${String(lastWholeHour).padStart(2, "0")} UTC`, rowsRead: 0, rowsWritten: 0, readQueries: 0, requests: 0, hoursSeen: 0 };
    for (let hour = 0; hour < lastWholeHour; hour += 1) {
      const entry = hours.get(`${day}T${String(hour).padStart(2, "0")}`);
      if (!entry) continue;
      totals.hoursSeen += 1; totals.rowsRead += entry.rowsRead; totals.rowsWritten += entry.rowsWritten;
      totals.readQueries += entry.readQueries; totals.requests += entry.requests ?? 0;
    }
    return totals;
  });
  report.hourly = { basis: "OFFICIAL_ANALYTICS", token: d1Hours.token, workerToken: workerHours.ok ? workerHours.token : null,
    hours: [...hours].map(([hour, entry]) => ({ hour, ...entry })), sameWindow };
  console.log(`\nOFFICIAL_ANALYTICS same UTC hours on each day (whole hours only; token ${d1Hours.token})`);
  for (const row of sameWindow) console.log(`  ${row.day} ${row.hours} rowsRead ${row.rowsRead} readQueries ${row.readQueries} rowsWritten ${row.rowsWritten} workerRequests ${workerHours.ok ? row.requests : "UNAVAILABLE"} hoursSeen ${row.hoursSeen}`);
  console.log("  hourly (UTC):");
  for (const [hour, entry] of hours) console.log(`    ${hour} rowsRead ${entry.rowsRead} readQueries ${entry.readQueries} workerRequests ${entry.requests ?? "n/a"}`);
} else {
  report.hourly = { basis: "UNAVAILABLE", reasons: d1Hours.reasons };
  console.log(`\nUNAVAILABLE hourly D1 usage: ${d1Hours.reasons.join(" | ")}`);
}

// 3 — official per-statement totals for the production database.
async function topStatements(order: "sum_rowsRead_DESC" | "sum_rowsWritten_DESC", startDay: string, endDay: string) {
  const hourly = await graphql(`query ($accountTag: string!, $start: Time!, $end: Time!, $databaseId: string!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1QueriesAdaptiveGroups(limit: 40, filter: { datetimeHour_geq: $start, datetimeHour_leq: $end, databaseId: $databaseId }, orderBy: [${order}]) {
      count
      sum { rowsRead rowsWritten rowsReturned queryDurationMs }
      dimensions { query }
    }
  } }
}`, { accountTag: accountId, start: `${startDay}T00:00:00Z`, end: `${endDay}T23:59:59Z`, databaseId });
  if (hourly.ok) return hourly;
  const byDate = await graphql(`query ($accountTag: string!, $start: Date!, $end: Date!, $databaseId: string!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1QueriesAdaptiveGroups(limit: 40, filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }, orderBy: [${order}]) {
      count
      sum { rowsRead rowsWritten rowsReturned queryDurationMs }
      dimensions { query }
    }
  } }
}`, { accountTag: accountId, start: startDay, end: endDay, databaseId });
  return byDate.ok ? byDate : { ok: false as const, reasons: [...hourly.reasons, ...byDate.reasons] };
}

const statementWindows: Array<{ name: string; start: string; end: string }> = [
  { name: "yesterday_utc", start: utcDaysAgo(1), end: utcDaysAgo(1) },
  { name: "today_utc_partial", start: todayUtc, end: todayUtc },
  { name: `last_${DAYS}_days`, start: utcDaysAgo(DAYS), end: todayUtc },
];
const statements: Record<string, unknown> = {};
for (const window of statementWindows) {
  for (const order of ["sum_rowsRead_DESC", "sum_rowsWritten_DESC"] as const) {
    const result = await topStatements(order, window.start, window.end);
    const key = `${window.name}:${order}`;
    if (!result.ok) {
      statements[key] = { basis: "UNAVAILABLE", reasons: result.reasons };
      console.log(`\nUNAVAILABLE statements ${key}: ${result.reasons.join(" | ")}`);
      continue;
    }
    const rows = result.groups.map((group) => ({
      calls: num(at(group, "count")),
      rowsRead: num(at(group, "sum", "rowsRead")),
      rowsWritten: num(at(group, "sum", "rowsWritten")),
      rowsReturned: num(at(group, "sum", "rowsReturned")),
      durationMs: num(at(group, "sum", "queryDurationMs")),
      sql: String(at(group, "dimensions", "query") ?? "").replace(/\s+/g, " ").trim().slice(0, 600),
    }));
    statements[key] = { basis: "OFFICIAL_ANALYTICS", token: result.token, window, rows };
    const total = rows.reduce((sum, row) => sum + ((order === "sum_rowsRead_DESC" ? row.rowsRead : row.rowsWritten) ?? 0), 0);
    console.log(`\nOFFICIAL_ANALYTICS top statements ${key} (${window.start}..${window.end} UTC, production DB, listed total ${total})`);
    rows.forEach((row, index) => console.log(`  #${index + 1} calls ${row.calls}  rowsRead ${row.rowsRead}  rowsWritten ${row.rowsWritten}  returned ${row.rowsReturned}  perCallRead ${row.calls ? Math.round((row.rowsRead ?? 0) / row.calls) : "n/a"}\n      ${row.sql}`));
  }
}
report.statements = statements;

// 4 — official Worker request counts (how many requests could reach D1).
const invocations = await graphql(`query ($accountTag: string!, $start: Date!, $end: Date!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
      sum { requests subrequests errors }
      dimensions { date scriptName }
    }
  } }
}`, { accountTag: accountId, start: utcDaysAgo(DAYS), end: todayUtc });
if (invocations.ok) {
  const rows = invocations.groups.map((group) => ({
    date: String(at(group, "dimensions", "date") ?? ""),
    script: String(at(group, "dimensions", "scriptName") ?? ""),
    requests: num(at(group, "sum", "requests")),
    subrequests: num(at(group, "sum", "subrequests")),
    errors: num(at(group, "sum", "errors")),
  }));
  report.workers = { basis: "OFFICIAL_ANALYTICS", token: invocations.token, rows };
  console.log(`\nOFFICIAL_ANALYTICS Worker invocations (token ${invocations.token})`);
  for (const row of rows) console.log(`  ${row.date} ${row.script.padEnd(32)} requests ${row.requests} subrequests ${row.subrequests} errors ${row.errors}`);
} else {
  report.workers = { basis: "UNAVAILABLE", reasons: invocations.reasons };
  console.log(`\nUNAVAILABLE Worker invocations: ${invocations.reasons.join(" | ")}`);
}

// 5 — the collectors' own record (a lower bound: site reads are not in it).
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
try {
  const since = utcDaysAgo(DAYS);
  const result = await database.prepare(
    "SELECT day, source_id AS sourceId, executions, rows_read AS rowsRead, rows_written AS rowsWritten, d1_measured AS measured FROM operational_usage_daily WHERE day >= ? ORDER BY day, source_id",
  ).bind(since).all<Record<string, unknown>>();
  const rows = result.results.map((row) => ({
    day: String(row.day), sourceId: String(row.sourceId), executions: num(row.executions),
    rowsRead: num(row.rowsRead), rowsWritten: num(row.rowsWritten), measured: num(row.measured),
  }));
  report.collectors = { basis: "MEASURED_LOWER_BOUND", diagnosticRowsRead: num(result.meta?.rows_read), rows };
  console.log(`\nMEASURED_LOWER_BOUND collector D1 usage since ${since} (operational_usage_daily; site reads excluded; this read cost ${result.meta?.rows_read} rows)`);
  const perDay = new Map<string, { read: number; written: number }>();
  for (const row of rows) {
    const day = perDay.get(row.day) ?? { read: 0, written: 0 };
    day.read += row.rowsRead ?? 0;
    day.written += row.rowsWritten ?? 0;
    perDay.set(row.day, day);
  }
  for (const [day, totals] of perDay) {
    console.log(`  ${day} collectors rowsRead ${totals.read} rowsWritten ${totals.written}`);
    for (const row of rows.filter((entry) => entry.day === day).sort((a, b) => (b.rowsRead ?? 0) - (a.rowsRead ?? 0)).slice(0, 8)) {
      console.log(`      ${row.sourceId.padEnd(36)} runs ${String(row.executions).padStart(4)} rowsRead ${String(row.rowsRead).padStart(10)} rowsWritten ${String(row.rowsWritten).padStart(8)} measuredRuns ${row.measured}`);
    }
  }
} catch (error) {
  report.collectors = { basis: "UNAVAILABLE", reason: safeError(error) };
  console.log(`\nUNAVAILABLE collector usage: ${safeError(error)}`);
}

// 6 — what ONE uncached call of each airport read API costs, measured by the
// meta Cloudflare attaches to each statement (OFFICIAL_QUERY_META). The routes'
// own exported readers run, so this measures exactly what a visitor triggers.
function countingClient(source: CloudflareD1RestDatabase) {
  const totals = { statements: 0, rowsRead: 0, rowsWritten: 0, unmeasured: 0 };
  const wrap = (statement: ReturnType<CloudflareD1RestDatabase["prepare"]>) => {
    const wrapped = {
      bind(...values: unknown[]) { statement.bind(...values); return wrapped; },
      async all<T = Record<string, unknown>>() {
        const result = await statement.all<T>();
        totals.statements++;
        const read = num(result.meta?.rows_read);
        if (read === null) totals.unmeasured++;
        totals.rowsRead += read ?? 0;
        totals.rowsWritten += num(result.meta?.rows_written) ?? 0;
        return result;
      },
      async first<T = Record<string, unknown>>() { const { results } = await wrapped.all<T>(); return results[0] ?? null; },
    };
    return wrapped;
  };
  return { totals, client: { prepare: (sql: string) => wrap(source.prepare(sql)) } as unknown as Pick<D1Database, "prepare"> };
}
const todayKst = kstDayOf(now.toISOString());
const routeCosts: Array<Record<string, unknown>> = [];
for (const [name, run] of [
  ["/api/live/flights?date=today", (client: Pick<D1Database, "prepare">) => readFlightsForDate(client, todayKst, todayKst).then((r) => ({ flights: r.flights.length, dataBasis: r.basis }))],
  ["/api/live/flights?date=yesterday", (client: Pick<D1Database, "prepare">) => readFlightsForDate(client, shiftKstDay(todayKst, -1), todayKst).then((r) => ({ flights: r.flights.length, dataBasis: r.basis }))],
  ["/api/live/airport-days?date=today", (client: Pick<D1Database, "prepare">) => readAirportDays(client, todayKst).then((r) => ({ rowsReturned: r.rowsRead }))],
  ["/api/live/airport-months?month=this", (client: Pick<D1Database, "prepare">) => readAirportMonths(client, todayKst.slice(0, 7), todayKst).then((r) => ({ status: r.status, rowsReturned: r.rowsRead }))],
] as const) {
  const { totals, client } = countingClient(database);
  try {
    const shape = await run(client);
    routeCosts.push({ route: name, basis: "OFFICIAL_QUERY_META", ...totals, ...shape });
  } catch (error) {
    routeCosts.push({ route: name, basis: "UNAVAILABLE", reason: safeError(error), ...totals });
  }
}
report.routeCosts = routeCosts;
// One bounded before/after pair for the existing single-day aggregate seek.
// No schema mutation, collection, or retries. An intervening collector change
// makes equality inconclusive rather than justifying repeated diagnostic reads.
try {
  const baselineSql = AIRPORT_SQL.replace(' INDEXED BY airport_passenger_forecast_month_idx', '');
  const before = await database.prepare(baselineSql).bind(todayKst).all();
  const after = await database.prepare(AIRPORT_SQL).bind(todayKst).all();
  if (!before.success || !after.success) throw new Error('forecast_comparison_read_failed');
  const normalized = (rows: unknown[]) => JSON.stringify(rows.map(row => JSON.stringify(row)).sort());
  report.forecastSeekComparison = {
    basis: 'OFFICIAL_QUERY_META', day: todayKst,
    equivalentRows: normalized(before.results) === normalized(after.results),
    before: { rowsRead: num(before.meta?.rows_read), rowsWritten: num(before.meta?.rows_written), returned: before.results.length },
    after: { rowsRead: num(after.meta?.rows_read), rowsWritten: num(after.meta?.rows_written), returned: after.results.length },
    caveat: 'Sequential SELECTs; differing rows mean inconclusive, not a correctness pass.',
  };
} catch (error) {
  report.forecastSeekComparison = { basis: 'UNAVAILABLE', reason: safeError(error) };
}
console.log("\nOFFICIAL_QUERY_META cost of one uncached call (the route's own reader)");
for (const row of routeCosts) console.log(`  ${String(row.route).padEnd(40)} statements ${row.statements} rowsRead ${row.rowsRead} rowsWritten ${row.rowsWritten} ${JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => !["route", "basis", "statements", "rowsRead", "rowsWritten", "unmeasured"].includes(key))))}`);

print("\nD1_USAGE_REPORT", report);
