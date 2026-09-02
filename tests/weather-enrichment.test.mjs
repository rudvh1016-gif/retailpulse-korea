import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseKmaAmount,
  parseKmaInteger,
  parseKmaTenths,
  parsePrecipitationTypeCode,
  parseSkyCode,
} from "../lib/kma-categories.ts";
import { normalizeWeatherForecast } from "../lib/source-adapters.ts";

/**
 * W1 enrichment reads more of the response KMA already sends. The whole point
 * is that it costs no extra provider request, and that the qualitative
 * categories are never turned into measurements the provider did not make.
 */

const item = (category, fcstValue, overrides = {}) => ({
  baseDate: "20260902", baseTime: "1100",
  fcstDate: "20260902", fcstTime: "1500",
  category, fcstValue, ...overrides,
});

const RETRIEVED_AT = "2026-09-02T02:40:38.026Z";

async function normalizeOne(items) {
  const rows = await normalizeWeatherForecast(items, "myeongdong", RETRIEVED_AT);
  assert.equal(rows.length, 1, "one target hour must produce exactly one canonical row");
  return rows[0];
}

test("humidity, wind and the daily extremes are read from the same response", async () => {
  const row = await normalizeOne([
    item("POP", "30"), item("TMP", "24.5"), item("SKY", "3"), item("PTY", "0"),
    item("REH", "75"), item("WSD", "3.4"), item("TMN", "18.0"), item("TMX", "29.0"),
  ]);
  assert.equal(row.humidityPercent, 75);
  assert.equal(row.windSpeedTenthMps, 34, "wind is stored in tenths, like temperature");
  assert.equal(row.dailyMinTemperatureTenthC, 180);
  assert.equal(row.dailyMaxTemperatureTenthC, 290);
  assert.equal(row.temperatureTenthC, 245, "the existing temperature reading is unchanged");
  assert.equal(row.precipitationProbability, 30);
});

test("TMN and TMX are absent at most target hours, and that is not a defect", async () => {
  const row = await normalizeOne([item("POP", "10"), item("TMP", "21.0"), item("REH", "60")]);
  assert.equal(row.dailyMinTemperatureTenthC, null);
  assert.equal(row.dailyMaxTemperatureTenthC, null);
  assert.equal(row.qualityStatus, "VALID", "a row with POP and TMP is complete enough");
});

/**
 * The sharp edge: PCP and SNO are documented as qualitative values. Turning
 * "1.0mm 미만" into 1.0 would publish a bound as a measurement.
 */
test("a precipitation bound is never stored as an exact amount", async () => {
  const row = await normalizeOne([item("POP", "60"), item("TMP", "20.0"), item("PCP", "1.0mm 미만")]);
  assert.equal(row.precipitationAmountRaw, "1.0mm 미만", "the provider's own words are the record");
  assert.equal(row.precipitationAmountKind, "BELOW");
  assert.equal(row.precipitationAmountTenthMm, null, "less-than is not a measurement");
});

test("an exact precipitation amount is stored as a number and keeps its raw text", async () => {
  const row = await normalizeOne([item("POP", "80"), item("TMP", "19.0"), item("PCP", "3.5mm")]);
  assert.equal(row.precipitationAmountRaw, "3.5mm");
  assert.equal(row.precipitationAmountKind, "EXACT");
  assert.equal(row.precipitationAmountTenthMm, 35);
});

test("강수없음 stays categorical and never becomes the number zero", async () => {
  const row = await normalizeOne([item("POP", "0"), item("TMP", "22.0"), item("PCP", "강수없음")]);
  assert.equal(row.precipitationAmountRaw, "강수없음");
  assert.equal(row.precipitationAmountKind, "NONE");
  assert.equal(row.precipitationAmountTenthMm, null,
    "a categorical 'no precipitation' is not a measured 0.0mm");
});

test("ranges, lower bounds and snow follow the same rule", () => {
  assert.deepEqual(parseKmaAmount("30.0~50.0mm"), { raw: "30.0~50.0mm", kind: "RANGE", exact: null });
  assert.deepEqual(parseKmaAmount("50.0mm 이상"), { raw: "50.0mm 이상", kind: "AT_OR_ABOVE", exact: null });
  assert.deepEqual(parseKmaAmount("적설없음"), { raw: "적설없음", kind: "NONE", exact: null });
  assert.deepEqual(parseKmaAmount("1.0cm"), { raw: "1.0cm", kind: "EXACT", exact: 1 });
  assert.deepEqual(parseKmaAmount("0.5cm 미만"), { raw: "0.5cm 미만", kind: "BELOW", exact: null });
});

test("an unrecognized amount is kept raw rather than guessed at", () => {
  const parsed = parseKmaAmount("약간");
  assert.equal(parsed.kind, "UNKNOWN");
  assert.equal(parsed.raw, "약간", "the value survives so a later reading can interpret it");
  assert.equal(parsed.exact, null);
  assert.equal(parseKmaAmount(null), null);
  assert.equal(parseKmaAmount("   "), null);
});

test("snow amounts reach the canonical row with the same care", async () => {
  const row = await normalizeOne([item("POP", "70"), item("TMP", "-1.0"), item("SNO", "1.0cm 미만")]);
  assert.equal(row.snowAmountRaw, "1.0cm 미만");
  assert.equal(row.snowAmountKind, "BELOW");
  assert.equal(row.snowAmountTenthCm, null);
  assert.equal(row.temperatureTenthC, -10, "a sub-zero temperature is read correctly");
});

