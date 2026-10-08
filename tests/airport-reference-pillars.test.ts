import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateByFlights } from '../lib/airport-flight-split';
import { referencePillars } from '../lib/airport-reference-pillars';
test('pillar heights retain arbitrary real data, T1 concourse denominator, ties and rounding separately',()=>{
  const estimate=estimateByFlights(53123,{east:67,west:67,center:1,unverified:0,concourse:120,outsideScope:0})!;
  const parts=referencePillars(estimate)!;
  assert.equal(parts.length,4);
  assert.equal(parts[0].rawPeople,53123*67/255);
  assert.equal(parts[0].rawPeople,parts[1].rawPeople);
  assert.equal(parts[3].flights,120,'no six-flight scene cap');
  assert.equal(parts[3].rawPeople,53123*120/255);
  assert.equal(parts.reduce((sum,row)=>sum+row.rawPeople,0),53123);
});
test('unverified locations or unknown buildings cannot be presented as a passenger estimate',()=>{
  const estimate=estimateByFlights(3000,{east:2,west:1,center:0,unverified:0,concourse:null,outsideScope:0})!;
  assert.equal(referencePillars({...estimate,unverified:{flights:1,people:1000}}),null);
  assert.equal(referencePillars({...estimate,outsideScope:1}),null);
  assert.equal(referencePillars({...estimate,flights:4}),null);
});
test('zero forecasts remain zero while positive sub-hundred estimates retain positive height',()=>{
  const zero=estimateByFlights(0,{east:1,west:0,center:0,unverified:0,concourse:null,outsideScope:0})!;
  assert.deepEqual(referencePillars(zero)!.map(x=>x.rawPeople),[0,0,0]);
  const small=estimateByFlights(20,{east:1,west:1,center:0,unverified:0,concourse:null,outsideScope:0})!;
  assert.equal(referencePillars(small)![0].rawPeople,10);
  assert.equal(referencePillars(small)![0].people,0);
});
