import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UPDATE_NOTICE_TITLE} from '../lib/update-notice-preference';
import {arrivalManualReviewLabel,arrivalReviewDateLabel,arrivalReviewSentence} from '../lib/arrival-review-date';
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('all notice locales share the exact durable owner heading without changing accessible identity',()=>{
 assert.equal(UPDATE_NOTICE_TITLE,'new update!');
 const source=read('app/update-notice.tsx');
 assert.match(source,/<h2 data-heading="section" id="update-notice-title" tabIndex=\{-1\}><span className="heading-marker" aria-hidden="true"\/>\{UPDATE_NOTICE_TITLE\}<\/h2>/);
 assert.match(source,/aria-labelledby="update-notice-title"/);
 assert.doesNotMatch(source,/title:'(?:새로운 정보|Airport information|机场信息|空港情報)/);
 assert.match(source,/<span className="update-notice-new">NEW<\/span>/);
});
test('review dates never fall back to collection attempts or normalize invalid dates',()=>{
 for(const verifiedAt of [undefined,null,'','2026-02-30','2026-13-01','2026-10-21T12:00:00Z'])assert.equal(arrivalReviewDateLabel({verifiedAt,checkedAt:'2026-10-21'}),'미확인 · 검토 필요');
 assert.equal(arrivalReviewDateLabel({verifiedAt:'2026-10-20',checkedAt:'2026-10-21'}),'2026-10-20');
});
test('small scoped manual date is visible before traveler selectors, with effective dates kept in details',()=>{
 const source=read('app/arrival-allowances-preview.tsx');
 assert.equal((source.match(/\{arrivalReviewSentence\(country\)\}/g)??[]).length,1);
 assert.match(source,/arrivalReviewSentence\(country\)\} · \{country.effectiveLabel\}/);
 assert.doesNotMatch(source,/원문 확인 \{country.checkedAt\}/);
 assert.match(source,/<small className="focus-source arrival-review-date">\{arrivalManualReviewLabel\(country\)\}/);
 assert.ok(source.indexOf('className="focus-source arrival-review-date"')<source.indexOf('<div className="arrival-filters"'));
 assert.ok(source.indexOf('<details className="arrival-source"')<source.indexOf('{arrivalReviewSentence(country)}'));
 assert.equal((source.match(/className="focus-source arrival-review-date"/g)??[]).length,1);
 const data=JSON.parse(read('data/airport-focus-preview/arrival-allowances.json'));
 for(const row of data.countries){
  const expected=row.id==='SG'?'2026-10-24':['CN','JP','VN','TH'].includes(row.id)?'2026-10-22':['PH','MY'].includes(row.id)?'미확인 · 검토 필요':'2026-10-20';
  assert.equal(arrivalReviewDateLabel(row),expected,row.id);
 }
});

test('compact manual status uses only a valid scoped review date, never the newer attempt',()=>{
 assert.equal(arrivalManualReviewLabel({verifiedAt:'2026-10-22',checkedAt:'2026-10-23'}),'표시 기준 수동 확인 2026-10-22');
 for(const verifiedAt of [undefined,null,'2026-02-30','2026-10-22T00:00:00Z'])assert.equal(arrivalManualReviewLabel({verifiedAt,checkedAt:'2026-10-23'}),'표시 기준 수동 확인일 미확인');
});


test('natural review wording keeps unknown dates honest and valid fixed dates free of warnings',()=>{
 assert.equal(arrivalReviewSentence({verifiedAt:'2026-10-20',checkedAt:'2026-10-22'}),'2026-10-20에 공식 자료를 확인했어요.');
 for(const verifiedAt of [undefined,null,'2026-02-30'])assert.equal(arrivalReviewSentence({verifiedAt,checkedAt:'2026-10-22'}),'공식 자료를 확인한 날짜가 없어 직접 확인이 필요해요.');
 const source=read('app/arrival-allowances-preview.tsx');
 assert.match(source,/최근 자동 확인 시도/);
 assert.doesNotMatch(source,/최근 자동 확인 \$/);
});
