import {checkpointLayout} from './airport-checkpoint-layout';
import {queueHeat,type QueueHeatReading} from './airport-queue-heat';
import {displayedQueueMinutes} from './airport-queue-representatives';
/** Fresh, unambiguous positive waits only; 60+ has no known upper bound. */
export function longestCheckpoint(terminal:'T1'|'T2',rows:readonly QueueHeatReading[],now:number){
 const candidates=checkpointLayout(terminal,rows).flat().flatMap(slot=>{
  const value=slot.row?displayedQueueMinutes(slot.row):null;
  return slot.row&&queueHeat(slot.row,now).state==='current'&&value!==null? [{key:slot.key,value,bounded:slot.row.waitTimeRaw?.trim()==='60+'}]:[];
 });
 if(!candidates.length)return {keys:[] as string[],value:null,lowerBound:false,uncertain:false};
 const value=Math.max(...candidates.map(row=>row.value)),lowerBound=candidates.some(row=>row.bounded);
 return {keys:candidates.filter(row=>row.value===value||row.bounded).map(row=>row.key),value,lowerBound,uncertain:lowerBound&&value>60};
}
