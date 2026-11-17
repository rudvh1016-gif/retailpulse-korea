import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';

// Seoul source/model contracts remain in isolated unit tests. Retired product routes
// must not resurrect cached source panels or issue Seoul-only browser reads.
for (const lang of ['ko', 'en', 'zh', 'ja']) for (const path of ["consumption?area=hongdae&month=2026-08","myeongdong"]) {
 test(`commercial-visuals: retired ${path} reaches airport home in ${lang}`, async ({ page }) => {
  const seoulReads: string[] = [];
  await page.route('**/api/**', route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  page.on('request', request => { if (/\/api\/live\/(commercial-months|events|seoul|population)/.test(request.url())) seoulReads.push(request.url()); });
  await page.goto(`/${lang}/${path}`);
  await expect(page).toHaveURL(url => url.pathname === `/${lang}` || url.pathname === `/${lang}/`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
  await expect(page.locator('.area-tabs, .commercial-miniature-card, .seoul-weather-panel, .population-outlook, .tourism-desk')).toHaveCount(0);
  await expect(page.locator('a[href*="/myeongdong"], a[href*="/hongdae"], a[href*="/tourism-desk"], a[href*="/consumption"]')).toHaveCount(0);
  expect(seoulReads).toEqual([]);
 });
}
