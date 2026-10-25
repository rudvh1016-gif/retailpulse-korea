import {test} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AirportFocusData} from '../app/airport-focus-data';
import type {GlanceOverviewContext} from '../app/airport-glance-preview';
// Native Node does not load stylesheets. This hook affects static-render tests only.
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {OverviewHeadline}=await import('../app/airport-focus-preview');
const context:GlanceOverviewContext={day:'2026-10-21',scope:'T2',flights:264,passengers:43319,transferPassengers:9600,referenceSum:52919,flightComparison:null,flightBaseline:{mean:261.6,delta:2.4,percent:.9,days:30,start:'2026-09-01',end:'2026-09-30',previous:true},selectedCountryChanges:[{country:'JP',label:'일본',count:83,mean:80,delta:3,percent:4.4,month:'2026-09',days:30},{country:'VN',label:'베트남',count:16,mean:19,delta:-3,percent:-14.9,month:'2026-09',days:30}]};
for(const lang of ['ko','en','zh'] as const)test(`${lang}: complete screenshot brief renders all sections, date/scope and sign truth`,()=>{
 const render=(asOf:string,values=context)=>renderToStaticMarkup(h(AirportFocusData.Provider,{value:{asOf,trends:[],checkedAt:null,preview:false,failed:false}},h(OverviewHeadline,{context:values,lang,onCountries:()=>{},onPrepare:()=>{}})));
 const markup=render('2026-10-21');
 if(lang==='ko')assert.equal(markup.replace(/<svg class="ui-line-icon"[\s\S]*?<\/svg>/g,'').replace(/ class="focus-brief-band"/g,'').replace(/ focus-brief-band/g,'').replace(/ data-heading="(?:page|section|subsection)"/g,'').replace(/<span class="heading-marker" aria-hidden="true"><\/span>/g,''),readFileSync('tests/fixtures/brief-ko-localization-baseline.html','utf8'));
 else{assert.doesNotMatch(markup,/[가-힣]/);assert.doesNotMatch(render(''),/[가-힣]/);assert.doesNotMatch(render('2026-10-21',{...context,flights:null,passengers:null,transferPassengers:null,referenceSum:null,flightBaseline:null,selectedCountryChanges:[]}),/[가-힣]/);}
 for(const value of ['43,319','9,600','52,919','264','2026-10-21','T2','+4%','▲ 15%'])assert.ok(markup.includes(value),value);
 assert.ok(markup.includes('focus-preparation-brief'));assert.ok(markup.includes('focus-report-basis'));
 const observed=render('2026-10-21',{...context,passengerBaseline:{month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:22,mean:null,status:'PARTIAL',missingDates:Array.from({length:8},(_,i)=>`2026-09-${i+23}`),observedDays:Array.from({length:22},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,departures:50000,transfers:10000}))}});
 for(const value of ['60,000','7,081','▲ 12%','1,320,000','2026-09-23','2026-09-30'])assert.ok(observed.includes(value),value);
 if(lang!=='ko')assert.doesNotMatch(observed,/[가-힣]/);
 assert.ok(observed.includes(lang==='ko'?'출국·환승 예보':lang==='en'?'complete departure and transfer forecasts':'出境和中转预报均完整'));
});
