import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  STORAGE_TABLES,
  allocateBytes,
  byteSampleStatement,
  completeKstDays,
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
} from "../lib/storage-inventory.ts";

/**
 * The storage diagnostic (scripts/measure-production-storage.ts) runs against
 * Production and spends real free-tier reads. These tests prove, on the real
 * migrated schema, that every statement it can issue is bounded before it is
 * ever sent, and that the table classification cannot silently fall behind the
 * schema.
 */
function migrated() {
  const db = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) db.exec(sql);
    }
  }
  return db;
}

const db = migrated();
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name));
const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
const planOf = (statement) => db.prepare(`EXPLAIN QUERY PLAN ${statement.sql}`).all(...statement.binds).map((row) => String(row.detail));

test("every product table in the schema has exactly one storage class", () => {
  const product = tables.filter((name) => !isSystemTable(name));
  const classified = STORAGE_TABLES.map((entry) => entry.table);
  assert.deepEqual(product.filter((name) => !classified.includes(name)), [], "unclassified table");
  assert.deepEqual(classified.filter((name) => !product.includes(name)), [], "classified table missing from the schema");
  assert.equal(new Set(classified).size, classified.length, "duplicate classification");
});

test("every column the diagnostic names exists on its table", () => {
  for (const entry of STORAGE_TABLES) {
    const columns = columnsOf(entry.table);
    if (entry.insertedAt) assert.ok(columns.includes(entry.insertedAt), `${entry.table}.${entry.insertedAt}`);
    if (entry.daily) {
      assert.ok(columns.includes(entry.daily.column), `${entry.table}.${entry.daily.column}`);
      if (entry.daily.leading) assert.ok(columns.includes(entry.daily.leading.column), `${entry.table}.${entry.daily.leading.column}`);
    }
  }
});

test("predictions and outcomes are never pruning candidates and have no retention", () => {
  for (const entry of STORAGE_TABLES.filter((row) => row.recordClass === "D_PREDICTION" || row.recordClass === "E_OUTCOME")) {
    assert.equal(entry.retentionDays, null, entry.table);
    const result = retentionDryRun({ entry, cutoffDays: 56, oldest: "2020-01-01", cutoff: "2026-08-03", lowestRowid: 1, boundaries: [900], bytesPerRow: 100 });
    assert.equal(result.candidateRows, 0, entry.table);
    assert.equal(result.basis, "PROTECTED_CLASS");
  }
});

test("personal data is only ever counted, never read", () => {
  const signups = STORAGE_TABLES.find((entry) => entry.table === "beta_signups");
  assert.equal(signups?.personal, true);
  assert.doesNotMatch(rowidBoundsStatement(signups).sql, /email|created_at|segment/);
  assert.deepEqual(dailyCountStatements(signups, ["2026-09-27"]), []);
  assert.deepEqual(timeBoundsStatements(signups), []);
});

test("rowid bounds use the MIN/MAX shortcut on every table, never a scan", () => {
  for (const entry of STORAGE_TABLES) {
    const statement = rowidBoundsStatement(entry);
    assert.ok(planIsBounded(planOf(statement), entry.table), `${entry.table}: ${planOf(statement).join(" | ")}`);
    db.prepare(statement.sql).get(...statement.binds);
  }
});

test("daily counts, time bounds and retention boundaries are index searches", () => {
  const days = completeKstDays("2026-09-28", 3);
  for (const entry of STORAGE_TABLES.filter((row) => row.daily)) {
    const statements = [
      ...dailyCountStatements(entry, days),
      ...timeBoundsStatements(entry),
      ...retentionBoundaryStatements(entry, cutoffValue(entry.daily, "2026-09-28", 56)),
    ];
    assert.ok(statements.length > 0, entry.table);
    for (const statement of statements) {
      const plan = planOf(statement);
      assert.ok(planIsBounded(plan, entry.table), `${entry.table}: ${statement.sql} → ${plan.join(" | ")}`);
      assert.ok(plan.some((line) => /SEARCH/.test(line)), `${entry.table} is not an index search: ${plan.join(" | ")}`);
    }
  }
});

test("daily counts cover every key on every complete KST day", () => {
  const area = STORAGE_TABLES.find((entry) => entry.table === "seoul_realtime_area");
  const statements = dailyCountStatements(area, completeKstDays("2026-09-28", 2));
  assert.equal(statements.length, 8);
  assert.deepEqual(statements.filter((row) => row.key === "itaewon").map((row) => row.binds), [
    ["itaewon", "2026-09-26T00:00:00+09:00", "2026-09-27T00:00:00+09:00"],
    ["itaewon", "2026-09-27T00:00:00+09:00", "2026-09-28T00:00:00+09:00"],
  ]);
  assert.deepEqual(completeKstDays("2026-03-01", 2), ["2026-02-27", "2026-02-28"]);
  assert.throws(() => completeKstDays("2026-3-1", 2), /invalid_storage_day_window/);
  assert.throws(() => completeKstDays("2026-03-01", 40), /invalid_storage_day_window/);
});

