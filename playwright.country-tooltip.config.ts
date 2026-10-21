import {defineConfig,devices} from '@playwright/test';
import base from './playwright.config';

// Bounded route and search-identity regression checks. The normal full suite is unchanged.
export default defineConfig({
 ...base,
 testMatch:['**/airport-country-route-tooltip.spec.ts','**/search-identity.spec.ts','**/site-usage-disclosure.spec.ts'],
 workers:2,
 outputDir:'country-tooltip-results',
 projects:[
  {name:'country-chromium',use:{...devices['Desktop Chrome']}},
  // Linux WebKit is an engine check, not an actual iPhone/Safari device test.
  // Do not pass the shared Chromium-only resolver arguments to WebKit.
  {name:'country-webkit',use:{...devices['Desktop Safari'],launchOptions:{args:[]}}},
 ],
});
