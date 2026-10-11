import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {collectCustomsNews,CUSTOMS_NEWS_COLLECTION_REVIEWED,customsWithdrawalFingerprint} from '../lib/customs-news-collector.ts';
import {storeOfficialNews,storedOfficialNews,readOfficialNews} from '../lib/airport-customs-news-store.ts';
import {publicNewsProjection} from '../lib/airport-customs-news.ts';

const at='2026-10-11T01:00:00Z',later='2026-10-12T01:00:00Z';
const boards=[1362,1364,1365,1366],key='0123456789abcdef0123456789abcdef';
const origin='https://www.customs.go.kr',quote='이 자료의 공개 및 재사용 허락을 철회합니다.';
const title=id=>'Fixture 면세 안내 '+id;
const articleUrl=id=>origin+'/kcs/na/ntt/selectNttInfo.do?nttSn='+id;
const boundUrl=id=>articleUrl(id)+'&nttSnUrl='+key;
const attachmentUrl=origin+'/common/nttFileDownload.do?fileKey='+key;
const rawHash=html=>createHash('sha256').update(html,'utf8').digest('hex');
const sequence=(start,count)=>Array.from({length:count},(_,index)=>String(start+index));
function articleHtml(id,{licensed=true,body='',identity=id,heading=title(id)}={}){
 return '<title>관세청-'+heading+'</title><input name="nttSn" value="'+identity+'"><input name="nttSnUrl" value="'+key+'">'
  +'<th>작성자</th><td>Fixture author</td><th>수정일</th><td>2026.10.01 09:00:00</td><p>'+body+'</p>'
  +'<a href="/common/nttFileDownload.do?fileKey='+key+'" title="Fixture.pdf 다운로드">Fixture document</a>'
  +(licensed?'<div class="codeView01"><img src="/images/board/kogl/new_img_opentype01.png"><span>'+title(id)+'</span><a href="https://www.kogl.or.kr/info/licenseType1.do">출처</a></div>':'');
}
function fixtureHttp(feeds,{linked=feeds,articles=new Map()}={}){
 const calls=[];
 const fetchImpl=async(input,options)=>{
  assert.equal(options.redirect,'error');
  const url=new URL(input);
  assert.equal(url.origin,origin);
  const board=Number(url.searchParams.get('bbsId'));
  if(url.pathname==='/kcs/selectBoardRss.do'){
   calls.push({kind:'rss',board});
   return new Response('<rss>'+(feeds[board]??[]).map(id=>'<item><title>'+title(id)+'</title><link>'+articleUrl(id)+'</link><pubDate>2026-10-01 09:00:00.0</pubDate></item>').join('')+'</rss>');
  }
  if(url.pathname==='/kcs/na/ntt/selectNttList.do'){
   calls.push({kind:'list',board});
   return new Response((linked[board]??[]).map(id=>'<a class="nttInfoBtn" data-id="'+id+'" data-url="'+key+'">Fixture</a>').join(''));
  }
  assert.equal(url.pathname,'/kcs/na/ntt/selectNttInfo.do');
  assert.equal(url.searchParams.get('nttSnUrl'),key);
  const id=url.searchParams.get('nttSn');calls.push({kind:'article',id});
  const response=articles.get(id);
  return typeof response==='number'?new Response('Fixture HTTP error',{status:response}):new Response(response??articleHtml(id));
 };
 return {calls,fetchImpl};
}
function database(t){const db=new SqliteD1();t.after(()=>db.raw.close());return db;}
const run=(db,http,extra={})=>collectCustomsNews(db,{activation:true,fetchImpl:http.fetchImpl,now:()=>new Date(at),...extra});
const articleCalls=http=>http.calls.filter(call=>call.kind==='article').map(call=>call.id);
const currentRows=db=>db.raw.prepare('SELECT * FROM official_news_current ORDER BY source,source_id').all();
const revisionRows=db=>db.raw.prepare('SELECT * FROM official_news_revision ORDER BY rowid').all();
const totalChanges=db=>db.raw.prepare('SELECT total_changes() n').get().n;
function approved(id,{articleEvidence=false}={}){
 return {source:'customs',sourceId:id,sourceName:'Fixture approved source',title:title(id),url:boundUrl(id),
  publishedAt:'2026-10-01T00:00:00Z',receivedAt:at,modifiedAt:'2026-10-01T00:00:00Z',status:'announced',topic:'customs',relevantToRetail:true,
  clearance:{commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:articleEvidence?boundUrl(id):attachmentUrl,confirmedAt:at,attribution:'Fixture approval: not production news'},
  contentFingerprint:'approved-fixture',facts:[{text:'Approved source fact',verifiedBySource:true}],changes:[{text:'Approved change',verifiedBySource:true}],audience:[{text:'Approved audience',verifiedBySource:true}],
  effectiveDate:{date:'2026-11-01',evidence:'Approved effective date evidence',verified:true},deadline:{date:'2026-11-30',evidence:'Approved deadline evidence',verified:true},
  attachments:[{url:attachmentUrl,name:'Fixture.pdf',review:'verified',sha256:'a'.repeat(64),reviewedAt:at}],attachmentNeedsReview:false,attachmentListComplete:true};
}
const withdrawal=(id,html,overrides={})=>({articleId:id,evidenceUrl:boundUrl(id),sourceFingerprint:rawHash(html),quote,reviewedAt:at,rightsWithdrawn:true,...overrides});

