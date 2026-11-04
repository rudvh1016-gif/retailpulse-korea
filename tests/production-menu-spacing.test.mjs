import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { airportDateGapPx } from '../scripts/airport-control-spacing.mjs';

for (const [width, expected] of [[320,'0px'],[360,'0px'],[390,'0px'],[430,'0px'],[600,'0px'],[1440,'0px']]) {
  test(`production date gap has exact CSS serialization at ${width}px`, () => {
    assert.equal(airportDateGapPx(width), expected);
  });
}
test('narrow phones and desktop breakpoint retain the continuous rail', () => {
  assert.equal(airportDateGapPx(280), '0px');
  assert.equal(airportDateGapPx(599), '0px');
  assert.equal(airportDateGapPx(601), '0px');
});

test('production spacing expectation matches the shipped grid rule', () => {
  const css=readFileSync('app/airport-status-controls.css','utf8');
  const rule=css.split(':root body .app .airport-view .airport-date-reserved .date-nav > .date-nav-shortcuts {')[1]?.split('}')[0];
  assert.ok(rule);
  assert.match(rule,/display:grid/);
  assert.match(rule,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(rule,/gap:0;/);
});
