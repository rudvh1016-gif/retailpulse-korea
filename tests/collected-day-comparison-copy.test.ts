import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {collectedDayComparisonCopy} from '../lib/collected-day-comparison-copy';
import {DailyAverageComparison} from '../app/daily-average-comparison';
import {PassengerBriefComparison} from '../app/airport-brief-comparison';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
test('easy comparison copy has four translations and does not claim a prior month when unknown',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  const label=collectedDayComparisonCopy(lang,true),generic=collectedDayComparisonCopy(lang);
  assert.notEqual(label,generic);if(lang!=='ko')assert.doesNotMatch(label,/[가-힣]/);
  const html=renderToStaticMarkup(h(DailyAverageComparison,{basis:'2026-09 collected-day mean',mean:261.6,delta:-3,percent:-1,lang,comparisonLabel:label}));
  assert.ok(html.includes(label));assert.match(html,/2026-09/);assert.ok(html.includes(new Intl.NumberFormat(lang,{maximumFractionDigits:1}).format(261.6)));assert.match(html,/data-direction="down"/);
 }
 assert.equal(collectedDayComparisonCopy('ko',true),'지난달 자료가 확보된 날의 하루 평균과 비교');
 const oldMonth:PassengerReferenceMonth={month:'2026-08',start:'2026-08-01',end:'2026-08-31',expectedDays:31,completeDays:31,status:'COMPLETE',mean:100,missingDates:[]};
 const html=renderToStaticMarkup(h(PassengerBriefComparison,{total:100,day:'2026-10-22',baseline:oldMonth}));
 assert.doesNotMatch(html,/지난달/);assert.doesNotMatch(html,/data-direction/);assert.match(html,/확인 중/);
});
