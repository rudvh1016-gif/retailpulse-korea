import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationEvents,preparationEventsInMonth,preparationEventsOn} from '../lib/preparation-calendar';
test('verified major events have exact dates, sources, and no holiday or annual-repeat claim',()=>{
 const before=preparationEvents('2026-10-28');assert.equal(before.filter(row=>row.kind==='major_event').length,0);
 const all=preparationEvents('2026-10-29');const major=all.filter(row=>row.kind==='major_event');assert.equal(major.length,2);
 const exam=major.find(row=>row.id==='KR-2026-CSAT')!,festival=major.find(row=>row.id==='KR-2026-KOREA-GRAND-FESTIVAL')!;
 assert.deepEqual([exam.start,exam.end,exam.verifiedAt],['2026-11-19','2026-11-19','2026-10-29']);
 assert.match(exam.scope,/공휴일 아님/);assert.match(exam.description_ko,/13:10–13:35 KST/);assert.match(exam.notes!,/지연.*확정하지/);
 assert.match(exam.sourceURL,/moe\.go\.kr/);assert.match(exam.supportingSourceURL!,/korea\.kr/);
 assert.deepEqual([festival.start,festival.end],['2026-10-29','2026-11-15']);assert.match(festival.description_ko,/매장.*참여 여부.*확인/);assert.match(festival.sourceURL,/mois\.go\.kr/);
 for(const date of ['2026-10-29','2026-11-01','2026-11-15'])assert.ok(preparationEventsOn(all,date).some(row=>row.id===festival.id));
 for(const date of ['2026-10-28','2026-11-16','2027-11-19'])assert.ok(!preparationEventsOn(all,date).some(row=>row.id===festival.id||row.id===exam.id));
 assert.ok(preparationEventsInMonth(all,'2026-11').some(row=>row.id===exam.id));
 assert.ok(major.every(row=>!row.isRepresentative));
});
