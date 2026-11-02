'use client';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
import {useState} from 'react';
import {usePreparedMonth} from './use-prepared-month';
import {useCurrentFlightPeriod} from './use-current-flight-period';
import {currentFlightPeriodCopy} from './current-flight-period-copy';
import type {Lang,Terminal} from './retailpulse-data';
import {ChangeRate} from './change-rate';
import {AirportMonthSourceSummary} from './airport-month-source-summary';
import {AirportDestinationDailyChanges} from './airport-destination-daily-changes';
import {MONTH_SCOPES,monthlyCategoryKeys,monthlyMetric,previousFlightMonth,type AirportFlightMonth,type AirportMonthlyRollups,type MonthCounts,type MonthScope} from '../lib/airport-monthly-flights';
import {airportMonthComparisonBasis,airportMonthLabel} from '../lib/airport-month-labels';
import {domesticDestinationLabel} from '../lib/airport-domestic-labels';
import {lookupAirline} from '../lib/airline-country';
import {CountryFlag} from './airport-country-flag';
import {AIRPORT_AIRLINE_OVERRIDES,AIRPORT_AIRLINE_LOGO_EXTENSIONS} from '../lib/airport-airline-official';
import './airport-monthly-flights.css';
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
const AIRLINE_LOGOS=new Set(['3U','5J','5Y','7C','AA','AC','AF','AI','AK','AM','AY','BI','BR','BX','CA','CI','CX','CZ','D7','DL','DV','EK','ET','EY','FM','GA','HU','HX','HY','JQ','KC','KE','KL','LH','LJ','LO','LX','MF','MH','MU','NX','OM','OZ','PR','QR','QV','RS','SC','SK','SQ','T5','TG','TK','TW','UA','UL','UO','VN','VS','WS','ZE','ZH']);
interface Reply {status:string;month:string;months:string[];calculatedAt:string|null;lastPreparedAt?:string|null;data:AirportMonthlyRollups|null}
/** The chosen month and its read. The airport model owns it, so the block can
 * move from the map's loading slot to the loaded layout without a second read. */
