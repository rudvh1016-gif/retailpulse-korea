import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {referenceChangeNotices} from '../lib/reference-change-notices';
import {allowanceStatusProjection} from '../lib/customs-allowance-runtime';
const at='2026-10-20T00:00:00.000Z',hash='a'.repeat(64),baseline='b'.repeat(64);
const values={liquorBottles:3,liquorBottleMl:760,cigarettes:200,perfumeOunces:2};
const calendar={changes:[{country:'US',id:hash,changedAt:at}],sources:[{country:'US',status:'VERIFIED',checkedAt:at,lastVerifiedAt:at}]};
const allowance={countries:[{id:'JP',state:'NUMERIC_VERIFIED'}],japan:{values:{...values,perfumeOunces:3},previous:values,changedAt:at},reviewNotices:[]};
test('only actual stored changes produce published notices; missing, first-import and unchanged responses stay quiet',()=>{
 for(const input of [null,{}, {sources:[],changes:[]}, {changes:[{country:'CN',id:hash,changedAt:at}]}])assert.deepEqual(referenceChangeNotices(input,null),[]);
 assert.deepEqual(referenceChangeNotices(null,{japan:{values,previous:values,changedAt:at}}),[]);
 assert.deepEqual(referenceChangeNotices(null,{japan:{values,changedAt:null}}),[]);
 assert.equal(referenceChangeNotices(calendar,allowance).length,2);
 const us=referenceChangeNotices(calendar,null)[0];assert.match(us.body,/연방공무원/);assert.match(us.body,/모든 사업장·학교의 휴일은 아닙니다/);
});
test('all country source reviews remain internal, including repeated hashes and check dates',()=>{
 for(const country of ['SG','TW','JP','US','CN','KR','VN','TH','PH','AU','HK','MY']){
  const review={sourceId:`${country}-01`,country,sourceHash:hash,baselineHash:baseline,checkedAt:at};
  assert.deepEqual(referenceChangeNotices(null,{reviewNotices:[review,review]}),[],country);
  assert.deepEqual(referenceChangeNotices(null,{reviewNotices:[{...review,sourceHash:'c'.repeat(64),checkedAt:'2026-10-21T00:00:00Z'}]}),[],country);
 }
 assert.equal(referenceChangeNotices({...calendar,sources:[{...calendar.sources[0],checkedAt:'2026-10-21T00:00:00Z'}]},null)[0].id,referenceChangeNotices(calendar,null)[0].id);
});
test('review pending suppresses older confirmed notices, never replaces them with an announcement',()=>{
 const source={country:'US',status:'REVIEW_REQUIRED',reason:'CALENDAR_CANCELLATION_REVIEW',checkedAt:at,lastVerifiedAt:'2026-10-19T00:00:00Z'};
 const result=referenceChangeNotices({...calendar,sources:[source]},allowance);
 assert.equal(result.filter(item=>item.topic==='calendar').length,0);assert.equal(result.length,1);assert.equal(result[0].reviewRequired,false);
 assert.deepEqual(referenceChangeNotices({...calendar,sources:[calendar.sources[0],source]},null),[]);
 assert.deepEqual(referenceChangeNotices({...calendar,sources:[{...source,status:'ERROR'}]},null),[]);
 assert.deepEqual(referenceChangeNotices(null,{countries:[{id:'CN',state:'CHECK_UNAVAILABLE'}]}),[]);
 const pending={...allowance,reviewNotices:[{sourceId:'JP-01',country:'JP',sourceHash:hash,baselineHash:baseline,checkedAt:at}]};
 assert.deepEqual(referenceChangeNotices(null,pending),[]);
 assert.deepEqual(referenceChangeNotices(calendar,pending),referenceChangeNotices(calendar,null));
});
test('customs review projection uses existing hashes and suppresses stale/future/failed checks',()=>{
 const row={source_id:'TW-01',jurisdiction:'TW',source_url:'https://example.test/',state:'SOURCE_CHANGED_REVIEW_REQUIRED',checked_at:at,source_sha256:hash,reason:null,last_good_hash:baseline,last_good_verified_at:'2026-10-19',next_check_at:'2026-10-21T00:00:00Z'};
 const value=allowanceStatusProjection([row],new Date(at));assert.equal(value.reviewNotices.length,1);assert.equal(value.reviewNotices[0].baselineHash,baseline);
 assert.equal(allowanceStatusProjection([row],new Date('2026-10-23')).reviewNotices.length,0);
 assert.equal(allowanceStatusProjection([row],new Date('2026-10-19')).reviewNotices.length,0);
 assert.equal(allowanceStatusProjection([{...row,state:'COLLECTION_BLOCKED'}],new Date(at)).reviewNotices.length,0);
});
test('malformed or untrusted fields cannot create notice copy or links; bounded and deduplicated output',()=>{
 assert.deepEqual(referenceChangeNotices({changes:[{country:'US',id:'<script>',changedAt:at}],sources:calendar.sources},null),[]);
 assert.deepEqual(referenceChangeNotices(null,{reviewNotices:[{sourceId:'<img>',country:'JP',sourceHash:hash,baselineHash:baseline,checkedAt:at}]}),[]);
 assert.equal(referenceChangeNotices({...calendar,changes:[...calendar.changes,...calendar.changes]},null).length,1);
});
test('general notice markup retains confirmed changes and renders no pending announcement',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {ReferenceChangeNoticeItems}=await import('../app/reference-change-notices');
 const html=renderToStaticMarkup(React.createElement(ReferenceChangeNoticeItems,{notices:referenceChangeNotices(calendar,allowance),calendarHref:'/ko/airport-prepare',allowanceHref:'/ko/airport-prepare#arrival-allowances'}));
 assert.match(html,/\[공지\]/);assert.match(html,/연방공무원/);assert.match(html,/시행일은 원문/);assert.match(html,/aria-live="polite"/);assert.match(html,/href="\/ko\/airport-prepare#arrival-allowances"/);
 const pendingAllowance={reviewNotices:[{sourceId:'SG-01',country:'SG',sourceHash:hash,baselineHash:baseline,checkedAt:at}]};
 const pendingCalendar={sources:[{country:'US',status:'REVIEW_REQUIRED',reason:'CALENDAR_CANCELLATION_REVIEW',checkedAt:at}]};
 const quiet=renderToStaticMarkup(React.createElement(ReferenceChangeNoticeItems,{notices:referenceChangeNotices(pendingCalendar,pendingAllowance),calendarHref:'/ko/airport-prepare',allowanceHref:'/ko/airport-prepare#arrival-allowances'}));
 assert.equal(quiet,'');
 const mixed=renderToStaticMarkup(React.createElement(ReferenceChangeNoticeItems,{notices:referenceChangeNotices(calendar,pendingAllowance),calendarHref:'/ko/airport-prepare',allowanceHref:'/ko/airport-prepare#arrival-allowances'}));
 assert.match(mixed,/미국 연방공무원/);assert.doesNotMatch(mixed,/싱가포르|검토 중|최근 확인/);
 const component=readFileSync('app/reference-change-notices.tsx','utf8');assert.doesNotMatch(component,/showModal|setInterval|localStorage|sessionStorage/);assert.match(component,/if\(!node.open\)\{wasOpen=false;return;\}/);assert.match(component,/if\(wasOpen\)return/);assert.match(component,/current===generation/);assert.match(component,/requestOfficialCalendar\(\)/);
 const notice=readFileSync('app/update-notice.tsx','utf8');assert.match(notice,/ReferenceChangeNotices/);assert.match(notice,/NOTICE_WEEK_MS/);
});
test('review without a first verified receipt never pretends a last-good calendar exists',()=>{
 const notices=referenceChangeNotices({sources:[{country:'US',status:'REVIEW_REQUIRED',reason:'CALENDAR_CANCELLATION_REVIEW',checkedAt:at,lastVerifiedAt:null}]},null);
 assert.deepEqual(notices,[]);
});

