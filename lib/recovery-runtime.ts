import { publicAreaIds } from './areas';
import { projectDepartureCongestion } from './airport-congestion-observation';
import { summarizeCurrentBusiestDepartureHalls, type AirportCongestionSummaryRow } from './airport-today-summary';
import { rangeChange } from './period-comparison';
import { notificationTransition } from './storage-recovery';

export const RECOVERY_SOURCES = ['airport_congestion','airport_congestion_t2','seoul_realtime'] as const;
export type RecoverySource = typeof RECOVERY_SOURCES[number];
export const recoverySource = (name:string):name is RecoverySource => (RECOVERY_SOURCES as readonly string[]).includes(name);
/** Leaving the reviewed active identity configured makes disabling writes a PAUSE, never archive fallback. */
export function recoveryRoute(source:string,enabled:boolean,configured:boolean):'ACTIVE'|'PAUSED'|'ARCHIVE' {
 if(!recoverySource(source))return 'ARCHIVE';
 return enabled?'ACTIVE':configured?'PAUSED':'ARCHIVE';
}
export const SOURCE_IDS:Record<RecoverySource,string[]> = {
 airport_congestion:['INCHEON_DEPARTURE_CONGESTION'],airport_congestion_t2:['INCHEON_DEPARTURE_CONGESTION_T2'],
 seoul_realtime:['SEOUL_CITYDATA_PPLTN','SEOUL_CITYDATA_CMRCL'],
};
type Row=Record<string,unknown>;
export interface RecoverySnapshot { version:1; source:RecoverySource; publishedAt:string; sources:Row[]; congestion:Row[]; areas:Record<string,{realtime:Row;commercial:Row;context:unknown;realtimeForecast:Row[]}> }
export interface AdmissionState { version:1; blocked:Record<string,boolean>; notices:Record<string,string>; sizes?:Record<string,{at:string;bytes:number}> }
export const emptyAdmission=():AdmissionState=>({version:1,blocked:{},notices:{}});
export function storageTransition(state:AdmissionState,database:string,source:string,status:string) {
 const change=notificationTransition(state.notices,`${database}:${source}`,status);
 state.notices=change.next;return change.notify;
}
export const timestamp=(at:unknown)=>typeof at==='string'?Date.parse(at):NaN;
export const fresh=(at:unknown,now:number,age=40*60000)=>Number.isFinite(timestamp(at))&&timestamp(at)<=now&&now-timestamp(at)<=age;
const terminalKeys=(terminal:string)=>terminal==='T1'
 ?Array.from({length:6},(_,i)=>['E','W'].map(side=>`DG${i+1}_${side}`)).flat()
 :['DG1','DG2'].flatMap(gate=>['A','B','C','D'].map(side=>`${gate}_${side}`));
