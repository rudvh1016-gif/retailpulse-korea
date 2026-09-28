/**
 * Read-only Production D1 storage measurement (docs/STORAGE_RETENTION.md).
 *
 * Answers the storage questions with numbers that each say where they came
 * from, because "the database is fine" is not a measurement:
 *
 *   - how big the database and the account are now (Cloudflare's figures),
 *   - how many rows each table adds per complete KST day (counted by index),
 *   - how long until 70/85/95% of the planning limit at that pace (estimate),
 *   - what a 56- or 90-day retention would remove and what it would break
 *     (a dry-run: nothing is deleted, here or anywhere else).
 *
 * Every figure carries a basis:
 *   OFFICIAL_ACCOUNT_API  Cloudflare's database/account REST API
 *   OFFICIAL_ANALYTICS    Cloudflare's GraphQL analytics (needs Account Analytics Read)
 *   OFFICIAL_QUERY_META   meta Cloudflare attaches to a query result (size_after)
 *   MEASURED              counted by this run through an index
 *   MEASURED_UPPER_BOUND  a rowid span (deleted rows leave gaps, never extra rows)
 *   MEASURED_LOWER_BOUND  the collectors' own recorded D1 usage (excludes the site's reads)
 *   INTERNAL_ESTIMATE     derived from the above by the stated formula
 *   UNAVAILABLE           not readable from here; the reason is given
 *
 * Safety properties, all load-bearing:
 *   - Only SELECT, EXPLAIN QUERY PLAN and PRAGMA table_info reach D1. Nothing
 *     writes and no data provider is called.
 *   - Every indexed statement's plan is checked before it runs; a statement
 *     that would walk a whole table is reported and skipped, never executed.
 *   - Rows read are tracked against RPK_READ_BUDGET_CEILING (default 100,000)
 *     and the run stops at the ceiling instead of finishing expensively.
 *   - No secret is printed. The account-wide listing reports a count and a
 *     byte total only, never another database's name or id. Personal data
 *     (beta_signups) is counted by rowid and never read.
 *   - It runs only on manual dispatch (measure-read-budget.yml, scope
 *     "storage"). There is no schedule, by the owner's instruction.
 */
import { CloudflareD1RestDatabase } from "../lib/d1-rest";
import { kstDayOf } from "../lib/kst";
import {
  BYTE_SAMPLE_ROWS,
  D1_FREE_PLANNING_LIMITS,
  STORAGE_TABLES,
  allocateBytes,
  byteSampleStatement,
  completeKstDays,
  countOf,
  cutoffValue,
  dailyCountStatements,
  identifier,
  isSystemTable,
  planIsBounded,
  projectStorage,
  retentionBoundaryStatements,
  retentionDryRun,
  rowidBoundsStatement,
  steadyDailyRows,
  timeBoundsStatements,
  type DailyGrowth,
  type Statement,
  type TableInventory,
} from "../lib/storage-inventory";
import { resolveProductionDatabaseConfig } from "./production-database";

const CEILING = Number(process.env.RPK_READ_BUDGET_CEILING ?? 100_000);
if (!Number.isFinite(CEILING) || CEILING <= 0) throw new Error("invalid_read_budget_ceiling");
const DAYS = Number(process.env.RPK_STORAGE_DAYS ?? 3);
if (!Number.isInteger(DAYS) || DAYS < 2 || DAYS > 7) throw new Error("invalid_storage_days");
const RETENTION_CUTOFFS = [56, 90] as const;
/** Cloudflare's D1 Free daily allowances, as recorded in docs/ENGINEERING_DIRECTION.md. */
const FREE_DAILY_ROWS_READ = 5_000_000;
const FREE_DAILY_ROWS_WRITTEN = 100_000;
const API = "https://api.cloudflare.com/client/v4";

