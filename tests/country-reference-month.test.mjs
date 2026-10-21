import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/airport-focus-preview.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/airport-focus-preview.css',import.meta.url),'utf8');
test('prominent reference month follows the returned monthly data rather than a hardcoded September',()=>{
 const start=source.indexOf('export function CountryBriefing');
 const brief=source.slice(start,source.indexOf('function PreparationBrief',start));
 assert.match(brief,/<h2>최근 공개 월, 먼저 볼 변화<\/h2>\{reply\?\.month/);
 assert.match(brief,/className="focus-country-reference-month"><strong>\{reply.month.slice\(0,4\)\}년 \{Number\(reply.month.slice\(5\)\)\}월 기준<\/strong>/);
 assert.doesNotMatch(brief,/2026년 9월 기준/);
 assert.match(css,/\.focus-country-brief \.focus-country-reference-month\{[^}]*font-size:17px/);
 assert.match(css,/\.focus-country-brief \.focus-country-reference-month strong\{font-weight:700\}/);
});
