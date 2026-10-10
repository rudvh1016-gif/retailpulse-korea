import { test, expect } from '@playwright/test';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import { airportSides } from '../lib/airport-sides-summary';

test('monthly prisms visibly associate each real range with its own value', async ({ page }) => {
  const range = { expectedDays: 31, completeDays: 31, status: 'COMPLETE', missingDates: [] };
  const mtd = { current: { ...range, start: '2026-08-01', end: '2026-08-31', total: 600000, days: [] }, previous: { ...range, start: '2026-07-01', end: '2026-07-31', total: 400000 }, previousAbsentReason: null, change: null };
  const summary = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport, monthToDate: { all: mtd } } };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.goto('/en/airport');
  const bars = page.locator('.airport-month-compare-model > g');
  await expect(bars).toHaveCount(2);
  await expect(bars.nth(0)).toContainText('7/1');
  await expect(bars.nth(0)).toContainText('7/31');
  await expect(bars.nth(0)).toContainText('400,000');
  await expect(bars.nth(1)).toContainText('8/1');
  await expect(bars.nth(1)).toContainText('8/31');
  await expect(bars.nth(1)).toContainText('600,000');
  await page.locator('.airport-month-compare-model').screenshot({ path: 'test-results/approved-B-390.png' });
});

for (const lang of ['ko', 'en', 'zh', 'ja']) for (const state of ['PARTIAL', 'UNAVAILABLE']) {
  test(`white airport keeps ${state} forecast readable in ${lang}`, async ({ page }) => {
    const summary = { ...SUMMARY_FIXTURE, airport: { ...SUMMARY_FIXTURE.airport,
      passengerForecastTimeline: [], passengerForecastTimelineByTerminal: { T1: [], T2: [] },
      forecastCoverage: { all: state, byTerminal: { T1: state, T2: state } },
    } };
    await page.setViewportSize({ width: 360, height: 844 });
    await page.route('**/api/live/summary*', routeSummary(summary));
    await page.route('**/api/live/flights*', route => route.fulfill({ json: { mode: 'live-flights', flights: [], truncated: false } }));
    await page.goto(`/${lang}/airport`);
    const notice = page.locator('.airport-hero .airport-forecast-state');
    await expect(notice).toBeVisible();
    const colors = await notice.locator('strong,p,small').evaluateAll(elements => elements.map(el => getComputedStyle(el).color));
    expect(colors.length).toBeGreaterThanOrEqual(2);
    expect(colors.every(color => color === 'rgb(0, 0, 0)')).toBe(true);
  });
}

test('hourly prisms use published values and the black keyboard tooltip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.goto('/en/airport');
  const figure = page.locator('.airport-hero .airport-flow');
  await expect(figure.locator('.airport-hourly-prisms > g')).toHaveCount(2);
  const bars = await figure.locator('.airport-hourly-prisms > g').evaluateAll(elements => elements.map(el => ({ value: Number(el.getAttribute('data-value')), height: Number(el.getAttribute('data-height')) })));
  expect(bars.map(bar => bar.value)).toEqual([5110, 6320]);
  expect(bars[0].height / bars[1].height).toBeCloseTo(5110 / 6320, 5);
  await figure.locator('.airport-flow-band').first().focus();
  await expect(figure.locator('.airport-flow-tip')).toBeVisible();
  expect(await figure.locator('.airport-flow-tip text').first().evaluate(el => getComputedStyle(el).fill)).toBe('rgb(0, 0, 0)');
  expect(await figure.locator('.airport-flow-hours text').first().evaluate(el => getComputedStyle(el).fill)).toBe('rgb(0, 0, 0)');
  await page.setViewportSize({ width: 390, height: 844 });
  await figure.screenshot({ path: 'test-results/approved-A-390.png' });
});

test('next-day partial records cannot establish cross-midnight comparisons', async ({ page }) => {
  const date = SUMMARY_FIXTURE.serviceDateKst;
  const row = { physicalFlightId: 'MIDNIGHT', flightNumber: 'TEST1', terminal: 'T2', gate: '252', direction: 'departure', scheduledAt: '2026-09-01T00:30:00+09:00', airportCode: 'NRT' };
  const summary = { ...SUMMARY_FIXTURE, generatedAt: `${date}T23:00:00+09:00`, airport: { ...SUMMARY_FIXTURE.airport, sides: airportSides(date, 'TODAY', [], [], [], false, false) } };
  await page.addInitScript(() => localStorage.setItem('koretail-business-v1', JSON.stringify({ version: 1, place: 'airport', terminal: 'T2', side: null, hours: null })));
  await page.route('**/api/live/summary*', routeSummary(summary));
  await page.route('**/api/live/flights*', route => {
    const next = new URL(route.request().url()).searchParams.get('date') !== date;
    return route.fulfill({ json: { mode: 'live-flights', basis: 'OFFICIAL_DEPARTURE_SCHEDULE', flights: next ? [row] : [], truncated: next, retrievedAt: `${date}T22:50:00+09:00` } });
  });
  await page.goto('/en/airport?terminal=T2');
  await page.getByTestId('airport-departure-overview').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('airport-concept-model')).toBeVisible();
  await page.getByTestId('departure-map').locator('[data-preset="NEXT3"]').click();
  await expect(page.getByTestId('map-partial')).toBeVisible();
  await expect(page.getByTestId('airport-concept-model')).toHaveCount(0);
  await expect(page.getByTestId('map-counts')).toHaveCount(0);
  await expect(page.getByTestId('map-groups')).toHaveCount(0);
  await page.getByTestId('map-partial-reset').click();
  await expect(page.getByTestId('airport-concept-model')).toBeVisible();
  await expect(page.getByTestId('map-partial')).toHaveCount(0);
});
