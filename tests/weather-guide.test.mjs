import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildWeatherGuide,
  deriveWeatherGuideKind,
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
