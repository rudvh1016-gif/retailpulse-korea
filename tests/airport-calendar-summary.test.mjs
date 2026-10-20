import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('brief calendar preserves every approved date, scope and verification without heavy detail payloads',()=>{
 const full=JSON.parse(readFileSync('data/airport-focus-preview/holidays.json','utf8'));
 const brief=JSON.parse(readFileSync('data/airport-focus-preview/holidays-summary.json','utf8'));
 const keys=['id','country','countryLabel','name','start','end','dateLabel_ko','type','isRepresentative','conditional','scope','sourceURL','verifiedAt','reviewValidUntil','calendarScope','region'];
 const expected=full.events.map(event=>({...event,calendarScope:event.region?'regional':event.country==='US'?'institutional':'national',verifiedAt:event.status==='OFFICIAL_DATE_CONFIRMED'?event.checkedAt?.slice(0,10):undefined})).map(event=>Object.fromEntries(keys.filter(key=>Object.hasOwn(event,key)&&event[key]!==undefined).map(key=>[key,event[key]])));
 assert.deepEqual(brief.events.slice(0,full.events.length),expected);
 assert.equal(brief.asOfKST,full.asOfKST);
 for(const event of brief.events)assert.ok(!Object.hasOwn(event,'description_ko'));
 const history=JSON.parse(readFileSync('data/airport-focus-preview/calendar-context.json','utf8'));
 for(const event of brief.events.slice(full.events.length)){
  const source=history.events.find(row=>row.id===event.id);
  assert.equal(source.status,'verified');assert.equal(source.scope,'national');assert.equal(source.kind,'public_holiday');
  for(const key of ['country','name','start','end','sourceURL','verifiedAt'])assert.equal(event[key],source[key]);
 }
});
