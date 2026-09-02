import assert from "node:assert/strict";
import test from "node:test";

const presentation = await import("../lib/event-presentation.ts").catch(() => ({}));

function requireEventHelpers() {
  assert.equal(typeof presentation.prepareEventsForPresentation, "function",
    "Phase A needs a real event de-duplication and ranking helper");
  assert.equal(typeof presentation.eventPreview, "function");
  assert.equal(typeof presentation.safeOfficialEventHomepage, "function");
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

test("representative events are de-duplicated and ranked by running, start, distance, then title", () => {
  const { prepareEventsForPresentation } = requireEventHelpers();
  const prepared = prepareEventsForPresentation([
    event({ contentId: "future-far", title: "곧 시작 먼 행사", eventStart: "2026-09-04", distanceM: 900 }),
    event({ contentId: "running-far", title: "진행 중 먼 행사", eventStart: "2026-09-01", eventEnd: "2026-09-08", distanceM: 700 }),
    event({ contentId: "running-near", title: "진행 중 가까운 행사", eventStart: "2026-08-20", eventEnd: "2026-09-09", distanceM: 100 }),
    event({ contentId: "future-near-z", title: "나중 제목", eventStart: "2026-09-04", distanceM: 200 }),
    event({ contentId: "future-near-a", title: "가까운 제목", eventStart: "2026-09-04", distanceM: 200 }),
    event({ contentId: "future-near-a", title: "같은 콘텐츠 중복", eventStart: "2026-09-10", distanceM: 10 }),
    event({ contentId: "different-id", title: "  가까운   제목 ", eventStart: "2026-09-04", distanceM: 220,
      address: "서울특별시 중구 명동길 1 " }),
  ], "2026-09-03");

  assert.deepEqual(prepared.map((row) => row.title), [
    "진행 중 가까운 행사",
    "진행 중 먼 행사",
    "가까운 제목",
    "나중 제목",
    "곧 시작 먼 행사",
  ]);
  assert.deepEqual(prepared.map((row) => row.status), ["RUNNING", "RUNNING", "UPCOMING", "UPCOMING", "UPCOMING"]);
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
  for (const unsafe of ["javascript:alert(1)", "data:text/html,unsafe", "//example.org/event", "https://", "not a url", ""]) {
    assert.equal(safeOfficialEventHomepage(unsafe), null, `${unsafe || "empty"} must be rejected`);
  }
});
