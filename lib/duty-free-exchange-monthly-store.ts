import archive from '../data/shilla-archive-observations.json';
import { dutyFreeSources, kstExchangeDate, shiftExchangeDate } from './duty-free-exchange';
import { dutyFreeMonths, type ArchivedDutyFreeDay, type DutyFreeMonthly } from './duty-free-exchange-monthly';

// Same indexed PK/date bounds as the previous aggregate: at most 184 rows, no writes.
export const DUTY_FREE_MONTHLY_SQL=`SELECT service_date_kst AS date, krw_per_unit AS rate
  FROM duty_free_exchange_daily
  WHERE vendor='shilla' AND service_date_kst BETWEEN ? AND ?
    AND currency='USD' AND scope='INTERNET_SHOP' AND source_url=?
    AND krw_per_unit>0 AND krw_per_unit<1e308
    AND date_evidence IN ('CURRENT_WIDGET','EXPLICIT_SOURCE_DATE')
  ORDER BY service_date_kst LIMIT 184`;

/** Finite reviewed archive supplement, never a live source or a D1 replacement. */
export async function readDutyFreeMonthly(db:Pick<D1Database,'prepare'>,now=new Date(),historical:readonly ArchivedDutyFreeDay[]=archive.observations):Promise<DutyFreeMonthly> {
  const months=dutyFreeMonths(now),today=kstExchangeDate(now.getTime())!,start=`${months[0]}-01`;
  const result=await db.prepare(DUTY_FREE_MONTHLY_SQL).bind(start,today,dutyFreeSources.shilla).all<{date:string;rate:number}>();
  // Do not disguise D1 failures as healthy archive-only responses.
  if(!result.success)throw new Error('D1_READ_FAILED');
  const byDate=new Map<string,number>();
  for(const row of result.results??[]) {
    if(!shiftExchangeDate(row.date,0)||row.date<start||row.date>today||!Number.isFinite(row.rate)||row.rate<=0||byDate.has(row.date))throw new Error('INVALID_OBSERVATION');
    byDate.set(row.date,row.rate);
  }
  const used:ArchivedDutyFreeDay[]=[],skippedLiveDates:string[]=[],seen=new Set<string>();
  for(const row of historical) {
    if(!shiftExchangeDate(row.observedDateKst,0)||!Number.isFinite(row.krwPerUsd)||row.krwPerUsd<=0||seen.has(row.observedDateKst))throw new Error('INVALID_ARCHIVE');
    seen.add(row.observedDateKst);
    if(row.observedDateKst<start||row.observedDateKst>today)continue;
    if(byDate.has(row.observedDateKst)){skippedLiveDates.push(row.observedDateKst);continue;}
    byDate.set(row.observedDateKst,row.krwPerUsd);used.push(row);
  }
  return {vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,asOfDateKst:today,generatedAt:now.toISOString(),
    archive:{kind:'ARCHIVED_OBSERVATION',verifiedAt:archive.verifiedAt,fullDayApplicabilityVerified:false,used,skippedLiveDates},
    months:months.map(month=>{
      const values=[...byDate].filter(([date])=>date.startsWith(`${month}-`)).map(([,rate])=>rate);
      const [year,m]=month.split('-').map(Number),calendarDays=new Date(Date.UTC(year,m,0)).getUTCDate();
      return {month,averageKrwPerUsd:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,observedDays:values.length,calendarDays,inProgress:month===today.slice(0,7)};
    })};
}
