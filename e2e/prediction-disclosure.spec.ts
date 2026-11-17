import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
for (const lang of ['ko','en','zh','ja']) for (const suffix of ['', '?area=hongdae&date=2026-08-31#prediction-score']) {
 test(`retired Seoul forecast evidence redirects without querying archived data ${lang} ${suffix}`, async ({page}) => {
  const retiredReads: string[] = [];
  await page.route('**/api/**',route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
  await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
  page.on('request',request => { const url = new URL(request.url()); if (url.pathname === '/api/live/predictions' || url.searchParams.get('view') === 'records') retiredReads.push(request.url()); });
  await page.goto(`/${lang}/forecast${suffix}`);
  await expect(page).toHaveURL(url => url.pathname === `/${lang}`);
  await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
  await expect(page.locator('.prediction-history, .records-chart, .area-tabs')).toHaveCount(0);
  expect(retiredReads).toEqual([]);
 });
}
