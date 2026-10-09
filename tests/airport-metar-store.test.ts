import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {claimAirportMetarAttempt,saveAirportMetarAttempt,readAirportMetarSnapshot,collectPreparedAirportMetar} from '../lib/airport-metar-store';
import {verifiedStoredMetarAttempt,type AirportMetarAttempt} from '../lib/airport-metar-observation';
import {airportWeatherResponse} from '../app/api/airport/weather/route';
const proof=JSON.parse(readFileSync(new URL('../docs/reviews/metar-connection-20261009/connection-proof.json',import.meta.url),'utf8'));
const start=Date.parse('2026-10-09T02:47:54Z');
function attempt(at=start,observed='2026-10-09T02:30:00Z',wind=6):AirportMetarAttempt{
 const observation={...proof.actualObservation,sourceId:'KMA_RKSI_METAR',reportType:'METAR',observedAt:observed,
  measurementScope:'GROUND_OBSERVATION',turbulenceRisk:'NOT_INFERRED',measurements:{...proof.actualObservation.measurements,meanWindSpeed:{value:wind,unit:'[kn_i]'}}};
 return verifiedStoredMetarAttempt({status:'OK',retrievedAt:new Date(at).toISOString(),observation})!;
}
function wrapper(sql:DatabaseSync){
 const prepare=(text:string)=>{let params:unknown[]=[];const statement={bind(...values:unknown[]){params=values;return statement;},async first(){return sql.prepare(text).get(...params as never[])??null;},async run(){const result=sql.prepare(text).run(...params as never[]);return {success:true,meta:{changes:Number(result.changes)}};}};return statement;};
 return {prepare,async batch(statements:{run:()=>Promise<unknown>}[]){sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as Pick<D1Database,'prepare'|'batch'>;
}
function setup(t:test.TestContext){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0025_airport_metar.sql',import.meta.url),'utf8'));t.after(()=>sql.close());return {sql,db:wrapper(sql)};}
async function save(db:Pick<D1Database,'prepare'|'batch'>,input=attempt(),lease='one'){assert.equal(await claimAirportMetarAttempt(db,new Date(input.retrievedAt!),lease),true);return saveAirportMetarAttempt(db,input,lease);}

test('actual safe captured fields pass local canonical save, stored API and cache read',async t=>{
 const {db}=setup(t);assert.equal((await save(db)).changedRows,1);
 const response=await airportWeatherResponse(db,new Date(start+6000));const body=await response.json();
 assert.equal(body.station,'RKSI');assert.equal(body.status,'CURRENT');assert.equal(body.storage,'READY');
 assert.deepEqual(body.observation.measurements.meanWindSpeed,proof.actualObservation.measurements.meanWindSpeed);
 assert.equal(body.observation.observedAt,'2026-10-09T02:30:00.000Z');
 assert.equal(response.headers.get('cache-control'),'public, max-age=60');
 assert.equal(body.fogState,'UNKNOWN');assert.equal(body.turbulenceRisk,'NOT_INFERRED');
});
test('unchanged canonical observation writes zero rows and keeps original observation/retrieval time',async t=>{
 const {db}=setup(t);await save(db);const second=await save(db,attempt(start+3_600_001),'two');
 assert.equal(second.changedRows,0);const body=await readAirportMetarSnapshot(db,new Date(start+3_600_100));
 assert.equal(body.retrievedAt,new Date(start).toISOString());assert.equal(body.attemptedAt,new Date(start+3_600_001).toISOString());
 assert.equal(body.status,'CURRENT');
});
test('hour budget survives expired lease and duplicate calls without invoking the loader',async t=>{
 const {db}=setup(t);await claimAirportMetarAttempt(db,new Date(start),'crashed');
 assert.equal(await claimAirportMetarAttempt(db,new Date(start+120_001),'lease-expired'),false);
 let calls=0;const result=await collectPreparedAirportMetar(db,async()=>{calls++;return attempt();},()=>new Date(start+300_000));
 assert.equal(calls,0);assert.equal(result.providerRequests,0);assert.equal(result.status,'SKIPPED_NOT_DUE');
});
test('two real database connections cannot both claim the same hour',async t=>{
 const file=join(mkdtempSync(join(tmpdir(),'koretail-metar-')),'local.sqlite');const a=new DatabaseSync(file),b=new DatabaseSync(file);
 a.exec(readFileSync(new URL('../drizzle/0025_airport_metar.sql',import.meta.url),'utf8'));t.after(()=>{a.close();b.close();});
 const results=await Promise.all([claimAirportMetarAttempt(wrapper(a),new Date(start),'A'),claimAirportMetarAttempt(wrapper(b),new Date(start),'B')]);
 assert.equal(results.filter(Boolean).length,1);
});
test('a stale lease cannot overwrite a newer observation or completion metadata',async t=>{
 const {db}=setup(t);await claimAirportMetarAttempt(db,new Date(start),'old');
 await claimAirportMetarAttempt(db,new Date(start+3_600_001),'new');await saveAirportMetarAttempt(db,attempt(start+3_600_010,'2026-10-09T03:30:00Z',7),'new');
 const old=await saveAirportMetarAttempt(db,attempt(),'old');assert.equal(old.leaseOwned,false);assert.equal(old.changedRows,0);
 const body=await readAirportMetarSnapshot(db,new Date(start+3_600_100));assert.equal(body.observation?.measurements.meanWindSpeed?.value,7);
 assert.equal(body.attemptedAt,new Date(start+3_600_010).toISOString());
});
test('failed refresh preserves last-good data and clocks, marks stale and caches nothing',async t=>{
 const {db}=setup(t);await save(db);const at=start+3_600_001;
 const failure:AirportMetarAttempt={status:'TIMEOUT',retrievedAt:new Date(at).toISOString(),observation:null};await save(db,failure,'failure');
 const body=await readAirportMetarSnapshot(db,new Date(at+100));assert.equal(body.status,'STALE');assert.equal(body.latestAttemptStatus,'TIMEOUT');
 assert.equal(body.retrievedAt,new Date(start).toISOString());assert.equal(body.observation?.measurements.meanWindSpeed?.value,6);assert.equal(body.cacheControl,'no-store');
});
test('out-of-order and unverified same-time correction preserve canonical row',async t=>{
 const {db}=setup(t);await save(db);const conflict=await save(db,attempt(start+3_600_001,undefined,9),'conflict');
 assert.equal(conflict.status,'CONFLICTING_REPORTS');assert.equal(conflict.changedRows,0);
 const older=await save(db,attempt(start+7_200_010,'2026-10-09T02:00:00Z'),'older');assert.equal(older.status,'OUT_OF_ORDER');assert.equal(older.changedRows,0);
 const body=await readAirportMetarSnapshot(db,new Date(start+7_200_100));assert.equal(body.observation?.measurements.meanWindSpeed?.value,6);
});
test('authentication and rate blocking cost one attempt and block the next 24 hours',async t=>{
 const {db}=setup(t);const failure:AirportMetarAttempt={status:'AUTH_BLOCKED',retrievedAt:new Date(start).toISOString(),observation:null};await save(db,failure);
 assert.equal(await claimAirportMetarAttempt(db,new Date(start+3_600_001),'blocked'),false);
 assert.equal(await claimAirportMetarAttempt(db,new Date(start+86_400_001),'next-day'),true);
});
test('existing fifteen-minute opportunities can spend at most 24 mock requests per day',async t=>{
 const {db}=setup(t);let clock=start,calls=0;
 for(let index=0;index<96;index++){clock=start+index*900_000;await collectPreparedAirportMetar(db,async()=>{calls++;return attempt(clock);},()=>new Date(clock));}
 assert.equal(calls,24);assert.equal((await readAirportMetarSnapshot(db,new Date(clock))).status,'STALE');
});
test('incomplete schema, invalid stored unit and absent storage remain unavailable without leaking content',async t=>{
 const {db,sql}=setup(t);assert.equal((await (await airportWeatherResponse(db,new Date(start))).json()).status,'MISSING');
 await save(db);sql.prepare("UPDATE airport_metar_current SET observation_json=?").run(JSON.stringify({...attempt().observation,measurements:{meanWindSpeed:{value:6,unit:'untrusted'}}}));
 const invalid=await (await airportWeatherResponse(db,new Date(start+1000))).json();assert.equal(invalid.storage,'INVALID');assert.equal(invalid.observation,null);
 const unavailable=await airportWeatherResponse({prepare(){throw Error('private-secret-error');}} as never,new Date(start));
 assert.equal(unavailable.headers.get('cache-control'),'no-store');assert.equal((await unavailable.text()).includes('private-secret-error'),false);
 assert.equal(verifiedStoredMetarAttempt({...attempt(),observation:{...attempt().observation,station:'RKSS'}}),null);
});
test('indexed observation clock must match the validated serialized observation',async t=>{
 const {db,sql}=setup(t);await save(db);sql.prepare('UPDATE airport_metar_current SET observed_at=?').run('2026-10-09T03:00:00.000Z');
 const body=await readAirportMetarSnapshot(db,new Date(start+1000));assert.equal(body.storage,'INVALID');assert.equal(body.observation,null);
});
