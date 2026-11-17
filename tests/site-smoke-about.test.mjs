import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise the exact predicate executed by the production workflow, without
// fetching the network or relying on a helper absent from its deployed checkout.
const workflow=readFileSync('.github/workflows/site-smoke.yml','utf8');
const helper=workflow.match(/\/\/ BEGIN ABOUT CONTENT CONTRACT([\s\S]*?)\/\/ END ABOUT CONTENT CONTRACT/)?.[1]??'';
const predicate=workflow.match(/check\("about page is live", (.+), `status /)?.[1];
assert.ok(predicate,'the real production About check must be exercised');
const check=runInNewContext(`${helper}\n(status,html)=>{const about={status};const aboutHtml=html;return ${predicate};}`);
const sections=[
 ['국가별 흐름','숫자는 이렇게 읽어주세요'],
 ['언제 새 자료가 보이나요?','목적지 국가는 승객 국적이 아닙니다.'],
 ['자료의 한계','매출·적정 인원·재고 수량을 예측하지 않습니다.'],
];
const intro='<h2 id="site-usage-title"><span aria-hidden="true"></span>누가, 어떻게 쓰면 좋을까요?</h2><p>인천공항에서 일하며 오늘의 상황과 평소와 달라진 흐름을 확인하는 곳입니다.</p>';
const section=([heading,body])=>`<section><h3>${heading}</h3><p>${body}</p></section>`;
const page=(items=sections,lead=intro)=>`<html><head><title>KORETAIL 소개</title></head><body><main><section class="site-usage-guide">${lead}<details data-testid="airport-usage-guide">${items.map(section).join('')}</details></section></main></body></html>`;

test('airport guide title, introduction and populated truth boundaries pass without obsolete wording',()=>{
 assert.equal(page().includes('KORETAIL은 무엇인가요'),false);assert.equal(check(200,page()),true);
});
test('HTTP 200 and the old marker cannot pass an empty main',()=>{
 assert.equal(check(200,'<title>KORETAIL은 무엇인가요</title><main>KORETAIL</main>'),false);
});
test('the full content still requires a successful HTTP response',()=>assert.equal(check(503,page()),false));
test('the current page heading and introduction are required',()=>{
 assert.equal(check(200,page(sections,'<h1>KORETAIL</h1>')),false);
 assert.equal(check(200,page(sections,intro.replace(/<p>[\s\S]*?<\/p>/,''))),false);
});
for(const [index,[heading]] of sections.entries())test(`missing section or body is rejected: ${heading}`,()=>{
 assert.equal(check(200,page(sections.filter((_,i)=>i!==index))),false);
 assert.equal(check(200,page(sections.map((entry,i)=>i===index?[entry[0],'']:entry))),false);
});
test('metadata, scripts, templates and comments cannot substitute for real main content',()=>{
 for(const wrapped of [`<script>${page()}</script>`,`<template>${page()}</template>`,`<!--${page()}-->`]){
  assert.equal(check(200,`<title>KORETAIL은 무엇인가요</title>${wrapped}<main>KORETAIL</main>`),false);
 }
 assert.equal(check(200,page().replace('<main>','<aside>').replace('</main>','</aside>')),false);
});
test('rendering whitespace and decorative heading spans do not break the semantic content check',()=>{
 assert.equal(check(200,page().replaceAll('<h3>','<h3>\n<span aria-hidden="true"></span>')),true);
});
