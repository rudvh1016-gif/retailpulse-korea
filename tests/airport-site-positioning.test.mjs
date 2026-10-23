import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildMetadata,pageTitle,pageDescription,pageStructuredData,shareDescription,seoLocales} from '../app/seo-config.ts';

test('site and home metadata describe the current airport-first scope without claiming live accuracy',()=>{
  assert.equal(pageTitle('ko'),'코리테일 KORETAIL | 인천공항 항공편·여객 흐름·여행 준비 정보');
  assert.equal(pageDescription('ko'),shareDescription);
  for(const locale of seoLocales){
    assert.match(pageTitle(locale),/인천공항|Incheon Airport|仁川机场|仁川空港/);
    const metadata=buildMetadata(locale);
    assert.equal(metadata.openGraph.description,locale === 'en' ? pageDescription('en') : shareDescription);
    assert.equal(metadata.twitter.description,metadata.openGraph.description);
    assert.equal(metadata.alternates.canonical,`/${locale}`);
    assert.equal(pageStructuredData(locale)[0].description,pageDescription(locale));
  }
  assert.doesNotMatch(shareDescription,/서울|실시간|공식 서비스|VIP/);
});

test('the indexed business page includes its airport mode but preserves Seoul and non-prediction limits',()=>{
  assert.equal(pageTitle('ko','business'),'인천공항·매장 운영 브리핑 | KORETAIL');
  for(const locale of seoLocales){
    assert.match(pageTitle(locale,'business'),/인천공항|Incheon Airport|仁川机场|仁川空港/);
    assert.match(pageDescription(locale,'business'),/서울|Seoul|首尔|ソウル/);
    assert.equal(buildMetadata(locale,'business').alternates.canonical,`/${locale}/business`);
  }
  assert.match(pageDescription('ko','business'),/매출이나 방문객 수를 예측하지 않습니다/);
  assert.match(pageTitle('ko','where-to'),/서울/);
  assert.match(pageTitle('ko','myeongdong'),/명동/);
});

test('site JSON-LD reuses the same introduction and visible copy remains truthful',async()=>{
  const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
  const app=await readFile(new URL('../app/retailpulse-app.tsx',import.meta.url),'utf8');
  const guide=await readFile(new URL('../app/site-usage-guide.tsx',import.meta.url),'utf8');
  assert.match(layout,/description: shareDescription,/);
  assert.doesNotMatch(layout,/서울 주요 상권/);
  assert.match(app,/서울 지역 참고자료도 함께 제공합니다/);
  assert.match(app,/business\.place === "airport"/);
  assert.match(guide,/서울 지역 자료도 별도 화면/);
  assert.doesNotMatch(app,/인천공항 출국장 대기·항공편 흐름과 서울 주요 상권의 혼잡·소비 정보를 한눈에/);
});

test('the Korean visible footer agrees with the existing Korean and English site names',async()=>{
  const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8');
  const app=await readFile(new URL('../app/retailpulse-app.tsx',import.meta.url),'utf8');
  const footer=app.match(/<footer className="site-footer">([\s\S]*?)<\/footer>/)?.[1];
  assert.ok(footer,'the shared footer remains visible page content');
  assert.match(footer,/lang === "ko" \? "코리테일 KORETAIL" : "KORETAIL"/);
  assert.match(layout,/name: "KORETAIL",/);
  assert.match(layout,/alternateName: \["코리테일",/);
  assert.match(pageTitle('ko'),/^코리테일 KORETAIL \|/);
});
