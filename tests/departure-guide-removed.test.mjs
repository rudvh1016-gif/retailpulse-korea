import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('departure guide is removed, not hidden behind a disclosure',()=>{
 assert.equal(existsSync('app/airport-departure-preparation.tsx'),false);
 const airport=read('app/airport-view.tsx');
 assert.doesNotMatch(airport,/AirportDeparturePreparation|departure-preparation/);
 assert.match(airport,/<AirportNewsEntry lang=\{lang\}/);
 // Keep hash reveal on the page: forecast, checkpoints and monthly links still work.
 assert.match(airport,/useAirportHashReveal\(\)/);
});
test('news entry remains localized, keyboard-native and independent of the removed guide',()=>{
 const entry=read('app/airport-news-entry.tsx');
 assert.match(entry,/href=\{`\/\$\{lang\}\/airport-news`\}/);
 assert.match(entry,/airportNewsCopy\[lang\]\.entry/);
 assert.match(entry,/data-testid="airport-customs-news-entry"/);
 assert.doesNotMatch(entry,/<details|departure-preparation|departure-guide-entry-copy/);
 const css=read('app/departure-guide-entry.module.css');
 assert.match(css,/\.launcher \{[^}]*grid-template-columns:minmax\(0,1fr\);[^}]*max-width:420px/);
 assert.match(css,/\.tripEntry \{ grid-column:1;/);
 assert.match(css,/width:calc\(\(100% - 16px\)\/2\); max-width:420px/);
 // Original two-column launcher: min(parent width, 856) minus its 16px gap, divided by two.
 for(const width of [280,320,358,390,430,820,856,1280])assert.equal(Math.min((width-16)/2,420),(Math.min(width,856)-16)/2);
});
test('overview, SEO and navigation do not link to the retired guide',()=>{
 for(const file of ['app/airport-glance-preview.tsx','app/use-airport-hash-reveal.ts','app/sitemap.ts','lib/seo.ts'].filter(existsSync))
  assert.doesNotMatch(read(file),/airport-departure-preparation|departure-guide-entry|readyNote:/,file);
});
