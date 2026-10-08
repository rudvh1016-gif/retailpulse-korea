import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectDutyFreeExchange,parseDutyFreeHtml} from '../lib/duty-free-exchange-collector.ts';
import {claimDutyFreeAttempt,saveDutyFreeSuccess,readDutyFreeSnapshot,DUTY_FREE_BLOCK_INTERVAL_MS} from '../lib/duty-free-exchange-store.ts';
import {dutyFreePresentation,dutyFreeSources,kstExchangeDate} from '../lib/duty-free-exchange.ts';
import {dutyFreeCacheControl} from '../app/api/live/duty-free-exchange/route.ts';
import {shouldRouteToSummaryCache} from '../worker/summary-cache-routing.ts';
import {canonicalSummaryUrl} from '../worker/summary-cache-key.ts';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {fileURLToPath} from 'node:url';

const now=Date.parse('2026-10-08T03:00:00Z');
// Minimal selector fixtures, including the exact Shilla sum markup read at 06:32 UTC.
const shilla=(value='1,343.40')=>`<div class="exchange">오늘의 환율<span class="sum">$1=${value}원</span></div>`;
const ssg=(value='1,344.50')=>`<div class="todayRate">오늘의 환율 1$ = <em>${value}</em>원</div>`;
const html=value=>new Response(value,{headers:{'content-type':'text/html; charset=utf-8'}});
function localDb(t){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../drizzle/0022_duty_free_exchange.sql',import.meta.url),'utf8'));
 t.after(()=>sql.close());
 const prepare=(text)=>{let params=[];const item={bind(...values){params=values;return item;},async all(){return {success:true,results:sql.prepare(text).all(...params)};},async run(){const result=sql.prepare(text).run(...params);return {success:true,meta:{changes:Number(result.changes)}};}};return item;};
 const db={prepare,async batch(items){sql.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 return {db,sql};
}
const observation=(vendor,at=now,value=1343.4)=>({vendor,serviceDateKst:kstExchangeDate(at),currency:'USD',krwPerUnit:value,verifiedAt:new Date(at).toISOString(),sourceUrl:dutyFreeSources[vendor],verified:true,scope:'INTERNET_SHOP'});

test('official selectors accept only unambiguous dollar rates and ignore product/script numbers',()=>{
 assert.equal(parseDutyFreeHtml('shilla',shilla(),'2026-10-08'),1343.4);
 assert.equal(parseDutyFreeHtml('shinsegae',ssg(),'2026-10-08'),1344.5);
 assert.equal(parseDutyFreeHtml('shilla',`<script>${shilla('999.00')}</script><b>99,000</b>${shilla()}${shilla()}`,'2026-10-08'),1343.4);
 assert.equal(parseDutyFreeHtml('shilla',shilla().replace('$','&#36;'),'2026-10-08'),1343.4);
 for(const input of [shilla('0'),shilla('NaN'),shilla('1,34.40'),shilla().replace('sum','price'),shilla()+shilla('1344.00'),shilla().replace('$1','JPY1'),shilla().replace('오늘의 환율','2026-10-07 오늘의 환율')])assert.throws(()=>parseDutyFreeHtml('shilla',input,'2026-10-08'));
 assert.throws(()=>parseDutyFreeHtml('shinsegae',ssg().replace('1$','100$'),'2026-10-08'));
});

test('real SQL: successful sources are independent and duplicate invocations spend zero requests',async t=>{
 const {db}=localDb(t);let calls=0;
 const fetchImpl=async url=>{calls++;return html(url===dutyFreeSources.shilla?shilla():ssg());};
 const first=await collectDutyFreeExchange(db,{fetchImpl,now:()=>new Date(now)});
 assert.deepEqual(first.map(x=>[x.status,x.changedRows]),[['SUCCESS',1],['SUCCESS',1]]);assert.equal(calls,2);
 const snapshot=await readDutyFreeSnapshot(db,new Date(now));
 assert.deepEqual(dutyFreePresentation(snapshot,now).map(x=>[x.vendor,x.krwPerUnit,x.current]),[['shilla',1343.4,true],['shinsegae',1344.5,true]]);
 const next=await collectDutyFreeExchange(db,{fetchImpl,now:()=>new Date(now+1000)});
 assert.ok(next.every(x=>x.status==='SKIPPED_NOT_DUE'&&x.providerRequests===0));assert.equal(calls,2);
});

test('same semantic rate writes zero canonical rows but preserves real latest successful verification',async t=>{
 const {db,sql}=localDb(t);let clock=now;
 const options={vendors:['shilla'],fetchImpl:async()=>html(shilla()),now:()=>new Date(clock)};
 await collectDutyFreeExchange(db,options);clock+=3_600_001;
 const [second]=await collectDutyFreeExchange(db,options);assert.equal(second.changedRows,0);
 const record=sql.prepare('SELECT * FROM duty_free_exchange_current').get();assert.equal(record.first_verified_at,new Date(now).toISOString());
 const snapshot=await readDutyFreeSnapshot(db,new Date(clock));assert.equal(snapshot.sources[0].observation.verifiedAt,new Date(clock).toISOString());
 clock+=24*3_600_000;const [newDay]=await collectDutyFreeExchange(db,options);assert.equal(newDay.changedRows,1);
});

test('406 has one request, no retry or workaround, 24-hour guard, and preserves original last-good timestamp',async t=>{
 const {db}=localDb(t);let clock=now;
 await collectDutyFreeExchange(db,{vendors:['shilla'],fetchImpl:async()=>html(shilla()),now:()=>new Date(clock)});
 clock+=3_600_001;let calls=0;
 const options={vendors:['shilla'],now:()=>new Date(clock),fetchImpl:async()=>{calls++;return new Response('blocked',{status:406});}};
 const [failed]=await collectDutyFreeExchange(db,options);assert.equal(failed.status,'BLOCKED');assert.equal(failed.errorCode,'HTTP_406');assert.equal(calls,1);
 const snapshot=await readDutyFreeSnapshot(db,new Date(clock));assert.equal(snapshot.sources[0].observation.verifiedAt,new Date(now).toISOString());
 assert.equal(Date.parse(snapshot.sources[0].nextAttemptAt),clock+DUTY_FREE_BLOCK_INTERVAL_MS);
 assert.equal(dutyFreePresentation(snapshot,clock)[0].current,false);
 clock+=3_600_000;await collectDutyFreeExchange(db,options);assert.equal(calls,1);
});

test('one blocked provider cannot prevent the other vendor from updating',async t=>{
 const {db}=localDb(t);
 const result=await collectDutyFreeExchange(db,{now:()=>new Date(now),fetchImpl:async url=>url===dutyFreeSources.shilla?html(shilla()):new Response('blocked',{status:406})});
 assert.deepEqual(result.map(x=>x.status),['SUCCESS','BLOCKED']);
 const snapshot=await readDutyFreeSnapshot(db,new Date(now));assert.equal(snapshot.sources[0].observation.krwPerUnit,1343.4);assert.equal(snapshot.sources[1].observation,null);
});

test('live lease and expired older lease cannot create duplicate requests or overwrite newer evidence',async t=>{
 const {db}=localDb(t);
 assert.equal(await claimDutyFreeAttempt(db,'shilla',new Date(now),'old'),true);
 assert.equal(await claimDutyFreeAttempt(db,'shilla',new Date(now+100),'duplicate'),false);
  assert.equal(await claimDutyFreeAttempt(db,'shilla',new Date(now+120_001),'expired_but_not_due'),false);
  assert.equal(await claimDutyFreeAttempt(db,'shilla',new Date(now+3_600_001),'new'),true);
 const older=await saveDutyFreeSuccess(db,observation('shilla',now,1340),'old');assert.equal(older.changedRows,0);assert.equal(older.leaseOwned,false);
  const latest=await saveDutyFreeSuccess(db,observation('shilla',now+3_600_002,1345),'new');assert.equal(latest.leaseOwned,true);
  assert.equal((await readDutyFreeSnapshot(db,new Date(now+3_600_003))).sources[0].observation.krwPerUnit,1345);
});

test('bad content, excessive bodies and invalid selector never replace a verified price',async t=>{
 for(const response of [new Response('{}',{headers:{'content-type':'application/json'}}),html(shilla().replace('sum','price')),new Response('x',{headers:{'content-type':'text/html','content-length':'3000000'}})]){
  const {db}=localDb(t);await collectDutyFreeExchange(db,{vendors:['shilla'],now:()=>new Date(now),fetchImpl:async()=>html(shilla())});
  const [result]=await collectDutyFreeExchange(db,{vendors:['shilla'],now:()=>new Date(now+3_600_001),fetchImpl:async()=>response});
  assert.equal(result.status,'BLOCKED');assert.equal((await readDutyFreeSnapshot(db,new Date(now+3_600_001))).sources[0].observation.krwPerUnit,1343.4);
 }
});

test('storage claim failure makes zero provider requests and exposes no raw error',async()=>{
 let calls=0;const db={prepare(){throw new Error('private upstream token must not escape');}};
 const results=await collectDutyFreeExchange(db,{now:()=>new Date(now),fetchImpl:async()=>{calls++;return html(shilla());}});
 assert.equal(calls,0);assert.ok(results.every(x=>x.status==='ERROR'&&x.errorCode==='STORAGE_UNAVAILABLE'));assert.ok(!JSON.stringify(results).includes('private'));
});

test('past values, delayed collection, unavailable vendors and selections keep separate truth states',async t=>{
 const {db}=localDb(t);await collectDutyFreeExchange(db,{vendors:['shilla'],now:()=>new Date(now),fetchImpl:async()=>html(shilla())});
 const snapshot=await readDutyFreeSnapshot(db,new Date(now));
 assert.equal(dutyFreePresentation(snapshot,now+25*3_600_000)[0].current,false);
 const nextDay=Date.parse('2026-10-08T15:00:00Z');assert.equal(dutyFreePresentation(snapshot,nextDay)[0].current,false);
 assert.deepEqual(dutyFreePresentation(snapshot,now,'2026-10-07'),[]);assert.deepEqual(dutyFreePresentation(snapshot,now-1),[]);
 assert.equal(kstExchangeDate(Number.MAX_VALUE),null);
});

test('shared cache serves only the public stored read and cannot cross KST midnight or multiply keys',()=>{
 assert.equal(shouldRouteToSummaryCache('GET','/api/live/duty-free-exchange'),true);
 for(const [method,path] of [['POST','/api/live/duty-free-exchange'],['GET','/api/live/duty-free-exchange/'],['GET','/api/live/duty-free-exchange/collect']])assert.equal(shouldRouteToSummaryCache(method,path),false);
 assert.equal(canonicalSummaryUrl(new URL('https://example.com/api/live/duty-free-exchange?date=2026-10-07&month=bad&view=records&x=1')),'https://example.com/api/live/duty-free-exchange');
 assert.equal(dutyFreeCacheControl(now,true),'public, max-age=60, s-maxage=300');
 assert.equal(dutyFreeCacheControl(Date.parse('2026-10-08T14:59:58Z'),true),'public, max-age=2, s-maxage=2');
 assert.equal(dutyFreeCacheControl(now,false),'no-store');
});

test('real local workerd D1: collector storage reaches the actual public GET handler without provider calls on reads',async t=>{
 const compiled=await build({stdin:{contents:'import { GET } from "./app/api/live/duty-free-exchange/route.ts"; export default {fetch:GET};',resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:workers']});
 const mf=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['DB']});t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');
 for(const sql of readFileSync(new URL('../drizzle/0022_duty_free_exchange.sql',import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const at=new Date();let calls=0;
 const results=await collectDutyFreeExchange(db,{now:()=>at,fetchImpl:async url=>{calls++;return html(url===dutyFreeSources.shilla?shilla():ssg());}});
 assert.ok(results.every(result=>result.status==='SUCCESS'));assert.equal(calls,2);
 const response=await mf.dispatchFetch('http://localhost/api/live/duty-free-exchange');assert.equal(response.status,200);
 const snapshot=await response.json();assert.equal(snapshot.collectionMode,'AUTOMATED');assert.equal(snapshot.sources.length,2);
 assert.deepEqual(dutyFreePresentation(snapshot,Date.now()).map(row=>row.krwPerUnit),[1343.4,1344.5]);
 assert.equal(response.headers.get('cache-control'),'public, max-age=60, s-maxage=300');
 await mf.dispatchFetch('http://localhost/api/live/duty-free-exchange?x=ignored');assert.equal(calls,2);
});
