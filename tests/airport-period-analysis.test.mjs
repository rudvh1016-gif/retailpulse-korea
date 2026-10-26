import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, comparePeriods, weekdayProfile, peakWindow, holidayComparison, rate, terminalMix, hourlyShares } from '../lib/airport-period/analysis.mjs';
import * as analysis from '../lib/airport-period/analysis.mjs';

const hours = (n, slot=8) => Array.from({length:24},(_,i)=>i===slot?n:0);
const record = (date,a=10,b=20,complete=true) => ({T1:{day:date,total:a,hours:hours(a),complete},T2:{day:date,total:b,hours:hours(b),complete}});
const iso = n => new Date(Date.UTC(2026,9,n)).toISOString().slice(0,10);
const days = (n=28) => normalize({history:Array.from({length:n},(_,i)=>record(iso(i+1)))}).days;

test('incomplete, impossible dates and inconsistent hourly totals cannot enter comparisons',()=>{
  const malformed=record('2026-10-03'); malformed.T1.hours[8]=9;
  const actual=normalize({history:[record('2026-10-01'),record('2026-10-02',10,20,false),malformed,record('2026-02-30')]});
  assert.deepEqual(actual.days.map(d=>d.date),['2026-10-01']); assert.equal(actual.excluded,3);
});
test('duplicate dates are excluded instead of double counted or arbitrarily selected',()=>{
  assert.equal(normalize({history:[record('2026-10-01'),record('2026-10-01',20)]}).days.length,0);
});
test('a missing comparison date removes both matched weekdays, not one denominator',()=>{
  const data=days(14).filter(d=>d.date!=='2026-10-03');
  const actual=comparePeriods(data,'ALL',7);
  assert.equal(actual.n,6); assert.equal(actual.previous.total,30); assert.equal(actual.current.total,30);
  assert.equal(actual.current.dates.includes('2026-10-10'),false);
  assert.deepEqual(actual.excludedDates,['2026-10-10']);
});
test('the profile is a daily mean with the same denominator for each hour',()=>{
  const data=normalize({history:Array.from({length:14},(_,i)=>record(iso(i+1),i<7?10:20,20))}).days;
  const actual=comparePeriods(data,'ALL',7);
  assert.equal(actual.current.total,40); assert.equal(actual.previous.total,30);
  assert.equal(actual.current.hours[8],40); assert.equal(actual.change,100/3);
});
test('weekday averages use complete seven-day weeks only',()=>{
  const data=days(28).filter(d=>d.date!=='2026-10-20');
  const actual=weekdayProfile(data,'T1',4);
  assert.equal(actual.completeWeeks,3); assert.deepEqual(actual.bins.map(b=>b.n),[3,3,3,3,3,3,3]);
  assert.equal(actual.weekendMean,10); assert.equal(actual.weekdayMean,10);
});
test('three-hour peak includes the full span, ties are reported, zero days have no peak',()=>{
  const h=Array(24).fill(0); h[7]=2;h[8]=5;h[9]=3;
  assert.deepEqual(peakWindow(h),{start:7,end:10,total:10,share:1,ties:1});
  assert.equal(peakWindow(Array(24).fill(0)),null);
});
test('terminal shares use flight totals, not mean daily percentages',()=>{
  const mix=terminalMix([{T1:90,T2:10},{T1:0,T2:10}]);
  assert.equal(mix.T1,90/110); assert.equal(mix.T2,20/110);
});
test('holiday comparison drops missing dates on both sides and preserves explicit zeros',()=>{
  const rows=[{country:'CN',date:'2026-09-24',value:10,complete:true},{country:'CN',date:'2026-10-01',value:20,complete:true},{country:'CN',date:'2026-09-25',value:0,complete:true},{country:'CN',date:'2026-10-02',value:0,complete:true},{country:'CN',date:'2026-10-03',value:null,complete:false}];
  const a=holidayComparison(rows);
  assert.equal(a.n,2);assert.equal(a.beforeMean,5);assert.equal(a.eventMean,10);assert.equal(a.change,100);
  assert.equal(a.points[2].event,null);
});
test('zero baseline and non-finite values never generate an increase percentage',()=>{
  assert.equal(rate(1,0),null);assert.equal(rate(0,10),-100);assert.equal(rate(NaN,2),null);
});

