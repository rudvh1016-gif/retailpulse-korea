import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePageviewsDisplay, pageviewsKstDay, untilPageviewsMidnight } from '../lib/pageviews-display';
const valid = { available: true, today: 12, total: 3456, totalComplete: true, day: '2026-10-23', startedAt: '2026-10-22T15:00:00.000Z' };
test('real integer counts, including genuine zero today, remain visible', () => {
  assert.deepEqual(parsePageviewsDisplay(valid), valid);
  assert.equal(parsePageviewsDisplay({ ...valid, today: 0 })?.today, 0);
});
test('unavailable and malformed values never become a synthetic zero', () => {
  for (const value of [null, undefined, {}, { available: false }, { ...valid, today: -1 }, { ...valid, today: 1.5 }, { ...valid, today: '12' }, { ...valid, total: 0 }, { ...valid, total: NaN }, { ...valid, total: Infinity }, { ...valid, total: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, startedAt: '' }, { ...valid, day: 'yesterday' }, { ...valid, day: '2026-02-31' }, { ...valid, startedAt: '1' }]) assert.equal(parsePageviewsDisplay(value), null);
});
test('counter subscribes to collected values without another request or animation', () => {
  const source = readFileSync('app/site-view-counter.tsx', 'utf8');
  assert.match(source, /subscribePageviews/);
  assert.match(source, /getPageviewsSnapshot/);
  assert.match(source, /if \(!counts \|\| counts.day !== day\) return null/);
  assert.doesNotMatch(source, /fetch\(|setInterval|CountUp|gsap/);
  assert.match(source, /aria-expanded=\{open\}/);
  assert.match(source, /aria-controls=\{id\}/);
  assert.match(source, /event.key === 'Escape'/);
  assert.match(source, /timeZone: 'Asia\/Seoul'/);
  for (const lang of ['ko', 'en', 'zh', 'ja']) assert.match(source, new RegExp(`  ${lang}: \\{ unavailable:`));
});
test('320px layout reserves separate rows and a 44px counter target without deleting menus', () => {
  const css = readFileSync('app/site-view-counter.css', 'utf8');
  assert.match(css, /min-height: 44px/);
  assert.match(css, /min-width: 44px/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /\.header-meta \{ grid-column: 1 \/ -1; grid-row: 2/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /animation:|transition:/);
  assert.match(readFileSync('app/retailpulse-app.tsx', 'utf8'), /<SiteViewCounter lang=\{lang\} \/>/);
});

test('KST midnight invalidates yesterday without inventing a zero', () => {
  const before = Date.parse('2026-10-23T14:59:59.999Z');
  const after = before + 1;
  assert.equal(pageviewsKstDay(before), '2026-10-23');
  assert.equal(pageviewsKstDay(after), '2026-10-24');
  assert.equal(untilPageviewsMidnight(before), 1);
  assert.equal(untilPageviewsMidnight(after), 86400000);
  const source = readFileSync('app/site-view-counter.tsx', 'utf8');
  assert.match(source, /counts.day !== day/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /pageshow/);
});

test('recovered today remains visible without inventing a lifetime total after a gap', () => {
  const recovered = { ...valid, today: 8, total: null, totalComplete: false };
  assert.deepEqual(parsePageviewsDisplay(recovered), recovered);
  assert.equal(parsePageviewsDisplay({ ...recovered, today: 0 })?.today, 0);
  for (const value of [{ ...valid, totalComplete: undefined }, { ...valid, totalComplete: false }, { ...recovered, totalComplete: true }, { ...recovered, total: 8 }, { ...recovered, total: 0 }]) assert.equal(parsePageviewsDisplay(value), null);
  const source = readFileSync('app/site-view-counter.tsx', 'utf8');
  assert.match(source, /counts.total === null \? '—'/);
  assert.match(source, /site-view-counter-gap/);
  assert.match(source, /dateTime=\{counts.startedAt\}/);
});
