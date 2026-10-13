import assert from "node:assert/strict";
import test from "node:test";

import {
  PERIOD_VOUCH_WINDOW_MS,
  QUARTERLY_CHECK_GRACE_MS,
  QUARTERLY_CHECK_SLOT_UTC,
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

/**
 * The trap this nearly fell into.
 *
 * Writes are changed-only: an unchanged row keeps the `retrieved_at` of the
 * last time its numbers moved. A July figure published once and never
 * revised would therefore carry a July timestamp forever, and using it here
 * would report a perfectly healthy collector as a stalled one every August.
 * The input must be `source_health.last_retrieved_at` — every successful
 * run, changed or not.
 */
test("the standpoint is judged on collection success, not on when the numbers last moved", () => {
  const rowFrozenAtPublication = "2026-07-31T00:00:00Z";
  const collectorRanThisMorning = RECENT;

  // What a data row's own retrieved_at would have said: wrong.
  assert.equal(publicationStandpoint(rowFrozenAtPublication, NOW), "COLLECTION_BEHIND");
  // What source health says: right.
  assert.equal(publicationStandpoint(collectorRanThisMorning, NOW), "PROVIDER_NEWEST");
});

test("the contract documents which timestamp it wants, so a caller cannot pass the wrong one by accident", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/source-period.ts", import.meta.url), "utf8");
  assert.match(source, /source_health\.last_retrieved_at/);
  assert.match(source, /changed-only/);

  const signals = await readFile(new URL("../app/live-signals.tsx", import.meta.url), "utf8");
  // The helper exists and reads source health, not a data row.
  assert.match(signals, /const lastCollected = \(sourceId: string\): string \| null =>\s*\n?\s*summary\.sources\?\.find/);

  // Every call site feeds it from that helper — directly, or through a
  // parameter the caller filled from it.
  const calls = [...signals.matchAll(/describeSourcePeriod\(\{[\s\S]*?\}, lang\)/g)];
  assert.ok(calls.length >= 4, "every periodic source must describe its period");
  for (const call of calls) {
    assert.match(call[0], /retrievedAt: (lastCollected\("|lastCollectedAt)/,
      "a period standpoint must be judged on source health, not a row timestamp");
  }
  // The one indirect caller really is handed the health-derived value.
  assert.match(signals, /buildStoreDynamicsPresentation\(\s*\n?\s*lang, block\?\.storeDynamics, summary\.generatedAt, lastCollected\("SEOUL_STORE_DYNAMICS"\)\)/);
  // And no call site reaches for a data row's own retrieved_at any more.
  for (const call of calls) {
    assert.doesNotMatch(call[0], /retrievedAt: (block|row|mobility)\./,
      "a changed-only row timestamp freezes when the numbers stop moving");
  }
});

/**
 * The quarterly sources are checked once a week, not every day. Real times:
 * the last good weekly check (run 37165145276) succeeded 2026-10-04 00:30:45Z;
 * the next one (run 38099853388) failed 2026-10-11 00:52Z with a connect
 * timeout, so last_retrieved_at stayed at 10-04.
 */
const WEEKLY_SUCCESS = "2026-10-04T00:30:45Z";
const quarter = (retrievedAt, nowIso) => describeSourcePeriod({ cadence: "QUARTERLY", referencePeriod: "20262", retrievedAt, nowIso }, "ko");

test("a weekly-checked quarterly source stays the provider's newest between healthy checks", () => {
  // Tuesday, 48 hours on: the old rule already said "not collected recently".
  for (const now of ["2026-10-06T00:36:45Z", "2026-10-09T12:00:00Z", "2026-10-10T22:08:00Z", "2026-10-11T04:06:00Z"]) {
    const period = quarter(WEEKLY_SUCCESS, now);
    assert.equal(period.standpoint, "PROVIDER_NEWEST", now);
    assert.match(period.publicationNote, /다음 기간은 아직 공개되지 않았습니다/);
  }
});

test("a failed weekly check stops the vouch at its slot plus the grace, not a week later", () => {
  // Sunday 07:07 KST slot = 2026-10-10 22:07Z; plus 6 h = 2026-10-11 04:07Z.
  const period = quarter(WEEKLY_SUCCESS, "2026-10-11T04:08:00Z");
  assert.equal(period.standpoint, "COLLECTION_BEHIND");
  assert.match(period.publicationNote, /KORETAIL 수집이 최근에 성공하지 않아/);
  assert.equal(quarter(WEEKLY_SUCCESS, "2026-10-12T09:30:00Z").standpoint, "COLLECTION_BEHIND");
});

test("a check that succeeds late in its slot is vouched until the next slot plus the grace", () => {
  const lateSuccess = "2026-10-11T00:52:00Z";
  assert.equal(quarter(lateSuccess, "2026-10-18T04:06:00Z").standpoint, "PROVIDER_NEWEST");
  assert.equal(quarter(lateSuccess, "2026-10-18T04:08:00Z").standpoint, "COLLECTION_BEHIND");
});

test("an off-schedule success does not stretch the vouch past the next weekly check", () => {
  // A manual Thursday run (33717178362) followed by a Sunday check that never succeeds.
  const thursday = "2026-09-03T05:02:08Z";
  assert.equal(quarter(thursday, "2026-09-06T04:06:00Z").standpoint, "PROVIDER_NEWEST");
  assert.equal(quarter(thursday, "2026-09-06T04:08:00Z").standpoint, "COLLECTION_BEHIND");
});

test("daily and monthly sources keep the 48-hour rule, and the airport keeps its base value", () => {
  assert.equal(PERIOD_VOUCH_WINDOW_MS, 48 * 3_600_000, "the airport screens derive 12 h from this");
  const now = Date.parse("2026-10-11T04:08:00Z");
  const inside = new Date(now - PERIOD_VOUCH_WINDOW_MS + 1000).toISOString();
  const outside = new Date(now - PERIOD_VOUCH_WINDOW_MS - 1000).toISOString();
  for (const [cadence, referencePeriod] of [["DAILY", "2026-10-02"], ["MONTHLY", "2026-09"]]) {
    assert.equal(describeSourcePeriod({ cadence, referencePeriod, retrievedAt: inside, nowIso: new Date(now).toISOString() }, "ko").standpoint, "PROVIDER_NEWEST", cadence);
    assert.equal(describeSourcePeriod({ cadence, referencePeriod, retrievedAt: outside, nowIso: new Date(now).toISOString() }, "ko").standpoint, "COLLECTION_BEHIND", cadence);
  }
  // Without a cadence the helper is the 48-hour rule it always was.
  assert.equal(publicationStandpoint(WEEKLY_SUCCESS, "2026-10-06T00:36:45Z"), "COLLECTION_BEHIND");
});

test("the weekly slot is the schedule that actually checks every quarterly source", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const workflow = await readFile(new URL("../.github/workflows/collect-sales.yml", import.meta.url), "utf8");
  const cron = workflow.match(/cron: "(\d+) (\d+) \* \* (\d)"/);
  assert.ok(cron, "collect-sales.yml keeps one weekly cron");
  assert.deepEqual({ minute: Number(cron[1]), hour: Number(cron[2]), weekday: Number(cron[3]) },
    { minute: QUARTERLY_CHECK_SLOT_UTC.minute, hour: QUARTERLY_CHECK_SLOT_UTC.hour, weekday: QUARTERLY_CHECK_SLOT_UTC.weekday });
  assert.match(workflow, /RPK_PRODUCTION_SOURCES: seoul_sales,store_dynamics/);
  assert.ok(QUARTERLY_CHECK_GRACE_MS < 24 * 3_600_000, "the grace absorbs delay and retries, not a missed day");

  // Every quarterly period on screen belongs to a source that weekly job checks.
  const files = (await readdir(new URL("../app/", import.meta.url), { recursive: true })).filter((file) => file.endsWith(".tsx"));
  const sources = new Set();
  for (const file of files) {
    const text = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    for (const call of text.matchAll(/cadence: "QUARTERLY"[\s\S]{0,240}?retrievedAt: (lastCollected\("([A-Z_]+)"\)|lastCollectedAt)/g)) {
      sources.add(call[2] ?? (/lastCollected\("SEOUL_STORE_DYNAMICS"\)/.test(text) ? "SEOUL_STORE_DYNAMICS" : "UNKNOWN"));
    }
  }
  assert.deepEqual([...sources].sort(), ["SEOUL_ESTIMATED_SALES", "SEOUL_STORE_DYNAMICS"]);
});
