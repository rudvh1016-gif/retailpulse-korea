import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {MonthlyAirportScope} from '../app/monthly-airport-scope';
for(const lang of ['ko','en','zh','ja'] as const)test(lang+': airport-wide scope and narrowly qualified provider limitation remain visible',()=>{
 const html=renderToStaticMarkup(createElement(MonthlyAirportScope,{lang}));assert.match(html,/T1 \+ T2/);assert.match(html,/<small>[^<]+<\/small>/);assert.doesNotMatch(html,/<details|<svg|<button/);assert.equal((html.match(/data-testid="monthly-airport-scope"/g)||[]).length,1);
});
test('scope follows the requested headings once, never each country chart or terminal statistics',()=>{
 const production=readFileSync('app/airport-focus-production.tsx','utf8'),trends=readFileSync('app/airport-focus-trends.tsx','utf8');
 assert.match(production,/T1 \+ T2 국가별 흐름/);assert.match(production,/<\/h1><MonthlyAirportScope lang=\{lang\}\/>/);
 assert.match(trends,/<\/h2>\{!full&&<MonthlyAirportScope lang=\{lang\}\/>\}/);
 assert.equal((trends.match(/<MonthlyAirportScope /g)||[]).length,1);
 assert.doesNotMatch(readFileSync('app/airport-route-country-passengers.tsx','utf8'),/MonthlyAirportScope/);
 const contract=readFileSync('lib/incheon-airport-stats.mjs','utf8');assert.match(contract,/AviationStatsByCountry\/getTotalNumberOfPassenger/);assert.match(contract,/optionalLabelFields: Object.freeze\(\["region"\]\)/);
});
