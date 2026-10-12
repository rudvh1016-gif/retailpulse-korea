import {DESTINATION_GROUPS} from './airport-destinations';
import type {TerminalDay} from './airport-day-compare';

/** Same known-destination denominator as the existing similar-day highlights.
 * Missing/unmapped destinations are excluded, never assigned to OTHER. */
export function destinationComparison(day:TerminalDay) {
 const missing={known:null,unknown:null,JP:null,CN:null,OTHER:null};
 const entries=Object.entries(day.groups);
 if(!Number.isSafeInteger(day.total)||day.total<0||entries.some(([key,count])=>!DESTINATION_GROUPS.includes(key as typeof DESTINATION_GROUPS[number])||!Number.isSafeInteger(count)||count<0))return missing;
 const all=entries.reduce((sum,[,count])=>sum+count,0);
 const known=entries.filter(([key])=>key!=='UNKNOWN').reduce((sum,[,count])=>sum+count,0);
 if(all>day.total)return missing;
 const jp=day.groups.JP??0,cn=day.groups.CN??0;
 return {known,unknown:day.total-known,JP:known?jp/known*100:null,CN:known?cn/known*100:null,OTHER:known?(known-jp-cn)/known*100:null};
}
