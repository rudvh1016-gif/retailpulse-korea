import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arrivalCountryActions,arrivalResultNotes,arrivalAlcoholNotes} from '../lib/arrival-country-actions';
import {evaluateArrival,type ArrivalCountry} from '../lib/arrival-allowance-guidance';
import {allowanceSemanticHash} from '../lib/customs-allowance-check.mjs';
const data=JSON.parse(readFileSync('data/airport-focus-preview/arrival-allowances.json','utf8'));
const country=(id:string):ArrivalCountry=>data.countries.find((c:ArrivalCountry)=>c.id===id);

test('manual declaration reference does not replace the reviewed Japan numeric baseline',()=>{
 const manifest=JSON.parse(readFileSync('config/customs-allowance-sources.json','utf8'));
 assert.equal(allowanceSemanticHash(country('JP')),manifest.sources.find((source:{id:string})=>source.id==='JP-01').baseline.datasetSemanticHash);
});

test('only reviewed ordinary JP/VN/TH conditions receive concise action summaries',()=>{
 for(const id of ['JP','VN','TH'])for(const purpose of ['gift','special','unknown',''])assert.equal(arrivalCountryActions(id,{purpose,age:'adult'}),undefined);
 for(const id of ['CN','US','PH','MY',''])assert.equal(arrivalCountryActions(id,{purpose:'ordinary',age:'adult'}),undefined);
 for(const id of ['JP','VN'])for(const age of ['unknown','child',''])assert.equal(arrivalCountryActions(id,{purpose:'ordinary',age}),undefined);
 assert.equal(evaluateArrival(country('JP'),{purpose:'ordinary',age:'child'}).result,undefined);
 assert.equal(evaluateArrival(country('TH'),{purpose:'gift'}).result,undefined);
});

test('Japan minor presentation removes adult bottle advice but retains baggage aggregation and reviewed numbers',()=>{
 const jp=country('JP'),before=JSON.stringify(jp);
 for(const age of ['adult','young']){
  const answers={purpose:'ordinary',age},result=evaluateArrival(jp,answers).result!;
  const notes=arrivalResultNotes('JP',answers,result.notes);
  assert.ok(notes.some(note=>note.includes('휴대품·별송품은 합산')));
  assert.equal(notes.some(note=>note.includes('3병')),age==='adult');
  assert.match(arrivalCountryActions('JP',answers)!.action,/한도 이내여도.*신고.*적색통로/);
  assert.match(result.facts.find(f=>f.label==='주류')!.value,age==='adult'?/760mL 기준 3병/:/20세 미만.*면세가 없습니다/);
 }
 assert.deepEqual(arrivalResultNotes('JP',{age:'young'},['술은 병 크기와 무관하게 7병이라는 뜻이 아닙니다. 휴대품·별송품은 합산합니다.']),['휴대품·별송품은 합산합니다.']);
 assert.equal(JSON.stringify(jp),before,'presentation does not mutate the approved numeric snapshot');
});

test('Vietnam exposes declaration before passing inspection without changing age or occupational scope',()=>{
 for(const age of ['adult','minor']){
  const answers={purpose:'ordinary',age},result=evaluateArrival(country('VN'),answers).result!;
  assert.match(arrivalCountryActions('VN',answers)!.action,/검사구역을 지나기 전에 신고/);
  assert.match(result.facts.find(f=>f.label==='기타물품')!.value,/VND 10,000,000/);
  assert.match(result.facts.find(f=>f.label==='반입금지')!.value,/전자담배·가열담배/);
 }
 assert.match(arrivalCountryActions('VN',{purpose:'ordinary',age:'minor'})!.caution,/18세 미만/);
 assert.match(evaluateArrival(country('VN'),{purpose:'special'}).guidance!.reason,/승무원|직업/);
});

test('Thailand separates ordinary declaration from excess alcohol surrender and puts age uncertainty beside product amounts',()=>{
 const th=country('TH'),notes=th.results[0].notes,before=JSON.stringify(th),summary=arrivalCountryActions('TH',{purpose:'ordinary'})!;
 assert.match(summary.action,/일반물품 초과.*여권·영수증\(있는 경우\).*신고창구/);
 assert.match(summary.caution,/술·담배 초과분.*지정함.*반납.*보장되지는 않습니다/);
 assert.match(summary.scope!,/본인용·적정 수량/);
 assert.equal(arrivalAlcoholNotes('TH',notes).length,1);
 assert.match(arrivalAlcoholNotes('TH',notes)[0],/연령.*명시되지 않았습니다/);
 assert.ok(arrivalResultNotes('TH',{purpose:'ordinary'},notes).every(note=>!note.startsWith('술·담배 면세 적용 연령')));
 assert.equal(JSON.stringify(th),before);
});

test('core actions follow general facts, precede disclosures, and do not invent custody entitlements',()=>{
 const source=readFileSync('app/arrival-allowances-preview.tsx','utf8');
 const core=source.indexOf('className="arrival-next-actions"');
 assert.ok(core>source.indexOf('<h4>패션·명품 등 일반물품 기준</h4>'));
 assert.ok(core<source.indexOf('<summary>화장품·향수</summary>'));
 assert.match(source,/<summary>주류·담배<\/summary>\{alcoholNotes.map/);
 assert.match(source,/result.summary&&!actions/);
 const copy=readFileSync('lib/arrival-country-actions.ts','utf8');
 assert.doesNotMatch(copy,/180일|무료 보관|세금만 내면|다른 공항.*수령/);
 assert.ok(country('JP').reviewReferences!.some(reference=>reference.url==='https://www.customs.go.jp/english/summary/passenger.htm'));
});
