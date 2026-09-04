import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { COVERAGE_PROBES, isReadOnlyProbe } from "../lib/data-coverage.ts";

import {
  classifyFacility,
  collectAirportFacilities,
  describeFacilityCoverage,
  FACILITY_MAX_PAGES,
  FACILITY_PAGE_SIZE,
  FACILITY_REFRESH_DAYS,
  FACILITY_SOURCE_ID,
  finalizeFacilityHashes,
  mergeFacilityLanguage,
  normalizeAirportFacility,
  resolveFacilityTerminal,
  summarizeFacilityCoverage,
} from "../lib/airport-facilities.ts";

/** One official row as the provider actually ships it (verified 2026-09-03). */
const officialRow = (overrides = {}) => ({
  sn: "1001",
  arrordep: "D",
  facilityitem: "화장품",
  facilitynm: "신라면세점",
  floorinfo: "3층",
  goods: "화장품/향수",
  lcategorynm: "면세점",
  lcduty: "Y",
  lcnm: "제1여객터미널 3층 면세지역 27번 게이트 부근",
  mcategorynm: "화장품",
  scategorynm: "향수",
  servicetime: "07:00~21:00",
  tel: "032-000-0000",
  terminalid: "P01",
  ...overrides,
});

const fixedNow = new Date("2026-09-03T00:00:00.000Z");

function fakeDb({ runs = [], facilityCount = 0 } = {}) {
  const all = [];
  // Only the facility upserts count as "written rows"; collector_runs and
  // source_health are operational bookkeeping every collector performs.
  const written = { get length() { return all.filter((s) => s.sql.includes("INTO airport_facility")).length; },
    every(fn) { return all.filter((s) => s.sql.includes("INTO airport_facility")).every(fn); } };
  const client = {
    prepare(sql) {
      const statement = {
        sql,
        binds: [],
        bind(...binds) { statement.binds = binds; return statement; },
        async all() {
          if (sql.includes("FROM collector_runs")) return { results: runs };
          return { results: [] };
        },
        async first() {
          if (sql.includes("COUNT(*) AS n FROM airport_facility")) return { n: facilityCount };
          return null;
        },
        async run() { all.push(statement); return { meta: { changes: 1, rows_written: 1 } }; },
      };
      return statement;
    },
    async batch(statements) {
      all.push(...statements);
      return statements.map(() => ({ meta: { changes: 1, rows_written: 1 } }));
    },
  };
  return { client, written };
}

test("an official facility row normalizes to the verified fields, keeping the provider's own categories", async () => {
  const row = await normalizeAirportFacility(officialRow(), "2026-09-03T00:00:00.000Z");
  assert.equal(row.facilityId, "1001");
  assert.equal(row.sourceId, FACILITY_SOURCE_ID);
  assert.equal(row.nameKo, "신라면세점");
  assert.equal(row.terminalCode, "P01");
  assert.equal(row.terminal, "T1");
  assert.equal(row.floor, "3층");
  assert.equal(row.dutyArea, "DUTY_FREE");
  assert.equal(row.arrivalDeparture, "DEPARTURE");
  assert.equal(row.locationRaw, "제1여객터미널 3층 면세지역 27번 게이트 부근");
  assert.equal(row.businessHoursRaw, "07:00~21:00");
  assert.equal(row.goodsBrands, "화장품/향수");
  assert.equal(row.phone, "032-000-0000");
  assert.equal(row.largeCategory, "면세점");
  assert.equal(row.mediumCategory, "화장품");
  assert.equal(row.smallCategory, "향수");
  assert.equal(row.categoryGroup, "DUTY_FREE");
  assert.equal(row.qualityStatus, "VALID");
  assert.match(row.sourceHash, /^[0-9a-f]{64}$/);
});