test('all four boards receive five article reads within the 28-request ceiling',async t=>{
 const db=database(t),feeds=Object.fromEntries(boards.map((board,index)=>[board,sequence(1000+index*100,8)])),http=fixtureHttp(feeds);
 const result=await run(db,http),ids=articleCalls(http);
 assert.equal(result.requests,28);assert.equal(http.calls.length,28);
 assert.deepEqual(http.calls.slice(0,8),boards.flatMap(board=>[{kind:'rss',board},{kind:'list',board}]));
 assert.deepEqual(ids,Array.from({length:5},(_,index)=>boards.map(board=>feeds[board][index])).flat());
 assert.equal(new Set(ids).size,20);assert.equal(result.currentChanges,20);assert.equal(result.revisionChanges,0);
 assert.equal(currentRows(db).length,20);assert.equal((await readOfficialNews(db,'2026-10-11')).length,0);
 for(const id of ids){const stored=await storedOfficialNews(db,'customs',id);assert.equal(stored.sourceId,id);assert.equal(stored.collectionReview.candidate.sourceId,id);}
});

test('unused board slots are redistributed while shared IDs and unbound list entries spend no article request',async t=>{
 const db=database(t),feeds={1362:[],1364:sequence(2000,2),1365:sequence(3000,12),1366:sequence(4000,12)},http=fixtureHttp(feeds);
 const result=await run(db,http),ids=articleCalls(http);
 assert.equal(result.requests,28);assert.equal(ids.length,20);
 assert.deepEqual(boards.map(board=>ids.filter(id=>(feeds[board]??[]).includes(id)).length),[0,2,9,9]);
 const secondDb=database(t),shared={1362:['501','502','503'],1364:['501','504'],1365:['502','505'],1366:['504','506']};
 const linked={...shared,1362:['501','503'],1365:['505']},second=fixtureHttp(shared,{linked});
 assert.equal((await run(secondDb,second)).requests,13);
 assert.deepEqual(articleCalls(second),['501','504','505','506','503']);
 assert.equal(await storedOfficialNews(secondDb,'customs','502'),null);
 assert.equal(currentRows(secondDb).length,5);
});

test('an article saved before a later 429 survives with no retry or invented completed collection',async t=>{
 const db=database(t),http=fixtureHttp({1362:['601','602']},{articles:new Map([['602',429]])});
 await assert.rejects(run(db,http),/NEWS_HTTP_429/);
 assert.equal(http.calls.length,10);assert.deepEqual(articleCalls(http),['601','602']);
 assert.equal((await storedOfficialNews(db,'customs','601')).sourceId,'601');
 assert.equal(await storedOfficialNews(db,'customs','602'),null);
 assert.equal(currentRows(db).length,1);assert.equal(revisionRows(db).length,0);
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
});

test('recollection preserves every approved fact, date and verified attachment; repeated observation writes zero',async t=>{
 const db=database(t),original=approved('701');await storeOfficialNews(db,[original]);
 const first=await run(db,fixtureHttp({1362:['701']}));
 assert.equal(first.currentChanges,0);assert.equal(first.revisionChanges,0);assert.equal(first.reviewChanges,1);assert.equal(first.blockedChanges,0);
 const stored=await storedOfficialNews(db,'customs','701');
 assert.deepEqual(publicNewsProjection(stored),original);
 assert.equal(stored.collectionReview.candidate.attachments[0].review,'pending');
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[original]);
 const before=currentRows(db),revisions=revisionRows(db),writes=totalChanges(db);
 const repeated=await run(db,fixtureHttp({1362:['701']}),{now:()=>new Date(later)});
 for(const field of ['currentChanges','revisionChanges','reviewChanges','blockedChanges'])assert.equal(repeated[field],0,field);
 assert.deepEqual(currentRows(db),before);assert.deepEqual(revisionRows(db),revisions);assert.equal(totalChanges(db),writes);
});

test('a missing Type 1 mark does not revoke separate PDF approval or assert an explicit withdrawal',async t=>{
 for(const articleEvidence of [false,true]){
  const db=database(t),original=approved('801',{articleEvidence});await storeOfficialNews(db,[original]);
  const result=await run(db,fixtureHttp({1362:['801']},{articles:new Map([['801',articleHtml('801',{licensed:false})]])}));
  const stored=await storedOfficialNews(db,'customs','801');
  assert.deepEqual(publicNewsProjection(stored),original);assert.equal(stored.collectionReview.candidate.status,'review');
  assert.deepEqual(stored.collectionReview.reasons,articleEvidence?['RIGHTS_UNCONFIRMED']:[]);
  assert.equal(result.blockedChanges,articleEvidence?1:0);assert.equal(revisionRows(db).length,0);
  assert.deepEqual(await readOfficialNews(db,'2026-10-11'),articleEvidence?[]:[original]);
 }
});

