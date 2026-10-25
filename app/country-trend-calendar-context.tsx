import {CountryFlag} from './airport-country-flag';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
import {calendarCountryName,countryTrendCalendar,groupTrendCalendarItems,trendVacationAvailability} from '../lib/country-trend-calendar';
import type {Lang} from './retailpulse-data';
import type {FocusTrend} from './airport-focus-data';

const copy={
 ko:{outside:'방학 자료: 비교 기간 밖',missing:'방학 자료: 미확인',outsideNote:'비교 월과 겹치는 검토 일정만 표시합니다.',missingNote:'방학이 없다는 뜻은 아닙니다.',varies:'지역·학교별 상이'},
 en:{outside:'School-break data: outside comparison period',missing:'School-break data: unverified',outsideNote:'Only reviewed dates overlapping the comparison months are shown.',missingNote:'This does not mean there are no breaks.',varies:'Dates vary by region and school'},
 zh:{outside:'学校假期资料：比较期间以外',missing:'学校假期资料：未确认',outsideNote:'仅显示与比较月份重叠的已核实日程。',missingNote:'并不表示没有假期。',varies:'各地区和学校日期不同'},
 ja:{outside:'学校休暇資料：比較期間外',missing:'学校休暇資料：未確認',outsideNote:'比較月と重なる確認済みの日程のみ表示します。',missingNote:'休暇がないことを意味しません。',varies:'地域・学校によって異なります'},
};
export function CountryTrendCalendarContext({row,events,asOf,lang='ko'}:{row:FocusTrend;events:readonly CalendarEvent[];asOf:string;lang?:Lang}){
 const last=row.points.at(-1);
 if(!asOf||!last||last.departures===null)return null;
 const query={country:row.code,selectedMonth:last.month,actualDataMonths:row.points.filter(point=>point.departures!==null).map(point=>point.month),asOf};
 const {details}=countryTrendCalendar(events,query);
 if(!details.length)return null;
 // Dates are primary comparison context, not optional evidence. Never rank-cut them.
 const groups=groupTrendCalendarItems(details),availability=trendVacationAvailability(events,query,details),text=copy[lang];
 const eventName=(item:typeof details[number])=>item.title.slice(calendarCountryName(item.country).length+1).replace(/^공휴일 · /,'');
 const dates=(item:typeof details[number])=><>{item.start}{item.start!==item.end?`–${item.end}`:''}</>;
 const flag=(country:string)=><span aria-hidden="true" style={{display:'inline-flex',verticalAlign:'-2px'}}><CountryFlag code={country} size={16}/></span>;
 const evidence=(item:typeof details[number])=><>
  {dates(item)}{item.relation==='previous'?' · 직전 월':''}<br/>
  {item.months.map(period=>period.month).join(' · ')} · {item.country==='KR'&&item.kind==='school_break'?'초등학교 방학기간 참고 · 개별 학교 예시':item.scopeLabel}
  {item.kind==='school_break'&&item.country!=='KR'?` · ${item.name}`:''}
  {item.role==='origin'?' · 한국 출발지 참고':''}
  {' · '}<a href={item.sourceURL} target="_blank" rel="noreferrer">공식 원문 ↗</a> · 확인일 {item.verifiedAt}
 </>;
 return <div className="focus-calendar-context">
  <p className="focus-source">일정 참고 · 증감 원인 단정 불가 · 한국 일정은 출발지 기준</p>
  {groups.map(group=>{
    const item=group.items[0],name=eventName(item);
    if(group.items.length>1)return <p className="focus-source focus-vacation-group" data-calendar-role={group.role} data-calendar-start={item.start} data-vacation-group={group.country} key={group.key}>
     {flag(item.country)} {calendarCountryName(item.country)} · <b>{name}</b> · {text.varies}
     {group.items.map(member=><span className="focus-vacation-period" key={member.eventId} data-event-id={member.eventId}>{dates(member)} · {member.region}{member.relation==='previous'?' · 직전 월':''}</span>)}
    </p>;
    const scope=item.kind==='school_break'?'학교별 상이 · 예시':item.scope==='national'?'':item.region?.includes('연방공무원')?'연방공무원':item.region?.includes('금융기관')?'금융기관':item.region;
    return <p className="focus-source" data-calendar-role={group.role} data-calendar-start={item.start} key={group.key}>
     {flag(item.country)} {calendarCountryName(item.country)} · <b>{name}</b> {dates(item)}{scope?` · ${scope}`:''}{item.relation==='previous'?' · 직전 월':''}
    </p>;
   })}
  <details className="focus-source" data-testid="monthly-calendar-reference"><summary style={{minHeight:44,boxSizing:'border-box',padding:'12px 0',cursor:'pointer'}}>{{ko:'일정 근거',en:'Comparison-period calendar · official sources',zh:'比较期间日程 · 官方依据',ja:'比較期間の日程・公式根拠'}[lang]}</summary>
   {availability!=='MATCHED'&&<><p data-school-break-status={availability}>{text[availability==='OUTSIDE_PERIOD'?'outside':'missing']}</p><p data-school-break-limit>{text[availability==='OUTSIDE_PERIOD'?'outsideNote':'missingNote']}</p></>}
   <p>한국 일정은 한국인 여객 통계가 아닙니다. 방학은 지역·학교별로 다릅니다.</p>
   <ul>{groups.map(group=>{const item=group.items[0];return <li key={group.key}>
    {calendarCountryName(item.country)} · <b>{eventName(item)}</b>{' '}
    {group.items.length>1?<ul>{group.items.map(member=><li key={member.eventId}>{evidence(member)}</li>)}</ul>:evidence(item)}
   </li>;})}</ul>
  </details>
 </div>;
}
