import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
test('More heading only removes empty minimum height and reduces bottom padding',()=>{
 const rules=[];postcss.parse(css).walkRules('.more-view > .view-intro',rule=>rules.push(rule));
 assert.equal(rules.length,1);
 assert.deepEqual(rules[0].nodes.map(({prop,value})=>[prop,value]),[['min-height','0'],['padding-bottom','16px']]);
 assert.equal(rules[0].parent.type,'root');
});
test('shared intro, font, More links and keyboard targets keep their existing contracts',()=>{
 assert.match(css,/\.view-intro \{ min-height: 190px; padding: 34px 0 28px; \}/);
 assert.match(css,/\.more-section-links :is\(a,button.update-notice-trigger\)\{[^}]*min-height:48px/);
 assert.match(css,/\.more-section-links :is\(a,button.update-notice-trigger\):focus-visible\{outline:2px/);
 const source=readFileSync(new URL('../app/retailpulse-app.tsx',import.meta.url),'utf8');
 assert.match(source,/<section className="view-section more-view">\s*<div className="view-intro">/);
});
