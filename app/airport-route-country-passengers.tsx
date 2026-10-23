'use client';
import {DisclosureLabel} from './disclosure-label';
import {createContext,useContext,useMemo,type ReactNode} from 'react';
/** Optional approval-preview relocation; default preserves the production table. */
export const RoutePassengerPlacement=createContext<ReactNode>(null);
import type {Lang} from './retailpulse-data';
import {ConciseExplainer} from './concise-explainer';
import {ChangeRate} from './change-rate';
import type {AirportStatsRow} from '../lib/airport-monthly-stats-read';
import {useAirportPassengerStats} from './airport-passenger-stats-client';
import './airport-monthly-flights.css';
import './airport-route-country-passengers.css';
const t=(lang:Lang,ko:string,en:string,zh:string,ja:string)=>({ko,en,zh,ja})[lang];
const VISIBLE=8;
const sculptedFlags=new Set(['CN','JP','US','VN']);
const flatFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
/** Provider country names (as published) to ISO region codes, so other languages can name them.
 * A name no locale reads back stays exactly as the provider wrote it. */
function regionCodes():Map<string,string>{
 const codes=new Map<string,string>();
 const names=['ko','en'].map(locale=>new Intl.DisplayNames([locale],{type:'region'}));
 for(const code of [...sculptedFlags,...flatFlags]){
  for(const name of names){const label=name.of(code);if(label&&label!==code&&!codes.has(label))codes.set(label,code);}
 }
 return codes;
}
/** 15095071: official monthly departures by the country of each flight's route.
 * Airport-wide and published monthly, so it sits beside the flight counts as its own table, never as a ratio of them. */
