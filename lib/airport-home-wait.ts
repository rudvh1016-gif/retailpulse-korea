import { queueHeat, type QueueHeatReading } from './airport-queue-heat';
import { checkpointLayout } from './airport-checkpoint-layout';
import { isValidKstDay } from './kst';

const qualifiedClock=(value:string)=>typeof value==='string'
 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
 && isValidKstDay(value.slice(0,10));

export const CHECKPOINT_OFFICIAL_WAIT_URLS={
 T1:'https://www.airport.kr/ap_ko/6651/subview.do',
 T2:'https://business.airport.kr/ap_ko/6652/subview.do',
} as const;

export function homeCheckpointFallback(terminal:keyof typeof CHECKPOINT_OFFICIAL_WAIT_URLS,rows:readonly QueueHeatReading[],now:number) {
 let observedAt:string|null=null;
 for(const {row} of checkpointLayout(terminal,rows.filter(row=>qualifiedClock(row.observedAt))).flat()){
  if(!row)continue;
  const {state}=queueHeat(row,now);
  if(state==='current'||state==='zero'||state==='closed')return null;
  if(state==='stale'&&(!observedAt||Date.parse(row.observedAt)>Date.parse(observedAt)))observedAt=row.observedAt;
 }
 return {observedAt};
}
