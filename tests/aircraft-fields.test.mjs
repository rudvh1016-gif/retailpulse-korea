import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {normalizeAirportFlight} from '../lib/source-adapters.ts';
import {collectAirportFlights} from '../lib/collector.ts';
import {readAircraftFields} from '../lib/aircraft-fields.ts';
import {fetchA1DeparturesForDate, collectAirportFlightsToday} from '../lib/airport-today.ts';
import {readFlightsForDate} from '../app/api/live/flights/route.ts';
import {persistDepartureSchedules} from '../lib/departure-schedule.ts';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
const at='2026-10-22T01:00:00Z';
const raw={fid:'fixture',flightId:'KE917',masterFlightId:'KE917',codeshare:'N',scheduleDatetime:'202610221105',estimatedDatetime:'202610221105',terminalId:'P03',airline:'대한항공',airport:'취리히',gateNumber:'231',remark:'정상'};
const payload=items=>({response:{header:{resultCode:'00'},body:{items,totalCount:items.length}}});

test('optional A1 tokens normalize only known fields, bound size and do not leak invalid values', async()=>{
 assert.deepEqual(readAircraftFields({aircraftSubtype:' b787-10 ',regNo:'hl9999'}),{aircraftSubtype:'B787-10',aircraftRegNo:'HL9999'});
 for(const value of [null,undefined,'','-','UNKNOWN',{},99,'x'.repeat(200),'https://secret.test/?serviceKey=x']) {
  assert.deepEqual(readAircraftFields({aircraftSubtype:value,regNo:value}),{aircraftSubtype:null,aircraftRegNo:null});
 }
 assert.equal(readAircraftFields({regNo:'HL9999',aircraftRegNo:'HL9998'}).aircraftRegNo,null);
 assert.equal((await normalizeAirportFlight({...raw,aircraftSubtype:'B787-10',regNo:'HL9999'},'departure',at,'INCHEON_DUTY_FREE_ACTUAL')).aircraftSubtype,null);
});
test('absent fields retain exact legacy semantic hash; type/tail changes affect semantics not physical identity',async()=>{
 const old=await normalizeAirportFlight(raw,'departure',at);
 const legacy={sourceId:old.sourceId,physicalFlightId:old.physicalFlightId,upstreamFid:old.upstreamFid,direction:old.direction,flightNumber:old.flightNumber,masterFlightNumber:old.masterFlightNumber,codeshare:old.codeshare,airlineCode:old.airlineCode,airportCode:old.airportCode,terminal:old.terminal,gate:old.gate,checkinCounter:old.checkinCounter,status:old.status,scheduledAt:old.scheduledAt,changedAt:old.changedAt};
 // Existing hash helper canonicalizes recursively, including property ordering.
 const {sha256}=await import('../lib/hash.ts'); assert.equal(old.sourceHash,await sha256(legacy));
 const known=await normalizeAirportFlight({...raw,aircraftSubtype:'B787-10',regNo:'HL9999'},'departure',at);
 const repeat=await normalizeAirportFlight({...raw,aircraftSubtype:'B787-10',regNo:'HL9999'},'departure','2026-10-22T02:00:00Z');
 const swap=await normalizeAirportFlight({...raw,aircraftSubtype:'B777-300ER',regNo:'HL8888'},'departure',at);
 assert.equal(known.sourceHash,repeat.sourceHash);assert.notEqual(known.sourceHash,old.sourceHash);assert.notEqual(swap.sourceHash,known.sourceHash);
 assert.equal(known.physicalFlightId,swap.physicalFlightId);assert.equal(old.physicalFlightId,known.physicalFlightId);
});
test('same existing request captures current/future fields; codeshares cannot replace operating aircraft metadata',async()=>{
 for(const reverse of [false,true]) for (const metadata of [{aircraftSubtype:'B777-300ER',regNo:'HL8888'},{}]){
  const op={...raw,aircraftSubtype:'B787-10',regNo:'HL9999'};
  const share={...raw,flightId:'DL9917',codeshare:'Y',...metadata};
  let calls=0;
  const rows=[op,share,{...op,flightId:'KE919',masterFlightId:'KE919',scheduleDatetime:'202610231105'}];
  const result=await fetchA1DeparturesForDate('fixture-key','2026-10-22',async()=>{calls++;return payload(reverse?rows.reverse():rows);});
  assert.equal(calls,1);assert.equal(result.requestsIssued,1);assert.equal(result.records.length,1);assert.equal(result.futureRecords.length,1);
  assert.equal(result.records[0].aircraftRegNo,'HL9999');assert.equal(result.futureRecords[0].aircraftSubtype,'B787-10');
 }
});
test('real SQLite persistence and existing read path retain current/future metadata, changed-only and null-on-disappearance',async()=>{
 const db=new SqliteD1();let calls=0;let metadata={aircraftSubtype:'B787-10',regNo:'HL9999'};
 const fetcher=async()=>{calls++;return payload([{...raw,...metadata},{...raw,...metadata,flightId:'KE919',masterFlightId:'KE919',scheduleDatetime:'202610231105'}]);};
 try{
  const env={DB:db,DATA_GO_KR_SERVICE_KEY:'fixture-key',A1_RESCAN_TODAY:true};
  await collectAirportFlightsToday(env,new Date(at),fetcher);
  assert.equal(db.raw.prepare('SELECT aircraft_reg_no n FROM airport_flights').get().n,'HL9999');
  const first=db.raw.prepare('SELECT source_hash h,retrieved_at at FROM airport_flights').get();
  await collectAirportFlightsToday(env,new Date(at),fetcher);
  assert.deepEqual(db.raw.prepare('SELECT source_hash h,retrieved_at at FROM airport_flights').get(),first);
  assert.equal((await readFlightsForDate(db,'2026-10-22','2026-10-22')).flights[0].aircraftSubtype,'B787-10');
  assert.equal((await readFlightsForDate(db,'2026-10-23','2026-10-22')).flights[0].aircraftRegNo,'HL9999');
  metadata={};await collectAirportFlightsToday(env,new Date(at),fetcher);
  assert.equal(db.raw.prepare('SELECT aircraft_reg_no n FROM airport_flights').get().n,null);
  assert.equal((await readFlightsForDate(db,'2026-10-23','2026-10-22')).flights[0].aircraftRegNo,null);
  assert.equal(calls,3);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM airport_flights').get().n,1);
 }finally{db.raw.close();}
});
test('production-shaped optional fields preserve schedule byte/row caps and zero repeated changed rows',async t=>{
 const db=new SqliteD1();
 const baseline=await normalizeAirportFlight({...raw,aircraftSubtype:'B777-300ER',regNo:'HL9999'},'departure',at);
 const rows=Array.from({length:3300},(_,i)=>({...baseline,physicalFlightId:String(i).padStart(64,'0'),flightNumber:`KE${i}`,masterFlightNumber:`KE${i}`,scheduledAt:`2026-10-${23+Math.floor(i/550)}T11:05:00+09:00`}));
 try{
  assert.equal((await persistDepartureSchedules(db,'2026-10-22',rows)).changedRows,6);
  assert.equal((await persistDepartureSchedules(db,'2026-10-22',rows)).changedRows,0);
  const payloads=db.raw.prepare('SELECT payload FROM airport_departure_schedule').all().map(r=>r.payload);
  const sizes=payloads.map(value=>Buffer.byteLength(value));
  const withoutAircraft=payloads.map(value=>Buffer.byteLength(JSON.stringify(JSON.parse(value).map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['aircraftSubtype','aircraftRegNo'].includes(key))))))).reduce((a,b)=>a+b,0);
  assert.ok(Math.max(...sizes)<500000);assert.ok(sizes.reduce((a,b)=>a+b,0)<3000000);
  t.diagnostic(`INTERNAL_ESTIMATE, synthetic: 3300 rows, six held dates, ${sizes.reduce((a,b)=>a+b,0)} bytes (+${sizes.reduce((a,b)=>a+b,0)-withoutAircraft} for aircraft metadata); max ${Math.max(...sizes)} per day. No provider or production D1 calls.`);
 }finally{db.raw.close();}
});
test('capture does not alter summary/cache/split formulas or provider request controls',()=>{
 const api=readFileSync('app/api/live/flights/route.ts','utf8');
 assert.match(api,/LIMIT 1201/); assert.match(api,/max-age=120, stale-while-revalidate=600/);
 const split=readFileSync('lib/airport-flight-split.ts','utf8');assert.doesNotMatch(split,/\.aircraftSubtype|\.aircraftRegNo|businessSeats/);
});


