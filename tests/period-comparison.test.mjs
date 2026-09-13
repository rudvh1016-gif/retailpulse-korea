import assert from "node:assert/strict";
import test from "node:test";
import { rangeChange, comparisonText, comparisonValue } from "../lib/period-comparison.ts";

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

/**
 * 실제로 움직였는데 "0.0%" 로 보이면 안 된다.
 *
 * 소유자 보고(2026-09-13): 한 명이 늘어난 날도 화면에는 0% 로 나온다.
 * (+0.04).toFixed(1) 은 "+0.0" 이라서, 읽는 사람은 "변화 없음" 으로 읽는다.
 * 표시 해상도보다 작은 변화라도 방향은 이미 알고 있으므로, 반올림한 0 대신
 * 경계값을 적는다: 0.1% 미만이면 "<+0.1%", 초과 감소면 ">-0.1%".
 * 정확히 0 일 때만 "0.0%" 다. 그때는 정말로 변화가 없기 때문이다.
 */
test("표시 해상도보다 작은 실제 변화는 0%가 아니라 경계값으로 적는다", () => {
  // 10,000명에서 1명 늘어난 경우: +0.01%.
  const oneMorePerson = rangeChange(10001, 10001, 10000, 10000, "2026-09-12T14:00:00+09:00");
  assert.equal(comparisonValue(oneMorePerson), "<+0.1%");
  assert.doesNotMatch(comparisonValue(oneMorePerson), /^\+?0\.0%$/);
  // 1명 줄어든 경우도 방향이 남는다.
  assert.equal(comparisonValue(rangeChange(9999, 9999, 10000, 10000, "date")), ">-0.1%");
  // 진짜로 같은 값이면 0.0%.
  assert.equal(comparisonValue(rangeChange(10000, 10000, 10000, 10000, "date")), "0.0%");
  // 해상도를 넘는 변화는 그대로 숫자로.
  assert.equal(comparisonValue(rangeChange(10500, 10500, 10000, 10000, "date")), "+5.0%");
  // 범위는 양끝 각각에 같은 규칙이 걸린다.
  assert.equal(comparisonValue(rangeChange(10001, 11000, 10000, 10000, "date")), "<+0.1% ~ +10.0%");
  // 문장형도 같은 값을 쓴다. 문장에서 숫자만 도로 잘라내는 곳이 없어야 한다.
  assert.ok(comparisonText(oneMorePerson, "ko", 7).includes(comparisonValue(oneMorePerson)));
  for (const lang of ["ko", "en", "zh", "ja"]) {
    assert.ok(comparisonText(oneMorePerson, lang, 7).includes("<+0.1%"), `${lang}에서도 경계값이 그대로 보여야 한다`);
  }
});
