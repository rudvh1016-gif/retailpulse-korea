import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildWeatherGuide,
  describeWindStrength,
  formatWeatherDetails,
  deriveWeatherGuideKind,
  readAirGrade,
  worseAirGrade,
  WEATHER_GUIDE_THRESHOLDS as T,
} from "../lib/weather-guide.ts";

const LANGS = ["ko", "en", "zh", "ja"];

const forecast = (overrides = {}) => ({
  temperatureTenthC: 200,
  dailyMinTemperatureTenthC: 180,
  dailyMaxTemperatureTenthC: 240,
  precipitationProbability: 0,
  precipitationTypeCode: "0",
  humidityPercent: 50,
  windSpeedTenthMps: 20,
  ...overrides,
});

test("compact weather facts retain zero and negative readings and omit unavailable values", () => {
  assert.equal(formatWeatherDetails(forecast({ temperatureTenthC: -25, humidityPercent: null, windSpeedTenthMps: 0 }), "ko"),
    "기온 -2.5°C · 바람 0m/s · 최저 18°C · 최고 24°C · 예보 강수확률 최대 0%");
  assert.equal(formatWeatherDetails(null, "ko"), "");
  const invalid = forecast({ temperatureTenthC: NaN, humidityPercent: 101, windSpeedTenthMps: -1,
    dailyMinTemperatureTenthC: null, dailyMaxTemperatureTenthC: Infinity, precipitationProbability: -1 });
  assert.equal(formatWeatherDetails(invalid, "ko"), "");
  for (const lang of LANGS) {
    const text = formatWeatherDetails(forecast(), lang);
    assert.ok(text.includes("20°C") && text.includes("50%") && text.includes("2m/s"));
    assert.doesNotMatch(text, /undefined|null|NaN/);
  }
});

test("nothing published means no sentence, not a cheerful default", () => {
  const empty = {
    temperatureTenthC: null, dailyMinTemperatureTenthC: null, dailyMaxTemperatureTenthC: null,
    precipitationProbability: null, precipitationTypeCode: null, humidityPercent: null, windSpeedTenthMps: null,
  };
  assert.equal(deriveWeatherGuideKind(empty), null);
  for (const lang of LANGS) assert.equal(buildWeatherGuide(empty, lang), null);
  // One published field is enough to say something.
  assert.equal(deriveWeatherGuideKind({ ...empty, temperatureTenthC: 200 }), "MILD");
});

test("rain thresholds are exact at their boundaries", () => {
  const at = (pop) => deriveWeatherGuideKind(forecast({ precipitationProbability: pop }));
  assert.equal(at(T.rainLikelyPercent), "RAIN_LIKELY");
  assert.equal(at(T.rainLikelyPercent - 1), "RAIN_POSSIBLE");
  assert.equal(at(T.rainPossiblePercent), "RAIN_POSSIBLE");
  assert.equal(at(T.rainPossiblePercent - 1), "MILD");
  assert.equal(at(100), "RAIN_LIKELY");
  assert.equal(at(0), "MILD");
});

test("falling precipitation is read from the official PTY code, never guessed from cold", () => {
  // Snow and sleet outrank probability: what is coming down matters most.
  assert.equal(deriveWeatherGuideKind(forecast({ precipitationTypeCode: "3", precipitationProbability: 10 })), "SNOW");
  assert.equal(deriveWeatherGuideKind(forecast({ precipitationTypeCode: "2", precipitationProbability: 0 })), "SNOW");
  assert.equal(deriveWeatherGuideKind(forecast({ precipitationTypeCode: "1", precipitationProbability: 0 })), "RAIN_LIKELY");
  assert.equal(deriveWeatherGuideKind(forecast({ precipitationTypeCode: "4", precipitationProbability: 0 })), "RAIN_LIKELY");
  // A freezing day with no precipitation type is cold, not snowing.
  assert.equal(deriveWeatherGuideKind(forecast({
    temperatureTenthC: -50, dailyMinTemperatureTenthC: -80, dailyMaxTemperatureTenthC: -20,
    precipitationTypeCode: "0", precipitationProbability: 0, windSpeedTenthMps: 10,
  })), "COLD");
});

test("hot needs humid too, at both boundaries", () => {
  const hot = (high, humidity) => deriveWeatherGuideKind(forecast({
    dailyMaxTemperatureTenthC: high, dailyMinTemperatureTenthC: high - 20,
    temperatureTenthC: high, humidityPercent: humidity,
  }));
  assert.equal(hot(T.hotTenthC, T.humidHotPercent), "HOT_HUMID");
  assert.equal(hot(T.hotTenthC - 1, T.humidHotPercent), "MILD", "warm but not hot is not a heat line");
  assert.equal(hot(T.hotTenthC, T.humidHotPercent - 1), "MILD", "dry heat is not the humid-heat line");
});

