import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DisclosureLabel} from '../app/disclosure-label';
const render=(text:string,title?:string)=>renderToStaticMarkup(createElement(DisclosureLabel,{text,title}));
test('translated disclosure label text stays exact while numbers stay regular',()=>{
 for(const text of ['나머지 12개 노선 국가','12 more route countries','其余12个航线国家','残り12の路線の国','업종 21개 · 금액과 활동 수준 전체 보기']){
  const html=render(text);assert.equal(html.replace(/<[^>]*>/g,''),text);
  assert.match(html,/<span data-disclosure-title="true">/);
  assert.match(html,/<span data-disclosure-meta="true">\d+<\/span>/);
 }
});
test('readiness and week headings leave dates, counts and supporting copy regular',()=>{
 for(const [title,tail] of [['내일 예상 준비',': 24/24시간에 최소 자료 확보'],['다음 7일',' (10/22–10/28) · 행사 4건']]){
  const html=render(title+tail,title);assert.equal(html,`<span data-disclosure-title="true">${title}</span><span data-disclosure-meta="true">${tail}</span>`);
 }
});
