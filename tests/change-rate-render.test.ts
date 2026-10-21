import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement,type FunctionComponent} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChangeRate,CountChange,RateText} from '../app/change-rate';
const render=<P extends object>(component:FunctionComponent<P>,props:P)=>renderToStaticMarkup(createElement(component,props));
const format=new Intl.NumberFormat('ko',{maximumFractionDigits:1}).format;
for(const lang of ['ko','en','zh','ja'] as const)test(`rendered rate and count directions preserve units and accessible words: ${lang}`,()=>{
 const words={ko:['증가','감소'],en:['increase','decrease'],zh:['增长','下降'],ja:['増加','減少']}[lang];
 for(const unit of ['%','%p'] as const)for(const [value,direction,visible,word] of [[2.7,'up','+2.7',words[0]],[-2.7,'down','▲ 2.7',words[1]],[0,'neutral','0','0'],[-0,'neutral','0','0'],[.001,'up','+&lt;0.1',words[0]],[-.001,'down','▲ &lt;0.1',words[1]]] as const){
  const html=render(ChangeRate,{value,lang,unit});assert.ok(html.includes(`data-direction="${direction}"`));assert.ok(html.includes(`${visible}${unit}</span>`));assert.ok(html.includes(`aria-label="${word}`));
 }
 for(const value of [null,NaN,Infinity,-Infinity])assert.match(render(ChangeRate,{value,lang}),/data-direction="neutral".*>—<\/span>/);
 for(const unit of ['명','편','편/일',' flights/day','人','便/日'])for(const [delta,direction,visible,word] of [[2.7,'up','+2.7',words[0]],[-2.7,'down','▲ 2.7',words[1]],[0,'neutral','0','0'],[-.001,'down','▲ &lt;0.1',words[1]]] as const){
  const html=render(CountChange,{delta,format,lang,unit});assert.ok(html.includes(`data-direction="${direction}"`));assert.ok(html.includes(`aria-hidden="true">${visible}${unit}</span>`));assert.ok(html.includes(`class="sr-only">${word}`));
 }
 for(const delta of [null,NaN,Infinity,-Infinity])assert.match(render(CountChange,{delta,format,lang}),/data-direction="neutral".*aria-hidden="true">—<\/span>/);
 const mixed=render(RateText,{lang,text:'▲ 2.7% ~ +3.0% · ▲ 1,200명 · 0편'});
 assert.equal((mixed.match(/data-direction="down"/g)||[]).length,2);assert.equal((mixed.match(/data-direction="up"/g)||[]).length,1);assert.equal((mixed.match(/data-direction="neutral"/g)||[]).length,1);
});
test('change colors remain restrained blue, dark red and neutral, without touching congestion or temperature',()=>{
 const css=readFileSync('app/change-rate.css','utf8');
 assert.match(css,/\.change-rate\[data-direction=up\]\{color:#245579\}/);assert.match(css,/\.change-rate\[data-direction=down\]\{color:#a12d3f\}/);assert.match(css,/\.change-rate\[data-direction=neutral\]\{color:#59636e\}/);
 assert.doesNotMatch(css,/temperature|congestion/);
});
test('More shows the concise reading rule before secondary menus and settings',()=>{
 const source=readFileSync('app/retailpulse-app.tsx','utf8');
 assert.ok(source.includes('수치 읽는 법: 파란색 +는 증가, 빨간색 ▲는 감소입니다. 비교 기간과 단위를 함께 확인하세요.'));
 assert.ok(source.indexOf('data-testid="change-reading-guide"')<source.indexOf('<nav className="more-section-links"'));
});