function exact(rows:Row[],expected:string[],key:string) {
 return rows.length===expected.length&&new Set(rows.map(row=>row[key])).size===expected.length&&rows.every(row=>expected.includes(String(row[key])));
}
export function validRecoverySnapshot(value:unknown,source:RecoverySource,now:number,requireFresh=false):value is RecoverySnapshot {
 if(!value||typeof value!=='object')return false;
 const s=value as RecoverySnapshot;
 if(s.version!==1||s.source!==source||!Number.isFinite(timestamp(s.publishedAt))||timestamp(s.publishedAt)>now||!Array.isArray(s.sources)
  ||!exact(s.sources,SOURCE_IDS[source],'sourceId')||s.sources.some(row=>row.status!=='LIVE'||!Number.isFinite(timestamp(row.retrievedAt))||timestamp(row.retrievedAt)>now))return false;
 const validTime=(at:unknown)=>Number.isFinite(timestamp(at))&&timestamp(at)<=now&&(!requireFresh||fresh(at,now,source==='seoul_realtime'?40*60000:20*60000));
 if(source!=='seoul_realtime') {
  const terminal=source==='airport_congestion'?'T1':'T2';
  return Array.isArray(s.congestion)&&exact(s.congestion,terminalKeys(terminal),'zone')&&new Set(s.congestion.map(row=>row.observedAt)).size===1
   &&s.congestion.every(row=>row.terminal===terminal&&validTime(row.observedAt)&&Number.isFinite(timestamp(row.retrievedAt))&&timestamp(row.retrievedAt)<=now
    &&typeof row.waitingCount==='number'&&row.waitingCount>=0&&Number.isFinite(row.waitingCount)
    &&(row.waitTimeMinutes===null||(typeof row.waitTimeMinutes==='number'&&Number.isFinite(row.waitTimeMinutes)&&row.waitTimeMinutes>=0)));
 }
 return !!s.areas&&Object.keys(s.areas).length===publicAreaIds.length&&publicAreaIds.every(area=>{
  const data=s.areas[area];if(!data||!Array.isArray(data.realtimeForecast)||data.realtimeForecast.length>24
   ||data.realtimeForecast.some(row=>row.area!==area||row.issuedAt!==data.realtime?.observedAt||!validTime(row.issuedAt)
    ||!Number.isFinite(timestamp(row.targetAt))||timestamp(row.targetAt)<timestamp(row.issuedAt)||timestamp(row.targetAt)>now+86400000
    ||typeof row.populationMin!=='number'||typeof row.populationMax!=='number'||!Number.isFinite(row.populationMin)||!Number.isFinite(row.populationMax)||row.populationMin<0||row.populationMax<row.populationMin))return false;
  return [['realtime','populationMin','populationMax'],['commercial','paymentAmountMin','paymentAmountMax']].every(([kind,min,max])=>{
   const row=data[kind as 'realtime'|'commercial'];return row&&row.area===area&&row.qualityStatus==='VALID'&&validTime(row.observedAt)
    &&typeof row[min]==='number'&&typeof row[max]==='number'&&Number.isFinite(row[min])&&Number.isFinite(row[max])&&(row[min] as number)>=0&&(row[max] as number)>=(row[min] as number);
  });
 });
}
/** Only current summary is supported. Archive/history/other APIs remain explicitly archived. */
export async function applyRecoverySummary(response:Response,archive:D1Database,active:D1Database,now:number):Promise<Response> {
 const body=await response.json();if(body.dayRelation!=='TODAY')return Response.json(body,{status:response.status,headers:response.headers});
 const headers=new Headers(response.headers);headers.set('cache-control','no-store');
 body.recovery={mode:'ACTIVE_SNAPSHOTS',supported:[...RECOVERY_SOURCES],applied:[] as string[],failed:[] as string[],history:'ARCHIVE_ONLY'};
 for(const source of RECOVERY_SOURCES) {
  try {
   const target={...body,sources:[...body.sources],areas:{...body.areas},airport:{...body.airport},recovery:{...body.recovery,applied:[...body.recovery.applied]}};
   const stored=await active.prepare('SELECT payload FROM recovery_public_snapshots WHERE source=?').bind(source).first<{payload:string}>();
   if(!stored)continue;
   const snapshot:unknown=JSON.parse(stored.payload);
   if(!validRecoverySnapshot(snapshot,source,now))throw Error('invalid_recovery_snapshot');
   target.sources=target.sources.filter((row:Row)=>!SOURCE_IDS[source].includes(String(row.sourceId))).concat(snapshot.sources);
   if(source!=='seoul_realtime') {
    const terminal=source==='airport_congestion'?'T1':'T2';
    target.airport.congestion=target.airport.congestion.filter((row:Row)=>row.terminal!==terminal).concat(projectDepartureCongestion(snapshot.congestion,snapshot.sources,now));
    target.airport.latestRetrievedAt=[target.airport.latestRetrievedAt,...snapshot.congestion.map(row=>row.retrievedAt)].filter((at:unknown)=>Number.isFinite(timestamp(at))).sort((a:string,b:string)=>timestamp(a)-timestamp(b)).at(-1)??null;
   }else {
    const statements=publicAreaIds.flatMap(area=>(['realtime','commercial'] as const).flatMap(kind=>[7,28].map(days=>{
     const row=snapshot.areas[area][kind],table=kind==='realtime'?'seoul_realtime_area':'seoul_realtime_commercial',min=kind==='realtime'?'population_min':'payment_amount_min',max=kind==='realtime'?'population_max':'payment_amount_max';
     return archive.prepare(`SELECT ${min} AS min,${max} AS max,observed_at AS observedAt FROM ${table} WHERE area=? AND source_id=? AND schema_version=? AND quality_status='VALID' AND observed_at=strftime('%Y-%m-%dT%H:%M:%S',substr(?,1,19),?)||'+09:00' LIMIT 1`).bind(area,row.sourceId,row.schemaVersion,row.observedAt,`-${days} days`);
    })));
    const baselines=await archive.batch<Row>(statements);
    if(baselines.length!==statements.length||baselines.some(answer=>!answer.success))throw Error('recovery_baseline_read_failed');
    let baselineIndex=0;
    for(const area of publicAreaIds) {
    const data=snapshot.areas[area],prior={...target.areas[area]};target.areas[area]=prior;
    for(const kind of ['realtime','commercial'] as const) {
     const row:Row&{comparisons:Record<string,unknown>}={...data[kind],freshness:fresh(data[kind].observedAt,now)?'LIVE':'STALE',comparisons:{} as Record<string,unknown>};
     for(const days of [7,28]) {
      const baseline=baselines[baselineIndex++].results?.[0];
      row.comparisons[String(days)]=baseline?rangeChange(row[kind==='realtime'?'populationMin':'paymentAmountMin'],row[kind==='realtime'?'populationMax':'paymentAmountMax'],baseline.min,baseline.max,String(baseline.observedAt)):null;
     }
     prior[kind]=row;
    }
    // Optional context is not part of this minimum route: preserve archived 62-day context.
    // Its current and monthly readers need a separate verified cutover.
    prior.realtimeForecast=data.realtimeForecast.filter(row=>timestamp(row.targetAt)>=now-3600000);
    prior.observedSeries=[...(prior.observedSeries??[]).filter((row:Row)=>row.observedAt!==data.realtime.observedAt),data.realtime].sort((a:Row,b:Row)=>timestamp(a.observedAt)-timestamp(b.observedAt)).slice(-73);
   }
   }
   if(source==='seoul_realtime'&&target.dateAvailability) {
    target.dateAvailability={...target.dateAvailability,seoulObserved:[...new Set([...(target.dateAvailability.seoulObserved??[]),target.serviceDateKst])].sort(),checkedAt:{...target.dateAvailability.checkedAt,seoulObserved:snapshot.publishedAt}};
   }
   target.recovery.applied.push(source);
   Object.assign(body,target);
  }catch{body.recovery.failed.push(source);}
 }
 body.airport.currentBusiestDepartureHallByTerminal=summarizeCurrentBusiestDepartureHalls(body.airport.congestion.filter((row:Row)=>row.freshness==='LIVE') as AirportCongestionSummaryRow[]);
 if(body.recovery.failed.length){body.mode='degraded';body.readStatus={...body.readStatus,status:'DEGRADED',failedGroups:[...(body.readStatus?.failedGroups??[]),...body.recovery.failed.map((source:string)=>`recovery:${source}`)]};}
 body.sources=projectRealtimeSourceStatus(body.sources,now);
 return Response.json(body,{status:response.status,headers});
}

