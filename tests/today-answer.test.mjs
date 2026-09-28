import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  airportAnswerText,
  areaAnswerText,
  composeTodayAnswer,
  readTodayAnswer,
  shareAnswerText,
  resetTodayAnswerMemo,
} from "../lib/today-answer.ts";

// 2026-09-28 10:00 KST.
const NOW = Date.parse("2026-09-28T10:00:00+09:00");
const DAY = "2026-09-28";

function hourRows(terminal, peakHour, { skipHour = null, day = DAY } = {}) {
  const rows = [];
  for (let h = 0; h < 24; h += 1) {
    if (h === skipHour) continue;
    const start = `${day}T${String(h).padStart(2, "0")}:00:00+09:00`;
    const end = h === 23 ? "2026-09-29T00:00:00+09:00" : `${day}T${String(h + 1).padStart(2, "0")}:00:00+09:00`;
    rows.push({
      terminal, direction: "departure", isAggregate: 1, targetDate: day, timeBandRaw: `${h}_${h + 1}`,
      targetStartAt: start, targetEndAt: end, expectedPassengers: h === peakHour ? 5432 : 1000 + h,
      retrievedAt: "2026-09-27T21:00:00+09:00",
    });
  }
  return rows;
}

test("a complete official day gives each terminal its busiest departure hour", () => {
  const answer = composeTodayAnswer([...hourRows("T1", 7), ...hourRows("T2", 18)], [], NOW);
  assert.equal(answer.serviceDate, DAY);
  assert.equal(answer.airportPeak.T1.targetStartAt, `${DAY}T07:00:00+09:00`);
  assert.equal(answer.airportPeak.T2.targetStartAt, `${DAY}T18:00:00+09:00`);
  const ko = airportAnswerText(answer, "ko");
  assert.match(ko, /T1 07:00–08:00 \(약 5,432명\)/);
  assert.match(ko, /T2 18:00–19:00/);
  // Expected passengers, never a congestion or wait claim.
  assert.doesNotMatch(ko, /혼잡|대기/);
  for (const lang of ["en", "zh", "ja"]) assert.ok(airportAnswerText(answer, lang).includes("07:00–08:00"));
});

test("a terminal whose day is not complete says nothing rather than a partial peak", () => {
  const answer = composeTodayAnswer([...hourRows("T1", 7, { skipHour: 3 }), ...hourRows("T2", 18)], [], NOW);
  assert.equal(answer.airportPeak.T1, null);
  assert.ok(answer.airportPeak.T2);
  assert.doesNotMatch(airportAnswerText(answer, "ko"), /T1/);
  const none = composeTodayAnswer([...hourRows("T1", 7, { skipHour: 3 })], [], NOW);
  assert.equal(none.airportPeak, null);
  assert.equal(airportAnswerText(none, "ko"), null);
});

test("yesterday's forecast never answers for today", () => {
  const answer = composeTodayAnswer(hourRows("T1", 7, { day: "2026-09-27" }), [], NOW);
  assert.equal(answer.airportPeak, null);
});

test("area congestion is shown only when fresh and valid", () => {
  const answer = composeTodayAnswer([], [
    { area: "myeongdong", level: 3, observedAt: "2026-09-28T09:40:00+09:00" },
    { area: "hongdae", level: 2, observedAt: "2026-09-28T07:00:00+09:00" }, // 3h old
    { area: "seongsu", level: 9, observedAt: "2026-09-28T09:50:00+09:00" }, // not a level
  ], NOW);
  assert.deepEqual(Object.keys(answer.areas), ["myeongdong"]);
  assert.equal(areaAnswerText(answer, "ko"), "지금(09:40 KST) 서울시 실시간 혼잡도: 명동 약간 붐빔");
  assert.equal(areaAnswerText(answer, "ko", "hongdae"), null);
  assert.match(areaAnswerText(answer, "en", "myeongdong"), /Myeongdong slightly busy/);
});

