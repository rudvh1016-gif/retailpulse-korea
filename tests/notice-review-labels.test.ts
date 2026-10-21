import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UPDATE_NOTICE_TITLE} from '../lib/update-notice-preference';
import {arrivalReviewDateLabel,arrivalReviewSentence} from '../lib/arrival-review-date';
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('all notice locales share the exact durable owner heading without changing accessible identity',()=>{
 assert.equal(UPDATE_NOTICE_TITLE,'new update!');
 const source=read('app/update-notice.tsx');
 assert.match(source,/<h2 id="update-notice-title" tabIndex=\{-1\}>\{UPDATE_NOTICE_TITLE\}<\/h2>/);
 assert.match(source,/aria-labelledby="update-notice-title"/);
 assert.doesNotMatch(source,/title:'(?:새로운 정보|Airport information|机场信息|空港情報)/);
 assert.match(source,/<span className="update-notice-new">NEW<\/span>/);
});
test('review dates never fall back to collection attempts or normalize invalid dates',()=>{
 for(const verifiedAt of [undefined,null,'','2026-02-30','2026-13-01','2026-10-21T12:00:00Z'])assert.equal(arrivalReviewDateLabel({verifiedAt,checkedAt:'2026-10-21'}),'미확인 · 검토 필요');
 assert.equal(arrivalReviewDateLabel({verifiedAt:'2026-10-20',checkedAt:'2026-10-21'}),'2026-10-20');
});
test('existing small single source line uses reviewed dates, separately from effective dates and automatic checks',()=>{
 const source=read('app/arrival-allowances-preview.tsx');
 assert.equal((source.match(/\{arrivalReviewSentence\(country\)\}/g)??[]).length,1);
 assert.match(source,/arrivalReviewSentence\(country\)\} · \{country.effectiveLabel\}/);
 assert.doesNotMatch(source,/원문 확인 \{country.checkedAt\}/);
 assert.match(source,/<small className="focus-source arrival-review-date">\{arrivalReviewSentence/);
 assert.ok(source.indexOf('className="focus-source arrival-review-date"')<source.indexOf('<details className="arrival-source"'));
 const data=JSON.parse(read('data/airport-focus-preview/arrival-allowances.json'));
 for(const row of data.countries){
  const expected=['CN','VN','TH'].includes(row.id)?'2026-10-21':['PH','MY'].includes(row.id)?'미확인 · 검토 필요':'2026-10-20';
  assert.equal(arrivalReviewDateLabel(row),expected,row.id);
 }
});


test('natural review wording keeps unknown dates honest and valid fixed dates free of warnings',()=>{
 assert.equal(arrivalReviewSentence({verifiedAt:'2026-10-20',checkedAt:'2026-10-22'}),'2026-10-20에 공식 자료를 확인했어요.');
 for(const verifiedAt of [undefined,null,'2026-02-30'])assert.equal(arrivalReviewSentence({verifiedAt,checkedAt:'2026-10-22'}),'공식 자료를 확인한 날짜가 없어 직접 확인이 필요해요.');
 const source=read('app/arrival-allowances-preview.tsx');
 assert.match(source,/최근 자동 확인 시도/);
 assert.doesNotMatch(source,/최근 자동 확인 \$/);
});
