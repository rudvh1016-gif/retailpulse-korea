/** Public rate evidence and client-safe validation; provider reads live only in the collector. */
export const dutyFreeSources = {
  shilla: 'https://www.shilladfs.com/estore/kr/ko/',
  shinsegae: 'https://www.ssgdfs.com/kr/main/initMain/',
} as const;
export type DutyFreeVendor = keyof typeof dutyFreeSources;
export const activeDutyFreeVendors = ['shilla'] as const;
export type DutyFreeObservation = {
  vendor: DutyFreeVendor; serviceDateKst: string; currency: 'USD'; krwPerUnit: number;
  verifiedAt: string; sourceUrl: string; verified: boolean; scope: 'INTERNET_SHOP';
  dateEvidence?: 'CURRENT_WIDGET' | 'EXPLICIT_SOURCE_DATE';
};
export const DUTY_FREE_CURRENT_MAX_AGE_MS = 24 * 3_600_000;
export type DutyFreeAttemptStatus = 'SUCCESS' | 'ERROR' | 'BLOCKED' | 'RUNNING' | 'NEVER';
export type DutyFreeSourceSnapshot = {
  vendor: DutyFreeVendor; observation: DutyFreeObservation | null;
  observations?: DutyFreeObservation[];
  lastAttemptAt: string | null; lastAttemptStatus: DutyFreeAttemptStatus;
  errorCode: string | null; nextAttemptAt: string | null;
};
export type DutyFreeExchangeSnapshot = {
  mode: 'duty-free-exchange'; collectionMode: 'AUTOMATED';
  generatedAt: string; todayKst: string; sources: DutyFreeSourceSnapshot[];
};
export function kstExchangeDate(nowMs: number): string | null {
  const date=new Date(nowMs+9*3_600_000);
  return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}
