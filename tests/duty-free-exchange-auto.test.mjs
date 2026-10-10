import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectDutyFreeExchange,parseDutyFreeHtml,parseDutyFreeDatedHtml} from '../lib/duty-free-exchange-collector.ts';
import {claimDutyFreeAttempt,saveDutyFreeSuccess,saveDutyFreeFailure,readDutyFreeSnapshot,DUTY_FREE_BLOCK_INTERVAL_MS} from '../lib/duty-free-exchange-store.ts';
import {dutyFreePresentation,dutyFreeDatedPresentation,dutyFreeSources,kstExchangeDate,mergeDutyFreeSnapshot,dutyFreeReadDelay} from '../lib/duty-free-exchange.ts';
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
 sql.exec(readFileSync(new URL('../drizzle/0024_duty_free_exchange_daily.sql',import.meta.url),'utf8'));
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

test('real SQL: only Shilla is collected and duplicate invocations spend zero requests',async t=>{
 const {db}=localDb(t);let calls=0;
 const fetchImpl=async url=>{calls++;return html(url===dutyFreeSources.shilla?shilla():ssg());};
 const first=await collectDutyFreeExchange(db,{fetchImpl,now:()=>new Date(now)});
 assert.deepEqual(first.map(x=>[x.vendor,x.status,x.changedRows]),[['shilla','SUCCESS',1]]);assert.equal(calls,1);
 const snapshot=await readDutyFreeSnapshot(db,new Date(now));
 assert.deepEqual(dutyFreePresentation(snapshot,now).map(x=>[x.vendor,x.krwPerUnit,x.current]),[['shilla',1343.4,true]]);
 const next=await collectDutyFreeExchange(db,{fetchImpl,now:()=>new Date(now+1000)});
 assert.ok(next.every(x=>x.status==='SKIPPED_NOT_DUE'&&x.providerRequests===0));assert.equal(calls,1);
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

test('real midnight incident: yesterday 23:52 success cannot defer missing today until 00:52',async t=>{
 const {db}=localDb(t);let clock=Date.parse('2026-10-10T14:52:54.577Z'),calls=0;
 const options={now:()=>new Date(clock),fetchImpl:async()=>{calls++;return html(shilla());}};
 await collectDutyFreeExchange(db,options);
 clock=Date.parse('2026-10-10T15:07:49Z');
 const [result]=await collectDutyFreeExchange(db,options);
 assert.equal(result.status,'SUCCESS');assert.equal(result.changedRows,1);assert.equal(calls,2);
 const snapshot=await readDutyFreeSnapshot(db,new Date(clock));
 assert.equal(dutyFreeDatedPresentation(snapshot,clock).find(row=>row.current).serviceDateKst,'2026-10-11');
 assert.equal(snapshot.sources[0].nextAttemptAt,'2026-10-10T16:07:49.000Z');
 await collectDutyFreeExchange(db,options);assert.equal(calls,2);
});

test('a verified precollected tomorrow rate needs no midnight exception or relabeling',async t=>{
 const {db}=localDb(t);const before=Date.parse('2026-10-10T14:52:54Z'),after=Date.parse('2026-10-10T15:07:49Z');
 await claimDutyFreeAttempt(db,'shilla',new Date(before),'precollection');
 const tomorrow={...observation('shilla',before,1340),serviceDateKst:'2026-10-11',dateEvidence:'EXPLICIT_SOURCE_DATE'};
 await saveDutyFreeSuccess(db,observation('shilla',before),'precollection',[tomorrow]);
 let calls=0;const [result]=await collectDutyFreeExchange(db,{now:()=>new Date(after),fetchImpl:async()=>{calls++;return html(shilla());}});
 assert.equal(result.status,'SKIPPED_NOT_DUE');assert.equal(calls,0);
 const row=dutyFreeDatedPresentation(await readDutyFreeSnapshot(db,new Date(after)),after).find(row=>row.current);
 assert.equal(row.serviceDateKst,'2026-10-11');assert.equal(row.verifiedAt,new Date(before).toISOString());assert.equal(row.krwPerUnit,1340);
});

test('first-hour transient missing-date recovery is durable and bounded, while a known today keeps its hourly guard',async t=>{
 const {db,sql}=localDb(t);const start=Date.parse('2026-10-10T15:00:00Z');let clock=start,calls=0;
 const options={now:()=>new Date(clock),fetchImpl:async()=>{calls++;return new Response('temporary',{status:503});}};
 for(let i=0;i<4;i++){
  clock=start+i*900_000;assert.equal((await collectDutyFreeExchange(db,options))[0].status,'ERROR');
  clock+=899_999;assert.equal((await collectDutyFreeExchange(db,options))[0].status,'SKIPPED_NOT_DUE');
 }
 assert.equal(calls,4);clock=start+3_600_000;await collectDutyFreeExchange(db,options);assert.equal(calls,5);
 assert.equal(sql.prepare('SELECT next_due_at FROM duty_free_exchange_attempt').get().next_due_at,'2026-10-10T17:00:00.000Z');
 const other=localDb(t);assert.equal(await claimDutyFreeAttempt(other.db,'shilla',new Date(start),'known'),true);
 await saveDutyFreeSuccess(other.db,observation('shilla',start),'known');
 assert.equal(await claimDutyFreeAttempt(other.db,'shilla',new Date(start+900_000),'too_soon'),false);
});

test('midnight claims remain exclusive, crash budgets persist, and blocked previous-day attempts stay blocked',async t=>{
 const {db}=localDb(t);const before=Date.parse('2026-10-10T14:52:54Z'),after=Date.parse('2026-10-10T15:07:49Z');
 await claimDutyFreeAttempt(db,'shilla',new Date(before),'previous');await saveDutyFreeSuccess(db,observation('shilla',before),'previous');
 const claims=await Promise.all([claimDutyFreeAttempt(db,'shilla',new Date(after),'first'),claimDutyFreeAttempt(db,'shilla',new Date(after),'second')]);
 assert.deepEqual(claims,[true,false]);
 assert.equal(await claimDutyFreeAttempt(db,'shilla',new Date(after+120_001),'expired'),false);
 assert.equal(await claimDutyFreeAttempt(db,'shilla',new Date(after+900_000),'due'),true);
 const blocked=localDb(t);await claimDutyFreeAttempt(blocked.db,'shilla',new Date(before),'blocked');
 await saveDutyFreeFailure(blocked.db,'shilla','blocked',new Date(before),'HTTP_406',true);
 assert.equal(await claimDutyFreeAttempt(blocked.db,'shilla',new Date(after),'no_bypass'),false);
});

test('406 has one request, no retry or workaround, 24-hour guard, and preserves original last-good timestamp',async t=>{
 const {db}=localDb(t);let clock=now;
 await collectDutyFreeExchange(db,{vendors:['shilla'],fetchImpl:async()=>html(shilla()),now:()=>new Date(clock)});
 clock+=3_600_001;let calls=0;
 const options={vendors:['shilla'],now:()=>new Date(clock),fetchImpl:async()=>{calls++;return new Response('blocked',{status:406});}};
 const [failed]=await collectDutyFreeExchange(db,options);assert.equal(failed.status,'BLOCKED');assert.equal(failed.errorCode,'HTTP_406');assert.equal(calls,1);
 const snapshot=await readDutyFreeSnapshot(db,new Date(clock));assert.equal(snapshot.sources[0].observation.verifiedAt,new Date(now).toISOString());
 assert.equal(Date.parse(snapshot.sources[0].nextAttemptAt),clock+DUTY_FREE_BLOCK_INTERVAL_MS);
 assert.equal(dutyFreePresentation(snapshot,clock)[0].current,true);
 clock+=3_600_000;await collectDutyFreeExchange(db,options);assert.equal(calls,1);
});

test('retired Shinsegae records are preserved while collection, API and presentation use only Shilla',async t=>{
 const {db,sql}=localDb(t);
 await claimDutyFreeAttempt(db,'shinsegae',new Date(now),'historical');
 await saveDutyFreeSuccess(db,observation('shinsegae',now,1344.5),'historical');
 const stored=()=>['duty_free_exchange_current','duty_free_exchange_attempt'].map(table=>({...sql.prepare(`SELECT * FROM ${table} WHERE vendor='shinsegae'`).get()}));
 const before=stored();let calls=0;
 const result=await collectDutyFreeExchange(db,{now:()=>new Date(now),fetchImpl:async url=>{calls++;assert.equal(url,dutyFreeSources.shilla);return html(shilla());}});
 assert.deepEqual(result.map(x=>[x.vendor,x.status]),[['shilla','SUCCESS']]);assert.equal(calls,1);
 const snapshot=await readDutyFreeSnapshot(db,new Date(now));assert.equal(snapshot.sources.length,1);assert.equal(snapshot.sources[0].observation.krwPerUnit,1343.4);
 const legacy={vendor:'shinsegae',observation:observation('shinsegae',now,1344.5),lastAttemptStatus:'SUCCESS'};
 assert.deepEqual(dutyFreePresentation({...snapshot,sources:[...snapshot.sources,legacy]},now).map(x=>x.vendor),['shilla']);
 assert.deepEqual(stored(),before);
 let inactiveReads=0;
 await assert.rejects(collectDutyFreeExchange({prepare(){inactiveReads++;throw new Error('must not read');}},
  {vendors:['shilla','shinsegae'],fetchImpl:async()=>{throw new Error('must not fetch');}}),/INACTIVE_VENDOR/);
 assert.equal(inactiveReads,0);assert.deepEqual(stored(),before);
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
 for(const sql of readFileSync(new URL('../drizzle/0024_duty_free_exchange_daily.sql',import.meta.url),'utf8').split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const at=new Date();let calls=0;
 const results=await collectDutyFreeExchange(db,{now:()=>at,fetchImpl:async url=>{calls++;return html(url===dutyFreeSources.shilla?shilla():ssg());}});
 assert.ok(results.every(result=>result.status==='SUCCESS'));assert.equal(calls,1);
 const response=await mf.dispatchFetch('http://localhost/api/live/duty-free-exchange');assert.equal(response.status,200);
 const snapshot=await response.json();assert.equal(snapshot.collectionMode,'AUTOMATED');assert.equal(snapshot.sources.length,1);
 assert.deepEqual(dutyFreePresentation(snapshot,Date.now()).map(row=>row.krwPerUnit),[1343.4]);
 assert.equal(response.headers.get('cache-control'),'public, max-age=60, s-maxage=300');
 await mf.dispatchFetch('http://localhost/api/live/duty-free-exchange?x=ignored');assert.equal(calls,1);
});

test('real SQL retains yesterday and dated tomorrow without replacing today or inventing history',async t=>{
 const {db,sql}=localDb(t);let clock=now;
 await collectDutyFreeExchange(db,{fetchImpl:async()=>html(shilla('1,340.00')),now:()=>new Date(clock)});
 clock=Date.parse('2026-10-08T15:07:00Z');
 const widgets=shilla('1,339.20')+shilla('1,338.00').replace('오늘의 환율','2026-10-10 익일 환율');
 const [result]=await collectDutyFreeExchange(db,{fetchImpl:async()=>html(widgets),now:()=>new Date(clock)});
 assert.equal(result.status,'SUCCESS');assert.equal(result.changedRows,2);
 const snapshot=await readDutyFreeSnapshot(db,new Date(clock));
 assert.deepEqual(dutyFreeDatedPresentation(snapshot,clock).map(row=>[row.serviceDateKst,row.krwPerUnit,row.current]),[
  ['2026-10-08',1340,false],['2026-10-09',1339.2,true],['2026-10-10',1338,false]]);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM duty_free_exchange_daily').get().n,3);
 assert.equal(snapshot.sources[0].observation.serviceDateKst,'2026-10-09');
 const after=await readDutyFreeSnapshot(db,new Date('2026-10-09T15:00:01Z'));
 assert.equal(after.sources[0].observation.krwPerUnit,1338);
 assert.equal(after.sources[0].observation.verifiedAt,new Date(clock).toISOString());
});
test('tomorrow alone is stored without changing today’s verification clock',async t=>{
 const {db}=localDb(t);
 await collectDutyFreeExchange(db,{fetchImpl:async()=>html(shilla()),now:()=>new Date(now)});
 const next=now+3_600_001;
 await collectDutyFreeExchange(db,{fetchImpl:async()=>html(shilla('1,338.00').replace('오늘의 환율','2026-10-09 익일 환율')),now:()=>new Date(next)});
 const snapshot=await readDutyFreeSnapshot(db,new Date(next));
 assert.equal(snapshot.sources[0].observation.verifiedAt,new Date(now).toISOString());
 assert.equal(dutyFreeDatedPresentation(snapshot,next).find(row=>row.serviceDateKst==='2026-10-09').dateEvidence,'EXPLICIT_SOURCE_DATE');
});
test('missing additive migration is readable and performs zero provider requests on collection',async t=>{
 const {db,sql}=localDb(t);
 await collectDutyFreeExchange(db,{fetchImpl:async()=>html(shilla()),now:()=>new Date(now)});
 sql.exec('DROP TABLE duty_free_exchange_daily');
 assert.equal((await readDutyFreeSnapshot(db,new Date(now))).sources[0].observation.krwPerUnit,1343.4);
 let calls=0;const [result]=await collectDutyFreeExchange(db,{fetchImpl:async()=>{calls++;return html(shilla());},now:()=>new Date(now+3_600_001)});
 assert.equal(calls,0);assert.equal(result.errorCode,'STORAGE_UNAVAILABLE');
});
test('explicit tomorrow date is required; conflicts and invalid calendars never manufacture a dated rate',()=>{
 assert.equal(parseDutyFreeDatedHtml('shilla',shilla(),'2026-10-08')[0].dateEvidence,'CURRENT_WIDGET');
 for(const label of ['익일 환율','2026-10-09 오늘의 환율','2026-10-10 환율','2026-02-30 환율','2026-10-08 2026-10-09 환율'])
  assert.throws(()=>parseDutyFreeDatedHtml('shilla',shilla().replace('오늘의 환율',label),'2026-10-08'));
 assert.equal(parseDutyFreeDatedHtml('shilla',shilla().replace('오늘의 환율','2026.10.09 익일 환율'),'2026-10-08')[0].serviceDateKst,'2026-10-09');
});
test('validated local retention keeps original dates/clocks, drops stale rows, and bounds midnight reads',()=>{
 const base={mode:'duty-free-exchange',collectionMode:'AUTOMATED',generatedAt:new Date(now).toISOString(),todayKst:'2026-10-08',
  sources:[{vendor:'shilla',observation:observation('shilla'),lastAttemptStatus:'SUCCESS',lastAttemptAt:null,errorCode:null,nextAttemptAt:null}]};
 const failed={...base,sources:[{...base.sources[0],observation:null,lastAttemptStatus:'ERROR'}]};
 assert.equal(mergeDutyFreeSnapshot(base,failed,now).sources[0].observation.verifiedAt,new Date(now).toISOString());
 assert.equal(mergeDutyFreeSnapshot(base,failed,now+3*86_400_000).sources[0].observation,null);
 const midnight=Date.parse('2026-10-08T15:00:00Z');
 assert.equal(dutyFreeReadDelay(midnight,false,0,11),60_000);
 assert.equal(dutyFreeReadDelay(midnight,false,0,12),900_000);
 assert.equal(dutyFreeReadDelay(midnight+15*60_000,false,0,0),900_000);
 assert.equal(dutyFreeReadDelay(now,true,1,0),30_000);
 assert.equal(dutyFreeReadDelay(now,true,2,0),90_000);
 assert.equal(dutyFreeReadDelay(now,true,3,0),900_000);
 assert.equal(dutyFreeCacheControl(midnight,true,false),'public, max-age=5, s-maxage=15');
});
