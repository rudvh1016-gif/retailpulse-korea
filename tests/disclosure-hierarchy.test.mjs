import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import postcss from 'postcss';
const read=p=>readFileSync(p,'utf8');
const css=postcss.parse(read('app/disclosure-hierarchy.css'));
const sources=readdirSync('app',{recursive:true}).filter(f=>f.endsWith('.tsx')).map(f=>({file:f,tree:ts.createSourceFile(f,read(`app/${f}`),99,true,4)}));
const summaries=[],triggers=[];
for(const {file,tree} of sources){function walk(n){if(ts.isJsxOpeningElement(n)){const tag=n.tagName.getText(tree),attrs=n.attributes.properties.map(a=>a.name?.getText(tree));if(tag==='summary')summaries.push({file,attrs});if(attrs.includes('data-disclosure-trigger'))triggers.push({file,tag,attrs});}ts.forEachChild(n,walk)}walk(tree)}
test('shared disclosure stylesheet is loaded and covers native summaries sitewide',()=>{
 assert.match(read('app/layout.tsx'),/import "\.\/disclosure-hierarchy.css"/);
 assert.ok(summaries.length>=110);assert.ok(new Set(summaries.map(s=>s.file)).size>=50);
 assert.ok(css.nodes.some(n=>n.type==='rule'&&n.selector.includes('details > summary')));
});
test('disclosure hierarchy changes typography and focus only, never geometry or triangles',()=>{
 const allowed=new Set(['color','font-weight','outline','outline-offset']);
 css.walkDecls(d=>assert.ok(allowed.has(d.prop),d.prop));
 css.walkDecls('font-weight',d=>assert.ok(['400','600'].includes(d.value),'All locales use actual supported font weights'));
 assert.doesNotMatch(css.toString(),/::(?:before|after)|list-style|display:|background:|padding:|margin:|font-size:|pointer-events|transition|transform/);
});
test('open state is scoped to its own summary and declared disclosure buttons',()=>{
 assert.match(css.toString(),/details\[open\] > summary/);
 assert.match(css.toString(),/\[aria-expanded="true"\]/);
 assert.match(css.toString(),/#222326/);
 assert.deepEqual(triggers.map(t=>t.file).sort(),['airport-day-radar.tsx','duty-free-monthly-trend.tsx']);
 for(const t of triggers){assert.equal(t.tag,'button');assert.ok(t.attrs.includes('aria-expanded'));}
});
test('mixed data remains regular and actual title labels are separately targeted',()=>{
 for(const file of ['airport-flight-browser.tsx','airport-duty-free-exchange.tsx','commercial-composition.tsx','prediction-evidence.tsx','prediction-view.tsx','week-ahead.tsx','airport-route-country-passengers.tsx'])assert.ok(summaries.some(s=>s.file===file&&s.attrs.includes('data-disclosure-mixed')),file);
 for(const file of ['airport-flight-browser','airport-gate-pillars','airport-zone-countries','airport-glance-preview','airport-focus-trends','business-compare','duty-free-monthly-trend'])assert.match(read(`app/${file}.tsx`),/data-disclosure-meta/,file);
 assert.match(css.toString(),/summary \[data-disclosure-title\]/);
 assert.match(css.toString(),/summary small/);
});
test('keyboard focus and forced-color fallback are preserved',()=>{
 assert.match(css.toString(),/:focus-visible/);assert.match(css.toString(),/forced-colors:active/);
 assert.match(css.toString(),/ButtonText/);
});

test('long readiness/week explanations retain a separate actual title',()=>{
 for(const f of ['prediction-view','prediction-evidence','week-ahead'])assert.match(read(`app/${f}.tsx`),/<DisclosureLabel text=\{[\s\S]*?title=\{/);
 for(const f of ['commercial-composition','airport-route-country-passengers'])assert.match(read(`app/${f}.tsx`),/<DisclosureLabel text=/);
 assert.match(read('app/disclosure-label.tsx'),/data-disclosure-title/);
 assert.match(read('app/disclosure-label.tsx'),/data-disclosure-meta/);
});
test('forced colors also match every higher-specificity open-state color selector',()=>{
 const forced=css.nodes.find(n=>n.type==='atrule'&&n.params==='(forced-colors:active)');
 const forcedSelectors=new Set();forced.walkRules(rule=>rule.selectors.forEach(s=>forcedSelectors.add(s)));
 for(const rule of css.nodes.filter(n=>n.type==='rule'&&n.selector.includes('[open]'))){
  for(const selector of rule.selectors)assert.ok(forcedSelectors.has(selector),selector);
 }
});

