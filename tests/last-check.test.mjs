import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessPrep } from "../lib/business-prep.ts";
import { LAST_CHECK_LIMIT, diffSnapshots, findPrevious, parseLedger, snapshotOf, withSnapshot } from "../lib/last-check.ts";

const day = "2026-09-28";
const at = (hour, minute = 0) => `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
const inputAt = (nowIso, levels, rain, issuedAt = nowIso) => ({
  serviceDate: day, dayRelation: "TODAY", nowIso, place: { kind: "area", area: "myeongdong" }, hours: { open: "10:00", close: "20:00" },
  forecast: Object.entries(levels).map(([hour, level]) => ({ targetAt: at(Number(hour)), congestionLevel: level, issuedAt })),
  weather: Object.entries(rain).map(([hour, percent]) => ({ targetAt: at(Number(hour)), precipitationProbability: percent, temperatureTenthC: 200, issuedAt })),
});
const snap = (input, checkedAt = input.nowIso) => snapshotOf(input, buildBusinessPrep(input), checkedAt);

test("a snapshot keeps official values for the hours ahead and no issue times", () => {
  const snapshot = snap(inputAt(at(12, 5), { 11: 2, 12: 2, 17: 4, 21: 4 }, { 12: 10, 18: 60 }));
  assert.deepEqual(snapshot.signature.crowd, { [at(12)]: 2, [at(17)]: 4 }, "11:00 has passed and 21:00 is after closing");
  assert.deepEqual(snapshot.signature.rain, { [at(12)]: 10, [at(18)]: 60 });
  assert.deepEqual(snapshot.signature.actions, ["CROWD", "RAIN"]);
  assert.equal(JSON.stringify(snapshot).includes("issued"), false);
  assert.equal(snapshot.place, "area:myeongdong");
  assert.equal(snapshot.hours, "10:00-20:00");
});

test("a re-collection that changed no value is not a change", () => {
  const before = snap(inputAt(at(12), { 17: 4 }, { 18: 60 }, at(11, 55)));
  const after = snap(inputAt(at(13), { 17: 4 }, { 18: 60 }, at(12, 55)));
  assert.deepEqual(diffSnapshots(before, after, at(13)), []);
});

test("changed official values for the same future hour are reported", () => {
  const before = snap(inputAt(at(12), { 13: 2, 17: 2 }, { 15: 30, 18: 40 }));
  const after = snap(inputAt(at(13, 30), { 13: 4, 17: 4 }, { 15: 40, 18: 70 }));
  const changes = diffSnapshots(before, after, at(13, 30));
  assert.deepEqual(changes, [
    { kind: "ACTION_ADDED", rule: "CROWD" },
    { kind: "ACTION_ADDED", rule: "RAIN" },
    { kind: "CROWD", at: at(13), from: 2, to: 4 },
    { kind: "CROWD", at: at(17), from: 2, to: 4 },
    { kind: "RAIN", at: at(18), from: 40, to: 70 },
  ], "15:00 moved 10 points without crossing 50%, so it is not listed");
});

test("hours that have passed, and other conditions, are never compared", () => {
  const before = snap(inputAt(at(10), { 11: 2 }, {}));
  const after = { ...before, signature: { ...before.signature, crowd: { [at(11)]: 4 } }, checkedAt: at(14) };
  assert.deepEqual(diffSnapshots(before, after, at(14)), [], "11:00 is in the past at 14:00");
  assert.deepEqual(diffSnapshots(before, { ...after, hours: "day" }, at(10)), []);
  assert.deepEqual(diffSnapshots(before, { ...after, place: "area:hongdae" }, at(10)), []);
  assert.deepEqual(diffSnapshots(before, { ...after, date: "2026-09-29" }, at(10)), []);
});

test("the ledger is strict, bounded and keeps one entry per condition", () => {
  assert.deepEqual(parseLedger("{"), []);
  assert.deepEqual(parseLedger(JSON.stringify([{ v: 2 }, { v: 1, place: 1 }, null])), []);
  const base = snap(inputAt(at(12), { 17: 4 }, {}));
  let ledger = [];
  for (let index = 0; index < LAST_CHECK_LIMIT + 5; index += 1) ledger = withSnapshot(ledger, { ...base, date: `2026-08-${String(index + 1).padStart(2, "0")}` });
  assert.equal(ledger.length, LAST_CHECK_LIMIT);
  ledger = withSnapshot(ledger, base);
  ledger = withSnapshot(ledger, { ...base, checkedAt: at(15) });
  assert.equal(ledger.filter((entry) => entry.date === day).length, 1);
  assert.equal(findPrevious(parseLedger(JSON.stringify(ledger)), base).checkedAt, at(15));
});
