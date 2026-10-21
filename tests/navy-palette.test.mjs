import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const navigation=read('app/glass-navigation.css');
const refinement=navigation.split('/* Owner refinement, 2026-10-21:')[1];
const luminance=channels=>channels.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const over=(front,alpha,back)=>front.map((v,i)=>v*alpha+back[i]*(1-alpha));
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
test('owner reference replaces the opaque charcoal selection with translucent grey and blue',()=>{
 const globals=read('app/globals.css');
 assert.match(globals,/--navy: #24272c;/);assert.match(globals,/--blue: #46627f;/);
 assert.ok(refinement);
 assert.match(refinement,/background-color:rgb\(187 187 188 \/ 36%\)/);
 assert.match(refinement,/\.app nav\.glass-nav a\.active\{color:#003060\}/);
 assert.match(refinement,/background:rgb\(255 255 255 \/ 60%\)/);
 assert.doesNotMatch(refinement,/background-color:var\(--navy|color:#fff/);
});
test('glass labels meet normal-text contrast even over a completely black backdrop',()=>{
 // Read the live CSS values, so changing opacity/colour cannot leave a stale passing calculation.
 const alpha=Number(refinement.match(/background:rgb\(255 255 255 \/ (\d+)%\)/)[1])/100;
 const pill=refinement.match(/background-color:rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/);
 const active=refinement.match(/a\.active\{color:#([\da-f]{6})/)[1].match(/../g).map(v=>parseInt(v,16));
 for(const backdrop of [[0,0,0],[255,255,255]]){
  const bar=over([255,255,255],alpha,backdrop);
  const selected=over(pill.slice(1,4).map(Number),Number(pill[4])/100,bar);
  assert.ok(contrast([17,17,17],bar)>=4.5,'idle labels');
  assert.ok(contrast(active,selected)>=4.5,'selected labels');
  assert.ok(contrast(active,bar)>=4.5,'selected label while the pill moves or is dragged away');
 }
});
test('glass is scoped, static, Safari-prefixed and has opaque accessibility fallbacks',()=>{
 assert.match(refinement,/color-scheme:light/);
 assert.match(refinement,/-webkit-backdrop-filter:blur\(24px\) saturate\(110%\);backdrop-filter:blur\(24px\) saturate\(110%\)/);
 assert.match(refinement,/prefers-reduced-transparency:reduce/);assert.match(refinement,/prefers-contrast:more/);assert.match(refinement,/forced-colors:active/);
 assert.match(refinement,/background:rgb\(244 244 246\);-webkit-backdrop-filter:none;backdrop-filter:none/);
 assert.doesNotMatch(refinement,/[;{]\s*(?:font-size|width|height|padding|margin|animation|transition)\s*:/);
 assert.doesNotMatch(navigation,/transition:\s*all/);
});
test('palette preserves data direction and all navigation geometry',()=>{
 const change=read('app/change-rate.css');
 assert.match(change,/data-direction=down\]\{color:#a12d3f\}/);assert.match(change,/data-direction=up\]\{color:#245579\}/);
 assert.match(navigation,/height:54px/);assert.match(navigation,/env\(safe-area-inset-bottom\)/);
 assert.match(navigation,/@media\(prefers-reduced-motion:reduce\)/);
});
