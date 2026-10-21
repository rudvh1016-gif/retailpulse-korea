import {parseCalendarBytes,CALENDAR_SOURCES} from './official-calendar-parsers.mjs';
import type {CalendarEvent} from './calendar-context.mjs';
import {sha256} from './hash';
import {kstDayOf} from './kst';
import {calendarRefreshDecision} from './official-calendar-cadence.mjs';
export type AutomaticCalendarCountry='JP'|'US';
export interface CalendarReplacementScope {country:string;year:number;scope:'national'|'institutional'}
export interface CalendarSourceStatus {country:string;status:string;checkedAt:string|null;lastVerifiedAt:string|null;reason?:string}
export interface CalendarChange {id:string;changedAt:string}
export interface StoredCalendar {lastChange?:CalendarChange;events:CalendarEvent[];coverage:CalendarReplacementScope[];sourceURL:string;verificationMethod:'OFFICIAL_STRUCTURED_SCHEMA'}
export interface CalendarStoredRow {country:AutomaticCalendarCountry;payload:string|null;semantic_hash:string|null;source_hash:string|null;last_verified_at:string|null;checked_at:string;status:'VERIFIED'|'ERROR'|'REVIEW_REQUIRED';reason:string|null}
export const CALENDAR_REFRESH_CADENCE='MONTHLY' as const;
// One maximum-length month plus the existing 14-day failure grace.
export const CALENDAR_STALE_MS=45*86400_000;
const MAX_BYTES=1048576;
const names:Record<string,string>={'元日':'새해 첫날','成人の日':'성인의 날','建国記念の日':'건국기념일','天皇誕生日':'천황탄생일','春分の日':'춘분','昭和の日':'쇼와의 날','憲法記念日':'헌법기념일','みどりの日':'녹색의 날','こどもの日':'어린이날','休日':'법정 휴일','海の日':'바다의 날','山の日':'산의 날','敬老の日':'경로의 날','秋分の日':'추분','スポーツの日':'스포츠의 날','文化の日':'문화의 날','勤労感謝の日':'근로감사의 날','New Year’s Day':'새해 첫날','New Year\'s Day':'새해 첫날','Birthday of Martin Luther King, Jr.':'마틴 루터 킹의 날','Washington’s Birthday':'워싱턴 탄생일','Washington\'s Birthday':'워싱턴 탄생일','Memorial Day':'메모리얼 데이','Juneteenth National Independence Day':'준틴스','Independence Day':'독립기념일','Labor Day':'노동절','Columbus Day':'콜럼버스의 날','Veterans Day':'재향군인의 날','Thanksgiving Day':'추수감사절','Christmas Day':'크리스마스'};
/** Only vetted structured official calendars can cross this boundary. School
 * pages/new source types are never promoted by a successful HTTP response. */
export function canonicalCalendar(country:AutomaticCalendarCountry,bytes:Uint8Array,now:Date):StoredCalendar & {sourceHash:string}{
 const parsed=parseCalendarBytes(country,bytes,now.toISOString());
 const year=Number(kstDayOf(now.toISOString()).slice(0,4)),allowed=[year-1,year,year+1];
 const selected=parsed.events.filter((e:{start:string})=>allowed.includes(Number(e.start.slice(0,4))));
 if(selected.some((e:{status:string})=>e.status!=='candidate'))throw new Error('CALENDAR_CANCELLATION_REVIEW');
 const years=[...new Set<number>(selected.map((e:{start:string})=>Number(e.start.slice(0,4))))];
 if(!years.includes(year))throw new Error('CALENDAR_CURRENT_YEAR_MISSING');
 for(const y of years){const count=selected.filter((e:{start:string})=>e.start.startsWith(String(y))).length;if(count<(country==='JP'?15:10)||count>30)throw new Error('CALENDAR_YEAR_COVERAGE_INVALID');}
 const verifiedAt=now.toISOString().slice(0,10),reviewValidUntil=new Date(now.getTime()+CALENDAR_STALE_MS).toISOString().slice(0,10);
 const events:CalendarEvent[]=selected.map((e:{id:string;name:string;region:string;start:string;end:string;sourceURL:string})=>({id:e.id,country,region:country==='JP'?undefined:e.region==='US_inauguration_area'?'미국 취임식 지정 지역·해당 연방공무원':'미국 연방공무원(관측 휴일)',scope:country==='JP'?'national':'institutional',name:names[e.name]??e.name,kind:'public_holiday',start:e.start,end:e.end,status:'verified',sourceURL:e.sourceURL,verifiedAt,reviewValidUntil}));
 return {events,coverage:years.map(year=>({country,year,scope:country==='JP'?'national':'institutional'})),sourceURL:CALENDAR_SOURCES[country].url,verificationMethod:'OFFICIAL_STRUCTURED_SCHEMA',sourceHash:parsed.sourceSHA256};
}
export async function readOfficialCalendars(db:Pick<D1Database,'prepare'>):Promise<CalendarStoredRow[]>{
 const reply=await db.prepare('SELECT country,payload,semantic_hash,source_hash,last_verified_at,checked_at,status,reason FROM official_calendar_current ORDER BY country LIMIT 2').all<CalendarStoredRow>();
 if(!reply.success)throw Error('CALENDAR_READ_FAILED');return reply.results??[];
}
function semanticPayload(value:StoredCalendar){return {coverage:[...value.coverage].sort((a,b)=>a.year-b.year),sourceURL:value.sourceURL,events:value.events.map(({verifiedAt,reviewValidUntil,...e})=>{void verifiedAt;void reviewValidUntil;return e;}).sort((a,b)=>a.id.localeCompare(b.id))};}
function storedPayload(row:CalendarStoredRow|undefined):StoredCalendar|null{
 try{const value=JSON.parse(row?.payload??'null');return value&&Array.isArray(value.events)&&value.events.length<=100&&value.events.every((event:CalendarEvent)=>event&&typeof event.id==='string'&&typeof event.start==='string'&&typeof event.end==='string')&&Array.isArray(value.coverage)&&typeof value.sourceURL==='string'&&value.verificationMethod==='OFFICIAL_STRUCTURED_SCHEMA'?value:null;}catch{return null;}
}
function validChange(value:CalendarChange|undefined,now:Date){return value&&/^[a-f0-9]{64}$/.test(value.id)&&Number.isFinite(Date.parse(value.changedAt))&&Date.parse(value.changedAt)<=now.getTime();}
/** Ignore row order, verification renewal, display translations and automatic
 * retention of past years. One metadata entry shares the atomic payload write. */
