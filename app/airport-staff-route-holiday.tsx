import type {ReactNode} from 'react';
import type {Lang} from './retailpulse-data';
import {ChangeRate} from './change-rate';
import {briefCountryName,briefHoliday,briefReturnText} from '../lib/brief-localization';
import {isExactDate} from '../lib/calendar-context.mjs';
import type {BriefHoliday,flightHolidayContext} from '../lib/holiday-flight-brief';

export interface StaffRouteChange {country:string;label:string;count:number;mean:number;delta:number;percent:number|null;month:string;days:number}
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;
const copy={
 ko:{details:'기준·일정 상세',financial:'금융기관',routePending:'비교 가능한 노선 자료를 확인 중입니다.',eventPending:'해당 날짜·다음 7일에 검증된 대표 휴일 연결이 없습니다.',source:'공식 출처 ↗',verified:'공식 일정 확인',caution:'노선 국가를 고객 국적으로 해석하지 않으며, 귀국객 집중을 확정한 예측이 아닙니다.',association:'휴일과 겹치는 현상이며 증감 원인이 확인된 것은 아닙니다.'},
 en:{details:'Basis & date details',financial:'Financial institutions',routePending:'Comparable route data is being checked.',eventPending:'No verified representative holiday is linked to this date or the next 7 days.',source:'Official source ↗',verified:'Official dates checked',caution:'Route countries do not identify customer nationality; this is not a confirmed forecast of returning travelers.',association:'The dates overlap; a cause for the flight change has not been established.'},
 zh:{details:'依据与日程详情',financial:'金融机构',routePending:'正在确认可比较的航线资料。',eventPending:'所选日期及未来7天暂无可关联的已核实代表性节假日。',source:'官方来源 ↗',verified:'官方日程核实',caution:'航线国家不代表顾客国籍，也不是对返程旅客集中的确定预测。',association:'仅为日期重合，尚未确认航班变化的原因。'},
 ja:{details:'比較基準・日程の詳細',financial:'金融機関',routePending:'比較可能な路線データを確認中です。',eventPending:'選択日と今後7日間に対応する確認済みの代表的な祝日はありません。',source:'公式出典 ↗',verified:'公式日程確認',caution:'路線の国は顧客の国籍を示しません。帰国客の集中を確定した予測ではありません。',association:'日程が重なるという関連であり、便数の増減の原因は確認されていません。'},
};
function countryName(country:string,label:string,lang:Lang){
 return lang==='ja'&&/^[A-Z]{2}$/.test(country)?new Intl.DisplayNames(['ja'],{type:'region'}).of(label==='괌'?'GU':label==='사이판'?'MP':country)??label:briefCountryName(country,label,lang);
}
function compactMonth(month:string,day:string,lang:Lang){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!isExactDate(day)||month.slice(0,4)!==day.slice(0,4))return month;
 return new Intl.DateTimeFormat(locales[lang],{month:lang==='en'?'short':'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T12:00:00Z`));
}
function routeText(route:StaffRouteChange,lang:Lang,number:Intl.NumberFormat){
 const name=countryName(route.country,route.label,lang),count=number.format(route.count);
 return lang==='en'?`${name}-bound ${count} flights`:lang==='zh'?`飞往${name} ${count}班`:lang==='ja'?`${name}行き ${count}便`:`${name}행 ${count}편`;
}
function comparisonText(route:StaffRouteChange,day:string,lang:Lang,number:Intl.NumberFormat,compact:boolean){
 const month=compact?compactMonth(route.month,day,lang):route.month,mean=compact?'':number.format(route.mean);
 return lang==='en'?`vs ${month} daily average${compact?'':` ${mean} flights`}`:lang==='zh'?`较${month}日均${compact?'':`${mean}班`}`:lang==='ja'?`${month}の1日平均${compact?'':`${mean}便`}比`:`${month} 일평균${compact?'':` ${mean}편`} 대비`;
}
function HolidayDates({event}:{event:BriefHoliday}){
 const crossYear=event.start.slice(0,4)!==event.end.slice(0,4);
 const label=(date:string)=>(crossYear?date:date.slice(5)).replaceAll('-','/');
 return <><time dateTime={event.start}>{label(event.start)}</time>{event.end!==event.start&&<>–<wbr/><time dateTime={event.end}>{label(event.end)}</time></>}</>;
}

/** Presentation only: route and calendar selection stay independent and keyed by country code. */
export function StaffRouteHoliday({route,event,matched,day,lang,children}:{route?:StaffRouteChange;event?:BriefHoliday|null;matched?:ReturnType<typeof flightHolidayContext>;day:string;lang:Lang;children?:ReactNode}){
 const text=copy[lang],number=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:1});
 const financial=Boolean(event&&(event.type==='bank_holiday'||/금융기관|financial institutions?|金融機[関构]/i.test(`${event.name} ${event.scope}`)));
 // The exact bank qualifier moves to normal-weight scope, never to a national-holiday label.
 const label=event?briefHoliday({...event,name:financial?event.name.replace(/\s*\(금융기관\)$/,''):event.name},lang):null;
 const knownFinancialScope=event&&['금융기관·특수금융기관','금융기관 휴일. 민간 전체 휴무가 아닙니다.'].includes(event.scope);
 const restricted=Boolean(event&&(event.calendarScope==='regional'||event.conditional||(financial&&!knownFinancialScope)||/오전|오후|반일|시간|\d{1,2}:\d{2}|\d+시|half.day|partial.day/i.test(event.scope)));
 const scope=event&&label?(restricted?label.scope:financial?text.financial:event.calendarScope==='institutional'?label.scope:null):null;
 const association=route&&event&&matched?.event.country===route.country&&event.country===route.country?matched:null;
 return <>
  {route?<p className="staff-route-metric" data-country={route.country}><b>{routeText(route,lang,number)}</b> · {comparisonText(route,day,lang,number,true)} <span className="staff-route-rate"><ChangeRate value={route.percent} lang={lang}/></span></p>:<p>{text.routePending}</p>}
  {event&&label?<div className="staff-holiday-event" data-country={event.country}>
   <h4>{countryName(event.country,event.countryLabel,lang)} {label.name}</h4>
   <p><HolidayDates event={event}/>{scope&&<> · <span className="staff-holiday-scope">{scope}</span></>}</p>
  </div>:<p>{text.eventPending}</p>}
  <details className="staff-route-details">
   <summary>{text.details}</summary>
   {route&&<p data-country={route.country}>{day} · {routeText(route,lang,number)} · {comparisonText(route,day,lang,number,false)} <ChangeRate value={route.percent} lang={lang}/> <span className="staff-route-sample">({route.days}{lang==='en'?' days':lang==='ko'?'일':'日'})</span></p>}
   {association&&<p>{lang==='ko'?association.text:lang==='en'?`${label?.name}: departures ${route!.delta>0?'increased':route!.delta<0?'decreased':'equal the comparison daily average'}.`:lang==='zh'?`${label?.name}期间，出发航班${route!.delta>0?'增加':route!.delta<0?'减少':'与比较日均值相同'}。`:`${label?.name}の期間中、出発便は${route!.delta>0?'増加':route!.delta<0?'減少':'比較対象の1日平均と同じ'}。`} {text.association}</p>}
   {event&&label&&<div data-country={event.country}>
    <p>{event.start}{event.end!==event.start?`–${event.end}`:''} · {briefHoliday(event,lang).name}</p>
    <p>{label.scope}</p>
    <p>{briefReturnText(event,lang)}.</p>
    <small>{text.verified} {event.verifiedAt} · <a href={event.sourceURL} target="_blank" rel="noreferrer">{text.source}</a></small>
   </div>}
   {children}
   <small>{text.caution}</small>
  </details>
 </>;
}
