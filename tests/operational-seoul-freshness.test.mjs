import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteD1 } from './helpers/operational-sqlite.mjs';
import { publicAreaIds } from '../lib/areas.ts';
import { measureSource, sourceFreshnessEvidence, verifyPublicMeasurement } from '../lib/operational-evidence.ts';
import { SEOUL_REALTIME_STALE_MINUTES } from '../lib/seoul-freshness.ts';
import { summarizeLiveSummary } from '../app/api/live/summary/route.ts';
import { kstDayBounds, kstDayOf, kstHourStartIsoOf, kstNowIsoOf } from '../lib/kst.ts';

const now='2026-10-20T18:19:00.000Z';
const sources=['SEOUL_CITYDATA_PPLTN','SEOUL_CITYDATA_CMRCL'];
const clock={generatedAt:now,now:Date.parse(now),kstNowIso:kstNowIsoOf(now),kstToday:kstDayOf(now),
  kstHourStart:kstHourStartIsoOf(now),serviceDate:kstDayOf(now),dayRelation:'TODAY',dayStartAt:kstDayBounds(kstDayOf(now)).startAt};

function insert(db,table,row) {
  const keys=Object.keys(row);
  db.raw.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
}

function fixture(ageMinutes) {
  const db=new SqliteD1();
  const observedAt=kstNowIsoOf(new Date(Date.parse(now)-ageMinutes*60_000).toISOString());
  for(const source of sources) {
    const population=source===sources[0],schemaVersion=population?'seoul-realtime-v1':'seoul-realtime-commercial-v1';
    insert(db,'collector_runs',{run_id:source,source_id:source,started_at:now,finished_at:now,status:'SUCCESS',records_read:4,records_written:4});
    insert(db,'source_health',{source_id:source,status:'LIVE',last_retrieved_at:now,schema_version:schemaVersion});
    for(const area of publicAreaIds) {
      const common={id:area,source_id:source,record_origin:'LIVE',area,area_code:area,area_name:area,
        observed_at:observedAt,retrieved_at:now,freshness:'LIVE',schema_version:schemaVersion,quality_status:'VALID',source_hash:area};
      if(population)insert(db,'seoul_realtime_area',{...common,congestion_level:2,congestion_label:'normal',population_min:100,population_max:200});
      else insert(db,'seoul_realtime_commercial',{...common,commercial_level:'normal',payment_count:10,payment_amount_min:1000,payment_amount_max:2000});
    }
  }
  return db;
}

for(const age of [35,36,40,41,59])test(`Seoul health and public summary share the existing 40-minute contract at ${age} minutes`,async(t)=>{
  const db=fixture(age);t.after(()=>db.raw.close());
  const body=await (await summarizeLiveSummary(db,clock)).json();
  const fresh=age<=40;
  assert.equal(SEOUL_REALTIME_STALE_MINUTES,40,'this fix does not extend the public freshness contract');
  for(const source of sources) {
    const measurement=await measureSource(db,source,now);
    const property=source===sources[0]?'realtime':'commercial';
    assert.equal(measurement.storageValid,true);
    assert.equal(measurement.dataValid,fresh,'a recent retrieval cannot make an old observation fresh');
    assert.equal(measurement.failureClass,fresh?null:'STALE');
    verifyPublicMeasurement(measurement,{today:body,tomorrow:null});
    assert.equal(measurement.publicValid,true,'published stale values can match storage without becoming fresh');
    for(const area of publicAreaIds)assert.equal(body.areas[area][property].freshness,fresh?'LIVE':'STALE');
    const before=db.calls.length;
    const diagnostic=sourceFreshnessEvidence(measurement);
    assert.equal(db.calls.length,before,'diagnostics reuse the measured rows without another DB read');
    assert.equal(diagnostic.staleAfterMinutes,40);
    assert.deepEqual(diagnostic.areas.map(row=>row.ageMinutes),publicAreaIds.map(()=>age));
    if(age===59)assert.ok(diagnostic.areas.every(row=>row.observedAt==='2026-10-20T17:20:00.000Z'));
  }
});

test('one delayed Seoul area is retained separately and keeps the source stale',async(t)=>{
  const db=fixture(10);t.after(()=>db.raw.close());
  db.raw.prepare('UPDATE seoul_realtime_area SET observed_at=? WHERE area=?').run('2026-10-21T02:20:00+09:00','hongdae');
  const measurement=await measureSource(db,sources[0],now);
  const rows=sourceFreshnessEvidence(measurement).areas;
  assert.equal(measurement.failureClass,'STALE');
  assert.equal(rows.find(row=>row.area==='hongdae').ageMinutes,59);
  assert.ok(rows.filter(row=>row.area!=='hongdae').every(row=>row.ageMinutes===10));
});

test('clock diagnostics expose only bounded public areas and normalized timestamps',()=>{
  const evidence=sourceFreshnessEvidence({sourceId:sources[0],observedAt:now,sample:[
    {area:'hongdae',observed_at:'2026-10-21T02:20:00+09:00',provider_url:'private-url',population_min:123},
    {area:'myeongdong',observed_at:'not-a-timestamp'},
    {area:'not-public',observed_at:now},
  ]});
  assert.deepEqual(evidence.areas.map(row=>row.area),publicAreaIds);
  assert.equal(evidence.areas.length,4);
  assert.deepEqual(evidence.areas.find(row=>row.area==='hongdae'),{area:'hongdae',observedAt:'2026-10-20T17:20:00.000Z',ageMinutes:59});
  for(const row of evidence.areas.filter(row=>row.area!=='hongdae'))assert.deepEqual(row,{area:row.area,observedAt:null,ageMinutes:null});
  assert.doesNotMatch(JSON.stringify(evidence),/private-url|population_min|not-public|not-a-timestamp/);
  assert.equal(sourceFreshnessEvidence({sourceId:'KMA_VILAGE_FCST',observedAt:now,sample:[]}),null);
  const invalidClock=sourceFreshnessEvidence({sourceId:sources[0],observedAt:'invalid',sample:[{area:'hongdae',observed_at:now}]});
  assert.equal(invalidClock.areas.find(row=>row.area==='hongdae').ageMinutes,null);
});

test('shared threshold cannot promote incomplete or invalid Seoul storage',async(t)=>{
  const db=fixture(36);t.after(()=>db.raw.close());
  db.raw.prepare('DELETE FROM seoul_realtime_area WHERE area=?').run('hongdae');
  const incomplete=await measureSource(db,sources[0],now);
  assert.equal(incomplete.failureClass,'PARTIAL_DATA');
  assert.equal(incomplete.dataValid,false);
  assert.deepEqual(sourceFreshnessEvidence(incomplete).areas.find(row=>row.area==='hongdae'),{area:'hongdae',observedAt:null,ageMinutes:null});
  db.raw.prepare('UPDATE seoul_realtime_commercial SET quality_status=? WHERE area=?').run('PARTIAL','hongdae');
  const invalid=await measureSource(db,sources[1],now);
  assert.equal(invalid.failureClass,'INVALID_PAYLOAD');
  assert.equal(invalid.dataValid,false);
});
