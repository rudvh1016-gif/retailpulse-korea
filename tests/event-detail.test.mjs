import assert from "node:assert/strict";
import { readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { collectTourismEvents, TOURAPI_DETAIL_POLICY } from "../lib/collector.ts";
import { cleanOfficialText, normalizeTourismEvent, normalizeTourismEventDetail } from "../lib/source-adapters.ts";

/**
 * The event card may show only what the official provider says: its category
 * name (categoryCode2), its own overview and homepage (detailCommon2). Each is
 * fetched once by the daily collector, stored in D1, and read from there. The
 * browser never calls the provider and nothing is written by a model.
 */

class LocalD1Statement {
  values = [];
  constructor(statement) { this.statement = statement; }
  bind(...values) { this.values = values; return this; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), rows_written: Number(result.changes) } };
  }
  async all() {
    return { success: true, results: this.statement.all(...this.values), meta: {} };
  }
}

class LocalD1Database {
  constructor(database) { this.database = database; }
  prepare(query) { return new LocalD1Statement(this.database.prepare(query)); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

const migrations = readdirSync("drizzle").filter((file) => file.endsWith(".sql")).sort().map((file) => join("drizzle", file));

function openDatabase(name) {
  const databasePath = join(tmpdir(), `rpk-event-detail-${name}-${process.pid}.db`);
  const database = new DatabaseSync(databasePath);
  for (const file of migrations) database.exec(readFileSync(file, "utf8").replaceAll("--> statement-breakpoint", ""));
  return { database, databasePath };
}

const envelope = (items) => Response.json({ response: { header: { resultCode: "0000" }, body: { items: items.length ? { item: items } : "" } } });

const FESTIVALS = [
  { contentid: "100", title: "명동 페스티벌", addr1: "서울특별시 중구 명동길 14", addr2: "(명동1가)", tel: "02-000-0000",
    cat1: "A02", cat2: "A0207", cat3: "A02070200", mapx: "126.9840", mapy: "37.5640",
    eventstartdate: "20260820", eventenddate: "20260910", modifiedtime: "20260825120000" },
  { contentid: "200", title: "성수 마켓", addr1: "서울특별시 성동구 연무장길 1", cat1: "A02", cat2: "A0207", cat3: "A02070200",
    mapx: "127.0550", mapy: "37.5450", eventstartdate: "20260901", eventenddate: "20260905", modifiedtime: "20260825120000" },
];

const CATEGORY_CODES = [
  { code: "A02070100", name: "문화관광축제", rnum: 1 },
  { code: "A02070200", name: "일반축제", rnum: 2 },
];

const DETAILS = {
  100: { contentid: "100", overview: "명동 일대에서 열리는 <b>거리 축제</b>입니다.<br>매일 저녁 공연이 이어집니다.", homepage: "<a href=\"https://example.org/fest\" target=\"_blank\">example.org</a>", tel: "02-000-0000" },
  200: { contentid: "200", overview: "성수동 골목 마켓.", homepage: "" },
};

/** A fetch double that answers by operation and records every call it saw. */
function officialProvider({ detailFailures = new Set() } = {}) {
  const calls = [];
  const fetch = async (input) => {
    const url = new URL(String(input));
    const operation = url.pathname.split("/").pop();
    calls.push({ operation, contentId: url.searchParams.get("contentId"), cat2: url.searchParams.get("cat2") });
    if (operation === "searchFestival2") return envelope(FESTIVALS);
    if (operation === "categoryCode2") return envelope(CATEGORY_CODES);
    if (operation === "detailCommon2") {
      const contentId = url.searchParams.get("contentId");
      // A provider-level failure code. (An HTTP 5xx would also work, but the
      // real retry policy would then spend real seconds backing off.)
      if (detailFailures.has(contentId)) return Response.json({ response: { header: { resultCode: "30" } } });
      return envelope(DETAILS[contentId] ? [DETAILS[contentId]] : []);
    }
    throw new Error(`unexpected operation ${operation}`);
  };
  return { calls, fetch, count: (operation) => calls.filter((call) => call.operation === operation).length };
}

test("the list adapter keeps the official codes, detailed address and phone it already receives", async () => {
  const canonical = await normalizeTourismEvent({ ...FESTIVALS[0], dist: "120" }, "myeongdong", "2026-08-27T15:00:00Z");
  assert.equal(canonical.categoryTopCode, "A02");
  assert.equal(canonical.categoryGroupCode, "A0207");
  assert.equal(canonical.categoryCode, "A02070200");
  assert.equal(canonical.addressDetail, "(명동1가)");
  assert.equal(canonical.tel, "02-000-0000");
  const bare = await normalizeTourismEvent({ ...FESTIVALS[1], dist: "120" }, "seongsu", "2026-08-27T15:00:00Z");
  assert.equal(bare.addressDetail, null, "an absent official field stays null, never a placeholder");
  assert.equal(bare.tel, null);
});

test("official detail text is cleaned deterministically, never rewritten", () => {
  const detail = normalizeTourismEventDetail(DETAILS[100]);
  assert.equal(detail.overview, "명동 일대에서 열리는 거리 축제 입니다. 매일 저녁 공연이 이어집니다.");
  assert.equal(detail.homepage, "https://example.org/fest", "the anchor's href is the homepage, not its markup");
  assert.equal(detail.tel, "02-000-0000");
  assert.equal(normalizeTourismEventDetail({ contentid: "9" }), null, "no official field means no detail");
  assert.equal(normalizeTourismEventDetail("not an item"), null);
  assert.equal(normalizeTourismEventDetail(DETAILS[200]).homepage, null, "an empty homepage is absent, not a broken link");
});

test("a long overview is cut at a word boundary and marked as cut", () => {
  const words = Array.from({ length: 200 }, (_, index) => `단어${index}`).join(" ");
  const cut = cleanOfficialText(words, 100);
  assert.ok(cut.length <= 101, "excerpt respects its budget");
  assert.ok(cut.endsWith("…"), "a cut excerpt says it was cut");
  assert.doesNotMatch(cut.slice(0, -1), /단어\d*$/u.source === "" ? /$^/ : /\s$/, "no trailing whitespace before the ellipsis");
  assert.equal(cleanOfficialText("  <p>짧은 설명</p>  "), "짧은 설명");
  assert.equal(cleanOfficialText(""), null);
  assert.equal(cleanOfficialText(42), null);
});

test("the collector fetches the official detail once per contentId and reads D1 after that", async (context) => {
  const { database, databasePath } = openDatabase("once");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });
  const provider = officialProvider();
  globalThis.fetch = provider.fetch;
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };

