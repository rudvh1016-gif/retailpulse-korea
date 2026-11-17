import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
// Source/model history remains covered by unit fixtures; the public Seoul entry is retired.
const retiredPaths = ['myeongdong', 'hongdae', 'seongsu'];
for (const locale of ['ko', 'en', 'zh', 'ja'] as const) {
  test(`retired Seoul entry preserves device history and opens airport home ${locale}`, async ({ page }) => {
    const saved = JSON.stringify({ lang: locale, area: 'hongdae', terminal: 'T2', industry: 'food' });
    await page.addInitScript(value => localStorage.setItem('retailpulse-preferences', value), saved);
    const requests: string[] = [];
    await page.route('**/api/live/summary*', async route => {
      requests.push(route.request().url());
      await routeSummary(SUMMARY_FIXTURE)(route);
    });
    for (const path of retiredPaths) {
      await page.goto(`/${locale}/${path}`);
      await expect(page).toHaveURL(new RegExp(`/${locale}$`));
      await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
      await expect(page.locator('.area-current-brief, .monthly-records')).toHaveCount(0);
    }
    expect(requests.some(url => new URL(url).searchParams.get('view') === 'records')).toBe(false);
    // Historical preference must not restore an excluded public area.
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('retailpulse-preferences') ?? '{}')).area).toBe('hongdae');
  });
}
