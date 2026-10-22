import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaffRouteHoliday,type StaffRouteChange} from '../app/airport-staff-route-holiday';
import {mergeBriefHolidays,planningHolidays,type BriefHoliday} from '../lib/holiday-flight-brief';
import type {Lang} from '../app/retailpulse-data';

import {eventFlights} from './helpers/event-flight-fixture';
const flights=eventFlights();
const route:StaffRouteChange={country:'TW',label:'대만',count:90,mean:1,delta:89,percent:8900,month:'2026-09',days:30};
const event:BriefHoliday={id:'TH-2026-10-23-bank',country:'TH',countryLabel:'태국',name:'Chulalongkorn 국왕 추모일 (금융기관)',start:'2026-10-23',end:'2026-10-23',type:'public_holiday',calendarScope:'institutional',scope:'금융기관·특수금융기관',verifiedAt:'2026-10-21',sourceURL:'https://example.test/th'};
const render=(props:Partial<Parameters<typeof StaffRouteHoliday>[0]>={})=>renderToStaticMarkup(h(StaffRouteHoliday,{route,flights,event,day:'2026-10-22',lang:'ko',...props}));
const plain=(html:string)=>html.replace(/<[^>]*>/g,'');

test('event is immediately followed by its own country metrics, not the highest-delta Taiwan route',()=>{
 const before=JSON.stringify({flights,event});
 const html=render({children:h('p',null,'Preserved school-calendar context')}),[visible,details]=html.split('<details');
 assert.match(visible,/<h4>태국 Chulalongkorn 국왕 추모일<\/h4><div class="event-country-flights" data-country="TH"/);
 for(const fact of ['선택일 2026-10-22','공항 전체','태국행','16편','2026-09 일평균 대비','▲ 2.5편','▲ 13.4%','10/23'])assert.ok(visible.includes(fact),fact);
 assert.doesNotMatch(visible,/대만|90편|18\.5|귀국 준비|공식 일정 확인|국적|특수금융기관/);
 assert.equal((html.match(/<details/g)??[]).length,1);assert.match(details,/^ class="staff-route-details">/);
 for(const fact of ['2026-09 18.5편','30일','금융기관·특수금융기관','귀국 준비','2026-10-21','https://example.test/th','노선 국가 기준','Preserved school-calendar context'])assert.ok(details.includes(fact),fact);
 assert.equal(JSON.stringify({flights,event}),before);
});
test('sample-day parentheses remain a no-wrap inline group in every locale',()=>{
 for(const lang of ['ko','en','zh','ja'] as Lang[])assert.match(render({lang}),/<span class="staff-route-sample">/);
 assert.match(readFileSync('app/airport-staff-briefing.css','utf8'),/\.staff-route-sample\{display:inline-block;white-space:nowrap\}/);
});

test('single dates collapse once, multi-day and cross-year ranges retain both endpoints for every country',()=>{
 assert.equal((render().split('<details')[0].match(/<time /g)??[]).length,1);
 for(const [country,countryLabel,start,end,expected] of [['PH','필리핀','2026-11-01','2026-11-02','11/01–11/02'],['MM','미얀마','2026-10-25','2026-10-27','10/25–10/27'],['JP','일본','2026-12-31','2027-01-01','2026/12/31–2027/01/01']]){
  const html=render({event:{...event,country,countryLabel,start,end}}),visible=html.split('<details')[0];
  assert.equal((visible.match(/<time /g)??[]).length,2);assert.ok(plain(visible).includes(expected));
  assert.ok(html.includes(`dateTime="${start}"`));assert.ok(html.includes(`dateTime="${end}"`));
 }
});

test('institutional and partial applicability stays visible without duplicate bold financial scope',()=>{
 for(const type of ['bank_holiday','public_holiday']){
  const visible=render({event:{...event,type}}).split('<details')[0];
  assert.match(visible,/<h4>태국 Chulalongkorn 국왕 추모일<\/h4>/);
  assert.equal((plain(visible).match(/금융기관/g)??[]).length,1);assert.doesNotMatch(visible,/전국 공휴일/);
 }
 for(const scope of ['13:00 이후 적용 범위 확인 중','지정 지역만 적용']){
  const html=render({event:{...event,name:'검증된 일정',type:'public_holiday',calendarScope:'regional',scope}});
  assert.ok(html.split('<details')[0].includes(scope));assert.ok(html.split('<details')[1].includes(scope));
 }
 const bankPartial=render({event:{...event,type:'bank_holiday',scope:'금융기관 · 13:00 이후 적용'}});
 assert.match(bankPartial.split('<details')[0],/금융기관 · 13:00 이후 적용/);
 const regionalBank=render({event:{...event,country:'GB',countryLabel:'영국',name:'은행휴일',type:'bank_holiday',scope:'스코틀랜드 은행휴일. 모든 직장의 유급휴무를 뜻하지 않습니다.'}});
 assert.match(regionalBank.split('<details')[0],/스코틀랜드 은행휴일. 모든 직장의 유급휴무를 뜻하지 않습니다./);
});