test("wind only earns a line when the day is not already warm", () => {
  const windy = (wind, temperature) => deriveWeatherGuideKind(forecast({
    windSpeedTenthMps: wind, temperatureTenthC: temperature,
    dailyMinTemperatureTenthC: temperature - 10, dailyMaxTemperatureTenthC: temperature + 10,
    humidityPercent: 50,
  }));
  assert.equal(windy(T.briskWindTenthMps, T.windChillTenthC), "WINDY_COLD");
  assert.equal(windy(T.briskWindTenthMps - 1, T.windChillTenthC), "MILD");
  // A breeze on a warm afternoon is a relief, not a reason for a jacket.
  assert.equal(windy(T.briskWindTenthMps, T.windChillTenthC + 1), "MILD");
  assert.equal(windy(120, 250), "MILD");
});

test("cold and the wide daily swing sit at their exact thresholds", () => {
  const swing = (low, high) => deriveWeatherGuideKind(forecast({
    temperatureTenthC: high, dailyMinTemperatureTenthC: low, dailyMaxTemperatureTenthC: high,
    windSpeedTenthMps: 10, humidityPercent: 50, precipitationProbability: 0,
  }));
  assert.equal(deriveWeatherGuideKind(forecast({
    temperatureTenthC: T.coldTenthC, dailyMinTemperatureTenthC: T.coldTenthC, dailyMaxTemperatureTenthC: T.coldTenthC,
    windSpeedTenthMps: 10, precipitationProbability: 0,
  })), "COLD");
  assert.equal(swing(160, 160 + T.wideSwingTenthC), "WIDE_DAILY_SWING");
  assert.equal(swing(160, 160 + T.wideSwingTenthC - 1), "MILD");
});

test("every kind has all four locales, and none of them is a machine-assembled fragment", async () => {
  const kinds = new Set();
  for (const input of [
    forecast({ precipitationTypeCode: "3" }),
    forecast({ precipitationProbability: 80 }),
    forecast({ precipitationProbability: 40 }),
    forecast({ temperatureTenthC: 300, dailyMaxTemperatureTenthC: 320, humidityPercent: 85 }),
    forecast({ windSpeedTenthMps: 90, temperatureTenthC: 120 }),
    forecast({ temperatureTenthC: 30, dailyMinTemperatureTenthC: 10, dailyMaxTemperatureTenthC: 60, windSpeedTenthMps: 10 }),
    forecast(),
    forecast({ temperatureTenthC: 200, dailyMinTemperatureTenthC: 100, dailyMaxTemperatureTenthC: 200 }),
  ]) {
    const kind = deriveWeatherGuideKind(input);
    kinds.add(kind);
    for (const lang of LANGS) {
      const line = buildWeatherGuide(input, lang);
      assert.ok(line && line.length > 0, `${kind} must have a ${lang} line`);
      // One line, and it never ends in a full stop — the same display-copy
      // rule the headings follow.
      assert.ok(!line.includes("\n"), `${kind} ${lang} must be one line`);
      assert.ok(!/[.。]$/.test(line), `${kind} ${lang} must not end in a terminal period`);
    }
  }
  assert.equal(kinds.size, 8, "every guide kind must be reachable from a real forecast");
});

test("no LLM, no network, no randomness — the same forecast always gives the same line", async () => {
  const source = await readFile(new URL("../lib/weather-guide.ts", import.meta.url), "utf8");
  for (const forbidden of ["fetch(", "Math.random", "Date.now", "new Date", "openai", "anthropic", "claude"]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `must not contain ${forbidden}`);
  }
  const input = forecast({ precipitationProbability: 65 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(buildWeatherGuide(input, "ko"), buildWeatherGuide(input, "ko"));
  }
});

test("the guide advises, it does not diagnose", async () => {
  const source = await readFile(new URL("../lib/weather-guide.ts", import.meta.url), "utf8");
  // Comments are stripped first: the module explains at length which
  // advisories it refuses to imitate, and a guard that trips on the word
  // "warning" inside that explanation would punish the reasoning.
  const shown = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  // No medical or emergency framing: heat-illness and exposure warnings are
  // the KMA's own advisories to publish, not a retail signal product's.
  for (const overclaim of ["온열질환", "저체온", "위험", "경보", "주의보", "danger", "warning", "emergency", "health"]) {
    assert.equal(shown.toLowerCase().includes(overclaim.toLowerCase()), false,
      `the weather line must not overclaim with "${overclaim}"`);
  }
});

