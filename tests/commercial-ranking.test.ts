import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankPublishedMetric} from '../lib/commercial-ranking';
test('numbers descend, zero stays published, unavailable rows stay last with stable ties',()=>{
 const rows=[{id:'travel',value:null},{id:'zero',value:0},{id:'a',value:30},{id:'b',value:30},{id:'small',value:2},{id:'bad',value:NaN}];
 const original=structuredClone(rows);assert.deepEqual(rankPublishedMetric(rows,r=>r.value).map(r=>r.id),['a','b','small','zero','travel','bad']);assert.deepEqual(rows,original);
});
test('ordering follows the selected displayed metric without calculating new values',()=>{
 const rows=[{id:'a',current:2,payments:90},{id:'b',current:80,payments:1}];
 assert.deepEqual(rankPublishedMetric(rows,r=>r.current).map(r=>r.id),['b','a']);assert.deepEqual(rankPublishedMetric(rows,r=>r.payments).map(r=>r.id),['a','b']);
});
