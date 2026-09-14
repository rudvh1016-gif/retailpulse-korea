import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The month query must be answered from an index, not by walking each date.
 *
 * Measured on Production D1 (2026-09-14) before the index existed: ~259 rows
 * read per service date, taking one uncached summary from 3,269 to ~10,046.
 * The cause was `airport_passenger_forecast_target_idx` leading with
 * `target_date`: the seek lands on the date, then every row of that date is
 * walked to apply `direction`/`is_aggregate`. Rewriting the WHERE shape could
 * not avoid that, so the fix had to be an index.
 *
 * This test holds the property the fix depends on, against the real schema:
 * the planner picks the month index AND covers the query with it. If someone
 * drops the index, widens the SELECT back to `retrieved_at`, or reorders the
 * columns, the plan stops saying COVERING and this fails — here, in CI, rather
 * than on the free tier a month later.
 */
function schema() {
  const database = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(`drizzle/${file}`, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return database;
}

/** The exact statement the route builds, for a 13-day month-to-date span. */
function monthSql(days: number) {
  return `SELECT terminal, target_date AS targetDate,
    target_start_at AS targetStartAt, target_end_at AS targetEndAt,
    expected_passengers AS expectedPassengers,
    'departure' AS direction, 1 AS isAggregate
  FROM airport_passenger_forecast
  WHERE direction = 'departure' AND is_aggregate = 1 AND target_date IN (${Array.from({ length: days }, () => "?").join(", ")})
  ORDER BY target_date, terminal, target_start_at LIMIT 1600`;
}

test("the month-to-date query is covered by its own index, with no table lookup and no sort", () => {
  const database = schema();
  try {
    const plan = database.prepare(`EXPLAIN QUERY PLAN ${monthSql(13)}`)
      .all(...Array.from({ length: 13 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`))
      .map((row) => String(row.detail));
    const text = plan.join(" | ");

    assert.ok(text.includes("airport_passenger_forecast_month_idx"),
      `the month index must be chosen, saw: ${text}`);
    assert.ok(text.includes("COVERING INDEX"),
      `the index must answer the query without a table lookup, saw: ${text}`);
    // A temporary sort would re-read everything the index just ordered.
    assert.ok(!/TEMP B-TREE/i.test(text), `no temporary sort, saw: ${text}`);
    assert.ok(!/SCAN airport_passenger_forecast(?! USING)/i.test(text),
      `never a full scan of the forecast table, saw: ${text}`);
  } finally {
    database.close();
  }
});

test("the daily query keeps its own index: the new one does not displace it", () => {
  const database = schema();
  try {
    const plan = database.prepare(`EXPLAIN QUERY PLAN SELECT terminal, direction, is_aggregate AS isAggregate,
        target_date AS targetDate, time_band_raw AS timeBandRaw,
        target_start_at AS targetStartAt, target_end_at AS targetEndAt,
        expected_passengers AS expectedPassengers, retrieved_at AS retrievedAt
      FROM airport_passenger_forecast f
      WHERE f.direction IN ('departure', 'arrival') AND f.is_aggregate = 1 AND f.target_date IN (?, ?, ?)
      ORDER BY target_date DESC, direction, target_start_at, terminal LIMIT 288`)
      .all("2026-09-13", "2026-09-06", "2026-08-16")
      .map((row) => String(row.detail)).join(" | ");
    assert.ok(/USING INDEX airport_passenger_forecast/.test(plan), `the day query still seeks an index, saw: ${plan}`);
  } finally {
    database.close();
  }
});
