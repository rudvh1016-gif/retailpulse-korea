import { dutyFreeSources, kstExchangeDate, nextKstExchangeMidnight, shiftExchangeDate } from './duty-free-exchange';

export type DutyFreeMonth = {month:string;averageKrwPerUsd:number|null;observedDays:number;calendarDays:number;inProgress:boolean};
export type DutyFreeMonthly = {vendor:'shilla';currency:'USD';scope:'INTERNET_SHOP';sourceUrl:string;asOfDateKst:string;generatedAt:string;months:DutyFreeMonth[]};
export function dutyFreeMonths(now:Date):string[] {
  const today=kstExchangeDate(now.getTime());
  if(!today)throw new Error('INVALID_DATE');
  const [year,month]=today.split('-').map(Number);
  return Array.from({length:6},(_,index)=>new Date(Date.UTC(year,month-6+index,1)).toISOString().slice(0,7));
}
// PK(vendor, service_date_kst) bounds this to at most 184 daily records. No provider calls or writes.
export const DUTY_FREE_MONTHLY_SQL=`SELECT substr(service_date_kst,1,7) AS month,
  AVG(krw_per_unit) AS average, COUNT(*) AS days
  FROM duty_free_exchange_daily
  WHERE vendor='shilla' AND service_date_kst BETWEEN ? AND ?
    AND currency='USD' AND scope='INTERNET_SHOP' AND source_url=?
    AND krw_per_unit>0 AND krw_per_unit<1e308
    AND date_evidence IN ('CURRENT_WIDGET','EXPLICIT_SOURCE_DATE')
  GROUP BY substr(service_date_kst,1,7) ORDER BY month LIMIT 6`;
export async function readDutyFreeMonthly(db:Pick<D1Database,'prepare'>,now=new Date()):Promise<DutyFreeMonthly> {
  const months=dutyFreeMonths(now),today=kstExchangeDate(now.getTime())!;
  const result=await db.prepare(DUTY_FREE_MONTHLY_SQL).bind(`${months[0]}-01`,today,dutyFreeSources.shilla).all<{month:string;average:number;days:number}>();
  if(!result.success)throw new Error('D1_READ_FAILED');
  return {vendor:'shilla',currency:'USD',scope:'INTERNET_SHOP',sourceUrl:dutyFreeSources.shilla,asOfDateKst:today,generatedAt:now.toISOString(),months:months.map(month=>{
    const row=result.results?.find(row=>row.month===month);
    const [year,m]=month.split('-').map(Number),calendarDays=new Date(Date.UTC(year,m,0)).getUTCDate();
    if(row&&(!Number.isFinite(row.average)||row.average<=0||!Number.isInteger(row.days)||row.days<1||row.days>calendarDays))throw new Error('INVALID_AGGREGATE');
    return {month,averageKrwPerUsd:row?.average??null,observedDays:row?.days??0,calendarDays,inProgress:month===today.slice(0,7)};
  })};
}
export function dutyFreeMonthlyCacheControl(nowMs:number) {
  const ttl=Math.min(3600,Math.floor((nextKstExchangeMidnight(nowMs)-nowMs)/1000));
  return ttl>0?`public, max-age=${Math.min(300,ttl)}, s-maxage=${ttl}`:'no-store';
}
export function validDutyFreeMonthly(value:unknown):value is DutyFreeMonthly {
  if(!value||typeof value!=='object')return false;
  const data=value as DutyFreeMonthly;
  if(data.vendor!=='shilla'||data.currency!=='USD'||data.scope!=='INTERNET_SHOP'||data.sourceUrl!==dutyFreeSources.shilla
    ||typeof data.asOfDateKst!=='string'||!shiftExchangeDate(data.asOfDateKst,0)||typeof data.generatedAt!=='string'||!Number.isFinite(Date.parse(data.generatedAt))||kstExchangeDate(Date.parse(data.generatedAt))!==data.asOfDateKst||!Array.isArray(data.months)||data.months.length!==6)return false;
  const expected=dutyFreeMonths(new Date(`${data.asOfDateKst}T00:00:00+09:00`));
  return data.months.every((row,index)=>{
    const [year,month]=expected[index].split('-').map(Number);
    const calendarDays=new Date(Date.UTC(year,month,0)).getUTCDate();
    const availableDays=index===5?Number(data.asOfDateKst.slice(8)):calendarDays;
    return row&&row.month===expected[index]&&row.inProgress===(index===5)
      &&row.calendarDays===calendarDays&&Number.isInteger(row.observedDays)&&row.observedDays>=0&&row.observedDays<=availableDays
      &&(row.observedDays===0?row.averageKrwPerUsd===null:typeof row.averageKrwPerUsd==='number'&&Number.isFinite(row.averageKrwPerUsd)&&row.averageKrwPerUsd>0);
  });
}