/** A D1 double over node:sqlite with the real migrations. */
function openDatabase() {
  const database = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort()) {
    database.exec(readFileSync(join("drizzle", file), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  const trips = [];
  const statement = (sql) => ({ sql, values: [], bind(...values) { this.values = values; return this; } });
  return {
    database,
    trips,
    client: {
      prepare: statement,
      async batch(statements) {
        trips.push(statements.length);
        return statements.map((s) => ({ results: database.prepare(s.sql).all(...s.values) }));
      },
    },
  };
}

test("reads through the real schema in one batch and remembers the answer for a minute", async () => {
  resetTodayAnswerMemo();
  const { database, client, trips } = openDatabase();
  const insert = database.prepare(`INSERT INTO airport_passenger_forecast (id, source_id, record_origin, terminal, direction, zone, is_aggregate, target_date, time_band_raw, target_start_at, target_end_at, expected_passengers, retrieved_at, schema_version, quality_status, source_hash)
    VALUES (?, 'A5', 'LIVE', ?, 'departure', 'ALL', 1, ?, ?, ?, ?, ?, ?, 'v1', 'VALID', 'h')`);
  for (const row of [...hourRows("T1", 7), ...hourRows("T2", 18)]) {
    insert.run(`${row.terminal}-${row.timeBandRaw}`, row.terminal, row.targetDate, row.timeBandRaw, row.targetStartAt, row.targetEndAt, row.expectedPassengers, row.retrievedAt);
  }
  database.prepare(`INSERT INTO seoul_realtime_area (id, source_id, record_origin, area, area_code, area_name, congestion_level, congestion_label, population_min, population_max, observed_at, retrieved_at, freshness, schema_version, quality_status, source_hash)
    VALUES ('r1', 'SEOUL_CITYDATA_PPLTN', 'LIVE', 'myeongdong', 'POI014', '명동', 4, '붐빔', 1, 2, '2026-09-28T09:55:00+09:00', '2026-09-28T09:56:00+09:00', 'FRESH', 'v1', 'VALID', 'h')`).run();

  const answer = await readTodayAnswer(client, NOW);
  assert.equal(trips.length, 1, "one D1 round trip");
  assert.equal(answer.airportPeak.T1.expectedPassengers, 5432);
  assert.equal(answer.areas.myeongdong.level, 4);

  await readTodayAnswer(client, NOW + 30_000);
  assert.equal(trips.length, 1, "served from the per-isolate memo within a minute");
  await readTodayAnswer(client, NOW + 61_000);
  assert.equal(trips.length, 2);
  database.close();
});

test("a failing database yields no answer, never a guessed one", async () => {
  resetTodayAnswerMemo();
  const broken = { prepare: () => ({ bind() { return this; } }), batch: async () => { throw new Error("D1 down"); } };
  assert.equal(await readTodayAnswer(broken, NOW), null);
  assert.equal(airportAnswerText(null, "ko"), null);
  assert.equal(areaAnswerText(null, "ko"), null);
});

test("a shared link previews the answer with its own date and never says today or now", () => {
  const answer = composeTodayAnswer([...hourRows("T1", 7), ...hourRows("T2", 18)], [
    { area: "myeongdong", level: 3, observedAt: "2026-09-28T09:40:00+09:00" },
  ], NOW);
  const airport = shareAnswerText(answer, "ko", "airport");
  assert.equal(airport, "9월 28일 인천공항 출국 예상 승객이 가장 많은 시간: T1 07:00–08:00 (약 5,432명) · T2 18:00–19:00 (약 5,432명) — 인천공항 공식 예고");
  assert.equal(shareAnswerText(answer, "ko", "myeongdong"), "9월 28일 09:40 KST 기준 명동 서울시 실시간 혼잡도: 약간 붐빔");
  for (const lang of ["ko", "en", "zh", "ja"]) {
    const texts = [shareAnswerText(answer, lang, "airport"), shareAnswerText(answer, lang, "myeongdong")];
    for (const text of texts) {
      assert.ok(text);
      assert.doesNotMatch(text, /오늘|지금|[Tt]oday|[Nn]ow\b|今天|现在|今日|いま/);
    }
  }
  assert.match(shareAnswerText(answer, "en", "airport"), /^Sep 28/);
  assert.doesNotMatch(shareAnswerText(answer, "ko", "airport"), /혼잡|대기/);
  // No answer for a page: the ordinary description stays.
  assert.equal(shareAnswerText(answer, "ko", "hongdae"), null);
  assert.equal(shareAnswerText(null, "ko", "airport"), null);
  assert.equal(shareAnswerText(composeTodayAnswer([], [], NOW), "ko", "airport"), null);
});
