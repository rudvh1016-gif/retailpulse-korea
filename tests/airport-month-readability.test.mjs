import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
const source=readFileSync(new URL('../app/airport-monthly-flights.tsx',import.meta.url),'utf8');
const css=postcss.parse(readFileSync(new URL('../app/airport-monthly-flights.css',import.meta.url),'utf8'));
const rule=selector=>{let result;css.walkRules(selector,node=>{result={...result,...Object.fromEntries(node.nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]))};});return result;};
test('zone comparison has a meaningful heading and keeps period and units next to the table',()=>{
 assert.match(source,/data-testid=\{zones\?'airport-month-zones'/);
 assert.match(source,/구역별 항공편 · 전월 비교/);
 assert.match(source,/row\(label,counts=>counts.sides\[key\]\)\),false,true,true/);
 assert.match(source,/일평균 편수 · 편\/일/);
 assert.match(source,/showBasis&&<span className="airport-month-basis">\{comparisonBasis\}/);
});
test('flight means, percent precision, all category disclosures and source evidence remain intact',()=>{
 assert.match(source,/const fmt=new Intl.NumberFormat\([^\n]+maximumFractionDigits:1/);
 assert.match(source,/const percentage=[^\n]+maximumFractionDigits:0/);
 for(const kind of ['destinationCountries','airlines','registrationCountries'])assert.ok(source.includes(`breakdown('${kind}'`));
 assert.ok(source.indexOf('전월 평균이 0이거나')>source.indexOf('포함 날짜·제외 자료·출처'));
 for(const value of ['data.includedDays.join','data.excludedDays.map','data.cancelled','response?.data?.sidesVersion','response?.data?.destinationsVersion','request.retry'])assert.ok(source.includes(value),value);
 assert.match(source,/<th scope="row">\{label\}<\/th><td>\{value\(pair.previous\)\}<\/td><td>\{value\(pair.current\)\}<\/td>/);
});
test('scoped typography is charcoal and disclosures stay native with usable targets',()=>{
 const summary=rule('.airport-month-flights > details > summary');
 assert.equal(summary['font-size'],'18px');assert.equal(summary['font-weight'],'var(--weight-strong)');
 assert.equal(summary.color,'#222326');
 assert.doesNotMatch(source,/<h4[^>]*data-heading/);
 assert.match(source,/<h4 className="airport-month-zone-title">/);
 assert.equal(rule('.airport-month-flights .airport-month-zone-title')['font-size'],'24px');
 assert.equal(rule('.airport-month-flights select,.airport-month-flights button,.airport-month-flights summary')['min-block-size'],'44px');
 assert.equal(rule('.airport-month-table th:not(:first-child),.airport-month-table td')['white-space'],'nowrap');
 assert.equal(rule('.airport-month-flights > .airport-month-table table,.airport-month-flights > details > .airport-month-table table')['font-size'],'16px');
});
