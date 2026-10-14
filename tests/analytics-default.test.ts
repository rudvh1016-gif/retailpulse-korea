import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { analyticsOnByDefault, analyticsOptInTimeZone } from '../lib/analytics-default';

// Owner decision 2026-10-14 (docs/approvals/ga4-default-on-20261014.json): on by default, can be turned off.
test('analytics starts on outside the consent-first regions', () => {
  for (const timeZone of ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Taipei', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC', 'Etc/UTC']) {
    assert.equal(analyticsOnByDefault({ timeZone }), true, timeZone);
  }
});

test('EU/EEA, UK and Swiss time zones start off until the visitor turns it on', () => {
  for (const timeZone of ['Europe/Berlin', 'Europe/Paris', 'Europe/London', 'Europe/Dublin', 'Europe/Zurich', 'Europe/Oslo', 'Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira', 'Atlantic/Canary', 'Atlantic/Reykjavik', 'Arctic/Longyearbyen', 'Asia/Nicosia', 'Asia/Famagusta', 'Africa/Ceuta', 'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'Indian/Reunion', 'Indian/Mayotte']) {
    assert.equal(analyticsOptInTimeZone(timeZone), true, timeZone);
    assert.equal(analyticsOnByDefault({ timeZone }), false, timeZone);
  }
  // Only whole names count: a zone merely containing "Europe" elsewhere is not a match.
  assert.equal(analyticsOptInTimeZone('America/Europe'), false);
});

test('no readable time zone, Global Privacy Control or Do Not Track start off', () => {
  for (const timeZone of [null, undefined, '']) assert.equal(analyticsOnByDefault({ timeZone }), false, String(timeZone));
  assert.equal(analyticsOnByDefault({ timeZone: 'Asia/Seoul', globalPrivacyControl: true }), false);
  assert.equal(analyticsOnByDefault({ timeZone: 'Asia/Seoul', doNotTrack: '1' }), false);
  assert.equal(analyticsOnByDefault({ timeZone: 'Asia/Seoul', doNotTrack: 'yes' }), false);
  assert.equal(analyticsOnByDefault({ timeZone: 'Asia/Seoul', globalPrivacyControl: false, doNotTrack: '0' }), true);
  assert.equal(analyticsOnByDefault({ timeZone: 'Asia/Seoul', doNotTrack: 'unspecified' }), true);
});

test('a choice on 더보기 and the older personal-briefing answer still win over the default', () => {
  const source = readFileSync(new URL('../app/analytics-consent.tsx', import.meta.url), 'utf8');
  const hook = source.slice(source.indexOf('export function useAnalyticsConsent('), source.indexOf('function save('));
  assert.match(hook, /typeof preferences\?\.analytics === 'boolean' \? preferences\.analytics : browserAnalyticsDefault\(\)/);
  assert.match(hook, /enabled: raw === 'true' \|\| \(raw === null && fallback\)/);
  // The tag itself is still loaded only through setAnalyticsConsent(true) (lib/personal-analytics.ts).
  assert.doesNotMatch(source, /googletagmanager/);
});
