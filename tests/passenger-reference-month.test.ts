import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passengerReferenceMonth,readPassengerReferenceMonth} from '../lib/passenger-reference-month';
import {datesBetween} from '../lib/airport-mtd';
import {shiftKstDay} from '../lib/kst';
const days=datesBetween('2026-09-01','2026-09-30');
const forecasts=days.flatMap(day=>(['T1','T2']).flatMap(terminal=>Array.from({length:24},(_,h)=>({terminal,direction:'departure',isAggregate:1,targetDate:day,timeBandRaw:String(h),targetStartAt:`${day}T${String(h).padStart(2,'0')}:00:00+09:00`,targetEndAt:h===23?`${shiftKstDay(day,1)}T00:00:00+09:00`:`${day}T${String(h+1).padStart(2,'0')}:00:00+09:00`,expectedPassengers:terminal==='T1'?100:50,retrievedAt:day+'T00:00:00Z'}))));
const transfers=days.flatMap(serviceDate=>[{serviceDate,terminal:'T1',expectedTransferPassengers:100},{serviceDate,terminal:'T2',expectedTransferPassengers:200}]);
test('full previous calendar month compares the same departure+transfer forecast basis',()=>{
 const all=passengerReferenceMonth('2026-09',forecasts,transfers,'all');assert.equal(all.mean,3900);assert.equal(all.expectedDays,30);assert.equal(all.completeDays,30);assert.equal(all.status,'COMPLETE');
 assert.equal(passengerReferenceMonth('2026-09',forecasts,transfers,'T1').mean,2500);
 assert.equal(passengerReferenceMonth('2026-09',forecasts,transfers,'T2').mean,1400);
});
test('missing transfer or departure band withholds mean, not zero or a partial-month mean',()=>{
 for(const [f,t] of [[forecasts,transfers.slice(1)],[forecasts.slice(1),transfers]] as const){const r=passengerReferenceMonth('2026-09',f,t,'all');assert.equal(r.mean,null);assert.equal(r.completeDays,29);assert.equal(r.status,'PARTIAL');assert.deepEqual(r.missingDates,['2026-09-01']);}
});
test('wrong dates and duplicate terminal transfers cannot create a complete sum',()=>{
 assert.equal(passengerReferenceMonth('2026-09',forecasts,[...transfers,transfers[0]],'all').mean,null);
 assert.equal(passengerReferenceMonth('2026-09',forecasts,transfers.map(r=>({...r,serviceDate:'2026-08-01'})),'all').status,'UNAVAILABLE');
});
test('zero is legitimate and leap February counts real calendar days',()=>{
 assert.equal(passengerReferenceMonth('2028-02',[],[],'all').expectedDays,29);
 assert.throws(()=>passengerReferenceMonth('2026-13',[],[],'all'));
 const zeros=passengerReferenceMonth('2026-09',forecasts.map(r=>({...r,expectedPassengers:0})),transfers.map(r=>({...r,expectedTransferPassengers:0})),'all');assert.equal(zeros.mean,0);
});
test('bounded reader rejects failed or truncated reads and uses exact indexed forecast dates',async()=>{
 await assert.rejects(readPassengerReferenceMonth({} as never,'0000-09'),/Exact month/);
 const queries:string[]=[];const db={prepare(sql:string){queries.push(sql);return {bind(){return {all:async()=>({success:true,results:sql.includes('airport_transfer_forecast')?transfers:forecasts})};}};}};
 assert.equal((await readPassengerReferenceMonth(db as never,'2026-09')).all.mean,3900);
 assert.equal(queries.length,2);assert.match(queries[0],/target_date IN/);assert.match(queries[0],/LIMIT 1601/);assert.match(queries[1],/LIMIT 63/);
 const failed={prepare(){return {bind(){return {all:async()=>({success:false,results:[]})};}};}};await assert.rejects(readPassengerReferenceMonth(failed as never,'2026-09'));
});
test('SQLite production-schema plans use indexes for both bounded reference reads',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {readFileSync,readdirSync}=await import('node:fs');const sqlite=new DatabaseSync(':memory:');
 try{for(const path of readdirSync('drizzle').filter(p=>p.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+path,'utf8'));
  const plans:string[]=[];const db={prepare(sql:string){return {bind(...values:unknown[]){return {all:async()=>{plans.push(...sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(...values as never[]).map(row=>String(row.detail)));return {success:true,results:[]};}};}};}};
  await readPassengerReferenceMonth(db as never,'2026-09');assert.ok(plans.some(plan=>/SEARCH airport_passenger_forecast USING INDEX/.test(plan)));assert.ok(plans.some(plan=>/SEARCH airport_transfer_forecast USING INDEX/.test(plan)));assert.ok(plans.every(plan=>!/^SCAN airport_/.test(plan)));
 }finally{sqlite.close();}
});
