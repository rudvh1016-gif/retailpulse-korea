import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {isExactDate,matchCalendarContext} from '../lib/calendar-context.mjs';
import data from '../data/official-calendar/priority-country-multiyear.json';
import {officialCalendarResponse} from '../app/api/airport/calendar/route';
const events=data.events;
const rows=(country:string,year:number)=>events.filter(event=>event.country===country&&event.start.startsWith(`${year}-`));
test('only bounded reviewed country-years, valid dates and government sources are stored',()=>{
 assert.equal(events.length,83);assert.equal(data.automaticCollectionEnabled,false);
 assert.equal(new Set(events.map(event=>event.id)).size,83);
 for(const e of events){assert.ok(isExactDate(e.start)&&isExactDate(e.end)&&e.start<=e.end);assert.ok(['2025','2026','2027'].includes(e.start.slice(0,4)));assert.equal(e.status,'verified');assert.equal(e.verifiedAt,'2026-10-21');assert.equal(e.kind,'public_holiday');assert.ok(e.scope==='national'||('region' in e&&e.region));assert.ok(e.sourceIds.length);for(const id of e.sourceIds)assert.ok(id in data.sources);assert.ok(/\.(gov\.cn|chinhphu\.vn|cdnchinhphu\.vn|bot\.or\.th)$/.test(new URL(e.sourceURL).hostname));}
});
test('China includes exact published annual intervals and separate makeup workdays, not a fabricated 2027 calendar',()=>{
 assert.deepEqual(rows('CN',2025).map(e=>[e.start,e.end]),[['2025-01-01','2025-01-01'],['2025-01-28','2025-02-04'],['2025-04-04','2025-04-06'],['2025-05-01','2025-05-05'],['2025-05-31','2025-06-02'],['2025-10-01','2025-10-08']]);
 assert.equal(rows('CN',2026).length,7);assert.equal(rows('CN',2027).length,0);
 assert.deepEqual(events.find(e=>e.country==='CN'&&e.start==='2026-02-15')?.makeupWorkdays,['2026-02-14','2026-02-28']);
 assert.deepEqual(events.find(e=>e.country==='CN'&&e.start==='2026-10-01')?.makeupWorkdays,['2026-09-20','2026-10-10']);
 for(const e of events.filter(e=>e.country==='CN')){assert.equal(e.scope,'national');assert.match(e.notes,/법정일·주휴일·조정 휴무/);for(const day of e.makeupWorkdays)assert.ok(day<e.start||day>e.end);}
});
test('Vietnam 2027 approved periods retain institutional scope and compensatory weekly-rest distinction',()=>{
 const future=rows('VN',2027);assert.deepEqual(future.map(e=>[e.start,e.end]),[['2027-02-04','2027-02-10'],['2027-09-02','2027-09-05']]);
 for(const e of future){assert.equal(e.scope,'institutional');assert.ok('region' in e&&e.region?.includes('공공기관'));assert.match(e.notes,/민간 전체.*아니/);}
 const tet=future[0];assert.equal('statutoryDays' in tet&&tet.statutoryDays,5);assert.equal('compensatoryWeeklyRestDays' in tet&&tet.compensatoryWeeklyRestDays,2);
 assert.ok(!future.some(e=>e.name.includes('흥왕')));assert.ok(!events.some(e=>e.start==='2026-11-23'));
 assert.equal(events.find(e=>e.country==='VN'&&e.start==='2026-11-24')?.end,'2026-11-24');
});
test('Thailand current official financial calendars contain 19/20/18 dates, with Bangkok-only and substitute limits',()=>{
 for(const [year,count] of [[2025,19],[2026,20],[2027,18]])assert.equal(rows('TH',year).length,count);
 for(const e of events.filter(e=>e.country==='TH')){assert.equal(e.scope,'institutional');assert.ok('region' in e&&e.region?.includes('금융기관'));assert.equal(e.start,e.end);assert.match(e.notes,/금융기관/);}
 const bangkok=events.find(e=>e.country==='TH'&&e.start==='2026-10-16');assert.ok(bangkok&&'region' in bangkok&&bangkok.region?.startsWith('방콕'));
 assert.ok(!events.some(e=>e.country==='TH'&&['2026-10-12','2026-10-14','2026-10-15'].includes(e.start)));
 assert.ok(rows('TH',2027).some(e=>e.start==='2027-02-22'));assert.ok(!rows('TH',2027).some(e=>e.start==='2027-02-21'));
 assert.ok(rows('TH',2027).some(e=>e.start==='2027-10-25'));assert.ok(!rows('TH',2027).some(e=>e.start==='2027-10-23'));
 assert.equal(data.sources.th2027.effectiveFrom,'2026-08-26');assert.equal(data.sources['th2025-current'].effectiveFrom,null);
});
test('server projection preserves reviewed existing IDs, schools and KR without duplicating country/date/scope',async()=>{
 const response=await officialCalendarResponse(null,new Date('2026-10-21T00:00:00Z'));const value=await response.json();
 assert.equal(value.manualCalendarReview.automaticCollectionEnabled,false);assert.equal(value.manualCalendarReview.coverage.length,3);
 assert.equal(value.events.filter((e:{country:string})=>e.country==='KR').length,46);
 assert.ok(value.events.some((e:{id:string})=>e.id==='CN-2026-07-01-2'));
 assert.equal(value.events.filter((e:{country:string;start:string;end:string;scope:string})=>e.country==='CN'&&e.start==='2026-09-25'&&e.end==='2026-09-27'&&e.scope==='national').length,1);
 assert.equal(value.events.find((e:{id:string})=>e.id==='CN-2026-09-25-0').verifiedAt,'2026-10-21');
 assert.equal(value.events.filter((e:{id:string})=>e.id==='VN-all-2026-11-24-culture').length,1);
 assert.ok(!value.events.some((e:object)=>'sourceIds' in e||'calendarDataSHA256' in e));
 const query={country:'VN',selectedMonth:'2027-02',actualDataMonths:['2027-02'],asOf:'2026-10-21'};
 assert.equal(matchCalendarContext(value.events,query).details.length,1);
 assert.equal(matchCalendarContext(value.events,{...query,asOf:'2026-10-20'}).details.length,0);
});
test('multi-year evidence remains server-only and does not enlarge client preview JSON',()=>{
 const scan=(path:string):string[]=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?scan(`${path}/${entry.name}`):/\.(tsx?|mjs)$/.test(entry.name)?[`${path}/${entry.name}`]:[]);
 const imports=scan('app').filter(path=>readFileSync(path,'utf8').includes('priority-country-multiyear.json'));
 assert.deepEqual(imports,['app/api/airport/calendar/route.ts']);
 assert.ok(Buffer.byteLength(JSON.stringify(data))<75000);
});
