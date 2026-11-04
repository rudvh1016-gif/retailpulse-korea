import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE } from './summary-fixture';

test.use({ hasTouch: true });
for (const lang of ['ko', 'en', 'zh', 'ja'] as const) for (const width of [320, 390, 1280]) {
  test(`airport day rail stays legible and preserves navigation ${lang} ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 });
    await page.clock.setFixedTime(new Date(SUMMARY_FIXTURE.generatedAt));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/live/summary*', route => {
      const date = new URL(route.request().url()).searchParams.get('date') ?? SUMMARY_FIXTURE.todayKst;
      return route.fulfill({ json: { ...SUMMARY_FIXTURE, serviceDateKst: date,
        dayRelation: date === SUMMARY_FIXTURE.todayKst ? 'TODAY' : date < SUMMARY_FIXTURE.todayKst ? 'PAST' : 'FUTURE',
        airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: date } } });
    });
    await page.route('**/api/live/flights*', route => route.fulfill({ json: { mode: 'live-flights', flights: [], truncated: false } }));
    await page.goto(`/${lang}/airport?terminal=T2`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    const rail = page.locator('.airport-date-reserved .date-nav-shortcuts');
    const days = rail.locator('button');
    await expect(days).toHaveCount(3);
    await expect(rail).toHaveAttribute('aria-label', /.+/);
    const boxes = await days.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      return { width: box.width, height: box.height, scroll: node.scrollWidth, client: node.clientWidth };
    }));
    for (const box of boxes) {
      expect(box.width).toBeCloseTo(boxes[0].width, 1);
      expect(box.height).toBeGreaterThanOrEqual(56);
      expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
    }
    for (const day of await days.all()) {
      await expect(day).toHaveAccessibleDescription(await day.locator('time').innerText());
      await expect(day).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(day).toHaveCSS('box-shadow', 'none');
    }
    await days.nth(2).tap();
    await expect(days.nth(2)).toHaveAttribute('aria-current', 'date');
    await expect(page).toHaveURL(/date=2026-09-01/);
    await page.keyboard.press('Tab');
    await days.nth(0).focus();
    await expect(days.nth(0)).toHaveCSS('outline-style', 'solid');
    await days.nth(0).press('Enter');
    await expect(page).toHaveURL(/date=2026-08-30/);
    await days.nth(1).press('Space');
    await expect(days.nth(1)).toHaveAttribute('aria-current', 'date');
    await expect(page.getByRole('tab', { name: 'T2', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(days.nth(0)).toHaveAttribute('aria-current', 'date');
    await page.goForward();
    await expect(days.nth(1)).toHaveAttribute('aria-current', 'date');
    const todayUrl = page.url();
    await days.nth(1).tap();
    await expect(days.nth(1)).toHaveAttribute('aria-current', 'date');
    await expect(page).toHaveURL(todayUrl);
    await page.locator('.stored-date-picker > summary').click();
    await expect(page.locator('.date-nav-picker input')).toBeVisible();
    await page.locator('.date-nav-picker input').fill('2026-08-20');
    await expect(rail.locator('button[aria-pressed=true]')).toHaveCount(0);
    await days.nth(1).tap();
    await page.locator('.stored-date-picker > summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await rail.screenshot({ path: info.outputPath(`day-rail-${lang}-${width}.png`) });
    if (lang === 'ko') await page.screenshot({ path: info.outputPath(`airport-${width}.png`) });
    await page.emulateMedia({ forcedColors: 'active' });
    await page.keyboard.press('Tab');
    await days.nth(1).focus();
    await expect(days.nth(1)).toHaveCSS('outline-style', 'solid');
    expect(await days.nth(1).evaluate(node => getComputedStyle(node, '::after').display)).toBe('block');
    expect(await days.nth(1).evaluate(node => getComputedStyle(node, '::after').height)).toBe('2px');
  });
}
