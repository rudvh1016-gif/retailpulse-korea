import type {ReactNode} from 'react';
import type {Lang} from './retailpulse-data';
import {ChangeRate} from './change-rate';
import {CountryFlag} from './airport-country-flag';
import {isExactDate} from '../lib/calendar-context.mjs';
import {EventCountryFlights,EventCountryFlightBasis} from './event-country-flights';
import type {EventFlightContext} from '../lib/event-country-flights';
import {briefCountryName,briefHoliday,briefReturnText} from '../lib/brief-localization';
import type {BriefHoliday} from '../lib/holiday-flight-brief';

export interface StaffRouteChange {basis?:string;country:string;label:string;count:number;mean:number;delta:number;percent:number|null;month:string;days:number}
const locales={ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'} as const;
const copy={
 ko:{routePending:'비교 가능한 노선 자료를 확인 중입니다.',routeBasis:'노선 국가 기준',details:'기준·일정 상세',financial:'금융기관',eventPending:'해당 날짜·다음 7일에 검증된 대표 휴일 연결이 없습니다.',source:'공식 출처 ↗',verified:'공식 일정 확인'},
 en:{routePending:'Comparable route data is being checked.',routeBasis:'Route-country basis',details:'Basis & date details',financial:'Financial institutions',eventPending:'No verified representative holiday is linked to this date or the next 7 days.',source:'Official source ↗',verified:'Official dates checked'},
 zh:{routePending:'正在确认可比较的航线资料。',routeBasis:'按航线国家',details:'依据与日程详情',financial:'金融机构',eventPending:'所选日期及未来7天暂无可关联的已核实代表性节假日。',source:'官方来源 ↗',verified:'官方日程核实'},
 ja:{routePending:'比較可能な路線データを確認中です。',routeBasis:'路線の国別',details:'比較基準・日程の詳細',financial:'金融機関',eventPending:'選択日と今後7日間に対応する確認済みの代表的な祝日はありません。',source:'公式出典 ↗',verified:'公式日程確認'},
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
 const basis=route.basis;
 if(basis)return lang==='en'?`vs ${basis}`:lang==='zh'?`较${basis}`:lang==='ja'?`${basis}比`:`${basis} 대비`;
 const month=compact?compactMonth(route.month,day,lang):route.month,mean=compact?'':number.format(route.mean);
 return lang==='en'?`vs ${month} daily average${compact?'':` ${mean} flights`}`:lang==='zh'?`较${month}日均${compact?'':`${mean}班`}`:lang==='ja'?`${month}の1日平均${compact?'':`${mean}便`}比`:`${month} 일평균${compact?'':` ${mean}편`} 대비`;
}
function HolidayDates({event,day}:{event:BriefHoliday;day:string}){
 const showYear=event.start.slice(0,4)!==event.end.slice(0,4)||event.start.slice(0,4)!==day.slice(0,4);
 const label=(date:string)=>(showYear?date:date.slice(5)).replaceAll('-','/');
 return <><time dateTime={event.start}>{label(event.start)}</time>{event.end!==event.start&&<>–<wbr/><time dateTime={event.end}>{label(event.end)}</time></>}</>;
}

/** Event first; flight metrics resolve only this event country on the selected flight date. */
export function StaffRouteHoliday({route,event,flights,day,lang,children}:{route?:StaffRouteChange;event?:BriefHoliday|null;flights?:EventFlightContext;day:string;lang:Lang;children?:ReactNode}){
 const text=copy[lang],number=new Intl.NumberFormat(locales[lang],{maximumFractionDigits:1});
 const financial=Boolean(event&&(event.type==='bank_holiday'||/금융기관|financial institutions?|金融機[関构]/i.test(`${event.name} ${event.scope}`)));
 // The exact bank qualifier moves to normal-weight scope, never to a national-holiday label.
 const label=event?briefHoliday({...event,name:financial?event.name.replace(/\s*\(금융기관\)$/,''):event.name},lang):null;
 const knownFinancialScope=event&&['금융기관·특수금융기관','금융기관 휴일. 민간 전체 휴무가 아닙니다.'].includes(event.scope);
 const restricted=Boolean(event&&(event.calendarScope==='regional'||event.conditional||(financial&&!knownFinancialScope)||/오전|오후|반일|시간|\d{1,2}:\d{2}|\d+시|half.day|partial.day/i.test(event.scope)));
 const scope=event&&label?(restricted?label.scope:financial?text.financial:event.calendarScope==='institutional'?label.scope:null):null;
 const context=flights?.day===day?flights:undefined;
 return <>
  {!event&&<>{route?<p className="staff-route-metric" data-country={route.country}><b>{routeText(route,lang,number)}</b> · {comparisonText(route,day,lang,number,true)} <span className="staff-route-rate"><ChangeRate value={route.percent} lang={lang}/></span></p>:<p>{text.routePending}</p>}</>}
  {event&&label?<div className="staff-holiday-event" data-country={event.country}>
   <h4>{/^[A-Z]{2}$/.test(event.country)&&<span aria-hidden="true" style={{display:'inline-block',verticalAlign:'-2px',marginRight:6}}><CountryFlag code={event.country} size={18}/></span>}{countryName(event.country,event.countryLabel,lang)} {label.name}</h4>
   <p><HolidayDates event={event} day={day}/>{scope&&<> · <span className="staff-holiday-scope">{scope}</span></>}</p>
   <EventCountryFlights country={event.country} label={event.countryLabel} context={context} lang={lang}/>
  </div>:<p>{text.eventPending}</p>}
  <details className="staff-route-details">
   <summary>{text.details}</summary>
   {!event&&route&&<p data-country={route.country}>{day} · {text.routeBasis} · {comparisonText(route,day,lang,number,false)} <span className="staff-route-sample">({route.days}{lang==='en'?' days':lang==='ko'?'일':'日'})</span></p>}
   {event&&<EventCountryFlightBasis country={event.country} label={event.countryLabel} context={context} lang={lang} eventForecastNote/>}
   {event&&label&&<div data-country={event.country}>
    {label.scope!==scope&&<p>{label.scope}</p>}
    <p>{briefReturnText(event,lang,true)}.</p>
    <small>{text.verified} {event.verifiedAt} · <a href={event.sourceURL} target="_blank" rel="noreferrer">{text.source}</a></small>
   </div>}
   {children}
  </details>
 </>;
}

