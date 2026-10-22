import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {AIRPORT_MONTH_CACHE_PATHS,shouldRouteToSummaryCache} from '../worker/summary-cache-routing.ts';
import {canonicalSummaryUrl,canonicalSummaryRequest} from '../worker/summary-cache-key.ts';
import {GET as airportMonthsGET} from '../app/api/live/airport-months/route.ts';
import {airportPassengerStatsResponse} from '../app/api/live/airport-passenger-stats/route.ts';
const origin='https://koretaildata.com';
const before=new Date('2026-10-31T14:59:59Z'),after=new Date('2026-10-31T15:00:00Z');
for(const path of AIRPORT_MONTH_CACHE_PATHS){
 test(`${path}: only exact public read goes to configured cached entrypoint`,()=>{
  for(const method of ['GET','HEAD','get'])assert.equal(shouldRouteToSummaryCache(method,path),true);
  for(const method of ['POST','PUT','DELETE','PATCH','OPTIONS'])assert.equal(shouldRouteToSummaryCache(method,path),false);
  for(const suffix of ['/','/private','x'])assert.equal(shouldRouteToSummaryCache('GET',path+suffix),false);
  const config=JSON.parse(readFileSync('wrangler.production.jsonc','utf8'));
  assert.equal(config.env.production.exports.SummaryCache.cache.enabled,true);
  assert.equal(config.env.production.exports.default.cache.enabled,false);
  assert.match(readFileSync('worker/index.ts','utf8'),/if \(shouldRouteToSummaryCache\(request.method, url.pathname\)\)[\s\S]*summaryCache.fetch\(canonicalSummaryRequest\(request, url\)\)/);
 });
 test(`${path}: preserve first month including invalid, strip ignored noise, roll over at KST midnight`,()=>{
  const key=(query,now=before)=>canonicalSummaryUrl(new URL(origin+path+query),now);
  assert.equal(key('?month=2026-09&month=2026-08&view=records&area=x&date=2020-01-01&_kstDay=wrong'),key('?month=2026-09'));
  for(const month of ['','bad','2026-13','0000-01','2026-09'])assert.equal(new URL(key('?month='+month)).searchParams.get('month'),month);
  assert.notEqual(key(''),key('?month='));
  assert.notEqual(key('?month=2026-08'),key('?month=2026-09'));
  assert.notEqual(key('?month=2026-09',before),key('?month=2026-09',after));
  assert.notEqual(key('',before),key('',after));
  assert.equal(new URL(key('',after)).searchParams.get('_kstDay'),'2026-11-01');
 });
 test(`${path}: browser bypass headers cannot defeat existing public TTL`,()=>{
  const request=new Request(origin+path+'?month=2026-09',{headers:{authorization:'test', 'cache-control':'no-cache','pragma':'no-cache','accept-language':'ko'}});
  const forwarded=canonicalSummaryRequest(request,new URL(request.url));
  for(const name of ['authorization','cache-control','pragma'])assert.equal(forwarded.headers.has(name),false);
  assert.equal(forwarded.headers.get('accept-language'),'ko');
  assert.equal(request.headers.get('cache-control'),'no-cache');
 });
}
test('passenger stats retains response content, TTL and non-ready no-store after canonicalization',async()=>{
 for(const month of ['2026-09','','bad']){
  const request=new Request(origin+'/api/live/airport-passenger-stats?month='+month+'&view=records');
  const read=async()=>({month:'2026-09',previousMonth:'2026-08',current:{},previous:{}});
  const original=await airportPassengerStatsResponse(request,read);
  const forwarded=await airportPassengerStatsResponse(canonicalSummaryRequest(request,new URL(request.url)),read);
  assert.equal(forwarded.status,original.status);assert.deepEqual(await forwarded.json(),await original.json());
  assert.equal(forwarded.headers.get('cache-control'),original.headers.get('cache-control'));
 }
 for(const read of [async()=>({month:null,current:{},previous:{}}),async()=>{throw Error('offline');}]){
  const response=await airportPassengerStatsResponse(new Request(origin+'/api/live/airport-passenger-stats?month=2026-09'),read);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
 const route=readFileSync('app/api/live/airport-months/route.ts','utf8');
 assert.match(route,/reply.status==='READY'\?'public, max-age=60, s-maxage=300':'no-store'/);
 assert.match(route,/status:'UNAVAILABLE'[\s\S]*'cache-control':'no-store'/);
});

test('airport months invalid selections remain 400 no-store through the real handler',async()=>{
 for(const month of ['', 'bad', '2026-13']){
  const request=new Request(origin+'/api/live/airport-months?month='+month+'&view=records');
  const original=await airportMonthsGET(request),forwarded=await airportMonthsGET(canonicalSummaryRequest(request,new URL(request.url)));
  assert.equal(forwarded.status,400);assert.equal(forwarded.headers.get('cache-control'),'no-store');
  assert.deepEqual(await forwarded.json(),await original.json());
 }
});
