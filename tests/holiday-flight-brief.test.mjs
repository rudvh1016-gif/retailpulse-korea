import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeCountryHolidays,flightHolidayContext,planningHolidays,returnPlanningText,endingHolidays,mergeBriefHolidays} from '../lib/holiday-flight-brief.ts';
const event={id:'CN-mid-autumn',country:'CN',countryLabel:'중국',name:'중추절',start:'2026-09-25',end:'2026-09-27',type:'public_holiday',scope:'전국 공휴일',sourceURL:'https://www.gov.cn/example',verifiedAt:'2026-09-20'};
const row={country:'CN',delta:5,count:35,mean:30,days:30};
test('country and inclusive exact local holiday dates gate route association',()=>{
 for(const day of ['2026-09-25','2026-09-27'])assert.equal(activeCountryHolidays([event],'CN',day,'2026-10-20').length,1);
 for(const day of ['2026-09-24','2026-09-28','2026-10-20','bad'])assert.equal(activeCountryHolidays([event],'CN',day,'2026-10-20').length,0);
 assert.equal(activeCountryHolidays([event],'JP','2026-09-26','2026-10-20').length,0);
 assert.equal(activeCountryHolidays([{...event,country:'KR'}],'KR','2026-09-26','2026-10-20').length,0);
});
test('increases and decreases are described as coincidence not causality',()=>{
 const up=flightHolidayContext([event],row,'2026-09-26','2026-10-20');
 assert.match(up.text,/중추절 기간과 맞물려 출발편 증가/);
 assert.match(up.caution,/원인이 확인된 것은 아닙니다/);
 assert.match(flightHolidayContext([event],{...row,count:25,delta:-5},'2026-09-26','2026-10-20').text,/감소/);
 assert.match(flightHolidayContext([event],{...row,count:30,delta:0},'2026-09-26','2026-10-20').text,/같음/);
 assert.equal(flightHolidayContext([event],row,'2026-10-20','2026-10-20'),null);
});
test('missing baselines, conditional, expired or unverified dates never produce context',()=>{
 for(const patch of [{mean:0},{count:NaN},{delta:Infinity},{days:0}])assert.equal(flightHolidayContext([event],{...row,...patch},'2026-09-26','2026-10-20'),null);
 for(const patch of [{verifiedAt:undefined},{verifiedAt:'2026-10-21'},{conditional:true},{reviewValidUntil:'2026-10-01'},{sourceURL:undefined},{type:'working_day'},{isRepresentative:false},{end:'2026-09-24'}])assert.deepEqual(activeCountryHolidays([{...event,...patch}],'CN','2026-09-26','2026-10-20'),[]);
});
test('future preparation works without passenger metrics and retains ending cross-boundary holidays',()=>{
 const cross={...event,start:'2026-12-30',end:'2027-01-02',name:'공식 연휴'};
 assert.equal(planningHolidays([cross],'2027-01-01','2027-01-31','2026-10-20',new Map()).length,1);
 assert.equal(planningHolidays([cross],'2026-11-01','2026-11-30','2026-10-20',new Map()).length,0);
 assert.match(returnPlanningText(cross),/1\/2 공식 연휴 종료 · 귀국 준비: 인천→중국 출발편 확인/);
 assert.equal(endingHolidays([cross],'2027-01-02','2026-10-20',new Map()).length,1);
 assert.equal(endingHolidays([cross],'2027-01-03','2026-10-20',new Map()).length,0);
 assert.doesNotMatch(returnPlanningText(cross),/도착|집중|예상 귀국일|국적/);
});
test('representative schedules are ranked by route volume but not withheld when comparison data is missing',()=>{
 const jp={...event,id:'JP',country:'JP',countryLabel:'일본'};
 assert.equal(planningHolidays([event,jp],'2026-09-25','2026-09-27','2026-10-20',new Map([['일본',50]]))[0].country,'JP');
 assert.equal(planningHolidays([event,jp],'2026-09-25','2026-09-27','2026-10-20',new Map()).length,2);
});
test('reviewed historical China holidays are available but October 20 is not mislabeled Mid-Autumn',()=>{
 const {events,asOfKST}=JSON.parse(readFileSync('data/airport-focus-preview/holidays-summary.json','utf8'));
 assert.equal(activeCountryHolidays(events,'CN','2026-09-26',asOfKST)[0].name,'중추절');
 assert.equal(activeCountryHolidays(events,'CN','2026-10-07',asOfKST)[0].name,'국경절');
 assert.deepEqual(activeCountryHolidays(events,'CN','2026-10-20',asOfKST),[]);
});

test('runtime replacements remove superseded dates but preserve territorial and unrepresented calendar scopes',()=>{
 const national={...event,id:'old-jp',country:'JP',countryLabel:'일본',calendarScope:'national'};
 const federal={...event,id:'us',country:'US',countryLabel:'미국',calendarScope:'institutional'};
 const guam={...federal,id:'guam',countryLabel:'괌',calendarScope:'regional',region:'GU'};
 const changed={id:'new-jp',country:'JP',scope:'national',kind:'public_holiday',status:'verified',name:'공식 새 날짜',start:'2026-09-28',end:'2026-09-28',sourceURL:'https://www8.cao.go.jp/example',verifiedAt:'2026-10-20'};
 const live=mergeBriefHolidays([national,federal,guam],[changed],[{country:'JP',year:2026,scope:'national'},{country:'US',year:2026,scope:'institutional'}]);
 assert.deepEqual(live.map(row=>row.id),['guam','new-jp']);
 assert.equal(live[1].calendarScope,'national');
 const stale=mergeBriefHolidays([national],[{...changed,status:'expired'}],[{country:'JP',year:2026,scope:'national'}]);
 assert.deepEqual(stale,[],'stale live replacement must not resurrect a superseded static date');
 assert.deepEqual(mergeBriefHolidays([national],undefined),[national]);
});