test('hourly shares separate distribution from the size of the day',()=>{
  const a=Array(24).fill(0);a[8]=30;a[19]=70;
  const b=a.map(v=>v*3);
  assert.deepEqual(hourlyShares(a),hourlyShares(b));
  assert.equal(hourlyShares(a)[8],30);
  assert.equal(hourlyShares(a).reduce((x,y)=>x+y,0),100);
  assert.equal(hourlyShares(Array(24).fill(0)),null);
  assert.equal(hourlyShares([1,2]),null);
});

test('peak ties and the final three-hour window are preserved',()=>{
  const flat=peakWindow(Array(24).fill(1));
  assert.equal(flat.start,0);assert.equal(flat.ties,22);
  const late=Array(24).fill(0);late[21]=1;late[22]=2;late[23]=3;
  assert.equal(peakWindow(late).start,21);assert.equal(peakWindow(late).end,24);
});

test('malformed rows are ignored instead of breaking the entire view',()=>{
  assert.equal(normalize({history:[null,{},record('2026-10-01')]}).days.length,1);
  assert.equal(holidayComparison([null,{}]).available,false);
});

const feature = name => { assert.equal(typeof analysis[name], 'function', `${name} is available`); return analysis[name]; };

test('individual days preserve hourly counts, scoped totals and the terminal mix',()=>{
  const compareDays=feature('compareDays');
  const data=normalize({history:[record('2026-10-01',10,30),record('2026-10-08',20,20)]}).days;
  const actual=compareDays(data,'T1','2026-10-01','2026-10-08');
  assert.equal(actual.available,true);assert.equal(actual.n,1);assert.equal(actual.span,1);
  assert.equal(actual.current.total,20);assert.equal(actual.previous.total,10);assert.equal(actual.change,100);
  assert.equal(actual.current.hours[8],20);assert.equal(actual.current.mix.T2,.5);
  assert.deepEqual(actual.previous.dates,['2026-10-01']);assert.equal(actual.start,actual.end);
});

test('a missing day makes the pair unavailable rather than treating missing data as zero',()=>{
  const compareDays=feature('compareDays');
  const actual=compareDays(days(7),'ALL','2026-09-30','2026-10-07');
  assert.equal(actual.available,false);assert.equal(actual.n,0);
  assert.equal(actual.current.total,null);assert.equal(actual.previous.total,null);
  assert.deepEqual(actual.excludedDates,['2026-09-30']);
  assert.equal(compareDays([], 'ALL', '2026-10-01', '2026-10-02').change,null);
  assert.throws(()=>compareDays(days(),'T3','2026-10-01','2026-10-02'));
  assert.throws(()=>compareDays(days(),'ALL','2026-02-30','2026-10-02'));
});

test('similar-day selection prioritizes total difference, then distribution, then recency, using earlier days only',()=>{
  const findSimilarDay=feature('findSimilarDay');
  const data=[
    {date:'2026-10-01',T1:10,T2:0,h1:hours(10,19),h2:hours(0)},
    {date:'2026-10-02',T1:10,T2:0,h1:hours(10,19),h2:hours(0)},
    {date:'2026-10-03',T1:10,T2:0,h1:hours(10,8),h2:hours(0)},
    {date:'2026-10-04',T1:11,T2:0,h1:hours(11,20),h2:hours(0)},
    {date:'2026-10-05',T1:10,T2:0,h1:hours(10,8),h2:hours(0)},
    {date:'2026-10-06',T1:10,T2:0,h1:hours(10,20),h2:hours(0)}
  ];
  const original=JSON.stringify(data);
  const actual=findSimilarDay(data,'ALL','2026-10-05');
  assert.equal(actual.date,'2026-10-02');assert.equal(actual.difference,0);
  assert.equal(actual.total,10);assert.equal(actual.currentTotal,10);assert.equal(actual.distributionDifference,200);
  assert.equal(JSON.stringify(data),original);
});

