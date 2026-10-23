import type {RateLang} from './change-rate';
import {isValidKstDay} from './kst';

export interface ComparisonBasis {
 month:string;
 includedDays:readonly string[];
 through?:string|null;
 excludedDays?:readonly string[];
 expectedDays?:number;
 provenance?:'official-monthly-actuals'|'collected'|'forecast';
 officialFullMonth?:boolean;
}
const t=(lang:RateLang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];

/** Presentation evidence only; never changes a numerator, denominator or delta.
 * A completed scan/forecast month is not a finalized official actuals release. */
export function classifyComparisonBasis(data:ComparisonBasis){
 const validMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month)&&isValidKstDay(data.month+'-01');
 const unavailable={kind:'unavailable' as const,cutoff:null,days:0};
 if(!validMonth)return unavailable;
 if(data.provenance==='official-monthly-actuals'&&data.officialFullMonth===true)
  return {kind:'closed' as const,cutoff:null,days:0};
 if(!data.includedDays.length)return unavailable;
 const dates=new Set(data.includedDays),sorted=[...dates].sort(),cutoff=data.through===undefined?sorted.at(-1)!:data.through;
 const validDates=dates.size===data.includedDays.length&&sorted.every(day=>isValidKstDay(day)&&day.startsWith(data.month+'-'));
 const validCutoff=typeof cutoff==='string'&&isValidKstDay(cutoff)&&cutoff.startsWith(data.month+'-');
 const expected=validCutoff?Number(cutoff.slice(8)):0;
 const continuous=validDates&&validCutoff&&dates.size===expected
  &&(data.expectedDays===undefined||data.expectedDays===expected)
  &&!(data.excludedDays?.some(day=>day<=cutoff))
  &&Array.from({length:expected},(_,index)=>`${data.month}-${String(index+1).padStart(2,'0')}`).every(day=>dates.has(day));
 const monthEnd=new Date(Date.UTC(Number(data.month.slice(0,4)),Number(data.month.slice(5)),0)).toISOString().slice(0,10);
 return {kind:continuous?(cutoff===monthEnd?'full-collected' as const:'mtd' as const):'collected' as const,cutoff:validCutoff?cutoff:null,days:data.includedDays.length};
}

export function comparisonBasisLabel(data:ComparisonBasis,lang:RateLang){
 const basis=classifyComparisonBasis(data),month=data.month;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isValidKstDay(month+'-01'))return t(lang,'자료 확인 중','Checking data','正在确认资料','資料を確認中');
 const monthLabel=t(lang,`${month}월`,month,`${month}月`,`${month}月`);
 if(basis.kind==='unavailable')return `${monthLabel} ${t(lang,'자료 없음','no data','无资料','資料なし')}`;
 if(basis.kind==='closed')return `${monthLabel} ${t(lang,'마감 일평균','finalized monthly actuals mean/day','已结算月实际日均','確定月次実績の日平均')}`;
 const forecast=data.provenance==='forecast'?t(lang,'예보 ','forecast ','预报','予報'):'';
 if(basis.kind==='mtd'){
  const date=basis.cutoff!;
  return t(lang,`${month}월-${date.slice(8)}일 MTD ${forecast}일평균`,`${date} MTD ${forecast}mean/day`,`${date} MTD ${forecast}日均`,`${date} MTD ${forecast}日平均`);
 }
 if(basis.kind==='full-collected')return `${monthLabel} ${t(lang,`전체 수집분 ${forecast}일평균`,`full-calendar collected ${forecast}mean/day`,`全月已采集${forecast}日均`,`全月収集分の${forecast}日平均`)}`;
 return `${monthLabel} ${t(lang,`수집분 ${forecast}일평균`,`collected-day ${forecast}average`,`已采集${forecast}日均`,`収集分の${forecast}日平均`)}`;
}
