import type {QueueHeatReading} from './airport-queue-heat';
export const CHECKPOINT_GROUPS={T1:[['5W','5E'],['4W','4E'],['3W','3E'],['2W','2E']],T2:[['2D','2C'],['2B','2A'],['1D','1C'],['1B','1A']]} as const;
const identity=(terminal:string,zone:string)=>terminal==='T1'?/^(?:DG)?([2-5])_?([EW])$/.exec(zone):/^DG([12])_([ABCD])$/.exec(zone);
/** Exact source identifiers only. Contradictory observations at the same latest
 * timestamp are withheld. Unknown identifiers remain in the detailed list. */
export function checkpointLayout<T extends QueueHeatReading>(terminal:'T1'|'T2',rows:readonly T[]) {
 const latest=new Map<string,{row:T;ambiguous:boolean}>();
 for(const row of rows){if(row.terminal!==terminal)continue;const match=identity(terminal,row.zone);if(!match)continue;
  const key=match[1]+match[2],prior=latest.get(key),time=Date.parse(row.observedAt),old=Date.parse(prior?.row.observedAt??'');
  if(!prior||Number.isFinite(time)&&(!Number.isFinite(old)||time>old))latest.set(key,{row,ambiguous:false});
  else if(time===old&&(row.waitTimeMinutes!==prior.row.waitTimeMinutes||row.waitTimeRaw!==prior.row.waitTimeRaw||row.freshness!==prior.row.freshness))prior.ambiguous=true;
 }
 return CHECKPOINT_GROUPS[terminal].map(group=>group.map(key=>({key,row:latest.get(key)?.ambiguous?null:latest.get(key)?.row??null,ambiguous:latest.get(key)?.ambiguous??false})));
}
