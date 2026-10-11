import test from 'node:test';
import assert from 'node:assert/strict';
import {customsArticleMetadata} from '../lib/customs-news-collector';

const key='0123456789abcdef0123456789abcdef';
const href='/common/nttFileDownload.do?fileKey='+key;
const url='https://www.customs.go.kr'+href;
const link=`<a href="${href}" title="Fixture.pdf 다운로드">Fixture.pdf</a>`;
// Observed in saved normal-get-10178304 / browser-article-10153830 HTML.
// Only the provider's structure is reproduced; article contents are synthetic.
const row=(body:string)=>`<tr><th scope="row">첨부파일</th><td colspan="3"><ul class="list_file">${body}</ul></td></tr>`;
const item=(body:string)=>`<li>${body}</li>`;

test('metadata parses attachment attributes independently of their order and quote style',()=>{
 for(const anchor of [link,`<a title="Fixture.pdf 다운로드" href="${href}">Fixture.pdf</a>`,`<A TITLE = 'Fixture.pdf 다운로드' class='fdown' HREF = '${href}'>Fixture.pdf</A>`]){
  const result=customsArticleMetadata(row(item(anchor)));
  assert.deepEqual(result.attachments,[{url,name:'Fixture.pdf',review:'pending'}]);
  assert.equal(result.attachmentsComplete,true);
 }
});

test('metadata requires the observed complete attachment row, including an explicitly empty list',()=>{
 for(const html of ['', '<html><body>유효하지 않은 요청</body></html>',link,'<ul class="list_file"></ul>','<section>첨부파일 없음</section>']){
  assert.equal(customsArticleMetadata(html).attachmentsComplete,false);
 }
 assert.deepEqual(customsArticleMetadata(row('')).attachments,[]);
 assert.equal(customsArticleMetadata(row('\n  ')).attachmentsComplete,true);
});

test('metadata preserves parsed documents while dynamic, malformed or unknown attachments remain incomplete',()=>{
 for(const unknown of [
  '<a href="#none" title="Other.hwpx 다운로드" class="fdown">Other.hwpx</a>',
  `<a href="${href}">Missing filename</a>`,
  '<a href="https://example.com/other.pdf" title="Other.pdf 다운로드">Other.pdf</a>',
  '<button onclick="download()">다운로드</button>',
 ]){
  const result=customsArticleMetadata(row(item(link)+item(unknown)));
  assert.deepEqual(result.attachments,[{url,name:'Fixture.pdf',review:'pending'}]);
  assert.equal(result.attachmentsComplete,false);
 }
 for(const html of [row(item(link)).replace('</ul>',''),row(item(link)).replace('</tr>',''),row('')+row(''),row('')+link,row('<iframe src="files"></iframe>')]){
  assert.equal(customsArticleMetadata(html).attachmentsComplete,false);
 }
});

test('metadata recognizes a bound provider preview without treating it as another document',()=>{
 const preview=`<a href="#viewer" onClick="viewer('/streamdocs/v4/documents/view/tnnf/${key}')" class="btnFile_view" title="Fixture.pdf 바로보기(새창으로 열립니다.)">바로보기</a>`;
 const result=customsArticleMetadata(row(item(link+preview)));
 assert.equal(result.attachmentsComplete,true);
 assert.equal(result.attachments.length,1);
 assert.equal(customsArticleMetadata(row(item(link+preview.replace(key,'f'.repeat(32))))).attachmentsComplete,false);
});

test('metadata excludes images, deduplicates documents and keeps overflow incomplete',()=>{
 const image=`<a title="photo.jpg 다운로드" href="/common/nttFileDownload.do?fileKey=${'f'.repeat(32)}">photo.jpg</a>`;
 const result=customsArticleMetadata(row(item(link)+item(link)+item(image)));
 assert.deepEqual(result.attachments,[{url,name:'Fixture.pdf',review:'pending'}]);
 assert.equal(result.attachmentsComplete,true);
 const overflow=Array.from({length:7},(_,index)=>item(`<a title="Fixture${index}.hwp 다운로드" href="/common/nttFileDownload.do?fileKey=${index.toString(16).padStart(32,'0')}">document</a>`)).join('');
 assert.equal(customsArticleMetadata(row(overflow)).attachments.length,6);
 assert.equal(customsArticleMetadata(row(overflow)).attachmentsComplete,false);
});

test('metadata ignores quoted fake attributes and non-document HTML instead of claiming completeness',()=>{
 const fake=`<a data-note='href="${href}" title="Fake.pdf 다운로드"'>Not an attachment</a>`;
 assert.deepEqual(customsArticleMetadata(fake).attachments,[]);
 for(const html of [
  `<!-- ${row(item(link))} -->`,`<!-- ${row(item(link))}`,
  `<script>const html=${JSON.stringify(row(item(link)))}</script>`,
  `<script>${row(item(link))}`,`<template>${row(item(link))}</template>`,
  `<textarea>${row(item(link))}</textarea>`,`<div data-example='${row(item(link))}'></div>`,
 ]){
  assert.deepEqual(customsArticleMetadata(html).attachments,[]);
  assert.equal(customsArticleMetadata(html).attachmentsComplete,false);
 }
});
