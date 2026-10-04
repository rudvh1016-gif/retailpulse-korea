import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OBSERVATION_NOW_WINDOW_MS,
  describeObservationAge,
  explainObservationVsForecast,
  observationClock,
} from "../lib/observation-freshness.ts";

const LANGS = ["ko", "en", "zh", "ja"];

/**
 * The bug this file exists for.
 *
 * Seoul published 29.4°C at 14:50 and its collector then stopped succeeding.
 * Nine and a half hours later the screen still called that number "지금",
 * directly above a KMA forecast of 21°C for the actual current hour. Two
 * correct sources, one word of copy, and the owner reasonably read the pair
 * as a broken weather block.
 */
test("a nine-hour-old reading is never called 'now'", () => {
  const age = describeObservationAge("2026-09-06T14:50:00+09:00", "2026-09-07T00:17:00+09:00", "ko");
  assert.equal(age.isNow, false);
  assert.equal(age.clock, "09-06 14:50");
  assert.equal(age.ago, "9시간 27분 전");
});

test("a reading inside the freshness window is called 'now' and needs no explanation", () => {
  const age = describeObservationAge("2026-09-07T00:05:00+09:00", "2026-09-07T00:17:00+09:00", "ko");
  assert.equal(age.isNow, true);
  assert.equal(age.ago, null);
  assert.equal(explainObservationVsForecast(age, "ko"), null,
    "an observation and a forecast for the same hour agree closely enough that spelling out the difference is noise");
});

test("the window boundary is inclusive, and one minute past it is not", () => {
  const at = (ms) => new Date(Date.parse("2026-09-07T00:00:00+09:00") + ms).toISOString();
  const now = at(OBSERVATION_NOW_WINDOW_MS);
  assert.equal(describeObservationAge(at(0), now, "ko").isNow, true);
  assert.equal(describeObservationAge(at(-60_000), now, "ko").isNow, false);
});

/**
 * A stamp from the future cannot be an age. Treating it as "지금" would let a
 * provider clock skew re-introduce exactly the claim this module removes, so
 * it degrades to a plain record instead.
 */
test("a future-stamped reading is a record, not 'now'", () => {
  const age = describeObservationAge("2026-09-07T02:00:00+09:00", "2026-09-07T00:17:00+09:00", "ko");
  assert.equal(age.isNow, false);
  assert.equal(age.ago, null);
  assert.equal(age.clock, "09-07 02:00");
  assert.equal(explainObservationVsForecast(age, "ko"), null);
});

test("unreadable timestamps degrade to a record with no age claim", () => {
  for (const [observed, now] of [["", "2026-09-07T00:17:00+09:00"], ["2026-09-07T00:05:00+09:00", "nonsense"]]) {
    const age = describeObservationAge(observed, now, "ko");
    assert.equal(age.isNow, false, "an unknown age must never earn '지금'");
    assert.equal(age.ago, null);
  }
});

test("the clock is KST regardless of how the provider expressed the instant", () => {
  // Same instant, three spellings. All must print the Seoul wall clock.
  assert.equal(observationClock("2026-09-06T14:50:00+09:00"), "09-06 14:50");
  assert.equal(observationClock("2026-09-06T05:50:00Z"), "09-06 14:50");
  assert.equal(observationClock("2026-09-06T00:50:00-05:00"), "09-06 14:50");
  assert.equal(observationClock("not a time"), "");
});

test("age wording rounds honestly across minutes, hours and days", () => {
  const base = Date.parse("2026-09-07T00:00:00+09:00");
  const ago = (ms, lang) => describeObservationAge(new Date(base - ms).toISOString(), new Date(base).toISOString(), lang).ago;
  assert.equal(ago(95 * 60_000, "ko"), "1시간 35분 전");
  assert.equal(ago(120 * 60_000, "ko"), "2시간 전");
  assert.equal(ago(26 * 3_600_000, "ko"), "1일 전");
  assert.equal(ago(50 * 3_600_000, "ko"), "2일 전");
  assert.equal(ago(95 * 60_000, "en"), "1 h 35 min ago");
  assert.equal(ago(26 * 3_600_000, "en"), "1 day ago");
  assert.equal(ago(50 * 3_600_000, "en"), "2 days ago");
});

test("every locale gets a real explanation, and it names both sources", () => {
  const age = describeObservationAge("2026-09-06T14:50:00+09:00", "2026-09-07T00:17:00+09:00", "ko");
  for (const lang of LANGS) {
    const localized = describeObservationAge("2026-09-06T14:50:00+09:00", "2026-09-07T00:17:00+09:00", lang);
    const line = explainObservationVsForecast(localized, lang);
    assert.ok(line && line.length > 10, `${lang} must explain the difference`);
    assert.ok(line.includes(localized.ago), `${lang} must state how old the observation is`);
  }
  assert.match(explainObservationVsForecast(age, "ko"), /기상청 예보/,
    "the Korean line must say the other number is a KMA forecast, or it explains nothing");
});

/**
 * A guard on the fix, not on the module: the card must not print an
 * unconditional "지금" again. That single word is the whole defect.
 */
test("the context card never labels a reading 'now' unconditionally", () => {
  const source = readFileSync("app/operational-context.tsx", "utf8");
  assert.ok(source.includes("describeObservationAge"), "the card must decide freshness, not assume it");
  assert.ok(source.includes("age.isNow?t('지금'"), "'지금' must be gated on the freshness decision");
  assert.ok(source.includes("explainObservationVsForecast"), "the card must explain the gap it shows");
});

// Owner-approved all-category miniature grid: count stays truthful for one, many and missing data.
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {CommercialComposition} from '../app/commercial-composition.tsx';
test('the category block states every published category without hiding small lists',()=>{
 for(const count of [0,1,12,31])for(const lang of ['ko','en','zh','ja']){
  const context={commercialAt:null,weather:null,categories:Array.from({length:count},(_,i)=>({group:'Group',category:'Category '+i,payments:i,amountMin:10,amountMax:20,level:null}))};
  const html=renderToStaticMarkup(React.createElement(CommercialComposition,{context,lang}));
  assert.equal((html.match(/class="commercial-miniature-card"/g)||[]).length,count);
  const stated=html.match(/class="context-category-count">([^<]+)/)?.[1];assert.ok(stated);assert.ok(stated.includes(String(count)));
  assert.ok(html.includes('commercial-full-details'));
 }
});
test('all published category names and exact amounts remain available in details',()=>{
 const categories=Array.from({length:12},(_,i)=>({group:'Group',category:'Category '+i,payments:i,amountMin:100+i,amountMax:300+i,level:null}));
 const html=renderToStaticMarkup(React.createElement(CommercialComposition,{context:{commercialAt:'2026-08-31T14:05:00+09:00',weather:null,categories},lang:'en'}));
 for(const row of categories){assert.ok(html.includes(row.category));assert.ok(html.includes('$')||html.includes('₩'));}
 assert.ok(html.includes('08-31 14:05 KST'));assert.ok(html.includes('minim'));
});
