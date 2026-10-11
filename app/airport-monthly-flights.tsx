'use client';
import {useState} from 'react';
import {usePreparedMonth} from './use-prepared-month';
import type {Lang,Terminal} from './retailpulse-data';
import {ChangeRate} from './change-rate';
import {AirportDestinationDailyChanges} from './airport-destination-daily-changes';
import {MONTH_SCOPES,monthlyCategoryKeys,monthlyMetric,previousFlightMonth,type AirportFlightMonth,type AirportMonthlyRollups,type MonthCounts,type MonthScope} from '../lib/airport-monthly-flights';
import './airport-monthly-flights.css';
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
interface Reply {status:string;month:string;months:string[];calculatedAt:string|null;lastPreparedAt?:string|null;data:AirportMonthlyRollups|null}
export function AirportMonthlyFlights({lang,terminal,date}:{lang:Lang;terminal:'all'|Terminal|'CONCOURSE';date:string}){
 const defaultMonth=date.slice(0,7);
 const [chosen,setChosen]=useState<string|null>(null);
 const month=chosen??defaultMonth,scope:MonthScope=terminal==='all'?'ALL':terminal;
 const request=usePreparedMonth<Reply>(month,`/api/live/airport-months?month=${encodeURIComponent(month)}`,month,date),response=request.reply;
 const current=response?.data?.months.find(value=>value.month===month),previous=response?.data?.months.find(value=>value.month===previousFlightMonth(month??''));
 const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{maximumFractionDigits:1});
 const countryNames=new Intl.DisplayNames([lang],{type:'region'});
 const value=(number:number|null)=>number===null?'—':fmt.format(number);
 const percentage=(number:number|null)=>number===null?'—':fmt.format(number)+'%';
 const labels:Record<MonthScope,string>={ALL:t(lang,'전체','All','全部','全体'),T1:t(lang,'T1 · 본관+탑승동','T1 · main + concourse','T1 · 主楼+卫星厅','T1 · 本館＋搭乗棟'),T2:'T2',CONCOURSE:t(lang,'탑승동','Concourse','卫星厅','搭乗棟'),UNKNOWN:t(lang,'터미널 미정','Terminal unconfirmed','航站楼未确认','ターミナル未確認')};
 const selected:MonthScope=MONTH_SCOPES.includes(scope)?scope:'ALL';
 const metric=(key:(counts:MonthCounts)=>number)=>monthlyMetric(current,previous,selected,key);
 const total=metric(counts=>counts.total);
 const period=(data:AirportFlightMonth|undefined,label:string)=><p className="airport-month-period">{label}: {data?<><strong>{data.from}–{data.through??'—'}</strong> · {t(lang,'집계','Included','计入','集計')} <strong>{data.includedDays.length}/{data.eligibleDays}</strong> {t(lang,'일','days','天','日')}</>:t(lang,'비교 자료 없음','No comparison data','无比较资料','比較資料なし')}</p>;
 const row=(label:string,key:(counts:MonthCounts)=>number)=>{const pair=metric(key);return <tr key={label}><th scope="row">{label}</th><td>{value(pair.previous)}</td><td>{value(pair.current)}</td><td><ChangeRate value={pair.percent} lang={lang}/></td></tr>;};
 const share=(data:AirportFlightMonth|undefined,key:(counts:MonthCounts)=>number)=>data?.includedDays.length&&data.scopes[selected].total>0?key(data.scopes[selected])/data.scopes[selected].total*100:null;
 const shareRow=(label:string,key:(counts:MonthCounts)=>number)=>{const now=share(current,key),before=share(previous,key);return <tr key={label}><th scope="row">{label}</th><td>{percentage(before)}</td><td>{percentage(now)}</td><td><ChangeRate value={now!==null&&before!==null?now-before:null} lang={lang} unit="%p"/></td></tr>;};
 const eastWest=(data:AirportFlightMonth|undefined)=>{const counts=data?.scopes[selected],denominator=counts?counts.sides.EAST+counts.sides.WEST:0;return denominator?`${percentage(counts!.sides.EAST/denominator*100)} (${fmt.format(denominator)})`:'—';};
 const emptyMessage=request.pending&&!response?t(lang,'월별 집계를 불러오는 중…','Loading monthly counts…','正在读取月度统计…','月別集計を読み込み中…'):request.failed?t(lang,'월 집계 연결이 일시적으로 지연됐습니다.','Monthly counts are temporarily unavailable.','月度统计连接暂时延迟。','月別集計の接続が一時的に遅延しています。'):response?.status==='PENDING_UPDATE'?t(lang,'기존 집계의 업데이트를 기다리고 있습니다. 다음 정기 작업에서 같은 기준으로 다시 집계합니다.','The stored count awaits an update in the next regular job.','现有统计等待下次定期任务更新。','保存集計は次の定期処理で更新予定です。'):t(lang,'이 월의 집계 자료가 아직 없습니다. 없는 날짜는 0으로 계산하지 않습니다.','No prepared count for this month yet. Missing dates are not counted as zero.','本月暂无汇总，缺失日期不计为0。','この月の集計はまだありません。欠測日は0として数えません。');
 const table=(rows:React.ReactNode,shares=false)=><div className="airport-month-table"><table><caption>{shares?t(lang,'선택 범위의 전체 집계 편수 중 비중','Share of all counted flights in this scope','所选范围全部计入航班占比','選択範囲の集計便全体に対する割合'):t(lang,'집계 편수 ÷ 실제 포함 날짜 수 · 편/일','Counted flights ÷ included dates · flights/day','计入航班 ÷ 实际计入日期 · 班/日','集計便数 ÷ 含めた日数 · 便/日')}</caption><thead><tr><th>{t(lang,'구분','Category','类别','項目')}</th><th>{previous?.month??t(lang,'전월','Previous','上月','前月')}</th><th>{month}</th><th>{t(lang,'변화','Change','变化','変化')}</th></tr></thead><tbody>{rows}</tbody></table></div>;
 const breakdown=(kind:'airlines'|'registrationCountries'|'destinationCountries',title:string)=><details data-testid={`month-list-${kind}`}><summary>{title}</summary>{table(monthlyCategoryKeys(current,previous,selected,kind).map(key=>{
  const name=current?.airlineNames[key]??previous?.airlineNames[key];
  return row(key==='UNKNOWN'?t(lang,'미정','Unconfirmed','未确认','未確認'):kind==='airlines'?`${key}${name?' · '+name:''}`:countryNames.of(key)??key,counts=>counts[kind][key]??0);
 }))}</details>;
 return <section className="airport-month-flights" data-testid="airport-month-flights" aria-label={t(lang,'월별 출국 항공편 구성','Monthly departure mix','月度出境航班构成','月別出発便の構成')}>
  <h3>{t(lang,'국가별 항공편 · 전월 대비 일평균','Flights by country · daily mean vs previous month','各国航班 · 较上月日均','国別の便数・前月比の1日平均')} <small>{labels[selected]}</small></h3>
  <label>{t(lang,'비교 월','Comparison month','比较月份','比較する月')} <select value={month??''} onChange={event=>setChosen(event.target.value)}>{[...new Set([...(month?[month]:[]),...(response?.months??[])])].sort().reverse().map(value=><option key={value}>{value}</option>)}</select></label>
  {!current?<div className="airport-month-state" role="status"><p>{emptyMessage}</p>{request.attempt<3?<small>{t(lang,'잠시 후 자동으로 다시 확인합니다.','A bounded automatic check follows shortly.','稍后自动再次检查。','まもなく自動で再確認します。')}</small>:<button type="button" onClick={request.retry}>{t(lang,'자료 다시 확인','Check data again','再次检查资料','資料を再確認')}</button>}{response?.lastPreparedAt&&<small>{t(lang,'이전 집계 시각','Previous calculation','之前汇总时间','前の集計時刻')}: {response.lastPreparedAt}</small>}<a href={`/${lang}/more#collection-status`}>{t(lang,'수집 상태 보기','Collection status','查看采集状态','収集状況')}</a></div>:<>
   {(request.pending||request.failed||request.retained)&&<p className="airport-month-state" role="status">{t(lang,'마지막 확인 집계를 표시합니다.','Showing the last confirmed count.','显示上次确认的汇总。','最後に確認した集計を表示しています。')} {response?.data?.asOf} KST · {response?.calculatedAt}</p>}
   {period(previous,previousFlightMonth(month!))}{period(current,month!)}
   <p>{t(lang,'출국편','Departures','出境航班','出発便')}: <strong>{value(total.previous)} → {value(total.current)}</strong> {t(lang,'편/일','flights/day','班/日','便/日')} · <ChangeRate value={total.percent} lang={lang}/></p>
   <AirportDestinationDailyChanges lang={lang} current={current} previous={previous} scope={selected}/>
   {table(([['EAST',t(lang,'동편','East','东侧','東側')],['WEST',t(lang,'서편','West','西侧','西側')],['CENTER',t(lang,'중앙','Centre','中央','中央')],['UNVERIFIED',selected==='T1'?t(lang,'미정·탑승동','Unconfirmed / concourse','未确认／卫星厅','未確認・搭乗棟'):t(lang,'구역 미정','Side unconfirmed','区域未确认','区画未確認')]] as const).map(([key,label])=>row(label,counts=>counts.sides[key])))}
   <details><summary>{t(lang,'동·서 분모와 전체 비중','East/west denominator and overall shares','东西分母与整体占比','東西の分母と全体比率')}</summary>
    <p>{t(lang,'위 편/일의 분모는 각 월의 실제 포함 날짜 수입니다. 아래 비중의 분모는 선택 범위의 전체 집계 편수입니다. 동·서 확인편수만 비교하는 분모는 동편+서편이며 중앙·미정·T1 탑승동은 제외합니다.','Daily means divide by each month’s included dates. Shares below divide by all counted flights in the selected scope. The east/west-only denominator is east + west, excluding centre, unconfirmed and T1 concourse.','日均分母为各月实际计入日期；以下占比分母为所选范围全部计入航班。东西比较分母为东＋西，不含中央、未确认及T1卫星厅。','1日平均の分母は各月の含めた日数です。下の割合は選択範囲の集計便全体を分母とします。東西のみの分母は東＋西で、中央・未確認・T1搭乗棟を除きます。')}</p>
    <p>{t(lang,'동·서 확인편수 중 동편 비중 (분모 편수)','East share among east/west-confirmed flights (denominator flights)','东西确认航班中东侧占比（分母班次）','東西確認便の東側割合（分母の便数）')}: {previous?.month??'—'} {eastWest(previous)} → {month} {eastWest(current)}</p>
    {table(['EAST','WEST','CENTER','UNVERIFIED'].map(key=>shareRow(key,counts=>counts.sides[key as keyof MonthCounts['sides']])),true)}
   </details>
   {breakdown('destinationCountries',t(lang,'목적지 국가·지역 전체','All destination countries / territories','全部目的地国家／地区','目的地の国・地域すべて'))}
   {breakdown('airlines',t(lang,'운항 항공사 전체','All operating airlines','全部运营航空公司','運航航空会社すべて'))}
   {breakdown('registrationCountries',t(lang,'항공사 등록 국가 전체','All airline registration countries','全部航空公司注册国','航空会社の登録国すべて'))}
   <p>{t(lang,'전월 평균이 0이거나 비교 자료가 없으면 변화율은 — 입니다.','Change is — when the previous mean is zero or data is unavailable.','上月均值为0或无比较资料时，变化率为—。','前月平均が0または比較資料がない場合、変化率は—です。')}</p>
   <details><summary>{t(lang,'포함 날짜·제외 자료·출처','Included dates, exclusions and sources','计入日期、排除资料及来源','含めた日・除外資料・出典')}</summary>
    {[previous,current].filter((value):value is AirportFlightMonth=>!!value).map(data=><div key={data.month}><p><strong>{data.month}</strong> · {t(lang,'포함','Included','计入','含めた日')}: {data.includedDays.join(', ')||'—'}</p><p>{t(lang,'제외 날짜','Excluded dates','排除日期','除外日')}: {data.excludedDays.map(item=>`${item.day} (${item.reason})`).join(', ')||'—'} · {t(lang,'취소 제외','Cancellations excluded','取消排除','欠航除外')}: {data.cancelled}</p><p>T1 {data.scopes.T1.total} · {t(lang,'탑승동','Concourse','卫星厅','搭乗棟')} {data.scopes.CONCOURSE.total} · T2 {data.scopes.T2.total} · {t(lang,'터미널 미정','Unconfirmed terminal','航站楼未确认','ターミナル未確認')} {data.scopes.UNKNOWN.total}</p></div>)}
    <p>{t(lang,'인천공항 출국 항공편 저장 기록을 같은 현재 게이트 표로 재분류했습니다. 편수는 사람 수·대기시간이 아니며 완전한 실제 운항 실적을 뜻하지 않습니다. 오늘과 원본·완료 근거가 없는 날짜는 제외했습니다. 목적지 국가와 항공사 등록 국가는 서로 다른 기준이며 승객 국적이 아닙니다.','Retained Incheon departure records are reclassified with the same current gate table. Flight counts are neither people nor waits, and do not certify complete actual operations. Today and dates without raw records or scan completion evidence are excluded. Destination countries and airline registration countries are distinct; neither is passenger nationality.','仁川出境航班保存记录按同一当前登机口表重新分类。班次不是人数或等候时间，也不保证完整实际运营。排除今天及无原始记录或完成依据的日期。目的地与航空公司注册国不同，均非乘客国籍。','仁川の保存出発便記録を同じ現在のゲート表で再分類しました。便数は人数や待ち時間ではなく、完全な実運航実績の証明でもありません。当日と原本・完了根拠のない日を除外します。目的地と航空会社登録国は別基準で、旅客の国籍ではありません。')}</p>
    <p>{response?.data?.sidesVersion} · {response?.data?.destinationsVersion} · {t(lang,'집계 기준일','Prepared cutoff','汇总基准日','集計基準日')}: {response?.data?.asOf} KST · {response?.calculatedAt}</p>
    <a href={`/${lang}/more#collection-status`}>{t(lang,'출처·수집 상태','Sources and collection status','来源与采集状态','出典・収集状況')}</a>
   </details>
  </>}
 </section>;
}
