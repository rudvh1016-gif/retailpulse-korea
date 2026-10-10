import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAirportFlightMonth,monthlyMetric,monthlyCategoryKeys,type MonthFlightRow} from '../lib/airport-monthly-flights';
import {AIRPORT_SIDES_VERSION} from '../lib/airport-sides';
import {dailyFlightProfile} from '../lib/airport-day-profile';
import {similarDays,terminalDay} from '../lib/airport-day-compare';
import {similarHighlights,shortDayLabel} from '../lib/airport-day-copy';
const row=(day:string,id:string,extra:Partial<MonthFlightRow>={}):MonthFlightRow=>({physicalFlightId:id,terminal:'T2',gate:'274',scheduledAt:day+'T10:00:00+09:00',operatingFlight:'KE703',retrievedAt:day+'T01:00:00Z',airportCode:'NRT',status:'scheduled',...extra});
test('retained early raw days, newest physical flight, cancellation and all unknown buckets survive one gate definition',()=>{
 const rows=[row('2026-09-01','a'),row('2026-09-01','a',{gate:'231',retrievedAt:'2026-09-02T00:00:00Z'}),row('2026-09-02','b',{terminal:'CONCOURSE',gate:'110'}),row('2026-09-02','c',{status:'cancelled'}),row('2026-09-03','d',{terminal:null,gate:null,airportCode:'not-known',operatingFlight:'VJ123'}),row('2026-09-04','e'),row('2026-10-10','today')];
 const month=buildAirportFlightMonth('2026-09','2026-10-10',rows,new Set(['2026-09-01','2026-09-02','2026-09-03']));
 assert.deepEqual(month.includedDays,['2026-09-01','2026-09-02','2026-09-03']);assert.equal(month.eligibleDays,30);
 assert.equal(month.scopes.ALL.total,3);assert.equal(month.cancelled,1);assert.equal(month.scopes.ALL.sides.WEST,1);
 assert.equal(month.scopes.CONCOURSE.total,1);assert.equal(month.scopes.T1.total,1);assert.equal(month.scopes.UNKNOWN.total,1);
 assert.equal(month.scopes.ALL.destinationCountries.JP,2);assert.equal(month.scopes.ALL.registrationCountries.KR,2);assert.equal(month.scopes.ALL.registrationCountries.UNKNOWN,1);
 assert.equal(month.excludedDays.find(value=>value.day==='2026-09-04')?.reason,'NO_COMPLETION_EVIDENCE');
 assert.equal(month.excludedDays.find(value=>value.day==='2026-09-05')?.reason,'NO_RAW');
});
test('daily means use actual included dates, today excluded, zero and unavailable baselines stay distinct',()=>{
 const previous=buildAirportFlightMonth('2026-09','2026-10-10',[row('2026-09-01','a'),row('2026-09-02','b')],new Set(['2026-09-01','2026-09-02']));
 const current=buildAirportFlightMonth('2026-10','2026-10-10',[row('2026-10-01','c'),row('2026-10-01','d'),row('2026-10-10','today')],new Set(['2026-10-01','2026-10-10']));
 assert.equal(current.eligibleDays,9);assert.deepEqual(current.includedDays,['2026-10-01']);
 assert.deepEqual(monthlyMetric(current,previous,'ALL',counts=>counts.total),{current:2,previous:1,percent:100});
 assert.equal(monthlyMetric(current,previous,'T1',counts=>counts.total).percent,null);
 assert.equal(monthlyMetric(current,undefined,'ALL',counts=>counts.total).previous,null);
 assert.deepEqual(monthlyCategoryKeys(current,previous,'ALL','airlines'),['KE']);
 const first=buildAirportFlightMonth('2026-10','2026-10-01',[],new Set());assert.equal(first.through,null);assert.equal(first.eligibleDays,0);
});
test('similar cards never call two unknown destination mixes similar; dates omit year only within the reference year',()=>{
 const now=terminalDay(dailyFlightProfile([row('2026-10-10','a',{airportCode:'unknown'})],'2026-10-10',false),'T2');
 const past=terminalDay(dailyFlightProfile([row('2026-09-12','b',{airportCode:'unknown'})],'2026-09-12',true),'T2');
 assert.equal(now.sidesVersion,AIRPORT_SIDES_VERSION);const [similar]=similarDays({current:now,history:[past]});
 assert.ok(similar.missing.includes('DESTINATIONS'));assert.ok(!similarHighlights(similar,now,'ko').some(fact=>'text'in fact&&fact.text.includes('목적지')));
 assert.ok(similarHighlights(similar,now,'ko').length<=3);assert.doesNotMatch(shortDayLabel(past.day,now.day,'ko'),/2026/);
 assert.match(shortDayLabel('2025-09-12',now.day,'ko'),/2025/);
});
