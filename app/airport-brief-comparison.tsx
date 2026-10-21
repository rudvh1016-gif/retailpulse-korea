import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
import {passengerReferenceDailyChange,passengerDailyDeltaText} from '../lib/passenger-reference-comparison';
import type {Lang} from './retailpulse-data';
import {briefText} from '../lib/brief-localization';
import {ChangeRate} from './change-rate';
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});

export function PassengerBriefComparison({total,day,baseline,lang='ko'}:{total:number|null;day:string;baseline?:PassengerReferenceMonth|null;lang?:Lang}){
 const t=(ko:string,en:string,zh:string)=>briefText(lang,ko,en,zh);
 const change=passengerReferenceDailyChange(total,day,baseline);
 const missing=baseline?.missingDates.length??0;
 return <p className="focus-passenger-comparison">{change
  ?<>{change.observedDaysOnly?t(`전월 수집 ${change.baselineDays}일 기준 일평균(전체 ${baseline!.expectedDays}일 중) ${number.format(change.mean)}명/일 대비 `,`Compared with ${number.format(change.mean)} people/day, the daily average for ${change.baselineDays} collected days last month (out of ${baseline!.expectedDays} days): `,`较上月已采集 ${change.baselineDays} 天的日均值 ${number.format(change.mean)} 人/天（全月共 ${baseline!.expectedDays} 天）：`):t(`전월 일평균 ${number.format(change.mean)}명/일 대비 `,`Compared with the previous-month average of ${number.format(change.mean)} people/day: `,`与上月日均${number.format(change.mean)}人/天比较：`)}<b className="change-rate" data-direction={change.delta>0?'up':change.delta<0?'down':'neutral'}>{passengerDailyDeltaText(change.delta,lang)}</b> ({change.percent===null?t('기준값 0명 · 증감률 계산 불가','Zero baseline · percentage change unavailable','基准值为0人 · 无法计算变化率'):<ChangeRate value={change.percent} lang={lang==='ja'?'ko':lang}/>}){change.observedDaysOnly&&<small className="focus-observed-days-basis">{t(`예보 단순합계 ${number.format(change.baselineTotal!)}명 ÷ ${change.baselineDays}일 · ${change.missingDays}일 미확인 · 월전체 평균 아님`,`Forecast arithmetic sum: ${number.format(change.baselineTotal!)} people ÷ ${change.baselineDays} days · ${change.missingDays} days unverified · Not a full-month average`,`预报简单合计：${number.format(change.baselineTotal!)} 人 ÷ ${change.baselineDays} 天 · ${change.missingDays} 天未确认 · 非全月平均值`)}</small>}</>
  :<>{t('전월 일평균 대비: ','Compared with the previous-month daily average: ','与上月日均比较：')}{total===null?t('선택일 단순합계 확인 중','Checking the selected-day sum','正在确认所选日期简单合计'):baseline&&baseline.status!=='COMPLETE'?t(`${baseline.expectedDays}일 중 ${baseline.completeDays}일 합산자료 확인 · ${missing}일 미확인 · 비교 보류`,`${baseline.completeDays} of ${baseline.expectedDays} days confirmed · ${missing} days unconfirmed · comparison withheld`,`${baseline.expectedDays}天中已确认${baseline.completeDays}天合计资料 · ${missing}天未确认 · 暂不比较`):t('같은 기준의 비교자료 확인 중','Checking data on the same basis','正在确认相同口径的对比资料')}</>}
 </p>;
}