async function latestCalendarChange(country:AutomaticCalendarCountry,before:StoredCalendar|null,after:StoredCalendar,now:Date):Promise<CalendarChange|undefined>{
 if(!before||before.sourceURL!==after.sourceURL)return undefined;
 const minYear=Number(kstDayOf(now.toISOString()).slice(0,4))-1;
 const facts=(value:StoredCalendar)=>value.events.filter(event=>Number(event.start.slice(0,4))>=minYear).map(({id,country,scope,region,kind,start,end,sourceURL})=>({id,country,scope,region,kind,start,end,sourceURL})).sort((a,b)=>a.id.localeCompare(b.id));
 const oldHash=await sha256(facts(before)),newHash=await sha256(facts(after));
 return oldHash===newHash?(validChange(before.lastChange,now)?before.lastChange:undefined):{id:await sha256({country,before:oldHash,after:newHash,changedAt:now.toISOString()}),changedAt:now.toISOString()};
}
async function fetchCalendarBytes(country:AutomaticCalendarCountry,fetchImpl:typeof fetch){
 const response=await fetchImpl(CALENDAR_SOURCES[country].url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'user-agent':'KORETAIL official calendar (+https://koretaildata.com)'}});
 if(!response.ok)throw Error(`HTTP_${response.status}`);
 if(Number(response.headers.get('content-length')??0)>MAX_BYTES)throw Error('CALENDAR_SOURCE_TOO_LARGE');
 const reader=response.body?.getReader();if(!reader)throw Error('CALENDAR_EMPTY_BODY');const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES)throw Error('CALENDAR_SOURCE_TOO_LARGE');chunks.push(value);}}catch(error){await reader.cancel();throw error;}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
/** Daily metadata check, monthly successful provider refresh. Failed sources
 * wait seven days between attempts; no in-run retry, source discovery or AI. */
