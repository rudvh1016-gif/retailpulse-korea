'use client';
import {chineseText} from '../lib/chinese-ui';
import {useMemo,useState} from 'react';
import type {Lang} from './retailpulse-data';

import {destinationDailyChanges} from '../lib/airport-destination-daily-changes';
import {mainBuildingMonth} from '../lib/airport-monthly-building';
import {monthlyMetric,previousFlightMonth,type AirportFlightMonth,type AirportMonthlyRollups,type MonthScope} from '../lib/airport-monthly-flights';
import './airport-country-flights.css';
import {useLiveSummary} from './live-summary';
import {usePreparedMonth} from './use-prepared-month';
import {useCurrentFlightPeriod} from './use-current-flight-period';
import {currentFlightPeriodCopy} from './current-flight-period-copy';
import {currentDestinationChanges} from '../lib/current-flight-period';

type Reply={status:string;month:string;months?:string[];calculatedAt?:string|null;data:AirportMonthlyRollups|null};
type Sort='volume'|'increase'|'decrease';
type CountryRow=ReturnType<typeof destinationDailyChanges>[number];
const scopes:[MonthScope,string][]=[['ALL','전체'],['T1','T1 본관'],['CONCOURSE','탑승동'],['T2','T2']];
const sideLabels={EAST:'동편',CENTER:'중앙',WEST:'서편',UNVERIFIED:'위치 미확인'};
const sculptedFlags=new Set(['CN','JP','US','VN']);
const svgFlags=new Set('AE AT AU BN CA CH CZ DE DK ES ET FI FR GB GE GU HK HU ID IN IT KG KH KR KZ LA LK MM MN MO MP MX MY NL NP NZ PH PL PT QA SG TH TM TR TW UZ'.split(' '));
function Flag({country}:{country:string}){const src=sculptedFlags.has(country)?`/images/airport-flags/${country}.webp`:svgFlags.has(country)?`/images/airport-flags/fallback/${country.toLowerCase()}.svg`:null;return src?<img src={src} width="22" height="22" alt=""/>:<span className="cfp-flag-code" aria-hidden="true">{country}</span>;}
const wholeNumber=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
const fmt=(value:number|null|undefined)=>value===null||value===undefined||!Number.isFinite(value)?'—':wholeNumber.format(Math.sign(value)*Math.round(Math.abs(value)));
const text=(lang:Lang,ko:string,zh:string)=>chineseText(lang,lang==='zh'?zh:ko);
const monthLabel=(value:string,lang:Lang='ko')=>`${Number(value.slice(5))}${text(lang,'월','月')}`;
const scopeLabel=(value:MonthScope,lang:Lang='ko')=>lang==='zh'?({ALL:'全部',T1:'T1主楼',CONCOURSE:'卫星厅',T2:'T2',UNKNOWN:'航站楼未确认'})[value]:scopes.find(([key])=>key===value)?.[1]??value;
function periodLabel(month:AirportFlightMonth|undefined,lang:Lang='ko'){if(!month)return text(lang,'자료 없음','暂无资料');const included=month.includedDays,short=(day:string)=>`${Number(day.slice(5,7))}.${Number(day.slice(8))}`;return included.length?`${short(included[0])} ~ ${short(included.at(-1)!)} · ${text(lang,`${included.length}일 포함`,`计入${included.length}天`)}`:text(lang,'포함 날짜 없음','无计入日期');}
function countryName(country:string,names:Intl.DisplayNames,lang:Lang='ko'){if(country==='KR')return text(lang,'국내 목적지','韩国境内目的地');try{return names.of(country)??country;}catch{return country;}}

