/** Public A4 projection from already-read rows/health; no I/O or persisted changes. */
export type CongestionCollectionStatus='LIVE'|'STALE'|'FAILED'|'UNKNOWN';
const freshMs=20*60_000;
const failed=new Set(['ERROR','DEGRADED','MISSING','NEEDS_KEY','PARTIAL']);
const clock=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):NaN;
export function projectDepartureCongestion<T extends Record<string,unknown>>(rows:readonly T[],sources:readonly Record<string,unknown>[],now:number){
 const health=new Map(sources.map(source=>[String(source.sourceId),source]));
 return rows.map(row=>{
  const source=health.get(row.terminal==='T1'?'INCHEON_DEPARTURE_CONGESTION':row.terminal==='T2'?'INCHEON_DEPARTURE_CONGESTION_T2':'');
  const age=now-clock(row.observedAt),retrieved=clock(row.retrievedAt);
  let collectionStatus:CongestionCollectionStatus='UNKNOWN';
  const validClocks=Number.isFinite(now)&&Number.isFinite(age)&&age>=0&&Number.isFinite(retrieved)&&retrieved<=now&&
    !!source&&Number.isFinite(clock(source.retrievedAt))&&clock(source.retrievedAt)<=now&&
    (source.eventAt==null||(Number.isFinite(clock(source.eventAt))&&clock(source.eventAt)<=now));
  if(validClocks&&source){
   if(failed.has(String(source.status)))collectionStatus='FAILED';
   else if(source.status==='STALE'||(source.status==='LIVE'&&age>freshMs))collectionStatus='STALE';
   else if(source.status==='LIVE')collectionStatus='LIVE';
  }
  return {...row,freshness:collectionStatus==='LIVE'?'LIVE' as const:'STALE' as const,collectionStatus};
 });
}
