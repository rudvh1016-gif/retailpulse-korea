import { kstDayOf, shiftKstDay } from './kst';

/** Nominal existing workflow windows; not a promise of execution or recovery. */
export function nextSourceWindow(sourceId:string,nowIso:string):string|null {
  const windows=sourceId==='KASI_PUBLIC_HOLIDAYS'?['06:07','10:07']:
    ['INCHEON_SCHEDULED_DUTY_FREE','KTO_TOURAPI_EVENT'].includes(sourceId)?['06:07']:null;
  if(!windows || !Number.isFinite(Date.parse(nowIso)))return null;
  const today=kstDayOf(nowIso);
  for(const day of [today,shiftKstDay(today,1)]) for(const time of windows) {
    const value=`${day}T${time}:00+09:00`;
    if(Date.parse(value)>Date.parse(nowIso))return value;
  }
  return null;
}
export function publicFailureReason(detail?:string|null):'TIMEOUT'|'NETWORK'|'AUTH'|'SCHEMA'|'OTHER' {
  if(/failureClass=TIMEOUT\b/.test(detail??''))return 'TIMEOUT';
  if(/failureClass=NETWORK\b/.test(detail??''))return 'NETWORK';
  if(/failureClass=AUTH\b|failureClass=HTTP.*(?:401|403)/.test(detail??''))return 'AUTH';
  if(/failureClass=(?:SCHEMA|VALIDATION)\b/.test(detail??''))return 'SCHEMA';
  return 'OTHER';
}
