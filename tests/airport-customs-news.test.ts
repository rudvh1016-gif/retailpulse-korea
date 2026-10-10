import test from 'node:test';import assert from 'node:assert/strict';
import {classifyNews,mayPublishNews,retainNews,sortNews,verifiedDate,type OfficialNews} from '../lib/airport-customs-news';
// Synthetic test records only. No official article is republished or fetched.
const item=(overrides:Partial<OfficialNews>={}):OfficialNews=>({source:'customs',sourceId:'fixture',sourceName:'Fixture',title:'면세 안내 fixture',url:'https://www.customs.go.kr/fixture',publishedAt:'2026-10-01',receivedAt:'2026-10-10T00:00:00Z',status:'announced',topic:'customs',relevantToRetail:true,contentFingerprint:'fixture-1',facts:[],changes:[],audience:[],attachmentNeedsReview:false,...overrides});
test('feed presence and a known official hostname do not grant reuse or deep-link permission',()=>{
 assert.equal(mayPublishNews(item()),false);
 const clearance={commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:'https://www.customs.go.kr/fixture-license',confirmedAt:'2026-10-10T00:00:00Z',attribution:'Synthetic fixture attribution'} as const;
 assert.equal(mayPublishNews(item({clearance})),true);
 assert.equal(mayPublishNews(item({clearance,url:'https://customs.go.kr.example.com/fixture'})),false);
 assert.equal(mayPublishNews(item({clearance,url:'javascript:alert(1)'})),false);
 assert.equal(mayPublishNews(item({clearance,url:'https://user:password@www.customs.go.kr/fixture'})),false);
 assert.equal(mayPublishNews(item({clearance,url:'https://www.customs.go.kr:8080/fixture'})),false);
 assert.equal(mayPublishNews(item({clearance:{...clearance,attribution:''}})),false);
});
test('rights withdrawn later removes public eligibility while preserving both versions',()=>{
 const clearance={commercialReuse:true,requiredPresentation:true,deepLink:true,evidenceUrl:'https://www.customs.go.kr/fixture-license',confirmedAt:'2026-10-10T00:00:00Z',attribution:'Synthetic fixture attribution'} as const;
 const original=item({clearance}),first=retainNews([],[original]);
 const withdrawn=retainNews(first,[{...original,clearance:undefined,status:'withdrawn',receivedAt:'2026-10-11T00:00:00Z'}]);
 assert.equal(mayPublishNews(withdrawn[0].current),false);assert.equal(mayPublishNews(withdrawn[0].revisions[0]),true);
 assert.equal(withdrawn[0].revisions.length,1);
});
test('latest publication order uses actual instants and invalid calendar input never invents priority',()=>{
 const earlier=item({sourceId:'earlier',publishedAt:'2026-10-10T01:00:00+09:00'}),later=item({sourceId:'later',publishedAt:'2026-10-09T23:00:00Z'});
 assert.deepEqual(sortNews([earlier,later],'invalid').map(row=>row.sourceId),['later','earlier']);
 const missing=item({sourceId:'missing',publishedAt:null}),invalid=item({sourceId:'invalid',publishedAt:'unverified'});
 assert.equal(sortNews([missing,invalid,later],'2026-10-10')[0].sourceId,'later');
});
test('unclassified and restricted records remain; correction and rights withdrawal retain prior versions',()=>{
 assert.equal(classifyNews('law','Unrelated fixture'),'unclassified');
 assert.equal(classifyNews('customs','보세판매장 공고 fixture'),'customs');
 const initial=item({topic:'unclassified'}),archive=retainNews([], [initial]);
 assert.equal(retainNews(archive,[{...initial,receivedAt:'2026-10-11T00:00:00Z'}])[0].revisions.length,0);
 const revised=retainNews(archive,[{...initial,status:'corrected',contentFingerprint:'fixture-2'}]);
 assert.equal(revised.length,1);assert.equal(revised[0].revisions.length,1);
 assert.equal(retainNews(revised,[])[0].current.topic,'unclassified');
});
test('only evidenced valid retail dates get priority; missing dates are not guessed from a title',()=>{
 const earlier=item({sourceId:'priority',effectiveDate:{date:'2026-10-15',evidence:'Synthetic explicit date fixture',verified:true}}),latest=item({sourceId:'latest',publishedAt:'2026-10-10'});
 assert.deepEqual(sortNews([latest,earlier],'2026-10-10').map(row=>row.sourceId),['priority','latest']);
 assert.equal(verifiedDate({date:'2026-02-30',evidence:'fixture',verified:true}),null);
 assert.equal(verifiedDate(undefined),null);
 assert.equal(sortNews([latest,item({sourceId:'unverified-title',title:'2026-10-15 시행 fixture'})],'2026-10-10')[0].sourceId,'latest');
 const laterDeadline=item({sourceId:'later-deadline',deadline:{date:'2027-01-01',evidence:'Synthetic confirmed deadline fixture',verified:true}});
 assert.equal(sortNews([latest,laterDeadline],'2026-10-10')[0].sourceId,'later-deadline');
});
