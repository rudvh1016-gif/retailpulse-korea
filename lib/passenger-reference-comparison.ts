import type {PassengerReferenceMonth} from './passenger-reference-month';
import type {Lang} from '../app/retailpulse-data';
import {briefText} from './brief-localization';
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
export function passengerDailyDeltaText(delta:number,lang:Lang='ko'){
 const t=(ko:string,en:string,zh:string)=>briefText(lang,ko,en,zh);
 if(!Number.isFinite(delta))return t('확인 중','Checking','确认中');
 if(delta===0)return t('0명/일 · 차이 없음','0 people/day · no change','0人/天 · 无变化');
 const magnitude=Math.abs(delta),amount=magnitude<0.05?t('0.1명/일 미만','less than 0.1 people/day','不足0.1人/天'):t(`${number.format(magnitude)}명/일`,`${number.format(magnitude)} people/day`,`${number.format(magnitude)}人/天`);
 return `${amount} ${delta>0?t('증가','increase','增加'):t('감소','decrease','减少')}`;
}
