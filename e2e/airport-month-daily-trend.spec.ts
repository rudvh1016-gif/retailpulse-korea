import { test, expect } from '@playwright/test';
import { routeSummary, SUMMARY_FIXTURE } from './summary-fixture';
import type { MonthToDate } from '../lib/airport-mtd';

const values = [100_000, 104_000, 98_000, 101_000, 103_000];
const dates = values.map((_, index) => `2026-09-0${index + 1}`);

function fiveDays(missing = false) {
  const summary = structuredClone(SUMMARY_FIXTURE);
  for (const scope of ['all', 'T1', 'T2'] as const) {
    const month = summary.airport.monthToDate[scope] as unknown as MonthToDate;
    const current = month.current;
    const share = scope === 'all' ? 1 : 0.5;
    current.days = dates.map((date, index) => ({ date, total: missing && index === 2 ? null : values[index] * share }));
    current.start = dates[0];
    current.end = dates.at(-1)!;
    current.expectedDays = values.length;
    current.completeDays = missing ? values.length - 1 : values.length;
    current.missingDates = missing ? [dates[2]] : [];
    current.status = missing ? 'PARTIAL' : 'COMPLETE';
    current.total = missing ? null : values.reduce((sum, value) => sum + value * share, 0);
    const previous = month.previous!;
    previous.start = '2026-08-01';
    previous.end = '2026-08-05';
    previous.expectedDays = values.length;
    previous.completeDays = values.length;
    previous.total = 480_000 * share;
    month.change = missing ? null : {
      baselineAt: '2026-08-01~2026-08-05',
      minPercent: (506_000 - 480_000) / 480_000 * 100,
      maxPercent: (506_000 - 480_000) / 480_000 * 100,
    };
  }
  return summary;
}

for (const width of [320, 390, 430]) {
  test(`five daily values and dates read together at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/live/summary**', routeSummary(fiveDays()));
    await page.goto('/ko/airport');
    const month = page.getByTestId('airport-mtd');
    const chart = month.locator('.airport-month-chart');
    await expect(month.locator('.airport-month-compare-wide')).not.toBeVisible();
    await expect(month.locator('.airport-month-compare-model')).toBeVisible();
    await expect(chart).toHaveAttribute('data-short-series', 'true');
    await expect(chart.locator('.airport-month-value-labels span')).toHaveText(['100,000', '104,000', '98,000', '101,000', '103,000']);
    await expect(chart.locator('.airport-month-ticks span')).toHaveText(['9/1', '9/2', '9/3', '9/4', '9/5']);
    await expect(chart.locator('.airport-month-baseline')).toHaveCount(1);
    await expect(chart.locator('.airport-month-bar')).toHaveCount(5);
    await expect(chart.locator('polyline, .airport-month-run')).toHaveCount(0);
    expect(await month.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await month.screenshot({ path: `test-results/month-daily-trend-${width}.png` });
    const buttons = chart.locator('.airport-month-picks button');
    await buttons.first().focus();
    await page.keyboard.press('Enter');
    await expect(buttons.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(chart.locator('.airport-month-readout')).toContainText('100,000');
    if (width === 390) await month.screenshot({ path: 'test-results/month-daily-trend-390-focus.png' });
  });
}

test('a missing day is a gap rather than a zero and stops the running total', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/live/summary**', routeSummary(fiveDays(true)));
  await page.goto('/ko/airport');
  const chart = page.getByTestId('airport-mtd').locator('.airport-month-chart');
  await expect(chart.locator('.airport-month-bar')).toHaveCount(4);
  await expect(chart.locator('.airport-month-value-labels span[data-date="2026-09-03"]')).toHaveText('—');
  const missing = chart.locator('.airport-month-picks button').nth(2);
  await missing.focus();
  await page.keyboard.press('Enter');
  await expect(missing).toHaveAttribute('aria-pressed', 'true');
  await expect(chart.locator('.airport-month-readout')).not.toContainText('0명');
});

for (const width of [821, 1280, 1600]) {
  test(`desktop monthly comparison uses the card width without enlarging text at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/live/summary**',routeSummary(fiveDays()));
    await page.goto('/ko/airport');
    const month=page.getByTestId('airport-mtd');
    const comparison=month.locator('.airport-month-compare-wide');
    await expect(comparison).toBeVisible();
    await expect(month.locator('.airport-month-compare-model')).not.toBeVisible();
    await expect(comparison.locator('b')).toHaveText(['480,000명','506,000명']);
    await expect(month.locator('.airport-mtd-total')).toHaveText('506,000명');
    const geometry=await month.evaluate(element=>{
      const bounds=(selector:string)=>element.querySelector(selector)!.getBoundingClientRect();
      const head=bounds('.airport-mtd-head'),total=bounds('.airport-mtd-total'),bars=bounds('.airport-month-compare-wide'),chart=bounds('.airport-month-chart');
      return {headX:head.x,totalX:total.x,barsX:bars.x,barsWidth:bars.width,width:element.clientWidth,chartTop:chart.top,barsBottom:bars.bottom,overflow:element.scrollWidth>element.clientWidth+1};
    });
    expect(geometry.totalX).toBe(geometry.headX);
    expect(geometry.barsX).toBeGreaterThan(geometry.totalX);
    expect(geometry.barsWidth).toBeGreaterThan(geometry.width*.45);
    expect(geometry.chartTop).toBeGreaterThanOrEqual(geometry.barsBottom);
    expect(geometry.overflow).toBe(false);
    expect(await comparison.locator('b').first().evaluate(element=>getComputedStyle(element).fontSize)).toBe('14px');
    const bars=comparison.locator('.airport-month-compare-track span');
    const ratios=await bars.evaluateAll(elements=>elements.map(element=>parseFloat((element as HTMLElement).style.width)));
    expect(ratios[0]/ratios[1]).toBeCloseTo(480_000/506_000,5);
    await month.screenshot({path:`test-results/month-desktop-${width}.png`,style:'header, .bottom-nav, .airport-context-nav {visibility:hidden !important;}'});
  });
}

test('a longer month keeps every bar and uses the selected readout instead of crowded labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route('**/api/live/summary**', routeSummary(SUMMARY_FIXTURE));
  await page.goto('/ko/airport');
  const chart = page.getByTestId('airport-mtd').locator('.airport-month-chart');
  await expect(chart).toHaveAttribute('data-short-series', 'false');
  await expect(chart.locator('.airport-month-bar')).toHaveCount(13);
  await expect(chart.locator('.airport-month-value-labels')).toHaveCount(0);
  await expect(chart.locator('.airport-month-readout')).toContainText('3,600');
});
