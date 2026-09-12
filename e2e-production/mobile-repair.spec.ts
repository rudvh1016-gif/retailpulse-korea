import { test, expect } from '@playwright/test';
import { PREFERENCE_KEY } from '../lib/personal-briefing';

// Uses public Production responses and local preferences only; sends no feedback.
for (const width of [360, 390]) test(`personalization and chart repair on Production ${width}`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/ko');
  await expect(page.getByTestId('personal-onboarding')).toBeVisible();
  await expect(page.locator('.demand-home, .area-current-brief')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`setup-${width}.png`) });
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, role: 'manager', location: 'myeongdong', terminal: 'T2', interests: ['weather'], day: 'today', analytics: false })), PREFERENCE_KEY);
  await page.reload();
  await expect(page.locator('.personal-place')).toContainText('명동');
  await expect(page.locator('[data-view-location]')).toHaveCount(1);
  await expect(page.locator('.personal-facts [data-interest]')).toHaveCount(1);
  await expect(page.locator('.personal-facts [data-interest]')).toHaveAttribute('data-interest', 'weather');
  await expect(page.locator('.demand-home, .area-current-brief')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`personal-${width}.png`) });
  await page.goto('/ko/hongdae');
  await expect(page.locator('.population-chart')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const labels = await page.locator('.flow-tick').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.length).toBeLessThanOrEqual(4);
  labels.forEach((r, i) => { expect(r.left).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(width); if (i) expect(r.left).toBeGreaterThan(labels[i - 1].right); });
  const header = await page.locator('.topbar').boundingBox(), title = await page.locator('h1').boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`hongdae-${width}.png`) });
  await page.locator('.population-chart').scrollIntoViewIfNeeded();
  await page.getByRole('slider').press('End');
  await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext', /KST/);
  await page.screenshot({ path: info.outputPath(`chart-${width}.png`) });
  const picker = page.locator('.date-nav-picker input');
  const today = await picker.inputValue();
  for (const index of [0, 2]) {
    await page.locator('.date-nav-shortcuts button').nth(index).click();
    await expect(picker).not.toHaveValue(today);
  }
  await page.locator('.date-nav-shortcuts button').nth(1).click();
  await expect(picker).toHaveValue(today);
  await expect(page.locator('script[data-koretail-analytics]')).toHaveCount(0);
});
