import { shiftKstDay } from './kst';

/** Eligible observations only; a whole day with one observation is not a complete weekday. */
export function predictionReadiness(rows:Array<{day:string;eligible:string|null}>,targetDate:string) {
  const dates=[7,14,21,28].map(days=>shiftKstDay(targetDate,-days));
  return {targetDate, hours:Array.from({length:24},(_,hour)=>{
    const byVersion=new Map<string,string[]>();
    for(const day of dates) for(const token of (rows.find(row=>row.day===day)?.eligible??'').split(',')) {
      const separator=token.indexOf(':');
      if(separator<0 || Number(token.slice(0,separator))!==hour)continue;
      const version=token.slice(separator+1);
      const found=byVersion.get(version)??[];
      if(!found.includes(day))found.push(day);
      byVersion.set(version,found);
    }
    // Mixed source definitions do not qualify. Match the prediction engine's gate.
    const compatible=byVersion.size<=1;
    const sampleDates=[...new Set([...byVersion.values()].flat())];
    return {hour,sampleDates,missingWeeks:Math.max(0,2-sampleDates.length),ready:compatible&&sampleDates.length>=2,compatible};
  })};
}

export interface ScoredRecord {targetAt:string;predicted:number;actual:number|null;createdAt:string;actualAt:string|null}
export function predictionScore(records:ScoredRecord[]) {
  const valid=records.filter(row=>Number.isFinite(row.predicted) && row.predicted>=0 && typeof row.actual==='number' && Number.isFinite(row.actual) && row.actual>=0
    && Date.parse(row.createdAt)<Date.parse(row.targetAt) && row.actualAt!==null && Date.parse(row.createdAt)<Date.parse(row.actualAt));
  return {matchedHours:valid.length,matchedDays:new Set(valid.map(row=>row.targetAt.slice(0,10))).size,
    meanAbsoluteError:valid.length?Math.round(valid.reduce((sum,row)=>sum+Math.abs(row.predicted-row.actual!),0)/valid.length):null,
    pendingHours:records.filter(row=>row.actual===null).length};
}
