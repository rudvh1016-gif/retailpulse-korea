import test from 'node:test';
import assert from 'node:assert/strict';
import {staffDepartureGateLines,staffDeparturePeak} from '../lib/airport-staff-peak';
import {glanceFlights} from '../lib/airport-glance';
import type {MapFlight} from '../lib/airport-departure-map';
const day='2026-10-20';
const flight=(hour:number,building:MapFlight['building']='T1',gate:string|null='9')=>({scheduledAt:`${day}T${String(hour).padStart(2,'0')}:15:00+09:00`,building,gate});
const zone=(result:NonNullable<ReturnType<typeof staffDeparturePeak>>,building:string,side:string)=>result.gateBuildings.find(row=>row.building===building)?.zones.find(row=>row.side===side);

test('same selected-day peak hour supplies independent east/west gate leaders for each physical building',()=>{
 const result=staffDeparturePeak(day,[flight(7),flight(7),flight(7,'T1','29'),flight(7,'T2','268'),flight(7,'T2','230'),flight(7,'CONCOURSE','112'),flight(7,'CONCOURSE','121'),flight(18,'T2','268')])!;
 assert.equal(result.hour,7);assert.equal(result.endHour,8);assert.equal(result.flights,7);assert.equal(result.tiedHours,1);
 assert.deepEqual(zone(result,'T1','EAST'),{side:'EAST',total:2,count:2,gates:['9']});
 assert.deepEqual(zone(result,'T2','EAST'),{side:'EAST',total:1,count:1,gates:['268']});
 assert.deepEqual(staffDepartureGateLines(result),[
  'T1 동편 9번 게이트 2편(최다) / 서편 29번 게이트 1편(최다).',
  'T2 동편 268번 게이트 1편(최다) / 서편 230번 게이트 1편(최다).',
  '탑승동 동편 112번 게이트 1편(최다) / 서편 121번 게이트 1편(최다).',
 ]);
});

test('ties keep the earliest peak hour and every tied gate with an explicit per-gate count',()=>{
 const result=staffDeparturePeak(day,[flight(7,'T2','270'),flight(7,'T2','268'),flight(7,'T2','270'),flight(7,'T2','268'),flight(7,'T2','276'),...Array.from({length:5},()=>flight(18,'T2','291'))])!;
 assert.equal(result.hour,7);assert.equal(result.tiedHours,2);
 assert.deepEqual(zone(result,'T2','EAST'),{side:'EAST',total:5,count:2,gates:['268','270']});
 assert.deepEqual(staffDepartureGateLines(result),['T2 동편 268·270번 게이트 각 2편(공동 최다) / 서편 배정 확인 0편.']);
 assert.doesNotMatch(staffDepartureGateLines(result).join(' '),/276|291/,'neither lower-count nor other-hour gates are leaders');
});

test('unassigned, unknown-building and unknown-side counts stay separate and never invent a gate',()=>{
 const result=staffDeparturePeak(day,[flight(7,'T2','268'),flight(7,'T2',null),flight(7,'T1',' '),flight(7,'UNKNOWN','268'),flight(7,'UNKNOWN',null),flight(7,'T1','13'),flight(7,'T2','9'),flight(7,'T2','268A')])!;
 assert.deepEqual(result.unknown,{unassigned:3,building:1,side:3});
 assert.equal(result.flights,8);
 const lines=staffDepartureGateLines(result);
 assert.equal(lines[0],'T2 동편 268번 게이트 1편(최다) / 서편 배정 확인 0편.');
 assert.equal(lines[1],'게이트 미배정 3편 · 게이트 위치 미확인 3편 · 건물 미정 1편은 위 게이트 비교에서 제외했습니다.');
 assert.doesNotMatch(lines.join(' '),/0번|13번|9번|268A번/);
 const onlyUnknown=staffDeparturePeak(day,[flight(7,'T1','13'),flight(7,'UNKNOWN','9'),flight(7,'T2',null)])!;
 assert.equal(onlyUnknown.gateBuildings.length,0);
 assert.equal(staffDepartureGateLines(onlyUnknown)[0],'확인된 게이트가 없어 동·서편 최다 게이트를 정하지 않았습니다.');
});

