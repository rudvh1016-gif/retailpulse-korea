import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { kstDayOf } from "../lib/kst.ts";
import { holidayMonthsFor } from "../lib/usual-comparison.ts";

// Run the actual GET handler and getDb()/Drizzle binding on local workerd.
// Plain node:sqlite accepts the old eight-term UNION that D1 rejects.
test("usual API preserves eight weeks under real D1 query limits", async (t) => {
  const { outputFiles } = await build({
    stdin: {
      contents: 'import { GET } from "./app/api/live/usual/route.ts"; export default { fetch: GET };',
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "browser",
    external: ["cloudflare:workers"],
  });
  const mf = new Miniflare({
    modules: true, script: outputFiles[0].text,
    compatibilityDate: "2026-05-22", d1Databases: ["DB"],
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database("DB");
  const schema = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
      for (const sql of readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
        if (sql.trim()) schema.exec(sql);
      }
    }
    const ddl = schema.prepare(`SELECT sql FROM sqlite_master
      WHERE tbl_name IN ('seoul_realtime_area', 'holiday_months') AND sql IS NOT NULL
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END`).all();
    for (const { sql } of ddl) await db.prepare(sql).run();
  } finally {
    schema.close();
  }

  await t.test("runtime rejects the historical eight-term compound query", async () => {
    await assert.rejects(db.prepare(Array(8).fill("SELECT 1").join(" UNION ALL ")).all(), /too many terms in compound SELECT/);
  });

  const request = (area = "myeongdong") => mf.dispatchFetch(`http://localhost/api/live/usual?area=${area}`);
  await t.test("invalid areas and absent current readings keep their distinct responses", async () => {
    const invalid = await request("invalid");
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_area" });
    const empty = await request();
    assert.equal(empty.status, 200);
    assert.equal((await empty.json()).basis, "NO_CURRENT");
  });

  const now = `${kstDayOf(new Date().toISOString())}T12:00:00+09:00`;
  const weekAgo = (weeks) => `${new Date(Date.parse(now) - weeks * 7 * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 19)}+09:00`;
  const insert = (id, observedAt, min, max) => db.prepare(`INSERT INTO seoul_realtime_area
    (id, source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label,
     population_min, population_max, observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash)
    VALUES (?, 'SEOUL_CITYDATA_PPLTN', 'LIVE', 'myeongdong', 'POI003', 'fixture', 2, 'fixture',
      ?, ?, ?, ?, 'LIVE', 'v1', 'VALID', 'fixture')`).bind(id, min, max, observedAt, observedAt);
  await insert("current", now, 30_000, 32_000).run();

  await t.test("empty history and absent holiday months mean collecting, not 503", async () => {
    const response = await request();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.basis, "COLLECTING");
    assert.equal(body.holidayCheck, "UNAVAILABLE");
    assert.equal(body.verdict, null);
    assert.equal(body.validDays, 0);
    assert.equal(body.weeks.length, 8);
    assert.ok(body.weeks.every((week) => week.status === "MISSING"));
  });

  await db.batch(Array.from({ length: 8 }, (_, i) => insert(`week-${i + 1}`, weekAgo(i + 1), 20_000 + (i + 1) * 100, 24_000)));
  await t.test("all eight weeks and original min/max survive the route batch merge", async () => {
    const response = await request();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300");
    const body = await response.json();
    assert.equal(body.basis, "USUAL");
    assert.equal(body.validDays, 8);
    assert.equal(body.verdict, "HIGHER");
    assert.equal(body.holidayCheck, "UNAVAILABLE");
    assert.deepEqual(body.current, { observedAt: now, min: 30_000, max: 32_000, level: 2 });
    assert.deepEqual(body.range, { min: 20_100, max: 24_000 });
    assert.deepEqual(body.weeks.map((week) => [week.weekOffset, week.observedAt, week.min, week.max]),
      Array.from({ length: 8 }, (_, i) => [i + 1, weekAgo(i + 1), 20_000 + (i + 1) * 100, 24_000]));
  });

  const holiday = weekAgo(1).slice(0, 10);
  await db.batch(holidayMonthsFor(now).map((month) => db.prepare(
    "INSERT INTO holiday_months (month, payload, retrieved_at, source_hash) VALUES (?, ?, ?, 'fixture')",
  ).bind(month, JSON.stringify(month === holiday.slice(0, 7) ? [{ date: holiday }] : []), now)));
  await t.test("holiday rows remain separate from the eight population result sets", async () => {
    const response = await request();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.holidayCheck, "CHECKED");
    assert.equal(body.validDays, 7);
    assert.equal(body.weeks[0].status, "HOLIDAY");
    assert.equal(body.weeks[0].min, null);
    assert.deepEqual(body.range, { min: 20_200, max: 24_000 });
  });

  await t.test("an actual database failure still returns 503", async () => {
    await db.prepare("DROP TABLE holiday_months").run();
    const response = await request();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "usual_comparison_unavailable" });
  });
});
