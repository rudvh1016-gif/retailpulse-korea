'use client';
import {DisclosureLabel} from './disclosure-label';
import {createContext,useContext,useMemo,useState,type ReactNode} from 'react';
/** Optional approval-preview relocation; default preserves the production table. */
export const RoutePassengerPlacement=createContext<ReactNode>(null);
import type {Lang} from './retailpulse-data';
import {ConciseExplainer} from './concise-explainer';
import {ChangeRate} from './change-rate';
import type {AirportStatsRow} from '../lib/airport-monthly-stats-read';
import {compareRoutePassengerMonths,passengerMonthDays} from '../lib/route-passenger-comparison';
import {useAirportPassengerComparison,useAirportPassengerStats} from './airport-passenger-stats-client';
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
 const [selection,setSelection]=useState<{context:string;selected:string;baseline:string}|null>(null);
 const explicit=selection?.context===month?selection:null;
 const selectedMonth=explicit?.selected??reply?.current.ROUTE_COUNTRY_PASSENGERS?.month??null;
 const calendarPrevious=selectedMonth?new Date(Date.UTC(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5))-2,1)).toISOString().slice(0,7):null;
 const baselineMonth=explicit?.baseline??reply?.previous.ROUTE_COUNTRY_PASSENGERS?.month??calendarPrevious;
 const comparison=useAirportPassengerComparison(selectedMonth,baselineMonth);
 const current=explicit?comparison.reply?.selected:reply?.current.ROUTE_COUNTRY_PASSENGERS;
 const previous=explicit?comparison.reply?.baseline:reply?.previous.ROUTE_COUNTRY_PASSENGERS;
 const available=(comparison.reply?.availableMonths??[]).filter(value=>value.startsWith('2026-'));
 if(replacement)return <>{replacement}</>;
 const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang],{maximumFractionDigits:0});
 const names=new Intl.DisplayNames([lang],{type:'region'});
 const label=(row:AirportStatsRow)=>{const code=codes?.get(row.label);return code?names.of(code)??row.label:row.label;};
 const daily=new Intl.NumberFormat(lang,{maximumFractionDigits:0});
 const rows=compareRoutePassengerMonths(current,previous);
 const scale=Math.max(1,...rows.flatMap(row=>[row.selectedTotal??0,row.baselineTotal??0]));
 const cell=(total:number|null,mean:number|null)=><td><span className="route-month-total">{total===null?'?':fmt.format(total)}</span>{mean!==null&&<small className="route-month-mean">{t(lang,'일평균','Daily mean','日均','日平均')} {daily.format(mean)}</small>}</td>;
 const line=(item:typeof rows[number])=>{const row=item.row,code=codes.get(row.label),flag=code&&sculptedFlags.has(code)?`/images/airport-flags/${code}.webp`:code&&flatFlags.has(code)?`/images/airport-flags/fallback/${code.toLowerCase()}.svg`:null;return <tr key={row.label}><th scope="row"><span className="route-country-name">{flag&&<img src={flag} alt="" width="18" height="18" loading="lazy" decoding="async"/>}{label(row)}</span><span className="route-country-comparison" aria-hidden="true">{item.baselineTotal!==null&&<i key={`baseline-${baselineMonth}-${selectedMonth}-${item.baselineTotal}-${scale}`} style={{width:`${item.baselineTotal/scale*100}%`}}/>}{item.selectedTotal!==null&&<b key={`selected-${baselineMonth}-${selectedMonth}-${item.selectedTotal}-${scale}`} style={{width:`${item.selectedTotal/scale*100}%`}}/>}</span></th>{cell(item.baselineTotal,item.baselineMean)}{cell(item.selectedTotal,item.selectedMean)}<td><ChangeRate value={item.percent} lang={lang}/></td></tr>;};
 const table=(body:React.ReactNode)=><div className="airport-month-table"><table><caption>{t(lang,'출국 여객 · 명/월 · 일평균 명/일','Departing passengers · people/month · daily mean people/day','出境旅客 · 人/月 · 日均人/日','出発旅客・人/月・日平均人/日')}</caption><colgroup><col/><col className="airport-month-value-column"/><col className="airport-month-value-column"/><col className="airport-month-rate-column"/></colgroup><thead><tr><th scope="col">{t(lang,'노선 국가','Route country','航线国家','路線の国')}</th><th scope="col">{baselineMonth??'?'}<small className="route-month-mean">{baselineMonth&&passengerMonthDays(baselineMonth)} {t(lang,'일','days','天','日')}</small></th><th scope="col">{selectedMonth}<small className="route-month-mean">{selectedMonth&&passengerMonthDays(selectedMonth)} {t(lang,'일','days','天','日')}</small></th><th scope="col">{t(lang,'일평균 증감','Daily-mean change','日均变化','日平均の増減')}</th></tr></thead><tbody>{body}</tbody></table></div>;
 return <section id="airport-route-passengers" className="airport-route-passengers" data-testid="airport-route-passengers" aria-label={t(lang,'노선 국가별 출발 여객','Departing passengers by route country','各航线国家出发旅客','路線の国別の出発旅客')}>
  <div className="route-passenger-heading"><div><h4>{t(lang,'노선 국가별 출발 여객 · 공식 월 실적','Departing passengers by route country · official monthly results','各航线国家出发旅客 · 官方月度实绩','路線の国別の出発旅客・公式月次実績')}</h4>{current&&<p className="route-passenger-period">{baselineMonth??'?'} → {selectedMonth} · {t(lang,'공항 전체 · 명/월','Airport-wide · people/month','全机场 · 人/月','空港全体・人/月')}</p>}</div><img className="route-passenger-symbol" src="/visuals/route-passengers/aircraft-320.webp" width="96" height="72" alt="" loading="lazy" decoding="async"/></div>
  <div className="route-month-controls">{(['baseline','selected'] as const).map(key=><label key={key}>{key==='baseline'?t(lang,'기준 월','Baseline month','基准月','基準月'):t(lang,'비교 월','Comparison month','比较月','比較月')}<select name={key+'-passenger-month'} autoComplete="off" data-month-selection={key} value={(key==='baseline'?baselineMonth:selectedMonth)??''} disabled={!available.length} onChange={event=>setSelection({context:month,selected:selectedMonth!,baseline:baselineMonth!,[key]:event.target.value})}>{!available.length&&<option value={(key==='baseline'?baselineMonth:selectedMonth)??''}>{failed||comparison.failed?t(lang,'저장 월 확인 실패','Stored months unavailable','已存月份核实失败','保存月の確認失敗'):comparison.reply||reply&&!selectedMonth?t(lang,'저장된 2026 자료 없음','No stored 2026 data','没有已存的2026年资料','2026年の保存資料なし'):t(lang,'저장 월 확인 중','Checking stored months','正在核实已存月份','保存月を確認中')}</option>}{available.length>0&&!available.includes((key==='baseline'?baselineMonth:selectedMonth)??'')&&<option disabled value={(key==='baseline'?baselineMonth:selectedMonth)??''}>{key==='baseline'?baselineMonth:selectedMonth} · {(key==='baseline'?baselineMonth:selectedMonth)?.startsWith('2026-')?t(lang,'저장 자료 없음','Stored data missing','缺少已存资料','保存資料なし'):t(lang,'2026 목록 밖','Outside 2026 catalog','不在2026年目录内','2026年一覧の対象外')}</option>}{available.map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}</div>
  {(failed||comparison.failed)&&<p className="airport-month-state" role="status">{t(lang,'갱신 실패 · 같은 선택의 마지막 확인 자료만 유지합니다.','Refresh failed; only the last confirmed data for this selection is retained.','刷新失败；仅保留相同选择的最后确认资料。','更新失敗。同じ選択の最終確認資料のみ保持します。')}</p>}
  {explicit&&!comparison.reply?<p role="status">{comparison.failed?t(lang,'선택 자료 확인 실패','Selected data could not be checked','所选资料核实失败','選択資料を確認できません'):t(lang,'선택 월 확인 중','Loading selected months','正在核实所选月份','選択月を確認中')}</p>:explicit&&(!current||!previous)?<p role="status">{t(lang,'선택 월의 저장 자료가 없습니다 · ?는 누락이며 0이 아닙니다.','Stored data is missing for a selected month; ? means missing, never zero.','所选月份缺少已存资料；?表示缺失而非0。','選択月の保存資料がありません。?は欠測であり0ではありません。')}</p>:null}
  {!reply?<p className="airport-month-state" role="status">{failed?t(lang,'공식 여객 통계 연결이 일시적으로 지연됐습니다.','Official passenger statistics are temporarily unavailable.','官方旅客统计连接暂时延迟。','公式旅客統計の接続が一時的に遅延しています。'):t(lang,'공식 여객 통계를 불러오는 중…','Loading official passenger statistics…','正在读取官方旅客统计…','公式旅客統計を読み込み中…')}</p>
  :!rows.length?explicit?null:<p className="airport-month-state" role="status">{t(lang,'저장된 공식 여객 자료가 없습니다. 누락을 0으로 표시하지 않습니다.','No stored official passenger data is available. Missing data is never zero.','没有已存的官方旅客资料。缺失不表示0。','保存済みの公式旅客資料がありません。欠測を0と表示しません。')}</p>
  :<>
   {!explicit&&reply.month!==month&&<p className="airport-month-basis">{t(lang,`요청 월까지 저장된 최근 공식 자료: ${selectedMonth}`,`Latest stored official month up to the requested month: ${selectedMonth}.`,`截至请求月份的最新已存官方资料：${selectedMonth}`,`指定月までの最新保存公式資料：${selectedMonth}`)}</p>}
   <p className="route-passenger-legend"><span><i/>{baselineMonth??'?'}</span><span><b/>{selectedMonth}</span></p>
   {table(rows.slice(0,VISIBLE).map(line))}
   {rows.length>VISIBLE&&<details><summary data-disclosure-mixed><DisclosureLabel text={t(lang,`나머지 ${rows.length-VISIBLE}개 노선 국가`,`${rows.length-VISIBLE} more route countries`,`其余${rows.length-VISIBLE}个航线国家`,`残り${rows.length-VISIBLE}の路線の国`)}/></summary>{table(rows.slice(VISIBLE).map(line))}</details>}
  </>}
  <ConciseExplainer summary={t(lang,'인천공항 전체 · 노선 국가별 월 출발 여객','Incheon airport-wide · monthly departures by route country','仁川全机场 · 按航线国家统计月度出发旅客','仁川空港全体・路線の国別の月間出発旅客')}>
  {[previous,current].filter(Boolean).map((value,index)=><p className="prep-note" key={index}>{value!.month} · {t(lang,'저장 시각','Stored at','存储时间','保存日時')} {value!.retrievedAt} · {value!.completeness==='COMPLETE'?t(lang,'응답 건수 일치','Response count matched','响应条数一致','応答件数一致'):t(lang,'전체 건수 미제공 · 마감 완전성 확인 불가','Total count not supplied; final completeness unconfirmed','未提供总条数；无法确认最终完整性','総件数なし・確定の完全性は未確認')}</p>)}

  <p className="prep-note">{t(lang,'월 합계 ÷ 각 월의 달력 일수로 일평균을 비교합니다. 최근 공개월 요약과 별도입니다. 저장 자료만 선택하며 공개 여부를 추정하지 않습니다.','Daily means divide each monthly total by its own calendar days. This comparison is separate from the latest-month summary. Only stored months are selectable; publication is not inferred.','日均按各月总数除以该月日历天数计算。此比较独立于最新月份摘要。仅可选择已存月份，不推测公布状态。','日平均は各月合計を各月の暦日数で割ります。最新月の要約とは別です。保存済み月のみ選択でき、公表状況を推測しません。')}</p>
  <p className="prep-note">{t(lang,'인천국제공항공사 국가별 항공 통계의 월 출발 여객입니다. 비행기가 향한 나라(노선) 기준이라 탑승객이 어느 나라 사람인지는 알 수 없습니다. 공항 전체 값이며 터미널별로 나누지 않습니다. 항공편 일평균과 단위·범위가 달라 서로 나누지 않습니다.','Monthly departing passengers from Incheon Airport statistics by country. Grouped by the country each flight flies to, so they do not tell where travellers are from. Airport-wide, not per terminal. The unit and scope differ from the daily-mean flight table, so the two are never divided.','仁川国际机场公社各国航空统计的月度出发旅客。按航班飞往的国家（航线）统计，无法得知旅客来自哪个国家。为机场整体数值，不按航站楼区分。与航班日均表的单位和范围不同，两者不相除。','仁川国際空港公社の国別航空統計の月間出発旅客です。便の向かう国（路線）基準のため、旅客がどの国の人かは分かりません。空港全体の値でターミナル別ではありません。便数の1日平均とは単位・範囲が異なるため、互いに割りません。')}{terminal!=='all'&&<> {t(lang,'선택한 터미널과 관계없이 공항 전체 값입니다.','Shown airport-wide whatever terminal is selected.','无论所选航站楼，均为机场整体数值。','選択したターミナルに関係なく空港全体の値です。')}</>}</p>
  </ConciseExplainer>
  <p className="prep-note"><a href="https://www.data.go.kr/data/15095071/openapi.do" target="_blank" rel="noreferrer">{t(lang,'출처: 인천국제공항공사','Source: Incheon International Airport Corporation','来源：仁川国际机场公社','出典: 仁川国際空港公社')} ↗</a></p>
 </section>;
}
