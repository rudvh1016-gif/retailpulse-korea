import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
test('airport page ground is white without a gray gradient under arrivals, flights, facilities or history',()=>{
 const css=read('app/airport-focus-preview.css');
 assert.match(css,/\.airport-focus-shell\{background:#fff\}/);
 assert.doesNotMatch(css,/\.airport-focus-shell\{background:(?:linear|radial)-gradient/);
 // Chart colors and status colors are not flattened by a blanket surface override.
 assert.doesNotMatch(read('app/globals.css'),/\.airport-view\s+\*\s*\{[^}]*background/);
});
test('terminal tabs stay transparent and selected airport days lose the sky fill',()=>{
 const css=read('app/globals.css');
 assert.match(css,/\.app \.airport-view \.terminal-selector button:is\(\.active,\[aria-selected="true"\]\) \{ background:transparent; \}/);
 assert.match(css,/\.app \.airport-view \.date-nav \.date-nav-shortcuts button:is\(\.active,\[aria-pressed="true"\]\)\s*\{\s*background:rgb\(255 255 255 \/ 72%\)/);
});
test('large calendar is removed from the airport screen without removing historical access or day shortcuts',()=>{
 const airport=read('app/airport-view.tsx'),signals=read('app/live-signals.tsx');
 assert.match(airport,/<DateNavigator[^>]*compactDatePicker/);assert.doesNotMatch(airport,/<DateNavigator[^>]*modernCalendar/);
 assert.match(signals,/compactDatePicker \? datePicker : null/);assert.match(signals,/children\}\{showStored && <StoredAirportMonth/);
 assert.match(signals,/\[shiftDay\(today, -1\), dateNavText.yesterday/);assert.match(signals,/\[today, dateNavText.today/);assert.match(signals,/\[shiftDay\(today, 1\), dateNavText.tomorrow/);
 assert.match(airport,/section === "history"/);assert.match(airport,/<MonthRangePicker/);
 assert.doesNotMatch(read('app/airport-models.css'),/airport-date-reserved \{ min-height: 214px/);
});
test('only the two requested guide action cards gain neutral translucent surfaces',()=>{
 const css=read('app/departure-guide-entry.module.css');
 assert.match(css,/details\.guide > summary\.entry,\.tripEntry \{[^}]*background:rgb\(255 255 255 \/ 72%\)/);
 assert.doesNotMatch(css,/(?:backdrop-filter|animation):/);
});
