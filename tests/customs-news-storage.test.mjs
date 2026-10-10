import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {storeOfficialNews,readOfficialNews,storedOfficialNews} from '../lib/airport-customs-news-store.ts';
import {airportNewsResponse} from '../app/api/airport/news/route.ts';
import {collectCustomsNews,officialCustomsLinks,customsArticleMetadata,airportCustomsScope} from '../lib/customs-news-collector.ts';
import {applyCustomsDocumentReview} from '../lib/customs-news-document-review.ts';
const at='2026-10-11T01:00:00Z';
const rights={commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:'https://www.customs.go.kr/fixture',confirmedAt:at,attribution:'Fixture only: no production news'};
const item=(overrides={})=>({source:'customs',sourceId:'123',sourceName:'Fixture source',title:'Fixture 면세 공고',url:'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=123',publishedAt:'2026-10-01T00:00:00Z',receivedAt:at,status:'review',topic:'customs',relevantToRetail:false,clearance:rights,contentFingerprint:'fixture',facts:[],changes:[],audience:[],attachmentNeedsReview:true,...overrides});
const key='0123456789abcdef0123456789abcdef';
const xml='<rss><item><title>Fixture 면세 공고</title><link>https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?mi=2891&amp;nttSn=123</link><pubDate>2026-10-01 09:00:00.0</pubDate></item></rss>';
const html=(licensed=true)=>'<title>관세청-Fixture 면세 공고</title><input name="nttSn" value="123"><input name="nttSnUrl" value="'+key+'"><th>작성자</th><td>Fixture author</td>'+ (licensed?'<div class="codeView01"><img src="/images/board/kogl/new_img_opentype01.png"><span>Fixture 면세 공고</span><a href="https://www.kogl.or.kr/info/licenseType1.do">출처</a></div>':'');
test('real SQLite changed-only archive excludes receipt and repeated rights confirmation clocks',async()=>{
 const db=new SqliteD1();assert.deepEqual(await storeOfficialNews(db,[item(),item()]),{currentChanges:1,revisionChanges:0});
 assert.deepEqual(await storeOfficialNews(db,[item({receivedAt:'2026-10-12T01:00:00Z',clearance:{...rights,confirmedAt:'2026-10-12T01:00:00Z'}})]),{currentChanges:0,revisionChanges:0});
 assert.deepEqual(await storeOfficialNews(db,[item({modifiedAt:at,facts:[{text:'Changed source fact',verifiedBySource:true}]})]),{currentChanges:1,revisionChanges:1});
 assert.equal((await storedOfficialNews(db,'customs','123')).status,'review');db.raw.close();
});
test('rights removal and unknown classification remain archived but leave public reads',async()=>{
 const db=new SqliteD1();await storeOfficialNews(db,[item()]);assert.equal((await readOfficialNews(db,'2026-10-11')).length,1);
 await storeOfficialNews(db,[item({clearance:undefined})]);assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,1);
 await storeOfficialNews(db,[item({sourceId:'456',topic:'unclassified'})]);assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);db.raw.close();
});
test('DB capacity stops atomically without deleting existing rows; existing records still update at current capacity',async()=>{
 const db=new SqliteD1();for(let n=0;n<200;n+=20)await storeOfficialNews(db,Array.from({length:20},(_,i)=>item({sourceId:String(n+i)})));
 await assert.rejects(storeOfficialNews(db,[item({sourceId:'new'})]),/NEWS_STORAGE_LIMIT/);
 await storeOfficialNews(db,[item({sourceId:'0',clearance:undefined})]);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_current').get().n,200);
 for(let n=0;n<399;n++)await storeOfficialNews(db,[item({sourceId:'0',clearance:undefined,facts:[{text:'Meaningful fixture revision '+n,verifiedBySource:true}]})]);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,400);
 const last=await storedOfficialNews(db,'customs','0');await assert.rejects(storeOfficialNews(db,[item({sourceId:'0',title:'Capacity must preserve previous current row'})]),/NEWS_STORAGE_LIMIT/);
 assert.deepEqual(await storedOfficialNews(db,'customs','0'),last);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,400);db.raw.close();
});
test('public API is stored-only, honest for missing storage, read failure and invalid payload',async()=>{
 const missing=await (await airportNewsResponse(null,new Date(at))).json();assert.equal(missing.status,'MISSING');assert.deepEqual(missing.items,[]);
 const unprepared=new SqliteD1(':memory:',false);const result=await (await airportNewsResponse(unprepared,new Date(at))).json();assert.equal(result.status,'UNAVAILABLE');unprepared.raw.close();
 const db=new SqliteD1();await storeOfficialNews(db,[item()]);db.calls=[];const response=await airportNewsResponse(db,new Date(at));assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal((await response.json()).items.length,1);assert.ok(db.calls.every(sql=>/^SELECT/.test(sql)));db.raw.close();
});
test('closed collector and production entry use zero fetch/config/DB work',async()=>{
 const result=await collectCustomsNews({prepare(){throw Error('Unexpected DB');}}, {fetchImpl:()=>{throw Error('Unexpected provider');}});assert.equal(result.state,'DORMANT');assert.equal(result.requests,0);
 const run=spawnSync(process.execPath,['--import','tsx','scripts/collect-customs-news.ts'],{encoding:'utf8',env:{...process.env,RPK_CUSTOMS_NEWS_COLLECTION_ENABLED:'true',ENABLE_PRODUCTION_COLLECTOR:'true'}});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/DORMANT/);assert.match(run.stdout,/"writes":0/);
});
test('normal official public list links bind to article-specific rights; duplicate feeds do not duplicate writes',async()=>{
 const db=new SqliteD1();let licence=true,requests=0;
 const fetchImpl=async url=>{requests++;if(url.includes('selectBoardRss'))return new Response(xml);if(url.includes('selectNttList'))return new Response('<a class="nttInfoBtn" data-id="123" data-url="'+key+'">Fixture</a>');assert.match(url,new RegExp('nttSnUrl='+key));return new Response(html(licence));};
 const first=await collectCustomsNews(db,{activation:true,fetchImpl,now:()=>new Date(at)});assert.equal(first.currentChanges,1);assert.equal(first.requests,9);assert.equal((await readOfficialNews(db,'2026-10-11')).length,1);
 const second=await collectCustomsNews(db,{activation:true,fetchImpl,now:()=>new Date('2026-10-12T01:00:00Z')});assert.equal(second.currentChanges,0);assert.equal(second.revisionChanges,0);
 licence=false;await collectCustomsNews(db,{activation:true,fetchImpl});assert.equal((await readOfficialNews(db,'2026-10-11')).length,0);assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_current').get().n,1);assert.equal(requests,27);db.raw.close();
});
test('HTTP errors, redirects and oversized input never masquerade as a completed collection',async()=>{
 const db=new SqliteD1();await storeOfficialNews(db,[item()]);
 for(const response of [new Response('error',{status:429}),new Response('x'.repeat(1024*1024+1))])await assert.rejects(collectCustomsNews(db,{activation:true,fetchImpl:async(_,options)=>{assert.equal(options.redirect,'error');return response;}}));
 let calls=0;const ids=Array.from({length:30},(_,i)=>String(1000+i));
 const result=await collectCustomsNews(db,{activation:true,fetchImpl:async url=>{calls++;return new Response(url.includes('selectBoardRss')?'<rss>'+ids.map(id=>'<item><title>Fixture</title><link>https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn='+id+'</link></item>').join('')+'</rss>':url.includes('selectNttList')?ids.map(id=>'<a class="nttInfoBtn" data-id="'+id+'" data-url="'+key+'">Fixture</a>').join(''):'Unlicensed item');}});
 assert.equal(result.requests,28);assert.equal(calls,28);assert.equal(result.currentChanges,0);
 assert.equal((await readOfficialNews(db,'2026-10-11')).length,1);db.raw.close();
});
test('document review requires exact article, official attachment bytes, source quotes and role-bound dates',async()=>{
 const bytes=new TextEncoder().encode('Fixture document: actual attachment bytes are tested separately');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const url='https://www.customs.go.kr/common/nttFileDownload.do?fileKey='+key,record=item({attachments:[{url,name:'Fixture.pdf',review:'pending'}]});
 const review={articleId:'123',attachmentUrl:url,sha256:hash,reviewedAt:at,confirmedText:'Fixture: 시행일 2026-11-01. Verified source line.',facts:['Verified source line.'],effectiveDate:{date:'2026-11-01',evidence:'시행일 2026-11-01',verified:true}};
 const verified=await applyCustomsDocumentReview(record,review,bytes);assert.equal(verified.attachmentNeedsReview,false);assert.equal(verified.effectiveDate.date,'2026-11-01');assert.equal(verified.modifiedAt,undefined);
 for(const change of [{articleId:'wrong'},{sha256:'bad'},{facts:['Invented line']},{effectiveDate:{date:'2026-11-01',evidence:'발행일 2026-11-01',verified:true}}])await assert.rejects(applyCustomsDocumentReview(record,{...review,...change},bytes));
});
test('metadata preserves named author, excludes photos/external links and never invents modification time',()=>{
 const metadata=customsArticleMetadata('<th>작성자</th><td>홍길동</td><a href="/common/nttFileDownload.do?fileKey='+key+'" title="Fixture.pdf 다운로드"></a><a href="https://evil.example/file.pdf" title="bad.pdf 다운로드"></a><a href="/common/nttFileDownload.do?fileKey='+key+'" title="photo.jpg 다운로드"></a>');
 assert.equal(metadata.namedAuthor,'홍길동');assert.equal(metadata.modifiedAt,null);assert.equal(metadata.attachments.length,1);assert.equal(metadata.attachments[0].review,'pending');assert.equal(officialCustomsLinks('<a data-id="123" data-url="bad" class="nttInfoBtn">').size,0);
 assert.equal(customsArticleMetadata('<th>수정일</th><td>2026.02.30 09:00:00</td>').modifiedAt,null);
 assert.equal(airportCustomsScope('원유 수입선 다변화 관세행정 지원대책 확대'),'unclassified');assert.equal(airportCustomsScope('2026년 9월 수출입 현황 [잠정치]'),'unclassified');assert.equal(airportCustomsScope('출국장 면세점 특허 공고'),'customs');
});
