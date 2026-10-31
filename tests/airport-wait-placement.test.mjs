import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
test('airport detail omits only the duplicate queue brief while preserving other placements',()=>{
 const detail=readFileSync('app/airport-live-signals.tsx','utf8');
 const shared=readFileSync('app/live-signals.tsx','utf8');
 const personal=readFileSync('app/personal-home.tsx','utf8');
 assert.equal(detail.split('<AirportAtAGlance summary={summary} lang={lang} terminal={terminal} showCrowding={false} flow={').length-1,1);
 assert.match(shared,/showCrowding && checkpoint && <aside className="airport-wait-brief"/);
 assert.match(personal,/showCrowding=\{p\.interests\.includes\('crowding'\)\}/);
 assert.match(detail,/className="airport-summary-details"/);
 assert.match(shared,/className="methodology-details passenger-scope-note"/);
});
