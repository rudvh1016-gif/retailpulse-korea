import assert from "node:assert/strict";
import test from "node:test";

const presentation = await import("../lib/event-presentation.ts").catch(() => ({}));

function requireEventHelpers() {
  assert.equal(typeof presentation.prepareEventsForPresentation, "function",
    "Phase A needs a real event de-duplication and ranking helper");
  assert.equal(typeof presentation.eventStatusForDate, "function");
  assert.equal(typeof presentation.eventPeriodStatusLabel, "function");
  assert.equal(typeof presentation.eventPreview, "function");
  assert.equal(typeof presentation.safeOfficialEventHomepage, "function");
  assert.equal(typeof presentation.officialEventPeriod, "function");
  assert.equal(typeof presentation.buildEventCopyText, "function");
  return presentation;
}

const event = (overrides = {}) => ({
  area: "myeongdong",
  contentId: "base",
  title: "기본 행사",
  eventStart: "2026-09-04",
  eventEnd: "2026-09-05",
  distanceM: 500,
  address: "서울특별시 중구 명동길 1",
  overview: "첫 문장입니다. 두 번째 문장입니다.",
  homepage: null,
  ...overrides,
});

test("representative events are de-duplicated and ranked by official-period inclusion, start, distance, then title", () => {
  const { prepareEventsForPresentation } = requireEventHelpers();
  const prepared = prepareEventsForPresentation([
    event({ contentId: "future-far", title: "곧 시작 먼 행사", eventStart: "2026-09-04", distanceM: 900 }),
    event({ contentId: "period-far", title: "공식 기간 먼 행사", eventStart: "2026-09-01", eventEnd: "2026-09-08", distanceM: 700 }),
    event({ contentId: "period-near", title: "공식 기간 가까운 행사", eventStart: "2026-08-20", eventEnd: "2026-09-09", distanceM: 100 }),
    event({ contentId: "future-near-z", title: "나중 제목", eventStart: "2026-09-04", distanceM: 200 }),
    event({ contentId: "future-near-a", title: "가까운 제목", eventStart: "2026-09-04", distanceM: 200 }),
    event({ contentId: "future-near-a", title: "같은 콘텐츠 중복", eventStart: "2026-09-10", distanceM: 10 }),
    event({ contentId: "different-id", title: "  가까운   제목 ", eventStart: "2026-09-04", distanceM: 220,
      address: "서울특별시 중구 명동길 1 " }),
  ], "2026-09-03");

  assert.deepEqual(prepared.map((row) => row.title), [
    "공식 기간 가까운 행사",
    "공식 기간 먼 행사",
    "가까운 제목",
    "나중 제목",
    "곧 시작 먼 행사",
  ]);
  assert.deepEqual(prepared.map((row) => row.status), [
    "IN_OFFICIAL_PERIOD",
    "IN_OFFICIAL_PERIOD",
    "UPCOMING",
    "UPCOMING",
    "UPCOMING",
  ]);
});

test("event status and labels state only what the official date range proves", () => {
  const { eventStatusForDate, eventPeriodStatusLabel } = requireEventHelpers();
  const multiDay = event({ eventStart: "2026-09-01", eventEnd: "2026-09-04" });
  const singleDay = event({ eventStart: "2026-09-04", eventEnd: null });

  assert.equal(eventStatusForDate(multiDay, "2026-09-04"), "IN_OFFICIAL_PERIOD");
  assert.equal(eventStatusForDate(singleDay, "2026-09-03"), "UPCOMING");
  assert.deepEqual(["ko", "en", "zh", "ja"].map((lang) =>
    eventPeriodStatusLabel("IN_OFFICIAL_PERIOD", lang)), [
    "공식 행사기간에 오늘 포함",
    "Today falls within the official event period",
    "今日在官方活动期间内",
    "本日は公式開催期間内",
  ]);
  for (const lang of ["ko", "en", "zh", "ja"]) {
    assert.doesNotMatch(eventPeriodStatusLabel("IN_OFFICIAL_PERIOD", lang), /진행 중|\bRunning\b|进行中|開催中/u);
  }
});

