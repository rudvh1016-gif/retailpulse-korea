import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readAirportScope} from '../lib/airport-scope-preference';
test('all four saved scopes restore, with explicit links taking precedence',()=>{
 for(const scope of ['all','T1','T2','CONCOURSE']){
  const storage={getItem:()=>scope};
  assert.equal(readAirportScope(new URLSearchParams(),storage),scope);
  assert.equal(readAirportScope(new URLSearchParams('terminal=T1'),storage),'T1');
  assert.equal(readAirportScope(new URLSearchParams('terminal=all'),storage),'all');
  assert.equal(readAirportScope(new URLSearchParams('building=CONCOURSE'),storage),'CONCOURSE');
 }
});
test('invalid or unavailable storage and malformed explicit links use all',()=>{
 assert.equal(readAirportScope(new URLSearchParams(),{getItem:()=> 'bad'}),'all');
 assert.equal(readAirportScope(new URLSearchParams(),{getItem:()=>{throw Error('blocked');}}),'all');
 assert.equal(readAirportScope(new URLSearchParams(),null),'all');
 assert.equal(readAirportScope(new URLSearchParams('terminal=bad'),{getItem:()=> 'T2'}),'all');
});
