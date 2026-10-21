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
 assert.doesNotMatch(css,/transform:translateX\(-50%\)/,'left positions now describe contiguous region edges');
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/:focus-visible/);
 const source=readFileSync(new URL('../app/airport-monthly-line-chart.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|gsap|lottie/i);
});

test('nearest-month targets cover the full chart with no capped-width gaps or out-of-bounds edges',()=>{
 for(const count of [1,2,6]){
  const row={...captured.trends[0],points:captured.trends[0].points.slice(0,count)},html=render(row);
  const boxes=[...html.matchAll(/class="focus-month-target" style="left:([\d.]+)%;width:([\d.]+)%"/g)].map(match=>({left:Number(match[1]),width:Number(match[2])}));
  assert.equal(boxes.length,count);assert.equal(boxes[0].left,0);
  for(const [index,box] of boxes.entries()){
   const center=(48+index*256/Math.max(1,count-1))/332*100;
   assert.ok(box.left<=center&&center<=box.left+box.width);
   assert.ok(box.width>0&&box.left+box.width<=100+1e-12);
   if(index)assert.ok(Math.abs(boxes[index-1].left+boxes[index-1].width-box.left)<1e-12);
  }
  assert.ok(Math.abs(boxes.at(-1).left+boxes.at(-1).width-100)<1e-12);
 }
});

test('only the bounded readout is neutral liquid glass, with opaque accessibility fallbacks',()=>{
 const css=readFileSync(new URL('../app/airport-monthly-line-chart.css',import.meta.url),'utf8');
 const tooltip=css.match(/\.focus-month-tooltip\{([^}]+)\}/)[1];
 assert.match(tooltip,/background:rgb\(255 255 255 \/ 60%\)/);assert.match(tooltip,/backdrop-filter:blur\(24px\) saturate\(110%\)/);
 assert.match(tooltip,/border:0;border-radius:33px/);assert.match(tooltip,/width:152px;max-width:calc\(100% - 16px\)/);
 assert.match(tooltip,/font-size:13px;line-height:1.4/);
 const nav=readFileSync(new URL('../app/glass-navigation.css',import.meta.url),'utf8');
 const navShadow=nav.match(/\.glass-nav::before\{[^}]*box-shadow:([^;]+)/)[1];
 assert.equal(tooltip.match(/box-shadow:([^;]+)/)[1],navShadow,'same glass surface highlights and shadow as the bottom navigation');
 assert.match(css,/@supports not/);assert.match(css,/@media\(prefers-reduced-transparency:reduce\),\(prefers-contrast:more\)/);
 assert.match(css,/background:rgb\(244 244 246\);-webkit-backdrop-filter:none;backdrop-filter:none/);
 assert.match(css,/@media\(forced-colors:active\).*background:Canvas;color:CanvasText/);
 assert.equal((css.match(/backdrop-filter:blur\(24px\) saturate\(110%\)/g)??[]).length,2);
});

// CI trace: the floating readout intercepted the next month target. Removing it
// on Escape then re-entered the exposed target and immediately reopened it.
test('the noninteractive monthly readout never intercepts its month targets',()=>{
 const css=readFileSync(new URL('../app/airport-monthly-line-chart.css',import.meta.url),'utf8');
 const tooltip=css.match(/\.focus-month-tooltip\{([^}]+)\}/)?.[1];
 assert.ok(tooltip);
 assert.match(tooltip,/(?:^|;)pointer-events:none(?:;|$)/);
});

test('scrubbing maps CSS pixels to plotted month positions, clamps margins and preserves missing slots',async()=>{
 const {nearestMonthlyPoint}=await import('../lib/monthly-chart-pointer.ts');
 for(const scale of [.7,1,2.4])for(const count of [1,2,6]){
  const left=71.25,w=332*scale;
  for(let i=0;i<count;i++)assert.equal(nearestMonthlyPoint(left+(48+i*256/Math.max(1,count-1))*scale,left,w,count),i);
  assert.equal(nearestMonthlyPoint(left-300,left,w,count),0);
  assert.equal(nearestMonthlyPoint(left+w+300,left,w,count),count-1);
 }
 for(const args of [[0,0,0,6],[NaN,0,332,6],[0,0,332,0],[0,0,Infinity,6]])assert.equal(nearestMonthlyPoint(...args),null);
 const left=20,w=332;
 assert.equal(nearestMonthlyPoint(left+48+256/5*2,left,w,6),2,'missing observations retain their selectable month');
});

test('country source essentials stay visible while the full original caveats remain expandable',()=>{
 const source=readFileSync(new URL('../app/airport-focus-trends.tsx',import.meta.url),'utf8');
 assert.match(source,/인천공항 공식 월 실적 · \{checkedAt\?`수집 \$\{kstDayOf\(checkedAt\)\}`/);
 assert.match(source,/노선 국가 기준 · 국가별 축 다름<\/small><details[^>]*><summary>자료 안내<\/summary>/);
 assert.match(source,/노선 국가 기준이며 승객 국적이 아닙니다\. 과거 실적은 향후 증가를 보장하지 않습니다\./);
});

test('every full-country monthly table is a default-closed native disclosure with its table preserved',()=>{
 const source=readFileSync(new URL('../app/airport-focus-trends.tsx',import.meta.url),'utf8');
 assert.match(source,/full&&!loading&&<details className="focus-month-table-details"><summary>월별 수치 보기<\/summary><table className="focus-month-values">/);
 assert.match(source,/<caption className="sr-only">\{row.label\} 월별 출발 여객과 전월비<\/caption>/);
 assert.match(source,/<thead><tr><th>월<\/th><th>출발 여객<\/th><th>전월비<\/th><\/tr><\/thead><tbody>\{row.points.map/);
 assert.match(source,/<\/tbody><\/table><\/details>/);
 const css=readFileSync(new URL('../app/airport-monthly-line-chart.css',import.meta.url),'utf8');
 assert.match(css,/\.focus-month-table-details>summary\{[^}]*min-height:44px/);
 assert.match(css,/\.focus-month-table-details>summary:focus-visible/);
});
