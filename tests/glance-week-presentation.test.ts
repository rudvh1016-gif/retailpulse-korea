import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GlanceWeekComparison} from '../app/glance-week-comparison';
import type {GlanceWeekReference} from '../lib/glance-week-comparison';
// Synthetic single-day arithmetic only, not production data.
const reference:GlanceWeekReference={day:'2026-10-30',previousDay:'2026-10-23',passengers:{all:100,T1:60,T2:40},flights:{all:10,T1:5,CONCOURSE:2,T2:3},selectedFlights:{all:9,T1:4,CONCOURSE:2,T2:3}};
for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: weekly count units, dates and decrease accessibility are distinct from daily means`,()=>{
 for(const kind of ['people','flights'] as const){
  const markup=renderToStaticMarkup(h(GlanceWeekComparison,{total:kind==='people'?90:9,day:reference.day,scope:'all',reference,kind,lang}));
  assert.match(markup,/①/);assert.match(markup,/2026-10-23/);assert.match(markup,/data-direction="down"/);assert.match(markup,/△ 10%/);
  assert.doesNotMatch(markup,/명\/일|편\/일|people\/day|flights\/day|人\/天|班\/天|人\/日|便\/日/);
  if(lang!=='ko')assert.doesNotMatch(markup,/[가-힣]/);
 }
 const missing=renderToStaticMarkup(h(GlanceWeekComparison,{total:90,day:reference.day,scope:'all',reference:null,kind:'people',lang}));
 assert.match(missing,/①/);assert.match(missing,/2026-10-23/);assert.doesNotMatch(missing,/change-rate|0%/);
 const zero=renderToStaticMarkup(h(GlanceWeekComparison,{total:90,day:reference.day,scope:'all',reference:{...reference,passengers:{all:0,T1:0,T2:0}},kind:'people',lang}));
 assert.doesNotMatch(zero,/%/);assert.match(zero,/90/);
});

test('weekly basis keeps the same explicit small-type precedence as the existing daily-average basis',()=>{
 const css=readFileSync('app/airport-focus-preview.css','utf8');
 assert.match(css,/\.focus-week-basis\{display:block;font-size:11px!important;/);
 assert.match(css,/@media\(max-width:600px\)\{[\s\S]*?\.focus-week-basis\{font-size:10px!important\}/);
});
