import type {PassengerReferenceMonth} from './passenger-reference-month';
import type {Lang} from '../app/retailpulse-data';
import {briefText} from './brief-localization';
import {isValidKstDay} from './kst';

/** Only complete daily departure+transfer forecast pairs enter this sample.
 * Date partition and component checks prevent a monthly total being divided by
 * fewer days, duplicate dates, partial days and missing-as-zero conversions. */
function observedReference(baseline:PassengerReferenceMonth){
 const rows=baseline.observedDays;
 if(!Array.isArray(rows)||!Array.isArray(baseline.missingDates)||baseline.mean!==null||!Number.isInteger(baseline.completeDays)||baseline.completeDays<1
  ||baseline.completeDays>=baseline.expectedDays||rows.length!==baseline.completeDays
  ||baseline.missingDates.length!==baseline.expectedDays-baseline.completeDays)return null;
 const dates=new Set<string>();
 const inMonth=(day:string)=>isValidKstDay(day)&&day>=baseline.start&&day<=baseline.end;
 for(const day of baseline.missingDates){if(!inMonth(day)||dates.has(day))return null;dates.add(day);}
 let total=0;
 for(const row of rows){
  if(!row||!inMonth(row.date)||dates.has(row.date)||![row.departures,row.transfers].every(value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0))return null;
  dates.add(row.date);total+=row.departures+row.transfers;if(!Number.isSafeInteger(total))return null;
 }
 return dates.size===baseline.expectedDays?{total,days:rows.length,mean:total/rows.length}:null;
}

/** One complete selected forecast day versus the same arithmetic in the prior
 * month. A partial calendar month is usable only as a named observed-days sample,
 * never as a month-wide mean. No actuals, partial daily totals or imputed zeros. */
export function passengerReferenceDailyChange(total:number|null|undefined,day:string,baseline:PassengerReferenceMonth|null|undefined){
 if(typeof total!=='number'||!Number.isSafeInteger(total)||total<0||!isValidKstDay(day)||!baseline||!Array.isArray(baseline.missingDates))return null;
 const [year,month]=day.split('-').map(Number);
 const end=new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,10);
 const expectedDays=Number(end.slice(8)),previousMonth=end.slice(0,7);
 if(baseline.month!==previousMonth||baseline.start!==previousMonth+'-01'||baseline.end!==end||baseline.expectedDays!==expectedDays)return null;
 const observed=baseline.status==='PARTIAL'?observedReference(baseline):null;
 if(!observed&&(baseline.status!=='COMPLETE'||baseline.completeDays!==expectedDays
  ||baseline.missingDates.length||typeof baseline.mean!=='number'||!Number.isFinite(baseline.mean)||baseline.mean<0))return null;
 const mean=observed?.mean??baseline.mean!,baselineDays=observed?.days??expectedDays;
 const currentDays=1,currentMean=total/currentDays,delta=currentMean-mean;
 return {currentDays,currentMean,baselineDays,mean,delta,percent:mean>0?delta/mean*100:null,
  ...(observed?{observedDaysOnly:true as const,baselineTotal:observed.total,missingDays:expectedDays-baselineDays}:{})};
}

const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
/** Keep sub-resolution changes directional rather than displaying a false zero. */
export function passengerDailyDeltaText(delta:number,lang:Lang='ko'){
 const t=(ko:string,en:string,zh:string)=>briefText(lang,ko,en,zh);
 if(!Number.isFinite(delta))return t('확인 중','Checking','确认中');
 if(delta===0)return t('0명/일 · 차이 없음','0 people/day · no change','0人/天 · 无变化');
 const magnitude=Math.abs(delta),amount=magnitude<0.05?t('0.1명/일 미만','less than 0.1 people/day','不足0.1人/天'):t(`${number.format(magnitude)}명/일`,`${number.format(magnitude)} people/day`,`${number.format(magnitude)}人/天`);
 return `${amount} ${delta>0?t('증가','increase','增加'):t('감소','decrease','减少')}`;
}
