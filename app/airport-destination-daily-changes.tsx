import type {Lang} from './retailpulse-data';
import {ChangeRate} from './change-rate';
import {destinationDailyChanges} from '../lib/airport-destination-daily-changes';
import type {AirportFlightMonth,MonthScope} from '../lib/airport-monthly-flights';
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
const blenderFlags=new Set(['CN','JP','US','VN']);
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
function Flag({country}:{country:string}){
 const src=blenderFlags.has(country)?`/images/airport-flags/${country}.webp`:svgFlags.has(country)?`/images/airport-flags/fallback/${country.toLowerCase()}.svg`:null;
 return src?<img src={src} width="24" height="24" alt="" loading="lazy" decoding="async"/>:<span aria-hidden="true">{country}</span>;
}

/** Lightweight static extruded bars, with all numbers in accessible text. */
export function AirportDestinationDailyChanges({lang,current,previous,scope}:{lang:Lang;current:AirportFlightMonth;previous:AirportFlightMonth|undefined;scope:MonthScope}){
 const rows=destinationDailyChanges(current,previous,scope).slice(0,6),names=new Intl.DisplayNames([lang],{type:'region'});
 const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{maximumFractionDigits:1});
 const unit=t(lang,'편/일','flights/day','班/日','便/日'),value=(number:number|null)=>number===null?'—':fmt.format(number);
 const max=Math.max(1,...rows.flatMap(row=>[row.current??0,row.previous??0]));
 return <section className="airport-country-changes" data-testid="destination-daily-changes">
  <h4>{t(lang,'주요 목적지 국가별 증감','Main destination country changes','主要目的地国家变化','主な目的地の国別増減')}</h4>
  <p>{t(lang,'일평균 편수 · 전월 대비 신장률','Daily mean flights · change from the previous month','日均航班 · 较上月增长率','1日平均の便数・前月比増減率')}</p>
  <p className="prep-note">{previous?.month??'—'} <strong>{previous?.includedDays.length??'—'}</strong>{t(lang,'일',' days','天','日')} → {current.month} <strong>{current.includedDays.length}</strong>{t(lang,'일',' days','天','日')} · {unit}</p>
  {rows.length===0?<p role="status">{t(lang,'확인된 목적지 국가가 없습니다. 미정 편수는 전체 표에서 확인할 수 있습니다.','No confirmed destination country. Unconfirmed flights remain in the full table.','没有已确认目的地国家。未确认航班仍列于完整表格。','確認済みの目的地の国がありません。未確認便は全体表で確認できます。')}</p>:<ul>
   {rows.map(row=><li key={row.country} data-country={row.country}>
    <div className="airport-country-heading"><h5><Flag country={row.country}/> {names.of(row.country)??row.country}</h5><ChangeRate value={row.percent} lang={lang}/></div>
    <p className="airport-country-side-rates" data-testid="country-side-rates">{(['EAST','CENTER','WEST'] as const).map((side,index)=><span key={side}>{index>0?' · ':''}{({EAST:t(lang,'동편','East','东侧','東側'),CENTER:t(lang,'중앙','Centre','中央','中央'),WEST:t(lang,'서편','West','西侧','西側')})[side]} <ChangeRate value={row.sides[side].percent} lang={lang}/></span>)}</p>
    <p><span>{previous?.month??t(lang,'전월','Previous','上月','前月')}</span> <strong>{value(row.previous)}</strong> → <span>{current.month}</span> <strong>{value(row.current)}</strong> {unit}</p>
    <svg viewBox="0 0 110 36" aria-hidden="true" className="airport-country-bars">
     {[row.previous,row.current].map((number,index)=>{if(number===null)return null;const width=number/max*100,y=4+index*16;return <g key={index} fill={index?'#b8dce9':'#e2eded'}><rect x="0" y={y} width={width} height="9"/><path d={`M0 ${y} L4 ${y-3} L${width+4} ${y-3} L${width} ${y}Z`} fill={index?'#d9eef5':'#f2f7f7'}/>{width>0&&<path d={`M${width} ${y} L${width+4} ${y-3} L${width+4} ${y+6} L${width} ${y+9}Z`} fill={index?'#8dbccc':'#b9d5ce'}/>}</g>;})}
    </svg>
    {row.previous===0&&<p className="prep-note">{t(lang,'전월 0편/일 · 신장률 계산 안 함','Previous mean 0 flights/day · rate not calculated','上月0班/日 · 不计算增长率','前月0便/日・増減率は未計算')}</p>}
    <details><summary>{t(lang,'구역별 일평균·미확인','Daily means by zone and unconfirmed','各区域日均与未确认','区域別の1日平均・未確認')}</summary>{(['EAST','CENTER','WEST','UNVERIFIED'] as const).map(side=><p key={side}>{({EAST:t(lang,'동편','East','东侧','東側'),CENTER:t(lang,'중앙','Centre','中央','中央'),WEST:t(lang,'서편','West','西侧','西側'),UNVERIFIED:t(lang,'위치 미확인','Location unconfirmed','位置未确认','位置未確認')})[side]}: <strong>{value(row.sides[side].previous)} → {value(row.sides[side].current)}</strong> {unit} · <ChangeRate value={row.sides[side].percent} lang={lang}/></p>)}</details>
   </li>)}
  </ul>}
  <p className="prep-note">{t(lang,'실제 포함 날짜 기준 · 비어 있는 날짜는 0으로 채우지 않음 · 항공편 수이며 승객 국적이 아님','Actually included dates · missing dates are not filled with zeros · flights, not passenger nationality','按实际计入日期 · 缺失日期不补零 · 航班数，不代表旅客国籍','実際に含めた日付が基準・欠測日は0にしません・便数であり旅客の国籍ではありません')}</p>
 </section>;
}
