import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const css=read('app/departure-guide-entry.module.css');
const candidate=css.slice(css.indexOf('/* Owner 2026-10-21: exactly'));
const nav=read('app/glass-navigation.css');
test('five-control material matches the final bottom bar, including six shadows',()=>{
 const shadow=nav.split('.glass-nav::before{')[1].split('box-shadow:')[1].split(';')[0];
 assert.ok(candidate.includes(`box-shadow:${shadow};`));
 for(const token of ['background:rgb(255 255 255 / 60%)','blur(24px) saturate(110%)','border-radius:33px','background:rgb(244 244 246)'])assert.ok(candidate.includes(token));
 assert.doesNotMatch(candidate,/180%|187 187 188|!important/);
 const tree=postcss.parse(candidate);let rules=0;
 tree.walkRules(rule=>{rules++;assert.match(rule.selector,/details\.guide > summary\.entry:is\(\.entry\), \.tripEntry:is\(\.tripEntry\)/);assert.match(rule.selector,/:global\(\.app \.airport-view \.airport-date-reserved \.date-nav \.date-nav-shortcuts > button\[aria-pressed\]\)/);});assert.equal(rules,4);
});
test('material-only change preserves layout, day selection and safe fallbacks',()=>{
 assert.doesNotMatch(candidate,/(?:padding|margin|height|width|font|display|position|gap|touch-action|pointer-events|animation|transition)\s*:/);
 assert.match(candidate,/prefers-reduced-transparency:reduce/);assert.match(candidate,/prefers-contrast:more/);assert.match(candidate,/forced-colors:active/);
 assert.match(read('app/globals.css'),/button:is\(\.active, \[aria-pressed="true"\]\)::after/);
 assert.match(read('app/live-signals.tsx'),/aria-current=\{selected === value \? "date" : undefined\}/);
 assert.match(read('app/live-signals.tsx'),/onClick=\{\(\) => onChange\(value === today \? null : value\)\}/);
});

test('only airport shortcut wrapper loses its rectangle and gains a small gap',()=>{
 const tree=postcss.parse(css);const selector=':global(.app .airport-view .airport-date-reserved .date-nav > .date-nav-shortcuts)';
 const matches=[];tree.walkRules(rule=>{if(rule.selector===selector)matches.push(rule);});
 assert.equal(matches.length,1);
 assert.deepEqual(matches[0].nodes.map(node=>[node.prop,node.value]),[['gap','6px'],['border','0'],['background','transparent']]);
 assert.match(read('app/live-signals.tsx'),/<div className="date-nav-shortcuts" role="group">/);
});


test('compact geometry applies only to the five controls and allows enlarged labels to grow',()=>{
 const compact=css.split('/* Owner 2026-10-22: compact')[1].split('/* Owner 2026-10-21: exactly')[0];
 assert.match(compact,/height:auto;min-height:64px/);
 assert.match(compact,/min-height:46px;padding:4px 10px;gap:1px/);
 assert.match(compact,/minmax\(0,1fr\) 40px/);
 assert.match(compact,/\.launcher:lang\(en\) details\.guide > summary\.entry,\.launcher:lang\(en\) \.tripEntry \{min-height:72px\}/);
 assert.doesNotMatch(compact,/font-size|overflow|white-space|\.bottom-nav|\.glass-nav/);
});