const { accountId, databaseId, apiToken } = resolveProductionDatabaseConfig("production");
const database = new CloudflareD1RestDatabase(accountId, databaseId, apiToken);
const generatedAt = new Date().toISOString();
const todayKst = kstDayOf(generatedAt);
const days = completeKstDays(todayKst, DAYS);
const todayUtc = generatedAt.slice(0, 10);
const utcDaysAgo = (count: number) => new Date(Date.parse(`${todayUtc}T00:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);

let rowsRead = 0;
let stoppedAtCeiling = false;
const errors: Array<{ step: string; table?: string; error: string }> = [];
const scanRefusals: Array<{ step: string; table: string; plan: string[] }> = [];

/** Error text reduced to characters that cannot carry a token or a SQL value. */
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[^A-Za-z0-9_.:-]+/g, "_").slice(0, 120);
}

type Row = Record<string, unknown>;

async function read(statement: Statement, step: string, table?: string): Promise<Row[] | null> {
  if (rowsRead >= CEILING) {
    stoppedAtCeiling = true;
    return null;
  }
  try {
    const result = await database.prepare(statement.sql).bind(...statement.binds).all<Row>();
    const spent = countOf(result.meta?.rows_read);
    if (spent === null) throw new Error("invalid_rows_read_metadata");
    rowsRead += spent;
    if (rowsRead > CEILING) stoppedAtCeiling = true;
    return result.results;
  } catch (error) {
    errors.push({ step, table, error: safeError(error) });
    return null;
  }
}

/** Runs a statement only after EXPLAIN proves it never walks `table` whole. */
async function readBounded(statement: Statement, step: string, table: string): Promise<Row[] | null> {
  const plan = await read({ sql: `EXPLAIN QUERY PLAN ${statement.sql}`, binds: statement.binds }, `${step}.plan`, table);
  if (!plan) return null;
  const lines = plan.map((row) => String(row.detail ?? ""));
  if (!planIsBounded(lines, table)) {
    scanRefusals.push({ step, table, plan: lines });
    return null;
  }
  return read(statement, step, table);
}

type Official<T> = ({ basis: "OFFICIAL_ACCOUNT_API" } & T) | { basis: "UNAVAILABLE"; reason: string };

/** Walks untyped JSON without trusting its shape. */
function at(value: unknown, ...path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

async function cloudflareJson(path: string, init?: RequestInit): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  try {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const body: unknown = await response.json();
    if (at(body, "success") === false) return { ok: false, reason: `api_error_${Number(at(body, "errors", 0, "code")) || "unknown"}` };
    return { ok: true, body };
  } catch (error) {
    return { ok: false, reason: safeError(error) };
  }
}

async function graphql(query: string, variables: Record<string, string>): Promise<{ ok: true; groups: unknown[] } | { ok: false; reason: string }> {
  const response = await cloudflareJson("/graphql", { method: "POST", body: JSON.stringify({ query, variables }) });
  if (!response.ok) return response;
  const failures = at(response.body, "errors");
  if (Array.isArray(failures) && failures.length) {
    return { ok: false, reason: `graphql_${safeError(at(failures, 0, "message") ?? "error")}` };
  }
  const account = at(response.body, "data", "viewer", "accounts", 0);
  const groups = account && typeof account === "object" ? Object.values(account)[0] : null;
  return Array.isArray(groups) ? { ok: true, groups } : { ok: false, reason: "graphql_unexpected_shape" };
}

// 1 — Cloudflare's own figures for this database and the account.
const databaseInfo = await cloudflareJson(`/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}`);
const officialDatabase: Official<{ fileSizeBytes: number | null; numTables: number | null; createdAt: string | null }> = databaseInfo.ok
  ? {
    basis: "OFFICIAL_ACCOUNT_API",
    fileSizeBytes: countOf(at(databaseInfo.body, "result", "file_size")),
    numTables: countOf(at(databaseInfo.body, "result", "num_tables")),
    createdAt: typeof at(databaseInfo.body, "result", "created_at") === "string" ? String(at(databaseInfo.body, "result", "created_at")) : null,
  }
  : { basis: "UNAVAILABLE", reason: databaseInfo.reason };

const accountList = await cloudflareJson(`/accounts/${encodeURIComponent(accountId)}/d1/database?per_page=100`);
const accountDatabases: Official<{ databases: number; totalFileSizeBytes: number | null; withoutSize: number }> = (() => {
  if (!accountList.ok) return { basis: "UNAVAILABLE", reason: accountList.reason } as const;
  const listed = at(accountList.body, "result");
  const entries: unknown[] = Array.isArray(listed) ? listed : [];
  const sizes = entries.map((entry) => countOf(at(entry, "file_size")));
  const withoutSize = sizes.filter((size) => size === null).length;
  return {
    basis: "OFFICIAL_ACCOUNT_API",
    databases: entries.length,
    totalFileSizeBytes: withoutSize ? null : sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0),
    withoutSize,
  };
})();

const sizeProbe = await database.prepare("SELECT 1 AS ok").all().catch((error: unknown) => {
  errors.push({ step: "size_after", error: safeError(error) });
  return null;
});
rowsRead += countOf(sizeProbe?.meta?.rows_read) ?? 0;
const sizeAfterBytes = countOf(sizeProbe?.meta?.size_after);

const analyticsWindow = { start: utcDaysAgo(13), end: todayUtc };
const usageQuery = (filter: string) => `query ($accountTag: string!, $start: Date!, $end: Date!${filter ? ", $databaseId: string!" : ""}) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $start, date_leq: $end${filter} }, orderBy: [date_ASC]) {
      sum { readQueries writeQueries rowsRead rowsWritten }
      dimensions { date }
    }
  } }
}`;
const storageQuery = `query ($accountTag: string!, $start: Date!, $end: Date!, $databaseId: string!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }, orderBy: [date_ASC]) {
      max { databaseSizeBytes }
      dimensions { date }
    }
  } }
}`;
const variables = { accountTag: accountId, ...analyticsWindow };
const usageRows = (result: Awaited<ReturnType<typeof graphql>>) => result.ok
  ? { basis: "OFFICIAL_ANALYTICS", window: analyticsWindow, days: result.groups.map((group) => ({
    date: String(at(group, "dimensions", "date") ?? ""),
    rowsRead: countOf(at(group, "sum", "rowsRead")),
    rowsWritten: countOf(at(group, "sum", "rowsWritten")),
    readQueries: countOf(at(group, "sum", "readQueries")),
    writeQueries: countOf(at(group, "sum", "writeQueries")),
  })) }
  : { basis: "UNAVAILABLE", reason: result.reason };
const databaseUsage = usageRows(await graphql(usageQuery(", databaseId: $databaseId"), { ...variables, databaseId }));
const accountUsage = usageRows(await graphql(usageQuery(""), variables));
const storageHistoryResult = await graphql(storageQuery, { ...variables, databaseId });
const storageHistory = storageHistoryResult.ok
  ? { basis: "OFFICIAL_ANALYTICS", window: analyticsWindow, days: storageHistoryResult.groups.map((group) => ({
    date: String(at(group, "dimensions", "date") ?? ""),
    databaseSizeBytes: countOf(at(group, "max", "databaseSizeBytes")),
  })) }
  : { basis: "UNAVAILABLE", reason: storageHistoryResult.reason };

// 2 — the schema as Production actually has it.
const master = await read({ sql: "SELECT type, name, tbl_name AS tableName FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY type, name", binds: [] }, "schema") ?? [];
const presentTables = master.filter((row) => row.type === "table").map((row) => String(row.name)).filter((name) => !isSystemTable(name));
const indexCount = new Map<string, number>();
for (const row of master.filter((entry) => entry.type === "index")) {
  const table = String(row.tableName);
  indexCount.set(table, (indexCount.get(table) ?? 0) + 1);
}
const inventory = new Map(STORAGE_TABLES.map((entry) => [entry.table, entry]));
const unclassifiedTables = presentTables.filter((name) => !inventory.has(name));
const missingTables = STORAGE_TABLES.map((entry) => entry.table).filter((name) => !presentTables.includes(name));

// 3 — per table: rowid span, insert dates, sampled bytes, daily counts, time bounds.
type TableReport = {
  table: string;
  recordClass: string;
  retentionDays: number | null;
  prunedBy: string | null;
  readWindowDays: number | null;
  readers: string;
  indexes: number;
  rows: { basis: "MEASURED_UPPER_BOUND"; value: number | null; lowestRowid: number | null; highestRowid: number | null };
  firstInsertedAt: string | null;
  lastInsertedAt: string | null;
  sampleBytes: { basis: string; sampled: number | null; averageValueBytes: number | null };
  daily: { basis: "MEASURED"; byDay: Array<{ day: string; rows: number | null; byKey: Record<string, number | null> }> } | null;
  /** Rows per key from 00:00 KST today until the run, for keys that started today. */
  todaySoFar: Record<string, number | null> | null;
  oldest: string | null;
  newest: string | null;
  boundariesByCutoff: Record<number, Array<number | null>>;
};

const reports: TableReport[] = [];
for (const name of presentTables) {
  const entry: TableInventory = inventory.get(name) ?? {
    table: name, recordClass: "G_REBUILDABLE", retentionDays: null, prunedBy: null, readWindowDays: null, readers: "UNCLASSIFIED",
  };
  const table = identifier(name);
  const bounds = (await readBounded(rowidBoundsStatement(entry), "rowid_bounds", table))?.[0] ?? null;
  const lowestRowid = countOf(bounds?.lo);
  const highestRowid = countOf(bounds?.hi);
  const report: TableReport = {
    table,
    recordClass: inventory.has(name) ? entry.recordClass : "UNCLASSIFIED",
    retentionDays: entry.retentionDays,
    prunedBy: entry.prunedBy,
    readWindowDays: entry.readWindowDays,
    readers: entry.readers,
    indexes: indexCount.get(name) ?? 0,
    rows: {
      basis: "MEASURED_UPPER_BOUND",
      value: bounds === null ? null : lowestRowid === null || highestRowid === null ? 0 : highestRowid - lowestRowid + 1,
      lowestRowid,
      highestRowid,
    },
    firstInsertedAt: typeof bounds?.firstAt === "string" ? bounds.firstAt : null,
    lastInsertedAt: typeof bounds?.lastAt === "string" ? bounds.lastAt : null,
    sampleBytes: { basis: "UNAVAILABLE", sampled: null, averageValueBytes: null },
    daily: null,
    todaySoFar: null,
    oldest: null,
    newest: null,
    boundariesByCutoff: {},
  };

  if (!entry.personal && report.rows.value) {
    const columns = await read({ sql: `PRAGMA table_info(${table})`, binds: [] }, "columns", table);
    const names = (columns ?? []).map((row) => String(row.name ?? "")).filter((column) => /^[a-z_][a-z0-9_]*$/.test(column));
    if (names.length) {
      const before = rowsRead;
      const sample = (await read(byteSampleStatement(table, names), "byte_sample", table))?.[0] ?? null;
      // The sample walks rowids backwards under a LIMIT; prove it stopped there.
      if (rowsRead - before > BYTE_SAMPLE_ROWS * 2) errors.push({ step: "byte_sample", table, error: `read_${rowsRead - before}_rows_for_a_${BYTE_SAMPLE_ROWS}_row_sample` });
      const average = typeof sample?.avgBytes === "number" && Number.isFinite(sample.avgBytes) ? Math.round(sample.avgBytes) : null;
      report.sampleBytes = { basis: average === null ? "UNAVAILABLE" : "MEASURED", sampled: countOf(sample?.sampled), averageValueBytes: average };
    }
  }

  if (entry.daily && inventory.has(name) && report.rows.value) {
    const byDay = new Map(days.map((day) => [day, { day, rows: 0 as number | null, byKey: {} as Record<string, number | null> }]));
    for (const statement of dailyCountStatements(entry, days)) {
      const count = countOf((await readBounded(statement, "daily_count", table))?.[0]?.rows);
      const slot = byDay.get(statement.day);
      if (!slot) continue;
      slot.byKey[statement.key ?? "all"] = count;
      slot.rows = count === null || slot.rows === null ? null : slot.rows + count;
    }
    report.daily = { basis: "MEASURED", byDay: [...byDay.values()] };
    if (entry.daily.leading?.column === "area" && entry.daily.kind === "instant") {
      const today: Record<string, number | null> = {};
      for (const statement of dailyCountStatements(entry, [todayKst])) {
        today[statement.key ?? "all"] = countOf((await readBounded(statement, "today_so_far", table))?.[0]?.rows);
      }
      report.todaySoFar = today;
    }
    const oldest: string[] = [], newest: string[] = [];
    for (const statement of timeBoundsStatements(entry)) {
      const row = (await readBounded(statement, "time_bounds", table))?.[0];
      if (typeof row?.oldest === "string") oldest.push(row.oldest);
      if (typeof row?.newest === "string") newest.push(row.newest);
    }
    report.oldest = oldest.length ? oldest.sort()[0] : null;
    report.newest = newest.length ? newest.sort().at(-1) ?? null : null;
    const prunable = entry.recordClass !== "D_PREDICTION" && entry.recordClass !== "E_OUTCOME";
    for (const cutoffDays of RETENTION_CUTOFFS) {
      const cutoff = cutoffValue(entry.daily, todayKst, cutoffDays);
      if (!prunable || report.oldest === null || report.oldest >= cutoff) continue;
      const boundaries: Array<number | null> = [];
      for (const statement of retentionBoundaryStatements(entry, cutoff)) {
        boundaries.push(countOf((await readBounded(statement, "retention_boundary", table))?.[0]?.boundary));
      }
      report.boundariesByCutoff[cutoffDays] = boundaries;
    }
  }
  reports.push(report);
}

// 4 — exact per-table bytes when D1 exposes SQLite's dbstat; otherwise the
// official total is split by sampled row width (an estimate, and labelled so).
const officialSize = officialDatabase.basis === "OFFICIAL_ACCOUNT_API" && officialDatabase.fileSizeBytes !== null
  ? officialDatabase.fileSizeBytes
  : sizeAfterBytes;
const officialSizeBasis = officialDatabase.basis === "OFFICIAL_ACCOUNT_API" && officialDatabase.fileSizeBytes !== null
  ? "OFFICIAL_ACCOUNT_API"
  : sizeAfterBytes !== null ? "OFFICIAL_QUERY_META" : "UNAVAILABLE";
let dbstat: { basis: string; reason?: string; perTable?: Record<string, number> } = { basis: "UNAVAILABLE", reason: "not_attempted" };
const pagesEstimate = officialSize === null ? null : Math.ceil(officialSize / 4096);
if (pagesEstimate !== null && CEILING - rowsRead > pagesEstimate + 5_000) {
  const before = errors.length;
  const btrees = await read({ sql: "SELECT name, pgsize AS bytes FROM dbstat WHERE aggregate = 1", binds: [] }, "dbstat");
  if (btrees) {
    const owner = new Map(master.map((row) => [String(row.name), String(row.tableName)]));
    const perTable: Record<string, number> = {};
    for (const btree of btrees) {
      const table = owner.get(String(btree.name)) ?? String(btree.name);
      perTable[table] = (perTable[table] ?? 0) + (countOf(btree.bytes) ?? 0);
    }
    dbstat = { basis: "MEASURED_DBSTAT", perTable };
  } else {
    dbstat = { basis: "UNAVAILABLE", reason: errors.slice(before).map((entry) => entry.error).join(",") || "ceiling" };
    errors.splice(before); // dbstat is optional; its absence is reported above, not as a failure.
  }
} else {
  dbstat = { basis: "UNAVAILABLE", reason: pagesEstimate === null ? "size_unknown" : "insufficient_read_budget" };
}

const allocation = allocateBytes(officialSize, reports.map((report) => ({
  table: report.table,
  rows: report.rows.value,
  sampleBytes: report.sampleBytes.averageValueBytes,
})));
const bytesPerRow: Record<string, number | null> = {};
const tableBytes = reports.map((report) => {
  const exact = dbstat.perTable?.[report.table];
  const estimated = allocation.find((row) => row.table === report.table);
  const bytes = exact ?? estimated?.estimatedBytes ?? null;
  const perRow = bytes === null || !report.rows.value ? null : Math.round(bytes / report.rows.value);
  bytesPerRow[report.table] = perRow;
  return {
    table: report.table,
    bytes,
    bytesPerRow: perRow,
    basis: exact !== undefined ? "MEASURED_DBSTAT" : bytes === null ? "UNAVAILABLE" : "INTERNAL_ESTIMATE_ALLOCATED_FROM_OFFICIAL_SIZE",
  };
});

// 5 — growth. Tables counted by index use their measured days; append-only
// tables without a daily index use their average since the first insert.
const kstDaysBetween = (first: string | null, last: string | null) => {
  const from = first ? Date.parse(first) : NaN, to = last ? Date.parse(last) : NaN;
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? (to - from) / 86_400_000 : null;
};
const growth: DailyGrowth[] = [];
for (const report of reports) {
  if (report.recordClass === "A_CURRENT" || report.recordClass === "G_REBUILDABLE") continue;
  if (report.daily) {
    const steady = steadyDailyRows(report.daily.byDay, report.todaySoFar ?? {});
    growth.push({
      table: report.table,
      rowsPerDay: steady.series,
      basis: steady.estimatedKeys.length ? `MEASURED_DAILY_COUNT_PLUS_ESTIMATE_FOR_${steady.estimatedKeys.join("_")}` : "MEASURED_DAILY_COUNT",
    });
    continue;
  }
  const elapsed = kstDaysBetween(report.firstInsertedAt, report.lastInsertedAt);
  if (report.rows.value && elapsed !== null && elapsed >= 1) {
    const average = report.rows.value / elapsed;
    growth.push({ table: report.table, rowsPerDay: [average, average], basis: "INTERNAL_ESTIMATE_SINCE_FIRST_INSERT" });
  }
}
const projection = projectStorage({ sizeBytes: officialSize, limitBytes: D1_FREE_PLANNING_LIMITS.perDatabaseBytes, growth, bytesPerRow });

// Itaewon's share of the per-area tables, from the same measured days.
// Itaewon's share of each per-area table. Complete days are used when it has
// any; otherwise (its realtime collection started today) the estimate is the
// other areas' full day scaled by today's ratio, and labelled so.
const itaewon = reports.filter((report) => report.daily?.byDay.some((day) => "itaewon" in day.byKey)).map((report) => {
  const activeDays = report.daily!.byDay.filter((day) => (day.byKey.itaewon ?? 0) > 0);
  const others = ["myeongdong", "hongdae", "seongsu"];
  const steady = steadyDailyRows(report.daily!.byDay, report.todaySoFar ?? {});
  const perRow = bytesPerRow[report.table] ?? null;
  const measuredMean = activeDays.length
    ? activeDays.reduce((sum, day) => sum + (day.byKey.itaewon ?? 0), 0) / activeDays.length
    : null;
  const fullDayOthers = report.daily!.byDay.filter((day) => others.every((key) => typeof day.byKey[key] === "number"));
  const othersPerDay = fullDayOthers.length
    ? fullDayOthers.reduce((sum, day) => sum + others.reduce((total, key) => total + (day.byKey[key] ?? 0), 0), 0) / fullDayOthers.length
    : null;
  const estimate = !activeDays.length && steady.estimatedKeys.includes("itaewon") && othersPerDay !== null
    ? (steady.series.at(-1) ?? 0) - othersPerDay
    : null;
  const rowsPerDay = measuredMean ?? estimate;
  return {
    table: report.table,
    basis: measuredMean !== null ? "MEASURED" : estimate !== null ? "INTERNAL_ESTIMATE_TODAY_RATIO" : "UNAVAILABLE",
    daysWithItaewonRows: activeDays.map((day) => day.day),
    todaySoFar: report.todaySoFar,
    itaewonRowsPerDay: rowsPerDay === null ? null : Math.round(rowsPerDay),
    otherAreasRowsPerDay: othersPerDay === null ? null : Math.round(othersPerDay),
    estimatedItaewonBytesPerDay: rowsPerDay === null || perRow === null ? null : Math.round(rowsPerDay * perRow),
  };
});

// Billed writes: an appended row writes the table and every index on it.
const writes = projection.perTable.map((row) => {
  const report = reports.find((entry) => entry.table === row.table);
  return {
    table: row.table,
    rowsPerDay: row.averageRowsPerDay,
    indexes: report?.indexes ?? null,
    estimatedRowsWrittenPerDay: row.averageRowsPerDay === null || !report ? null : row.averageRowsPerDay * (1 + report.indexes),
  };
});
const estimatedRowsWrittenPerDay = writes.every((row) => row.estimatedRowsWrittenPerDay !== null)
  ? writes.reduce((sum, row) => sum + (row.estimatedRowsWrittenPerDay ?? 0), 0)
  : null;

// 6 — the collectors' own recorded D1 usage (a lower bound: the site's reads are not in it).
const usage = await readBounded({
  sql: "SELECT day, source_id AS sourceId, rows_read AS rowsRead, rows_written AS rowsWritten, d1_measured AS measured FROM operational_usage_daily WHERE day >= ? ORDER BY day, source_id",
  binds: [utcDaysAgo(13)],
}, "collector_usage", "operational_usage_daily");
const collectorDays = new Map<string, { day: string; rowsRead: number; rowsWritten: number; sources: number }>();
for (const row of usage ?? []) {
  const day = String(row.day);
  const slot = collectorDays.get(day) ?? { day, rowsRead: 0, rowsWritten: 0, sources: 0 };
  slot.rowsRead += countOf(row.rowsRead) ?? 0;
  slot.rowsWritten += countOf(row.rowsWritten) ?? 0;
  slot.sources += 1;
  collectorDays.set(day, slot);
}

// 7 — what the retention that already exists costs to run (plans only).
const existingPrunes = [
  { table: "seoul_context", perDay: 1, sql: "SELECT area, observed_at FROM seoul_context WHERE observed_at < ? LIMIT 400" },
  { table: "airport_flight_changes", perDay: 6, sql: "SELECT id FROM airport_flight_changes WHERE observed_at < ? ORDER BY observed_at LIMIT 1500" },
  { table: "collector_runs", perDay: 6, sql: "SELECT run_id FROM collector_runs WHERE started_at < ? ORDER BY started_at LIMIT 100" },
];
const existingPruneCost = [];
for (const prune of existingPrunes) {
  const plan = (await read({ sql: `EXPLAIN QUERY PLAN ${prune.sql}`, binds: ["1970-01-01"] }, "prune_plan", prune.table))?.map((row) => String(row.detail ?? "")) ?? null;
  const rows = reports.find((report) => report.table === prune.table)?.rows.value ?? null;
  const scans = plan ? !planIsBounded(plan, prune.table) : null;
  existingPruneCost.push({
    table: prune.table,
    plan,
    scansWholeTable: scans,
    callsPerDayUpTo: prune.perDay,
    estimatedRowsReadPerDayUpTo: scans && rows !== null ? rows * prune.perDay : null,
    basis: "INTERNAL_ESTIMATE_PLAN_TIMES_ROWS",
  });
}

const retention = reports.flatMap((report) => {
  const entry = inventory.get(report.table);
  if (!entry?.daily) return [];
  return RETENTION_CUTOFFS.map((cutoffDays) => retentionDryRun({
    entry,
    cutoffDays,
    oldest: report.oldest,
    cutoff: cutoffValue(entry.daily!, todayKst, cutoffDays),
    lowestRowid: report.rows.lowestRowid,
    boundaries: report.boundariesByCutoff[cutoffDays] ?? [],
    bytesPerRow: bytesPerRow[report.table] ?? null,
  }));
});

const complete = !stoppedAtCeiling && errors.length === 0 && scanRefusals.length === 0 && reports.length === presentTables.length;
const ratio = (value: number | null, limit: number) => value === null ? null : Number((value / limit).toFixed(4));

console.log(JSON.stringify({
  diagnostic: "production-storage",
  generatedAt,
  todayKst,
  completeDays: days,
  limits: {
    perDatabaseBytes: D1_FREE_PLANNING_LIMITS.perDatabaseBytes,
    accountBytes: D1_FREE_PLANNING_LIMITS.accountBytes,
    freeDailyRowsRead: FREE_DAILY_ROWS_READ,
    freeDailyRowsWritten: FREE_DAILY_ROWS_WRITTEN,
    basis: D1_FREE_PLANNING_LIMITS.basis,
  },
  size: {
    database: officialDatabase,
    queryMetaSizeAfterBytes: { basis: sizeAfterBytes === null ? "UNAVAILABLE" : "OFFICIAL_QUERY_META", value: sizeAfterBytes },
    usedBytes: { basis: officialSizeBasis, value: officialSize },
    usedRatioOfPerDatabaseLimit: ratio(officialSize, D1_FREE_PLANNING_LIMITS.perDatabaseBytes),
    account: accountDatabases,
    usedRatioOfAccountLimit: accountDatabases.basis === "OFFICIAL_ACCOUNT_API" && "totalFileSizeBytes" in accountDatabases
      ? ratio(accountDatabases.totalFileSizeBytes, D1_FREE_PLANNING_LIMITS.accountBytes)
      : null,
    officialHistory: storageHistory,
  },
  usage: {
    databaseDaily: databaseUsage,
    accountDaily: accountUsage,
    collectorsLowerBound: { basis: usage ? "MEASURED_LOWER_BOUND" : "UNAVAILABLE", days: [...collectorDays.values()] },
    estimatedRowsWrittenPerDayFromGrowth: { basis: "INTERNAL_ESTIMATE_ROWS_TIMES_1_PLUS_INDEXES", value: estimatedRowsWrittenPerDay, perTable: writes },
  },
  tables: reports.map((report) => ({ ...report, bytes: tableBytes.find((row) => row.table === report.table) })),
  unclassifiedTables,
  missingTables,
  dbstat: { basis: dbstat.basis, reason: dbstat.reason },
  growth: { basis: "INTERNAL_ESTIMATE", ...projection },
  itaewon,
  retentionDryRun: retention,
  existingPruneCost,
  scanRefusals,
  budget: { diagnosticCeiling: CEILING, diagnosticRowsRead: rowsRead, stoppedAtCeiling },
  errors,
  complete,
}, null, 2));

if (!complete) process.exitCode = 1;