export function useAirportMonthRequest(date:string|null){
 // A choice belongs to the date it was made on: any date change starts from the new date's month.
 const [chosen,choose]=useState<{date:string;month:string}|null>(null);
 if(chosen&&chosen.date!==date)choose(null);
 const month=date?chosen?.date===date?chosen.month:date.slice(0,7):'';
 const setChosen=(value:string)=>{if(date)choose({date,month:value});};
 const request=usePreparedMonth<Reply>(month,`/api/live/airport-months?month=${encodeURIComponent(month)}`,month,date??'');
 const previous=request.reply?.data?.months.find(value=>value.month===previousFlightMonth(month||'2000-01'));
 const stored=request.reply?.data?.months.find(value=>value.month===month);
 const provisional=useCurrentFlightPeriod(date,month,previous,request.reply?.status==='READY'&&Boolean(previous?.includedDays.length)&&!stored?.includedDays.length);
 return {month,setChosen,request,provisional};
}
export function AirportMonthlyFlights({lang,terminal,date,monthly,showCountryRanking=true,showSummary=true}:{lang:Lang;terminal:'all'|Terminal|'CONCOURSE';date:string;monthly?:ReturnType<typeof useAirportMonthRequest>;showCountryRanking?:boolean;showSummary?:boolean}){
 const own=useAirportMonthRequest(monthly?null:date);
 const {month,setChosen,request,provisional}=monthly??own;
 const scope:MonthScope=terminal==='all'?'ALL':terminal,response=request.reply;
 const storedCurrent=provisional.active?provisional.value?.period:response?.data?.months.find(value=>value.month===month),storedPrevious=response?.data?.months.find(value=>value.month===previousFlightMonth(month??''));
 const current=scope==='T1'?mainBuildingMonth(storedCurrent):storedCurrent,previous=scope==='T1'?mainBuildingMonth(storedPrevious):storedPrevious;
 const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{maximumFractionDigits:1});
 const countryNames=new Intl.DisplayNames([lang],{type:'region'});
 const value=(number:number|null)=>number===null?'—':fmt.format(number);
 const percentage=(number:number|null)=>number===null?'—':new Intl.NumberFormat(lang,{maximumFractionDigits:0}).format(number)+'%';
 const labels:Record<MonthScope,string>={ALL:t(lang,'전체','All','全部','全体'),T1:t(lang,'T1 · 본관','T1 · main building','T1 · 主楼','T1 · 本館'),T2:'T2',CONCOURSE:t(lang,'탑승동','Concourse','卫星厅','搭乗棟'),UNKNOWN:t(lang,'터미널 미정','Terminal unconfirmed','航站楼未确认','ターミナル未確認')};
 const selected:MonthScope=MONTH_SCOPES.includes(scope)?scope:'ALL';
 const metric=(key:(counts:MonthCounts)=>number)=>monthlyMetric(current,previous,selected,key);
 const total=metric(counts=>counts.total);
 const provisionalCopy=currentFlightPeriodCopy(lang,date,previous?.includedDays.length??0,provisional.value?.collectedAt??null);
 const comparisonBasis=provisional.active?provisionalCopy.basis:current?airportMonthComparisonBasis(current,previous,previousFlightMonth(month),lang):null;
 const previousLabel=airportMonthLabel(previous?.month??previousFlightMonth(month),lang),currentLabel=provisional.active?provisionalCopy.currentLabel:airportMonthLabel(month,lang);
 const period=(data:AirportFlightMonth|undefined,label:string)=><p className="airport-month-period">{label}: {data?<><strong>{data.from} ~ {data.through??'—'}</strong> · {t(lang,'집계','Included','计入','集計')} <strong>{data.includedDays.length}/{data.eligibleDays}</strong> {t(lang,'일','days','天','日')}</>:t(lang,'비교 자료 없음','No comparison data','无比较资料','比較資料なし')}</p>;
 const row=(label:React.ReactNode,key:(counts:MonthCounts)=>number,rowKey?:string,unconfirmed?:{current:boolean;previous:boolean})=>{const original=metric(key),pair={...original,current:unconfirmed?.current?null:original.current,previous:unconfirmed?.previous?null:original.previous,percent:unconfirmed?.current||unconfirmed?.previous?null:original.percent};return <tr key={rowKey??String(label)} data-category={rowKey}><th scope="row">{label}</th><td>{value(pair.previous)}</td><td>{value(pair.current)}</td><td><ChangeRate value={pair.percent} lang={lang}/></td></tr>;};
 const share=(data:AirportFlightMonth|undefined,key:(counts:MonthCounts)=>number)=>data?.includedDays.length&&data.scopes[selected].total>0?key(data.scopes[selected])/data.scopes[selected].total*100:null;
 const shareRow=(label:string,key:(counts:MonthCounts)=>number)=>{const now=share(current,key),before=share(previous,key);return <tr key={label}><th scope="row">{label}</th><td>{percentage(before)}</td><td>{percentage(now)}</td><td><ChangeRate value={now!==null&&before!==null?now-before:null} lang={lang} unit="%p"/></td></tr>;};
 const eastWest=(data:AirportFlightMonth|undefined)=>{const counts=data?.scopes[selected],denominator=counts?counts.sides.EAST+counts.sides.WEST:0;return denominator?`${percentage(counts!.sides.EAST/denominator*100)} (${fmt.format(denominator)})`:'—';};
 const emptyMessage=provisional.active?(provisional.pending||request.pending?provisionalCopy.loading:provisionalCopy.unavailable):request.pending&&!response?t(lang,'월별 집계를 불러오는 중…','Loading monthly counts…','正在读取月度统计…','月別集計を読み込み中…'):request.failed?t(lang,'월 집계 연결이 일시적으로 지연됐습니다.','Monthly counts are temporarily unavailable.','月度统计连接暂时延迟。','月別集計の接続が一時的に遅延しています。'):response?.status==='PENDING_UPDATE'?t(lang,'기존 집계의 업데이트를 기다리고 있습니다. 다음 정기 작업에서 같은 기준으로 다시 집계합니다.','The stored count awaits an update in the next regular job.','现有统计等待下次定期任务更新。','保存集計は次の定期処理で更新予定です。'):t(lang,'이 월의 집계 자료가 아직 없습니다. 없는 날짜는 0으로 계산하지 않습니다.','No prepared count for this month yet. Missing dates are not counted as zero.','本月暂无汇总，缺失日期不计为0。','この月の集計はまだありません。欠測日は0として数えません。');
 const monthControl=<label>{t(lang,'비교 월','Comparison month','比较月份','比較する月')} <select value={month??''} onChange={event=>setChosen(event.target.value)}>{[...new Set([...(month?[month]:[]),...(response?.months??[])])].sort().reverse().map(value=><option key={value}>{value}</option>)}</select></label>;
 const table=(rows:React.ReactNode,shares=false,showBasis=false,zones=false)=><div className="airport-month-table" data-testid={zones?'airport-month-zones':undefined}>{zones&&<h4 className="airport-month-zone-title">{t(lang,'구역별 항공편 · 전월 비교','Flights by zone · previous month comparison','各区域航班 · 上月比较','区画別の便数・前月比較')}</h4>}{zones&&!showSummary&&<div className="airport-month-zone-controls">{monthControl}</div>}<table><caption>{shares&&provisional.active&&<span className="airport-month-basis" data-testid="current-share-denominators">{t(lang,'분모','Denominators','分母','分母')}: {previousLabel} {value(previous?.scopes[selected].total??null)} / {currentLabel} {value(current?.scopes[selected].total??null)} {t(lang,'편','flights','班','便')} · </span>}{showBasis&&<span className="airport-month-basis">{comparisonBasis}</span>}{!shares&&provisional.active?provisionalCopy.caption:shares?t(lang,'선택 범위의 전체 집계 편수 중 비중','Share of all counted flights in this scope','所选范围全部计入航班占比','選択範囲の集計便全体に対する割合'):t(lang,'일평균 편수 · 편/일','Daily mean · flights/day','日均航班 · 班/日','1日平均 · 便/日')}</caption><colgroup><col/><col className="airport-month-value-column"/><col className="airport-month-value-column"/><col className="airport-month-rate-column"/></colgroup><thead><tr><th scope="col">{t(lang,'구분','Category','类别','項目')}</th><th scope="col">{previousLabel}</th><th scope="col">{currentLabel}</th><th scope="col">{t(lang,'증감','Change','变化','変化')}</th></tr></thead><tbody>{rows}</tbody></table></div>;
 const breakdown=(kind:'airlines'|'registrationCountries'|'destinationCountries',title:string)=><details id={kind==='destinationCountries'?'airport-month-destinations':undefined} data-testid={`month-list-${kind}`}><summary>{title}</summary>{provisional.active&&<p className="prep-note">{provisionalCopy.classification}</p>}{kind==='airlines'&&<p className="airport-month-airline-note">{t(lang,'항공사 이름·국가는 현재 공항 안내와 등록자료 기준 · 승객 국적 아님','Names and countries use current airport information and registration records, not passenger nationality','名称和国家依据当前机场指南与注册资料，并非旅客国籍','名称・国は現在の空港案内と登録資料に基づき、旅客の国籍ではありません')}</p>}{table(monthlyCategoryKeys(current,previous,selected,kind).map(key=>{
  const official=kind==='airlines'?AIRPORT_AIRLINE_OVERRIDES[key]:undefined,name=official?.name??current?.airlineNames[key]??previous?.airlineNames[key],country=kind==='airlines'?(official?.country??lookupAirline(key)?.country):null,ext=AIRPORT_AIRLINE_LOGO_EXTENSIONS[key]??(key==='KE'?'svg':'png');
  return row(key==='UNKNOWN'?t(lang,'미정','Unconfirmed','未确认','未確認'):kind==='airlines'?<span className="airport-month-airline">{country&&<span className="airport-month-airline-country"><CountryFlag code={country} size={18}/><small>{countryNames.of(country)??country}</small></span>}{(AIRLINE_LOGOS.has(key)||AIRPORT_AIRLINE_LOGO_EXTENSIONS[key])&&<img className="airport-month-airline-logo" src={`/images/airline-logos/${key}.${ext}`} alt="" width="40" height="20" loading="lazy" decoding="async"/>}<span className="airport-month-airline-code" translate="no">{key}</span>{name&&<span className="airport-month-airline-name">{name}</span>}</span>:kind==='destinationCountries'&&key==='KR'?domesticDestinationLabel(lang):countryNames.of(key)??key,counts=>counts[kind][key]??0,key,provisional.active&&key!=='UNKNOWN'?{current:current?.scopes[selected][kind][key]===undefined&&(current?.scopes[selected][kind].UNKNOWN??0)>0,previous:previous?.scopes[selected][kind][key]===undefined&&(previous?.scopes[selected][kind].UNKNOWN??0)>0}:undefined);
 }),false,true)}</details>;
 return <section id="airport-monthly-flights" className="airport-month-flights" data-testid="airport-month-flights" aria-label={t(lang,'월별 출국 항공편 구성','Monthly departure mix','月度出境航班构成','月別出発便の構成')}>
  {showSummary&&<h3 data-heading="subsection"><span className="heading-marker" aria-hidden="true"/>{provisional.active?provisionalCopy.heading:!showCountryRanking&&(lang==='ko'||lang==='zh'||lang==='en')?(lang==='zh'?'各航站楼航班 · 较上月日均':lang==='en'?'Terminal flights · daily mean vs previous month':'터미널별 항공편 · 전월 대비 일평균'):t(lang,'국가별 항공편 · 전월 대비 일평균','Flights by country · daily mean vs previous month','各国航班 · 较上月日均','国別の便数・前月比の1日平均')} <small>{labels[selected]}</small></h3>}
  {(selected==='T1'||selected==='CONCOURSE')&&<details className="methodology-details" data-testid="monthly-building-note"><summary>{{ko:'집계 기준 보기',en:'Counting methodology',zh:'查看统计口径',ja:'集計基準を見る'}[lang]}</summary><p className="prep-note">{{ko:'탑승동 이용객도 T1에서 체크인·출국수속 후 이동합니다. 항공편은 탑승구 기준으로 본관과 분리하며, T1 대기·공식 여객 통계는 수속장·공식 터미널 기준입니다.',en:'Concourse passengers check in and complete departure formalities at T1 before moving to the concourse. Flights are split by boarding building; T1 waits and official passenger statistics retain their departure-hall and official terminal scope.',zh:'登机楼旅客也在T1办理值机和出境手续后前往登机楼。航班按登机建筑分开；T1等候和官方旅客统计保留出境大厅与官方航站楼口径。',ja:'搭乗棟の利用客もT1でチェックイン・出国手続き後に移動します。便は搭乗建物別に分け、T1の待ち時間・公式旅客統計は出国場・公式ターミナルの範囲を維持します。'}[lang]}</p></details>}
  {showSummary&&monthControl}
  {!showSummary&&!current&&<div className="airport-month-zone-controls">{monthControl}</div>}
  {!current?<div className="airport-month-state" role="status"><p>{emptyMessage}</p>{!provisional.active&&request.attempt<3?<small>{t(lang,'잠시 후 자동으로 다시 확인합니다.','A bounded automatic check follows shortly.','稍后自动再次检查。','まもなく自動で再確認します。')}</small>:<button type="button" onClick={provisional.active?provisional.retry:request.retry}>{t(lang,'자료 다시 확인','Check data again','再次检查资料','資料を再確認')}</button>}{response?.lastPreparedAt&&<small>{t(lang,'이전 집계 시각','Previous calculation','之前汇总时间','前の集計時刻')}: {response.lastPreparedAt}</small>}<a href={`/${lang}/more#collection-status`}>{t(lang,'수집 상태 보기','Collection status','查看采集状态','収集状況')}</a></div>:<>
   {(request.pending||request.failed||request.retained)&&<p className="airport-month-state" role="status">{t(lang,'마지막 확인 집계를 표시합니다.','Showing the last confirmed count.','显示上次确认的汇总。','最後に確認した集計を表示しています。')} {response?.data?.asOf} KST · {response?.calculatedAt}</p>}
   {showSummary&&<><p className="airport-month-basis" data-testid="airport-month-basis">{comparisonBasis}</p>{provisional.active&&<p className="airport-month-source-summary" data-testid="current-period-collected">{provisionalCopy.collected}</p>}</>}
   {showSummary&&<p className="airport-month-total">{t(lang,'출국편','Departures','出境航班','出発便')}: <strong>{value(total.previous)} → {value(total.current)}</strong> {provisional.active?provisionalCopy.units:t(lang,'편/일','flights/day','班/日','便/日')} · <ChangeRate value={total.percent} lang={lang}/></p>}
   {showCountryRanking&&<AirportDestinationDailyChanges lang={lang} current={current} previous={previous} scope={selected} comparison={provisional.active?{currentLabel:provisionalCopy.currentLabel,barLabel:provisionalCopy.shortLabel,basis:provisionalCopy.basis,countries:provisional.value?.comparableCountries[selected as 'ALL'|'T1'|'T2'|'CONCOURSE']??[]}:undefined}/>}
   {table(([['EAST',t(lang,'동편','East','东侧','東側')],['WEST',t(lang,'서편','West','西侧','西側')],['CENTER',t(lang,'중앙','Centre','中央','中央')],['UNVERIFIED',t(lang,'구역 미정','Side unconfirmed','区域未确认','区画未確認')]] as const).map(([key,label])=>row(<><span className="airport-zone-symbol" aria-hidden="true">{({EAST:'→',WEST:'←',CENTER:'◆',UNVERIFIED:'·'})[key]}</span>{label}</>,counts=>counts.sides[key],key)),false,true,true)}
   <details><summary>{t(lang,'동편·서편·중앙 항공편 비율','East, west and centre flight shares','东侧、西侧及中央航班占比','東・西・中央の便数割合')}</summary>
    <p>{t(lang,'아래 표: 선택 범위의 전체 항공편을 100%로 계산하며 중앙·위치 미확인을 포함합니다. T1은 본관 항공편만 집계합니다.','Table: all counted flights in the selected scope equal 100%, including centre and unverified. T1 counts main-building flights only.','下表以所选范围全部航班为100%，包含中央及位置未确认。T1仅计主楼航班。','下表は選択範囲の全便を100%とし、中央・位置未確認を含みます。T1は本館の便のみです。')}</p>
    <p>{t(lang,'동편·서편만 비교: 동편+서편을 100%로 계산합니다. 중앙·위치 미확인은 제외합니다.','East/west-only comparison: east + west equal 100%; centre and unverified are excluded.','仅比较东西侧：东＋西为100%，不含中央及位置未确认。','東西のみの比較は東＋西を100%とし、中央・位置未確認を除きます。')}</p>
    <p>{t(lang,'동편·서편 중 동편 비율 (계산에 포함된 항공편 수)','East share of east/west flights (flights included in this calculation)','东西侧航班中东侧占比（计算所含航班数）','東西便のうち東の割合（計算に含めた便数）')}: {previous?.month??'—'} {eastWest(previous)} → {currentLabel} {eastWest(current)}</p>
    {table((['EAST','WEST','CENTER','UNVERIFIED'] as const).map(key=>shareRow(({EAST:t(lang,'동편','East','东侧','東側'),WEST:t(lang,'서편','West','西侧','西側'),CENTER:t(lang,'중앙','Centre','中央','中央'),UNVERIFIED:t(lang,'위치 미확인','Location unconfirmed','位置未确认','位置未確認')})[key],counts=>counts.sides[key])),true)}
   </details>
   {breakdown('destinationCountries',t(lang,'목적지 국가·지역 전체','All destination countries / territories','全部目的地国家／地区','目的地の国・地域すべて'))}
   {breakdown('airlines',t(lang,'운항 항공사 전체','All operating airlines','全部运营航空公司','運航航空会社すべて'))}
   {breakdown('registrationCountries',t(lang,'항공사 등록 국가 전체','All airline registration countries','全部航空公司注册国','航空会社の登録国すべて'))}
   <details><summary>{t(lang,'포함 날짜·제외 자료·출처','Included dates, exclusions and sources','计入日期、排除资料及来源','含めた日・除外資料・出典')}</summary>
   <p>{t(lang,'전월 평균이 0이거나 비교 자료가 없으면 변화율은 — 입니다.','Change is — when the previous mean is zero or data is unavailable.','上月均值为0或无比较资料时，变化率为—。','前月平均が0または比較資料がない場合、変化率は—です。')}</p>
    {period(previous,previousFlightMonth(month))}{period(current,month)}
    <AirportMonthSourceSummary lang={lang} calculatedAt={response?.calculatedAt} basisLabel={provisional.active?t(lang,'전월 저장 집계 시각','Previous-month preparation time','上月保存汇总时间','前月の保存集計時刻'):undefined}/>
    {[previous,current].filter((value):value is AirportFlightMonth=>!!value).map(data=><div key={data.month}><p className="airport-month-coverage-summary"><strong>{data.month}</strong> · {t(lang,'누락·제외','Missing / excluded','缺失／排除','欠測・除外')} {data.excludedDays.length}{t(lang,'일',' days','天','日')} · {t(lang,'취소 제외','Cancellations excluded','取消排除','欠航除外')} {data.cancelled}</p></div>)}
     <details className="airport-month-source-details"><summary>{t(lang,'원 날짜 목록·출처 보기','Original dates and sources','原始日期及来源','元の日付一覧・出典')}</summary>
     {[previous,current].filter((value):value is AirportFlightMonth=>!!value).map(data=><div key={data.month}><p><strong>{data.month}</strong> · {t(lang,'포함','Included','计入','含めた日')}: {data.includedDays.join(', ')||'—'}</p><p>{t(lang,'제외 날짜','Excluded dates','排除日期','除外日')}: {data.excludedDays.map(item=>`${item.day} (${item.reason})`).join(', ')||'—'} · {t(lang,'취소 제외','Cancellations excluded','取消排除','欠航除外')}: {data.cancelled}</p><p>{selected==='T1'?t(lang,'T1 본관','T1 main building','T1主楼','T1本館'):t(lang,'T1(탑승동 포함)','T1 (including concourse)','T1（含卫星厅）','T1（搭乗棟含む）')} {data.scopes.T1.total} · {t(lang,'탑승동','Concourse','卫星厅','搭乗棟')} {data.scopes.CONCOURSE.total} · T2 {data.scopes.T2.total} · {t(lang,'터미널 미정','Unconfirmed terminal','航站楼未确认','ターミナル未確認')} {data.scopes.UNKNOWN.total}</p></div>)}
    {provisional.active&&<p className="prep-note">{provisionalCopy.basis} {provisionalCopy.collected}</p>}
    {!provisional.active&&<p>{t(lang,'인천공항 출국 항공편 저장 기록을 같은 현재 게이트 표로 재분류했습니다. 편수는 사람 수·대기시간이 아니며 완전한 실제 운항 실적을 뜻하지 않습니다. 오늘과 원본·완료 근거가 없는 날짜는 제외했습니다. 목적지 국가와 항공사 등록 국가는 서로 다른 기준이며 승객 국적이 아닙니다.','Retained Incheon departure records are reclassified with the same current gate table. Flight counts are neither people nor waits, and do not certify complete actual operations. Today and dates without raw records or scan completion evidence are excluded. Destination countries and airline registration countries are distinct; neither is passenger nationality.','仁川出境航班保存记录按同一当前登机口表重新分类。班次不是人数或等候时间，也不保证完整实际运营。排除今天及无原始记录或完成依据的日期。目的地与航空公司注册国不同，均非乘客国籍。','仁川の保存出発便記録を同じ現在のゲート表で再分類しました。便数は人数や待ち時間ではなく、完全な実運航実績の証明でもありません。当日と原本・完了根拠のない日を除外します。目的地と航空会社登録国は別基準で、旅客の国籍ではありません。')}</p>}
    <p>{response?.data?.sidesVersion} · {response?.data?.destinationsVersion} · {t(lang,'집계 기준일','Prepared cutoff','汇总基准日','集計基準日')}: {response?.data?.asOf} KST · {response?.calculatedAt}</p>
    <a href={`/${lang}/more#collection-status`}>{t(lang,'출처·수집 상태','Sources and collection status','来源与采集状态','出典・収集状況')}</a>
    </details>
   </details>
  </>}
 </section>;
}

