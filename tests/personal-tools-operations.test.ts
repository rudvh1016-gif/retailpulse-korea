import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPersonalCommand, emptyPersonalState, parsePersonalState, planRepeatedAssignments, type PersonalState } from '../lib/personal-tools/model';
import { GET, readDepartureAlertRows } from '../app/api/airport/departure-alert/route';

const now = '2026-11-23T11:00:00+09:00';
const state: PersonalState = { ...emptyPersonalState(),
  patterns: [
    { id:'standard',label:'오픈',terminal:'T1',side:'EAST',open:'07:00',close:'15:00' },
    { id:'late',label:'마감',terminal:'T2',side:null,open:'14:00',close:'22:00' },
  ],
  assignments: [{date:'2026-11-23',patternId:'late'}],
  templates: [{id:'opening',label:'오픈',items:[{id:'stock',text:'재고 확인'}]}],
};
const clock = {now,revision:'updated-1'};

test('repeating a shift skips existing assigned dates and accepts only valid 31-day or shorter ranges',()=>{
  const existing=planRepeatedAssignments(state.assignments,'2026-11-23','2026-11-29',[1,3,6]);
  assert.deepEqual(existing,{dates:['2026-11-25','2026-11-28'],skipped:1});
  const next=applyPersonalCommand(state,{type:'assignment.repeat',start:'2026-11-23',end:'2026-11-29',weekdays:[1,3,6],patternId:'standard'},clock);
  assert.deepEqual(next.assignments,[state.assignments[0],{date:'2026-11-25',patternId:'standard'},{date:'2026-11-28',patternId:'standard'}]);
  assert.throws(()=>planRepeatedAssignments(state.assignments,'2026-11-01','2026-12-02',[1]));
  assert.throws(()=>planRepeatedAssignments(state.assignments,'2026-11-01','2026-11-07',[1,1]));
  assert.throws(()=>planRepeatedAssignments(state.assignments,'2026-11-31','2026-12-01',[1]));
});

test('one checklist per template and shift day keeps the original check marks',()=>{
  const input={type:'run.start' as const,id:'opening-a',date:'2026-11-23',templateId:'opening'};
  const first=applyPersonalCommand(state,input,clock);
  const checked=applyPersonalCommand(first,{type:'run.toggle',id:'opening-a',itemId:'stock',done:true},{now,revision:'updated-2'});
  assert.throws(()=>applyPersonalCommand(checked,{...input,id:'opening-b'},{now,revision:'updated-3'}),/DUPLICATE_ID/);
  assert.equal(checked.runs[0].items[0].done,true);
});

test('language tags round trip while old customer snippets stay readable',()=>{
  const legacy=applyPersonalCommand(state,{type:'snippet.upsert',snippet:{id:'old',label:'기존 안내',body:'기존 문구'}},clock);
  const next=applyPersonalCommand(legacy,{type:'snippet.upsert',snippet:{id:'new',label:'보안 검색',body:'请往前走',language:'zh'}},{now,revision:'updated-2'});
  assert.deepEqual(parsePersonalState(JSON.parse(JSON.stringify(next))).guideSnippets?.map(item=>item.language),[undefined,'zh']);
});

const observedAt='2026-11-23T10:55:00+09:00', retrievedAt='2026-11-23T10:56:00+09:00';
const value={terminal:'T1',zone:'DG2_E',observedAt,retrievedAt,waitTimeRaw:'30',waitTimeMinutes:30};
const health={sourceId:'INCHEON_DEPARTURE_CONGESTION',eventAt:observedAt,retrievedAt,status:'LIVE'};
function boundRead(rows: unknown[], source:unknown) {
  const bindings:unknown[][]=[];
  const db={
    prepare(){return {bind(...params:unknown[]){bindings.push(params);return {};}};},
    async batch(){return [{success:true,results:rows},{success:true,results:[source]}];},
  } as unknown as D1Database;
  return {db,bindings};
}

test('bounded departure read is terminal-specific and excludes stale or mismatched evidence',async()=>{
  const {db,bindings}=boundRead([value],health);
  const rows=await readDepartureAlertRows(db,'T1',undefined,Date.parse(now));
  assert.deepEqual(bindings,[['T1','T1'],['INCHEON_DEPARTURE_CONGESTION']]);
  assert.equal(rows?.[0].collectionStatus,'LIVE');
  assert.equal(await readDepartureAlertRows(db,'T1',undefined,Date.parse(now)+21*60_000),null);
  const mixed=boundRead([value],{...health,retrievedAt:now});
  assert.equal(await readDepartureAlertRows(mixed.db,'T1',undefined,Date.parse(now)),null);
  const broken=boundRead([value],{...health,status:'ERROR'});
  assert.equal(await readDepartureAlertRows(broken.db,'T1',undefined,Date.parse(now)),null);
  assert.equal((await GET(new Request('https://koretaildata.com/api/airport/departure-alert?terminal=T1&terminal=T2'))).status,400);
});
