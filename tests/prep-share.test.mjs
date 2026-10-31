import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessPrep } from "../lib/business-prep.ts";
import { factLine } from "../lib/business-prep-copy.ts";
import { buildShareDocument, dateLabel, shareLink, shareText, sharedPrepPlace } from "../lib/prep-share.ts";

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

test("one dated brief selects three factual highlights and concrete actions without repeating sources",()=>{
 const prep=prepFor(),doc=buildShareDocument(input(prep)),text=shareText(doc);
 const factItems=doc.lines.slice(doc.lines.findIndex(l=>l.text==='지금 핵심')+1,doc.lines.findIndex(l=>l.text==='준비할 일')).filter(l=>l.kind==='item');
 assert.equal(factItems.length,3);assert.match(text,/17:00 ~ 18:00/);assert.match(text,/70%/);assert.match(text,/21.5°C/);
 assert.match(text,/업종: 뷰티·화장품 · 영업시간: 10:00 ~ 20:00/);assert.match(text,/2026-09-28 09:12 KST/);
 assert.match(text,/우산 보관대와 입구 바닥/);assert.match(text,/실제 행사 시간·장소/);assert.doesNotMatch(text,/아주 긴 이름|행사 1건/);
 assert.equal((text.match(/출처 · 자료 기준:/g)||[]).length,1);assert.equal((text.match(/서울시 공식 혼잡 예측/g)||[]).length,1);
 assert.ok(doc.lines.every(line=>text.includes(line.text)));assert.ok(prep.actions.length<=3);
});
test("all four areas and both airport terminals keep their exact scope and dated link",()=>{
 for(const lang of ['ko','en','zh','ja'])for(const place of [...['myeongdong','hongdae','seongsu','itaewon'].map(area=>({kind:'area',area})),{kind:'airport',terminal:'T1',side:'EAST'},{kind:'airport',terminal:'T2',side:null}]){
  const text=shareText(buildShareDocument({...input(prepFor(),lang),place}));assert.ok(text.includes(day));assert.ok(text.includes(`/${lang}/business?date=${day}`));
  if(place.kind==='airport')assert.ok(text.includes(place.terminal));
  // The approved section heading can say '지금 핵심'; individual facts are explicitly dated.
  assert.doesNotMatch(text.replace('지금 핵심',''),lang==='en'?/\bnow\b/i:lang==='ko'?/지금/:lang==='zh'?/现在/:/いま|現在/);
 }
});
test("no data and stale forecasts never become calm facts",()=>{
 const empty=shareText(buildShareDocument(input(buildBusinessPrep({serviceDate:day,dayRelation:'TODAY',nowIso:at(9),place:{kind:'area',area:'itaewon'},hours:null}))));
 assert.match(empty,/판단할 자료가 부족합니다/);assert.match(empty,/최신 자료와 매장 실제 대기·재고/);assert.doesNotMatch(empty,/출처.*없음/);
 const stale=prepFor({nowIso:at(14),forecast:[{targetAt:at(17),congestionLevel:4,issuedAt:at(9)}],weather:[]});assert.doesNotMatch(shareText(buildShareDocument(input(stale))),/붐빔/);
});
test("event-period evidence never claims a timed crowd or new staffing need",()=>{
 const prep=prepFor({forecast:[],weather:[]}),text=shareText(buildShareDocument(input(prep)));
 assert.match(text,/공식 행사 기간에 포함/);assert.match(text,/실제 운영 시간·장소는 별도 확인/);assert.doesNotMatch(text,/혼잡 예상|직원 증원|매출 증가/);
});

test("image lines break Chinese and Japanese by character and never start with a closing mark", async () => {
  const { wrapText, breakUnits } = await import("../lib/share-wrap.ts");
  const measure = (value) => [...value].length * 10;
  assert.deepEqual(breakUnits("17:00 ~ 18:00 の公式予測"), ["17:00 ~ 18:00 ", "の", "公", "式", "予", "測"]);
  const lines = wrapText("17:00 ~ 18:00 の公式予測は「混雑」です。その前にレジを整えてください。", 140, measure);
  assert.equal(lines[0], "17:00 ~ 18:00", "a number that fits stays whole");
  assert.ok(lines.every((line) => !/^[。、」]/.test(line)), JSON.stringify(lines));
  assert.equal(lines.join("").replace(/\s/g, ""), "17:00~18:00の公式予測は「混雑」です。その前にレジを整えてください。");
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
  assert.ok(doc.lines.some((line) => line.text.startsWith(factLine(fact, day, "ko").split(" (인천공항")[0])));
  assert.ok(text.includes("위치가 확인된 동편 탑승구 항공편 중 가장 많은 시간"));
  assert.ok(text.includes("위치 미확인 47편 제외, 그중 같은 시간 17편"));
  assert.doesNotMatch(text, /탑승구 기준 출발편이 가장 많은 시간/);
  assert.equal(prep.actions.some((row) => row.rule === "GATE_PEAK"), false);
  assert.match(text, /출처 · 자료 기준: .*인천공항 운항 정보/, "the flight source is named even when the gate count gives no action");
});

test("partial coverage stays explicit without separate repeated missing-source paragraphs",()=>{
 for(const [lang,partial] of [['ko','일부 시간만 확인'],['en','partial hours only'],['zh','仅部分时段'],['ja','一部の時間のみ']]){
  const text=shareText(buildShareDocument(input(prepFor(),lang)));assert.ok(text.includes(partial));assert.ok(text.includes('12:00'));assert.ok(text.includes('18:00'));
 }
});


test('public links round-trip all districts and terminals without recipient preferences',()=>{
 for(const place of [...['myeongdong','hongdae','seongsu','itaewon'].map(area=>({kind:'area',area})),...['T1','T2'].map(terminal=>({kind:'airport',terminal,side:'EAST'}))]){
  const url=new URL(shareLink('https://koretaildata.com','ko',day,place));
  assert.equal(url.origin,'https://koretaildata.com');assert.equal(url.pathname,'/ko/business');assert.equal(url.searchParams.get('date'),day);assert.deepEqual(sharedPrepPlace(url.searchParams),place);
 }
 assert.equal(sharedPrepPlace(new URLSearchParams('place=airport&terminal=T3')),null);
 assert.equal(sharedPrepPlace(new URLSearchParams('place=area&area=unknown')),null);
});
