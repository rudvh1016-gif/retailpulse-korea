import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFlightProfile, type ProfileRow } from '../lib/airport-day-profile';
import { terminalDay } from '../lib/airport-day-compare';
import { verifiedHalfHours } from '../lib/airport-flight-hours';
import { buildShiftBriefing, type ShiftBriefingInput, type ShiftHistoryRow } from '../lib/shift-briefing';
import { shiftKstDay } from '../lib/kst';
import { airportHistoryPayload } from '../app/airport-history-client';

const day='2026-11-04',at=day+'T00:24:00+09:00';
const row=(date:string,id:string,time:string,extra:Partial<ProfileRow>={}):ProfileRow=>({
 physicalFlightId:id,terminal:'T2',gate:'250',scheduledAt:`${date}T${time}+09:00`,retrievedAt:at,status:'scheduled',airportCode:'NRT',...extra,
});
const times=['06:29:59','06:30:00','07:30:00','15:29:59','15:30:00','23:59:59'];
function history(date:string):ShiftHistoryRow{
 const p=dailyFlightProfile(times.map((time,i)=>row(date,String(i),time)),date,true);
 return {T1:terminalDay(p,'T1'),T2:terminalDay(p,'T2')};
}
function input():ShiftBriefingInput{return {
 day,nowIso:day+'T00:35:00+09:00',terminal:'T2',side:null,hours:{open:'06:30',close:'15:30'},
 flights:{mode:'live-flights',serviceDateKst:day,retrievedAt:at,truncated:false,basis:'COLLECTED_FLIGHT_RECORDS',flights:times.map((time,i)=>row(day,String(i),time))},
 weekReference:{day,previousDay:'2026-10-28',passengers:{all:null,T1:null,T2:null},flights:null,selectedFlights:{all:6,T1:0,T2:6,CONCOURSE:0},selectedFlightSnapshot:{day,retrievedAt:at,provisional:true}},
 history:Array.from({length:31},(_,i)=>history(`2026-10-${String(i+1).padStart(2,'0')}`)),
};}

test('November 4 half-hour shift uses exact October 28 and all 31 October dates',()=>{
 const result=buildShiftBriefing(input());
 assert.equal(result.current.total,3);assert.equal(result.comparisons.week.baseline,3);
 assert.equal(result.comparisons.week.start,'2026-10-28');assert.equal(result.comparisons.month.baseline,3);
 assert.equal(result.comparisons.month.includedDates.length,31);assert.equal(result.status,'NO_CHANGE');
});

test('half-hour profiles retain newest physical record, cancellations and exact midnight boundaries',()=>{
 const rows=[row(day,'changed','06:29:59',{retrievedAt:'2026-11-03T10:00:00Z'}),row(day,'changed','06:30:00'),
  row(day,'cancel','15:29:59',{status:'cancelled'}),row(day,'end','15:30:00'),row(day,'last','23:59:59'),
  row(shiftKstDay(day,1),'tomorrow','00:00:00')];
 const p=dailyFlightProfile(rows,day,true),bins=verifiedHalfHours(p.T2)!;
 assert.equal(p.T2.total,3);assert.equal(p.cancelled,1);assert.equal(bins[12],0);assert.equal(bins[13],1);
 assert.equal(bins[30],0);assert.equal(bins[31],1);assert.equal(bins[47],1);
 assert.equal(bins.reduce((a,b)=>a+b,0),3);
});

test('T1 precise history includes concourse only when both arrays are valid',()=>{
 const p=dailyFlightProfile([row(day,'main','06:30:00',{terminal:'T1',gate:'26'}),row(day,'annex','06:45:00',{terminal:'CONCOURSE',gate:'101'}),row(day,'t2','06:30:00')],day,true);
 assert.equal(terminalDay(p,'T1').halfHours?.[13],2);assert.equal(terminalDay(p,'T2').halfHours?.[13],1);
 delete p.CONCOURSE.halfHours;assert.equal(terminalDay(p,'T1').halfHours,undefined);assert.equal(terminalDay(p,'T1').hours[6],2);
});

