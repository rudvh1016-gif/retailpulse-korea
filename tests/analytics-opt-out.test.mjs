import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { ANALYTICS_CONSENT_KEY, analyticsOptOutState, GOOGLE_TAG_BLOCK_ARGS, GOOGLE_TAG_HOSTS } from '../scripts/analytics-opt-out.mjs';

// Automated browsers on the live site must not be counted as readers in GA
// (Production Visual Check 38590080344 sent real page_view hits once GA4 started on by default).
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('automated visits store the same "off" choice the site reads', () => {
  assert.match(read('app/analytics-consent.tsx'), new RegExp(`const KEY = '${ANALYTICS_CONSENT_KEY}';`));
  assert.deepEqual(analyticsOptOutState('https://koretaildata.com/ko/airport'), {
    cookies: [],
    origins: [{ origin: 'https://koretaildata.com', localStorage: [{ name: ANALYTICS_CONSENT_KEY, value: 'false' }] }],
  });
});

test('every Google host the site may load from or send to is unresolvable for automated Chromium', () => {
  const csp = read('next.config.ts').match(/"Content-Security-Policy", value: "([^"]+)"/)[1];
  // Where a script may load from and where it may send to; fonts are not the tag.
  const tagDirectives = csp.split(';').map((part) => part.trim()).filter((part) => /^(?:script|connect)-src /.test(part)).join(' ');
  const googleHosts = [...tagDirectives.matchAll(/https:\/\/(\S*google\S*)/g)].map((match) => match[1]);
  assert.ok(googleHosts.length >= 3, tagDirectives);
  const [rules] = GOOGLE_TAG_BLOCK_ARGS;
  const covered = (host) => GOOGLE_TAG_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`) || host === `*.${blocked}`);
  for (const host of googleHosts) assert.ok(covered(host), `${host} is allowed by the CSP but not blocked`);
  for (const host of GOOGLE_TAG_HOSTS) {
    assert.ok(rules.includes(`MAP ${host} ~NOTFOUND`), host);
    assert.ok(rules.includes(`MAP *.${host} ~NOTFOUND`), host);
  }
  assert.match(read('lib/personal-analytics.ts'), /https:\/\/www\.googletagmanager\.com\/gtag\/js/);
});

test('every automated browser that opens the live site visits with analytics off', () => {
  const config = read('playwright.production.config.ts');
  assert.match(config, /storageState: noticeDismissedState\(baseURL, analyticsOptOutState\(baseURL\)\)/);
  assert.match(config, /launchOptions: \{ args: GOOGLE_TAG_BLOCK_ARGS \}/);
  // A spec that builds its own context does not get the config's storage state for certain: it states the opt-out itself.
  for (const file of readdirSync(new URL('../e2e-production', import.meta.url))) {
    const source = read(`e2e-production/${file}`);
    if (/browser\.new(?:Context|Page)\(/.test(source)) assert.match(source, /storageState: (?:noticeDismissedState\([^,]+,\s*)?analyticsOptOutState\(/, file);
  }
  for (const script of ['scripts/bfcache-probe.mjs', 'scripts/capture-typography.mjs', 'scripts/measure-mobile.mjs']) {
    const source = read(script);
    assert.match(source, /storageState: analyticsOptOutState\(/, script);
    assert.match(source, /args: GOOGLE_TAG_BLOCK_ARGS/, script);
  }
});
