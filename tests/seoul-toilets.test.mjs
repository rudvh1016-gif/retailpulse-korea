import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {searchToilets,toiletSnapshot} from '../lib/seoul-toilets.ts';
for(const [area,district,count] of [['myeongdong','중구',157],['hongdae','마포구',183],['seongsu','성동구',189],['itaewon','용산구',120]]) {
  test(`${area} preserves official district snapshot, unique rows, hours and coordinates`,()=>{
    const raw=JSON.parse(readFileSync(`public/data/seoul-toilets/${area}.json`,'utf8'));
    const snapshot=toiletSnapshot(raw,area);
    assert.ok(snapshot);assert.equal(snapshot.rows.length,count);assert.equal(snapshot.district,district);
    assert.equal(snapshot.snapshotDate,'2026-10-09');assert.match(raw.sourceSha256,/^[a-f0-9]{64}$/);
    assert.equal(new Set(snapshot.rows.map(row=>row.id)).size,count);
    assert.ok(snapshot.rows.every(row=>row.hours===row.hours.trim() && !row.hours.includes('|')));
    assert.ok(!('currentlyOpen' in snapshot));
    assert.equal(toiletSnapshot(raw,'wrong-area'),null);
    const row=snapshot.rows.find(row=>row.longitude!==null && row.latitude!==null);
    assert.ok(row && row.longitude>126 && row.latitude>37);
    assert.equal(searchToilets(snapshot.rows,'  '+row.name+' ').some(value=>value.id===row.id),true);
    assert.equal(searchToilets(snapshot.rows,'NO-SUCH-OFFICIAL-PLACE').length,0);
  });
}
test('invalid coordinates, duplicate ids and a foreign district are rejected',()=>{
  const raw=JSON.parse(readFileSync('public/data/seoul-toilets/myeongdong.json','utf8'));
  for(const changes of [{longitude:NaN},{latitude:0},{district:'마포구'}]) {
    const value=structuredClone(raw);Object.assign(value.rows[0],changes);assert.equal(toiletSnapshot(value,'myeongdong'),null);
  }
  raw.rows.push({...raw.rows[0]});assert.equal(toiletSnapshot(raw,'myeongdong'),null);
});
