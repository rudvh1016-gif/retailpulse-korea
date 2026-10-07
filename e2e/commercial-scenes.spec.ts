import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { tofuCharacters } from './font-glyphs';

for (const [lang, width] of [['ko', 320], ['ko', 390], ['ko', 430], ['ko', 1280], ['en', 390], ['zh', 390], ['ja', 390]] as const) {
  test(`payment sculptures preserve numeric bands and accessible explanations ${lang}/${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
    await page.goto(`/${lang}/myeongdong`);
    const card = page.locator('.commercial-signal-card');
    await expect(card.locator('[data-metric-kind="amount"] dd')).toHaveText('₩1,000,000 ~ ₩1,100,000');
    await expect(card.locator('[data-metric-kind="count"] dd')).toContainText('12,345');
    await expect(card.locator('[data-metric-kind="average"] dd')).toHaveText('₩81 ~ ₩90');
    await expect(card.locator('.commercial-basis')).toBeVisible();
    await expect(card.locator('.commercial-times').first()).toContainText('14:05');
    await expect(card.locator('.commercial-times').first()).toContainText('14:07');
    for (const image of await card.locator('.commercial-metric-scene').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(el => (el as HTMLImageElement).decode());
      await expect(image).toHaveAttribute('alt', '');
      await expect(image).toHaveAttribute('loading', 'lazy');
    }
    const details = card.locator('details');
    await expect(details).not.toHaveAttribute('open', '');
    await details.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('.commercial-attribution').first()).toBeVisible();
    expect((await details.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open', '');
    const positions = await card.locator('.commercial-metrics > div').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().top));
    if (width === 1280) expect(new Set(positions).size).toBe(1);
    else expect(positions[0]).toBeLessThan(positions[1]);
    expect(await card.locator('dt').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await tofuCharacters(card)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('sample privacy and missing history do not turn into zero payments or a zero comparison', async ({ page }) => {
  const summary = structuredClone(SUMMARY_FIXTURE);
  Object.assign(summary.areas.myeongdong.commercial!, { paymentAmountMin: null, paymentAmountMax: null, paymentCount: null, qualityStatus: 'PARTIAL', freshness: 'STALE' });
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.goto('/ko/myeongdong');
  const card = page.locator('.commercial-signal-card');
  await expect(card.locator('[data-metric-kind="amount"] dd')).toHaveText('표본 보호로 금액 비공개');
  await expect(card.locator('[data-metric-kind="count"], [data-metric-kind="average"]')).toHaveCount(0);
  await expect(card.locator('.signal-stale')).toBeVisible();
  await card.locator('summary').click();
  await expect(card.locator('details')).toContainText('비교 불가');
  await expect(card).not.toContainText(/₩0|0건|0%/);
});

test('published zero is preserved and a zero payment count produces no per-payment average', async ({ page }) => {
  const summary = structuredClone(SUMMARY_FIXTURE);
  Object.assign(summary.areas.myeongdong.commercial!, { paymentAmountMin: 0, paymentAmountMax: 0, paymentCount: 0 });
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.goto('/ko/myeongdong');
  const card = page.locator('.commercial-signal-card');
  await expect(card.locator('[data-metric-kind="amount"] dd')).toHaveText('₩0 ~ ₩0');
  await expect(card.locator('[data-metric-kind="count"] dd')).toHaveText('0건');
  await expect(card.locator('[data-metric-kind="average"]')).toHaveCount(0);
});

test('absent commercial source creates no numeric payment model', async ({ page }) => {
  const summary = structuredClone(SUMMARY_FIXTURE);
  summary.areas.myeongdong.commercial = null;
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.goto('/ko/myeongdong');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await expect(page.locator('.commercial-signal-card')).toHaveCount(0);
});
