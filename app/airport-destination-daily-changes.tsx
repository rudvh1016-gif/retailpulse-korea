import {useId,useState} from 'react';
import type {Lang} from './retailpulse-data';
import {ChangeRate} from './change-rate';
import {destinationDailyChanges} from '../lib/airport-destination-daily-changes';
import {previousFlightMonth,type AirportFlightMonth,type MonthScope} from '../lib/airport-monthly-flights';
import {airportMonthLabel} from '../lib/airport-month-labels';
import {domesticDestinationLabel} from '../lib/airport-domestic-labels';
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
const blenderFlags=new Set(['CN','JP','US','VN']);
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
function Flag({country}:{country:string}){
 const src=blenderFlags.has(country)?`/images/airport-flags/${country}.webp`:svgFlags.has(country)?`/images/airport-flags/fallback/${country.toLowerCase()}.svg`:null;
 return src?<img src={src} width="24" height="24" alt="" loading="lazy" decoding="async"/>:<span aria-hidden="true">{country}</span>;
}

/** Shared-scale horizontal bars with the month and exact displayed mean attached. */
export function AirportDestinationDailyChanges({lang,current,previous,scope}:{lang:Lang;current:AirportFlightMonth;previous:AirportFlightMonth|undefined;scope:MonthScope}){
 const [expanded,setExpanded]=useState(false),listId=useId();
 const rows=destinationDailyChanges(current,previous,scope),names=new Intl.DisplayNames([lang],{type:'region'});
 const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{maximumFractionDigits:1});
 const unit=t(lang,'편/일','flights/day','班/日','便/日'),value=(number:number|null)=>number===null?'—':fmt.format(number);
 const previousLabel=airportMonthLabel(previous?.month??previousFlightMonth(current.month),lang),currentLabel=airportMonthLabel(current.month,lang);
 const max=Math.max(1,...rows.flatMap(row=>[row.current??0,row.previous??0]));
 return <section className="airport-country-changes" data-testid="destination-daily-changes">
  <h4>{t(lang,'주요 목적지 국가별 증감','Main destination country changes','主要目的地国家变化','主な目的地の国別増減')}</h4>
  <p>{t(lang,'일평균 편수 · 전월 대비 신장률','Daily mean flights · change from the previous month','日均航班 · 较上月增长率','1日平均の便数・前月比増減率')}</p>
  {rows.length===0?<p role="status">{t(lang,'확인된 목적지 국가가 없습니다. 미정 편수는 전체 표에서 확인할 수 있습니다.','No confirmed destination country. Unconfirmed flights remain in the full table.','没有已确认目的地国家。未确认航班仍列于完整表格。','確認済みの目的地の国がありません。未確認便は全体表で確認できます。')}</p>:<ul id={listId}>
   {(expanded?rows:rows.slice(0,8)).map(row=><li key={row.country} data-country={row.country}>
    <div className="airport-country-heading"><h5>{row.country==='KR'?domesticDestinationLabel(lang):<><Flag country={row.country}/> {names.of(row.country)??row.country}</>}</h5><ChangeRate value={row.percent} lang={lang}/></div>
    <div className="airport-country-bars">
     {[{label:previousLabel,number:row.previous},{label:currentLabel,number:row.current}].map(({label,number},index)=><div key={index} className="airport-country-bar-row" data-period={index?'current':'previous'}>
      <span className="airport-country-bar-month">{label}</span>
      <span className="airport-country-bar-track" aria-hidden="true"><span style={{width:`${(number??0)/max*100}%`}}/></span>
      <strong>{value(number)}</strong>
     </div>)}
    </div>
    <p className="airport-country-side-rates" data-testid="country-side-rates">{(['EAST','CENTER','WEST'] as const).map(side=><span key={side}>{({EAST:t(lang,'동편','East','东侧','東側'),CENTER:t(lang,'중앙','Centre','中央','中央'),WEST:t(lang,'서편','West','西侧','西側')})[side]} <ChangeRate value={row.sides[side].percent} lang={lang}/></span>)}</p>
    <details><summary>{t(lang,'구역별 상세','Zone details','区域详情','区域の詳細')}</summary>
     {row.previous===0&&<p>{t(lang,'전월 0편/일 · 신장률 계산 안 함','Previous mean 0 flights/day · rate not calculated','上月0班/日 · 不计算增长率','前月0便/日・増減率は未計算')}</p>}
     {(['EAST','CENTER','WEST','UNVERIFIED'] as const).map(side=><p key={side}>{({EAST:t(lang,'동편','East','东侧','東側'),CENTER:t(lang,'중앙','Centre','中央','中央'),WEST:t(lang,'서편','West','西侧','西側'),UNVERIFIED:t(lang,'위치 미확인','Location unconfirmed','位置未确认','位置未確認')})[side]}: <strong>{value(row.sides[side].previous)} → {value(row.sides[side].current)}</strong> {unit} · <ChangeRate value={row.sides[side].percent} lang={lang}/></p>)}
    </details>
   </li>)}
  </ul>}
  {rows.length>8&&<button type="button" className="airport-country-toggle" aria-expanded={expanded} aria-controls={listId} onClick={()=>setExpanded(open=>!open)}>{expanded?t(lang,'접기','Show less','收起','折りたたむ'):t(lang,'더 보기','Show more','展开更多','もっと見る')}</button>}
  <p className="prep-note">{t(lang,'실제 포함 날짜 기준 · 비어 있는 날짜는 0으로 채우지 않음 · 항공편 수이며 승객 국적이 아님','Actually included dates · missing dates are not filled with zeros · flights, not passenger nationality','按实际计入日期 · 缺失日期不补零 · 航班数，不代表旅客国籍','実際に含めた日付が基準・欠測日は0にしません・便数であり旅客の国籍ではありません')}</p>
 </section>;
}
