import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(path,'utf8');
test('direct airport percentage labels use integer precision, independent of fractional flight means',()=>{
 for(const path of ['app/airport-concept-model.tsx','app/airport-zone-countries.tsx']){
  assert.doesNotMatch(source(path),/toFixed\(1\)/);
  assert.match(source(path),/toFixed\(0\)/);
 }
 const monthly=source('app/airport-monthly-flights.tsx');
 assert.match(monthly,/const fmt=new Intl.NumberFormat\([^\n]+maximumFractionDigits:1/);
 assert.match(monthly,/const percentage=[^\n]+maximumFractionDigits:0/);
 const glance=source('app/airport-glance-preview.tsx');
 for(const value of ['row.flights/data.total*100','shares[side]!','row.share','counts[side]/counts.total*100','forecastPassengers','transferPassengers','referenceSum.total'])assert.ok(glance.includes(`integer.format(${value})`),value);
 assert.ok(glance.includes('fmt.format(dailyComparison.mean)'));
});
test('commercial percentage labels and accessible labels share whole-number formatting',()=>{
 const composition=source('app/commercial-composition.tsx');
 assert.equal((composition.match(/maximumFractionDigits:0/g)||[]).length,2);
 assert.doesNotMatch(composition,/maximumFractionDigits:1/);
});
