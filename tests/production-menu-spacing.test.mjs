import test from 'node:test';
import assert from 'node:assert/strict';
import { airportDateGapPx } from '../scripts/airport-control-spacing.mjs';

for (const [width, expected] of [[320,'16px'],[360,'16.2px'],[390,'17.55px'],[430,'19.35px'],[600,'20px'],[1440,'6px']]) {
  test(`production date gap has exact CSS serialization at ${width}px`, () => {
    assert.equal(airportDateGapPx(width), expected);
  });
}
test('phone clamp bounds and desktop breakpoint remain exact', () => {
  assert.equal(airportDateGapPx(280), '16px');
  assert.equal(airportDateGapPx(599), '20px');
  assert.equal(airportDateGapPx(601), '6px');
});
