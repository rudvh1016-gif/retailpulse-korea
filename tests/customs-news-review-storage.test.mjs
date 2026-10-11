import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SqliteD1} from './helpers/operational-sqlite.mjs';
import {sha256} from '../lib/hash.ts';
import {publicNewsProjection} from '../lib/airport-customs-news.ts';
import {storeOfficialNews,storeCollectedNews,blockStoredOfficialNews,readOfficialNews,storedOfficialNews,officialNewsSemanticHash} from '../lib/airport-customs-news-store.ts';

const at='2026-10-11T01:00:00Z';
const approved=JSON.parse(readFileSync('data/approved-news/customs-2026-10-10.json','utf8'));
const key='0123456789abcdef0123456789abcdef';
const attachmentUrl='https://www.customs.go.kr/common/nttFileDownload.do?fileKey='+key;
const item=(overrides={})=>({source:'customs',sourceId:'123',sourceName:'Fixture',title:'Fixture 면세 안내',url:'https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=123',publishedAt:'2026-10-01T00:00:00Z',receivedAt:at,status:'announced',topic:'customs',relevantToRetail:true,clearance:{commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:attachmentUrl,confirmedAt:at,attribution:'Synthetic fixture'},contentFingerprint:'fixture',facts:[{text:'Manually reviewed fixture fact',verifiedBySource:true}],changes:[],audience:[],attachmentNeedsReview:false,attachmentListComplete:true,attachments:[{url:attachmentUrl,name:'Fixture.pdf',review:'verified',sha256:'a'.repeat(64),reviewedAt:at}],...overrides});
const candidate=(record,overrides={})=>({...record,status:'review',facts:[],changes:[],audience:[],effectiveDate:undefined,deadline:undefined,clearance:undefined,topic:'unclassified',attachments:record.attachments?.map(({url,name})=>({url,name,review:'pending'})),attachmentNeedsReview:true,...overrides});
const row=db=>db.raw.prepare('SELECT * FROM official_news_current WHERE source_id=?').get('123');
const changes=db=>Number(db.raw.prepare('SELECT total_changes() n').get().n);
function fillRevisions(db) {
 const insert=db.raw.prepare('INSERT INTO official_news_revision(source,source_id,semantic_hash,payload,received_at) VALUES (?,?,?,?,?)');
 for(let index=0;index<400;index++)insert.run('customs','fixture-history',String(index),'{}',at);
}

test('approved PDF and republication records retain every reviewed field and hash while candidates stay private',async()=>{
 const db=new SqliteD1();
 await storeOfficialNews(db,approved);
 for(const record of approved) {
  const legacyHash=await sha256({...record,receivedAt:null,clearance:{...record.clearance,confirmedAt:null},attachments:record.attachments.map(value=>({...value,reviewedAt:null}))});
  assert.equal(await officialNewsSemanticHash(record),legacyHash);
  const result=await storeCollectedNews(db,candidate(record,{receivedAt:at}));
  assert.equal(result.currentChanges,0);assert.equal(result.revisionChanges,0);assert.equal(result.blockedChanges,0);
  const stored=await storedOfficialNews(db,'customs',record.sourceId);
  assert.deepEqual(publicNewsProjection(stored),record);
  assert.equal(await officialNewsSemanticHash(stored),legacyHash);
  assert.ok(stored.collectionReview);
 }
 const publicItems=await readOfficialNews(db,'2026-10-11');
 assert.deepEqual(new Set(publicItems.map(value=>value.sourceId)),new Set(approved.map(value=>value.sourceId)));
 assert.ok(publicItems.every(value=>!Object.hasOwn(value,'collectionReview')));
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,0);
 const before=changes(db);
 for(const record of approved)assert.equal((await storeCollectedNews(db,candidate(record,{receivedAt:'2026-10-12T01:00:00Z'}))).reviewChanges,0);
 assert.equal(changes(db),before);db.raw.close();
});

test('collection never publishes new licensed articles or clears an existing publication block',async()=>{
 const db=new SqliteD1();const record=item();
 await storeCollectedNews(db,record);
 assert.equal(row(db).may_publish,0);
 assert.equal((await storedOfficialNews(db,'customs','123')).status,'review');
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
 await storeCollectedNews(db,{...record,title:'Changed fixture',receivedAt:'2026-10-12T01:00:00Z'});
 assert.equal(row(db).may_publish,0);db.raw.close();
});

test('public reads reject review/withdrawn and invalid private state even when a stale flag is one',async()=>{
 const db=new SqliteD1();
 for(const status of ['review','withdrawn']) {
  await storeOfficialNews(db,[item({status})]);
  db.raw.prepare('UPDATE official_news_current SET may_publish=1').run();
  assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);
 }
 db.raw.prepare('UPDATE official_news_current SET payload=?').run(JSON.stringify({...item(),collectionReview:{hold:'invalid'}}));
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);db.raw.close();
});

test('verified document replacement blocks publication at full revision capacity without losing approved evidence',async()=>{
 const db=new SqliteD1();const record=item();await storeOfficialNews(db,[record]);fillRevisions(db);
 const before=row(db);
 const result=await storeCollectedNews(db,candidate(record,{attachments:[{url:attachmentUrl,name:'Fixture.pdf',review:'verified',sha256:'b'.repeat(64),reviewedAt:at}]}));
 assert.equal(result.blockedChanges,1);assert.equal(result.revisionChanges,0);
 assert.equal(row(db).may_publish,0);assert.equal(row(db).semantic_hash,before.semantic_hash);
 assert.deepEqual(publicNewsProjection(await storedOfficialNews(db,'customs','123')),record);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,400);
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);db.raw.close();
});

