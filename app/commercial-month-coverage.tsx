import type {ReactNode} from 'react';
import type {Lang} from './retailpulse-data';
import type {CommercialMonthCategory} from '../lib/commercial-monthly';
import {comparisonDateMembership} from '../lib/comparison-date-membership';
type Coverage=NonNullable<CommercialMonthCategory['comparison']['coverage']>;
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
function byDay(keys:readonly string[]) {
 const days=new Map<string,string[]>();
 for(const key of keys){if(!/^\d{2}T\d{2}$/.test(key))continue;const day=key.slice(0,2),hours=days.get(day)??[];hours.push(key.slice(3));days.set(day,hours);}
 return [...days].sort(([a],[b])=>a.localeCompare(b));
}
/** Hour membership is known; exact ten-minute clocks are not retained in the
 * aggregate. Never turn a sampled hour or first/last clock into continuous time. */
export function CommercialMonthCoverage({coverage,current,previous,lang,matchedDays,matchedHours,children}:{coverage?:Coverage;current:string;previous:string;lang:Lang;matchedDays:number;matchedHours:number;children?:ReactNode}) {
 const days=byDay(coverage?.hours??[]);
 const hourUnit=t(lang,'시대','h','时段','時台');
 const number=new Intl.NumberFormat(({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'})[lang]);
 const dateList=(values:string[])=>values.map(value=>value.slice(8)).join(', ')||'—';
 const showYear=previous.slice(0,4)!==current.slice(0,4);
 const previousDates=coverage?comparisonDateMembership(coverage.previousDates,showYear):null,currentDates=coverage?comparisonDateMembership(coverage.currentDates,showYear):null;
 return <div className="consumption-coverage" data-testid="consumption-coverage">
  <p className="consumption-actual-period" data-testid="consumption-actual-period">{previousDates&&currentDates?<>{t(lang,'비교','Comparison','比较','比較')}: <span>{previousDates}</span> vs <span>{currentDates}</span> · {t(lang,'공통 시간대 기준','shared hours','共同小时基准','共通時間基準')} (KST)</>:coverage&&previousDates===''&&currentDates===''?t(lang,'공통 관측 없음','No shared observations','无共同观测','共通観測なし'):t(lang,'비교에 포함된 날짜 미확인','Included comparison dates unconfirmed','比较日期未确认','比較対象日は未確認')}</p>
  <details><summary>{t(lang,'날짜·시간대와 계산 기준','Dates, hours and calculation','日期、小时与计算依据','日付・時間と計算基準')}</summary>
   <p>{t(lang,'공통 날짜','Common dates','共同日期','共通日付')} {number.format(matchedDays)} · {t(lang,'날짜×시간대','date/hour bins','日期×小时','日付×時間枠')} {number.format(matchedHours)}</p>
   {coverage?<>
    <p>{t(lang,'포함 날짜·기준 시간대','Included dates and reference hours','包含日期与基准小时','含めた日付・基準時間')} (KST)<br/>{previous}: {dateList(coverage.previousDates)}<br/>{current}: {dateList(coverage.currentDates)}</p>
    {!coverage.hours&&<p>{t(lang,'시간대 목록 미확인','Hour list unconfirmed','小时列表未确认','時間一覧は未確認')}</p>}
    <ul>{days.map(([day,hours])=><li key={day}>{previous}-{day} / {current}-{day}: {hours.join(', ')}{hourUnit}</li>)}</ul>
    <p>{t(lang,'평균에 포함한 결제값 관측 수','Payment readings in the mean','均值包含的支付观测数','平均に含めた決済値の観測数')}: {previous} {number.format(coverage.previousWindows)} → {current} {number.format(coverage.currentWindows)}</p>
   </>:<p>{t(lang,'보존된 집계에서 정확한 포함 날짜·시간대 목록은 확인되지 않습니다.','The retained aggregate does not confirm exact dates or hours.','保留汇总无法确认确切日期与小时列表。','保存集計では正確な日付・時間一覧を確認できません。')}</p>}
   <p>{t(lang,'시간대 안의 10분 결제값을 먼저 평균낸 뒤, 양월 공통 날짜×시간대의 평균을 같은 비중으로 비교합니다. 시간당 합계·일평균이 아닙니다.','Average 10-minute payment readings within each hour, then equally weight shared date/hour means. This is not an hourly total or daily mean.','先平均每小时的10分钟支付值，再对两月共同日期×小时均值等权比较，并非小时合计或日均。','各時間の10分決済値を平均し、両月共通の日付×時間の平均を同じ重みで比較します。時間合計・日平均ではありません。')}</p>
   <p>{t(lang,'비공개·누락으로 업종별 포함 구간이 다르며, 표시 시간대의 연속 수집을 뜻하지 않습니다.','Suppressed or missing values change each industry’s included bins. Listed hours do not mean continuous collection.','未公开或缺失值使各行业包含时段不同，列出的小时不代表连续采集。','非公開・欠測により業種ごとの対象時間は異なります。表示時間の連続収集を意味しません。')}</p>
   {coverage?.amount&&<><p>{t(lang,'금액은 양월에 함께 공개된 구간을 별도로 평균','Amounts separately average bins published in both months','金额单独平均两月均公开的时段','金額は両月で公開された時間を別に平均')}: {number.format(coverage.amount.hours.length)} {t(lang,'개 날짜×시간대','date/hour bins','个日期×小时','日付×時間枠')} · {previous} {number.format(coverage.amount.previousWindows)} → {current} {number.format(coverage.amount.currentWindows)} {t(lang,'개 관측','readings','次观测','観測')}</p>
    <ul>{byDay(coverage.amount.hours).map(([day,hours])=><li key={day}>{previous}-{day} / {current}-{day}: {hours.join(', ')}{hourUnit}</li>)}</ul></>}
   {children}
  </details>
 </div>;
}
