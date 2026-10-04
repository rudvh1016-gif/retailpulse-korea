import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialComposition,compositionRingPath} from '../lib/commercial-composition';
import type {CategoryActivity} from '../lib/seoul-context';
const row=(category:string,payments:number|null):CategoryActivity=>({group:'Dining',category,payments,amountMin:10,amountMax:100,level:'busy'});
test('every category contributes exact count proportions without a fixed category cap',()=>{
 const rows=Array.from({length:31},(_,i)=>row(`category ${i}`,i));const m=commercialComposition(rows);
 assert.equal(m.segments.length,31);assert.equal(m.total,465);assert.equal(m.segments.at(-1)?.count,0);assert.equal(m.segments[0].ratio,30/465);assert.ok(Math.abs(m.segments.at(-1)!.end-1)<1e-12);
 assert.deepEqual(commercialComposition(rows.map(r=>({...r,amountMin:500,level:'quiet'}))).segments.map(s=>s.ratio),m.segments.map(s=>s.ratio));
});
test('missing, invalid classifications, total-only rows and zero remain distinct',()=>{
 assert.equal(commercialComposition([]).status,'missing');assert.equal(commercialComposition([row('A',0)]).status,'zero');
 const m=commercialComposition([row('A',2),row('B',null)]);assert.equal(m.status,'missing');assert.ok(m.segments.every(s=>s.ratio===null));
 assert.equal(commercialComposition([row('A',2),row('A',3)]).status,'invalid');assert.equal(commercialComposition([row('total',3)]).status,'invalid');
 assert.equal(commercialComposition([row('A',-1)]).status,'missing');
});
test('a full circle and tiny nonzero categories retain their real angular interval',()=>{
 assert.equal(compositionRingPath(0,0),'');assert.equal((compositionRingPath(0,1).match(/ A /g)||[]).length,4);
 const m=commercialComposition([row('A',1_000_000),row('B',1)]);assert.equal(m.segments[1].ratio,1/1_000_001);assert.notEqual(compositionRingPath(m.segments[1].start,m.segments[1].end),'');
});
