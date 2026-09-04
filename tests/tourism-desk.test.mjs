import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildTourismDeskBrief } from "../lib/tourism-desk-brief.ts";

const LANGS = ["ko", "en", "zh", "ja"];
const MYEONGDONG_NAMES = { ko: "명동", en: "Myeongdong", zh: "明洞", ja: "明洞" };
const WEATHER = {
  ko: "비 가능성 60% · 우산을 챙기세요",
  en: "60% chance of rain · bring an umbrella",
  zh: "降雨概率60% · 请带伞",
  ja: "降水確率60% · 傘を用意してください",
};

const comparison = (changeTenthsPercent, baselineDates = ["2026-08-27"], baselineAlightingCount = 35400) => ({
  baselineDates,
  baselineAlightingCount,
  changeTenthsPercent,
});

const trend = (overrides = {}) => ({
  observedDayCount: 8,
  earliestReferenceDate: "2026-08-27",
  previousDay: comparison(42, ["2026-09-02"], 38190),
  sameWeekdayLastWeek: comparison(124),
  recentSevenDayAverage: comparison(81, [
    "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30",
    "2026-08-31", "2026-09-01", "2026-09-02",
  ], 36818),
  fourWeekSameWeekdayAverage: null,
  ...overrides,
});

const full = (lang = "ko") => ({
  crowding: {
    congestionLevel: 2,
    populationMin: 21000,
    populationMax: 23000,
    observedAt: "2026-09-04T06:50:00Z",
  },
  crowdForecast: {
    targetAt: "2026-09-04T09:00:00Z",
    congestionLevel: 4,
    dayOffset: "TODAY",
  },
  weatherGuide: WEATHER[lang],
  todayEvent: {
    title: "명동 페스티벌",
    categoryName: "축제",
    status: "IN_OFFICIAL_PERIOD",
  },
  subway: {
    boardingCount: 41200,
    alightingCount: 39800,
    referenceDate: "2026-09-03",
    selectedStations: "명동역 4호선",
    trend: trend(),
  },
});

const empty = () => ({
  crowding: null,
  crowdForecast: null,
  weatherGuide: null,
  todayEvent: null,
  subway: null,
});

test("the shift brief contains only 3–5 high-value lines in guide-work order", () => {
  const lines = buildTourismDeskBrief(full(), "ko", MYEONGDONG_NAMES.ko);
  assert.deepEqual(lines.map((line) => line.key), ["crowding", "forecast", "weather", "event", "subway"]);
  assert.equal(lines.length, 5);
  for (const line of lines) {
    assert.ok(line.text.trim().length > 0, `${line.key} must say something`);
    assert.ok(line.basis.trim().length > 0, `${line.key} must carry its evidence basis`);
  }
});

test("current crowd status is numeric-source localized and concise, never a raw Korean label", () => {
  const expected = { ko: "현재 명동 · 보통", en: "Myeongdong now · Normal", zh: "当前明洞 · 一般", ja: "現在の明洞 · 普通" };
  for (const lang of LANGS) {
    const input = full(lang);
    // Extra provider copy must have no effect even if a caller accidentally keeps it.
    input.crowding.label = "보통";
    const line = buildTourismDeskBrief(input, lang, MYEONGDONG_NAMES[lang]).find(({ key }) => key === "crowding");
    assert.equal(line?.text, expected[lang]);
    assert.doesNotMatch(line?.text ?? "", /21[,.]?000|23[,.]?000|15:50/, "range and time belong in the detailed current-area section");
    if (lang !== "ko") assert.doesNotMatch(line?.text ?? "", /여유|보통|약간 붐빔|붐빔/);
  }

  const invalid = full();
  invalid.crowding.congestionLevel = 99;
  assert.equal(buildTourismDeskBrief(invalid, "ko", "명동").some(({ key }) => key === "crowding"), false,
    "an unknown canonical level is unavailable, not a provider label fallback");
});

test("the next official crowd peak names its day and hour without becoming a tourist forecast", () => {
  const today = buildTourismDeskBrief(full(), "ko", "명동").find(({ key }) => key === "forecast");
  assert.equal(today?.text, "공식 예상 최대 시간대 · 오늘 18:00–19:00 · 붐빔");
  assert.match(today?.basis ?? "", /서울시 공식 생활인구 예측/);
  assert.match(today?.basis ?? "", /관광객.*예측이 아닙니다/);

  const tomorrowInput = full("en");
  tomorrowInput.crowdForecast.dayOffset = "TOMORROW";
  const tomorrow = buildTourismDeskBrief(tomorrowInput, "en", "Myeongdong").find(({ key }) => key === "forecast");
  assert.match(tomorrow?.text ?? "", /tomorrow 18:00–19:00/);

  const invalid = full();
  invalid.crowdForecast.targetAt = "not-a-time";
  assert.equal(buildTourismDeskBrief(invalid, "ko", "명동").some(({ key }) => key === "forecast"), false);
});