  const first = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(first.status, "SUCCESS");
  assert.equal(provider.count("searchFestival2"), 1, "the list is still one call");
  assert.equal(provider.count("categoryCode2"), 1, "one cat2 group, one lookup");
  assert.equal(provider.count("detailCommon2"), 2, "one detail call per new contentId");
  assert.equal(first.providerRequests, 4);
  assert.match(first.detail, /category lookups 1; categories named 2; detail fetched 2\/2/);

  const rows = database.prepare(`SELECT content_id AS contentId, category_code AS categoryCode, category_name AS categoryName,
      address_detail AS addressDetail, tel, overview, homepage, detail_retrieved_at AS detailRetrievedAt
    FROM tourism_events ORDER BY content_id`).all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].categoryName, "일반축제", "the name comes from the official code table");
  assert.equal(rows[0].overview, "명동 일대에서 열리는 거리 축제 입니다. 매일 저녁 공연이 이어집니다.");
  assert.equal(rows[0].homepage, "https://example.org/fest");
  assert.equal(rows[0].addressDetail, "(명동1가)");
  assert.ok(rows[0].detailRetrievedAt, "the fetch is recorded so it never repeats");
  assert.equal(rows[1].overview, "성수동 골목 마켓.");
  assert.equal(rows[1].homepage, null);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM tourapi_category_codes").get().count, 2);

  const second = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(second.status, "SUCCESS");
  assert.equal(provider.count("searchFestival2"), 2);
  assert.equal(provider.count("categoryCode2"), 1, "a cached category group is not looked up again");
  assert.equal(provider.count("detailCommon2"), 2, "a fetched contentId is not fetched again");
  assert.equal(second.providerRequests, 1, "a steady-state run is the one list call");
  assert.equal(second.records, 0, "nothing changed, nothing written");
});