export function formatFlightChangeRate(value:number|null|undefined,lang:Lang='ko'){
 if(value==null||!Number.isFinite(value))return '—';
 if(value===0)return '0%';
 const magnitude=Math.round(Math.abs(value));
 return `${value>0?'+':'△'}${magnitude?fmt(magnitude)+'%':text(lang,'1% 미만','不足1%')}`;
}
function FlightChangeRate({value,lang='ko'}:{value:number|null;lang?:Lang}){
 const valid=value!==null&&Number.isFinite(value),direction=!valid||value===0?'neutral':value>0?'up':'down';
 const magnitude=valid&&value!==0?(Math.round(Math.abs(value))===0?text(lang,'1% 미만','不足1%'):fmt(Math.abs(value))+'%'):'';
 const spoken=!valid?text(lang,'증감률 자료 없음','暂无变化率资料'):value===0?text(lang,'증감률 0%, 변동 없음','变化率0%，无变化'):lang==='zh'?`${value>0?'增加':'减少'}${magnitude}`:`${magnitude} ${value>0?'증가':'감소'}`;
 return <span className="change-rate cfp-rate" data-direction={direction} role="img" aria-label={spoken}>{formatFlightChangeRate(value,lang)}</span>;
}

export function FlightCountChange({delta,lang='ko'}:{delta:number|null;format?:unknown;lang?:Lang}){
 const valid=delta!==null&&Number.isFinite(delta),magnitude=valid?(delta!==0&&Math.round(Math.abs(delta))===0?text(lang,'1 미만','不足1'):fmt(Math.abs(delta))):'—';
 const spoken=!valid?text(lang,'증감 자료 없음','暂无变化资料'):delta===0?text(lang,'변동 없음','无变化'):lang==='zh'?`${delta>0?'增加':'减少'}${magnitude}班/日`:`${magnitude}편/일 ${delta>0?'증가':'감소'}`;
 return <span className="change-rate" data-direction={!valid||delta===0?'neutral':delta>0?'up':'down'} role="img" aria-label={spoken}>{!valid?'—':(delta>0?'+':delta<0?'△':'')+magnitude}</span>;
}
export function orderCountryFlights(rows:CountryRow[],sort:Sort){return [...rows].sort((a,b)=>{
 const tie=(b.current??-1)-(a.current??-1)||a.country.localeCompare(b.country);
 if(sort==='increase')return (b.delta??-Infinity)-(a.delta??-Infinity)||tie;
 if(sort==='decrease')return (a.delta??Infinity)-(b.delta??Infinity)||tie;
 return tie;
});}

