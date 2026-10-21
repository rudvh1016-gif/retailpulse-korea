import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {selectHomeMonthlyCountries,homeMonthlyCountryTrends} from '../lib/home-monthly-countries';
import type {AirportStatsMonth,AirportStatsRow} from '../lib/airport-monthly-stats-read';
import HomeMonthlyCountryBasis from '../app/home-monthly-country-basis';

const row=(label:string,departures:number|null,aggregate=false):AirportStatsRow=>({label,departures,aggregate,arrivals:null,total:null,region:null,startHour:null,endHour:null});
const stats=(rows:AirportStatsRow[],month='2026-09'):AirportStatsMonth=>({operationId:'ROUTE_COUNTRY_PASSENGERS',month,rows,retrievedAt:'2026-10-20T00:00:00Z'});
const select=(value:AirportStatsMonth|undefined,requested='2026-10')=>selectHomeMonthlyCountries(value,requested,'2026-10-21');

test('selects all returned countries by monthly passengers, beyond the twelve priorities, regardless of row order or previous data',()=>{
 const data=stats([row('일본',20),row('인도',400),row('뉴질랜드',300),row('인도네시아',200),row('중국',10),row('베트남',5)]);
 const before=structuredClone(data),result=select(data);
 assert.deepEqual(result.rows.map(row=>row.code),['IN','NZ','ID']);
 assert.deepEqual(select({...data,rows:[...data.rows].reverse()}),result);assert.deepEqual(data,before);
 assert.equal(result.scope,'CONFIRMED_ROWS');assert.equal(result.month,'2026-09');assert.equal(result.fallback,true);
 const trends=homeMonthlyCountryTrends(result,[data]);
 assert.deepEqual(trends[0].points.map(point=>point.month),['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
 assert.deepEqual(trends[0].points.map(point=>point.departures),[null,null,null,null,null,400]);
});

test('aggregate, OTHER, unknown, duplicate identity, null, negative and invalid counts never rank; a genuine zero remains zero',()=>{
 const data=stats([row('TOTAL',9999),row('기타',9999),row('미국',9999,true),row('정체 미확인',9999),row('일본',null),row('베트남',-1),row('태국',NaN),row('대만',Infinity),row('홍콩',9),row('Hong Kong SAR China',10),row('인도',4),row('중국',0)]);
 const result=select(data);assert.deepEqual(result.rows.map(row=>[row.code,row.departures]),[['IN',4],['CN',0]]);
 assert.equal(result.excludedRows,7);
 assert.doesNotMatch(JSON.stringify(result.rows),/TOTAL|기타|미국|홍콩/);
});

test('ties use stable country-code order and explicitly disclose a third-place cutoff tie',()=>{
 const data=stats([row('미국',9),row('베트남',9),row('중국',9),row('일본',9)]);
 const result=select(data);assert.deepEqual(result.rows.map(row=>row.code),['CN','JP','US']);assert.equal(result.cutoffTie,true);
 assert.deepEqual(select({...data,rows:[...data.rows].reverse()}),result);
 assert.match(renderToStaticMarkup(React.createElement(HomeMonthlyCountryBasis,{selection:result})),/3위 동률은 국가·지역 코드 순으로 3곳 표시/);
});

test('missing, wrong-operation, invalid, future or unfinished months do not create a ranking',()=>{
 for(const data of [undefined,stats([row('일본',1)],'2026-13'),stats([row('일본',1)],'2026-10'),stats([row('일본',1)],'2026-11'),{...stats([row('일본',1)]),operationId:'TIME_BAND_PASSENGERS' as const},{...stats([row('일본',1)]),retrievedAt:''},{...stats([row('일본',1)]),retrievedAt:'2026-10-23T00:00:00Z'},{...stats([row('일본',1)]),retrievedAt:'2026-09-15T00:00:00Z'}]){
  assert.deepEqual(select(data).rows,[]);assert.equal(select(data).month,null);
 }
 assert.equal(select(stats([row('일본',1)]),'2026-08').month,null);
 assert.equal(selectHomeMonthlyCountries(stats([row('일본',1)]),'2026-10','').month,null);
 assert.equal(selectHomeMonthlyCountries(stats([row('일본',1)]),'2026-10','2026-10-99').month,null);
});

test('older stored month is explicit, never relabelled as requested month; missing previous history is not zero',()=>{
 const data=stats([row('인도',8)],'2026-07'),selection=select(data),html=renderToStaticMarkup(React.createElement(HomeMonthlyCountryBasis,{selection}));
 assert.match(html,/2026년 7월 기준/);assert.match(html,/요청 2026-10 대신 최신 보유 공개월 실적/);assert.match(html,/상위 1개 국가·지역/);
 assert.equal(homeMonthlyCountryTrends(selection,[data]).flatMap(row=>row.points).filter(point=>point.departures===null).length,5);
});

test('historical gaps, duplicate rows and invalid historical values remain null',()=>{
 const data=stats([row('인도',8)]),selection=select(data);
 const history=[data,stats([row('인도',0)],'2026-04'),stats([row('인도',3),row('인도',4)],'2026-05'),stats([row('인도',-1)],'2026-06')];
 assert.deepEqual(homeMonthlyCountryTrends(selection,history)[0].points.map(point=>point.departures),[0,null,null,null,null,8]);
});

test('new basis is localized in all four languages and does not assert global completeness or today flight ranking',()=>{
 const selection=select(stats([row('미국',9),row('베트남',9),row('중국',9),row('일본',9),row('기준 미확인',99)]));
 for(const lang of ['ko','en','zh','ja'] as const){
  const html=renderToStaticMarkup(React.createElement(HomeMonthlyCountryBasis,{selection,lang}));
  assert.match(html,/2026/);assert.match(html,/3/);assert.doesNotMatch(html,/TOP 3|오늘 편수/);
  if(lang!=='ko')assert.doesNotMatch(html,/[가-힣]/);
  const pending=renderToStaticMarkup(React.createElement(HomeMonthlyCountryBasis,{lang}));assert.match(pending,/role="status"/);if(lang!=='ko')assert.doesNotMatch(pending,/[가-힣]/);
 }
});

test('captured 59-row provider snapshot is read in full; regional/unknown labels are not silently merged into countries',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../e2e/fixtures/airport-focus/passenger-stats.json',import.meta.url),'utf8'));
 const data=fixture.current.ROUTE_COUNTRY_PASSENGERS as AirportStatsMonth;
 assert.equal(data.rows.length,59);const result=select(data);assert.deepEqual(result.rows.map(row=>[row.code,row.departures]),[['JP',911297],['CN',601273],['VN',275406]]);
 assert.equal(result.excludedRows,2,'Saipan and Hawaii are provider regions, not guessed country totals');
 const expanded=structuredClone(data);expanded.rows.find(row=>row.label==='호주')!.departures=2_000_000;
 assert.equal(select(expanded).rows[0].code,'AU');
});

test('production connects home selection only; existing twelve-country list, requests and thin interactive chart stay separate',()=>{
 const production=readFileSync(new URL('../app/airport-focus-production.tsx',import.meta.url),'utf8');
 const trends=readFileSync(new URL('../app/airport-focus-trends.tsx',import.meta.url),'utf8');
 assert.match(production,/selectHomeMonthlyCountries\(latest.reply\?\.current.ROUTE_COUNTRY_PASSENGERS,requested,asOf\)/);
 assert.match(production,/const availableRoutes=majorRoutes.filter/);assert.match(trends,/full\|\|context.preview\?context.trends:context.homeTrends\?\?\[\]/);
 assert.match(trends,/!full&&!context.preview&&<HomeMonthlyCountryBasis/);
 assert.doesNotMatch(readFileSync(new URL('../lib/home-monthly-countries.ts',import.meta.url),'utf8'),/\bfetch\s*\(/);
});
