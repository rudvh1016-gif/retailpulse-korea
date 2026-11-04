import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const component=readFileSync(new URL('../app/airport-duty-free-exchange.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/airport-duty-free-exchange.css',import.meta.url),'utf8');
test('native nonmodal exchange disclosure has localized explicit close and focus return',()=>{
 for(const label of ['환율 접기','Collapse rates','收起汇率','レートを閉じる'])assert.ok(component.includes(`collapse:'${label}'`));
 assert.match(component,/<details className="duty-free-rate-sources"/);
 assert.match(component,/className="duty-free-close"/);
 assert.match(component,/details\.open=false;details\.querySelector\('summary'\)\?\.focus\(\)/);
 assert.match(component,/event.key==='Escape'&&event.currentTarget.open/);
 assert.doesNotMatch(component,/aria-modal|role="dialog"/);
 assert.match(component,/<DutyFreeMonthlyTrend lang=\{lang\}/);
});
test('exchange surface has scoped opaque ink/metadata colors, sticky dismissal and viewport bounds',()=>{
 assert.match(css,/\.airport-duty-free-exchange \.duty-free-rate-detail\{--ink:#202830;--muted:#586571/);
 assert.match(css,/\.duty-free-panel-heading\{position:sticky;top:0/);
 assert.match(css,/\.duty-free-close\{[^}]*min-height:44px/);
 assert.match(css,/\.duty-free-close:focus-visible/);
 assert.match(css,/max-height:calc\(100dvh - 150px - var\(--safe-area-top/);
 assert.match(css,/\[open\] \.duty-free-trigger-open\{display:inline\}/);
});
test('today-only panel uses current dated evidence and removes adjacent-day summary',()=>{
 assert.match(component,/find\(item=>item.current\)/);
 assert.match(component,/data-rate-day="today"/);
 assert.doesNotMatch(component,/data-rate-day="previous"|data-rate-day="next"|words.nextMissing|words.caution/);
 assert.match(component,/words.internet/);
 assert.match(component,/href=\{dutyFreeSources.shilla\}/);
});
test('chart has edge-clamped nonintercepting hover readout, keyboard and touch cancellation',()=>{
 const chart=readFileSync(new URL('../app/duty-free-monthly-trend.tsx',import.meta.url),'utf8');
 assert.match(chart,/event.pointerType==='mouse'/);
 assert.match(chart,/role="tooltip"/);
 assert.match(chart,/left:`clamp\(0px/);
 for(const handler of ['onPointerLeave','onPointerCancel','onLostPointerCapture','onBlur','ArrowLeft','ArrowRight','Home','End','Escape'])assert.ok(chart.includes(handler),handler);
 assert.doesNotMatch(chart,/duty-free-recent-source/);
 assert.match(chart,/<figcaption>/);
 assert.match(css,/\.duty-free-recent-tooltip\{[^}]*pointer-events:none/);
 assert.match(css,/@media\(forced-colors:active\)/);
});
