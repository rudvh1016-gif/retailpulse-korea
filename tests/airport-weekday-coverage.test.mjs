import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,compareWeekdayRanges} from '../lib/airport-period/analysis.mjs';
const profile=(day,total=24,complete=true)=>({day,total,complete,hours:Array.from({length:24},(_,i)=>i===0?total:0)});
const record=(date,total=24,complete=true)=>({T1:profile(date,total,complete),T2:profile(date,total,complete)});
const ranges={aStart:'2026-10-01',aEnd:'2026-10-31',bStart:'2026-11-01',bEnd:'2026-11-02'};
test('month start distinguishes absent weekdays from missing collection; zero remains real data',()=>{
 const days=normalize({history:[record('2026-10-05'),record('2026-11-01'),record('2026-11-02',0)]}).days;
 const m=compareWeekdayRanges(days,'ALL',ranges),b=m.weekdays.current.bins;
 assert.equal(b[0].n,1);assert.equal(b[0].mean,0);assert.equal(b[0].status,'complete');
 assert.equal(b[1].expected,0);assert.equal(b[1].mean,null);assert.equal(b[1].status,'not-in-range');
 assert.equal(m.weekdays.previous.bins[0].expected,4);assert.equal(m.weekdays.previous.bins[0].status,'partial');
 assert.equal(m.weekdays.previous.bins[1].status,'missing');
});
test('incomplete, duplicate, corrupt and absent records never become zero or substitute historical values',()=>{
 const broken=record('2026-11-02');broken.T2.hours[0]=1;
 const history=[record('2026-10-05'),record('2026-11-01',24,false),broken,record('2026-11-02'),record('2026-11-02')];
 const m=compareWeekdayRanges(normalize({history}).days,'ALL',ranges);
 assert.equal(m.available,false);assert.equal(m.current.total,null);
 assert.equal(m.weekdays.current.bins[0].status,'missing');assert.equal(m.weekdays.current.bins[0].mean,null);
 assert.deepEqual(m.weekdays.current.bins[0].missing,['2026-11-02']);
 const empty=compareWeekdayRanges([],'ALL',ranges);assert.equal(empty.weekdays.current.bins[6].status,'missing');
});
