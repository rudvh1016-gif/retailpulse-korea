import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PassengerBriefComparison} from '../app/airport-brief-comparison';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
const baseline:PassengerReferenceMonth={month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:30,mean:60000,status:'COMPLETE',missingDates:[]};
for(const lang of ['ko','en','zh','ja'] as const)test(`calculation disclosure retains visible component counts and separate accessible name ${lang}`,()=>{
 const html=renderToStaticMarkup(h(PassengerBriefComparison,{total:112403,day:'2026-10-19',baseline,lang,parts:h('span',{},'103,124 + 9,279')}));
 const summary=html.match(/<summary([^]*?)<\/summary>/)?.[0];assert.ok(summary);
 assert.match(summary,/aria-labelledby="[^"]+"/);assert.match(summary,/aria-describedby="[^"]+"/);
 assert.match(summary,/103,124 \+ 9,279/);assert.match(summary,/class="focus-passenger-parts"/);
 assert.ok(html.indexOf('103,124 + 9,279')<html.indexOf('</summary>'));
 assert.doesNotMatch(html,/<details[^>]+open/);
 const missing=renderToStaticMarkup(h(PassengerBriefComparison,{total:null,day:'2026-10-19',baseline:null,lang,parts:h('span',{},'Checking departures + Checking transfers')}));
 assert.match(missing,/Checking departures \+ Checking transfers/);assert.doesNotMatch(missing,/<details/);
});
