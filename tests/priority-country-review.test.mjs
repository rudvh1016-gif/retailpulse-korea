import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const full=read('data/airport-focus-preview/holidays.json');
const brief=read('data/airport-focus-preview/holidays-summary.json');
const allowances=read('data/airport-focus-preview/arrival-allowances.json');
test('Vietnam Culture Day is one legally confirmed day, not a proposed four-day bridge',()=>{
 const event=full.events.find(row=>row.id==='VN-all-2026-11-24-culture');
 assert.equal(event.start,'2026-11-24');assert.equal(event.end,'2026-11-24');
 assert.equal(event.type,'public_holiday');assert.equal(event.status,'OFFICIAL_DATE_CONFIRMED');
 assert.match(event.notes,/2026-07-01/);assert.match(event.sourceURL,/cdnchinhphu\.vn/);
 const context=read('data/airport-focus-preview/calendar-context.json').events.find(row=>row.id===event.id);
 assert.equal(context.scope,'national');assert.equal(context.verifiedAt,'2026-10-21');
 assert.equal(context.start,context.end);assert.equal(context.sourceURL,event.sourceURL);
});
test('Thai reviewed bank holidays stay institutional and never become national private-sector holidays',()=>{
 const dates=['2026-10-23','2026-12-07','2026-12-10','2026-12-31'];
 for(const date of dates){
  const event=full.events.find(row=>row.country==='TH'&&row.start===date);
  assert.ok(event);assert.equal(event.start,event.end);assert.equal(event.type,'bank_holiday');
  assert.equal(event.calendarScope,'institutional');assert.match(event.scope,/금융기관/);
  assert.match(event.description_ko,/민간.*전체.*뜻하지/);
  assert.equal(brief.events.find(row=>row.id===event.id).calendarScope,'institutional');
 }
 assert.equal(full.events.filter(row=>row.country==='TH'&&row.type==='public_holiday').length,0);
});
test('Chinese 2027 annual arrangement remains unverified instead of extending January 1',()=>{
 const event=full.events.find(row=>row.id==='CN-all-2027-01-01-major');
 assert.equal(event.start,event.end);assert.match(event.scope,/연결 연휴.*미확인/);
 assert.equal(event.checkedAt,'2026-10-19T16:48:00Z','403 did not renew the original review');
});
test('manual customs review preserves confirmed numbers, unresolved perfume and Thai age/effective date',()=>{
 for(const id of ['CN','VN','TH']){
  const c=allowances.countries.find(row=>row.id===id);
  assert.equal(c.checkedAt,'2026-10-21');assert.match(c.notes.join(' '),/수동 재확인/);
  assert.equal(c.effectiveDate,null);
  assert.ok(c.results.every(r=>r.facts.every(f=>f.label!=='향수')),'no independent perfume quota was verified');
 }
 const text=id=>JSON.stringify(allowances.countries.find(row=>row.id===id));
 assert.match(text('CN'),/CNY 5,000/);assert.match(text('CN'),/CNY 2,000/);
 assert.match(text('VN'),/VND 10,000,000/);assert.match(text('VN'),/20% 이상 1.5L/);
 assert.match(text('TH'),/THB 20,000/);assert.match(text('TH'),/연령.*명시되지/);
 assert.match(text('TH'),/시행일 미확인/);
 const manifest=read('config/customs-allowance-sources.json');
 for(const s of manifest.sources.filter(s=>['CN','VN','TH'].includes(s.jurisdiction))){assert.equal(s.accessReview,null);assert.equal(s.baseline,null);}
});
test('priority additions retain explicitly incomplete representative coverage',()=>{
 assert.equal(full.coverage.dateRecords,full.events.length);
 assert.equal(Object.values(full.coverage.methodCounts).reduce((a,b)=>a+b,0),full.events.length);
 for(const label of ['중국','베트남','태국'])assert.equal(full.jurisdictionReview.find(r=>r.label===label).fullWindowCompletenessVerified,false);
 assert.equal(full.priorityReview.automaticCollectionEnabled,false);
});
