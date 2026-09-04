import assert from "node:assert/strict";
import test from "node:test";

import {
  PERIOD_VOUCH_WINDOW_MS,
  describeSourcePeriod,
  formatDayPeriod,
  formatMonthPeriod,
  formatQuarterPeriod,
  publicationStandpoint,
} from "../lib/source-period.ts";

const NOW = "2026-09-04T05:00:00Z";
const RECENT = "2026-09-04T02:00:00Z";
const OLD = "2026-08-20T02:00:00Z";

test("periods are formatted in each locale, and refused when the code is not one", () => {
  assert.equal(formatQuarterPeriod("20262", "ko"), "2026년 2분기");
  assert.equal(formatQuarterPeriod("20262", "en"), "Q2 2026");
  assert.equal(formatQuarterPeriod("20262", "zh"), "2026年第2季度");
  assert.equal(formatQuarterPeriod("20262", "ja"), "2026年第2四半期");
  assert.equal(formatQuarterPeriod("2026", "ko"), null);
  assert.equal(formatQuarterPeriod("20265", "ko"), null, "there is no fifth quarter");

  assert.equal(formatMonthPeriod("2026-07-31", "ko"), "2026년 7월");
  assert.equal(formatMonthPeriod("2026-07", "ko"), "2026년 7월");
  assert.equal(formatMonthPeriod("2026-13-01", "ko"), null, "there is no thirteenth month");
  assert.equal(formatMonthPeriod("not a date", "ko"), null);

  assert.equal(formatDayPeriod("2026-08-26T23:00:00+09:00", "ko"), "2026년 8월 26일");
  assert.equal(formatDayPeriod("2026-08-26", "en"), "2026-08-26");
  assert.equal(formatDayPeriod("2026-08-32", "ko"), null);
});

/**
 * The distinction the owner's "8월 자료가 안 보인다" question needed.
 *
 * Every periodic collector fetches the provider's NEWEST publication, so a
 * recent success that still returns July is evidence that August does not
 * exist yet. Without a recent success there is no such evidence, and the
 * claim must be withheld rather than guessed.
 */
test("a recent successful collection is what proves the provider has published nothing newer", () => {
  assert.equal(publicationStandpoint(RECENT, NOW), "PROVIDER_NEWEST");
  assert.equal(publicationStandpoint(OLD, NOW), "COLLECTION_BEHIND");
  assert.equal(publicationStandpoint(null, NOW), "UNKNOWN");
  assert.equal(publicationStandpoint("not a time", NOW), "UNKNOWN");
});

test("the vouch window is a boundary, not a gradient", () => {
  const now = Date.parse(NOW);
  const justInside = new Date(now - PERIOD_VOUCH_WINDOW_MS + 1000).toISOString();
  const justOutside = new Date(now - PERIOD_VOUCH_WINDOW_MS - 1000).toISOString();
  assert.equal(publicationStandpoint(justInside, NOW), "PROVIDER_NEWEST");
  assert.equal(publicationStandpoint(justOutside, NOW), "COLLECTION_BEHIND");
});

test("a monthly source says July is the newest publication, not that August is missing", () => {
  const july = describeSourcePeriod({
    cadence: "MONTHLY", referencePeriod: "2026-07-31", retrievedAt: RECENT, nowIso: NOW,
  }, "ko");
  assert.equal(july?.cadenceLabel, "월간 자료");
  assert.equal(july?.periodLabel, "2026년 7월");
  assert.equal(july?.standpoint, "PROVIDER_NEWEST");
  assert.match(july.publicationNote, /다음 기간은 아직 공개되지 않았습니다/);
  assert.equal(july.cadenceNote, null, "a monthly source needs no extra cadence explanation");
  // Never the language of a broken product.
  assert.doesNotMatch(july.publicationNote, /오류|누락|실패/);
});

test("a quarterly source says there is no month to look for", () => {
  const quarter = describeSourcePeriod({
    cadence: "QUARTERLY", referencePeriod: "20262", retrievedAt: RECENT, nowIso: NOW,
  }, "ko");
  assert.equal(quarter?.cadenceLabel, "분기 자료");
  assert.equal(quarter?.periodLabel, "2026년 2분기");
  assert.match(quarter.cadenceNote ?? "", /월별 자료는 없습니다/);
});

test("a daily source explains that the newest day is not today", () => {
  const daily = describeSourcePeriod({
    cadence: "DAILY", referencePeriod: "2026-08-26T23:00:00+09:00", retrievedAt: RECENT, nowIso: NOW,
  }, "ko");
  assert.equal(daily?.cadenceLabel, "일간 자료");
  assert.equal(daily?.periodLabel, "2026년 8월 26일");
  assert.match(daily.cadenceNote ?? "", /가장 최근 날짜는 오늘이 아닙니다/);
});

test("a stale collector is reported as KORETAIL's lag, never as the provider's", () => {
  const behind = describeSourcePeriod({
    cadence: "MONTHLY", referencePeriod: "2026-07-31", retrievedAt: OLD, nowIso: NOW,
  }, "ko");
  assert.equal(behind?.standpoint, "COLLECTION_BEHIND");
  assert.match(behind.publicationNote, /KORETAIL 수집/,
    "a collection problem must name KORETAIL, not blame the provider");
  assert.doesNotMatch(behind.publicationNote, /다음 기간은 아직 공개되지 않았습니다/,
    "an out-of-date collector cannot vouch for what the provider has published");
});

test("nothing is hardcoded: a later period flows through with no code change", () => {
  const august = describeSourcePeriod({
    cadence: "MONTHLY", referencePeriod: "2026-08-31", retrievedAt: RECENT, nowIso: NOW,
  }, "ko");
  assert.equal(august?.periodLabel, "2026년 8월");
  const q3 = describeSourcePeriod({
    cadence: "QUARTERLY", referencePeriod: "20263", retrievedAt: RECENT, nowIso: NOW,
  }, "ko");
  assert.equal(q3?.periodLabel, "2026년 3분기");
});

test("an unreadable period yields nothing rather than a half-formed label", () => {
  assert.equal(describeSourcePeriod({
    cadence: "MONTHLY", referencePeriod: "", retrievedAt: RECENT, nowIso: NOW,
  }, "ko"), null);
});

test("every locale answers, and none of them leaves a period unexplained", () => {
  for (const lang of ["ko", "en", "zh", "ja"]) {
    for (const cadence of ["DAILY", "MONTHLY", "QUARTERLY"]) {
      const period = cadence === "QUARTERLY" ? "20262" : "2026-07-31";
      const described = describeSourcePeriod({ cadence, referencePeriod: period, retrievedAt: RECENT, nowIso: NOW }, lang);
      assert.ok(described, `${lang}/${cadence} must describe itself`);
      assert.ok(described.cadenceLabel.trim().length > 0);
      assert.ok(described.periodLabel.trim().length > 0);
      assert.ok(described.publicationNote.trim().length > 0);
    }
  }
});