test("a failed detail fetch is retried next run and never fails the list collection", async (context) => {
  const { database, databasePath } = openDatabase("retry");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });
  const provider = officialProvider({ detailFailures: new Set(["200"]) });
  globalThis.fetch = provider.fetch;
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };

  const first = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(first.status, "SUCCESS", "the list result stands on its own");
  assert.match(first.detail, /detail fetched 1\/2; detail failed 1/);
  const pending = database.prepare("SELECT content_id AS contentId FROM tourism_events WHERE detail_retrieved_at IS NULL").all();
  assert.deepEqual(pending.map((row) => row.contentId), ["200"]);

  provider.calls.length = 0;
  const second = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(second.status, "SUCCESS");
  assert.deepEqual(provider.calls.filter((call) => call.operation === "detailCommon2").map((call) => call.contentId), ["200"],
    "only the contentId that failed is asked again");
  assert.equal(second.providerRequests, 2);
});

test("provider follow-up calls are capped per run, so a big list cannot spend the quota", async (context) => {
  const { database, databasePath } = openDatabase("cap");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });
  const many = Array.from({ length: 40 }, (_, index) => ({
    ...FESTIVALS[0], contentid: String(1000 + index), title: `행사 ${index}`,
    cat2: `A02${String(index % 5).padStart(2, "0")}`, cat3: `A02${String(index % 5).padStart(2, "0")}0100`,
  }));
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const operation = url.pathname.split("/").pop();
    calls.push(operation);
    if (operation === "searchFestival2") return envelope(many);
    if (operation === "categoryCode2") return envelope([{ code: `${url.searchParams.get("cat2")}0100`, name: "이름", rnum: 1 }]);
    return envelope([{ overview: "설명" }]);
  };
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  const result = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(result.status, "SUCCESS");
  assert.equal(calls.filter((operation) => operation === "categoryCode2").length, TOURAPI_DETAIL_POLICY.maxCategoryLookups);
  assert.equal(calls.filter((operation) => operation === "detailCommon2").length, TOURAPI_DETAIL_POLICY.maxDetailFetches);
  assert.ok(1 + TOURAPI_DETAIL_POLICY.maxCategoryLookups + TOURAPI_DETAIL_POLICY.maxDetailFetches <= 16,
    "worst case stays a small fraction of the 1,000/day development quota");
});

test("a detail fetch failure of any kind leaves the list result and status untouched", async (context) => {
  const { database, databasePath } = openDatabase("robust");
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; database.close(); unlinkSync(databasePath); });
  globalThis.fetch = async (input) => {
    const operation = new URL(String(input)).pathname.split("/").pop();
    if (operation === "searchFestival2") return envelope(FESTIVALS);
    return Response.json({ response: { header: { resultCode: "30" } } });
  };
  const env = { DB: new LocalD1Database(database), DATA_GO_KR_SERVICE_KEY: "fixture" };
  const result = await collectTourismEvents(env, new Date("2026-08-27T15:00:00Z"));
  assert.equal(result.status, "SUCCESS");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM tourism_events").get().count, 2, "the events are stored regardless");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM tourism_events WHERE overview IS NOT NULL").get().count, 0,
    "no description is invented when the provider has none");
});

/**
 * Where the provider may be called from. The page reads D1 through the
 * summary API; no browser code and no request handler calls TourAPI.
 */
test("TourAPI is called only by the collector, never by the page or the summary API", () => {
  const route = readFileSync("app/api/live/summary/route.ts", "utf8");
  assert.doesNotMatch(route, /KorService2|detailCommon2|fetchOfficialJson|data\.go\.kr/);
  for (const file of readdirSync("app").filter((name) => name.endsWith(".tsx"))) {
    assert.doesNotMatch(readFileSync(join("app", file), "utf8"), /KorService2|detailCommon2|data\.go\.kr/, `${file} must not reach the provider`);
  }
  const collector = readFileSync("lib/collector.ts", "utf8");
  assert.match(collector, /WHERE detail_retrieved_at IS NULL/, "only never-fetched contentIds are asked about");
  assert.doesNotMatch(collector, /generateDescription|guessDescription|openai|anthropic/i, "no model writes event text");
});

test("the migration is additive and rewrites no stored event", () => {
  const migration = readFileSync("drizzle/0009_event_official_detail.sql", "utf8");
  assert.doesNotMatch(migration, /\bUPDATE\b|\bDELETE\b|\bDROP\b/);
  for (const column of ["category_code", "category_name", "address_detail", "tel", "overview", "homepage", "detail_retrieved_at"]) {
    assert.ok(migration.includes(column), `${column} must be added`);
  }
  assert.match(migration, /CREATE TABLE `tourapi_category_codes`/);
});