test('exact reviewed withdrawal blocks publication before a later 429 and repeated withdrawal cannot write or reopen it',async t=>{
 const db=database(t),original=approved('901'),html=articleHtml('901',{licensed:false,body:quote});
 await storeOfficialNews(db,[original]);assert.equal(await customsWithdrawalFingerprint(html),rawHash(html));
 const review=withdrawal('901',html),http=fixtureHttp({1362:['901','902']},{articles:new Map([['901',html],['902',429]])});
 await assert.rejects(run(db,http,{withdrawalReviews:[review]}),/NEWS_HTTP_429/);
 assert.deepEqual(articleCalls(http),['901','902']);assert.equal(http.calls.length,10);
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);assert.equal(currentRows(db)[0].may_publish,0);
 const stored=await storedOfficialNews(db,'customs','901');assert.deepEqual(publicNewsProjection(stored),original);
 assert.equal(stored.collectionReview.candidate.status,'withdrawn');assert.ok(stored.collectionReview.reasons.includes('RIGHTS_WITHDRAWN'));
 const before=currentRows(db),writes=totalChanges(db);
 const repeated=await run(db,fixtureHttp({1362:['901']},{articles:new Map([['901',html]])}),{withdrawalReviews:[review],now:()=>new Date(later)});
 for(const field of ['currentChanges','revisionChanges','reviewChanges','blockedChanges'])assert.equal(repeated[field],0,field);
 assert.deepEqual(currentRows(db),before);assert.equal(totalChanges(db),writes);assert.equal(revisionRows(db).length,0);
});

test('wrong article IDs are ignored and every malformed matching withdrawal binding leaves approval untouched',async t=>{
 const id='951',body=quote+' 이전 행사 신청을 취소합니다.',html=articleHtml(id,{licensed:false,body});
 const variants=[
  {name:'unbound URL',change:{evidenceUrl:articleUrl(id)}},
  {name:'another article URL',change:{evidenceUrl:boundUrl('952')}},
  {name:'foreign URL',change:{evidenceUrl:'https://example.invalid/article'}},
  {name:'wrong raw fingerprint',change:{sourceFingerprint:'f'.repeat(64)}},
  {name:'empty quote',change:{quote:''}},
  {name:'quote missing from source',change:{quote:'이 자료의 공개 허락을 중단합니다.'}},
  {name:'cancellation without a rights role',change:{quote:'이전 행사 신청을 취소합니다.'}},
  {name:'invalid reviewed time',change:{reviewedAt:'not-a-timestamp'}},
  {name:'withdrawal not confirmed',change:{rightsWithdrawn:false}},
  {name:'duplicate matching reviews',duplicate:true},
  {name:'wrong hidden article identity',html:articleHtml(id,{licensed:false,body,identity:'952'})},
  {name:'wrong title identity',html:articleHtml(id,{licensed:false,body,heading:'Different fixture'})},
  {name:'quote appears only in a comment',html:articleHtml(id,{licensed:false,body:'<!--'+quote+'-->'})},
  {name:'quote appears only in a script',html:articleHtml(id,{licensed:false,body:'<script>'+quote+'</script>'})},
 ];
 for(const variant of variants){
  const db=database(t),original=approved(id);await storeOfficialNews(db,[original]);
  const response=variant.html??html,review=withdrawal(id,response,variant.change),before=currentRows(db),writes=totalChanges(db);
  const http=fixtureHttp({1362:[id]},{articles:new Map([[id,response]])});
  await assert.rejects(run(db,http,{withdrawalReviews:variant.duplicate?[review,review]:[review]}),/NEWS_WITHDRAWAL_REVIEW_UNBOUND/,variant.name);
  assert.deepEqual(currentRows(db),before,variant.name);assert.equal(totalChanges(db),writes,variant.name);
  assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[original],variant.name);assert.equal(http.calls.length,9,variant.name);
 }
 const db=database(t),original=approved(id);await storeOfficialNews(db,[original]);
 const result=await run(db,fixtureHttp({1362:[id]},{articles:new Map([[id,html]])}),{withdrawalReviews:[withdrawal('999',html)]});
 assert.equal(result.blockedChanges,0);assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[original]);
});

test('checked-in OFF gate performs zero HTTP requests and zero database operations',async()=>{
 assert.equal(CUSTOMS_NEWS_COLLECTION_REVIEWED,false);
 const unexpected=()=>{throw Error('OFF gate performed external work');};
 const result=await collectCustomsNews({prepare:unexpected,batch:unexpected},{fetchImpl:unexpected});
 assert.equal(result.state,'DORMANT');
 for(const field of ['requests','currentChanges','revisionChanges','reviewChanges','blockedChanges'])assert.equal(result[field],0,field);
});
