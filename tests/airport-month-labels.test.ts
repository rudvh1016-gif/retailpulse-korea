import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAirportFlightMonth,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {airportMonthComparisonBasis,airportMonthLabel,airportMonthPeriodLabel} from '../lib/airport-month-labels';

function month(month:string,today:string,days:number[]){
 const dates=days.map(day=>`${month}-${String(day).padStart(2,'0')}`);
 const rows:MonthFlightRow[]=dates.map(day=>({physicalFlightId:day,terminal:'T2',gate:'274',operatingFlight:'KE703',airportCode:'NRT',status:'scheduled',scheduledAt:day+'T09:00:00+09:00',retrievedAt:day+'T01:00:00Z'}));
 return buildAirportFlightMonth(month,today,rows,new Set(dates));
}
const days=(length:number)=>Array.from({length},(_,index)=>index+1);

test('month headers use localized month labels without a year or split numeric suffix',()=>{
 for(const [lang,expected] of [['ko','9월'],['en','Sep'],['zh','9月'],['ja','9月']] as const){
  assert.equal(airportMonthLabel('2026-09',lang),expected);
 }
});

test('a full retained calendar month and a complete MTD use their actual cutoff',()=>{
 const previous=month('2026-09','2026-10-11',days(30));
 const current=month('2026-10','2026-10-11',days(10));
 assert.equal(airportMonthComparisonBasis(current,previous,'2026-09','ko'),'2026 · 9월 마감 일평균 / 10월 MTD 일평균 · 10/10까지');
 assert.equal(airportMonthPeriodLabel(previous,'2026-09','en'),'Sep full month mean/day');
});

test('missing dates stay visible and cannot be described as a complete month',()=>{
 const previous=month('2026-09','2026-10-11',days(30).filter(day=>day!==4));
 const current=month('2026-10','2026-10-11',[5,7,10]);
 assert.equal(airportMonthPeriodLabel(previous,'2026-09','ko'),'9월 일부 일평균 (29/30일)');
 assert.equal(airportMonthPeriodLabel(current,'2026-10','ko'),'10월 MTD 일평균 (3/10일) · 10/10까지');
});

test('matching counts alone do not hide duplicated dates or an excluded day',()=>{
 const previous=month('2026-09','2026-10-11',days(30));
 previous.includedDays[0]=previous.includedDays[1];
 assert.doesNotMatch(airportMonthPeriodLabel(previous,'2026-09','ko'),/마감/);
 const conflicting=month('2026-09','2026-10-11',days(30));
 conflicting.excludedDays.push({day:'2026-09-01',reason:'LIMIT'});
 assert.doesNotMatch(airportMonthPeriodLabel(conflicting,'2026-09','ko'),/마감/);
});

test('missing and first-of-month data are unavailable, not zero or complete',()=>{
 assert.equal(airportMonthPeriodLabel(undefined,'2026-09','ko'),'9월 자료 없음');
 assert.equal(airportMonthPeriodLabel(month('2026-10','2026-10-01',[]),'2026-10','ko'),'10월 자료 없음');
});

test('year boundaries and leap month completion use the real calendar',()=>{
 const previous=month('2025-12','2026-01-03',days(31));
 const current=month('2026-01','2026-01-03',days(2));
 assert.equal(airportMonthComparisonBasis(current,previous,'2025-12','ko'),'2025 / 2026 · 12월 마감 일평균 / 1월 MTD 일평균 · 1/2까지');
 assert.equal(airportMonthPeriodLabel(month('2024-02','2024-03-01',days(29)),'2024-02','ko'),'2월 마감 일평균');
 assert.equal(airportMonthPeriodLabel(month('2024-02','2024-03-01',days(28)),'2024-02','ko'),'2월 일부 일평균 (28/29일)');
});
