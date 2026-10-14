/**
 * Automated browsers that open the live site are not readers.
 *
 * Usage analytics starts on by default since 2026-10-14 outside EU/EEA, UK and
 * Swiss time zones (docs/approvals/ga4-default-on-20261014.json). The first
 * Production Visual Check after that deploy (run 38590080344) showed its
 * headless Chromium, in a GitHub runner's UTC time zone, sending real
 * page_view hits to the owner's GA4 property, so every check would have added
 * visitors who do not exist.
 *
 * So every automated visit to the live site goes in as a reader who switched
 * usage analytics off on 더보기: the site's own stored choice, which keeps the
 * Google tag from being requested at all and needs no request interception
 * (the back/forward cache probe must not be disturbed by one). On Chromium the
 * Google tag hosts are also made unresolvable, so even a visit that loses the
 * stored choice cannot deliver a hit.
 *
 * scripts/ga4-browser-probe.ts is the one exception: it checks the default
 * itself and aborts every collection request unless the owner asks for one
 * marked test visit.
 */

/** The key app/analytics-consent.tsx reads; tests/analytics-opt-out.test.mjs keeps the two equal. */
export const ANALYTICS_CONSENT_KEY = "koretail-analytics-consent-v1";

/** Playwright storageState for `origin` with usage analytics switched off. */
export function analyticsOptOutState(origin) {
  return {
    cookies: [],
    origins: [{ origin: new URL(origin).origin, localStorage: [{ name: ANALYTICS_CONSENT_KEY, value: "false" }] }],
  };
}

/** Hosts the Google tag loads from and sends to. */
export const GOOGLE_TAG_HOSTS = ["googletagmanager.com", "google-analytics.com", "analytics.google.com"];

/** Chromium launch arguments that make every Google tag host unresolvable. */
export const GOOGLE_TAG_BLOCK_ARGS = [
  `--host-resolver-rules=${GOOGLE_TAG_HOSTS.flatMap((host) => [`MAP ${host} ~NOTFOUND`, `MAP *.${host} ~NOTFOUND`]).join(", ")}`,
];
