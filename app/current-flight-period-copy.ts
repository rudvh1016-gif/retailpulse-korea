import type {Lang} from './retailpulse-data';
export function currentFlightPeriodCopy(lang:Lang,day:string,previousDays:number,collectedAt:string|null){
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 const clock=collectedAt?new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',zh:'zh-CN',ja:'ja-JP'}[lang],{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(collectedAt))+' KST':t('미확인','unconfirmed','未确认','未確認');
 return {
  heading:t('오늘 잠정 출발편 · 전월 일평균 비교','Today’s provisional departures · previous-month daily mean','今日暂定出发航班 · 上月日均比较','今日の暫定出発便・前月の日平均との比較'),
  shortLabel:t(`${day.slice(5).replace('-','/')} 잠정`,`${day.slice(5).replace('-','/')} prov.`,`${day.slice(5).replace('-','/')} 暂定`,`${day.slice(5).replace('-','/')} 暫定`),
  currentLabel:t(`${day} 잠정 편수`,`${day} provisional flights`,`${day} 暂定班数`,`${day} 暫定便数`),
  basis:t(`${day} 하루 잠정 수집 기록 / 전월 포함 ${previousDays}일 일평균. 예정 출발시각 기준이며 운항 확정 실적이 아닙니다.`,`${day}: one provisional collected day versus the previous month’s ${previousDays} included-day mean. Scheduled departure times, not certified actual operations.`,`${day}一天暂定采集记录与上月计入${previousDays}天的日均值比较。按计划出发时间统计，并非已确认实际运行。`,`${day}の1日分の暫定収集記録を前月の採用${previousDays}日の日平均と比較します。出発予定時刻が基準で、確定した運航実績ではありません。`),
  collected:t(`당일 수집 ${clock}`,`Day collected ${clock}`,`当日采集 ${clock}`,`当日収集 ${clock}`),
  units:t('전월 편/일 → 오늘 편','Previous flights/day → today’s flights','上月班/日 → 今日班数','前月の便/日 → 今日の便数'),
  caption:t('전월 일평균 / 오늘 하루 잠정 편수','Previous-month daily mean / today’s provisional flight count','上月日均 / 今日一天暂定班数','前月の日平均／今日1日分の暫定便数'),
  classification:t('미정 분류는 전체 합계에 포함합니다. 미정 분류가 있는 쪽의 누락 항목은 0으로 단정하지 않고 비교값을 —로 표시합니다.','Unclassified records stay in the overall total. An absent category is withheld when that side has unclassified records; it is shown as —, never assumed to be zero.','未定分类计入总体合计。某一方存在未定分类时，不将缺少的类别视为0，并以—显示无法确认的比较值。','未分類の記録も全体の合計に含めます。未分類がある側の欠けた分類を0と断定せず、比較値を—で表示します。'),
  loading:t('당일 잠정 비교 자료를 확인 중입니다.','Checking the provisional current-day comparison.','正在核查当日暂定比较资料。','当日の暫定比較資料を確認中です。'),
  unavailable:t('당일 전체 수집·같은 수집 시각·범위 합계를 확인할 수 없어 잠정 비교를 표시하지 않습니다. 미확인 자료는 0으로 계산하지 않습니다.','A full same-epoch day scan and matching scope totals are unconfirmed. Provisional comparison is unavailable; missing data is not zero.','无法确认当日完整采集、同一采集时间及范围合计，暂不显示暂定比较；未知资料不计为0。','当日の全件収集・同一収集時刻・範囲の合計を確認できないため、暫定比較を表示しません。未確認資料を0としません。'),
 };
}