test('similar-day selection follows the selected terminal and handles zero and absent history',()=>{
  const findSimilarDay=feature('findSimilarDay');
  const data=normalize({history:[record('2026-10-01',10,100),record('2026-10-02',20,0),record('2026-10-03',10,10)]}).days;
  assert.equal(findSimilarDay(data,'T1','2026-10-03').date,'2026-10-01');
  assert.equal(findSimilarDay(data,'ALL','2026-10-03').date,'2026-10-02');
  assert.equal(findSimilarDay(data,'ALL','2026-10-01'),null);
  assert.equal(findSimilarDay(data,'ALL','2026-10-04'),null);
  const zeros=normalize({history:[record('2026-10-01',0,0),record('2026-10-02',0,0),record('2026-10-03',0,0)]}).days;
  const actual=findSimilarDay(zeros,'ALL','2026-10-03');
  assert.equal(actual.date,'2026-10-02');assert.equal(actual.distributionDifference,null);
});

test('six-hour bands show a morning-to-evening shift without changing the total',()=>{
  const compareBands=feature('compareBands');
  const before=Array(24).fill(0),current=Array(24).fill(0);
  before[6]=30;before[11]=30;before[18]=40;current[6]=20;current[18]=80;
  const actual=compareBands(before,current);
  assert.deepEqual(actual.map(b=>[b.start,b.end]),[[0,6],[6,12],[12,18],[18,24]]);
  assert.equal(actual[1].previous,60);assert.equal(actual[1].current,20);
  assert.equal(actual[1].previousShare,60);assert.equal(actual[1].currentShare,20);assert.equal(actual[1].shareChange,-40);
  assert.equal(actual[3].shareChange,40);
  assert.equal(actual.reduce((total,b)=>total+b.current,0),100);
});

test('band percentages use each day denominator and do not invent shares for zero or invalid profiles',()=>{
  const compareBands=feature('compareBands');
  const scaled=compareBands(hours(10),hours(20));
  assert.equal(scaled[1].shareChange,0);
  const zero=compareBands(hours(0),hours(20));
  assert.equal(zero[1].previous,0);assert.equal(zero[1].previousShare,null);assert.equal(zero[1].shareChange,null);
  assert.deepEqual(compareBands([1,2],hours(20)),[]);
  assert.deepEqual(compareBands(hours(-1),hours(20)),[]);
  assert.deepEqual(compareBands(hours(10),hours(Infinity)),[]);
});

test('Japanese September holidays compare September 21–23 with the same weekdays one week earlier',()=>{
  const rows=['2026-09-14','2026-09-15','2026-09-16','2026-09-21','2026-09-22','2026-09-23'].map((date,i)=>({country:'JP',date,value:i<3?10:20,complete:true}));
  rows.push({country:'CN',date:'2026-09-21',value:900,complete:true});
  const actual=holidayComparison(rows,'JP');
  assert.equal(actual.n,3);assert.equal(actual.beforeMean,10);assert.equal(actual.eventMean,20);
  assert.deepEqual(actual.points.map(p=>p.date),['2026-09-21','2026-09-22','2026-09-23']);
  assert.equal(actual.beforeStart,'2026-09-14');assert.equal(actual.beforeEnd,'2026-09-16');
});

test('configured holiday ranges preserve paired samples and reject invalid or mismatched weekday comparisons',()=>{
  const config={start:'2026-10-12',end:'2026-10-12',beforeStart:'2026-10-05'};
  const rows=[{country:'JP',date:'2026-10-05',value:10,complete:true},{country:'JP',date:'2026-10-12',value:0,complete:true}];
  const actual=holidayComparison(rows,'JP',config);
  assert.equal(actual.n,1);assert.equal(actual.points.length,1);assert.equal(actual.change,-100);
  assert.throws(()=>holidayComparison(rows,'JP',{...config,end:'2026-10-11'}));
  assert.throws(()=>holidayComparison(rows,'JP',{...config,start:'2026-02-30'}));
  assert.throws(()=>holidayComparison(rows,'JP',{...config,beforeStart:'2026-10-06'}));
  assert.throws(()=>holidayComparison(rows,'JP',{...config,beforeStart:'2026-10-12'}));
});

