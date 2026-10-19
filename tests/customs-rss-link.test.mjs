import test from 'node:test';
import assert from 'node:assert/strict';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {collectCustomsNews,CUSTOMS_RSS_LINK_PUBLICATION_REVIEWED} from '../lib/customs-news-collector.ts';
import {readOfficialNews,storeOfficialNews,storeCustomsRssLink,blockStoredOfficialNews,storedOfficialNews} from '../lib/airport-customs-news-store.ts';
import {hasNewsClearance,mayPublishNews,validRssLinkNews} from '../lib/airport-customs-news.ts';
const key='0123456789abcdef0123456789abcdef',at='2026-10-19T08:00:00Z';
const url=id=>'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn='+id+'&nttSnUrl='+key;
const link=(id='100')=>({source:'customs',sourceId:id,sourceName:'관세청',title:'Fixture 면세 공고',url:url(id),publishedAt:at,receivedAt:at,status:'announced',topic:'customs',relevantToRetail:true,presentation:'official-rss-link',rssLinkEvidence:{directoryUrl:'https://www.customs.go.kr/kcs/selectBoardRssList.do?mi=7424',feedUrl:'https://www.customs.go.kr/kcs/selectBoardRss.do?mi=3762&bbsId=1365',verifiedAt:at},contentFingerprint:'fixture',facts:[],changes:[],audience:[],attachmentNeedsReview:false});
const database=t=>{const db=new SqliteD1();t.after(()=>db.raw.close());return db;};
test('metadata is separate from article reuse clearance and cannot carry content',()=>{
 const item=link();assert.equal(hasNewsClearance(item),false);assert.equal(validRssLinkNews(item),true);assert.equal(mayPublishNews(item),true);
 for(const change of [{facts:[{text:'body',verifiedBySource:true}]},{attachments:[]},{effectiveDate:{date:'2026-10-19',evidence:'x',verified:true}},{clearance:{}},{presentation:'other'},{source:'airport'},{publishedAt:null},{url:url('999')},{rssLinkEvidence:{...item.rssLinkEvidence,feedUrl:'https://example.invalid/rss'}}])assert.equal(validRssLinkNews({...item,...change}),false);
 assert.equal(CUSTOMS_RSS_LINK_PUBLICATION_REVIEWED,true);
});
test('repeat observation writes zero; changed metadata revisions once; held links never reopen',async t=>{
 const db=database(t),item=link();assert.deepEqual(await storeCustomsRssLink(db,item),{currentChanges:1,revisionChanges:0});
 const before=db.raw.prepare('SELECT total_changes() n').get().n;
 assert.deepEqual(await storeCustomsRssLink(db,{...item,receivedAt:'2026-10-20T00:00:00Z',rssLinkEvidence:{...item.rssLinkEvidence,verifiedAt:'2026-10-20T00:00:00Z'}}),{currentChanges:0,revisionChanges:0});
 assert.equal(db.raw.prepare('SELECT total_changes() n').get().n,before);
 assert.deepEqual(await storeCustomsRssLink(db,{...item,title:'Fixture 면세 변경'}),{currentChanges:1,revisionChanges:1});
 assert.equal((await readOfficialNews(db,'2026-10-19'))[0].title,'Fixture 면세 변경');
 await blockStoredOfficialNews(db,'customs','100');assert.deepEqual(await storeCustomsRssLink(db,item),{currentChanges:0,revisionChanges:0});assert.deepEqual(await readOfficialNews(db,'2026-10-19'),[]);
});
test('existing approved summaries and private candidates are never overwritten or promoted',async t=>{
 const db=database(t),item=link(),{presentation,rssLinkEvidence,...base}=item;void presentation;void rssLinkEvidence;
 const original={...base,facts:[{text:'Fixture approved summary',verifiedBySource:true}],clearance:{commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:url('100'),confirmedAt:at,attribution:'Fixture explicit clearance'}};
 await storeOfficialNews(db,[original]);assert.equal(await storeCustomsRssLink(db,item),null);assert.deepEqual(await storedOfficialNews(db,'customs','100'),original);
 const privateItem={...original,sourceId:'101',url:url('101'),status:'review'};await storeOfficialNews(db,[privateItem]);assert.equal(await storeCustomsRssLink(db,link('101')),null);assert.equal((await storedOfficialNews(db,'customs','101')).status,'review');
});
test('real parser path publishes only metadata; later HTTP failure preserves last-good',async t=>{
 const db=database(t),calls=[];
 const fetchImpl=async input=>{const u=new URL(input);calls.push(u.href);
  if(u.pathname.endsWith('selectBoardRss.do'))return new Response('<rss>'+(u.searchParams.get('bbsId')==='1365'?['100','101'].map(id=>'<item><title>Fixture 면세 공고</title><link>'+url(id).replace(/&/g,'&amp;')+'</link><pubDate>2026-10-19 17:00:00.0</pubDate></item>').join(''):'')+'</rss>');
  if(u.pathname.endsWith('selectNttList.do'))return new Response(['100','101'].map(id=>'<a class="nttInfoBtn" data-id="'+id+'" data-url="'+key+'">link</a>').join(''));
  if(u.searchParams.get('nttSn')==='101')return new Response('error',{status:503});
  return new Response('<title>관세청-Fixture 면세 공고</title><input name="nttSn" value="100"><input name="nttSnUrl" value="'+key+'"><p>Do not republish body</p>');
 };
 await assert.rejects(collectCustomsNews(db,{activation:true,metadataLinks:true,fetchImpl,now:()=>new Date(at)}),/NEWS_HTTP_503/);
 assert.equal(calls.length,10);const items=await readOfficialNews(db,'2026-10-19');assert.equal(items.length,1);assert.equal(items[0].presentation,'official-rss-link');assert.deepEqual(items[0].facts,[]);assert.equal(items[0].clearance,undefined);assert.equal(items[0].attachments,undefined);
});
