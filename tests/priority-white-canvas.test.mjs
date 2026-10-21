import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('owner-requested urgent canvas restore is white without changing chart data styles',()=>{
 const css=readFileSync(new URL('../app/airport-focus-preview.css',import.meta.url),'utf8');
 const rule=css.match(/\.airport-focus-shell\{[^}]*\}/g)?.filter(rule=>rule.includes('background:')).at(-1);
 assert.ok(rule);assert.match(rule,/background:#fff(?:;|\})/);assert.doesNotMatch(rule,/gradient|#f0f3f6|#fafbfd/);
});
