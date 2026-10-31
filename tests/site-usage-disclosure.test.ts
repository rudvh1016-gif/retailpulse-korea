import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SiteUsageGuide} from '../app/site-usage-guide';
import {passengerCopy} from '../lib/passenger-copy';

for(const lang of ['ko','en','zh','ja'] as const)test(`${lang}: optional examples and long methodology explanations collapse, not truth boundaries`,()=>{
 const html=renderToStaticMarkup(h(SiteUsageGuide,{lang}));
 const details=html.match(/<details\b[^>]*>[\s\S]*?<\/details>/g)??[];
 assert.equal(details.length,lang==='ja'?3:4);
 for(const detail of details){assert.doesNotMatch(detail.split('>')[0],/\bopen\b/);assert.match(detail,/<summary style="min-height:44px;box-sizing:border-box;padding:12px 0;cursor:pointer">/);}
 const examples=details.find(detail=>detail.includes('data-testid="usage-examples"'));
 const method=details.find(detail=>detail.includes('data-testid="usage-method"'));
 const updates=details.find(detail=>detail.includes('data-testid="usage-updates"'));
 assert.ok(examples);assert.equal((examples.match(/<dt>/g)??[]).length,3);
 assert.ok(method);assert.match(method,/<p>/);
 assert.ok(updates);assert.match(updates,/<p>/);
 if(lang!=='ja'){const airport=details.find(detail=>detail.includes('data-testid="airport-usage-guide"'));assert.ok(airport);assert.equal((airport.match(/<dt>/g)??[]).length,4);}
 const visible=html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 if(lang==='ko'){
  assert.ok(visible.includes('출국장 예고와 별도 환승 예고의 단순 합계'));
  assert.ok(visible.includes('출국장 예고에는 내·외국인 구분이 없습니다'));
 }else if(lang==='zh'){
  assert.ok(visible.includes('出境大厅预告与另列中转预告的简单合计'));
  assert.ok(visible.includes('出境大厅预告不区分韩国人与外国人'));
 }else{
  assert.ok(visible.includes(passengerCopy.scope[lang]));
  assert.ok(visible.includes(passengerCopy.limitation[lang]));
 }
 assert.ok(visible.includes(passengerCopy.noSum[lang]));
 assert.match(visible,/class="site-usage-limit"/);
 assert.equal((visible.match(/<h3\b[^>]*>/g)??[]).length,1);
});
test('native disclosures need no client state, hidden content deletion or new backgrounds',()=>{
 const source=readFileSync('app/site-usage-guide.tsx','utf8');
 assert.doesNotMatch(source,/useState|onClick|preventDefault|background|aria-expanded/);
 assert.match(source,/<ReadingParagraphs text=\{t.method\}/);
});
