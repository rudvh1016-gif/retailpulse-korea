import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BUSINESS_PREFERENCES,resolveAirportBusinessContext,type BusinessPreferences} from '../lib/business-preferences';
test('old area store and area share normalize to airport without changing saved preferences',()=>{
 const stored:BusinessPreferences={...DEFAULT_BUSINESS_PREFERENCES,place:'area',terminal:'T2',hours:{open:'09:00',close:'17:00'}};
 const before=JSON.stringify(stored);
 for(const scope of [null,{kind:'area' as const,area:'hongdae' as const}]) {
  const active=resolveAirportBusinessContext(stored,scope);
  assert.deepEqual(active.place,{kind:'airport',terminal:'T1',side:null});
  assert.equal(active.preferences.hours,null);
 }
 assert.equal(JSON.stringify(stored),before);
});
test('airport terminal sides and hours survive explicit shares and ordinary visits',()=>{
 const stored:BusinessPreferences={...DEFAULT_BUSINESS_PREFERENCES,terminal:'T2',side:'EAST',hours:{open:'09:00',close:'17:00'}};
 assert.deepEqual(resolveAirportBusinessContext(stored,null).preferences,stored);
 const linked=resolveAirportBusinessContext(stored,{kind:'airport',terminal:'T1',side:'WEST'});
 assert.deepEqual(linked.place,{kind:'airport',terminal:'T1',side:'WEST'});
 assert.deepEqual(linked.preferences.hours,stored.hours);
 assert.equal(stored.terminal,'T2');
});

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WeekAheadBlock} from '../app/week-ahead';
import {SUMMARY_FIXTURE} from '../e2e/summary-fixture';
import {weekCopy} from '../lib/week-copy';
import type {LiveSummary} from '../app/live-signals';
test('airport weekly guide keeps holidays and general notes without Seoul population footnote',()=>{
 for(const lang of ['ko','en','zh','ja'] as const) {
  const summary=SUMMARY_FIXTURE as unknown as LiveSummary;
  const airport=renderToStaticMarkup(createElement(WeekAheadBlock,{lang,summary,place:{kind:'airport',terminal:'T1',side:null}}));
  assert.ok(!airport.includes(weekCopy.population[lang]));
  assert.ok(airport.includes(weekCopy.pastPattern[lang]));
  assert.ok(airport.includes(weekCopy.sources[lang]));
  assert.equal((airport.match(/class="prep-week-date"/g)??[]).length,7);
  const archived=renderToStaticMarkup(createElement(WeekAheadBlock,{lang,summary,place:{kind:'area',area:'myeongdong'}}));
  assert.ok(archived.includes(weekCopy.population[lang]));
 }
});