test('holiday duplicate dates are excluded and incomplete dates cannot be presented as observed zero',()=>{
  const rows=[{country:'JP',date:'2026-09-14',value:10,complete:true},{country:'JP',date:'2026-09-14',value:20,complete:true},{country:'JP',date:'2026-09-21',value:30,complete:true},{country:'JP',date:'2026-09-15',value:10,complete:true},{country:'JP',date:'2026-09-22',value:0,complete:false}];
  const actual=holidayComparison(rows,'JP');
  assert.equal(actual.available,false);assert.equal(actual.n,0);assert.equal(actual.beforeMean,null);
  assert.equal(actual.points[0].before,null);assert.equal(actual.points[1].event,null);
  assert.equal(actual.excludedDates.length,3);
});

const splitRecord=(date,t1Morning,t1Evening,t2Morning=0,t2Evening=0)=>{
  const profile=(morning,evening)=>({day:date,complete:true,total:morning+evening,hours:Array.from({length:24},(_,i)=>i===8?morning:i===19?evening:0)});
  return {T1:profile(t1Morning,t1Evening),T2:profile(t2Morning,t2Evening)};
};

test('month comparison defaults to the latest two observed months and reports their actual coverage',()=>{
  const compareMonths=feature('compareMonths');
  const data=normalize({history:[record('2026-08-01'),record('2026-09-03',10,20),record('2026-09-30',20,20),record('2026-10-01',30,20),record('2026-10-24',40,20)]}).days;
  const actual=compareMonths(data);
  assert.equal(actual.comparison,'month');assert.equal(actual.available,true);
  assert.deepEqual(actual.coverage.previous,{month:'2026-09',days:2,expectedDays:30,first:'2026-09-03',last:'2026-09-30',complete:false});
  assert.deepEqual(actual.coverage.current,{month:'2026-10',days:2,expectedDays:31,first:'2026-10-01',last:'2026-10-24',complete:false});
  assert.equal(actual.start,'2026-10-01');assert.equal(actual.end,'2026-10-24');
  assert.equal(actual.priorStart,'2026-09-03');assert.equal(actual.priorEnd,'2026-09-30');
  assert.deepEqual(actual.sampleSizes,{previous:2,current:2});assert.equal(actual.n,2);assert.equal(actual.span,31);
  assert.equal(actual.previous.total,35);assert.equal(actual.current.total,55);
});

test('monthly proportions divide summed flight counts instead of averaging each day percentage',()=>{
  const compareMonths=feature('compareMonths');
  const data=normalize({history:[splitRecord('2026-09-03',90,10),splitRecord('2026-09-04',0,10),splitRecord('2026-10-01',0,50)]}).days;
  const actual=compareMonths(data,'ALL','2026-09','2026-10');
  assert.deepEqual(actual.sampleSizes,{previous:2,current:1});
  assert.equal(actual.previous.total,55);assert.equal(actual.current.total,50);
  assert.equal(actual.bands[1].previous,45);assert.equal(actual.bands[1].current,0);
  assert.ok(Math.abs(actual.bands[1].previousShare-90/110*100)<1e-10);
  assert.equal(actual.bands[3].currentShare,100);
  assert.ok(actual.monthShift.morningDelta<0);assert.ok(actual.monthShift.eveningDelta>0);
  assert.equal(actual.monthShift.morningDownEveningUp,true);
});

test('complete months respect leap-year length and internal missing dates remain explicit',()=>{
  const compareMonths=feature('compareMonths');
  const history=[...Array.from({length:29},(_,i)=>record(`2024-02-${String(i+1).padStart(2,'0')}`)),...Array.from({length:31},(_,i)=>record(`2024-03-${String(i+1).padStart(2,'0')}`))];
  const data=normalize({history}).days;
  const complete=compareMonths(data);
  assert.equal(complete.coverage.previous.expectedDays,29);assert.equal(complete.coverage.previous.complete,true);
  assert.equal(complete.coverage.current.expectedDays,31);assert.equal(complete.coverage.current.complete,true);
  assert.deepEqual(complete.excludedDates,[]);
  const partial=compareMonths(data.filter(day=>day.date!=='2024-02-15'));
  assert.equal(partial.coverage.previous.complete,false);assert.equal(partial.coverage.previous.days,28);
  assert.deepEqual(partial.excludedDates,['2024-02-15']);
  assert.equal(partial.previous.total,30);
});

