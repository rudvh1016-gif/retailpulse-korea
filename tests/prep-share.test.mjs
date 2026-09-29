import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessPrep } from "../lib/business-prep.ts";
import { actionText, factLine } from "../lib/business-prep-copy.ts";
import { buildShareDocument, dateLabel, shareLink, shareText } from "../lib/prep-share.ts";

const day = "2026-09-28";
const at = (hour, minute = 0) => `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`;
const prepFor = (overrides = {}) => buildBusinessPrep({
  serviceDate: day, dayRelation: "TODAY", nowIso: at(9, 10), place: { kind: "area", area: "myeongdong" }, hours: { open: "10:00", close: "20:00" },
  forecast: [{ targetAt: at(17), congestionLevel: 4, issuedAt: at(8, 55) }, { targetAt: at(12), congestionLevel: 2, issuedAt: at(8, 55) }],
  weather: Array.from({ length: 12 }, (_, index) => ({ targetAt: at(9 + index), precipitationProbability: index === 6 ? 70 : 10, temperatureTenthC: 215, issuedAt: at(8) })),
  events: [{ title: "아주 긴 이름을 가진 서울 도심 가을 문화 축제와 야간 거리 공연 프로그램 2026", eventStart: "2026-09-27", eventEnd: "2026-09-30" }],
  ...overrides,
});
const input = (prep, lang = "ko") => ({
  prep, serviceDate: day, place: { kind: "area", area: "myeongdong" }, industry: "beauty", hours: { open: "10:00", close: "20:00" },
  lang, link: shareLink("https://koretaildata.com", lang, day), savedAt: "2026-09-28T00:12:00.000Z",
});

test("the share text carries the same sentences as the screen, and nothing else numeric", () => {
  const prep = prepFor();
  const doc = buildShareDocument(input(prep));
  const text = shareText(doc);
  for (const fact of prep.facts) assert.ok(text.includes(factLine(fact, day, "ko")), `fact missing: ${factLine(fact, day, "ko")}`);
  for (const action of prep.actions) assert.ok(text.includes(actionText(action, day, "beauty", "ko").body));
  assert.ok(prep.actions.length <= 3);
  assert.match(text, /^\[KORETAIL\]/);
  assert.ok(text.includes(`${dateLabel(day, "ko")} · 명동`));
  assert.ok(text.includes("업종: 뷰티·화장품 · 영업시간: 10:00–20:00"));
  assert.ok(text.includes("https://koretaildata.com/ko/business?date=2026-09-28"), "the chosen date stays in the link");
  assert.ok(text.includes("2026-09-28 09:12 KST"), "saved time is printed as a KST date and time");
  assert.ok(text.includes("아주 긴 이름을 가진 서울 도심 가을 문화 축제와 야간 거리 공연 프로그램 2026"), "long names are never cut in the text");
});

test("a shared message never says 'now' and names its own date", () => {
  for (const lang of ["ko", "en", "zh", "ja"]) {
    const text = shareText(buildShareDocument(input(prepFor(), lang)));
    assert.doesNotMatch(text, lang === "en" ? /\bnow\b/i : lang === "ko" ? /지금/ : lang === "zh" ? /现在/ : /いま|現在/, lang);
    assert.ok(text.includes(day), lang);
    assert.ok(text.includes(`/${lang}/business?date=${day}`), lang);
  }
});

test("no data and stale data say so instead of looking calm", () => {
  const empty = shareText(buildShareDocument(input(buildBusinessPrep({ serviceDate: day, dayRelation: "TODAY", nowIso: at(9), place: { kind: "area", area: "itaewon" }, hours: null }))));
  assert.ok(empty.includes("- 없음"));
  assert.ok(empty.includes("판단할 자료가 부족합니다."));
  const stale = prepFor({ nowIso: at(14), forecast: [{ targetAt: at(17), congestionLevel: 4, issuedAt: at(9) }], weather: [] });
  const text = shareText(buildShareDocument(input(stale)));
  assert.doesNotMatch(text, /붐빔/, "a stale forecast is not shared as a fact");
});

test("the source line names only what was used", () => {
  const text = shareText(buildShareDocument(input(prepFor())));
  const sourceLine = text.split("\n").find((line) => line.startsWith("출처:"));
  assert.equal(sourceLine, "출처: 서울시 공식 혼잡 예측, 기상청 단기예보, 한국관광공사 행사 정보");
});

test("image lines break Chinese and Japanese by character and never start with a closing mark", async () => {
  const { wrapText, breakUnits } = await import("../lib/share-wrap.ts");
  const measure = (value) => [...value].length * 10;
  assert.deepEqual(breakUnits("17:00–18:00 の公式予測"), ["17:00–18:00 ", "の", "公", "式", "予", "測"]);
  const lines = wrapText("17:00–18:00 の公式予測は「混雑」です。その前にレジを整えてください。", 120, measure);
  assert.equal(lines[0], "17:00–18:00", "a number that fits stays whole");
  assert.ok(lines.every((line) => !/^[。、」]/.test(line)), JSON.stringify(lines));
  assert.equal(lines.join("").replace(/\s/g, ""), "17:00–18:00の公式予測は「混雑」です。その前にレジを整えてください。");
  const korean = wrapText("공식 혼잡 예측이 붐빔입니다. 그 전에 계산대를 정리하세요.", 150, measure);
  assert.ok(korean.every((line) => !/^\S+\S$/.test(line) || line.length <= 15), "Korean breaks between words");
  assert.deepEqual(wrapText("https://koretaildata.com/ko/business?date=2026-08-31", 100, measure).join(""), "https://koretaildata.com/ko/business?date=2026-08-31", "a long link is split, never dropped");
});

test("a partly located airport side reads the same in the text and the image, with no gate action", () => {
  const place = { kind: "airport", terminal: "T1", side: "EAST" };
  const prep = buildBusinessPrep({
    serviceDate: day, dayRelation: "TODAY", nowIso: at(5, 30), place, hours: { open: "06:30", close: "10:00" },
    airport: { bands: [], coverage: "UNAVAILABLE", retrievedAt: null, gates: {
      hours: [{ hour: 7, count: 2, unverified: 30 }, { hour: 9, count: 3, unverified: 17 }], scope: "SIDE_VERIFIED_ONLY", verifiedShare: 0.1, retrievedAt: at(5), basis: "COLLECTED_FLIGHT_RECORDS" } },
  });
  const doc = buildShareDocument({ ...input(prep), place, industry: "beauty", hours: { open: "06:30", close: "10:00" } });
  const text = shareText(doc);
  const fact = prep.facts.find((row) => row.kind === "GATE_PEAK");
  // The image draws doc.lines; the text is built from the same lines.
  assert.ok(doc.lines.some((line) => line.text === factLine(fact, day, "ko")));
  assert.ok(text.includes("위치가 확인된 동편 탑승구 항공편 중 가장 많은 시간"));
  assert.ok(text.includes("위치 미확인 47편 제외, 그중 같은 시간 17편"));
  assert.doesNotMatch(text, /탑승구 기준 출발편이 가장 많은 시간/);
  assert.equal(prep.actions.some((row) => row.rule === "GATE_PEAK"), false);
  assert.match(text, /출처: .*인천공항 운항 정보/, "the flight source is named even when the gate count gives no action");
});