test('official Thai upcoming event still uses the selected day, not the future holiday date',()=>{
 const official=JSON.parse(readFileSync('data/official-calendar/priority-country-multiyear.json','utf8'));
 const bank=official.events.find((e:{id:string})=>e.id===event.id);assert.ok(bank);
 const upcoming=planningHolidays(mergeBriefHolidays([], [bank]),'2026-10-22','2026-10-29','2026-10-21',new Map([['대만',90]]),1)[0];
 const html=render({event:upcoming});assert.match(html,/data-flight-day="2026-10-22"/);assert.doesNotMatch(html,/data-flight-day="2026-10-23"|기간과 맞물려/);
 assert.match(html,/증감 원인이 확인된 것은 아닙니다/);
});

test('all four locales preserve numbers, country keys, source evidence and closed controls',()=>{
 const summaries={ko:'기준·일정 상세',en:'Basis &amp; date details',zh:'依据与日程详情',ja:'比較基準・日程の詳細'};
 const scopes={ko:'금융기관',en:'Financial institutions',zh:'金融机构',ja:'金融機関'};
 const directions={ko:'감소',en:'decrease',zh:'下降',ja:'減少'};
 for(const lang of ['ko','en','zh','ja'] as Lang[]){
  const html=render({lang}),[visible,details]=html.split('<details');
  assert.ok(visible.includes('16'));assert.ok(visible.includes('13.4%'));assert.ok(visible.includes('10/23'));
  assert.ok(visible.includes(scopes[lang]));assert.ok(visible.includes(directions[lang]));
  assert.doesNotMatch(visible,/data-country="TW"/);assert.match(visible,/data-country="TH"/);
  assert.match(details,/^ class="staff-route-details">/);assert.ok(details.includes(summaries[lang]));
  assert.match(details,/2026-09/);assert.match(details,/18\.5/);assert.match(details,/2026-10-21/);assert.match(details,/https:\/\/example.test\/th/);
 }
 // Untranslated source wording is preserved rather than guessed, matching the existing localization contract.
 assert.match(render({lang:'ja'}),/Chulalongkorn 国王|Chulalongkorn 국왕/);
});

test('missing route and event still retain honest empty states and boundary evidence',()=>{
 const html=render({route:undefined,flights:undefined,event:null});
 assert.match(html,/검증된 대표 휴일 연결이 없습니다/);assert.match(html,/비교 가능한 노선 자료를 확인 중/);
 assert.doesNotMatch(html,/data-country|%|<time |노선 국가를 고객 국적으로|귀국객 집중/);
});


test('owner-removed nationality and return forecast disclaimer is absent even when details are open',()=>{
 const removed=['노선 국가를 고객 국적으로','귀국객 집중을 확정한 예측','Route countries do not identify customer nationality','confirmed forecast of returning travelers','航线国家不代表顾客国籍','路線の国は顧客の国籍を示しません'];
 for(const lang of ['ko','en','zh','ja'] as const){const html=render({lang});for(const phrase of removed)assert.ok(!html.includes(phrase));}
 assert.match(render(),/노선 국가 기준/);
});


test('no event preserves the existing ranked route summary and its folded comparison evidence',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  const html=render({event:null,lang}),[visible,details]=html.split('<details');
  assert.match(visible,/staff-route-metric" data-country="TW"/);assert.match(visible,/90/);assert.match(visible,/8900.0%/);
  assert.doesNotMatch(visible,/staff-holiday-event|event-country-flights|data-country="TH"/);
  for(const fact of ['2026-10-22','2026-09','30','data-country="TW"'])assert.ok(details.includes(fact),fact);
  assert.match(details,/^ class="staff-route-details">/);
 }
 const ko=render({event:null}).split('<details')[0];assert.match(ko,/대만행 90편/);assert.match(ko,/9월 일평균 대비/);
});
