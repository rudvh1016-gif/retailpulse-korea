import type {Lang} from './retailpulse-data';
import type {GlanceScope} from '../lib/airport-glance';
import {glanceWeekChange,type GlanceWeekReference} from '../lib/glance-week-comparison';
import {isValidKstDay,shiftKstDay} from '../lib/kst';
import {ChangeRate,CountChange} from './change-rate';

export function GlanceWeekComparison({total,day,scope,reference,kind,lang,pending=false}:{pending?:boolean;total:number|null;day:string;scope:GlanceScope;reference?:GlanceWeekReference|null;kind:'people'|'flights';lang:Lang}){
 const t=(ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
 const change=glanceWeekChange(total,day,reference,scope,kind),number=new Intl.NumberFormat(lang,{maximumFractionDigits:0});
 const previousDay=isValidKstDay(day)?shiftKstDay(day,-7):t('날짜 확인 중','Checking date','正在确认日期','日付を確認中');
 const unit=kind==='people'?t('명',' people','人','人'):t('편',' flights','班','便');
 const area=kind==='people'&&scope!=='all'&&scope!=='T2'?t('T1 공통(탑승동 포함)','Shared T1 (incl. concourse)','T1共用（含登机楼）','T1共通（搭乗棟含む）'):scope==='all'?t('공항 전체','All airport areas','全机场','空港全体'):scope==='CONCOURSE'?t('탑승동','Concourse','登机楼','搭乗棟'):scope==='T1'?t('T1 본관','T1 main building','T1主楼','T1本館'):'T2';
 return <div className="focus-week-comparison" data-kind={kind}>
  <p className="focus-week-change">① {change?<><CountChange integer delta={change.delta} format={number.format} lang={lang} unit={unit}/>{' '}{change.delta>0?t('증가','increase','增加','増加'):change.delta<0?t('감소','decrease','减少','減少'):t('차이 없음','no change','无变化','変化なし')}{' '}{change.percent===null?<span>{t('기준값 0 · 증감률 계산 불가','Zero baseline · percentage change unavailable','基准值为0 · 无法计算变化率','基準値0 · 増減率は算出不可')}</span>:<>(<ChangeRate value={change.percent} lang={lang}/>)</>}</>:pending?t('비교자료 확인 중','Checking comparison','正在确认对比资料','比較資料を確認中'):t('비교 불가','Comparison unavailable','无法比较','比較不可')}</p>
  <small className="focus-week-basis">{previousDay} · <strong>{t('지난주 같은 요일','Same weekday last week','上周同日','先週の同じ曜日')}</strong>{scope!=='all'&&<> · {area}</>}{change?` · ${number.format(change.previous)}${unit}${t(' 대비', ' baseline','相比','比')}`:pending?t(' · 자료 확인 중',' · Checking data',' · 正在确认资料',' · 資料を確認中'):kind==='flights'?t(' · 전체 수집·저장 기록·화면 집계 확인 필요',' · Full scan, stored records and matching counts required',' · 需确认完整采集、已存记录与相同统计口径',' · 全件収集・保存記録と同じ集計の確認が必要'):t(' · 같은 기준의 완전한 예보 없음',' · Complete same-basis forecast unavailable',' · 缺少同口径的完整预测',' · 同じ基準の完全な予報なし')}</small>
 </div>;
}
