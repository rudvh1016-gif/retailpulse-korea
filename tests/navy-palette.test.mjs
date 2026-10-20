import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const luminance=hex=>{const channels=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
test('navy selection is a shared neutral-charcoal token with accessible white labels',()=>{
 const globals=read('app/globals.css'),navigation=read('app/glass-navigation.css');
 assert.match(globals,/--navy: #24272c;/);
 assert.match(globals,/--blue: #46627f;/);
 assert.match(navigation,/\.app nav\.glass-nav a\.active\{color:#fff\}/);
 assert.match(navigation,/background-color:var\(--navy, #24272c\)/);
 assert.match(navigation,/\.active:focus-visible\{outline-color:#fff/);
 assert.ok(1.05/(luminance('24272c')+.05)>7,'white/charcoal exceeds AAA normal-text contrast');
});
test('palette preserves data direction and excludes layout or typography changes',()=>{
 const change=read('app/change-rate.css');
 assert.match(change,/data-direction=down\]\{color:#a12d3f\}/);
 assert.match(change,/data-direction=up\]\{color:#245579\}/);
 const navy=read('app/glass-navigation.css').split('/* Owner refinement, 2026-10-20:')[1];
 assert.ok(navy);
 assert.doesNotMatch(navy,/[;{]\s*(?:font-size|width|height|padding|margin)\s*:|transition:all/);
});
