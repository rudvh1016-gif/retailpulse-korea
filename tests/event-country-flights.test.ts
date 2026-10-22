import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {eventCountryFlights} from '../lib/event-country-flights';
import {EventCountryFlights} from '../app/event-country-flights';
import {glanceFlights} from '../lib/airport-glance';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {eventFlights,flightBaseline} from './helpers/event-flight-fixture';

test('exact-country calculation is unfiltered and does not round before percentage',()=>{
 const context=eventFlights(),before=JSON.stringify(context),th=eventCountryFlights(context,'TH');
 assert.equal(th.count,16);assert.equal(th.mean,554/30);assert.equal(th.delta,16-554/30);assert.equal(th.percent,(16-554/30)/(554/30)*100);
 assert.equal(th.percent!.toFixed(1),'-13.4');assert.notEqual(th.percent!.toFixed(1),((16-18.5)/18.5*100).toFixed(1));
 assert.equal(eventCountryFlights(context,'TW').count,90);assert.equal(eventCountryFlights(context,'JP').delta,0);
 assert.equal(JSON.stringify(context),before);
 const small=eventCountryFlights(eventFlights({countries:[{country:'TH',flights:1}],baseline:flightBaseline({TH:29})}),'TH');
 assert.ok(small.mean!<10&&Math.abs(small.delta!)<2);assert.ok(small.percent!>0);
 const tiny=renderToStaticMarkup(h(EventCountryFlights,{country:'TH',label:'태국',context:eventFlights({countries:[{country:'TH',flights:1}],baseline:flightBaseline({TH:29})}),lang:'ko'}));assert.match(tiny,/\+&lt;0.1편/);
});
test('missing, partial flights, missing baseline, zero baseline and genuine zero changes remain distinct',()=>{
 assert.equal(eventCountryFlights(undefined,'TH').count,null);
 for(const status of ['MISSING','PARTIAL','LOADING'] as const){const result=eventCountryFlights(eventFlights({status}),'TH');assert.equal(result.count,null);assert.equal(result.delta,null);assert.equal(result.percent,null);}
 const missing=eventCountryFlights(eventFlights({baseline:undefined}),'TH');assert.equal(missing.count,16);assert.equal(missing.mean,null);assert.equal(missing.delta,null);
 const zero=eventCountryFlights(eventFlights({baseline:flightBaseline({})}),'TH');assert.equal(zero.mean,0);assert.equal(zero.delta,16);assert.equal(zero.percent,null);
 const none=eventCountryFlights(eventFlights(),'VN');assert.equal(none.count,0);assert.equal(none.mean,0);assert.equal(none.percent,null);
 const unchanged=eventCountryFlights(eventFlights(),'JP');assert.equal(unchanged.delta,0);assert.equal(unchanged.percent,0);
});
test('incomplete month uses only included days, names the actual month and never zero-fills missing dates',()=>{
 const result=eventCountryFlights(eventFlights({baseline:flightBaseline({TH:10},2)}),'TH');
 assert.equal(result.mean,5);assert.equal(result.days,2);assert.equal(result.expectedDays,30);assert.equal(result.partial,true);assert.equal(result.delta,11);
 const html=renderToStaticMarkup(h(EventCountryFlights,{country:'TH',label:'태국',lang:'ko',context:eventFlights({baseline:flightBaseline({TH:10},2,'2026-08')})}));
 assert.match(html,/2026-08 포함일 2\/31일 일평균 대비/);assert.doesNotMatch(html,/전월/);
 for(const dates of [[],['2026-09-01','2026-09-01'],['2026-08-01'],['2026-09-31'],['2026-11-01']]){
  const baseline=flightBaseline();baseline.includedDays=dates;assert.equal(eventCountryFlights(eventFlights({baseline}),'TH').mean,null);
 }
});
test('all locales show count and percentage signs with selected day and actual scope, not passenger units',()=>{
 for(const lang of ['ko','en','zh','ja'] as const){
  const html=renderToStaticMarkup(h(EventCountryFlights,{country:'TH',label:'태국',context:eventFlights({scope:'T2',baseline:{...flightBaseline(),scopes:{...flightBaseline().scopes,T2:flightBaseline().scopes.ALL}}}),lang}));
  for(const text of ['2026-10-22','T2','16','2026-09','▲ 2.5','▲ 13.4%','data-direction="down"'])assert.ok(html.includes(text),text);
  if(lang!=='ko')assert.doesNotMatch(html,/[가-힣]/);
  assert.doesNotMatch(html,/passengers|명|人/);
 }
 for(const [country,sign] of [['TW','+89'],['JP','0%']] as const)assert.ok(renderToStaticMarkup(h(EventCountryFlights,{country,label:country,context:eventFlights(),lang:'ko'})).includes(sign));
 const zero=renderToStaticMarkup(h(EventCountryFlights,{country:'TH',label:'태국',context:eventFlights({baseline:flightBaseline({})}),lang:'ko'}));assert.match(zero,/증감률 계산 불가/);assert.doesNotMatch(zero,/0%/);
});
test('territory event labels use the represented territory route, never US flights',()=>{
 const html=renderToStaticMarkup(h(EventCountryFlights,{country:'US',label:'괌',context:eventFlights({countries:[{country:'US',flights:90},{country:'GU',flights:2}],baseline:flightBaseline({US:900,GU:30})}),lang:'ko'}));
 assert.match(html,/data-country="GU"/);assert.match(html,/괌행 <b>2편/);assert.doesNotMatch(html,/90편/);
});
test('existing physical-flight deduplication and T1 main-building projection feed matching daily/monthly scopes',()=>{
 const flight=(day:string,id:string,gate:string):MonthFlightRow=>({physicalFlightId:id,terminal:gate==='120'?'CONCOURSE':'T1',gate,operatingFlight:'TG'+id,airportCode:'BKK',scheduledAt:day+'T12:00:00+09:00',retrievedAt:day+'T00:00:00Z',status:'scheduled'});
 const today=[flight('2026-10-22','1','20'),flight('2026-10-22','1','20'),flight('2026-10-22','2','120')];
 const data=glanceFlights('2026-10-22',today,'T1');assert.equal(data.total,1);
 const baseline=mainBuildingMonth(buildAirportFlightMonth('2026-09','2026-10-22',[flight('2026-09-01','a','20'),flight('2026-09-01','b','120')],new Set(['2026-09-01'])));
 const result=eventCountryFlights(eventFlights({scope:'T1',countries:data.countries,baseline}),'TH');assert.equal(result.count,1);assert.equal(result.mean,1);assert.equal(result.delta,0);
});

