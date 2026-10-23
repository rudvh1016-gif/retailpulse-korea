import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';
test('Today figures remain proportional to body text without changing heading roles',()=>{
 const css=postcss.parse(readFileSync('app/airport-focus-preview.css','utf8'));
 const rules=[];css.walkRules(rule=>rules.push(rule));
 const values=(selector,prop)=>rules.filter(rule=>rule.selector===selector).flatMap(rule=>rule.nodes.filter(x=>x.prop===prop).map(x=>({value:x.value,media:rule.parent.type==='atrule'?rule.parent.params:null})));
 assert.deepEqual(values('.airport-focus-shell .focus-report .focus-core-metric .focus-metric-total','font-size'),[{value:'24px',media:null},{value:'28px',media:'(min-width:1000px)'}]);
 assert.equal(values('.airport-focus-shell .focus-report :is(.focus-comparison-change,.daily-comparison-change)','font-size').at(-1).value,'16px');
 assert.equal(values('.airport-focus-shell .focus-report .focus-core-metric p','font-size').at(-1).value,'16px');
 assert.equal(values('.airport-focus-shell .focus-report .focus-core-metric .focus-passenger-parts','font-size').at(-1).value,'14px');
 assert.equal(values('.airport-focus-shell .focus-report .focus-number-first-grid','gap')[0].value,'14px');
 assert.ok(!css.toString().includes('clamp(32px,3.2vw,44px)'));
});
