import {dutyFreeSources,kstExchangeDate,shiftExchangeDate,verifiedDutyFreeObservation} from './duty-free-exchange';
export type DutyFreeRecentDay={date:string;krwPerUsd:number|null;verifiedAt:string|null;dateEvidence:'CURRENT_WIDGET'|'EXPLICIT_SOURCE_DATE'|null};
export type DutyFreeRecent={vendor:'shilla';currency:'USD';scope:'INTERNET_SHOP';sourceUrl:string;asOfDateKst:string;generatedAt:string;start:string;end:string;expectedDays:7;observedDays:number;missingDates:string[];fullDayApplicabilityVerified:false;days:DutyFreeRecentDay[]};
export function recentDutyFreeDates(today:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||shiftExchangeDate(today,0)!==today)return null;return Array.from({length:7},(_,i)=>shiftExchangeDate(today,i-6)!);}
export function validDutyFreeRecent(value:unknown):value is DutyFreeRecent{
 if(!value||typeof value!=='object')return false;const d=value as DutyFreeRecent,dates=recentDutyFreeDates(d.asOfDateKst);
 if(!dates||d.vendor!=='shilla'||d.currency!=='USD'||d.scope!=='INTERNET_SHOP'||d.sourceUrl!==dutyFreeSources.shilla||d.expectedDays!==7||d.fullDayApplicabilityVerified!==false||kstExchangeDate(Date.parse(d.generatedAt))!==d.asOfDateKst||d.start!==dates[0]||d.end!==dates[6]||!Array.isArray(d.days)||d.days.length!==7||!Array.isArray(d.missingDates))return false;
 for(const [i,row] of d.days.entries()){
  if(!row||typeof row!=='object'||row.date!==dates[i])return false;
  if(row.krwPerUsd===null){if(row.verifiedAt!==null||row.dateEvidence!==null)return false;}
  else if(!['CURRENT_WIDGET','EXPLICIT_SOURCE_DATE'].includes(row.dateEvidence??'')||!verifiedDutyFreeObservation({vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:d.sourceUrl,verified:true,serviceDateKst:row.date,krwPerUnit:row.krwPerUsd,verifiedAt:row.verifiedAt,dateEvidence:row.dateEvidence},Date.parse(d.generatedAt)))return false;
 }
 const missing=d.days.filter(row=>row.krwPerUsd===null).map(row=>row.date);
 return d.observedDays===7-missing.length&&JSON.stringify(d.missingDates)===JSON.stringify(missing);
}
