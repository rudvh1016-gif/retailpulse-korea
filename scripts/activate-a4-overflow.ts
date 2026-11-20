import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { createWitnessedA4Reader, type A4Terminal } from '../lib/a4-overflow-public-read';
import { CloudflareD1RestDatabase } from '../lib/d1-rest';
import { productionA4Overflow, resolveProductionDatabaseConfig } from './production-database';

const origin='https://koretaildata.com';
const revision=process.env.RPK_EXPECTED_RELEASE;
if (!revision || !/^[0-9a-f]{40}$/.test(revision)) throw new Error('a4_release_revision_missing');
const config=resolveProductionDatabaseConfig('production');
const primary=new CloudflareD1RestDatabase(config.accountId,config.databaseId,config.apiToken);
const overflow=productionA4Overflow(config);
if(!overflow)throw new Error('a4_overflow_config_missing');
const read=createWitnessedA4Reader(primary as unknown as D1Database,overflow as unknown as D1Database);
type Row=Record<string,unknown>;
type Gate={cutover_at:string|null};
const terminals=['T1','T2'] as const;
const getGate=(terminal:A4Terminal)=>primary.prepare('SELECT cutover_at FROM a4_cutover WHERE terminal=?')
  .bind(terminal).first<Gate>();

async function publicRead<T>(path:string):Promise<T> {
  const url=new URL(path,origin);
  url.searchParams.set('a4_check',String(Date.now()));
  const response=await fetch(url,{signal:AbortSignal.timeout(12_000)});
  if(!response.ok)throw new Error(`a4_public_http_${response.status}`);
  return response.json() as Promise<T>;
}

async function requireRelease() {
  const build=await publicRead<{sha:string;dirty:boolean}>('/api/build');
  assert.equal(build.sha,revision);
  assert.equal(build.dirty,false);
}

async function verifyTerminal(terminal:A4Terminal,cutoverAt:string){
  const proof=await read(terminal);
  if(proof.state!=='ok'||!proof.current||!proof.pointer||proof.pointer.observedAt<cutoverAt)return false;
  const {pointer,rows}=proof;
  const latest=await primary.prepare('SELECT MAX(observed_at) AS at FROM airport_congestion WHERE terminal=?')
    .bind(terminal).first<{at:string|null}>();
  if(latest?.at && Date.parse(latest.at)>=Date.parse(pointer.observedAt))return false;
  const now=Date.now(),today=new Date(now+9*3600_000).toISOString().slice(0,10);
  const summary=await publicRead<{serviceDateKst:string;airport:{congestion:Row[]}}>(`/api/live/summary?date=${today}`);
  const publicRows=summary.airport.congestion.filter(row=>row.terminal===terminal);
  if(summary.serviceDateKst!==today||publicRows.length!==rows.length||!rows.every(row=>publicRows.some(visible=>
    ['terminal','zone','observedAt','retrievedAt','waitTimeMinutes','waitTimeRaw','waitingCount']
      .every(key=>Object.is(visible[key],row[key])) && visible.collectionStatus==='LIVE')))return false;
  const facility=await primary.prepare("SELECT facility_id AS id FROM airport_facility WHERE terminal=? ORDER BY facility_id LIMIT 1")
    .bind(terminal).first<{id:string}>();
  if(!facility||!/^\d{1,12}$/.test(facility.id))return false;
  const receipt=await publicRead<{mode:string;checkpointReadStatus?:string;brief?:{sourceRetrievedAt?:Row}}>(
    `/api/airport/facility-operations?facilityId=${facility.id}`);
  if(receipt.mode!=='facility-operations'||receipt.checkpointReadStatus==='DEGRADED'
    ||receipt.brief?.sourceRetrievedAt?.checkpoint!==rows[0]?.retrievedAt)return false;
  console.log(JSON.stringify({phase:'A4_PRODUCTION_VERIFIED',terminal,observedAt:pointer.observedAt,
    count:pointer.count,digest:pointer.digest,legacyLatest:latest?.at??null,summary:'PASS',facility:'PASS'}));
  return true;
}

const command=process.argv[2]??'activate';
if (!['activate','retry','rollback'].includes(command)) throw new Error('a4_invalid_release_action');
await requireRelease();
if(command==='rollback'){
  for(const terminal of terminals)await primary.prepare(`INSERT INTO a4_cutover VALUES(?,NULL)
    ON CONFLICT(terminal) DO UPDATE SET cutover_at=NULL`).bind(terminal).run();
  console.log('A4 write rollback applied to both terminals. Verified reads can use the last published generation.');
  process.exit(0);
}

const gates=await Promise.all(terminals.map(getGate));
if(command==='activate'&&gates.every(gate=>gate?.cutover_at)) {
  console.log('Both terminal cutovers are already active.');
  process.exit(0);
}
if(command==='activate'&&gates.some(gate=>gate&&gate.cutover_at===null)) {
  throw new Error('a4_cutover_requires_explicit_retry_after_rollback');
}
const legacySize=(await primary.prepare('SELECT 1').all()).meta?.size_after;
const standbySize=(await overflow.prepare('SELECT EXISTS(SELECT 1 FROM a4_generation LIMIT 1)').all()).meta?.size_after;
if(typeof legacySize!=='number'||legacySize>=475_000_000||typeof standbySize!=='number'||standbySize>=350_000_000) {
  throw new Error('a4_cutover_storage_headroom_unverified');
}
console.log(JSON.stringify({phase:'A4_CAPACITY_VERIFIED',legacySize,standbySize}));
for (const terminal of terminals) {
  await requireRelease();
  const previous=await getGate(terminal);
  const cutoverAt=previous?.cutover_at??new Date().toISOString();
  if (!previous?.cutover_at) await primary.prepare(`INSERT INTO a4_cutover VALUES(?,?)
    ON CONFLICT(terminal) DO UPDATE SET cutover_at=excluded.cutover_at WHERE a4_cutover.cutover_at IS NULL`)
    .bind(terminal,cutoverAt).run();
  console.log(JSON.stringify({phase:'A4_CUTOVER_WAITING_FOR_REGULAR_COLLECTION',terminal,cutoverAt}));
  try {
    const deadline=Date.now()+26*60_000;
    let verified=false;
    do {
      try { verified=await verifyTerminal(terminal,cutoverAt); } catch { /* retry the read only */ }
      if (verified) break;
      await setTimeout(30_000);
    } while (Date.now()<deadline);
    if(!verified)throw new Error('a4_new_publication_not_verified');
  } catch(error) {
    if(!previous?.cutover_at) {
      const stopped=await primary.prepare('UPDATE a4_cutover SET cutover_at=NULL WHERE terminal=? AND cutover_at=?')
        .bind(terminal,cutoverAt).run();
      if (!stopped.success||stopped.meta?.changes!==1)throw new Error('a4_cutover_rollback_unverified');
      console.log(JSON.stringify({phase:'A4_CUTOVER_ROLLED_BACK',terminal}));
    }
    throw error;
  }
}
