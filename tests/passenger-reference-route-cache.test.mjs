import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';
import {Miniflare} from './helpers/miniflare.mjs';

// Exercise the real Cache API and the installed framework's outer finalizer.
// A plain new Response mock has mutable headers and misses this production bug.
test('cached passenger reference supports default and explicit month through real Worker response finalization',async t=>{
 const snapshot={status:'READY',month:'2026-09',checkedAt:'2026-10-21T06:00:00.000Z',data:{all:{month:'2026-09',start:'2026-09-01',end:'2026-09-30',expectedDays:30,completeDays:1,status:'PARTIAL',mean:null,observedDays:[{date:'2026-09-09',departures:123,transfers:7}],missingDates:Array.from({length:30},(_,i)=>`2026-09-${String(i+1).padStart(2,'0')}`).filter(d=>d!=='2026-09-09')}}};
 const headers={'content-type':'application/json','cache-control':'public, max-age=300, s-maxage=1800','x-robots-tag':'noindex'};
 const compiled=await build({stdin:{contents:`
 import {GET} from './app/api/live/passenger-reference/route.ts';
 import {finalizeAppRscResponse} from './node_modules/vinext/dist/server/app-rsc-response-finalizer.js';
 import {requestContextFromRequest} from './node_modules/vinext/dist/config/config-matchers.js';
 const clock=Date.parse('2026-10-21T06:00:00Z');
 globalThis.Date=class extends Date {constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;}};
 export default {async fetch(request){
  const key=new Request(new URL('/api/live/passenger-reference?month=2026-09',request.url));
  if(new URL(request.url).pathname==='/__seed_local_cache'){
   await caches.default.put(key,new Response(${JSON.stringify(JSON.stringify(snapshot))},{headers:${JSON.stringify(headers)}}));
   return new Response('seeded');
  }
  return finalizeAppRscResponse(await GET(request),request,{basePath:'',configHeaders:[{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'}]}],requestContext:requestContextFromRequest(request)});
 }};`,resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers','node:*']});
 // No D1 binding or outbound provider fetch: success must come from the cache.
 const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat']});t.after(()=>mf.dispose());
 assert.equal((await mf.dispatchFetch('http://localhost/__seed_local_cache')).status,200);
 for(const query of ['?month=2026-09','','?month=2026-09']){
  const response=await mf.dispatchFetch(`http://localhost/api/live/passenger-reference${query}`);
  assert.equal(response.status,200,`cached ${query||'default'} must survive finalization: ${response.ok?'':(await response.text()).slice(0,500)}`);
  assert.equal(response.headers.get('cache-control'),headers['cache-control']);
  assert.equal(response.headers.get('x-robots-tag'),'noindex');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.match(response.headers.get('vary'),/RSC/);
  assert.deepEqual(await response.json(),snapshot,'checkedAt, dated pairs and missing-day honesty remain unchanged');
 }
 const invalid=await mf.dispatchFetch('http://localhost/api/live/passenger-reference?month=2026-10');
 assert.equal(invalid.status,400);assert.equal((await invalid.json()).status,'INVALID_SELECTION');

 // A separate cold isolate uses real local D1 once. Removing its tables after
 // that read proves the explicit-month memory hit does not reread the database.
 const cold=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-22',compatibilityFlags:['nodejs_compat'],d1Databases:['DB']});t.after(()=>cold.dispose());
 const db=await cold.getD1Database('DB');
 await db.prepare('CREATE TABLE airport_passenger_forecast (terminal TEXT,direction TEXT,is_aggregate INTEGER,target_date TEXT,time_band_raw TEXT,target_start_at TEXT,target_end_at TEXT,expected_passengers INTEGER,retrieved_at TEXT)').run();
 await db.prepare('CREATE TABLE airport_transfer_forecast (terminal TEXT,service_date TEXT,expected_transfer_passengers INTEGER,quality_status TEXT)').run();
 const first=await cold.dispatchFetch('http://cold.localhost/api/live/passenger-reference');
 assert.equal(first.status,200);const empty=await first.json();
 assert.equal(empty.month,'2026-09');assert.equal(empty.data.all.status,'UNAVAILABLE');assert.equal(empty.data.all.mean,null);assert.deepEqual(empty.data.all.observedDays,[]);
 await db.prepare('DROP TABLE airport_passenger_forecast').run();await db.prepare('DROP TABLE airport_transfer_forecast').run();
 const memory=await cold.dispatchFetch('http://cold.localhost/api/live/passenger-reference?month=2026-09');
 assert.equal(memory.status,200);assert.deepEqual(await memory.json(),empty);
 assert.equal(memory.headers.get('cache-control'),headers['cache-control']);assert.equal(memory.headers.get('x-robots-tag'),'noindex');
 // Other months cannot borrow this cached result or turn a failed read into zero.
 const unavailable=await cold.dispatchFetch('http://cold.localhost/api/live/passenger-reference?month=2026-08');
 assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{status:'UNAVAILABLE',month:'2026-08',data:null});
});
