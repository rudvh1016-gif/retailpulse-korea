import { expect, test } from '@playwright/test';
import { routeSummary, SUMMARY_FIXTURE } from './summary-fixture';

// English tab labels are upper-case, like MYEONGDONG.
const names = { ko: '이태원', en: 'ITAEWON', zh: '梨泰院', ja: '梨泰院' } as const;

for (const locale of ['ko', 'en', 'zh', 'ja'] as const) {
  test(`Itaewon is a public area like the other three in ${locale}`, async ({ page }) => {
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    const response = await page.goto(`/${locale}/itaewon`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.getByRole('tab', { name: names[locale], exact: true }).first()).toHaveAttribute('aria-selected', 'true');
    expect((await page.goto(`/${locale}/tourism-desk/itaewon`))?.status()).toBe(200);
  });
}
