import test from 'node:test';
import assert from 'node:assert/strict';
import {airportAudience, airportAudienceCopy, airportAudienceUrl} from '../lib/airport-audience';

test('passenger entry and existing store links resolve without assigning a user role', () => {
  assert.equal(airportAudience(''), 'passenger');
  assert.equal(airportAudience('?audience=unsupported'), 'passenger');
  assert.equal(airportAudience('?section=mystore'), 'staff');
  assert.equal(airportAudience('?section=mystore&audience=passenger'), 'passenger');
  assert.equal(airportAudience('?audience=staff'), 'staff');
});

test('switching view preserves terminal/date and leaves the hidden section anchor', () => {
  const before = new URL('https://koretaildata.com/ja/airport?terminal=T2&date=2026-08-30#airport-industry-guide');
  const after = new URL(airportAudienceUrl(before, 'staff'), before);
  assert.equal(after.pathname, before.pathname);
  assert.equal(after.searchParams.get('terminal'), 'T2');
  assert.equal(after.searchParams.get('date'), '2026-08-30');
  assert.equal(after.searchParams.get('audience'), 'staff');
  assert.equal(after.hash, '');
  assert.equal(before.hash, '#airport-industry-guide');
});

test('four languages and English fallback expose both screen choices', () => {
  for (const lang of ['ko', 'en', 'zh', 'ja']) {
    const c = airportAudienceCopy(lang);
    assert.ok(c.passenger && c.staff && c.intro && c.flightNote);
  }
  assert.deepEqual(airportAudienceCopy('fr'), airportAudienceCopy('en'));
});