test('Korea events remain origin context, never Korea-bound or aggregate destination metrics',()=>{
 const context=eventFlights({countries:[{country:'KR',flights:999},{country:'TH',flights:16}],baseline:flightBaseline({KR:300,TH:554})});
 const metric=eventCountryFlights(context,'KR');assert.equal(metric.originContext,true);for(const field of ['count','mean','delta','percent'] as const)assert.equal(metric[field],null);
 for(const lang of ['ko','en','zh','ja'] as const){const html=renderToStaticMarkup(h(EventCountryFlights,{country:'KR',label:'한국',context,lang}));assert.match(html,/event-origin-context/);assert.doesNotMatch(html,/한국행|Korea-bound|飞往韩国|韓国行き|999|16편|data-flight-day|change-rate/);if(lang!=='ko')assert.doesNotMatch(html,/[가-힣]/);}
});
test('CN, HK and MO remain exact route keys, never aggregated nationality substitutes',()=>{
 const context=eventFlights({countries:[{country:'CN',flights:8},{country:'HK',flights:3},{country:'MO',flights:1}],baseline:flightBaseline({CN:30,HK:60,MO:90})});
 for(const [country,count,mean,delta] of [['CN',8,1,7],['HK',3,2,1],['MO',1,3,-2]] as const){const result=eventCountryFlights(context,country);assert.equal(result.count,count);assert.equal(result.mean,mean);assert.equal(result.delta,delta);}
});
