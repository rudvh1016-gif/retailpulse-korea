import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync('app/airport-focus-preview.css', 'utf8');
const startMarker = '/* Monthly-country jump:';
const endMarker = '/* Upcoming dates:';
assert.ok(css.includes(startMarker), 'monthly-country jump section must exist');
assert.ok(css.includes(endMarker), 'next upcoming-dates section must exist');
assert.ok(css.indexOf(endMarker) > css.indexOf(startMarker), 'section boundaries must stay ordered');
const patch = css.split(startMarker)[1].split(endMarker)[0];

test('country jump owns its padded height and wraps inside mobile content without clipping', () => {
  const rule = patch.match(/\.airport-focus-shell \.focus-country-jump\{([^}]+)\}/)[1];
  for (const declaration of ['display:flex', 'box-sizing:border-box', 'width:fit-content', 'max-width:100%', 'min-width:0', 'min-height:44px', 'white-space:normal', 'overflow-wrap:anywhere', 'touch-action:manipulation']) {
    assert.ok(rule.includes(declaration), declaration);
  }
  assert.doesNotMatch(patch, /overflow:(hidden|clip)|clip-path|font(?:-family|-size|-weight)?:/);
  assert.match(patch, /\.focus-country-jump \+ \.airport-top-reference\{border-top:0\}/);
  assert.match(css, /:is\(a,button,input\):focus-visible\{outline:2px solid[^}]+outline-offset:4px/);
});

test('only the country jump receives neutral glass with accessible opaque fallbacks', () => {
  assert.match(patch, /background:rgb\(255 255 255 \/ 40%\)/);
  assert.match(patch, /-webkit-backdrop-filter:blur\(14px\);backdrop-filter:blur\(14px\)/);
  assert.match(patch, /prefers-reduced-transparency:reduce/);
  assert.match(patch, /prefers-contrast:more/);
  assert.match(patch, /background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none/);
  assert.match(patch, /forced-colors:active/);
  assert.match(patch, /background:Canvas;border-color:CanvasText;box-shadow:none/);
  for (const selector of patch.matchAll(/([^{}]+)\{/g)) {
    if (!selector[1].trim().startsWith('@media')) assert.ok(selector[1].includes('.focus-country-jump'));
  }
});

test('operating link keeps date-aware native navigation and preview keeps its action', () => {
  const operating = readFileSync('app/airport-focus-production.tsx', 'utf8');
  const preview = readFileSync('app/airport-focus-preview.tsx', 'utf8');
  assert.ok(operating.includes('airport-countries?mode=passengers'));
  assert.match(preview, /<button className="focus-country-jump" onClick=\{\(\)=>select\('countries'\)\}/);
});