test("counts and boundaries return the rows they claim on real data", () => {
  const scratch = migrated();
  const insert = scratch.prepare(`INSERT INTO seoul_realtime_area (id, source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label,
    population_min, population_max, observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash)
    VALUES (?, 'SEOUL', 'LIVE', ?, 'POI', 'x', 1, 'x', 1, 2, ?, ?, 'LIVE', 'v1', 'VALID', 'h')`);
  let id = 0;
  for (const day of ["2026-09-25", "2026-09-26", "2026-09-27"]) {
    for (const hour of ["01", "13"]) {
      for (const area of ["myeongdong", "itaewon"]) insert.run(`r${id += 1}`, area, `${day}T${hour}:00:00+09:00`, `${day}T${hour}:01:00+09:00`);
    }
  }
  const entry = STORAGE_TABLES.find((row) => row.table === "seoul_realtime_area");
  const counts = dailyCountStatements(entry, ["2026-09-26"]).map((statement) => [statement.key, scratch.prepare(statement.sql).get(...statement.binds).rows]);
  assert.deepEqual(counts, [["myeongdong", 2], ["hongdae", 0], ["seongsu", 0], ["itaewon", 2]]);
  const bounds = scratch.prepare(rowidBoundsStatement(entry).sql).get();
  assert.deepEqual({ ...bounds }, { lo: 1, hi: 12, firstAt: "2026-09-25T01:01:00+09:00", lastAt: "2026-09-27T13:01:00+09:00" });
  const boundaries = retentionBoundaryStatements(entry, "2026-09-26T00:00:00+09:00")
    .map((statement) => scratch.prepare(statement.sql).get(...statement.binds)?.boundary ?? null);
  const result = retentionDryRun({ entry: { ...entry, readWindowDays: null }, cutoffDays: 2, oldest: "2026-09-25T01:00:00+09:00", cutoff: "2026-09-26T00:00:00+09:00", lowestRowid: bounds.lo, boundaries, bytesPerRow: 10 });
  assert.equal(result.candidateRows, 4, "the four rows of 2026-09-25");
  assert.equal(result.estimatedBytes, 40);
  const sample = byteSampleStatement("seoul_realtime_area", columnsOf("seoul_realtime_area"));
  const sampled = scratch.prepare(sample.sql).get();
  assert.equal(sampled.sampled, 12);
  assert.ok(sampled.avgBytes > 60 && sampled.avgBytes < 200, String(sampled.avgBytes));
});

test("a dry-run refuses to call a cutoff safe when a feature reads further back", () => {
  const area = STORAGE_TABLES.find((entry) => entry.table === "seoul_realtime_area");
  const short = retentionDryRun({ entry: area, cutoffDays: 14, oldest: "2026-08-01T00:00:00+09:00", cutoff: "2026-09-14T00:00:00+09:00", lowestRowid: 1, boundaries: [500, 520, null], bytesPerRow: 200 });
  assert.equal(short.breaksReaders, true);
  assert.equal(short.candidateRows, 499);
  const young = retentionDryRun({ entry: area, cutoffDays: 90, oldest: "2026-08-01T00:00:00+09:00", cutoff: "2026-06-30T00:00:00+09:00", lowestRowid: 1, boundaries: [], bytesPerRow: 200 });
  assert.deepEqual([young.candidateRows, young.basis, young.breaksReaders], [0, "MEASURED_OLDEST_IS_NEWER", false]);
  const unknown = retentionDryRun({ entry: area, cutoffDays: 56, oldest: null, cutoff: "2026-08-03T00:00:00+09:00", lowestRowid: null, boundaries: [], bytesPerRow: null });
  assert.equal(unknown.candidateRows, null);
});

test("allocation is calibrated to the official total and never invents a share", () => {
  const rows = allocateBytes(1_000_000, [
    { table: "a", rows: 100, sampleBytes: 84 },
    { table: "b", rows: 300, sampleBytes: 84 },
    { table: "c", rows: null, sampleBytes: 84 },
    { table: "d", rows: 50, sampleBytes: null },
  ]);
  assert.deepEqual(rows.map((row) => row.estimatedBytes), [250_000, 750_000, null, null]);
  assert.deepEqual(rows.map((row) => row.estimatedBytesPerRow), [2_500, 2_500, null, null]);
  assert.deepEqual(allocateBytes(null, [{ table: "a", rows: 1, sampleBytes: 1 }]).map((row) => row.estimatedBytes), [null]);
});