test('generic collector deduplicates both row orders, missing marketing metadata and repeated history writes',async()=>{
 const originalFetch=globalThis.fetch;
 try {
  for (const missing of [false,true]) for (const reverse of [false,true]) {
   const db=new SqliteD1();let calls=0;
   const op={...raw,aircraftSubtype:'B787-10',regNo:'HL9999'};
   const marketing={...raw,flightId:'DL9917',codeshare:'Y',...(missing?{}:{aircraftSubtype:'B777-300ER',regNo:'HL8888'})};
   let rows=reverse?[marketing,op]:[op,marketing];
   globalThis.fetch=async()=>{calls++;return Response.json(payload(rows));};
   try {
    const env={DB:db,DATA_GO_KR_SERVICE_KEY:'fixture-key',retainChangeHistory:true};
    const first=await collectAirportFlights(env);
    assert.equal(first.status,'SUCCESS');assert.equal(first.records,2); // One current + one existing history row.
    const stored=db.raw.prepare('SELECT aircraft_subtype,aircraft_reg_no,source_hash,retrieved_at FROM airport_flights').get();
    assert.equal(stored.aircraft_subtype,'B787-10');assert.equal(stored.aircraft_reg_no,'HL9999');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM airport_flights').get().n,1);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM airport_flight_changes').get().n,1);
    rows=[...rows].reverse();
    for(let repeat=0;repeat<2;repeat++) {
     assert.deepEqual(await collectAirportFlights(env),{status:'SUCCESS',records:0});
     assert.deepEqual(db.raw.prepare('SELECT aircraft_subtype,aircraft_reg_no,source_hash,retrieved_at FROM airport_flights').get(),stored);
     assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM airport_flight_changes').get().n,1);
    }
    assert.equal(calls,3);
    assert.equal(db.calls.filter(sql=>sql.startsWith('INSERT INTO airport_flights (')).length,3);
   } finally { db.raw.close(); }
  }
 } finally { globalThis.fetch=originalFetch; }
});
