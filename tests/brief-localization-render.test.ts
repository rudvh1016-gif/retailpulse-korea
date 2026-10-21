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
 if(lang==='ko')assert.equal(markup,readFileSync('tests/fixtures/brief-ko-localization-baseline.html','utf8'));
 else{assert.doesNotMatch(markup,/[가-힣]/);assert.doesNotMatch(render(''),/[가-힣]/);assert.doesNotMatch(render('2026-10-21',{...context,flights:null,passengers:null,transferPassengers:null,referenceSum:null,flightBaseline:null,selectedCountryChanges:[]}),/[가-힣]/);}
 for(const value of ['43,319','9,600','52,919','264','2026-10-21','T2','+4.4%','▲ 14.9%'])assert.ok(markup.includes(value),value);
 assert.ok(markup.includes('focus-preparation-brief'));assert.ok(markup.includes('focus-report-basis'));
});