/** Keep stored status for diagnostics, expose stale LIVE clocks truthfully without a DB write. */
export function projectRealtimeSourceStatus<T extends Record<string,unknown>>(sources:readonly T[],now:number):T[] {
 return sources.map(source=>{
  const id=String(source.sourceId),age=id.startsWith('INCHEON_DEPARTURE_CONGESTION')?20*60000:40*60000;
  if(!Object.values(SOURCE_IDS).flat().includes(id)||source.status!=='LIVE')return source;
  const at=source.eventAt??source.lastEventAt;
  if(at==null)return {...source,storedStatus:source.status,freshness:'UNKNOWN'};
  const freshness=fresh(at,now,age)?'LIVE':'STALE';
  return {...source,storedStatus:source.status,status:freshness,freshness};
 });
}

export async function recoveryHealthSources(sources:Record<string,unknown>[],active:D1Database,now:number) {
 let output=[...sources];
 for(const source of RECOVERY_SOURCES) {
  const saved=await active.prepare('SELECT payload FROM recovery_public_snapshots WHERE source=?').bind(source).first<{payload:string}>();
  if(!saved)continue;
  const snapshot:unknown=JSON.parse(saved.payload);
  if(!validRecoverySnapshot(snapshot,source,now))throw Error('recovery_health_snapshot_invalid');
  output=output.filter(row=>!SOURCE_IDS[source].includes(String(row.sourceId))).concat((snapshot as RecoverySnapshot).sources.map(row=>({...row,lastRetrievedAt:row.retrievedAt})));
 }
 return projectRealtimeSourceStatus(output,now);
}
