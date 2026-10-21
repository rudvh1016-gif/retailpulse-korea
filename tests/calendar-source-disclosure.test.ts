import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import HolidayList from '../app/airport-focus-holidays';
import {AirportFocusData} from '../app/airport-focus-data';

test('source/update footer is natively collapsed in full and compact calendars without dropping source information',()=>{
 for(const full of [false,true]){
  const html=renderToStaticMarkup(h(AirportFocusData.Provider,{value:{asOf:'2026-10-21',trends:[],checkedAt:null,preview:false,failed:false}},h(HolidayList,{full})));
  assert.match(html,/<details class="focus-calendar-source-notes"><summary>자료 출처·업데이트 안내<\/summary><small class="focus-source">/);
  const footer=html.split('<details class="focus-calendar-source-notes">')[1].split('</details>')[0];
  for(const text of ['일본·미국 연방·싱가포르 일정 자동 확인','실패 시에는 7일 뒤','일정 기준 2026-10-21','KASI 자동 수집 성공','에티오피아 일정은 확인 중','국가별 모든 휴일·방학을 확인한 목록은 아닙니다','Singapore Open Data Licence 1.0'])assert.ok(footer.includes(text),text);
  assert.match(footer,/href="https:\/\/data.gov.sg\/datasets\/d_8ef23381f9417e4d4254ee8b4dcdb176\/view"/);
  assert.match(footer,/href="https:\/\/data.gov.sg\/open-data-licence"/);
  assert.ok(html.indexOf('입출국 집중 시점은 휴일만으로 확인할 수 없습니다.')<html.indexOf('<details class="focus-calendar-source-notes">'));
 }
});
test('existing footer contents are byte-for-byte unchanged from the SG candidate',()=>{
 const source=readFileSync('app/airport-focus-holidays.tsx','utf8');
 const footer=source.slice(source.indexOf('<small className="focus-source">'),source.lastIndexOf('</small>')+8);
 assert.equal(createHash('sha256').update(footer).digest('hex'),'12dcc740023d162acdd28ccdeb00b1211d2ce6ddb8bc3ab99a240d1808ecb127');
});
test('missing official basis remains a visible status rather than a collapsed warning',()=>{
 const html=renderToStaticMarkup(h(AirportFocusData.Provider,{value:{asOf:'',trends:[],checkedAt:null,preview:false,failed:true}},h(HolidayList,{full:true})));
 assert.match(html,/role="status"/);assert.match(html,/공식 기준 날짜를 확인하지 못해/);assert.doesNotMatch(html,/<details/);
});
