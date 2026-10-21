import type {PassengerReferenceMonth} from './passenger-reference-month';
import {isValidKstDay} from './kst';

/** One complete selected forecast day versus the same arithmetic's complete prior
 * calendar month. Never substitute actuals, partial observed days or zero-filled days. */
export function passengerReferenceDailyChange(total:number|null|undefined,day:string,baseline:PassengerReferenceMonth|null|undefined){
 if(typeof total!=='number'||!Number.isSafeInteger(total)||total<0||!isValidKstDay(day)||!baseline)return null;
 const [year,month]=day.split('-').map(Number);
 const end=new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,10);
 const expectedDays=Number(end.slice(8)),previousMonth=end.slice(0,7);
 if(baseline.month!==previousMonth||baseline.start!==previousMonth+'-01'||baseline.end!==end
  ||baseline.status!=='COMPLETE'||baseline.expectedDays!==expectedDays||baseline.completeDays!==expectedDays
  ||baseline.missingDates.length||typeof baseline.mean!=='number'||!Number.isFinite(baseline.mean)||baseline.mean<0)return null;
 const currentDays=1,currentMean=total/currentDays,delta=currentMean-baseline.mean;
 return {currentDays,currentMean,baselineDays:expectedDays,mean:baseline.mean,delta,percent:baseline.mean>0?delta/baseline.mean*100:null};
}

const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
/** Keep sub-resolution changes directional rather than displaying a false zero. */
export function passengerDailyDeltaText(delta:number){
 if(!Number.isFinite(delta))return '확인 중';
 if(delta===0)return '0명/일 · 차이 없음';
 const magnitude=Math.abs(delta),amount=magnitude<0.05?'0.1명/일 미만':`${number.format(magnitude)}명/일`;
 return `${amount} ${delta>0?'증가':'감소'}`;
}
