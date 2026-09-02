import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { collectSeoulSubwayRidership } from "../lib/collector";
import {
  SEOUL_SUBWAY_DATASET_ID,
  SEOUL_SUBWAY_MAPPING_VERSION,
  SUBWAY_AREA_STATIONS,
  normalizeSubwayRidershipPayload,
  subwayBackfillDates,
} from "../lib/subway-ridership";

const station = SUBWAY_AREA_STATIONS.myeongdong[0];

function officialPayload(rows: unknown[], totalCount = rows.length) {
  return {
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_CODE" },
      body: { totalCount, items: { item: rows } },
    },
  };
}

test("OA-22723 station mapping is conservative, explicit, and versioned", () => {
  assert.equal(SEOUL_SUBWAY_DATASET_ID, "OA-22723");
  assert.equal(SEOUL_SUBWAY_MAPPING_VERSION, "oa-22723-area-stations-2026-09-02-v1");
  assert.deepEqual(SUBWAY_AREA_STATIONS, {
    myeongdong: [{ stationCode: "0424", stationNumber: "424", stationName: "명동", lineName: "4호선" }],
    hongdae: [{ stationCode: "0239", stationNumber: "239", stationName: "홍대입구", lineName: "2호선" }],
    seongsu: [{ stationCode: "0211", stationNumber: "211", stationName: "성수", lineName: "2호선" }],
  });
});

test("initial collection is bounded to the seven completed KST days", () => {
  assert.deepEqual(subwayBackfillDates(new Date("2026-09-02T00:00:00Z")), [
    "2026-09-01", "2026-08-31", "2026-08-30", "2026-08-29",
    "2026-08-28", "2026-08-27", "2026-08-26",
  ]);
});

test("current OA-22723 response sums disjoint card and user rows without losing boarding/alighting meaning", () => {
  const result = normalizeSubwayRidershipPayload(officialPayload([
    { pasngDe: "20260901", pasngHr: "08", stnCd: "0424", stnNo: "424", stnNm: "명동", lineNm: "4호선", rideNope: 10, gffNope: 20 },
    { pasngDe: "20260901", pasngHr: "08", stnCd: "0424", stnNo: "424", stnNm: "명동", lineNm: "4호선", rideNope: 2, gffNope: 3 },
  ]), "2026-09-01", station);

  assert.deepEqual(result, {
    station,
    referenceDate: "2026-09-01",
    boardingCount: 12,
    alightingCount: 23,
    sourceRowsRead: 2,
  });
});

test("collector cannot silently accept a partial page or a mismatched station", () => {
  const row = { pasngDe: "20260901", pasngHr: "08", stnCd: "0424", stnNo: "424", stnNm: "명동", lineNm: "4호선", rideNope: 1, gffNope: 2 };
  assert.throws(
    () => normalizeSubwayRidershipPayload(officialPayload([row], 2), "2026-09-01", station),
    /subway_page_incomplete/,
  );
  assert.throws(
    () => normalizeSubwayRidershipPayload(officialPayload([{ ...row, stnCd: "9999" }]), "2026-09-01", station),
    /subway_station_mismatch/,
  );
});

test("official error codes fail closed and do not become zero traffic", () => {
  assert.throws(() => normalizeSubwayRidershipPayload({
    response: { header: { resultCode: "03", resultMsg: "NO_DATA" }, body: { totalCount: 0, items: { item: [] } } },
  }, "2026-09-01", station), /subway_provider_03/);
});

class LocalD1Statement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}
  bind(...values: SQLInputValue[]) { this.values = values; return this; }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), rows_written: Number(result.changes) } };
  }
  async all<T>() { return { success: true, results: this.statement.all(...this.values) as T[] }; }
}

class LocalD1Database {
  constructor(private readonly database: DatabaseSync) {}
  prepare(query: string) { return new LocalD1Statement(this.database.prepare(query)); }
  async batch(statements: LocalD1Statement[]) { return Promise.all(statements.map((statement) => statement.run())); }
}

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    database.exec(readFileSync(`drizzle/${file}`, "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  return database;
}

function payloadFor(referenceDate: string, selectedStation: typeof station) {
  const compact = referenceDate.replaceAll("-", "");
  return officialPayload([{
    pasngDe: compact,
    pasngHr: "23",
    stnCd: selectedStation.stationCode,
    stnNo: selectedStation.stationNumber,
    stnNm: selectedStation.stationName,
    lineNm: selectedStation.lineName,
    rideNope: 10,
    gffNope: 20,
  }]);
}

test("collector performs one bounded seven-day backfill and same-day rerun makes zero provider calls", async () => {
  const database = migratedDatabase();
  let calls = 0;
  const env = {
    DB: new LocalD1Database(database) as unknown as D1Database,
    SUBWAY_RIDERSHIP_SOURCE: {
      async fetchStationDay(referenceDate: string, selectedStation: typeof station) {
        calls += 1;
        return payloadFor(referenceDate, selectedStation);
      },
    },
  };

  const first = await collectSeoulSubwayRidership(env, new Date("2026-09-02T00:00:00Z"));
  const second = await collectSeoulSubwayRidership(env, new Date("2026-09-02T03:00:00Z"));
  assert.equal(first.status, "SUCCESS");
  assert.equal(first.providerRequests, 21);
  assert.equal(first.records, 21);
  assert.equal(second.status, "SUCCESS");
  assert.equal(second.providerRequests, 0);
  assert.equal(second.records, 0);
  assert.equal(calls, 21);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_subway_ridership").get()!.count, 21);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name LIKE '%raw%'").get()!.count, 0);
  database.close();
});

test("next daily run requests only the newly completed day and keeps compact history", async () => {
  const database = migratedDatabase();
  let calls = 0;
  const env = {
    DB: new LocalD1Database(database) as unknown as D1Database,
    SUBWAY_RIDERSHIP_SOURCE: {
      async fetchStationDay(referenceDate: string, selectedStation: typeof station) {
        calls += 1;
        return payloadFor(referenceDate, selectedStation);
      },
    },
  };
  await collectSeoulSubwayRidership(env, new Date("2026-09-02T00:00:00Z"));
  calls = 0;
  const next = await collectSeoulSubwayRidership(env, new Date("2026-09-03T00:00:00Z"));
  assert.equal(next.providerRequests, 3);
  assert.equal(next.records, 3);
  assert.equal(calls, 3);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_subway_ridership").get()!.count, 24);
  database.close();
});

test("schema failure preserves last-good history and marks the source stale", async () => {
  const database = migratedDatabase();
  const goodEnv = {
    DB: new LocalD1Database(database) as unknown as D1Database,
    SUBWAY_RIDERSHIP_SOURCE: {
      async fetchStationDay(referenceDate: string, selectedStation: typeof station) {
        return payloadFor(referenceDate, selectedStation);
      },
    },
  };
  await collectSeoulSubwayRidership(goodEnv, new Date("2026-09-02T00:00:00Z"));
  const failed = await collectSeoulSubwayRidership({
    DB: goodEnv.DB,
    SUBWAY_RIDERSHIP_SOURCE: { async fetchStationDay() { return officialPayload([{ broken: true }]); } },
  }, new Date("2026-09-03T00:00:00Z"));
  assert.equal(failed.status, "ERROR");
  assert.equal(failed.sourceHealth, "STALE");
  assert.equal(failed.lastGoodPreserved, true);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM seoul_subway_ridership").get()!.count, 21);
  database.close();
});
