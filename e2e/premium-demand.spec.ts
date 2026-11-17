import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SUMMARY_FIXTURE, routeSummary } from './summary-fixture';
import type { LiveSummary } from '../app/live-signals';
import { rangeChange } from '../lib/period-comparison';

const baseline = process.env.KORETAIL_DESIGN_BASELINE === 'true';
const recorded = process.env.KORETAIL_RECORDED_SUMMARY;
const payload = recorded ? JSON.parse(readFileSync(recorded, 'utf8')) : SUMMARY_FIXTURE;

for (const width of [390, 1440]) {
  for (const route of ['', '/hongdae', '/airport']) {
    test(`premium screen ${route || 'home'} at ${width}`, async ({ page }, info) => {
      const requests: string[] = [];
      page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
      await page.clock.install({ time: new Date(payload.generatedAt) });
      await page.route('**/api/live/summary*', routeSummary(payload));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/ko${route}`);
      await expect(page.locator('.app')).toHaveAttribute('data-hydrated', 'true');
      const isAirport = true;
      if (route === '/hongdae') await expect(page).toHaveURL(url => url.pathname === '/ko');
      await expect(page.locator(route === '/airport' ? '.airport-current-brief' : '.glance-preview').first()).toBeVisible();
      if (isAirport) await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({ path: info.outputPath(`${baseline ? 'before' : 'after'}-${route.slice(1) || 'home'}-${width}.png`) });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(requests.filter(url => new URL(url).pathname === '/api/live/summary').length).toBeLessThanOrEqual(1);
      console.log('DESIGN_SCREEN', JSON.stringify({ width, route, recorded: !!recorded, requests }));
    });
  }
}

for (const lang of ['ko', 'en', 'zh', 'ja']) {
  test(`retired Seoul archive: monthly records remain reachable without district navigation in ${lang}`, async ({ page }) => {
 const langCode = lang;
 const retiredReads: string[] = [];
 await page.route('**/api/**',route => route.fulfill({status:503,json:{status:'UNAVAILABLE'}}));
 await page.route('**/api/live/summary*',routeSummary(SUMMARY_FIXTURE));
 page.on('request',request => { const url = new URL(request.url()); if (url.pathname === '/api/live/predictions' || url.searchParams.get('view') === 'records') retiredReads.push(request.url()); });
 await page.goto(`/${langCode}/forecast?area=hongdae&date=2026-08-31#prediction-score`);
 await expect(page).toHaveURL(url => url.pathname === `/${langCode}`);
 await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
 await expect(page.locator('.prediction-history, .records-chart, .area-tabs')).toHaveCount(0);
 expect(retiredReads).toEqual([]);
});
}

for (const state of ['forecast-only', 'missing', 'stale', 'comparison-overlap', 'partial-airport']) {
  test(`truthful local state: ${state}`, async ({ page }) => {
    const data = structuredClone(SUMMARY_FIXTURE) as unknown as LiveSummary;
    const area = data.areas.myeongdong!;
    if (state === 'forecast-only' || state === 'missing') area.realtime = null;
    if (state === 'missing') area.realtimeForecast = [];
    if (state === 'stale') area.realtime = { ...area.realtime!, observedAt: '2026-08-31T10:00:00+09:00', freshness: 'STALE' };
    if (state === 'comparison-overlap') Object.assign(area.realtime!, { comparisons: { 7: rangeChange(23000,25000,24000,26000,'2026-08-24T14:07:00+09:00') } });
    if (state === 'partial-airport') {
      data.airport.forecastCoverage.all = 'PARTIAL';
      data.airport.todayExpectedPassengersTotal = null;
      data.airport.peakExpectedTimeBand = null;
      data.airport.remainingExpectedPassengers = null;
      data.airport.passengerForecastTimeline = [data.airport.passengerForecastTimeline[0], data.airport.passengerForecastTimeline.at(-1)!];
    }
    await page.route('**/api/live/summary*', routeSummary(data));
    await page.goto(state === 'partial-airport' ? '/ko/airport' : '/ko/myeongdong');
    if (state === 'partial-airport') {
      await expect(page.locator('.airport-flow')).toBeVisible();
      await expect(page.locator('.airport-brief-total')).toHaveCount(0);
      await expect(page.locator('.airport-glance-strip, .airport-near-term, .airport-upcoming-peak')).toHaveCount(0);
      await expect(page.locator('.airport-current-brief .airport-data-missing')).toHaveText('전체 시간대 확인 불가');
      await expect(page.locator('.airport-flow')).toHaveAttribute('data-bands','2');
    } else {
      await expect(page).toHaveURL(url => url.pathname === '/ko');
      await expect(page.getByTestId('area-demand-card')).toHaveCount(0);
      await expect(page.getByTestId('airport-glance-preview')).toBeVisible();
    }
  });
}


test('selected dates and terminal scopes survive links, reload and back', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  // The selected date must match the fixture's actual service date; the
  // summary reader now correctly rejects a response for another day.
  const selectedDate = SUMMARY_FIXTURE.serviceDateKst;
  await page.route('**/api/live/summary*', routeSummary(SUMMARY_FIXTURE));
  await page.goto(`/ko/airport?terminal=T1&date=${selectedDate}`);
  await expect(page.locator('.app')).toHaveAttribute('data-hydrated','true');
  await page.getByRole('tab',{name:'T2',exact:true}).click();
  await expect(page).toHaveURL(/terminal=T2/);
  await page.reload();
  await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
  await page.locator('#airport-data-flow').getByRole('tab',{name:'전체 T1·T2',exact:true}).click();
  await expect(page).not.toHaveURL(/terminal=/);
  await page.goBack();
  await expect(page.getByRole('tab',{name:'T2',exact:true})).toHaveAttribute('aria-selected','true');
  await page.goto('/ko/consumption?area=hongdae');
  await expect(page).toHaveURL(url => url.pathname === '/ko');
  await expect(page.locator('.consumption-comparison, .area-tabs')).toHaveCount(0);
});
