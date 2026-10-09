import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopedFlightPayload} from '../lib/airport-flight-scope';
import {collectAirportFlights} from '../lib/collector';
import {collectAirportFlightsToday} from '../lib/airport-today';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('a blocked shared budget makes zero provider requests in either A1 entry point',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not fetch');});
 const db={prepare:()=>({bind:()=>({run:async()=>({results:[]})})})} as unknown as D1Database;
 const env={DB:db,DATA_GO_KR_SERVICE_KEY:'fixture-key',A1_SHARED_REQUEST_BUDGET:true};
 assert.equal((await collectAirportFlights(env)).status,'SKIPPED_REQUEST_BUDGET');
 assert.equal((await collectAirportFlightsToday(env,new Date('2026-10-09T15:00:00Z'),async()=>{calls++;throw Error('must not fetch');})).status,'SKIPPED_REQUEST_BUDGET');assert.equal(calls,0);
});

test('external nonpublication never increments the failure count or advances the last observed clock',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0001_crazy_nekra.sql','utf8'));sql.exec(readFileSync('drizzle/0018_airport_departure_schedule.sql','utf8'));
 const db={prepare(query:string){return {bind(...params:(string|number|null)[]){return {query,params,async run(){return {meta:{changes:Number(sql.prepare(query).run(...params).changes)}}}}}}},async batch(statements:Array<{query:string;params:(string|number|null)[]}>) {return statements.map(s=>({meta:{changes:Number(sql.prepare(s.query).run(...s.params).changes)}}));}} as unknown as D1Database;
 const last='2026-10-09T13:00:00Z';sql.prepare('INSERT INTO source_health(source_id,status,last_retrieved_at,consecutive_failures,schema_version,updated_at) VALUES(?,?,?,?,?,?)').run('INCHEON_FLIGHT_DETAIL','STALE',last,3,'airport-v1',last);
 try{const result=await collectAirportFlightsToday({DB:db,DATA_GO_KR_SERVICE_KEY:'fixture-key'},new Date('2026-10-09T15:00:01Z'),async()=>({response:{header:{resultCode:'00'},body:{totalCount:1,items:[{fid:'future',flightId:'KE11',scheduleDatetime:'202610110900',terminalId:'P03',airline:'KE',airport:'NRT',remark:'정상'}]}}}));assert.equal(result.status,'NOT_YET_PUBLISHED');const row=sql.prepare('SELECT last_retrieved_at,consecutive_failures,detail FROM source_health WHERE source_id=?').get('INCHEON_FLIGHT_DETAIL')!;assert.equal(row.last_retrieved_at,last);assert.equal(row.consecutive_failures,3);assert.match(String(row.detail),/NOT_YET_PUBLISHED/);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM airport_departure_schedule').get()!.n,1);}finally{sql.close();}
});
test('a missing T2 or concourse uses its own held schedule; T1 and all retain collected basis',()=>{
 const t1={id:'observed-t1'},t2={id:'planned-t2'},concourse={id:'planned-concourse'};
 const p={basis:'COLLECTED_FLIGHT_RECORDS',flights:[t1],retrievedAt:'2026-10-09T15:01:00Z',terminalFallbacks:{T2:{basis:'OFFICIAL_DEPARTURE_SCHEDULE' as const,flights:[t2],retrievedAt:'2026-10-09T14:00:00Z',truncated:false},CONCOURSE:{basis:'OFFICIAL_DEPARTURE_SCHEDULE' as const,flights:[concourse],retrievedAt:'2026-10-09T14:00:00Z',truncated:false}}};
 assert.equal(scopedFlightPayload(p,'all'),p);assert.equal(scopedFlightPayload(p,'T1'),p);
 assert.deepEqual(scopedFlightPayload(p,'T2').flights,[t2]);assert.equal(scopedFlightPayload(p,'T2').basis,'OFFICIAL_DEPARTURE_SCHEDULE');assert.equal(scopedFlightPayload(p,'T2').retrievedAt,'2026-10-09T14:00:00Z');assert.deepEqual(scopedFlightPayload(p,'CONCOURSE').flights,[concourse]);
});