test("a later forecast date is formatted in KST while a bare subway day stays unchanged", () => {
  const later = full();
  later.crowdForecast.targetAt = "2026-09-04T16:00:00Z";
  later.crowdForecast.dayOffset = "LATER";
  const forecast = buildTourismDeskBrief(later, "ko", "명동").find(({ key }) => key === "forecast");
  assert.match(forecast?.text ?? "", /9월 5일 01:00–02:00/,
    "a UTC timestamp crossing midnight in Seoul must name the Seoul calendar day");

  const subway = buildTourismDeskBrief(later, "en", "Myeongdong").find(({ key }) => key === "subway");
  assert.match(subway?.basis ?? "", /2026-09-03/,
    "an official bare KST reference day must not be reparsed through another timezone");
});

test("an event says only that today is inside its official period, never that it is running now", () => {
  for (const lang of LANGS) {
    const line = buildTourismDeskBrief(full(lang), lang, MYEONGDONG_NAMES[lang]).find(({ key }) => key === "event");
    const periodTruth = {
      ko: "오늘은 공식 행사기간에 포함",
      en: "Today falls within the official event period",
      zh: "今日在官方活动期间内",
      ja: "本日は公式開催期間内",
    }[lang];
    assert.ok(line?.text.includes(periodTruth));
    assert.deepEqual(line?.koreanText, { value: "축제 · 명동 페스티벌", position: "end" },
      "changeable official Korean text stays separately language-markable in every locale");
    assert.doesNotMatch(line?.text ?? "", /진행 중|\bRunning\b|进行中|開催中/);
    assert.match(line?.basis ?? "", /운영|operation|开放|開催/);
  }

  const upcoming = full();
  upcoming.todayEvent.status = "UPCOMING";
  assert.equal(buildTourismDeskBrief(upcoming, "ko", "명동").some(({ key }) => key === "event"), false,
    "a future event is not padded into today's 30-second brief");
});

test("subway comparison priority is D-7, then recent seven-day average, then D-1", () => {
  const d7 = buildTourismDeskBrief(full(), "ko", "명동").find(({ key }) => key === "subway");
  assert.equal(d7?.text, "명동역 4호선 하차 흐름 · 지난주 같은 요일 대비 +12.4%");
  assert.deepEqual(d7?.koreanText, { value: "명동역 4호선", position: "start" });

  const averageInput = full();
  averageInput.subway.trend = trend({ sameWeekdayLastWeek: null });
  const average = buildTourismDeskBrief(averageInput, "ko", "명동").find(({ key }) => key === "subway");
  assert.equal(average?.text, "명동역 4호선 하차 흐름 · 최근 7일 평균 대비 +8.1%");
  assert.match(average?.basis ?? "", /정확히 직전 7일의 일일 집계 평균이며 같은 요일 보정이 아닙니다/);

  const d1Input = full();
  d1Input.subway.trend = trend({ sameWeekdayLastWeek: null, recentSevenDayAverage: null });
  const d1 = buildTourismDeskBrief(d1Input, "ko", "명동").find(({ key }) => key === "subway");
  assert.equal(d1?.text, "명동역 4호선 하차 흐름 · 전일 대비 +4.2%");
});

test("subway comparison is omitted for missing, non-positive or invalid baselines", () => {
  const noHistory = full();
  noHistory.subway.trend = trend({
    sameWeekdayLastWeek: null,
    recentSevenDayAverage: null,
    previousDay: null,
  });
  assert.equal(buildTourismDeskBrief(noHistory, "ko", "명동").some(({ key }) => key === "subway"), false);

  const zeroBaseline = full();
  zeroBaseline.subway.trend = trend({
    sameWeekdayLastWeek: comparison(0, ["2026-08-27"], 0),
    recentSevenDayAverage: null,
    previousDay: null,
  });
  assert.equal(buildTourismDeskBrief(zeroBaseline, "ko", "명동").some(({ key }) => key === "subway"), false);

  const invalidPercent = full();
  invalidPercent.subway.trend = trend({
    sameWeekdayLastWeek: comparison(Number.POSITIVE_INFINITY),
    recentSevenDayAverage: null,
    previousDay: null,
  });
  assert.equal(buildTourismDeskBrief(invalidPercent, "ko", "명동").some(({ key }) => key === "subway"), false);
});

test("subway comparison labels require the exact baseline row count for their method", () => {
  const malformedD7 = full();
  malformedD7.subway.trend = trend({
    sameWeekdayLastWeek: comparison(124, ["2026-08-20", "2026-08-27"]),
    recentSevenDayAverage: null,
    previousDay: null,
  });
  assert.equal(buildTourismDeskBrief(malformedD7, "ko", "명동").some(({ key }) => key === "subway"), false,
    "same-weekday comparison requires exactly one stored D-7 baseline");

  const malformedAverage = full();
  malformedAverage.subway.trend = trend({
    sameWeekdayLastWeek: null,
    recentSevenDayAverage: comparison(81, ["2026-09-01", "2026-09-02"]),
    previousDay: null,
  });
  assert.equal(buildTourismDeskBrief(malformedAverage, "ko", "명동").some(({ key }) => key === "subway"), false,
    "a recent seven-day average requires all seven stored daily baselines");

  const malformedD1FallsBack = full();
  malformedD1FallsBack.subway.trend = trend({
    sameWeekdayLastWeek: null,
    recentSevenDayAverage: null,
    previousDay: comparison(42, []),
  });
  assert.equal(buildTourismDeskBrief(malformedD1FallsBack, "ko", "명동").some(({ key }) => key === "subway"), false,
    "previous-day comparison requires exactly one stored D-1 baseline");
});

