import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { comparisonText, comparisonTextParts, comparisonValue } from '../lib/period-comparison.ts';

test('structured comparison preserves every locale, rate and parenthesized timestamp', () => {
  for (const lang of ['ko', 'en', 'zh', 'ja']) for (const days of [7, 28]) {
    for (const baselineAt of ['2026-10-14', '2026-10-14T14:00:00+09:00']) {
      for (const [minPercent, maxPercent] of [[-0.6, -0.6], [0, 0], [0.01, 0.01], [-2, 3]]) {
        const change = { baselineAt, minPercent, maxPercent };
        const parts = comparisonTextParts(change, lang, days);
        assert.equal(comparisonText(change, lang, days), `${parts.summary} ${parts.baseline}`);
        assert.ok(parts.summary.endsWith(comparisonValue(change)));
        assert.equal(parts.baseline, `(${baselineAt.replace('T', ' ').replace('+09:00', ' KST')})`);
        assert.doesNotMatch(parts.summary, /[()]/);
      }
    }
  }
});

test('only the flight heading shrinks one pixel; complete baseline owns a nonbreaking line', () => {
  const css = readFileSync('app/facility-guide.css', 'utf8');
  assert.match(css, /\.flight-summary-heading\{display:block;font-size:calc\(1em - 1px\)\}/);
  assert.match(css, /\.flight-comparison-baseline\{display:block;white-space:nowrap\}/);
  const source = readFileSync('app/airport-live-signals.tsx', 'utf8');
  assert.match(source, /<RateText text=\{flightComparison.summary\} lang=\{lang\}\/><span className="flight-comparison-baseline">\{flightComparison.baseline\}<\/span>/);
});