/**
 * The two questions the numbers never answered.
 *
 * Owner, 2026-09-06: "문구에 미세먼지는 어떤지 바람의 세기는 센지도 한줄
 * 문구로 설명해줘 기존문구에 붙여서". "바람 2.5m/s" is a fact nobody can act
 * on unless they already know what 2.5 feels like, and the dust grade was
 * buried in a parenthesis after a μg/m³ figure.
 *
 * The clause is APPENDED — the existing sentence is never replaced — and
 * each half disappears when its own source published nothing, so the line
 * can never imply a reading that does not exist.
 */
const CLEAR_DAY = {
  temperatureTenthC: 230, dailyMinTemperatureTenthC: 190, dailyMaxTemperatureTenthC: 260,
  precipitationProbability: 0, precipitationTypeCode: "0", humidityPercent: 70, windSpeedTenthMps: 25,
};

test("wind strength is words, and the buckets are the ones KMA uses in plain speech", () => {
  assert.equal(describeWindStrength(0), "CALM");
  assert.equal(describeWindStrength(39), "CALM");
  assert.equal(describeWindStrength(40), "BREEZY");
  assert.equal(describeWindStrength(89), "BREEZY");
  assert.equal(describeWindStrength(90), "STRONG");
  assert.equal(describeWindStrength(null), null);
  assert.equal(describeWindStrength(-1), null, "a negative speed is not a light breeze");
});

test("the air grade is quoted from Seoul, never computed, and an unknown label is dropped", () => {
  assert.equal(readAirGrade("좋음"), "GOOD");
  assert.equal(readAirGrade("매우나쁨"), "VERY_BAD");
  assert.equal(readAirGrade("매우 나쁨"), "VERY_BAD");
  assert.equal(readAirGrade("Good"), null, "KORETAIL owns no PM scale, so it cannot invent a mapping");
  assert.equal(readAirGrade(null), null);
  // The worse of the two is what a person actually feels.
  assert.equal(worseAirGrade("좋음", "나쁨"), "BAD");
  assert.equal(worseAirGrade("보통", null), "MODERATE");
  assert.equal(worseAirGrade(null, null), null);
});

test("the guide appends dust and wind to the existing sentence, in every locale", () => {
  const base = { ko: "특별히 대비할 것 없는 무난한 날씨예요", en: "A mild day with nothing in particular to prepare for",
    zh: "天气平稳，无需特别准备", ja: "特に備えるものがない、過ごしやすい天気です" };
  const expected = {
    ko: /미세먼지는 좋음이고, 바람은 약해요/,
    en: /Air quality is good and the wind is light$/,
    zh: /空气质量为优，风力较弱/,
    ja: /大気質は良好で、風は弱めです/,
  };
  for (const lang of ["ko", "en", "zh", "ja"]) {
    const line = buildWeatherGuide(CLEAR_DAY, lang, { pm10Grade: "좋음", pm25Grade: "좋음" });
    assert.ok(line.startsWith(base[lang]), `${lang} must keep the original sentence, not replace it`);
    assert.match(line, expected[lang]);
  }
});

test("a half with no reading is left out rather than left dangling", () => {
  const noWind = { ...CLEAR_DAY, windSpeedTenthMps: null };
  assert.equal(buildWeatherGuide(noWind, "ko", { pm10Grade: "나쁨" }),
    "특별히 대비할 것 없는 무난한 날씨예요. 미세먼지는 나쁨이에요");
  assert.equal(buildWeatherGuide(CLEAR_DAY, "ko", {}),
    "특별히 대비할 것 없는 무난한 날씨예요. 바람은 약해요");
  // Neither reading: byte-for-byte the sentence this file shipped before.
  assert.equal(buildWeatherGuide(noWind, "ko", {}), "특별히 대비할 것 없는 무난한 날씨예요");
  assert.equal(buildWeatherGuide(noWind, "ko"), "특별히 대비할 것 없는 무난한 날씨예요",
    "the extras argument stays optional, so no existing caller changes meaning");
  // An unrecognised grade contributes nothing at all.
  assert.equal(buildWeatherGuide(noWind, "ko", { pm10Grade: "unknown-label" }),
    "특별히 대비할 것 없는 무난한 날씨예요");
});

test("no locale is left with a dangling conjunction or a doubled full stop", () => {
  for (const lang of ["ko", "en", "zh", "ja"]) {
    for (const extras of [{ pm10Grade: "보통" }, {}, { pm10Grade: "좋음", pm25Grade: "매우나쁨" }]) {
      for (const input of [CLEAR_DAY, { ...CLEAR_DAY, windSpeedTenthMps: null }]) {
        const line = buildWeatherGuide(input, lang, extras);
        assert.ok(line && line.trim().length > 0);
        assert.doesNotMatch(line, /\.\.|。。|, *$|、 *$|and *$/, `${lang} produced a broken tail: ${line}`);
      }
    }
  }
});
