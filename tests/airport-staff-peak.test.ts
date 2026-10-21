import test from 'node:test';
import assert from 'node:assert/strict';
import {staffDepartureGateLines,staffDeparturePeak} from '../lib/airport-staff-peak';
import {glanceFlights} from '../lib/airport-glance';
import type {MapFlight} from '../lib/airport-departure-map';
const day='2026-10-20';
const flight=(hour:number,building:MapFlight['building']='T1',gate:string|null='9')=>({scheduledAt:`${day}T${String(hour).padStart(2,'0')}:15:00+09:00`,building,gate});
const zone=(result:NonNullable<ReturnType<typeof staffDeparturePeak>>,building:string,side:string)=>result.gateBuildings.find(row=>row.building===building)?.zones.find(row=>row.side===side);

test('same selected-day peak hour supplies independent zone totals for each physical building',()=>{
 const result=staffDeparturePeak(day,[flight(7),flight(7),flight(7,'T1','29'),flight(7,'T2','268'),flight(7,'T2','230'),flight(7,'CONCOURSE','112'),flight(7,'CONCOURSE','121'),flight(18,'T2','268')])!;
 assert.equal(result.hour,7);assert.equal(result.endHour,8);assert.equal(result.flights,7);assert.equal(result.tiedHours,1);
 assert.deepEqual(zone(result,'T1','EAST'),{side:'EAST',total:2,count:2,gates:['9']});
 assert.deepEqual(zone(result,'T2','EAST'),{side:'EAST',total:1,count:1,gates:['268']});
 assert.deepEqual(staffDepartureGateLines(result),[
  'T1 서편 1편 · 동편 2편 · 중앙 0편.',
  'T2 서편 1편 · 동편 1편 · 중앙 0편.',
  '탑승동 서편 1편 · 동편 1편 · 중앙 0편.',
 ]);
});

test('ties keep the earliest peak hour while displayed zones include every gate, not just leaders',()=>{
 const result=staffDeparturePeak(day,[flight(7,'T2','270'),flight(7,'T2','268'),flight(7,'T2','270'),flight(7,'T2','268'),flight(7,'T2','276'),...Array.from({length:5},()=>flight(18,'T2','291'))])!;
 assert.equal(result.hour,7);assert.equal(result.tiedHours,2);
 assert.deepEqual(zone(result,'T2','EAST'),{side:'EAST',total:5,count:2,gates:['268','270']});
 assert.deepEqual(staffDepartureGateLines(result),['T2 서편 0편 · 동편 5편 · 중앙 0편.']);
 assert.doesNotMatch(staffDepartureGateLines(result).join(' '),/276|291/,'gate numbers are not repeated in the compact summary');
});