test("subway text names an alighting comparison and its limits, never visitor growth", () => {
  const expectedSignal = { ko: "하차 흐름", en: "alighting count", zh: "下车次数", ja: "降車件数" };
  const expectedLimit = {
    ko: "고유 방문객 수나 지역 전체 방문객 수가 아닙니다",
    en: "not unique visitors or total area visitors",
    zh: "并非独立访客或整个地区到访人数",
    ja: "ユニーク訪問者数や地域全体の来訪者数ではありません",
  };
  for (const lang of LANGS) {
    const line = buildTourismDeskBrief(full(lang), lang, MYEONGDONG_NAMES[lang]).find(({ key }) => key === "subway");
    assert.ok(line?.text.includes(expectedSignal[lang]));
    assert.ok(line?.basis.includes(expectedLimit[lang]));
    assert.doesNotMatch(line?.text ?? "", /관광객|방문객|tourists?|visitors?|游客|到访|観光客|来訪者/i,
      "the comparison sentence itself must stay about station alightings");
  }
});

test("foreign-population and airport-arrival fields cannot re-enter the top brief", () => {
  const input = {
    ...full(),
    foreignPresence: { value: 18400, referenceAt: "2026-08-26" },
    airportArrival: { expectedPassengers: 3250, targetStartAt: "2026-09-04T17:00:00+09:00", targetEndAt: "2026-09-04T18:00:00+09:00" },
  };
  const lines = buildTourismDeskBrief(input, "ko", "명동");
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map(({ key }) => key), ["crowding", "forecast", "weather", "event", "subway"]);
  assert.doesNotMatch(lines.map(({ text }) => text).join(" "), /단기체류|인천공항|입국/);
});

test("missing evidence removes lines rather than filling the brief", () => {
  assert.deepEqual(buildTourismDeskBrief(empty(), "ko", "명동"), []);

  const partial = empty();
  partial.crowding = full().crowding;
  partial.weatherGuide = WEATHER.ko;
  assert.deepEqual(buildTourismDeskBrief(partial, "ko", "명동").map(({ key }) => key), ["crowding", "weather"]);
});

test("every locale has localized operational copy and the result is deterministic", () => {
  const first = buildTourismDeskBrief(full(), "ko", "명동");
  const second = buildTourismDeskBrief(full(), "ko", "명동");
  assert.deepEqual(first, second);

  const outputs = LANGS.map((lang) => buildTourismDeskBrief(full(lang), lang, MYEONGDONG_NAMES[lang]));
  for (const lines of outputs) assert.equal(lines.length, 5);
  for (const lines of outputs.slice(1)) {
    const crowdAndForecast = lines.filter(({ key }) => key === "crowding" || key === "forecast").map(({ text }) => text).join(" ");
    assert.doesNotMatch(crowdAndForecast, /여유|보통|약간 붐빔|붐빔/);
  }
});

test("the pilot adds no provider, runtime scoring or randomness", async () => {
  const view = await readFile(new URL("../app/tourism-desk.tsx", import.meta.url), "utf8");
  const brief = await readFile(new URL("../lib/tourism-desk-brief.ts", import.meta.url), "utf8");

  assert.match(view, /useLiveSummary\(null\)/);
  assert.doesNotMatch(view, /fetch\(/, "the guide must reuse the summary, not add a request");
  for (const source of [view, brief]) {
    assert.doesNotMatch(source, /Math\.random|\bscore\b/i, "no invented score and no randomness");
  }
});

test("the screen says it is a pilot and claims no partnership", async () => {
  const view = await readFile(new URL("../app/tourism-desk.tsx", import.meta.url), "utf8");
  for (const pilot of ["시험 운영", "Pilot", "试运行", "試験運用"]) {
    assert.ok(view.includes(pilot), `${pilot} must be shown`);
  }
  assert.ok(view.includes("특정 기관과의 제휴를 뜻하지 않습니다"));
  assert.doesNotMatch(view, /공식 제휴|공식 파트너|official partner|in partnership with/i);
});

test("the route, metadata and selected-area summary access exist in four languages", async () => {
  const seo = await readFile(new URL("../app/seo-config.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/retailpulse-app.tsx", import.meta.url), "utf8");
  const desk = await readFile(new URL("../app/tourism-desk.tsx", import.meta.url), "utf8");

  assert.match(seo, /"tourism-desk"/);
  assert.match(seo, /tourismDeskAreas = \["myeongdong", "hongdae", "seongsu"\]/);
  assert.match(app, /view === "tourism-desk" && <TourismDeskView/);
  for (const label of ["관광안내", "Guide Desk", "旅游咨询", "観光案内"]) assert.ok(app.includes(label));
  assert.match(desk, /summary\?\.areas\?\.\[area\]/);
  assert.doesNotMatch(app, /className="desk-entry"/);
});
