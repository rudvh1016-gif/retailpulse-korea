import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {UiLineIcon} from '../app/ui-line-icon';
import {dutyFreeSources,type DutyFreeExchangeSnapshot,type DutyFreeObservation} from '../lib/duty-free-exchange';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {DutyFreeDayRates}=await import('../app/airport-duty-free-exchange');
const now=Date.parse('2026-10-25T03:00:00Z');
const observation=(date:string,value:number,explicit=false):DutyFreeObservation=>({vendor:'shilla',serviceDateKst:date,currency:'USD',krwPerUnit:value,verifiedAt:date<'2026-10-25'?'2026-10-24T03:00:00Z':'2026-10-25T02:00:00Z',verified:true,sourceUrl:dutyFreeSources.shilla,scope:'INTERNET_SHOP',dateEvidence:explicit?'EXPLICIT_SOURCE_DATE':'CURRENT_WIDGET'});
const today=observation('2026-10-25',1400.67),previous=observation('2026-10-24',1432.87),next=observation('2026-10-26',1456.12,true);
const snapshot=(patch:Partial<DutyFreeExchangeSnapshot['sources'][number]>={}):DutyFreeExchangeSnapshot=>({mode:'duty-free-exchange',collectionMode:'AUTOMATED',todayKst:'2026-10-25',generatedAt:'2026-10-25T03:00:00Z',sources:[{vendor:'shilla',observation:today,observations:[previous,today,next],lastAttemptAt:'2026-10-25T02:00:00Z',lastAttemptStatus:'SUCCESS',nextAttemptAt:null,errorCode:null,...patch}]});
for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: both dated rates render immediately with exact precision and provenance`,()=>{
 const data=snapshot(),before=JSON.stringify(data),markup=renderToStaticMarkup(h(DutyFreeDayRates,{snapshot:data,now,readFailed:false,lang}));
 for(const token of ['1432.87','1456.12'])assert.ok(markup.includes(Number(token).toLocaleString({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{minimumFractionDigits:2,maximumFractionDigits:2})),token);
 for(const date of ['2026-10-24','2026-10-26'])assert.ok(markup.includes(`data-rate-date="${date}"`));
 for(const at of [previous.verifiedAt,next.verifiedAt])assert.ok(markup.includes(`dateTime="${at}"`));
 assert.doesNotMatch(markup,/<button|<details|1400.67|1,400.67/);assert.equal(JSON.stringify(data),before);
});
test('future needs explicit source evidence; missing dates never copy today or become zero',()=>{
 for(const data of [snapshot({observations:[today]}),snapshot({observations:[today,{...next,dateEvidence:'CURRENT_WIDGET'}]})]){
  const markup=renderToStaticMarkup(h(DutyFreeDayRates,{snapshot:data,now,readFailed:false,lang:'ko'}));
  assert.match(markup,/확인된 환율 없음/);assert.doesNotMatch(markup,/1,400.67|1,456.12|>0(?:\.00)?|미발표/);
 }
});
for(const [status,label] of [['NEVER','확인 전'],['RUNNING','확인 전'],['ERROR','수집 실패'],['BLOCKED','수집 차단'],['SUCCESS','확인된 환율 없음']] as const)test(`missing ${status} evidence is accurately distinguished`,()=>{
 const markup=renderToStaticMarkup(h(DutyFreeDayRates,{snapshot:snapshot({observation:null,observations:[],lastAttemptStatus:status}),now,readFailed:false,lang:'ko'}));assert.match(markup,new RegExp(label));assert.doesNotMatch(markup,/미발표|0\.00/);
});
test('API read failure is separate from collection status and retains actual adjacent evidence',()=>{
 const empty=renderToStaticMarkup(h(DutyFreeDayRates,{snapshot:null,now,readFailed:true,lang:'ko'}));assert.match(empty,/조회 실패/);
 const retained=renderToStaticMarkup(h(DutyFreeDayRates,{snapshot:snapshot(),now,readFailed:true,lang:'ko'}));assert.match(retained,/1,432.87/);assert.match(retained,/1,456.12/);
});
test('six custom line icons share dimensions and stroke and remain decorative monochrome SVG',()=>{
 for(const kind of ['today','change','return','week','month','chart'] as const){const markup=renderToStaticMarkup(h(UiLineIcon,{kind}));for(const token of ['width="18"','height="18"','stroke="currentColor"','stroke-width="1.5"','aria-hidden="true"','focusable="false"'])assert.ok(markup.includes(token),token);assert.doesNotMatch(markup,/<image|<text|filter=|linearGradient/);}
});
import {readFileSync} from 'node:fs';
import {departureMap} from '../lib/airport-departure-map';
const {AirportConceptModel}=await import('../app/airport-concept-model');
test('compact model keeps exact unknown counts and evidence inside existing closed source disclosure',()=>{
 const date='2026-10-19',map=departureMap({date,nextDate:'2026-10-20',terminal:'T2',buildingScope:'T2',window:{startMin:0,endMin:1440},rows:[{physicalFlightId:'unknown',airportCode:'NRT',terminal:'T2',gate:null,direction:'departure',status:'scheduled',scheduledAt:date+'T10:00:00+09:00',retrievedAt:date+'T01:00:00Z'}]});
 for(const lang of ['ko','en','zh','ja'] as const){const markup=renderToStaticMarkup(h(AirportConceptModel,{map,lang,evidence:'Original collection date and status',compactEvidence:true}));assert.match(markup,/data-denominator="1"/);assert.ok(markup.indexOf('model-source-evidence')>markup.indexOf('<details'));assert.ok(markup.indexOf('model-zone-note')>markup.indexOf('<details'));assert.match(markup,/Original collection date and status/);assert.match(markup,/data-testid="model-unverified-share"/);assert.match(markup,/100%/);assert.doesNotMatch(markup,/<details[^>]+ open/);assert.match(markup,/https:\/\/www.airport.kr\/geomap\/ap_ko\/view.do/);}
 const source=readFileSync('app/airport-departure-map.tsx','utf8'),integrated=source.slice(source.indexOf('if(modelPlacement&&wholeDayMap)'),source.indexOf('  return <div data-testid="departure-map"'));
 assert.doesNotMatch(integrated,/<AirportFlightBrowser/);assert.match(source,/<AirportFlightBrowser lang=\{lang\} flights=\{shown\}/);assert.match(readFileSync('app/airport-view.tsx','utf8'),/section === "flights" && <FlightBoard/);
});