test('unassigned, unknown-building and unknown-side counts stay separate and never invent a gate',()=>{
 const result=staffDeparturePeak(day,[flight(7,'T2','268'),flight(7,'T2',null),flight(7,'T1',' '),flight(7,'UNKNOWN','268'),flight(7,'UNKNOWN',null),flight(7,'T1','13'),flight(7,'T2','9'),flight(7,'T2','268A')])!;
 assert.deepEqual(result.unknown,{unassigned:3,building:1,side:3});
 assert.equal(result.flights,8);
 const lines=staffDepartureGateLines(result);
 assert.equal(lines[0],'T2 서편 0편 · 동편 1편 · 중앙 0편.');
 assert.equal(lines[1],'미확인 7편은 구역별 편수에서 제외했습니다.');
 assert.doesNotMatch(lines.join(' '),/0번|13번|9번|268A번/);
 const onlyUnknown=staffDeparturePeak(day,[flight(7,'T1','13'),flight(7,'UNKNOWN','9'),flight(7,'T2',null)])!;
 assert.equal(onlyUnknown.gateBuildings.length,0);
 assert.equal(staffDepartureGateLines(onlyUnknown)[0],'미확인 3편은 구역별 편수에서 제외했습니다.');
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
 assert.deepEqual(staffDepartureGateLines(center),['T2 서편 1편 · 동편 1편 · 중앙 2편.']);
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

test('owner screenshot 25-flight fixture becomes three zone totals without a gate-number wall',()=>{
 const gates=['253','254','256','261','263','266','277','278','281','284','288','289','208','210','211','213','216','217','221','222','224','247','249','250','252'];
 const result=staffDeparturePeak(day,gates.map(gate=>flight(8,'T2',gate)))!;
 assert.equal(result.hour,8);assert.equal(result.endHour,9);assert.equal(result.flights,25);
 assert.deepEqual(staffDepartureGateLines(result),['T2 서편 10편 · 동편 12편 · 중앙 3편.']);
 assert.equal(result.gateBuildings.flatMap(row=>row.zones).reduce((sum,row)=>sum+row.total,0),25);
 assert.doesNotMatch(staffDepartureGateLines(result).join(' '),/번 게이트|공동 최다|253|208|249/);
});

test('new zone summary keeps the selected language and separates unknown flights in every locale',()=>{
 const result=staffDeparturePeak(day,[flight(7,'T2','268'),flight(7,'T2','268'),flight(7,'T2','230'),flight(7,'T2',null)])!;
 const expected={
  ko:['T2 서편 1편 · 동편 2편 · 중앙 0편.','미확인 1편은 구역별 편수에서 제외했습니다.'],
  en:['T2 West 1 flight · East 2 flights · Centre 0 flights.','Unverified 1 flight; excluded from zone counts.'],
  zh:['T2 西侧 1班 · 东侧 2班 · 中央 0班.','未确认 1班，未计入各区域班次。'],
  ja:['T2 西側 1便 · 東側 2便 · 中央 0便.','未確認 1便は区域別の便数から除外しています。'],
 };
 for(const lang of ['ko','en','zh','ja'] as const)assert.deepEqual(staffDepartureGateLines(result,lang),expected[lang]);
 const unknownOnly=staffDeparturePeak(day,[flight(7,'UNKNOWN',null)])!;
 for(const lang of ['ko','en','zh','ja'] as const){
  const lines=staffDepartureGateLines(unknownOnly,lang);assert.equal(lines.length,1);assert.doesNotMatch(lines[0],/0/,'unverified assignments are not printed as zero flights');
 }
 const concourse=staffDeparturePeak(day,[flight(7,'CONCOURSE','112')])!;
 assert.match(staffDepartureGateLines(concourse,'en')[0],/^Concourse /);
 assert.match(staffDepartureGateLines(concourse,'zh')[0],/^卫星厅 /);
 assert.match(staffDepartureGateLines(concourse,'ja')[0],/^搭乗棟 /);
});

test('existing T1, T2 and concourse filters keep their own peak and zone totals',()=>{
 const raw=(id:string,terminal:string,gate:string,hour=7)=>({physicalFlightId:id,terminal,gate,scheduledAt:`${day}T${String(hour).padStart(2,'0')}:15:00+09:00`,status:'scheduled'});
 const rows=[raw('a','T1','9'),raw('b','T2','268'),raw('c','T2','230'),raw('d','CONCOURSE','112',8),raw('e','CONCOURSE','113',8),raw('f','UNKNOWN','')];
 for(const scope of ['all','T1','T2','CONCOURSE'] as const){
  const data=glanceFlights(day,rows,scope),result=staffDeparturePeak(day,data.departures)!;
  assert.equal(result.flights,data.hours[result.hour]);
  const confirmed=result.gateBuildings.flatMap(row=>row.zones).reduce((sum,row)=>sum+row.total,0);
  assert.equal(confirmed+Object.values(result.unknown).reduce((sum,count)=>sum+count,0),result.flights);
  if(scope!=='all')assert.deepEqual(result.gateBuildings.map(row=>row.building),[scope]);
 }
 const concourse=staffDeparturePeak(day,glanceFlights(day,rows,'CONCOURSE').departures)!;
 assert.equal(concourse.hour,8);assert.deepEqual(staffDepartureGateLines(concourse),['탑승동 서편 0편 · 동편 1편 · 중앙 1편.']);
});
