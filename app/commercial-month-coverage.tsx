import type {Lang} from './retailpulse-data';
import type {CommercialMonthCategory} from '../lib/commercial-monthly';
type Coverage=NonNullable<CommercialMonthCategory['comparison']['coverage']>;
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
function byDay(keys:readonly string[]) {
 const days=new Map<string,string[]>();
 for(const key of keys){if(!/^\d{2}T\d{2}$/.test(key))continue;const day=key.slice(0,2),hours=days.get(day)??[];hours.push(key.slice(3));days.set(day,hours);}
 return [...days].sort(([a],[b])=>a.localeCompare(b));
}
/** Hour membership is known; exact ten-minute clocks are not retained in the
 * aggregate. Never turn a sampled hour or first/last clock into continuous time. */
export function CommercialMonthCoverage({coverage,current,previous,lang}:{coverage:Coverage;current:string;previous:string;lang:Lang}) {
 const days=byDay(coverage.hours??[]);
 const hourUnit=t(lang,'시대','h','时段','時台');
 const dateList=(values:string[])=>values.map(value=>value.slice(5)).join(', ')||'—';
 return <div className="consumption-coverage" data-testid="consumption-coverage">
  <p>{t(lang,'평균에 포함한 날짜·기준시각','Dates and reference hours in the mean','均值包含的日期与基准小时','平均に含めた日付・基準時間')} (KST)</p>
  <p>{previous}: {dateList(coverage.previousDates)}<br/>{current}: {dateList(coverage.currentDates)}</p>
  {days.length>0?<p>{days.slice(0,2).map(([day,hours])=>`${day} · ${hours.join(', ')}${hourUnit}`).join(' / ')}{days.length>2?` · +${days.length-2} ${t(lang,'개 날짜','dates','个日期','日')}`:''}</p>:<p>{t(lang,'시간대 목록은 저장 집계에서 확인되지 않습니다.','Hour membership is unavailable in the retained aggregate.','保留汇总无法确认小时列表。','保存集計で時間一覧を確認できません。')}</p>}
  <small>{t(lang,'수집된 일부 10분 기록만 포함 · 하루 전체가 아닙니다. 업종마다 비공개·누락 구간이 달라 포함 시간이 다릅니다.','Sampled 10-minute records only, not full days. Suppressed and missing bins differ by industry.','仅包含已采集的部分10分钟记录，并非整天。各行业未公开和缺失时段不同。','収集した一部の10分記録のみで、1日全体ではありません。非公開・欠測時間は業種ごとに異なります。')}</small>
  <details><summary>{t(lang,'전체 시간대·결제 및 금액의 분모','All hours and payment/amount denominators','全部小时与支付及金额分母','全時間・決済と金額の分母')}</summary>
   <ul>{days.map(([day,hours])=><li key={day}>{previous}-{day} / {current}-{day}: {hours.join(', ')}{hourUnit}</li>)}</ul>
   <p>{t(lang,'결제값 관측 수','Published payment readings','支付值观测数','決済値の観測数')}: {previous} {coverage.previousWindows} → {current} {coverage.currentWindows}</p>
   <p>{t(lang,'각 시간 안의 관측값을 먼저 평균낸 뒤 공통 시간대의 평균을 같은 비중으로 비교합니다. 표시된 시간대 전체를 연속 수집했다는 뜻은 아닙니다.','Average readings within each hour first, then give matching hours equal weight. Listed hours do not mean continuous collection.','先平均每小时观测值，再对共同小时等权比较。列出的小时不代表连续采集。','各時間内の観測値を先に平均し、共通時間を同じ重みで比較します。表示時間の連続収集を意味しません。')}</p>
   {coverage.amount&&<><p>{t(lang,'금액 범위는 금액이 양월 모두 공개된 구간만 별도로 비교','Amount bounds use a separate set of bins published in both months','金额范围单独比较两月均公开金额的时段','金額範囲は両月で公開された時間を別に比較')}: {coverage.amount.hours.length} {t(lang,'개 시간대','hour bins','个小时段','時間枠')} · {previous} {coverage.amount.previousWindows} → {current} {coverage.amount.currentWindows} {t(lang,'개 관측','readings','次观测','観測')}</p>
    <ul>{byDay(coverage.amount.hours).map(([day,hours])=><li key={day}>{previous}-{day} / {current}-{day}: {hours.join(', ')}{hourUnit}</li>)}</ul></>}
  </details>
 </div>;
}
