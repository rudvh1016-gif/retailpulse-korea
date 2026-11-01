import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {airportFocusCopy} from '../app/airport-focus-copy.ts';

// Render the real wrapper while isolating unrelated API readers and nested widgets.
// This tests wrapper JSX/copy, not a whole-app/browser render.
test('airport home wrapper renders English copy and keeps Korean copy and links',()=>{
  const source=readFileSync(new URL('../app/airport-focus-production.tsx',import.meta.url),'utf8');
  const start=source.indexOf('export function AirportFocusGlance(');
  const end=source.indexOf('export function AirportFocusStatus(',start);
  assert.ok(start>=0&&end>start);
  const jsx=source.slice(start,end).replace('export function','function')+'\nglobalThis.Wrapper=AirportFocusGlance;';
  const compiled=ts.transpileModule(jsx,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const context=vm.createContext({React,require:createRequire(import.meta.url),airportFocusCopy,
    // Keep the real server-rendered hook lifecycle: effects do not run, while
    // shared data readers start pending rather than inventing airport records.
    useState:React.useState,useEffect:React.useEffect,
    useLiveSummary:()=>undefined,useFlights:()=>undefined,
    usePreparedMonth:()=>({reply:undefined,pending:true,failed:false,retained:false,attempt:0,retry:()=>{}}),
    usePresentationClock:iso=>Date.parse(iso),deviceAirportScope:()=> 'all',
    FocusLiveData:({children})=>children,
    AirportGlanceInsights:({children})=>children,
    AirportGlance:({artworkNote,overviewExtras})=>React.createElement('div',null,React.createElement('p',null,artworkNote),overviewExtras),
    HolidayList:()=>null,CountryTrends:()=>null,OverviewHeadline:()=>null,HomeCheckpointWaits:()=>null,ShiftBriefing:()=>null,go:()=>{},
  });
  vm.runInContext(compiled,context);
  const render=lang=>renderToStaticMarkup(React.createElement(context.Wrapper,{lang,selectedDate:'2026-10-23',onIndustryChange:()=>{}}));
  const en=render('en');
  assert.doesNotMatch(en,/[가-힣]/);
  assert.match(en,/Illustrative model/);
  assert.match(en,/During your shift/);
  assert.match(en,/href="\/en\/airport\?date=2026-10-23"/);
  assert.match(en,/href="\/en\/airport-prepare#arrival-allowances"/);
  const ko=render('ko');
  assert.match(ko,/구조 이해를 위한 모형 · 항공기 위치는 실제 운항 현황이 아닙니다/);
  assert.match(ko,/근무 중 확인/);
  assert.match(ko,/href="\/ko\/airport\?date=2026-10-23"/);
  assert.match(ko,/class="focus-staff-links"/);
});
