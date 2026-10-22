import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {sha256,allowanceSemanticHash,inspectSourceBytes} from '../lib/customs-allowance-check.mjs';
import {collectAllowanceObservations} from '../scripts/collect-customs-allowances.ts';
import {readAllowanceObservations,storeAllowanceObservation,allowanceStatusProjection} from '../lib/customs-allowance-runtime.ts';
import {allowanceStatusResponse} from '../app/api/airport/allowance-status/route.ts';
const bytes=Buffer.from('<html><body>Fixture legal facts only.</body></html>'),url='https://www.customs.go.jp/fixture',at='2026-10-20T00:00:00.000Z';
const manifest={version:1,automaticCollectionEnabled:false,publicationEnabled:false,policy:{maxRequests:24,maxBytes:1048576,timeoutMs:15000,minIntervalHours:24},allowedHosts:['www.customs.go.jp'],sources:[{id:'JP-01',jurisdiction:'JP',label:'Fixture',url,format:'html',monitoringRole:'priority_candidate',accessReview:{url,automatedReadAllowed:true,evidenceUrl:'https://www.customs.go.jp/robots.txt',reviewedAt:at,minIntervalHours:24},baseline:{url,sha256:sha256(bytes),reviewedAt:at}}]};
const dataset={countries:[{id:'JP',checkedAt:'2026-10-19',verifiedAt:'2026-10-19',scope:'Fixture travellers',conditions:[{id:'age',options:[{id:'adult'}]}],results:[{when:{age:['adult']},facts:[{label:'Goods',value:'Fixture 100'}]}],sources:[{url}]}]};
const options={activation:true,manifest,dataset,now:()=>new Date(at),fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'text/html'}})};
test('daily due-state persists, no calls/writes on repeats, source checks never change legal facts',async()=>{
 const db=new SqliteD1();const original=JSON.stringify(dataset);let requests=0;
 const first=await collectAllowanceObservations(db,{...options,fetchImpl:async()=>{requests++;return options.fetchImpl();}});
 assert.deepEqual(first,{state:'CHECKED',requests:1,writes:1,checked:1,skipped:0,numericCanonicalRowsWritten:0});
 db.calls=[];const again=await collectAllowanceObservations(db,{...options,fetchImpl:()=>{throw Error('must not call');}});
 assert.equal(again.state,'NOT_DUE');assert.equal(again.writes,0);assert.equal(again.requests,0);assert.ok(db.calls.every(sql=>sql.startsWith('SELECT')));
 const next=await collectAllowanceObservations(db,{...options,now:()=>new Date('2026-10-21T00:00:00Z')});assert.equal(next.checked,1);assert.equal(next.writes,1);
 assert.equal(JSON.stringify(dataset),original);assert.equal(requests,1);db.raw.close();
});
test('blocked/changed source preserve last-good identity and never announce a verified regulation change',async()=>{
 const db=new SqliteD1();await collectAllowanceObservations(db,options);
 await collectAllowanceObservations(db,{...options,now:()=>new Date('2026-10-21T00:00:00Z'),fetchImpl:async()=>new Response('<html><body>Changed</body></html>',{headers:{'content-type':'text/html'}})});
 let rows=await readAllowanceObservations(db);assert.equal(rows[0].state,'SOURCE_CHANGED_REVIEW_REQUIRED');assert.equal(rows[0].last_good_verified_at,'2026-10-19');assert.equal(rows[0].last_good_hash,allowanceSemanticHash(dataset.countries[0]));
 const publicValue=allowanceStatusProjection(rows,new Date('2026-10-21T00:00:00Z'));assert.equal(publicValue.countries[0].state,'REVIEW_REQUIRED');assert.equal(publicValue.countries[0].regulationChangeConfirmed,false);
 await collectAllowanceObservations(db,{...options,now:()=>new Date('2026-10-22T00:00:00Z'),fetchImpl:async()=>new Response('blocked',{status:403})});
 rows=await readAllowanceObservations(db);assert.equal(rows[0].state,'COLLECTION_BLOCKED');assert.equal(rows[0].last_good_verified_at,'2026-10-19');assert.equal(allowanceStatusProjection(rows,new Date('2026-10-25')).countries[0].state,'STALE');db.raw.close();
});
test('unreviewed source is explicitly blocked with zero provider calls; dormant and missing storage fail safely',async()=>{
 const dormant=await collectAllowanceObservations({prepare(){throw Error('no db');}});assert.equal(dormant.state,'DORMANT');
 const db=new SqliteD1();const unreviewed=structuredClone(manifest);unreviewed.sources[0].accessReview=null;
 const result=await collectAllowanceObservations(db,{...options,manifest:unreviewed,fetchImpl:()=>{throw Error('no request');}});assert.equal(result.requests,0);assert.equal(result.state,'REVIEW_REQUIRED');
 assert.equal((await readAllowanceObservations(db))[0].reason,'ACCESS_REVIEW_REQUIRED');
 const projection=allowanceStatusProjection(await readAllowanceObservations(db),new Date(at));
 assert.equal(projection.countries[0].accessReviewRequired,true);assert.equal(projection.countries[0].lastSuccessfulCheckAt,null);
 assert.equal((await (await allowanceStatusResponse(null)).json()).status,'MISSING');
 const absent=new SqliteD1(':memory:',false);assert.equal((await (await allowanceStatusResponse(absent)).json()).status,'UNAVAILABLE');absent.raw.close();db.raw.close();
});
test('checkedAt and invalid verifiedAt never become a last-good review date on blocked observations',async()=>{
 for(const verifiedAt of [undefined,'','2026-02-30','2026-10-21T00:00:00Z']){
  const db=new SqliteD1(),unreviewed=structuredClone(manifest),unverified=structuredClone(dataset);
  unreviewed.sources[0].accessReview=null;unverified.countries[0].verifiedAt=verifiedAt;
  try{const result=await collectAllowanceObservations(db,{...options,manifest:unreviewed,dataset:unverified,fetchImpl:()=>{throw Error('must not request');}});
   assert.equal(result.requests,0);assert.equal((await readAllowanceObservations(db))[0].last_good_verified_at,null);
  }finally{db.raw.close();}
 }
});
test('only successful stored observations supply an automatic success date, not last-good manual dates',async()=>{
 const db=new SqliteD1();try{
  await collectAllowanceObservations(db,options);
  let projection=allowanceStatusProjection(await readAllowanceObservations(db),new Date(at));
  assert.equal(projection.countries[0].lastSuccessfulCheckAt,at);assert.equal(projection.countries[0].accessReviewRequired,false);
  await collectAllowanceObservations(db,{...options,now:()=>new Date('2026-10-21T00:00:00Z'),fetchImpl:async()=>new Response('unavailable',{status:503})});
  projection=allowanceStatusProjection(await readAllowanceObservations(db),new Date('2026-10-21T00:00:00Z'));
  assert.equal(projection.countries[0].lastSuccessfulCheckAt,null);assert.equal(projection.countries[0].accessReviewRequired,false);
 }finally{db.raw.close();}
});
test('CAS and stale writes cannot replace newer check; public endpoint performs only bounded SELECT',async()=>{
 const db=new SqliteD1();await collectAllowanceObservations(db,options);const old=(await readAllowanceObservations(db))[0];
 const item={sourceId:'JP-01',jurisdiction:'JP',url,state:'COLLECTION_FAILED',checkedAt:at,sourceSha256:null,reason:'TIMEOUT',lastGood:{semanticHash:old.last_good_hash,verifiedAt:old.last_good_verified_at}};
 assert.equal(await storeAllowanceObservation(db,item,'2026-10-21T00:00:00Z',old),0);
 await collectAllowanceObservations(db,{...options,now:()=>new Date('2026-10-21T00:00:00Z')});
 assert.equal(await storeAllowanceObservation(db,{...item,checkedAt:'2026-10-20T01:00:00Z'},'2026-10-21T01:00:00Z',old),0);
 db.calls=[];const result=await allowanceStatusResponse(db,new Date('2026-10-21'));assert.equal((await result.json()).status,'STORED');assert.ok(db.calls.every(sql=>sql.startsWith('SELECT')));db.raw.close();
});
test('reviewed Shift-JIS is explicit, not an automatic fallback; source config and workflow remain bounded',()=>{
 const ascii=Buffer.from('<html><body>Fixture</body></html>');assert.equal(inspectSourceBytes({format:'html',encoding:'shift_jis'},ascii,'text/html; charset=Shift_JIS').sha256,sha256(ascii));
 assert.throws(()=>inspectSourceBytes({format:'html'},ascii,'text/html; charset=Shift_JIS'),/UNSUPPORTED_ENCODING/);
 const workflow=readFileSync('.github/workflows/collect-production.yml','utf8');assert.equal((workflow.match(/cron:/g)||[]).length,1);assert.match(workflow,/scripts\/collect-customs-allowances.ts/);
 assert.doesNotMatch(workflow,/OPENAI_API|ANTHROPIC_API|larger-runner/);
});
test('Taiwan comparison excludes session state but includes every legal paragraph and attachment',()=>{
 const source={id:'TW-01',format:'html',extractor:'tw-law-block-v1'};
 const content='<div class="table-title">入境旅客攜帶行李物品報驗稅放辦法 第 18 條 <a href="law-v1.pdf">附件</a>35000</div><!-- 主要內容結束 -->';
 const html=token=>Buffer.from('<html><body><input value="'+token+'">'+content+'</body></html>');
 const first=inspectSourceBytes(source,html('one'),'text/html'),second=inspectSourceBytes(source,html('two'),'text/html');
 assert.notEqual(first.sha256,second.sha256);assert.equal(first.contentSha256,second.contentSha256);
 assert.notEqual(first.contentSha256,inspectSourceBytes(source,Buffer.from(html('one').toString().replace('35000','40000')),'text/html').contentSha256);
 assert.notEqual(first.contentSha256,inspectSourceBytes(source,Buffer.from(html('one').toString().replace('law-v1.pdf','law-v2.pdf')),'text/html').contentSha256);
 assert.throws(()=>inspectSourceBytes(source,Buffer.from('<html><body>Different site layout</body></html>'),'text/html'),/SOURCE_STRUCTURE_CHANGED/);
});

test('allowance rendering responses remain noindex for stored, missing and failed storage',async()=>{
 const db=new SqliteD1();
 try {
  await collectAllowanceObservations(db,options);
  for(const storage of [db,null,{prepare(){throw Error('unavailable');}}]){
   const response=await allowanceStatusResponse(storage);
   assert.equal(response.headers.get('x-robots-tag'),'noindex');
  }
 } finally {db.raw.close();}
});