test("every official terminal code maps to its published terminal, and an unknown code is not guessed", async () => {
  const codes = { P01: "T1", P03: "T2", G01: "CONCOURSE", G02: "T1_TRANSPORT", G03: "T2_TRANSPORT" };
  for (const [code, expected] of Object.entries(codes)) {
    const row = await normalizeAirportFacility(officialRow({ terminalid: code }), "2026-09-03T00:00:00.000Z");
    assert.equal(row.terminal, expected, `${code} must map to ${expected}`);
  }
  // 알 수 없는 코드라도 공식 위치 문구가 건물을 직접 말하면 그 문구를 믿는다.
  // 픽스처의 lcnm 은 "제1여객터미널 …" 이므로 코드가 낯설어도 T1 이다.
  const namedInText = await normalizeAirportFacility(officialRow({ terminalid: "ZZZ" }), "2026-09-03T00:00:00.000Z");
  assert.equal(namedInText.terminal, "T1", "공식 위치 문구가 말하면 그것도 근거다");
  assert.equal(namedInText.terminalCode, "ZZZ", "원본 코드는 그대로 보존한다");

  // 코드도 낯설고 위치 문구도 건물을 말하지 않으면 추측하지 않는다.
  const unknown = await normalizeAirportFacility(
    officialRow({ terminalid: "ZZZ", lcnm: "3층 면세지역 27번 게이트 부근" }),
    "2026-09-03T00:00:00.000Z",
  );
  assert.equal(unknown.terminal, null);
  assert.equal(unknown.terminalCode, "ZZZ");
  assert.equal(unknown.qualityStatus, "PARTIAL");
});

test("category grouping reads the official categories and never drops a facility", () => {
  const group = (over) => classifyFacility({ largeCategory: null, mediumCategory: null, smallCategory: null, facilityItem: null, nameKo: null, ...over });
  assert.equal(group({ largeCategory: "면세점" }), "DUTY_FREE");
  assert.equal(group({ largeCategory: "약국" }), "PHARMACY");
  assert.equal(group({ mediumCategory: "편의점" }), "CONVENIENCE");
  assert.equal(group({ largeCategory: "은행/환전" }), "EXCHANGE_TELECOM");
  assert.equal(group({ smallCategory: "로밍/유심" }), "EXCHANGE_TELECOM");
  assert.equal(group({ largeCategory: "식음료", nameKo: "카페" }), "FOOD");
  // Anything the keywords do not recognise is still a facility, not a hole.
  assert.equal(group({ largeCategory: "수하물보관" }), "SERVICE");
  assert.equal(group({}), "SERVICE");
  // A duty-free pharmacy is duty-free: the ordering is deliberate.
  assert.equal(group({ largeCategory: "면세점", mediumCategory: "약국" }), "DUTY_FREE");
});

test("a language pass only adds names to rows the Korean pass produced", async () => {
  const rows = new Map();
  const korean = await normalizeAirportFacility(officialRow(), "2026-09-03T00:00:00.000Z");
  rows.set(korean.facilityId, korean);
  const english = mergeFacilityLanguage(rows, "E", [
    { sn: "1001", facilitynm: "Shilla Duty Free", lcnm: "T1 3F airside near Gate 27" },
    { sn: "9999", facilitynm: "Ghost Store" },
  ]);
  assert.deepEqual(english, { matched: 1, unmatched: 1 });
  assert.equal(rows.get("1001").nameEn, "Shilla Duty Free");
  assert.equal(rows.get("1001").locationEn, "T1 3F airside near Gate 27");
  assert.equal(rows.size, 1, "a translation row must never create a facility");
  mergeFacilityLanguage(rows, "J", [{ sn: "1001", facilitynm: "新羅免税店" }]);
  mergeFacilityLanguage(rows, "C", [{ sn: "1001", facilitynm: "新罗免税店" }]);
  assert.equal(rows.get("1001").nameJa, "新羅免税店");
  assert.equal(rows.get("1001").nameZh, "新罗免税店");
});

test("the stored hash covers meaning, so a new retrieval time alone is not a change", async () => {
  const first = await normalizeAirportFacility(officialRow(), "2026-09-03T00:00:00.000Z");
  const later = await normalizeAirportFacility(officialRow(), "2026-09-10T00:00:00.000Z");
  const [a] = await finalizeFacilityHashes([first]);
  const [b] = await finalizeFacilityHashes([later]);
  assert.equal(a.sourceHash, b.sourceHash);
  const moved = await normalizeAirportFacility(officialRow({ floorinfo: "4층" }), "2026-09-03T00:00:00.000Z");
  const [c] = await finalizeFacilityHashes([moved]);
  assert.notEqual(a.sourceHash, c.sourceHash);
});

