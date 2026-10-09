import {sha256} from './hash';
import {airportMetarProjection,verifiedStoredMetarAttempt,type AirportMetarAttempt} from './airport-metar-observation';
type Store=Pick<D1Database,'prepare'|'batch'>;
export const METAR_MIN_INTERVAL_MS=3_600_000;
const BLOCK_INTERVAL_MS=24*METAR_MIN_INTERVAL_MS;
type Row={observation_json:string|null;retrieved_at:string|null;observed_at:string|null;source_hash:string|null;attempted_at:string|null;status:string|null;observation_hash:string|null;next_allowed_at:string|null};

/** Budget committed before HTTP. Expiring a crashed lease cannot reset the hour. */
export async function claimAirportMetarAttempt(db:Store,now:Date,leaseId:string){
  if(!Number.isFinite(now.getTime())||!/^[-\w]{1,128}$/.test(leaseId))throw Error('INVALID_METAR_CLAIM');
  const at=now.toISOString(),next=new Date(now.getTime()+METAR_MIN_INTERVAL_MS).toISOString(),until=new Date(now.getTime()+120_000).toISOString();
  const result=await db.prepare(`INSERT INTO airport_metar_attempt (station,claimed_at,next_allowed_at,lease_id,lease_until)
    VALUES ('RKSI',?,?,?,?) ON CONFLICT(station) DO UPDATE SET claimed_at=excluded.claimed_at,
    next_allowed_at=excluded.next_allowed_at,lease_id=excluded.lease_id,lease_until=excluded.lease_until
    WHERE airport_metar_attempt.next_allowed_at<=? AND airport_metar_attempt.lease_until<=?`).bind(at,next,leaseId,until,at,at).run();
  if(!result.success||typeof result.meta?.changes!=='number')throw Error('METAR_CLAIM_UNMEASURED');
  return result.meta.changes===1;
}
function decode(row:Row|null):AirportMetarAttempt|null{
  if(!row?.observation_json||row.observation_json.length>4096)return null;
  try{const attempt=verifiedStoredMetarAttempt({status:'OK',retrievedAt:row.retrieved_at,observation:JSON.parse(row.observation_json)});return attempt?.observation?.observedAt===row.observed_at?attempt:null;}catch{return null;}
}
/** Atomic changed-only current row plus bounded last-attempt metadata. No raw history. */
export async function saveAirportMetarAttempt(db:Store,input:AirportMetarAttempt,leaseId:string){
  let attempt=verifiedStoredMetarAttempt(input);if(!attempt)throw Error('INVALID_METAR_ATTEMPT');
  const previous=await db.prepare('SELECT observation_json,retrieved_at,observed_at,source_hash FROM airport_metar_current WHERE station=? LIMIT 1').bind('RKSI').first<Row>();
  const previousValid=decode(previous);
  const hash=attempt.observation?await sha256(attempt.observation):null;
  if(attempt.status==='OK'&&previousValid?.observation&&attempt.observation){
    if(attempt.observation.observedAt<previousValid.observation.observedAt||attempt.retrievedAt!<previousValid.retrievedAt!)attempt={...attempt,status:'OUT_OF_ORDER',observation:null};
    else if(attempt.observation.observedAt===previousValid.observation.observedAt&&hash!==previous?.source_hash)attempt={...attempt,status:'CONFLICTING_REPORTS',observation:null};
  }
  const at=attempt.retrievedAt!,blocked=['AUTH_BLOCKED','RATE_LIMITED'].includes(attempt.status);
  const next=new Date(Date.parse(at)+(blocked?BLOCK_INTERVAL_MS:METAR_MIN_INTERVAL_MS)).toISOString();
  const statements=[];
  if(attempt.observation){
    const json=JSON.stringify(attempt.observation);if(json.length>4096)throw Error('METAR_RECORD_TOO_LARGE');
    statements.push(db.prepare(`INSERT INTO airport_metar_current (station,observed_at,retrieved_at,observation_json,source_hash)
      SELECT 'RKSI',?,?,?,? WHERE EXISTS (SELECT 1 FROM airport_metar_attempt WHERE station='RKSI' AND lease_id=?)
      ON CONFLICT(station) DO UPDATE SET observed_at=excluded.observed_at,retrieved_at=excluded.retrieved_at,
      observation_json=excluded.observation_json,source_hash=excluded.source_hash
      WHERE airport_metar_current.observed_at<excluded.observed_at AND airport_metar_current.retrieved_at<=excluded.retrieved_at`)
      .bind(attempt.observation.observedAt,at,json,hash,leaseId));
  }
  statements.push(db.prepare(`UPDATE airport_metar_attempt SET attempted_at=?,status=?,observation_hash=?,
    next_allowed_at=MAX(next_allowed_at,?),lease_id=NULL,lease_until='' WHERE station='RKSI' AND lease_id=?
    AND (attempted_at IS NULL OR attempted_at<=?)`).bind(at,attempt.status,attempt.observation?hash:null,next,leaseId,at));
  const results=await db.batch(statements);if(results.some(row=>!row.success))throw Error('METAR_SAVE_FAILED');
  return {status:attempt.status,changedRows:attempt.observation?(results[0].meta?.changes??0):0,leaseOwned:results.at(-1)?.meta?.changes===1};
}
export function missingAirportMetarSnapshot(now:Date,storage:'READY'|'UNAVAILABLE'|'INVALID'='UNAVAILABLE'){
  return {mode:'airport-metar' as const,generatedAt:now.toISOString(),storage,...airportMetarProjection(null,null,now.toISOString()),nextAllowedAt:null as string|null};
}
/** Bounded PK join returns at most one row. No upstream request or request-time write. */
export async function readAirportMetarSnapshot(db:Pick<D1Database,'prepare'>,now:Date){
  const row=await db.prepare(`SELECT c.observation_json,c.retrieved_at,c.observed_at,c.source_hash,
    a.attempted_at,a.status,a.observation_hash,a.next_allowed_at FROM airport_metar_attempt a
    LEFT JOIN airport_metar_current c ON c.station=a.station WHERE a.station=? LIMIT 1`).bind('RKSI').first<Row>();
  if(!row)return missingAirportMetarSnapshot(now,'READY');
  const current=decode(row);
  if(row.observation_json&&!current)return missingAirportMetarSnapshot(now,'INVALID');
  const latest=verifiedStoredMetarAttempt({status:row.status,retrievedAt:row.attempted_at,
    observation:row.status==='OK'&&row.observation_hash===row.source_hash?current?.observation:null});
  return {mode:'airport-metar' as const,generatedAt:now.toISOString(),storage:'READY' as const,
    ...airportMetarProjection(current,latest,now.toISOString()),nextAllowedAt:row.next_allowed_at};
}
/** Prepared integration seam. Production has no importer or enabled invocation. */
export async function collectPreparedAirportMetar(db:Store,load:()=>Promise<AirportMetarAttempt>,now:()=>Date=()=>new Date()){
  const leaseId=crypto.randomUUID();
  if(!await claimAirportMetarAttempt(db,now(),leaseId))return {status:'SKIPPED_NOT_DUE',providerRequests:0,changedRows:0};
  let attempt:AirportMetarAttempt;
  try{attempt=await load();}catch{attempt={status:'NETWORK_ERROR',retrievedAt:now().toISOString(),observation:null};}
  const saved=await saveAirportMetarAttempt(db,attempt,leaseId);
  return {...saved,providerRequests:1};
}
export type AirportMetarSnapshot=ReturnType<typeof missingAirportMetarSnapshot>|Awaited<ReturnType<typeof readAirportMetarSnapshot>>;
