import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {ArrivalCountry} from '../lib/arrival-allowance-guidance';
import snapshot from '../data/airport-focus-preview/arrival-allowances.json';
import {ArrivalReviewedOverview} from '../app/arrival-reviewed-overview';
import {readFileSync} from 'node:fs';
const countries=snapshot.countries as unknown as ArrivalCountry[];
test('preparation route synchronously supplies its initial screen and reviewed guide before client hydration',()=>{
 const route=readFileSync('app/[locale]/[slug]/page.tsx','utf8'),shell=readFileSync('app/retailpulse-app.tsx','utf8'),production=readFileSync('app/airport-focus-production.tsx','utf8');
 assert.match(route,/AirportPreparation=\{slug === "airport-prepare" \? AirportPreparation : undefined\}/);
 assert.match(shell,/AirportPreparation = LazyAirportPreparation/);
 assert.match(production,/import ArrivalAllowances from '\.\/arrival-allowances-preview'/);
 assert.doesNotMatch(production,/const ArrivalAllowances=dynamic/);
});
test('visible initial overview preserves reviewed scopes, conditions, official sources and real manual dates without selecting a traveler',()=>{
 const before=JSON.stringify(snapshot);const html=renderToStaticMarkup(createElement(ArrivalReviewedOverview,{countries}));
 for(const country of snapshot.countries){assert.ok(html.includes(country.name));if(country.verifiedAt)assert.ok(html.includes(country.scope));if(country.verifiedAt)assert.ok(html.includes(country.verifiedAt));else assert.match(html,/수동 확인일 미확인/);assert.ok(html.includes(country.sources[0].url.replaceAll('&','&amp;')));if(country.verifiedAt)for(const condition of country.conditions)assert.ok(html.includes(condition.label));}
 assert.match(html,/추가 검토 필요/);assert.match(html,/주류·담배 기준 표시 보류/);assert.match(html,/모든 최신 개정이나 특수 조건의 검증을 뜻하지 않습니다/);assert.match(html,/lang="ko"/);assert.doesNotMatch(html,/<details|<select|hidden|aria-hidden|최신 규정 확인 완료/);assert.equal(JSON.stringify(snapshot),before);
});
test('missing manual review never borrows a collection timestamp or claims verification',()=>{
 const country={...countries[0],verifiedAt:undefined,checkedAt:'2099-12-31'};
 const html=renderToStaticMarkup(createElement(ArrivalReviewedOverview,{countries:[country]}));assert.match(html,/수동 확인일 미확인/);assert.doesNotMatch(html,/2099-12-31/);
});

import {register} from 'node:module';
register(new URL('./helpers/static-css-loader.mjs',import.meta.url));
const {default:ArrivalAllowancesPreview}=await import('../app/arrival-allowances-preview');
test('calculator initial server render contains the visible overview and no selected country or traveler result',()=>{
 const html=renderToStaticMarkup(createElement(ArrivalAllowancesPreview,{}));assert.match(html,/data-testid="arrival-reviewed-overview"/);assert.match(html,/<option value="" selected="">선택하세요<\/option>/);assert.doesNotMatch(html,/class="arrival-result/);assert.ok(html.indexOf('aria-label="도착 국가·지역"')<html.indexOf('data-testid="arrival-reviewed-overview"'));
});
