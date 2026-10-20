import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('brief calendar projection preserves every approved date and scope without heavy detail payloads',()=>{
 const full=JSON.parse(readFileSync('data/airport-focus-preview/holidays.json','utf8'));
 const brief=JSON.parse(readFileSync('data/airport-focus-preview/holidays-summary.json','utf8'));
 const keys=['id','country','countryLabel','name','start','end','dateLabel_ko','type','isRepresentative','conditional','scope'];
 assert.deepEqual(brief,{asOfKST:full.asOfKST,events:full.events.map(event=>Object.fromEntries(keys.filter(key=>Object.hasOwn(event,key)).map(key=>[key,event[key]])))});
});
