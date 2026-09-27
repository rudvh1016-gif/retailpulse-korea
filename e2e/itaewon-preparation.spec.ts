import { expect, test } from '@playwright/test';
import { routeSummary, SUMMARY_FIXTURE } from './summary-fixture';
for (const locale of ['ko', 'en', 'zh', 'ja']) {
  test(`Itaewon preparation is not a public area in ${locale}`, async ({ page }) => {
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.goto(`/${locale}/myeongdong`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.locator('a[href*="itaewon"], button[data-location="itaewon"]')).toHaveCount(0);
    for (const suffix of ['itaewon', 'tourism-desk/itaewon']) {
      const response = await page.goto(`/${locale}/${suffix}`);
      expect(response?.status()).toBe(404);
    }
  });
}
