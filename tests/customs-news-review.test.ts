import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayPublishNews,publicNewsProjection,type OfficialNews} from '../lib/airport-customs-news';
import {createCollectionReview,validCollectionReview,type StoredOfficialNews} from '../lib/customs-news-review';

const at='2026-10-11T01:00:00Z',later='2026-10-12T01:00:00Z';
const url='https://www.customs.go.kr/kcs/na/ntt/selectNttInfo.do?nttSn=123';
const documentUrl='https://www.customs.go.kr/common/nttFileDownload.do?fileKey=0123456789abcdef0123456789abcdef';
const hash='a'.repeat(64);
const clearance={commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:documentUrl,confirmedAt:at,attribution:'Synthetic approved attribution'} as const;
const item=(overrides:Partial<OfficialNews>={}):OfficialNews=>({source:'customs',sourceId:'123',sourceName:'Fixture source',title:'Synthetic approved article',url,publishedAt:'2026-10-01T00:00:00Z',receivedAt:at,status:'announced',topic:'customs',relevantToRetail:true,clearance,contentFingerprint:'approved-fingerprint',facts:[{text:'Approved condition and exception.',verifiedBySource:true}],changes:[{text:'Approved change.',verifiedBySource:true}],audience:[{text:'Approved audience.',verifiedBySource:true}],effectiveDate:{date:'2026-11-01',evidence:'Explicit fixture date',verified:true},attachmentNeedsReview:false,attachments:[{url:documentUrl,name:'Fixture.pdf',review:'verified',sha256:hash,reviewedAt:at}],attachmentListComplete:true,...overrides});
const incoming=(overrides:Partial<OfficialNews>={}):OfficialNews=>item({status:'review',facts:[],changes:[],audience:[],effectiveDate:undefined,clearance:undefined,relevantToRetail:false,contentFingerprint:'collected-fingerprint',attachmentNeedsReview:true,attachments:[{url:documentUrl,name:'Fixture.pdf',review:'pending'}],...overrides});

