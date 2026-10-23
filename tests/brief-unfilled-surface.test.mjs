import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import postcss from 'postcss';

test('approved unfilled report has no obsolete glass effect in any cascade or prefix',()=>{
 const css=postcss.parse(readFileSync('app/airport-focus-preview.css','utf8'));
 const effects=[];
 css.walkRules(rule=>{
  // Report itself, not its independently styled links or children.
  if(!rule.selectors.some(selector=>selector.trim().endsWith('.focus-report')))return;
  rule.walkDecls(decl=>{
   if(decl.prop==='background'||decl.prop==='background-image')assert.doesNotMatch(decl.value,/gradient\(/,'no obsolete report gradient');
   if(['backdrop-filter','-webkit-backdrop-filter','box-shadow'].includes(decl.prop)){
    effects.push(decl.prop);
    assert.equal(decl.value,'none',`${rule.selector}: ${decl.prop} must not retain a glass effect`);
   }
  });
 });
 for(const property of ['backdrop-filter','-webkit-backdrop-filter','box-shadow'])assert.ok(effects.includes(property),property);
 const countryJump=[];
 css.walkRules(rule=>{if(rule.selector==='.airport-focus-shell .focus-country-jump')rule.walkDecls('backdrop-filter',decl=>countryJump.push(decl.value));});
 assert.ok(countryJump.includes('blur(14px)'),'the independently approved country link keeps its glass treatment');
});

