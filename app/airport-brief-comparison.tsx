import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
import {passengerReferenceDailyChange,passengerDailyDeltaText} from '../lib/passenger-reference-comparison';
import {ChangeRate} from './change-rate';
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});

export function PassengerBriefComparison({total,day,baseline}:{total:number|null;day:string;baseline?:PassengerReferenceMonth|null}){
 const change=passengerReferenceDailyChange(total,day,baseline);
 const missing=baseline?.missingDates.length??0;
 return <p className="focus-passenger-comparison">{change
  ?<>전월 일평균 {number.format(change.mean)}명/일 대비 <b className="change-rate" data-direction={change.delta>0?'up':change.delta<0?'down':'neutral'}>{passengerDailyDeltaText(change.delta)}</b> ({change.percent===null?'기준값 0명 · 증감률 계산 불가':<ChangeRate value={change.percent} lang="ko"/>})</>
  :<>전월 일평균 대비: {total===null?'선택일 단순합계 확인 중':baseline&&baseline.status!=='COMPLETE'?`${baseline.expectedDays}일 중 ${baseline.completeDays}일 합산자료 확인 · ${missing}일 미확인 · 비교 보류`:'같은 기준의 비교자료 확인 중'}</>}
 </p>;
}