test("official sky and precipitation-type codes are kept beside the derived label", async () => {
  const rain = await normalizeOne([item("POP", "90"), item("TMP", "18.0"), item("SKY", "4"), item("PTY", "1")]);
  assert.equal(rain.skyCode, "4");
  assert.equal(rain.precipitationTypeCode, "1");
  assert.equal(rain.conditionCode, "rain", "the existing derived condition is unchanged");

  assert.equal(parseSkyCode("2"), null, "an undocumented sky code is not invented");
  assert.equal(parsePrecipitationTypeCode("9"), null);
  assert.equal(parseSkyCode("1"), "1");
  assert.equal(parsePrecipitationTypeCode("0"), "0");
});

test("a malformed numeric category is dropped rather than coerced", () => {
  for (const bad of ["", "   ", "없음", "N/A", "1,5", null, undefined]) {
    assert.equal(parseKmaInteger(bad), null, `${String(bad)} is not a number`);
    assert.equal(parseKmaTenths(bad), null, `${String(bad)} is not a number`);
  }
  assert.equal(parseKmaInteger("75"), 75);
  assert.equal(parseKmaTenths("3.4"), 34);
  assert.equal(parseKmaTenths("-1.5"), -15);
});

test("missing categories leave nulls, never fabricated readings", async () => {
  const row = await normalizeOne([item("POP", "10"), item("TMP", "20.0")]);
  for (const field of [
    "humidityPercent", "windSpeedTenthMps", "dailyMinTemperatureTenthC", "dailyMaxTemperatureTenthC",
    "precipitationAmountRaw", "precipitationAmountKind", "precipitationAmountTenthMm",
    "snowAmountRaw", "snowAmountKind", "snowAmountTenthCm", "skyCode", "precipitationTypeCode",
  ]) {
    assert.equal(row[field], null, `${field} must stay null when the category is absent`);
  }
});

test("every category of one target hour lands on one row, not several", async () => {
  const rows = await normalizeWeatherForecast([
    item("POP", "30"), item("TMP", "24.0"), item("REH", "70"), item("WSD", "2.0"),
    item("PCP", "강수없음"), item("SKY", "1"), item("PTY", "0"),
    item("POP", "40", { fcstTime: "1600" }), item("TMP", "23.0", { fcstTime: "1600" }),
  ], "hongdae", RETRIEVED_AT);
  assert.equal(rows.length, 2, "richer categories must not multiply the stored rows");
  assert.equal(rows[0].targetAt, "2026-09-02T15:00:00+09:00");
  assert.equal(rows[1].targetAt, "2026-09-02T16:00:00+09:00");
  assert.equal(rows[0].issuedAt, rows[1].issuedAt, "one issuance, two target hours");
});

test("a meaningful weather change changes the hash; an unchanged forecast does not", async () => {
  const base = [item("POP", "30"), item("TMP", "24.0"), item("REH", "70")];
  const same = await normalizeOne(base);
  const repeat = await normalizeOne(base);
  assert.equal(same.sourceHash, repeat.sourceHash, "an unchanged forecast must not trigger a write");

  const humidityChanged = await normalizeOne([item("POP", "30"), item("TMP", "24.0"), item("REH", "80")]);
  assert.notEqual(humidityChanged.sourceHash, same.sourceHash,
    "the new fields must participate in the semantic hash");
});

/**
 * The hard cost rule: enrichment must read more of the SAME response. If the
 * collector ever had to ask per category, the design would be wrong.
 */
test("reading more categories cannot add a provider request", () => {
  const collector = readFileSync("lib/collector.ts", "utf8");
  const weatherBlock = collector.slice(collector.indexOf("INSERT INTO weather_forecast") - 4000,
    collector.indexOf("INSERT INTO weather_forecast"));
  assert.equal((weatherBlock.match(/requestCount \+= 1/g) ?? []).length, 1,
    "the weather collector must count exactly one request per grid, not one per category");
  assert.doesNotMatch(collector, /for \(const category of/,
    "no per-category loop may drive a fetch");

  const adapter = readFileSync("lib/source-adapters.ts", "utf8");
  const normalizer = adapter.slice(adapter.indexOf("export async function normalizeWeatherForecast"));
  assert.doesNotMatch(normalizer.slice(0, 4000), /fetch\(|fetchOfficialJson/,
    "the normalizer parses a payload it is handed and never fetches");
});

test("the weather insert stays conflict-free so richer columns cost no extra writes", () => {
  const collector = readFileSync("lib/collector.ts", "utf8");
  const insert = collector.slice(collector.indexOf("INSERT INTO weather_forecast"));
  assert.match(insert.slice(0, 2000), /ON CONFLICT\(source_id, area, issued_at, target_at\) DO NOTHING/,
    "an already stored forecast target is never rewritten, so past rows keep their NULLs");
});

test("the migration is additive and backfills nothing", () => {
  const migration = readFileSync("drizzle/0008_weather_enrichment.sql", "utf8");
  assert.match(migration, /ALTER TABLE `weather_forecast` ADD/, "columns are added, not recreated");
  assert.doesNotMatch(migration, /\bUPDATE\b|\bDELETE\b|\bDROP\b/,
    "weather history is never rewritten or removed");
  for (const column of [
    "humidity_percent", "wind_speed_tenth_mps",
    "daily_min_temperature_tenth_c", "daily_max_temperature_tenth_c",
    "precipitation_amount_raw", "precipitation_amount_kind", "precipitation_amount_tenth_mm",
    "snow_amount_raw", "snow_amount_kind", "snow_amount_tenth_cm",
    "sky_code", "precipitation_type_code",
  ]) {
    assert.ok(migration.includes(column), `${column} must be added by the migration`);
  }
  assert.doesNotMatch(migration, /CREATE INDEX/,
    "no read path needs an index on these columns, and an unused index costs writes");
});
