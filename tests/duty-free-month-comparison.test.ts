import test from 'node:test';
import assert from 'node:assert/strict';
import {dutyFreeMonthComparison as compare} from '../lib/duty-free-month-comparison';
import type {DutyFreeMonth} from '../lib/duty-free-exchange-monthly';
const row=(month:string,averageKrwPerUsd:number|null,observedDays=30,calendarDays=30,inProgress=false):DutyFreeMonth=>({month,averageKrwPerUsd,observedDays,calendarDays,inProgress});
test('compares exact stored-day averages without mutating, filling or rounding the source',()=>{
 const previous=row('2026-05',1000,31,31),current=row('2026-06',1100,2),snapshot=JSON.stringify([previous,current]);
 assert.ok(Math.abs(compare(current,previous).percent!-10)<1e-10);assert.equal(compare(current,previous).partial,true);assert.equal(JSON.stringify([previous,current]),snapshot);
 assert.ok(Math.abs(compare(row('2026-06',900),previous).percent!+10)<1e-10);
});
test('missing dates or zero/invalid baseline never become a fabricated zero-percent change',()=>{
 for(const prior of [undefined,row('2026-04',1000),row('2026-05',null,0),row('2026-05',0),row('2026-05',Infinity)])assert.equal(compare(row('2026-06',1100,2),prior).percent,null);
 assert.equal(compare(row('2026-06',null,0),row('2026-05',1000)).percent,null);
});
test('calendar adjacency crosses a year and partial/progress limits survive the comparison',()=>{
 assert.equal(compare(row('2027-01',1000,1,31,true),row('2026-12',1000,31,31)).percent,0);
 assert.equal(compare(row('2027-01',1000,1,31,true),row('2026-12',1000,31,31)).partial,true);
 assert.equal(compare(row('2026-06',1000),row('2026-05',1000,31,31)).partial,false);
});
