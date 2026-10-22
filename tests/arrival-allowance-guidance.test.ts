import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateArrival,updateArrivalAnswer,arrivalCheckSummary,arrivalCheckExplanation,type ArrivalCountry} from '../lib/arrival-allowance-guidance';
import {allowanceSemanticHash,validatePreviewDataset} from '../lib/customs-allowance-check.mjs';
const data=JSON.parse(readFileSync('data/airport-focus-preview/arrival-allowances.json','utf8'));
const country=(id:string)=>data.countries.find((row:ArrivalCountry)=>row.id===id) as ArrivalCountry;
const standard={purpose:'ordinary',residence:'visitor',origin:'korea',age:'adult',frequency:'normal'};
test('China screenshot explains the repeat-entry rule without leaking ordinary allowance results',()=>{
 const value=evaluateArrival(country('CN'),{...standard,frequency:'frequent'});
 assert.equal(value.complete,true);assert.equal(value.result,undefined);
 assert.match(value.guidance!.title,/15일 내 반복/);assert.match(value.guidance!.reason,/15일 이내 2회 이상/);
 assert.match(value.guidance!.details!.join(' '),/이번 입국을 포함/);
 assert.match(value.guidance!.details!.join(' '),/면세액이 0이라는 뜻은 아닙니다/);assert.match(value.guidance!.nextStep,/적색통로/);
 assert.doesNotMatch(value.guidance!.reason,/CNY|면세액이 0/);assert.ok(value.guidance!.reason.length<70);
 assert.match(value.guidance!.details!.join(' '),/40개비.*1일 1회/);assert.match(value.guidance!.details!.join(' '),/12도 이상.*면세 반입 대상이 아닙니다/);
 assert.ok(value.guidance!.sourceUrls!.every(url=>country('CN').sources.some(source=>source.url===url)));
 const minor=evaluateArrival(country('CN'),{...standard,frequency:'frequent',age:'minor'});
 assert.equal(minor.result,undefined);assert.doesNotMatch(minor.guidance!.details!.join(' '),/40개비/);assert.match(minor.guidance!.details!.join(' '),/18세 미만/);
});
test('China avoids duplicate summary amounts and keeps condition references inside a disclosure',()=>{
 for(const result of country('CN').results)assert.equal(result.summary,undefined);
 const source=readFileSync('app/arrival-allowances-preview.tsx','utf8');
 const disclosure=source.indexOf('<summary>조건 상세 · 공식 근거</summary>');
 const links=source.indexOf('guidance.sourceUrls?.map');
 assert.ok(disclosure>0&&links>disclosure&&links<source.indexOf('</details>',disclosure));
 assert.match(source,/!guidance&&<p>\{country.procedures.summary\}/);
});
test('China keeps residence, origin, age, gifts and uncertain frequency separate',()=>{
 assert.match(JSON.stringify(evaluateArrival(country('CN'),standard).result),/CNY 2,000/);
 assert.match(JSON.stringify(evaluateArrival(country('CN'),{...standard,residence:'resident'}).result),/CNY 5,000/);
 for(const change of [{age:'minor'},{origin:'hkmacao'},{origin:'other'},{purpose:'gift'},{frequency:'unknown'}]){
  const value=evaluateArrival(country('CN'),{...standard,...change});assert.equal(value.result,undefined);assert.ok(value.guidance?.reason);assert.ok(value.guidance?.nextStep);
 }
 assert.equal(evaluateArrival(country('CN'),{...standard,age:'invented'}).complete,false);
 assert.equal(evaluateArrival(country('CN'),{}).guidance,undefined);
 const gift=evaluateArrival(country('CN'),{purpose:'gift'});assert.equal(gift.complete,true);assert.equal(gift.visible.length,1);
});
test('China excess, approved return and temporary use are distinct without a guaranteed storage promise',()=>{
 const procedures=country('CN').procedures!;assert.ok(procedures);
 const text=JSON.stringify(procedures);assert.match(text,/적색통로/);assert.match(text,/세관.*동의/);
 assert.match(text,/3개월/);assert.match(text,/7일/);assert.match(text,/다른 공항/);assert.match(text,/비용/);
 assert.match(text,/자동 보장되지는 않습니다/);assert.match(text,/무료 보관기간을 뜻하지 않습니다/);
 assert.match(text,/임시반입.*담보/);assert.match(text,/금지품.*반송이 보장되지/);
 const changed=structuredClone(country('CN'));changed.procedures!.summary+=' changed';
 assert.notEqual(allowanceSemanticHash(country('CN')),allowanceSemanticHash(changed));
});
test('Japan child, Vietnam minor/occupational scope and Thai gifts never inherit inappropriate limits',()=>{
 const jp=evaluateArrival(country('JP'),{purpose:'ordinary',age:'child'});assert.equal(jp.result,undefined);assert.match(jp.guidance!.reason,/본인이 사용할/);
 const vn=evaluateArrival(country('VN'),{purpose:'ordinary',age:'minor'});assert.match(JSON.stringify(vn.result),/VND 10,000,000/);assert.match(JSON.stringify(vn.result),/18세 미만/);
 const crew=evaluateArrival(country('VN'),{purpose:'special',age:'adult'});assert.match(crew.guidance!.reason,/90일당 1회/);assert.match(crew.guidance!.reason,/일반 관광객 전체.*아닙니다/);
 assert.equal(evaluateArrival(country('TH'),{purpose:'gift'}).result,undefined);assert.match(evaluateArrival(country('TH'),{purpose:'gift'}).guidance!.nextStep,/신고창구/);
 assert.match(JSON.stringify(evaluateArrival(country('TH'),{purpose:'ordinary'}).result),/THB 20,000/);
});
test('switching conditional eligibility removes hidden answers instead of restoring stale eligibility',()=>{
 let answers={purpose:'ordinary',age:'adult',residence:'visitor',visitorEligibility:'met'};
 const us=country('US');assert.ok(evaluateArrival(us,answers).result);
 answers=updateArrivalAnswer(us,answers,'residence','resident') as typeof answers;
 assert.equal(answers.visitorEligibility,undefined);assert.equal(evaluateArrival(us,answers).complete,false);
 answers=updateArrivalAnswer(us,answers,'residence','visitor') as typeof answers;
 assert.equal(evaluateArrival(us,answers).complete,false);
});
test('unconfigured access, failed request and successful current observation have distinct truthful copy',()=>{
 const check={id:'CN',state:'CHECK_UNAVAILABLE',lastCheckedAt:'2026-10-21T00:00:00Z',nextCheckAt:'2026-10-22T00:00:00Z'};
 assert.match(arrivalCheckSummary({...check,accessReviewRequired:true}),/자동 조회 미구성/);
 assert.match(arrivalCheckExplanation({...check,accessReviewRequired:true}),/원문을 요청하지 않았습니다/);
 assert.match(arrivalCheckSummary(check),/자동 재확인 실패/);
 assert.match(arrivalCheckExplanation(check),/확인일을 갱신하지 않습니다/);
 assert.match(arrivalCheckExplanation({...check,state:'SOURCE_UNCHANGED'}),/모든 최신 법령.*뜻은 아닙니다/);
});
test('new guidance has source/condition contracts and cannot escape semantic review identity',()=>{
 const manifest=JSON.parse(readFileSync('config/customs-allowance-sources.json','utf8'));
 assert.deepEqual(validatePreviewDataset(data,manifest),[]);
 const cn=country('CN'),changed=structuredClone(cn);changed.guidance![0].reason+=' changed';
 assert.notEqual(allowanceSemanticHash(cn),allowanceSemanticHash(changed));
 const jp=manifest.sources.find((row:{id:string})=>row.id==='JP-01');
 assert.equal(allowanceSemanticHash(country('JP')),jp.baseline.datasetSemanticHash,'scoped review date and existing child note do not break numeric publication baseline');
});
test('manual review references require labelled HTTPS links without expanding automatic access',()=>{
 const manifest=JSON.parse(readFileSync('config/customs-allowance-sources.json','utf8'));
 const valid={label:'공식 수동 검토 근거',url:'https://xzfg.moj.gov.cn/law/download?LawID=1457&type=pdf'};
 const invalid=[null,{}, {...valid,label:''},{...valid,label:'  '},{...valid,label:42},{...valid,label:'설명\n두 줄'},{...valid,url:null},{...valid,url:'not a URL'},{...valid,url:'http://example.com/rule'},{...valid,url:'https:example.com/rule'},{...valid,url:'javascript:alert(1)'},{...valid,url:'https://reader@example.com/rule'}];
 for(const references of [null,{},...invalid.map(reference=>[reference])]){
  const changed=structuredClone(data);changed.countries.find((row:ArrivalCountry)=>row.id==='CN').reviewReferences=references;
  assert.ok(validatePreviewDataset(changed,manifest).includes('CN:REVIEW_REFERENCE_INVALID'));
 }
 const changed=structuredClone(data);changed.countries.find((row:ArrivalCountry)=>row.id==='CN').reviewReferences=[valid];
 assert.deepEqual(validatePreviewDataset(changed,manifest),[]);
 assert.equal(manifest.allowedHosts.includes('xzfg.moj.gov.cn'),false,'manual link validation does not add an automatic source');
});
