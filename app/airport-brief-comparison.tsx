import {useId,type ReactNode} from 'react';
import type {PassengerReferenceMonth} from '../lib/passenger-reference-month';
import {passengerReferenceDailyChange} from '../lib/passenger-reference-comparison';
import {comparisonBasisLabel} from '../lib/comparison-basis';
import type {Lang} from './retailpulse-data';
import {ChangeRate,CountChange} from './change-rate';
const number=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});

export function PassengerBriefComparison({total,day,baseline,parts,lang='ko'}:{total:number|null;day:string;baseline?:PassengerReferenceMonth|null;lang?:Lang;parts?:ReactNode}){
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 const basisId=useId(),partsId=useId();
 const change=passengerReferenceDailyChange(total,day,baseline);
 const missing=baseline?.missingDates.length??0;
 return <div className="focus-passenger-comparison">{change
  ?<>
   <p className="focus-passenger-comparison-core"><span className="focus-comparison-basis">{comparisonBasisLabel({month:baseline!.month,
    includedDays:baseline!.observedDays?.map(row=>row.date)??Array.from({length:change.baselineDays},(_,i)=>`${baseline!.month}-${String(i+1).padStart(2,'0')}`),
    through:change.observedDaysOnly?[...baseline!.observedDays!].map(row=>row.date).sort().at(-1):baseline!.end,
    provenance:'forecast'},lang)} {number.format(change.mean)}{t('명 대비 ',' people compared with: ','人相比：','人比：')}</span>{' '}<span className="focus-comparison-change">
    <CountChange integer delta={change.delta} format={value=>number.format(value)} lang={lang} unit={t('명/일',' people/day','人/天','人/日')}/>{' '}
    {change.delta>0?t('증가','increase','增加','増加'):change.delta<0?t('감소','decrease','减少','減少'):t('차이 없음','no change','无变化','変化なし')}{' '}
    {change.percent===null?<span className="focus-passenger-zero-basis">{t('기준값 0명 · 증감률 계산 불가','Zero baseline · percentage change unavailable','基准值为0人 · 无法计算变化率','基準値0人 · 増減率は算出不可')}</span>:<span className="focus-passenger-rate">(<ChangeRate value={change.percent} lang={lang}/>)</span>}
   </span></p>
   <details className="focus-passenger-calculation">
    <summary aria-labelledby={basisId} aria-describedby={parts?partsId:undefined}><span id={basisId}>{t('계산 기준','Calculation basis','计算依据','計算基準')}</span>{parts&&<span id={partsId} className="focus-passenger-parts">{parts}</span>}</summary>
    <p>{change.observedDaysOnly
     ?t(`전월 수집 ${change.baselineDays}일 기준 일평균(전체 ${baseline!.expectedDays}일 중) ${number.format(change.mean)}명/일`,
       `Daily average for ${change.baselineDays} collected days last month (out of ${baseline!.expectedDays} days): ${number.format(change.mean)} people/day`,
       `上月已采集 ${change.baselineDays} 天的日均值（全月共 ${baseline!.expectedDays} 天）：${number.format(change.mean)} 人/天`,
       `前月の収集済み${change.baselineDays}日（全${baseline!.expectedDays}日中）の日平均：${number.format(change.mean)}人/日`)
     :t(`전월 ${change.baselineDays}일 기준 일평균 ${number.format(change.mean)}명/일`,
       `Previous-month daily average over ${change.baselineDays} days: ${number.format(change.mean)} people/day`,
       `上月 ${change.baselineDays} 天的日均值：${number.format(change.mean)} 人/天`,
       `前月${change.baselineDays}日の日平均：${number.format(change.mean)}人/日`)}</p>
    {change.observedDaysOnly&&<p className="focus-observed-days-basis">{t(
     `예보 단순합계 ${number.format(change.baselineTotal!)}명 ÷ ${change.baselineDays}일 · ${change.missingDays}일 미확인 · 월전체 평균 아님`,
     `Forecast arithmetic sum: ${number.format(change.baselineTotal!)} people ÷ ${change.baselineDays} days · ${change.missingDays} days unverified · Not a full-month average`,
     `预报简单合计：${number.format(change.baselineTotal!)} 人 ÷ ${change.baselineDays} 天 · ${change.missingDays} 天未确认 · 非全月平均值`,
     `予報の単純合計 ${number.format(change.baselineTotal!)}人 ÷ ${change.baselineDays}日 · ${change.missingDays}日未確認 · 月全体の平均ではありません`)}</p>}
   </details>
  </>
  :<p className="focus-passenger-comparison-core">{t('전월 일평균 대비: ','Compared with the previous-month daily average: ','与上月日均比较：','前月の日平均比：')}{total===null?t('선택일 단순합계 확인 중','Checking the selected-day sum','正在确认所选日期简单合计','選択日の単純合計を確認中'):baseline&&baseline.status!=='COMPLETE'?t(`${baseline.expectedDays}일 중 ${baseline.completeDays}일 합산자료 확인 · ${missing}일 미확인 · 비교 보류`,`${baseline.completeDays} of ${baseline.expectedDays} days confirmed · ${missing} days unconfirmed · comparison withheld`,`${baseline.expectedDays}天中已确认${baseline.completeDays}天合计资料 · ${missing}天未确认 · 暂不比较`,`${baseline.expectedDays}日中${baseline.completeDays}日の合計を確認 · ${missing}日未確認 · 比較保留`):t('같은 기준의 비교자료 확인 중','Checking data on the same basis','正在确认相同口径的对比资料','同じ基準の比較資料を確認中')}</p>}
 {!change&&parts&&<p className="focus-passenger-parts">{parts}</p>}
 </div>;
}

