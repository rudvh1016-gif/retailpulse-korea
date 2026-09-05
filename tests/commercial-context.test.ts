import assert from "node:assert/strict";
import test from "node:test";
import { averagePaymentRange, commercialActivityContext } from "../lib/commercial-context";

test("per-payment mean preserves the amount interval and does not invent a historical benchmark", () => {
  assert.deepEqual(averagePaymentRange(9300000, 9400000, 691), [13458, 13604]);
  assert.deepEqual(averagePaymentRange(0, 0, 3), [0, 0]);
  for (const args of [[null, 10, 1], [10, 20, 0], [20, 10, 2], [10, 20, NaN], [10, 20, 1.5]] as [number | null, number | null, number | null][]) assert.equal(averagePaymentRange(...args), null);
});
test("only the provider's known ordinal statuses acquire activity labels", () => {
  assert.match(commercialActivityContext("바쁜 시간대", "ko")!, /활발 · 3\/4/);
  assert.match(commercialActivityContext("분주한", "en")!, /Peak.*4\/4/);
  assert.equal(commercialActivityContext("새로운 상태", "ko"), null);
});