test("guardrail projection needs two measured days and a byte estimate for every growing table", () => {
  const limit = 1000;
  const ok = projectStorage({ sizeBytes: 500, limitBytes: limit, growth: [{ table: "a", rowsPerDay: [10, 10] }], bytesPerRow: { a: 1 } });
  assert.equal(ok.estimatedBytesPerDay, 10);
  assert.deepEqual(ok.guardrails.map((row) => row.daysUntil), [20, 35, 45]);
  const oneDay = projectStorage({ sizeBytes: 500, limitBytes: limit, growth: [{ table: "a", rowsPerDay: [10] }], bytesPerRow: { a: 1 } });
  assert.equal(oneDay.estimatedBytesPerDay, null);
  assert.deepEqual(oneDay.guardrails.map((row) => row.daysUntil), [null, null, null]);
  const unsized = projectStorage({ sizeBytes: 500, limitBytes: limit, growth: [{ table: "a", rowsPerDay: [10, 12] }], bytesPerRow: { a: null } });
  assert.deepEqual(unsized.missing, ["a"]);
  const over = projectStorage({ sizeBytes: 900, limitBytes: limit, growth: [], bytesPerRow: {} });
  assert.deepEqual(over.guardrails.map((row) => row.daysUntil), [0, 0, null]);
});

test("identifiers are the only way a name reaches SQL", () => {
  assert.equal(identifier("seoul_realtime_area"), "seoul_realtime_area");
  for (const bad of ["x; DROP TABLE y", "a b", "A", "1a", "x--", ""]) assert.throws(() => identifier(bad), /invalid_storage_identifier/);
  assert.throws(() => byteSampleStatement("t", []), /invalid_storage_identifier/);
  assert.equal(isSystemTable("sqlite_sequence"), true);
  assert.equal(isSystemTable("_cf_KV"), true);
  assert.equal(isSystemTable("d1_migrations"), true);
  assert.equal(isSystemTable("seoul_context"), false);
});

test("the steady daily pace counts a key that started late at its own pace", () => {
  const day = (rows, byKey) => ({ day: "d", rows, byKey });
  const late = steadyDailyRows([day(10, { a: 10, b: 0 }), day(16, { a: 10, b: 6 }), day(16, { a: 10, b: 6 })]);
  assert.deepEqual(late, { series: [16, 16, 16], estimatedKeys: [], unestimatedKeys: [] });
  const dropped = steadyDailyRows([day(15, { a: 10, b: 5 }), day(10, { a: 10, b: 0 })]);
  assert.deepEqual(dropped.series, [15, 10], "a key that stops is left as measured");
  const unknownDay = steadyDailyRows([day(null, { a: null }), day(10, { a: 10 })]);
  assert.deepEqual(unknownDay.series, [10]);
});

test("a key that started today is estimated from today's ratio, and says so", () => {
  const day = (byKey) => ({ day: "d", rows: 20, byKey });
  const started = steadyDailyRows([day({ a: 10, b: 10, itaewon: 0 }), day({ a: 10, b: 10, itaewon: 0 })], { a: 5, b: 5, itaewon: 10 });
  assert.deepEqual(started, { series: [40, 40], estimatedKeys: ["itaewon"], unestimatedKeys: [] });
  const noComparison = steadyDailyRows([day({ a: 10, b: 10, itaewon: 0 })], { a: 5, itaewon: 10 });
  assert.deepEqual(noComparison, { series: [20], estimatedKeys: [], unestimatedKeys: ["itaewon"] });
  const silent = steadyDailyRows([day({ a: 10, b: 10, itaewon: 0 })], { a: 5, b: 5, itaewon: 0 });
  assert.deepEqual(silent, { series: [20], estimatedKeys: [], unestimatedKeys: [] });
});

test("the storage diagnostic is read-only, manual, and prints no secret", () => {
  const script = readFileSync("scripts/measure-production-storage.ts", "utf8");
  const library = readFileSync("lib/storage-inventory.ts", "utf8");
  const workflow = readFileSync(".github/workflows/measure-read-budget.yml", "utf8");
  for (const source of [script, library]) {
    assert.doesNotMatch(source, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+(TABLE|INDEX))\b/i);
  }
  assert.equal((script.match(/console\.log\(/g) ?? []).length, 1, "one JSON report, nothing else printed");
  assert.equal((script.match(/apiToken/g) ?? []).length, 3, "resolved, handed to the D1 client, and sent as the Authorization header only");
  assert.match(script, /readBounded/);
  assert.match(script, /if \(!complete\) process\.exitCode = 1/);
  assert.match(script, /RPK_READ_BUDGET_CEILING/);
  assert.doesNotMatch(workflow, /schedule:/, "the owner asked for no new standing diagnostic schedule");
  assert.match(workflow, /- storage/);
  assert.match(workflow, /if: inputs\.scope == 'storage'\n\s+run: npx tsx scripts\/measure-production-storage\.ts/);
  assert.match(workflow, /if: inputs\.scope != 'storage'\n\s+run: npx tsx scripts\/measure-production-read-budget\.ts/);
  assert.deepEqual([...new Set(workflow.match(/secrets\.[A-Z0-9_]+/g))], ["secrets.CLOUDFLARE_D1_WRITE_TOKEN"]);
});
