import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../app/${p}`,import.meta.url),'utf8');

test('briefing parent, day group and figures have distinct compact title sizes',()=>{
 const css=read('heading-hierarchy.css');
 assert.ok(css.includes('.focus-report-title > h2[data-heading="section"] {font-size:clamp(24px,2.4vw,28px)!important}'));
 assert.ok(css.includes('.focus-report .focus-today-title[data-heading="subsection"] {font-size:20px!important}'));
 assert.ok(css.includes('.focus-report .focus-figures-title[data-heading="subsection"] {font-size:16px!important}'));
 assert.match(css,/color:#29272a!important;font-weight:650!important/);
 assert.match(css,/color:#542632!important;font-weight:750!important/);
 assert.match(css,/color:var\(--ink,#111111\)!important;font-weight:700!important/);
 assert.match(css,/white-space:normal/);assert.match(css,/overflow-wrap:anywhere/);
});

test('title gaps stay modest and apply to mobile as well as desktop',()=>{
 const css=read('airport-focus-preview.css');
 assert.ok(css.includes('.focus-report .focus-report-title{margin-bottom:20px}'));
 assert.ok(css.includes('.focus-report .focus-today-title{margin:0 0 12px}'));
 assert.ok(css.includes('.focus-report .focus-figures-title{margin:0 0 8px}'));
 assert.ok(!css.includes('.focus-figures-title{margin-bottom:10px}'));
 // The six airport-flow peers retain their own uniform scale, independent of briefing nesting.
 const flow=read('airport-staff-briefing.css');
 assert.match(flow,/font-size:16px!important;font-weight:700!important;color:var\(--ink,#111111\)!important/);
 assert.match(flow,/margin:0 0 10px/);
});


test('figures title has an 8px total gap in both grid and block layouts',()=>{
 const css=read('airport-focus-preview.css');
 assert.ok(css.includes('.focus-report-lines{grid-template-columns:1fr;gap:5px}'));
 assert.match(css,/@media\(max-width:999px\)\{\s*\.airport-focus-shell \.focus-report \.focus-figures-title\{margin-bottom:3px\}\s*\}/);
 assert.ok(css.includes('.focus-report .focus-figures-title{margin:0 0 8px}'));
 assert.ok(css.includes('.focus-report-lines{grid-column:1;grid-row:3;display:block}'));
 assert.equal(3+5,8,'grid margin + row gap matches the desktop block margin');
});


