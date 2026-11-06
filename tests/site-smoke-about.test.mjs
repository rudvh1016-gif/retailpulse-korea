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
 ['누구를 위한 서비스인가요?','공항의 오늘과 달라진 흐름을 살펴보는 서비스입니다.'],
 ['어떤 정보를 볼 수 있나요?','국가별 흐름은 목적지별 여객과 항공편'],
 ['숫자와 색은 어떻게 읽나요?','표시 숫자는 반올림하며 계산은 원래 값으로 합니다.'],
 ['자료를 볼 때 주의할 점','목적지 국가는 승객 국적이 아닙니다.'],
];
const intro='<h1><span aria-hidden="true"></span>인천공항의 흐름을\n한눈에</h1><p>인천공항 항공편·여객 흐름과 여행 준비 정보를 제공하는 KORETAIL. 자료별 기준일과 출처를 함께 안내합니다.</p>';
const section=([heading,body])=>`<section class="about-section"><h2>${heading}</h2><p>${body}</p></section>`;
const page=(items=sections,lead=intro)=>`<html><head><title>KORETAIL 소개</title></head><body><main><section class="about-view">${lead}${items.map(section).join('')}</section></main></body></html>`;

test('current About title, introduction and four populated sections pass without the obsolete wording',()=>{
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
 assert.equal(check(200,page().replaceAll('<h2>','<h2>\n<span aria-hidden="true"></span>')),true);
});
