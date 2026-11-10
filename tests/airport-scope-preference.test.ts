import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAirportScope,pushAirportHistory} from '../lib/airport-scope-preference';
test('all four saved scopes restore, with explicit links taking precedence',()=>{
 for(const scope of ['all','T1','T2','CONCOURSE']){
  const storage={getItem:()=>scope};
  assert.equal(readAirportScope(new URLSearchParams(),storage),scope);
  assert.equal(readAirportScope(new URLSearchParams('terminal=T1'),storage),'T1');
  assert.equal(readAirportScope(new URLSearchParams('terminal=all'),storage),'all');
  assert.equal(readAirportScope(new URLSearchParams('building=CONCOURSE'),storage),'CONCOURSE');
 }
});
test('navigation records the previous and next scopes without dropping existing history state',()=>{
 const entries:{state:Record<string,unknown>;url:string}[]=[{state:{scroll:42},url:'/ko/airport'}];
 const history={
  get state(){return entries.at(-1)!.state;},
  replaceState(state:Record<string,unknown>){entries[entries.length-1].state=state;},
  pushState(state:Record<string,unknown>,_unused:string,url?:string|URL|null){entries.push({state,url:String(url)});},
 };
 pushAirportHistory(history,'/ko/airport?terminal=T2','all','T2');
 pushAirportHistory(history,'/ko/airport?terminal=T2&date=2026-08-31','T2');
 assert.deepEqual(entries,[
  {state:{scroll:42,koretailAirportScope:'all'},url:'/ko/airport'},
  {state:{koretailAirportScope:'T2'},url:'/ko/airport?terminal=T2'},
  {state:{koretailAirportScope:'T2'},url:'/ko/airport?terminal=T2&date=2026-08-31'},
 ]);
 assert.equal(readAirportScope(new URLSearchParams(),{getItem:()=> 'T2'},entries[0].state),'all');
});
test('invalid or unavailable storage and malformed explicit links use all',()=>{
 assert.equal(readAirportScope(new URLSearchParams(),{getItem:()=> 'bad'}),'all');
 assert.equal(readAirportScope(new URLSearchParams(),{getItem:()=>{throw Error('blocked');}}),'all');
 assert.equal(readAirportScope(new URLSearchParams(),null),'all');
 assert.equal(readAirportScope(new URLSearchParams('terminal=bad'),{getItem:()=> 'T2'}),'all');
});
test('history restores all instead of a newer device preference while fresh entry keeps that preference',()=>{
 const storage={getItem:()=> 'T2'};
 assert.equal(readAirportScope(new URLSearchParams(),storage,{koretailAirportScope:'all'}),'all');
 assert.equal(readAirportScope(new URLSearchParams(),storage),'T2');
 assert.equal(readAirportScope(new URLSearchParams('terminal=T1'),storage,{koretailAirportScope:'all'}),'T1');
 assert.equal(readAirportScope(new URLSearchParams('building=CONCOURSE'),storage,{koretailAirportScope:'all'}),'CONCOURSE');
 for(const invalid of [null,{},'all',{koretailAirportScope:'invalid'}])assert.equal(readAirportScope(new URLSearchParams(),storage,invalid),'T2');
});
