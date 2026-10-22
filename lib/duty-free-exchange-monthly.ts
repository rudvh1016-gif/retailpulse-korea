import { dutyFreeSources, kstExchangeDate, nextKstExchangeMidnight, shiftExchangeDate } from './duty-free-exchange';

export type ArchivedDutyFreeDay = {observedDateKst:string;krwPerUsd:number;provenance:{capturedAt:string;sourceUrl:string;archiveUrl:string;sha256:string;dateEvidence:string}[]};
export type DutyFreeMonth = {month:string;averageKrwPerUsd:number|null;observedDays:number;calendarDays:number;inProgress:boolean};
export type DutyFreeMonthly = {vendor:'shilla';currency:'USD';scope:'INTERNET_SHOP';sourceUrl:string;asOfDateKst:string;generatedAt:string;months:DutyFreeMonth[];archive?:{kind:'ARCHIVED_OBSERVATION';verifiedAt:string;fullDayApplicabilityVerified:false;used:ArchivedDutyFreeDay[];skippedLiveDates:string[]}};
export function dutyFreeMonths(now:Date):string[] {
  const today=kstExchangeDate(now.getTime());
  if(!today)throw new Error('INVALID_DATE');
  const [year,month]=today.split('-').map(Number);
  return Array.from({length:6},(_,index)=>new Date(Date.UTC(year,month-6+index,1)).toISOString().slice(0,7));
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
  if(data.archive) {
    const a=data.archive;
    if(a.kind!=='ARCHIVED_OBSERVATION'||a.fullDayApplicabilityVerified!==false||typeof a.verifiedAt!=='string'||!Number.isFinite(Date.parse(a.verifiedAt))
      ||!Array.isArray(a.used)||a.used.length>24||!Array.isArray(a.skippedLiveDates)||a.skippedLiveDates.length>24)return false;
    const dates=[...a.used.map(row=>row?.observedDateKst),...a.skippedLiveDates];
    if(new Set(dates).size!==dates.length||dates.some(date=>typeof date!=='string'||!shiftExchangeDate(date,0)||date>data.asOfDateKst))return false;
    if(!a.used.every(row=>row&&Number.isFinite(row.krwPerUsd)&&row.krwPerUsd>0&&Array.isArray(row.provenance)&&row.provenance.length>0&&row.provenance.length<=8
      &&row.provenance.every(p=>p&&typeof p.capturedAt==='string'&&kstExchangeDate(Date.parse(p.capturedAt))===row.observedDateKst
        &&typeof p.sourceUrl==='string'&&/^https:\/\/(?:www|m)\.shilladfs\.com\/estore\/kr\/ko(?:\/|$)/.test(p.sourceUrl)
        &&typeof p.archiveUrl==='string'&&/^https:\/\/web\.archive\.org\/web\/\d{14}id_\/https:\/\/(?:www|m)\.shilladfs\.com\/estore\/kr\/ko(?:\/|$)/.test(p.archiveUrl)
        &&typeof p.sha256==='string'&&/^[a-f0-9]{64}$/.test(p.sha256))))return false;
  }
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
