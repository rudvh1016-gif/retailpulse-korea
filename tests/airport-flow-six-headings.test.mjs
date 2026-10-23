import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const read=file=>readFileSync(file,'utf8');
const scope='.glance-insights[aria-labelledby="airport-staff-briefing-title"]';
const css=postcss.parse(read('app/airport-staff-briefing.css'));
const rule=selector=>css.nodes.find(node=>node.type==='rule'&&node.selector===selector);
const declarations=node=>Object.fromEntries(node.nodes.filter(node=>node.type==='decl').map(({prop,value})=>[prop,value]));

test('all six airport-flow titles use one opt-in charcoal heading style, not the numeric values',()=>{
 const top=read('app/airport-glance-preview.tsx'),bottom=read('app/airport-staff-briefing.tsx');
 assert.equal((top.match(/<h3 className="airport-flow-item-title">/g)||[]).length,3);
 assert.equal((bottom.match(/<h3 data-heading="subsection" className="airport-flow-item-title">/g)||[]).length,3);
 assert.doesNotMatch(bottom,/>0[123] (?:시간|노선|품목)/);
 const title=rule(`:root body ${scope} .airport-flow-item-title`),values=declarations(title);
 assert.deepEqual([values['font-family'],values['font-size'],values['font-weight'],values.color,values['line-height'],values.margin],['var(--font-ui)','18px','700','#222326','1.4','0 0 10px']);
 for(const prop of ['font-size','font-weight','color','line-height'])assert.equal(title.nodes.find(node=>node.prop===prop).important,true);
 assert.equal(values['white-space'],'normal');assert.equal(values['overflow-wrap'],'anywhere');
 assert.match(read('app/globals.css'),/--ink: #111111;/);
 assert.equal(declarations(rule(`:root body :is(.lang-ja,.lang-zh,[lang="ja"],[lang="zh"]) ${scope} .airport-flow-item-title`))['font-weight'],'600');
 assert.ok(css.nodes.some(node=>node.type==='atrule'&&node.params==='(forced-colors:active)'&&node.toString().includes('color:CanvasText!important')));
});

test('the same three columns and vertical mobile reading order connect all six items',()=>{
 assert.equal(declarations(rule(scope))['column-gap'],'24px');
 assert.equal(declarations(rule(`${scope} .staff-brief-grid`))['column-gap'],'24px');
 assert.equal(declarations(rule(`${scope}>a`)).display,'block');
 const source=read('app/airport-glance-preview.tsx');
 const readingOrder=['glance-key-wait','glance-key-upcoming','glance-key-growth','<AirportStaffBriefing '].map(marker=>source.indexOf(marker));
 assert.ok(readingOrder.every((position,index)=>position>0&&(!index||position>readingOrder[index-1])));
 assert.match(read('app/airport-glance-preview.css'),/@media\(max-width:700px\)\{\.glance-insights\{grid-template-columns:1fr/);
 assert.match(read('app/airport-staff-briefing.css'),/@media\(max-width:700px\)\{\.staff-brief-grid\{grid-template-columns:1fr/);
 for(const node of css.nodes.filter(node=>node.toString().includes(scope)))node.walkDecls(decl=>assert.doesNotMatch(decl.prop,/^(?:background|box-shadow|order)$/));
});