export function AirportRouteCountryPassengers({lang,month,terminal}:{lang:Lang;month:string;terminal:string}){
 const {reply,failed}=useAirportPassengerStats(month);
 const codes=useMemo(()=>regionCodes(),[]);
 const replacement=useContext(RoutePassengerPlacement);
 if(replacement)return <>{replacement}</>;
 const current=reply?.current.ROUTE_COUNTRY_PASSENGERS,previous=reply?.previous.ROUTE_COUNTRY_PASSENGERS;
 const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{maximumFractionDigits:0});
 const names=new Intl.DisplayNames([lang],{type:'region'});
 const label=(row:AirportStatsRow)=>{const code=codes?.get(row.label);return code?names.of(code)??row.label:row.label;};
 const before=new Map((previous?.rows??[]).filter(row=>!row.aggregate).map(row=>[row.label,row.departures]));
 const rows=(current?.rows??[]).filter(row=>!row.aggregate&&row.departures!==null).sort((a,b)=>(b.departures??0)-(a.departures??0));
 const scale=Math.max(1,...rows.map(row=>Math.max(row.departures??0,before.get(row.label)??0)));
 const line=(row:AirportStatsRow)=>{const prior=before.get(row.label)??null,code=codes.get(row.label),flag=code&&sculptedFlags.has(code)?`/images/airport-flags/${code}.webp`:code&&flatFlags.has(code)?`/images/airport-flags/fallback/${code.toLowerCase()}.svg`:null;return <tr key={row.label}><th scope="row"><span className="route-country-name">{flag&&<img src={flag} alt="" width="18" height="18" loading="lazy" decoding="async"/>}{label(row)}</span><span className="route-country-comparison" aria-hidden="true">{prior!==null&&<i style={{width:`${prior/scale*100}%`}}/>}<b style={{width:`${row.departures!/scale*100}%`}}/></span></th><td>{prior===null?'—':fmt.format(prior)}</td><td>{fmt.format(row.departures!)}</td><td><ChangeRate value={prior?((row.departures!-prior)/prior)*100:null} lang={lang}/></td></tr>;};
 const table=(body:React.ReactNode)=><div className="airport-month-table"><table><caption>{t(lang,'출발 여객 · 명/월','Departing passengers · people/month','出发旅客 · 人/月','出発旅客 · 人/月')}</caption><colgroup><col/><col className="airport-month-value-column"/><col className="airport-month-value-column"/><col className="airport-month-rate-column"/></colgroup><thead><tr><th scope="col">{t(lang,'노선 국가','Route country','航线国家','路線の国')}</th><th scope="col">{reply?.previousMonth??'—'}</th><th scope="col">{reply?.month}</th><th scope="col">{t(lang,'증감','Change','变化','変化')}</th></tr></thead><tbody>{body}</tbody></table></div>;
 return <section id="airport-route-passengers" className="airport-route-passengers" data-testid="airport-route-passengers" aria-label={t(lang,'노선 국가별 출발 여객','Departing passengers by route country','各航线国家出发旅客','路線の国別の出発旅客')}>
  <div className="route-passenger-heading"><div><h4>{t(lang,'노선 국가별 출발 여객 · 공식 월 실적','Departing passengers by route country · official monthly results','各航线国家出发旅客 · 官方月度实绩','路線の国別の出発旅客・公式月次実績')}</h4>{current&&<p className="route-passenger-period">{reply?.previousMonth??'—'} → {reply?.month} · {t(lang,'공항 전체 · 명/월','Airport-wide · people/month','全机场 · 人/月','空港全体・人/月')}</p>}</div><img className="route-passenger-symbol" src="/visuals/route-passengers/aircraft-320.webp" width="96" height="72" alt="" loading="lazy" decoding="async"/></div>
  {!reply?<p className="airport-month-state" role="status">{failed?t(lang,'공식 여객 통계 연결이 일시적으로 지연됐습니다.','Official passenger statistics are temporarily unavailable.','官方旅客统计连接暂时延迟。','公式旅客統計の接続が一時的に遅延しています。'):t(lang,'공식 여객 통계를 불러오는 중…','Loading official passenger statistics…','正在读取官方旅客统计…','公式旅客統計を読み込み中…')}</p>
  :!current||!rows.length?<p className="airport-month-state" role="status">{t(lang,'이 월까지 공개된 공식 여객 통계가 아직 없습니다. 없는 값은 0으로 표시하지 않습니다.','No official passenger statistics are published up to this month yet. Missing values are never shown as zero.','截至本月尚无公开的官方旅客统计，缺失值不显示为0。','この月までに公表された公式旅客統計はまだありません。欠測値は0と表示しません。')}</p>
  :<>
   {reply.month!==month&&<p className="airport-month-basis">{t(lang,`인천공항이 공개한 가장 최근 월인 ${reply.month} 실적입니다.`,`The latest month Incheon Airport has published: ${reply.month}.`,`仁川机场已公开的最近月份：${reply.month}。`,`仁川空港が公表した最新の月：${reply.month}。`)}</p>}
   <p className="route-passenger-legend"><span><i/>{reply.previousMonth??'—'}</span><span><b/>{reply.month}</span></p>
   {table(rows.slice(0,VISIBLE).map(line))}
   {rows.length>VISIBLE&&<details><summary data-disclosure-mixed><DisclosureLabel text={t(lang,`나머지 ${rows.length-VISIBLE}개 노선 국가`,`${rows.length-VISIBLE} more route countries`,`其余${rows.length-VISIBLE}个航线国家`,`残り${rows.length-VISIBLE}の路線の国`)}/></summary>{table(rows.slice(VISIBLE).map(line))}</details>}
  </>}
  <ConciseExplainer summary={t(lang,'인천공항 전체 · 노선 국가별 월 출발 여객','Incheon airport-wide · monthly departures by route country','仁川全机场 · 按航线国家统计月度出发旅客','仁川空港全体・路線の国別の月間出発旅客')}>
  <p className="prep-note">{t(lang,'인천국제공항공사 국가별 항공 통계의 월 출발 여객입니다. 비행기가 향한 나라(노선) 기준이라 탑승객이 어느 나라 사람인지는 알 수 없습니다. 공항 전체 값이며 터미널별로 나누지 않습니다. 항공편 일평균과 단위·범위가 달라 서로 나누지 않습니다.','Monthly departing passengers from Incheon Airport statistics by country. Grouped by the country each flight flies to, so they do not tell where travellers are from. Airport-wide, not per terminal. The unit and scope differ from the daily-mean flight table, so the two are never divided.','仁川国际机场公社各国航空统计的月度出发旅客。按航班飞往的国家（航线）统计，无法得知旅客来自哪个国家。为机场整体数值，不按航站楼区分。与航班日均表的单位和范围不同，两者不相除。','仁川国際空港公社の国別航空統計の月間出発旅客です。便の向かう国（路線）基準のため、旅客がどの国の人かは分かりません。空港全体の値でターミナル別ではありません。便数の1日平均とは単位・範囲が異なるため、互いに割りません。')}{terminal!=='all'&&<> {t(lang,'선택한 터미널과 관계없이 공항 전체 값입니다.','Shown airport-wide whatever terminal is selected.','无论所选航站楼，均为机场整体数值。','選択したターミナルに関係なく空港全体の値です。')}</>}</p>
  </ConciseExplainer>
  <p className="prep-note"><a href="https://www.data.go.kr/data/15095071/openapi.do" target="_blank" rel="noreferrer">{t(lang,'출처: 인천국제공항공사','Source: Incheon International Airport Corporation','来源：仁川国际机场公社','出典: 仁川国際空港公社')} ↗</a></p>
 </section>;
}
