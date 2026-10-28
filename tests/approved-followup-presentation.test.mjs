import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('only the passenger zone estimate render is removed; real maps, country counts and flight browser remain',()=>{
 const source=read('app/airport-departure-map.tsx');assert.doesNotMatch(source,/<AirportTopReference|import.*AirportTopReference/);
 for(const token of ['<AirportConceptModel','<AirportZoneCountries','<AirportFlightBrowser','const topReference = routePassengers'])assert.ok(source.includes(token),token);
 assert.match(read('lib/airport-top-reference.ts'),/export function topReferences/);
});
test('decorative heading dots and their dedicated space are removed while body bullets stay',()=>{
 const css=read('app/heading-hierarchy.css');
 assert.match(css,/\[data-heading\] > \.heading-marker \{display:none!important\}/);assert.doesNotMatch(css,/content:'·'|width:\.35em|margin-inline-end:\.4em/);
 assert.match(read('app/airport-staff-briefing.css'),/\.airport-flow-item-title>\.heading-marker\{display:none\}/);
 const body=read('app/globals.css');for(const selector of ['install-benefits','tourism-limits'])assert.ok(new RegExp(selector+' li::before \\{ content: "·"').test(body));
 assert.match(read('app/airport-glance-preview.tsx'),/<h3 className="airport-flow-item-title"><span className="heading-marker" aria-hidden="true"\/>/);
});
test('desktop return group spans below both columns while mobile retains the existing source order',()=>{
 const source=read('app/airport-focus-preview.tsx'),css=read('app/airport-focus-preview.css');
 assert.match(source,/<SelectedCountryChanges[^]*?<TodayReturnContext[^]*?<PreparationBrief/);
 assert.match(source,/focus-return-events/);assert.match(css,/@media\(min-width:1000px\)\{[^]*?focus-return-context\{grid-column:1\/-1;grid-row:6/);
 assert.match(css,/focus-return-events\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);assert.match(css,/:only-child\{grid-column:1\/-1\}/);
});

test('desktop return peers retain their spacing and the home title has no dot-only layout override',()=>{
 const focus=read('app/airport-focus-preview.css'),heading=read('app/heading-hierarchy.css');
 assert.match(focus,/\.focus-report \.focus-return-context \.focus-return-events>\.focus-preparation-event\{margin-top:0\}/);
 assert.doesNotMatch(heading,/width:\.35em|margin-inline-end:\.4em/);
 assert.doesNotMatch(heading,/\.glance-heading h1\[data-heading="page"\]\{display:flex;flex-direction:row;align-items:baseline\}/);
});