test('invalid precision cannot pass equal total with wrong hourly pairs or malformed source clocks',()=>{
 const p=history('2026-10-28').T2;
 const invalid=[[],Array(48).fill(0),p.halfHours!.map((n,i)=>i===0?-1:n),p.halfHours!.map((n,i)=>i===0?.5:n),p.halfHours!.map((n,i)=>i===0?NaN:n)];
 const misplaced=[...p.halfHours!];misplaced[13]--;misplaced[15]++;invalid.push(misplaced);
 for(const halfHours of invalid){assert.equal(verifiedHalfHours({...p,halfHours}),null);const value=input();value.history=[{T1:p,T2:{...p,halfHours}}];assert.equal(buildShiftBriefing(value).comparisons.week.reason,'BASELINE_INVALID');}
 for(const scheduledAt of [day+'T06:60:00+09:00',day+'T06:30:00Z']){
  const value=dailyFlightProfile([row(day,'bad','06:30:00',{scheduledAt})],day,true);
  assert.equal(value.T2.halfHours,undefined);
 }
});

test('legacy hourly data stays valid for whole hours and missing precision is never zero-filled',()=>{
 const value=input();for(const entry of value.history!)for(const part of [entry.T1,entry.T2])delete part.halfHours;
 const missing=buildShiftBriefing(value);assert.equal(missing.comparisons.week.reason,'MINUTE_HISTORY_MISSING');assert.equal(missing.comparisons.month.baseline,null);
 value.hours={open:'06:00',close:'16:00'};assert.equal(buildShiftBriefing(value).comparisons.month.status,'READY');
 value.hours={open:'06:15',close:'15:30'};assert.equal(buildShiftBriefing(value).comparisons.week.reason,'UNSUPPORTED_MINUTE_HISTORY');
});

test('partial precision, duplicate dates and incomplete profiles preserve actual denominator and reasons',()=>{
 const value=input();const rows=value.history!.map(entry=>structuredClone(entry));
 delete rows[0].T2.halfHours;rows[1].T2.complete=false;rows.push(structuredClone(rows[2]));value.history=rows;
 const result=buildShiftBriefing(value).comparisons.month;
 assert.equal(result.status,'PARTIAL');assert.equal(result.includedDates.length,28);assert.equal(result.baseline,3);
 assert.deepEqual(result.missingDates,['2026-10-01','2026-10-02','2026-10-03']);assert.deepEqual(result.excludedDates,result.missingDates);
});

test('verified zero terminal shifts are measured zeros while absent days remain missing',()=>{
 const value=input();value.hours={open:'00:00',close:'00:30'};
 const zero=buildShiftBriefing(value);assert.equal(zero.current.total,0);assert.equal(zero.comparisons.week.baseline,0);assert.equal(zero.comparisons.week.percent,null);
 value.history=[];assert.equal(buildShiftBriefing(value).comparisons.week.reason,'BASELINE_MISSING');
});

test('exact week and previous month keep KST year and leap-day boundaries',()=>{
 for(const [selected,week,month,end] of [['2027-01-01','2026-12-25','2026-12-01','2026-12-31'],['2028-03-01','2028-02-23','2028-02-01','2028-02-29']]){
  const value=buildShiftBriefing({...input(),day:selected,flights:null});assert.equal(value.comparisons.week.start,week);assert.equal(value.comparisons.month.start,month);assert.equal(value.comparisons.month.end,end);
 }
});


test('public projection preserves invalid precision as null, separately from absent legacy history',()=>{
 const profile=dailyFlightProfile(times.map((time,i)=>row('2026-10-28',String(i),time)),'2026-10-28',true);
 profile.T2.halfHours![13]--;profile.T2.halfHours![15]++;
 const projected={T1:terminalDay(profile,'T1'),T2:terminalDay(profile,'T2')};
 assert.equal(projected.T2.halfHours,null);
 const payload=airportHistoryPayload(JSON.parse(JSON.stringify({mode:'airport-days',date:day,history:[projected]})),day);
 assert.equal(payload!.history[0].T2.halfHours,null);
 assert.equal(buildShiftBriefing({...input(),history:payload!.history}).comparisons.week.reason,'BASELINE_INVALID');
 delete profile.T2.halfHours;
 assert.equal(terminalDay(profile,'T2').halfHours,undefined);
 assert.equal(buildShiftBriefing({...input(),history:[{...projected,T2:terminalDay(profile,'T2')}]}).comparisons.week.reason,'MINUTE_HISTORY_MISSING');
 profile.T1.halfHours![0]=1;delete profile.CONCOURSE.halfHours;
 assert.equal(terminalDay(profile,'T1').halfHours,null);
});