test("coverage counts what was actually collected, per terminal, group and side", async () => {
  const rows = await Promise.all([
    normalizeAirportFacility(officialRow({ sn: "1", terminalid: "P01", lcategorynm: "면세점", lcduty: "Y", arrordep: "D" }), "2026-09-03T00:00:00.000Z"),
    normalizeAirportFacility(officialRow({ sn: "2", terminalid: "P03", facilitynm: "공항 카페", facilityitem: "커피", lcategorynm: "식음료", mcategorynm: "카페", scategorynm: "커피", lcduty: "N", arrordep: "A", servicetime: null }), "2026-09-03T00:00:00.000Z"),
    normalizeAirportFacility(officialRow({ sn: "3", terminalid: "G01", facilitynm: "온누리약국", facilityitem: "의약품", lcategorynm: "약국", mcategorynm: "약국", scategorynm: "약국", lcduty: "N", arrordep: "D", lcnm: null }), "2026-09-03T00:00:00.000Z"),
  ]);
  const coverage = summarizeFacilityCoverage(rows);
  assert.equal(coverage.total, 3);
  assert.deepEqual(coverage.byTerminal, { T1: 1, T2: 1, CONCOURSE: 1 });
  assert.equal(coverage.byGroup.DUTY_FREE, 1);
  assert.equal(coverage.byGroup.FOOD, 1);
  assert.equal(coverage.byGroup.PHARMACY, 1);
  assert.equal(coverage.dutyFreeArea, 1);
  assert.equal(coverage.generalArea, 2);
  assert.equal(coverage.departureSide, 2);
  assert.equal(coverage.arrivalSide, 1);
  assert.equal(coverage.missingHours, 1);
  assert.equal(coverage.missingLocation, 1);
  assert.match(describeFacilityCoverage(coverage), /facilities 3/);
});

test("a successful run within the refresh window makes zero provider requests", async () => {
  const { client } = fakeDb({ runs: [{ started_at: "2026-09-01T00:00:00.000Z" }] });
  let calls = 0;
  const result = await collectAirportFacilities(
    { DB: client, DATA_GO_KR_SERVICE_KEY: "fixture" },
    fixedNow,
    async () => { calls += 1; return {}; },
  );
  assert.equal(result.status, "SKIPPED_NO_NEW_PUBLICATION");
  assert.equal(result.providerRequests, 0);
  assert.equal(calls, 0);
  assert.match(result.detail, new RegExp(`${FACILITY_REFRESH_DAYS} days`));
});