test('an incomplete future month is not padded with zero-flight days or called complete',()=>{
  const compareMonths=feature('compareMonths');
  const data=normalize({history:[record('2026-09-30',10,20),record('2026-10-01',30,20),record('2026-10-02',30,20)]}).days;
  const actual=compareMonths(data);
  assert.equal(actual.current.total,50);assert.equal(actual.coverage.current.days,2);
  assert.equal(actual.coverage.current.complete,false);
  assert.deepEqual(actual.excludedDates,[],'Future and outside-coverage dates are not labeled missing internal records');
  assert.equal(actual.current.hours[8],50);
});

test('monthly movement follows the terminal scope and is not inferred from the airport total',()=>{
  const compareMonths=feature('compareMonths');
  const data=normalize({history:[splitRecord('2026-09-01',60,40,20,80),splitRecord('2026-10-01',40,60,40,60)]}).days;
  const all=compareMonths(data,'ALL'),t1=compareMonths(data,'T1'),t2=compareMonths(data,'T2');
  assert.equal(all.monthShift.morningDelta,0);assert.equal(all.monthShift.eveningDelta,0);assert.equal(all.monthShift.morningDownEveningUp,false);
  assert.deepEqual(t1.monthShift,{morningDelta:-20,eveningDelta:20,morningDownEveningUp:true});
  assert.deepEqual(t2.monthShift,{morningDelta:20,eveningDelta:-20,morningDownEveningUp:false});
  assert.equal(t1.current.total,100);assert.equal(all.current.total,200);
});

test('empty, single-month and zero-flight monthly comparisons never invent percentages',()=>{
  const compareMonths=feature('compareMonths');
  const empty=compareMonths([]);
  assert.equal(empty.available,false);assert.equal(empty.coverage.current.month,null);assert.equal(empty.coverage.current.expectedDays,0);
  assert.deepEqual(empty.bands,[]);assert.deepEqual(empty.monthShift,{morningDelta:null,eveningDelta:null,morningDownEveningUp:false});
  const single=compareMonths(normalize({history:[record('2026-01-01')]}).days);
  assert.equal(single.available,false);assert.equal(single.coverage.previous.month,'2025-12');assert.equal(single.coverage.previous.days,0);
  assert.equal(single.current.total,30);assert.equal(single.previous.total,null);
  const absent=compareMonths([], 'ALL', '2026-09', '2026-10');
  assert.equal(absent.coverage.previous.expectedDays,30);assert.equal(absent.coverage.current.expectedDays,31);
  const zero=compareMonths(normalize({history:[record('2026-09-01',0,0),record('2026-10-01',0,0)]}).days);
  assert.equal(zero.available,true);assert.equal(zero.change,null);
  assert.equal(zero.bands.length,4);assert.ok(zero.bands.every(b=>b.previousShare===null&&b.currentShare===null&&b.shareChange===null));
  assert.equal(zero.monthShift.morningDownEveningUp,false);
});

test('monthly options allow explicit equal or reversed months while rejecting invalid scopes and months',()=>{
  const compareMonths=feature('compareMonths');
  const data=normalize({history:[splitRecord('2026-09-01',60,40),splitRecord('2026-10-01',40,60)]}).days;
  const same=compareMonths(data,'ALL','2026-09','2026-09');
  assert.equal(same.change,0);assert.equal(same.monthShift.morningDelta,0);
  const reverse=compareMonths(data,'ALL','2026-10','2026-09');
  assert.equal(reverse.monthShift.morningDelta,20);assert.equal(reverse.monthShift.eveningDelta,-20);
  assert.throws(()=>compareMonths(data,'T3'));
  for(const month of ['2026-13','2026-00','2026-9','2026-09-01'])assert.throws(()=>compareMonths(data,'ALL',month,'2026-10'));
});

test('monthly comparison reuses complete 24-hour validation and excludes duplicate dates',()=>{
  const compareMonths=feature('compareMonths');
  const data=normalize({history:[record('2026-09-01'),record('2026-09-02'),record('2026-10-01'),record('2026-10-02')]}).days;
  data[1].h1=[10];data.push({...data[3]});
  const actual=compareMonths(data);
  assert.deepEqual(actual.sampleSizes,{previous:1,current:1});
  assert.equal(actual.previous.total,30);assert.equal(actual.current.total,30);
});
