import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {canonicalCalendar,refreshOfficialCalendars,readOfficialCalendars,projectOfficialCalendars,CALENDAR_STALE_MS} from '../lib/official-calendar-runtime';
import type {CalendarEvent} from '../lib/calendar-context.mjs';
const now=new Date('2026-10-20T13:00:00Z');
const ics=(name='Synthetic Holiday',extra='')=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${Array.from({length:11},(_,i)=>`BEGIN:VEVENT\r\nUID:synthetic-${i}\r\nDTSTART;VALUE=DATE:2026${String(i+1).padStart(2,'0')}01\r\nSUMMARY:${name}\r\n${extra}END:VEVENT\r\n`).join('')}END:VCALENDAR\r\n`;
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0029_official_calendar_current.sql','utf8'));const prepare=(query:string)=>{let params:unknown[]=[];const statement={bind(...args:unknown[]){params=args;return statement;},async all(){return{success:true,results:sql.prepare(query).all(...params as never[])};},async run(){const result=sql.prepare(query).run(...params as never[]);return{success:true,meta:{changes:Number(result.changes)}};}};return statement;};return{sql,db:{prepare} as unknown as D1Database};}
const provider=(body=ics())=>(async (url:RequestInfo|URL,options?:RequestInit)=>{assert.equal(options?.redirect,'manual');return String(url).includes('opm.gov')?new Response(body):new Response('Denied',{status:403});}) as typeof fetch;
test('structured official calendar retains institutional scope and bounded years',()=>{const result=canonicalCalendar('US',Buffer.from(ics()),now);assert.equal(result.events.length,11);assert.equal(result.events[0].scope,'institutional');assert.match(result.events[0].region!,/연방공무원/);assert.equal(result.events[0].status,'verified');assert.deepEqual(result.coverage,[{country:'US',year:2026,scope:'institutional'}]);});
test('empty/partial years, cancelled events and block pages fail closed',()=>{for(const source of [ics().replaceAll('2026','2025'),ics().replace('END:VCALENDAR',''),ics('Synthetic Holiday','STATUS:CANCELLED\r\n'),'<html>captcha</html>'])assert.throws(()=>canonicalCalendar('US',Buffer.from(source),now));});
test('daily max2 provider requests, zero same-day calls, semantic payload preserved unchanged',async()=>{const {db,sql}=database();let calls=0;const fetcher=(async (...args:Parameters<typeof fetch>)=>{calls++;return provider()(...args);}) as typeof fetch;
 const result=await refreshOfficialCalendars(db,now,fetcher);assert.equal(calls,2);assert.equal(result.results.find(r=>r.country==='US')?.status,'VERIFIED');assert.equal(result.results.find(r=>r.country==='JP')?.status,'ERROR');
 const before=sql.prepare("SELECT payload,last_verified_at FROM official_calendar_current WHERE country='US'").get();
 const skipped=await refreshOfficialCalendars(db,now,fetcher);assert.equal(calls,2);assert.ok(skipped.results.every(r=>r.status==='SKIPPED_DAILY_GUARD'));
 const later=new Date(now.getTime()+86400000);const again=await refreshOfficialCalendars(db,later,fetcher);assert.equal(again.results.find(r=>r.country==='US')?.changedRows,0);const after=sql.prepare("SELECT payload,last_verified_at FROM official_calendar_current WHERE country='US'").get();assert.equal(after!.payload,before!.payload);assert.equal(after!.last_verified_at,later.toISOString());
 const rows=await readOfficialCalendars(db);assert.equal(projectOfficialCalendars(rows,[],later).events[0].verifiedAt,'2026-10-21');});
test('failed refresh preserves payload and real verification time, recovery from null succeeds',async()=>{const {db,sql}=database();await refreshOfficialCalendars(db,now,(async()=>new Response('',{status:403})) as typeof fetch);
 assert.equal(sql.prepare("SELECT payload FROM official_calendar_current WHERE country='US'").get()!.payload,null);
 const good=new Date(now.getTime()+86400000);await refreshOfficialCalendars(db,good,provider());const before=await readOfficialCalendars(db);
 await refreshOfficialCalendars(db,new Date(good.getTime()+86400000),provider('<html>Access denied</html>'));const after=await readOfficialCalendars(db);assert.equal(after.find(r=>r.country==='US')!.payload,before.find(r=>r.country==='US')!.payload);assert.equal(after.find(r=>r.country==='US')!.last_verified_at,good.toISOString());assert.equal(after.find(r=>r.country==='US')!.status,'ERROR');});
test('canonical replacement removes stale scoped dates, preserves schools and other countries; expiry is honest',async()=>{const {db}=database();await refreshOfficialCalendars(db,now,provider());const seed:CalendarEvent[]=[{id:'old',country:'US',scope:'institutional',region:'federal',name:'Old date',kind:'public_holiday',start:'2026-01-02',end:'2026-01-02',status:'verified',sourceURL:'https://www.opm.gov/',verifiedAt:'2026-10-19'},{id:'school',country:'US',scope:'regional',region:'NYC',name:'School',kind:'school_break',start:'2026-01-02',end:'2026-01-02',status:'verified',sourceURL:'https://schools.nyc.gov/',verifiedAt:'2026-10-19'}];
 const projection=projectOfficialCalendars(await readOfficialCalendars(db),seed,now);assert.equal(projection.events.some(e=>e.id==='old'),false);assert.equal(projection.events.some(e=>e.id==='school'),true);
 const stale=projectOfficialCalendars(await readOfficialCalendars(db),seed,new Date(now.getTime()+CALENDAR_STALE_MS+1));assert.equal(stale.sources.find(s=>s.country==='US')!.status,'STALE');assert.equal(stale.events.some(e=>e.id==='old'),false);assert.equal(stale.events.find(e=>e.id.startsWith('US-'))!.status,'expired');});
test('migration caps country set and read endpoint is provider-free',()=>{const {sql}=database();assert.throws(()=>sql.exec("INSERT INTO official_calendar_current(country,checked_at,status) VALUES('CN','2026-10-20','VERIFIED')"));const route=readFileSync('app/api/airport/calendar/route.ts','utf8');assert.doesNotMatch(route,/fetch\(|refreshOfficialCalendars\(/);});
test('public response keeps manual seed when storage absent and reports partial',async()=>{const {officialCalendarResponse}=await import('../app/api/airport/calendar/route');const response=await officialCalendarResponse(null,now);const value=await response.json();assert.equal(value.status,'PARTIAL');assert.ok(value.events.length>0);assert.ok(value.sources.every((s:{status:string})=>s.status==='NOT_COLLECTED'));assert.equal(value.cadenceHours,24);});
test('full holiday UI consumes changed official dates, retains regional calendars and shows limited coverage',async()=>{const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {AirportFocusData}=await import('../app/airport-focus-data');const {default:HolidayList}=await import('../app/airport-focus-holidays');const event:CalendarEvent={id:'JP-new',country:'JP',name:'새 공식 휴일',scope:'national',kind:'public_holiday',start:'2026-11-04',end:'2026-11-04',status:'verified',sourceURL:'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',verifiedAt:'2026-10-20'};
 const html=renderToStaticMarkup(React.createElement(AirportFocusData.Provider,{value:{asOf:'2026-10-20',trends:[],checkedAt:null,preview:false,failed:false,calendarEvents:[event],calendarReplacementScopes:[{country:'JP',year:2026,scope:'national'}]}},React.createElement(HolidayList,{full:true})));
 assert.match(html,/새 공식 휴일/);assert.match(html,/2026-11-04/);assert.doesNotMatch(html,/문화의 날/);assert.match(html,/괌/);assert.match(html,/자동 신규 반영 전/);
});

test('general notice baseline is quiet; real calendar change is atomic and unchanged polls keep its identity/time',async()=>{
 const {db,sql}=database();await refreshOfficialCalendars(db,now,provider());
 assert.deepEqual(projectOfficialCalendars(await readOfficialCalendars(db),[],now).changes,[]);
 const changed=new Date(now.getTime()+86400000),body=ics().replace('20260101','20260102');
 await refreshOfficialCalendars(db,changed,provider(body));
 const first=projectOfficialCalendars(await readOfficialCalendars(db),[],changed).changes;
 assert.equal(first.length,1);assert.equal(first[0].country,'US');assert.equal(first[0].changedAt,changed.toISOString());assert.match(first[0].id,/^[a-f0-9]{64}$/);
 const stored=sql.prepare("SELECT payload FROM official_calendar_current WHERE country='US'").get()!.payload;
 const next=new Date(changed.getTime()+86400000);await refreshOfficialCalendars(db,next,provider(body));
 assert.deepEqual(projectOfficialCalendars(await readOfficialCalendars(db),[],next).changes,first);
 assert.equal(sql.prepare("SELECT payload FROM official_calendar_current WHERE country='US'").get()!.payload,stored);
});
test('row order and verification clocks do not become calendar change notices or payload rewrites',async()=>{
 const {db,sql}=database();await refreshOfficialCalendars(db,now,provider());
 const stored=sql.prepare("SELECT payload FROM official_calendar_current WHERE country='US'").get()!.payload;
 const blocks=ics().match(/BEGIN:VEVENT[\s\S]*?END:VEVENT\r\n/g)!;
 const reversed=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${blocks.reverse().join('')}END:VCALENDAR\r\n`;
 const next=new Date(now.getTime()+86400000);await refreshOfficialCalendars(db,next,provider(reversed));
 assert.deepEqual(projectOfficialCalendars(await readOfficialCalendars(db),[],next).changes,[]);
 assert.equal(sql.prepare("SELECT payload FROM official_calendar_current WHERE country='US'").get()!.payload,stored);
});
test('automatic past-year retention is not announced as a changed holiday schedule',async()=>{
 const {db}=database();const body=ics().replace('END:VCALENDAR','').replace('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n','');
 const source=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${[2025,2026,2027].map(year=>body.replaceAll('2026',String(year))).join('')}END:VCALENDAR\r\n`;
 await refreshOfficialCalendars(db,now,provider(source));
 const next=new Date('2027-01-01T13:00:00Z');await refreshOfficialCalendars(db,next,provider(source));
 assert.deepEqual(projectOfficialCalendars(await readOfficialCalendars(db),[],next).changes,[]);
});
test('calendar cancellation remains review only; stale, failed and invalid notice metadata are not published',async()=>{
 const {db,sql}=database();await refreshOfficialCalendars(db,now,provider());
 const changed=new Date(now.getTime()+86400000);await refreshOfficialCalendars(db,changed,provider(ics().replace('20260101','20260102')));
 const before=(await readOfficialCalendars(db)).find(row=>row.country==='US')!;
 const next=new Date(changed.getTime()+86400000);await refreshOfficialCalendars(db,next,provider(ics('Synthetic Holiday','STATUS:CANCELLED\r\n')));
 const projected=projectOfficialCalendars(await readOfficialCalendars(db),[],next);
 assert.deepEqual(projected.changes,[]);assert.equal(projected.sources.find(source=>source.country==='US')!.status,'REVIEW_REQUIRED');
 assert.equal((await readOfficialCalendars(db)).find(row=>row.country==='US')!.payload,before.payload);
 assert.deepEqual(projectOfficialCalendars([before],[],new Date(changed.getTime()+CALENDAR_STALE_MS+1)).changes,[]);
 const payload=JSON.parse(before.payload!);payload.lastChange={id:'not-a-hash',changedAt:changed.toISOString()};
 sql.prepare("UPDATE official_calendar_current SET payload=?,status='VERIFIED' WHERE country='US'").run(JSON.stringify(payload));
 assert.deepEqual(projectOfficialCalendars(await readOfficialCalendars(db),[],next).changes,[]);
});
test('a concurrent semantic write cannot be overwritten using a stale before-image or lose its notice',async()=>{
 const {db}=database();await refreshOfficialCalendars(db,now,provider());
 const earlier=new Date(now.getTime()+86400000),later=new Date(earlier.getTime()+1000);let race=false;
 const concurrent=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(String(input).includes('opm.gov')&&!race){race=true;await refreshOfficialCalendars(db,earlier,provider(ics().replace('20260101','20260102')));}
  return provider()(input,init);
 }) as typeof fetch;
 const result=await refreshOfficialCalendars(db,later,concurrent);
 assert.equal(result.results.find(row=>row.country==='US')!.status,'SKIPPED_CONCURRENT_CHANGE');
 const projected=projectOfficialCalendars(await readOfficialCalendars(db),[],later);
 assert.ok(projected.events.some(event=>event.start==='2026-01-02'));assert.equal(projected.changes[0].changedAt,earlier.toISOString());
});
test('normalizing a legacy order-sensitive hash does not fabricate the first change notice',async()=>{
 const {db,sql}=database();await refreshOfficialCalendars(db,now,provider());
 sql.prepare("UPDATE official_calendar_current SET semantic_hash=? WHERE country='US'").run('f'.repeat(64));
 const next=new Date(now.getTime()+86400000);await refreshOfficialCalendars(db,next,provider());
 assert.deepEqual(projectOfficialCalendars(await readOfficialCalendars(db),[],next).changes,[]);
});
