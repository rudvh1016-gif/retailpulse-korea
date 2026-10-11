import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {observeCustomsDocumentVersion} from '../lib/customs-news-document-review.ts';
import {collectCustomsNews} from '../lib/customs-news-collector.ts';
import {storeOfficialNews,readOfficialNews,storedOfficialNews} from '../lib/airport-customs-news-store.ts';
import {publicNewsProjection} from '../lib/airport-customs-news.ts';

const at='2026-10-11T01:00:00Z',key='0123456789abcdef0123456789abcdef';
const url='https://www.customs.go.kr/common/nttFileDownload.do?fileKey='+key;
const originalBytes=new TextEncoder().encode('Previously reviewed fixture document');
const bytes=new TextEncoder().encode('Changed fixture document, without a new rights approval');
const hash=value=>createHash('sha256').update(value).digest('hex');
const record={source:'customs',sourceId:'123',sourceName:'Fixture',title:'Fixture 면세 공고',url:'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=123&nttSnUrl='+key,publishedAt:'2026-10-01T00:00:00Z',receivedAt:at,status:'announced',topic:'customs',relevantToRetail:true,clearance:{commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:url,confirmedAt:at,attribution:'Synthetic PDF clearance fixture'},contentFingerprint:'fixture',facts:[{text:'Previously reviewed fact',verifiedBySource:true}],changes:[],audience:[],attachmentNeedsReview:false,attachmentListComplete:true,attachments:[{url,name:'Fixture.pdf',review:'verified',sha256:hash(originalBytes),reviewedAt:at}]};
const observation={...record,status:'review',clearance:undefined,facts:[],attachments:[{url,name:'Fixture.pdf',review:'pending'}],attachmentNeedsReview:true};
const review={articleId:'123',attachmentUrl:url,sha256:hash(bytes),reviewedAt:at,confirmedText:'Changed fixture document',facts:[]};
const feed='<rss><item><title>Fixture 면세 공고</title><link>https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=123</link><pubDate>2026-10-01 09:00:00</pubDate></item></rss>';
const html='<title>관세청-Fixture 면세 공고</title><input name="nttSn" value="123"><input name="nttSnUrl" value="'+key+'"><tr><th>첨부파일</th><td><ul class="list_file"><li><a title="Fixture.pdf 다운로드" href="'+url+'">Fixture.pdf</a></li></ul></td></tr>';
const fetchImpl=async input=>new Response(String(input).includes('selectBoardRss')?feed:String(input).includes('selectNttList')?'<a class="nttInfoBtn" data-id="123" data-url="'+key+'">Fixture</a>':html);

test('a bound byte observation remains pending and grants neither facts, rights nor publication status',async()=>{
 const observed=await observeCustomsDocumentVersion(observation,review,bytes);
 assert.equal(observed.attachments[0].sha256,hash(bytes));assert.equal(observed.attachments[0].review,'pending');
 assert.equal(observed.status,'review');assert.equal(observed.clearance,undefined);assert.deepEqual(observed.facts,[]);
 for(const patch of [{articleId:'wrong'},{attachmentUrl:'https://example.com/file.pdf'},{sha256:'0'.repeat(64)}])await assert.rejects(observeCustomsDocumentVersion(observation,{...review,...patch},bytes));
 await assert.rejects(observeCustomsDocumentVersion(observation,review,new Uint8Array()));
});

test('a proven changed PDF is held before absent HTML rights rejects its later content review',async()=>{
 const db=new SqliteD1();await storeOfficialNews(db,[record]);
 await assert.rejects(collectCustomsNews(db,{activation:true,fetchImpl,now:()=>new Date(at),documentReviews:[{review,bytes}]}),/NEWS_DOCUMENT_REVIEW_UNBOUND/);
 const stored=await storedOfficialNews(db,'customs','123');
 assert.deepEqual(publicNewsProjection(stored),record);
 assert.equal(stored.collectionReview.hold,true);assert.equal(stored.collectionReview.candidate.attachments[0].review,'pending');
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,0);db.raw.close();
});

test('a later invalid document binding cannot undo an earlier verified byte change',async()=>{
 const db=new SqliteD1();await storeOfficialNews(db,[record]);
 await assert.rejects(collectCustomsNews(db,{activation:true,fetchImpl,now:()=>new Date(at),documentReviews:[{review,bytes},{review:{...review,sha256:'0'.repeat(64)},bytes}]}),/NEWS_DOCUMENT_HASH_MISMATCH/);
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
 assert.deepEqual(publicNewsProjection(await storedOfficialNews(db,'customs','123')),record);db.raw.close();
});

test('an invalid or unchanged byte observation does not revoke independent PDF clearance',async()=>{
 for(const entry of [{review:{...review,sha256:'0'.repeat(64)},bytes},{review:{...review,sha256:hash(originalBytes)},bytes:originalBytes}]) {
  const db=new SqliteD1();await storeOfficialNews(db,[record]);
  await assert.rejects(collectCustomsNews(db,{activation:true,fetchImpl,now:()=>new Date(at),documentReviews:[entry]}));
  assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[record]);db.raw.close();
 }
});

test('a proven change remains held when another valid observation for the same URL has the approved hash',async()=>{
 const changed={review,bytes},original={review:{...review,sha256:hash(originalBytes)},bytes:originalBytes};
 for(const documents of [[changed,original],[original,changed]]){
  const db=new SqliteD1();await storeOfficialNews(db,[record]);
  await assert.rejects(collectCustomsNews(db,{activation:true,fetchImpl,now:()=>new Date(at),documentReviews:documents}),/NEWS_DOCUMENT_REVIEW_UNBOUND/);
  assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
  const stored=await storedOfficialNews(db,'customs','123');
  assert.equal(stored.collectionReview.hold,true);
  assert.ok(stored.collectionReview.reasons.includes('VERIFIED_DOCUMENT_CHANGED'));
  assert.deepEqual(publicNewsProjection(stored),record);db.raw.close();
 }
});