test('withdrawal blocks an exact 8KiB record at full history capacity and remains idempotent',async()=>{
 const db=new SqliteD1();const record=item({facts:[]});
 while(Buffer.byteLength(JSON.stringify(record))<8192) {
  const fact={text:'',verifiedBySource:true};record.facts.push(fact);
  const remaining=8192-Buffer.byteLength(JSON.stringify(record));assert.ok(remaining>=0);
  fact.text='x'.repeat(Math.min(remaining,1200));
 }
 assert.ok(record.facts.length<=12);assert.equal(Buffer.byteLength(JSON.stringify(record)),8192);
 await storeOfficialNews(db,[record]);fillRevisions(db);const before=row(db);
 assert.equal(await blockStoredOfficialNews(db,'customs','123'),1);
 const after=changes(db);assert.equal(await blockStoredOfficialNews(db,'customs','123'),0);assert.equal(changes(db),after);
 await assert.rejects(storeCollectedNews(db,candidate(record,{status:'withdrawn'})),/NEWS_REVIEW_PAYLOAD_LIMIT/);
 assert.equal(row(db).payload,before.payload);assert.equal(row(db).semantic_hash,before.semantic_hash);assert.equal(row(db).may_publish,0);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM official_news_revision').get().n,400);
 assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);db.raw.close();
});

test('partial attachment lists do not invent deletion but a directly observed renamed document is held',async()=>{
 const db=new SqliteD1();const record=item();await storeOfficialNews(db,[record]);
 await storeCollectedNews(db,candidate(record,{attachments:[],attachmentListComplete:false}));
 assert.equal(row(db).may_publish,1);
 await storeCollectedNews(db,candidate(record,{attachments:[{url:attachmentUrl,name:'Replaced fixture.pdf',review:'pending'}],attachmentListComplete:false}));
 assert.equal(row(db).may_publish,0);
 assert.deepEqual(publicNewsProjection(await storedOfficialNews(db,'customs','123')),record);db.raw.close();
});

test('a later manually approved correction archives only the previous approved fields',async()=>{
 const db=new SqliteD1();const record=item();await storeOfficialNews(db,[record]);
 await storeCollectedNews(db,candidate(record,{title:'Private unapproved candidate'}));
 const corrected={...record,status:'corrected',facts:[{text:'Explicitly reviewed correction fixture',verifiedBySource:true}]};
 await storeOfficialNews(db,[corrected]);
 const archived=JSON.parse(db.raw.prepare('SELECT payload FROM official_news_revision').get().payload);
 assert.deepEqual(archived,record);assert.equal(Object.hasOwn(archived,'collectionReview'),false);
 assert.deepEqual(await storedOfficialNews(db,'customs','123'),corrected);db.raw.close();
});

test('a competing candidate cannot be overwritten even though the approved semantic hash is unchanged',async()=>{
 const db=new SqliteD1();const record=item();await storeOfficialNews(db,[record]);
 await storeCollectedNews(db,candidate(record));let raced=false;
 const competing=candidate(record,{title:'Newer candidate from another writer'});
 const racing={prepare(sql){const prepared=db.prepare(sql);if(!sql.startsWith('SELECT payload,semantic_hash,may_publish'))return prepared;
  return {bind(...values){prepared.bind(...values);return this;},async first(){const selected=await prepared.first();if(!raced){raced=true;await storeCollectedNews(db,competing);}return selected;}};},batch:statements=>db.batch(statements)};
 await assert.rejects(storeCollectedNews(racing,candidate(record,{title:'Stale candidate'})),/NEWS_REVIEW_CONFLICT/);
 assert.equal((await storedOfficialNews(db,'customs','123')).collectionReview.candidate.title,competing.title);db.raw.close();
});

test('a concurrent safety block prevents a stale collector from reporting its candidate write as successful',async()=>{
 const db=new SqliteD1();const record=item();await storeOfficialNews(db,[record]);let raced=false;
 const racing={prepare(sql){const prepared=db.prepare(sql);if(!sql.startsWith('SELECT payload,semantic_hash,may_publish'))return prepared;
  return {bind(...values){prepared.bind(...values);return this;},async first(){const selected=await prepared.first();if(!raced){raced=true;await blockStoredOfficialNews(db,'customs','123');}return selected;}};},batch:statements=>db.batch(statements)};
 await assert.rejects(storeCollectedNews(racing,candidate(record)),/NEWS_REVIEW_CONFLICT/);
 assert.equal(row(db).may_publish,0);assert.deepEqual(await readOfficialNews(db,'2026-10-11'),[]);db.raw.close();
});

test('missing or unmeasured mutation results fail visibly instead of pretending zero writes',async()=>{
 const db=new SqliteD1();
 for(const results of [[],[{success:true,meta:{}}],[{success:true,meta:{changes:NaN}}],[{success:true,meta:{changes:-1}}]]) {
  const unmeasured={prepare:sql=>db.prepare(sql),batch:async()=>results};
  await assert.rejects(blockStoredOfficialNews(unmeasured,'customs','123'),/NEWS_WRITE_UNMEASURED/);
  await assert.rejects(storeOfficialNews(unmeasured,[item()]),/NEWS_WRITE_UNMEASURED/);
 }
 db.raw.close();
});
