import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MonthlyLineChart from '../app/airport-monthly-line-chart.tsx';

const captured=JSON.parse(readFileSync(new URL('../data/airport-focus-preview/verified-metrics.json',import.meta.url)));
const render=row=>renderToStaticMarkup(React.createElement(MonthlyLineChart,{row}));

test('every captured month exposes its exact existing passenger count through a native keyboard control',()=>{
 for(const row of captured.trends){
  const html=render(row);
  assert.equal((html.match(/<button /g)??[]).length,row.points.length);
  for(const point of row.points){
   const month=Number(point.month.slice(5));
   assert.ok(html.includes(`${row.label} ${point.month.slice(0,4)}년 ${month}월 · ${point.departures.toLocaleString('ko-KR')}명`));
  }
  assert.doesNotMatch(html,/<title>/,'do not rely on an inaccessible native SVG hover title');
  assert.match(html,/role="group"/);
 }
 assert.match(render(captured.trends[0]),/5월 · 902,230명/);
});

test('missing observations stay missing, break the line and never become zero',()=>{
 const row=structuredClone(captured.trends[0]);row.points[2].departures=null;
 const html=render(row);
 assert.match(html,/6월 · 자료 없음/);
 assert.equal((html.match(/class="focus-month-line"/g)??[]).length,3);
 assert.equal((html.match(/class="focus-month-point"/g)??[]).length,5);
 assert.doesNotMatch(html,/6월 · 0명/);
});

test('a real zero is readable and an entirely missing series is not plotted',()=>{
 const row=structuredClone(captured.trends[0]);row.points[0].departures=0;
 assert.match(render(row),/4월 · 0명/);
 row.points.forEach(point=>{point.departures=null;});
 assert.equal(render(row),'<p>월별 자료 확인 중</p>');
});

test('thin strokes are non-scaling and touch targets and motion stay independent of line thickness',()=>{
 const html=render(captured.trends[0]);
 assert.equal((html.match(/stroke-width="1.25" vector-effect="non-scaling-stroke"/g)??[]).length,11);
 const css=readFileSync(new URL('../app/airport-monthly-line-chart.css',import.meta.url),'utf8');
 assert.match(css,/min-width:24px;min-height:44px/);
 const targetPercent=Number(html.match(/width:clamp\(24px, ([\d.]+)%, 44px\)/)?.[1]);
 assert.ok(Math.abs(targetPercent-256/332/5*100)<1e-12,'hit area cannot exceed the adjacent month-center spacing');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
 const source=readFileSync(new URL('../app/airport-monthly-line-chart.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|gsap|lottie/i);
});
