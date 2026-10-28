import {dutyFreeSources,kstExchangeDate,verifiedDutyFreeObservation} from './duty-free-exchange';
import {recentDutyFreeDates,type DutyFreeRecent,type DutyFreeRecentDay} from './duty-free-recent';
export const DUTY_FREE_RECENT_SQL=`SELECT service_date_kst AS date,krw_per_unit AS rate,first_verified_at AS verifiedAt,date_evidence AS evidence
 FROM duty_free_exchange_daily WHERE vendor='shilla' AND service_date_kst BETWEEN ? AND ?
 AND currency='USD' AND scope='INTERNET_SHOP' AND source_url=?
 AND krw_per_unit>0 AND krw_per_unit<1e308 AND date_evidence IN ('CURRENT_WIDGET','EXPLICIT_SOURCE_DATE')
 ORDER BY service_date_kst LIMIT 7`;
/** Exactly seven current KST dates; a bounded existing-store read, never collection. */
export async function readDutyFreeRecent(db:Pick<D1Database,'prepare'>,now=new Date()):Promise<DutyFreeRecent>{
 const today=kstExchangeDate(now.getTime()),dates=today&&recentDutyFreeDates(today);if(!today||!dates)throw Error('INVALID_DATE');
 const result=await db.prepare(DUTY_FREE_RECENT_SQL).bind(dates[0],dates[6],dutyFreeSources.shilla).all<{date:string;rate:number;verifiedAt:string;evidence:'CURRENT_WIDGET'|'EXPLICIT_SOURCE_DATE'}>();
 if(!result.success)throw Error('D1_READ_FAILED');const records=new Map<string,DutyFreeRecentDay>();
 for(const row of result.results??[]){
  if(!dates.includes(row.date)||records.has(row.date)||!['CURRENT_WIDGET','EXPLICIT_SOURCE_DATE'].includes(row.evidence)||!verifiedDutyFreeObservation({vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,verified:true,serviceDateKst:row.date,krwPerUnit:row.rate,verifiedAt:row.verifiedAt,dateEvidence:row.evidence},now.getTime()))throw Error('INVALID_OBSERVATION');
  records.set(row.date,{date:row.date,krwPerUsd:row.rate,verifiedAt:row.verifiedAt,dateEvidence:row.evidence});
 }
 const days=dates.map(date=>records.get(date)??{date,krwPerUsd:null,verifiedAt:null,dateEvidence:null});const missingDates=days.filter(row=>row.krwPerUsd===null).map(row=>row.date);
 return {vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,asOfDateKst:today,generatedAt:now.toISOString(),start:dates[0],end:dates[6],expectedDays:7,observedDays:7-missingDates.length,missingDates,fullDayApplicabilityVerified:false,days};
}
