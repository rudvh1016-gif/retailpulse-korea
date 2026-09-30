import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compareNotices, normalizeNotice, parseNoticeFeed, parsePeriod, parseUrgentBanner, statusOf } from "../lib/official-notices.ts";

const FEED = readFileSync(new URL("./fixtures/notices/feed-2026-09-30.xml", import.meta.url), "utf8");
const BANNER = readFileSync(new URL("./fixtures/notices/banner-2026-09-30.json", import.meta.url), "utf8");
const REVIEW = JSON.parse(readFileSync(new URL("../config/official-notices.review.json", import.meta.url), "utf8"));
const CHECKED = "2026-09-30T12:45:00.000Z";

async function records() {
  const raw = [...parseNoticeFeed(FEED, "https://www.airport.kr/bbs/ap_ko/175/rssList.do?row=50"), ...parseUrgentBanner(BANNER, "https://www.airport.kr/ap_ko/index.do")];
  return Promise.all(raw.map((notice) => normalizeNotice(notice, CHECKED)));
}

test("the feed and the banner parse into source ids, titles and posting dates", async () => {
  const all = await records();
  assert.deepEqual(all.map((record) => record.sourceId), ["139586", "139376", "138734", "138657", "138580", "138514", "1415", "1416"]);
  const battery = all.find((record) => record.sourceId === "139376");
  assert.equal(battery.title, "보조배터리 기내반입 기준 안내 (26. 4. 20.~)", "the feed's trailing brace is dropped");
  assert.equal(battery.postedAt, "2026-05-18");
  assert.equal(battery.url, "https://www.airport.kr/bbs/ap_ko/175/139376/artclView.do");
  const maglev = all.find((record) => record.sourceId === "1415");
  assert.equal(maglev.source, "AIRPORT_URGENT_BANNER");
  assert.equal(maglev.postedAt, null, "the banner states no posting date, so none is invented");
});

test("the period comes from the notice's own words, never from the posting date", async () => {
  const byId = Object.fromEntries((await records()).map((record) => [record.sourceId, record]));
  assert.deepEqual(byId["139376"].period, { from: "2026-04-20", to: null, resumesOn: null, basis: "TITLE", quote: "(26. 4. 20.~)" });
  assert.equal(byId["138734"].period.from, "2025-06-10");
  assert.equal(byId["138580"].period.from, "2025-03-01", "a month/day takes its year from the posting date");
  assert.equal(byId["138580"].period.basis, "BODY");
  assert.deepEqual(byId["1415"].period, { from: "2026-09-28", to: "2026-10-02", resumesOn: "2026-10-03", basis: "BODY", quote: "9월28일(월) ~ 10월2일" });
  for (const id of ["139586", "138657", "138514", "1416"]) assert.equal(byId[id].period.basis, "NONE", `${id} states no period`);
});

test("a period across the new year and impossible dates", () => {
  assert.deepEqual(parsePeriod("12월 28일 ~ 1월 3일 운영 중단", "", "2026-12-20").from, "2026-12-28");
  assert.equal(parsePeriod("12월 28일 ~ 1월 3일 운영 중단", "", "2026-12-20").to, "2027-01-03");
  assert.equal(parsePeriod("2월 30일부터 시행", "", "2026-01-10").from, null);
  assert.equal(parsePeriod("안내", "", "2026-01-10").basis, "NONE");
});

test("status follows the stated period on the given day", async () => {
  const maglev = (await records()).find((record) => record.sourceId === "1415");
  assert.equal(statusOf(maglev, "2026-09-27"), "UPCOMING");
  assert.equal(statusOf(maglev, "2026-09-28"), "ACTIVE");
  assert.equal(statusOf(maglev, "2026-10-02"), "ACTIVE");
  assert.equal(statusOf(maglev, "2026-10-03"), "ENDED");
  assert.equal(statusOf({ title: "운행중단 취소 안내", period: maglev.period }, "2026-09-29"), "CANCELLED");
  assert.equal(statusOf({ title: "안내", period: { from: null, to: null } }, "2026-09-29"), "UNKNOWN_PERIOD");
});

test("changes: new, revised by content hash, unchanged, and no longer listed (not ended)", async () => {
  const now = await records();
  const before = [
    ...now.filter((record) => record.sourceId !== "139586" && record.sourceId !== "1415"),
    { ...now.find((record) => record.sourceId === "1415"), contentHash: "old" },
    { ...now[0], sourceId: "999" },
  ];
  const changes = Object.fromEntries(compareNotices(before, now).map(({ key, change }) => [key, change]));
  assert.equal(changes["AIRPORT_NOTICE_BOARD:139586"], "NEW");
  assert.equal(changes["AIRPORT_URGENT_BANNER:1415"], "REVISED");
  assert.equal(changes["AIRPORT_NOTICE_BOARD:139376"], "UNCHANGED");
  assert.equal(changes["AIRPORT_NOTICE_BOARD:999"], "NO_LONGER_LISTED");
  assert.ok(!Object.values(changes).includes("ENDED"));
});

test("the review file is held, matches the parser and carries no notice body", async () => {
  assert.equal(REVIEW.publication, "HELD");
  assert.match(REVIEW.heldBecause, /copyright/);
  const now = Object.fromEntries((await records()).map((record) => [record.sourceId, record]));
  assert.equal(REVIEW.notices.length, 8);
  for (const notice of REVIEW.notices) {
    const parsed = now[notice.sourceId];
    assert.deepEqual(notice.period, parsed.period, notice.sourceId);
    assert.equal(notice.contentHash, parsed.contentHash, notice.sourceId);
    assert.equal(notice.status, statusOf(parsed, REVIEW.checkedOn), notice.sourceId);
    assert.ok(!("body" in notice), "no body text is kept");
    assert.ok(notice.fact.length <= 80, "our own short fact line only");
  }
});

test("the notices are not wired into any page yet", () => {
  for (const file of ["app/business-prep.tsx", "app/airport-sides.tsx", "app/page.tsx"]) {
    let text = "";
    try { text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8"); } catch { continue; }
    assert.ok(!text.includes("official-notices"), `${file} must not show held notices`);
  }
});
