/** Uses already-served official fields only. No population-derived crowd ranking. */
export interface GlanceForecast {targetAt:string;congestionLevel:number;issuedAt?:string;retrievedAt?:string}
export interface GlanceObservation {observedAt:string;congestionLevel:number;freshness:'LIVE'|'STALE'}
export function validGlanceForecasts(rows:readonly GlanceForecast[],now:string,refreshing=false){
 const clock=Date.parse(now);
 return rows.filter(row=>{const issued=Date.parse(row.issuedAt??''),target=Date.parse(row.targetAt);
  return !refreshing&&Number.isFinite(clock)&&Number.isFinite(issued)&&Number.isFinite(target)
   &&issued<=clock&&clock-issued<=30*60_000&&target>=clock&&target<=issued+12*3_600_000
   &&Number.isInteger(row.congestionLevel)&&row.congestionLevel>=1&&row.congestionLevel<=4;
 }).sort((a,b)=>Date.parse(a.targetAt)-Date.parse(b.targetAt));
}
export function freshGlanceObservation(row:GlanceObservation|null|undefined,now:string,refreshing=false){
 const age=Date.parse(now)-Date.parse(row?.observedAt??'');
 return !!row&&!refreshing&&row.freshness==='LIVE'&&age>=0&&age<=30*60_000
  &&Number.isInteger(row.congestionLevel)&&row.congestionLevel>=1&&row.congestionLevel<=4;
}
export function sameGlanceClocks(rows:readonly {clock:string|undefined;valid:boolean}[]){
 return rows.length===4&&rows.every(row=>row.valid)&&new Set(rows.map(row=>row.clock)).size===1;
}
export function eventsOnGlanceDay<T extends {eventStart:string;eventEnd:string|null}>(events:readonly T[],day:string):T[]{
 return events.filter(row=>{const start=row.eventStart.slice(0,10),end=row.eventEnd?.slice(0,10)??start;
  return /^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=day&&day<=end;
 });
}
export function glancePaymentShares<T extends {category:string;payments:number|null}>(categories:readonly T[]){
 const valid=categories.filter(row=>row.payments!==null&&Number.isSafeInteger(row.payments)&&row.payments>=0);
 const total=valid.reduce((sum,row)=>sum+row.payments!,0);
 return total>0?valid.filter(row=>row.payments!>0).map(row=>({...row,share:row.payments!/total*100}))
  .sort((a,b)=>b.payments!-a.payments!):[];
}
