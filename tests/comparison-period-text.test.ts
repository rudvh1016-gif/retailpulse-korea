import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ComparisonBasisText} from '../app/comparison-basis-text';
import {preparationEvents} from '../lib/preparation-calendar';

const days=(start:number,end:number)=>Array.from({length:end-start+1},(_,i)=>`2026-09-${String(start+i).padStart(2,'0')}`);
test('22 observed days at month end are a dated sample, never September 22 MTD',()=>{
 const html=renderToStaticMarkup(createElement(ComparisonBasisText,{lang:'ko',data:{month:'2026-09',includedDays:days(9,30),through:'2026-09-30',provenance:'forecast'}}));
 assert.match(html,/<strong class="comparison-period">9\/9 ~ 9\/30 \(수집 22일\)<\/strong>/);
 assert.match(html,/수집분 예보 일평균/);assert.doesNotMatch(html,/MTD/);
});
test('complete flight month and genuine day-one MTD keep separate periods',()=>{
 const render=(end:number)=>renderToStaticMarkup(createElement(ComparisonBasisText,{lang:'ko',data:{month:'2026-09',includedDays:days(1,end),through:`2026-09-${end}`,provenance:'collected'}}));
 assert.match(render(30),/<strong class="comparison-period">9\/1 ~ 9\/30<\/strong>/);
 assert.match(render(22),/<strong class="comparison-period">9\/22 MTD<\/strong>/);
 const sparse=renderToStaticMarkup(createElement(ComparisonBasisText,{lang:'ko',data:{month:'2026-09',includedDays:['2026-09-01','2026-09-30'],provenance:'forecast'}}));
 assert.match(sparse,/중 수집 2일/);assert.doesNotMatch(sparse,/MTD/);
});
test('preparation date labels visibly separate ISO date endpoints without changing stored dates',()=>{
 const events=preparationEvents('2026-10-31');
 for(const event of events){
  assert.doesNotMatch(event.dateLabel_ko,/\d{4}-\d{2}-\d{2}[~–]\d{4}-\d{2}-\d{2}/);
  if(event.dateLabel_ko.includes(' ~ '))assert.match(event.dateLabel_ko,/\d{4}-\d{2}-\d{2} ~ \d{4}-\d{2}-\d{2}/);
 }
 assert.ok(events.some(event=>event.dateLabel_ko.includes(' ~ ')));
});
