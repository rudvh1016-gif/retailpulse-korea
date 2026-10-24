import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AirportMonthSourceSummary} from '../app/airport-month-source-summary';
import {PreparationEvent} from '../app/airport-preparation-event';
import {eventFlights} from './helpers/event-flight-fixture';
import {departureMap} from '../lib/airport-departure-map';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {AirportZoneCountries}=await import('../app/airport-zone-countries');
test('monthly source summary names preparation time in every locale and preserves KST/raw timestamp evidence',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  const label={ko:'집계 시각',en:'Prepared at',zh:'汇总时间',ja:'集計日時'}[lang];
  const missing={ko:'집계 시각 없음',en:'Preparation time unavailable',zh:'暂无汇总时间',ja:'集計日時なし'}[lang];
  const html=renderToStaticMarkup(h(AirportMonthSourceSummary,{lang,calculatedAt:'2026-10-23T20:05:00Z'}));
  assert.ok(html.includes(`<span>${label} </span>`));
  assert.doesNotMatch(html,/확인 시각|Checked|核实时间|確認日時/);
  assert.match(html,/dateTime="2026-10-23T20:05:00Z"/);assert.match(html,/2026/);assert.match(html,/05:05 KST/);assert.ok(html.includes(`/${lang}/more#collection-status`));
  const visible=html.replace(/<[^>]*>/g,'');assert.doesNotMatch(visible,/T20:05:00Z/);
  const invalid=renderToStaticMarkup(h(AirportMonthSourceSummary,{lang,calculatedAt:'invalid'}));
  assert.ok(invalid.includes(missing));assert.doesNotMatch(invalid,/<time|Invalid Date/);
 }
 const source=readFileSync('app/airport-monthly-flights.tsx','utf8');
 assert.ok(source.indexOf('<AirportMonthSourceSummary')<source.indexOf('<details className="airport-month-source-details">'));
 assert.ok(source.indexOf('{response?.calculatedAt}',source.indexOf('<details className="airport-month-source-details">'))>0);
});
test('country count and share remain exact and every unpositioned flight remains counted',()=>{
 const date='2026-10-24';const base={scheduledAt:date+'T10:00:00+09:00',retrievedAt:date+'T01:00:00Z',status:'scheduled',direction:'departure',terminal:'T1',airportCode:'NRT'};
 const map=departureMap({date,nextDate:'2026-10-25',terminal:'T1',buildingScope:'T1',window:{startMin:0,endMin:1440},rows:[{...base,physicalFlightId:'west',gate:'29'},{...base,physicalFlightId:'unknown',gate:null}]});
 const before=JSON.stringify(map);
 const html=renderToStaticMarkup(h(AirportZoneCountries,{map,lang:'ko',date}));
 assert.match(html,/data-country="JP" data-value="1" data-share="100"/);assert.match(html,/data-testid="country-unverified-details" data-side="UNVERIFIED" data-total="1"/);
 assert.match(html,/airport-flags\/JP.webp/);assert.match(html,/<strong[^>]*>1편<\/strong>/);assert.match(html,/<small[^>]*>100%<\/small>/);
 assert.equal(JSON.stringify(map),before);
});
test('Japanese planning summary strictly distinguishes present and absent flight context',()=>{
 const event={id:'jp',country:'JP',countryLabel:'일본',name:'문화의 날',start:'2026-11-03',end:'2026-11-03',type:'public_holiday',scope:'전국 공휴일',sourceURL:'https://example.test/jp'};
 for(const flights of [undefined,eventFlights()]){
  const html=renderToStaticMarkup(h(PreparationEvent,{event,lang:'ja',planning:true,flights}));
  assert.ok(html.includes(`<summary>${flights?'日程の詳細・選択日の便数参考':'日程の詳細'}</summary>`));
 }
});
