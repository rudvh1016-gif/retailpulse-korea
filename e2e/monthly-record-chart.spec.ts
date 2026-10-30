import { test, expect, type Page, type Locator } from '@playwright/test';
import { recordsFixture } from './monthly-records-fixture';
import { SUMMARY_FIXTURE } from './summary-fixture';
import { recordText } from '../app/monthly-records-copy';
import type { Lang } from '../app/retailpulse-data';
import type { RecordArea } from '../lib/monthly-records';

async function setup(page: Page, empty = false) {
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00Z'));
  await page.route('**/api/live/summary**', async route => {
    const url = new URL(route.request().url());
    const records = recordsFixture((url.searchParams.get('area') ?? 'myeongdong') as RecordArea, url.searchParams.get('month') ?? '2026-10');
    if (empty) {
      records.current.days = records.current.days.map((day, index) => index === 0
        ? { ...day, min: 0, max: 0, hours: 24, status: 'COMPLETE' }
        : { ...day, min: null, max: null, hours: 0, status: 'MISSING' });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.searchParams.get('view') === 'records' ? records : SUMMARY_FIXTURE) });
  });
}
async function dayPoint(reader: Locator, index: number, days = 31) {
  const box = await reader.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + (4 + (index + .5) * 608 / days) / 620 * box!.width, y: box!.y + box!.height * .7 };
}
for (const lang of ['ko', 'en', 'zh', 'ja'] as Lang[]) for (const width of [320, 390, 1440]) {
  test(`monthly date range hover, keyboard, dismiss and layout ${lang} ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await setup(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/${lang}/forecast`);
    const reader = page.getByRole('slider', { name: `${recordText('daily', lang)} · 2026-10` });
    await reader.scrollIntoViewIfNeeded();
    const tip = page.locator('.records-chart').getByRole('tooltip');
    await expect(tip).toHaveCount(0);
    const barsBefore = await reader.locator('.chart-fill-y-svg rect').evaluateAll(nodes => nodes.map(node => ['x', 'y', 'width', 'height', 'fill'].map(attr => node.getAttribute(attr))));
    const first = await dayPoint(reader, 0);
    await page.mouse.move(first.x, first.y);
    await expect(tip).toContainText('2026-10-01');
    await expect(tip).toContainText(`25,000–27,000 ${recordText('unit', lang)}`);
    await page.mouse.move(first.x + 1, first.y);
    await expect(tip).toContainText('25,000–27,000');
    // The tooltip is hoverable and does not switch dates when crossing its text.
    const hoverBox = await tip.boundingBox();
    await page.mouse.move(first.x, hoverBox!.y + hoverBox!.height - 2, { steps: 10 });
    await tip.hover();
    await expect(tip).toContainText('2026-10-01');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    const second = await dayPoint(reader, 1);
    await page.mouse.move(second.x, second.y);
    await expect(tip).toContainText('26,000–28,000');
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
    await reader.focus();
    await page.keyboard.press('Home');
    await expect(reader).toHaveAttribute('aria-valuenow', '1');
    await expect(reader).toHaveAttribute('aria-valuetext', `2026-10-01: 25,000–27,000 ${recordText('unit', lang)}`);
    expect(await reader.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
    await page.keyboard.press('ArrowRight');
    await expect(tip).toContainText('26,000–28,000');
    await page.keyboard.press('ArrowRight');
    await expect(tip).toContainText(recordText('partial', lang));
    await expect(tip).not.toContainText('0–0');
    await expect(reader).toHaveAttribute('aria-valuenow', '3');
    await page.keyboard.press('End');
    await expect(tip).toContainText('2026-10-31');
    await expect(tip).toContainText(recordText('future', lang));
    await page.keyboard.press('ArrowRight');
    await expect(reader).toHaveAttribute('aria-valuenow', '31');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowLeft');
    await expect(reader).toHaveAttribute('aria-valuenow', '1');
    await page.keyboard.press('Escape');
    await expect(tip).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(tip).toContainText('26,000–28,000');
    const tipBox = await tip.boundingBox();
    expect(tipBox!.x).toBeGreaterThanOrEqual(0);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(width + 1);
    const barsAfter = await reader.locator('.chart-fill-y-svg rect').evaluateAll(nodes => nodes.map(node => ['x', 'y', 'width', 'height', 'fill'].map(attr => node.getAttribute(attr))));
    expect(barsAfter).toEqual(barsBefore);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (lang === 'ko') await page.locator('.records-chart').screenshot({ path: `test-results/monthly-record-range-${width}.png` });
    // A month/area change must never leave the prior date/value tooltip visible.
    const section = page.locator('.monthly-records');
    await section.getByRole('combobox', { name: recordText('month', lang), exact: true }).selectOption('2026-09');
    await expect(section.getByRole('slider')).toHaveAttribute('aria-valuenow', '1');
    await expect(tip).toHaveCount(0);
    await section.getByRole('combobox', { name: recordText('area', lang), exact: true }).selectOption('hongdae');
    await expect(page.getByTestId('record-month-2026-09')).toContainText('53,650–55,650');
    await expect(tip).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
for (const width of [320, 390]) test.describe(`touch monthly ranges ${width}`, () => {
  test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
  test(`monthly ranges tap, repeat, missing, progress and outside dismissal ${width}`, async ({ page }) => {
  await setup(page);
  await page.goto('/ko/forecast');
  const reader = page.getByRole('slider');
  await reader.scrollIntoViewIfNeeded();
  const first = await dayPoint(reader, 0);
  const third = await dayPoint(reader, 2);
  const sixth = await dayPoint(reader, 5);
  const tip = page.getByRole('tooltip');
  await page.touchscreen.tap(first.x, first.y);
  await expect(tip).toContainText('25,000–27,000 명');
  await page.touchscreen.tap(first.x, first.y);
  await expect(tip).toContainText('25,000–27,000 명');
  await page.touchscreen.tap(third.x, third.y);
  await expect(tip).toContainText(recordText('partial', 'ko'));
  await expect(tip).not.toContainText('0–0');
  await page.touchscreen.tap(sixth.x, sixth.y);
  await expect(tip).toContainText(recordText('progress', 'ko'));
  await expect(reader).toHaveAttribute('aria-valuenow', '6');
  await reader.dispatchEvent('pointercancel', { pointerType: 'touch', bubbles: true });
  await expect(tip).toHaveCount(0);
  await page.touchscreen.tap(first.x, first.y);
  await expect(tip).toContainText('25,000–27,000 명');
  expect(await reader.evaluate(node => getComputedStyle(node.parentElement!).touchAction)).toBe('pan-y pinch-zoom');
  const box = await reader.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.touchscreen.tap(5, 5);
  await expect(tip).toHaveCount(0);
  await page.touchscreen.tap(first.x, first.y);
  await expect(tip).toContainText('25,000–27,000 명');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
test('monthly reader distinguishes measured zero from missing dates', async ({ page }) => {
  await setup(page, true);
  await page.goto('/ko/forecast');
  const reader = page.getByRole('slider');
  await reader.focus();
  const tip = page.getByRole('tooltip');
  await expect(tip).toContainText('0–0 명');
  await page.keyboard.press('ArrowRight');
  await expect(tip).toContainText('자료 없음 · 제외');
  await expect(tip).not.toContainText('0–0');
  await page.keyboard.press('Tab');
  await expect(tip).toHaveCount(0);
});
