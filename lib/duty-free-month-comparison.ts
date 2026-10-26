import type {DutyFreeMonth} from './duty-free-exchange-monthly';
/** Stored observed-day averages only: no filling, weighting or full-month inference. */
export function dutyFreeMonthComparison(current:DutyFreeMonth,previous?:DutyFreeMonth){
 const key=(month:string)=>{const [year,value]=month.split('-').map(Number);return year*12+value;};
 const partial=!!previous&&(current.observedDays<current.calendarDays||previous.observedDays<previous.calendarDays);
 if(!previous||key(current.month)-key(previous.month)!==1)return {percent:null,reason:'NO_PREVIOUS' as const,partial};
 if(current.averageKrwPerUsd===null||previous.averageKrwPerUsd===null||current.observedDays<1||previous.observedDays<1)return {percent:null,reason:'MISSING' as const,partial};
 if(!Number.isFinite(previous.averageKrwPerUsd)||previous.averageKrwPerUsd<=0||!Number.isFinite(current.averageKrwPerUsd)||current.averageKrwPerUsd<=0)return {percent:null,reason:'INVALID_BASE' as const,partial};
 return {percent:(current.averageKrwPerUsd/previous.averageKrwPerUsd-1)*100,reason:null,partial};
}
