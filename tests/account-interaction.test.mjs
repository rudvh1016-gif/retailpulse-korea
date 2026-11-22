import test,{after,afterEach,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {act,createElement} from 'react';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://koretaildata.com/ko/account'});
const originals=new Map();for(const [key,value] of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
for(const key of ['fetch','indexedDB'])originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
Object.defineProperty(globalThis,'indexedDB',{get(){throw Error('Account tools must not access local IndexedDB');},configurable:true});
const {createRoot}=await import('react-dom/client');
const {default:Preview}=await import('../app/personal-tools/preview.tsx');
const {default:Account}=await import('../app/personal-tools/account.tsx');
const {emptyPersonalState,applyPersonalCommand}=await import('../lib/personal-tools/model.ts');
const A='11111111-1111-4111-8111-111111111111';
let state,root,container,writes,error,actor,counter,statusWaiter,logoutCode,requests;
globalThis.fetch=async(url,init={})=>{
 if(url==='/api/account/logout'){if(logoutCode===200)actor=null;return Response.json(logoutCode===200?{ok:true}:{error:logoutCode===401?'UNAUTHENTICATED':logoutCode===409?'ACCOUNT_CHANGED':'ACCOUNT_UNAVAILABLE'},{status:logoutCode});}
 if(url==='/api/account/status'){if(statusWaiter)await statusWaiter;return Response.json({enabled:true,authenticated:!!actor,...(actor?{accountId:actor}:{})});}
 assert.equal(url,'/api/account/state');requests++;
 assert.equal(new Headers(init.headers).get('x-koretail-account'),A);
 if(error)return Response.json({error},{status:error==='UNAUTHENTICATED'?401:409});
 if(init.method==='POST'){writes++;const body=JSON.parse(init.body);if(body.expectedRevision!==state.revision)return Response.json({error:'CONFLICT'},{status:409});state=applyPersonalCommand(state,body.command,{revision:'server-'+(++counter),now:'2026-11-13T00:00:00Z'});}
 return Response.json(state);
};
beforeEach(()=>{state=emptyPersonalState();writes=counter=requests=0;error='';actor=A;statusWaiter=null;logoutCode=200;container=document.createElement('div');document.body.append(container);});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;container.remove();dom.window.history.replaceState({},'','/ko/account');});
after(()=>{dom.window.close();for(const [key,value] of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
async function settled(predicate){for(let i=0;i<100;i++){await act(async()=>{await new Promise(r=>setTimeout(r,5));});if(predicate())return;}assert.fail('UI did not settle');}
async function mount(component=Preview){await act(async()=>{root=createRoot(container);root.render(createElement(component,{accountId:A}));});await settled(()=>container.querySelector('fieldset')?.disabled===false);}
function button(text){const n=[...container.querySelectorAll('button')].find(n=>n.textContent.trim()===text);assert.ok(n,text);return n;}
function input(label){const n=[...container.querySelectorAll('label')].find(n=>[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('').trim()===label);assert.ok(n,label);return n.querySelector('input,select,textarea');}
async function fill(label,value){const n=input(label),proto=n.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:n.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(n,value);n.dispatchEvent(new dom.window.Event(n.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
async function click(text){await act(async()=>button(text).click());await settled(()=>!container.querySelector('fieldset')||!container.querySelector('fieldset').disabled);}
function seed(){state=applyPersonalCommand(state,{type:'note.add',id:'private',date:'2026-11-13',body:'private-canary',snapshot:null},{revision:'seed',now:'2026-11-13T00:00:00Z'});}
test('five feature editors persist through remote adapter and remount without local storage',async()=>{
 await mount();await fill('패턴 이름','Account shift');await click('패턴 추가');await fill('배정할 패턴',state.patterns[0].id);await click('날짜에 배정');
 await fill('메모','Cloud note');await click('브리핑 없이 메모 저장');await click('공항 편의시설 추가');
 await fill('템플릿 이름','Account checklist');await fill('항목 (한 줄에 하나, 최대 64개)','Check drawer');await click('템플릿 추가');await fill('시작할 템플릿',state.templates[0].id);await click(state.assignments[0].date+' 체크리스트 시작');
 await act(async()=>input('Check drawer').click());await settled(()=>state.runs[0].items[0].done===true);
 await fill('근무 전 알림','30');await settled(()=>state.notificationPreferences.beforeShiftMinutes===30);
 assert.equal(state.notes[0].body,'Cloud note');assert.equal(state.favorites.length,1);assert.equal(state.runs.length,1);assert.ok(writes>=7);
 await act(async()=>root.unmount());root=null;await mount();assert.match(container.textContent,/Cloud note/);assert.equal(input('근무 전 알림').value,'30');
});
test('ordinary conflict preserves unsaved draft and never automatically repeats write',async()=>{
 await mount();await fill('메모','Unsaved draft');error='CONFLICT';const before=requests;await click('브리핑 없이 메모 저장');assert.equal(input('메모').value,'Unsaved draft');assert.equal(writes,0);assert.equal(requests,before+1);
});
for(const code of ['UNAUTHENTICATED','ACCOUNT_CHANGED'])test(code+' wipes visible private content and drafts',async()=>{
 seed();await mount();await fill('메모','private-draft');error=code;await click('최신 자료 다시 읽기');await settled(()=>!container.querySelector('textarea'));assert.doesNotMatch(container.textContent,/private-canary|private-draft/);
});
test('account revalidates on focus and hides old data before status completes',async()=>{
 seed();await mount(Account);assert.equal(container.querySelectorAll('main').length,1);assert.equal(container.querySelectorAll('h1').length,1);await fill('메모','private-draft');let finish;statusWaiter=new Promise(r=>finish=r);
 await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));assert.equal(container.querySelector('[data-private-account]')?.hidden,true);
 actor=null;finish();await settled(()=>!container.querySelector('textarea'));assert.doesNotMatch(container.textContent,/private-canary|private-draft/);
});
test('cross-tab session marker invalidates private content immediately',async()=>{
 seed();await mount(Account);actor=null;await act(async()=>window.dispatchEvent(new dom.window.StorageEvent('storage',{key:'koretail-account-session-change',newValue:'changed'})));
 await settled(()=>!container.querySelector('textarea'));assert.doesNotMatch(container.textContent,/private-canary/);
});
test('failed callback explains failure without showing provider diagnostics',async()=>{
 window.history.replaceState({},'','/ko/account?auth=failed');actor=null;await act(async()=>{root=createRoot(container);root.render(createElement(Account));});await settled(()=>container.textContent.includes('Google 로그인을 완료하지 못했습니다'));assert.ok(button('Google로 가입 / 로그인'));
});

for(const code of [401,409,503])test('logout intent hides private data even when server returns '+code,async()=>{
 seed();await mount(Account);await fill('메모','private-draft');logoutCode=code;
 await click('로그아웃');assert.ok(!container.querySelector('textarea'),'private draft fields must be removed');assert.doesNotMatch(container.textContent,/private-canary|private-draft/);
});
