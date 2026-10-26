import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('only the passenger zone estimate render is removed; real maps, country counts and flight browser remain',()=>{
 const source=read('app/airport-departure-map.tsx');assert.doesNotMatch(source,/<AirportTopReference|import.*AirportTopReference/);
 for(const token of ['<AirportConceptModel','<AirportZoneCountries','<AirportFlightBrowser','const topReference = routePassengers'])assert.ok(source.includes(token),token);
 assert.match(read('lib/airport-top-reference.ts'),/export function topReferences/);
});
test('decorative dots are scoped to airport semantic headings, never controls, data or navigation',()=>{
 const css=read('app/heading-hierarchy.css');const patch=css.slice(css.indexOf('/* Requested small dots')).replace(/\/\*[^]*?\*\//g,'');
 assert.match(patch,/airport-focus-shell :is\(h1,h2\)\[data-heading\]/);assert.match(patch,/content:'·'/);assert.equal((patch.match(/\.heading-marker::before/g)||[]).length,3);assert.doesNotMatch(patch,/summary|button|nav|strong|background|border/);
 assert.match(read('app/airport-glance-preview.tsx'),/<h3 className="airport-flow-item-title"><span className="heading-marker" aria-hidden="true"\/>/);
});
test('desktop return group spans below both columns while mobile retains the existing source order',()=>{
 const source=read('app/airport-focus-preview.tsx'),css=read('app/airport-focus-preview.css');
 assert.match(source,/<SelectedCountryChanges[^]*?<TodayReturnContext[^]*?<PreparationBrief/);
 assert.match(source,/focus-return-events/);assert.match(css,/@media\(min-width:1000px\)\{[^]*?focus-return-context\{grid-column:1\/-1;grid-row:6/);
 assert.match(css,/focus-return-events\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/:only-child\{grid-column:1\/-1\}/);
});

test('desktop return peers override the older adjacent-card margin and the home marker never orphans above a wrapped title',()=>{
 const focus=read('app/airport-focus-preview.css'),heading=read('app/heading-hierarchy.css');
 assert.match(focus,/\.focus-report \.focus-return-context \.focus-return-events>\.focus-preparation-event\{margin-top:0\}/);
 assert.match(heading,/display:inline-block!important;flex:none;width:\.35em/);
 assert.match(heading,/\.glance-heading h1\[data-heading="page"\]\{display:flex;flex-direction:row;align-items:baseline\}/);
});
