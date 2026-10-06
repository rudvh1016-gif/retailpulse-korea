import assert from 'node:assert/strict';
import {test} from 'node:test';
import {displayedQueueMinutes, queueKey, queueRepresentativeCopy, selectQueueRepresentatives} from '../lib/airport-queue-representatives';
import type {QueueHeatReading} from '../lib/airport-queue-heat';
const now=Date.parse('2026-10-06T13:10:00Z');
const row=(zone:string,minutes:number):QueueHeatReading=>({terminal:'T2',zone,waitTimeMinutes:minutes,waitTimeRaw:String(minutes),observedAt:'2026-10-06T13:07:00Z',freshness:'LIVE'});

test('long/middle/short select actual ranks; even counts use the longer central rank',()=>{
  const rows=[11,80,25,4,60,40,20,0].map((minutes,index)=>row(`DG${index<4?1:2}_${'ABCD'[index%4]}`,minutes));
  const result=selectQueueRepresentatives(rows,now);
  assert.deepEqual(result.items.map(item=>[item.minutes,item.rank,item.role]),[[80,1,'long'],[25,4,'middle'],[0,8,'short']]);
  assert.equal(result.count,8);
  assert.ok(result.items.every(item=>rows.includes(item.row)));
  assert.deepEqual(selectQueueRepresentatives(rows.slice(0,5),now).items.map(item=>item.rank),[1,3,5]);
});

test('ties use identity order rather than people counts; all equal stays explicitly equal',()=>{
  const rows=['D','B','A','C'].map(letter=>({...row('DG1_'+letter,6),waitingCount:letter.charCodeAt(0)*99}));
  const result=selectQueueRepresentatives(rows,now);
  assert.equal(result.equal,true);
  assert.deepEqual(result.items.map(item=>item.row.zone),['DG1_A','DG1_B','DG1_D']);
  assert.ok(result.items.every(item=>item.role==='same'&&item.tied));
  assert.deepEqual(selectQueueRepresentatives([...rows].reverse(),now),result);
  const partial=selectQueueRepresentatives([row('DG1_B',60),row('DG1_A',60),row('DG1_C',20),row('DG1_D',0)],now);
  assert.deepEqual(partial.items.map(item=>item.row.zone),['DG1_A','DG1_B','DG1_D']);
  assert.equal(partial.items[0].tied,true);
});

test('0/1/2 eligible halls never invent or duplicate a third',()=>{
  assert.deepEqual(selectQueueRepresentatives([],now).items,[]);
  assert.deepEqual(selectQueueRepresentatives([row('DG1_A',6)],now).items.map(item=>item.role),['only']);
  assert.deepEqual(selectQueueRepresentatives([row('DG1_A',6),row('DG1_B',20)],now).items.map(item=>item.role),['long','short']);
});

test('stale, missing, explicit closed, invalid and future rows never become representatives',()=>{
  const rows=[
    {...row('DG1_A',80),freshness:'STALE'},
    {...row('DG1_B',80),observedAt:'2026-10-06T12:40:00Z'},
    {...row('DG1_C',0),waitTimeRaw:'운영 종료'},
    {...row('DG1_D',0),waitTimeRaw:'closed'},
    {...row('DG2_A',0),waitTimeMinutes:null,waitTimeRaw:null},
    {...row('DG2_B',10),observedAt:'2026-10-06T14:00:00Z'},
    {...row('DG2_C',10),observedAt:'invalid'},
    {...row('DG2_D',40),waitTimeRaw:'20–40'},
  ];
  assert.equal(selectQueueRepresentatives(rows,now).count,0);
  const zero=row('DG1_A',0);assert.equal(selectQueueRepresentatives([zero],now).count,1);
  assert.equal(displayedQueueMinutes(zero),0);
  assert.match(queueRepresentativeCopy('ko').zero,/운영 여부 확인 필요/);
});

test('latest duplicate identity wins before filtering; conflicting same-time readings are withheld',()=>{
  const first=row('DG1_A',20), later={...first,observedAt:'2026-10-06T13:08:00Z',waitTimeRaw:'closed'};
  assert.equal(selectQueueRepresentatives([first,first],now).items.length,1);
  assert.equal(selectQueueRepresentatives([first,later],now).count,0);
  assert.equal(selectQueueRepresentatives([later,first],now).count,0);
  const conflicting={...first,waitTimeMinutes:30,waitTimeRaw:'30'};
  assert.equal(selectQueueRepresentatives([first,conflicting],now).count,0);
  const newest={...first,observedAt:'2026-10-06T13:09:00Z'};
  assert.equal(selectQueueRepresentatives([first,conflicting,newest],now).count,1);
});

test('T1 can compare actual minutes without borrowing a T2 category; terminals remain distinct',()=>{
  const rows=[row('DG1_A',20),{...row('DG1_A',40),terminal:'T1'},row('DG1_B',6)];
  const result=selectQueueRepresentatives(rows,now);
  assert.equal(result.count,3);
  assert.equal(new Set(result.items.map(item=>queueKey(item.row))).size,3);
  assert.equal(result.items[0].row.terminal,'T1');
});

test('60+ keeps its display and numeric lower-bound limitation; arbitrary ranges are not inferred',()=>{
  const lower={...row('DG1_A',0),waitTimeMinutes:null,waitTimeRaw:'60+'};
  const result=selectQueueRepresentatives([lower,row('DG1_B',45),row('DG1_C',6)],now);
  assert.equal(result.hasLowerBound,true);
  assert.equal(result.items[0].row.waitTimeMinutes,null);
  assert.equal(result.items[0].row.waitTimeRaw,'60+');
  for(const lang of ['ko','en','zh','ja','unsupported']){
    const copy=queueRepresentativeCopy(lang);assert.ok(copy.long&&copy.middle&&copy.short&&copy.zero&&copy.lower);
  }
});
