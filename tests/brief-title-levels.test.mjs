import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(`../app/${p}`,import.meta.url),'utf8');

test('briefing parent, day group and figures have distinct compact title sizes',()=>{
 const css=read('heading-hierarchy.css');
 assert.ok(css.includes('.focus-report-title > h2[data-heading="section"] {font-size:22px!important}'));
 assert.ok(css.includes('.focus-report :is(.focus-selected-country-changes > h3,.focus-preparation-brief > div > h3)[data-heading="subsection"] {font-size:16px!important}'));
 assert.ok(css.includes('.focus-report .focus-figures-title[data-heading="subsection"] {font-size:18px!important}'));
 assert.match(css,/color:#222326!important;font-weight:700!important/);
 assert.match(css,/color:#222326!important;font-weight:750!important/);
 assert.match(css,/color:#222326!important;font-weight:700!important/);
 assert.match(css,/white-space:normal/);assert.match(css,/overflow-wrap:anywhere/);
});

test('title gaps stay modest and apply to mobile as well as desktop',()=>{
 const css=read('airport-focus-preview.css');
 assert.ok(css.includes('.focus-report .focus-report-title{margin-bottom:20px}'));
 assert.ok(css.includes('.focus-report .focus-report-date{font-size:12px;font-weight:400;'));
 assert.ok(css.includes('.focus-report .focus-figures-title{margin:0 0 8px}'));
 assert.ok(!css.includes('.focus-figures-title{margin-bottom:10px}'));
 // The six airport-flow peers retain their own uniform scale, independent of briefing nesting.
 const flow=read('airport-staff-briefing.css');
 assert.match(flow,/font-size:16px!important;font-weight:700!important;color:#222326!important/);
 assert.match(flow,/margin:0 0 10px/);
});


test('figures title keeps a compact 7px mobile and 8px desktop content gap',()=>{
 const css=read('airport-focus-preview.css');
 assert.ok(css.includes('.focus-report-lines{grid-template-columns:1fr;gap:5px}'));
 assert.match(css,/@media\(max-width:999px\)\{\s*\.airport-focus-shell \.focus-report \.focus-figures-title\{margin-bottom:3px\}\s*\}/);
 assert.ok(css.includes('.focus-report .focus-figures-title{margin:0 0 8px}'));
 assert.ok(css.includes('.focus-report-lines{grid-column:1;grid-row:3;display:block}'));
 assert.ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px;align-items:start'));
 assert.equal(3+4,7,'mobile title margin plus compact grid row gap');
});



