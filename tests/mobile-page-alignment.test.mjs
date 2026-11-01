import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
for(const file of ['app/airport-period-insights.css','app/airport-focus-preview.css'])test(`${file}: alignment rules are confined to phones and preserve typography`,()=>{
 const css=readFileSync(file,'utf8'),marker=file.includes('period')?'/* Phones share the briefing text edge;':'/* Match the phone briefing';
 assert.ok(css.includes(marker));
 const tail=css.slice(css.indexOf(marker)).replace(/\/\*[\s\S]*?\*\//g,'');
 const blocks=[...tail.matchAll(/@media\(max-width:(?:700|365)px\)\{/g)].slice(0,2).map(match=>{let depth=1,end=match.index+match[0].length;while(depth&&end<tail.length){if(tail[end]==='{')depth++;if(tail[end]==='}')depth--;end++;}return tail.slice(match.index,end);});
 const added=blocks.join('\n').trim();
 assert.ok(added.startsWith('@media(max-width:700px)'));
 assert.doesNotMatch(added,/font|line-height|letter-spacing|color|background|@media\(min-width/);
 let depth=0;for(const char of added){if(char==='{')depth++;if(char==='}')depth--;assert.ok(depth>=0);}assert.equal(depth,0);
 assert.match(added,/@media\(max-width:365px\)/);
});
test('country phone tabs override the old last-odd grid placement without editing desktop',()=>{
 const css=readFileSync('app/airport-period-insights.css','utf8');
 assert.match(css,/\.airport-insight-tabs\.country-tabs\{display:flex;flex-wrap:nowrap;gap:14px;overflow-x:auto;/);
 assert.match(css,/\.airport-insight-tabs\.country-tabs button\{flex:0 0 auto;min-width:44px;min-height:44px;white-space:nowrap;/);
});
test('airport date alignment is phone-only and changes no typography',()=>{
 const css=readFileSync('app/airport-models.css','utf8'),tail=css.slice(css.indexOf('/* Keep the first phone date label'));
 // The phone alignment patch stays unchanged; the separately approved PC block follows it.
 const start=tail.indexOf('@media(max-width:600px){');assert.ok(start>=0);
 let depth=1,end=start+'@media(max-width:600px){'.length;
 while(depth&&end<tail.length){if(tail[end]==='{')depth++;if(tail[end]==='}')depth--;end++;}
 assert.equal(depth,0);const added=tail.slice(start,end);
 assert.match(added,/@media\(max-width:600px\)/);assert.match(added,/button\[aria-pressed\]:first-child\{padding-inline-start:0\}/);
 assert.doesNotMatch(added,/font|line-height|letter-spacing|color|background|@media\(min-width/);
});
