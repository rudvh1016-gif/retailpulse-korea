import {test, expect} from '@playwright/test';
import {SUMMARY_FIXTURE} from './summary-fixture';

for (const width of [320, 390, 430, 820, 1280]) {
  test(`glance comparison note keeps only the intended separator at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000});
    await page.route('**/api/live/summary*', route => route.fulfill({json: SUMMARY_FIXTURE}));
    await page.route('**/api/live/flights*', route => route.fulfill({json: {mode: 'live-flights', flights: [], truncated: false}}));
    await page.goto('/ko');
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const report = page.locator('.airport-focus-shell .focus-report');
    const comparison = report.locator('.focus-selected-country-changes:not(.focus-return-context)');
    const preparation = report.locator('.focus-preparation-brief > div:first-child');
    await expect(comparison).toBeVisible();
    await expect(comparison.locator('small')).toBeVisible();
    await expect(preparation).toBeVisible();
    // The approved briefing has one separator on each enclosing group,
    // never a doubled rule on the first inner preparation item.
    await expect(comparison).toHaveCSS('border-bottom-width', '0px');
    await expect(preparation).toHaveCSS('border-top-width', '0px');
    await expect(report.locator('.focus-preparation-brief')).toHaveCSS('border-top-width', '1px');
    await expect(report.locator('.focus-selected-country-stack')).toHaveCSS('border-top-width', '1px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