export async function refreshOfficialCalendars(db:Pick<D1Database,'prepare'>,now=new Date(),fetchImpl:typeof fetch=fetch){
 const previous=new Map((await readOfficialCalendars(db)).map(row=>[row.country,row]));const results=[];
 for(const country of ['JP','US'] as const){const before=previous.get(country),decision=calendarRefreshDecision(before,now);
  if(decision!=='DUE'){results.push({country,status:decision,providerRequests:0,changedRows:0});continue;}
  let requests=0;
  try{requests++;const value=canonicalCalendar(country,await fetchCalendarBytes(country,fetchImpl),now);const hash=await sha256(semanticPayload(value));const {sourceHash,...payload}=value;
   const lastChange=await latestCalendarChange(country,storedPayload(before),payload,now);if(lastChange)payload.lastChange=lastChange;
   // Canonical payload is replaced only for semantic change. Timestamp-only
   // receipt is metadata; projection renews event validity from last_verified_at.
   const reply=await db.prepare(`INSERT INTO official_calendar_current(country,payload,semantic_hash,source_hash,last_verified_at,checked_at,status,reason) VALUES(?,?,?,?,?,?,'VERIFIED',NULL)
    ON CONFLICT(country) DO UPDATE SET payload=CASE WHEN official_calendar_current.payload IS NULL OR official_calendar_current.semantic_hash<>excluded.semantic_hash THEN excluded.payload ELSE official_calendar_current.payload END,
     semantic_hash=excluded.semantic_hash,source_hash=excluded.source_hash,last_verified_at=excluded.last_verified_at,checked_at=excluded.checked_at,status='VERIFIED',reason=NULL WHERE excluded.checked_at>official_calendar_current.checked_at AND official_calendar_current.semantic_hash IS ?`).bind(country,JSON.stringify(payload),hash,sourceHash,now.toISOString(),now.toISOString(),before?.semantic_hash??null).run();
   if(!reply.success)throw Error('CALENDAR_WRITE_FAILED');if(reply.meta?.changes===0){results.push({country,status:'SKIPPED_CONCURRENT_CHANGE',providerRequests:requests,changedRows:0});continue;}results.push({country,status:'VERIFIED',providerRequests:requests,changedRows:before?.semantic_hash===hash?0:value.events.length});
  }catch(error){const reason=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'CALENDAR_FETCH_OR_PARSE_FAILED';const status=reason.includes('REVIEW')?'REVIEW_REQUIRED':'ERROR';
   const reply=await db.prepare(`INSERT INTO official_calendar_current(country,checked_at,status,reason) VALUES(?,?,?,?) ON CONFLICT(country) DO UPDATE SET checked_at=excluded.checked_at,status=excluded.status,reason=excluded.reason WHERE excluded.checked_at>official_calendar_current.checked_at`).bind(country,now.toISOString(),status,reason).run();
   if(!reply.success)throw Error('CALENDAR_STATUS_WRITE_FAILED');results.push({country,status,providerRequests:requests,changedRows:0,lastGoodPreserved:Boolean(before?.payload),reason});}
 }
 return {results,aiCalls:0,maximumProviderRequests:2};
}
/** Each complete official year replaces only its own scope. Missing source
 * never means no holidays; regional schools/manual countries are preserved. */
export function projectOfficialCalendars(rows:CalendarStoredRow[],seed:CalendarEvent[],now=new Date()){
 let events=seed;const scopes:CalendarReplacementScope[]=[];const sources:CalendarSourceStatus[]=[];const changes:Array<CalendarChange & {country:AutomaticCalendarCountry}>=[];
 for(const country of ['JP','US'] as const){const row=rows.find(row=>row.country===country);const at=row?.last_verified_at?Date.parse(row.last_verified_at):NaN;const age=now.getTime()-at;
  const usable=Number.isFinite(at)&&age>=0&&age<=CALENDAR_STALE_MS;
  sources.push({country,status:!row?'NOT_COLLECTED':!usable&&row.payload?'STALE':row.status,checkedAt:row?.checked_at??null,lastVerifiedAt:row?.last_verified_at??null,...(row?.reason?{reason:row.reason}:{})});
  if(!row?.payload)continue;
  try{const value=JSON.parse(row.payload) as StoredCalendar;if(!Array.isArray(value.events)||!Array.isArray(value.coverage)||value.events.length>100||value.verificationMethod!=='OFFICIAL_STRUCTURED_SCHEMA')continue;
   if(usable&&row.status==='VERIFIED'&&validChange(value.lastChange,now)&&Date.parse(value.lastChange!.changedAt)<=at)changes.push({...value.lastChange!,country});
   const coverage=value.coverage.filter(scope=>scope.country===country&&Number.isInteger(scope.year)&&scope.scope===(country==='JP'?'national':'institutional'));
   // Even stale successful replacement suppresses superseded static dates.
   events=events.filter(event=>!coverage.some(scope=>event.country===scope.country&&event.kind==='public_holiday'&&event.scope===scope.scope&&Number(event.start.slice(0,4))===scope.year));scopes.push(...coverage);
   const checkedDate=row.last_verified_at!.slice(0,10),until=new Date(at+CALENDAR_STALE_MS).toISOString().slice(0,10);
   events=[...events,...value.events.map(event=>({...event,status:usable?'verified' as const:'expired' as const,verifiedAt:checkedDate,reviewValidUntil:until}))];
  }catch{/* Invalid persisted data cannot replace the reviewed fallback. */}
 }
 return {status:sources.every(source=>source.status==='VERIFIED')?'VERIFIED':'PARTIAL',events,changes,calendarReplacementScopes:scopes,sources,cadence:CALENDAR_REFRESH_CADENCE,cadenceHours:null,eligibilityCheck:'DAILY_STORED_METADATA',retryCooldownDays:7,timeZone:'Asia/Seoul',staleAfterDays:45,checkedAt:sources.flatMap(source=>source.checkedAt?[source.checkedAt]:[]).sort().at(-1)??null,limitations:['한국은 기존 KASI 수집 상태에 따릅니다.','중국·기타 국가와 지역별 방학은 검토된 일정이며 자동 신규 반영 대상이 아닙니다.']};
}