test('canonical gate boundary, central and exception entries are exact, not numeric-range guesses',()=>{
 const assignments=[
  ['T1','25','EAST'],['T1','26','CENTER'],['T1','28','CENTER'],['T1','29','WEST'],['T1','50','WEST'],['T1','51',null],
  ['T2','207',null],['T2','208','WEST'],['T2','248','WEST'],['T2','249','CENTER'],['T2','252','CENTER'],['T2','253','EAST'],['T2','291','EAST'],['T2','292',null],
  ['CONCOURSE','100',null],['CONCOURSE','101','EAST'],['CONCOURSE','112','EAST'],['CONCOURSE','113','CENTER'],['CONCOURSE','119','CENTER'],['CONCOURSE','120',null],['CONCOURSE','121','WEST'],['CONCOURSE','132','WEST'],['CONCOURSE','133',null],
  ['T1','268',null],['T2','13',null],['T2','0268',null],['T2','268A',null],['T1','0',null],
 ] as const;
 for(const [building,gate,side] of assignments){
  const result=staffDeparturePeak(day,[flight(7,building,gate)])!;
  if(side){assert.deepEqual(zone(result,building,side)?.gates,[gate],`${building}:${gate}`);assert.deepEqual(result.unknown,{unassigned:0,building:0,side:0});}
  else{assert.equal(result.gateBuildings.length,0,`${building}:${gate}`);assert.equal(result.unknown.side,1);}
 }
 const center=staffDeparturePeak(day,[flight(7,'T2','249'),flight(7,'T2','249'),flight(7,'T2','268'),flight(7,'T2','248')])!;
 assert.deepEqual(staffDepartureGateLines(center),['T2 동편 268번 게이트 1편(최다) / 서편 248번 게이트 1편(최다) / 중앙 249번 게이트 2편(최다).']);
});

test('same gate text in another building cannot inflate a valid gate count',()=>{
 const result=staffDeparturePeak(day,[flight(7,'T1','9'),flight(7,'T2','9'),flight(7,'CONCOURSE','9'),flight(7,'T2','268'),flight(7,'T1','268')])!;
 assert.equal(zone(result,'T1','EAST')?.count,1);assert.equal(zone(result,'T2','EAST')?.count,1);
 assert.equal(result.unknown.side,3);
 assert.equal(result.gateBuildings.flatMap(row=>row.zones).reduce((sum,row)=>sum+row.total,0)+Object.values(result.unknown).reduce((a,b)=>a+b,0),result.flights);
});

test('actual glance pipeline excludes cancelled and arrival rows, collapses codeshares and keeps latest gate',()=>{
 const raw=(id:string,gate='268')=>({physicalFlightId:id,flightNumber:id,terminal:'T2',gate,scheduledAt:`${day}T07:15:00+09:00`,retrievedAt:`${day}T06:00:00+09:00`,status:'scheduled'});
 const old=raw('physical-a','230');
 const data=glanceFlights(day,[old,{...old,flightNumber:'codeshare'},{...old,gate:'268',retrievedAt:`${day}T06:01:00+09:00`},raw('physical-b'),{...raw('cancelled'),status:'cancelled'},{...raw('arrival'),direction:'arrival'},raw('physical-c','230'),{...raw('concourse','112'),terminal:'CONCOURSE'},{...raw('unknown',''),terminal:'UNKNOWN'},raw('side-unknown','268A')],'all');
 const result=staffDeparturePeak(day,data.departures)!;
 assert.equal(result.flights,6);assert.equal(result.flights,data.hours[7]);
 assert.deepEqual(zone(result,'T2','EAST')?.gates,['268']);assert.equal(zone(result,'T2','EAST')?.count,2);
 assert.equal(zone(result,'T2','WEST')?.count,1);
 assert.deepEqual(result.gateBuildings.map(row=>row.building),['T2','CONCOURSE']);
 assert.equal(zone(result,'CONCOURSE','EAST')?.count,1);
 assert.deepEqual(result.unknown,{unassigned:1,building:0,side:1});
});

test('selected KST day, inclusive hour start, exclusive end and 24:00 boundary remain unchanged',()=>{
 const at=(scheduledAt:string,gate='9')=>({...flight(7,'T1',gate),scheduledAt});
 const result=staffDeparturePeak(day,[at(`${day}T07:00:00+09:00`),at(`${day}T07:59:59+09:00`),at('2026-10-19T22:30:00Z'),at(`${day}T08:00:00+09:00`,'29'),at('2026-10-21T00:00:00+09:00'),at('invalid')])!;
 assert.equal(result.hour,7);assert.equal(result.endHour,8);assert.equal(result.flights,3);
 assert.deepEqual(zone(result,'T1','EAST')?.gates,['9']);assert.equal(zone(result,'T1','WEST')?.count,0);
 const last=staffDeparturePeak(day,[at(`${day}T23:59:59+09:00`)])!;assert.equal(last.hour,23);assert.equal(last.endHour,24);
});

test('absent, invalid or wrong-date data never invents a zero peak',()=>{
 assert.equal(staffDeparturePeak(day,null),null);assert.equal(staffDeparturePeak(day,[]),null);
 assert.equal(staffDeparturePeak('2026-10-21',[flight(7)]),null);assert.equal(staffDeparturePeak('invalid',[flight(7)]),null);
 assert.equal(staffDeparturePeak(day,[{...flight(7),scheduledAt:'invalid'}]),null);
});
