import test from 'node:test';
import assert from 'node:assert/strict';
import {openRemotePersonalStore} from '../lib/personal-tools/remote-storage';
import {emptyPersonalState,applyPersonalCommand,PersonalToolsError,type PersonalCommand} from '../lib/personal-tools/model';
import {exportShiftCalendar} from '../lib/personal-tools/calendar-export';
const id='11111111-1111-4111-8111-111111111111';
test('remote store binds each request to account and never retries mutations',async()=>{
 const calls:Array<{url:string;init:RequestInit}>=[];let code=200;
 const store=await openRemotePersonalStore(id,async(_url,init)=>{calls.push({url:String(_url),init:init!});return Response.json(code===200?emptyPersonalState():{error:'ACCOUNT_CHANGED'},{status:code});});
 assert.equal((await store.read()).revision,'empty');code=409;await assert.rejects(store.clear('empty','DELETE PERSONAL TOOLS'),/ACCOUNT_CHANGED/);
 assert.equal(calls.length,2);for(const call of calls){assert.equal(call.url,'/api/account/state');assert.equal(new Headers(call.init.headers).get('x-koretail-account'),id);assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.cache,'no-store');}
 store.close();await assert.rejects(store.read(),/CLOSED/);
});
test('remote store validates responses and limits bytes',async()=>{
 for(const response of [()=>Response.json({version:99}),()=>new Response('x'.repeat(270000))]){
 const store=await openRemotePersonalStore(id,async()=>response());await assert.rejects(store.read());store.close();}
});
test('closing store aborts pending request and prevents response delivery',async()=>{
 let signal:AbortSignal|undefined,resolve!:(r:Response)=>void;
 const store=await openRemotePersonalStore(id,async(_url,init)=>{signal=init?.signal??undefined;return new Promise(r=>resolve=r);});
 const result=store.read();store.close();assert.equal(signal?.aborted,true);resolve(Response.json(emptyPersonalState()));await assert.rejects(result,/CLOSED/);
});
test('calendar exports KST shifts as UTC including overnight and 24 hour, with optional alarm',()=>{
 let state=emptyPersonalState();let n=0;const add=(command:PersonalCommand)=>{state=applyPersonalCommand(state,command,{revision:'r'+(++n),now:'2026-11-13T00:00:00Z'});};
 add({type:'pattern.upsert',pattern:{id:'night',label:'한글 야간, 근무; 안전',terminal:'T2',side:null,open:'22:00',close:'06:00'}});
 add({type:'assignment.set',date:'2026-11-14',patternId:'night'});
 add({type:'notifications.set',preferences:{beforeShiftMinutes:30,briefingChanges:false,guideChanges:false}});
 const ics=exportShiftCalendar(state);assert.match(ics,/DTSTART:20261114T130000Z/);assert.match(ics,/DTEND:20261114T210000Z/);assert.match(ics,/TRIGGER:-PT30M/);assert.ok(ics.includes('한글 야간\\, 근무\\; 안전'));
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 add({type:'pattern.upsert',pattern:{...state.patterns[0],close:'22:00',label:'가'.repeat(60)}});
 const full=exportShiftCalendar(state);assert.match(full,/DTEND:20261115T130000Z/);for(const line of full.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 add({type:'notifications.set',preferences:{beforeShiftMinutes:0,briefingChanges:false,guideChanges:false}});assert.doesNotMatch(exportShiftCalendar(state),/VALARM/);
});

test('unknown server errors never expose private diagnostics',async()=>{
 const store=await openRemotePersonalStore(id,async()=>Response.json({error:'private-server-secret'},{status:500}));
 await assert.rejects(store.read(),error=>{assert.ok(error instanceof PersonalToolsError);assert.equal(error.code,'STORAGE');assert.doesNotMatch(error.message,/private-server/);return true;});store.close();
});

test('account copy discloses full backup upload and calendar privacy without local-only promises',async()=>{
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {default:Preview}=await import('../app/personal-tools/preview');
 const html=renderToStaticMarkup(createElement(Preview,{accountId:id}));
 assert.match(html,/복원에 입력하는 백업은 전체 내용이 서버로 전송됩니다/);
 assert.match(html,/파일에는 근무 이름과 시간이 포함됩니다/);assert.match(html,/캘린더의 공개 범위를 확인하세요/);
 assert.doesNotMatch(html,/메모와 패턴 이름은 서버로 전송하지 않습니다|Google 로그인 준비 중/);
});
