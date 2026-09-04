import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTourismDeskBrief } from "../lib/tourism-desk-brief.ts";

const LANGS = ["ko", "en", "zh", "ja"];

const FULL = {
  crowding: { label: "보통", populationMin: 21000, populationMax: 23000, observedAt: "2026-09-04T06:50:00Z" },
  weatherGuide: "비 가능성 60% · 우산을 챙기세요",
  todayEvent: { title: "명동 페스티벌", categoryName: "축제", status: "RUNNING" },
  eventCount: 3,
  subway: { boardingCount: 41200, alightingCount: 39800, referenceDate: "2026-09-03", selectedStations: "명동역" },
  foreignPresence: { value: 18400, referenceAt: "2026-08-26T23:00:00+09:00" },
  airportArrival: { expectedPassengers: 3250, targetStartAt: "2026-09-04T17:00:00+09:00", targetEndAt: "2026-09-04T18:00:00+09:00" },
};

test("the briefing reads in guide order and every line carries its own basis", () => {
  const lines = buildTourismDeskBrief(FULL, "ko");
  assert.deepEqual(lines.map((line) => line.key),
    ["crowding", "weather", "event", "subway", "foreign", "airport"]);
  for (const line of lines) {
    assert.ok(line.text.trim().length > 0, `${line.key} must say something`);
    assert.ok(line.basis.trim().length > 0, `${line.key} must say what it is not`);
  }
});

/**
 * The equations this screen must never make.
 *
 * A guide quotes these numbers to visitors, so a living-population estimate
 * that reads as "tourists today" travels further than a wrong number on a
 * dashboard. Each basis names the signal AND the thing it is not, in the
 * same sentence, so the two cannot be separated by a copy-paste.
 */
test("no signal is presented as a tourist count, a visitor count, or a Myeongdong arrival", () => {
  for (const lang of LANGS) {
    const lines = buildTourismDeskBrief(FULL, lang);
    const basisFor = (key) => lines.find((line) => line.key === key)?.basis ?? "";

    const notTourists = { ko: "관광객 수가 아닙니다", en: "not a count of tourists", zh: "并非游客人数", ja: "観光客数ではありません" }[lang];
    assert.ok(basisFor("crowding").includes(notTourists), `${lang}: living population is not tourists`);
    assert.ok(basisFor("foreign").includes(notTourists), `${lang}: foreign living population is not tourists`);

    const notVisitors = { ko: "방문자 수가 아니며", en: "not unique visitors", zh: "并非到访人数", ja: "訪問者数ではなく" }[lang];
    assert.ok(basisFor("subway").includes(notVisitors), `${lang}: boardings are not unique visitors`);

    const notMyeongdong = { ko: "명동 방문객 수가 아닙니다", en: "not Myeongdong visitors", zh: "并非明洞到访人数", ja: "明洞の来訪者数ではありません" }[lang];
    assert.ok(basisFor("airport").includes(notMyeongdong), `${lang}: airport arrivals are not Myeongdong arrivals`);
  }
});

test("missing evidence removes a line rather than filling it in", () => {
  const sparse = buildTourismDeskBrief({
    crowding: null, weatherGuide: null, todayEvent: null, eventCount: 0,
    subway: null, foreignPresence: null, airportArrival: null,
  }, "ko");
  assert.deepEqual(sparse, [], "nothing may be invented to reach a line count");

  const partial = buildTourismDeskBrief({ ...FULL, subway: null, airportArrival: null }, "ko");
  assert.deepEqual(partial.map((line) => line.key), ["crowding", "weather", "event", "foreign"]);
});

test("the briefing is deterministic: the same evidence always yields the same words", () => {
  const first = buildTourismDeskBrief(FULL, "ko");
  const second = buildTourismDeskBrief(FULL, "ko");
  assert.deepEqual(first, second);
});

test("every locale is answered, and none falls back to another language's text", () => {
  const rendered = LANGS.map((lang) => buildTourismDeskBrief(FULL, lang));
  for (const lines of rendered) assert.equal(lines.length, 6);
  const korean = rendered[0].map((line) => line.basis).join("|");
  for (const lines of rendered.slice(1)) {
    assert.notEqual(lines.map((line) => line.basis).join("|"), korean,
      "a locale that repeats Korean has not been translated");
  }
});

test("the pilot adds no provider and no scoring", async () => {
  const view = await readFile(new URL("../app/tourism-desk.tsx", import.meta.url), "utf8");
  const brief = await readFile(new URL("../lib/tourism-desk-brief.ts", import.meta.url), "utf8");

  // Everything comes from the existing summary; no new endpoint is called.
  assert.match(view, /useLiveSummary\(null\)/);
  assert.doesNotMatch(view, /fetch\(/, "the pilot must reuse the summary, not add a request");
  for (const source of [view, brief]) {
    assert.doesNotMatch(source, /Math\.random|score|Score/,
      "no invented score, no randomness");
  }
});

test("the screen says it is a pilot and claims no partnership", async () => {
  const view = await readFile(new URL("../app/tourism-desk.tsx", import.meta.url), "utf8");
  for (const pilot of ["시험 운영", "Pilot", "试运行", "試験運用"]) {
    assert.ok(view.includes(pilot), `${pilot} must be shown`);
  }
  assert.ok(view.includes("특정 기관과의 제휴를 뜻하지 않습니다"));
  // No claimed relationship with a tourism body or the airport operator.
  assert.doesNotMatch(view, /공식 제휴|공식 파트너|official partner|in partnership with/i);
});

test("the route, its metadata and a way in all exist in four languages", async () => {
  const seo = await readFile(new URL("../app/seo-config.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");

  assert.match(seo, /"tourism-desk"/, "the slug must be routable");
  // Title and description exist for the slug, and say it is a pilot in Korean.
  assert.match(seo, /"tourism-desk": \{ ko: "명동 관광안내 데스크 브리핑 \(시험 운영\)/);

  assert.match(app, /view === "tourism-desk" && <TourismDeskView/);
  for (const label of ["관광안내", "Tourism", "旅游咨询", "観光案内"]) {
    assert.ok(app.includes(label), `${label} nav label must exist`);
  }
});
