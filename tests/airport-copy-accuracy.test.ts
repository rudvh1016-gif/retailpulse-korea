import assert from 'node:assert/strict';
import test from 'node:test';
import { airportCompositionCopy } from '../lib/airport-composition-copy';
import { holidayComparisonCopy, holidayDateStatus } from '../lib/holiday-comparison-copy';
import { gateSideOf } from '../lib/airport-sides';
import { readFileSync } from 'node:fs';
import { departureMap } from '../lib/airport-departure-map';
import { leadLine } from '../lib/airport-departure-map-copy';
test('two unknown-terminal departures never become an empty-airport claim',()=>{
  const date='2026-10-04';
  const map=departureMap({date,nextDate:'2026-10-05',terminal:'T2',window:{startMin:2,endMin:182},rows:[1,2].map(id=>({physicalFlightId:String(id),terminal:null,gate:null,scheduledAt:`${date}T01:00:00+09:00`,status:'scheduled'})),nextRows:null});
  assert.equal(map.flights.length,0,'no unassigned flight is silently attributed to T2');
  assert.equal(map.unknownBuilding,2);
  for(const lang of ['ko','en','zh','ja'] as const){assert.match(leadLine(map,lang),/2/);assert.doesNotMatch(leadLine(map,lang),/없|No departure|没有|ありません/);}
});
test('composition states the selected KST date and never presents future schedules as actual departures',()=>{
  for(const lang of ['ko','en','zh','ja'] as const) for(const relation of ['TODAY','PAST','FUTURE'] as const){
    const c=airportCompositionCopy(lang,relation,'2026-10-04','T2');
    assert.match(c.scope,/T2.*2026-10-04 KST/);
    if(relation!=='TODAY')assert.doesNotMatch(c.title,/오늘|Today|今日/);
    if(relation==='FUTURE')assert.doesNotMatch(c.scope,/실제|actual|实际|実績/);
  }
});
test('holiday comparison names each date and country with an actual calendar state',()=>{
  for(const lang of ['ko','en','zh','ja'] as const){
    const result=holidayComparisonCopy('2026-10-03','2026-09-29',lang);
    assert.match(result,/2026-10-03/); assert.match(result,/2026-09-29/);
    assert.match(result,/国庆|국경|National/);
  }
  assert.match(holidayDateStatus('2026-10-10','CN','ko'),/조정 근무일\(공휴일 아님\)/);
  assert.match(holidayDateStatus('2026-05-06','JP','ko'),/대체휴일/);
  assert.match(holidayDateStatus('2027-10-03','CN','ko'),/확인 불가/);
});
test('all restored midpoint mappings retain official POI provenance and computed-region boundaries',()=>{
  const sides=JSON.parse(readFileSync(new URL('../config/airport-sides.v1.json',import.meta.url),'utf8'));
  const positions=JSON.parse(readFileSync(new URL('../config/airport-gate-positions.v1.json',import.meta.url),'utf8'));
  const added=sides.gates.filter((g:{basis:string})=>g.basis==='OFFICIAL_MAP_MIDPOINT');
  assert.equal(added.length,34); assert.equal(gateSideOf('T2','215'),'WEST');
  for(const g of added){
    const point=positions.buildings[g.area].gates[g.gate]; assert.ok(point);
    const axis=g.area==='T2'?462:459, band=g.area==='T2'?132:139;
    const expected=Math.abs(point.x-axis)<=band?'CENTER':point.x>axis?'EAST':'WEST';
    assert.equal(g.side,expected,`${g.area}:${g.gate}`);
    assert.match(g.source,/icnmap\.airport\.kr/);
    assert.equal(gateSideOf(g.area,g.gate),expected);
  }
  assert.equal(gateSideOf('T2','291'),'EAST'); assert.equal(gateSideOf('T1','13'),'UNVERIFIED');
  assert.notEqual(sides.version,'airport-sides.v1','changed table cannot compare historical side shares as the same definition');
});
