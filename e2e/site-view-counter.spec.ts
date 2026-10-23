import { test, expect } from '@playwright/test';
import { PAGEVIEWS_DEPLOYMENT_ENABLED } from '../lib/pageviews-deployment';
test.use({ serviceWorkers: 'block' });
// Exercise the real collector guards without contacting production or weakening runtime code.
test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) throw new Error('Local test server required');
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
  await page.addInitScript(() => {
    if (location.origin !== 'https://koretaildata.com') return;
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    localStorage.setItem('koretail-analytics-consent-v1', 'true');
  });
  await page.route('**/*', route => route.abort());
  await page.route('https://koretaildata.com/**', async route => {
    const url = new URL(route.request().url());
    // API fixture registered by each test takes precedence over this proxy.
    const target = new URL(baseURL);
    target.pathname = url.pathname; target.search = url.search;
    if (target.origin !== new URL(baseURL).origin) throw new Error('Non-local proxy target');
    const response = await route.fetch({ url: target.href, maxRedirects: 0 });
    await route.fulfill({ response });
  });
});
const counts = { available: true, today: 1234, total: 56789, totalComplete: true, day: '2026-10-23', startedAt: '2026-10-22T15:00:00.000Z' };
for (const lang of ['ko', 'en', 'zh', 'ja']) for (const width of [320, 390, 820, 1024, 1440]) {
  test(`${lang} ${width}: today at top, accessible total, no header overlap`, async ({ page }) => {
    test.skip(!PAGEVIEWS_DEPLOYMENT_ENABLED, 'Production compile-time gate remains OFF; use isolated component fixture instead.');
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/pageviews', route => route.fulfill({ json: counts }));
    await page.goto(`https://koretaildata.com/${lang}/more`);
    const counter = page.locator('.site-view-counter');
    const button = counter.locator('button');
    await expect(button).toBeVisible();
    await expect(counter.locator('.site-view-counter-today strong')).toHaveText('1,234');
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    const brand = (await page.locator('.topbar .brand').boundingBox())!;
    if (width <= 820) {
      expect(Math.abs(brand.y + brand.height / 2 - box.y - box.height / 2)).toBeLessThan(4);
      expect(brand.x + brand.width).toBeLessThanOrEqual(box.x);
      const meta = (await page.locator('.header-meta').boundingBox())!;
      expect(meta.y).toBeGreaterThanOrEqual(box.y + box.height);
      await expect(counter.locator('.site-view-counter-desktop-total')).toBeHidden();
    } else {
      await expect(counter.locator('.site-view-counter-desktop-total')).toBeVisible();
      await expect(page.locator('.top-nav')).toBeVisible();
    }
    await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
    await button.focus(); await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(counter.locator('.site-view-counter-total strong')).toHaveText('56,789');
    await expect(counter.locator('time')).toHaveAttribute('datetime', counts.startedAt);
    expect(await counter.locator('time').innerText()).toContain('23'); // KST, not UTC date
    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await page.locator('.brand').click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
for (const value of [{ available: false, reason: 'unavailable' }, { available: false, reason: 'incomplete' }, { ...counts, today: -1 }]) {
  test(`unavailable counter stays hidden: ${JSON.stringify(value)}`, async ({ page }) => {
    test.skip(!PAGEVIEWS_DEPLOYMENT_ENABLED, 'Production compile-time gate remains OFF.');
    await page.route('**/api/pageviews', route => route.fulfill({ json: value }));
    const response = page.waitForResponse('**/api/pageviews');
    await page.goto('https://koretaildata.com/ko/more');
    await response;
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await expect(page.locator('.site-view-counter')).toHaveCount(0);
  });
}
test('genuine zero today is shown, not treated as an error', async ({ page }) => {
  test.skip(!PAGEVIEWS_DEPLOYMENT_ENABLED, 'Production compile-time gate remains OFF.');
  await page.route('**/api/pageviews', route => route.fulfill({ json: { ...counts, today: 0 } }));
  await page.goto('https://koretaildata.com/ko/more');
  await expect(page.locator('.site-view-counter-today strong')).toHaveText('0');
});

test('deployment OFF renders no counter and sends no counter request', async ({ page }) => {
  test.skip(PAGEVIEWS_DEPLOYMENT_ENABLED, 'This regression covers the fail-closed OFF build.');
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/pageviews') requests.push(request.url()); });
  await page.goto('https://koretaildata.com/ko/more');
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('en');
  await expect(page.locator('.app')).toHaveClass(/lang-en/);
  await expect(page.locator('.site-view-counter')).toHaveCount(0);
  expect(requests).toEqual([]);
});
