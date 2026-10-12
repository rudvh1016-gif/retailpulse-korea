import test from 'node:test';import assert from 'node:assert/strict';
import {destinationVolumeOrder} from '../lib/airport-destination-volume-order';
test('volume ranking sorts before the top-eight cutoff without mutating values or pinning US',()=>{
 const rows=[{country:'JP',current:82.54545454545455},{country:'CN',current:52.09090909090909},{country:'VN',current:20},{country:'TH',current:10.181818181818182},{country:'PH',current:8.636363636363637},{country:'TW',current:9.545454545454545},{country:'MN',current:2},{country:'HK',current:5},{country:'US',current:26.545454545454547},{country:'KR',current:6.090909090909091}];
 const before=structuredClone(rows),ordered=destinationVolumeOrder(rows);
 assert.deepEqual(ordered.slice(0,8).map(row=>row.country),['JP','CN','US','VN','TH','TW','PH','KR']);assert.deepEqual(ordered.slice(8).map(row=>row.country),['HK','MN']);assert.deepEqual(rows,before);for(const row of ordered)assert.ok(rows.includes(row));
 assert.equal(destinationVolumeOrder([{country:'US',current:1},{country:'VN',current:2}])[0].country,'VN');
});
test('exact means precede rounded ties; true zero precedes missing; exact ties use stable ISO order',()=>{
 const rows=[{country:'ZZ',current:null},{country:'US',current:0},{country:'JP',current:1.04},{country:'CN',current:1.03},{country:'VN',current:1.04},{country:'AA',current:null},{country:'KR',current:0}];
 assert.deepEqual(destinationVolumeOrder(rows).map(row=>row.country),['JP','VN','CN','KR','US','AA','ZZ']);assert.deepEqual(destinationVolumeOrder([...rows].reverse()),destinationVolumeOrder(rows));
});