test("forceRefresh is the only way past the window, and the scheduler never sets it", async () => {
  const { client } = fakeDb({ runs: [{ started_at: "2026-09-01T00:00:00.000Z" }] });
  const page = (items, totalCount) => ({ response: { header: { resultCode: "00" }, body: { items: { item: items }, totalCount } } });
  let calls = 0;
  const result = await collectAirportFacilities(
    { DB: client, DATA_GO_KR_SERVICE_KEY: "fixture" },
    fixedNow,
    async (url) => {
      calls += 1;
      return url.searchParams.get("lang") === "K" ? page([officialRow({ sn: "1" })], 1) : page([], 0);
    },
    { forceRefresh: true },
  );
  assert.equal(result.status, "SUCCESS", "a forced run must actually collect");
  assert.equal(calls, 4, "a forced run costs the same bounded per-language passes");

  // The recurring scheduler must never carry the flag: the refresh window is
  // what keeps a daily selection free, and only the manual one-shot may waive it.
  const runner = await readFile(new URL("../lib/production-runner.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runner, /forceRefresh/,
    "the production scheduler must never bypass the facility refresh window");
  const oneshot = await readFile(new URL("../scripts/import-oneshot.ts", import.meta.url), "utf8");
  assert.match(oneshot, /RPK_FACILITY_FORCE_REFRESH === "true"/,
    "the waiver must be an explicit opt-in, never the default");
});

test("one collection reads every language once and writes changed rows only", async () => {
  const { client, written } = fakeDb();
  const page = (items, totalCount) => ({ response: { header: { resultCode: "00" }, body: { items: { item: items }, totalCount } } });
  const seen = [];
  const result = await collectAirportFacilities(
    { DB: client, DATA_GO_KR_SERVICE_KEY: "fixture" },
    fixedNow,
    async (url) => {
      const lang = url.searchParams.get("lang");
      seen.push(lang);
      if (lang === "K") return page([officialRow({ sn: "1" }), officialRow({ sn: "2", terminalid: "P03" })], 2);
      if (lang === "E") return page([{ sn: "1", facilitynm: "Shilla Duty Free" }], 1);
      if (lang === "J") return page([{ sn: "1", facilitynm: "新羅免税店" }], 1);
      return page([{ sn: "1", facilitynm: "新罗免税店" }], 1);
    },
  );
  assert.equal(result.status, "SUCCESS");
  assert.deepEqual(seen, ["K", "E", "J", "C"]);
  assert.equal(result.providerRequests, 4);
  assert.equal(result.coverage.total, 2);
  assert.equal(written.length, 2);
  assert.ok(written.every((statement) => statement.sql.includes("ON CONFLICT(facility_id) DO UPDATE")));
  assert.ok(written.every((statement) => statement.sql.includes("WHERE airport_facility.source_hash <> excluded.source_hash")),
    "an unchanged facility must not be rewritten");
});

test("a provider failure preserves the stored directory and never deletes or empties it", async () => {
  const { client, written } = fakeDb({ facilityCount: 1232 });
  const statuses = [];
  const spy = {
    prepare(sql) {
      const statement = client.prepare(sql);
      const run = statement.run.bind(statement);
      statement.run = async () => { statuses.push({ sql, binds: statement.binds }); return run(); };
      return statement;
    },
    batch: client.batch,
  };
  const result = await collectAirportFacilities(
    { DB: spy, DATA_GO_KR_SERVICE_KEY: "fixture" },
    fixedNow,
    async () => { throw new Error("NETWORK_UND_ERR_CONNECT_TIMEOUT"); },
  );
  assert.equal(result.status, "ERROR");
  assert.equal(written.length, 0, "a failed run must write no facility rows");
  const health = statuses.find((entry) => entry.sql.includes("INSERT INTO source_health"));
  assert.ok(health, "source health must still be recorded");
  assert.equal(health.binds[1], "STALE", "a directory that already exists is stale, not missing");
  assert.ok(!statuses.some((entry) => /DELETE FROM airport_facility|UPDATE airport_facility/.test(entry.sql)));
});

test("the collection is bounded so one run can never approach the daily quota", () => {
  // Four languages × the page bound, each page one request plus at most one
  // retry inside the shared fetcher: far below the documented 1,000/day.
  assert.equal(FACILITY_PAGE_SIZE, 100);
  assert.equal(FACILITY_MAX_PAGES, 30);
  assert.ok(4 * FACILITY_MAX_PAGES * 2 < 1000, "worst-case requests must stay under the development quota");
});

test("the one-shot import can run the A2 directory, so Production has a path that is not the disabled scheduler", async () => {
  const script = await readFile(new URL("../scripts/import-oneshot.ts", import.meta.url), "utf8");
  assert.match(script, /airport_facilities:\s*\(\)\s*=>\s*collectAirportFacilities\(env,/,
    "the A2 collector must be selectable from the manual bounded import");
  assert.match(script, /import \{ collectAirportFacilities \} from "\.\.\/lib\/airport-facilities"/);
  // Coverage is the whole point of the A2 closure evidence, and `detail` is
  // truncated to 500 characters; the structured breakdown must survive whole.
  assert.match(script, /result\.coverage === undefined \? \{\} : \{ coverage: result\.coverage \}/);
  assert.match(script, /unmatchedTranslations: result\.unmatchedTranslations/);

  const workflow = await readFile(new URL("../.github/workflows/import-oneshot.yml", import.meta.url), "utf8");
  assert.match(workflow, /airport_facilities/, "the dispatch input must name the A2 source");
  assert.doesNotMatch(workflow, /^\s*schedule:/m, "the manual import must stay unscheduled");
});

test("stored A2 rows can be verified read-only, independently of what the collector claimed", async () => {
  const totals = COVERAGE_PROBES.find((probe) => probe.name === "airport_facility_totals");
  const grouped = COVERAGE_PROBES.find((probe) => probe.name === "airport_facility_by_terminal_category");
  assert.ok(totals && grouped, "both A2 coverage probes must exist");
  for (const probe of [totals, grouped]) {
    assert.equal(isReadOnlyProbe(probe), true, `${probe.name} must never write to Production`);
    assert.deepEqual(probe.sourceIds, [FACILITY_SOURCE_ID]);
    assert.equal(probe.params({ kstNowIso: "x", kstToday: "x", kstHourStartIso: "x" }).length, 0);
    assert.match(probe.sql, /FROM airport_facility\b/);
  }
  // The report has to answer the owner's questions from storage, not from a
  // collector log line, so each quality column it cites must be selected.
  for (const column of [
    "storedFacilities", "dutyFreeArea", "generalArea", "arrivalSide", "departureSide",
    "missingKoreanName", "missingEnglishName", "missingOfficialHours", "missingPhone",
    "missingLocationText", "missingTerminal", "validRows", "partialRows",
  ]) {
    assert.match(totals.sql, new RegExp(`AS ${column}\\b`), `totals probe must report ${column}`);
  }
  assert.match(grouped.sql, /GROUP BY COALESCE\(terminal, 'UNKNOWN'\), category_group/);
});

test("문서에 있는 코드는 그대로 쓴다", () => {
  for (const [code, expected] of [["P01", "T1"], ["P03", "T2"], ["G01", "CONCOURSE"], ["G02", "T1_TRANSPORT"], ["G03", "T2_TRANSPORT"]]) {
    const { terminal, evidence } = resolveFacilityTerminal(code, null);
    assert.equal(terminal, expected);
    assert.equal(evidence, "DOCUMENTED_CODE");
  }
});

test("P02는 코드와 위치 문구가 함께 탑승동이라고 말할 때만 인정한다", () => {
  // 실제로 공급자가 보낸 형태. 안내서에 없는 코드지만 자기 위치 문구가
  // 같은 건물을 한국어로 직접 말한다.
  const proven = resolveFacilityTerminal("P02", "탑승동 3층 105번 게이트 부근");
  assert.equal(proven.terminal, "CONCOURSE");
  assert.equal(proven.evidence, "UNDOCUMENTED_CODE_WITH_LOCATION_TEXT");

  // 코드만으로는 안 된다. 문서에 없는 코드는 공급자가 언제든 다시 배정할 수
  // 있으므로, 두 번째 증거 없이는 미해결로 남긴다.
  const codeOnly = resolveFacilityTerminal("P02", "3층 면세지역");
  assert.equal(codeOnly.terminal, null);
  assert.equal(codeOnly.evidence, "NONE");
  assert.equal(resolveFacilityTerminal("P02", null).terminal, null);
});

test("위치 문구가 건물을 직접 말하면 코드가 없어도 인정한다", () => {
  for (const [location, expected] of [
    ["제1여객터미널 3층 면세지역 27번 게이트 부근", "T1"],
    ["제2여객터미널 3층 면세지역 251번 게이트 부근", "T2"],
    ["제1교통센터 지하1층", "T1_TRANSPORT"],
    ["제2교통센터 지하1층", "T2_TRANSPORT"],
    ["탑승동 4층 중앙", "CONCOURSE"],
  ]) {
    const { terminal, evidence } = resolveFacilityTerminal(null, location);
    assert.equal(terminal, expected, location);
    assert.equal(evidence, "OFFICIAL_LOCATION_TEXT");
  }
});

test("더 구체적인 건물이 이긴다 — 탑승동은 자기 모(母)터미널에 흡수되지 않는다", () => {
  // 실제 행: 제1여객터미널과 탑승동이 한 문장에 같이 나온다. 시설이 실제로
  // 있는 곳은 탑승동이다.
  assert.equal(resolveFacilityTerminal(null, "제1여객터미널 탑승동 3층 117번 게이트 부근").terminal, "CONCOURSE");
  assert.equal(resolveFacilityTerminal("P02", "인천국제공항 제1터미널 탑승동 동편").terminal, "CONCOURSE");
});

test("공식 근거가 없으면 추측하지 않고 미해결로 남긴다", () => {
  for (const [code, location] of [
    [null, "3층 면세지역"],
    ["ZZ9", "지하 1층"],
    [null, null],
    ["", ""],
    // 브랜드·업종·게이트 번호만으로는 절대 추론하지 않는다.
    [null, "신라면세점 부근"],
    [null, "251번 게이트 부근"],
  ]) {
    const { terminal, evidence } = resolveFacilityTerminal(code, location);
    assert.equal(terminal, null, `${code} / ${location}`);
    assert.equal(evidence, "NONE");
  }
});

test("정규화는 브랜드나 업종을 근거로 삼지 않는다", async () => {
  const source = await readFile(new URL("../lib/airport-facilities.ts", import.meta.url), "utf8");
  const resolver = source.match(/export function resolveFacilityTerminal[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(resolver.length > 0);
  for (const forbidden of ["nameKo", "categoryGroup", "largeCategory", "facilityItem", "goodsBrands", "facilityId"]) {
    assert.equal(resolver.includes(forbidden), false, `터미널을 ${forbidden} 로 추론하면 안 된다`);
  }
});
