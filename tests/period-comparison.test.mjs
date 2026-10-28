import assert from "node:assert/strict";
import test from "node:test";
import { rangeChange, comparisonText, comparisonValue } from "../lib/period-comparison.ts";

test("comparison preserves ranges and rejects missing, zero, reversed and nonnumeric baselines", () => {
  assert.deepEqual(rangeChange(90, 110, 100, 100, "2026-08-29"), { baselineAt: "2026-08-29", baselineMin:100, baselineMax:100, minPercent: (0.9 - 1) * 100, maxPercent: (1.1 - 1) * 100 });
  for (const missing of [null, undefined, NaN, Infinity, "100"]) assert.equal(rangeChange(100, 100, missing, 100, "date"), null);
  assert.equal(rangeChange(100, 100, 0, 100, "date"), null);
  assert.equal(rangeChange(100, 90, 100, 100, "date"), null);
  assert.equal(rangeChange(100, 100, 101, 100, "date"), null);
});

test("28 days never pretends to mean previous calendar month", () => {
  const change = rangeChange(110, 110, 100, 100, "2026-08-08");
  assert.match(comparisonText(change, "ko", 28), /4주 전 같은 요일 \+10%/);
  assert.doesNotMatch(comparisonText(change, "ko", 28), /전월/);
});

test("정수로 반올림해도 실제 증가와 감소 방향은 남는다", () => {
  // 10,000명에서 1명 늘어난 경우: +0.01%.
  const oneMorePerson = rangeChange(10001, 10001, 10000, 10000, "2026-09-12T14:00:00+09:00");
  assert.equal(comparisonValue(oneMorePerson), "+0%");
  assert.doesNotMatch(comparisonValue(oneMorePerson), /^\+?0\.0%$/);
  // 1명 줄어든 경우도 방향이 남는다.
  assert.equal(comparisonValue(rangeChange(9999, 9999, 10000, 10000, "date")), "△ 0%");
  // 진짜로 같은 값이면 방향 없는 0%.
  assert.equal(comparisonValue(rangeChange(10000, 10000, 10000, 10000, "date")), "0%");
  // 해상도를 넘는 변화는 그대로 숫자로.
  assert.equal(comparisonValue(rangeChange(10500, 10500, 10000, 10000, "date")), "+5%");
  // 범위는 양끝 각각에 같은 규칙이 걸린다.
  assert.equal(comparisonValue(rangeChange(10001, 11000, 10000, 10000, "date")), "+0% ~ +10%");
  // 문장형도 같은 값을 쓴다. 문장에서 숫자만 도로 잘라내는 곳이 없어야 한다.
  assert.ok(comparisonText(oneMorePerson, "ko", 7).includes(comparisonValue(oneMorePerson)));
  for (const lang of ["ko", "en", "zh", "ja"]) {
    assert.ok(comparisonText(oneMorePerson, lang, 7).includes("+0%"), `${lang}에서도 방향이 그대로 보여야 한다`);
  }
});
