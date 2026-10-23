import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowanceSemanticHash,assessObservation,validatePreviewDataset} from '../lib/customs-allowance-check.mjs';

const json=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const manifest=json('../config/customs-allowance-sources.json');
const dataset=json('../data/airport-focus-preview/arrival-allowances.json');
const review=json('../docs/research/arrival-allowances/singapore-review-2026-10-24.json');
const source=manifest.sources.find(item=>item.id==='SG-01');
const country=dataset.countries.find(item=>item.id==='SG');
const lastGood={semanticHash:allowanceSemanticHash(country),verifiedAt:country.verifiedAt};

test('Singapore review preserves legal content, effective dates, and no change notice',()=>{
 assert.deepEqual(validatePreviewDataset(dataset,manifest),[]);
 assert.equal(allowanceSemanticHash(country),review.datasetSemanticHash);
 assert.equal(country.effectiveLabel,'GST 금액 2019-02-19 · 주류 조합 2019-04-01 시행');
 assert.equal(country.effectiveDate,null);
 assert.equal(country.changeAnnouncement,null);
 assert.equal(review.policyChangeConfirmed,false);
 assert.equal(review.storedValuesChanged,false);
 assert.equal(review.publicChangeNotice,false);
 assert.equal(country.verifiedAt,review.displayReviewDate);
 assert.equal(country.checkedAt,review.displayReviewDate);
 assert.equal(new Date(review.retrievedAt).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),review.displayReviewDate);
});

test('the exact reviewed Singapore source hash no longer reopens review',()=>{
 assert.equal(source.baseline.sha256,review.reviewedSourceSha256);
 assert.equal(source.baseline.reviewedAt,review.retrievedAt);
 assert.equal(source.url,review.http.url);
 const result=assessObservation(source,{kind:'bytes',sha256:review.reviewedSourceSha256,observedAt:'2026-10-24T16:17:43.228Z'},lastGood);
 assert.equal(result.state,'UNCHANGED_SOURCE');
 assert.equal(result.regulationChanged,null);
 assert.equal(result.mayPublish,false);
 assert.deepEqual(result.lastGood,lastGood);
});

test('unknown Singapore bytes still require internal review and cannot publish',()=>{
 const result=assessObservation(source,{kind:'bytes',sha256:'f'.repeat(64),observedAt:'2026-10-24T16:17:43.228Z'},lastGood);
 assert.equal(result.state,'SOURCE_CHANGED_REVIEW_REQUIRED');
 assert.equal(result.regulationChanged,null);
 assert.equal(result.mayPublish,false);
 assert.equal(result.legalInterpretationVerified,false);
 assert.deepEqual(result.lastGood,lastGood);
});

test('Singapore review leaves cadence and automated-interpretation scope unchanged',()=>{
 assert.equal(source.numericParser,undefined);
 assert.equal(source.extractor,undefined);
 assert.equal(source.accessReview.minIntervalHours,24);
 assert.equal(manifest.automaticCollectionEnabled,false);
 assert.equal(manifest.publicationEnabled,false);
 assert.equal(review.sources.length,5);
});
