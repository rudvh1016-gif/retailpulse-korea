import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ConciseExplainer} from '../app/concise-explainer';

for(const summary of ['인천공항 전체 · 노선 국가별 월 출발 여객','Incheon airport-wide · monthly departures by route country','仁川全机场 · 按航线国家统计月度出发旅客','仁川空港全体・路線の国別の月間出発旅客']) {
 test(`closed accessible explanation: ${summary}`,()=>{
  const html=renderToStaticMarkup(h(ConciseExplainer,{summary,children:h('p',null,'Original explanation retained.')}));
  assert.match(html,/^<details class="concise-explainer">/);
  assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
  assert.match(html,/<summary style="min-height:44px;box-sizing:border-box;padding:12px 0;cursor:pointer">/);
  assert.ok(html.includes(summary));
  assert.match(html,/<p>Original explanation retained\.<\/p><\/details>$/);
 });
}
test('country explanation keeps original limitations, source link and state handling',()=>{
 const source=readFileSync('app/airport-route-country-passengers.tsx','utf8');
 const detail=source.match(/<ConciseExplainer[\s\S]*?<\/ConciseExplainer>/)?.[0]??'';
 for(const phrase of ['비행기가 향한 나라(노선) 기준','터미널별로 나누지 않습니다','항공편 일평균과 단위·범위가 달라','Grouped by the country each flight flies to','按航班飞往的国家（航线）统计','便の向かう国（路線）基準'])assert.ok(detail.includes(phrase));
 const outside=source.replace(detail,'');
 for(const phrase of ['https://www.data.go.kr/data/15095071/openapi.do','reply.month!==month','role="status"','누락을 0으로 표시하지 않습니다'])assert.ok(outside.includes(phrase));
 for(const phrase of ['Missing data is never zero.','缺失不表示0。','欠測を0と表示しません。'])assert.ok(outside.includes(phrase));
});
test('shared metric explanations retain all four fields and localized summaries',()=>{
 const source=readFileSync('app/retailpulse-app.tsx','utf8');
 assert.equal((source.match(/<MetricExplainer\n\s+summary=/g)??[]).length,1);
 for(const field of ['what','high','source','why'])assert.ok(source.includes(`<dd>{${field}}</dd>`));
 assert.match(source,/<ConciseExplainer summary=\{summary\}>\{explanation\}<\/ConciseExplainer> : explanation/);
 const shared=readFileSync('app/concise-explainer.tsx','utf8');
 assert.doesNotMatch(shared,/useState|onClick|preventDefault|background|fontSize|aria-expanded/);
});