test('stale or failed JP checks do not resurrect an older confirmed numeric notice',()=>{
 for(const state of ['STALE','CHECK_UNAVAILABLE','BASELINE_REQUIRED','REVIEW_REQUIRED','UNKNOWN'])assert.deepEqual(referenceChangeNotices(null,{...allowance,countries:[{id:'JP',state}]}),[]);
 assert.deepEqual(referenceChangeNotices(null,{...allowance,countries:[]}),[]);
 const row={source_id:'JP-01',jurisdiction:'JP',source_url:'https://example.test/',state:'SOURCE_CHANGED_REVIEW_REQUIRED',checked_at:at,source_sha256:hash,reason:null,last_good_hash:baseline,last_good_verified_at:'2026-10-19',next_check_at:'2026-10-21T00:00:00Z'};
 const fresh=referenceChangeNotices(null,{...allowance,...allowanceStatusProjection([row],new Date(at))});assert.deepEqual(fresh,[]);
 const stale={...allowance,...allowanceStatusProjection([row],new Date('2026-10-23'))};assert.deepEqual(referenceChangeNotices(null,stale),[]);assert.deepEqual(stale.japan,allowance.japan);
 assert.equal(referenceChangeNotices(null,{...allowance,countries:[{id:'JP',state:'SOURCE_UNCHANGED'}]}).length,1);
});

test('suppressing public review notices preserves pending state, last-good data and real check times',()=>{
 const row={source_id:'SG-01',jurisdiction:'SG',source_url:'https://example.test/',state:'SOURCE_CHANGED_REVIEW_REQUIRED',checked_at:at,source_sha256:hash,reason:null,last_good_hash:baseline,last_good_verified_at:'2026-10-19',next_check_at:'2026-10-21T00:00:00Z'};
 const value=allowanceStatusProjection([row],new Date(at)),before=structuredClone(value),stored=structuredClone(row);
 assert.deepEqual(referenceChangeNotices(null,value),[]);assert.deepEqual(value,before);assert.deepEqual(row,stored);
 assert.equal(value.countries[0].state,'REVIEW_REQUIRED');assert.equal(value.countries[0].lastCheckedAt,at);
 assert.equal(value.countries[0].lastSuccessfulCheckAt,null);assert.equal(value.countries[0].regulationChangeConfirmed,false);
 assert.equal(value.reviewNotices[0].checkedAt,at);assert.equal(value.reviewNotices[0].baselineHash,baseline);
 assert.equal(row.last_good_verified_at,'2026-10-19');assert.equal(row.last_good_hash,baseline);
});
