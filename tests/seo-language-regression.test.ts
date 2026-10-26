import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {airportFocusCopy} from '../app/airport-focus-copy';
import {buildMetadata, pageDescription, pageTitle, shareDescription, seoLocales} from '../app/seo-config';

test('English wrapper copy has no Korean and retains the model truth boundary',()=>{
  const copy=airportFocusCopy('en');
  for(const value of Object.values(copy)) assert.doesNotMatch(value,/[가-힣]/);
  assert.match(copy.model,/Illustrative model/);
  assert.match(copy.model,/do not show actual operations/);
  assert.match(copy.countriesHelp,/monthly passenger records/);
  assert.equal(airportFocusCopy('ko').model,'구조 이해를 위한 모형 · 항공기 위치는 실제 운항 현황이 아닙니다');
  assert.equal(airportFocusCopy('ko').staff,'근무 중 확인');
});

test('wrapper connects localized copy without altering locale-aware links',()=>{
  const source=readFileSync(new URL('../app/airport-focus-production.tsx',import.meta.url),'utf8');
  for(const key of Object.keys(airportFocusCopy('en')).filter(key=>key!=='countries')) assert.ok(source.includes(`{copy.${key}}`),key);
  // The country page alone has an explicitly scoped four-language title;
  // navigation and the remaining copy retain their original localized wiring.
  for(const title of ['T1 + T2 국가별 흐름','T1 + T2 Route-country trends','T1 + T2 航线国家趋势','T1 + T2 路線国別の推移']) assert.ok(source.includes(title),title);
  assert.match(source,/<h1 data-heading="page">[^]*?\[lang\]\}<\/h1><MonthlyAirportScope lang=\{lang\}\/>/);
  assert.ok(source.includes('artworkNote={copy.model}'));
  assert.ok(source.includes('href={`/${lang}/airport-news`}'));
  assert.ok(source.includes('airportFocusCopy(props.lang)'));
});

test('English share copy is English; approved Korean and page SEO stay unchanged',()=>{
  for(const locale of seoLocales) for(const slug of [undefined,'airport','myeongdong','business'] as const){
    const metadata=buildMetadata(locale,slug);
    assert.equal(metadata.title,pageTitle(locale,slug));
    assert.equal(metadata.description,pageDescription(locale,slug));
    assert.equal(metadata.openGraph?.description,locale==='en'?pageDescription('en'):shareDescription);
    assert.equal(metadata.twitter?.description,metadata.openGraph?.description);
    assert.equal(metadata.openGraph?.title,'KORETAIL');
    assert.equal(metadata.alternates?.canonical,`/${locale}${slug?`/${slug}`:''}`);
    if(locale==='en') assert.doesNotMatch(metadata.openGraph?.description??'None',/[가-힣]/);
  }
});
