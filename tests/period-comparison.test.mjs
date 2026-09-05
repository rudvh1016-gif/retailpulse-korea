import assert from "node:assert/strict";
import test from "node:test";
import { rangeChange, comparisonText } from "../lib/period-comparison.ts";

test("comparison preserves ranges and rejects missing, zero, reversed and nonnumeric baselines", () => {
  assert.deepEqual(rangeChange(90, 110, 100, 100, "2026-08-29"), { baselineAt: "2026-08-29", minPercent: (0.9 - 1) * 100, maxPercent: (1.1 - 1) * 100 });
  for (const missing of [null, undefined, NaN, Infinity, "100"]) assert.equal(rangeChange(100, 100, missing, 100, "date"), null);
  assert.equal(rangeChange(100, 100, 0, 100, "date"), null);
  assert.equal(rangeChange(100, 90, 100, 100, "date"), null);
  assert.equal(rangeChange(100, 100, 101, 100, "date"), null);
});

test("28 days never pretends to mean previous calendar month", () => {
  const change = rangeChange(110, 110, 100, 100, "2026-08-08");
  assert.match(comparisonText(change, "ko", 28), /4주 전 동요일 \+10.0%/);
  assert.doesNotMatch(comparisonText(change, "ko", 28), /전월/);
});