export function shiftExchangeDate(date: string, days: number): string | null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(days))return null;
  const at=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==date)return null;
  return new Date(at+days*86_400_000).toISOString().slice(0,10);
}
export function nextKstExchangeMidnight(nowMs: number): number {
  return Math.floor((nowMs+9*3_600_000)/86_400_000+1)*86_400_000-9*3_600_000;
}
/** A future application day is valid only with an explicit date from the official widget. */
export function verifiedDutyFreeObservation(input: unknown, nowMs: number): DutyFreeObservation | null {
  if(!input||typeof input!=='object'||!Number.isFinite(nowMs))return null;
  const row=input as DutyFreeObservation,at=Date.parse(row.verifiedAt);
  if(!Object.hasOwn(dutyFreeSources,row.vendor)||row.sourceUrl!==dutyFreeSources[row.vendor]
    ||row.verified!==true||row.scope!=='INTERNET_SHOP'||row.currency!=='USD'
    ||!Number.isFinite(row.krwPerUnit)||row.krwPerUnit<=0||!Number.isFinite(at)||at>nowMs
    ||!shiftExchangeDate(row.serviceDateKst,0))return null;
  const checkedDay=kstExchangeDate(at)!;
  if(row.serviceDateKst!==checkedDay) {
    if(row.dateEvidence!=='EXPLICIT_SOURCE_DATE'||row.serviceDateKst>shiftExchangeDate(checkedDay,1)!)return null;
  }
  return row;
}
export function dutyFreeDatedPresentation(snapshot: DutyFreeExchangeSnapshot|null,nowMs:number) {
  const today=kstExchangeDate(nowMs);
  if(!snapshot||!today)return [];
  const earliest=shiftExchangeDate(today,-1)!,latest=shiftExchangeDate(today,1)!;
  return activeDutyFreeVendors.flatMap(vendor=>{
    const source=snapshot.sources.find(value=>value.vendor===vendor);
    if(!source)return [];
    const byDate=new Map<string,DutyFreeObservation>();
    for(const input of [source.observation,...(source.observations??[])]) {
      const row=verifiedDutyFreeObservation(input,nowMs);
      if(!row||row.vendor!==vendor||row.serviceDateKst<earliest||row.serviceDateKst>latest)continue;
      const previous=byDate.get(row.serviceDateKst);
      if(!previous||Date.parse(row.verifiedAt)>Date.parse(previous.verifiedAt))byDate.set(row.serviceDateKst,row);
    }
    return [...byDate.values()].sort((a,b)=>a.serviceDateKst.localeCompare(b.serviceDateKst)).map(row=>({
      ...row,current:row.serviceDateKst===today,lastAttemptStatus:source.lastAttemptStatus,
    }));
  });
}
/** Retain actual evidence through failures; the headline chooses today's row separately. */
export function dutyFreePresentation(snapshot:DutyFreeExchangeSnapshot|null,nowMs:number,selectedDate?:string|null) {
  const today=kstExchangeDate(nowMs);
  if(!snapshot||!today||(selectedDate&&selectedDate!==today))return [];
  return activeDutyFreeVendors.flatMap(vendor=>{
    const source=snapshot.sources.find(row=>row.vendor===vendor);
    const observation=verifiedDutyFreeObservation(source?.observation,nowMs);
    if(!source||!observation||observation.vendor!==vendor)return [];
    return [{...observation,vendor,current:observation.serviceDateKst===today,lastAttemptStatus:source.lastAttemptStatus}];
  });
}
/** Legacy evidence helper; never derives tomorrow from today's value. */
export function currentDutyFreeExchange(records:readonly unknown[],nowMs:number,selectedDate?:string|null):DutyFreeObservation[] {
  const today=kstExchangeDate(nowMs);
  if(!today||(selectedDate&&selectedDate!==today))return [];
  const byVendor=new Map<DutyFreeVendor,DutyFreeObservation>();
  for(const input of records) {
    const row=verifiedDutyFreeObservation(input,nowMs);
    if(!row||row.serviceDateKst!==today)continue;
    const previous=byVendor.get(row.vendor);
    if(!previous||Date.parse(row.verifiedAt)>Date.parse(previous.verifiedAt))byVendor.set(row.vendor,row);
  }
  return (Object.keys(dutyFreeSources) as DutyFreeVendor[]).flatMap(vendor=>byVendor.has(vendor)?[byVendor.get(vendor)!]:[]);
}
export const DUTY_FREE_CACHE_KEY='koretail:duty-free:verified-days:v1';
/** Keep at most yesterday/today/tomorrow, without rewriting dates or verification clocks. */
export function mergeDutyFreeSnapshot(previous:DutyFreeExchangeSnapshot|null,next:DutyFreeExchangeSnapshot,nowMs:number):DutyFreeExchangeSnapshot {
  const older=dutyFreeDatedPresentation(previous,nowMs);
  const newer=dutyFreeDatedPresentation(next,nowMs);
  const sources=next.sources.filter(source=>activeDutyFreeVendors.some(vendor=>vendor===source.vendor)).map(source=>{
    const byDate=new Map<string,DutyFreeObservation>();
    for(const row of [...older,...newer].filter(row=>row.vendor===source.vendor)) {
      const existing=byDate.get(row.serviceDateKst);
      if(!existing||Date.parse(row.verifiedAt)>=Date.parse(existing.verifiedAt))byDate.set(row.serviceDateKst,row);
    }
    const observations=[...byDate.values()];
    const observation=observations.find(row=>row.serviceDateKst===kstExchangeDate(nowMs))
      ??observations.filter(row=>row.serviceDateKst<=kstExchangeDate(nowMs)!).sort((a,b)=>b.serviceDateKst.localeCompare(a.serviceDateKst))[0]??null;
    return {...source,observation,observations};
  });
  return {...next,sources};
}
export function validDutyFreeSnapshot(input:unknown):input is DutyFreeExchangeSnapshot {
  if(!input||typeof input!=='object')return false;
  const row=input as DutyFreeExchangeSnapshot;
  return row.mode==='duty-free-exchange'&&row.collectionMode==='AUTOMATED'&&Array.isArray(row.sources)
    &&row.sources.length>=1&&row.sources.length<=Object.keys(dutyFreeSources).length
    &&new Set(row.sources.map(source=>source?.vendor)).size===row.sources.length
    &&row.sources.every(source=>source&&Object.hasOwn(dutyFreeSources,source.vendor)
      &&(!source.observations||(Array.isArray(source.observations)&&source.observations.length<=3)));
}
/** Fast reads are confined to the first 15 KST minutes and twelve attempts per mounted day. */
export function dutyFreeReadDelay(nowMs:number,hasToday:boolean,failures:number,midnightReads:number) {
  const start=nextKstExchangeMidnight(nowMs)-86_400_000;
  if(!hasToday&&nowMs-start<15*60_000&&midnightReads<12)return 60_000;
  if(failures>0&&failures<=2)return failures===1?30_000:90_000;
  return 15*60_000;
}
