import archive from '../data/shilla-archive-observations.json';
import {dutyFreeSources,kstExchangeDate,shiftExchangeDate,verifiedDutyFreeObservation} from './duty-free-exchange';
import {dutyFreeHistoryRange,type DutyFreeDatedDay,type DutyFreeDatedHistory} from './duty-free-dated-history';
import type {ArchivedDutyFreeDay} from './duty-free-exchange-monthly';

/** One indexed bounded read. No provider calls, backfill, interpolation or writes. */
export const DUTY_FREE_HISTORY_SQL=`SELECT service_date_kst AS date,krw_per_unit AS rate,first_verified_at AS verifiedAt,date_evidence AS evidence
 FROM duty_free_exchange_daily WHERE vendor='shilla' AND service_date_kst BETWEEN ? AND ?
 AND currency='USD' AND scope='INTERNET_SHOP' AND source_url=?
 AND krw_per_unit>0 AND krw_per_unit<1e308 AND date_evidence IN ('CURRENT_WIDGET','EXPLICIT_SOURCE_DATE')
 ORDER BY service_date_kst LIMIT 185`;
export async function readDutyFreeDatedHistory(db:Pick<D1Database,'prepare'>,input:{start?:string|null;end?:string|null},now=new Date(),historical:readonly ArchivedDutyFreeDay[]=archive.observations):Promise<DutyFreeDatedHistory>{
 const range=dutyFreeHistoryRange(input,now);
 const rows=await db.prepare(DUTY_FREE_HISTORY_SQL).bind(range.start,range.end,dutyFreeSources.shilla).all<{date:string;rate:number;verifiedAt:string;evidence:string}>();
 if(!rows.success)throw Error('D1_READ_FAILED');
 const byDate=new Map<string,DutyFreeDatedDay>();
 for(const row of rows.results??[]){
  const valid=verifiedDutyFreeObservation({vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,verified:true,serviceDateKst:row.date,krwPerUnit:row.rate,verifiedAt:row.verifiedAt,dateEvidence:row.evidence},now.getTime());
  if(shiftExchangeDate(row.date,0)!==row.date||row.date<range.start||row.date>range.end||!Number.isFinite(row.rate)||row.rate<=0||byDate.has(row.date)
   ||!valid||!['CURRENT_WIDGET','EXPLICIT_SOURCE_DATE'].includes(row.evidence))throw Error('INVALID_OBSERVATION');
  byDate.set(row.date,{date:row.date,krwPerUsd:row.rate,kind:'STORED_OBSERVATION',verifiedAt:row.verifiedAt,dateEvidence:row.evidence});
 }
 const seen=new Set<string>();
 for(const row of historical){
  if(row.observedDateKst<range.start||row.observedDateKst>range.end)continue;
  if(shiftExchangeDate(row.observedDateKst,0)!==row.observedDateKst||seen.has(row.observedDateKst)||!Number.isFinite(row.krwPerUsd)||row.krwPerUsd<=0||!row.provenance.length
   ||!row.provenance.every(p=>kstExchangeDate(Date.parse(p.capturedAt))===row.observedDateKst&&/^https:\/\/(www|m)\.shilladfs\.com\/estore\/kr\/ko(?:\/|$)/.test(p.sourceUrl)&&/^https:\/\/web\.archive\.org\/web\/\d{14}id_\/https:\/\/(www|m)\.shilladfs\.com\//.test(p.archiveUrl)&&/^[a-f0-9]{64}$/.test(p.sha256)))throw Error('INVALID_ARCHIVE');
  seen.add(row.observedDateKst);if(byDate.has(row.observedDateKst))continue;
  byDate.set(row.observedDateKst,{date:row.observedDateKst,krwPerUsd:row.krwPerUsd,kind:'ARCHIVED_OBSERVATION',verifiedAt:archive.verifiedAt,dateEvidence:'REVIEWED_ARCHIVE_CAPTURE',archiveSources:row.provenance});
 }
 const days=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const missingDates=Array.from({length:range.expectedDays},(_,i)=>shiftExchangeDate(range.start,i)!).filter(date=>!byDate.has(date));
 return {vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,asOfDateKst:range.today,generatedAt:now.toISOString(),start:range.start,end:range.end,expectedDays:range.expectedDays,observedDays:days.length,missingDates,status:!days.length?'MISSING':missingDates.length?'PARTIAL':'COMPLETE',fullDayApplicabilityVerified:false,days};
}
