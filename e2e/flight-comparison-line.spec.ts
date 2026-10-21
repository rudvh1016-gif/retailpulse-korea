import { expect, test } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';

const labels = { ko: '항공편', en: 'FLIGHTS', zh: '航班', ja: 'フライト' };
for (const lang of ['ko', 'en', 'zh', 'ja'] as const) for (const width of [390, 1440]) {
  test(`flight baseline stays together on its own smaller line · ${lang} · ${width}`, async ({ page }) => {
    const change = { baselineAt: '2026-10-14', minPercent: -0.6, maxPercent: -0.6 };
    const payload = { ...SUMMARY_FIXTURE, serviceDateKst: '2026-10-21', generatedAt: '2026-10-21T12:00:00+09:00', airport: { ...SUMMARY_FIXTURE.airport, serviceDateKst: '2026-10-21', periodComparisons: { all: { 7: { flightRecords: change } }, T1: { 7: { flightRecords: change } }, T2: { 7: { flightRecords: change } } } } };
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/live/summary*', routeSummary(payload));
    await page.route('**/api/live/flights*', route => route.fulfill({ json: { mode: 'live-flights', serviceDateKst: '2026-10-21', basis: 'COLLECTED_FLIGHT_RECORDS', truncated: false, flights: [] } }));
    await page.goto(`/${lang}/airport?date=2026-10-21`);
    await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
    await page.locator('.airport-context-nav').getByRole('button', { name: labels[lang], exact: true }).click();
    const heading = page.locator('.flight-summary-heading');
    const baseline = heading.locator('.flight-comparison-baseline');
    await expect(baseline).toHaveText('(2026-10-14)');
    await expect(heading.locator('.change-rate[data-direction="down"]')).toHaveText('▲ 0.6%');
    const layout = await heading.evaluate(node => {
      const date = node.querySelector('.flight-comparison-baseline')!;
      const comparison = node.querySelector('[role="img"]')!;
      const dateBox = date.getBoundingClientRect();
      const rateBoxes = Array.from(comparison.getClientRects());
      const range = document.createRange();
      range.selectNodeContents(date);
      const glyphBoxes = Array.from(range.getClientRects());
      return { size: parseFloat(getComputedStyle(node).fontSize), parentSize: parseFloat(getComputedStyle(node.parentElement!).fontSize), dateTop: dateBox.top, rateBottom: Math.max(...rateBoxes.map(box => box.bottom)), lines: glyphBoxes.length, right: Math.max(...glyphBoxes.map(box => box.right)), headingRight: node.getBoundingClientRect().right };
    });
    expect(layout.parentSize - layout.size).toBeCloseTo(1);
    expect(layout.dateTop).toBeGreaterThanOrEqual(layout.rateBottom - 1);
    expect(layout.lines).toBe(1);
    expect(layout.right).toBeLessThanOrEqual(layout.headingRight + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
