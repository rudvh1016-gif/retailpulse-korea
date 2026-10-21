import holidays from '../data/airport-focus-preview/holidays.json';
import snapshot from '../data/airport-focus-preview/calendar-context.json';
import {isExactDate,isExactMonth,type CalendarEvent} from './calendar-context.mjs';
import type {CalendarReplacementScope} from './official-calendar-runtime';

// Reviewed short meanings, not runtime AI or generated calendar facts.
const singaporeMeanings:Record<string,string>={'새해 첫날':'새해의 시작을 기념하는 공휴일입니다.','춘절':'음력 새해를 기념하는 명절입니다.','성금요일':'예수의 수난을 기리는 기독교 절기입니다.','노동절':'노동자의 기여를 기념하는 날입니다.','베삭 데이':'부처의 탄생·깨달음·열반을 기리는 불교 명절입니다.','하리 라야 푸아사':'라마단 단식을 마친 것을 기념하는 이슬람 명절입니다.','하리 라야 하지':'성지순례와 희생을 기리는 이슬람 명절입니다.','국경절':'싱가포르의 독립을 기념하는 날입니다.','디파발리':'빛이 어둠을 이기는 것을 기념하는 힌두교 축제입니다.','크리스마스':'예수의 탄생을 기념하는 기독교 명절입니다.','선거일':'공식적으로 지정된 투표일입니다.'};
export interface PreparationEvent {
 id:string;country:string;countryLabel:string;name:string;start:string;end:string;
 dateLabel_ko:string;scope:string;description_ko:string;cardSummary_ko:string;
 connectionStatus_ko:string;connectionNote_ko:string;restConditions_ko:string[];
 verificationMethod:string;notes:string;sourceURL:string;verifiedAt:string;
 isRepresentative?:boolean;kind:'public_holiday'|'school_break';
}
/** Reuse reviewed dates only. Automatic replacement is restricted to its exact
 * country/year/scope; a stale replacement must not revive superseded seed dates. */
export function preparationEvents(asOf:string,calendarEvents?:CalendarEvent[],scopes:CalendarReplacementScope[]=[]):PreparationEvent[]{
 if(!isExactDate(asOf))return [];
 const preserved:PreparationEvent[]=holidays.events.filter(event=>event.status==='OFFICIAL_DATE_CONFIRMED'&&event.checkedAt.slice(0,10)<=asOf&&!scopes.some(scope=>scope.country===event.country&&scope.year===Number(event.start.slice(0,4))&&(scope.country==='SG'?(scope.scope==='national'?event.type==='public_holiday'&&!event.region:event.type==='conditional_substitute_holiday'):scope.country==='JP'?event.type==='public_holiday'&&!event.region:event.type==='federal_employee_holiday'&&event.countryLabel==='미국'))).map(event=>({...event,kind:'public_holiday',verifiedAt:event.checkedAt.slice(0,10)}));
 const names=new Intl.DisplayNames(['ko'],{type:'region'});
 const reviewed=calendarEvents??snapshot.events.map(event=>({...event,region:event.region??undefined})) as CalendarEvent[];
 const additional=reviewed.filter(event=>event.status==='verified'&&isExactDate(event.start)&&isExactDate(event.end)&&event.start<=event.end&&isExactDate(event.verifiedAt)&&event.verifiedAt<=asOf&&(!event.reviewValidUntil||event.reviewValidUntil>=asOf)&&(event.scope==='national'||Boolean(event.region))).map(event=>({
  id:event.id,country:event.country,countryLabel:event.country==='KR'?'한국':names.of(event.country)??event.country,name:event.name,start:event.start,end:event.end,
  dateLabel_ko:event.start===event.end?event.start:`${event.start}~${event.end}`,scope:event.scope==='national'?'전국 법정 공휴일':event.region??'적용 대상 확인 필요',
  description_ko:event.country==='SG'?(event.scope==='institutional'?'원래 공휴일이 본인의 휴무일인 경우 적용되는 대체휴일입니다.':singaporeMeanings[event.name]??'공식 자료에서 확인한 공휴일입니다.'):event.kind==='school_break'?`${event.region}에 한정된 방학입니다. 전국 공통 방학이 아닙니다.`:event.scope==='national'?'공식 자료에서 확인한 공휴일입니다.':'표시된 지역·기관에 적용되는 일정이며 전국 또는 모든 사업장의 휴무를 뜻하지 않습니다.',
  cardSummary_ko:'',connectionStatus_ko:'적용 조건과 확인일',connectionNote_ko:'휴일은 출입국 인원이나 혼잡을 보장하지 않습니다.',restConditions_ko:[`공식 자료 확인일 ${event.verifiedAt}`],
  verificationMethod:scopes.some(scope=>scope.country===event.country&&scope.year===Number(event.start.slice(0,4))&&scope.scope===event.scope)?'OFFICIAL_STRUCTURED_SCHEMA':'REVIEWED_OFFICIAL_SNAPSHOT',
  notes:event.country==='SG'&&event.scope==='institutional'?'원래 공휴일이 본인의 휴무일인 경우에만 적용됩니다. 전 국민 공통 휴무일을 뜻하지 않습니다.':event.country==='KR'?'검토된 한국 공식 일정입니다. KASI 자동 수집 성공을 뜻하지 않습니다.':'',sourceURL:event.sourceURL,verifiedAt:event.verifiedAt,isRepresentative:event.kind==='public_holiday',kind:event.kind,
 }));
 // Preserve the owner's full descriptions while adopting a newer review of
 // the same stable event ID (for example a newly published Korean annual list).
 const refreshed=preserved.map(event=>{const newer=additional.find(row=>row.id===event.id&&row.verifiedAt>event.verifiedAt);return newer?{...event,verifiedAt:newer.verifiedAt,sourceURL:newer.sourceURL,verificationMethod:newer.verificationMethod}:event;});
 const all=[...refreshed,...additional];
 return all.filter((event,index)=>all.findIndex(other=>other.id===event.id||other.country===event.country&&other.countryLabel===event.countryLabel&&other.start===event.start&&other.end===event.end&&other.name===event.name&&other.scope===event.scope)===index).sort((a,b)=>a.start.localeCompare(b.start)||a.countryLabel.localeCompare(b.countryLabel,'ko')||a.name.localeCompare(b.name,'ko'));
}
export function shiftPreparationMonth(month:string,offset:number):string {
 if(!isExactMonth(month))throw new RangeError('Expected YYYY-MM');
 const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);
}
export function preparationMonthDays(month:string):(string|null)[]{
 if(!isExactMonth(month))throw new RangeError('Expected YYYY-MM');
 const first=new Date(`${month}-01T00:00:00Z`),end=new Date(first);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 const days:(string|null)[]=Array(first.getUTCDay()).fill(null);
 for(let day=1;day<=end.getUTCDate();day++)days.push(`${month}-${String(day).padStart(2,'0')}`);
 while(days.length%7)days.push(null);return days;
}
export function preparationEventsInMonth(events:PreparationEvent[],month:string){
 const last=preparationMonthDays(month).filter((date):date is string=>date!==null).at(-1)!;
 return events.filter(event=>event.start<=last&&event.end>=`${month}-01`);
}
export const preparationEventsOn=(events:PreparationEvent[],date:string)=>events.filter(event=>event.start<=date&&event.end>=date);
export const preparationFlagCode=(event:PreparationEvent)=>event.countryLabel==='괌'?'GU':event.countryLabel==='사이판'?'MP':event.country;
