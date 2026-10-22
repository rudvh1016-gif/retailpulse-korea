import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const signals=read('app/live-signals.tsx');
const chart=signals.match(/function AirportMonthChart\([\s\S]*?\n\}\n/)?.[0]??'';
const css=read('app/airport-models.css');

test('daily forecast marks are moderately thicker without narrowing the full-day controls',()=>{
 assert.match(chart,/const barWidth = Math\.min\(8, slot \* 0\.66\)/);
 assert.match(chart,/const slot = width \/ slots/);
 assert.match(chart,/style=\{\{ flex: `0 0 \$\{100 \/ slots\}%` \}\}/);
 assert.match(chart,/<button[^>]*type="button" aria-pressed=\{day\.date === shownDay\.date\}/);
 assert.match(chart,/onClick=\{\(\) => setActive\(day\.date\)\}/);
 assert.match(css,/\.airport-month-picks button:focus-visible \{ outline: 2px solid var\(--ink\)/);
});

test('daily bars use neutral ink with one selected accent and compact spacing',()=>{
 assert.match(css,/\.airport-month-bar \{ fill: #747c86; stroke: none; rx: \.4px; ry: 1px; \}/);
 assert.match(css,/\.airport-month-bar\[data-selected\] \{ fill: #43617f; \}/);
 assert.match(css,/\.airport-month-chart \{ margin-top: 8px; \}/);
 assert.match(css,/\.airport-month-plot \{ height: 64px; margin-top: 6px; \}/);
 assert.match(css,/\.airport-month-chart\[data-short-series="true"\] \.airport-month-plot \{ height: 96px; \}/);
 assert.match(css,/\.airport-month-readout \{ margin-top: 4px; \}/);
});

test('refinement preserves the zero baseline, missing-day ticks and exact selected readout',()=>{
 assert.match(chart,/className="airport-month-baseline" x1="0" x2=\{width\} y1=\{height - 0\.5\}/);
 assert.match(chart,/day\.total === null\s*\? <rect[^>]*className="airport-month-gap"/);
 assert.match(chart,/height=\{Math\.max\(0, height - barY\(day\.total\)\)\}/);
 assert.match(chart,/const shown = activeIndex >= 0 \? activeIndex : days\.length - 1/);
 assert.match(chart,/className="airport-month-readout" aria-live="polite"/);
 assert.match(chart,/cumulative\[shown\] === null \? airportTodayText\.unavailable\[lang\]/);
 assert.match(chart,/const showEachValue = days\.length <= 5/);
 assert.doesNotMatch(chart,/<(?:linearGradient|image|animate)\b/);
});

// Geometry is verified in airport-month-daily-trend.spec.ts at phone/desktop widths.
test('long daily strips cap horizontal pitch with aligned ticks and no date truncation',()=>{
 assert.ok(chart.includes("`min(100%, calc(${slots} * clamp(12px, 1.6vw, 22px)))`"));
 assert.match(chart,/<div className="airport-month-plot" style=\{plotStyle\}>/);
 assert.match(chart,/<div className="airport-month-ticks" style=\{plotStyle\}/);
 assert.match(chart,/const slots = days.length/);
 assert.match(chart,/days.map\(\(day\) => <button/);
});


test('daily readouts are reachable by hover, focus, tap and keyboard without changed values',()=>{
 assert.match(chart,/onPointerEnter=\{\(\) => setActive\(day\.date\)\}/);
 assert.match(chart,/onFocus=\{\(\) => setActive\(day\.date\)\}/);
 assert.match(chart,/data-value=\{day\.total\}/);
 for(const count of [10,22,28,29,30,31])for(const [viewport,available] of [[320,292],[390,354],[430,394],[1024,420],[1280,500],[1920,700]]){
  const pitchLimit=Math.max(12,Math.min(viewport*.016,22));
  const plot=Math.min(available,count*pitchLimit),pitch=plot/count,width=Math.min(8,100/count*.66)*plot/100;
  assert.ok(width>6&&width<=14.52+.001);assert.ok(pitch-width>0);assert.ok(pitch<=22);
  assert.ok(Math.abs(width/pitch-.66)<.001);
 }
});
