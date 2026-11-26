import test,{after,afterEach,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
import {act,createElement} from 'react';

// Exercise real React event handlers and the real IndexedDB adapter. This DOM
// simulator does not replace the separate real-browser/layout acceptance gate.
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/ko/personal-tools-preview'});
const originals=new Map();
for(const [key,value] of Object.entries({window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,
  HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
  originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
}
originals.set('indexedDB',Object.getOwnPropertyDescriptor(globalThis,'indexedDB'));
originals.set('fetch',Object.getOwnPropertyDescriptor(globalThis,'fetch'));
let networkReads=0;
globalThis.fetch=async()=>{networkReads++;throw new Error('Local editor flows must not make network requests');};
const {createRoot}=await import('react-dom/client');
const {default:PersonalToolsPreview}=await import('../app/personal-tools/preview.tsx');
const {openPersonalStore}=await import('../lib/personal-tools/storage.ts');
let container,root;
beforeEach(()=>{networkReads=0;globalThis.indexedDB=new IDBFactory();container=document.createElement('div');document.body.append(container);});
afterEach(async()=>{if(root)await act(async()=>root.unmount());root=null;container.remove();assert.equal(networkReads,0,'local editing must not send data or read public APIs');});
after(()=>{dom.window.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});

const pattern=id=>({id,label:`Pattern ${id}`,terminal:'T2',side:null,open:'07:00',close:'15:00'});
const template=id=>({id,label:`Template ${id}`,items:[{id:`item-${id}`,text:`Original item ${id}`}]});
async function seed(commands){const store=await openPersonalStore();let value=await store.read();for(const command of commands)value=await store.dispatch(command,value.revision);store.close();}
async function read(){const store=await openPersonalStore();try{return await store.read();}finally{store.close();}}
async function settled(predicate){for(let attempt=0;attempt<80;attempt++){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,5));});if(predicate())return;}assert.fail('React interaction did not settle');}
async function mount(){await act(async()=>{root=createRoot(container);root.render(createElement(PersonalToolsPreview));});await settled(()=>container.querySelector('fieldset')?.disabled===false);}
function input(label){const node=Array.from(container.querySelectorAll('label')).find(item=>Array.from(item.childNodes).filter(child=>child.nodeType===3).map(child=>child.textContent).join('').trim()===label);assert.ok(node,`label ${label}`);const control=node.querySelector('input,select,textarea');assert.ok(control);return control;}
function button(text,scope=container){const found=Array.from(scope.querySelectorAll('button')).find(node=>node.textContent.trim()===text);assert.ok(found,`button ${text}`);return found;}
function row(label){const found=Array.from(container.querySelectorAll('li')).find(node=>node.textContent.startsWith(label));assert.ok(found,`row ${label}`);return found;}
async function click(node){assert.equal(node.matches(':disabled'),false,'control must be usable');await act(async()=>node.click());await settled(()=>container.querySelector('fieldset')?.disabled===false);}
async function fill(label,value){const node=input(label),prototype=node.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:node.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
 await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new dom.window.Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
function status(){return container.querySelector('[role="status"]').textContent;}

test('an existing shift is visibly replaced, while note edits keep their recorded day',async()=>{
 const first=pattern('first'),second=pattern('second'),date='2026-11-12',noteDate='2026-11-11';
 await seed([
  {type:'pattern.upsert',pattern:first},{type:'pattern.upsert',pattern:second},
  {type:'assignment.set',date,patternId:first.id},
  {type:'note.add',id:'previous',date:noteDate,body:'Original note',snapshot:null},
 ]);
 await mount();await fill('근무 날짜',date);await fill('배정할 패턴',first.id);
 assert.equal(button('날짜에 배정').disabled,true);
 assert.match(container.textContent,/선택 날짜의 배정 · Pattern first/);
 await fill('배정할 패턴',second.id);await click(button('기존 배정 교체'));
 assert.deepEqual((await read()).assignments,[{date,patternId:second.id}]);
 await click(button('글 수정'));await fill('메모','Updated note');
 assert.match(container.textContent,/수정 중인 메모 날짜 2026-11-11/);
 await click(button('메모 수정 저장'));
 assert.deepEqual((await read()).notes.map(({date,body})=>({date,body})),[{date:noteDate,body:'Updated note'}]);
});

test('a changed reread revokes individual note and checklist deletion confirmations',async()=>{
 const p=pattern('opening'),t=template('opening'),date='2026-11-12';
 await seed([
  {type:'pattern.upsert',pattern:p},{type:'assignment.set',date,patternId:p.id},
  {type:'template.upsert',template:t},{type:'run.start',id:'run',date,templateId:t.id},
  {type:'note.add',id:'note',date,body:'Original note',snapshot:null},
 ]);
 await mount();await click(button('메모 삭제'));assert.ok(button('이 메모 삭제'));
 await seed([{type:'note.update',id:'note',body:'Newer note'}]);await click(button('최신 자료 다시 읽기'));
 assert.ok(button('메모 삭제'));assert.match(container.textContent,/Newer note/);
 await click(button('실행 기록 삭제'));assert.ok(button('이 실행 기록 삭제'));
 await seed([{type:'run.toggle',id:'run',itemId:t.items[0].id,done:true}]);await click(button('최신 자료 다시 읽기'));
 assert.ok(button('실행 기록 삭제'));assert.equal(input(t.items[0].text).checked,true);
 await click(button('실행 기록 삭제'));await click(button('이 실행 기록 삭제'));
 assert.equal((await read()).runs.length,0);assert.equal((await read()).notes[0].body,'Newer note');
});

for(const kind of ['pattern','template'])test(`${kind} deletion clears only its active editor and selected reference after a committed delete`,async()=>{
 const first=kind==='pattern'?pattern('first'):template('first'),second=kind==='pattern'?pattern('second'):template('second');
 await seed([{type:`${kind}.upsert`,[kind]:first},{type:`${kind}.upsert`,[kind]:second}]);await mount();
 const name=kind==='pattern'?'패턴 이름':'템플릿 이름',selection=kind==='pattern'?'배정할 패턴':'시작할 템플릿',remove=kind==='pattern'?'삭제':'템플릿 삭제',save=kind==='pattern'?'패턴 수정':'템플릿 수정';
 await click(button('수정',row(first.label)));await fill(name,'Unsaved edit');await fill(selection,first.id);
 await click(button(remove,row(second.label)));
 assert.equal(input(name).value,'Unsaved edit','deleting a different object preserves the current draft');assert.equal(input(selection).value,first.id);assert.ok(button(save));
 await click(button(remove,row(first.label)));
 assert.equal(input(name).value,'','deleted active object must not remain in the edit form');assert.equal(input(selection).value,'','deleted selection must reset');
 assert.ok(button(kind==='pattern'?'패턴 추가':'템플릿 추가'));assert.equal(Array.from(container.querySelectorAll('button')).some(node=>node.textContent.trim()===save),false);
 if(kind==='template')assert.equal(input('항목 (한 줄에 하나, 최대 64개)').value,'');
 assert.equal((await read())[kind==='pattern'?'patterns':'templates'].length,0);
});

for(const kind of ['pattern','template'])test(`${kind} deletion failure keeps the unsaved editor and selection intact`,async()=>{
 const p=pattern('referenced'),t=template('referenced');await seed([
  {type:'pattern.upsert',pattern:p},{type:'assignment.set',date:'2026-11-12',patternId:p.id},
  {type:'template.upsert',template:t},{type:'run.start',id:'run',date:'2026-11-12',templateId:t.id},
 ]);await mount();
 const target=kind==='pattern'?p:t,name=kind==='pattern'?'패턴 이름':'템플릿 이름',selection=kind==='pattern'?'배정할 패턴':'시작할 템플릿';
 await click(button('수정',row(target.label)));await fill(name,'Unsaved referenced edit');await fill(selection,target.id);
 if(kind==='template')await fill('항목 (한 줄에 하나, 최대 64개)','Unsaved item');
 await click(button(kind==='pattern'?'삭제':'템플릿 삭제',row(target.label)));
 assert.match(status(),/저장하지 못했습니다/);assert.equal(input(name).value,'Unsaved referenced edit');assert.equal(input(selection).value,target.id);
 if(kind==='template')assert.equal(input('항목 (한 줄에 하나, 최대 64개)').value,'Unsaved item');
 assert.equal((await read())[kind==='pattern'?'patterns':'templates'][0].label,target.label);
});

for(const kind of ['pattern','template'])test(`${kind} stale-tab deletion preserves drafts and reports the conflict`,async()=>{
 const target=kind==='pattern'?pattern('stale'):template('stale');await seed([{type:`${kind}.upsert`,[kind]:target}]);await mount();
 const name=kind==='pattern'?'패턴 이름':'템플릿 이름',selection=kind==='pattern'?'배정할 패턴':'시작할 템플릿';
 await click(button('수정',row(target.label)));await fill(name,'Stale unsaved draft');await fill(selection,target.id);
 const other=await openPersonalStore(),current=await other.read();await other.dispatch({type:'notifications.set',preferences:{beforeShiftMinutes:30,briefingChanges:false,guideChanges:false}},current.revision);other.close();
 await click(button(kind==='pattern'?'삭제':'템플릿 삭제',row(target.label)));
 assert.match(status(),/다른 창에서 자료가 바뀌었습니다/);assert.equal(input(name).value,'Stale unsaved draft');assert.equal(input(selection).value,target.id);
 assert.equal((await read())[kind==='pattern'?'patterns':'templates'][0].id,target.id);
});

async function filledEditors(){
 const p=pattern('draft'),t=template('draft');await seed([{type:'pattern.upsert',pattern:p},{type:'template.upsert',template:t}]);await mount();
 await click(button('수정',row(p.label)));await fill('패턴 이름','Unsaved pattern');await fill('배정할 패턴',p.id);
 await click(button('수정',row(t.label)));await fill('템플릿 이름','Unsaved template');await fill('항목 (한 줄에 하나, 최대 64개)','Unsaved item');await fill('시작할 템플릿',t.id);
 await fill('메모','Unsaved note');return JSON.stringify(await read());
}
function assertClearedEditors(){for(const label of ['패턴 이름','배정할 패턴','템플릿 이름','항목 (한 줄에 하나, 최대 64개)','시작할 템플릿','메모','복원할 백업 JSON','전체 삭제하려면 DELETE PERSONAL TOOLS 입력'])assert.equal(input(label).value,'',`${label} must clear`);assert.ok(button('패턴 추가'));assert.ok(button('템플릿 추가'));}

test('successful whole-state wipe clears all private drafts only after committing its tombstone',async()=>{
 const backup=await filledEditors();await fill('복원할 백업 JSON',backup);await fill('전체 삭제하려면 DELETE PERSONAL TOOLS 입력','DELETE PERSONAL TOOLS');
 await click(button('개인 도구 전체 삭제'));assertClearedEditors();const value=await read();assert.equal(value.patterns.length,0);assert.equal(value.templates.length,0);assert.notEqual(value.revision,JSON.parse(backup).revision);
});

test('failed replace retains input and a successful explicit replace clears stale editors',async()=>{
 const backup=await filledEditors();await fill('복원할 백업 JSON','{"version":99}');await click(input('현재 개인 도구 자료를 백업 내용으로 교체하는 데 동의합니다.'));
 await click(button('백업으로 교체'));assert.match(status(),/저장하지 못했습니다/);assert.equal(input('복원할 백업 JSON').value,'{"version":99}');assert.equal(input('패턴 이름').value,'Unsaved pattern');assert.equal(input('템플릿 이름').value,'Unsaved template');assert.equal(input('메모').value,'Unsaved note');
 assert.equal((await read()).revision,JSON.parse(backup).revision);
 await fill('복원할 백업 JSON',backup);assert.equal(button('백업으로 교체').disabled,true,'changing import text requires renewed explicit replacement choice');
 await click(input('현재 개인 도구 자료를 백업 내용으로 교체하는 데 동의합니다.'));await click(button('백업으로 교체'));assertClearedEditors();
 const restored=await read();assert.equal(restored.patterns[0].label,'Pattern draft');assert.equal(restored.templates[0].label,'Template draft');assert.notEqual(restored.revision,JSON.parse(backup).revision);
});

// A reread advances the screen's revision, not the meaning of an already-open
// edit or destructive confirmation. A separate connection models another tab.
async function mutateElsewhere(command){const other=await openPersonalStore();try{const current=await other.read();return await other.dispatch(command,current.revision);}finally{other.close();}}
const editorCases=[
 {kind:'pattern',label:'패턴 이름',save:'패턴 수정',make:()=>({type:'pattern.upsert',pattern:pattern('cross-tab')}),change:()=>({type:'pattern.upsert',pattern:{...pattern('cross-tab'),label:'Newer pattern'}}),remove:{type:'pattern.remove',id:'cross-tab'},open:()=>button('수정',row('Pattern cross-tab')),read:value=>value.patterns[0]?.label},
 {kind:'template',label:'템플릿 이름',save:'템플릿 수정',make:()=>({type:'template.upsert',template:template('cross-tab')}),change:()=>({type:'template.upsert',template:{...template('cross-tab'),label:'Newer template'}}),remove:{type:'template.remove',id:'cross-tab'},open:()=>button('수정',row('Template cross-tab')),read:value=>value.templates[0]?.label},
 {kind:'note',label:'메모',save:'메모 수정 저장',make:()=>({type:'note.add',id:'cross-tab',date:'2026-11-12',body:'Original note',snapshot:null}),change:()=>({type:'note.update',id:'cross-tab',body:'Newer note'}),remove:{type:'note.remove',id:'cross-tab'},open:()=>button('글 수정'),read:value=>value.notes[0]?.body},
];
for(const editor of editorCases)for(const removed of [false,true])test(`${editor.kind} draft cannot overwrite or resurrect an externally ${removed?'deleted':'changed'} record after reread`,async()=>{
 await seed([editor.make()]);await mount();await click(editor.open());await fill(editor.label,'Unsaved local draft');
 const newer=await mutateElsewhere(removed?editor.remove:editor.change());
 await click(button(editor.save));assert.deepEqual(await read(),newer);assert.equal(input(editor.label).value,'Unsaved local draft');assert.match(status(),/다른 창/);
 await click(button('최신 자료 다시 읽기'));await click(button(editor.save));
 assert.deepEqual(await read(),newer,'reread must not silently rebase an old edit onto the newer committed state');
 assert.equal(input(editor.label).value,'Unsaved local draft','a conflicted draft remains available to copy or cancel');
 assert.match(status(),/다른 창|다시 선택|NOT_FOUND/);
 if(!removed){
  await click(editor.kind==='note'?button('글 수정'):button('수정',row(`Newer ${editor.kind}`)));
  assert.equal(input(editor.label).value,`Newer ${editor.kind}`);await fill(editor.label,'Reviewed fresh edit');await click(button(editor.save));
  assert.equal(editor.read(await read()),'Reviewed fresh edit','explicitly selecting the current record permits editing again');
 }
});
for(const editor of editorCases)test(`${editor.kind} draft survives unrelated cross-tab changes without becoming permanently blocked`,async()=>{
 await seed([editor.make()]);await mount();await click(editor.open());await fill(editor.label,'Retained valid draft');
 await mutateElsewhere({type:'notifications.set',preferences:{beforeShiftMinutes:30,briefingChanges:false,guideChanges:false}});
 await click(button('최신 자료 다시 읽기'));await click(button(editor.save));
 const saved=await read();assert.equal(editor.read(saved),'Retained valid draft');assert.equal(saved.notificationPreferences.beforeShiftMinutes,30);
 assert.equal(input(editor.label).value,'');
});

test('rereading changed data invalidates stale destructive confirmations while preserving backup and drafts',async()=>{
 await seed([{type:'pattern.upsert',pattern:pattern('confirm')}]);await mount();const backup=JSON.stringify(await read());
 await fill('복원할 백업 JSON',backup);await click(input('현재 개인 도구 자료를 백업 내용으로 교체하는 데 동의합니다.'));
 await fill('전체 삭제하려면 DELETE PERSONAL TOOLS 입력','DELETE PERSONAL TOOLS');await fill('메모','Keep this draft');
 await click(button('최신 자료 다시 읽기'));
 assert.equal(button('백업으로 교체').disabled,false,'unchanged reread need not revoke confirmation');assert.equal(button('개인 도구 전체 삭제').disabled,false);
 const newer=await mutateElsewhere({type:'pattern.upsert',pattern:pattern('new-data')});
 await click(button('개인 도구 전체 삭제'));assert.match(status(),/다른 창/);assert.deepEqual(await read(),newer);
 assert.equal(input('전체 삭제하려면 DELETE PERSONAL TOOLS 입력').value,'DELETE PERSONAL TOOLS','a rejected action preserves input until a successful changed reread');
 await click(button('최신 자료 다시 읽기'));
 assert.equal(button('백업으로 교체').disabled,true,'new data must require a fresh replacement confirmation');
 assert.equal(button('개인 도구 전체 삭제').disabled,true,'new data must require a fresh deletion phrase');
 assert.equal(input('복원할 백업 JSON').value,backup);assert.equal(input('메모').value,'Keep this draft');assert.deepEqual(await read(),newer);
 // A newly given confirmation still permits the intended action.
 await click(input('현재 개인 도구 자료를 백업 내용으로 교체하는 데 동의합니다.'));await click(button('백업으로 교체'));
 assert.equal((await read()).patterns.length,1);
});


test('committing another local change also revokes a confirmation made for older contents',async()=>{
 await seed([{type:'pattern.upsert',pattern:pattern('local-confirm')}]);await mount();
 await fill('복원할 백업 JSON',JSON.stringify(await read()));await click(input('현재 개인 도구 자료를 백업 내용으로 교체하는 데 동의합니다.'));
 await fill('전체 삭제하려면 DELETE PERSONAL TOOLS 입력','DELETE PERSONAL TOOLS');await fill('메모','Newly committed note');await click(button('브리핑 없이 메모 저장'));
 assert.equal((await read()).notes[0].body,'Newly committed note');assert.equal(button('백업으로 교체').disabled,true);assert.equal(button('개인 도구 전체 삭제').disabled,true);
});
