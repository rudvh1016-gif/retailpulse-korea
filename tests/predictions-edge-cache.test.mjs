import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PREDICTIONS_CACHE_PATH,shouldRouteToSummaryCache} from '../worker/summary-cache-routing.ts';
import {canonicalSummaryUrl,canonicalSummaryRequest} from '../worker/summary-cache-key.ts';
import {GET,predictionsResponse} from '../app/api/live/predictions/route.ts';
const origin='https://koretaildata.com',path=PREDICTIONS_CACHE_PATH;
const before=new Date('2026-10-31T14:59:59Z'),after=new Date('2026-10-31T15:00:00Z');
const key=(query,now=before)=>canonicalSummaryUrl(new URL(origin+path+query),now);
test('forecast evidence caching admits only the exact public safe read',()=>{
 for(const method of ['GET','HEAD','get'])assert.equal(shouldRouteToSummaryCache(method,path),true);
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal(shouldRouteToSummaryCache(method,path),false);
 for(const suffix of ['/','/private','x'])assert.equal(shouldRouteToSummaryCache('GET',path+suffix),false);
});
test('real response logic preserves stored evidence and refuses thrown/partial reads before caching',async()=>{
 const now=()=>before.toISOString();
 const records=[{targetAt:'2026-10-30T10:00:00+09:00',predicted:123,actual:110}];
 const client=result=>({prepare:sql=>({bind:()=>({first:async()=>({payload:JSON.stringify(sql.includes('forecast_runs')?{hours:[{hour:10,value:123}]}:{days:28})}),all:async()=>result})})});
 const request=new Request(origin+path+'?area=hongdae&area=seongsu&ignored=1');
 const a=await predictionsResponse(request,async()=>client({success:true,results:records}),now);
 const b=await predictionsResponse(new Request(key('?area=hongdae')),async()=>client({success:true,results:records}),now);
 assert.equal(a.status,200);assert.equal(b.headers.get('cache-control'),'public, max-age=60, s-maxage=120');
 const body=await b.json();assert.deepEqual(body,await a.json());assert.deepEqual(body.records,records);assert.equal(body.area,'hongdae');assert.equal(body.targetDate,'2026-11-01');
 for(const resolve of [async()=>{throw Error('offline');},async()=>client({success:false,results:records})]){
  const failed=await predictionsResponse(request,resolve,now);
  assert.equal(failed.status,503);assert.equal(failed.headers.get('cache-control'),'no-store');
  assert.deepEqual(await failed.json(),{error:'prediction_data_unavailable'});
 }
});
test('forecast keys preserve first area, absent-only default and KST day',()=>{
 assert.equal(key(''),key('?area=myeongdong'));
 assert.equal(key('?area=hongdae&area=seongsu&date=x&_kstDay=wrong'),key('?area=hongdae'));
 for(const area of ['','invalid','myeongdong','hongdae','seongsu','itaewon'])assert.equal(new URL(key('?area='+area)).searchParams.get('area'),area);
 assert.notEqual(key('?area=hongdae'),key('?area=seongsu'));
 assert.notEqual(key(''),key('?area='));
 assert.notEqual(key('?area=hongdae',before),key('?area=hongdae',after));
 assert.equal(new URL(key('',after)).searchParams.get('_kstDay'),'2026-11-01');
 assert.equal(canonicalSummaryUrl(new URL(key('')),before),key(''));
});
test('browser no-store cannot defeat existing shared forecast TTL; original request stays intact',()=>{
 const request=new Request(origin+path+'?area=hongdae',{headers:{authorization:'fixture','cache-control':'no-store',pragma:'no-cache','accept-language':'ko'}});
 const forwarded=canonicalSummaryRequest(request,new URL(request.url));
 for(const name of ['authorization','cache-control','pragma'])assert.equal(forwarded.headers.has(name),false);
 assert.equal(forwarded.headers.get('accept-language'),'ko');assert.equal(request.headers.get('cache-control'),'no-store');
});
test('invalid areas retain exact 400 body and no-store through real handler',async()=>{
 for(const area of ['','wrong','hongdae%20']){
  const request=new Request(origin+path+'?area='+area+'&area=hongdae');
  const a=await GET(request),b=await GET(canonicalSummaryRequest(request,new URL(request.url)));
  assert.equal(a.status,400);assert.equal(b.status,400);assert.equal(b.headers.get('cache-control'),'no-store');
  assert.deepEqual(await a.json(),await b.json());
 }
 const source=readFileSync('app/api/live/predictions/route.ts','utf8');
 assert.match(source,/'cache-control':'public, max-age=60, s-maxage=120'/);
 assert.match(source,/status:503,headers:\{'cache-control':'no-store'/);
});
