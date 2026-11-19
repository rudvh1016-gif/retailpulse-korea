import { a4Instant } from './a4-overflow-routing';
import { createA4D1Stores } from './a4-overflow-d1-adapter';
import { readA4Generation, type A4Pointer } from './a4-overflow-publication';

type Terminal='T1'|'T2';
type Row=Record<string,unknown>;
type Read = (terminal:Terminal)=>Promise<{state:'ok';rows:readonly unknown[]}|{state:'error'}>;
const sources={T1:'INCHEON_DEPARTURE_CONGESTION',T2:'INCHEON_DEPARTURE_CONGESTION_T2'} as const;
const versions={T1:'airport-congestion-v1',T2:'airport-congestion-t2-v1'} as const;
const terminal2Zones=new Set(['DG1_A','DG1_B','DG1_C','DG1_D','DG2_A','DG2_B','DG2_C','DG2_D']);
const age=(v:unknown)=>typeof v==='string'?a4Instant(v):NaN;

export function projectOverflowA4(terminal:Terminal,rows:readonly unknown[],now:number): Row[]|null {
 const max=terminal==='T1'?50:8;
 if(rows.length>max||!Number.isFinite(now))return null;
 const out:Row[]=[], zones=new Set<string>();
 let observed=NaN,retrieved=NaN;
 for(const value of rows) {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Row, at=age(r.observedAt), got=age(r.retrievedAt), zone=r.zone;
  if(r.terminal!==terminal||r.sourceId!==sources[terminal]||r.schemaVersion!==versions[terminal]
    ||r.recordOrigin!=='LIVE'||r.qualityStatus!=='VALID'||typeof r.sourceHash!=='string'||!r.sourceHash
    ||typeof zone!=='string'||!zone.trim()||zone.trim()!==zone||zone.length>64||zones.has(zone)
    ||(terminal==='T2'&&!terminal2Zones.has(zone))||!Number.isFinite(at)||!Number.isFinite(got)
    ||at>got||got>now||(out.length>0&&(at!==observed||got!==retrieved)))return null;
  const {waitTimeRaw,waitTimeMinutes,waitingCount}=r;
  if((waitTimeRaw!==null&&(typeof waitTimeRaw!=='string'||!waitTimeRaw.trim()||waitTimeRaw.length>128))
    ||typeof waitingCount!=='number'||!Number.isSafeInteger(waitingCount)||waitingCount<0)return null;
  const exact=typeof waitTimeRaw==='string'&&/^\d+$/.test(waitTimeRaw)?Number(waitTimeRaw):null;
  if(waitTimeMinutes!==exact||(exact!==null&&!Number.isSafeInteger(exact)))return null;
  zones.add(zone); observed=at; retrieved=got;
  out.push({terminal,zone,waitTimeRaw,waitTimeMinutes,waitingCount,observedAt:r.observedAt,retrievedAt:r.retrievedAt});
 }
 return out.sort((a,b)=>String(a.zone)<String(b.zone)?-1:String(a.zone)>String(b.zone)?1:0);
}

export async function mergePublicA4Terminal(terminal:Terminal,primary:Row[],read:Read|undefined,now:number,limit:12|24) {
 const fallback=(degraded:boolean)=>({rows:primary,degraded,shard:false});
 if(!read)return fallback(false);
 try {
  const result=await read(terminal);
  if(result.state==='error')return fallback(true);
  if(!result.rows.length)return fallback(false);
  const rows=projectOverflowA4(terminal,result.rows,now);
  if(!rows?.length)return fallback(true);
  const latest=Math.max(-Infinity,...primary.map(r=>age(r.observedAt)).filter(Number.isFinite));
  return age(rows[0].observedAt)>latest
   ? {rows:rows.slice(0,limit),degraded:false,shard:true}:fallback(false);
 } catch {return fallback(true);}
}

type PublishedWitness = {
 terminal:Terminal;observedAt:string;digest:string;count:number;
 eventAt:string|null;retrievedAt:string|null;valid:number;
};

/** Resolve pointer and matching primary evidence in one statement, then verify
 * the exact immutable shard row by digest. A generic health clock isn't evidence. */
export function createWitnessedPublicA4Reader(primary:D1Database,overflow:D1Database):Read{
 const stores=createA4D1Stores({primary,overflow});
 return async terminal=>{
  let witness:PublishedWitness|null;
  try{
   witness=await primary.prepare(`SELECT p.terminal,p.observed_at AS observedAt,p.digest,p.row_count AS count,
     h.last_event_at AS eventAt,h.last_retrieved_at AS retrievedAt,
     CASE WHEN r.run_id IS NOT NULL AND r.status='SUCCESS' AND r.records_written=p.row_count
       AND h.status='LIVE' AND h.consecutive_failures=0 AND h.schema_version=? AND h.updated_at=r.finished_at
       AND h.detail=r.detail
       AND r.detail=('A4 overflow v1; terminal '||p.terminal||'; normalized '||p.row_count||
        '; capture sha256 '||p.digest||'; primary observation rows unchanged')
       AND NOT EXISTS(SELECT 1 FROM collector_runs newer WHERE newer.source_id=r.source_id AND newer.started_at>r.started_at)
       THEN 1 ELSE 0 END AS valid
     FROM a4_pointer p
     LEFT JOIN collector_runs r ON r.run_id=('a4-overflow-v1:'||p.digest) AND r.source_id=?
     LEFT JOIN source_health h ON h.source_id=r.source_id WHERE p.terminal=?`)
     .bind(versions[terminal],sources[terminal],terminal).first<PublishedWitness>();
  }catch{return {state:'error'};}
  if(!witness)return {state:'ok',rows:[]};
  if(witness.valid!==1||witness.terminal!==terminal||!Number.isFinite(age(witness.eventAt))
   ||age(witness.eventAt)!==age(witness.observedAt)||!Number.isFinite(age(witness.retrievedAt)))return {state:'error'};
  const pointer:A4Pointer=witness;
  const result=await readA4Generation(terminal,{...stores,primary:{...stores.primary,get:async()=>pointer}});
  if(result.state==='ok'&&result.rows.some(row=>age((row as Row).retrievedAt)!==age(witness.retrievedAt)))return {state:'error'};
  return result;
 };
}

/** No environment setting or binding is shipped; undefined is a zero-I/O default. */
export async function getPublicA4ShardReader(primary:D1Database):Promise<Read|undefined>{
 const {env}=await import('cloudflare:workers');
 const cfg=env as typeof env & {RPK_A4_OVERFLOW_READS?:string;A4_OVERFLOW_DB?:D1Database};
 if(cfg.RPK_A4_OVERFLOW_READS!=='true')return undefined;
 if(!cfg.A4_OVERFLOW_DB||cfg.A4_OVERFLOW_DB===primary)return async()=>({state:'error'});
 return createWitnessedPublicA4Reader(primary,cfg.A4_OVERFLOW_DB);
}
