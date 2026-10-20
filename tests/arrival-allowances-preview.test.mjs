import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data=JSON.parse(await readFile(new URL('../data/airport-focus-preview/arrival-allowances.json',import.meta.url),'utf8'));
const country=id=>data.countries.find(row=>row.id===id);
const match=(row,answers)=>{
 const matches=when=>Object.entries(when).every(([key,values])=>values.includes(answers[key]));
 const visible=row.conditions.filter(condition=>!condition.when||matches(condition.when));
 return visible.every(condition=>answers[condition.id])?row.results.find(result=>matches(result.when)):undefined;
};
test('arrival guide records preserve condition keys and explicit official provenance',()=>{
 assert.equal(new Set(data.countries.map(row=>row.id)).size,data.countries.length);
 for(const row of data.countries){
  assert.ok(row.sources.length);assert.match(row.checkedAt,/^\d{4}-\d{2}-\d{2}$/);assert.ok(row.effectiveLabel);
  assert.equal(match(row,{}),undefined);
  for(const source of row.sources)assert.equal(new URL(source.url).protocol,'https:');
  for(const result of row.results){
   assert.ok(result.facts.length);assert.ok(result.facts.every(fact=>typeof fact.value==='string'&&fact.value));
   for(const [key,values] of Object.entries(result.when)){
    const condition=row.conditions.find(condition=>condition.id===key);assert.ok(condition,`${row.id}: ${key}`);
    assert.ok(values.every(value=>condition.options.some(option=>option.id===value)));
   }
  }
 }
});
test('China defaults, residence, origin, age and frequent entry cannot collapse into one limit',()=>{
 const answers={purpose:'ordinary',age:'adult',residence:'visitor',origin:'korea',frequency:'normal'};
 assert.match(JSON.stringify(match(country('CN'),answers)),/CNY 2,000/);
 assert.match(JSON.stringify(match(country('CN'),{...answers,residence:'resident'})),/CNY 5,000/);
 for(const change of [{age:'minor'},{origin:'hkmacao'},{frequency:'frequent'},{residence:'unknown'}])assert.equal(match(country('CN'),{...answers,...change}),undefined);
});
test('US visitor gifts and resident allowance remain different, with unmet conditions withheld',()=>{
 const answers={purpose:'ordinary',age:'adult',residence:'visitor',visitorEligibility:'met'};
 const visitor=JSON.stringify(match(country('US'),answers));assert.match(visitor,/USD 100/);assert.doesNotMatch(visitor,/USD 800/);
 assert.equal(match(country('US'),{...answers,residence:'resident'}),undefined);
 assert.match(JSON.stringify(match(country('US'),{...answers,residence:'resident',residentEligibility:'met'})),/USD 800/);
 assert.equal(match(country('US'),{...answers,visitorEligibility:'other'}),undefined);
});
test('age boundaries and known zero exemptions do not invent unknown values',()=>{
 const jp=match(country('JP'),{purpose:'ordinary',age:'young'});assert.match(JSON.stringify(jp),/20세 미만/);
 const vn=match(country('VN'),{purpose:'ordinary',age:'minor'});assert.match(JSON.stringify(vn),/VND 10,000,000/);assert.match(JSON.stringify(vn),/18세 미만/);
 assert.match(JSON.stringify(country('TH')),/연령.*명시되지/);
 const sg=match(country('SG'),{purpose:'own',age:'adult',hours:'over48',passStatus:'excluded',origin:'korea'});
 assert.match(JSON.stringify(sg),/GST 수입면제 대상에서 제외/);assert.match(JSON.stringify(sg),/담배 면세 없음/);
});
test('unresolved Philippines excise quantities are withheld rather than converted to zero',()=>{
 const result=match(country('PH'),{purpose:'ordinary'});
 for(const label of ['주류','담배'])assert.match(result.facts.find(fact=>fact.label===label).value,/상충.*확인 필요/);
 assert.doesNotMatch(result.facts.filter(fact=>['주류','담배'].includes(fact.label)).map(f=>f.value).join(''),/\d/);
});
test('Malaysia requires designated airport and residence-specific 48-hour qualification',()=>{
 const answers={purpose:'ordinary',residence:'visitor',airport:'kl',visitorTime:'met'};
 assert.match(JSON.stringify(match(country('MY'),answers)),/RM 1,000/);
 for(const change of [{airport:'other'},{visitorTime:'other'},{residence:'resident'}])assert.equal(match(country('MY'),{...answers,...change}),undefined);
});
test('Canada visitor gift limits never inherit returning-resident value allowances',()=>{
 const answers={purpose:'ordinary',residence:'visitor',age:'adult',province:'age19'};
 assert.match(JSON.stringify(match(country('CA'),answers)),/CAD60/);
 assert.doesNotMatch(JSON.stringify(match(country('CA'),answers)),/CAD800/);
 const returning=match(country('CA'),{...answers,residence:'resident',hours:'24to48'});
 assert.match(JSON.stringify(returning),/CAD200.*전액 과세/);
});
test('Australia minor allowance and whole-category excess tax remain explicit',()=>{
 const answer=JSON.stringify(match(country('AU'),{purpose:'ordinary',residence:'visitor',age:'minor'}));
 assert.match(answer,/AUD 450/);assert.match(answer,/해당 품목군 전체/);assert.match(answer,/18세 미만은 담배 반입이 허용되지/);
});