test("event preview keeps a complete official sentence and full overview remains unchanged", () => {
  const { eventPreview } = requireEventHelpers();
  const full = "관객과 소통하는 공연형 미술 콘텐츠입니다. 두 번째 공식 문장이 이어집니다.";
  assert.equal(eventPreview(full), "관객과 소통하는 공연형 미술 콘텐츠입니다.");
  assert.equal(full, "관객과 소통하는 공연형 미술 콘텐츠입니다. 두 번째 공식 문장이 이어집니다.");
  assert.equal(eventPreview("문장 마침표가 없는 긴 공식 설명"), null,
    "a preview is omitted rather than arbitrarily cutting official prose");
});

test("official event homepage accepts only valid HTTP or HTTPS URLs", () => {
  const { safeOfficialEventHomepage } = requireEventHelpers();
  assert.equal(safeOfficialEventHomepage("https://example.org/event?q=1"), "https://example.org/event?q=1");
  assert.equal(safeOfficialEventHomepage("http://example.org/event"), "http://example.org/event");
  for (const unsafe of ["javascript:alert(1)", "data:text/html,unsafe", "//example.org/event", "https://", "not a url", "https://user:secret@example.org/event", ""]) {
    assert.equal(safeOfficialEventHomepage(unsafe), null, `${unsafe || "empty"} must be rejected`);
  }
});

test("event copy uses only official allowlisted facts and always carries the operation caveat", () => {
  const { buildEventCopyText, officialEventPeriod } = requireEventHelpers();
  const sourceTitle = "2026 명동 공식 축제";
  const copy = buildEventCopyText({
    ...event({
      title: sourceTitle,
      eventStart: "2026-09-01",
      eventEnd: "2026-09-07",
      address: "서울특별시 중구 명동길 1",
      addressDetail: "광장 2층",
      homepage: "https://example.org/official-event",
    }),
    categoryName: "축제",
    overview: "복사 범위에 포함되지 않는 제공자 설명입니다.",
    generatedAdvice: "지금 가세요",
    source: "임의 출처",
  }, "ko");

  assert.equal(officialEventPeriod({ eventStart: "2026-09-04", eventEnd: "2026-09-04" }), "2026-09-04");
  assert.equal(officialEventPeriod({ eventStart: "2026-09-01", eventEnd: "2026-09-07" }), "2026-09-01 – 2026-09-07");
  assert.deepEqual(copy.split("\n"), [
    `행사명: ${sourceTitle}`,
    "공식 행사기간: 2026-09-01 – 2026-09-07",
    "주소: 서울특별시 중구 명동길 1 · 광장 2층",
    "공식 안내: https://example.org/official-event",
    "출처: 한국관광공사 TourAPI",
    "공식 행사기간은 실제 운영 여부나 운영시간을 뜻하지 않습니다. 공식 안내를 확인하세요.",
  ]);
  assert.doesNotMatch(copy, /복사 범위|지금 가세요|임의 출처|진행 중|현재 영업|운영 중/u);
});

test("event copy omits missing addresses and unsafe URLs without inventing replacements", () => {
  const { buildEventCopyText } = requireEventHelpers();
  const copy = buildEventCopyText({
    title: "공식 원문 행사명",
    eventStart: "2026-09-04",
    eventEnd: null,
    address: null,
    addressDetail: "  ",
    homepage: "javascript:alert(1)",
  }, "en");

  assert.match(copy, /^Event: 공식 원문 행사명$/m,
    "changing the interface language must not fabricate a translated proper name");
  assert.match(copy, /^Official event period: 2026-09-04$/m);
  assert.match(copy, /^Source: Korea Tourism Organization \(KTO\) TourAPI$/m);
  assert.match(copy, /does not confirm actual operation or opening hours/);
  assert.doesNotMatch(copy, /^Address:|^Official page:|javascript:|\bopen now\b|\bRunning\b/im);
});
