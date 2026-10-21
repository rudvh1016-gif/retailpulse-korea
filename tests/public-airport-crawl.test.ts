import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {CalendarStoredRow} from '../lib/official-calendar-runtime';
import type {readAirportMonthlyStats} from '../lib/airport-monthly-stats-read';

process.env.RPK_DEPLOYMENT_STAGE='production';
process.env.NEXT_PUBLIC_SITE_ORIGIN??='https://koretaildata.com';
const {default:robots}=await import('../app/robots');
const {robotsAllows}=await import('../lib/discoverability');
const {crawlableContentApis}=await import('../lib/crawl-policy');
const {officialCalendarResponse,GET:calendarGET}=await import('../app/api/airport/calendar/route');
const {airportPassengerStatsResponse,GET:passengerGET}=await import('../app/api/live/airport-passenger-stats/route');
const origin='https://koretaildata.com';
const now=new Date('2026-10-21T00:00:00Z');
const endpoints=['/api/airport/calendar','/api/live/airport-passenger-stats'] as const;

function robotsText(){
 const rules=robots().rules as {userAgent:string;allow:string[];disallow:string[]};
 return [`User-agent: ${rules.userAgent}`,...rules.allow.map(path=>`Allow: ${path}`),...rules.disallow.map(path=>`Disallow: ${path}`)].join('\n');
}

test('Google, Naver and OpenAI search can render only the exact new public content paths',()=>{
 const text=robotsText();
 for(const agent of ['Googlebot','Yeti','OAI-SearchBot']){
  for(const path of endpoints){
   assert.ok(crawlableContentApis.includes(path));
   assert.equal(robotsAllows(text,path,agent),true,`${agent}: ${path}`);
   const query=path.endsWith('stats')?'?month=2026-09':'?probe=1';
   assert.equal(robotsAllows(text,path+query,agent),true,`${agent}: ${path+query}`);
   for(const suffix of ['-internal','Backup','/','/debug','/admin']){
    assert.equal(robotsAllows(text,path+suffix,agent),false,`${agent}: ${path+suffix}`);
   }
  }
  for(const path of ['/api/','/api/admin','/api/private','/api/health','/api/beta-signups','/api/airport/allowance-update','/api/airport/weather']){
   assert.equal(robotsAllows(text,path,agent),false,`${agent}: ${path}`);
  }
 }
});

function storedCalendar(status:CalendarStoredRow['status']='VERIFIED',at=now.toISOString()):CalendarStoredRow[]{
 return (['JP','US'] as const).map(country=>({country,checked_at:at,last_verified_at:at,status,reason:null,semantic_hash:null,source_hash:null,
  payload:JSON.stringify({events:[],coverage:[],sourceURL:'https://example.invalid/synthetic-calendar',verificationMethod:'OFFICIAL_STRUCTURED_SCHEMA'})}));
}
function calendarDb(rows:CalendarStoredRow[]){
 return {prepare(query:string){assert.match(query,/^SELECT .* LIMIT 2$/);return {async all(){return {success:true,results:rows};}};}} as unknown as Pick<D1Database,'prepare'>;
}

for(const [name,rows,status] of [
 ['verified',storedCalendar(),'VERIFIED'],
 ['missing',[],'PARTIAL'],
 ['stale',storedCalendar('VERIFIED','2026-09-01T00:00:00Z'),'PARTIAL'],
 ['review-required',storedCalendar('REVIEW_REQUIRED'),'PARTIAL'],
] as const){
 test(`calendar ${name} is noindex without changing its public cache`,async()=>{
  const response=await officialCalendarResponse(calendarDb([...rows]),now);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  assert.equal(response.headers.get('cache-control'),'public, max-age=300');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await response.json()).status,status);
 });
}
test('calendar absent and failed storage remain honest and noindex',async()=>{
 const absent=await officialCalendarResponse(null,now);
 assert.equal(absent.headers.get('x-robots-tag'),'noindex');
 assert.equal(absent.headers.get('cache-control'),'public, max-age=300');
 assert.equal((await absent.json()).status,'PARTIAL');
 const failed=await officialCalendarResponse({prepare(){throw Error('synthetic unavailable');}},now);
 assert.equal(failed.headers.get('x-robots-tag'),'noindex');
 assert.equal(failed.headers.get('cache-control'),'no-store');
 assert.equal((await failed.json()).status,'UNAVAILABLE');
});

type MonthlyRead=Awaited<ReturnType<typeof readAirportMonthlyStats>>;
const empty:MonthlyRead={month:null,previousMonth:null,current:{},previous:{},rowsRead:0};
for(const [name,read,cache] of [
 ['READY',{...empty,month:'2026-09'},'public, max-age=300, s-maxage=3600'],
 ['MISSING',empty,'no-store'],
] as const){
 test(`monthly passengers ${name} is noindex with the original cache`,async()=>{
  let reads=0;
  const response=await airportPassengerStatsResponse(new Request(`${origin}${endpoints[1]}?month=2026-10`),async month=>{reads++;assert.equal(month,'2026-10');return read;});
  assert.equal(reads,1);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  assert.equal(response.headers.get('cache-control'),cache);
  const body=await response.json();
  assert.equal(body.status,name);
  assert.equal(body.requestedMonth,'2026-10');
  assert.equal(body.month,read.month);
 });
}
test('monthly passengers unavailable remains no-store and noindex',async()=>{
 const response=await airportPassengerStatsResponse(new Request(`${origin}${endpoints[1]}`),async()=>{throw Error('synthetic unavailable');});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('x-robots-tag'),'noindex');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal((await response.json()).status,'UNAVAILABLE');
});
test('invalid months are noindex 400 without a storage read or changed caching',async()=>{
 for(const month of ['bad','2026-00','2026-13','2026-1','2026-10/extra']){
  const response=await airportPassengerStatsResponse(new Request(`${origin}${endpoints[1]}?month=${encodeURIComponent(month)}`),async()=>{assert.fail('invalid month must not read storage');});
  assert.equal(response.status,400);
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  assert.equal(response.headers.get('cache-control'),null);
  assert.equal((await response.json()).status,'INVALID_SELECTION');
 }
});
test('real GET entry points retain noindex without a Worker binding',async()=>{
 for(const response of [await calendarGET(),await passengerGET(new Request(`${origin}${endpoints[1]}?month=2026-10`)),await passengerGET(new Request(`${origin}${endpoints[1]}?month=bad`))]){
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
 }
});
test('the two public reads remain bounded and provider-free',()=>{
 for(const path of endpoints){
  const source=readFileSync(`app${path}/route.ts`,'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|refreshOfficialCalendars\s*\(|collectAirport/);
 }
 assert.match(readFileSync('lib/official-calendar-runtime.ts','utf8'),/FROM official_calendar_current ORDER BY country LIMIT 2/);
 assert.match(readFileSync('lib/airport-monthly-stats-read.ts','utf8'),/ORDER BY month DESC, operation_id LIMIT 4/);
});