test('first observation never publishes or accepts collector-supplied private metadata',async()=>{
 const supplied={...item(),collectionReview:{hold:false,untrusted:'not a review'}};
 const {record,blockPublication}=await createCollectionReview(null,supplied);
 assert.equal(record.status,'review');assert.equal(blockPublication,true);assert.equal(mayPublishNews(record),false);
 assert.ok(validCollectionReview(record.collectionReview));assert.equal(record.collectionReview!.hold,false);
 assert.equal(JSON.stringify(record).includes('untrusted'),false);
});
test('collection preserves every approved public field and keeps only the latest compact candidate',async()=>{
 const approved=item(),first=await createCollectionReview(approved,incoming({title:'Collected title'}));
 assert.deepEqual(publicNewsProjection(first.record),approved);assert.equal(first.blockPublication,false);
 assert.equal(first.record.collectionReview!.candidate.title,'Collected title');
 assert.equal('facts' in first.record.collectionReview!.candidate,false);assert.equal('confirmedAt' in first.record.collectionReview!.candidate.rights,false);
 assert.equal('reviewedAt' in first.record.collectionReview!.candidate.attachments![0],false);
 const second=await createCollectionReview(first.record,incoming({title:'Latest collected title',receivedAt:later}));
 assert.equal(second.record.collectionReview!.candidate.title,'Latest collected title');assert.equal(JSON.stringify(second.record).includes('Collected title'),false);
 assert.deepEqual(publicNewsProjection(second.record),approved);
});
test('receipt, rights-check and review clocks or document order do not create new observations',async()=>{
 const secondDoc={url:documentUrl.replace('0123456789abcdef0123456789abcdef','fedcba9876543210fedcba9876543210'),name:'Second.pdf',review:'pending' as const};
 const candidate=incoming({clearance,attachments:[...item().attachments!,secondDoc]});
 const first=await createCollectionReview(item(),candidate);
 const repeated=await createCollectionReview(first.record,{...candidate,receivedAt:later,clearance:{...clearance,confirmedAt:later},attachments:candidate.attachments!.map(document=>({...document,reviewedAt:later})).reverse()});
 assert.equal(repeated.record.collectionReview,first.record.collectionReview);assert.deepEqual(repeated.record,first.record);
});
test('the two approved PDF/reprint articles keep their manual facts, rights, dates and document reviews when HTML has no mark',async()=>{
 const approved=JSON.parse(readFileSync(new URL('../data/approved-news/customs-2026-10-10.json',import.meta.url),'utf8')) as OfficialNews[];
 assert.equal(approved.length,2);
 for(const article of approved){
  const observation={...article,status:'review' as const,receivedAt:later,clearance:undefined,facts:[],changes:[],audience:[],effectiveDate:undefined,deadline:undefined,relevantToRetail:false,contentFingerprint:'fresh-html-observation',attachmentNeedsReview:true,attachments:article.attachments!.map(({url,name})=>({url,name,review:'pending' as const}))};
  const {record,blockPublication}=await createCollectionReview(article,observation);
  assert.deepEqual(publicNewsProjection(record),article);assert.equal(blockPublication,false);assert.equal(mayPublishNews(record),true);
  assert.ok(new TextEncoder().encode(JSON.stringify(record)).length<=8192);
 }
});
test('a missing HTML licence only holds an approval whose own rights evidence was the article HTML',async()=>{
 const approved=item({clearance:{...clearance,evidenceUrl:url}});
 const held=await createCollectionReview(approved,incoming());
 assert.equal(held.blockPublication,true);assert.deepEqual(held.record.collectionReview!.reasons,['RIGHTS_UNCONFIRMED']);
 assert.deepEqual(publicNewsProjection(held.record),approved);
 const observedAgain=await createCollectionReview(held.record,incoming({clearance:{...clearance,evidenceUrl:url}}));
 assert.equal(observedAgain.blockPublication,true);assert.deepEqual(observedAgain.record.collectionReview!.reasons,['RIGHTS_UNCONFIRMED']);
});
test('complete document metadata changes or a new reviewed byte hash hold old verified facts without overwriting them',async()=>{
 const approved=item();
 for(const observation of [incoming({attachments:[]}),incoming({attachments:[{url:documentUrl,name:'Renamed.pdf',review:'pending'}]}),incoming({attachments:[{url:documentUrl+'&changed=1',name:'Fixture.pdf',review:'pending'}]}),incoming({attachmentListComplete:false,attachments:[{url:documentUrl,name:'Fixture.pdf',review:'verified',sha256:'b'.repeat(64),reviewedAt:later}]})]){
  const held=await createCollectionReview(approved,observation);
  assert.equal(held.blockPublication,true);assert.equal(mayPublishNews(held.record),false);assert.deepEqual(held.record.collectionReview!.reasons,['VERIFIED_DOCUMENT_CHANGED']);
  assert.deepEqual(publicNewsProjection(held.record),approved);
  const unchangedLater=await createCollectionReview(held.record,incoming());assert.equal(unchangedLater.blockPublication,true);
 }
});
test('incomplete lists, unchanged metadata or unrelated pending documents do not claim a new byte review or revoke a reviewed summary',async()=>{
 const approved=item();
 for(const observation of [incoming({attachmentListComplete:false,attachments:[]}),incoming({attachments:undefined,attachmentListComplete:undefined}),incoming(),incoming({attachments:[...incoming().attachments!,{url:documentUrl+'&second=1',name:'Other.pdf',review:'pending'}]}),incoming({attachments:approved.attachments!.map(document=>({...document,reviewedAt:later}))})]){
  const result=await createCollectionReview(approved,observation);assert.equal(result.blockPublication,false);
  assert.deepEqual(result.record.attachments,approved.attachments);assert.equal(result.record.attachments![0].reviewedAt,at);
 }
});
test('verified withdrawal is a sticky public hold even after a later licensed observation',async()=>{
 const approved=item(),withdrawn=await createCollectionReview(approved,incoming({status:'withdrawn'}));
 assert.equal(withdrawn.blockPublication,true);assert.deepEqual(withdrawn.record.collectionReview!.reasons,['RIGHTS_WITHDRAWN']);
 assert.deepEqual(publicNewsProjection(withdrawn.record),approved);
 const retry=await createCollectionReview(withdrawn.record,incoming({clearance,receivedAt:later}));
 assert.equal(retry.blockPublication,true);assert.equal(mayPublishNews(retry.record),false);
 const oldWithdrawal=await createCollectionReview(item({status:'withdrawn'}),incoming({clearance}));assert.equal(oldWithdrawal.blockPublication,true);assert.deepEqual(oldWithdrawal.record.collectionReview!.reasons,['PREVIOUSLY_WITHDRAWN']);
});
test('invalid identity, timestamps, metadata and oversized candidates fail closed',async()=>{
 const review=(await createCollectionReview(item(),incoming())).record.collectionReview!;
 assert.ok(validCollectionReview(review));
 for(const value of [null,{}, {...review,version:2},{...review,hold:'false'},{...review,hold:true},{...review,reasons:['UNKNOWN']},{...review,reasons:['RIGHTS_WITHDRAWN','RIGHTS_WITHDRAWN'],hold:true},{...review,observedAt:'bad'},{...review,fingerprint:'bad'},{...review,privateHtml:'full document'},{...review,candidate:{...review.candidate,rawHtml:'full document'}},{...review,candidate:{...review.candidate,rights:{cleared:true}}},{...review,candidate:{...review.candidate,attachments:Array(7).fill(review.candidate.attachments![0])}}])assert.equal(validCollectionReview(value),false);
 await assert.rejects(createCollectionReview(item(),incoming({sourceId:'other'})),/NEWS_REVIEW_IDENTITY_MISMATCH/);
 await assert.rejects(createCollectionReview(item(),incoming({receivedAt:'bad'})),/NEWS_REVIEW_INVALID_TIMESTAMP/);
 await assert.rejects(createCollectionReview(item(),incoming({title:'x'.repeat(501)})),/NEWS_REVIEW_INVALID_CANDIDATE/);
 await assert.rejects(createCollectionReview(item(),incoming({url:'https://customs.go.kr.example.com/article'})),/NEWS_REVIEW_INVALID_CANDIDATE/);
 assert.ok(validCollectionReview((await createCollectionReview(null,incoming({sourceId:'x'.repeat(120)}))).record.collectionReview));
 await assert.rejects(createCollectionReview(null,incoming({sourceId:'x'.repeat(121)})),/NEWS_REVIEW_INVALID_CANDIDATE/);
 await assert.rejects(createCollectionReview({...item(),collectionReview:{...review,version:2}} as unknown as StoredOfficialNews,incoming()),/NEWS_REVIEW_INVALID_PREVIOUS/);
});
