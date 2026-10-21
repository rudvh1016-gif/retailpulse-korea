import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import reviewed from '../data/korean-school-vacations.json';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {koreanSchoolVacations,KOREAN_VACATION_CAUTION} from '../lib/korean-school-vacations';
import {KoreanVacationContext} from '../app/korean-vacation-context';

const asOf='2026-10-20';
const schools=reviewed.events as CalendarEvent[];
const query={country:'JP',asOf,selectedMonth:'2026-09',actualDataMonths:['2026-08','2026-09']};

test('reviewed school example preserves exact published periods and institution scope',()=>{
 assert.equal(reviewed.coverage,'PARTIAL_SCHOOL_EXAMPLE');
 assert.deepEqual(schools.map(event=>[event.start,event.end]),[['2026-07-28','2026-08-19'],['2027-01-01','2027-02-28']]);
 for(const school of schools){assert.equal(school.country,'KR');assert.equal(school.scope,'institutional');assert.equal(school.region,'경기 화성 내리숲초등학교');assert.ok(school.sourceURL.startsWith('https://www.goehs.kr/'));}
});
test('Japan, China and Vietnam retain KR origin role and exact adjacent actual month',()=>{
 for(const country of ['JP','CN','VN']){
  const matches=koreanSchoolVacations({...query,country});
  assert.equal(matches.length,1);
  assert.deepEqual([matches[0].country,matches[0].role,matches[0].month,matches[0].relation],['KR','origin','2026-08','previous']);
  assert.equal(matches[0].name,'여름방학');
 }
 assert.deepEqual(koreanSchoolVacations({...query,actualDataMonths:['2026-09']}),[]);
 assert.deepEqual(koreanSchoolVacations({...query,selectedMonth:'2026-10',actualDataMonths:['2026-09','2026-10']}),[]);
 assert.deepEqual(koreanSchoolVacations({...query,actualDataMonths:['2026-08']}),[]);
});
test('selected day is inclusive, never broad seasonal or next-year extrapolation',()=>{
 for(const day of ['2026-07-28','2026-08-19','2027-01-01','2027-02-28'])assert.equal(koreanSchoolVacations({day,asOf}).length,1,day);
 for(const day of ['2026-07-27','2026-08-20','2026-10-20','2026-12-31','2027-03-01','2027-07-28'])assert.deepEqual(koreanSchoolVacations({day,asOf}),[],day);
});
test('missing, invalid, expired, superseded and national-scope school evidence stays unknown',()=>{
 assert.deepEqual(koreanSchoolVacations(query,[]),[]);
 for(const changes of [{status:'unverified'},{status:'expired'},{status:'superseded'},{scope:'national'},{region:''},{verifiedAt:'2026-10-21'},{reviewValidUntil:'2026-10-19'},{sourceURL:''}]){
  assert.deepEqual(koreanSchoolVacations(query,[{...schools[0],...changes} as CalendarEvent]),[],JSON.stringify(changes));
 }
 for(const country of ['OTHER','KR',''])assert.deepEqual(koreanSchoolVacations({...query,country}),[]);
 for(const asOf of ['','2026-02-30','2026-10-19','2027-03-01'])assert.deepEqual(koreanSchoolVacations({...query,asOf}),[]);
 assert.deepEqual(koreanSchoolVacations({day:'2026-02-30',asOf}),[]);
});
test('visible context labels the school example, dates, scope, source and non-causal boundary',()=>{
 const html=renderToStaticMarkup(createElement(KoreanVacationContext,query));
 for(const value of ['초등학교 방학기간 참고','개별 학교 예시','2026-07-28','2026-08-19','직전 월','학교별 일정 상이',KOREAN_VACATION_CAUTION])assert.ok(html.includes(value),value);
 assert.ok(html.includes(schools[0].sourceURL));
 assert.ok(!html.includes('내리숲초등학교'));
 assert.equal(renderToStaticMarkup(createElement(KoreanVacationContext,{day:'2026-10-20',asOf})), '');
 const winter=renderToStaticMarkup(createElement(KoreanVacationContext,{day:'2027-01-01',asOf}));
 assert.ok(winter.includes('겨울방학 2027-01-01–2027-02-28'));
 assert.ok(!winter.includes('직전 월'));
});