/** Saved public departure records. Reuses the same aggregation and T1-building split as AirportMonthlyFlights. */
export default function CountryFlightPanel({lang='ko',date=null}:{lang?:Lang;date?:string|null}){
 const t=(ko:string,zh:string)=>text(lang,ko,zh);
 const summary=useLiveSummary(date);const capturedDay=date??summary?.todayKst??'';
 const requestMonth=capturedDay.slice(0,7);
 const [scope,setScope]=useState<MonthScope>('ALL'),[chosenMonth,setMonth]=useState<string|null>(null),[sort,setSort]=useState<Sort>('volume'),[query,setQuery]=useState(''),[expanded,setExpanded]=useState(false);
 const request=usePreparedMonth<Reply>(requestMonth,`/api/live/airport-months?month=${requestMonth}`,requestMonth,capturedDay),reply=request.reply,failed=request.failed;
 const month=chosenMonth??requestMonth;
 const names=useMemo(()=>new Intl.DisplayNames([lang],{type:'region'}),[lang]);
 const months=reply?.status==='READY'&&Array.isArray(reply.data?.months)?reply.data.months:[];
 const storedCurrent=months.find(m=>m.month===month),storedPrevious=months.find(m=>m.month===previousFlightMonth(month));
 const provisional=useCurrentFlightPeriod(capturedDay,month,storedPrevious,reply?.status==='READY'&&Boolean(storedPrevious?.includedDays.length)&&!storedCurrent?.includedDays.length);
 const effectiveCurrent=provisional.active?provisional.value?.period:storedCurrent;
 const current=scope==='T1'?mainBuildingMonth(effectiveCurrent):effectiveCurrent,previous=scope==='T1'?mainBuildingMonth(storedPrevious):storedPrevious;
 const comparisonCopy=currentFlightPeriodCopy(lang,capturedDay,previous?.includedDays.length??0,provisional.value?.collectedAt??null);
 const choices=months.filter(m=>months.some(p=>p.month===previousFlightMonth(m.month)&&p.includedDays.length>0)&&(m.includedDays.length>0||(m.month===month&&provisional.value))).map(m=>m.month).sort().reverse();
 const ready=Boolean(current?.includedDays.length&&previous?.includedDays.length);
 const allRows=ready?(provisional.active?currentDestinationChanges(current,previous,scope):destinationDailyChanges(current,previous,scope)):[];
 const rows=orderCountryFlights(allRows,sort).filter(r=>!query.trim()||`${countryName(r.country,names,lang)} ${r.country}`.toLowerCase().includes(query.trim().toLowerCase()));
 const visible=expanded||query.trim()?rows:rows.slice(0,8);
 const total=monthlyMetric(current,previous,scope,c=>c.total);
 const leader=orderCountryFlights(allRows.filter(r=>(r.delta??0)>0),'increase')[0],decliner=orderCountryFlights(allRows.filter(r=>(r.delta??0)<0),'decrease')[0];
 const maximum=Math.max(1,...allRows.flatMap(r=>[r.current??0,r.previous??0]));
 const unknown=monthlyMetric(current,previous,scope,c=>c.destinationCountries.UNKNOWN??0);
 const changeScope=(next:MonthScope)=>{setScope(next);setExpanded(false);};
 const changeSort=(next:Sort)=>{setSort(next);setExpanded(false);};
 const searchCountry=(country:string)=>{setQuery(countryName(country,names,lang));setExpanded(false);};
 return <section className="cfp-panel" data-current-day={provisional.active||undefined} aria-label={t("국가별 출발 항공편 비교","各国出发航班比较")}>
  <div className="cfp-controls"><div className="cfp-scopes" role="group" aria-label={t("항공편 터미널 선택","选择航班航站楼")}>{scopes.map(([key])=><button type="button" key={key} aria-pressed={scope===key} onClick={()=>changeScope(key)}>{scopeLabel(key,lang)}</button>)}</div>{choices.length>1?<label className="cfp-month">{t("비교 월","比较月份")} <select value={month} onChange={e=>{setMonth(e.target.value);setExpanded(false);}}>{choices.map(value=><option key={value} value={value}>{value}</option>)}</select></label>:<span className="cfp-month">{month} {t("수집분 · 전월과 비교","已采集记录 · 与上月比较")}</span>}</div>
  {!ready?<p className="cfp-empty" role="status">{provisional.active?(provisional.pending||request.pending?comparisonCopy.loading:comparisonCopy.unavailable):!reply&&!failed?t('국가별 항공편 집계를 불러오는 중입니다','正在加载各国航班汇总…'):t('이 범위에서 비교할 수 있는 두 달의 저장 자료가 없습니다. 없는 날짜를 0편으로 계산하지 않습니다','此范围没有可比较的两个月已存资料。缺失日期不会按0班计算')}</p>:<>
   <div className="cfp-intro"><div><p className="cfp-kicker">{scopeLabel(scope,lang)} · {previous?.month} → {current?.month}</p><h2 data-heading="section"><span className="heading-marker" aria-hidden="true"/>{t("어느 나라행이 늘고 줄었나요?","飞往哪些国家的航班增加或减少了？")}</h2><p>{t("목적지별","按目的地")} <strong>{provisional.active?comparisonCopy.caption:t("하루 평균 출발편","日均出发航班")}</strong></p></div><div className="cfp-total"><span>{scope==='ALL'?t('공항 전체','全机场'):scopeLabel(scope,lang)+t(' 전체','全部')} · {provisional.active?comparisonCopy.units:t('편/일','班/日')}</span><strong>{fmt(total.previous)} <i aria-hidden="true">→</i> {fmt(total.current)}</strong><FlightChangeRate value={total.percent} lang={lang}/></div></div>
   <p className="cfp-periods"><span><i className="cfp-swatch cfp-before"/>{previous?.month} · {periodLabel(previous,lang)}</span><span><i className="cfp-swatch cfp-after"/>{provisional.active?comparisonCopy.currentLabel:current?.month} · {periodLabel(current,lang)}</span></p>
   <p className="cfp-coverage-note">{provisional.active?<>{comparisonCopy.basis} {comparisonCopy.collected}</>:<>{current?.month===requestMonth?t('진행 중인 달 · ','本月尚未结束 · '):''}{t('포함일 기준 평균 · 요일·휴일 구성 차이 있음','按计入日期计算日均值 · 星期与节假日构成可能不同')}</>}</p>
   <div className="cfp-quick-find" aria-label={t("변화가 큰 목적지","变化最大的目的地")}>{leader&&<button type="button" onClick={()=>searchCountry(leader.country)}><span>{t('가장 큰 증가','增加最多')}</span><b>{countryName(leader.country,names,lang)}</b><FlightCountChange delta={leader.delta} format={fmt} lang={lang}/><small>{t('편/일','班/日')}</small></button>}{decliner&&<button type="button" onClick={()=>searchCountry(decliner.country)}><span>{t('가장 큰 감소','减少最多')}</span><b>{countryName(decliner.country,names,lang)}</b><FlightCountChange delta={decliner.delta} format={fmt} lang={lang}/><small>{t('편/일','班/日')}</small></button>}</div>
   <div className="cfp-list-tools"><label>{t("보기 순서","排序方式")} <select aria-label={t("국가별 항공편 보기 순서","各国航班排序方式")} value={sort} onChange={e=>changeSort(e.target.value as Sort)}><option value="volume">{t('편수 많은 순','航班数从多到少')}</option><option value="increase">{t('증가 큰 순','增加最多优先')}</option><option value="decrease">{t('감소 큰 순','减少最多优先')}</option></select></label><label className="cfp-search"><span>{t('국가 찾기','查找国家')}</span><input type="search" aria-label={t("목적지 국가 찾기","查找目的地国家")} placeholder={t("예: 일본, 중국, JP","例如：日本、中国、JP")} value={query} onChange={e=>{setQuery(e.target.value);setExpanded(false);}}/>{query&&<button type="button" onClick={()=>setQuery('')}>{t('지우기','清除')}</button>}</label></div>
   <p className="cfp-list-basis" role="status">{rows.length===0?t('일치하는 목적지가 없습니다','没有匹配的目的地'):t(`${rows.length}개 목적지 중 ${visible.length}개 표시 · 막대와 숫자 단위: 편/일`,`共${rows.length}个目的地，显示${visible.length}个 · 图条与数字单位：班/日`)}</p>
   <ul className="cfp-list" id="cfp-country-list">{visible.map(row=><li key={row.country} data-country={row.country}>
    <div className="cfp-country-heading"><h3><Flag country={row.country}/>{countryName(row.country,names,lang)}</h3><div className="cfp-country-change"><b><FlightCountChange delta={row.delta} format={fmt} lang={lang}/><small>{t('편/일','班/日')}</small></b><FlightChangeRate value={row.percent} lang={lang}/></div></div>
    <div className="cfp-bars" aria-label={`${countryName(row.country,names,lang)}, ${monthLabel(previous!.month,lang)} ${fmt(row.previous)}${t("편/일","班/日")}, ${provisional.active?comparisonCopy.currentLabel:monthLabel(current!.month,lang)} ${fmt(row.current)}${t("편/일","班/日")}`}>
     {[{month:previous!.month,value:row.previous},{month:current!.month,value:row.current}].map((p,i)=><div className="cfp-bar-row" key={p.month} data-period={i?'current':'previous'}><span>{i&&provisional.active?comparisonCopy.shortLabel:monthLabel(p.month,lang)}</span><span className="cfp-track" aria-hidden="true"><i key={`${p.value}-${maximum}`} style={{width:`${(p.value??0)/maximum*100}%`}}/></span><strong>{fmt(p.value)}</strong></div>)}
    </div>
    {row.previous===0&&<p className="cfp-zero-note">{t('전월 평균 0편 · 증감률은 계산하지 않습니다','上月日均为0班 · 不计算变化率')}</p>}
    <details className="cfp-zone-detail"><summary>{t('동편·중앙·서편 상세','东侧、中央及西侧详情')}</summary><table><thead><tr><th>{t('구역','区域')}</th><th>{monthLabel(previous!.month,lang)}</th><th>{provisional.active?comparisonCopy.currentLabel:monthLabel(current!.month,lang)}</th><th>{t('증감','变化')}</th></tr></thead><tbody>{(['EAST','CENTER','WEST','UNVERIFIED'] as const).map(side=><tr key={side}><th>{lang==='zh'?({EAST:'东侧',CENTER:'中央',WEST:'西侧',UNVERIFIED:'位置未确认'})[side]:sideLabels[side]}</th><td>{fmt(row.sides[side].previous)}</td><td>{fmt(row.sides[side].current)}</td><td><FlightCountChange delta={row.sides[side].previous!==null&&row.sides[side].current!==null?row.sides[side].current!-row.sides[side].previous!:null} format={fmt} lang={lang}/></td></tr>)}</tbody></table><p>{t('각 구역 일평균 편수입니다. 위치 미확인도 합계에 포함합니다','各区域的日均航班数，位置未确认的航班也计入合计')}</p></details>
   </li>)}</ul>
   {!query&&rows.length>8&&<button className="cfp-expand" type="button" aria-controls="cfp-country-list" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?t('상위 8개만 보기','仅显示前8个'):t(`목적지 ${rows.length}개 모두 보기`,`查看全部${rows.length}个目的地`)}</button>}
   <p className="cfp-use">{t('담당 터미널 · 국가별 증가·감소 순위','所选航站楼 · 各国航班增减排名')}</p>
   <p className="cfp-limits">{t('항공편 기준 · 여객·승객 국적·매출 추정 아님','按航班统计 · 非旅客人数、乘客国籍或销售额推算')}</p>
   <details className="cfp-method"><summary>{t('포함 날짜·집계 기준 보기','查看计入日期与统计口径')}</summary>{provisional.active?<p>{comparisonCopy.basis} {comparisonCopy.collected} {comparisonCopy.classification}</p>:<p>{t('원래 공항현황의 국가별 항공편 계산식을 그대로 사용했습니다. 월 합계가 아닌 실제 포함 날짜당 평균을 비교합니다. 취소편과 공동운항 중복은 원 집계에서 제외됐습니다','沿用机场现状页面的各国航班计算方式。比较实际计入日期的日均值，而非月度总量。原汇总已排除取消航班及代码共享重复记录')}</p>}<p>{t('T1 본관은 저장된 T1 합계에서 같은 날짜의 탑승동 편수를 제외한 값입니다. 탑승동은 별도 범위이며, 국가별 공식 여객 통계를 터미널로 나눈 값이 아닙니다','T1主楼数值为已存T1合计减去同一日期的卫星厅航班数。卫星厅单独统计，并非将各国官方旅客统计按航站楼拆分')}</p><p>{t("목적지 미정","目的地未定")}: {fmt(unknown.previous)} → {fmt(unknown.current)}{t("편/일. 미정 항공편은 국가 목록에서 제외하고 전체 합계에는 포함합니다","班/日。目的地未定的航班不列入国家列表，但计入整体合计")}</p>{[previous!,current!].map(m=><div key={m.month}><p><b>{m.month}</b> · {t(`${m.includedDays.length}/${m.eligibleDays}일 포함 · 제외 ${m.excludedDays.length}일`,`计入${m.includedDays.length}/${m.eligibleDays}天 · 排除${m.excludedDays.length}天`)}</p><p>{m.includedDays.join(', ')}</p>{m.excludedDays.length>0&&<p>{t("제외","排除")}: {m.excludedDays.map(x=>x.day).join(', ')}</p>}</div>)}<p>{t("저장 집계 기준","已存汇总基准日")}: {reply?.data?.asOf} · {t("계산 시각","计算时间")}: {reply?.calculatedAt??'—'}</p></details>
  </>}
 </section>;
}
